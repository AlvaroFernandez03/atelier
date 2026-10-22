// routes/catalog.js
const express = require("express");
const db = require("../db/database");

const router = express.Router();

// GET /api/catalog/filters — categorías y marcas disponibles, para pintar los filtros
router.get("/filters", (req, res) => {
  const categories = db.prepare("SELECT * FROM categories ORDER BY name").all();
  const brands = db.prepare("SELECT * FROM brands ORDER BY name").all();

  // Tallas y colores realmente existentes en el catálogo (no una lista fija):
  // así los filtros nunca ofrecen opciones que no den ningún resultado.
  const sizes = db.prepare("SELECT DISTINCT size FROM variants").all().map((r) => r.size);
  const colors = db
    .prepare("SELECT DISTINCT color_name, color_hex FROM variants ORDER BY color_name")
    .all();

  // Ordenamos las tallas de forma lógica: primero las numéricas (calzado)
  // de menor a mayor, y luego las de letra en su orden natural, en vez de
  // alfabéticamente (que pondría L antes que M o S).
  const letterOrder = ["XS", "S", "M", "L", "XL", "XXL"];
  const numeric = sizes.filter((s) => /^\d+$/.test(s)).sort((a, b) => Number(a) - Number(b));
  const letters = sizes
    .filter((s) => !/^\d+$/.test(s))
    .sort((a, b) => letterOrder.indexOf(a) - letterOrder.indexOf(b));

  res.json({ categories, brands, sizes: { letters, numeric }, colors });
});

// ---------------------------------------------------------------------------
// GET /api/catalog/products — listado con filtros opcionales
// Parámetros admitidos: ?search= &category= &brand= &size= &color= &max_price= &sort=
// ---------------------------------------------------------------------------
router.get("/products", (req, res) => {
  const { search, category, brand, size, color, max_price, sort } = req.query;

  // Construimos la consulta por partes: empezamos con una condición siempre
  // verdadera ("1=1") y vamos añadiendo filtros solo si llegan. Es un patrón
  // habitual para consultas con filtros opcionales, y mantiene el uso de
  // parámetros "?" (nunca concatenamos valores del usuario en el SQL).
  const conditions = ["p.active = 1"];
  const params = [];

  if (search) {
    conditions.push("(p.name LIKE ? OR b.name LIKE ? OR p.description LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  if (category) {
    conditions.push("c.slug = ?");
    params.push(category);
  }
  if (brand) {
    conditions.push("b.slug = ?");
    params.push(brand);
  }
  if (max_price) {
    conditions.push("p.price_cents <= ?");
    params.push(Number(max_price) * 100);
  }
  // Los filtros de talla y color miran las variantes: el producto entra si
  // AL MENOS UNA de sus variantes cumple la condición y tiene stock.
  if (size) {
    conditions.push("EXISTS (SELECT 1 FROM variants v2 WHERE v2.product_id = p.id AND v2.size = ? AND v2.stock > 0)");
    params.push(size);
  }
  if (color) {
    conditions.push("EXISTS (SELECT 1 FROM variants v3 WHERE v3.product_id = p.id AND v3.color_name = ? AND v3.stock > 0)");
    params.push(color);
  }

  // Orden: solo permitimos valores de una lista cerrada, nunca texto libre
  // del usuario dentro del SQL.
  const sortOptions = {
    novedades: "p.created_at DESC, p.id DESC",
    precio_asc: "p.price_cents ASC",
    precio_desc: "p.price_cents DESC",
    nombre: "p.name ASC",
  };
  const orderBy = sortOptions[sort] || sortOptions.novedades;

  const products = db
    .prepare(
      `SELECT p.id, p.name, p.description, p.price_cents, p.shape, p.gender, p.image_file,
              c.name AS category_name, c.slug AS category_slug, c.kind AS category_kind,
              b.name AS brand_name, b.slug AS brand_slug,
              (SELECT SUM(stock) FROM variants v WHERE v.product_id = p.id) AS total_stock
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN brands b ON b.id = p.brand_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ${orderBy}`
    )
    .all(...params);

  // Para cada producto añadimos sus colores disponibles, que el frontend usa
  // para pintar la silueta y los puntos de color en la tarjeta del catálogo.
  const withColors = products.map((p) => {
    const colors = db
      .prepare(
        `SELECT DISTINCT color_name, color_hex,
                (SELECT SUM(stock) FROM variants v2 WHERE v2.product_id = ? AND v2.color_name = v.color_name) AS color_stock
         FROM variants v WHERE product_id = ? ORDER BY color_name`
      )
      .all(p.id, p.id);
    return { ...p, colors };
  });

  res.json(withColors);
});

// ---------------------------------------------------------------------------
// GET /api/catalog/products/:id — ficha completa de un producto
// ---------------------------------------------------------------------------
router.get("/products/:id", (req, res) => {
  const product = db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.kind AS category_kind,
              b.name AS brand_name, b.slug AS brand_slug
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN brands b ON b.id = p.brand_id
       WHERE p.id = ? AND p.active = 1`
    )
    .get(req.params.id);

  if (!product) return res.status(404).json({ error: "Producto no encontrado." });

  const variants = db
    .prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY color_name, size")
    .all(product.id);

  // Agrupamos por color, con las tallas de cada uno: es como se navega una
  // ficha de producto real (eliges color y luego talla).
  const byColor = {};
  variants.forEach((v) => {
    if (!byColor[v.color_name]) {
      byColor[v.color_name] = { color_name: v.color_name, color_hex: v.color_hex, sizes: [] };
    }
    byColor[v.color_name].sizes.push({ variant_id: v.id, size: v.size, stock: v.stock });
  });

  res.json({ ...product, colors: Object.values(byColor) });
});

// ---------------------------------------------------------------------------
// GET /api/catalog/products/:id/related — "también te puede interesar"
// ---------------------------------------------------------------------------
// Ordenamos por relevancia con una puntuación: pesa más compartir categoría
// (si miras una camiseta, otras camisetas son lo más parecido), luego la
// marca, y damos preferencia a lo que tiene stock — no tiene sentido
// recomendar algo que no se puede comprar.
router.get("/products/:id/related", (req, res) => {
  const producto = db
    .prepare("SELECT id, category_id, brand_id, price_cents FROM products WHERE id = ? AND active = 1")
    .get(req.params.id);

  if (!producto) return res.status(404).json({ error: "Producto no encontrado." });

  const candidatos = db
    .prepare(
      `SELECT p.id, p.name, p.price_cents, p.shape, p.image_file,
              p.category_id, p.brand_id,
              b.name AS brand_name, c.slug AS category_slug,
              (SELECT COALESCE(SUM(stock), 0) FROM variants v WHERE v.product_id = p.id) AS total_stock
       FROM products p
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       WHERE p.active = 1 AND p.id != ?`
    )
    .all(producto.id);

  const puntuados = candidatos.map((c) => {
    let puntos = 0;
    if (c.category_id === producto.category_id) puntos += 10;
    if (c.brand_id === producto.brand_id) puntos += 5;

    // Cercanía de precio: si cuesta algo parecido, encaja mejor con lo que
    // esa persona está dispuesta a gastar. Damos hasta 4 puntos según lo
    // cerca que esté, en proporción al precio del producto que está viendo.
    const diferencia = Math.abs(c.price_cents - producto.price_cents);
    const proporcion = diferencia / producto.price_cents;
    if (proporcion < 0.25) puntos += 4;
    else if (proporcion < 0.5) puntos += 2;

    // Sin stock, al final de la lista.
    if (c.total_stock === 0) puntos -= 8;

    return { ...c, _puntos: puntos };
  });

  // Ordenamos por puntuación y nos quedamos con los cuatro mejores.
  const seleccionados = puntuados
    .sort((a, b) => b._puntos - a._puntos)
    .slice(0, 4);

  // Añadimos los colores, igual que en el listado del catálogo, para poder
  // pintar las tarjetas con el mismo aspecto.
  const conColores = seleccionados.map((p) => {
    const colors = db
      .prepare(
        `SELECT DISTINCT color_name, color_hex,
                (SELECT SUM(stock) FROM variants v2 WHERE v2.product_id = ? AND v2.color_name = v.color_name) AS color_stock
         FROM variants v WHERE product_id = ? ORDER BY color_name`
      )
      .all(p.id, p.id);
    // No enviamos la puntuación interna al navegador: es un detalle de cómo
    // ordenamos, no información útil para quien compra.
    const { _puntos, ...limpio } = p;
    return { ...limpio, colors };
  });

  res.json(conColores);
});

module.exports = router;

// routes/admin.js
const express = require("express");
const db = require("../db/database");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Todas las rutas de este archivo exigen sesión iniciada Y rol de admin.
// Al aplicarlo aquí una sola vez, ninguna ruta de abajo puede olvidarse de
// comprobarlo por descuido.
router.use(requireAuth, requireAdmin);

// ---------------------------------------------------------------------------
// GET /api/admin/summary — cifras de un vistazo para la portada del panel
// ---------------------------------------------------------------------------
router.get("/summary", (req, res) => {
  const pedidosHoy = db
    .prepare("SELECT COUNT(*) AS c FROM orders WHERE date(created_at) = date('now')")
    .get().c;

  const ingresos = db
    .prepare("SELECT COALESCE(SUM(total_cents), 0) AS t FROM orders WHERE status != 'cancelado'")
    .get().t;

  const pedidosPendientes = db
    .prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'pagado'")
    .get().c;

  const devolucionesPendientes = db
    .prepare("SELECT COUNT(*) AS c FROM returns WHERE status = 'solicitada'")
    .get().c;

  const clientes = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'cliente'").get().c;

  // Variantes con poco stock: lo que hay que reponer pronto.
  const stockBajo = db
    .prepare(
      `SELECT v.id, v.size, v.color_name, v.stock, p.name AS product_name, b.name AS brand_name
       FROM variants v
       JOIN products p ON p.id = v.product_id
       JOIN brands b ON b.id = p.brand_id
       WHERE v.stock <= 2 AND p.active = 1
       ORDER BY v.stock ASC, p.name
       LIMIT 12`
    )
    .all();

  const agotadas = db.prepare("SELECT COUNT(*) AS c FROM variants WHERE stock = 0").get().c;

  res.json({
    orders_today: pedidosHoy,
    revenue_cents: ingresos,
    pending_orders: pedidosPendientes,
    pending_returns: devolucionesPendientes,
    customers: clientes,
    out_of_stock_variants: agotadas,
    low_stock: stockBajo,
  });
});

// ---------------------------------------------------------------------------
// PRODUCTOS
// ---------------------------------------------------------------------------

// GET /api/admin/products — listado completo, incluidos los desactivados
router.get("/products", (req, res) => {
  const products = db
    .prepare(
      `SELECT p.*, c.name AS category_name, b.name AS brand_name,
              (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id) AS variant_count,
              (SELECT COALESCE(SUM(stock), 0) FROM variants v WHERE v.product_id = p.id) AS total_stock
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN brands b ON b.id = p.brand_id
       ORDER BY p.active DESC, p.name`
    )
    .all();
  res.json(products);
});

// POST /api/admin/products — crear producto con sus variantes
// Body: { name, description, price_cents, category_id, brand_id, shape, gender,
//         variants: [{ size, color_name, color_hex, stock }] }
router.post("/products", (req, res) => {
  const { name, description, price_cents, category_id, brand_id, shape, gender, variants } = req.body;

  if (!name || !price_cents || !category_id || !brand_id || !shape) {
    return res.status(400).json({ error: "Faltan datos del producto." });
  }
  if (!Array.isArray(variants) || variants.length === 0) {
    return res.status(400).json({ error: "Añade al menos una talla con su color y stock." });
  }
  if (Number(price_cents) < 1) {
    return res.status(400).json({ error: "El precio debe ser mayor que cero." });
  }

  let productId;
  try {
    db.exec("BEGIN");
    productId = db
      .prepare(
        `INSERT INTO products (name, description, price_cents, category_id, brand_id, shape, gender)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(name, description || "", Number(price_cents), category_id, brand_id, shape, gender || "unisex")
      .lastInsertRowid;

    const insertVariant = db.prepare(
      "INSERT INTO variants (product_id, size, color_name, color_hex, stock) VALUES (?, ?, ?, ?, ?)"
    );
    variants.forEach((v) => {
      insertVariant.run(productId, v.size, v.color_name, v.color_hex, Number(v.stock) || 0);
    });
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    return res.status(400).json({ error: "No se ha podido crear el producto. Revisa que no repitas talla y color." });
  }

  res.status(201).json({ id: productId });
});

// PUT /api/admin/products/:id — editar datos básicos del producto
router.put("/products/:id", (req, res) => {
  const { name, description, price_cents, category_id, brand_id, shape, gender, active } = req.body;

  const existing = db.prepare("SELECT id FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Producto no encontrado." });

  db.prepare(
    `UPDATE products SET name = ?, description = ?, price_cents = ?, category_id = ?,
            brand_id = ?, shape = ?, gender = ?, active = ?
     WHERE id = ?`
  ).run(
    name, description || "", Number(price_cents), category_id, brand_id,
    shape, gender || "unisex", active ? 1 : 0, req.params.id
  );

  res.json({ success: true });
});

// GET /api/admin/products/:id/variants — variantes de un producto
router.get("/products/:id/variants", (req, res) => {
  const variants = db
    .prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY color_name, size")
    .all(req.params.id);
  res.json(variants);
});

// PUT /api/admin/variants/:id — cambiar el stock de una variante concreta
router.put("/variants/:id", (req, res) => {
  const stock = Number(req.body.stock);
  if (!Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ error: "El stock debe ser un número igual o mayor que cero." });
  }

  const variant = db.prepare("SELECT id FROM variants WHERE id = ?").get(req.params.id);
  if (!variant) return res.status(404).json({ error: "Variante no encontrada." });

  db.prepare("UPDATE variants SET stock = ? WHERE id = ?").run(stock, req.params.id);
  res.json({ success: true });
});

// POST /api/admin/products/:id/variants — añadir una talla/color nuevo
router.post("/products/:id/variants", (req, res) => {
  const { size, color_name, color_hex, stock } = req.body;
  if (!size || !color_name || !color_hex) {
    return res.status(400).json({ error: "Talla, color y su código de color son obligatorios." });
  }

  try {
    const result = db
      .prepare("INSERT INTO variants (product_id, size, color_name, color_hex, stock) VALUES (?, ?, ?, ?, ?)")
      .run(req.params.id, size, color_name, color_hex, Number(stock) || 0);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(409).json({ error: "Ya existe esa combinación de talla y color en este producto." });
  }
});

// ---------------------------------------------------------------------------
// PEDIDOS
// ---------------------------------------------------------------------------

// GET /api/admin/orders — todos los pedidos de la tienda
router.get("/orders", (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, u.name AS customer_name, u.email AS customer_email,
              (SELECT SUM(quantity) FROM order_items oi WHERE oi.order_id = o.id) AS total_units
       FROM orders o
       JOIN users u ON u.id = o.user_id
       ORDER BY o.status = 'pagado' DESC, o.created_at DESC, o.id DESC`
    )
    .all();
  res.json(orders);
});

// GET /api/admin/orders/:id — detalle de un pedido (cualquiera, no solo propio)
router.get("/orders/:id", (req, res) => {
  const order = db
    .prepare(
      `SELECT o.*, u.name AS customer_name, u.email AS customer_email
       FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?`
    )
    .get(req.params.id);

  if (!order) return res.status(404).json({ error: "Pedido no encontrado." });

  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
  const subtotal = items.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);

  res.json({ ...order, items, subtotal_cents: subtotal, shipping_cents: order.total_cents - subtotal });
});

// PUT /api/admin/orders/:id/status — avanzar el estado del pedido
router.put("/orders/:id/status", (req, res) => {
  const { status } = req.body;
  const validos = ["pagado", "enviado", "entregado", "cancelado"];
  if (!validos.includes(status)) {
    return res.status(400).json({ error: "Estado no válido." });
  }

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido no encontrado." });

  // Al cancelar un pedido, las unidades vuelven al stock: nunca llegaron a
  // salir del almacén de verdad.
  if (status === "cancelado" && order.status !== "cancelado") {
    try {
      db.exec("BEGIN");
      const items = db.prepare("SELECT variant_id, quantity FROM order_items WHERE order_id = ?").all(order.id);
      const devolver = db.prepare("UPDATE variants SET stock = stock + ? WHERE id = ?");
      items.forEach((i) => devolver.run(i.quantity, i.variant_id));
      db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, order.id);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      return res.status(500).json({ error: "No se ha podido cancelar el pedido." });
    }
    return res.json({ success: true, stock_restored: true });
  }

  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, order.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------------------------
router.get("/customers", (req, res) => {
  const customers = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.created_at,
              (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
              (SELECT COALESCE(SUM(total_cents), 0) FROM orders o WHERE o.user_id = u.id AND o.status != 'cancelado') AS spent_cents
       FROM users u
       WHERE u.role = 'cliente'
       ORDER BY spent_cents DESC, u.name`
    )
    .all();
  res.json(customers);
});

module.exports = router;

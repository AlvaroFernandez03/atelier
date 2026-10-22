// routes/reviews.js
const express = require("express");
const db = require("../db/database");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const AJUSTE_ETIQUETAS = {
  pequena: "Talla pequeña",
  justa: "Talla justa",
  grande: "Talla grande",
};

// ---------------------------------------------------------------------------
// GET /api/reviews/product/:productId — reseñas de un producto (públicas)
// ---------------------------------------------------------------------------
router.get("/product/:productId", (req, res) => {
  const reviews = db
    .prepare(
      `SELECT r.id, r.rating, r.title, r.body, r.size_fit, r.created_at,
              u.name AS author_name, oi.size AS purchased_size, oi.color_name AS purchased_color
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       JOIN order_items oi ON oi.id = r.order_item_id
       WHERE r.product_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(req.params.productId);

  // Resumen: nota media y cuántas reseñas hay de cada puntuación, para poder
  // pintar el desglose de estrellas típico de las tiendas.
  const total = reviews.length;
  const media = total > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;

  const desglose = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => desglose[r.rating]++);

  // Cómo talla el producto según quienes lo han comprado: la información más
  // útil de todas en una tienda de ropa.
  const ajustes = { pequena: 0, justa: 0, grande: 0 };
  reviews.forEach((r) => {
    if (r.size_fit) ajustes[r.size_fit]++;
  });
  const totalAjustes = Object.values(ajustes).reduce((a, b) => a + b, 0);

  let vereditoTalla = null;
  if (totalAjustes >= 2) {
    const mayoritario = Object.entries(ajustes).sort((a, b) => b[1] - a[1])[0];
    if (mayoritario[1] / totalAjustes >= 0.5) {
      vereditoTalla = {
        clave: mayoritario[0],
        etiqueta: AJUSTE_ETIQUETAS[mayoritario[0]],
        porcentaje: Math.round((mayoritario[1] / totalAjustes) * 100),
      };
    }
  }

  // Ocultamos el apellido de quien opina: en una tienda real no se muestra
  // el nombre completo de otros clientes.
  const publicas = reviews.map((r) => {
    const partes = r.author_name.trim().split(" ");
    const inicial = partes.length > 1 ? ` ${partes[1][0]}.` : "";
    return { ...r, author_name: partes[0] + inicial };
  });

  res.json({
    reviews: publicas,
    total,
    average: Number(media.toFixed(1)),
    breakdown: desglose,
    size_verdict: vereditoTalla,
  });
});

// ---------------------------------------------------------------------------
// GET /api/reviews/can-review/:productId — ¿puedo opinar sobre este producto?
// ---------------------------------------------------------------------------
// Devuelve las compras de este producto que aún no tienen reseña. Si el array
// viene vacío, o no lo ha comprado, o ya opinó de todas sus compras.
router.get("/can-review/:productId", requireAuth, (req, res) => {
  const compras = db
    .prepare(
      `SELECT oi.id AS order_item_id, oi.size, oi.color_name, o.created_at AS order_date, o.id AS order_id
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.user_id = ? AND o.status != 'cancelado'
         AND oi.variant_id IN (SELECT id FROM variants WHERE product_id = ?)
         AND oi.id NOT IN (SELECT order_item_id FROM reviews)
       ORDER BY o.created_at DESC`
    )
    .all(req.userId, req.params.productId);

  res.json({ can_review: compras.length > 0, purchases: compras });
});

// ---------------------------------------------------------------------------
// POST /api/reviews — publicar una reseña
// ---------------------------------------------------------------------------
router.post("/", requireAuth, (req, res) => {
  const { product_id, order_item_id, rating, title, body, size_fit } = req.body;

  if (!product_id || !order_item_id || !rating) {
    return res.status(400).json({ error: "Faltan datos para publicar la reseña." });
  }
  const nota = Number(rating);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return res.status(400).json({ error: "La valoración debe ser de 1 a 5 estrellas." });
  }
  if (size_fit && !AJUSTE_ETIQUETAS[size_fit]) {
    return res.status(400).json({ error: "Indicación de talla no válida." });
  }

  // Comprobación clave: esa compra existe, es de este usuario, y corresponde
  // de verdad a este producto. Sin esto, cualquiera podría opinar de
  // cualquier cosa mandando un order_item_id inventado.
  const compra = db
    .prepare(
      `SELECT oi.id
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.id = ? AND o.user_id = ? AND o.status != 'cancelado'
         AND oi.variant_id IN (SELECT id FROM variants WHERE product_id = ?)`
    )
    .get(order_item_id, req.userId, product_id);

  if (!compra) {
    return res.status(403).json({ error: "Solo puedes opinar sobre productos que hayas comprado." });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO reviews (product_id, user_id, order_item_id, rating, title, body, size_fit)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(product_id, req.userId, order_item_id, nota, title || null, body || null, size_fit || null);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(409).json({ error: "Ya has dejado una reseña de esta compra." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/reviews/:id — borrar mi propia reseña
// ---------------------------------------------------------------------------
router.delete("/:id", requireAuth, (req, res) => {
  const review = db.prepare("SELECT * FROM reviews WHERE id = ?").get(req.params.id);
  if (!review) return res.status(404).json({ error: "Reseña no encontrada." });
  if (review.user_id !== req.userId) {
    return res.status(403).json({ error: "No puedes borrar una reseña que no es tuya." });
  }

  db.prepare("DELETE FROM reviews WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

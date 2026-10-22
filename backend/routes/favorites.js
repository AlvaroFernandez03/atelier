// routes/favorites.js
const express = require("express");
const db = require("../db/database");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Los favoritos van ligados a una cuenta, así que todas las rutas requieren
// sesión iniciada (a diferencia del carrito, que sí admite invitados).
router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/favorites — mis productos guardados
// ---------------------------------------------------------------------------
router.get("/", (req, res) => {
  const favoritos = db
    .prepare(
      `SELECT p.id, p.name, p.price_cents, p.shape, p.image_file, p.active,
              b.name AS brand_name, c.slug AS category_slug,
              (SELECT COALESCE(SUM(stock), 0) FROM variants v WHERE v.product_id = p.id) AS total_stock,
              f.created_at AS saved_at
       FROM favorites f
       JOIN products p ON p.id = f.product_id
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`
    )
    .all(req.userId);

  // Añadimos los colores de cada producto, igual que en el catálogo, para
  // poder pintar la tarjeta con el mismo aspecto.
  const conColores = favoritos.map((p) => {
    const colors = db
      .prepare(
        `SELECT DISTINCT color_name, color_hex,
                (SELECT SUM(stock) FROM variants v2 WHERE v2.product_id = ? AND v2.color_name = v.color_name) AS color_stock
         FROM variants v WHERE product_id = ? ORDER BY color_name`
      )
      .all(p.id, p.id);
    return { ...p, colors };
  });

  res.json(conColores);
});

// ---------------------------------------------------------------------------
// GET /api/favorites/ids — solo los ids, para saber qué corazones pintar
// ---------------------------------------------------------------------------
// El catálogo lo usa para marcar de un vistazo qué productos ya están
// guardados, sin traerse todos los datos de cada uno.
router.get("/ids", (req, res) => {
  const ids = db
    .prepare("SELECT product_id FROM favorites WHERE user_id = ?")
    .all(req.userId)
    .map((r) => r.product_id);
  res.json(ids);
});

// ---------------------------------------------------------------------------
// POST /api/favorites — guardar o quitar (según esté ya o no)
// ---------------------------------------------------------------------------
// Una sola ruta que alterna el estado: es lo que espera el usuario al pulsar
// el corazón, y evita que el frontend tenga que saber si ya estaba guardado.
router.post("/", (req, res) => {
  const { product_id } = req.body;
  if (!product_id) return res.status(400).json({ error: "Falta el producto." });

  const producto = db.prepare("SELECT id FROM products WHERE id = ?").get(product_id);
  if (!producto) return res.status(404).json({ error: "Ese producto no existe." });

  const existente = db
    .prepare("SELECT id FROM favorites WHERE user_id = ? AND product_id = ?")
    .get(req.userId, product_id);

  if (existente) {
    db.prepare("DELETE FROM favorites WHERE id = ?").run(existente.id);
    return res.json({ saved: false });
  }

  db.prepare("INSERT INTO favorites (user_id, product_id) VALUES (?, ?)").run(req.userId, product_id);
  res.status(201).json({ saved: true });
});

module.exports = router;

// routes/cart.js
const express = require("express");
const db = require("../db/database");
const { optionalAuth } = require("../middleware/auth");
const { getOrCreateCart, getCartContents } = require("../services/cartService");

const router = express.Router();

// Todas las rutas del carrito usan optionalAuth: funcionan tanto para
// clientes registrados como para visitantes anónimos.
router.use(optionalAuth);

// El token de invitado llega en una cabecera propia que envía el frontend.
function guestTokenOf(req) {
  return req.headers["x-guest-token"] || null;
}

// GET /api/cart — contenido actual del carrito
router.get("/", (req, res) => {
  const cart = getOrCreateCart(req.userId, guestTokenOf(req));
  if (!cart) return res.json({ items: [], subtotal_cents: 0, total_units: 0 });
  res.json(getCartContents(cart.id));
});

// POST /api/cart/items — añadir una variante al carrito { variant_id, quantity }
router.post("/items", (req, res) => {
  const { variant_id, quantity } = req.body;
  const qty = Number(quantity) || 1;

  if (!variant_id) return res.status(400).json({ error: "Falta el artículo a añadir." });
  if (qty < 1) return res.status(400).json({ error: "La cantidad debe ser al menos 1." });

  const variant = db.prepare("SELECT * FROM variants WHERE id = ?").get(variant_id);
  if (!variant) return res.status(404).json({ error: "Ese artículo ya no existe." });
  if (variant.stock < 1) return res.status(409).json({ error: "Ese artículo está agotado." });

  const cart = getOrCreateCart(req.userId, guestTokenOf(req));
  if (!cart) return res.status(400).json({ error: "No se ha podido crear el carrito." });

  const existing = db
    .prepare("SELECT * FROM cart_items WHERE cart_id = ? AND variant_id = ?")
    .get(cart.id, variant_id);

  // Nunca dejamos meter más unidades de las que hay en stock, sumando lo que
  // ya hubiera en el carrito.
  const currentQty = existing ? existing.quantity : 0;
  const newQty = Math.min(currentQty + qty, variant.stock);

  if (newQty === currentQty) {
    return res.status(409).json({ error: `Solo quedan ${variant.stock} unidades y ya las tienes en el carrito.` });
  }

  if (existing) {
    db.prepare("UPDATE cart_items SET quantity = ? WHERE id = ?").run(newQty, existing.id);
  } else {
    db.prepare("INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (?, ?, ?)")
      .run(cart.id, variant_id, newQty);
  }

  // Si el cliente pidió más unidades de las que caben, se lo decimos en vez
  // de añadir menos en silencio (que le haría creer que lleva más de lo que
  // realmente tiene en el carrito).
  const anadidas = newQty - currentQty;
  const respuesta = getCartContents(cart.id);
  if (anadidas < qty) {
    respuesta.notice = `Solo quedaban ${anadidas} ${anadidas === 1 ? "unidad" : "unidades"} disponibles, así que hemos añadido esa cantidad.`;
  }

  res.status(201).json(respuesta);
});

// PUT /api/cart/items/:itemId — cambiar la cantidad de una línea
router.put("/items/:itemId", (req, res) => {
  const qty = Number(req.body.quantity);
  if (!qty || qty < 1) return res.status(400).json({ error: "La cantidad debe ser al menos 1." });

  const cart = getOrCreateCart(req.userId, guestTokenOf(req));
  if (!cart) return res.status(404).json({ error: "Carrito no encontrado." });

  // Comprobamos que la línea pertenece a ESTE carrito, para que nadie pueda
  // modificar el carrito de otra persona conociendo un id.
  const item = db
    .prepare("SELECT * FROM cart_items WHERE id = ? AND cart_id = ?")
    .get(req.params.itemId, cart.id);
  if (!item) return res.status(404).json({ error: "Ese artículo no está en tu carrito." });

  const variant = db.prepare("SELECT stock FROM variants WHERE id = ?").get(item.variant_id);
  if (qty > variant.stock) {
    return res.status(409).json({ error: `Solo quedan ${variant.stock} unidades disponibles.` });
  }

  db.prepare("UPDATE cart_items SET quantity = ? WHERE id = ?").run(qty, item.id);
  res.json(getCartContents(cart.id));
});

// DELETE /api/cart/items/:itemId — quitar una línea del carrito
router.delete("/items/:itemId", (req, res) => {
  const cart = getOrCreateCart(req.userId, guestTokenOf(req));
  if (!cart) return res.status(404).json({ error: "Carrito no encontrado." });

  db.prepare("DELETE FROM cart_items WHERE id = ? AND cart_id = ?").run(req.params.itemId, cart.id);
  res.json(getCartContents(cart.id));
});

module.exports = router;

// routes/orders.js
const express = require("express");
const db = require("../db/database");
const { requireAuth } = require("../middleware/auth");
const { getOrCreateCart, getCartContents } = require("../services/cartService");
const { sendOrderConfirmation } = require("../services/email");

const router = express.Router();

const ENVIO_GRATIS_DESDE = 5000; // 50 €
const COSTE_ENVIO = 495;         // 4,95 €

// ---------------------------------------------------------------------------
// POST /api/orders — tramitar el pedido a partir del carrito actual
// ---------------------------------------------------------------------------
// Hace falta estar identificado: un pedido pertenece a una cuenta, para que
// el cliente pueda consultarlo después y solicitar devoluciones.
router.post("/", requireAuth, (req, res) => {
  const { shipping_name, shipping_address, shipping_city, shipping_postal_code } = req.body;

  if (!shipping_name || !shipping_address || !shipping_city || !shipping_postal_code) {
    return res.status(400).json({ error: "Faltan datos de envío." });
  }

  const cart = getOrCreateCart(req.userId, null);
  const contents = getCartContents(cart.id);

  if (contents.items.length === 0) {
    return res.status(400).json({ error: "Tu carrito está vacío." });
  }

  // --- Comprobación previa de stock ---
  // Antes de tocar nada, verificamos que TODO lo del carrito sigue
  // disponible. Puede haber pasado tiempo desde que lo añadió y que otra
  // persona haya comprado esas unidades mientras tanto.
  const sinStock = [];
  contents.items.forEach((item) => {
    const variant = db.prepare("SELECT stock FROM variants WHERE id = ?").get(item.variant_id);
    if (!variant || variant.stock < item.quantity) {
      sinStock.push({
        product_name: item.product_name,
        size: item.size,
        color_name: item.color_name,
        available: variant ? variant.stock : 0,
      });
    }
  });

  if (sinStock.length > 0) {
    return res.status(409).json({
      error: "Algunos artículos ya no están disponibles en la cantidad que pediste.",
      unavailable: sinStock,
    });
  }

  const envio = contents.subtotal_cents >= ENVIO_GRATIS_DESDE ? 0 : COSTE_ENVIO;
  const total = contents.subtotal_cents + envio;

  // --- Transacción ---
  // Todo lo que viene ahora (crear el pedido, copiar las líneas, descontar
  // stock y vaciar el carrito) debe ocurrir COMPLETO o NO OCURRIR EN
  // ABSOLUTO. Si algo fallara a mitad, un ROLLBACK deshace todo y la base de
  // datos queda como estaba: sin pedidos a medias ni stock descontado de un
  // pedido que no llegó a crearse.
  let orderId;
  try {
    db.exec("BEGIN");

    const orderResult = db
      .prepare(
        `INSERT INTO orders (user_id, total_cents, shipping_name, shipping_address, shipping_city, shipping_postal_code)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(req.userId, total, shipping_name, shipping_address, shipping_city, shipping_postal_code);

    orderId = orderResult.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO order_items
        (order_id, variant_id, product_name, brand_name, size, color_name, color_hex, shape, unit_price_cents, quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const discountStock = db.prepare("UPDATE variants SET stock = stock - ? WHERE id = ? AND stock >= ?");

    contents.items.forEach((item) => {
      // Copiamos nombre, marca y precio TAL COMO ESTÁN AHORA: el pedido es un
      // documento histórico. Si mañana sube el precio, este pedido debe
      // seguir mostrando lo que el cliente pagó de verdad.
      insertItem.run(
        orderId, item.variant_id, item.product_name, item.brand_name,
        item.size, item.color_name, item.color_hex, item.shape,
        item.price_cents, item.quantity
      );

      // La condición "AND stock >= ?" es una segunda red de seguridad: si
      // entre la comprobación de antes y este momento alguien se hubiera
      // llevado las últimas unidades, esta actualización no afectaría a
      // ninguna fila y lo detectamos justo debajo.
      const updated = discountStock.run(item.quantity, item.variant_id, item.quantity);
      if (updated.changes === 0) {
        throw new Error(`Sin stock suficiente de ${item.product_name} (talla ${item.size}).`);
      }
    });

    // Vaciamos el carrito: ya se ha convertido en pedido.
    db.prepare("DELETE FROM cart_items WHERE cart_id = ?").run(cart.id);

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    return res.status(409).json({ error: err.message || "No se ha podido completar el pedido." });
  }

  const order = getOrderDetail(orderId, req.userId);
  res.status(201).json(order);

  // Email de confirmación en segundo plano: si falla o tarda, el pedido ya
  // está hecho y el cliente ya ha visto su confirmación en pantalla.
  const user = db.prepare("SELECT name, email FROM users WHERE id = ?").get(req.userId);
  sendOrderConfirmation(user, order);
});

// ---------------------------------------------------------------------------
// GET /api/orders — mis pedidos (resumen)
// ---------------------------------------------------------------------------
router.get("/", requireAuth, (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*,
              (SELECT SUM(quantity) FROM order_items oi WHERE oi.order_id = o.id) AS total_units
       FROM orders o
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC, o.id DESC`
    )
    .all(req.userId);

  // Añadimos los primeros artículos de cada pedido, para poder mostrar las
  // miniaturas en el listado sin tener que abrir cada pedido.
  const withPreview = orders.map((o) => {
    const items = db
      .prepare("SELECT shape, color_hex, product_name FROM order_items WHERE order_id = ? LIMIT 4")
      .all(o.id);
    return { ...o, preview_items: items };
  });

  res.json(withPreview);
});

// ---------------------------------------------------------------------------
// GET /api/orders/:id — detalle de un pedido concreto
// ---------------------------------------------------------------------------
router.get("/:id", requireAuth, (req, res) => {
  const order = getOrderDetail(req.params.id, req.userId);
  if (!order) return res.status(404).json({ error: "Pedido no encontrado." });
  res.json(order);
});

// Función auxiliar: devuelve un pedido con sus líneas, comprobando que
// pertenece a quien lo pide (nadie puede ver el pedido de otra persona
// aunque conozca el número).
function getOrderDetail(orderId, userId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?").get(orderId, userId);
  if (!order) return null;

  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(orderId);
  const subtotal = items.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);

  return { ...order, items, subtotal_cents: subtotal, shipping_cents: order.total_cents - subtotal };
}

module.exports = router;

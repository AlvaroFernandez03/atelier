// routes/returns.js
const express = require("express");
const db = require("../db/database");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Plazo para devolver, contado desde la fecha del pedido.
const DIAS_PARA_DEVOLVER = 30;

const MOTIVOS = {
  talla: "No es mi talla",
  defecto: "Llegó defectuoso",
  no_esperaba: "No es lo que esperaba",
  tarde: "Llegó demasiado tarde",
  otro: "Otro motivo",
};

// Calcula cuántos días han pasado desde una fecha guardada por SQLite.
function diasDesde(fechaTexto) {
  const fecha = new Date(fechaTexto.replace(" ", "T"));
  return Math.floor((Date.now() - fecha.getTime()) / (1000 * 60 * 60 * 24));
}

// Devuelve, para una línea de pedido, cuántas unidades quedan por devolver.
// Restamos las que ya tengan una devolución solicitada o aceptada: una
// rechazada no cuenta, porque esas unidades siguen siendo del cliente.
function unidadesDevolvibles(orderItem) {
  const yaPedidas = db
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS total FROM returns
       WHERE order_item_id = ? AND status IN ('solicitada', 'aceptada')`
    )
    .get(orderItem.id).total;
  return orderItem.quantity - yaPedidas;
}

// ---------------------------------------------------------------------------
// GET /api/returns/eligible/:orderId — qué se puede devolver de un pedido
// ---------------------------------------------------------------------------
// El frontend llama a esto para pintar el formulario de devolución con las
// unidades realmente disponibles de cada línea.
router.get("/eligible/:orderId", requireAuth, (req, res) => {
  const order = db
    .prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?")
    .get(req.params.orderId, req.userId);

  if (!order) return res.status(404).json({ error: "Pedido no encontrado." });

  const dias = diasDesde(order.created_at);
  const dentroDePlazo = dias <= DIAS_PARA_DEVOLVER;

  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
  const lineas = items.map((item) => ({
    ...item,
    returnable_quantity: unidadesDevolvibles(item),
  }));

  res.json({
    order_id: order.id,
    order_date: order.created_at,
    days_since_order: dias,
    return_window_days: DIAS_PARA_DEVOLVER,
    within_window: dentroDePlazo,
    days_left: Math.max(0, DIAS_PARA_DEVOLVER - dias),
    items: lineas,
    reasons: MOTIVOS,
  });
});

// ---------------------------------------------------------------------------
// POST /api/returns — solicitar la devolución de una o varias líneas
// Body: { items: [{ order_item_id, quantity }], reason }
// ---------------------------------------------------------------------------
router.post("/", requireAuth, (req, res) => {
  const { items, reason } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Elige al menos un artículo para devolver." });
  }
  if (!reason || !MOTIVOS[reason]) {
    return res.status(400).json({ error: "Indica un motivo válido para la devolución." });
  }

  // Validamos TODAS las líneas antes de guardar ninguna, para no dejar una
  // solicitud a medias si la segunda línea resulta inválida.
  const validadas = [];
  for (const linea of items) {
    const orderItem = db
      .prepare(
        `SELECT oi.*, o.user_id, o.created_at AS order_date
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.id = ?`
      )
      .get(linea.order_item_id);

    if (!orderItem) {
      return res.status(404).json({ error: "Uno de los artículos no existe." });
    }
    // Comprobación de propiedad: nadie puede devolver el pedido de otro
    // aunque conozca el identificador de la línea.
    if (orderItem.user_id !== req.userId) {
      return res.status(403).json({ error: "Ese artículo no pertenece a tus pedidos." });
    }
    if (diasDesde(orderItem.order_date) > DIAS_PARA_DEVOLVER) {
      return res.status(409).json({
        error: `El plazo de devolución de ${DIAS_PARA_DEVOLVER} días ya ha pasado para este pedido.`,
      });
    }

    const cantidad = Number(linea.quantity) || 1;
    const disponibles = unidadesDevolvibles(orderItem);

    if (cantidad < 1) {
      return res.status(400).json({ error: "La cantidad a devolver debe ser al menos 1." });
    }
    if (cantidad > disponibles) {
      return res.status(409).json({
        error:
          disponibles === 0
            ? `Ya has solicitado la devolución de "${orderItem.product_name}".`
            : `Solo puedes devolver ${disponibles} unidad(es) de "${orderItem.product_name}".`,
      });
    }

    validadas.push({ orderItem, cantidad });
  }

  // Una vez validado todo, guardamos las solicitudes dentro de una
  // transacción para que se creen todas o ninguna.
  try {
    db.exec("BEGIN");
    const insert = db.prepare(
      "INSERT INTO returns (order_item_id, user_id, quantity, reason) VALUES (?, ?, ?, ?)"
    );
    validadas.forEach(({ orderItem, cantidad }) => {
      insert.run(orderItem.id, req.userId, cantidad, reason);
    });
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    return res.status(500).json({ error: "No se ha podido registrar la devolución." });
  }

  res.status(201).json({ success: true, count: validadas.length });
});

// ---------------------------------------------------------------------------
// GET /api/returns/me — mis devoluciones
// ---------------------------------------------------------------------------
router.get("/me", requireAuth, (req, res) => {
  const devoluciones = db
    .prepare(
      `SELECT r.*, oi.product_name, oi.brand_name, oi.size, oi.color_name, oi.color_hex,
              oi.shape, oi.unit_price_cents, oi.order_id
       FROM returns r
       JOIN order_items oi ON oi.id = r.order_item_id
       WHERE r.user_id = ?
       ORDER BY r.requested_at DESC, r.id DESC`
    )
    .all(req.userId);

  res.json(devoluciones.map((d) => ({ ...d, reason_label: MOTIVOS[d.reason] || d.reason })));
});

// ---------------------------------------------------------------------------
// GET /api/returns — todas las devoluciones (tienda)
// ---------------------------------------------------------------------------
router.get("/", requireAuth, requireAdmin, (req, res) => {
  const devoluciones = db
    .prepare(
      `SELECT r.*, oi.product_name, oi.brand_name, oi.size, oi.color_name, oi.color_hex,
              oi.shape, oi.unit_price_cents, oi.order_id, oi.variant_id,
              u.name AS customer_name, u.email AS customer_email
       FROM returns r
       JOIN order_items oi ON oi.id = r.order_item_id
       JOIN users u ON u.id = r.user_id
       ORDER BY r.status = 'solicitada' DESC, r.requested_at DESC`
    )
    .all();

  res.json(devoluciones.map((d) => ({ ...d, reason_label: MOTIVOS[d.reason] || d.reason })));
});

// ---------------------------------------------------------------------------
// PUT /api/returns/:id — aceptar o rechazar una devolución (tienda)
// ---------------------------------------------------------------------------
router.put("/:id", requireAuth, requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!["aceptada", "rechazada"].includes(status)) {
    return res.status(400).json({ error: "Estado no válido." });
  }

  const devolucion = db
    .prepare(
      `SELECT r.*, oi.variant_id FROM returns r
       JOIN order_items oi ON oi.id = r.order_item_id WHERE r.id = ?`
    )
    .get(req.params.id);

  if (!devolucion) return res.status(404).json({ error: "Devolución no encontrada." });
  if (devolucion.status !== "solicitada") {
    return res.status(409).json({ error: "Esta devolución ya se ha revisado." });
  }

  try {
    db.exec("BEGIN");

    db.prepare(
      "UPDATE returns SET status = ?, reviewed_at = datetime('now') WHERE id = ?"
    ).run(status, devolucion.id);

    // Al aceptar una devolución, las unidades vuelven al stock: el artículo
    // regresa al almacén y puede volver a venderse.
    if (status === "aceptada") {
      db.prepare("UPDATE variants SET stock = stock + ? WHERE id = ?")
        .run(devolucion.quantity, devolucion.variant_id);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    return res.status(500).json({ error: "No se ha podido actualizar la devolución." });
  }

  res.json({ success: true });
});

module.exports = router;

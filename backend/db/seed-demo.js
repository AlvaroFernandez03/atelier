// db/seed-demo.js — actividad de ejemplo para la DEMO pública del portfolio.
//
// Solo se ejecuta con DEMO=1 (ver demo.js); en tu ordenador nunca. En la
// demo la base de datos se crea de cero cada vez que el servidor despierta,
// así que esto deja la tienda "con vida": Marta ya tiene pedidos (uno
// entregado, con reseña y una devolución pendiente, y otro en camino) y hay
// pedidos de otros clientes para que el panel de administración tenga cifras.
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

function seedDemo(db) {
  if (process.env.DEMO !== "1") return;
  if (db.prepare("SELECT COUNT(*) AS n FROM orders").get().n > 0) return;
  const marta = db.prepare("SELECT id FROM users WHERE email = 'marta@ejemplo.com'").get();
  if (!marta) return;

  // Clientes "de relleno" (con una contraseña que nadie conoce).
  const otra = bcrypt.hashSync(crypto.randomBytes(12).toString("hex"), 10);
  const cliente = (nombre, email) =>
    db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'cliente')").run(nombre, email, otra).lastInsertRowid;
  const jorge = cliente("Jorge Pérez", "jorge@ejemplo.com");
  const ines = cliente("Inés Romero", "ines@ejemplo.com");

  // Una variante con stock del producto pedido, en la talla que se pide (o la primera que haya).
  function variante(nombreProducto, talla, color) {
    return db
      .prepare(
        `SELECT v.*, p.name AS product_name, p.price_cents, p.shape, b.name AS brand_name
         FROM variants v JOIN products p ON p.id = v.product_id JOIN brands b ON b.id = p.brand_id
         WHERE p.name = ? AND v.stock > 0 AND (? IS NULL OR v.size = ?) AND (? IS NULL OR v.color_name = ?)
         ORDER BY v.id LIMIT 1`
      )
      .get(nombreProducto, talla || null, talla || null, color || null, color || null);
  }

  const lineas = [];
  function pedido(userId, articulos, { dias, estado, nombre, direccion, ciudad, cp }) {
    const vs = articulos.map(([p, t, c, q]) => [variante(p, t, c), q || 1]).filter(([v]) => v);
    if (!vs.length) return null;
    const subtotal = vs.reduce((s, [v, q]) => s + v.price_cents * q, 0);
    const total = subtotal + (subtotal >= 5000 ? 0 : 495);
    const orderId = db
      .prepare(
        `INSERT INTO orders (user_id, status, total_cents, shipping_name, shipping_address, shipping_city, shipping_postal_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`
      )
      .run(userId, estado, total, nombre, direccion, ciudad, cp, `-${dias} days`).lastInsertRowid;
    const ids = vs.map(([v, q]) => {
      db.prepare("UPDATE variants SET stock = stock - ? WHERE id = ?").run(q, v.id);
      return db
        .prepare(
          `INSERT INTO order_items (order_id, variant_id, product_name, brand_name, size, color_name, color_hex, shape, unit_price_cents, quantity)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(orderId, v.id, v.product_name, v.brand_name, v.size, v.color_name, v.color_hex, v.shape, v.price_cents, q).lastInsertRowid;
    });
    lineas.push(...ids);
    return { orderId, items: ids };
  }

  db.exec("BEGIN");
  try {
    const envioMarta = { nombre: "Marta López", direccion: "Calle Mayor 12, 3º B", ciudad: "Albacete", cp: "02001" };
    const entregado = pedido(marta.id, [["Camiseta básica de algodón", "M", "Azul marino"], ["Vaquero recto", "M"]], { dias: 12, estado: "entregado", ...envioMarta });
    pedido(marta.id, [["Zapatilla de running amortiguada", "38"]], { dias: 2, estado: "enviado", ...envioMarta });
    pedido(jorge, [["Sudadera con capucha", "L"], ["Pantalón jogger", "L"]], { dias: 1, estado: "pagado", nombre: "Jorge Pérez", direccion: "Av. de España 40", ciudad: "Murcia", cp: "30008" });
    pedido(ines, [["Chaqueta vaquera", "S"]], { dias: 0, estado: "pagado", nombre: "Inés Romero", direccion: "Calle Ancha 5", ciudad: "Valencia", cp: "46001" });

    if (entregado) {
      // Marta ha opinado sobre la camiseta y ha pedido devolver el vaquero.
      const [camiseta, vaquero] = entregado.items;
      const productoDe = (itemId) =>
        db.prepare("SELECT v.product_id FROM order_items oi JOIN variants v ON v.id = oi.variant_id WHERE oi.id = ?").get(itemId).product_id;
      db.prepare(
        `INSERT INTO reviews (product_id, user_id, order_item_id, rating, title, body, size_fit, created_at)
         VALUES (?, ?, ?, 5, ?, ?, 'justa', datetime('now', '-8 days'))`
      ).run(productoDe(camiseta), marta.id, camiseta, "Justo lo que buscaba", "El algodón es grueso y después de varios lavados sigue igual. Talla como siempre.");
      if (vaquero) {
        db.prepare("INSERT INTO returns (order_item_id, user_id, quantity, reason, status, requested_at) VALUES (?, ?, 1, ?, 'solicitada', datetime('now', '-1 days'))")
          .run(vaquero, marta.id, "Me queda grande de cintura, lo cambiaría por una talla menos.");
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("No se han podido crear los pedidos de la demo:", err.message);
  }
}

module.exports = { seedDemo };

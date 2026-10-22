// services/cartService.js
const db = require("../db/database");

// Devuelve el carrito del usuario (si ha iniciado sesión) o el del invitado
// (identificado por un token que guarda su navegador). Si no existe todavía,
// lo crea. Siempre devuelve un carrito válido.
function getOrCreateCart(userId, guestToken) {
  if (userId) {
    let cart = db.prepare("SELECT * FROM carts WHERE user_id = ?").get(userId);
    if (!cart) {
      const result = db.prepare("INSERT INTO carts (user_id) VALUES (?)").run(userId);
      cart = { id: result.lastInsertRowid, user_id: userId };
    }
    return cart;
  }

  if (guestToken) {
    let cart = db.prepare("SELECT * FROM carts WHERE guest_token = ?").get(guestToken);
    if (!cart) {
      const result = db.prepare("INSERT INTO carts (guest_token) VALUES (?)").run(guestToken);
      cart = { id: result.lastInsertRowid, guest_token: guestToken };
    }
    return cart;
  }

  return null; // ni sesión ni token de invitado: no hay carrito que devolver
}

// Devuelve el contenido completo del carrito, con todos los datos que el
// frontend necesita para pintarlo (nombre, precio, color, talla, stock).
// Incluye "stock" para poder avisar si algo se ha agotado mientras el
// producto estaba en el carrito.
function getCartContents(cartId) {
  const items = db
    .prepare(
      `SELECT ci.id AS item_id, ci.quantity, ci.variant_id,
              v.size, v.color_name, v.color_hex, v.stock,
              p.id AS product_id, p.name AS product_name, p.price_cents, p.shape,
              b.name AS brand_name
       FROM cart_items ci
       JOIN variants v ON v.id = ci.variant_id
       JOIN products p ON p.id = v.product_id
       JOIN brands b ON b.id = p.brand_id
       WHERE ci.cart_id = ?
       ORDER BY ci.id`
    )
    .all(cartId);

  const subtotal = items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0);
  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);

  return { items, subtotal_cents: subtotal, total_units: totalUnits };
}

// Al iniciar sesión o registrarse, traslada lo que hubiera en el carrito de
// invitado al carrito de la cuenta. Si un mismo artículo ya estaba en ambos,
// suma las cantidades (respetando el stock disponible).
function mergeGuestCart(guestToken, userId) {
  const guestCart = db.prepare("SELECT * FROM carts WHERE guest_token = ?").get(guestToken);
  if (!guestCart) return;

  const userCart = getOrCreateCart(userId, null);
  const guestItems = db.prepare("SELECT * FROM cart_items WHERE cart_id = ?").all(guestCart.id);

  guestItems.forEach((item) => {
    const existing = db
      .prepare("SELECT * FROM cart_items WHERE cart_id = ? AND variant_id = ?")
      .get(userCart.id, item.variant_id);

    const variant = db.prepare("SELECT stock FROM variants WHERE id = ?").get(item.variant_id);
    const maxStock = variant ? variant.stock : 0;

    if (existing) {
      const newQty = Math.min(existing.quantity + item.quantity, maxStock);
      db.prepare("UPDATE cart_items SET quantity = ? WHERE id = ?").run(newQty, existing.id);
    } else if (maxStock > 0) {
      db.prepare("INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (?, ?, ?)")
        .run(userCart.id, item.variant_id, Math.min(item.quantity, maxStock));
    }
  });

  // Limpiamos el carrito de invitado, ya trasladado.
  db.prepare("DELETE FROM cart_items WHERE cart_id = ?").run(guestCart.id);
  db.prepare("DELETE FROM carts WHERE id = ?").run(guestCart.id);
}

module.exports = { getOrCreateCart, getCartContents, mergeGuestCart };

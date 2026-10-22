// js/checkout.js
const ENVIO_GRATIS_DESDE = 5000;
const COSTE_ENVIO = 495;

document.addEventListener("DOMContentLoaded", async () => {
  await renderHeader();

  // Para tramitar un pedido hace falta cuenta: el pedido tiene que quedar
  // asociado a alguien para poder consultarlo y devolverlo después.
  // Le mandamos a acceder y volvemos aquí automáticamente (parámetro "next").
  if (!getToken()) {
    window.location.href = "acceso.html?next=checkout.html";
    return;
  }

  loadCheckout();
});

async function loadCheckout() {
  const mount = document.getElementById("checkout-content");

  let cart;
  try {
    cart = await api("/cart");
  } catch (err) {
    mount.innerHTML = `<p class="form-message error">${err.message}</p>`;
    return;
  }

  if (cart.items.length === 0) {
    mount.innerHTML = `
      <div class="empty-state">
        <h3>No hay nada que tramitar</h3>
        <p>Tu carrito está vacío.</p>
        <a class="btn btn-primary" href="catalogo.html">Ver el catálogo</a>
      </div>`;
    return;
  }

  const envio = cart.subtotal_cents >= ENVIO_GRATIS_DESDE ? 0 : COSTE_ENVIO;
  const total = cart.subtotal_cents + envio;
  const user = getUser();

  mount.innerHTML = `
    <div class="checkout-layout">
      <div>
        <h3 style="margin-bottom:16px;">Dirección de envío</h3>
        <form id="checkout-form" style="max-width:460px;">
          <div class="field">
            <label for="s-name">Nombre y apellidos</label>
            <input type="text" id="s-name" value="${user ? user.name : ""}" autocomplete="name" required>
          </div>
          <div class="field">
            <label for="s-address">Dirección</label>
            <input type="text" id="s-address" placeholder="Calle, número, piso" autocomplete="street-address" required>
          </div>
          <div style="display:grid; grid-template-columns:1fr 140px; gap:12px;">
            <div class="field">
              <label for="s-city">Ciudad</label>
              <input type="text" id="s-city" autocomplete="address-level2" required>
            </div>
            <div class="field">
              <label for="s-postal">Código postal</label>
              <input type="text" id="s-postal" inputmode="numeric" pattern="[0-9]{5}"
                     title="5 dígitos" autocomplete="postal-code" required>
            </div>
          </div>

          <div class="pay-note">
            Esta tienda es un proyecto de práctica: no hay cobro real ni se piden datos de pago.
            Al confirmar, el pedido se registra y el stock se descuenta como en una tienda de verdad.
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="confirm-btn">
            Confirmar pedido · ${formatPrice(total)}
          </button>
          <p id="checkout-msg" class="form-message"></p>
        </form>
      </div>

      <aside class="cart-summary">
        <h3 style="margin-bottom:12px;">Tu pedido</h3>
        <div class="checkout-items">
          ${cart.items.map(checkoutItem).join("")}
        </div>
        <div class="summary-row">
          <span>Subtotal</span><span class="num">${formatPrice(cart.subtotal_cents)}</span>
        </div>
        <div class="summary-row">
          <span>Envío</span><span class="num">${envio === 0 ? "Gratis" : formatPrice(envio)}</span>
        </div>
        <div class="summary-row total">
          <span>Total</span><span class="num">${formatPrice(total)}</span>
        </div>
        <a href="carrito.html" class="btn btn-outline btn-block" style="margin-top:14px;">Volver al carrito</a>
      </aside>
    </div>
  `;

  document.getElementById("checkout-form").addEventListener("submit", confirmOrder);
}

function checkoutItem(item) {
  return `
    <div class="checkout-item">
      <div class="thumb">${productSvg(item.shape, item.color_hex)}</div>
      <div style="flex:1;">
        <div class="line-name">${item.product_name}</div>
        <div class="cart-meta">${item.color_name} · Talla ${item.size} · ${item.quantity} ud.</div>
      </div>
      <div class="num" style="font-size:0.9rem;">${formatPrice(item.price_cents * item.quantity)}</div>
    </div>`;
}

async function confirmOrder(e) {
  e.preventDefault();
  const msg = document.getElementById("checkout-msg");
  const btn = document.getElementById("confirm-btn");
  msg.textContent = "";
  msg.className = "form-message";
  btn.disabled = true;
  btn.textContent = "Procesando…";

  try {
    const order = await api("/orders", {
      method: "POST",
      body: JSON.stringify({
        shipping_name: document.getElementById("s-name").value.trim(),
        shipping_address: document.getElementById("s-address").value.trim(),
        shipping_city: document.getElementById("s-city").value.trim(),
        shipping_postal_code: document.getElementById("s-postal").value.trim(),
      }),
    });
    // Pedido creado: vamos a la página de confirmación.
    window.location.href = `pedido.html?id=${order.id}&nuevo=1`;
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("error");
    btn.disabled = false;
    // Si el fallo fue por stock, recargamos para que vea el carrito
    // actualizado y pueda ajustar cantidades.
    if (err.message.includes("disponible")) {
      setTimeout(() => loadCheckout(), 2200);
    } else {
      loadCheckout();
    }
  }
}

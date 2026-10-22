// js/carrito.js
const ENVIO_GRATIS_DESDE = 5000; // 50 € en céntimos
const COSTE_ENVIO = 495;         // 4,95 €

document.addEventListener("DOMContentLoaded", async () => {
  await renderHeader();
  loadCart();
});

async function loadCart() {
  const mount = document.getElementById("cart-content");

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
        <h3>Tu carrito está vacío</h3>
        <p>Cuando añadas algo, aparecerá aquí.</p>
        <a class="btn btn-primary" href="catalogo.html">Ver el catálogo</a>
      </div>`;
    return;
  }

  const envio = cart.subtotal_cents >= ENVIO_GRATIS_DESDE ? 0 : COSTE_ENVIO;
  const total = cart.subtotal_cents + envio;
  const faltaParaGratis = ENVIO_GRATIS_DESDE - cart.subtotal_cents;

  mount.innerHTML = `
    <div class="cart-layout">
      <div>
        ${cart.items.map(cartLine).join("")}
      </div>

      <aside class="cart-summary">
        <h3 style="margin-bottom:14px;">Resumen</h3>
        <div class="summary-row">
          <span>Subtotal (${cart.total_units} ${cart.total_units === 1 ? "artículo" : "artículos"})</span>
          <span class="num">${formatPrice(cart.subtotal_cents)}</span>
        </div>
        <div class="summary-row">
          <span>Envío</span>
          <span class="num">${envio === 0 ? "Gratis" : formatPrice(envio)}</span>
        </div>
        ${
          faltaParaGratis > 0
            ? `<p style="font-size:0.82rem; color:var(--ink-soft); margin:8px 0;">
                 Te faltan ${formatPrice(faltaParaGratis)} para el envío gratis.
               </p>`
            : ""
        }
        <div class="summary-row total">
          <span>Total</span>
          <span class="num">${formatPrice(total)}</span>
        </div>
        <a href="checkout.html" class="btn btn-primary btn-block" style="margin-top:16px;">Tramitar pedido</a>
        <a href="catalogo.html" class="btn btn-outline btn-block" style="margin-top:8px;">Seguir comprando</a>
      </aside>
    </div>
  `;

  wireCartActions();
}

function cartLine(item) {
  // Si el stock ha bajado por debajo de lo que el cliente tenía reservado en
  // el carrito (porque otra persona compró mientras tanto), se lo decimos
  // claramente en vez de dejar que falle al tramitar el pedido.
  const excedeStock = item.quantity > item.stock;

  return `
    <div class="cart-line" data-item="${item.item_id}">
      <a class="cart-thumb" href="producto.html?id=${item.product_id}">
        ${productSvg(item.shape, item.color_hex)}
      </a>
      <div>
        <div class="product-brand">${item.brand_name}</div>
        <a href="producto.html?id=${item.product_id}"><strong>${item.product_name}</strong></a>
        <div class="cart-meta">${item.color_name} · Talla ${item.size}</div>
        ${
          excedeStock
            ? `<div class="stock-note low">Solo quedan ${item.stock}. Ajusta la cantidad para continuar.</div>`
            : ""
        }
        <div class="qty-control">
          <button data-action="menos" ${item.quantity <= 1 ? "disabled" : ""} aria-label="Quitar una unidad">−</button>
          <span class="qty">${item.quantity}</span>
          <button data-action="mas" ${item.quantity >= item.stock ? "disabled" : ""} aria-label="Añadir una unidad">+</button>
        </div>
        <br>
        <button class="link-remove" data-action="quitar">Quitar</button>
      </div>
      <div class="cart-line-price">
        <strong>${formatPrice(item.price_cents * item.quantity)}</strong>
        ${item.quantity > 1 ? `<div class="cart-meta">${formatPrice(item.price_cents)} c/u</div>` : ""}
      </div>
    </div>
  `;
}

function wireCartActions() {
  document.querySelectorAll(".cart-line").forEach((line) => {
    const itemId = line.dataset.item;
    const qty = Number(line.querySelector(".qty").textContent);

    line.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          if (btn.dataset.action === "quitar") {
            await api(`/cart/items/${itemId}`, { method: "DELETE" });
            toast("Artículo quitado del carrito");
          } else {
            const nueva = btn.dataset.action === "mas" ? qty + 1 : qty - 1;
            await api(`/cart/items/${itemId}`, {
              method: "PUT",
              body: JSON.stringify({ quantity: nueva }),
            });
          }
          await loadCart();
          refreshCartCount();
        } catch (err) {
          toast(err.message);
        }
      });
    });
  });
}

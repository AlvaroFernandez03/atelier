// js/pedido.js
const qs = new URLSearchParams(location.search);
const orderId = qs.get("id");
const esNuevo = qs.get("nuevo") === "1"; // viene de acabar de comprar

const ESTADOS = {
  pagado: "Pedido confirmado",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

document.addEventListener("DOMContentLoaded", async () => {
  await renderHeader();

  if (!getToken()) {
    window.location.href = `acceso.html?next=pedido.html%3Fid%3D${orderId}`;
    return;
  }

  const mount = document.getElementById("order-content");

  let order;
  try {
    order = await api(`/orders/${orderId}`);
  } catch (err) {
    mount.innerHTML = `
      <div class="empty-state">
        <h3>No hemos encontrado este pedido</h3>
        <p>${err.message}</p>
        <a class="btn btn-outline" href="cuenta.html">Ir a mi cuenta</a>
      </div>`;
    return;
  }

  const fecha = new Date(order.created_at.replace(" ", "T")).toLocaleDateString("es-ES", {
    day: "numeric", month: "long", year: "numeric",
  });

  mount.innerHTML = `
    ${
      esNuevo
        ? `<div class="order-success">
             <h1>Gracias por tu pedido</h1>
             <p>Te hemos enviado la confirmación por email. Tu número de pedido es el ${order.id}.</p>
           </div>`
        : ""
    }

    <div class="order-layout">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:10px; margin-bottom:6px;">
          <h2>Pedido nº ${order.id}</h2>
          <span class="status-badge ${order.status}">${ESTADOS[order.status] || order.status}</span>
        </div>
        <p class="muted" style="font-size:0.88rem; margin-bottom:20px;">Realizado el ${fecha}</p>

        ${order.items.map(orderLine).join("")}

        <div id="return-area" style="margin-top:24px; display:flex; gap:10px; flex-wrap:wrap;">
          <a href="cuenta.html" class="btn btn-outline">Ver todos mis pedidos</a>
        </div>
      </div>

      <aside>
        <div class="cart-summary" style="position:static;">
          <h3 style="margin-bottom:12px;">Resumen</h3>
          <div class="summary-row"><span>Subtotal</span><span class="num">${formatPrice(order.subtotal_cents)}</span></div>
          <div class="summary-row"><span>Envío</span><span class="num">${order.shipping_cents === 0 ? "Gratis" : formatPrice(order.shipping_cents)}</span></div>
          <div class="summary-row total"><span>Total</span><span class="num">${formatPrice(order.total_cents)}</span></div>
        </div>

        <div class="cart-summary" style="position:static; margin-top:16px;">
          <h3 style="margin-bottom:10px;">Envío</h3>
          <div class="address-box">
            ${order.shipping_name}<br>
            ${order.shipping_address}<br>
            ${order.shipping_postal_code} ${order.shipping_city}
          </div>
        </div>
      </aside>
    </div>
  `;

  renderReturnOption(order.id);
});

function orderLine(item) {
  return `
    <div class="order-line">
      <div class="thumb">${productSvg(item.shape, item.color_hex)}</div>
      <div style="flex:1;">
        <div class="product-brand">${item.brand_name}</div>
        <strong style="font-size:0.95rem;">${item.product_name}</strong>
        <div class="cart-meta">${item.color_name} · Talla ${item.size} · ${item.quantity} ud.</div>
      </div>
      <div class="num">${formatPrice(item.unit_price_cents * item.quantity)}</div>
    </div>`;
}

// Comprueba si este pedido admite devoluciones y, si es así, añade el botón.
// Lo hacemos aparte para no retrasar el pintado del pedido en sí.
async function renderReturnOption(orderId) {
  const area = document.getElementById("return-area");
  if (!area) return;

  try {
    const info = await api(`/returns/eligible/${orderId}`);
    const quedanUnidades = info.items.some((i) => i.returnable_quantity > 0);

    if (info.within_window && quedanUnidades) {
      area.insertAdjacentHTML(
        "afterbegin",
        `<a href="devolucion.html?pedido=${orderId}" class="btn btn-primary">Solicitar devolución</a>`
      );
      area.insertAdjacentHTML(
        "beforeend",
        `<p style="width:100%; font-size:0.84rem; color:var(--ink-faint); margin-top:4px;">
           Te quedan ${info.days_left} días para devolver este pedido.
         </p>`
      );
    } else if (!info.within_window) {
      area.insertAdjacentHTML(
        "beforeend",
        `<p style="width:100%; font-size:0.84rem; color:var(--ink-faint); margin-top:4px;">
           El plazo de devolución de ${info.return_window_days} días ya ha pasado.
         </p>`
      );
    } else {
      area.insertAdjacentHTML(
        "beforeend",
        `<p style="width:100%; font-size:0.84rem; color:var(--ink-faint); margin-top:4px;">
           Ya has solicitado la devolución de todos los artículos de este pedido.
         </p>`
      );
    }
  } catch (_) {
    // Si falla, simplemente no mostramos la opción de devolver.
  }
}

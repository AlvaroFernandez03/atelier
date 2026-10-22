// js/devolucion.js
const pedidoId = new URLSearchParams(location.search).get("pedido");

// Guarda qué líneas ha marcado el cliente y cuántas unidades de cada una:
// { order_item_id: cantidad }
const seleccion = {};
let info = null;

document.addEventListener("DOMContentLoaded", async () => {
  await renderHeader();

  if (!getToken()) {
    window.location.href = `acceso.html?next=devolucion.html%3Fpedido%3D${pedidoId}`;
    return;
  }

  const mount = document.getElementById("return-content");

  try {
    info = await api(`/returns/eligible/${pedidoId}`);
  } catch (err) {
    mount.innerHTML = `
      <div class="empty-state">
        <h3>No podemos abrir esta devolución</h3>
        <p>${err.message}</p>
        <a class="btn btn-outline" href="cuenta.html">Ir a mis pedidos</a>
      </div>`;
    return;
  }

  if (!info.within_window) {
    mount.innerHTML = `
      <div class="empty-state">
        <h3>Fuera de plazo</h3>
        <p>El plazo de ${info.return_window_days} días para devolver este pedido ya ha pasado.</p>
        <a class="btn btn-outline" href="pedido.html?id=${pedidoId}">Volver al pedido</a>
      </div>`;
    return;
  }

  const devolvibles = info.items.filter((i) => i.returnable_quantity > 0);
  if (devolvibles.length === 0) {
    mount.innerHTML = `
      <div class="empty-state">
        <h3>Nada que devolver</h3>
        <p>Ya has solicitado la devolución de todos los artículos de este pedido.</p>
        <a class="btn btn-outline" href="pedido.html?id=${pedidoId}">Volver al pedido</a>
      </div>`;
    return;
  }

  render(mount);
});

function render(mount) {
  mount.innerHTML = `
    <h1 style="margin-bottom:6px;">Solicitar devolución</h1>
    <p class="muted" style="margin-bottom:22px;">
      Pedido nº ${info.order_id} · te quedan ${info.days_left} días de plazo
    </p>

    <h3 style="margin-bottom:12px; font-size:1rem;">¿Qué quieres devolver?</h3>
    <div id="items-list">
      ${info.items.map(returnItem).join("")}
    </div>

    <div class="field" style="margin-top:24px; max-width:340px;">
      <label for="reason">Motivo de la devolución</label>
      <select id="reason" required>
        <option value="">Elige un motivo</option>
        ${Object.entries(info.reasons).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
      </select>
    </div>

    <div style="background:var(--tile); border-radius:var(--r-sm); padding:14px; font-size:0.85rem; color:var(--ink-soft); margin:20px 0;">
      Al enviar la solicitud, la revisaremos y te avisaremos del resultado.
      Si se acepta, te reembolsaremos el importe de los artículos devueltos.
    </div>

    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <button id="submit-return" class="btn btn-primary" disabled>Enviar solicitud</button>
      <a href="pedido.html?id=${pedidoId}" class="btn btn-outline">Cancelar</a>
    </div>
    <p id="return-msg" class="form-message"></p>
  `;

  wireSelection();
  document.getElementById("submit-return").addEventListener("click", submitReturn);
  document.getElementById("reason").addEventListener("change", updateSubmitState);
}

function returnItem(item) {
  const disponible = item.returnable_quantity;
  const agotado = disponible === 0;

  // Si de una línea de 3 unidades ya se devolvió 1, solo ofrecemos hasta 2.
  const opcionesCantidad = [];
  for (let i = 1; i <= disponible; i++) opcionesCantidad.push(i);

  return `
    <div class="return-item ${agotado ? "unavailable" : ""}" data-item="${item.id}">
      <input type="checkbox" data-check="${item.id}" ${agotado ? "disabled" : ""}
             style="width:18px; height:18px; accent-color:var(--ink);" aria-label="Seleccionar ${item.product_name}">
      <div class="thumb">${productSvg(item.shape, item.color_hex)}</div>
      <div class="info">
        <div class="product-brand">${item.brand_name}</div>
        <strong style="font-size:0.93rem;">${item.product_name}</strong>
        <div class="cart-meta">${item.color_name} · Talla ${item.size}</div>
        ${
          agotado
            ? `<div class="cart-meta" style="color:var(--ink-faint);">Devolución ya solicitada</div>`
            : `<div class="cart-meta">Compraste ${item.quantity} · puedes devolver ${disponible}</div>`
        }
      </div>
      ${
        agotado
          ? ""
          : `<div class="qty-picker">
               <label for="qty-${item.id}">Unidades</label>
               <select id="qty-${item.id}" data-qty="${item.id}" ${disponible === 1 ? "disabled" : ""}>
                 ${opcionesCantidad.map((n) => `<option value="${n}">${n}</option>`).join("")}
               </select>
             </div>`
      }
    </div>`;
}

function wireSelection() {
  document.querySelectorAll("[data-check]").forEach((check) => {
    check.addEventListener("change", () => {
      const id = check.dataset.check;
      const fila = document.querySelector(`.return-item[data-item="${id}"]`);
      const selectQty = document.querySelector(`[data-qty="${id}"]`);

      if (check.checked) {
        seleccion[id] = Number(selectQty ? selectQty.value : 1);
        fila.classList.add("is-selected");
      } else {
        delete seleccion[id];
        fila.classList.remove("is-selected");
      }
      updateSubmitState();
    });
  });

  document.querySelectorAll("[data-qty]").forEach((select) => {
    select.addEventListener("change", () => {
      const id = select.dataset.qty;
      // Solo cuenta si la línea está marcada.
      if (seleccion[id] !== undefined) seleccion[id] = Number(select.value);
    });
  });
}

// El botón solo se activa cuando hay al menos un artículo marcado Y un motivo.
function updateSubmitState() {
  const hayArticulos = Object.keys(seleccion).length > 0;
  const hayMotivo = document.getElementById("reason").value !== "";
  document.getElementById("submit-return").disabled = !(hayArticulos && hayMotivo);
}

async function submitReturn() {
  const btn = document.getElementById("submit-return");
  const msg = document.getElementById("return-msg");
  msg.textContent = "";
  msg.className = "form-message";
  btn.disabled = true;
  btn.textContent = "Enviando…";

  const items = Object.entries(seleccion).map(([id, cantidad]) => ({
    order_item_id: Number(id),
    quantity: cantidad,
  }));

  try {
    await api("/returns", {
      method: "POST",
      body: JSON.stringify({ items, reason: document.getElementById("reason").value }),
    });
    toast("Solicitud de devolución enviada");
    window.location.href = "cuenta.html?seccion=devoluciones";
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("error");
    btn.disabled = false;
    btn.textContent = "Enviar solicitud";
  }
}

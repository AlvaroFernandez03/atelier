// js/admin.js
// Panel de administración. Cada sección se carga bajo demanda al pulsar su
// pestaña, en vez de pedirlo todo de golpe al abrir el panel.

let filtrosCatalogo = null; // categorías y marcas, para los formularios de producto

document.addEventListener("DOMContentLoaded", async () => {
  // Doble comprobación de acceso: aquí en el navegador para no cargar la
  // página en vano, y en el servidor (requireAdmin) para la seguridad real.
  if (!getToken()) {
    window.location.href = "acceso.html?next=admin.html";
    return;
  }
  const user = getUser();
  if (!user || user.role !== "admin") {
    document.getElementById("admin-content").innerHTML = `
      <div class="empty-state">
        <h3>Sin acceso</h3>
        <p>Esta zona es solo para la administración de la tienda.</p>
        <a class="btn btn-outline" href="index.html">Volver a la tienda</a>
      </div>`;
    return;
  }

  document.getElementById("admin-logout").addEventListener("click", (e) => {
    e.preventDefault();
    logout();
  });

  filtrosCatalogo = await api("/catalog/filters");
  renderShell();
  abrirSeccion("resumen");
});

function renderShell() {
  document.getElementById("admin-content").innerHTML = `
    <nav class="admin-nav" id="admin-nav">
      <button data-seccion="resumen" class="is-active">Resumen</button>
      <button data-seccion="pedidos">Pedidos</button>
      <button data-seccion="devoluciones">Devoluciones</button>
      <button data-seccion="productos">Productos</button>
      <button data-seccion="clientes">Clientes</button>
    </nav>

    <section id="sec-resumen" class="admin-panel-section is-active"></section>
    <section id="sec-pedidos" class="admin-panel-section"></section>
    <section id="sec-devoluciones" class="admin-panel-section"></section>
    <section id="sec-productos" class="admin-panel-section"></section>
    <section id="sec-clientes" class="admin-panel-section"></section>
  `;

  document.querySelectorAll("#admin-nav button").forEach((btn) => {
    btn.addEventListener("click", () => abrirSeccion(btn.dataset.seccion));
  });
}

function abrirSeccion(nombre) {
  document.querySelectorAll("#admin-nav button").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.seccion === nombre);
  });
  document.querySelectorAll(".admin-panel-section").forEach((s) => {
    s.classList.toggle("is-active", s.id === `sec-${nombre}`);
  });

  const cargadores = {
    resumen: cargarResumen,
    pedidos: cargarPedidos,
    devoluciones: cargarDevoluciones,
    productos: cargarProductos,
    clientes: cargarClientes,
  };
  cargadores[nombre]();
}

// ---------------------------------------------------------------------------
// RESUMEN
// ---------------------------------------------------------------------------
async function cargarResumen() {
  const el = document.getElementById("sec-resumen");
  el.innerHTML = `<p class="muted">Cargando…</p>`;

  try {
    const s = await api("/admin/summary");

    // Avisamos en la pestaña de devoluciones si hay alguna pendiente, para
    // que no haya que entrar a mirarlo.
    const btnDev = document.querySelector('[data-seccion="devoluciones"]');
    if (s.pending_returns > 0 && !btnDev.querySelector(".badge-count")) {
      btnDev.insertAdjacentHTML("beforeend", `<span class="badge-count">${s.pending_returns}</span>`);
    }

    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-box"><div class="value">${formatPrice(s.revenue_cents)}</div><div class="label">Ingresos totales</div></div>
        <div class="stat-box"><div class="value">${s.orders_today}</div><div class="label">Pedidos hoy</div></div>
        <div class="stat-box ${s.pending_orders > 0 ? "alert" : ""}"><div class="value">${s.pending_orders}</div><div class="label">Pedidos por enviar</div></div>
        <div class="stat-box ${s.pending_returns > 0 ? "alert" : ""}"><div class="value">${s.pending_returns}</div><div class="label">Devoluciones por revisar</div></div>
        <div class="stat-box"><div class="value">${s.customers}</div><div class="label">Clientes registrados</div></div>
        <div class="stat-box ${s.out_of_stock_variants > 0 ? "alert" : ""}"><div class="value">${s.out_of_stock_variants}</div><div class="label">Tallas agotadas</div></div>
      </div>

      <h3 style="margin-bottom:12px;">Stock bajo</h3>
      ${
        s.low_stock.length === 0
          ? `<p class="muted">Todo tiene existencias suficientes.</p>`
          : `<table class="admin-table">
              <thead><tr><th>Producto</th><th>Color y talla</th><th class="num">Quedan</th></tr></thead>
              <tbody>
                ${s.low_stock
                  .map(
                    (v) => `
                  <tr>
                    <td>${v.brand_name} · ${v.product_name}</td>
                    <td>${v.color_name} · ${v.size}</td>
                    <td class="num" style="color:${v.stock === 0 ? "var(--sale)" : "inherit"}; font-weight:600;">${v.stock}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
             </table>`
      }
    `;
  } catch (err) {
    el.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

// ---------------------------------------------------------------------------
// PEDIDOS
// ---------------------------------------------------------------------------
const ESTADOS_PEDIDO = {
  pagado: "Por enviar",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

async function cargarPedidos() {
  const el = document.getElementById("sec-pedidos");
  el.innerHTML = `<p class="muted">Cargando…</p>`;

  try {
    const pedidos = await api("/admin/orders");

    if (pedidos.length === 0) {
      el.innerHTML = `<div class="empty-state"><h3>Todavía no hay pedidos</h3></div>`;
      return;
    }

    el.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr><th>Nº</th><th>Cliente</th><th>Fecha</th><th class="num">Artículos</th><th class="num">Total</th><th>Estado</th><th>Cambiar a</th></tr>
        </thead>
        <tbody>
          ${pedidos.map(filaPedido).join("")}
        </tbody>
      </table>`;

    conectarCambiosEstado();
  } catch (err) {
    el.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

function filaPedido(o) {
  const fecha = new Date(o.created_at.replace(" ", "T")).toLocaleDateString("es-ES", {
    day: "2-digit", month: "short",
  });
  const claseEstado = o.status === "pagado" ? "" : o.status === "cancelado" ? "cancelado" : "pagado";

  return `
    <tr>
      <td><strong>${o.id}</strong></td>
      <td>${o.customer_name}<div class="muted" style="font-size:0.8rem;">${o.customer_email}</div></td>
      <td>${fecha}</td>
      <td class="num">${o.total_units}</td>
      <td class="num">${formatPrice(o.total_cents)}</td>
      <td><span class="status-badge ${claseEstado}">${ESTADOS_PEDIDO[o.status] || o.status}</span></td>
      <td>
        <select data-order="${o.id}" style="padding:5px 8px; border:1px solid var(--line); border-radius:var(--r-sm); font-family:var(--font); font-size:0.82rem;">
          ${Object.entries(ESTADOS_PEDIDO)
            .map(([k, v]) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${v}</option>`)
            .join("")}
        </select>
      </td>
    </tr>`;
}

function conectarCambiosEstado() {
  document.querySelectorAll("[data-order]").forEach((select) => {
    const original = select.value;
    select.addEventListener("change", async () => {
      // Cancelar devuelve el stock: conviene confirmarlo antes.
      if (select.value === "cancelado") {
        const ok = confirm("Al cancelar el pedido, sus artículos vuelven al stock. ¿Continuar?");
        if (!ok) {
          select.value = original;
          return;
        }
      }
      try {
        await api(`/admin/orders/${select.dataset.order}/status`, {
          method: "PUT",
          body: JSON.stringify({ status: select.value }),
        });
        toast("Estado del pedido actualizado");
        cargarPedidos();
      } catch (err) {
        toast(err.message);
        select.value = original;
      }
    });
  });
}

// ---------------------------------------------------------------------------
// DEVOLUCIONES
// ---------------------------------------------------------------------------
async function cargarDevoluciones() {
  const el = document.getElementById("sec-devoluciones");
  el.innerHTML = `<p class="muted">Cargando…</p>`;

  try {
    const devoluciones = await api("/returns");

    if (devoluciones.length === 0) {
      el.innerHTML = `<div class="empty-state"><h3>No hay devoluciones</h3></div>`;
      return;
    }

    el.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr><th></th><th>Artículo</th><th>Cliente</th><th>Motivo</th><th class="num">Importe</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>${devoluciones.map(filaDevolucion).join("")}</tbody>
      </table>`;

    conectarRevisionDevoluciones();
  } catch (err) {
    el.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

function filaDevolucion(d) {
  const pendiente = d.status === "solicitada";
  const claseEstado = d.status === "aceptada" ? "pagado" : d.status === "rechazada" ? "cancelado" : "";
  const etiqueta = { solicitada: "Pendiente", aceptada: "Aceptada", rechazada: "Rechazada" }[d.status];

  return `
    <tr>
      <td class="thumb-cell"><div>${productSvg(d.shape, d.color_hex)}</div></td>
      <td>
        <strong>${d.product_name}</strong>
        <div class="muted" style="font-size:0.8rem;">${d.color_name} · Talla ${d.size} · ${d.quantity} ud. · Pedido ${d.order_id}</div>
      </td>
      <td>${d.customer_name}<div class="muted" style="font-size:0.8rem;">${d.customer_email}</div></td>
      <td>${d.reason_label}</td>
      <td class="num">${formatPrice(d.unit_price_cents * d.quantity)}</td>
      <td><span class="status-badge ${claseEstado}">${etiqueta}</span></td>
      <td>
        ${
          pendiente
            ? `<div class="admin-actions">
                 <button class="btn btn-primary btn-sm" data-aceptar="${d.id}">Aceptar</button>
                 <button class="btn btn-outline btn-sm" data-rechazar="${d.id}">Rechazar</button>
               </div>`
            : `<span class="muted" style="font-size:0.82rem;">Revisada</span>`
        }
      </td>
    </tr>`;
}

function conectarRevisionDevoluciones() {
  document.querySelectorAll("[data-aceptar]").forEach((btn) => {
    btn.addEventListener("click", () => revisarDevolucion(btn.dataset.aceptar, "aceptada"));
  });
  document.querySelectorAll("[data-rechazar]").forEach((btn) => {
    btn.addEventListener("click", () => revisarDevolucion(btn.dataset.rechazar, "rechazada"));
  });
}

async function revisarDevolucion(id, status) {
  try {
    await api(`/returns/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
    toast(status === "aceptada" ? "Devolución aceptada, stock repuesto" : "Devolución rechazada");
    cargarDevoluciones();
    // El contador de la pestaña puede haber cambiado.
    const badge = document.querySelector('[data-seccion="devoluciones"] .badge-count');
    if (badge) badge.remove();
    cargarResumen();
  } catch (err) {
    toast(err.message);
  }
}

// ---------------------------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------------------------
async function cargarClientes() {
  const el = document.getElementById("sec-clientes");
  el.innerHTML = `<p class="muted">Cargando…</p>`;

  try {
    const clientes = await api("/admin/customers");

    if (clientes.length === 0) {
      el.innerHTML = `<div class="empty-state"><h3>Todavía no hay clientes registrados</h3></div>`;
      return;
    }

    el.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Cliente</th><th>Alta</th><th class="num">Pedidos</th><th class="num">Total gastado</th></tr></thead>
        <tbody>
          ${clientes
            .map((c) => {
              const alta = new Date(c.created_at.replace(" ", "T")).toLocaleDateString("es-ES", {
                day: "2-digit", month: "short", year: "numeric",
              });
              return `
                <tr>
                  <td>${c.name}<div class="muted" style="font-size:0.8rem;">${c.email}</div></td>
                  <td>${alta}</td>
                  <td class="num">${c.order_count}</td>
                  <td class="num">${formatPrice(c.spent_cents)}</td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;
  } catch (err) {
    el.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

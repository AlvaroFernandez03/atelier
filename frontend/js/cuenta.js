// js/cuenta.js
const ESTADOS_PEDIDO = {
  pagado: "Confirmado",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

document.addEventListener("DOMContentLoaded", async () => {
  await renderHeader();

  if (!getToken()) {
    window.location.href = "acceso.html?next=cuenta.html";
    return;
  }

  const user = getUser();
  if (user) {
    document.getElementById("account-name").textContent = `Hola, ${user.name.split(" ")[0]}`;
    document.getElementById("account-email").textContent = user.email;
  }

  document.getElementById("logout-btn").addEventListener("click", logout);

  // Pestañas del área de cliente. Cada una carga su contenido la primera vez
  // que se abre, para no pedirlo todo de golpe al entrar.
  const SECCIONES = ["pedidos", "devoluciones", "favoritos", "ajustes"];
  const cargadores = {
    pedidos: loadOrders,
    devoluciones: loadReturns,
    favoritos: loadFavorites,
    ajustes: renderSettings,
  };
  const contenedores = {
    pedidos: "orders-list",
    devoluciones: "returns-list",
    favoritos: "favorites-list",
    ajustes: "settings-panel",
  };
  const yaCargadas = new Set();

  function mostrar(seccion) {
    SECCIONES.forEach((s) => {
      document.getElementById(`tab-${s}`).classList.toggle("is-active", s === seccion);
      document.getElementById(contenedores[s]).classList.toggle("hidden", s !== seccion);
    });
    if (!yaCargadas.has(seccion)) {
      yaCargadas.add(seccion);
      cargadores[seccion]();
    }
  }

  SECCIONES.forEach((s) => {
    document.getElementById(`tab-${s}`).addEventListener("click", () => mostrar(s));
  });

  // La sección de pedidos se abre por defecto.
  yaCargadas.add("pedidos");
  loadOrders();

  // Si venimos de enviar una devolución, abrimos esa pestaña directamente.
  const seccionInicial = new URLSearchParams(location.search).get("seccion");
  if (seccionInicial && SECCIONES.includes(seccionInicial)) {
    mostrar(seccionInicial);
  }
});

const ESTADOS_DEVOLUCION = {
  solicitada: "Pendiente de revisar",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
};

async function loadReturns() {
  const list = document.getElementById("returns-list");

  try {
    const devoluciones = await api("/returns/me");

    if (devoluciones.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="padding:48px 20px;">
          <h3>No tienes devoluciones</h3>
          <p>Puedes solicitar una desde el detalle de cualquier pedido reciente.</p>
        </div>`;
      return;
    }

    list.innerHTML = devoluciones.map(returnRow).join("");
  } catch (err) {
    list.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

function returnRow(d) {
  const fecha = new Date(d.requested_at.replace(" ", "T")).toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric",
  });
  const claseEstado =
    d.status === "aceptada" ? "pagado" : d.status === "rechazada" ? "cancelado" : "";

  return `
    <div class="return-row">
      <div class="thumb">${productSvg(d.shape, d.color_hex)}</div>
      <div style="flex:1; min-width:170px;">
        <div class="product-brand">${d.brand_name}</div>
        <strong style="font-size:0.93rem;">${d.product_name}</strong>
        <div class="cart-meta">
          ${d.color_name} · Talla ${d.size} · ${d.quantity} ud. · Pedido nº ${d.order_id}
        </div>
        <div class="cart-meta">Motivo: ${d.reason_label} · Solicitada el ${fecha}</div>
      </div>
      <span class="status-badge ${claseEstado}">${ESTADOS_DEVOLUCION[d.status] || d.status}</span>
      <strong class="num">${formatPrice(d.unit_price_cents * d.quantity)}</strong>
    </div>`;
}

async function loadOrders() {
  const list = document.getElementById("orders-list");

  try {
    const orders = await api("/orders");

    if (orders.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="padding:48px 20px;">
          <h3>Todavía no has hecho ningún pedido</h3>
          <p>Cuando compres algo, aparecerá aquí.</p>
          <a class="btn btn-primary" href="catalogo.html">Ver el catálogo</a>
        </div>`;
      return;
    }

    list.innerHTML = orders.map(orderCard).join("");
  } catch (err) {
    list.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

function orderCard(order) {
  const fecha = new Date(order.created_at.replace(" ", "T")).toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric",
  });

  return `
    <a class="order-card" href="pedido.html?id=${order.id}">
      <div class="order-thumbs">
        ${order.preview_items
          .map((i) => `<div class="t" title="${i.product_name}">${productSvg(i.shape, i.color_hex)}</div>`)
          .join("")}
      </div>
      <div class="meta">
        <strong>Pedido nº ${order.id}</strong>
        <div class="cart-meta">${fecha} · ${order.total_units} ${order.total_units === 1 ? "artículo" : "artículos"}</div>
      </div>
      <span class="status-badge">${ESTADOS_PEDIDO[order.status] || order.status}</span>
      <strong class="num">${formatPrice(order.total_cents)}</strong>
    </a>`;
}

// ---------------------------------------------------------------------------
// FAVORITOS
// ---------------------------------------------------------------------------
async function loadFavorites() {
  const list = document.getElementById("favorites-list");
  list.innerHTML = `<p class="muted">Cargando…</p>`;

  await cargarFavoritos();

  try {
    const favoritos = await api("/favorites");

    if (favoritos.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="padding:48px 20px;">
          <h3>No tienes favoritos todavía</h3>
          <p>Pulsa el corazón de cualquier producto para guardarlo aquí.</p>
          <a class="btn btn-primary" href="catalogo.html">Ver el catálogo</a>
        </div>`;
      return;
    }

    list.innerHTML = `<div class="product-grid">${favoritos.map(tarjetaFavorito).join("")}</div>`;

    // Al quitar un favorito desde aquí, la tarjeta debe desaparecer: no tiene
    // sentido dejarla en una lista de "mis favoritos" si ya no lo es.
    conectarFavoritos((productId, guardado) => {
      if (!guardado) {
        const tarjeta = document.querySelector(`#favorites-list [data-producto="${productId}"]`);
        if (tarjeta) tarjeta.remove();
        if (document.querySelectorAll("#favorites-list .product-card").length === 0) {
          loadFavorites();
        }
      }
    });
  } catch (err) {
    list.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

function tarjetaFavorito(p) {
  const disponibles = p.colors.filter((c) => c.color_stock > 0);
  const mostrado = disponibles[0] || p.colors[0];
  const agotado = p.total_stock === 0;

  return `
    <a class="product-card" href="producto.html?id=${p.id}" data-producto="${p.id}">
      <div class="product-media">
        ${agotado ? '<span class="product-flag agotado">Agotado</span>' : ""}
        ${botonFavorito(p.id)}
        ${productMedia(p, mostrado ? mostrado.color_hex : "#CCC")}
      </div>
      <div class="product-info">
        <div class="product-brand">${p.brand_name}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-price">${formatPrice(p.price_cents)}</div>
      </div>
    </a>`;
}

// ---------------------------------------------------------------------------
// AJUSTES DE LA CUENTA
// ---------------------------------------------------------------------------
async function renderSettings() {
  const panel = document.getElementById("settings-panel");
  const user = getUser();

  panel.innerHTML = `
    <div class="account-settings">
      <div class="settings-block">
        <h3>Tus datos</h3>
        <p class="hint">El nombre aparecerá en tus pedidos.</p>
        <div class="field">
          <label for="set-name">Nombre</label>
          <input type="text" id="set-name" value="${user ? user.name : ""}">
        </div>
        <div class="field">
          <label for="set-email">Email</label>
          <input type="email" id="set-email" value="${user ? user.email : ""}" disabled>
        </div>
        <button id="save-name" class="btn btn-outline">Guardar nombre</button>
        <p id="name-msg" class="form-message"></p>
      </div>

      <div class="settings-block">
        <h3>Cambiar contraseña</h3>
        <p class="hint">Te pedimos la actual por seguridad.</p>
        <div class="field">
          <label for="set-current">Contraseña actual</label>
          <input type="password" id="set-current" autocomplete="current-password">
        </div>
        <div class="field">
          <label for="set-new">Nueva contraseña (mín. 6 caracteres)</label>
          <input type="password" id="set-new" minlength="6" autocomplete="new-password">
        </div>
        <div class="field">
          <label for="set-confirm">Repite la nueva contraseña</label>
          <input type="password" id="set-confirm" minlength="6" autocomplete="new-password">
        </div>
        <button id="save-password" class="btn btn-primary">Cambiar contraseña</button>
        <p id="password-msg" class="form-message"></p>
      </div>
    </div>`;

  document.getElementById("save-name").addEventListener("click", guardarNombre);
  document.getElementById("save-password").addEventListener("click", cambiarPassword);
}

async function guardarNombre() {
  const msg = document.getElementById("name-msg");
  msg.textContent = "";
  msg.className = "form-message";

  const nombre = document.getElementById("set-name").value.trim();
  if (!nombre) {
    msg.textContent = "El nombre no puede estar vacío.";
    msg.classList.add("error");
    return;
  }

  try {
    const res = await api("/account/name", { method: "PUT", body: JSON.stringify({ name: nombre }) });
    // Actualizamos también la copia guardada en el navegador, para que la
    // cabecera y el saludo cambien al momento sin recargar.
    const user = getUser();
    if (user) {
      user.name = res.name;
      localStorage.setItem("tienda_user", JSON.stringify(user));
      document.getElementById("account-name").textContent = `Hola, ${res.name.split(" ")[0]}`;
    }
    msg.textContent = "Nombre actualizado.";
    msg.classList.add("success");
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("error");
  }
}

async function cambiarPassword() {
  const msg = document.getElementById("password-msg");
  const btn = document.getElementById("save-password");
  msg.textContent = "";
  msg.className = "form-message";

  const actual = document.getElementById("set-current").value;
  const nueva = document.getElementById("set-new").value;
  const repetida = document.getElementById("set-confirm").value;

  if (!actual || !nueva) {
    msg.textContent = "Rellena tu contraseña actual y la nueva.";
    msg.classList.add("error");
    return;
  }
  if (nueva !== repetida) {
    msg.textContent = "La nueva contraseña y su repetición no coinciden.";
    msg.classList.add("error");
    return;
  }

  btn.disabled = true;
  try {
    await api("/account/password", {
      method: "PUT",
      body: JSON.stringify({ current_password: actual, new_password: nueva }),
    });
    msg.textContent = "Contraseña cambiada correctamente.";
    msg.classList.add("success");
    document.getElementById("set-current").value = "";
    document.getElementById("set-new").value = "";
    document.getElementById("set-confirm").value = "";
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("error");
  } finally {
    btn.disabled = false;
  }
}

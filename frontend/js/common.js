// js/common.js
const API = "/api";

// ---------------------------------------------------------------------------
// Sesión y token de invitado
// ---------------------------------------------------------------------------
function getToken() { return localStorage.getItem("tienda_token"); }
function getUser() {
  const raw = localStorage.getItem("tienda_user");
  return raw ? JSON.parse(raw) : null;
}
function saveSession(token, user) {
  localStorage.setItem("tienda_token", token);
  localStorage.setItem("tienda_user", JSON.stringify(user));
  // El carrito de invitado ya se ha fusionado con la cuenta en el servidor,
  // así que el token de invitado deja de hacer falta.
  localStorage.removeItem("tienda_guest");
}
function logout() {
  localStorage.removeItem("tienda_token");
  localStorage.removeItem("tienda_user");
  window.location.href = "index.html";
}

// Identificador para el carrito de quien todavía no tiene cuenta. Se crea la
// primera vez que hace falta y vive en el navegador, igual que una sesión.
function getGuestToken() {
  let t = localStorage.getItem("tienda_guest");
  if (!t) {
    t = "g_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("tienda_guest", t);
  }
  return t;
}

async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  // El token de invitado va siempre: el backend lo usa solo si no hay sesión.
  if (!token) headers["X-Guest-Token"] = getGuestToken();

  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Algo ha ido mal. Inténtalo de nuevo.");
  return data;
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------
// Los precios se guardan en céntimos; aquí los pasamos a euros con el formato
// español (coma decimal y símbolo detrás).
function formatPrice(cents) {
  return (cents / 100).toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Cabecera compartida: se inyecta en todas las páginas desde aquí, así no hay
// que mantener el mismo HTML copiado en cada archivo.
// ---------------------------------------------------------------------------
async function renderHeader(currentCategory = null) {
  const mount = document.getElementById("site-header");
  if (!mount) return;

  const user = getUser();
  const accountLink = user
    ? `<a href="cuenta.html">${user.name.split(" ")[0]}</a>`
    : `<a href="acceso.html">Iniciar sesión</a>`;
  // El acceso al panel solo se muestra a la administración de la tienda.
  const adminLink = user && user.role === "admin"
    ? `<a href="admin.html" style="font-weight:500;">Panel</a>`
    : "";

  mount.innerHTML = `
    <div class="notice-bar">
      <span>Envío gratis desde 50 €</span><span class="sep">·</span><span>Entregas en 24-48 h</span><span class="sep">·</span><span>30 días para devolver</span>
    </div>
    <div class="container header-top">
      <a href="index.html" class="brand">Atelier</a>
      <div class="header-search">
        <input type="search" id="header-search-input" placeholder="Buscar prendas, marcas…"
               value="${new URLSearchParams(location.search).get("search") || ""}">
      </div>
      <div class="header-actions">
        ${adminLink}
        ${accountLink}
        <a href="carrito.html" class="cart-link">
          Carrito <span class="cart-count empty" id="cart-count">0</span>
        </a>
      </div>
    </div>
    <nav class="category-nav">
      <div class="container">
        <ul id="category-nav-list"></ul>
      </div>
    </nav>
  `;

  // Buscar al pulsar Enter
  document.getElementById("header-search-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const term = e.target.value.trim();
      window.location.href = term ? `catalogo.html?search=${encodeURIComponent(term)}` : "catalogo.html";
    }
  });

  // Categorías de la barra de navegación
  try {
    const { categories } = await api("/catalog/filters");
    const list = document.getElementById("category-nav-list");
    list.innerHTML =
      `<li><a href="catalogo.html" class="${!currentCategory ? "is-current" : ""}">Todo</a></li>` +
      categories
        .map(
          (c) =>
            `<li><a href="catalogo.html?category=${c.slug}" class="${
              currentCategory === c.slug ? "is-current" : ""
            }">${c.name}</a></li>`
        )
        .join("");
  } catch (_) {
    // Si falla, la cabecera sigue siendo usable sin las categorías.
  }

  refreshCartCount();
  renderFooter();
}

// Actualiza el número que aparece junto a "Carrito" en la cabecera.
async function refreshCartCount() {
  const el = document.getElementById("cart-count");
  if (!el) return;
  try {
    const cart = await api("/cart");
    el.textContent = cart.total_units;
    el.classList.toggle("empty", cart.total_units === 0);
  } catch (_) {
    el.classList.add("empty");
  }
}

// ---------------------------------------------------------------------------
// Aviso flotante (para confirmar acciones sin interrumpir con un alert)
// ---------------------------------------------------------------------------
function toast(message) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  // Forzamos un reflow para que la animación se reinicie si ya estaba visible.
  void el.offsetWidth;
  el.classList.add("is-visible");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("is-visible"), 2600);
}

// ---------------------------------------------------------------------------
// Pie de página compartido
// ---------------------------------------------------------------------------
// Igual que la cabecera, se inyecta desde aquí para no repetir el mismo
// bloque en cada archivo HTML.
function renderFooter() {
  const mount = document.getElementById("site-footer");
  if (!mount) return;

  mount.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="footer-brand">Atelier</div>
          <p>Ropa de calle bien hecha, en tallas de la XS a la XL y del 35 al 47. Sin temporadas imposibles ni tallas que solo le valen a dos personas.</p>
        </div>
        <div>
          <h4>Comprar</h4>
          <ul>
            <li><a href="catalogo.html">Todo el catálogo</a></li>
            <li><a href="catalogo.html?category=camisetas">Camisetas</a></li>
            <li><a href="catalogo.html?category=sudaderas">Sudaderas</a></li>
            <li><a href="catalogo.html?category=zapatillas">Zapatillas</a></li>
          </ul>
        </div>
        <div>
          <h4>Tu cuenta</h4>
          <ul>
            <li><a href="cuenta.html">Mis pedidos</a></li>
            <li><a href="cuenta.html?seccion=devoluciones">Devoluciones</a></li>
            <li><a href="cuenta.html?seccion=favoritos">Favoritos</a></li>
          </ul>
        </div>
        <div>
          <h4>Ayuda</h4>
          <ul>
            <li><a href="catalogo.html">Guía de tallas</a></li>
            <li><a href="cuenta.html?seccion=devoluciones">Cómo devolver</a></li>
            <li><a href="index.html">Envíos</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>Atelier · Proyecto de práctica y portfolio</span>
        <span>Marcas y productos ficticios</span>
      </div>
    </div>`;
}

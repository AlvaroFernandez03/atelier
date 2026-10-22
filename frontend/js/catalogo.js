// js/catalogo.js

// El estado de los filtros vive en la URL (?category=camisetas&size=M...).
// Así el usuario puede copiar el enlace, compartirlo o volver atrás con el
// botón del navegador y encontrarse lo mismo que estaba viendo.
const params = new URLSearchParams(location.search);

const state = {
  search: params.get("search") || "",
  category: params.get("category") || "",
  brand: params.get("brand") || "",
  size: params.get("size") || "",
  color: params.get("color") || "",
  max_price: params.get("max_price") || "",
  sort: params.get("sort") || "novedades",
};

let filterData = null;

document.addEventListener("DOMContentLoaded", async () => {
  await renderHeader(state.category);
  iniciarAsistente();
  filterData = await api("/catalog/filters");
  await cargarFavoritos();
  renderFilters();
  await loadProducts();

  document.getElementById("sort-select").value = state.sort;
  document.getElementById("sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    applyChange();
  });

  const range = document.getElementById("price-range");
  if (state.max_price) range.value = state.max_price;
  document.getElementById("price-label").textContent = `${range.value} €`;
  range.addEventListener("input", (e) => {
    document.getElementById("price-label").textContent = `${e.target.value} €`;
  });
  // Solo recargamos al soltar el control, no en cada píxel que se arrastra.
  range.addEventListener("change", (e) => {
    state.max_price = e.target.value === "150" ? "" : e.target.value;
    applyChange();
  });

  document.getElementById("clear-filters").addEventListener("click", () => {
    window.location.href = "catalogo.html";
  });
});

// Vuelve a cargar con los filtros actuales y actualiza la URL sin recargar
// la página entera (history.replaceState).
function applyChange() {
  const q = new URLSearchParams();
  Object.entries(state).forEach(([k, v]) => {
    if (v && !(k === "sort" && v === "novedades")) q.set(k, v);
  });
  const qs = q.toString();
  history.replaceState(null, "", qs ? `catalogo.html?${qs}` : "catalogo.html");
  loadProducts();
}

function renderFilters() {
  // Marcas
  document.getElementById("brand-filters").innerHTML = filterData.brands
    .map(
      (b) => `
      <label>
        <input type="radio" name="brand" value="${b.slug}" ${state.brand === b.slug ? "checked" : ""}>
        ${b.name}
      </label>`
    )
    .join("");
  document.querySelectorAll('input[name="brand"]').forEach((input) => {
    input.addEventListener("change", (e) => {
      // Volver a pulsar la marca ya elegida la quita: es más cómodo que
      // obligar a ir al botón de "quitar filtros" para deseleccionar una.
      state.brand = state.brand === e.target.value ? "" : e.target.value;
      if (!state.brand) e.target.checked = false;
      applyChange();
    });
  });

  // Tallas: primero las de letra (ropa), luego las numéricas (calzado)
  const { letters, numeric } = filterData.sizes;
  document.getElementById("size-filters").innerHTML = `
    <div class="size-chips" style="margin-bottom:8px;">
      ${letters.map((s) => sizeChip(s)).join("")}
    </div>
    <div class="size-chips">
      ${numeric.map((s) => sizeChip(s)).join("")}
    </div>
  `;
  document.querySelectorAll(".size-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.size = state.size === chip.dataset.size ? "" : chip.dataset.size;
      renderFilters();
      applyChange();
    });
  });

  // Colores
  document.getElementById("color-filters").innerHTML = filterData.colors
    .map(
      (c) => `
      <button class="color-swatch ${state.color === c.color_name ? "is-active" : ""}"
              style="background:${c.color_hex}" title="${c.color_name}"
              data-color="${c.color_name}" aria-label="${c.color_name}"></button>`
    )
    .join("");
  document.querySelectorAll(".color-swatch").forEach((sw) => {
    sw.addEventListener("click", () => {
      state.color = state.color === sw.dataset.color ? "" : sw.dataset.color;
      renderFilters();
      applyChange();
    });
  });
}

function sizeChip(size) {
  return `<button class="size-chip ${state.size === size ? "is-active" : ""}" data-size="${size}">${size}</button>`;
}

async function loadProducts() {
  const grid = document.getElementById("product-grid");
  const empty = document.getElementById("empty-results");
  grid.innerHTML = "";

  const q = new URLSearchParams();
  Object.entries(state).forEach(([k, v]) => { if (v) q.set(k, v); });

  try {
    const products = await api(`/catalog/products?${q.toString()}`);

    // Título de la página según el filtro activo
    const title = document.getElementById("catalog-title");
    if (state.search) title.textContent = `Resultados para "${state.search}"`;
    else if (state.category) {
      const cat = filterData.categories.find((c) => c.slug === state.category);
      title.textContent = cat ? cat.name : "Catálogo";
    } else title.textContent = "Todo el catálogo";

    document.getElementById("result-count").textContent =
      products.length === 1 ? "1 artículo" : `${products.length} artículos`;

    empty.classList.toggle("hidden", products.length > 0);

    grid.innerHTML = products.map(productCard).join("");
    conectarFavoritos();
  } catch (err) {
    grid.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

function productCard(p) {
  // La ilustración usa el primer color que tenga stock; si están todos
  // agotados, usamos el primero igualmente para no dejar el hueco vacío.
  const available = p.colors.filter((c) => c.color_stock > 0);
  const shown = available[0] || p.colors[0];
  const soldOut = p.total_stock === 0;

  return `
    <a class="product-card" href="producto.html?id=${p.id}">
      <div class="product-media">
        ${soldOut ? '<span class="product-flag agotado">Agotado</span>' : ""}
        ${botonFavorito(p.id)}
        ${productMedia(p, shown ? shown.color_hex : "#CCC")}
      </div>
      <div class="product-info">
        <div class="product-brand">${p.brand_name}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-price">${formatPrice(p.price_cents)}</div>
        <div class="product-colors">
          ${p.colors.slice(0, 5).map((c) => `<span style="background:${c.color_hex}" title="${c.color_name}"></span>`).join("")}
          ${p.colors.length > 5 ? `<span style="border:none; font-size:0.72rem; color:var(--ink-faint);">+${p.colors.length - 5}</span>` : ""}
        </div>
      </div>
    </a>
  `;
}

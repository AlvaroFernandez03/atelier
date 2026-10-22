// js/inicio.js

// Cada categoría tiene su color fijo en toda la tienda: así el cliente
// aprende a reconocerlas de un vistazo, y el color informa en vez de decorar.
const CATEGORIA_ESTILO = {
  camisetas:  { shape: "camiseta",  color: "#2D3CE0", prenda: "#C9CEFA" },
  sudaderas:  { shape: "sudadera",  color: "#F04E23", prenda: "#FBD3C6" },
  pantalones: { shape: "pantalon",  color: "#6C3FD6", prenda: "#D6C6F5" },
  chaquetas:  { shape: "chaqueta",  color: "#3F8F4A", prenda: "#C8E3CD" },
  zapatillas: { shape: "zapatilla", color: "#141414", prenda: "#E8E8E4" },
  botas:      { shape: "bota",      color: "#F5B921", prenda: "#8A5B0F", oscuro: true },
};

document.addEventListener("DOMContentLoaded", async () => {
  await renderHeader();
  await cargarFavoritos();
  iniciarAsistente();

  cargarMosaico();
  cargarNovedades();
});

async function cargarMosaico() {
  const cont = document.getElementById("hero-mosaic");
  if (!cont) return;

  try {
    const { categories } = await api("/catalog/filters");

    // Bloque de mensaje: no es una categoría, es la voz de la tienda.
    // El bloque de mensaje ocupa una columna entera de alto; las seis
    // categorías rellenan justo las seis celdas restantes de la rejilla.
    const bloques = [
      `<a class="mosaic-tile statement tall" href="catalogo.html" style="background:#141414">
         <span class="label">Ropa que aguanta el lavado número cincuenta</span>
         <span class="sub">Básicos bien hechos, en tallas de verdad.</span>
       </a>`,
    ];

    categories.forEach((cat) => {
      const estilo = CATEGORIA_ESTILO[cat.slug] || { shape: "camiseta", color: "#55554F", prenda: "#DDD" };
      bloques.push(`
        <a class="mosaic-tile ${estilo.oscuro ? "dark-text" : ""}" href="catalogo.html?category=${cat.slug}"
           style="background:${estilo.color}">
          <span class="label">${cat.name}</span>
          <div class="art">${productSvg(estilo.shape, estilo.prenda)}</div>
        </a>`);
    });

    cont.innerHTML = bloques.join("");
  } catch (err) {
    cont.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

async function cargarNovedades() {
  const grid = document.getElementById("featured-grid");
  try {
    const products = await api("/catalog/products?sort=novedades");
    grid.innerHTML = products.slice(0, 8).map(productCard).join("");
    conectarFavoritos();
  } catch (err) {
    grid.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

function productCard(p) {
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
        </div>
      </div>
    </a>`;
}

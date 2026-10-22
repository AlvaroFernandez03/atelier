// js/producto.js
const productId = new URLSearchParams(location.search).get("id");

let product = null;
let selectedColor = null;   // objeto de color elegido
let selectedVariant = null; // variante concreta (color + talla) elegida
let cantidad = 1;           // unidades a añadir al carrito

document.addEventListener("DOMContentLoaded", async () => {
  if (!productId) {
    window.location.href = "catalogo.html";
    return;
  }

  try {
    product = await api(`/catalog/products/${productId}`);
  } catch (err) {
    document.getElementById("product-detail").innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <h3>No hemos encontrado este producto</h3>
        <p>${err.message}</p>
        <a class="btn btn-outline" href="catalogo.html">Volver al catálogo</a>
      </div>`;
    await renderHeader();
    return;
  }

  await renderHeader(product.category_slug);
  await cargarFavoritos();
  // El asistente sabe qué producto se está viendo, para poder responder
  // sobre su talla, su stock y su material.
  iniciarAsistente(product.id);
  cargarRelacionados(product.id);
  cargarResenas(product.id);

  // Empezamos con el primer color que tenga alguna talla disponible.
  selectedColor =
    product.colors.find((c) => c.sizes.some((s) => s.stock > 0)) || product.colors[0];

  render();
});

function render() {
  const totalStock = selectedColor.sizes.reduce((s, x) => s + x.stock, 0);

  document.getElementById("product-detail").innerHTML = `
    <div class="detail-media">
      ${productMedia(product, selectedColor.color_hex)}
    </div>

    <div class="detail-info">
      <div class="detail-brand">${product.brand_name}</div>
      <div class="detail-title-row">
        <h1 class="detail-name">${product.name}</h1>
        ${botonFavorito(product.id, { inline: true })}
      </div>
      <div class="detail-price">${formatPrice(product.price_cents)}</div>
      <p class="detail-desc">${product.description}</p>

      <div class="option-block">
        <div class="option-label">
          <span>Color</span>
          <span class="chosen">${selectedColor.color_name}</span>
        </div>
        <div class="color-options">
          ${product.colors
            .map(
              (c) => `
            <button class="color-option ${c.color_name === selectedColor.color_name ? "is-active" : ""}"
                    style="background:${c.color_hex}" data-color="${c.color_name}"
                    title="${c.color_name}" aria-label="Color ${c.color_name}"></button>`
            )
            .join("")}
        </div>
      </div>

      <div class="option-block">
        <div class="option-label">
          <span>Talla</span>
          <span class="chosen" id="chosen-size">${selectedVariant ? selectedVariant.size : "Elige una"}</span>
        </div>
        <div class="size-grid">
          ${selectedColor.sizes
            .map(
              (s) => `
            <button class="size-btn ${selectedVariant && selectedVariant.variant_id === s.variant_id ? "is-active" : ""}"
                    data-variant="${s.variant_id}" data-size="${s.size}" data-stock="${s.stock}"
                    ${s.stock === 0 ? "disabled title='Sin existencias'" : ""}>${s.size}</button>`
            )
            .join("")}
        </div>
        <div id="stock-note" class="stock-note"></div>
      </div>

      <div class="option-block">
        <div class="option-label">
          <span>Cantidad</span>
        </div>
        <div style="display:flex; align-items:center;">
          <div class="qty-selector">
            <button type="button" id="qty-menos" aria-label="Quitar una unidad">−</button>
            <span class="qty-value" id="qty-valor">${cantidad}</span>
            <button type="button" id="qty-mas" aria-label="Añadir una unidad">+</button>
          </div>
          <span class="qty-max-note" id="qty-nota"></span>
        </div>
      </div>

      <button id="add-to-cart" class="btn btn-primary btn-block" ${totalStock === 0 ? "disabled" : ""}>
        ${totalStock === 0 ? "Agotado en este color" : "Añadir al carrito"}
      </button>

      <p style="margin-top:18px; font-size:0.84rem; color:var(--ink-faint);">
        Envío gratis a partir de 50 €. Devoluciones durante 30 días.
      </p>
    </div>
  `;

  // Cambiar de color
  document.querySelectorAll(".color-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedColor = product.colors.find((c) => c.color_name === btn.dataset.color);
      // Al cambiar de color, la talla elegida deja de ser válida (es otra
      // variante distinta), así que la reseteamos junto con la cantidad.
      selectedVariant = null;
      cantidad = 1;
      render();
    });
  });

  // Elegir talla
  document.querySelectorAll(".size-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedVariant = {
        variant_id: Number(btn.dataset.variant),
        size: btn.dataset.size,
        stock: Number(btn.dataset.stock),
      };
      // Cada talla tiene su propio stock, así que empezamos de nuevo en 1
      // para no arrastrar una cantidad que quizá no esté disponible aquí.
      cantidad = 1;
      render();
    });
  });

  // Selector de cantidad
  document.getElementById("qty-menos").addEventListener("click", () => {
    if (cantidad > 1) {
      cantidad--;
      actualizarSelectorCantidad();
    }
  });
  document.getElementById("qty-mas").addEventListener("click", () => {
    const maximo = maximoDisponible();
    if (cantidad < maximo) {
      cantidad++;
      actualizarSelectorCantidad();
    }
  });

  updateStockNote();
  actualizarSelectorCantidad();
  conectarFavoritos();

  document.getElementById("add-to-cart").addEventListener("click", addToCart);
}

// Cuántas unidades se pueden pedir como máximo. Si aún no hay talla elegida,
// dejamos el selector en 1 hasta que elija una.
function maximoDisponible() {
  return selectedVariant ? selectedVariant.stock : 1;
}

function actualizarSelectorCantidad() {
  const valor = document.getElementById("qty-valor");
  const btnMenos = document.getElementById("qty-menos");
  const btnMas = document.getElementById("qty-mas");
  const nota = document.getElementById("qty-nota");
  if (!valor) return;

  const maximo = maximoDisponible();
  // Por si la talla anterior permitía más unidades que la actual.
  if (cantidad > maximo) cantidad = maximo;

  valor.textContent = cantidad;
  btnMenos.disabled = cantidad <= 1;
  btnMas.disabled = !selectedVariant || cantidad >= maximo;

  if (!selectedVariant) {
    nota.textContent = "Elige una talla";
  } else if (cantidad >= maximo) {
    nota.textContent = `Máximo disponible: ${maximo}`;
  } else {
    nota.textContent = "";
  }
}

function updateStockNote() {
  const note = document.getElementById("stock-note");
  if (!note) return;

  if (!selectedVariant) {
    note.textContent = "";
    return;
  }
  if (selectedVariant.stock <= 3) {
    note.textContent = `Quedan ${selectedVariant.stock} unidades`;
    note.className = "stock-note low";
  } else {
    note.textContent = "Disponible";
    note.className = "stock-note ok";
  }
}

async function addToCart() {
  if (!selectedVariant) {
    toast("Elige una talla primero");
    return;
  }

  const btn = document.getElementById("add-to-cart");
  btn.disabled = true;

  try {
    const respuesta = await api("/cart/items", {
      method: "POST",
      body: JSON.stringify({ variant_id: selectedVariant.variant_id, quantity: cantidad }),
    });

    // El backend avisa si no cabían todas las unidades pedidas.
    if (respuesta.notice) {
      toast(respuesta.notice);
    } else {
      const unidades = cantidad === 1 ? "" : ` (${cantidad} uds.)`;
      toast(`${product.name} · talla ${selectedVariant.size}${unidades} añadido al carrito`);
    }

    // Dejamos el selector en 1 para la siguiente vez, que es lo esperable
    // tras completar la acción.
    cantidad = 1;
    actualizarSelectorCantidad();
    refreshCartCount();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
}


// ---------------------------------------------------------------------------
// PRODUCTOS RELACIONADOS
// ---------------------------------------------------------------------------
// Se cargan aparte, después de pintar el producto principal: así la ficha se
// ve al momento sin esperar a esta consulta, que es secundaria.
async function cargarRelacionados(productId) {
  const seccion = document.getElementById("related-section");
  if (!seccion) return;

  try {
    const relacionados = await api(`/catalog/products/${productId}/related`);
    if (relacionados.length === 0) return;

    seccion.innerHTML = `
      <h2>También te puede interesar</h2>
      <div class="product-grid">
        ${relacionados.map(tarjetaRelacionado).join("")}
      </div>`;
    seccion.classList.remove("hidden");

    conectarFavoritos();
  } catch (_) {
    // Si falla, la ficha sigue siendo perfectamente usable sin esta sección.
  }
}

function tarjetaRelacionado(p) {
  const disponibles = p.colors.filter((c) => c.color_stock > 0);
  const mostrado = disponibles[0] || p.colors[0];
  const agotado = p.total_stock === 0;

  return `
    <a class="product-card" href="producto.html?id=${p.id}">
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

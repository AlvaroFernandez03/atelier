// js/admin-productos.js
// Sección de productos del panel. Va aparte de admin.js porque es la parte
// más extensa: listado, control de stock por variante y alta de productos.

const TALLAS_ROPA = ["XS", "S", "M", "L", "XL"];
const TALLAS_CALZADO = ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47"];
const SILUETAS = ["camiseta", "sudadera", "pantalon", "chaqueta", "zapatilla", "bota"];

const COLORES_DISPONIBLES = [
  { name: "Negro", hex: "#1F1F23" },
  { name: "Blanco", hex: "#F2F0EC" },
  { name: "Gris jaspeado", hex: "#9CA0A8" },
  { name: "Azul marino", hex: "#26334D" },
  { name: "Verde oliva", hex: "#5C6B4A" },
  { name: "Beige", hex: "#C9B79C" },
  { name: "Burdeos", hex: "#6E2733" },
  { name: "Celeste", hex: "#8FB3CC" },
  { name: "Mostaza", hex: "#C99A3B" },
  { name: "Rosa palo", hex: "#D9A7A7" },
];

async function cargarProductos() {
  const el = document.getElementById("sec-productos");
  el.innerHTML = `<p class="muted">Cargando…</p>`;

  try {
    const productos = await api("/admin/products");

    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
        <h3 style="margin:0;">Productos (${productos.length})</h3>
        <button id="btn-nuevo-producto" class="btn btn-primary btn-sm">Añadir producto</button>
      </div>

      <div id="form-nuevo" class="hidden" style="margin-bottom:24px;"></div>

      <table class="admin-table">
        <thead>
          <tr><th></th><th>Producto</th><th>Categoría</th><th class="num">Precio</th><th class="num">Stock</th><th></th></tr>
        </thead>
        <tbody>${productos.map(filaProducto).join("")}</tbody>
      </table>

      <div id="detalle-variantes" style="margin-top:24px;"></div>
    `;

    document.getElementById("btn-nuevo-producto").addEventListener("click", mostrarFormularioNuevo);
    document.querySelectorAll("[data-variantes]").forEach((btn) => {
      btn.addEventListener("click", () => verVariantes(btn.dataset.variantes, btn.dataset.nombre));
    });
  } catch (err) {
    el.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

function filaProducto(p) {
  return `
    <tr style="${p.active ? "" : "opacity:.5;"}">
      <td class="thumb-cell"><div>${productSvg(p.shape, "#9CA0A8")}</div></td>
      <td>
        <strong>${p.name}</strong>
        <div class="muted" style="font-size:0.8rem;">${p.brand_name}${p.active ? "" : " · desactivado"}</div>
      </td>
      <td>${p.category_name}</td>
      <td class="num">${formatPrice(p.price_cents)}</td>
      <td class="num" style="${p.total_stock === 0 ? "color:var(--sale); font-weight:600;" : ""}">${p.total_stock}</td>
      <td>
        <button class="btn btn-outline btn-sm" data-variantes="${p.id}" data-nombre="${p.name}">
          Ver tallas (${p.variant_count})
        </button>
      </td>
    </tr>`;
}

// ---------------------------------------------------------------------------
// Control de stock por variante
// ---------------------------------------------------------------------------
async function verVariantes(productId, nombre) {
  const el = document.getElementById("detalle-variantes");
  el.innerHTML = `<p class="muted">Cargando tallas…</p>`;

  try {
    const variantes = await api(`/admin/products/${productId}/variants`);

    el.innerHTML = `
      <h3 style="margin-bottom:4px;">${nombre}</h3>
      <p class="muted" style="font-size:0.86rem; margin-bottom:14px;">
        Cambia el stock y pulsa fuera del campo para guardar.
      </p>
      <table class="admin-table" style="max-width:620px;">
        <thead><tr><th>Color</th><th>Talla</th><th class="num">Stock</th></tr></thead>
        <tbody>
          ${variantes
            .map(
              (v) => `
            <tr>
              <td>
                <span style="display:inline-block; width:14px; height:14px; border-radius:50%;
                             background:${v.color_hex}; border:1px solid rgba(0,0,0,.15);
                             vertical-align:middle; margin-right:7px;"></span>
                ${v.color_name}
              </td>
              <td>${v.size}</td>
              <td class="num">
                <input type="number" min="0" value="${v.stock}"
                       class="stock-input ${v.stock === 0 ? "is-zero" : ""}"
                       data-variante="${v.id}">
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <div style="margin-top:14px;">
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('detalle-variantes').innerHTML=''">Cerrar</button>
      </div>
    `;

    // Guardamos al salir del campo (evento "change"), no en cada tecla.
    document.querySelectorAll("[data-variante]").forEach((input) => {
      const valorOriginal = input.value;
      input.addEventListener("change", async () => {
        try {
          await api(`/admin/variants/${input.dataset.variante}`, {
            method: "PUT",
            body: JSON.stringify({ stock: Number(input.value) }),
          });
          input.classList.toggle("is-zero", Number(input.value) === 0);
          toast("Stock actualizado");
          cargarProductos();
        } catch (err) {
          toast(err.message);
          input.value = valorOriginal;
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

// ---------------------------------------------------------------------------
// Alta de producto nuevo
// ---------------------------------------------------------------------------
function mostrarFormularioNuevo() {
  const cont = document.getElementById("form-nuevo");
  cont.classList.remove("hidden");

  cont.innerHTML = `
    <div class="form-card" style="max-width:none;">
      <h3 style="margin-bottom:16px;">Nuevo producto</h3>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px,1fr)); gap:14px;">
        <div class="field">
          <label for="np-name">Nombre</label>
          <input type="text" id="np-name" placeholder="Ej: Camiseta de rayas" required>
        </div>
        <div class="field">
          <label for="np-price">Precio (€)</label>
          <input type="number" id="np-price" step="0.01" min="0.01" placeholder="29.95" required>
        </div>
        <div class="field">
          <label for="np-category">Categoría</label>
          <select id="np-category">
            ${filtrosCatalogo.categories.map((c) => `<option value="${c.id}" data-kind="${c.kind}">${c.name}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="np-brand">Marca</label>
          <select id="np-brand">
            ${filtrosCatalogo.brands.map((b) => `<option value="${b.id}">${b.name}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="np-shape">Silueta (dibujo del producto)</label>
          <select id="np-shape">
            ${SILUETAS.map((s) => `<option value="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="np-gender">Para</label>
          <select id="np-gender">
            <option value="unisex">Unisex</option>
            <option value="hombre">Hombre</option>
            <option value="mujer">Mujer</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label for="np-desc">Descripción</label>
        <textarea id="np-desc" rows="3" placeholder="Materiales, corte, para qué sirve…"></textarea>
      </div>

      <h4 style="margin:18px 0 10px; font-size:0.92rem;">Tallas y colores</h4>
      <p class="muted" style="font-size:0.84rem; margin-bottom:12px;">
        Elige los colores y las tallas: se creará una combinación por cada par, con el stock que indiques.
      </p>

      <div class="variant-builder">
        <div style="margin-bottom:12px;">
          <div style="font-size:0.85rem; font-weight:500; margin-bottom:7px;">Colores</div>
          <div style="display:flex; flex-wrap:wrap; gap:7px;" id="np-colores">
            ${COLORES_DISPONIBLES.map(
              (c) => `
              <button type="button" class="color-swatch" data-color-name="${c.name}" data-color-hex="${c.hex}"
                      style="background:${c.hex}" title="${c.name}" aria-label="${c.name}"></button>`
            ).join("")}
          </div>
        </div>

        <div style="margin-bottom:12px;">
          <div style="font-size:0.85rem; font-weight:500; margin-bottom:7px;">Tallas</div>
          <div class="size-chips" id="np-tallas"></div>
        </div>

        <div class="field" style="max-width:180px; margin:0;">
          <label for="np-stock">Stock inicial por talla</label>
          <input type="number" id="np-stock" min="0" value="10">
        </div>

        <p id="np-resumen" class="muted" style="font-size:0.84rem; margin-top:12px;"></p>
      </div>

      <div style="display:flex; gap:10px; margin-top:18px;">
        <button id="np-guardar" class="btn btn-primary">Crear producto</button>
        <button id="np-cancelar" class="btn btn-outline">Cancelar</button>
      </div>
      <p id="np-msg" class="form-message"></p>
    </div>
  `;

  // Las tallas que se ofrecen dependen del tipo de categoría: no tiene
  // sentido ofrecer la talla 42 en camisetas, ni la XL en zapatillas.
  const selectCategoria = document.getElementById("np-category");
  function pintarTallas() {
    const kind = selectCategoria.selectedOptions[0].dataset.kind;
    const tallas = kind === "calzado" ? TALLAS_CALZADO : TALLAS_ROPA;
    document.getElementById("np-tallas").innerHTML = tallas
      .map((t) => `<button type="button" class="size-chip" data-talla="${t}">${t}</button>`)
      .join("");
    conectarSeleccion();
  }
  selectCategoria.addEventListener("change", pintarTallas);
  pintarTallas();

  document.getElementById("np-cancelar").addEventListener("click", () => {
    cont.classList.add("hidden");
    cont.innerHTML = "";
  });
  document.getElementById("np-guardar").addEventListener("click", crearProducto);

  conectarSeleccion();
}

// Marca/desmarca colores y tallas, y actualiza el resumen de cuántas
// combinaciones se van a crear.
function conectarSeleccion() {
  document.querySelectorAll("#np-colores .color-swatch").forEach((sw) => {
    sw.onclick = () => {
      sw.classList.toggle("is-active");
      actualizarResumen();
    };
  });
  document.querySelectorAll("#np-tallas .size-chip").forEach((chip) => {
    chip.onclick = () => {
      chip.classList.toggle("is-active");
      actualizarResumen();
    };
  });
  actualizarResumen();
}

function actualizarResumen() {
  const colores = document.querySelectorAll("#np-colores .color-swatch.is-active").length;
  const tallas = document.querySelectorAll("#np-tallas .size-chip.is-active").length;
  const el = document.getElementById("np-resumen");
  if (!el) return;

  el.textContent =
    colores === 0 || tallas === 0
      ? "Elige al menos un color y una talla."
      : `Se crearán ${colores * tallas} combinaciones (${colores} ${colores === 1 ? "color" : "colores"} × ${tallas} ${tallas === 1 ? "talla" : "tallas"}).`;
}

async function crearProducto() {
  const msg = document.getElementById("np-msg");
  const btn = document.getElementById("np-guardar");
  msg.textContent = "";
  msg.className = "form-message";

  const colores = [...document.querySelectorAll("#np-colores .color-swatch.is-active")].map((sw) => ({
    color_name: sw.dataset.colorName,
    color_hex: sw.dataset.colorHex,
  }));
  const tallas = [...document.querySelectorAll("#np-tallas .size-chip.is-active")].map((c) => c.dataset.talla);
  const stock = Number(document.getElementById("np-stock").value) || 0;

  if (colores.length === 0 || tallas.length === 0) {
    msg.textContent = "Elige al menos un color y una talla.";
    msg.classList.add("error");
    return;
  }

  // Combinamos cada color con cada talla para generar todas las variantes.
  const variants = [];
  colores.forEach((c) => {
    tallas.forEach((size) => {
      variants.push({ ...c, size, stock });
    });
  });

  const precioEuros = Number(document.getElementById("np-price").value);
  if (!precioEuros || precioEuros <= 0) {
    msg.textContent = "Indica un precio válido.";
    msg.classList.add("error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Creando…";

  try {
    await api("/admin/products", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("np-name").value.trim(),
        description: document.getElementById("np-desc").value.trim(),
        // Convertimos euros a céntimos: Math.round evita que 29.95 * 100
        // acabe siendo 2994.9999 por la imprecisión de los decimales.
        price_cents: Math.round(precioEuros * 100),
        category_id: Number(document.getElementById("np-category").value),
        brand_id: Number(document.getElementById("np-brand").value),
        shape: document.getElementById("np-shape").value,
        gender: document.getElementById("np-gender").value,
        variants,
      }),
    });

    toast("Producto creado");
    document.getElementById("form-nuevo").classList.add("hidden");
    cargarProductos();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("error");
    btn.disabled = false;
    btn.textContent = "Crear producto";
  }
}

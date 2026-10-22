// js/resenas.js
// Reseñas de producto. Solo puede opinar quien compró el producto, así que
// el formulario únicamente aparece si el backend confirma que hay una compra
// suya pendiente de valorar.

const ESTRELLA = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

const ETIQUETAS_AJUSTE = {
  pequena: "Talla pequeña",
  justa: "Talla justa",
  grande: "Talla grande",
};

let compraParaValorar = null;
let notaElegida = 0;
let ajusteElegido = null;

// Dibuja una fila de 5 estrellas, con "nota" de ellas rellenas.
function pintarEstrellas(nota) {
  let html = '<span class="stars">';
  for (let i = 1; i <= 5; i++) {
    html += ESTRELLA.replace("<svg", `<svg class="${i <= Math.round(nota) ? "filled" : ""}"`);
  }
  return html + "</span>";
}

async function cargarResenas(productId) {
  const cont = document.getElementById("reviews-section");
  if (!cont) return;

  try {
    const datos = await api(`/reviews/product/${productId}`);
    let puedeOpinar = { can_review: false, purchases: [] };

    if (getToken()) {
      try {
        puedeOpinar = await api(`/reviews/can-review/${productId}`);
      } catch (_) {}
    }

    cont.innerHTML = `
      <h2 style="margin-bottom:22px;">Opiniones</h2>
      ${datos.total === 0 ? bloqueSinResenas() : bloqueResumen(datos)}
      ${datos.size_verdict ? bloqueVeredictoTalla(datos.size_verdict) : ""}
      <div id="review-form-area"></div>
      <div id="reviews-list">${datos.reviews.map(tarjetaResena).join("")}</div>
    `;

    if (puedeOpinar.can_review) {
      pintarFormulario(productId, puedeOpinar.purchases);
    } else if (getToken()) {
      // Está identificado pero no puede opinar: le explicamos por qué.
      document.getElementById("review-form-area").innerHTML = `
        <p class="muted" style="font-size:0.86rem; margin-bottom:24px;">
          Solo pueden opinar quienes han comprado el producto.
        </p>`;
    }
  } catch (err) {
    cont.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

function bloqueSinResenas() {
  return `<p class="muted" style="margin-bottom:24px;">Todavía no hay opiniones de este producto. Si lo has comprado, cuéntanos qué tal.</p>`;
}

function bloqueResumen(d) {
  const filas = [5, 4, 3, 2, 1]
    .map((n) => {
      const cuantas = d.breakdown[n];
      const porcentaje = d.total > 0 ? (cuantas / d.total) * 100 : 0;
      return `
        <div class="rating-bar-row">
          <span>${n}</span>
          <div class="rating-bar-track"><div class="rating-bar-fill" style="width:${porcentaje}%"></div></div>
          <span class="muted">${cuantas}</span>
        </div>`;
    })
    .join("");

  return `
    <div class="reviews-head">
      <div class="rating-summary">
        <div class="rating-big">${d.average.toString().replace(".", ",")}</div>
        ${pintarEstrellas(d.average)}
        <div class="rating-count">${d.total} ${d.total === 1 ? "opinión" : "opiniones"}</div>
      </div>
      <div class="rating-bars">${filas}</div>
    </div>`;
}

function bloqueVeredictoTalla(v) {
  const consejo =
    v.clave === "pequena"
      ? "Puede que te convenga pedir una talla más de la habitual."
      : v.clave === "grande"
      ? "Puede que te convenga pedir una talla menos de la habitual."
      : "La talla se corresponde con la habitual.";

  return `
    <div class="size-verdict">
      <strong>${v.etiqueta}</strong> según el ${v.porcentaje}% de quienes lo han comprado. ${consejo}
    </div>`;
}

function tarjetaResena(r) {
  const fecha = new Date(r.created_at.replace(" ", "T")).toLocaleDateString("es-ES", {
    day: "numeric", month: "long", year: "numeric",
  });

  return `
    <div class="review-card">
      <div class="review-top">
        <div>
          <span class="review-author">${r.author_name}</span>
          <span class="verified-badge">Compra verificada</span>
        </div>
        <span class="review-meta">${fecha}</span>
      </div>
      ${pintarEstrellas(r.rating)}
      ${r.title ? `<div class="review-title">${r.title}</div>` : ""}
      ${r.body ? `<p class="review-body">${r.body}</p>` : ""}
      <div class="review-meta" style="margin-top:8px;">
        Compró la talla ${r.purchased_size} en ${r.purchased_color}${
          r.size_fit ? ` · ${ETIQUETAS_AJUSTE[r.size_fit]}` : ""
        }
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Formulario para dejar una reseña
// ---------------------------------------------------------------------------
function pintarFormulario(productId, compras) {
  compraParaValorar = compras[0];
  notaElegida = 0;
  ajusteElegido = null;

  const area = document.getElementById("review-form-area");
  area.innerHTML = `
    <div class="settings-block" style="max-width:520px; margin-bottom:30px;">
      <h3 style="margin-bottom:4px;">Cuenta tu experiencia</h3>
      <p class="hint" style="margin-bottom:16px;">
        Compraste la talla ${compraParaValorar.size} en ${compraParaValorar.color_name}.
        ${compras.length > 1 ? `Tienes ${compras.length} compras de este producto sin valorar.` : ""}
      </p>

      <div class="field">
        <label>Tu valoración</label>
        <div class="star-picker" id="star-picker">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-nota="${n}" aria-label="${n} estrellas">${ESTRELLA}</button>`).join("")}
        </div>
      </div>

      <div class="field">
        <label>¿Cómo talla?</label>
        <div class="fit-options" id="fit-options">
          <button type="button" data-fit="pequena">Pequeña</button>
          <button type="button" data-fit="justa">Justa</button>
          <button type="button" data-fit="grande">Grande</button>
        </div>
      </div>

      <div class="field">
        <label for="review-title">Título (opcional)</label>
        <input type="text" id="review-title" maxlength="80" placeholder="Ej: Muy buena calidad">
      </div>
      <div class="field">
        <label for="review-body">Tu opinión (opcional)</label>
        <textarea id="review-body" rows="3" maxlength="600" placeholder="¿Qué tal el tejido, el corte, el color…?"></textarea>
      </div>

      <button id="submit-review" class="btn btn-primary" disabled>Publicar opinión</button>
      <p id="review-msg" class="form-message"></p>
    </div>`;

  // Estrellas
  document.querySelectorAll("#star-picker button").forEach((btn) => {
    btn.addEventListener("click", () => {
      notaElegida = Number(btn.dataset.nota);
      document.querySelectorAll("#star-picker button").forEach((b) => {
        b.classList.toggle("is-on", Number(b.dataset.nota) <= notaElegida);
      });
      document.getElementById("submit-review").disabled = notaElegida === 0;
    });
  });

  // Cómo talla
  document.querySelectorAll("#fit-options button").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Volver a pulsar la misma opción la deselecciona.
      ajusteElegido = ajusteElegido === btn.dataset.fit ? null : btn.dataset.fit;
      document.querySelectorAll("#fit-options button").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.fit === ajusteElegido);
      });
    });
  });

  document.getElementById("submit-review").addEventListener("click", () => enviarResena(productId));
}

async function enviarResena(productId) {
  const msg = document.getElementById("review-msg");
  const btn = document.getElementById("submit-review");
  msg.textContent = "";
  msg.className = "form-message";

  if (notaElegida === 0) {
    msg.textContent = "Elige cuántas estrellas le das.";
    msg.classList.add("error");
    return;
  }

  btn.disabled = true;
  try {
    await api("/reviews", {
      method: "POST",
      body: JSON.stringify({
        product_id: productId,
        order_item_id: compraParaValorar.order_item_id,
        rating: notaElegida,
        title: document.getElementById("review-title").value.trim() || null,
        body: document.getElementById("review-body").value.trim() || null,
        size_fit: ajusteElegido,
      }),
    });
    toast("Gracias por tu opinión");
    cargarResenas(productId);
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("error");
    btn.disabled = false;
  }
}

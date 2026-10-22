// js/favoritos.js
// Lógica compartida de favoritos, usada por el catálogo, la portada y la
// ficha de producto.

// Conjunto con los ids de los productos que el usuario tiene guardados.
// Lo cargamos una vez por página y lo consultamos en memoria, en vez de
// preguntar al servidor por cada tarjeta del catálogo.
let favoritosIds = new Set();

const ICONO_CORAZON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 20.5 3.8 12.3a4.9 4.9 0 0 1 0-7 4.9 4.9 0 0 1 7 0l1.2 1.2 1.2-1.2a4.9 4.9 0 0 1 7 0 4.9 4.9 0 0 1 0 7z"/>
  </svg>`;

// Carga los favoritos del usuario. Si no hay sesión, simplemente queda vacío
// (los corazones se verán sin marcar y al pulsarlos se pedirá iniciar sesión).
async function cargarFavoritos() {
  if (!getToken()) {
    favoritosIds = new Set();
    return;
  }
  try {
    const ids = await api("/favorites/ids");
    favoritosIds = new Set(ids);
  } catch (_) {
    favoritosIds = new Set();
  }
}

// Genera el botón de corazón para un producto.
function botonFavorito(productId, opciones = {}) {
  const guardado = favoritosIds.has(productId);
  const clases = ["fav-btn"];
  if (opciones.inline) clases.push("fav-btn-inline");
  if (guardado) clases.push("is-saved");

  return `
    <button class="${clases.join(" ")}" data-fav="${productId}"
            aria-label="${guardado ? "Quitar de favoritos" : "Guardar en favoritos"}"
            title="${guardado ? "Quitar de favoritos" : "Guardar en favoritos"}">
      ${ICONO_CORAZON}
    </button>`;
}

// Conecta todos los botones de corazón que haya en la página.
function conectarFavoritos(alCambiar) {
  document.querySelectorAll("[data-fav]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      // Los corazones van dentro de tarjetas que son enlaces: sin esto, al
      // pulsar el corazón navegaríamos al producto en vez de guardarlo.
      e.preventDefault();
      e.stopPropagation();

      if (!getToken()) {
        toast("Inicia sesión para guardar favoritos");
        setTimeout(() => {
          window.location.href = "acceso.html?next=" + encodeURIComponent(location.pathname.replace(/^\//, "") + location.search);
        }, 900);
        return;
      }

      const id = Number(btn.dataset.fav);
      btn.disabled = true;

      try {
        const res = await api("/favorites", {
          method: "POST",
          body: JSON.stringify({ product_id: id }),
        });

        if (res.saved) {
          favoritosIds.add(id);
          btn.classList.add("is-saved");
          toast("Guardado en favoritos");
        } else {
          favoritosIds.delete(id);
          btn.classList.remove("is-saved");
          toast("Quitado de favoritos");
        }

        const etiqueta = res.saved ? "Quitar de favoritos" : "Guardar en favoritos";
        btn.setAttribute("aria-label", etiqueta);
        btn.setAttribute("title", etiqueta);

        if (typeof alCambiar === "function") alCambiar(id, res.saved);
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

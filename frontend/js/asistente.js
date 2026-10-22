// js/asistente.js
// Widget flotante del asistente. Se monta solo en cualquier página que lo
// cargue; si estamos en la ficha de un producto, le pasa el id para que
// pueda responder con datos concretos de ese artículo.

// Sugerencias iniciales, distintas según dónde estemos.
const SUGERENCIAS_PRODUCTO = [
  "¿Qué talla me recomiendas?",
  "¿Qué tallas quedan?",
  "¿De qué material es?",
  "¿Puedo devolverlo?",
];
const SUGERENCIAS_GENERAL = [
  "¿Cuánto tarda el envío?",
  "¿Cómo funcionan las devoluciones?",
  "¿Cómo elijo mi talla?",
];

let asistenteAbierto = false;
let asistenteProductId = null;

function iniciarAsistente(productId = null) {
  asistenteProductId = productId;

  const lanzador = document.createElement("button");
  lanzador.className = "assistant-launcher";
  lanzador.id = "assistant-launcher";
  lanzador.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12z" stroke-linejoin="round"/>
    </svg>
    ¿Dudas con la talla?`;
  document.body.appendChild(lanzador);

  const panel = document.createElement("div");
  panel.className = "assistant-panel";
  panel.id = "assistant-panel";
  panel.innerHTML = `
    <div class="assistant-head">
      <div>
        <strong>Asistente de tallas</strong>
        <div class="sub">Te ayudo a acertar a la primera</div>
      </div>
      <button class="assistant-close" id="assistant-close" aria-label="Cerrar">×</button>
    </div>
    <div class="assistant-messages" id="assistant-messages"></div>
    <div class="assistant-suggestions" id="assistant-suggestions"></div>
    <form class="assistant-form" id="assistant-form">
      <input type="text" id="assistant-input" placeholder="Escribe tu pregunta…" autocomplete="off">
      <button type="submit">Enviar</button>
    </form>`;
  document.body.appendChild(panel);

  lanzador.addEventListener("click", abrirAsistente);
  document.getElementById("assistant-close").addEventListener("click", cerrarAsistente);
  document.getElementById("assistant-form").addEventListener("submit", enviarPregunta);

  // Cerrar con la tecla Escape, que es lo que espera cualquiera.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && asistenteAbierto) cerrarAsistente();
  });

  pintarSugerencias();
}

function abrirAsistente() {
  asistenteAbierto = true;
  document.getElementById("assistant-panel").classList.add("is-open");
  document.getElementById("assistant-launcher").style.display = "none";

  // Mensaje de bienvenida solo la primera vez que se abre.
  const mensajes = document.getElementById("assistant-messages");
  if (mensajes.children.length === 0) {
    const saludo = asistenteProductId
      ? "¡Hola! Dime tu altura y peso y te digo qué talla coger. También puedo resolverte dudas sobre el material, el envío o las devoluciones."
      : "¡Hola! Puedo ayudarte a elegir talla y resolver dudas sobre envíos y devoluciones. Para afinar la talla, pregúntame desde la ficha de un producto.";
    anadirMensaje("bot", saludo);
  }

  document.getElementById("assistant-input").focus();
}

function cerrarAsistente() {
  asistenteAbierto = false;
  document.getElementById("assistant-panel").classList.remove("is-open");
  document.getElementById("assistant-launcher").style.display = "";
}

function pintarSugerencias() {
  const cont = document.getElementById("assistant-suggestions");
  const lista = asistenteProductId ? SUGERENCIAS_PRODUCTO : SUGERENCIAS_GENERAL;

  cont.innerHTML = lista.map((s) => `<button type="button">${s}</button>`).join("");
  cont.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("assistant-input").value = btn.textContent;
      document.getElementById("assistant-form").dispatchEvent(new Event("submit"));
    });
  });
}

function anadirMensaje(quien, texto) {
  const cont = document.getElementById("assistant-messages");
  const div = document.createElement("div");
  div.className = `assistant-msg ${quien}`;
  // El asistente marca las tallas con **asteriscos**; los convertimos en
  // negrita real. Escapamos el resto del texto para no permitir HTML.
  const seguro = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  div.innerHTML = seguro;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
}

async function enviarPregunta(e) {
  e.preventDefault();
  const input = document.getElementById("assistant-input");
  const pregunta = input.value.trim();
  if (!pregunta) return;

  anadirMensaje("user", pregunta);
  input.value = "";

  // Las sugerencias solo tienen sentido al principio de la conversación.
  document.getElementById("assistant-suggestions").innerHTML = "";

  try {
    const r = await api("/assistant", {
      method: "POST",
      body: JSON.stringify({ mensaje: pregunta, product_id: asistenteProductId }),
    });
    anadirMensaje("bot", r.respuesta);
  } catch (err) {
    anadirMensaje("bot", "Ahora mismo no puedo responderte. Inténtalo de nuevo en un momento.");
  }
}

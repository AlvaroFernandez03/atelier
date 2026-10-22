// services/assistant.js
//
// Asistente de la tienda. Interpreta preguntas escritas en lenguaje natural
// y responde con datos reales del catálogo: tallas recomendadas, stock,
// materiales, envíos y devoluciones.
//
// No usa un modelo de lenguaje: extrae los datos de la pregunta (altura,
// peso, talla habitual...) con expresiones regulares y decide la respuesta
// con reglas. Para un ámbito acotado como este, es más fiable y predecible
// que una IA, y no depende de conexión ni de claves de pago.

const db = require("../db/database");
const { recomendarTalla, recomendarCalzado } = require("./sizeAdvisor");

// ---------------------------------------------------------------------------
// Extracción de datos de la pregunta
// ---------------------------------------------------------------------------

// Busca la altura: acepta "170", "1,70", "1.70 m", "170cm", "mido 170"...
function extraerAltura(texto) {
  // Formato en metros: 1,75 / 1.75
  const enMetros = texto.match(/\b(1[.,]\d{2})\s*(m\b|metros?)?/);
  if (enMetros) {
    const valor = parseFloat(enMetros[1].replace(",", ".")) * 100;
    if (valor >= 140 && valor <= 210) return Math.round(valor);
  }
  // Formato en centímetros: 170, 170cm, mido 170
  const enCm = texto.match(/\b(1[4-9]\d|20\d|210)\s*(cm|centímetros?)?\b/);
  if (enCm) {
    const valor = parseInt(enCm[1], 10);
    if (valor >= 140 && valor <= 210) return valor;
  }
  return null;
}

// Busca el peso: "65kg", "65 kilos", "peso 65"
function extraerPeso(texto) {
  const conUnidad = texto.match(/\b(\d{2,3})\s*(kg|kilos?|kilogramos?)\b/);
  if (conUnidad) {
    const valor = parseInt(conUnidad[1], 10);
    if (valor >= 40 && valor <= 160) return valor;
  }
  // "peso 65" / "y 65" tras haber mencionado la altura
  const trasPeso = texto.match(/\bpeso\s+(?:de\s+)?(\d{2,3})\b/);
  if (trasPeso) {
    const valor = parseInt(trasPeso[1], 10);
    if (valor >= 40 && valor <= 160) return valor;
  }
  return null;
}

// Talla de calzado habitual: "uso un 42", "calzo el 41"
function extraerTallaCalzado(texto) {
  const m = texto.match(/\b(?:calzo|uso|gasto|llevo)\s+(?:un[ao]?\s+|el\s+)?(3[5-9]|4[0-7])\b/);
  if (m) return parseInt(m[1], 10);
  const suelto = texto.match(/\b(3[5-9]|4[0-7])\b/);
  if (suelto && /(calzado|zapatilla|bota|pie|n[úu]mero)/.test(texto)) {
    return parseInt(suelto[1], 10);
  }
  return null;
}

// Longitud del pie en cm: "mi pie mide 26,5", "26.5 cm de pie"
function extraerLongitudPie(texto) {
  // Solo lo interpretamos como medida de pie si la frase menciona el pie:
  // así "26" en otra frase no se confunde con una longitud.
  if (!/\bpie\b/.test(texto)) return null;

  const m = texto.match(/\b(2\d|3[0-3])[.,]?(\d)?\s*(cm|centímetros?)?\b/);
  if (m) {
    const valor = parseFloat(m[2] ? `${m[1]}.${m[2]}` : m[1]);
    if (valor >= 20 && valor <= 33) return valor;
  }
  return null;
}

// Preferencia de ajuste
function extraerPreferencia(texto) {
  if (/\b(ajustad[oa]|ce[ñn]id[oa]|entallad[oa]|apretad[oa]|slim)\b/.test(texto)) return "ajustado";
  if (/\b(holgad[oa]|ancho|amplio|suelt[oa]|oversize|grande)\b/.test(texto)) return "holgado";
  return "normal";
}

// ---------------------------------------------------------------------------
// Detección de la intención de la pregunta
// ---------------------------------------------------------------------------
function detectarIntencion(texto) {
  // El orden importa: comprobamos primero las intenciones más específicas,
  // porque hay frases que contienen palabras de varias. Por ejemplo,
  // "¿puedo devolverlo si no me queda bien?" lleva "me queda" (talla) pero
  // lo que pregunta de verdad es por la devolución.
  //
  // Nota sobre las expresiones: usamos \b solo al PRINCIPIO de los prefijos
  // (\bdevol en vez de \bdevol\b), porque queremos que "devol" case también
  // con "devolver", "devolverlo" o "devolución". Con \b al final solo
  // encontraría la palabra "devol" exacta, que no existe.
  if (/\b(devol|devuelv|reembols|garant[íi]a)/.test(texto)) return "devolucion";
  // "cambiar" por sí sola es ambigua (¿cambiar de talla o devolver?), así que
  // solo la tomamos como devolución si acompaña a la idea de que no ha quedado bien.
  if (/\bcambiar/.test(texto) && /\b(no me|si no|queda mal|no queda|no vale)/.test(texto)) return "devolucion";
  if (/\b(env[íi]o|env[íi]an|entrega|tarda|cu[áa]ndo llega|portes)/.test(texto)) return "envio";
  if (/\b(lavar|lavado|secadora|plancha|cuidado|encoge)/.test(texto)) return "cuidados";
  if (/\b(material|tejido|composici[óo]n|algod[óo]n|de qu[ée] est[áa])/.test(texto)) return "material";

  // Disponibilidad: "qué tallas quedan", "hay stock", "está agotado"
  if (/\b(stock|disponible|quedan|agotad|hay talla|qu[ée] tallas)/.test(texto)) return "stock";

  if (/\b(talla|tamaño|qu[eé] n[úu]mero|me vendr[íi]a|me ir[íi]a|me queda bien|qu[ée] me recomiendas)/.test(texto)) return "talla";
  if (/\b(precio|cuesta|vale|cu[áa]nto)/.test(texto)) return "precio";
  if (/\b(hola|buenas|buenos d[íi]as|qu[ée] tal)\b/.test(texto)) return "saludo";

  // Aunque no diga la palabra "talla", si nos está dando sus medidas está
  // preguntando por la talla: "mido 175 y peso 72", "tengo 165 cm y 58 kg",
  // "mi pie mide 26,5 cm", "calzo un 42". Es la forma natural de preguntar.
  const daMedidasCuerpo = /\b(mido|mide|tengo)\b/.test(texto) || /\bpeso\b/.test(texto);
  const daMedidasPie = /\b(calzo|uso un|gasto un|pie)\b/.test(texto);
  if ((daMedidasCuerpo || daMedidasPie) && /\d/.test(texto)) return "talla";

  return "desconocida";
}

// ---------------------------------------------------------------------------
// Respuesta principal
// ---------------------------------------------------------------------------
function responder({ mensaje, productId }) {
  const texto = (mensaje || "").toLowerCase().trim();
  if (!texto) {
    return { respuesta: "Cuéntame qué necesitas saber y te ayudo." };
  }

  // Si la pregunta se hace desde la ficha de un producto, lo cargamos para
  // poder responder con sus datos concretos.
  let producto = null;
  if (productId) {
    producto = db
      .prepare(
        `SELECT p.*, c.kind AS category_kind, c.name AS category_name, b.name AS brand_name
         FROM products p
         JOIN categories c ON c.id = p.category_id
         JOIN brands b ON b.id = p.brand_id
         WHERE p.id = ?`
      )
      .get(productId);
  }

  const intencion = detectarIntencion(texto);

  switch (intencion) {
    case "saludo":
      return {
        respuesta: producto
          ? `¡Hola! Puedo ayudarte con la talla de "${producto.name}", con dudas sobre el material, el envío o las devoluciones. ¿Qué necesitas?`
          : "¡Hola! Puedo ayudarte a elegir talla, y con dudas sobre envíos, devoluciones o disponibilidad. ¿En qué te ayudo?",
      };

    case "talla":
      return responderTalla(texto, producto);

    case "stock":
      return responderStock(producto);

    case "material":
      return producto
        ? { respuesta: `${producto.description}` }
        : { respuesta: "Abre la ficha de un producto y te cuento de qué está hecho." };

    case "precio":
      return producto
        ? { respuesta: `"${producto.name}" cuesta ${(producto.price_cents / 100).toFixed(2).replace(".", ",")} €. El envío es gratis a partir de 50 € de compra.` }
        : { respuesta: "Dime qué producto te interesa (o pregúntame desde su ficha) y te digo el precio." };

    case "envio":
      return {
        respuesta:
          "El envío cuesta 4,95 € y es gratis a partir de 50 € de compra. Los pedidos salen en 24-48 h laborables y suelen llegar en 2-4 días.",
      };

    case "devolucion":
      return {
        respuesta:
          "Tienes 30 días desde que recibes el pedido para devolver lo que quieras. Puedes pedir la devolución desde tu cuenta, en el detalle del pedido, y elegir qué artículos y cuántas unidades devuelves.",
      };

    case "cuidados":
      return {
        respuesta: producto && producto.category_kind === "calzado"
          ? "Para el calzado: límpialo con un paño húmedo y déjalo secar al aire, nunca cerca de un radiador. Si es de piel, una crema nutritiva cada pocos meses alarga bastante su vida."
          : "Recomendamos lavar del revés a 30 °C, con colores similares, y secar al aire. Evita la secadora: es lo que más encoge y desgasta las prendas.",
      };

    default:
      return respuestaGenerica(producto);
  }
}

// ---------------------------------------------------------------------------
// Respuesta sobre tallas
// ---------------------------------------------------------------------------
function responderTalla(texto, producto) {
  // Sin producto no podemos saber si es ropa o calzado.
  if (!producto) {
    return {
      respuesta:
        "Para recomendarte una talla necesito saber qué producto miras. Ábrelo y pregúntame desde su ficha, y dime tu altura y peso (por ejemplo: «mido 175 y peso 72»).",
    };
  }

  const esCalzado = producto.category_kind === "calzado";

  if (esCalzado) {
    const tallaHabitual = extraerTallaCalzado(texto);
    const longitudPie = extraerLongitudPie(texto);

    if (!tallaHabitual && !longitudPie) {
      return {
        respuesta:
          "Para el calzado no puedo deducir la talla de tu altura y peso. Dime qué número usas habitualmente (por ejemplo, «uso un 42») o cuánto mide tu pie en centímetros.",
        necesita_datos: ["talla_calzado"],
      };
    }

    const r = recomendarCalzado({ tallaHabitual, longitudPieCm: longitudPie, shape: producto.shape });
    if (r.error) return { respuesta: r.error };

    const disponible = comprobarDisponibilidad(producto.id, r.talla);
    let respuesta =
      r.metodo === "medida"
        ? `Con un pie de ${longitudPie} cm, tu talla en "${producto.name}" sería la **${r.talla}**.`
        : `Para "${producto.name}" te recomiendo la **${r.talla}**.`;

    if (r.nota) respuesta += ` ${r.nota}`;
    respuesta += " " + textoDisponibilidad(disponible, r.talla);

    return { respuesta, talla_recomendada: r.talla };
  }

  // --- Ropa ---
  const altura = extraerAltura(texto);
  const peso = extraerPeso(texto);

  if (!altura || !peso) {
    const falta = !altura && !peso ? "tu altura y tu peso" : !altura ? "tu altura" : "tu peso";
    return {
      respuesta: `Para afinar la talla necesito ${falta}. Puedes decírmelo así: «mido 175 y peso 72».`,
      necesita_datos: ["altura", "peso"],
    };
  }

  const preferencia = extraerPreferencia(texto);
  const r = recomendarTalla({ alturaCm: altura, pesoKg: peso, shape: producto.shape, preferencia });
  if (r.error) return { respuesta: r.error };

  const disponible = comprobarDisponibilidad(producto.id, r.talla);

  let respuesta = `Con ${altura} cm y ${peso} kg, en "${producto.name}" te recomiendo la talla **${r.talla}**`;
  if (preferencia !== "normal") {
    respuesta += ` (teniendo en cuenta que lo prefieres ${preferencia})`;
  }
  respuesta += ".";

  if (r.alternativa) {
    respuesta += ` Estás entre dos tallas: si te gusta ${
      ORDEN_COMPARATIVO(r.alternativa, r.talla) ? "más holgado" : "más ajustado"
    }, la ${r.alternativa} también te valdría.`;
  }

  respuesta += " " + textoDisponibilidad(disponible, r.talla);

  return { respuesta, talla_recomendada: r.talla, alternativa: r.alternativa };
}

// Devuelve true si la talla A es mayor que la B (para redactar la frase).
function ORDEN_COMPARATIVO(a, b) {
  const orden = ["XS", "S", "M", "L", "XL"];
  return orden.indexOf(a) > orden.indexOf(b);
}

// ---------------------------------------------------------------------------
// Disponibilidad
// ---------------------------------------------------------------------------
function comprobarDisponibilidad(productId, talla) {
  const filas = db
    .prepare("SELECT color_name, stock FROM variants WHERE product_id = ? AND size = ?")
    .all(productId, talla);

  const conStock = filas.filter((f) => f.stock > 0);
  return { hayAlguna: conStock.length > 0, colores: conStock.map((f) => f.color_name) };
}

function textoDisponibilidad(disponible, talla) {
  if (!disponible.hayAlguna) {
    return `Ahora mismo la talla ${talla} está agotada en todos los colores; avísanos si quieres que te la reservemos cuando vuelva.`;
  }
  if (disponible.colores.length === 1) {
    return `La tenemos disponible en ${disponible.colores[0]}.`;
  }
  return `La tenemos en ${disponible.colores.slice(0, -1).join(", ")} y ${disponible.colores.slice(-1)}.`;
}

function responderStock(producto) {
  if (!producto) {
    return { respuesta: "Dime qué producto te interesa y te cuento qué tallas quedan." };
  }

  const variantes = db
    .prepare("SELECT size, SUM(stock) AS stock FROM variants WHERE product_id = ? GROUP BY size")
    .all(producto.id);

  const disponibles = variantes.filter((v) => v.stock > 0).map((v) => v.size);
  const agotadas = variantes.filter((v) => v.stock === 0).map((v) => v.size);

  if (disponibles.length === 0) {
    return { respuesta: `Lo siento, "${producto.name}" está agotado en todas las tallas ahora mismo.` };
  }

  let respuesta = `De "${producto.name}" tenemos disponibles las tallas ${disponibles.join(", ")}.`;
  if (agotadas.length > 0) {
    respuesta += ` Están agotadas: ${agotadas.join(", ")}.`;
  }
  return { respuesta };
}

function respuestaGenerica(producto) {
  return {
    respuesta: producto
      ? `No estoy seguro de haber entendido. Puedo ayudarte con la talla (dime tu altura y peso), con la disponibilidad, el material, el envío o las devoluciones de "${producto.name}".`
      : "No estoy seguro de haber entendido. Puedo ayudarte a elegir talla, y con dudas sobre envíos, devoluciones o disponibilidad.",
  };
}

module.exports = { responder };

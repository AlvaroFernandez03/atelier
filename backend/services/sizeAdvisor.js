// services/sizeAdvisor.js
//
// Recomendador de tallas. No usa inteligencia artificial: usa tablas de
// tallas reales y un cálculo sobre las medidas de la persona. Para esto es
// mejor así — una talla es un cálculo, no una conversación, y de este modo
// la respuesta es siempre coherente y explicable.
//
// El enfoque: estimamos el contorno de pecho y cintura a partir de altura y
// peso, buscamos en qué rango de talla caen, y ajustamos según el tipo de
// prenda (una sudadera se lleva más holgada que una camiseta) y la
// preferencia de ajuste de la persona.

// ---------------------------------------------------------------------------
// Tablas de tallas (centímetros de contorno de pecho)
// ---------------------------------------------------------------------------
// Son las medidas de la PRENDA, no del cuerpo: por eso incluyen holgura.
const TABLA_PECHO = [
  { size: "XS", min: 82, max: 88 },
  { size: "S", min: 88, max: 94 },
  { size: "M", min: 94, max: 102 },
  { size: "L", min: 102, max: 110 },
  { size: "XL", min: 110, max: 120 },
];

// Ajuste típico de cada tipo de prenda, en "pasos de talla".
// Una sudadera o una chaqueta se llevan encima de otra ropa, así que
// conviene una talla más holgada que una camiseta.
const AJUSTE_PRENDA = {
  camiseta: 0,
  sudadera: 0.5,
  chaqueta: 0.5,
  pantalon: 0,
};

// Cuánto mueve la preferencia personal de ajuste.
const AJUSTE_PREFERENCIA = {
  ajustado: -0.5,
  normal: 0,
  holgado: 0.5,
};

const ORDEN_TALLAS = ["XS", "S", "M", "L", "XL"];

// ---------------------------------------------------------------------------
// Estimación del contorno de pecho a partir de altura y peso
// ---------------------------------------------------------------------------
// Es una aproximación: no sustituye a medirse con una cinta métrica, pero
// acierta razonablemente para la mayoría de la gente. Se basa en que el
// contorno crece sobre todo con el peso, y algo menos con la altura.
function estimarPecho(alturaCm, pesoKg) {
  const imc = pesoKg / Math.pow(alturaCm / 100, 2);

  // Punto de partida proporcional a la altura, más el efecto del IMC.
  // Los coeficientes están ajustados para que un IMC de 22 en una persona
  // de 175 cm dé alrededor de 96 cm de pecho, que es una talla M típica.
  const base = alturaCm * 0.29;
  const porCorpulencia = (imc - 22) * 2.4;

  return base + porCorpulencia + 45;
}

// Talla de pantalón: aquí manda más la cintura, que estimamos aparte.
function estimarCintura(alturaCm, pesoKg) {
  const imc = pesoKg / Math.pow(alturaCm / 100, 2);
  return alturaCm * 0.21 + (imc - 22) * 2.8 + 42;
}

// ---------------------------------------------------------------------------
// Cálculo principal
// ---------------------------------------------------------------------------
function recomendarTalla({ alturaCm, pesoKg, shape, preferencia = "normal" }) {
  // Validaciones: fuera de estos rangos la estimación deja de ser fiable y
  // es más honesto decirlo que dar un número inventado.
  if (!alturaCm || !pesoKg) {
    return { error: "Necesito tu altura y tu peso para poder recomendarte una talla." };
  }
  if (alturaCm < 140 || alturaCm > 210) {
    return { error: "La altura debe estar entre 140 y 210 cm." };
  }
  if (pesoKg < 40 || pesoKg > 160) {
    return { error: "El peso debe estar entre 40 y 160 kg." };
  }

  const esPantalon = shape === "pantalon";
  const medida = esPantalon ? estimarCintura(alturaCm, pesoKg) : estimarPecho(alturaCm, pesoKg);

  // Buscamos en qué franja de la tabla cae la medida estimada.
  // Para pantalón usamos la misma tabla desplazada, porque las tallas de
  // letra funcionan igual aunque la medida de referencia sea otra.
  const tabla = esPantalon
    ? TABLA_PECHO.map((t) => ({ ...t, min: t.min - 12, max: t.max - 12 }))
    : TABLA_PECHO;

  let indiceBase = tabla.findIndex((t) => medida >= t.min && medida < t.max);
  // Si se sale por abajo o por arriba, nos quedamos en el extremo.
  if (indiceBase === -1) indiceBase = medida < tabla[0].min ? 0 : tabla.length - 1;

  // Aplicamos los ajustes de prenda y preferencia, y redondeamos.
  const ajuste = (AJUSTE_PRENDA[shape] || 0) + (AJUSTE_PREFERENCIA[preferencia] || 0);
  let indiceFinal = Math.round(indiceBase + ajuste);
  indiceFinal = Math.max(0, Math.min(ORDEN_TALLAS.length - 1, indiceFinal));

  const talla = ORDEN_TALLAS[indiceFinal];

  // Talla alternativa: la de al lado hacia donde apuntaba el ajuste, útil
  // cuando la persona está justo entre dos tallas.
  const distanciaAlBorde = medida - tabla[indiceBase].min;
  const anchoFranja = tabla[indiceBase].max - tabla[indiceBase].min;
  const enElBorde = distanciaAlBorde < anchoFranja * 0.25 || distanciaAlBorde > anchoFranja * 0.75;

  let alternativa = null;
  if (enElBorde) {
    const haciaArriba = distanciaAlBorde > anchoFranja * 0.75;
    const indiceAlt = haciaArriba ? indiceFinal + 1 : indiceFinal - 1;
    if (indiceAlt >= 0 && indiceAlt < ORDEN_TALLAS.length) {
      alternativa = ORDEN_TALLAS[indiceAlt];
    }
  }

  return {
    talla,
    alternativa,
    medida_estimada: Math.round(medida),
    tipo_medida: esPantalon ? "cintura" : "pecho",
    en_el_borde: enElBorde,
  };
}

// ---------------------------------------------------------------------------
// Recomendación de talla de calzado
// ---------------------------------------------------------------------------
// Aquí no hay estimación posible desde altura y peso: el pie no guarda esa
// relación. Lo honesto es pedir la longitud del pie o la talla habitual.
function recomendarCalzado({ tallaHabitual, longitudPieCm, shape }) {
  // Cada centímetro de pie equivale aproximadamente a 1,5 tallas europeas.
  // La fórmula estándar es: talla ≈ (longitud del pie + 1,5 cm de holgura) × 1,5
  if (longitudPieCm) {
    if (longitudPieCm < 20 || longitudPieCm > 33) {
      return { error: "La longitud del pie debe estar entre 20 y 33 cm." };
    }
    const calculada = Math.round((longitudPieCm + 1.5) * 1.5);
    // Las botas se suelen llevar con calcetín más grueso.
    const talla = shape === "bota" ? calculada + 0 : calculada;
    return { talla: String(talla), metodo: "medida" };
  }

  if (tallaHabitual) {
    const num = Number(tallaHabitual);
    if (!num || num < 35 || num > 47) {
      return { error: "Indica una talla habitual entre 35 y 47." };
    }
    // Las botas de montaña se recomiendan medio número más, para el
    // calcetín técnico y para que el pie no choque en las bajadas.
    const talla = shape === "bota" ? num + 1 : num;
    return {
      talla: String(Math.min(47, talla)),
      metodo: "habitual",
      nota: shape === "bota" ? "En botas recomendamos un número más para llevar calcetín grueso." : null,
    };
  }

  return { error: "Dime tu talla habitual de calzado o la longitud de tu pie en centímetros." };
}

module.exports = { recomendarTalla, recomendarCalzado, ORDEN_TALLAS };

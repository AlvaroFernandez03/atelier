// js/product-art.js
//
// Dibuja cada producto como una silueta SVG coloreada, en vez de usar fotos.
// Ventajas para este proyecto: todas las imágenes son consistentes entre sí,
// cargan al instante, no dependen de internet, y el color cambia según la
// variante que elija el cliente (algo que con fotos exigiría una foto por
// cada color de cada producto).
//
// Cada silueta se dibuja sobre un lienzo de 200x200 para que todas ocupen
// lo mismo y la cuadrícula del catálogo quede alineada.

// Oscurece un color hex un porcentaje dado. Lo usamos para las sombras y los
// detalles (costuras, suelas), así cada prenda tiene profundidad sin
// necesidad de definir un segundo color a mano para cada una.
function shade(hex, percent) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + Math.round(255 * percent)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + Math.round(255 * percent)));
  const b = Math.max(0, Math.min(255, (n & 0xff) + Math.round(255 * percent)));
  return `rgb(${r},${g},${b})`;
}

const SHAPES = {
  camiseta(c) {
    const dark = shade(c, -0.14);
    return `
      <path d="M70 42 L52 52 L38 78 L56 90 L64 78 L64 158 L136 158 L136 78 L144 90 L162 78 L148 52 L130 42
               C126 54 116 60 100 60 C84 60 74 54 70 42 Z" fill="${c}"/>
      <path d="M70 42 C74 54 84 60 100 60 C116 60 126 54 130 42 L122 39
               C119 48 111 52 100 52 C89 52 81 48 78 39 Z" fill="${dark}"/>
      <path d="M64 78 L64 158 L74 158 L74 80 Z" fill="${dark}" opacity=".35"/>
    `;
  },

  sudadera(c) {
    const dark = shade(c, -0.13);
    const darker = shade(c, -0.26);
    return `
      <!-- Mangas largas, que es lo que distingue una sudadera de una camiseta -->
      <path d="M66 54 L40 66 L28 142 L52 150 L62 96 Z" fill="${dark}"/>
      <path d="M134 54 L160 66 L172 142 L148 150 L138 96 Z" fill="${dark}"/>
      <!-- Cuerpo -->
      <path d="M66 54 L62 96 L62 168 L138 168 L138 96 L134 54 C124 62 110 66 100 66 C90 66 76 62 66 54 Z" fill="${c}"/>
      <!-- Capucha: por detrás de los hombros, asomando por arriba -->
      <path d="M74 50 C74 30 126 30 126 50 C126 62 114 68 100 68 C86 68 74 62 74 50 Z" fill="${darker}"/>
      <path d="M84 56 C90 66 110 66 116 56 C110 62 90 62 84 56 Z" fill="${shade(c, -0.36)}"/>
      <!-- Cordones -->
      <path d="M92 64 L90 84" stroke="${shade(c, 0.3)}" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M108 64 L110 84" stroke="${shade(c, 0.3)}" stroke-width="3" stroke-linecap="round" fill="none"/>
      <!-- Bolsillo canguro -->
      <path d="M74 120 L126 120 L122 148 L78 148 Z" fill="${dark}"/>
      <!-- Puños y bajo elástico -->
      <rect x="62" y="156" width="76" height="12" fill="${dark}"/>
      <path d="M28 142 L52 150 L50 160 L26 152 Z" fill="${darker}"/>
      <path d="M172 142 L148 150 L150 160 L174 152 Z" fill="${darker}"/>
    `;
  },

  pantalon(c) {
    const dark = shade(c, -0.15);
    return `
      <path d="M66 40 L134 40 L138 76 L130 172 L106 172 L100 96 L94 172 L70 172 L62 76 Z" fill="${c}"/>
      <rect x="64" y="40" width="72" height="12" fill="${dark}"/>
      <path d="M100 52 L100 96" stroke="${dark}" stroke-width="2.5" fill="none"/>
      <path d="M70 60 L78 60" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>
      <path d="M122 60 L130 60" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>
    `;
  },

  chaqueta(c) {
    const dark = shade(c, -0.14);
    const darker = shade(c, -0.3);
    return `
      <!-- Mangas largas -->
      <path d="M68 52 L42 64 L30 144 L54 152 L64 96 Z" fill="${dark}"/>
      <path d="M132 52 L158 64 L170 144 L146 152 L136 96 Z" fill="${dark}"/>
      <!-- Cuerpo, dividido en dos frentes que se cierran en el centro -->
      <path d="M68 52 L64 96 L64 166 L100 166 L100 62 Z" fill="${c}"/>
      <path d="M132 52 L136 96 L136 166 L100 166 L100 62 Z" fill="${dark}"/>
      <!-- Solapas del cuello -->
      <path d="M68 52 L100 62 L86 82 L74 60 Z" fill="${darker}"/>
      <path d="M132 52 L100 62 L114 82 L126 60 Z" fill="${darker}"/>
      <!-- Cremallera central -->
      <path d="M100 62 L100 166" stroke="${darker}" stroke-width="3" fill="none"/>
      <!-- Bolsillos de pecho -->
      <path d="M74 96 L92 96 L92 112 L74 112 Z" fill="${darker}" opacity=".5"/>
      <path d="M108 96 L126 96 L126 112 L108 112 Z" fill="${darker}" opacity=".5"/>
      <!-- Bajo -->
      <rect x="64" y="156" width="72" height="10" fill="${darker}" opacity=".55"/>
    `;
  },

  zapatilla(c) {
    const dark = shade(c, -0.18);
    const sole = "#E8E5DF";
    const soleDark = "#C9C5BC";
    return `
      <path d="M38 120 C38 100 52 74 74 68 C86 65 92 72 98 82 C106 96 120 104 140 108
               C156 111 166 118 166 130 L166 138 L38 138 Z" fill="${c}"/>
      <path d="M74 68 C86 65 92 72 98 82 L84 92 C78 82 74 74 74 68 Z" fill="${dark}"/>
      <path d="M104 90 C114 100 126 106 140 110" stroke="${dark}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M36 138 L168 138 C172 138 174 141 174 146 C174 152 170 156 164 156 L46 156
               C39 156 34 150 34 144 C34 140 34 138 36 138 Z" fill="${sole}"/>
      <path d="M34 148 L174 148" stroke="${soleDark}" stroke-width="2"/>
      <path d="M62 84 L72 92" stroke="${sole}" stroke-width="3" stroke-linecap="round" opacity=".85"/>
      <path d="M70 76 L80 86" stroke="${sole}" stroke-width="3" stroke-linecap="round" opacity=".85"/>
      <path d="M78 70 L88 82" stroke="${sole}" stroke-width="3" stroke-linecap="round" opacity=".85"/>
    `;
  },

  bota(c) {
    const dark = shade(c, -0.16);
    const darker = shade(c, -0.3);
    const sole = "#3A3733";
    return `
      <!-- Caña alta y estrecha: es lo que distingue una bota de una zapatilla -->
      <path d="M64 34 L112 34 L114 96 C118 108 132 116 150 122 C162 126 166 132 166 140 L64 140 Z" fill="${c}"/>
      <!-- Borde superior de la caña -->
      <path d="M62 34 L114 34 L114 48 L62 48 Z" fill="${darker}"/>
      <!-- Puntera, en tono más oscuro -->
      <path d="M120 100 C132 110 146 116 158 122 C163 125 166 132 166 140 L120 140 Z" fill="${dark}"/>
      <!-- Ojales y cordones -->
      <path d="M72 58 L104 58" stroke="${darker}" stroke-width="3" stroke-linecap="round" opacity=".75"/>
      <path d="M72 72 L106 72" stroke="${darker}" stroke-width="3" stroke-linecap="round" opacity=".75"/>
      <path d="M72 86 L108 86" stroke="${darker}" stroke-width="3" stroke-linecap="round" opacity=".75"/>
      <path d="M72 100 L110 100" stroke="${darker}" stroke-width="3" stroke-linecap="round" opacity=".75"/>
      <!-- Suela gruesa con dibujo -->
      <path d="M60 140 L170 140 C175 140 178 144 178 150 C178 157 173 162 166 162 L68 162
               C61 162 56 156 56 149 C56 144 57 140 60 140 Z" fill="${sole}"/>
      <path d="M70 162 L74 152" stroke="${shade("#3A3733", 0.14)}" stroke-width="3" stroke-linecap="round"/>
      <path d="M92 162 L96 152" stroke="${shade("#3A3733", 0.14)}" stroke-width="3" stroke-linecap="round"/>
      <path d="M114 162 L118 152" stroke="${shade("#3A3733", 0.14)}" stroke-width="3" stroke-linecap="round"/>
      <path d="M136 162 L140 152" stroke="${shade("#3A3733", 0.14)}" stroke-width="3" stroke-linecap="round"/>
      <path d="M158 162 L162 152" stroke="${shade("#3A3733", 0.14)}" stroke-width="3" stroke-linecap="round"/>
    `;
  },
};

// Devuelve el SVG completo de un producto, con el color indicado.
// "shape" es el tipo de prenda guardado en la base de datos.
function productSvg(shape, colorHex, options = {}) {
  const draw = SHAPES[shape] || SHAPES.camiseta;
  const bg = options.background || "transparent";
  return `
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="product-art" role="img"
         aria-label="Ilustración del producto">
      ${bg !== "transparent" ? `<rect width="200" height="200" fill="${bg}"/>` : ""}
      ${draw(colorHex)}
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// productMedia — lo que se usa en toda la tienda para mostrar un producto
// ---------------------------------------------------------------------------
// Sistema híbrido: si el producto tiene una foto asignada Y el archivo existe
// de verdad en img/productos/, se muestra la foto. Si no (o si falla al
// cargar), se muestra la silueta SVG.
//
// Esto permite ir añadiendo fotos poco a poco sin que el catálogo se rompa
// nunca: los productos sin foto siguen viéndose perfectamente con su dibujo.
//
// Guardamos los datos necesarios en atributos data-* de la imagen, y un
// único listener global (más abajo) se encarga de sustituirla por el SVG si
// da error. Es más fiable que meter el SVG dentro de un atributo onerror,
// porque el SVG contiene comillas que romperían el HTML.
function productMedia(product, colorHex, options = {}) {
  const alt = options.alt || product.name || "Producto";

  if (product.image_file) {
    return `
      <img src="img/productos/${product.image_file}" alt="${alt}" class="product-photo" loading="lazy"
           data-fallback-shape="${product.shape}" data-fallback-color="${colorHex}">
    `;
  }

  return productSvg(product.shape, colorHex, options);
}

// Escucha los errores de carga de imágenes en toda la página. Usamos la fase
// de captura (el "true" final) porque el evento "error" de las imágenes no
// burbujea de forma normal y, si no, no llegaría hasta aquí.
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (img.tagName !== "IMG" || !img.dataset.fallbackShape) return;

    const svg = productSvg(img.dataset.fallbackShape, img.dataset.fallbackColor || "#9CA0A8");
    img.insertAdjacentHTML("afterend", svg);
    img.remove();
  },
  true
);

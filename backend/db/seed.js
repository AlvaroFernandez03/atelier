// db/seed.js
// Rellena la tienda con un catálogo de ejemplo la primera vez que arranca.
// Las marcas son inventadas a propósito: usar marcas reales (con sus logos y
// fotos) en un proyecto público sería un problema de propiedad intelectual.

const bcrypt = require("bcryptjs");

// Tallas estándar según el tipo de producto
const SIZES_ROPA = ["XS", "S", "M", "L", "XL"];
const SIZES_CALZADO = ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47"];

// Paleta de colores disponible para las prendas. El hex se usa tanto para
// pintar la silueta SVG del producto como para el selector de color.
const COLORS = {
  negro: { name: "Negro", hex: "#1F1F23" },
  blanco: { name: "Blanco", hex: "#F2F0EC" },
  gris: { name: "Gris jaspeado", hex: "#9CA0A8" },
  marino: { name: "Azul marino", hex: "#26334D" },
  verde: { name: "Verde oliva", hex: "#5C6B4A" },
  beige: { name: "Beige", hex: "#C9B79C" },
  burdeos: { name: "Burdeos", hex: "#6E2733" },
  celeste: { name: "Celeste", hex: "#8FB3CC" },
  mostaza: { name: "Mostaza", hex: "#C99A3B" },
  rosa: { name: "Rosa palo", hex: "#D9A7A7" },
};

function seed(db) {
  // Si ya hay productos, no volvemos a sembrar (esto solo corre la primera vez).
  const existing = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
  if (existing > 0) return;

  // --- Categorías ---
  const insertCategory = db.prepare("INSERT INTO categories (name, slug, kind) VALUES (?, ?, ?)");
  const cat = {
    camisetas: insertCategory.run("Camisetas", "camisetas", "ropa").lastInsertRowid,
    sudaderas: insertCategory.run("Sudaderas", "sudaderas", "ropa").lastInsertRowid,
    pantalones: insertCategory.run("Pantalones", "pantalones", "ropa").lastInsertRowid,
    chaquetas: insertCategory.run("Chaquetas", "chaquetas", "ropa").lastInsertRowid,
    zapatillas: insertCategory.run("Zapatillas", "zapatillas", "calzado").lastInsertRowid,
    botas: insertCategory.run("Botas", "botas", "calzado").lastInsertRowid,
  };

  // --- Marcas (ficticias) ---
  const insertBrand = db.prepare("INSERT INTO brands (name, slug) VALUES (?, ?)");
  const brand = {
    northline: insertBrand.run("Northline", "northline").lastInsertRowid,
    vela: insertBrand.run("Vela Studio", "vela-studio").lastInsertRowid,
    kudo: insertBrand.run("Kudo", "kudo").lastInsertRowid,
    ferrer: insertBrand.run("Ferrer & Co", "ferrer-co").lastInsertRowid,
    duna: insertBrand.run("Duna", "duna").lastInsertRowid,
  };

  const insertProduct = db.prepare(`
    INSERT INTO products (name, description, price_cents, category_id, brand_id, shape, gender, image_file)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVariant = db.prepare(`
    INSERT INTO variants (product_id, size, color_name, color_hex, stock) VALUES (?, ?, ?, ?, ?)
  `);

  // Crea un producto y todas sus variantes (una por cada combinación de
  // talla y color). El stock varía: algunas tallas quedan agotadas a
  // propósito, para que se vea cómo se comporta la tienda en ese caso.
  // "image" es el nombre del archivo de foto que el catálogo buscará en
  // frontend/img/productos/. Si el archivo no existe, la tienda cae
  // automáticamente en la silueta SVG, así que no pasa nada por dejarlo
  // apuntando a fotos que todavía no has descargado.
  function addProduct({ name, description, price, category, brand, shape, gender, colors, sizes, image }) {
    const productId = insertProduct.run(
      name, description, price, category, brand, shape, gender, image || null
    ).lastInsertRowid;

    colors.forEach((colorKey) => {
      const color = COLORS[colorKey];
      sizes.forEach((size) => {
        // Stock pseudo-aleatorio: la mayoría con existencias, alguna agotada.
        const roll = Math.random();
        const stock = roll < 0.12 ? 0 : Math.floor(Math.random() * 12) + 1;
        insertVariant.run(productId, size, color.name, color.hex, stock);
      });
    });
    return productId;
  }

  // ---------------- CAMISETAS ----------------
  addProduct({
    name: "Camiseta básica de algodón",
    description:
      "Camiseta de manga corta en algodón peinado de 180 g. Cuello redondo reforzado y corte recto que no se deforma con los lavados. La prenda de fondo de armario que se pone sola.",
    price: 1995, category: cat.camisetas, brand: brand.northline, shape: "camiseta", gender: "unisex",
    colors: ["negro", "blanco", "gris", "marino"], sizes: SIZES_ROPA,
    image: "camiseta-basica.jpg",
  });
  addProduct({
    name: "Camiseta oversize lavado vintage",
    description:
      "Corte amplio con hombro caído y tejido lavado a la piedra, que le da ese aspecto de camiseta que llevas años usando. Algodón orgánico de 220 g.",
    price: 2795, category: cat.camisetas, brand: brand.vela, shape: "camiseta", gender: "unisex",
    colors: ["beige", "verde", "burdeos"], sizes: SIZES_ROPA,
    image: "camiseta-oversize.jpg",
  });
  addProduct({
    name: "Camiseta técnica de running",
    description:
      "Tejido ligero y transpirable que seca rápido, con costuras planas para evitar rozaduras en carreras largas. Pensada para entrenar, no para estar guapo (aunque también).",
    price: 3250, category: cat.camisetas, brand: brand.kudo, shape: "camiseta", gender: "unisex",
    colors: ["negro", "celeste", "mostaza"], sizes: SIZES_ROPA,
    image: "camiseta-running.jpg",
  });

  // ---------------- SUDADERAS ----------------
  addProduct({
    name: "Sudadera con capucha",
    description:
      "Felpa interior cepillada de 320 g, capucha forrada con cordón plano y bolsillo canguro. Abriga de verdad sin dar sensación de bulto.",
    price: 4995, category: cat.sudaderas, brand: brand.northline, shape: "sudadera", gender: "unisex",
    colors: ["negro", "gris", "marino", "verde"], sizes: SIZES_ROPA,
    image: "sudadera-capucha.jpg",
  });
  addProduct({
    name: "Sudadera cuello redondo",
    description:
      "Corte clásico sin capucha, con puños y bajo elásticos. Algodón mezclado que mantiene la forma lavado tras lavado.",
    price: 4250, category: cat.sudaderas, brand: brand.vela, shape: "sudadera", gender: "unisex",
    colors: ["beige", "burdeos", "celeste"], sizes: SIZES_ROPA,
    image: "sudadera-cuello-redondo.jpg",
  });

  // ---------------- PANTALONES ----------------
  addProduct({
    name: "Vaquero recto",
    description:
      "Denim de 12 oz con un punto de elastano para que no tire al sentarse. Corte recto de pierna, tiro medio, cinco bolsillos.",
    price: 5995, category: cat.pantalones, brand: brand.ferrer, shape: "pantalon", gender: "unisex",
    colors: ["marino", "negro", "celeste"], sizes: SIZES_ROPA,
    image: "vaquero-recto.jpg",
  });
  addProduct({
    name: "Pantalón chino",
    description:
      "Sarga de algodón con caída suave, ni muy formal ni muy informal. Funciona igual con zapatillas que con botas.",
    price: 4595, category: cat.pantalones, brand: brand.ferrer, shape: "pantalon", gender: "unisex",
    colors: ["beige", "verde", "marino"], sizes: SIZES_ROPA,
    image: "pantalon-chino.jpg",
  });
  addProduct({
    name: "Pantalón jogger",
    description:
      "Cintura elástica con cordón y bajo ajustado. Felpa ligera pensada para llevar todo el día sin pensar en la ropa.",
    price: 3895, category: cat.pantalones, brand: brand.kudo, shape: "pantalon", gender: "unisex",
    colors: ["negro", "gris"], sizes: SIZES_ROPA,
    image: "pantalon-jogger.jpg",
  });

  // ---------------- CHAQUETAS ----------------
  addProduct({
    name: "Chaqueta vaquera",
    description:
      "Denim rígido que se va amoldando al cuerpo con el uso. Botones metálicos, dos bolsillos de pecho y ajuste en el bajo.",
    price: 7995, category: cat.chaquetas, brand: brand.ferrer, shape: "chaqueta", gender: "unisex",
    colors: ["marino", "negro"], sizes: SIZES_ROPA,
    image: "chaqueta-vaquera.jpg",
  });
  addProduct({
    name: "Cazadora ligera cortavientos",
    description:
      "Tejido técnico que corta el viento y aguanta una lluvia fina, y que se pliega hasta caber en una mochila pequeña.",
    price: 6950, category: cat.chaquetas, brand: brand.kudo, shape: "chaqueta", gender: "unisex",
    colors: ["negro", "verde", "mostaza"], sizes: SIZES_ROPA,
    image: "cazadora-cortavientos.jpg",
  });

  // ---------------- ZAPATILLAS ----------------
  addProduct({
    name: "Zapatilla urbana de piel",
    description:
      "Corte de piel flor con forro textil y suela de goma vulcanizada. Silueta limpia y baja que combina con casi todo.",
    price: 8995, category: cat.zapatillas, brand: brand.duna, shape: "zapatilla", gender: "unisex",
    colors: ["blanco", "negro", "beige"], sizes: SIZES_CALZADO,
    image: "zapatilla-urbana.jpg",
  });
  addProduct({
    name: "Zapatilla de running amortiguada",
    description:
      "Mediasuela de espuma de alta densidad con retorno de energía y malla transpirable en el empeine. Para entrenamientos diarios en asfalto.",
    price: 10995, category: cat.zapatillas, brand: brand.kudo, shape: "zapatilla", gender: "unisex",
    colors: ["negro", "celeste", "mostaza"], sizes: SIZES_CALZADO,
    image: "zapatilla-running.jpg",
  });
  addProduct({
    name: "Zapatilla retro de lona",
    description:
      "Lona de algodón encerado sobre suela de goma clásica. Diseño de los años setenta rescatado tal cual, sin actualizar de más.",
    price: 6495, category: cat.zapatillas, brand: brand.vela, shape: "zapatilla", gender: "unisex",
    colors: ["blanco", "burdeos", "marino", "verde"], sizes: SIZES_CALZADO,
    image: "zapatilla-retro.jpg",
  });

  // ---------------- BOTAS ----------------
  addProduct({
    name: "Bota chelsea de piel",
    description:
      "Piel engrasada con elásticos laterales y tirador trasero. Suela de goma con dibujo discreto que agarra en mojado.",
    price: 12995, category: cat.botas, brand: brand.duna, shape: "bota", gender: "unisex",
    colors: ["negro", "beige"], sizes: SIZES_CALZADO,
    image: "bota-chelsea.jpg",
  });
  addProduct({
    name: "Bota de montaña impermeable",
    description:
      "Membrana impermeable y transpirable, refuerzo en puntera y suela con tacos profundos. Para caminar por terreno irregular sin acabar con los pies mojados.",
    price: 14500, category: cat.botas, brand: brand.northline, shape: "bota", gender: "unisex",
    colors: ["verde", "negro", "beige"], sizes: SIZES_CALZADO,
    image: "bota-montana.jpg",
  });

  // --- Usuarios de ejemplo ---
  const defaultPassword = bcrypt.hashSync("cliente123", 10);
  const insertUser = db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
  );
  insertUser.run("Administración", "admin@tienda.com", defaultPassword, "admin");
  insertUser.run("Marta López", "marta@ejemplo.com", defaultPassword, "cliente");

  console.log("✅ Catálogo de ejemplo creado.");
  console.log("   Cuentas (contraseña: cliente123): admin@tienda.com · marta@ejemplo.com");
}

module.exports = { seed };

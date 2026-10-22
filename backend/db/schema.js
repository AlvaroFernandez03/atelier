// db/schema.js
// Define la estructura de todas las tablas. El punto clave de este proyecto
// es la separación entre PRODUCTO y VARIANTE:
//
//   products    -> "Camiseta básica de algodón", su marca, categoría, precio, descripción
//   variants    -> "esa camiseta, en negro, talla M" con SU PROPIO stock
//
// Esto es lo que hace que la tienda sea realista: no compras "una camiseta",
// compras una talla y un color concretos, y cada combinación puede estar
// agotada por separado.

function createTables(db) {
  // --- Catálogo ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('ropa', 'calzado')) -- determina el tipo de tallas y el dibujo
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price_cents INTEGER NOT NULL,          -- precio en CÉNTIMOS, ver nota abajo
      category_id INTEGER NOT NULL,
      brand_id INTEGER NOT NULL,
      shape TEXT NOT NULL,                   -- qué silueta SVG dibujar: camiseta, sudadera, zapatilla...
      image_file TEXT,                       -- nombre del archivo de foto, si lo hay (ver nota abajo)
      gender TEXT NOT NULL DEFAULT 'unisex' CHECK (gender IN ('hombre', 'mujer', 'unisex')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories (id),
      FOREIGN KEY (brand_id) REFERENCES brands (id)
    );
  `);

  // Nota sobre los precios: se guardan en CÉNTIMOS como número entero
  // (2999 = 29,99 €). Nunca se usan decimales para dinero, porque los
  // números decimales en programación pierden precisión al operar con ellos
  // (0.1 + 0.2 no da exactamente 0.3), y en una tienda eso sería inaceptable.

  db.exec(`
    CREATE TABLE IF NOT EXISTS variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      size TEXT NOT NULL,                    -- "M", "42", etc.
      color_name TEXT NOT NULL,              -- "Negro", "Azul marino"
      color_hex TEXT NOT NULL,               -- para pintar la silueta SVG y el selector de color
      stock INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products (id),
      UNIQUE (product_id, size, color_name)  -- no puede haber dos veces la misma combinación
    );
  `);

  // --- Clientes ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cliente' CHECK (role IN ('cliente', 'admin')),
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // --- Carrito ---
  // Un carrito puede pertenecer a un usuario registrado (user_id) O a una
  // visita anónima identificada por un "token de invitado" que guardamos en
  // el navegador. Así se puede comprar sin registrarse, y al iniciar sesión
  // fusionamos el carrito de invitado con el de la cuenta.
  db.exec(`
    CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      guest_token TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (cart_id) REFERENCES carts (id),
      FOREIGN KEY (variant_id) REFERENCES variants (id),
      UNIQUE (cart_id, variant_id)
    );
  `);

  // --- Pedidos ---
  // Importante: en order_items se COPIAN el nombre y el precio del producto
  // en el momento de la compra. Si mañana sube el precio o se renombra el
  // producto, el pedido antiguo debe seguir mostrando lo que el cliente
  // pagó realmente. Un pedido es un documento histórico, no una referencia viva.
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pagado'
        CHECK (status IN ('pagado', 'enviado', 'entregado', 'cancelado')),
      total_cents INTEGER NOT NULL,
      shipping_name TEXT NOT NULL,
      shipping_address TEXT NOT NULL,
      shipping_city TEXT NOT NULL,
      shipping_postal_code TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,      -- copiado en el momento de la compra
      brand_name TEXT NOT NULL,
      size TEXT NOT NULL,
      color_name TEXT NOT NULL,
      color_hex TEXT NOT NULL,
      shape TEXT NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders (id),
      FOREIGN KEY (variant_id) REFERENCES variants (id)
    );
  `);

  // --- Devoluciones ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_item_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'solicitada'
        CHECK (status IN ('solicitada', 'aceptada', 'rechazada')),
      requested_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT,
      FOREIGN KEY (order_item_id) REFERENCES order_items (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    );
  `);

  // --- Favoritos ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (product_id) REFERENCES products (id),
      UNIQUE (user_id, product_id)
    );
  `);
  // --- Reseñas de producto ---
  // Solo puede opinar quien ha comprado el producto: por eso guardamos el
  // order_item_id, que demuestra la compra. La restricción UNIQUE impide
  // dejar dos reseñas por la misma compra.
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      order_item_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      title TEXT,
      body TEXT,
      size_fit TEXT CHECK (size_fit IN ('pequena', 'justa', 'grande')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products (id),
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (order_item_id) REFERENCES order_items (id),
      UNIQUE (order_item_id)
    );
  `);

  // --- Migraciones ---
  // CREATE TABLE IF NOT EXISTS no modifica una tabla que ya existe, así que
  // las columnas añadidas después hay que incorporarlas con ALTER TABLE. Si
  // la columna ya está (base de datos nueva), SQLite da error y lo ignoramos.
  const migraciones = [
    "ALTER TABLE products ADD COLUMN image_file TEXT",
  ];
  migraciones.forEach((sql) => {
    try {
      db.exec(sql);
    } catch (err) {
      if (!String(err.message).includes("duplicate column")) throw err;
    }
  });
}

module.exports = { createTables };

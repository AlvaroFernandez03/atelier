// db/database.js
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { createTables } = require("./schema");
const { seed } = require("./seed");
const { seedDemo } = require("./seed-demo");

const dbPath = path.join(__dirname, "tienda.db");
const db = new DatabaseSync(dbPath);

db.exec("PRAGMA journal_mode = WAL;");
// Hace que SQLite respete de verdad las claves foráneas (por defecto vienen
// desactivadas por compatibilidad histórica). Así no se pueden crear
// registros que apunten a productos o usuarios que no existen.
db.exec("PRAGMA foreign_keys = ON;");

createTables(db);
seed(db);
seedDemo(db); // solo en la demo pública (DEMO=1)

module.exports = db;

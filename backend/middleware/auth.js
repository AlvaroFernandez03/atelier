// middleware/auth.js
const jwt = require("jsonwebtoken");
const db = require("../db/database");

// Exige sesión iniciada. Si no hay token válido, corta la petición.
function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Necesitas iniciar sesión para hacer esto." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Tu sesión ha caducado. Vuelve a iniciar sesión." });
  }
}

// Autenticación OPCIONAL: si hay token válido, identifica al usuario; si no,
// deja pasar igualmente con req.userId = null.
//
// Esto es lo que permite que alguien navegue y llene el carrito SIN estar
// registrado, que es como funciona cualquier tienda real. Las rutas del
// carrito usan este middleware en vez del estricto.
function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  req.userId = null;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = payload.userId;
    } catch (err) {
      // Token inválido o caducado: lo tratamos como visitante anónimo en vez
      // de dar error, para no romper la navegación de alguien que solo mira.
    }
  }
  next();
}

// Exige que el usuario sea administrador de la tienda.
function requireAdmin(req, res, next) {
  const user = db.prepare("SELECT role FROM users WHERE id = ?").get(req.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "No tienes permisos de administrador." });
  }
  next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin };

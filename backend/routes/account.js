// routes/account.js
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { requireAuth } = require("../middleware/auth");
const { sendPasswordChangedEmail } = require("../services/email");

const router = express.Router();
router.use(requireAuth);

// GET /api/account — mis datos (sin la contraseña, obviamente)
router.get("/", (req, res) => {
  const user = db
    .prepare("SELECT id, name, email, role, created_at FROM users WHERE id = ?")
    .get(req.userId);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado." });

  // Añadimos un par de cifras útiles para la cabecera del área de cliente.
  const pedidos = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id = ?").get(req.userId).c;
  const favoritos = db.prepare("SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?").get(req.userId).c;

  res.json({ ...user, order_count: pedidos, favorite_count: favoritos });
});

// PUT /api/account/name — cambiar el nombre que aparece en los pedidos
router.put("/name", (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "El nombre no puede estar vacío." });
  }

  db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name.trim(), req.userId);
  res.json({ success: true, name: name.trim() });
});

// ---------------------------------------------------------------------------
// PUT /api/account/password — cambiar la contraseña
// ---------------------------------------------------------------------------
router.put("/password", (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: "Indica tu contraseña actual y la nueva." });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres." });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado." });

  // Pedimos siempre la contraseña actual: si alguien deja la sesión abierta
  // en un ordenador compartido, que no baste con eso para secuestrar la
  // cuenta cambiándole la contraseña.
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: "La contraseña actual no es correcta." });
  }

  // Evitamos el caso absurdo de "cambiarla" por la misma que ya tenía.
  if (bcrypt.compareSync(new_password, user.password_hash)) {
    return res.status(400).json({ error: "La nueva contraseña debe ser distinta de la actual." });
  }

  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(bcrypt.hashSync(new_password, 10), req.userId);

  res.json({ success: true });

  // Aviso de seguridad en segundo plano, por si el cambio no lo hizo él.
  sendPasswordChangedEmail(user);
});

module.exports = router;

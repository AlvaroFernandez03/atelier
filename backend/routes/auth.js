// routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db/database");
const { mergeGuestCart } = require("../services/cartService");
const { sendWelcomeEmail } = require("../services/email");

const router = express.Router();

function isAdminEmail(email) {
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  return adminEmail && email.toLowerCase() === adminEmail;
}

function makeToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

// POST /api/auth/register
router.post("/register", (req, res) => {
  const { name, email, password, guest_token } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Nombre, email y contraseña son obligatorios." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: "Ya hay una cuenta con ese email." });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const role = isAdminEmail(email) ? "admin" : "cliente";

  const result = db
    .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(name, email.toLowerCase(), passwordHash, role);

  const userId = result.lastInsertRowid;

  // Si venía navegando como invitado con cosas en el carrito, se las
  // trasladamos a su cuenta recién creada para que no las pierda.
  if (guest_token) mergeGuestCart(guest_token, userId);

  res.status(201).json({
    token: makeToken(userId),
    user: { id: userId, name, email: email.toLowerCase(), role },
  });

  // En segundo plano: la respuesta ya se ha enviado, así que si el email
  // tarda o falla no afecta a la experiencia de quien acaba de registrarse.
  sendWelcomeEmail({ name, email: email.toLowerCase() });
});

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { email, password, guest_token } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña son obligatorios." });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Email o contraseña incorrectos." });
  }

  // Auto-corrección: si este email es el configurado como ADMIN_EMAIL pero
  // la cuenta aún no tiene ese rol, se lo damos al iniciar sesión.
  let role = user.role;
  if (isAdminEmail(user.email) && role !== "admin") {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
    role = "admin";
  }

  if (guest_token) mergeGuestCart(guest_token, user.id);

  res.json({
    token: makeToken(user.id),
    user: { id: user.id, name: user.name, email: user.email, role },
  });
});

module.exports = router;

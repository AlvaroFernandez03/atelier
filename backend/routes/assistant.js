// routes/assistant.js
const express = require("express");
const { responder } = require("../services/assistant");

const router = express.Router();

// POST /api/assistant — hacer una pregunta al asistente
// No requiere sesión: cualquiera que esté navegando puede preguntar,
// igual que en el chat de atención al cliente de cualquier tienda.
router.post("/", (req, res) => {
  const { mensaje, product_id } = req.body;

  if (!mensaje || typeof mensaje !== "string") {
    return res.status(400).json({ error: "Escribe tu pregunta." });
  }
  if (mensaje.length > 500) {
    return res.status(400).json({ error: "La pregunta es demasiado larga." });
  }

  const respuesta = responder({ mensaje, productId: product_id || null });
  res.json(respuesta);
});

module.exports = router;

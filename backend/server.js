// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const catalogRoutes = require("./routes/catalog");
const cartRoutes = require("./routes/cart");
const orderRoutes = require("./routes/orders");
const returnRoutes = require("./routes/returns");
const adminRoutes = require("./routes/admin");
const favoriteRoutes = require("./routes/favorites");
const accountRoutes = require("./routes/account");
const assistantRoutes = require("./routes/assistant");
const reviewRoutes = require("./routes/reviews");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Solo en la demo pública del portfolio (DEMO=1): cinta con las cuentas de prueba. Ver demo.js.
require("./demo")(app, path.join(__dirname, "..", "frontend"));
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.use("/api/auth", authRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/reviews", reviewRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`✅ Tienda corriendo en http://localhost:${PORT}`);
});

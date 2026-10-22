// services/email.js
//
// Igual que en los proyectos anteriores: si no configuras RESEND_API_KEY en
// tu .env, la tienda funciona con normalidad pero sin enviar correos.

const { Resend } = require("resend");

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;
const FROM = "Atelier <onboarding@resend.dev>";
const URL_BASE = process.env.FRONTEND_URL || "http://localhost:3000";

let warned = false;
function warnIfNotConfigured() {
  if (!resend && !warned) {
    console.log("ℹ️  RESEND_API_KEY no configurada: los emails no se enviarán (ver README).");
    warned = true;
  }
}

function euros(cents) {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

// Plantilla común. Los emails no admiten hojas de estilo externas: los
// clientes de correo las ignoran, así que todo va en atributos style.
function layout(title, body) {
  return `
  <div style="font-family:Helvetica,Arial,sans-serif; background:#FAF8F5; padding:32px;">
    <div style="max-width:520px; margin:0 auto; background:#fff; border:1px solid #E5E1D9; border-radius:10px; overflow:hidden;">
      <div style="padding:22px 28px; border-bottom:1px solid #E5E1D9;">
        <span style="font-size:20px; font-weight:600; letter-spacing:-0.02em; color:#1A1A1C;">Atelier</span>
      </div>
      <div style="padding:28px;">
        <h1 style="font-size:19px; color:#1A1A1C; margin:0 0 14px;">${title}</h1>
        ${body}
      </div>
      <div style="padding:16px; background:#FAF8F5; text-align:center; color:#93939C; font-size:11px;">
        Atelier · Proyecto de práctica y portfolio
      </div>
    </div>
  </div>`;
}

function boton(texto, url) {
  return `<a href="${url}" style="display:inline-block; margin-top:16px; background:#1A1A1C; color:#fff;
          padding:12px 22px; border-radius:4px; text-decoration:none; font-weight:500; font-size:14px;">${texto}</a>`;
}

// ---------------------------------------------------------------------------
async function sendWelcomeEmail(user) {
  warnIfNotConfigured();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: FROM,
      to: [user.email],
      subject: "Bienvenido a Atelier",
      html: layout(
        `Hola ${user.name}`,
        `<p style="color:#5F5F66; line-height:1.6; margin:0;">
           Tu cuenta ya está creada. A partir de ahora tus pedidos y devoluciones
           quedan guardados en tu área de cliente.
         </p>
         ${boton("Ver el catálogo", `${URL_BASE}/catalogo.html`)}`
      ),
    });
  } catch (err) {
    console.error("No se pudo enviar el email de bienvenida:", err.message);
  }
}

// ---------------------------------------------------------------------------
async function sendOrderConfirmation(user, order) {
  warnIfNotConfigured();
  if (!resend) return;

  const filas = order.items
    .map(
      (i) => `
      <tr>
        <td style="padding:10px 0; border-bottom:1px solid #E5E1D9;">
          <div style="font-weight:500; color:#1A1A1C;">${i.product_name}</div>
          <div style="color:#93939C; font-size:13px;">${i.brand_name} · ${i.color_name} · Talla ${i.size}${
        i.quantity > 1 ? ` · ${i.quantity} uds.` : ""
      }</div>
        </td>
        <td style="padding:10px 0; border-bottom:1px solid #E5E1D9; text-align:right; white-space:nowrap; color:#1A1A1C;">
          ${euros(i.unit_price_cents * i.quantity)}
        </td>
      </tr>`
    )
    .join("");

  try {
    await resend.emails.send({
      from: FROM,
      to: [user.email],
      subject: `Pedido confirmado · nº ${order.id}`,
      html: layout(
        "Hemos recibido tu pedido",
        `<p style="color:#5F5F66; line-height:1.6; margin:0 0 18px;">
           Gracias ${user.name}. Este es el resumen de tu pedido nº ${order.id}:
         </p>
         <table style="width:100%; border-collapse:collapse; font-size:14px;">${filas}</table>
         <table style="width:100%; margin-top:14px; font-size:14px; color:#1A1A1C;">
           <tr><td style="padding:3px 0; color:#5F5F66;">Subtotal</td>
               <td style="text-align:right;">${euros(order.subtotal_cents)}</td></tr>
           <tr><td style="padding:3px 0; color:#5F5F66;">Envío</td>
               <td style="text-align:right;">${order.shipping_cents === 0 ? "Gratis" : euros(order.shipping_cents)}</td></tr>
           <tr><td style="padding:8px 0 0; font-weight:600; border-top:1px solid #E5E1D9;">Total</td>
               <td style="text-align:right; font-weight:600; border-top:1px solid #E5E1D9; padding-top:8px;">${euros(order.total_cents)}</td></tr>
         </table>
         <p style="color:#5F5F66; line-height:1.6; margin:20px 0 0; font-size:13px;">
           Enviamos a:<br>
           ${order.shipping_name}<br>
           ${order.shipping_address}<br>
           ${order.shipping_postal_code} ${order.shipping_city}
         </p>
         ${boton("Ver mi pedido", `${URL_BASE}/pedido.html?id=${order.id}`)}`
      ),
    });
  } catch (err) {
    console.error("No se pudo enviar la confirmación de pedido:", err.message);
  }
}

// ---------------------------------------------------------------------------
async function sendPasswordChangedEmail(user) {
  warnIfNotConfigured();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: FROM,
      to: [user.email],
      subject: "Tu contraseña de Atelier ha cambiado",
      html: layout(
        "Contraseña actualizada",
        `<p style="color:#5F5F66; line-height:1.6; margin:0;">
           Hola ${user.name}, tu contraseña se ha cambiado correctamente.
         </p>
         <p style="color:#93939C; line-height:1.6; font-size:13px; margin:14px 0 0;">
           Si no has sido tú, escríbenos cuanto antes desde el email de tu cuenta.
         </p>`
      ),
    });
  } catch (err) {
    console.error("No se pudo enviar el aviso de contraseña:", err.message);
  }
}

module.exports = { sendWelcomeEmail, sendOrderConfirmation, sendPasswordChangedEmail };

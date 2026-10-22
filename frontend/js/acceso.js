// js/acceso.js
document.addEventListener("DOMContentLoaded", async () => {
  await renderHeader();

  // Si ya hay sesión, no tiene sentido quedarse aquí.
  if (getToken()) {
    window.location.href = "cuenta.html";
    return;
  }

  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");

  function showTab(which) {
    const isLogin = which === "login";
    tabLogin.classList.toggle("is-active", isLogin);
    tabRegister.classList.toggle("is-active", !isLogin);
    loginForm.classList.toggle("hidden", !isLogin);
    registerForm.classList.toggle("hidden", isLogin);
  }
  tabLogin.addEventListener("click", () => showTab("login"));
  tabRegister.addEventListener("click", () => showTab("register"));

  loginForm.addEventListener("submit", (e) => submitAuth(e, "login"));
  registerForm.addEventListener("submit", (e) => submitAuth(e, "register"));
});

async function submitAuth(e, mode) {
  e.preventDefault();
  const msg = document.getElementById(`${mode}-msg`);
  msg.textContent = "";
  msg.className = "form-message";

  // Enviamos el token de invitado para que el servidor traslade a la cuenta
  // lo que hubiera en el carrito antes de identificarse.
  const guestToken = localStorage.getItem("tienda_guest");

  const body =
    mode === "login"
      ? {
          email: document.getElementById("l-email").value.trim(),
          password: document.getElementById("l-password").value,
          guest_token: guestToken,
        }
      : {
          name: document.getElementById("r-name").value.trim(),
          email: document.getElementById("r-email").value.trim(),
          password: document.getElementById("r-password").value,
          guest_token: guestToken,
        };

  try {
    const data = await api(`/auth/${mode}`, { method: "POST", body: JSON.stringify(body) });
    saveSession(data.token, data.user);

    // Si venía de tramitar un pedido, lo devolvemos allí; si no, a su cuenta.
    const next = new URLSearchParams(location.search).get("next");
    window.location.href = next || "cuenta.html";
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("error");
  }
}

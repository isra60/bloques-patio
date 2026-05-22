const SESSION_COOKIE = "bloques_session";
const SESSION_DAYS = 7;

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (!env.BLOQUES_PASSWORD) {
    return new Response("Falta configurar BLOQUES_PASSWORD en Cloudflare Pages.", { status: 500 });
  }

  if (url.pathname === "/acceso" && request.method === "POST") {
    return handleLogin(request, env);
  }

  if (url.pathname === "/salir") {
    return new Response("", {
      status: 302,
      headers: {
        Location: "/",
        "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
      }
    });
  }

  if (await hasValidSession(request, env)) {
    return next();
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("No autorizado", { status: 401 });
  }

  return loginPage(url.searchParams.get("error"));
}

async function handleLogin(request, env) {
  const form = await request.formData();
  const password = String(form.get("password") || "");

  if (password !== env.BLOQUES_PASSWORD) {
    return new Response("", {
      status: 302,
      headers: { Location: "/?error=1" }
    });
  }

  const token = await sessionToken(env);
  return new Response("", {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`
    }
  });
}

async function hasValidSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return false;
  return match[1] === await sessionToken(env);
}

async function sessionToken(env) {
  const bytes = new TextEncoder().encode(`bloques-patio:${env.BLOQUES_PASSWORD}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function loginPage(error) {
  return new Response(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Acceso - Bloques Patio</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f4f6f4;
        color: #17211b;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      form {
        width: min(420px, calc(100vw - 32px));
        display: grid;
        gap: 16px;
        padding: 28px;
        background: #fff;
        border: 1px solid #d8ded9;
        border-radius: 8px;
        box-shadow: 0 10px 24px rgba(23, 33, 27, 0.08);
      }
      p { margin: 0; color: #0f5d73; font-size: 12px; font-weight: 800; text-transform: uppercase; }
      h1 { margin: 0; font-size: 30px; }
      label { display: grid; gap: 6px; color: #66756b; font-size: 13px; font-weight: 700; }
      input {
        width: 100%;
        min-height: 42px;
        border: 1px solid #d8ded9;
        border-radius: 6px;
        padding: 9px 10px;
        font: inherit;
      }
      button {
        min-height: 42px;
        border: 0;
        border-radius: 6px;
        background: #176f52;
        color: #fff;
        cursor: pointer;
        font: inherit;
        font-weight: 800;
      }
      .error { color: #b42318; min-height: 18px; font-size: 13px; text-transform: none; }
    </style>
  </head>
  <body>
    <form method="post" action="/acceso">
      <div>
        <p>Control de palets</p>
        <h1>Bloques Patio</h1>
      </div>
      <label>
        Contrasena
        <input name="password" type="password" autocomplete="current-password" autofocus required>
      </label>
      <button type="submit">Entrar</button>
      <p class="error">${error ? "Contrasena incorrecta" : ""}</p>
    </form>
  </body>
</html>`, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}


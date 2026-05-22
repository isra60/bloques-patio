const SESSION_COOKIE = "bloques_session";
const SESSION_DAYS = 7;

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Enforce HTTPS in production
  if (url.protocol === "http:" && !url.hostname.includes("localhost") && !url.hostname.includes("127.0.0.1")) {
    return new Response("", {
      status: 301,
      headers: {
        Location: request.url.replace("http://", "https://"),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
      }
    });
  }

  if (!env.BLOQUES_PASSWORD) {
    return new Response("Falta configurar BLOQUES_PASSWORD en Cloudflare Pages.", { status: 500 });
  }

  if (url.pathname === "/acceso" && request.method === "POST") {
    return handleLogin(request, env);
  }

  if (url.pathname === "/salir") {
    return new Response("", {
      status: 303,
      headers: {
        Location: "/",
        "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
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
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  const contentType = request.headers.get("Content-Type") || "";
  let password = "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    password = String(body.password || "").trim();
  } else {
    const form = await request.formData();
    password = String(form.get("password") || "").trim();
  }

  if (password !== env.BLOQUES_PASSWORD) {
    if (wantsJson) {
      return json({ ok: false, message: "Contraseña incorrecta" }, 401);
    }
    return loginPage("1", 401);
  }

  const token = await sessionToken(env);
  const cookie = `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`;

  if (wantsJson) {
    return json({ ok: true }, 200, {
      "Set-Cookie": cookie,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
    });
  }

  return new Response("", {
    status: 303,
    headers: {
      Location: "/",
      "Set-Cookie": cookie,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
    }
  });
}

async function hasValidSession(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const expectedToken = await sessionToken(env);

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split("=");
    const value = valueParts.join("=");
    if (name === SESSION_COOKIE && value === expectedToken) {
      return true;
    }
  }
  return false;
}

async function sessionToken(env) {
  const bytes = new TextEncoder().encode(`bloques-patio:${env.BLOQUES_PASSWORD}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function loginPage(error, status = 200) {
  return new Response(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Acceso - Bloques Patio</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
    <style>
      :root {
        color-scheme: light dark;
        --bg-gradient: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
        --bg: #f8fafc;
        --surface: rgba(255, 255, 255, 0.75);
        --surface-solid: #ffffff;
        --line: rgba(226, 232, 240, 0.8);
        --text: #0f172a;
        --text-muted: #64748b;
        --accent: #0f766e;
        --accent-hover: #115e59;
        --accent-light: rgba(15, 118, 110, 0.08);
        --danger: #e11d48;
        --shadow-xl: 0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.1);
        --glass-bg: rgba(255, 255, 255, 0.7);
        --glass-border: rgba(255, 255, 255, 0.5);
        --glass-blur: blur(14px);
        --radius-md: 10px;
        --radius-lg: 14px;
        --transition-smooth: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --bg-gradient: linear-gradient(135deg, #090d16 0%, #020617 100%);
          --bg: #030712;
          --surface: rgba(15, 23, 42, 0.65);
          --surface-solid: #0f172a;
          --line: rgba(51, 65, 85, 0.5);
          --text: #f8fafc;
          --text-muted: #94a3b8;
          --accent: #14b8a6;
          --accent-hover: #2dd4bf;
          --accent-light: rgba(20, 184, 166, 0.12);
          --danger: #fb7185;
          --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
          --glass-bg: rgba(15, 23, 42, 0.5);
          --glass-border: rgba(255, 255, 255, 0.05);
        }
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: var(--bg-gradient);
        background-attachment: fixed;
        color: var(--text);
        font-family: "Plus Jakarta Sans", "Inter", sans-serif;
        padding: 24px;
      }

      form {
        width: min(400px, 100%);
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 32px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-lg);
        backdrop-filter: var(--glass-blur);
        box-shadow: var(--shadow-xl);
      }

      .login-header {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 8px;
      }

      .logo-badge {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border-radius: var(--radius-md);
        background: var(--accent-light);
        color: var(--accent);
      }

      .logo-badge svg {
        width: 28px;
        height: 28px;
      }

      .eyebrow {
        color: var(--accent);
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      h1 {
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -0.5px;
      }

      label {
        display: flex;
        flex-direction: column;
        gap: 8px;
        color: var(--text-muted);
        font-size: 12px;
        font-weight: 600;
      }

      input {
        width: 100%;
        min-height: 40px;
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        background: var(--surface-solid);
        color: var(--text);
        padding: 0 12px;
        font-family: inherit;
        font-size: inherit;
        outline: none;
        transition: var(--transition-smooth);
      }

      input:focus {
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
      }

      button {
        width: 100%;
        height: 44px;
        background: var(--accent);
        color: #ffffff;
        border: none;
        cursor: pointer;
        font-weight: 600;
        border-radius: var(--radius-md);
        font-size: 15px;
        outline: none;
        transition: var(--transition-smooth);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      button:hover {
        background: var(--accent-hover);
        transform: translateY(-1px);
      }

      button:active {
        transform: translateY(0);
      }

      .error {
        color: var(--danger);
        font-size: 12px;
        font-weight: 600;
        text-align: center;
        min-height: 18px;
      }

      .version {
        color: var(--text-muted);
        font-size: 11px;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <form id="loginForm" method="post" action="/acceso">
      <div class="login-header">
        <div class="logo-badge">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25" />
          </svg>
        </div>
        <div>
          <p class="eyebrow">Control de palets</p>
          <h1>Bloques Patio</h1>
        </div>
      </div>
      <label>
        Contraseña
        <input name="password" type="password" autocomplete="current-password" autofocus required placeholder="••••••••">
      </label>
      <button type="submit">Entrar</button>
      <p id="loginError" class="error">${error ? "Contraseña incorrecta" : ""}</p>
      <p class="version">v fd1fb53</p>
    </form>
    <script>
      const form = document.getElementById("loginForm");
      const error = document.getElementById("loginError");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.textContent = "";
        const button = form.querySelector("button");
        button.disabled = true;
        button.textContent = "Entrando...";
        try {
          const response = await fetch("/acceso", {
            method: "POST",
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ password: form.password.value })
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok) {
            error.textContent = data.message || "Contraseña incorrecta";
            button.disabled = false;
            button.textContent = "Entrar";
            return;
          }
          window.location.replace("/");
        } catch (loginError) {
          error.textContent = "No se pudo conectar. Recarga la pagina e intentalo otra vez.";
          button.disabled = false;
          button.textContent = "Entrar";
        }
      });
    </script>
  </body>
</html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
    }
  });
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

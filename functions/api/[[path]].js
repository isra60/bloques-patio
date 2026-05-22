export async function onRequest(context) {
  const { request, env, params } = context;
  const path = Array.isArray(params.path)
    ? params.path
    : String(params.path || "").split("/").filter(Boolean);
  const method = request.method.toUpperCase();

  if (!env.DB) {
    return text("Falta el binding DB de Cloudflare D1.", 500);
  }

  try {
    if (method === "GET" && path.join("/") === "state") {
      return json(await getState(env.DB));
    }

    if (method === "POST" && path.join("/") === "orders") {
      const body = await request.json();
      await createOrder(env.DB, body);
      return json({ ok: true }, 201);
    }

    if (method === "DELETE" && path[0] === "orders" && path[1]) {
      await env.DB.prepare("delete from orders where id = ?").bind(path[1]).run();
      return new Response(null, { status: 204 });
    }

    if (method === "PATCH" && path[0] === "variants" && path[1]) {
      const body = await request.json();
      await updateVariant(env.DB, path[1], body);
      return json({ ok: true });
    }

    return text("No encontrado", 404);
  } catch (error) {
    const status = error.status || 500;
    return text(error.message || "Error interno", status);
  }
}

async function getState(db) {
  const [products, variants, orders] = await Promise.all([
    db.prepare("select * from products order by position").all(),
    db.prepare("select * from variants order by position").all(),
    db.prepare("select * from orders order by created_at desc").all()
  ]);
  return {
    products: products.results || [],
    variants: variants.results || [],
    orders: orders.results || []
  };
}

async function createOrder(db, body) {
  const variantId = required(body.variant_id, "variant_id");
  const commercial = required(body.commercial, "commercial").toUpperCase();
  const customer = required(body.customer, "customer");
  const pallets = Number(body.pallets);
  const notes = body.notes ? String(body.notes) : null;

  if (!["JESUS", "FERNANDO"].includes(commercial)) {
    throw validationError("Comercial no valido");
  }
  if (!Number.isFinite(pallets) || pallets <= 0) {
    throw validationError("Palets no valido");
  }
  if (!Number.isInteger(pallets)) {
    throw validationError("Los palets deben ser unidades completas");
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(`
    insert into orders (id, variant_id, commercial, customer, pallets, notes, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, variantId, commercial, customer, pallets, notes, now, now).run();
}

async function updateVariant(db, id, body) {
  const stock = Number(body.stock_pallets);
  if (!Number.isFinite(stock) || stock < 0) {
    throw validationError("Stock no valido");
  }
  if (!Number.isInteger(stock)) {
    throw validationError("El stock debe ser un numero entero de palets");
  }
  const stockDate = body.stock_date ? String(body.stock_date) : new Date().toISOString().slice(0, 10);
  await db.prepare(`
    update variants
    set stock_pallets = ?, stock_date = ?, updated_at = ?
    where id = ?
  `).bind(stock, stockDate, new Date().toISOString(), id).run();
}

function required(value, field) {
  const textValue = String(value || "").trim();
  if (!textValue) throw validationError(`Falta ${field}`);
  return textValue;
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function text(message, status = 400) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

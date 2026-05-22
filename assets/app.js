const config = window.BLOQUES_CONFIG || {};
const apiBase = config.apiBase || "";
const apiMode = Boolean(apiBase);
const hasSupabaseConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey && config.sharedEmail);
const supabaseClient = hasSupabaseConfig
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

const state = {
  products: [],
  variants: [],
  orders: [],
  selectedVariantId: null,
  search: "",
  localMode: !hasSupabaseConfig && !apiMode,
  apiMode,
  channel: null,
  apiToken: localStorage.getItem("bloques-api-token") || "",
  apiPollingStarted: false
};

const els = {
  loginView: document.querySelector("#loginView"),
  loginForm: document.querySelector("#loginForm"),
  passwordInput: document.querySelector("#passwordInput"),
  loginMessage: document.querySelector("#loginMessage"),
  appView: document.querySelector("#appView"),
  logoutButton: document.querySelector("#logoutButton"),
  seedButton: document.querySelector("#seedButton"),
  syncState: document.querySelector("#syncState"),
  searchInput: document.querySelector("#searchInput"),
  productList: document.querySelector("#productList"),
  variantTemplate: document.querySelector("#variantTemplate"),
  variantTitle: document.querySelector("#variantTitle"),
  variantDetail: document.querySelector("#variantDetail"),
  totalStock: document.querySelector("#totalStock"),
  totalReserved: document.querySelector("#totalReserved"),
  totalAvailable: document.querySelector("#totalAvailable"),
  totalVariants: document.querySelector("#totalVariants"),
  orderForm: document.querySelector("#orderForm"),
  commercialInput: document.querySelector("#commercialInput"),
  customerInput: document.querySelector("#customerInput"),
  palletsInput: document.querySelector("#palletsInput"),
  notesInput: document.querySelector("#notesInput")
};

function formatNumber(value) {
  const number = Number(value || 0);
  return String(Math.trunc(number));
}

function parseWholePallets(value, fieldName = "Palets") {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${fieldName} debe ser un numero entero`);
  }
  return number;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function variantOrders(variantId) {
  return state.orders.filter((order) => order.variant_id === variantId);
}

function reservedFor(variantId) {
  return variantOrders(variantId).reduce((sum, order) => sum + Number(order.pallets || 0), 0);
}

function selectedVariant() {
  return state.variants.find((variant) => variant.id === state.selectedVariantId) || null;
}

function isEditingStockForm() {
  const active = document.activeElement;
  return Boolean(active && els.variantDetail.contains(active) && active.closest("#stockForm"));
}

function setSync(text, tone = "") {
  els.syncState.textContent = text;
  // Dynamically compute connection status for CSS indicator animation
  let status = "disconnected";
  const lowerText = text.toLowerCase();
  if (lowerText.includes("conectado") || lowerText.includes("activo") || lowerText.includes("local")) {
    status = "connected";
  } else if (lowerText.includes("sincronizando") || lowerText.includes("importando")) {
    status = "syncing";
  } else if (lowerText.includes("sin conexion") || lowerText.includes("error")) {
    status = "disconnected";
  }
  els.syncState.setAttribute("data-status", status);
  els.syncState.className = `sync-state ${tone}`.trim();
}

function saveLocal() {
  localStorage.setItem("bloques-patio-state", JSON.stringify({
    products: state.products,
    variants: state.variants,
    orders: state.orders
  }));
}

function loadLocal() {
  const raw = localStorage.getItem("bloques-patio-state");
  if (!raw) return false;
  const parsed = JSON.parse(raw);
  state.products = parsed.products || [];
  state.variants = parsed.variants || [];
  state.orders = parsed.orders || [];
  return state.products.length > 0;
}

async function loadSeed() {
  const response = await fetch("data/seed.json", { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo cargar data/seed.json");
  return response.json();
}

async function seedLocal() {
  const seed = await loadSeed();
  state.products = seed.products;
  state.variants = seed.variants;
  state.orders = seed.orders.map((order) => ({
    id: crypto.randomUUID(),
    ...order,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));
  saveLocal();
  if (!state.selectedVariantId && state.variants[0]) state.selectedVariantId = state.variants[0].id;
  render();
}

async function seedRemote() {
  const seed = await loadSeed();
  setSync("Importando...");
  const productRows = seed.products.map((row) => ({ ...row }));
  const variantRows = seed.variants.map((row) => ({ ...row }));
  const orderRows = seed.orders.map((row) => ({ ...row }));

  let result = await supabaseClient.from("products").upsert(productRows, { onConflict: "id" });
  if (result.error) throw result.error;
  result = await supabaseClient.from("variants").upsert(variantRows, { onConflict: "id" });
  if (result.error) throw result.error;
  result = await supabaseClient.from("orders").upsert(orderRows, { onConflict: "source_key" });
  if (result.error) throw result.error;
  await loadRemoteData();
}

async function loadRemoteData() {
  setSync("Sincronizando...");
  const [products, variants, orders] = await Promise.all([
    supabaseClient.from("products").select("*").order("position"),
    supabaseClient.from("variants").select("*").order("position"),
    supabaseClient.from("orders").select("*").order("created_at", { ascending: false })
  ]);
  for (const result of [products, variants, orders]) {
    if (result.error) throw result.error;
  }
  state.products = products.data || [];
  state.variants = variants.data || [];
  state.orders = orders.data || [];
  if (!state.selectedVariantId && state.variants[0]) state.selectedVariantId = state.variants[0].id;
  setSync("Conectado");
  render();
}

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (state.apiToken) {
    headers.Authorization = `Bearer ${state.apiToken}`;
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Error ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function loadApiData(silent = false) {
  if (!silent) setSync("Sincronizando...");
  const preserveStockForm = silent && isEditingStockForm();
  const data = await apiRequest("/state");
  state.products = data.products || [];
  state.variants = data.variants || [];
  state.orders = data.orders || [];
  if (!state.selectedVariantId && state.variants[0]) state.selectedVariantId = state.variants[0].id;
  setSync("Conectado");
  render({ preserveStockForm });
}

function startApiPolling() {
  if (state.apiPollingStarted) return;
  state.apiPollingStarted = true;
  window.setInterval(async () => {
    try {
      await loadApiData(true);
    } catch (error) {
      setSync("Sin conexion");
    }
  }, Number(config.pollIntervalMs || 3000));
}

function subscribeRealtime() {
  if (!supabaseClient || state.channel) return;
  state.channel = supabaseClient
    .channel("bloques-patio")
    .on("postgres_changes", { event: "*", schema: "public", table: "products" }, loadRemoteData)
    .on("postgres_changes", { event: "*", schema: "public", table: "variants" }, loadRemoteData)
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, loadRemoteData)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") setSync("Tiempo real activo");
    });
}

async function login(password) {
  if (state.apiMode) {
    const response = await fetch("/acceso", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok || !data.token) {
      throw new Error(data.message || "Contrasena incorrecta");
    }
    state.apiToken = data.token;
    localStorage.setItem("bloques-api-token", state.apiToken);
    els.loginMessage.textContent = "";
    els.loginView.classList.add("hidden");
    els.appView.classList.remove("hidden");
    els.seedButton.classList.add("hidden");
    await loadApiData();
    startApiPolling();
    return;
  }

  if (state.localMode) {
    els.loginMessage.textContent = "";
    els.loginView.classList.add("hidden");
    els.appView.classList.remove("hidden");
    setSync("Modo demo local");
    if (!loadLocal()) await seedLocal();
    if (!state.selectedVariantId && state.variants[0]) state.selectedVariantId = state.variants[0].id;
    render();
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: config.sharedEmail,
    password
  });
  if (error) throw error;
  els.loginMessage.textContent = "";
  els.loginView.classList.add("hidden");
  els.appView.classList.remove("hidden");
  await loadRemoteData();
  subscribeRealtime();
}

async function logout() {
  if (state.apiMode) {
    localStorage.removeItem("bloques-api-token");
    state.apiToken = "";
    state.products = [];
    state.variants = [];
    state.orders = [];
    state.selectedVariantId = null;
    await fetch("/salir").catch(() => {});
    els.appView.classList.add("hidden");
    els.loginView.classList.remove("hidden");
    els.passwordInput.value = "";
    return;
  }

  if (supabaseClient) await supabaseClient.auth.signOut();
  if (state.channel) {
    supabaseClient.removeChannel(state.channel);
    state.channel = null;
  }
  els.passwordInput.value = "";
  els.appView.classList.add("hidden");
  els.loginView.classList.remove("hidden");
}

async function addOrder(data) {
  if (!state.selectedVariantId) return;
  const row = {
    variant_id: state.selectedVariantId,
    commercial: data.commercial,
    customer: data.customer,
    pallets: parseWholePallets(data.pallets),
    notes: data.notes || null
  };

  if (state.apiMode) {
    await apiRequest("/orders", {
      method: "POST",
      body: JSON.stringify(row)
    });
    await loadApiData(true);
    return;
  }

  if (state.localMode) {
    state.orders.unshift({
      id: crypto.randomUUID(),
      ...row,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    saveLocal();
    render();
    return;
  }

  const { error } = await supabaseClient.from("orders").insert(row);
  if (error) throw error;
}

async function deleteOrder(orderId) {
  if (!window.confirm("Borrar este pedido?")) return;
  if (state.apiMode) {
    await apiRequest(`/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" });
    await loadApiData(true);
    return;
  }

  if (state.localMode) {
    state.orders = state.orders.filter((order) => order.id !== orderId);
    saveLocal();
    render();
    return;
  }
  const { error } = await supabaseClient.from("orders").delete().eq("id", orderId);
  if (error) throw error;
}

async function updateStock(variantId, stockPallets, stockDate) {
  const stockValue = parseWholePallets(stockPallets, "Stock");
  const dateValue = stockDate || today();

  if (state.apiMode) {
    await apiRequest(`/variants/${encodeURIComponent(variantId)}`, {
      method: "PATCH",
      body: JSON.stringify({ stock_pallets: stockValue, stock_date: dateValue })
    });
    const variant = state.variants.find((item) => item.id === variantId);
    if (variant) {
      variant.stock_pallets = stockValue;
      variant.stock_date = dateValue;
    }
    render();
    await loadApiData(true);
    return;
  }

  if (state.localMode) {
    const variant = state.variants.find((item) => item.id === variantId);
    if (variant) {
      variant.stock_pallets = stockValue;
      variant.stock_date = dateValue;
      variant.updated_at = new Date().toISOString();
      saveLocal();
      render();
    }
    return;
  }
  const { error } = await supabaseClient
    .from("variants")
    .update({ stock_pallets: stockValue, stock_date: dateValue })
    .eq("id", variantId);
  if (error) throw error;
}

function renderSummary() {
  const totalStock = state.variants.reduce((sum, variant) => sum + Number(variant.stock_pallets || 0), 0);
  const totalReserved = state.orders.reduce((sum, order) => sum + Number(order.pallets || 0), 0);
  els.totalStock.textContent = formatNumber(totalStock);
  els.totalReserved.textContent = formatNumber(totalReserved);
  els.totalAvailable.textContent = formatNumber(totalStock - totalReserved);
  els.totalVariants.textContent = String(state.variants.length);
}

function matchesSearch(variant) {
  if (!state.search) return true;
  const needle = state.search.toLowerCase();
  const product = state.products.find((item) => item.id === variant.product_id);
  const orderText = variantOrders(variant.id)
    .map((order) => `${order.customer} ${order.commercial} ${order.notes || ""}`)
    .join(" ");
  return `${product?.name || ""} ${variant.name} ${orderText}`.toLowerCase().includes(needle);
}

function renderProducts() {
  els.productList.innerHTML = "";
  const visibleVariants = state.variants.filter(matchesSearch);
  for (const product of state.products) {
    const variants = visibleVariants.filter((variant) => variant.product_id === product.id);
    if (!variants.length) continue;
    const group = document.createElement("div");
    group.className = "product-group";
    const title = document.createElement("div");
    title.className = "product-title";
    title.textContent = product.name;
    group.append(title);
    for (const variant of variants) {
      const node = els.variantTemplate.content.firstElementChild.cloneNode(true);
      const reserved = reservedFor(variant.id);
      const available = Number(variant.stock_pallets || 0) - reserved;
      node.classList.toggle("active", variant.id === state.selectedVariantId);
      node.querySelector(".variant-name").textContent = variant.name;
      node.querySelector(".variant-metrics").textContent = `${formatNumber(available)} disp.`;
      node.addEventListener("click", () => {
        state.selectedVariantId = variant.id;
        render();
      });
      group.append(node);
    }
    els.productList.append(group);
  }
}

function renderVariantDetail() {
  const variant = selectedVariant();
  if (!variant) {
    els.variantTitle.textContent = "Selecciona una variante";
    els.variantDetail.className = "variant-detail empty-state";
    els.variantDetail.textContent = "Elige una variante para ver sus pedidos.";
    els.orderForm.querySelector("button").disabled = true;
    return;
  }
  els.orderForm.querySelector("button").disabled = false;
  const product = state.products.find((item) => item.id === variant.product_id);
  const orders = variantOrders(variant.id);
  const stock = Number(variant.stock_pallets || 0);
  const reserved = reservedFor(variant.id);
  const available = stock - reserved;
  const byJesus = orders.filter((order) => order.commercial === "JESUS").reduce((sum, order) => sum + Number(order.pallets || 0), 0);
  const byFernando = orders.filter((order) => order.commercial === "FERNANDO").reduce((sum, order) => sum + Number(order.pallets || 0), 0);

  els.variantTitle.textContent = `${product?.name || ""} / ${variant.name}`;
  els.variantDetail.className = "variant-detail";
  els.variantDetail.innerHTML = `
    <form class="stock-editor" id="stockForm">
      <div class="editor-field">
        <label for="stockInput">Stock palets</label>
        <input id="stockInput" type="number" min="0" step="1" inputmode="numeric" value="${stock}" required>
      </div>
      <div class="editor-field">
        <label for="stockDateInput">Fecha stock</label>
        <input id="stockDateInput" type="date" value="${variant.stock_date || today()}" required>
      </div>
      <button type="submit">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="btn-icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
        Actualizar
      </button>
    </form>
    <div class="stats-line">
      <div class="stat-box">
        <span>Stock Actual</span>
        <strong>${formatNumber(stock)}</strong>
      </div>
      <div class="stat-box">
        <span>Reservado</span>
        <strong class="stat-reserved">${formatNumber(reserved)}</strong>
      </div>
      <div class="stat-box">
        <span>Disponible</span>
        <strong class="${available < 0 ? "negative" : "positive"}">${formatNumber(available)}</strong>
      </div>
      <div class="stat-box">
        <span>Por Comercial</span>
        <div class="commercial-split">
          <span class="split-rep jesus">J: <strong>${formatNumber(byJesus)}</strong></span>
          <span class="split-divider">|</span>
          <span class="split-rep fernando">F: <strong>${formatNumber(byFernando)}</strong></span>
        </div>
      </div>
    </div>
    <div class="table-container">
      <table class="orders-table">
        <thead>
          <tr>
            <th>Comercial</th>
            <th>Cliente / obra</th>
            <th>Notas</th>
            <th class="text-right">Palets</th>
            <th class="text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map((order) => `
            <tr>
              <td>
                <span class="pill commercial-${order.commercial.toLowerCase()}">
                  ${order.commercial === "JESUS" ? "Jesús" : "Fernando"}
                </span>
              </td>
              <td class="customer-cell">${escapeHtml(order.customer)}</td>
              <td class="notes-cell">${escapeHtml(order.notes || "—")}</td>
              <td class="pallets-cell text-right"><strong>${formatNumber(order.pallets)}</strong></td>
              <td class="actions-cell text-center">
                <button class="delete-button" data-delete="${order.id}" type="button" title="Borrar pedido">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </td>
            </tr>
          `).join("") || `<tr><td colspan="5" class="empty-state">Sin pedidos para esta variante.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  els.variantDetail.querySelector("#stockForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await updateStock(
        variant.id,
        els.variantDetail.querySelector("#stockInput").value,
        els.variantDetail.querySelector("#stockDateInput").value
      );
    } catch (error) {
      window.alert(error.message);
    }
  });
  for (const button of els.variantDetail.querySelectorAll("[data-delete]")) {
    button.addEventListener("click", async () => {
      try {
        await deleteOrder(button.dataset.delete);
      } catch (error) {
        window.alert(error.message);
      }
    });
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render(options = {}) {
  renderSummary();
  renderProducts();
  if (!options.preserveStockForm) {
    renderVariantDetail();
  }
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginMessage.textContent = "";
  try {
    await login(els.passwordInput.value);
  } catch (error) {
    els.loginMessage.textContent = error.message || "No se pudo entrar";
  }
});

els.logoutButton.addEventListener("click", logout);

els.seedButton.addEventListener("click", async () => {
  if (!window.confirm("Importar los datos iniciales extraidos del Excel?")) return;
  try {
    if (state.localMode) await seedLocal();
    else await seedRemote();
  } catch (error) {
    window.alert(error.message);
  }
});

els.searchInput.addEventListener("input", () => {
  state.search = els.searchInput.value.trim();
  renderProducts();
});

els.orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await addOrder({
      commercial: els.commercialInput.value,
      customer: els.customerInput.value.trim(),
      pallets: els.palletsInput.value,
      notes: els.notesInput.value.trim()
    });
    els.customerInput.value = "";
    els.palletsInput.value = "";
    els.notesInput.value = "";
  } catch (error) {
    window.alert(error.message);
  }
});

if (state.localMode) {
  els.loginMessage.textContent = "Falta config.js: entrara en modo demo local.";
}

if (state.apiMode) {
  els.seedButton.classList.add("hidden");
  if (state.apiToken) {
    els.loginView.classList.add("hidden");
    els.appView.classList.remove("hidden");
    loadApiData().then(startApiPolling).catch(() => {
      localStorage.removeItem("bloques-api-token");
      state.apiToken = "";
      els.appView.classList.add("hidden");
      els.loginView.classList.remove("hidden");
      els.loginMessage.textContent = "Sesion caducada. Entra otra vez.";
    });
  }
}

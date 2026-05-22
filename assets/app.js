const config = window.BLOQUES_CONFIG || {};
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
  localMode: !hasSupabaseConfig,
  channel: null
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
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
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

function setSync(text, tone = "") {
  els.syncState.textContent = text;
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
    pallets: Number(data.pallets),
    notes: data.notes || null
  };

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
  if (state.localMode) {
    const variant = state.variants.find((item) => item.id === variantId);
    if (variant) {
      variant.stock_pallets = Number(stockPallets);
      variant.stock_date = stockDate || today();
      variant.updated_at = new Date().toISOString();
      saveLocal();
      render();
    }
    return;
  }
  const { error } = await supabaseClient
    .from("variants")
    .update({ stock_pallets: Number(stockPallets), stock_date: stockDate || today() })
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
      <label>Stock palets <input id="stockInput" type="number" min="0" step="0.01" value="${stock}"></label>
      <label>Fecha stock <input id="stockDateInput" type="date" value="${variant.stock_date || today()}"></label>
      <button type="submit">Actualizar</button>
    </form>
    <div class="stats-line">
      <div><span>Stock</span><strong>${formatNumber(stock)}</strong></div>
      <div><span>Reservado</span><strong>${formatNumber(reserved)}</strong></div>
      <div><span>Disponible</span><strong class="${available < 0 ? "negative" : ""}">${formatNumber(available)}</strong></div>
      <div><span>Jesus / Fernando</span><strong>${formatNumber(byJesus)} / ${formatNumber(byFernando)}</strong></div>
    </div>
    <table class="orders-table">
      <thead>
        <tr>
          <th>Comercial</th>
          <th>Cliente / obra</th>
          <th>Notas</th>
          <th>Palets</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${orders.map((order) => `
          <tr>
            <td><span class="pill">${order.commercial === "JESUS" ? "Jesus" : "Fernando"}</span></td>
            <td>${escapeHtml(order.customer)}</td>
            <td>${escapeHtml(order.notes || "")}</td>
            <td><strong>${formatNumber(order.pallets)}</strong></td>
            <td><button class="delete-button" data-delete="${order.id}" type="button">Borrar</button></td>
          </tr>
        `).join("") || `<tr><td colspan="5" class="empty-state">Sin pedidos para esta variante.</td></tr>`}
      </tbody>
    </table>
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

function render() {
  renderSummary();
  renderProducts();
  renderVariantDetail();
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


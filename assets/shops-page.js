(() => {
  const CATALOG_URL =
    document.querySelector('meta[name="tsm-catalog-url"]')?.content?.trim() ||
    "https://ai-mallbot.onrender.com/catalog";
  const FALLBACK_IMAGE = "/trade-square-day.png";

  const listEl = document.getElementById("shops-list");
  const detailEl = document.getElementById("shops-detail");
  const gridEl = document.getElementById("shops-grid");
  const countEl = document.getElementById("shops-count");
  const emptyEl = document.getElementById("shops-empty");
  const searchEl = document.getElementById("shops-search");
  const statusEl = document.getElementById("shops-status");

  /** @type {object[]} */
  let shops = [];

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  function locationLine(shop) {
    const floor = String(shop.floor || "").trim();
    const number = String(shop.number || "").trim();
    if (floor && number && number !== "—") return `${floor} · ${number}`;
    return floor || number || "Trade Square Mall";
  }

  function categoryFor(shop) {
    const cats = Array.isArray(shop.categories) ? shop.categories.filter(Boolean) : [];
    if (cats.length) return String(cats[0]);
    const products = Array.isArray(shop.products) ? shop.products : [];
    if (products[0]?.name) return String(products[0].name);
    return "Open now";
  }

  function blurb(text, max = 120) {
    const clean = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return "Open now at Trade Square Mall.";
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max - 1).trimEnd()}…`;
  }

  function normalizeShop(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = String(raw.name || "").trim();
    if (!name) return null;
    const id = String(raw.id || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
    return {
      id: id || `shop-${Math.random().toString(36).slice(2, 8)}`,
      name,
      floor: String(raw.floor || "").trim(),
      number: String(raw.number || "").trim(),
      image: String(raw.image || "").trim(),
      description: String(raw.description || "").trim(),
      link: String(raw.link || raw.whatsapp || "").trim(),
      whatsapp: String(raw.whatsapp || raw.link || "").trim(),
      categories: Array.isArray(raw.categories) ? raw.categories : [],
      products: Array.isArray(raw.products) ? raw.products : [],
      hours: String(raw.hours || "Mall hours").trim(),
    };
  }

  function selectedId() {
    const params = new URLSearchParams(location.search);
    const fromQuery = String(params.get("shop") || params.get("id") || "").trim();
    if (fromQuery) return fromQuery;
    return decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
  }

  function cleanShopUrl(id) {
    const next = id ? `${location.pathname}#${encodeURIComponent(id)}` : location.pathname;
    if (`${location.pathname}${location.search}${location.hash}` === next) return;
    history.replaceState(null, "", next);
  }

  function cardHtml(shop) {
    const img = shop.image || FALLBACK_IMAGE;
    return `<a class="card" href="#${escapeAttr(shop.id)}">
      <div class="card-media">
        <img src="${escapeAttr(img)}" alt="${escapeAttr(shop.name)}" loading="lazy" />
      </div>
      <div class="card-body">
        <p class="kicker">${escapeHtml(categoryFor(shop))}</p>
        <h3>${escapeHtml(shop.name)}</h3>
        <p>${escapeHtml(blurb(shop.description))}</p>
        <p class="card-meta">${escapeHtml(locationLine(shop))}</p>
      </div>
    </a>`;
  }

  function productRows(shop) {
    const products = Array.isArray(shop.products) ? shop.products : [];
    if (!products.length) return "<p class=\"shops-empty\">Ask the shop for products and prices.</p>";
    return `<ul>${products
      .map((p) => {
        const variation = Array.isArray(p.variations) && p.variations[0]
          ? p.variations[0]
          : null;
        const price =
          variation && variation.price != null && Number(variation.price) !== 0
            ? `US$${Number(variation.price)}`
            : p.price
              ? String(p.price)
              : "Quote";
        const label = variation?.name && variation.name !== "Standard"
          ? `${p.name} · ${variation.name}`
          : p.name;
        return `<li><span>${escapeHtml(label)}</span><span>${escapeHtml(price)}</span></li>`;
      })
      .join("")}</ul>`;
  }

  function renderDetail(shop) {
    if (!shop) {
      detailEl.hidden = true;
      detailEl.classList.remove("is-open");
      detailEl.innerHTML = "";
      listEl.hidden = false;
      return;
    }

    const img = shop.image || FALLBACK_IMAGE;
    const chat = shop.whatsapp || shop.link;
    document.title = `${shop.name} · Trade Square Mall`;
    listEl.hidden = true;
    detailEl.hidden = false;
    detailEl.classList.add("is-open");
    detailEl.innerHTML = `
      <div class="wrap">
        <p class="shops-detail__back">
          <a class="text-link" href="#"><span aria-hidden="true">←</span> All enrolled shops</a>
        </p>
        <header class="place-head">
          <p class="kicker">${escapeHtml(categoryFor(shop))}</p>
          <h1>${escapeHtml(shop.name)}</h1>
          <p class="place-meta">${escapeHtml(locationLine(shop))} · ${escapeHtml(shop.hours)}</p>
          ${
            chat
              ? `<a class="btn" href="${escapeAttr(chat)}" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>`
              : ""
          }
        </header>
        <div class="shops-detail__hero">
          <img src="${escapeAttr(img)}" alt="${escapeAttr(shop.name)}" />
        </div>
        <div class="shops-detail__body">
          <div>
            <p class="shops-detail__lede">${escapeHtml(shop.description || "Open now at Trade Square Mall.")}</p>
            <div class="shops-detail__products">
              <h2>Products</h2>
              ${productRows(shop)}
            </div>
          </div>
          <aside class="shops-detail__aside">
            <h2>Details</h2>
            <dl>
              <div><dt>Floor</dt><dd>${escapeHtml(shop.floor || "Trade Square Mall")}</dd></div>
              <div><dt>Number</dt><dd>${escapeHtml(shop.number || "—")}</dd></div>
              <div><dt>Hours</dt><dd>${escapeHtml(shop.hours)}</dd></div>
              <div><dt>Category</dt><dd>${escapeHtml(categoryFor(shop))}</dd></div>
            </dl>
            ${
              shop.link
                ? `<p><a class="text-link" href="${escapeAttr(shop.link)}" target="_blank" rel="noopener noreferrer">Shop link <span aria-hidden="true">→</span></a></p>`
                : ""
            }
          </aside>
        </div>
      </div>
    `;
  }

  function filteredShops() {
    const q = String(searchEl?.value || "")
      .trim()
      .toLowerCase();
    if (!q) return shops;
    return shops.filter((shop) =>
      [shop.name, shop.floor, shop.number, shop.description, categoryFor(shop)]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }

  function renderList() {
    const visible = filteredShops();
    countEl.textContent = `${visible.length} shop${visible.length === 1 ? "" : "s"}`;
    if (!visible.length) {
      gridEl.innerHTML = "";
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    gridEl.innerHTML = visible.map(cardHtml).join("");
  }

  function route() {
    const id = selectedId();
    const shop = id ? shops.find((s) => s.id === id) : null;
    if (id && !shop) {
      statusEl.textContent = "That shop was not found in the enrolled directory.";
      cleanShopUrl("");
      renderDetail(null);
      renderList();
      return;
    }
    statusEl.textContent = "";
    if (shop) {
      cleanShopUrl(shop.id);
      renderDetail(shop);
    } else {
      document.title = "Enrolled shops · Trade Square Mall";
      cleanShopUrl("");
      renderDetail(null);
      renderList();
    }
  }

  async function init() {
    statusEl.textContent = "Loading enrolled shops…";
    try {
      const res = await fetch(CATALOG_URL, { method: "GET", mode: "cors", cache: "no-store" });
      if (!res.ok) throw new Error(`catalog ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.normalized)
        ? data.normalized
        : Array.isArray(data?.shops)
          ? data.shops
          : [];
      shops = list.map(normalizeShop).filter(Boolean);
      statusEl.textContent = shops.length
        ? ""
        : "No shops enrolled yet. Tenants can join from Enrol.";
      route();
    } catch (err) {
      statusEl.textContent =
        "Could not load enrolled shops right now. Try again in a moment.";
      emptyEl.hidden = false;
    }
  }

  searchEl?.addEventListener("input", () => {
    if (!selectedId()) renderList();
  });
  window.addEventListener("hashchange", route);

  document.getElementById("menu-toggle")?.addEventListener("click", () => {
    const menu = document.getElementById("mobile-menu");
    if (!menu) return;
    const open = menu.hasAttribute("hidden");
    if (open) menu.removeAttribute("hidden");
    else menu.setAttribute("hidden", "");
    document.getElementById("menu-toggle")?.setAttribute("aria-expanded", open ? "true" : "false");
  });

  init();
})();

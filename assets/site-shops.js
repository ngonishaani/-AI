(() => {
  const CATALOG_URL =
    document.querySelector('meta[name="tsm-catalog-url"]')?.content?.trim() ||
    "https://ai-mallbot.onrender.com/catalog";
  const CATALOG_ORIGIN = (() => {
    try {
      return new URL(CATALOG_URL).origin;
    } catch {
      return "https://ai-mallbot.onrender.com";
    }
  })();
  const MARK = "data-enrolled-shop";
  const SHOP_PATH = "/shop";

  /** @type {null | Promise<object[]>} */
  let shopsPromise = null;

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

  function blurb(text, max = 110) {
    const clean = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return "Open now at Trade Square Mall.";
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max - 1).trimEnd()}…`;
  }

  function categoryFor(shop) {
    const cats = Array.isArray(shop.categories) ? shop.categories.filter(Boolean) : [];
    if (cats.length) return String(cats[0]);
    const products = Array.isArray(shop.products) ? shop.products : [];
    if (products[0]?.name) return String(products[0].name);
    return "Open now";
  }

  function locationLine(shop) {
    const floor = String(shop.floor || "").trim();
    const number = String(shop.number || "").trim();
    if (floor && number && number !== "—") return `${floor} · ${number}`;
    return floor || number || "Trade Square Mall";
  }

  /** Prefer the enrolled shop photo (absolute /media URL), then a product photo. */
  function resolveShopImage(raw) {
    const candidates = [
      raw?.image,
      ...(Array.isArray(raw?.products) ? raw.products.map((p) => p?.image) : []),
    ];
    for (const candidate of candidates) {
      const value = String(candidate || "").trim();
      if (!value || value.startsWith("data:")) continue;
      if (value.startsWith("/media/")) return `${CATALOG_ORIGIN}${value}`;
      if (/^https?:\/\//i.test(value)) return value;
    }
    return "";
  }

  function normalizeShop(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = String(raw.name || "").trim();
    if (!name) return null;
    // Skip seed / non-enrolled entries if a live merge ever leaks through
    if (raw.enrolled === false) return null;
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
      image: resolveShopImage(raw),
      description: String(raw.description || "").trim(),
      link: String(raw.link || raw.whatsapp || "").trim(),
      categories: Array.isArray(raw.categories) ? raw.categories : [],
      products: Array.isArray(raw.products) ? raw.products : [],
      hours: String(raw.hours || "Mall hours").trim(),
    };
  }

  function loadShops() {
    if (!shopsPromise) {
      shopsPromise = fetch(CATALOG_URL, { method: "GET", mode: "cors", cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) throw new Error(`catalog ${res.status}`);
          const data = await res.json();
          // Prefer normalized enrolled shops only — never the seed/live merge.
          const list = Array.isArray(data?.normalized)
            ? data.normalized
            : Array.isArray(data?.shops)
              ? data.shops
              : [];
          return list.map(normalizeShop).filter(Boolean);
        })
        .catch(() => {
          shopsPromise = null;
          return [];
        });
    }
    return shopsPromise;
  }

  function cardHtml(shop, { forceReload = false } = {}) {
    // Query form forces a full load when the React SPA is already at /shop.
    const href = forceReload
      ? `${SHOP_PATH}?shop=${encodeURIComponent(shop.id)}`
      : `${SHOP_PATH}#${encodeURIComponent(shop.id)}`;
    const img = shop.image;
    const cat = categoryFor(shop);
    const media = img
      ? `<img src="${escapeAttr(img)}" alt="${escapeAttr(shop.name)}" loading="lazy" />`
      : `<div class="card-media__placeholder" aria-hidden="true">${escapeHtml(shop.name.slice(0, 1))}</div>`;
    return `<a class="card" href="${escapeAttr(href)}" ${MARK}="${escapeAttr(shop.id)}">
      <div class="card-media">
        ${media}
      </div>
      <div class="card-body">
        <p class="kicker">${escapeHtml(cat)}</p>
        <h3>${escapeHtml(shop.name)}</h3>
        <p>${escapeHtml(blurb(shop.description))}</p>
        <p class="card-meta">${escapeHtml(locationLine(shop))}</p>
      </div>
    </a>`;
  }

  /** Hide SPA seed shop cards (Barbers, Salons, …) — website shows enrolled tenants only. */
  function hideNonEnrolledSeedShops() {
    const shopSection = document.getElementById("shop");
    if (!shopSection) return;

    shopSection.querySelectorAll(".card-grid").forEach((grid) => {
      if (grid.closest("[data-enrolled-home]")) return;
      grid.hidden = true;
      grid.setAttribute("data-seed-shops-hidden", "1");
    });

    shopSection.querySelectorAll(".section-head").forEach((head) => {
      if (head.closest("[data-enrolled-home]")) return;
      head.hidden = true;
      head.setAttribute("data-seed-shops-hidden", "1");
    });
  }

  function ensureHomeSection(shops) {
    const shopSection = document.getElementById("shop");
    if (!shopSection) return;

    hideNonEnrolledSeedShops();

    let host = shopSection.querySelector("[data-enrolled-home]");
    if (!host) {
      host = document.createElement("div");
      host.setAttribute("data-enrolled-home", "1");
      host.className = "enrolled-home";
      const wrap = shopSection.querySelector(".wrap") || shopSection;
      const grid = wrap.querySelector(".card-grid");
      if (grid) wrap.insertBefore(host, grid);
      else wrap.appendChild(host);
    }

    const signature = shops.map((s) => `${s.id}:${s.image}`).join("|");
    if (host.dataset.signature === signature) return;
    host.dataset.signature = signature;

    if (!shops.length) {
      host.innerHTML = `
        <div class="section-head enrolled-home__head">
          <div>
            <p class="kicker">Open now</p>
            <h2>Enrolled shops</h2>
          </div>
          <a class="text-link" href="/enroll/">Enrol a shop <span aria-hidden="true">→</span></a>
        </div>
        <p class="enrolled-home__empty">No shops enrolled yet. Tenants can join from Enrol.</p>
      `;
      return;
    }

    host.innerHTML = `
      <div class="section-head enrolled-home__head">
        <div>
          <p class="kicker">Open now</p>
          <h2>Enrolled shops</h2>
        </div>
        <a class="text-link" href="${SHOP_PATH}">All enrolled shops <span aria-hidden="true">→</span></a>
      </div>
      <div class="card-grid">${shops.map(cardHtml).join("")}</div>
    `;
  }

  /**
   * When the React SPA client-navigates to /shop, replace the placeholder
   * directory with the live enrolled-tenant grid so hard-load and in-app
   * nav show the same shops.
   */
  function ensureDirectoryRail(shops) {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/shop") return;
    if (document.getElementById("shops-grid")) return;

    const body = document.querySelector(".directory-body");
    if (!body) return;

    let rail = body.querySelector("[data-enrolled-directory]");
    if (!rail) {
      rail = document.createElement("div");
      rail.setAttribute("data-enrolled-directory", "1");
      rail.className = "enrolled-directory";
      body.innerHTML = "";
      body.appendChild(rail);
    }

    const signature = shops.map((s) => `${s.id}:${s.image}`).join("|");
    if (rail.dataset.signature === signature) return;
    rail.dataset.signature = signature;

    if (!shops.length) {
      rail.innerHTML = `
        <div class="section-head enrolled-directory__head">
          <div>
            <p class="kicker">Trade Square Mall · Kwekwe</p>
            <h2>Enrolled shops</h2>
          </div>
        </div>
        <p class="enrolled-directory__note">No shops enrolled yet. Tenants can join from Enrol.</p>
      `;
      return;
    }

    rail.innerHTML = `
      <div class="section-head enrolled-directory__head">
        <div>
          <p class="kicker">Trade Square Mall · Kwekwe</p>
          <h2>Enrolled shops</h2>
        </div>
        <a class="text-link" href="${SHOP_PATH}">Open directory <span aria-hidden="true">→</span></a>
      </div>
      <div class="card-grid">${shops.map((s) => cardHtml(s, { forceReload: true })).join("")}</div>
      <p class="enrolled-directory__note">These are live enrolled tenants. Open a shop for floor, unit, products, and WhatsApp.</p>
    `;
  }

  function forceShopLinks() {
    document.querySelectorAll('a[href="/shops"], a[href="/shops/"]').forEach((a) => {
      a.setAttribute("href", SHOP_PATH);
    });

    // Prefer the enrolled shops page over the SPA placeholder directory.
    document.querySelectorAll('a[href="/shop"], a[href="/shop/"]').forEach((a) => {
      if (a.dataset.enrolledNav === "1") return;
      a.dataset.enrolledNav = "1";
      a.addEventListener(
        "click",
        (event) => {
          if (document.getElementById("shops-grid")) return;
          if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
          }
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          window.location.assign(SHOP_PATH);
        },
        true
      );
    });
  }

  let paintTimer = 0;
  async function paint() {
    forceShopLinks();
    hideNonEnrolledSeedShops();
    const shops = await loadShops();
    ensureHomeSection(shops);
    ensureDirectoryRail(shops);
  }

  function schedulePaint() {
    clearTimeout(paintTimer);
    paintTimer = setTimeout(() => {
      paint();
    }, 80);
  }

  const obs = new MutationObserver(schedulePaint);
  obs.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paint);
  } else {
    paint();
  }
})();

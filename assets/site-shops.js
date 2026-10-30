(() => {
  const CATALOG_URL =
    document.querySelector('meta[name="tsm-catalog-url"]')?.content?.trim() ||
    "https://ai-mallbot.onrender.com/catalog";
  const FALLBACK_IMAGE = "/trade-square-day.png";
  const MARK = "data-enrolled-shop";

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

  function cardHtml(shop) {
    const href = `/shops/#${encodeURIComponent(shop.id)}`;
    const img = shop.image || FALLBACK_IMAGE;
    const cat = categoryFor(shop);
    return `<a class="card" href="${escapeAttr(href)}" ${MARK}="${escapeAttr(shop.id)}">
      <div class="card-media">
        <img src="${escapeAttr(img)}" alt="${escapeAttr(shop.name)}" loading="lazy" />
      </div>
      <div class="card-body">
        <p class="kicker">${escapeHtml(cat)}</p>
        <h3>${escapeHtml(shop.name)}</h3>
        <p>${escapeHtml(blurb(shop.description))}</p>
        <p class="card-meta">${escapeHtml(locationLine(shop))}</p>
      </div>
    </a>`;
  }

  function ensureHomeSection(shops) {
    const shopSection = document.getElementById("shop");
    if (!shopSection || !shops.length) return;

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

    const signature = shops.map((s) => s.id).join("|");
    if (host.dataset.signature === signature) return;
    host.dataset.signature = signature;
    host.innerHTML = `
      <div class="section-head enrolled-home__head">
        <div>
          <p class="kicker">Open now</p>
          <h2>Enrolled shops</h2>
        </div>
        <a class="text-link" href="/shops/">All enrolled shops <span aria-hidden="true">→</span></a>
      </div>
      <div class="card-grid">${shops.map(cardHtml).join("")}</div>
    `;
  }

  function ensureDirectoryRail(shops) {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/shop") return;

    const body = document.querySelector(".directory-body");
    if (!body || !shops.length) return;

    let rail = body.querySelector("[data-enrolled-directory]");
    if (!rail) {
      rail = document.createElement("div");
      rail.setAttribute("data-enrolled-directory", "1");
      rail.className = "enrolled-directory";
      body.insertBefore(rail, body.firstChild);
    }

    const signature = shops.map((s) => s.id).join("|");
    if (rail.dataset.signature === signature) return;
    rail.dataset.signature = signature;
    rail.innerHTML = `
      <div class="section-head enrolled-directory__head">
        <div>
          <p class="kicker">Enrolled</p>
          <h2>Shops open in the mall</h2>
        </div>
        <a class="text-link" href="/shops/">Full list <span aria-hidden="true">→</span></a>
      </div>
      <div class="card-grid">${shops.map(cardHtml).join("")}</div>
      <p class="enrolled-directory__note">Directory categories below cover space types and leasing. Enrolled shops above are live tenants.</p>
    `;
  }

  function ensureNavLink() {
    document.querySelectorAll(".nav-links").forEach((nav) => {
      if (nav.querySelector('[data-shops-link="1"]')) return;
      const shopLink = [...nav.querySelectorAll("a")].find((a) =>
        /\/shop\/?$/.test(a.getAttribute("href") || "")
      );
      const a = document.createElement("a");
      a.href = "/shops/";
      a.textContent = "Open now";
      a.setAttribute("data-shops-link", "1");
      if (shopLink && shopLink.nextSibling) {
        nav.insertBefore(a, shopLink.nextSibling);
      } else if (shopLink) {
        shopLink.after(a);
      } else {
        nav.appendChild(a);
      }
    });
    document.querySelectorAll(".menu nav").forEach((nav) => {
      if (nav.querySelector('[data-shops-link="1"]')) return;
      const a = document.createElement("a");
      a.href = "/shops/";
      a.textContent = "Open now";
      a.setAttribute("data-shops-link", "1");
      nav.appendChild(a);
    });
  }

  let paintTimer = 0;
  async function paint() {
    ensureNavLink();
    const shops = await loadShops();
    if (!shops.length) return;
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

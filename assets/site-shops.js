(() => {
  const CATALOG_URL =
    document.querySelector('meta[name="tsm-catalog-url"]')?.content?.trim() ||
    "https://ai-mallbot.onrender.com/catalog";
  const FALLBACK_IMAGE = "/trade-square-day.png";
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

  function cardHtml(shop, { forceReload = false } = {}) {
    // Query form forces a full load when the React SPA is already at /shop.
    const href = forceReload
      ? `${SHOP_PATH}?shop=${encodeURIComponent(shop.id)}`
      : `${SHOP_PATH}#${encodeURIComponent(shop.id)}`;
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
    if (!body || !shops.length) return;

    let rail = body.querySelector("[data-enrolled-directory]");
    if (!rail) {
      rail = document.createElement("div");
      rail.setAttribute("data-enrolled-directory", "1");
      rail.className = "enrolled-directory";
      body.innerHTML = "";
      body.appendChild(rail);
    }

    const signature = shops.map((s) => s.id).join("|");
    if (rail.dataset.signature === signature) return;
    rail.dataset.signature = signature;
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

  const FEATURED = [
    {
      slug: "barbers",
      name: "Barber and saloon",
      text: "Cuts, wash, style, and colour on the ground floor.",
      video: "/featured-barber.mp4",
      title: "Barber and saloon video",
    },
    {
      slug: "shoes",
      name: "Sneaker shops",
      text: "Trainers and everyday footwear on the shop floor.",
      video: "/featured-sneakers.mp4",
      title: "Sneaker shops video",
      href: "/shop",
    },
    {
      slug: "clothing",
      name: "Fashion shops",
      text: "Clothing and fashion on the upper floor.",
      video: "/featured-fashion.mp4",
      title: "Fashion shops video",
    },
    {
      slug: "printing",
      name: "Printing and branding",
      text: "Print, signage, and brand work for shops and offices.",
      video: "/featured-printing.mp4",
      title: "Printing and branding shop video",
      href: "/shop",
    },
  ];

  const FEATURED_VERSION = "videos-v8-welcome-nav";
  const TOUR_VIDEO = "/tour-aerial.mp4";
  const ROOFTOP_IMAGE = "/rooftop-lounge.jpg";
  const ROOFTOP_ALT = "Trade Square Rooftop Lounge signage on the building facade";

  function bindLoopVideo(video) {
    if (!video || video.dataset.boundLoop === "1") return;
    video.dataset.boundLoop = "1";
    video.removeAttribute("controls");
    video.controls = false;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    const play = () => {
      video.muted = true;
      return video.play().catch(() => {});
    };
    play();
    video.addEventListener("pause", () => {
      if (!video.ended) play();
    });
    if (video.readyState >= 2) play();
    else video.addEventListener("canplay", play, { once: true });
  }

  function ensureTourVideo() {
    const frame = document.querySelector(".tour-frame");
    if (!frame) return;
    if (frame.dataset.tourVideo === FEATURED_VERSION) return;
    frame.dataset.tourVideo = FEATURED_VERSION;
    frame.innerHTML = `
      <video
        class="tour-aerial-video"
        src="${TOUR_VIDEO}"
        title="Trade Square Mall feature tour"
        autoplay
        muted
        loop
        playsinline
        webkit-playsinline
        preload="auto"
        disablepictureinpicture
        controlslist="nodownload nofullscreen noremoteplayback"
      ></video>
      <span class="tour-aerial-overlay" aria-hidden="true"></span>
    `;
    bindLoopVideo(frame.querySelector(".tour-aerial-video"));
  }

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function textMatches(el, re) {
    return re.test((el?.textContent || "").replace(/\s+/g, " ").trim());
  }

  function cleanLandingPage() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return;

    // Cocktail bar & night club cards / links / photos
    document
      .querySelectorAll(
        'a[href="/dine/cocktail-bar"], a[href="/dine/cocktail-bar/"], a[href*="cocktail-bar"]'
      )
      .forEach((link) => {
        const card =
          link.closest(".offer, .card, article, .feature, li, .event-row") || link;
        removeNode(card);
      });

    document.querySelectorAll("h2, h3, p, a, span").forEach((el) => {
      if (
        textMatches(el, /cocktail\s*bar/i) ||
        textMatches(el, /night\s*club/i) ||
        textMatches(el, /see nightlife/i)
      ) {
        const card =
          el.closest(".offer, .card, article, .feature, li, .event-row") || null;
        if (card) removeNode(card);
      }
    });

    // Rooftop nights block if it only framed nightlife
    document.querySelectorAll("section, .section").forEach((section) => {
      if (textMatches(section.querySelector("h2"), /rooftop nights/i)) {
        removeNode(section);
      }
    });

    // Shops on the floor + enrolled shops + placeholder directory on home
    const shopSection = document.getElementById("shop");
    if (shopSection) removeNode(shopSection);
    document.querySelectorAll("[data-enrolled-home]").forEach(removeNode);
    document.querySelectorAll("section, .section").forEach((section) => {
      const heading = section.querySelector("h2");
      if (
        textMatches(heading, /shops on the floor/i) ||
        textMatches(heading, /^enrolled shops$/i) ||
        textMatches(heading, /^open now$/i)
      ) {
        removeNode(section);
      }
      if (textMatches(section.querySelector(".kicker"), /^open now$/i) && section.querySelector(".card-grid")) {
        removeNode(section);
      }
    });

    // Official opening → Coming soon
    document.querySelectorAll("h1, h2, h3, .event-title, strong, em, span, p, time").forEach((el) => {
      if (!el.childElementCount && textMatches(el, /official opening/i)) {
        el.textContent = "Coming soon";
      } else if (textMatches(el, /official opening/i) && el.children.length) {
        el.childNodes.forEach((node) => {
          if (node.nodeType === 3 && /official opening/i.test(node.textContent || "")) {
            node.textContent = node.textContent.replace(/official opening/gi, "Coming soon");
          }
        });
      }
    });

    document.querySelectorAll(".studio-facts li, .event-row, .feature, article").forEach((el) => {
      if (textMatches(el, /26\s*september/i) || textMatches(el, /official opening/i)) {
        const strong = el.querySelector("strong");
        const span = el.querySelector("span");
        if (strong && /26|september|opening/i.test(strong.textContent || "")) {
          strong.textContent = "Coming soon";
        }
        if (span && /official opening|opening/i.test(span.textContent || "")) {
          span.textContent = "Opening date";
        }
        el.querySelectorAll("h2, .event-title").forEach((title) => {
          if (textMatches(title, /official opening/i)) title.textContent = "Coming soon";
        });
      }
    });
  }

  function hideBrokenNav() {
    const hideHref = (href) => {
      const path = String(href || "").replace(/\/+$/, "") || "/";
      return (
        path === "/enroll" ||
        path === "/enrol" ||
        path === "/shop" ||
        path === "/shops" ||
        path === "/dine" ||
        path === "/events" ||
        path === "/visit" ||
        /\/shop\//.test(path) ||
        /\/dine\//.test(path) ||
        /enroll/i.test(path)
      );
    };

    document.querySelectorAll(".nav-links a, .menu nav a, .footer-grid a, header a, .menu a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (hideHref(href) || /enrol/i.test(a.textContent || "")) {
        const li = a.closest("li");
        if (li) removeNode(li);
        else removeNode(a);
      }
    });

    document.querySelectorAll('[data-enrol-link="1"]').forEach(removeNode);

    // Hide Menu control when nav items are cleared
    document.querySelectorAll("button, a").forEach((el) => {
      if (/^menu$/i.test((el.textContent || "").trim())) {
        el.style.display = "none";
        el.setAttribute("aria-hidden", "true");
      }
    });
    document.querySelectorAll(".menu").forEach((menu) => {
      menu.style.display = "none";
      menu.setAttribute("hidden", "");
    });

    // Hide hero CTAs that point at incomplete flows
    document.querySelectorAll(".hero-actions a, .studio-copy a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (hideHref(href) || /browse the shops/i.test(a.textContent || "")) {
        removeNode(a);
      }
    });
  }

  function placeHomeSections(welcome, featured, floors, rooftopImage) {
    const hero = document.querySelector(".studio-hero");
    if (!hero || !hero.parentNode) return;
    // Under hero: Welcome → Featured shops → Floors guide
    hero.insertAdjacentElement("afterend", welcome);
    welcome.insertAdjacentElement("afterend", featured);
    featured.insertAdjacentElement("afterend", floors);
    // Rooftop image at the bottom of the page content
    const anchor =
      document.querySelector("footer") ||
      document.querySelector(".visit-banner")?.closest("section") ||
      floors;
    if (anchor && anchor.parentNode) {
      if (anchor.matches("footer")) anchor.insertAdjacentElement("beforebegin", rooftopImage);
      else floors.insertAdjacentElement("afterend", rooftopImage);
      // Keep image as the last section before footer if footer exists
      const footer = document.querySelector("footer");
      if (footer && rooftopImage.nextElementSibling !== footer) {
        footer.insertAdjacentElement("beforebegin", rooftopImage);
      }
    }
  }

  function ensureWelcomeIntro() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return null;

    let host = document.querySelector("[data-welcome-intro]");
    if (!host) {
      host = document.createElement("section");
      host.className = "section";
      host.setAttribute("data-welcome-intro", "1");
    }
    if (host.dataset.ready === FEATURED_VERSION) return host;
    host.dataset.ready = FEATURED_VERSION;
    host.innerHTML = `
      <div class="wrap">
        <div class="welcome-intro">
          <p class="kicker">Welcome</p>
          <h2>Welcome to Trade Square Mall – Kwekwe’s Premier Shopping &amp; Lifestyle Destination</h2>
          <p>Located right in the heart of the Kwekwe CBD at Stand 7633—conveniently opposite the main rank and just steps from the farmers market—Trade Square Mall is a modern, three-storey commercial hub designed to elevate your everyday shopping, dining, and business experience. Spanning three vibrant levels, our state-of-the-art complex brings together an eclectic mix of retail boutiques, trendy thrift stores, beauty salons, fast-food outlets, professional office spaces, and a fully equipped gym. After a day of shopping or working, head up to our signature rooftop bar and lounge to unwind, enjoy great company, and take in the city views beside our iconic "I ❤️ KWEKWE" display.</p>
        </div>
      </div>
    `;
    return host;
  }

  function ensureRooftopHomeImage() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return null;

    let host = document.querySelector("[data-rooftop-home-image]");
    if (!host) {
      host = document.createElement("section");
      host.className = "section";
      host.setAttribute("data-rooftop-home-image", "1");
    }
    if (host.dataset.ready === FEATURED_VERSION) return host;
    host.dataset.ready = FEATURED_VERSION;
    host.innerHTML = `
      <div class="wrap">
        <figure class="rooftop-home-bottom">
          <img src="${ROOFTOP_IMAGE}" alt="${escapeAttr(ROOFTOP_ALT)}" />
          <figcaption>Rooftop Lounge · Trade Square Mall</figcaption>
        </figure>
      </div>
    `;
    return host;
  }

  function ensureFeaturedShops() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return null;

    let host = document.querySelector("[data-featured-shops]");
    if (!host) {
      host = document.createElement("section");
      host.className = "section";
      host.setAttribute("data-featured-shops", "1");
    }

    if (host.dataset.ready === FEATURED_VERSION) return host;
    host.dataset.ready = FEATURED_VERSION;
    host.innerHTML = `
      <div class="wrap">
        <div class="section-head">
          <div>
            <p class="kicker">Featured shops</p>
          </div>
        </div>
        <div class="featured-shops">
          ${FEATURED.map(
            (shop) => `
            <a class="featured-shop" href="${escapeAttr(shop.href || `/shop/${shop.slug}`)}">
              <div class="featured-shop-media">
                <video
                  class="featured-shop-video"
                  src="${escapeAttr(shop.video)}"
                  title="${escapeAttr(shop.title)}"
                  autoplay
                  muted
                  loop
                  playsinline
                  webkit-playsinline
                  preload="auto"
                  disablepictureinpicture
                  controlslist="nodownload nofullscreen noremoteplayback"
                ></video>
                <span class="featured-shop-overlay" aria-hidden="true"></span>
              </div>
              <div class="featured-shop-copy">
                <h3>${escapeHtml(shop.name)}</h3>
                <p>${escapeHtml(shop.text)}</p>
                <span class="text-link">Open shop <span aria-hidden="true">→</span></span>
              </div>
            </a>`
          ).join("")}
        </div>
      </div>
    `;

    host.querySelectorAll(".featured-shop-video").forEach(bindLoopVideo);
    return host;
  }

  function ensureFloorsGuide() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return null;

    let host = document.querySelector("[data-floors-guide]");
    if (!host) {
      host = document.createElement("section");
      host.className = "section";
      host.setAttribute("data-floors-guide", "1");
    }
    if (host.dataset.ready === FEATURED_VERSION) return host;
    host.dataset.ready = FEATURED_VERSION;
    host.innerHTML = `
      <div class="wrap">
        <div class="section-head">
          <div>
            <p class="kicker">The building</p>
            <h2>What is on each floor</h2>
          </div>
        </div>
        <div class="floors-guide">
          <article class="floors-guide-card">
            <p class="kicker">Ground floor</p>
            <h3>Four departments</h3>
            <ol>
              <li><strong>Kitchens</strong> — 25 sqm</li>
              <li><strong>Hardwares</strong> — 25 sqm and 12 sqm</li>
              <li><strong>Grocery stores</strong> — 25 sqm</li>
              <li><strong>Offices</strong> — 12 sqm</li>
            </ol>
          </article>
          <article class="floors-guide-card">
            <p class="kicker">First floor</p>
            <h3>Retail floors</h3>
            <ul>
              <li><strong>Clothing section</strong> — 12 sqm and 25 sqm</li>
              <li><strong>Electronic accessories</strong> — 12 sqm and 25 sqm</li>
            </ul>
          </article>
          <article class="floors-guide-card">
            <p class="kicker">Second floor</p>
            <h3>Learning and fitness</h3>
            <ul>
              <li><strong>Learning Center</strong> — fully furnished classrooms</li>
              <li><strong>Gym</strong></li>
            </ul>
          </article>
        </div>
      </div>
    `;
    return host;
  }

  function ensureHomeSections() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return;
    const welcome = ensureWelcomeIntro();
    const featured = ensureFeaturedShops();
    const floors = ensureFloorsGuide();
    const rooftopImage = ensureRooftopHomeImage();
    if (welcome && featured && floors && rooftopImage) {
      placeHomeSections(welcome, featured, floors, rooftopImage);
    }
  }

  function ensureRooftopImages() {
    const selectors = [
      'a[href="/dine/rooftop-lounge"] img',
      'a[href="/dine/cocktail-bar"] img',
      'img[alt*="Rooftop Lounge"]',
      'img[alt*="cocktail bar"]',
      'img[alt*="Cocktail bar"]',
      'img[alt*="signage at night"]',
    ];
    document.querySelectorAll(selectors.join(",")).forEach((img) => {
      if (img.dataset.rooftopSwap === "1") return;
      img.dataset.rooftopSwap = "1";
      img.src = ROOFTOP_IMAGE;
      img.alt = ROOFTOP_ALT;
    });

    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path === "/dine/rooftop-lounge" || path === "/dine/cocktail-bar") {
      document.querySelectorAll(".place-hero img, .feature-media img, .card-media img").forEach((img) => {
        if (img.dataset.rooftopSwap === "1") return;
        img.dataset.rooftopSwap = "1";
        img.src = ROOFTOP_IMAGE;
        img.alt = ROOFTOP_ALT;
      });
    }
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
    hideBrokenNav();
    cleanLandingPage();
    ensureHomeSections();
    ensureTourVideo();
    ensureRooftopImages();
    hideBrokenNav();
    cleanLandingPage();
    const path = location.pathname.replace(/\/+$/, "") || "/";
    // Keep enrolled shops off the landing page; still sync /shop directory.
    if (path === "/shop") {
      const shops = await loadShops();
      if (shops.length) ensureDirectoryRail(shops);
    }
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

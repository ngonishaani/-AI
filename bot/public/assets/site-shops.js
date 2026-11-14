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
      slug: "shoes",
      name: "Sneaker shops",
      text: "Trainers and everyday footwear on the shop floor.",
      video: "/featured-sneakers.mp4",
      title: "Sneaker shops video",
      href: "#",
    },
    {
      slug: "clothing",
      name: "Fashion shops",
      text: "Clothing and fashion on the upper floor.",
      video: "/featured-fashion.mp4",
      title: "Fashion shops video",
      href: "#",
    },
    {
      slug: "printing",
      name: "Printing and branding",
      text: "Print, signage, and brand work for shops and offices.",
      video: "/featured-printing.mp4",
      title: "Printing and branding shop video",
      href: "#",
    },
  ];

  const FEATURED_VERSION = "videos-v22-no-barber";
  const TOUR_VIDEO = "/tour-aerial.mp4";
  const ROOFTOP_IMAGE = "/rooftop-lounge.jpg";
  const ROOFTOP_ALT = "Trade Square Rooftop Lounge signage on the building facade";

  const SHOP_SLIDER = [
    { src: "/shop-slider/01-royale-ape.jpg", name: "Royale Ape Studios" },
    { src: "/shop-slider/02-royal-touch.jpg", name: "Royal Touch Beauty Parlour" },
    { src: "/shop-slider/03-foreign-drip.jpg", name: "Kwekwe Foreign Drip" },
    { src: "/shop-slider/04-101-kicks.jpg", name: "101 Kicks ZW" },
    { src: "/shop-slider/05-bevy-beauty.jpg", name: "Bevy Beauty & Accessories" },
    { src: "/shop-slider/06-hatiperi-starlinks.jpg", name: "Hatiperi Starlinks" },
    { src: "/shop-slider/07-gabs-courier.jpg", name: "GABS Courier" },
    { src: "/shop-slider/08-books-r-us.jpg", name: "Books R Us" },
    { src: "/shop-slider/09-fashion-floor.jpg", name: "Fashion floor" },
    { src: "/shop-slider/10-kids-fashion.jpg", name: "Kids fashion" },
    { src: "/shop-slider/11-boutique.jpg", name: "Boutique" },
  ];

  function ensureHeroVideoOnly() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return;

    const hero = document.querySelector(".studio-hero");
    if (!hero) return;

    // Drop still images / poster so the hero is video-only
    hero.querySelectorAll(".studio-photos, .hero-img, img.hero-img").forEach(removeNode);
    hero.querySelectorAll("img").forEach((img) => {
      if (img.closest(".hero-video-wrap")) return;
      removeNode(img.closest("figure") || img);
    });

    const video = hero.querySelector(".hero-video, video");
    if (video) {
      video.removeAttribute("poster");
      video.poster = "";
      video.setAttribute("preload", "auto");
      video.muted = true;
      video.playsInline = true;
      video.play?.().catch(() => {});
    }

    const wrap = hero.querySelector(".hero-video-wrap");
    if (wrap) {
      wrap.style.backgroundImage = "none";
      wrap.style.backgroundColor = "#0d2e28";
    }
  }

  function bindLoopVideo(video, startAt = 0) {
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
    video.style.opacity = "0";

    const skip = Math.max(0, Number(startAt) || 0);
    const reveal = () => {
      video.style.opacity = "1";
    };
    const seekStart = () => {
      if (skip > 0 && video.currentTime < skip) {
        try {
          video.currentTime = skip;
        } catch (_) {}
      }
    };
    const play = () => {
      video.muted = true;
      seekStart();
      return video.play().catch(() => {});
    };

    video.addEventListener("loadeddata", () => {
      seekStart();
      play();
    });
    video.addEventListener("seeked", () => {
      if (skip <= 0 || video.currentTime >= skip - 0.05) reveal();
    }, { once: true });
    video.addEventListener("timeupdate", () => {
      if (skip > 0 && video.currentTime < skip) seekStart();
      // Loop back before native loop hits the white intro again
      if (skip > 0 && video.duration && video.currentTime > video.duration - 0.25) {
        video.currentTime = skip;
      }
    });
    video.addEventListener("pause", () => {
      if (!video.ended) play();
    });
    if (skip <= 0) {
      video.addEventListener("playing", reveal, { once: true });
    }
    if (video.readyState >= 2) play();
    else video.addEventListener("canplay", play, { once: true });
  }

  function ensureTourVideo(frameEl) {
    const frame =
      frameEl ||
      document.querySelector("[data-floors-guide] .tour-frame") ||
      document.querySelector("[data-tour-home] .tour-frame") ||
      document.querySelector(".tour-frame");
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
      if (
        section.hasAttribute("data-shop-slider") ||
        section.hasAttribute("data-featured-shops") ||
        section.hasAttribute("data-floors-guide")
      ) {
        return;
      }
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

  function isDeadLink(href) {
    const path = String(href || "").replace(/\/+$/, "") || "/";
    if (path === "#" || path === "/#" || path.startsWith("#")) return false;
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
  }

  function patchDeadLinks() {
    document.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (/browse the shops/i.test(a.textContent || "")) return;
      if (isDeadLink(href) || /enrol/i.test(a.textContent || "")) {
        a.setAttribute("href", "#");
        a.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
          },
          { once: false }
        );
      }
    });
  }

  function hideBrokenNav() {
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

    // Keep Browse the shops; point other incomplete hero CTAs to #
    document.querySelectorAll(".hero-actions a, .studio-copy a").forEach((a) => {
      if (/browse the shops/i.test(a.textContent || "")) return;
      const href = a.getAttribute("href") || "";
      if (isDeadLink(href)) a.setAttribute("href", "#");
    });

    patchDeadLinks();
  }

  function ensureHeroBrowseButton() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return;
    const actions = document.querySelector(".hero-actions");
    if (!actions) return;
    const existing = [...actions.querySelectorAll("a")].find((a) =>
      /browse the shops/i.test(a.textContent || "")
    );
    if (existing) {
      existing.classList.add("btn");
      existing.href = "#";
      return;
    }
    const btn = document.createElement("a");
    btn.className = "btn";
    btn.href = "#";
    btn.textContent = "Browse the shops";
    actions.insertBefore(btn, actions.firstChild);
  }

  function removeDuplicateMapAndHours() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return;

    const maps = [...document.querySelectorAll(".map-frame, [data-map='tradesquare']")];
    maps.slice(1).forEach((el) => removeNode(el.closest("section") || el.closest(".map-block") || el));

    const hours = [...document.querySelectorAll("table.hours")];
    hours.slice(1).forEach((el) => removeNode(el.closest("section") || el.closest(".split") || el));

    // Drop a second "Plan your day" / hours block if Find us already covers the map
    const planSections = [...document.querySelectorAll("section, .section")].filter((section) =>
      textMatches(section.querySelector("h1, h2"), /plan your day|when the doors are open/i)
    );
    if (planSections.length > 1) {
      planSections.slice(1).forEach(removeNode);
    }
  }

  function placeHomeSections(welcome, slider, featured, floors, amenities, rooftopImage) {
    const hero = document.querySelector(".studio-hero");
    if (!hero || !hero.parentNode) return;
    // Under hero: Welcome → Slider → Featured → Tour+Floors → Amenities → Rooftop
    hero.insertAdjacentElement("afterend", welcome);
    welcome.insertAdjacentElement("afterend", slider);
    slider.insertAdjacentElement("afterend", featured);
    featured.insertAdjacentElement("afterend", floors);
    floors.insertAdjacentElement("afterend", amenities);
    const footer = document.querySelector("footer");
    if (footer) footer.insertAdjacentElement("beforebegin", rooftopImage);
    else amenities.insertAdjacentElement("afterend", rooftopImage);
  }

  function stripSpaTour() {
    document.querySelectorAll("#tour, .tour-frame").forEach((el) => {
      if (el.closest("[data-floors-guide]")) return;
      removeNode(el.closest("section, .section") || el);
    });
  }

  function bindShopSlider(host) {
    const track = host.querySelector(".shop-slider-track");
    if (!track || track.dataset.bound === "1") return;
    track.dataset.bound = "1";

    const count = SHOP_SLIDER.length;
    let index = 0;
    let paused = false;
    let timer = 0;

    const stepWidth = () => {
      const tile = track.querySelector(".shop-slider-tile");
      if (!tile) return 130;
      const styles = getComputedStyle(track);
      const gap = parseFloat(styles.gap || styles.columnGap || "12") || 12;
      return tile.getBoundingClientRect().width + gap;
    };

    const render = (animate) => {
      track.style.transition = animate ? "transform 0.55s ease" : "none";
      track.style.transform = `translateX(${-index * stepWidth()}px)`;
    };

    const advance = () => {
      if (paused) return;
      index += 1;
      render(true);
      if (index >= count) {
        window.setTimeout(() => {
          index = 0;
          render(false);
        }, 560);
      }
    };

    const start = () => {
      clearInterval(timer);
      timer = window.setInterval(advance, 2600);
    };

    host.addEventListener("mouseenter", () => {
      paused = true;
    });
    host.addEventListener("mouseleave", () => {
      paused = false;
    });
    window.addEventListener("resize", () => render(false));

    render(false);
    start();
  }

  function ensureShopSlider() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return null;

    let host = document.querySelector("[data-shop-slider]");
    if (!host) {
      host = document.createElement("section");
      host.className = "section section--tight shop-slider-section";
      host.setAttribute("data-shop-slider", "1");
    }
    if (host.dataset.ready === FEATURED_VERSION) {
      bindShopSlider(host);
      return host;
    }
    host.dataset.ready = FEATURED_VERSION;

    const tiles = SHOP_SLIDER.map(
      (shop) => `
        <figure class="shop-slider-tile">
          <img src="${escapeAttr(shop.src)}" alt="${escapeAttr(shop.name)}" loading="lazy" />
          <figcaption>${escapeHtml(shop.name)}</figcaption>
        </figure>`
    ).join("");

    // Duplicate once so the one-at-a-time loop can wrap seamlessly
    host.innerHTML = `
      <div class="wrap">
        <div class="section-head">
          <div>
            <p class="kicker">Inside the mall</p>
            <h2>Know before you visit</h2>
          </div>
        </div>
      </div>
      <div class="shop-slider" aria-label="Shop storefronts sliding left one at a time">
        <div class="shop-slider-track">
          ${tiles}
          ${tiles}
        </div>
      </div>
    `;
    bindShopSlider(host);
    return host;
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
          <h2>Trade Square Mall</h2>
          <p class="welcome-intro-lead">Kwekwe’s premier shopping and lifestyle destination in the CBD.</p>
          <p>Opposite the main rank at Stand 7633, steps from the farmers market.</p>
        </div>
      </div>
    `;
    return host;
  }

  function ensureAmenitiesHome() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return null;

    let host = document.querySelector("[data-amenities-home]");
    if (!host) {
      host = document.createElement("section");
      host.className = "section";
      host.setAttribute("data-amenities-home", "1");
    }
    if (host.dataset.ready === FEATURED_VERSION) return host;
    host.dataset.ready = FEATURED_VERSION;
    host.innerHTML = `
      <div class="wrap">
        <div class="section-head">
          <div>
            <p class="kicker">Amenities</p>
            <h2>Built for a calm day out</h2>
          </div>
        </div>
        <div class="amenities-home">
          <article>
            <div class="amenities-home-media">
              <img src="/amenity-parking.jpg" alt="Free customer parking at Trade Square Mall" loading="lazy" />
            </div>
            <h3>Free customer parking</h3>
            <p>Park right in front of the mall for an easy stop.</p>
          </article>
          <article>
            <div class="amenities-home-media">
              <img src="/amenity-toilets.jpg" alt="Clean modern toilets at Trade Square Mall" loading="lazy" />
            </div>
            <h3>Clean modern toilets</h3>
            <p>Fresh, modern washrooms on the floors for every visit.</p>
          </article>
          <article>
            <div class="amenities-home-media">
              <img src="/amenity-solar.jpg" alt="Rooftop solar system at Trade Square Mall" loading="lazy" />
            </div>
            <h3>Solar system</h3>
            <p>Rooftop solar power supporting a cleaner, more reliable mall.</p>
          </article>
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
            <p class="kicker">On the floor</p>
            <h2>Featured shops</h2>
          </div>
        </div>
        <div class="featured-shops">
          ${FEATURED.map(
            (shop) => `
            <a class="featured-shop" href="${escapeAttr(shop.href || "#")}">
              <div class="featured-shop-media">
                <video
                  class="featured-shop-video"
                  src="${escapeAttr(shop.video)}"
                  title="${escapeAttr(shop.title)}"
                  data-start-at="${escapeAttr(String(shop.startAt || 0))}"
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

    host.querySelectorAll(".featured-shop-video").forEach((video) => {
      const startAt = Number(video.dataset.startAt || 0);
      bindLoopVideo(video, startAt);
    });
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
    if (host.dataset.ready === FEATURED_VERSION) {
      const frame = host.querySelector(".tour-frame");
      if (frame && !frame.querySelector("video")) ensureTourVideo(frame);
      return host;
    }
    host.dataset.ready = FEATURED_VERSION;
    host.innerHTML = `
      <div class="wrap">
        <div class="section-head">
          <div>
            <p class="kicker">Video</p>
            <h2>Feature tour</h2>
          </div>
        </div>
        <div class="tour-frame" data-owned-tour="1"></div>
      </div>
      <div class="wrap floors-guide-wrap">
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
    ensureTourVideo(host.querySelector(".tour-frame"));
    return host;
  }

  function ensureHomeSections() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return;
    document.documentElement.classList.remove("tsm-dark");
    document.body?.classList.remove("tsm-dark");
    stripSpaTour();

    const welcome = ensureWelcomeIntro();
    const featured = ensureFeaturedShops();
    const slider = ensureShopSlider();
    const floors = ensureFloorsGuide();
    const amenities = ensureAmenitiesHome();
    const rooftopImage = ensureRooftopHomeImage();
    if (welcome && featured && slider && floors && amenities && rooftopImage) {
      placeHomeSections(welcome, slider, featured, floors, amenities, rooftopImage);
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
    // Incomplete shop / directory routes stay as # placeholders for now
    document
      .querySelectorAll('a[href="/shops"], a[href="/shops/"], a[href="/shop"], a[href="/shop/"], a[href^="/shop/"]')
      .forEach((a) => {
        a.setAttribute("href", "#");
      });
  }

  let paintTimer = 0;
  async function paint() {
    forceShopLinks();
    hideBrokenNav();
    ensureHeroBrowseButton();
    ensureHeroVideoOnly();
    cleanLandingPage();
    removeDuplicateMapAndHours();
    ensureHomeSections();
    ensureRooftopImages();
    hideBrokenNav();
    ensureHeroBrowseButton();
    ensureHeroVideoOnly();
    cleanLandingPage();
    removeDuplicateMapAndHours();
    ensureHomeSections();
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

(() => {
  const STORAGE_KEY = "tsm-enrolled-shops";
  const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
  const CATALOG_URL =
    document.querySelector('meta[name="tsm-catalog-url"]')?.content?.trim() ||
    "https://ai-mallbot.onrender.com/catalog";
  const CATALOG_TOKEN =
    document.querySelector('meta[name="tsm-catalog-token"]')?.content?.trim() ||
    "";

  const form = document.getElementById("enrol-form");
  const productList = document.getElementById("product-list");
  const productTemplate = document.getElementById("product-template");
  const enrolledList = document.getElementById("enrolled-list");
  const enrolledEmpty = document.getElementById("enrolled-empty");
  const formStatus = document.getElementById("form-status");
  const imagePreview = document.getElementById("image-preview");
  const imageHint = document.getElementById("image-hint");
  const menuToggle = document.getElementById("menu-toggle");
  const mobileMenu = document.getElementById("mobile-menu");

  let editingId = null;
  let uploadedImageDataUrl = "";

  function loadShops() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveShops(shops) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shops));
  }

  /**
   * Send shops as-is (including compressed data-URL photos). The bot persists
   * uploads under /media/ and returns absolute image URLs for WhatsApp.
   */
  function shopsForBotSync(shops) {
    return { shops: Array.isArray(shops) ? shops : [] };
  }

  async function syncCatalogToBot(shops) {
    if (!CATALOG_URL) return { ok: false, skipped: true };
    const headers = { "Content-Type": "application/json" };
    if (CATALOG_TOKEN) {
      headers.Authorization = `Bearer ${CATALOG_TOKEN}`;
      headers["X-Catalog-Token"] = CATALOG_TOKEN;
    }
    const prepared = shopsForBotSync(shops);
    return fetch(CATALOG_URL, {
      method: "PUT",
      headers,
      body: JSON.stringify({ shops: prepared.shops }),
      mode: "cors",
      cache: "no-store",
    })
      .then(async (res) => {
        let data = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        if (!res.ok) {
          throw new Error(data?.error || `Bot sync failed (${res.status})`);
        }
        // Prefer bot-returned shops (data URLs rewritten to /media/ URLs)
        if (Array.isArray(data?.shops) && data.shops.length) {
          saveShops(data.shops);
          renderEnrolled();
        }
        return {
          ok: true,
          data,
          omittedImages: data?.omittedImages || 0,
          shopsWithImages: data?.shopsWithImages || 0,
        };
      })
      .catch((err) => ({ ok: false, error: err?.message || String(err) }));
  }

  async function hydrateFromBot() {
    if (!CATALOG_URL) return;
    try {
      const res = await fetch(CATALOG_URL, { method: "GET", mode: "cors", cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const remote = Array.isArray(data?.shops) ? data.shops : [];
      if (!remote.length && !loadShops().length) return;
      // Prefer the bot catalog as source of truth when it has shops
      if (remote.length) {
        saveShops(remote);
        renderEnrolled();
        setStatus(
          `Loaded ${remote.length} enrolled shop${remote.length === 1 ? "" : "s"} from WhatsApp bot.`
        );
      }
    } catch {
      // Offline / bot waking — keep localStorage
    }
  }

  async function saveShopsAndConfirm(shops, successMessage) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shops));
    renderEnrolled();
    setStatus(`${successMessage} Syncing to WhatsApp bot…`);
    const result = await syncCatalogToBot(shops);
    if (result.ok) {
      const live = result.data?.liveCount;
      const withImages = result.shopsWithImages;
      const omitted = result.omittedImages
        ? ` ${result.omittedImages} photo${result.omittedImages === 1 ? "" : "s"} could not be stored (too large).`
        : "";
      const photos =
        withImages != null
          ? ` ${withImages} shop photo${withImages === 1 ? "" : "s"} ready for WhatsApp.`
          : "";
      setStatus(
        live != null
          ? `${successMessage} Updated on WhatsApp bot (${live} shop${live === 1 ? "" : "s"} live).${photos}${omitted}`
          : `${successMessage} Updated on WhatsApp bot.${photos}${omitted}`
      );
    } else if (!result.skipped) {
      setStatus(
        `${successMessage} Saved here, but bot sync failed: ${result.error}`,
        true
      );
    } else {
      setStatus(successMessage);
    }
  }

  /** Resize/compress uploads so catalog sync stays under body limits. */
  function compressImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that image."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not decode that image."));
        img.onload = () => {
          const maxEdge = 1280;
          let { width, height } = img;
          const scale = Math.min(1, maxEdge / Math.max(width, height));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(String(reader.result || ""));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          let quality = 0.82;
          let dataUrl = canvas.toDataURL("image/jpeg", quality);
          while (dataUrl.length > 900_000 && quality > 0.45) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL("image/jpeg", quality);
          }
          resolve(dataUrl);
        };
        img.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "shop";
  }

  function setStatus(message, isError) {
    formStatus.textContent = message || "";
    formStatus.classList.toggle("is-error", Boolean(isError));
  }

  function renumberProducts() {
    [...productList.querySelectorAll("[data-product]")].forEach((card, index) => {
      const label = card.querySelector("[data-product-index]");
      if (label) label.textContent = String(index + 1);
    });
  }

  function addProduct(data = {}) {
    const node = productTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('[data-field="name"]').value = data.name || "";
    node.querySelector('[data-field="price"]').value = data.price || "";
    node.querySelector('[data-field="variation"]').value = data.variation || "";
    node.querySelector('[data-field="link"]').value = data.link || "";
    node.querySelector("[data-remove-product]").addEventListener("click", () => {
      if (productList.children.length <= 1) {
        node.querySelectorAll("input").forEach((input) => {
          input.value = "";
        });
        setStatus("Keep at least one product row, or clear the fields.");
        return;
      }
      node.remove();
      renumberProducts();
    });
    productList.appendChild(node);
    renumberProducts();
  }

  function showImagePreview(src) {
    const img = imagePreview.querySelector("img");
    if (!src) {
      imagePreview.hidden = true;
      img.removeAttribute("src");
      return;
    }
    img.src = src;
    imagePreview.hidden = false;
  }

  function readProducts() {
    return [...productList.querySelectorAll("[data-product]")].map((card) => ({
      name: card.querySelector('[data-field="name"]').value.trim(),
      price: card.querySelector('[data-field="price"]').value.trim(),
      variation: card.querySelector('[data-field="variation"]').value.trim(),
      link: card.querySelector('[data-field="link"]').value.trim(),
    })).filter((product) => product.name);
  }

  function renderEnrolled() {
    const shops = loadShops();
    enrolledList.innerHTML = "";
    enrolledEmpty.hidden = shops.length > 0;

    shops.forEach((shop) => {
      const li = document.createElement("li");
      li.className = "enrolled-item";

      const products = Array.isArray(shop.products) ? shop.products : [];
      const productHtml = products.length
        ? `<ul class="enrolled-item__products">${products
            .map(
              (p) =>
                `<li><span>${escapeHtml(p.name)}${p.variation ? ` · ${escapeHtml(p.variation)}` : ""}</span><span>${escapeHtml(p.price || "—")}</span></li>`
            )
            .join("")}</ul>`
        : "";

      li.innerHTML = `
        <div class="enrolled-item__top">
          <div>
            <strong>${escapeHtml(shop.name)}</strong>
            <div class="enrolled-item__meta">${escapeHtml(shop.floor)} · ${escapeHtml(shop.number)}</div>
          </div>
          ${shop.image ? `<img class="enrolled-item__thumb" src="${escapeAttr(shop.image)}" alt="" />` : ""}
        </div>
        <p class="enrolled-item__desc">${escapeHtml(shop.description || "")}</p>
        ${productHtml}
        <div class="enrolled-item__actions">
          <button class="text-button" type="button" data-edit="${escapeAttr(shop.id)}">Edit</button>
          <button class="text-button" type="button" data-delete="${escapeAttr(shop.id)}">Remove</button>
        </div>
      `;
      enrolledList.appendChild(li);
    });
  }

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

  function fillForm(shop) {
    editingId = shop.id;
    form.name.value = shop.name || "";
    form.floor.value = shop.floor || "";
    form.number.value = shop.number || "";
    form.image.value = shop.image && !String(shop.image).startsWith("data:") ? shop.image : "";
    form.description.value = shop.description || "";
    form.link.value = shop.link || "";
    uploadedImageDataUrl = shop.image && String(shop.image).startsWith("data:") ? shop.image : "";
    form.imageFile.value = "";
    imageHint.textContent = uploadedImageDataUrl
      ? "Using uploaded photo from this enrolment"
      : "Or upload a photo (max 1.5 MB)";
    showImagePreview(shop.image || "");
    productList.innerHTML = "";
    const products = shop.products && shop.products.length ? shop.products : [{}];
    products.forEach((product) => addProduct(product));
    setStatus(`Editing ${shop.name}`);
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetFormState() {
    editingId = null;
    uploadedImageDataUrl = "";
    form.reset();
    productList.innerHTML = "";
    addProduct();
    showImagePreview("");
    imageHint.textContent = "Or upload a photo (max 1.5 MB)";
    setStatus("");
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = form.name.value.trim();
    const floor = form.floor.value.trim();
    const number = form.number.value.trim();
    const description = form.description.value.trim();
    const link = form.link.value.trim();
    const imageUrl = form.image.value.trim();
    const image = uploadedImageDataUrl || imageUrl;
    const products = readProducts();

    if (!name || !floor || !number || !description) {
      setStatus("Please fill in shop name, floor, number, and description.", true);
      return;
    }
    if (!products.length) {
      setStatus("Add at least one product with a name.", true);
      return;
    }

    const shops = loadShops();
    const id = editingId || `${slugify(name)}-${Date.now().toString(36)}`;
    const payload = {
      id,
      name,
      floor,
      number,
      image,
      description,
      link,
      products: products.map((product, index) => ({
        id: `${slugify(product.name) || "product"}-${index + 1}`,
        ...product,
      })),
      updatedAt: new Date().toISOString(),
    };

    const next = editingId
      ? shops.map((shop) => (shop.id === editingId ? payload : shop))
      : [payload, ...shops];

    resetFormState();
    saveShopsAndConfirm(next, `${payload.name} saved.`);
  });

  form.addEventListener("reset", (event) => {
    event.preventDefault();
    resetFormState();
  });

  document.getElementById("add-product").addEventListener("click", () => {
    addProduct();
    const last = productList.lastElementChild;
    last?.querySelector('[data-field="name"]')?.focus();
  });

  form.image.addEventListener("input", () => {
    if (form.image.value.trim()) {
      uploadedImageDataUrl = "";
      imageHint.textContent = "Or upload a photo (max 1.5 MB)";
      showImagePreview(form.image.value.trim());
    } else if (!uploadedImageDataUrl) {
      showImagePreview("");
    }
  });

  form.imageFile.addEventListener("change", async () => {
    const file = form.imageFile.files && form.imageFile.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Please choose an image file.", true);
      form.imageFile.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus("Image is too large. Keep uploads under 1.5 MB.", true);
      form.imageFile.value = "";
      return;
    }
    setStatus("Compressing shop photo…");
    try {
      uploadedImageDataUrl = await compressImageFile(file);
      form.image.value = "";
      imageHint.textContent = `Selected: ${file.name}`;
      showImagePreview(uploadedImageDataUrl);
      setStatus("Shop photo ready — it will appear on WhatsApp when this shop is opened.");
    } catch (err) {
      setStatus(err?.message || "Could not read that image.", true);
      form.imageFile.value = "";
    }
  });

  enrolledList.addEventListener("click", (event) => {
    const editId = event.target.getAttribute("data-edit");
    const deleteId = event.target.getAttribute("data-delete");
    if (editId) {
      const shop = loadShops().find((item) => item.id === editId);
      if (shop) fillForm(shop);
      return;
    }
    if (deleteId) {
      const shops = loadShops().filter((item) => item.id !== deleteId);
      if (editingId === deleteId) resetFormState();
      saveShopsAndConfirm(shops, "Shop removed.");
    }
  });

  document.getElementById("export-json").addEventListener("click", () => {
    const shops = loadShops();
    if (!shops.length) {
      setStatus("Nothing to export yet.", true);
      return;
    }
    const blob = new Blob([JSON.stringify({ shops }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trade-square-enrolled-shops.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded enrolled shops JSON.");
  });

  document.getElementById("clear-all").addEventListener("click", () => {
    if (!loadShops().length) return;
    if (!window.confirm("Clear all enrolled shops from this browser and the WhatsApp bot?")) return;
    resetFormState();
    saveShopsAndConfirm([], "All enrolments cleared.");
  });

  document.getElementById("sync-bot")?.addEventListener("click", async () => {
    const shops = loadShops();
    setStatus("Syncing enrolled shops to WhatsApp bot…");
    const result = await syncCatalogToBot(shops);
    if (result.ok) {
      const live = result.data?.liveCount;
      const withImages = result.shopsWithImages;
      const photos =
        withImages != null
          ? ` · ${withImages} shop photo${withImages === 1 ? "" : "s"} for WhatsApp`
          : "";
      const omitted = result.omittedImages
        ? ` · ${result.omittedImages} photo${result.omittedImages === 1 ? "" : "s"} skipped (too large)`
        : "";
      setStatus(
        live != null
          ? `Synced ${shops.length} enrolled shop${shops.length === 1 ? "" : "s"} · ${live} live on bot${photos}${omitted}.`
          : `Synced ${shops.length} enrolled shop${shops.length === 1 ? "" : "s"} to the bot${photos}${omitted}.`
      );
    } else {
      setStatus(`Bot sync failed: ${result.error}`, true);
    }
  });

  menuToggle?.addEventListener("click", () => {
    const open = mobileMenu.hasAttribute("hidden");
    if (open) mobileMenu.removeAttribute("hidden");
    else mobileMenu.setAttribute("hidden", "");
    menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  addProduct();
  renderEnrolled();
  hydrateFromBot();
})();

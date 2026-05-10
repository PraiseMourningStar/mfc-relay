const initialParams = new URLSearchParams(location.search);

const state = {
  channelId: initialParams.get("channel") || localStorage.getItem("mfcRelay.channelId") || "",
  setupToken: initialParams.get("setup_token") || localStorage.getItem("mfcRelay.setupToken") || "",
  publishToken: localStorage.getItem("mfcRelay.publishToken") || "",
  mode: location.hash === "#developer" ? "developer" : "model",
  settings: null,
  socials: [],
  albums: [],
  notices: [],
  ads: [],
};

// Bootstrap defaults so controls aren't blank before the first server fetch.
// Authoritative defaults live in src/validation.mjs.
const DEFAULT_SETTINGS = {
  display_name: "MFC Now Playing",
  template: "glassmorphic",
  preset: "glass-pop",
  accent_hex: "#8b5cf6",
  accent_palette: ["#8b5cf6", "#ec4899", "#22c55e", "#38bdf8"],
  color_mode: "solid",
  color_rotate_ms: 3500,
  anchor: "bottom-left",
  width_px: 680,
  scale: 1,
  glow_opacity: 0.35,
  card_opacity: 0.55,
  blur_radius: 18,
  corner_radius: 16,
  offset_x_px: 16,
  offset_y_px: 16,
  show_paused: false,
  stale_after_ms: 60000,
  custom_gif_enabled: false,
  custom_gif_url: "",
  social_rotation_enabled: false,
  social_items: [],
  album_rotation_enabled: false,
  album_items: [],
  notice_enabled: false,
  notice_items: [{ message: "New content is live", variant: "tip" }],
  ad_rotation_enabled: false,
  ad_items: [],
  tile_rotate_ms: 6500,
  tile_size: "compact",
};

const $ = (id) => document.getElementById(id);

const PRESETS = {
  "glass-pop": {
    template: "glassmorphic",
    accent_hex: "#8b5cf6",
    accent_palette: ["#8b5cf6", "#ec4899", "#22c55e", "#38bdf8"],
    glow_opacity: 0.35,
    card_opacity: 0.55,
    blur_radius: 18,
    corner_radius: 16,
  },
  "bubblegum": {
    template: "glassmorphic",
    accent_hex: "#ec4899",
    accent_palette: ["#ec4899", "#f97316", "#facc15", "#38bdf8"],
    glow_opacity: 0.45,
    card_opacity: 0.5,
    blur_radius: 20,
    corner_radius: 18,
  },
  "after-dark": {
    template: "spotify-dark",
    accent_hex: "#22c55e",
    accent_palette: ["#22c55e", "#14b8a6", "#a3e635"],
    glow_opacity: 0.28,
    card_opacity: 0.72,
    blur_radius: 10,
    corner_radius: 12,
  },
  "cyber-candy": {
    template: "neon-cyber",
    accent_hex: "#38bdf8",
    accent_palette: ["#38bdf8", "#f472b6", "#a78bfa", "#22d3ee"],
    glow_opacity: 0.52,
    card_opacity: 0.6,
    blur_radius: 14,
    corner_radius: 14,
  },
  "clean-luxe": {
    template: "minimal-clean",
    accent_hex: "#f59e0b",
    accent_palette: ["#f59e0b", "#10b981", "#60a5fa"],
    glow_opacity: 0.18,
    card_opacity: 0.84,
    blur_radius: 8,
    corner_radius: 10,
  },
};

// ─── Social platforms ──────────────────────────────────────────────
const PLATFORM_OPTIONS = [
  { value: "twitter", label: "Twitter / X" },
  { value: "instagram", label: "Instagram" },
  { value: "onlyfans", label: "OnlyFans" },
  { value: "custom", label: "Custom" },
];

const PLATFORM_DEFS = {
  twitter: { label: "Twitter", urlBase: "https://x.com/" },
  instagram: { label: "Instagram", urlBase: "https://instagram.com/" },
  onlyfans: { label: "OnlyFans", urlBase: "https://onlyfans.com/" },
  custom: { label: "Custom", urlBase: "" },
};

const SOCIAL_IMAGE_OPTIONS = [
  { value: "logo", label: "Platform logo" },
  { value: "image", label: "Own preview image" },
];

function platformFromLabel(label) {
  const text = String(label || "").toLowerCase();
  if (text.includes("onlyfans") || text === "of") return "onlyfans";
  if (text.includes("instagram") || text === "ig") return "instagram";
  if (text === "x" || text.includes("twitter")) return "twitter";
  return "custom";
}

function socialHandlePlaceholder(platform) {
  if (platform === "custom") return "name, label, or URL";
  return "modelname";
}

function normalizeSocialHandle(handle) {
  const raw = String(handle || "").trim();
  if (!raw) return "";

  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^@+/, "")}`;
    const url = new URL(candidate);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const socialHosts = new Set(["x.com", "twitter.com", "instagram.com", "onlyfans.com"]);
    if (socialHosts.has(host)) {
      return (url.pathname.split("/").filter(Boolean)[0] || "").replace(/^@+/, "");
    }
  } catch {
    // Plain handles are the normal case.
  }

  return raw
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(www\.)?(x\.com|twitter\.com|instagram\.com|onlyfans\.com)\//i, "")
    .split(/[/?#]/)[0]
    .replace(/^@+/, "");
}

function deriveSocialURL(platform, handle) {
  const stripped = normalizeSocialHandle(handle);
  if (!stripped) return "";
  const def = PLATFORM_DEFS[platform];
  if (!def?.urlBase) return "";
  return def.urlBase + encodeURIComponent(stripped);
}

const NOTICE_VARIANTS = [
  { value: "tip", label: "Tip" },
  { value: "promo", label: "Promo" },
  { value: "soft", label: "Soft" },
  { value: "hot", label: "Hot" },
];

const AD_TYPES = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
];

// ─── Field references ──────────────────────────────────────────────
const fields = {
  channelId: $("channelId"),
  setupToken: $("setupToken"),
  modelSetupUrl: $("modelSetupUrl"),
  copyModelSetup: $("copyModelSetup"),
  publishToken: $("publishToken"),
  copyOverlay: $("copyOverlay"),
  modelChannelLabel: $("modelChannelLabel"),
  displayName: $("displayName"),
  template: $("template"),
  preset: $("preset"),
  accent: $("accent"),
  colorMode: $("colorMode"),
  colorRotate: $("colorRotate"),
  palette: $("palette"),
  tileSize: $("tileSize"),
  anchor: $("anchor"),
  width: $("width"),
  scale: $("scale"),
  glow: $("glow"),
  card: $("card"),
  blur: $("blur"),
  radius: $("radius"),
  offsetX: $("offsetX"),
  offsetY: $("offsetY"),
  showPaused: $("showPaused"),
  customGifEnabled: $("customGifEnabled"),
  customGifUrl: $("customGifUrl"),
  socialRotationEnabled: $("socialRotationEnabled"),
  socialList: $("socialList"),
  addSocial: $("addSocial"),
  albumRotationEnabled: $("albumRotationEnabled"),
  albumList: $("albumList"),
  addAlbum: $("addAlbum"),
  noticeEnabled: $("noticeEnabled"),
  noticeList: $("noticeList"),
  addNotice: $("addNotice"),
  adRotationEnabled: $("adRotationEnabled"),
  adList: $("adList"),
  addAd: $("addAd"),
  tileRotate: $("tileRotate"),
  staleAfter: $("staleAfter"),
  adUpload: $("adUpload"),
  adUploadTitle: $("adUploadTitle"),
  adUploadCaption: $("adUploadCaption"),
  uploadAd: $("uploadAd"),
  exportSettings: $("exportSettings"),
  importSettingsButton: $("importSettingsButton"),
  importSettingsFile: $("importSettingsFile"),
  overlayUrl: $("overlayUrl"),
  embedSnippet: $("embedSnippet"),
  bridgeCommand: $("bridgeCommand"),
  preview: $("preview"),
  status: $("status"),
};

function setStatus(message, ok = false) {
  fields.status.textContent = message;
  fields.status.classList.toggle("ok", ok);
}

function setMode(mode, persist = true) {
  const nextMode = mode === "developer" ? "developer" : "model";
  state.mode = nextMode;

  document.querySelectorAll(".mode-button").forEach((button) => {
    const active = button.dataset.mode === nextMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  document.querySelectorAll(".mode-view").forEach((view) => {
    view.classList.toggle("active", view.dataset.modeView === nextMode);
  });

  if (persist) {
    localStorage.setItem("mfcRelay.mode", nextMode);
    history.replaceState(null, "", `#${nextMode}`);
  }
}

function setupAuthToken() {
  return state.setupToken || state.publishToken;
}

function setupAuthHeaders() {
  return {
    "content-type": "application/json",
    "authorization": `Bearer ${setupAuthToken()}`,
  };
}

function persistKeys() {
  localStorage.setItem("mfcRelay.channelId", state.channelId);
  localStorage.setItem("mfcRelay.setupToken", state.setupToken);
  localStorage.setItem("mfcRelay.publishToken", state.publishToken);
}

function overlayURL() {
  return `${location.origin}/overlay/${encodeURIComponent(state.channelId)}`;
}

function bridgeCommand() {
  return [
    "MFC_RELAY_URL=" + location.origin,
    "MFC_RELAY_CHANNEL=" + state.channelId,
    "MFC_RELAY_PUBLISH_TOKEN=" + state.publishToken,
    "npm --prefix mfc-relay run bridge",
  ].join(" \\\n  ");
}

function modelSetupURL() {
  if (!state.channelId || !state.setupToken) {
    return "";
  }

  const params = new URLSearchParams({
    channel: state.channelId,
    setup_token: state.setupToken,
  });
  return `${location.origin}/?${params.toString()}`;
}

function updateURLs() {
  if (!state.channelId) {
    fields.overlayUrl.value = "";
    fields.embedSnippet.value = "";
    fields.bridgeCommand.textContent = "";
    fields.modelSetupUrl.value = "";
    fields.copyOverlay.disabled = true;
    fields.copyModelSetup.disabled = true;
    fields.modelChannelLabel.textContent = "No channel loaded";
    fields.preview.removeAttribute("src");
    return;
  }

  fields.overlayUrl.value = `${overlayURL()}?show_paused=1`;
  fields.modelSetupUrl.value = modelSetupURL();
  fields.embedSnippet.value = `<script src="${location.origin}/embed.js?channel=${state.channelId}" data-height="180"></script>`;
  fields.bridgeCommand.textContent = state.publishToken ? bridgeCommand() : "";
  fields.copyOverlay.disabled = false;
  fields.copyModelSetup.disabled = !fields.modelSetupUrl.value;
  fields.modelChannelLabel.textContent = `Channel ${state.channelId}`;
  fields.preview.src = `${overlayURL()}?show_paused=1&preview=${Date.now()}`;
}

function serializePalette(colors) {
  return (Array.isArray(colors) ? colors : []).join(", ");
}

function parsePalette(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// ─── Row builder helpers ───────────────────────────────────────────
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== false && value != null) {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function makeSelect(name, options, value, onChange) {
  const select = document.createElement("select");
  select.name = name;
  for (const opt of options) {
    const optionEl = document.createElement("option");
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    if (opt.value === value) optionEl.selected = true;
    select.appendChild(optionEl);
  }
  select.addEventListener("change", onChange);
  return select;
}

function makeInput(type, value, onInput, attrs = {}) {
  const input = document.createElement("input");
  input.type = type;
  input.value = value ?? "";
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null && v !== false) input.setAttribute(k, v);
  }
  input.addEventListener("input", onInput);
  return input;
}

function makeRemove(onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "row-remove";
  button.title = "Remove";
  button.textContent = "×";
  button.addEventListener("click", onClick);
  return button;
}

function renderEmpty(container) {
  if (!container) return false;
  const emptyMessage = container.dataset.empty || "Empty.";
  if (!container.children.length) {
    const placeholder = document.createElement("div");
    placeholder.className = "row-empty";
    placeholder.textContent = emptyMessage;
    container.appendChild(placeholder);
    return true;
  }
  return false;
}

// ─── Socials ───────────────────────────────────────────────────────
function renderSocials() {
  const container = fields.socialList;
  if (!container) return;
  container.innerHTML = "";

  state.socials.forEach((row, index) => {
    const platform = row.platform || "twitter";
    const imageSource = row.imageSource || (row.image_url ? "image" : "logo");
    const platformSelect = makeSelect("platform", PLATFORM_OPTIONS, row.platform || "twitter", (event) => {
      state.socials[index].platform = event.target.value;
      renderSocials();
    });

    const handleInput = makeInput(
      "text",
      row.handle || "",
      (event) => { state.socials[index].handle = event.target.value; },
      { placeholder: socialHandlePlaceholder(platform), spellcheck: "false" }
    );

    const imageSourceSelect = makeSelect(
      "image_source",
      SOCIAL_IMAGE_OPTIONS,
      imageSource,
      (event) => {
        state.socials[index].imageSource = event.target.value;
        renderSocials();
      },
    );

    const rowEl = el("div", { class: "row row-social" }, [
      el("div", { class: "row-field" }, [
        el("span", { class: "row-label" }, "Site"),
        platformSelect,
      ]),
      el("div", { class: "row-field" }, [
        el("span", { class: "row-label" }, "Handle"),
        handleInput,
      ]),
      el("div", { class: "row-field" }, [
        el("span", { class: "row-label" }, "Artwork"),
        imageSourceSelect,
      ]),
    ]);

    if (imageSource === "image") {
      const imageInput = makeInput(
        "url",
        row.image_url || "",
        (event) => { state.socials[index].image_url = event.target.value; },
        { placeholder: "https://...jpg or /media/..." }
      );
      rowEl.append(el("div", { class: "row-field row-wide" }, [
        el("span", { class: "row-label" }, "Preview image"),
        imageInput,
      ]));
    }

    if (platform === "custom") {
      const labelInput = makeInput(
        "text",
        row.customLabel || "",
        (event) => { state.socials[index].customLabel = event.target.value; },
        { placeholder: "Display label" }
      );
      const urlInput = makeInput(
        "url",
        row.customURL || "",
        (event) => { state.socials[index].customURL = event.target.value; },
        { placeholder: "https://..." }
      );
      rowEl.append(
        el("div", { class: "row-field" }, [el("span", { class: "row-label" }, "Label"), labelInput]),
        el("div", { class: "row-field row-wide" }, [el("span", { class: "row-label" }, "Custom URL"), urlInput]),
      );
    }

    rowEl.append(makeRemove(() => {
      state.socials.splice(index, 1);
      renderSocials();
    }));

    container.appendChild(rowEl);
  });

  renderEmpty(container);
}

// ─── Albums ────────────────────────────────────────────────────────
function renderAlbums() {
  const container = fields.albumList;
  if (!container) return;
  container.innerHTML = "";

  state.albums.forEach((row, index) => {
    const titleInput = makeInput(
      "text",
      row.title || "",
      (event) => { state.albums[index].title = event.target.value; },
      { placeholder: "Album title (optional, fetched from share)" }
    );
    const captionInput = makeInput(
      "text",
      row.caption || "",
      (event) => { state.albums[index].caption = event.target.value; },
      { placeholder: "Caption (optional)" }
    );
    const urlInput = makeInput(
      "url",
      row.url || "",
      (event) => { state.albums[index].url = event.target.value; },
      { placeholder: "https://share.myfreecams.com/a/..." }
    );

    const imageSourceSelect = makeSelect(
      "image_source",
      [
        { value: "logo", label: "Use MFC logo placeholder" },
        { value: "image", label: "Use my own preview image" },
      ],
      row.imageSource || (row.image_url ? "image" : "logo"),
      (event) => {
        state.albums[index].imageSource = event.target.value;
        renderAlbums();
      },
    );

    const rowEl = el("div", { class: "row row-album" }, [
      el("div", { class: "row-field row-wide" }, [
        el("span", { class: "row-label" }, "Album link (paste a share URL)"),
        urlInput,
      ]),
      el("div", { class: "row-field" }, [
        el("span", { class: "row-label" }, "Title"),
        titleInput,
      ]),
      el("div", { class: "row-field" }, [
        el("span", { class: "row-label" }, "Caption"),
        captionInput,
      ]),
      el("div", { class: "row-field" }, [
        el("span", { class: "row-label" }, "Image source"),
        imageSourceSelect,
      ]),
    ]);

    if ((row.imageSource || (row.image_url ? "image" : "logo")) === "image") {
      const imageInput = makeInput(
        "url",
        row.image_url || "",
        (event) => { state.albums[index].image_url = event.target.value; },
        { placeholder: "https://...jpg" }
      );
      rowEl.append(el("div", { class: "row-field row-wide" }, [
        el("span", { class: "row-label" }, "Image URL"),
        imageInput,
      ]));
    }

    rowEl.append(makeRemove(() => {
      state.albums.splice(index, 1);
      renderAlbums();
    }));

    container.appendChild(rowEl);
  });

  renderEmpty(container);
}

// ─── Notices ───────────────────────────────────────────────────────
function renderNotices() {
  const container = fields.noticeList;
  if (!container) return;
  container.innerHTML = "";

  state.notices.forEach((row, index) => {
    const messageInput = makeInput(
      "text",
      row.message || "",
      (event) => { state.notices[index].message = event.target.value; },
      { placeholder: "New content is live" }
    );
    const variantSelect = makeSelect(
      "variant",
      NOTICE_VARIANTS,
      row.variant || "tip",
      (event) => { state.notices[index].variant = event.target.value; },
    );

    const rowEl = el("div", { class: "row row-notice" }, [
      el("div", { class: "row-field row-wide" }, [
        el("span", { class: "row-label" }, "Message"),
        messageInput,
      ]),
      el("div", { class: "row-field" }, [
        el("span", { class: "row-label" }, "Style"),
        variantSelect,
      ]),
      makeRemove(() => {
        state.notices.splice(index, 1);
        renderNotices();
      }),
    ]);

    container.appendChild(rowEl);
  });

  renderEmpty(container);
}

// ─── Ads ───────────────────────────────────────────────────────────
function renderAds() {
  const container = fields.adList;
  if (!container) return;
  container.innerHTML = "";

  state.ads.forEach((row, index) => {
    const titleInput = makeInput(
      "text",
      row.title || "",
      (event) => { state.ads[index].title = event.target.value; },
      { placeholder: "Tonight's special" }
    );
    const captionInput = makeInput(
      "text",
      row.caption || "",
      (event) => { state.ads[index].caption = event.target.value; },
      { placeholder: "Optional caption" }
    );
    const mediaInput = makeInput(
      "text",
      row.media_url || "",
      (event) => { state.ads[index].media_url = event.target.value; },
      { placeholder: "https://... or /media/..." }
    );
    const typeSelect = makeSelect(
      "media_type",
      AD_TYPES,
      row.media_type || (/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(row.media_url || "") ? "video" : "image"),
      (event) => { state.ads[index].media_type = event.target.value; },
    );
    const linkInput = makeInput(
      "url",
      row.url || "",
      (event) => { state.ads[index].url = event.target.value; },
      { placeholder: "https://...  (optional click-through)" }
    );

    const rowEl = el("div", { class: "row row-ad" }, [
      el("div", { class: "row-field" }, [el("span", { class: "row-label" }, "Title"), titleInput]),
      el("div", { class: "row-field" }, [el("span", { class: "row-label" }, "Caption"), captionInput]),
      el("div", { class: "row-field row-wide" }, [el("span", { class: "row-label" }, "Media URL"), mediaInput]),
      el("div", { class: "row-field" }, [el("span", { class: "row-label" }, "Type"), typeSelect]),
      el("div", { class: "row-field row-wide" }, [el("span", { class: "row-label" }, "Click-through URL"), linkInput]),
      makeRemove(() => {
        state.ads.splice(index, 1);
        renderAds();
      }),
    ]);

    container.appendChild(rowEl);
  });

  renderEmpty(container);
}

// ─── State ↔ wire format ───────────────────────────────────────────
function socialsToWire() {
  return state.socials
    .map((row) => {
      const platform = row.platform || "twitter";
      const def = PLATFORM_DEFS[platform] || PLATFORM_DEFS.custom;
      const isCustom = platform === "custom";
      const handle = isCustom ? String(row.handle || "").trim() : normalizeSocialHandle(row.handle);
      const useImage = (row.imageSource || (row.image_url ? "image" : "logo")) === "image";
      const label = isCustom ? (row.customLabel || "Link") : def.label;
      const value = handle ? (handle.startsWith("@") ? handle : `@${handle}`) : "";
      const url = isCustom ? (row.customURL || "") : deriveSocialURL(platform, handle);
      return {
        label,
        value: isCustom ? handle : value,
        url,
        image_url: useImage ? (row.image_url || "") : "",
      };
    })
    .filter((row) => row.value || row.url || row.image_url);
}

function albumsToWire() {
  return state.albums
    .map((row) => {
      const useImage = (row.imageSource || (row.image_url ? "image" : "logo")) === "image";
      return {
        title: row.title || "",
        caption: row.caption || "",
        image_url: useImage ? (row.image_url || "") : "",
        url: row.url || "",
      };
    })
    .filter((row) => row.title || row.caption || row.image_url || row.url);
}

function noticesToWire() {
  return state.notices
    .map((row) => ({ message: row.message || "", variant: row.variant || "tip" }))
    .filter((row) => row.message);
}

function adsToWire() {
  return state.ads
    .map((row) => ({
      title: row.title || "",
      caption: row.caption || "",
      media_url: row.media_url || "",
      media_type: row.media_type || (/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(row.media_url || "") ? "video" : "image"),
      url: row.url || "",
    }))
    .filter((row) => row.title || row.caption || row.media_url || row.url);
}

function socialsFromWire(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const platform = platformFromLabel(item.label);
    if (platform === "custom") {
      return {
        platform: "custom",
        handle: item.value || "",
        customLabel: item.label || "",
        customURL: item.url || "",
        image_url: item.image_url || "",
        imageSource: item.image_url ? "image" : "logo",
      };
    }
    return {
      platform,
      handle: String(item.value || "").replace(/^@+/, ""),
      image_url: item.image_url || "",
      imageSource: item.image_url ? "image" : "logo",
    };
  });
}

function albumsFromWire(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    title: item.title || "",
    caption: item.caption || "",
    image_url: item.image_url || "",
    imageSource: item.image_url ? "image" : "logo",
    url: item.url || "",
  }));
}

function noticesFromWire(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    message: item.message || "",
    variant: item.variant || "tip",
  }));
}

function adsFromWire(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    title: item.title || "",
    caption: item.caption || "",
    media_url: item.media_url || "",
    media_type: item.media_type || "image",
    url: item.url || "",
  }));
}

// ─── Apply / read settings ─────────────────────────────────────────
function applySettings(settings) {
  state.settings = settings;
  fields.displayName.value = settings.display_name || "";
  fields.template.value = settings.template || "glassmorphic";
  fields.preset.value = settings.preset || "glass-pop";
  fields.accent.value = settings.accent_hex || "#8b5cf6";
  fields.colorMode.value = settings.color_mode || "solid";
  fields.colorRotate.value = settings.color_rotate_ms ?? 3500;
  fields.palette.value = serializePalette(settings.accent_palette);
  fields.tileSize.value = settings.tile_size || "compact";
  fields.anchor.value = settings.anchor || "bottom-left";
  fields.width.value = settings.width_px || 680;
  fields.scale.value = settings.scale || 1;
  fields.glow.value = settings.glow_opacity ?? 0.35;
  fields.card.value = settings.card_opacity ?? 0.55;
  fields.blur.value = settings.blur_radius ?? 18;
  fields.radius.value = settings.corner_radius ?? 16;
  fields.offsetX.value = settings.offset_x_px ?? 16;
  fields.offsetY.value = settings.offset_y_px ?? 16;
  fields.showPaused.checked = Boolean(settings.show_paused);
  fields.staleAfter.value = settings.stale_after_ms ?? 60000;
  fields.customGifEnabled.checked = Boolean(settings.custom_gif_enabled);
  fields.customGifUrl.value = settings.custom_gif_url || "";

  fields.socialRotationEnabled.checked = Boolean(settings.social_rotation_enabled);
  state.socials = socialsFromWire(settings.social_items);
  renderSocials();

  fields.albumRotationEnabled.checked = Boolean(settings.album_rotation_enabled);
  state.albums = albumsFromWire(settings.album_items);
  renderAlbums();

  fields.noticeEnabled.checked = Boolean(settings.notice_enabled);
  state.notices = noticesFromWire(settings.notice_items);
  renderNotices();

  fields.adRotationEnabled.checked = Boolean(settings.ad_rotation_enabled);
  state.ads = adsFromWire(settings.ad_items);
  renderAds();

  fields.tileRotate.value = settings.tile_rotate_ms ?? 6500;
}

function readSettings() {
  return {
    display_name: fields.displayName.value,
    template: fields.template.value,
    preset: fields.preset.value,
    accent_hex: fields.accent.value,
    accent_palette: parsePalette(fields.palette.value),
    color_mode: fields.colorMode.value,
    color_rotate_ms: Number(fields.colorRotate.value),
    tile_size: fields.tileSize.value,
    anchor: fields.anchor.value,
    width_px: Number(fields.width.value),
    scale: Number(fields.scale.value),
    glow_opacity: Number(fields.glow.value),
    card_opacity: Number(fields.card.value),
    blur_radius: Number(fields.blur.value),
    corner_radius: Number(fields.radius.value),
    offset_x_px: Number(fields.offsetX.value),
    offset_y_px: Number(fields.offsetY.value),
    show_paused: fields.showPaused.checked,
    stale_after_ms: Number(fields.staleAfter.value),
    custom_gif_enabled: fields.customGifEnabled.checked,
    custom_gif_url: fields.customGifUrl.value,
    social_rotation_enabled: fields.socialRotationEnabled.checked,
    social_items: socialsToWire(),
    album_rotation_enabled: fields.albumRotationEnabled.checked,
    album_items: albumsToWire(),
    notice_enabled: fields.noticeEnabled.checked,
    notice_items: noticesToWire(),
    ad_rotation_enabled: fields.adRotationEnabled.checked,
    ad_items: adsToWire(),
    tile_rotate_ms: Number(fields.tileRotate.value),
  };
}

function applyPreset() {
  const preset = PRESETS[fields.preset.value];
  if (!preset) return;
  fields.template.value = preset.template;
  fields.accent.value = preset.accent_hex;
  fields.palette.value = serializePalette(preset.accent_palette);
  fields.glow.value = preset.glow_opacity;
  fields.card.value = preset.card_opacity;
  fields.blur.value = preset.blur_radius;
  fields.radius.value = preset.corner_radius;
}

// ─── Network ───────────────────────────────────────────────────────
async function loadChannel() {
  state.channelId = fields.channelId.value.trim();
  state.setupToken = fields.setupToken.value.trim();
  state.publishToken = fields.publishToken.value.trim();
  persistKeys();
  updateURLs();

  if (!state.channelId) {
    setStatus("Add a channel ID first.");
    return;
  }

  const response = await fetch(`/api/channels/${encodeURIComponent(state.channelId)}/settings`, { cache: "no-store" });
  if (!response.ok) {
    setStatus("Channel not found.");
    return;
  }

  applySettings(await response.json());
  updateURLs();
  setStatus("Channel loaded.", true);
}

async function createChannel() {
  const response = await fetch("/api/channels", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ display_name: "MFC Now Playing" }),
  });
  const payload = await response.json();
  if (!response.ok) {
    setStatus(payload.error || "Could not create channel.");
    return;
  }

  state.channelId = payload.id;
  state.setupToken = payload.settings_token || "";
  state.publishToken = payload.publish_token;
  fields.channelId.value = state.channelId;
  fields.setupToken.value = state.setupToken;
  fields.publishToken.value = state.publishToken;
  persistKeys();
  applySettings(payload.settings);
  updateURLs();
  setStatus("Channel created. Model setup URL is ready.", true);
}

async function saveSettings() {
  state.channelId = fields.channelId.value.trim();
  state.setupToken = fields.setupToken.value.trim();
  state.publishToken = fields.publishToken.value.trim();
  persistKeys();

  if (!state.channelId) {
    setStatus("Create or load a channel in Developer Setup first.");
    return;
  }

  if (!setupAuthToken()) {
    setStatus("Open a model setup link or load the setup token before saving.");
    return;
  }

  const response = await fetch(`/api/channels/${encodeURIComponent(state.channelId)}/settings`, {
    method: "PATCH",
    headers: setupAuthHeaders(),
    body: JSON.stringify(readSettings()),
  });
  const payload = await response.json();
  if (!response.ok) {
    setStatus(payload.error || "Could not save settings.");
    return;
  }

  applySettings(payload);
  updateURLs();
  setStatus("Settings saved.", true);
}

async function sendTestTrack() {
  state.channelId = fields.channelId.value.trim();
  state.setupToken = fields.setupToken.value.trim();
  state.publishToken = fields.publishToken.value.trim();
  persistKeys();

  if (!state.channelId) {
    setStatus("Create or load a channel in Developer Setup first.");
    return;
  }

  if (!setupAuthToken()) {
    setStatus("Open a model setup link or load the setup token before testing.");
    return;
  }

  const response = await fetch(`/api/channels/${encodeURIComponent(state.channelId)}/test`, {
    method: "POST",
    headers: setupAuthHeaders(),
  });
  const payload = await response.json();
  if (!response.ok) {
    setStatus(payload.error || "Could not send test track.");
    return;
  }

  updateURLs();
  setStatus("Test track sent.", true);
}

function fileToDataBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

async function uploadAdPreview() {
  state.channelId = fields.channelId.value.trim();
  state.setupToken = fields.setupToken.value.trim();
  state.publishToken = fields.publishToken.value.trim();
  persistKeys();

  const file = fields.adUpload.files?.[0];
  if (!state.channelId) {
    setStatus("Create or load a channel in Developer Setup first.");
    return;
  }

  if (!setupAuthToken()) {
    setStatus("Open a model setup link or load the setup token before uploading.");
    return;
  }
  if (!file) {
    setStatus("Choose an image or video first.");
    return;
  }

  setStatus("Uploading preview...");
  const response = await fetch(`/api/channels/${encodeURIComponent(state.channelId)}/media`, {
    method: "POST",
    headers: setupAuthHeaders(),
    body: JSON.stringify({
      mime_type: file.type,
      data_base64: await fileToDataBase64(file),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    setStatus(payload.error || "Could not upload preview.");
    return;
  }

  state.ads.push({
    title: fields.adUploadTitle.value || file.name.replace(/\.[^.]+$/, ""),
    caption: fields.adUploadCaption.value || "",
    media_url: payload.path || payload.url,
    media_type: payload.mime_type?.startsWith("video/") ? "video" : "image",
    url: "",
  });
  fields.adRotationEnabled.checked = true;
  fields.adUpload.value = "";
  fields.adUploadTitle.value = "";
  fields.adUploadCaption.value = "";
  renderAds();
  setStatus("Ad preview uploaded. Save settings to publish it.", true);
}

async function copyText(value) {
  if (!String(value || "").trim()) {
    setStatus("Nothing to copy yet.");
    return;
  }
  await navigator.clipboard.writeText(value);
  setStatus("Copied.", true);
}

// ─── Settings file (export/import) ─────────────────────────────────
const SETTINGS_FILE_FORMAT = "mfc-relay-settings";
const SETTINGS_FILE_VERSION = 1;

function safeFilenameSlug(value) {
  return String(value || "mfc-now-playing")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "mfc-now-playing";
}

function exportSettings() {
  const settings = readSettings();
  const payload = {
    format: SETTINGS_FILE_FORMAT,
    version: SETTINGS_FILE_VERSION,
    exported_at: new Date().toISOString(),
    settings,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilenameSlug(settings.display_name)}.mfcrelay.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Settings exported.", true);
}

function triggerImport() {
  fields.importSettingsFile.value = "";
  fields.importSettingsFile.click();
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incoming = parsed && typeof parsed === "object" && parsed.settings && typeof parsed.settings === "object"
      ? parsed.settings
      : parsed;

    if (!incoming || typeof incoming !== "object") {
      setStatus("That file doesn't look like a settings preset.");
      return;
    }

    if (parsed.format && parsed.format !== SETTINGS_FILE_FORMAT) {
      setStatus(`Unrecognized format "${parsed.format}".`);
      return;
    }

    delete incoming.id;
    delete incoming.publish_token;
    delete incoming.publishToken;
    delete incoming.settings_token;
    delete incoming.settingsToken;

    applySettings({ ...DEFAULT_SETTINGS, ...incoming });
    updateURLs();
    setStatus("Settings imported. Click Save Settings to publish.", true);
  } catch (error) {
    setStatus(`Could not read settings file: ${error.message || error}`);
  }
}

// ─── Wire events ───────────────────────────────────────────────────
document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    const tabName = button.dataset.tab;
    document.querySelectorAll(".tab-button").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.tabPanel === tabName);
    });
  });
});

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

$("createChannel").addEventListener("click", createChannel);
$("loadChannel").addEventListener("click", loadChannel);
$("saveSettings").addEventListener("click", saveSettings);
$("testTrack").addEventListener("click", sendTestTrack);
$("copyOverlay").addEventListener("click", () => copyText(fields.overlayUrl.value));
$("copyModelSetup").addEventListener("click", () => copyText(fields.modelSetupUrl.value));
$("copyBridge").addEventListener("click", () => copyText(fields.bridgeCommand.textContent));
fields.uploadAd.addEventListener("click", uploadAdPreview);
fields.preset.addEventListener("change", applyPreset);
fields.exportSettings.addEventListener("click", exportSettings);
fields.importSettingsButton.addEventListener("click", triggerImport);
fields.importSettingsFile.addEventListener("change", handleImportFile);

fields.addSocial.addEventListener("click", () => {
  state.socials.push({ platform: "twitter", handle: "", imageSource: "logo", image_url: "" });
  fields.socialRotationEnabled.checked = true;
  renderSocials();
});

fields.addAlbum.addEventListener("click", () => {
  state.albums.push({ title: "", caption: "", imageSource: "logo", image_url: "", url: "" });
  fields.albumRotationEnabled.checked = true;
  renderAlbums();
});

fields.addNotice.addEventListener("click", () => {
  state.notices.push({ message: "", variant: "tip" });
  fields.noticeEnabled.checked = true;
  renderNotices();
});

fields.addAd.addEventListener("click", () => {
  state.ads.push({ title: "", caption: "", media_url: "", media_type: "image", url: "" });
  fields.adRotationEnabled.checked = true;
  renderAds();
});

// ─── Boot ──────────────────────────────────────────────────────────
fields.channelId.value = state.channelId;
fields.setupToken.value = state.setupToken;
fields.publishToken.value = state.publishToken;
setMode(state.mode, false);
applySettings(DEFAULT_SETTINGS);
updateURLs();

if (initialParams.has("setup_token") || initialParams.has("channel")) {
  history.replaceState(null, "", `${location.pathname}${location.hash || ""}`);
}

if (state.channelId) {
  loadChannel().catch(() => setStatus("Could not auto-load saved channel."));
}

window.addEventListener("hashchange", () => {
  setMode(location.hash === "#developer" ? "developer" : "model", false);
});

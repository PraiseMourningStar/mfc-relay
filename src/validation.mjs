export const DEFAULT_TRACK = Object.freeze({
  available: false,
  state: "stopped",
  source: "",
  title: "",
  artist: "",
  album: "",
  duration_ms: 0,
  position_ms: 0,
  artwork_url: "",
  updated_at: 0,
});

export const DEFAULT_SETTINGS = Object.freeze({
  display_name: "MFC Now Playing",
  template: "glassmorphic",
  preset: "glass-pop",
  accent_hex: "#8b5cf6",
  accent_palette: ["#8b5cf6", "#ec4899", "#22c55e", "#38bdf8"],
  color_mode: "solid",
  color_rotate_ms: 3500,
  glow_opacity: 0.35,
  card_opacity: 0.55,
  blur_radius: 18,
  corner_radius: 16,
  scale: 1,
  width_px: 680,
  anchor: "bottom-left",
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
  notice_items: [
    {
      message: "New content is live",
      variant: "tip",
    },
  ],
  ad_rotation_enabled: false,
  ad_items: [],
  tile_rotate_ms: 6500,
  tile_rotation_order: ["social", "album", "ad", "notice"],
  tile_size: "compact",
});

export const TEMPLATE_NAMES = Object.freeze([
  "glassmorphic",
  "compact-bar",
  "minimal-clean",
  "neon-cyber",
  "spotify-dark",
]);

export const PRESET_NAMES = Object.freeze([
  "glass-pop",
  "bubblegum",
  "after-dark",
  "cyber-candy",
  "clean-luxe",
]);

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const SAFE_STATE = new Set(["playing", "paused", "stopped"]);
const SAFE_PRESET = new Set(PRESET_NAMES);
const SAFE_COLOR_MODE = new Set(["solid", "rotating"]);
const SAFE_NOTICE_VARIANT = new Set(["tip", "promo", "soft", "hot"]);
const SAFE_AD_MEDIA_TYPE = new Set(["image", "video"]);
const SAFE_ANCHOR = new Set([
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

export function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeText(value, maxLength = 160) {
  if (value == null) {
    return "";
  }
  return String(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength);
}

function normalizeURL(value, maxLength = 2048) {
  const text = normalizeText(value, maxLength).trim();
  if (!text) {
    return "";
  }

  if (text.startsWith("/")) {
    return text;
  }

  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizePalette(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[,\s]+/);
  const seen = new Set();
  const palette = [];

  for (const item of raw) {
    const color = normalizeText(item, 16).trim();
    if (HEX_RE.test(color) && !seen.has(color.toLowerCase())) {
      seen.add(color.toLowerCase());
      palette.push(color);
    }
    if (palette.length >= 8) {
      break;
    }
  }

  return palette.length ? palette : DEFAULT_SETTINGS.accent_palette;
}

function normalizeSocialItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 12).map((item) => ({
    label: normalizeText(item?.label, 40),
    value: normalizeText(item?.value, 120),
    url: normalizeURL(item?.url),
    image_url: normalizeURL(item?.image_url ?? item?.imageURL),
  })).filter((item) => item.label || item.value || item.url || item.image_url);
}

function normalizeAlbumItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 12).map((item) => ({
    title: normalizeText(item?.title, 120),
    caption: normalizeText(item?.caption, 160),
    image_url: normalizeURL(item?.image_url ?? item?.imageURL),
    url: normalizeURL(item?.url),
    published_at: normalizeText(item?.published_at ?? item?.publishedAt, 64),
  })).filter((item) => item.title || item.caption || item.image_url || item.url);
}

function normalizeNoticeItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 8).map((item) => {
    const variant = normalizeText(item?.variant, 24).toLowerCase();
    return {
      message: normalizeText(item?.message, 120),
      variant: SAFE_NOTICE_VARIANT.has(variant) ? variant : "tip",
    };
  }).filter((item) => item.message);
}

function inferMediaType(url) {
  const text = normalizeText(url, 2048).toLowerCase();
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/.test(text) ? "video" : "image";
}

const TILE_KINDS = new Set(["social", "album", "ad", "notice", "now-playing"]);
const SAFE_TILE_SIZE = new Set(["compact", "large"]);

function normalizeTileOrder(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[,\s]+/);
  const seen = new Set();
  const order = [];

  for (const item of raw) {
    const kind = normalizeText(item, 16).trim().toLowerCase();
    if (TILE_KINDS.has(kind) && !seen.has(kind)) {
      seen.add(kind);
      order.push(kind);
    }
  }

  for (const kind of DEFAULT_SETTINGS.tile_rotation_order) {
    if (!seen.has(kind)) {
      order.push(kind);
    }
  }

  return order;
}

function normalizeAdItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 12).map((item) => {
    const mediaURL = normalizeURL(item?.media_url ?? item?.mediaURL ?? item?.image_url ?? item?.imageURL);
    const mediaType = normalizeText(item?.media_type ?? item?.mediaType, 24).toLowerCase();
    return {
      title: normalizeText(item?.title, 120),
      caption: normalizeText(item?.caption, 160),
      media_url: mediaURL,
      media_type: SAFE_AD_MEDIA_TYPE.has(mediaType) ? mediaType : inferMediaType(mediaURL),
      url: normalizeURL(item?.url),
    };
  }).filter((item) => item.title || item.caption || item.media_url || item.url);
}

export function normalizeTrack(input = {}) {
  const raw = input.track && typeof input.track === "object" ? input.track : input;
  const state = normalizeText(raw.state, 24).toLowerCase();
  const durationMS = Math.round(clampNumber(raw.duration_ms ?? raw.durationMS, 0, 24 * 60 * 60 * 1000, 0));
  const positionMS = Math.round(clampNumber(raw.position_ms ?? raw.positionMS, 0, durationMS || 24 * 60 * 60 * 1000, 0));
  const artworkURL = normalizeText(raw.artwork_url ?? raw.artworkURL, 2048);

  return {
    available: Boolean(raw.available),
    state: SAFE_STATE.has(state) ? state : "stopped",
    source: normalizeText(raw.source, 64),
    title: normalizeText(raw.title, 240),
    artist: normalizeText(raw.artist, 240),
    album: normalizeText(raw.album, 240),
    duration_ms: durationMS,
    position_ms: durationMS > 0 ? Math.min(positionMS, durationMS) : positionMS,
    artwork_url: artworkURL,
    updated_at: Number.isFinite(Number(raw.updated_at ?? raw.updatedAt))
      ? Number(raw.updated_at ?? raw.updatedAt)
      : Date.now() / 1000,
  };
}

export function normalizeSettings(input = {}) {
  const next = {};

  if ("display_name" in input || "displayName" in input) {
    next.display_name = normalizeText(input.display_name ?? input.displayName, 80) || DEFAULT_SETTINGS.display_name;
  }

  if ("template" in input && TEMPLATE_NAMES.includes(input.template)) {
    next.template = input.template;
  }

  if ("preset" in input && SAFE_PRESET.has(input.preset)) {
    next.preset = input.preset;
  }

  if ("accent_hex" in input && HEX_RE.test(input.accent_hex)) {
    next.accent_hex = input.accent_hex;
  }

  if ("accent_palette" in input || "accentPalette" in input) {
    next.accent_palette = normalizePalette(input.accent_palette ?? input.accentPalette);
  }

  if ("color_mode" in input || "colorMode" in input) {
    const colorMode = normalizeText(input.color_mode ?? input.colorMode, 24).toLowerCase();
    if (SAFE_COLOR_MODE.has(colorMode)) {
      next.color_mode = colorMode;
    }
  }

  if ("color_rotate_ms" in input || "colorRotateMS" in input) {
    next.color_rotate_ms = Math.round(clampNumber(input.color_rotate_ms ?? input.colorRotateMS, 1000, 30000, DEFAULT_SETTINGS.color_rotate_ms));
  }

  if ("glow_opacity" in input) {
    next.glow_opacity = clampNumber(input.glow_opacity, 0, 1, DEFAULT_SETTINGS.glow_opacity);
  }

  if ("card_opacity" in input) {
    next.card_opacity = clampNumber(input.card_opacity, 0, 1, DEFAULT_SETTINGS.card_opacity);
  }

  if ("blur_radius" in input) {
    next.blur_radius = Math.round(clampNumber(input.blur_radius, 0, 48, DEFAULT_SETTINGS.blur_radius));
  }

  if ("corner_radius" in input) {
    next.corner_radius = Math.round(clampNumber(input.corner_radius, 0, 36, DEFAULT_SETTINGS.corner_radius));
  }

  if ("scale" in input) {
    next.scale = clampNumber(input.scale, 0.5, 2, DEFAULT_SETTINGS.scale);
  }

  if ("width_px" in input || "width" in input) {
    next.width_px = Math.round(clampNumber(input.width_px ?? input.width, 220, 1600, DEFAULT_SETTINGS.width_px));
  }

  if ("anchor" in input && SAFE_ANCHOR.has(input.anchor)) {
    next.anchor = input.anchor;
  }

  if ("offset_x_px" in input || "offsetX" in input) {
    next.offset_x_px = Math.round(clampNumber(input.offset_x_px ?? input.offsetX, 0, 400, DEFAULT_SETTINGS.offset_x_px));
  }

  if ("offset_y_px" in input || "offsetY" in input) {
    next.offset_y_px = Math.round(clampNumber(input.offset_y_px ?? input.offsetY, 0, 400, DEFAULT_SETTINGS.offset_y_px));
  }

  if ("show_paused" in input || "showPaused" in input) {
    next.show_paused = Boolean(input.show_paused ?? input.showPaused);
  }

  if ("stale_after_ms" in input || "staleAfterMS" in input) {
    next.stale_after_ms = Math.round(clampNumber(input.stale_after_ms ?? input.staleAfterMS, 3000, 300000, DEFAULT_SETTINGS.stale_after_ms));
  }

  if ("custom_gif_enabled" in input || "customGifEnabled" in input) {
    next.custom_gif_enabled = Boolean(input.custom_gif_enabled ?? input.customGifEnabled);
  }

  if ("custom_gif_url" in input || "customGifURL" in input) {
    next.custom_gif_url = normalizeURL(input.custom_gif_url ?? input.customGifURL);
  }

  if ("social_rotation_enabled" in input || "socialRotationEnabled" in input) {
    next.social_rotation_enabled = Boolean(input.social_rotation_enabled ?? input.socialRotationEnabled);
  }

  if ("social_items" in input || "socialItems" in input) {
    next.social_items = normalizeSocialItems(input.social_items ?? input.socialItems);
  }

  if ("album_rotation_enabled" in input || "albumRotationEnabled" in input) {
    next.album_rotation_enabled = Boolean(input.album_rotation_enabled ?? input.albumRotationEnabled);
  }

  if ("album_items" in input || "albumItems" in input) {
    next.album_items = normalizeAlbumItems(input.album_items ?? input.albumItems);
  }

  if ("notice_enabled" in input || "noticeEnabled" in input) {
    next.notice_enabled = Boolean(input.notice_enabled ?? input.noticeEnabled);
  }

  if ("notice_items" in input || "noticeItems" in input) {
    const notices = normalizeNoticeItems(input.notice_items ?? input.noticeItems);
    next.notice_items = notices.length ? notices : DEFAULT_SETTINGS.notice_items;
  }

  if ("ad_rotation_enabled" in input || "adRotationEnabled" in input) {
    next.ad_rotation_enabled = Boolean(input.ad_rotation_enabled ?? input.adRotationEnabled);
  }

  if ("ad_items" in input || "adItems" in input) {
    next.ad_items = normalizeAdItems(input.ad_items ?? input.adItems);
  }

  if ("tile_rotate_ms" in input || "tileRotateMS" in input) {
    next.tile_rotate_ms = Math.round(clampNumber(input.tile_rotate_ms ?? input.tileRotateMS, 2000, 60000, DEFAULT_SETTINGS.tile_rotate_ms));
  }

  if ("tile_rotation_order" in input || "tileRotationOrder" in input) {
    next.tile_rotation_order = normalizeTileOrder(input.tile_rotation_order ?? input.tileRotationOrder);
  }

  if ("tile_size" in input || "tileSize" in input) {
    const tileSize = normalizeText(input.tile_size ?? input.tileSize, 16).toLowerCase();
    if (SAFE_TILE_SIZE.has(tileSize)) {
      next.tile_size = tileSize;
    }
  }

  return next;
}

export function publicSettings(settings) {
  return {
    ...normalizeSettings(DEFAULT_SETTINGS),
    ...normalizeSettings(settings || {}),
  };
}

export function staleTrack(settings, track) {
  const staleAfterMS = publicSettings(settings).stale_after_ms;
  const now = Date.now();
  const lastSeen = Number(track?.received_at_ms || 0);

  if (!lastSeen || now - lastSeen <= staleAfterMS) {
    return normalizeTrack(track || DEFAULT_TRACK);
  }

  return {
    ...DEFAULT_TRACK,
    updated_at: Date.now() / 1000,
  };
}

export function normalizeArtwork(input = {}) {
  const artwork = input.artwork && typeof input.artwork === "object" ? input.artwork : input;
  const mimeType = normalizeText(artwork.mime_type ?? artwork.mimeType, 64).toLowerCase();
  const dataBase64 = normalizeText(artwork.data_base64 ?? artwork.dataBase64, 10 * 1024 * 1024);

  if (!dataBase64 || !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType)) {
    return null;
  }

  return {
    mime_type: mimeType,
    data_base64: dataBase64,
  };
}

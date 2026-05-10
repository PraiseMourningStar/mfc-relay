#!/usr/bin/env node
import process from "node:process";

const relayURL = requireEnv("MFC_RELAY_URL").replace(/\/+$/, "");
const channelId = requireEnv("MFC_RELAY_CHANNEL");
const publishToken = requireEnv("MFC_RELAY_PUBLISH_TOKEN");
const localURL = (process.env.LOCAL_NOWPLAYING_URL || "http://127.0.0.1:8974").replace(/\/+$/, "");
const pollMS = Math.max(500, Number(process.env.MFC_RELAY_POLL_MS || 1000));
const syncSettings = process.env.MFC_RELAY_SYNC_SETTINGS === "1";
const maxArtworkBytes = Math.max(64 * 1024, Number(process.env.MFC_RELAY_MAX_ARTWORK_BYTES || 3 * 1024 * 1024));

let lastPayloadKey = "";
let lastTrackKey = "";
let failureCount = 0;
let online = true;
let publishedOnce = false;

function ts() {
  return new Date().toISOString();
}

function log(level, message) {
  const stream = level === "error" ? console.error : console.log;
  stream(`${ts()} [bridge] ${message}`);
}

function trackKey(track) {
  return [track?.source, track?.title, track?.artist, track?.album].join("::");
}

function describeTrack(track) {
  if (!track?.available) return "(no track)";
  const head = [track.title, track.artist].filter(Boolean).join(" — ");
  const tail = track.source ? ` [${track.source}]` : "";
  return `${head || "(untitled)"}${tail} ${track.state || ""}`.trim();
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJSON(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.json();
}

function isLocalArtworkURL(value) {
  if (!value) return false;
  if (value.startsWith("/")) return true;

  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function resolveLocalURL(value) {
  if (!value) return "";
  return new URL(value, `${localURL}/`).toString();
}

async function loadArtwork(artworkURL) {
  if (!isLocalArtworkURL(artworkURL)) {
    return null;
  }

  const response = await fetch(resolveLocalURL(artworkURL), { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  const contentType = (response.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(contentType)) {
    return null;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maxArtworkBytes) {
    return null;
  }

  return {
    mime_type: contentType,
    data_base64: bytes.toString("base64"),
  };
}

function relaySettings(localSettings) {
  if (!syncSettings || !localSettings || typeof localSettings !== "object") {
    return null;
  }

  const next = {};
  const keys = [
    "preset",
    "template",
    "accent_hex",
    "accent_palette",
    "color_mode",
    "color_rotate_ms",
    "glow_opacity",
    "card_opacity",
    "blur_radius",
    "corner_radius",
    "custom_gif_enabled",
    "custom_gif_url",
    "social_rotation_enabled",
    "social_items",
    "album_rotation_enabled",
    "album_items",
    "notice_enabled",
    "notice_items",
  ];

  for (const key of keys) {
    if (localSettings[key] != null) {
      next[key] = localSettings[key];
    }
  }

  if (localSettings.panel_opacity != null) next.card_opacity = localSettings.panel_opacity;
  if (localSettings.glow_strength != null) next.glow_opacity = localSettings.glow_strength;
  return next;
}

function payloadKey(payload) {
  return JSON.stringify({
    track: payload.track,
    settings: payload.settings,
    artworkVersion: payload.artwork ? `${payload.artwork.mime_type}:${payload.artwork.data_base64.length}` : "",
  });
}

async function push(payload) {
  const response = await fetch(`${relayURL}/api/channels/${encodeURIComponent(channelId)}/now-playing`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${publishToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Relay returned HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      // Keep the status-based message.
    }
    throw new Error(message);
  }
}

async function tick() {
  const [track, settings] = await Promise.all([
    fetchJSON(`${localURL}/api/now-playing`),
    fetchJSON(`${localURL}/api/settings`).catch(() => null),
  ]);
  const artwork = await loadArtwork(track.artwork_url);
  const payload = {
    track: {
      ...track,
      artwork_url: artwork ? "" : track.artwork_url,
    },
    artwork,
    settings: relaySettings(settings),
    clear_artwork: !track.artwork_url,
  };
  const key = payloadKey(payload);

  if (key === lastPayloadKey) {
    return;
  }

  await push(payload);
  lastPayloadKey = key;
  failureCount = 0;

  if (!online) {
    online = true;
    log("info", "reconnected to relay");
  }

  if (!publishedOnce) {
    publishedOnce = true;
    log("info", `first publish ok -> ${relayURL}/overlay/${channelId}`);
  }

  const nextTrackKey = trackKey(track);
  if (nextTrackKey !== lastTrackKey) {
    lastTrackKey = nextTrackKey;
    log("info", `published ${describeTrack(track)}${artwork ? " +artwork" : ""}`);
  }
}

log("info", `start  local=${localURL}  relay=${relayURL}  channel=${channelId}`);
log("info", `poll=${pollMS}ms  settings_sync=${syncSettings ? "on" : "off"}  max_artwork=${maxArtworkBytes}B`);

while (true) {
  try {
    await tick();
  } catch (error) {
    failureCount += 1;
    if (online) {
      online = false;
      log("error", `disconnected: ${error.message}`);
    } else {
      const every = failureCount < 5 ? 1 : 10;
      if (failureCount % every === 0) {
        log("error", `still disconnected (${failureCount} attempts): ${error.message}`);
      }
    }
  }
  await sleep(pollMS);
}

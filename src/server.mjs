import http from "node:http";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { RelayStore } from "./store.mjs";
import { publicSettings, staleTrack, TEMPLATE_NAMES } from "./validation.mjs";
import { fetchLinkPreview } from "./link_preview.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(APP_ROOT, "public");
const OVERLAYS_DIR = path.join(APP_ROOT, "themes");

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".mov", "video/quicktime"],
]);

function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    ...headers,
  });
  res.end(body);
}

function text(res, status, body, contentType = "text/plain; charset=utf-8", headers = {}) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

const QUIET_PATH_PREFIXES = ["/favicon", "/embed.js", "/studio.", "/theme/", "/overlay-client.js", "/hosted-overlay.css"];

function shouldLogPath(pathname) {
  if (pathname === "/health") return false;
  return !QUIET_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function logRequest(req, status, startedAt, pathname) {
  if (!shouldLogPath(pathname)) return;
  const ms = Math.max(0, Math.round(performance.now() - startedAt));
  const stamp = new Date().toISOString();
  const line = `${stamp} ${req.method} ${pathname} -> ${status} ${ms}ms`;
  if (status >= 500) {
    console.error(line);
  } else {
    console.log(line);
  }
}

function tokenFrom(req, url) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  return req.headers["x-mfc-relay-token"] || url.searchParams.get("token") || "";
}

function requireAdmin(req, res, url, adminKey, { allowOpen = false } = {}) {
  if (!adminKey) {
    if (allowOpen) {
      return true;
    }

    json(res, 503, { error: "ADMIN_KEY must be configured for this admin route" });
    return false;
  }

  if (tokenFrom(req, url) !== adminKey) {
    json(res, 401, { error: "Missing or invalid admin token" });
    return false;
  }

  return true;
}

function absoluteBaseURL(req, configuredBaseURL) {
  if (configuredBaseURL) {
    return configuredBaseURL.replace(/\/+$/, "");
  }

  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1";
  return `${proto}://${host}`;
}

async function readBody(req, limit = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON");
    error.statusCode = 400;
    throw error;
  }
}

async function serveFile(res, filePath, cacheControl = "public, max-age=300") {
  const contentType = MIME.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
  const body = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": body.length,
    "Cache-Control": cacheControl,
  });
  res.end(body);
}

async function servePublic(req, res, pathname) {
  const safePath = pathname === "/" ? "/studio.html" : pathname;
  const filePath = path.resolve(PUBLIC_DIR, `.${safePath}`);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return false;
  }

  try {
    await serveFile(res, filePath, safePath.endsWith(".html") ? "no-store" : "public, max-age=300");
    return true;
  } catch {
    return false;
  }
}

async function renderOverlayHTML(channel, req, configuredBaseURL, templateOverride) {
  const baseURL = absoluteBaseURL(req, configuredBaseURL);
  const settings = publicSettings(channel.settings);
  const template = TEMPLATE_NAMES.includes(templateOverride) ? templateOverride : settings.template;
  const templatePath = path.join(OVERLAYS_DIR, template, "index.html");
  let html = await readFile(templatePath, "utf8");

  html = html
    .replace(/<title>.*?<\/title>/, `<title>MFC Now Playing - ${escapeHTML(settings.display_name)}</title>`)
    .replace(/<link rel="stylesheet" href="styles\.css"\s*\/?>/, [
      `<link rel="stylesheet" href="/theme/${template}/styles.css">`,
      `<link rel="stylesheet" href="/hosted-overlay.css">`,
    ].join("\n  "))
    .replace(/<script src="overlay\.js"><\/script>/, [
      `<script>window.MFC_NOWPLAYING_RELAY = ${JSON.stringify({ channel: channel.id, baseURL })};</script>`,
      `<script src="/overlay-client.js"></script>`,
    ].join("\n  "));

  return html;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function publicChannelPayload(channel, req, baseURL) {
  const root = absoluteBaseURL(req, baseURL);
  return {
    id: channel.id,
    settings: publicSettings(channel.settings),
    urls: {
      overlay: `${root}/overlay/${channel.id}`,
      embed_js: `${root}/embed.js?channel=${channel.id}`,
      mfc_browser_source: `${root}/overlay/${channel.id}?show_paused=1`,
      now_playing: `${root}/api/channels/${channel.id}/now-playing`,
      settings: `${root}/api/channels/${channel.id}/settings`,
    },
  };
}

function modelSetupURL(channel, req, baseURL) {
  const root = absoluteBaseURL(req, baseURL);
  const params = new URLSearchParams({
    channel: channel.id,
    setup_token: channel.settings_token || "",
  });
  return `${root}/?${params.toString()}`;
}

export function createServer(options = {}) {
  const port = Number(options.port || process.env.PORT || 8080);
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(APP_ROOT, "data");
  const baseURL = options.baseURL || process.env.PUBLIC_BASE_URL || "";
  const adminKey = options.adminKey ?? process.env.ADMIN_KEY ?? "";
  const store = options.store || new RelayStore({ dataDir });

  const server = http.createServer(async (req, res) => {
    const startedAt = performance.now();
    let pathname = req.url || "/";
    res.on("finish", () => logRequest(req, res.statusCode, startedAt, pathname));

    try {
      const url = new URL(req.url || "/", "http://mfc-relay.local");
      pathname = decodeURIComponent(url.pathname);
      const segments = pathname.split("/").filter(Boolean);

      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
          "Access-Control-Allow-Headers": "authorization,content-type,x-mfc-relay-token",
          "Access-Control-Max-Age": "86400",
        });
        res.end();
        return;
      }

      if (req.method === "GET" && pathname === "/health") {
        json(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && pathname === "/api/link-preview") {
        json(res, 200, await fetchLinkPreview(url.searchParams.get("url")));
        return;
      }

      if (req.method === "GET" && pathname === "/") {
        await servePublic(req, res, "/studio.html");
        return;
      }

      if (req.method === "GET" && pathname === "/favicon.ico") {
        text(res, 204, "");
        return;
      }

      if (req.method === "GET" && pathname === "/embed.js") {
        await servePublic(req, res, "/embed.js");
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/theme/") && segments.length === 3 && segments[2] === "styles.css") {
        const template = segments[1];
        if (!TEMPLATE_NAMES.includes(template)) {
          json(res, 404, { error: "Unknown template" });
          return;
        }
        await serveFile(res, path.join(OVERLAYS_DIR, template, "styles.css"));
        return;
      }

      if (req.method === "GET" && await servePublic(req, res, pathname)) {
        return;
      }

      if (segments[0] === "api" && segments[1] === "channels" && segments.length === 2 && req.method === "GET") {
        if (!requireAdmin(req, res, url, adminKey)) {
          return;
        }

        const channels = await store.listChannels();
        json(res, 200, {
          channels: channels.map((channel) => ({
            ...channel,
            urls: {
              overlay: `${absoluteBaseURL(req, baseURL)}/overlay/${channel.id}`,
              mfc_browser_source: `${absoluteBaseURL(req, baseURL)}/overlay/${channel.id}?show_paused=1`,
            },
          })),
        });
        return;
      }

      if (req.method === "POST" && pathname === "/api/channels") {
        if (!requireAdmin(req, res, url, adminKey, { allowOpen: true })) {
          return;
        }

        const body = await readBody(req);
        const channel = await store.createChannel(body);
        const payload = publicChannelPayload(channel, req, baseURL);
        json(res, 201, {
          ...payload,
          urls: {
            ...payload.urls,
            model_setup: modelSetupURL(channel, req, baseURL),
          },
          publish_token: channel.publish_token,
          settings_token: channel.settings_token,
        });
        return;
      }

      if (segments[0] === "overlay" && segments[1] && req.method === "GET") {
        const channel = await store.requireChannel(segments[1]);
        text(res, 200, await renderOverlayHTML(channel, req, baseURL, url.searchParams.get("template")), "text/html; charset=utf-8");
        return;
      }

      if (segments[0] === "mfc" && segments[1] && req.method === "GET") {
        redirect(res, `/overlay/${segments[1]}?show_paused=1`);
        return;
      }

      if (segments[0] === "media" && segments[1] && segments[2] === "artwork" && req.method === "GET") {
        const channel = await store.requireChannel(segments[1]);
        if (!channel.artwork?.data_base64) {
          text(res, 404, "No artwork");
          return;
        }

        const body = Buffer.from(channel.artwork.data_base64, "base64");
        res.writeHead(200, {
          "Content-Type": channel.artwork.mime_type || "application/octet-stream",
          "Content-Length": body.length,
          "Cache-Control": "public, max-age=30",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(body);
        return;
      }

      if (segments[0] === "media" && segments[1] && segments[2] === "assets" && segments[3] && req.method === "GET") {
        const channel = await store.requireChannel(segments[1]);
        const asset = (channel.media_assets || []).find((item) => item.id === segments[3]);
        if (!asset) {
          text(res, 404, "No media asset");
          return;
        }

        await serveFile(res, store.assetFile(channel.id, asset), "public, max-age=3600");
        return;
      }

      if (segments[0] === "api" && segments[1] === "channels" && segments[2]) {
        const channelId = segments[2];
        const channel = await store.requireChannel(channelId);

        if (segments.length === 3 && req.method === "GET") {
          json(res, 200, publicChannelPayload(channel, req, baseURL));
          return;
        }

        if (segments.length === 3 && req.method === "DELETE") {
          if (!requireAdmin(req, res, url, adminKey)) {
            return;
          }

          await store.deleteChannel(channelId);
          json(res, 200, { ok: true, id: channel.id });
          return;
        }

        if (segments[3] === "rotate-token" && req.method === "POST") {
          if (!requireAdmin(req, res, url, adminKey)) {
            return;
          }

          const updated = await store.rotatePublishToken(channelId);
          json(res, 200, {
            ok: true,
            id: updated.id,
            publish_token: updated.publish_token,
          });
          return;
        }

        if (segments[3] === "rotate-setup-token" && req.method === "POST") {
          if (!requireAdmin(req, res, url, adminKey)) {
            return;
          }

          const updated = await store.rotateSettingsToken(channelId);
          json(res, 200, {
            ok: true,
            id: updated.id,
            settings_token: updated.settings_token,
            urls: {
              model_setup: modelSetupURL(updated, req, baseURL),
            },
          });
          return;
        }

        if (segments[3] === "settings") {
          if (req.method === "GET") {
            json(res, 200, publicSettings(channel.settings));
            return;
          }

          if (req.method === "PATCH") {
            if (!store.verifySettingsToken(channel, tokenFrom(req, url))) {
              json(res, 401, { error: "Missing or invalid setup token" });
              return;
            }

            const body = await readBody(req);
            const updated = await store.updateSettings(channelId, body);
            json(res, 200, publicSettings(updated.settings));
            return;
          }
        }

        if (segments[3] === "media" && req.method === "POST") {
          if (!store.verifySettingsToken(channel, tokenFrom(req, url))) {
            json(res, 401, { error: "Missing or invalid setup token" });
            return;
          }

          const body = await readBody(req, 36 * 1024 * 1024);
          const asset = await store.saveMediaAsset(channelId, body);
          json(res, 201, {
            ...asset,
            url: `${absoluteBaseURL(req, baseURL)}${asset.url}`,
            path: asset.url,
          });
          return;
        }

        if (segments[3] === "now-playing") {
          if (req.method === "GET") {
            const track = staleTrack(channel.settings, channel.track);
            if (track.artwork_url?.startsWith("/")) {
              track.artwork_url = `${absoluteBaseURL(req, baseURL)}${track.artwork_url}`;
            }
            json(res, 200, track);
            return;
          }

          if (req.method === "POST") {
            if (!store.verifyPublishToken(channel, tokenFrom(req, url))) {
              json(res, 401, { error: "Missing or invalid publish token" });
              return;
            }

            const body = await readBody(req);
            const updated = await store.publishTrack(channelId, body);
            json(res, 202, {
              ok: true,
              received_at: updated.track.received_at_ms,
            });
            return;
          }
        }

        if (segments[3] === "test" && req.method === "POST") {
          if (!store.verifySettingsToken(channel, tokenFrom(req, url))) {
            json(res, 401, { error: "Missing or invalid setup token" });
            return;
          }

          const updated = await store.publishTrack(channelId, {
            track: {
              available: true,
              state: "playing",
              source: "MFC Relay",
              title: "MFC Relay Test",
              artist: "Now Playing",
              album: "Overlay Check",
              duration_ms: 180000,
              position_ms: 42000,
              artwork_url: "",
            },
          });
          json(res, 202, { ok: true, received_at: updated.track.received_at_ms });
          return;
        }
      }

      json(res, 404, { error: "Not found" });
    } catch (error) {
      const status = error.statusCode || 500;
      json(res, status, { error: status === 500 ? "Internal server error" : error.message });
      if (status === 500) {
        console.error(error);
      }
    }
  });

  server.relay = { store, port };
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  const { port, store } = server.relay;
  const publicBase = process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}`;
  const adminConfigured = Boolean(process.env.ADMIN_KEY);
  server.listen(port, () => {
    console.log("─".repeat(54));
    console.log(` MFC now-playing relay`);
    console.log(`   listen     http://127.0.0.1:${port}`);
    console.log(`   public     ${publicBase}`);
    console.log(`   data dir   ${store.dataDir}`);
    console.log(`   admin key  ${adminConfigured ? "set (channel creation locked)" : "off (channel creation open)"}`);
    console.log("─".repeat(54));
  });
}

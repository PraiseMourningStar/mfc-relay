import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "../src/server.mjs";
import { extractLinkPreview } from "../src/link_preview.mjs";

async function withRelay(fn, options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "mfc-relay-"));
  const server = createServer({ dataDir, baseURL: "https://relay.example.test", ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseURL = `http://127.0.0.1:${address.port}`;

  try {
    await fn({ baseURL, server });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  return { response, body };
}

test("creates a channel and exposes hosted URLs", async () => {
  await withRelay(async ({ baseURL }) => {
    const { response, body } = await requestJSON(`${baseURL}/api/channels`, {
      method: "POST",
      body: JSON.stringify({ display_name: "MFC Room" }),
    });

    assert.equal(response.status, 201);
    assert.ok(body.id);
    assert.ok(body.publish_token);
    assert.ok(body.settings_token);
    assert.equal(body.settings.display_name, "MFC Room");
    assert.equal(body.urls.overlay, `https://relay.example.test/overlay/${body.id}`);
    assert.equal(body.urls.mfc_browser_source, `https://relay.example.test/overlay/${body.id}?show_paused=1`);
    assert.equal(body.urls.model_setup.includes(`channel=${body.id}`), true);
    assert.equal(body.urls.model_setup.includes("setup_token="), true);
  });
});

test("rejects invalid requested channel IDs instead of silently renaming them", async () => {
  await withRelay(async ({ baseURL }) => {
    const rejected = await requestJSON(`${baseURL}/api/channels`, {
      method: "POST",
      body: JSON.stringify({ id: "!!!", display_name: "Bad Room" }),
    });

    assert.equal(rejected.response.status, 400);
    assert.match(rejected.body.error, /Channel ID/);
  });
});

test("requires a publish token before accepting now-playing updates", async () => {
  await withRelay(async ({ baseURL }) => {
    const created = await requestJSON(`${baseURL}/api/channels`, { method: "POST", body: "{}" });
    const channelId = created.body.id;

    const rejected = await requestJSON(`${baseURL}/api/channels/${channelId}/now-playing`, {
      method: "POST",
      body: JSON.stringify({
        track: {
          available: true,
          state: "playing",
          source: "Spotify",
          title: "Nope",
        },
      }),
    });

    assert.equal(rejected.response.status, 401);
  });
});

test("lets setup tokens update model-facing settings but not now-playing data", async () => {
  await withRelay(async ({ baseURL }) => {
    const created = await requestJSON(`${baseURL}/api/channels`, { method: "POST", body: "{}" });
    const channelId = created.body.id;
    const setupToken = created.body.settings_token;

    const patched = await requestJSON(`${baseURL}/api/channels/${channelId}/settings`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${setupToken}` },
      body: JSON.stringify({
        display_name: "Model Controlled",
        preset: "clean-luxe",
      }),
    });

    assert.equal(patched.response.status, 200);
    assert.equal(patched.body.display_name, "Model Controlled");
    assert.equal(patched.body.preset, "clean-luxe");

    const testTrack = await requestJSON(`${baseURL}/api/channels/${channelId}/test`, {
      method: "POST",
      headers: { authorization: `Bearer ${setupToken}` },
    });
    assert.equal(testTrack.response.status, 202);

    const nowPlaying = await requestJSON(`${baseURL}/api/channels/${channelId}/now-playing`, {
      method: "POST",
      headers: { authorization: `Bearer ${setupToken}` },
      body: JSON.stringify({
        track: {
          available: true,
          state: "playing",
          title: "Should not publish",
        },
      }),
    });

    assert.equal(nowPlaying.response.status, 401);
  });
});

test("publishes track data and rewrites uploaded artwork to hosted media", async () => {
  await withRelay(async ({ baseURL }) => {
    const created = await requestJSON(`${baseURL}/api/channels`, { method: "POST", body: "{}" });
    const channelId = created.body.id;
    const token = created.body.publish_token;

    const pngBase64 = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d,
    ]).toString("base64");

    const accepted = await requestJSON(`${baseURL}/api/channels/${channelId}/now-playing`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({
        track: {
          available: true,
          state: "playing",
          source: "Music",
          title: "Relay Song",
          artist: "MFC Relay",
          duration_ms: 120000,
          position_ms: 30000,
          artwork_url: "",
        },
        artwork: {
          mime_type: "image/png",
          data_base64: pngBase64,
        },
      }),
    });
    assert.equal(accepted.response.status, 202);

    const track = await requestJSON(`${baseURL}/api/channels/${channelId}/now-playing`);
    assert.equal(track.body.title, "Relay Song");
    assert.equal(track.body.artwork_url.startsWith("https://relay.example.test/media/"), true);

    const artwork = await fetch(`${baseURL}/media/${channelId}/artwork`);
    assert.equal(artwork.status, 200);
    assert.equal(artwork.headers.get("content-type"), "image/png");
  });
});

test("patches settings and renders an overlay page using the selected template", async () => {
  await withRelay(async ({ baseURL }) => {
    const created = await requestJSON(`${baseURL}/api/channels`, { method: "POST", body: "{}" });
    const channelId = created.body.id;
    const token = created.body.publish_token;

    const patched = await requestJSON(`${baseURL}/api/channels/${channelId}/settings`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({
        template: "compact-bar",
        accent_hex: "#22c55e",
        anchor: "top-right",
      }),
    });
    assert.equal(patched.response.status, 200);
    assert.equal(patched.body.template, "compact-bar");
    assert.equal(patched.body.accent_hex, "#22c55e");

    const overlay = await fetch(`${baseURL}/overlay/${channelId}`);
    const html = await overlay.text();
    assert.equal(overlay.status, 200);
    assert.match(html, /\/theme\/compact-bar\/styles\.css/);
    assert.match(html, /MFC_NOWPLAYING_RELAY/);
  });
});

test("stores extended overlay content settings for model-facing rotations", async () => {
  await withRelay(async ({ baseURL }) => {
    const created = await requestJSON(`${baseURL}/api/channels`, { method: "POST", body: "{}" });
    const channelId = created.body.id;
    const token = created.body.publish_token;

    const patched = await requestJSON(`${baseURL}/api/channels/${channelId}/settings`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({
        preset: "cyber-candy",
        color_mode: "rotating",
        accent_palette: ["#38bdf8", "nope", "#ec4899", "#38bdf8"],
        custom_gif_enabled: true,
        custom_gif_url: "https://media.example.test/cute.gif",
        social_rotation_enabled: true,
        social_rotate_ms: 12345,
        social_items: [
          {
            label: "Twitter",
            value: "@model",
            url: "https://x.example.test/model",
            image_url: "/media/model/assets/social-card",
          },
          { label: "OF", value: "modelname", url: "javascript:alert(1)" },
        ],
        album_rotation_enabled: true,
        album_rotate_ms: 23456,
        album_items: [
          {
            title: "New MFC Share Album",
            caption: "Fresh set",
            image_url: "https://media.example.test/album.jpg",
            url: "https://share.example.test/album",
          },
        ],
        notice_enabled: true,
        notice_rotate_ms: 34567,
        notice_items: [
          { message: "New content is live", variant: "hot" },
        ],
        ad_rotation_enabled: true,
        ad_rotate_ms: 45678,
        ad_items: [
          {
            title: "Tonight's special",
            caption: "Preview clip",
            media_url: "/media/model/assets/demo",
            media_type: "video",
          },
        ],
        tile_size: "large",
      }),
    });

    assert.equal(patched.response.status, 200);
    assert.equal(patched.body.preset, "cyber-candy");
    assert.equal(patched.body.color_mode, "rotating");
    assert.deepEqual(patched.body.accent_palette, ["#38bdf8", "#ec4899"]);
    assert.equal(patched.body.custom_gif_enabled, true);
    assert.equal(patched.body.custom_gif_url, "https://media.example.test/cute.gif");
    assert.equal(patched.body.social_items.length, 2);
    assert.equal(patched.body.social_items[0].image_url, "/media/model/assets/social-card");
    assert.equal(patched.body.social_items[1].url, "");
    assert.equal(patched.body.album_items[0].title, "New MFC Share Album");
    assert.equal(patched.body.notice_items[0].variant, "hot");
    assert.equal(patched.body.stale_after_ms, 60000);
    assert.equal(patched.body.ad_items[0].media_type, "video");
    assert.equal(patched.body.tile_size, "large");
    assert.equal(Object.hasOwn(patched.body, "social_rotate_ms"), false);
    assert.equal(Object.hasOwn(patched.body, "album_rotate_ms"), false);
    assert.equal(Object.hasOwn(patched.body, "notice_rotate_ms"), false);
    assert.equal(Object.hasOwn(patched.body, "ad_rotate_ms"), false);
  });
});

test("uploads and serves local media assets for ad previews", async () => {
  await withRelay(async ({ baseURL }) => {
    const created = await requestJSON(`${baseURL}/api/channels`, { method: "POST", body: "{}" });
    const channelId = created.body.id;
    const token = created.body.publish_token;
    const dataBase64 = Buffer.from("fake mp4 bytes").toString("base64");

    const uploaded = await requestJSON(`${baseURL}/api/channels/${channelId}/media`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({
        mime_type: "video/mp4",
        data_base64: dataBase64,
      }),
    });

    assert.equal(uploaded.response.status, 201);
    assert.equal(uploaded.body.mime_type, "video/mp4");
    assert.equal(uploaded.body.path.startsWith(`/media/${channelId}/assets/`), true);

    const media = await fetch(`${baseURL}${uploaded.body.path}`);
    assert.equal(media.status, 200);
    assert.equal(media.headers.get("content-type"), "video/mp4");
    assert.equal(await media.text(), "fake mp4 bytes");
  });
});

test("admin endpoints list, rotate, and delete channels without exposing tokens in listings", async () => {
  await withRelay(async ({ baseURL }) => {
    const admin = "admin-secret";
    const rejected = await requestJSON(`${baseURL}/api/channels`, { method: "GET" });
    assert.equal(rejected.response.status, 401);

    const created = await requestJSON(`${baseURL}/api/channels`, {
      method: "POST",
      headers: { authorization: `Bearer ${admin}` },
      body: JSON.stringify({ id: "model-one", display_name: "Model One" }),
    });
    assert.equal(created.response.status, 201);

    const listed = await requestJSON(`${baseURL}/api/channels`, {
      method: "GET",
      headers: { authorization: `Bearer ${admin}` },
    });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.body.channels.length, 1);
    assert.equal(listed.body.channels[0].id, "model-one");
    assert.equal(Object.hasOwn(listed.body.channels[0], "publish_token"), false);
    assert.equal(Object.hasOwn(listed.body.channels[0], "settings_token"), false);

    const rotatedPublish = await requestJSON(`${baseURL}/api/channels/model-one/rotate-token`, {
      method: "POST",
      headers: { authorization: `Bearer ${admin}` },
    });
    assert.equal(rotatedPublish.response.status, 200);
    assert.notEqual(rotatedPublish.body.publish_token, created.body.publish_token);

    const oldPublishRejected = await requestJSON(`${baseURL}/api/channels/model-one/now-playing`, {
      method: "POST",
      headers: { authorization: `Bearer ${created.body.publish_token}` },
      body: JSON.stringify({ track: { available: true, state: "playing", title: "Old" } }),
    });
    assert.equal(oldPublishRejected.response.status, 401);

    const rotatedSetup = await requestJSON(`${baseURL}/api/channels/model-one/rotate-setup-token`, {
      method: "POST",
      headers: { authorization: `Bearer ${admin}` },
    });
    assert.equal(rotatedSetup.response.status, 200);
    assert.notEqual(rotatedSetup.body.settings_token, created.body.settings_token);
    assert.equal(rotatedSetup.body.urls.model_setup.includes("setup_token="), true);

    const deleted = await requestJSON(`${baseURL}/api/channels/model-one`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${admin}` },
    });
    assert.equal(deleted.response.status, 200);

    const missing = await requestJSON(`${baseURL}/api/channels/model-one`);
    assert.equal(missing.response.status, 404);
  }, { adminKey: "admin-secret" });
});

test("extracts MFC share link preview metadata from public album HTML", () => {
  const preview = extractLinkPreview(`
    <html>
      <head><title>for my lovers</title></head>
      <body>
        <a class="avatar avatar-small user-link" href="/ModelName">
          <img src="https://img.mfcimg.com/photos2/123/avatar.150x150.jpg?nc=1" />ModelName
        </a>
        <div class="piece-preview-info">
          <span><i class="icon-videocam"></i>4 Minutes</span>
        </div>
      </body>
    </html>
  `, "https://share.myfreecams.com/a/example");

  assert.equal(preview.title, "for my lovers");
  assert.equal(preview.caption, "MFC Share album by ModelName - 4 Minutes");
  assert.equal(preview.image_url, "https://img.mfcimg.com/photos2/123/avatar.150x150.jpg?nc=1");
  assert.equal(preview.url, "https://share.myfreecams.com/a/example");
});

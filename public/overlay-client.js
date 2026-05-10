(function () {
  const config = window.MFC_NOWPLAYING_RELAY || {};
  const channel = config.channel || new URLSearchParams(location.search).get("channel");
  const baseURL = (config.baseURL || location.origin).replace(/\/+$/, "");
  const query = new URLSearchParams(location.search);
  const pollMS = Number(query.get("poll_ms") || 1000);

  const $ = (sel) => document.querySelector(sel);
  const TILE_TRANSITION_MS = 280;
  const DEFAULT_TILE_ORDER = ["social", "album", "ad", "notice"];
  const LARGE_TILE_ORDER = ["now-playing", "social", "album", "ad", "notice"];

  let lastTrackKey = "";
  let hideTimer = null;
  const previewCache = new Map();

  const colorRotator = { key: "", timer: null, index: 0 };
  const tileRotator = {
    key: "",
    timer: null,
    index: 0,
    sequence: [],
    transitioning: false,
  };

  function api(path) {
    return `${baseURL}/api/channels/${encodeURIComponent(channel)}${path}`;
  }

  function relayPath(path) {
    return `${baseURL}${path}`;
  }

  function formatTime(ms) {
    if (!ms || ms <= 0) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function trackKey(track) {
    return [track.source, track.title, track.artist, track.album].join("::");
  }

  function applyAnchor(settings) {
    const body = document.body;
    body.classList.remove(
      "sg-top-left",
      "sg-top-center",
      "sg-top-right",
      "sg-center-left",
      "sg-center",
      "sg-center-right",
      "sg-bottom-left",
      "sg-bottom-center",
      "sg-bottom-right",
    );
    body.classList.add(`sg-${settings.anchor || "bottom-left"}`);
  }

  function applyAccent(color) {
    if (color) document.documentElement.style.setProperty("--accent", color);
  }

  function list(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function applyTheme(settings) {
    const root = document.documentElement.style;
    root.setProperty("--sg-width", `${settings.width_px || 680}px`);
    root.setProperty("--sg-offset-x", `${settings.offset_x_px || 16}px`);
    root.setProperty("--sg-offset-y", `${settings.offset_y_px || 16}px`);
    root.setProperty("--sg-scale", String(settings.scale || 1));

    if (settings.accent_hex) applyAccent(settings.accent_hex);
    if (settings.glow_opacity != null) root.setProperty("--glow-opacity", settings.glow_opacity);
    if (settings.card_opacity != null) root.setProperty("--card-opacity", settings.card_opacity);
    if (settings.blur_radius != null) root.setProperty("--blur", `${settings.blur_radius}px`);
    if (settings.corner_radius != null) root.setProperty("--radius", `${settings.corner_radius}px`);

    applyAnchor(settings);
  }

  function syncColorRotation(settings) {
    const palette = list(settings.accent_palette);
    const rotating = settings.color_mode === "rotating" && palette.length > 1;

    if (!rotating) {
      if (colorRotator.timer) {
        clearInterval(colorRotator.timer);
      }
      colorRotator.timer = null;
      colorRotator.key = "";
      colorRotator.index = 0;
      applyAccent(settings.accent_hex || palette[0]);
      return;
    }

    const interval = Math.max(1000, Number(settings.color_rotate_ms || 3500));
    const key = JSON.stringify({ palette, every: interval });
    if (colorRotator.key === key) return;

    if (colorRotator.timer) clearInterval(colorRotator.timer);
    colorRotator.key = key;
    colorRotator.index = 0;
    applyAccent(palette[0]);
    colorRotator.timer = setInterval(() => {
      colorRotator.index = (colorRotator.index + 1) % palette.length;
      applyAccent(palette[colorRotator.index]);
    }, interval);
  }

  function setText(selector, value) {
    const node = $(selector);
    if (node) node.textContent = value || "";
  }

  function setImageSource(node, url) {
    if (!node) return;
    node.onerror = () => {
      node.removeAttribute("src");
      node.style.display = "none";
    };
    node.onload = () => {
      node.style.display = "";
    };

    if (url && node.getAttribute("src") !== url) {
      node.setAttribute("src", url);
      node.style.display = "";
    } else if (!url) {
      node.removeAttribute("src");
      node.style.display = "none";
    }
  }

  function socialIcon(label) {
    const text = String(label || "").toLowerCase();
    if (text.includes("myfreecams") || text.includes("mfc")) return "MFC";
    if (text.includes("onlyfans") || text === "of") return "OF";
    if (text.includes("instagram") || text === "ig") return "IG";
    if (text === "x" || text.includes("twitter")) return "X";
    if (text.includes("youtube")) return "YT";
    if (text.includes("tiktok")) return "TT";
    if (text.includes("snap")) return "SC";
    if (text.includes("discord")) return "DC";
    if (text.includes("telegram")) return "TG";
    if (text.includes("whatsapp")) return "WA";
    return "☆";
  }

  function createBrandMark(label) {
    const icon = document.createElement("span");
    icon.className = "sg-icon";
    icon.setAttribute("data-platform", String(label || "").toLowerCase());
    icon.textContent = socialIcon(label);
    return icon;
  }

  function ensureExtras(overlay) {
    let extras = overlay.querySelector(".sg-extras");
    if (!extras) {
      extras = document.createElement("div");
      extras.className = "sg-extras";
      extras.innerHTML = [
        '<img class="sg-gif" alt="">',
        '<div class="sg-tile" data-kind=""><div class="sg-tile-body"></div></div>',
      ].join("");
      overlay.appendChild(extras);
    }
    return extras;
  }

  function buildTileSequence(settings, track) {
    const isLarge = settings.tile_size === "large";
    const fallback = isLarge ? LARGE_TILE_ORDER : DEFAULT_TILE_ORDER;
    let order = list(settings.tile_rotation_order).length
      ? list(settings.tile_rotation_order)
      : fallback;
    if (isLarge && !order.includes("now-playing")) {
      order = ["now-playing", ...order];
    }
    if (!isLarge) {
      order = order.filter((kind) => kind !== "now-playing");
    }

    const trackPlaying = Boolean(track && track.available);
    const sources = {
      social: settings.social_rotation_enabled ? list(settings.social_items) : [],
      album: settings.album_rotation_enabled ? list(settings.album_items) : [],
      ad: settings.ad_rotation_enabled ? list(settings.ad_items) : [],
      notice: settings.notice_enabled ? list(settings.notice_items) : [],
      "now-playing": isLarge && trackPlaying ? [{ track }] : [],
    };

    const sequence = [];
    for (const kind of order) {
      for (const item of sources[kind] || []) {
        sequence.push({ kind, item });
      }
    }
    return sequence;
  }

  function renderSocialBody(body, item) {
    body.innerHTML = "";

    let visual = createBrandMark(item.label);
    if (item.image_url) {
      visual = document.createElement("img");
      visual.className = "sg-tile-thumb";
      visual.alt = "";
      setImageSource(visual, item.image_url);
    }

    const stack = document.createElement("div");
    stack.className = "sg-tile-stack";

    const label = document.createElement("div");
    label.className = "sg-tile-eyebrow";
    label.textContent = item.label || "Social";

    const value = document.createElement("div");
    value.className = "sg-tile-headline";
    value.textContent = item.value || item.url || "";

    stack.append(label, value);
    body.append(visual, stack);
  }

  function renderAlbumBody(body, item) {
    body.innerHTML = "";

    const previewKey = item.url || "";
    if (previewKey && (!item.title || !item.caption || !item.image_url)) {
      const cached = previewCache.get(previewKey);
      if (cached && cached.status === "ready") {
        item = {
          ...cached.preview,
          ...item,
          title: item.title || cached.preview.title,
          caption: item.caption || cached.preview.caption,
          image_url: item.image_url || cached.preview.image_url,
        };
      } else if (!cached) {
        previewCache.set(previewKey, { status: "loading" });
        fetch(relayPath(`/api/link-preview?url=${encodeURIComponent(previewKey)}`), { cache: "no-store" })
          .then((response) => response.ok ? response.json() : null)
          .then((preview) => {
            previewCache.set(previewKey, { status: "ready", preview: preview || {} });
            const tile = $(".sg-tile");
            if (tile && tile.dataset.kind === "album") {
              renderAlbumBody(body, { ...item, ...(preview || {}) });
            }
          })
          .catch(() => previewCache.set(previewKey, { status: "error", preview: {} }));
      }
    }

    let visual = createBrandMark("MFC Share");
    if (item.image_url) {
      visual = document.createElement("img");
      visual.className = "sg-tile-thumb";
      visual.alt = "";
      setImageSource(visual, item.image_url);
    }

    const stack = document.createElement("div");
    stack.className = "sg-tile-stack";

    const eyebrow = document.createElement("div");
    eyebrow.className = "sg-tile-eyebrow";
    eyebrow.textContent = "MFC Share";

    const title = document.createElement("div");
    title.className = "sg-tile-headline";
    title.textContent = item.title || "Loading preview…";

    const caption = document.createElement("div");
    caption.className = "sg-tile-caption";
    caption.textContent = item.caption || item.url || "";

    stack.append(eyebrow, title, caption);
    body.append(visual, stack);
  }

  function renderAdBody(body, item) {
    body.innerHTML = "";

    const media = document.createElement("div");
    media.className = "sg-tile-media";
    const mediaURL = item.media_url || "";
    if (mediaURL) {
      if (item.media_type === "video") {
        const video = document.createElement("video");
        video.src = mediaURL;
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        media.appendChild(video);
      } else {
        const image = document.createElement("img");
        image.alt = "";
        setImageSource(image, mediaURL);
        media.appendChild(image);
      }
    }

    const stack = document.createElement("div");
    stack.className = "sg-tile-stack";

    const eyebrow = document.createElement("div");
    eyebrow.className = "sg-tile-eyebrow";
    eyebrow.textContent = "Featured";

    const title = document.createElement("div");
    title.className = "sg-tile-headline";
    title.textContent = item.title || "Preview";

    const caption = document.createElement("div");
    caption.className = "sg-tile-caption";
    caption.textContent = item.caption || item.url || "";

    stack.append(eyebrow, title, caption);
    body.append(media, stack);
  }

  function renderNoticeBody(body, item) {
    body.innerHTML = "";

    const message = document.createElement("div");
    message.className = "sg-tile-headline sg-tile-notice";
    message.textContent = item.message || "";
    body.append(message);
  }

  function renderNowPlayingBody(body, item) {
    body.innerHTML = "";
    const track = item?.track || {};

    const artwork = document.createElement("div");
    artwork.className = "sg-tile-artwork";
    if (track.artwork_url) {
      const image = document.createElement("img");
      image.alt = "";
      setImageSource(image, track.artwork_url);
      artwork.appendChild(image);
    } else {
      artwork.classList.add("sg-tile-artwork-empty");
      artwork.textContent = "♪";
    }

    const stack = document.createElement("div");
    stack.className = "sg-tile-stack";

    const eyebrow = document.createElement("div");
    eyebrow.className = "sg-tile-eyebrow";
    eyebrow.textContent = `${track.state === "paused" ? "Paused" : "Now Playing"}${track.source ? ` · ${track.source}` : ""}`;

    const title = document.createElement("div");
    title.className = "sg-tile-headline";
    title.textContent = track.title || "Now Playing";

    const caption = document.createElement("div");
    caption.className = "sg-tile-caption";
    caption.textContent = [track.artist, track.album].filter(Boolean).join(" — ");

    stack.append(eyebrow, title, caption);

    if (track.duration_ms > 0) {
      const progress = document.createElement("div");
      progress.className = "sg-tile-progress";
      const fill = document.createElement("div");
      fill.className = "sg-tile-progress-fill";
      const percent = Math.max(0, Math.min(100, (track.position_ms / track.duration_ms) * 100));
      fill.style.width = `${percent}%`;
      progress.appendChild(fill);
      stack.append(progress);
    }

    body.append(artwork, stack);
  }

  function renderTile(tile, entry) {
    const body = tile.querySelector(".sg-tile-body");
    if (!body) return;

    if (!entry) {
      tile.classList.remove("visible");
      tile.dataset.kind = "";
      tile.removeAttribute("data-variant");
      body.innerHTML = "";
      return;
    }

    tile.dataset.kind = entry.kind;
    tile.classList.add("visible");

    if (entry.kind === "notice") {
      tile.setAttribute("data-variant", entry.item?.variant || "tip");
    } else {
      tile.removeAttribute("data-variant");
    }

    if (entry.kind === "social") return renderSocialBody(body, entry.item);
    if (entry.kind === "album") return renderAlbumBody(body, entry.item);
    if (entry.kind === "ad") return renderAdBody(body, entry.item);
    if (entry.kind === "notice") return renderNoticeBody(body, entry.item);
    if (entry.kind === "now-playing") return renderNowPlayingBody(body, entry.item);
  }

  function renderCurrentTile(tile, immediate = false) {
    const entry = tileRotator.sequence[tileRotator.index] || null;
    if (immediate || !tile.classList.contains("visible")) {
      renderTile(tile, entry);
      return;
    }

    if (tileRotator.transitioning) return;
    tileRotator.transitioning = true;
    tile.classList.add("sg-slide-out");

    setTimeout(() => {
      renderTile(tile, entry);
      tile.classList.remove("sg-slide-out");
      tile.classList.add("sg-slide-in");
      setTimeout(() => {
        tile.classList.remove("sg-slide-in");
        tileRotator.transitioning = false;
      }, TILE_TRANSITION_MS);
    }, TILE_TRANSITION_MS);
  }

  function syncTileRotation(settings, track) {
    const overlay = $(".overlay") || $(".overlay-shell");
    if (!overlay) return;

    const isLarge = settings.tile_size === "large";
    overlay.classList.toggle("sg-mode-large", isLarge);

    const extras = ensureExtras(overlay);
    extras.dataset.size = isLarge ? "large" : "compact";

    const gif = extras.querySelector(".sg-gif");
    const showGif = Boolean(settings.custom_gif_enabled && settings.custom_gif_url);
    if (gif) gif.classList.toggle("visible", showGif);
    setImageSource(gif, showGif ? settings.custom_gif_url : "");

    const tile = extras.querySelector(".sg-tile");
    const sequence = buildTileSequence(settings, track);
    const interval = Math.max(2000, Number(settings.tile_rotate_ms || 6500));
    const sequenceKey = sequence.map((entry) => entry.kind === "now-playing" ? "now-playing" : JSON.stringify(entry)).join("|");
    const key = JSON.stringify({ sequenceKey, interval });

    if (sequence.length === 0) {
      if (tileRotator.timer) clearInterval(tileRotator.timer);
      tileRotator.timer = null;
      tileRotator.key = "";
      tileRotator.index = 0;
      tileRotator.sequence = [];
      tileRotator.transitioning = false;
      if (tile) {
        tile.classList.remove("visible", "sg-slide-in", "sg-slide-out");
        tile.dataset.kind = "";
        const body = tile.querySelector(".sg-tile-body");
        if (body) body.innerHTML = "";
      }
      return;
    }

    if (tileRotator.key === key) return;

    if (tileRotator.timer) clearInterval(tileRotator.timer);
    tileRotator.key = key;
    tileRotator.sequence = sequence;
    tileRotator.index = 0;
    tileRotator.transitioning = false;

    renderCurrentTile(tile, true);

    if (sequence.length > 1) {
      tileRotator.timer = setInterval(() => {
        tileRotator.index = (tileRotator.index + 1) % tileRotator.sequence.length;
        renderCurrentTile(tile);
      }, interval);
    } else {
      tileRotator.timer = null;
    }
  }

  function refreshNowPlayingTile(track) {
    if (!track) return;
    const entry = tileRotator.sequence[tileRotator.index];
    if (!entry || entry.kind !== "now-playing") return;
    if (tileRotator.transitioning) return;

    const tile = $(".sg-tile");
    if (!tile || tile.dataset.kind !== "now-playing") return;

    // Update the entry in-place so the next cycle uses fresh data too.
    entry.item = { track };
    const body = tile.querySelector(".sg-tile-body");
    if (body) renderNowPlayingBody(body, entry.item);
  }

  function hasExtras(settings) {
    return Boolean(
      (settings.custom_gif_enabled && settings.custom_gif_url) ||
      tileRotator.sequence.length
    );
  }

  function updateTrack(track, settings) {
    const overlay = $(".overlay") || $(".overlay-shell");
    if (!overlay) return;

    const isLarge = settings.tile_size === "large";
    const showPaused = query.get("show_paused") === "1" || Boolean(settings.show_paused);
    const trackVisible = track.available && (track.state === "playing" || (track.state === "paused" && showPaused));
    const extraVisible = hasExtras(settings);
    const visible = trackVisible || extraVisible;
    overlay.classList.toggle("sg-track-empty", isLarge || (!trackVisible && extraVisible));

    if (visible) {
      clearTimeout(hideTimer);
      overlay.classList.add("visible");
    } else {
      if (overlay.classList.contains("visible")) {
        hideTimer = setTimeout(() => overlay.classList.remove("visible"), 400);
      }
      if (!track.available) return;
    }

    // In large mode, the now-playing card is hidden — the tile slot owns rendering.
    if (isLarge) {
      refreshNowPlayingTile(trackVisible ? track : null);
      return;
    }

    if (!trackVisible && extraVisible) return;

    const dot = $(".state-dot");
    if (dot) dot.classList.toggle("paused", track.state === "paused");

    const badge = $(".source-badge");
    if (badge) {
      badge.textContent = track.source || "";
      badge.setAttribute("data-source", (track.source || "").toLowerCase());
    }

    overlay.setAttribute("data-source", (track.source || "").toLowerCase());
    setText(".track-title", track.title || "Now Playing");
    setText(".track-artist", track.artist || "");
    setText(".track-album", track.album || "");

    const art = $(".artwork-img") || $(".artwork-image");
    setImageSource(art, track.artwork_url);

    const glow = $(".artwork-glow");
    if (glow) {
      glow.style.backgroundImage = track.artwork_url ? `url(${track.artwork_url})` : "";
    }

    const progress = track.duration_ms > 0
      ? Math.max(0, Math.min(100, (track.position_ms / track.duration_ms) * 100))
      : 0;
    const fill = $(".progress-fill");
    if (fill) fill.style.width = `${progress}%`;

    setText(".time-current", formatTime(track.position_ms));
    setText(".time-duration", formatTime(track.duration_ms));
    setText(".time-text", `${formatTime(track.position_ms)} / ${formatTime(track.duration_ms)}`);

    document.querySelectorAll(".viz-bar").forEach((bar) => {
      bar.classList.toggle("active", track.state === "playing");
    });

    const key = trackKey(track);
    if (key !== lastTrackKey && track.available) {
      lastTrackKey = key;
      overlay.classList.remove("bump");
      void overlay.offsetWidth;
      overlay.classList.add("bump");
    }
  }

  async function poll() {
    if (!channel) return;

    try {
      const [trackResponse, settingsResponse] = await Promise.all([
        fetch(api("/now-playing"), { cache: "no-store" }),
        fetch(api("/settings"), { cache: "no-store" }),
      ]);
      const settings = settingsResponse.ok ? await settingsResponse.json() : {};
      const track = trackResponse.ok ? await trackResponse.json() : { available: false };

      applyTheme(settings);
      syncColorRotation(settings);
      syncTileRotation(settings, track);
      updateTrack(track, settings);
    } catch {
      const overlay = $(".overlay") || $(".overlay-shell");
      if (overlay) overlay.classList.remove("visible");
    }
  }

  poll();
  setInterval(poll, Number.isFinite(pollMS) ? Math.max(500, pollMS) : 1000);
})();

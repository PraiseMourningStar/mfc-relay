import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
  DEFAULT_SETTINGS,
  DEFAULT_TRACK,
  normalizeArtwork,
  normalizeSettings,
  normalizeTrack,
  publicSettings,
} from "./validation.mjs";

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function randomChannelId() {
  return randomToken(9).toLowerCase();
}

const CHANNEL_ID_RE = /^[a-z0-9_-]{1,64}$/;

function safeId(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
}

function requestedChannelId(input) {
  if (!Object.hasOwn(input, "id")) {
    return randomChannelId();
  }

  const id = String(input.id || "").trim();
  if (!CHANNEL_ID_RE.test(id)) {
    const error = new Error("Channel ID must use 1-64 lowercase letters, numbers, underscores, or hyphens");
    error.statusCode = 400;
    throw error;
  }

  return id;
}

function timingSafeEqualString(expectedValue, actualValue) {
  if (!expectedValue || !actualValue) {
    return false;
  }

  const expected = Buffer.from(String(expectedValue));
  const actual = Buffer.from(String(actualValue));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const MEDIA_EXT = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/quicktime", ".mov"],
]);

async function readJSON(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJSONAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

export class RelayStore {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this.channelsDir = path.join(dataDir, "channels");
    this.assetsDir = path.join(dataDir, "assets");
  }

  async ensure() {
    await mkdir(this.channelsDir, { recursive: true });
    await mkdir(this.assetsDir, { recursive: true });
  }

  channelFile(channelId) {
    return path.join(this.channelsDir, `${safeId(channelId)}.json`);
  }

  assetFile(channelId, asset) {
    return path.join(this.assetsDir, safeId(channelId), `${safeId(asset.id)}${asset.ext || ""}`);
  }

  async createChannel(input = {}) {
    input = input && typeof input === "object" ? input : {};
    await this.ensure();
    const channelId = requestedChannelId(input);
    const publishToken = input.publish_token || input.publishToken || randomToken(32);
    const settingsToken = input.settings_token || input.settingsToken || randomToken(32);
    const settings = {
      ...DEFAULT_SETTINGS,
      ...normalizeSettings(input.settings || input),
    };
    const now = new Date().toISOString();
    const record = {
      id: channelId,
      publish_token: publishToken,
      settings_token: settingsToken,
      created_at: now,
      updated_at: now,
      settings,
      track: {
        ...DEFAULT_TRACK,
        received_at_ms: 0,
      },
      artwork: null,
      media_assets: [],
    };

    await writeJSONAtomic(this.channelFile(channelId), record);
    return record;
  }

  async getChannel(channelId) {
    const id = safeId(channelId);
    if (!id) {
      return null;
    }

    const record = await readJSON(this.channelFile(id), null);
    if (!record) {
      return null;
    }

    return {
      ...record,
      settings_token: record.settings_token || "",
      settings: publicSettings(record.settings),
      track: {
        ...DEFAULT_TRACK,
        ...(record.track || {}),
      },
      media_assets: Array.isArray(record.media_assets) ? record.media_assets : [],
    };
  }

  async requireChannel(channelId) {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      const error = new Error("Channel not found");
      error.statusCode = 404;
      throw error;
    }
    return channel;
  }

  async saveChannel(channel) {
    const next = {
      ...channel,
      updated_at: new Date().toISOString(),
    };
    await writeJSONAtomic(this.channelFile(next.id), next);
    return next;
  }

  verifyPublishToken(channel, token) {
    return timingSafeEqualString(channel?.publish_token, token);
  }

  verifySettingsToken(channel, token) {
    return this.verifyPublishToken(channel, token) || timingSafeEqualString(channel?.settings_token, token);
  }

  async updateSettings(channelId, settingsPatch) {
    const channel = await this.requireChannel(channelId);
    channel.settings = {
      ...publicSettings(channel.settings),
      ...normalizeSettings(settingsPatch),
    };
    return this.saveChannel(channel);
  }

  async saveMediaAsset(channelId, input = {}) {
    const channel = await this.requireChannel(channelId);
    const mimeType = String(input.mime_type || input.mimeType || "").toLowerCase();
    const ext = MEDIA_EXT.get(mimeType);
    const dataBase64 = String(input.data_base64 || input.dataBase64 || "");

    if (!ext || !dataBase64) {
      const error = new Error("Unsupported or empty media asset");
      error.statusCode = 400;
      throw error;
    }

    const bytes = Buffer.from(dataBase64, "base64");
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) {
      const error = new Error("Media asset must be 25MB or smaller");
      error.statusCode = 413;
      throw error;
    }

    const id = randomToken(8);
    const asset = {
      id,
      ext,
      mime_type: mimeType,
      size_bytes: bytes.length,
      created_at: new Date().toISOString(),
      url: `/media/${channel.id}/assets/${id}`,
    };
    await mkdir(path.dirname(this.assetFile(channel.id, asset)), { recursive: true });
    await writeFile(this.assetFile(channel.id, asset), bytes);
    channel.media_assets = [asset, ...(channel.media_assets || [])].slice(0, 24);
    await this.saveChannel(channel);
    return asset;
  }

  async publishTrack(channelId, payload) {
    const channel = await this.requireChannel(channelId);
    const track = normalizeTrack(payload.track || payload);
    const artwork = normalizeArtwork(payload.artwork || {});

    channel.track = {
      ...track,
      received_at_ms: Date.now(),
    };

    if (artwork) {
      channel.artwork = {
        mime_type: artwork.mime_type,
        data_base64: artwork.data_base64,
        version: Date.now(),
      };
      channel.track.artwork_url = `/media/${channel.id}/artwork?t=${channel.artwork.version}`;
    } else if (payload.clear_artwork || payload.clearArtwork || !track.artwork_url) {
      channel.artwork = null;
    }

    if (payload.settings && typeof payload.settings === "object") {
      channel.settings = {
        ...publicSettings(channel.settings),
        ...normalizeSettings(payload.settings),
      };
    }

    return this.saveChannel(channel);
  }

  async listChannels() {
    await this.ensure();
    const files = await readdir(this.channelsDir);
    const channels = [];

    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue;
      }

      const record = await readJSON(path.join(this.channelsDir, file), null);
      if (!record?.id) {
        continue;
      }

      channels.push({
        id: record.id,
        display_name: publicSettings(record.settings).display_name,
        created_at: record.created_at || "",
        updated_at: record.updated_at || "",
      });
    }

    return channels.sort((a, b) => a.id.localeCompare(b.id));
  }

  async deleteChannel(channelId) {
    const channel = await this.requireChannel(channelId);
    await rm(this.channelFile(channel.id), { force: true });
    await rm(path.join(this.assetsDir, channel.id), { recursive: true, force: true });
    return { id: channel.id };
  }

  async rotatePublishToken(channelId) {
    const channel = await this.requireChannel(channelId);
    channel.publish_token = randomToken(32);
    return this.saveChannel(channel);
  }

  async rotateSettingsToken(channelId) {
    const channel = await this.requireChannel(channelId);
    channel.settings_token = randomToken(32);
    return this.saveChannel(channel);
  }
}

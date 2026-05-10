import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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

function safeId(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
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
    await this.ensure();
    const channelId = safeId(input.id) || randomToken(9);
    const publishToken = input.publish_token || input.publishToken || randomToken(32);
    const settings = {
      ...DEFAULT_SETTINGS,
      ...normalizeSettings(input.settings || input),
    };
    const now = new Date().toISOString();
    const record = {
      id: channelId,
      publish_token: publishToken,
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
    if (!token || !channel?.publish_token) {
      return false;
    }

    const expected = Buffer.from(channel.publish_token);
    const actual = Buffer.from(String(token));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
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
}

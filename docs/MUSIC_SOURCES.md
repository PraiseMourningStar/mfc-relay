# Music Source Strategy

The hosted relay stays source-agnostic. It accepts one normalized `Track` payload and renders it in OBS. Source-specific fetching belongs in bridge adapters so the hosted service does not need Spotify, Apple, YouTube, or desktop permissions.

## Normalized Track Contract

Every adapter should publish:

```json
{
  "available": true,
  "state": "playing",
  "source": "Spotify",
  "title": "Song Title",
  "artist": "Artist Name",
  "album": "Album Name",
  "duration_ms": 180000,
  "position_ms": 42000,
  "artwork_url": "https://..."
}
```

If artwork is only available locally, the bridge can upload it as:

```json
{
  "artwork": {
    "mime_type": "image/png",
    "data_base64": "..."
  }
}
```

The relay stores that image and rewrites `artwork_url` to `/media/<channel-id>/artwork`.

## Adapter Targets

Spotify:

- Use the desktop app/local bridge where available, or Spotify Web API with model authorization.
- Prefer artwork URLs from Spotify metadata when available.

Apple Music / Music app:

- Use OS media-session APIs or a platform bridge.
- On macOS, the Music app can expose playback metadata through local automation; artwork may need a bridge-side extraction step.

YouTube / YouTube Music:

- Use a browser extension, OS media-session bridge, or app-specific adapter.
- Do not rely on parsing arbitrary page titles as the primary production path; it is useful only as a fallback.

## Current Bridge

`bin/mfc-nowplaying-bridge.mjs` currently reads a local source with:

```text
GET /api/now-playing
GET /api/settings
```

Then it publishes to:

```text
POST /api/channels/<channel-id>/now-playing
```

This gives MFC a stable hosted relay while allowing Spotify, Apple Music, YouTube, or future player integrations to be developed independently.

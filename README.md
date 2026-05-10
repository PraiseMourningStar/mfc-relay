# MFC Overlay Relay

Self-hosted browser-source overlay infrastructure for MFC rooms. It gives each model a public overlay URL for OBS/MFC browser sources while MFC staff keep channel creation, publish tokens, and data integrations private.

This package is web-only. It does not require a native app, OBS plugin work, or MFC client changes.

## What It Provides

- Public transparent overlay URLs for MFC/OBS browser sources
- A private publish API for now-playing updates
- A browser studio with separate model-facing and staff-facing setup areas
- Model-friendly controls for style, GIFs, socials, share-album promos, ad/media previews, full-size promo cards, and stream notices
- A website/script embed for custom alert widgets
- A local bridge that can relay from any local now-playing API with `/api/now-playing` and `/api/settings`
- JSON persistence, tests, Docker support, and an OpenAPI contract

## For Models

Models only need the public browser-source URL and the Model Setup controls.

1. Open the studio URL that MFC provides.
2. Stay in **Model Setup**.
3. Copy the **Browser-source URL**.
4. Add it to OBS or the MFC browser-source tool.
5. Use these source settings:

```text
Width: 800
Height: 220
Background: transparent
```

6. Pick a preset, color, placement, scale, GIF, social links, share-album promo, ad preview, or notice style.
7. Use **Test Overlay** to make sure the overlay appears before going live.

Models should not receive publish tokens, bridge commands, admin keys, server logs, or private API instructions.

## For MFC Staff

MFC staff own the hosted service, channel creation, persistence, tokens, and first-party integrations.

### Run Locally

Requirements:

- Node.js 20 or newer

Start the relay:

```bash
npm start
```

Open:

```text
http://127.0.0.1:8080/
```

For a quick local UI test, leave `ADMIN_KEY` unset, open **Developer Setup**, click **New Channel**, then switch back to **Model Setup** and copy the generated browser-source URL.

### Test Locally

Run the automated test suite:

```bash
npm test
```

Manual smoke test:

1. Start the relay with `npm start`.
2. Open `http://127.0.0.1:8080/`.
3. In **Developer Setup**, create a channel.
4. In **Model Setup**, click **Test Overlay**.
5. Open the generated `/overlay/<channel-id>?show_paused=1` URL in a browser.
6. Confirm the overlay renders, updates, and stays transparent around the card.

### Production Hosting

Set `ADMIN_KEY` before exposing channel creation publicly:

```bash
PORT=8080 \
PUBLIC_BASE_URL=https://nowplaying.mfc.example \
DATA_DIR=/var/lib/mfc-now-playing-relay \
ADMIN_KEY=<admin-channel-creation-token> \
npm start
```

With Docker:

```bash
docker build -t mfc-now-playing-relay .
docker run --rm -p 8080:8080 \
  -e PUBLIC_BASE_URL=https://nowplaying.mfc.example \
  -e ADMIN_KEY=<admin-channel-creation-token> \
  -v mfc-relay-data:/app/data \
  mfc-now-playing-relay
```

### Channel Creation

One channel per model or room is the recommended default.

```bash
curl -X POST https://nowplaying.mfc.example/api/channels \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"modelname","display_name":"ModelName"}'
```

The response includes:

- `id`
- `publish_token`
- `urls.overlay`
- `urls.mfc_browser_source`
- `urls.embed_js`

The channel ID and overlay URL can be public. The publish token is private and should stay in MFC-owned systems or a trusted local bridge.

### Browser Source URL

Give the model only this URL:

```text
https://nowplaying.mfc.example/overlay/<channel-id>?show_paused=1
```

### Publish Now-Playing Updates

```http
POST /api/channels/<channel-id>/now-playing
Authorization: Bearer <publish-token>
Content-Type: application/json
```

```json
{
  "track": {
    "available": true,
    "state": "playing",
    "source": "Spotify",
    "title": "Song Title",
    "artist": "Artist Name",
    "album": "Album Name",
    "duration_ms": 180000,
    "position_ms": 42000,
    "artwork_url": "https://example.com/art.jpg"
  }
}
```

### Content And Promo Settings

MFC can populate model-facing rotation settings from first-party systems:

```json
{
  "preset": "cyber-candy",
  "color_mode": "rotating",
  "accent_palette": ["#38bdf8", "#ec4899", "#a78bfa"],
  "custom_gif_enabled": true,
  "custom_gif_url": "https://cdn.example/model.gif",
  "social_rotation_enabled": true,
  "social_items": [
    { "label": "Twitter", "value": "@modelname", "url": "https://x.example/modelname", "image_url": "/media/model/assets/social-card" },
    { "label": "OF", "value": "modelname", "url": "https://onlyfans.example/modelname" }
  ],
  "album_rotation_enabled": true,
  "album_items": [
    {
      "title": "Newest MFC Share Album",
      "caption": "Fresh set just dropped",
      "image_url": "https://cdn.example/album.jpg",
      "url": "https://share.example/album"
    }
  ],
  "notice_enabled": true,
  "notice_items": [
    { "message": "New content is live", "variant": "hot" }
  ],
  "tile_rotate_ms": 6500,
  "tile_size": "large"
}
```

## Website Or Custom Alert Embed

```html
<script
  src="https://nowplaying.mfc.example/embed.js?channel=<channel-id>"
  data-height="180">
</script>
```

Manual iframe:

```html
<iframe
  src="https://nowplaying.mfc.example/overlay/<channel-id>?show_paused=1"
  style="width: 100%; height: 180px; border: 0; background: transparent;"
  allowtransparency="true">
</iframe>
```

## Security Notes

- Do not put publish tokens in model-facing instructions.
- Do not commit generated channel data from `data/`.
- Do not publish screenshots that show bridge commands, publish tokens, local account names, or private URLs.
- Use HTTPS in production.
- Store `DATA_DIR` on persistent private storage.
- Rotate publish tokens when a channel is reassigned or suspected to be exposed.

## More Documentation

- [MFC pitch](docs/MFC_PITCH.md)
- [Developer handoff](docs/MFC_DEVELOPER_HANDOFF.md)
- [Music source strategy](docs/MUSIC_SOURCES.md)
- [API reference](docs/API.md)
- [OpenAPI spec](spec/openapi.yaml)

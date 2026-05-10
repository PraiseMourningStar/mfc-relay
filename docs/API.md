# API

## Public Routes

```http
GET /overlay/<channel-id>
GET /mfc/<channel-id>
GET /api/channels/<channel-id>
GET /api/channels/<channel-id>/now-playing
GET /api/channels/<channel-id>/settings
GET /api/link-preview?url=<https-url>
GET /media/<channel-id>/artwork
GET /media/<channel-id>/assets/<asset-id>
GET /embed.js?channel=<channel-id>
GET /health
```

## Private Routes

```http
POST /api/channels
POST /api/channels/<channel-id>/now-playing
PATCH /api/channels/<channel-id>/settings
POST /api/channels/<channel-id>/media
POST /api/channels/<channel-id>/test
```

Private channel mutation routes require:

```http
Authorization: Bearer <publish-token>
```

Channel creation requires the configured `ADMIN_KEY` when present:

```http
Authorization: Bearer <admin-key>
```

## Track Model

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

`state` supports:

- `playing`
- `paused`
- `stopped`

## Settings Model

```json
{
  "display_name": "MFC Now Playing",
  "template": "glassmorphic",
  "preset": "glass-pop",
  "accent_hex": "#8b5cf6",
  "accent_palette": ["#8b5cf6", "#ec4899", "#22c55e", "#38bdf8"],
  "color_mode": "solid",
  "color_rotate_ms": 3500,
  "glow_opacity": 0.35,
  "card_opacity": 0.55,
  "blur_radius": 18,
  "corner_radius": 16,
  "scale": 1,
  "width_px": 680,
  "anchor": "bottom-left",
  "offset_x_px": 16,
  "offset_y_px": 16,
  "show_paused": false,
  "stale_after_ms": 60000,
  "custom_gif_enabled": false,
  "custom_gif_url": "",
  "social_rotation_enabled": false,
  "social_items": [
    {
      "label": "Twitter",
      "value": "@model",
      "url": "https://x.example/model",
      "image_url": "/media/model/assets/social-card"
    }
  ],
  "album_rotation_enabled": false,
  "album_items": [
    {
      "title": "Newest MFC Share Album",
      "caption": "Fresh set",
      "image_url": "https://cdn.example/album.jpg",
      "url": "https://share.example/album",
      "published_at": "2026-05-08T12:00:00Z"
    }
  ],
  "notice_enabled": false,
  "notice_items": [
    { "message": "New content is live", "variant": "tip" }
  ],
  "ad_rotation_enabled": false,
  "ad_items": [
    {
      "title": "Ad preview",
      "caption": "Tonight's special",
      "media_url": "/media/model/assets/assetid",
      "media_type": "video",
      "url": "https://share.example/album"
    }
  ],
  "tile_rotate_ms": 6500,
  "tile_rotation_order": ["social", "album", "ad", "notice"],
  "tile_size": "compact"
}
```

`tile_rotate_ms` controls the shared content slot. `tile_rotation_order` controls the order of promo types. Set `tile_size` to `large` to rotate the now-playing card in the same full-size slot as socials, albums, ads, and notices.

For MFC Share albums, `album_items` may also contain only a share URL:

```json
{
  "album_rotation_enabled": true,
  "album_items": [
    { "url": "https://share.myfreecams.com/a/8ugt1qly" }
  ]
}
```

The overlay resolves that URL through `/api/link-preview` and renders a compact preview card. If MFC Share only exposes an age-check placeholder, the relay falls back to available public metadata such as title, model avatar, and duration.

Local ad preview uploads:

```http
POST /api/channels/<channel-id>/media
Authorization: Bearer <publish-token>
Content-Type: application/json
```

```json
{
  "mime_type": "video/mp4",
  "data_base64": "..."
}
```

Supported media types are JPEG, PNG, GIF, WebP, MP4, WebM, and QuickTime. Uploaded media is served back through `/media/<channel-id>/assets/<asset-id>` and can be used in `ad_items`.

Templates:

- `glassmorphic`
- `compact-bar`
- `minimal-clean`
- `neon-cyber`
- `spotify-dark`

Presets:

- `glass-pop`
- `bubblegum`
- `after-dark`
- `cyber-candy`
- `clean-luxe`

Color modes:

- `solid`
- `rotating`

Notice variants:

- `tip`
- `promo`
- `soft`
- `hot`

Anchors:

- `top-left`
- `top-center`
- `top-right`
- `center-left`
- `center`
- `center-right`
- `bottom-left`
- `bottom-center`
- `bottom-right`

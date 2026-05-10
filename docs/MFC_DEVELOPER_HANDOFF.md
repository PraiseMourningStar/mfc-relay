# MFC Developer Handoff

## Goal

Host a model-facing overlay relay that works like an MFC Alerts/browser-source URL:

```text
model/player/MFC content source -> private publish API -> public overlay URL -> MFC/OBS browser source
```

The overlay is not tied to any desktop app. A local bridge can be one publisher, but MFC can replace it with its own model-side player integration, backend job, extension, or first-party room tooling.

## Production Responsibilities

MFC hosts:

- `mfc-relay` Node service
- persistent `DATA_DIR`
- HTTPS reverse proxy
- channel lifecycle around model/room IDs
- publish token storage and rotation

MFC gives models:

- one public browser-source URL
- optional customization access through the Model Setup view
- branded presets, rotating colors, GIF/social/album/ad/notice controls

MFC keeps private:

- admin key
- publish token
- server logs containing token headers

## Studio Separation

The studio is split into two handoff surfaces:

- **Model Setup**: live preview, public OBS/MFC browser-source URL, copy button, recommended OBS dimensions, test overlay, and model-facing customization controls.
- **Developer Setup**: channel creation, publish token, local bridge command, website embed snippet, settings import/export, and API boundary notes.

The model-facing view should be the default for operators. The developer view is for MFC staff, integration engineers, or trusted tooling. Do not place the publish token or bridge command in model-facing setup material.

## Recommended Channel Model

One channel per model room:

```json
{
  "id": "modelname",
  "settings": {
    "display_name": "ModelName",
    "template": "glassmorphic",
    "preset": "glass-pop",
    "accent_hex": "#8b5cf6",
    "color_mode": "rotating",
    "accent_palette": ["#8b5cf6", "#ec4899", "#38bdf8"],
    "anchor": "bottom-left",
    "show_paused": true
  }
}
```

Create channel:

```bash
curl -X POST https://nowplaying.mfc.example/api/channels \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"modelname","display_name":"ModelName"}'
```

Response includes:

- `id`
- `publish_token`
- `urls.overlay`
- `urls.embed_js`

Store `publish_token` securely. Do not put it in model-facing HTML.

## Browser Source URL

```text
https://nowplaying.mfc.example/overlay/modelname?show_paused=1
```

This can live beside MFC Alerts as a separate browser source, or inside a custom widget area if the MFC alert tooling supports iframe/script embeds.

## Publish Contract

```bash
curl -X POST https://nowplaying.mfc.example/api/channels/modelname/now-playing \
  -H "Authorization: Bearer $PUBLISH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
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
  }'
```

For local artwork, publish base64 image data:

```json
{
  "track": {
    "available": true,
    "state": "playing",
    "source": "Music",
    "title": "Song Title",
    "artist": "Artist Name"
  },
  "artwork": {
    "mime_type": "image/png",
    "data_base64": "..."
  }
}
```

## Customization

The Model Setup view at `/` updates:

- presets
- template
- accent color and rotating color palettes
- card/glow opacity
- blur/radius
- width/scale
- top/center/bottom anchor
- paused-track visibility
- stale timeout
- optional GIF URL
- social handle rotation for Twitter/X, Instagram, OnlyFans, and custom links
- MFC share-album/content rotation
- uploaded or URL-based ad preview rotation
- compact promo strip or full-size promo cards with now-playing included
- short notices such as tip prompts

The same fields are available through:

```http
PATCH /api/channels/<channel-id>/settings
Authorization: Bearer <publish-token>
```

## MFC Content Hooks

The relay already renders content rotation fields when MFC supplies them:

```json
{
  "social_rotation_enabled": true,
  "social_items": [
    { "label": "Twitter", "value": "@modelname", "url": "https://x.example/modelname", "image_url": "/media/model/assets/social-card" },
    { "label": "OF", "value": "modelname", "url": "https://onlyfans.example/modelname" }
  ],
  "album_rotation_enabled": true,
  "album_items": [
    {
      "title": "Newest MFC Share Album",
      "caption": "Fresh upload",
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

For quick setup, models or MFC tooling can provide only the MFC Share URL:

```json
{
  "album_rotation_enabled": true,
  "album_items": [
    { "url": "https://share.myfreecams.com/a/8ugt1qly" }
  ]
}
```

The overlay calls `/api/link-preview` to resolve the title/caption/image. Public MFC Share album pages may expose only age-check-safe media, so first-party MFC deployment should populate exact content thumbnails when available.

For first-party deployment, MFC can populate `album_items` from the model's newest share album/content feed and keep the model's OBS setup unchanged.

## Operational Notes

- Use HTTPS in production.
- Set `PUBLIC_BASE_URL` to the public relay origin.
- Set `ADMIN_KEY` before exposing channel creation publicly.
- Put `DATA_DIR` on persistent storage.
- Rotate publish tokens by recreating or updating channels.
- Treat overlay URLs as public secrets with low risk; treat publish tokens as high risk.
- If a model stops publishing, the overlay automatically hides after `stale_after_ms`.

## MFC Fit

MFC Alerts already gives models a browser-source overlay workflow in broadcaster software, so this package follows that same surface: a single public URL that renders a transparent overlay. The music/content data path is separate and private.

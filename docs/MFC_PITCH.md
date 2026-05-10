# MFC Overlay Relay Pitch

## One-Line Pitch

Give models a cute, configurable OBS overlay that shows what they are playing, promotes their socials, newest MFC content, and ad/media previews, and runs on MFC-hosted infrastructure with a simple browser-source setup.

## Why This Fits MFC

Models already understand the MFC Alerts flow: copy a browser-source URL into OBS and customize the look. This relay keeps that setup path, then adds a richer layer MFC can own directly:

- now-playing music with album art
- MFC-branded overlay presets
- rotating color palettes
- optional model GIFs
- fill-in social handles for Twitter/X, Instagram, OnlyFans, and custom links
- newest share-album/content promo slots
- optional ad/media preview slots
- lightweight notices such as tip prompts

The model-facing experience stays simple. The technical side stays controlled: MFC hosts the relay, owns channel creation, stores publish tokens, and can populate social/content data from first-party systems.

## Product Shape

Each model room gets one channel:

```text
MFC/model music + profile/content data -> private relay API -> public transparent overlay URL -> OBS browser source
```

The overlay URL is public and safe to paste into OBS. The publish token is private and only used by trusted MFC systems or a model-side bridge.

## Model Experience

1. MFC creates a channel for the model.
2. The model opens Model Setup, sees a large live preview, and copies one OBS browser-source URL.
3. The model chooses a preset, accent color or rotating palette, position, scale, GIF, social handles, content/ad rotation, card size, and notice style.
4. The overlay updates live while the model streams.

No OBS plugin, no native MFC client dependency, and no heavy setup beyond adding a browser source.

## Developer Experience

The relay is a small Node service with:

- JSON file persistence for local/prototype hosting
- HTTP APIs documented in `spec/openapi.yaml`
- static transparent overlay themes
- a browser-based studio with Model Setup and Developer Setup separated
- a local bridge path for now-playing sources
- tests with `npm test`

Developer Setup keeps private fields out of the model path: channel creation, publish token, bridge command, website embed snippet, settings import/export, and API boundary notes live away from the OBS copy-paste view.

The implementation is intentionally source-agnostic. Spotify, Apple Music, and YouTube desktop playback should be normalized by bridge adapters into the same `Track` contract. For a production MFC launch, platform-specific adapters can sit outside the hosted relay:

- Spotify: Spotify app/local bridge or Web API where auth is available
- Apple Music/Music app: OS media bridge on macOS or Windows media session bridge
- YouTube/YouTube Music: browser extension, desktop bridge, or OS media session bridge

The relay does not need to know which source produced the track. It only needs title, artist, album, playback state, progress, and artwork URL or uploaded artwork bytes.

## Launch Path

Phase 1: Hosted overlay MVP

- MFC-hosted relay
- one channel per model room
- now-playing API
- presets/color studio
- OBS browser-source URL

Phase 2: Creator polish

- rotating colors
- GIF support
- social rotation
- full-size promo-card rotation with now-playing included
- tip/promo notices
- share-album promo slots populated by MFC

Phase 3: First-party integrations

- MFC account/profile fields
- newest share album/content feed
- model-side music bridge installers
- token rotation and dashboard controls

## MFC Value

This is useful because it gives models a stream enhancement that feels personal without requiring them to become developers. It also gives MFC a first-party overlay surface for music, promos, and content discovery instead of letting that attention drift to unrelated third-party widgets.

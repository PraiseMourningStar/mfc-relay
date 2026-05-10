# MFC Relay Ops Runbook

## First Deploy

1. Point DNS for the relay host, for example `nowplaying.mfc.example`.
2. Generate an admin key:

```bash
openssl rand -hex 32
```

3. Create `.env` next to `compose.yaml`:

```bash
PUBLIC_BASE_URL=https://nowplaying.mfc.example
ADMIN_KEY=<generated-admin-key>
```

4. Start the relay:

```bash
docker compose up -d
docker compose logs --tail=50
curl http://127.0.0.1:8080/health
```

`compose.yaml` will refuse to start if `PUBLIC_BASE_URL` or `ADMIN_KEY` is missing.

## HTTPS

Run the relay behind HTTPS. With Caddy on the same host:

```caddyfile
nowplaying.mfc.example {
  reverse_proxy 127.0.0.1:8080
}
```

Then verify:

```bash
curl https://nowplaying.mfc.example/health
```

## Add A Model

```bash
curl -X POST https://nowplaying.mfc.example/api/channels \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"modelname","display_name":"ModelName"}'
```

Give the model:

- `urls.model_setup` when they should customize their overlay
- `urls.mfc_browser_source` for OBS/MFC browser source

Keep private:

- `publish_token`
- `settings_token` outside of the model setup URL
- `ADMIN_KEY`

## Rotate Or Retire

List channels:

```bash
curl https://nowplaying.mfc.example/api/channels \
  -H "Authorization: Bearer $ADMIN_KEY"
```

Rotate a leaked bridge/publish token:

```bash
curl -X POST https://nowplaying.mfc.example/api/channels/modelname/rotate-token \
  -H "Authorization: Bearer $ADMIN_KEY"
```

Rotate a model setup URL:

```bash
curl -X POST https://nowplaying.mfc.example/api/channels/modelname/rotate-setup-token \
  -H "Authorization: Bearer $ADMIN_KEY"
```

Retire a model:

```bash
curl -X DELETE https://nowplaying.mfc.example/api/channels/modelname \
  -H "Authorization: Bearer $ADMIN_KEY"
```

## Backups

`DATA_DIR` is the source of truth for channels, settings, tokens, and uploaded media. Back up the volume:

```bash
docker run --rm -v mfc-relay_mfc-relay-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/mfc-relay-data-$(date +%F).tar.gz -C /data .
```

Store backups off-host.

## Monitoring

Monitor:

```text
GET https://nowplaying.mfc.example/health
```

The service should return HTTP 200 and `{"ok":true}`. Docker also has a container healthcheck and `restart: unless-stopped` in `compose.yaml`.

# Server Deployment Notes

## Build and migrate

```bash
cd /opt/aistory/ai-story-game/server
pnpm install --frozen-lockfile
pnpm run build
pnpm run db:migrate
```

## Run with PM2

```bash
mkdir -p /opt/aistory/logs
pm2 start ecosystem.config.cjs
pm2 save
```

## Caddy

Use `Caddyfile.example` as baseline.

## Admin page

Static files are under `server/admin/`.
Serve with Caddy path or a dedicated admin subdomain.

## Backup

```bash
sqlite3 /opt/aistory/data/aistory.db ".backup '/opt/aistory/backups/aistory-$(date +%F-%H%M).db'"
```

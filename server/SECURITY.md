# Security Hardening Checklist

This checklist is for the current deployment topology:
- API server: `Fastify + SQLite + PM2`
- Reverse proxy: `Nginx`
- Host: Alibaba Cloud ECS (Ubuntu 22.04)

## 1. Must do now
- [ ] Rotate all production secrets immediately.
- [ ] Ensure `server/.env` is never committed.
- [ ] Set `TRUST_PROXY=true` only when API is behind your trusted Nginx reverse proxy.
- [ ] Add Nginx basic auth in front of `/admin`.
- [ ] Restrict inbound ports to `22`, `80`, `443` only.
- [ ] Enable firewall rules (`ufw`) and brute-force protection (`fail2ban`).

## 2. Secret rotation
Generate strong secrets:

```bash
openssl rand -base64 48
```

Use that value for `JWT_SECRET` in `server/.env`:

```env
JWT_SECRET=<at least 32 chars random string>
```

Then restart API:

```bash
cd /opt/aistory/ai-story-game/server
pm2 restart aistory-api --update-env
```

## 3. Nginx protect `/admin` with password
Install tool:

```bash
apt update && apt install -y apache2-utils
```

Create password file:

```bash
htpasswd -c /etc/nginx/.htpasswd_admin your_admin_user
chmod 640 /etc/nginx/.htpasswd_admin
```

Add to Nginx site config:

```nginx
location /admin/ {
    auth_basic "Admin Only";
    auth_basic_user_file /etc/nginx/.htpasswd_admin;

    alias /opt/aistory/ai-story-game/server/admin/;
    index index.html;
    try_files $uri $uri/ /admin/index.html;
}
```

Reload:

```bash
nginx -t && systemctl reload nginx
```

## 4. Optional rate limit at Nginx layer
In `http` block:

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=admin_limit:10m rate=2r/s;
```

In server locations:

```nginx
location /v1/ {
    limit_req zone=api_limit burst=20 nodelay;
    proxy_pass http://127.0.0.1:3000/v1/;
}

location /admin/ {
    limit_req zone=admin_limit burst=10 nodelay;
    # auth_basic ... (same as above)
}
```

## 5. Host-level firewall
Use UFW:

```bash
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status verbose
```

## 6. Brute-force protection
Install Fail2ban:

```bash
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

Check status:

```bash
fail2ban-client status
```

## 7. Log and backup hygiene
- [ ] Keep PM2 logs rotated.
- [ ] Verify daily SQLite backup job works.
- [ ] Periodically inspect suspicious requests in Nginx and PM2 logs.

Useful commands:

```bash
pm2 logs aistory-api --lines 200 --nostream
tail -n 200 /var/log/nginx/access.log
tail -n 200 /var/log/nginx/error.log
```

## 8. Ongoing maintenance
- [ ] Weekly: `apt update && apt upgrade -y`
- [ ] Weekly: dependency audit and patch (`pnpm audit`)
- [ ] Monthly: rotate admin password and review IP allowlist/denylist

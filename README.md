# TaskFlow Cloud

?ng d?ng qu?n l? c?ng vi?c c? nh?n v?i React, TypeScript, Express v? MongoDB.

## Ch?c n?ng

- ??ng k?, ??ng nh?p, ??ng xu?t v? kh?i ph?c phi?n ??ng nh?p.
- T?o, xem, ch?nh s?a v? x?a c?ng vi?c.
- ??nh d?u ho?n th?nh ho?c m? l?i c?ng vi?c.
- ??t th?i h?n, m? t? v? m?c ?u ti?n.
- L?c tr?ng th?i, t?m ki?m, s?p x?p v? ph?n trang.
- Dashboard th?ng k? t?ng c?ng vi?c, ti?n ?? v? c?ng vi?c ??n h?n.
- Giao di?n ti?ng Vi?t v?i b? c?c desktop/mobile.

## Y?u c?u

- Node.js 24 LTS v? npm.
- MongoDB local ho?c MongoDB Atlas.
- Docker v? Docker Compose n?u ch?y b?ng container.

## C?i ??t

```bash
git clone https://github.com/TienDat-2805/TaskFlowCloud.git
cd TaskFlowCloud
npm ci
```

T?o c?u h?nh m?i tr??ng t? m?u:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Tr?n Linux/macOS:

```bash
test -f .env || cp .env.example .env
```

?i?n URI database v?o MONGODB_URI v? t?o SESSION_SECRET ng?u nhi?n:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

??t gi? tr? v?a t?o v?o SESSION_SECRET, sau ?? ch?y:

```bash
npm run db:check
npm run dev
```

M? **http://localhost:5173** v? ??ng k? t?i kho?n ?? s? d?ng. D?ng ??ng origin ?? c?u h?nh trong CLIENT_ORIGIN. T?i kho?n database ??c l?p v?i t?i kho?n ??ng nh?p ?ng d?ng.

N?u PowerShell ch?n npm.ps1, d?ng npm.cmd thay cho npm.

## Bi?n m?i tr??ng

| Bi?n                          | M?c ??ch                                                    |
| ----------------------------- | ----------------------------------------------------------- |
| NODE_ENV                      | development, test ho?c production                           |
| PORT                          | C?ng API; m?c ??nh 4000                                     |
| MONGODB_URI                   | URI k?t n?i MongoDB                                         |
| SESSION_SECRET                | Chu?i ng?u nhi?n t?i thi?u 32 k? t?                         |
| COOKIE_SECURE                 | true khi d?ng HTTPS                                         |
| CLIENT_ORIGIN                 | Origin frontend; local l? http://localhost:5173             |
| TRUST_PROXY                   | 0 khi ch?y tr?c ti?p; 2 v?i Caddy ? Nginx ? Express         |
| LOG_LEVEL                     | M?c log c?a API                                             |
| MONGODB_DNS_SERVERS           | T?y ch?n: danh s?ch ??a ch? IP DNS, ph?n c?ch b?ng d?u ph?y |
| SEED_EMAIL                    | Email t?i kho?n m?u                                         |
| SEED_PASSWORD                 | M?t kh?u t?i kho?n m?u                                      |
| APP_DOMAIN                    | Domain cho c?u h?nh production                              |
| BACKEND_IMAGE, FRONTEND_IMAGE | Image v? tag tri?n khai                                     |

Gi? URI, m?t kh?u v? secret ngo?i Git. Kh?ng ??t th?ng tin database trong bi?n frontend. Khi d?ng Atlas, c?u h?nh quy?n database user v? IP access list ph? h?p v?i m?y ch?y API.

## D? li?u m?u

C?u h?nh SEED_EMAIL v? SEED_PASSWORD, sau ??:

```bash
npm run seed
```

M?t kh?u m?u c?n ?t nh?t 12 k? t? v? t?i ?a 72 byte UTF-8. Seed t?o 5 c?ng vi?c m?u, gi? nguy?n c?ng vi?c v? m?t kh?u ?? t?n t?i.

Khi server ?ang ch?y, c? th? ki?m tra lu?ng API b?ng:

```bash
npm run smoke
```

L?nh d?ng t?i kho?n m?u ?? ??ng nh?p, thao t?c tr?n m?t c?ng vi?c t?m r?i ??ng xu?t. C? th? ??t SMOKE_BASE_URL ?? ch?n ??a ch? server.

## Docker

Ch?y stack development v?i MongoDB local v? volume ri?ng:

```bash
docker compose -f compose.dev.yml up --build -d
docker compose -f compose.dev.yml exec backend npm run seed -w backend
docker compose -f compose.dev.yml logs -f backend
```

Truy c?p **http://localhost:5173**. D?ng stack b?ng:

```bash
docker compose -f compose.dev.yml down
```

L?nh down gi? d? li?u trong volume. Th?m -v s? x?a volume database local.

Build image production:

```bash
docker build -f backend/Dockerfile -t taskflow/backend:0.1.0 .
docker build -f frontend/Dockerfile -t taskflow/frontend:0.1.0 .
```

?? ch?y production, c?u h?nh APP_DOMAIN, MONGODB_URI v? SESSION_SECRET trong m?i tr??ng tri?n khai, tr? domain t?i m?y ch? v? m? c?ng 80/443:

```bash
docker compose -f compose.prod.yml config --quiet
docker compose -f compose.prod.yml up --build -d
```

Production d?ng Caddy cho HTTPS, Nginx ph?c v? frontend v? proxy t?i API. API v? MongoDB kh?ng ???c publish ra Internet. N?u d?ng file m?i tr??ng ri?ng, th?m --env-file tr??c -f trong l?nh Compose.

## Ki?m th? v? build

```bash
npm run check
npm run format:check
```

npm run check ch?y lint, TypeScript, ki?m th? backend/frontend v? build. Backend test d?ng MongoDB t?m ??c l?p; frontend test d?ng jsdom v?i HTTP gi? l?p.

C?c l?nh b? sung:

| L?nh                       | M?c ??ch              |
| -------------------------- | --------------------- |
| npm run build              | Build hai workspace   |
| npm test                   | Ch?y ki?m th?         |
| npm run format             | ??nh d?ng m? ngu?n    |
| npm run indexes -w backend | B? sung index MongoDB |
| npm run start -w backend   | Ch?y API ?? build     |

Endpoint **/health** tr? 200 khi API k?t n?i ???c database v? 503 khi database kh?ng s?n s?ng.

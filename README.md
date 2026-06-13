# Flowcheq Estate — Backend

NestJS API for Flowcheq Estate (MongoDB, JWT, Socket.IO notifications, etc.).

Standalone repo — pair with:

| App | Local path (sibling) |
|-----|----------------------|
| **Web** | `../flowcheq-web` |
| **Mobile (Expo)** | `../flowcheq-mobile` |

## Setup

```bash
npm ci
cp .env.example .env   # or create .env — see DEPLOYMENT in monorepo docs
# MONGO_URI, JWT_SECRET, CLIENT_ORIGIN, SMTP, Cloudinary, etc.
npm run start:dev
```

API: `http://localhost:3000` · Health: `/health` · Swagger: `/api`

## Production

```bash
npm run build
npm run start:prod
```

Or use the included `Dockerfile`.

Set `CLIENT_ORIGIN` to your web URL (e.g. `https://estate.flowcheq.com`).

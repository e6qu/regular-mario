# Trusted-friends multiplayer server

The multiplayer service is a single Node process designed for a small trusted
group. It owns authoritative 60 Hz game simulation, retains no games, chats,
or sessions after a restart, and needs no database, broker, or account system.

## Deploy

Copy `.env.example` to `.env`, set three distinct secrets, then run:

```bash
docker compose up -d --build
```

The service listens only on `127.0.0.1:8080`; configure the separately managed
Caddy instance to proxy the public HTTPS site to that local address. Do not
publish port 8080 directly to the internet. In production the server sets
Secure HttpOnly cookies, so HTTPS termination by Caddy is required.

## Interfaces

- `POST /api/login` and `POST /api/admin/login` accept the separate shared
  passwords and issue short opaque cookies (24 h player / 1 h admin).
- `/api/layout` returns the exact semantic tree behind the login, lobby, and
  admin screens. Player routes expose profile, public games, game creation,
  joining, start, chat, and snapshots.
- `/api/admin/debug` returns redacted sessions/game state plus queue and
  acknowledgement metrics. Admin routes pause, resume, or advance exactly one
  game frame; screenshots are readable only through the matching admin route.
- A same-origin WebSocket carries explicit input commands, chat, and client
  screenshot reports. Inputs are ordered per player, expire after three
  seconds, and are acknowledged by 20 Hz state snapshots.

Playwright/browser automation should authenticate normally, inspect
`/api/layout`, use the admin frame controls, then capture the visible browser
canvas. The service's optional retained screenshot is a bounded PNG data URL
reported by a connected game client, not a server-side renderer.

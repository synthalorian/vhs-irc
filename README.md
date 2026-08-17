# vhs-irc

> Modern IRC bouncer + client hybrid with persistent history, file uploads, and a retro terminal UI in the browser. WebSocket bridge to real IRC networks.

**Language:** TypeScript  
**Constraint:** Make a way to communicate  
**Stack:** Node.js, ws, sqlite, xterm.js, express

---

## Features

- Persistent IRC history (sqlite-backed)
- File upload with inline preview
- Browser-based terminal UI (xterm.js)
- WebSocket bridge to real IRC networks
- Retro green-phosphor CRT theme default
- Multi-network support (Freenode, Libera, etc.)
- OAuth2 auth for web client

---

## Development Plan

1. Phase 1: IRC protocol parser (RFC 2812)
2. Phase 2: WebSocket server + client connection manager
3. Phase 3: SQLite persistence (messages, channels, users)
4. Phase 4: xterm.js frontend with retro CRT theme
5. Phase 5: File upload + inline preview
6. Phase 6: Multi-network bouncer logic
7. Phase 7: OAuth2 auth layer
8. Phase 8: Docker deployment

---

## Getting Started

### Prerequisites

- TypeScript toolchain

### Build

```bash
# See PLAN.md for detailed build instructions per phase
cd vhs-irc
```

### Run

```bash
# See PLAN.md for run instructions
```

---

## Docker Deployment

### Quick Start

```bash
# Build and run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `VHS_IRC_REDIRECT_URI` | `http://localhost:3000/oauth/callback` | OAuth2 redirect URI |

### Data Persistence

SQLite database and uploaded files are persisted in a Docker volume:

```bash
# Backup data volume
docker run --rm -v vhs-irc-data:/data -v $(pwd):/backup alpine tar czf /backup/vhs-irc-backup.tar.gz -C /data .

# Restore from backup
docker run --rm -v vhs-irc-data:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xzf /backup/vhs-irc-backup.tar.gz"
```

### Building the Image

```bash
# Build locally
docker build -t vhs-irc .

# Run with custom port
docker run -d -p 8080:3000 -e PORT=3000 -v vhs-irc-data:/app/data vhs-irc
```

---

## Architecture

See `PLAN.md` for detailed architecture decisions and implementation notes.

---

## License

MIT

---

## ☕ Support the Developer

If this project saved you time, solved a problem, or just made your day a little more neon, you can fuel the next one:

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/synthalorian)

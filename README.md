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

## Architecture

See `PLAN.md` for detailed architecture decisions and implementation notes.

---

## License

MIT

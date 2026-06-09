# vhs-irc — Implementation Plan

## Project Overview

Modern IRC bouncer + client hybrid with persistent history, file uploads, and a retro terminal UI in the browser. WebSocket bridge to real IRC networks.

**Language:** TypeScript  
**Constraint:** Make a way to communicate  
**Stack:** Node.js, ws, sqlite, xterm.js, express

---

## Phase Breakdown

### Phase 1: IRC protocol parser (RFC 2812)

**Goal:** Phase 1: IRC protocol parser (RFC 2812)

**Deliverables:**
- [ ] Core implementation
- [ ] Tests
- [ ] Documentation update

**Notes:**
- 

---

### Phase 2: WebSocket server + client connection manager

**Goal:** Phase 2: WebSocket server + client connection manager

**Deliverables:**
- [ ] Core implementation
- [ ] Tests
- [ ] Documentation update

**Notes:**
- 

---

### Phase 3: SQLite persistence (messages, channels, users)

**Goal:** Phase 3: SQLite persistence (messages, channels, users)

**Deliverables:**
- [ ] Core implementation
- [ ] Tests
- [ ] Documentation update

**Notes:**
- 

---

### Phase 4: xterm.js frontend with retro CRT theme

**Goal:** Phase 4: xterm.js frontend with retro CRT theme

**Deliverables:**
- [ ] Core implementation
- [ ] Tests
- [ ] Documentation update

**Notes:**
- 

---

### Phase 5: File upload + inline preview

**Goal:** Phase 5: File upload + inline preview

**Deliverables:**
- [ ] Core implementation
- [ ] Tests
- [ ] Documentation update

**Notes:**
- 

---

### Phase 6: Multi-network bouncer logic

**Goal:** Phase 6: Multi-network bouncer logic

**Deliverables:**
- [ ] Core implementation
- [ ] Tests
- [ ] Documentation update

**Notes:**
- 

---

### Phase 7: OAuth2 auth layer

**Goal:** Phase 7: OAuth2 auth layer

**Deliverables:**
- [ ] Core implementation
- [ ] Tests
- [ ] Documentation update

**Notes:**
- 

---

### Phase 8: Docker deployment

**Goal:** Phase 8: Docker deployment

**Deliverables:**
- [ ] Core implementation
- [ ] Tests
- [ ] Documentation update

**Notes:**
- 

---

## Architecture Notes

### Key Decisions

- 

### Data Flow

```
[Input] → [Parse] → [Transform] → [Output]
```

### Error Handling Strategy

- 

---

## Testing Strategy

- Unit tests for core functions
- Integration tests for full pipeline
- Benchmarks for performance-critical paths

---

## Open Questions

1. 
2. 

---

*Generated for opencode sprint. Implement phase by phase. DO NOT RESEARCH. Build directly.*

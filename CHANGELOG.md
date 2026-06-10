# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-06-10

### Added
- IRC protocol parser (RFC 2812) with full message serialization and parsing
- WebSocket server with client connection management and broadcasting
- SQLite persistence layer for messages, channels, users, networks, and uploads
- xterm.js frontend with retro green-phosphor CRT theme
- File upload with inline preview support
- Multi-network bouncer logic with auto-connect
- OAuth2 authentication layer with PKCE support
- Docker deployment with docker-compose configuration
- Message buffer with delivery tracking and size limits
- Full test coverage for all major components (136 tests)

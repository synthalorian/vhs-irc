import express from 'express';
import { createServer } from 'http';
import { IrcWebSocketServer } from './websocket/server';

const app = express();
const httpServer = createServer(app);
const wsServer = new IrcWebSocketServer({ httpServer, path: '/ws' });

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`vhs-irc server listening on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await wsServer.close();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { app, httpServer, wsServer };

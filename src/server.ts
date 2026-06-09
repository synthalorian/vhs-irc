import express from 'express';
import { createServer } from 'http';
import { IrcWebSocketServer } from './websocket/server';
import { getDatabase, MessageRepository } from './db';

const app = express();
const httpServer = createServer(app);

app.use('/node_modules', express.static('node_modules'));
app.use(express.static('public'));

async function main() {
  const db = getDatabase();
  await db.init();

  const messageRepo = new MessageRepository(db);
  const wsServer = new IrcWebSocketServer({
    httpServer,
    path: '/ws',
    messageRepository: messageRepo,
  });

  const PORT = process.env.PORT || 3000;

  httpServer.listen(PORT, () => {
    console.log(`vhs-irc server listening on port ${PORT}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    await wsServer.close();
    await db.close();
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  return { app, httpServer, wsServer, db };
}

const serverPromise = main();

export { app, httpServer, serverPromise };

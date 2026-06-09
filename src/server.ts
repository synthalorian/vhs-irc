import express from 'express';
import { createServer } from 'http';
import multer from 'multer';
import { mkdirSync } from 'fs';
import { join, extname } from 'path';
import { IrcWebSocketServer } from './websocket/server';
import { getDatabase, MessageRepository, UploadRepository, NetworkRepository, ChannelRepository } from './db';
import { BouncerManager } from './bouncer';

const app = express();
const httpServer = createServer(app);

const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use('/node_modules', express.static('node_modules'));
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.json());

async function main() {
  const db = getDatabase();
  await db.init();

  const messageRepo = new MessageRepository(db);
  const uploadRepo = new UploadRepository(db);
  const networkRepo = new NetworkRepository(db);
  const channelRepo = new ChannelRepository(db);

  const bouncer = new BouncerManager({
    networkRepository: networkRepo,
    messageRepository: messageRepo,
    channelRepository: channelRepo,
  });
  await bouncer.init();

  const wsServer = new IrcWebSocketServer({
    httpServer,
    path: '/ws',
    messageRepository: messageRepo,
    uploadRepository: uploadRepo,
    bouncerManager: bouncer,
  });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      const { originalname, mimetype, size, filename } = req.file;
      const uploadedBy = req.body.nick || 'anonymous';
      const channel = req.body.channel || null;

      const uploadRecord = await uploadRepo.create({
        filename,
        originalName: originalname,
        mimeType: mimetype,
        size,
        uploadedBy,
        channel,
      });

      const fileUrl = `/uploads/${filename}`;

      wsServer.broadcast({
        command: 'FILE_SHARE',
        params: [
          uploadedBy,
          channel || '',
          originalname,
          fileUrl,
          mimetype,
          String(size),
        ],
      });

      res.json({
        success: true,
        id: uploadRecord.id,
        filename: originalname,
        url: fileUrl,
        mimeType: mimetype,
        size,
      });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  app.get('/api/uploads', async (_req, res) => {
    try {
      const uploads = await uploadRepo.findRecent(100);
      res.json({ uploads });
    } catch (err) {
      console.error('List uploads error:', err);
      res.status(500).json({ error: 'Failed to list uploads' });
    }
  });

  const PORT = process.env.PORT || 3000;

  httpServer.listen(PORT, () => {
    console.log(`vhs-irc server listening on port ${PORT}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
  });

  app.get('/api/networks', async (_req, res) => {
    try {
      const networks = await networkRepo.findAll();
      const statuses = bouncer.getNetworkStatuses();
      res.json({
        networks: networks.map((n) => ({
          ...n,
          status: statuses.find((s) => s.id === n.id)?.state || 'disconnected',
        })),
      });
    } catch (err) {
      console.error('List networks error:', err);
      res.status(500).json({ error: 'Failed to list networks' });
    }
  });

  app.post('/api/networks', async (req, res) => {
    try {
      const network = await networkRepo.create(req.body);
      await bouncer.addNetwork(network);
      res.json({ success: true, network });
    } catch (err) {
      console.error('Create network error:', err);
      res.status(500).json({ error: 'Failed to create network' });
    }
  });

  app.delete('/api/networks/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      bouncer.removeNetwork(id);
      await networkRepo.deleteById(id);
      res.json({ success: true });
    } catch (err) {
      console.error('Delete network error:', err);
      res.status(500).json({ error: 'Failed to delete network' });
    }
  });

  app.post('/api/networks/:id/connect', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      bouncer.connectNetwork(id);
      res.json({ success: true });
    } catch (err) {
      console.error('Connect network error:', err);
      res.status(500).json({ error: 'Failed to connect network' });
    }
  });

  app.post('/api/networks/:id/disconnect', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      bouncer.disconnectNetwork(id);
      res.json({ success: true });
    } catch (err) {
      console.error('Disconnect network error:', err);
      res.status(500).json({ error: 'Failed to disconnect network' });
    }
  });

  app.get('/api/networks/:id/channels', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const channels = await channelRepo.findByNetwork(id);
      res.json({ channels });
    } catch (err) {
      console.error('List channels error:', err);
      res.status(500).json({ error: 'Failed to list channels' });
    }
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    await bouncer.shutdown();
    await wsServer.close();
    await db.close();
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  return { app, httpServer, wsServer, db, bouncer };
}

const serverPromise = main();

export { app, httpServer, serverPromise };

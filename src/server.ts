import express from 'express';
import { createServer } from 'http';
import multer from 'multer';
import { mkdirSync } from 'fs';
import { join, extname } from 'path';
import { IrcWebSocketServer } from './websocket/server';
import { getDatabase, MessageRepository, UploadRepository, NetworkRepository, ChannelRepository, UserRepository } from './db';
import { BouncerManager } from './bouncer';
import { OAuth2Provider, createAuthMiddleware, handleOAuthError } from './auth';

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
  const userRepo = new UserRepository(db);

  const authProvider = new OAuth2Provider({
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 604800,
    authCodeTtlSeconds: 600,
  });

  authProvider.setCredentialVerifier({
    async verify(username: string, password: string) {
      const user = await userRepo.findByNick(username);
      if (!user || !user.password_hash) return null;
      if (user.password_hash !== password) return null;
      return { userId: String(user.id), nick: user.nick };
    },
  });

  authProvider.registerClient({
    clientId: 'vhs-irc-web',
    name: 'vhs-irc Web Client',
    redirectUris: [process.env.VHS_IRC_REDIRECT_URI || 'http://localhost:3000/oauth/callback'],
    allowedGrants: ['authorization_code', 'refresh_token', 'password'],
  });

  const bouncer = new BouncerManager({
    networkRepository: networkRepo,
    messageRepository: messageRepo,
    channelRepository: channelRepo,
  });
  await bouncer.init();

  const authOptional = createAuthMiddleware(authProvider, { optional: true });

  app.get('/auth/authorize', authOptional, (req, res, next) => {
    try {
      if (!req.auth) {
        res.status(401).json({ error: 'invalid_token', error_description: 'Authentication required' });
        return;
      }
      const params = req.query as Record<string, string | undefined>;
      const result = authProvider.authorize(
        {
          response_type: params.response_type || 'code',
          client_id: params.client_id || '',
          redirect_uri: params.redirect_uri || '',
          scope: params.scope,
          state: params.state,
          code_challenge: params.code_challenge,
          code_challenge_method: params.code_challenge_method,
        },
        req.auth.userId
      );
      const url = new URL(result.redirectUri);
      url.searchParams.set('code', result.code);
      if (result.state) url.searchParams.set('state', result.state);
      res.redirect(url.toString());
    } catch (err) {
      next(err);
    }
  });

  app.post('/auth/token', async (req, res, next) => {
    try {
      const response = await authProvider.token(req.body);
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  app.post('/auth/revoke', (req, res, next) => {
    try {
      const token = req.body.token;
      if (token) authProvider.revoke(token);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  app.get('/auth/introspect', authOptional, (req, res, next) => {
    try {
      const token = (req.query.token as string) || '';
      const result = authProvider.introspect(token);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/auth/me', authOptional, (req, res) => {
    if (!req.auth) {
      res.status(401).json({ error: 'invalid_token', error_description: 'Authentication required' });
      return;
    }
    res.json({ userId: req.auth.userId, scope: req.auth.scope });
  });

  app.use(handleOAuthError);

  const wsServer = new IrcWebSocketServer({
    httpServer,
    path: '/ws',
    messageRepository: messageRepo,
    uploadRepository: uploadRepo,
    bouncerManager: bouncer,
    authProvider,
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

  return { app, httpServer, wsServer, db, bouncer, authProvider };
}

const serverPromise = main();

export { app, httpServer, serverPromise };

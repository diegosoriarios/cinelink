import http from 'node:http';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { createTmdbRouter } from './tmdb';
import { parseClientMessage, RaceRoom, RoomStore } from './race-rooms';

export const createRoomRateLimiter = ({ windowMs = 60_000, max = 10 } = {}) => {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    allow: (key: string) => {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        if (hits.size > 1000) {
          for (const [hitKey, hit] of hits) {
            if (hit.resetAt <= now) {
              hits.delete(hitKey);
            }
          }
        }
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    }
  };
};

export const createApp = () => {
  const app = express();
  const roomStore = new RoomStore();
  const rateLimiter = createRoomRateLimiter();

  app.set('trust proxy', true);
  app.use(express.json());

  app.get('/healthz', (req, res) => {
    res.json({ ok: true });
  });

  app.use('/tmdb', createTmdbRouter());

  app.post('/race/rooms', (req, res) => {
    if (!rateLimiter.allow(req.ip ?? 'unknown')) {
      res.status(429).json({ error: 'Too many rooms created, slow down' });
      return;
    }
    const room = roomStore.createRoom();
    res.status(201).json({ code: room.code });
  });

  app.get('/race/rooms/:code', (req, res) => {
    const room = roomStore.get(req.params.code);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json({ code: room.code, phase: room.phase, playerCount: room.playerCount });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const attachRoomSocket = (room: RaceRoom, socket: WebSocket) => {
    socket.on('message', (raw) => {
      const message = parseClientMessage(raw);
      if (!message) {
        socket.send(JSON.stringify({ type: 'error', code: 'MALFORMED_MESSAGE' }));
        return;
      }
      if (message.type === 'join') {
        const result = room.join(String(message.playerId ?? ''), String(message.nickname ?? ''), socket);
        if (!result.ok) {
          socket.send(JSON.stringify({ type: 'error', code: result.code }));
        }
        return;
      }
      socket.send(JSON.stringify({ type: 'error', code: 'MUST_JOIN_FIRST' }));
    });

    socket.on('close', () => {
      if (room.leaveBySocket(socket)) {
        if (room.playerCount === 0) {
          roomStore.remove(room.code);
        } else {
          room.broadcastRoomState();
        }
      }
    });
  };

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const match = url.pathname.match(/^\/race\/rooms\/([A-Z0-9]{4})\/ws$/);
    if (!match) {
      socket.destroy();
      return;
    }
    const room = roomStore.get(match[1]);
    if (!room) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      attachRoomSocket(room, ws);
    });
  });

  return { app, server, roomStore };
};

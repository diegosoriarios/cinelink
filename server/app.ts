import http from 'node:http';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { corsHeaders, createTmdbRouter } from './tmdb';
import { parseClientMessage, RoomStore, type RaceDealer, type RaceRoom, type RaceRoomDeps } from './race-rooms';
import { createCreditsCache, validateRaceClaim, type CreditsFetcher } from './race-validator';
import type { PersonId } from '../src/types/game';

const DEFAULT_DISCONNECT_GRACE_MS = 30_000;

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

export type CreateAppOptions = {
  getCredits?: CreditsFetcher;
  dealPair?: RaceDealer;
  roomDeps?: RaceRoomDeps;
  disconnectGraceMs?: number;
};

export const createApp = (options: CreateAppOptions = {}) => {
  const app = express();
  const roomStore = new RoomStore();
  const rateLimiter = createRoomRateLimiter();
  const creditsCache = createCreditsCache();
  const getCredits = options.getCredits ?? creditsCache.getCredits;
  const disconnectGraceMs = options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;

  const roomDeps: RaceRoomDeps = { ...options.roomDeps, dealer: options.dealPair ?? options.roomDeps?.dealer };
  const graceTimers = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();

  const clearGrace = (code: string, playerId: string) => {
    const roomTimers = graceTimers.get(code);
    if (!roomTimers) {
      return;
    }
    const handle = roomTimers.get(playerId);
    if (handle) {
      clearTimeout(handle);
      roomTimers.delete(playerId);
    }
    if (roomTimers.size === 0) {
      graceTimers.delete(code);
    }
  };

  app.set('trust proxy', true);
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
    res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
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
    const room = roomStore.createRoom(roomDeps);
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

  const sendError = (socket: WebSocket, code: string) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: 'error', code }));
    }
  };

  const scheduleGrace = (room: RaceRoom, playerId: string) => {
    const roomTimers = graceTimers.get(room.code) ?? new Map<string, ReturnType<typeof setTimeout>>();
    graceTimers.set(room.code, roomTimers);
    const handle = setTimeout(() => {
      clearGrace(room.code, playerId);
      if (room.isConnected(playerId)) {
        return;
      }
      const other = room.otherPlayerId(playerId);
      room.removePlayer(playerId);
      if (other && (room.phase === 'countdown' || room.phase === 'racing')) {
        room.finish(other, 'forfeit', null);
      } else if (room.playerCount === 0) {
        roomStore.remove(room.code);
      } else {
        room.broadcastRoomState();
      }
    }, disconnectGraceMs);
    roomTimers.set(playerId, handle);
  };

  const handleLeave = (room: RaceRoom, socket: WebSocket, playerId: string) => {
    const wasActive = room.phase === 'countdown' || room.phase === 'racing';
    const other = room.otherPlayerId(playerId);
    room.removePlayer(playerId);
    clearGrace(room.code, playerId);
    if (wasActive && other) {
      room.finish(other, 'forfeit', null);
    } else if (room.playerCount === 0) {
      roomStore.remove(room.code);
    } else {
      room.broadcastRoomState();
    }
    socket.close();
  };

  const attachRoomSocket = (room: RaceRoom, socket: WebSocket) => {
    socket.on('message', (raw) => {
      const message = parseClientMessage(raw);
      if (!message) {
        sendError(socket, 'MALFORMED_MESSAGE');
        return;
      }

      if (message.type === 'join') {
        const playerId = String(message.playerId ?? '');
        const result = room.join(playerId, String(message.nickname ?? ''), socket);
        if (!result.ok) {
          sendError(socket, result.code);
        } else {
          clearGrace(room.code, playerId);
        }
        return;
      }

      const playerId = room.playerIdBySocket(socket);
      if (!playerId) {
        sendError(socket, 'MUST_JOIN_FIRST');
        return;
      }

      switch (message.type) {
        case 'start': {
          const result = room.startRace(playerId);
          if (!result.ok) {
            sendError(socket, result.code);
          }
          break;
        }
        case 'progress': {
          const hops = Number(message.hops);
          const currentPersonName = typeof message.currentPersonName === 'string' ? message.currentPersonName : null;
          room.recordProgress(playerId, Number.isFinite(hops) ? hops : 0, currentPersonName);
          break;
        }
        case 'claim': {
          const path = Array.isArray(message.path) ? (message.path as PersonId[]) : [];
          if (room.phase !== 'racing' || !room.startPerson || !room.targetPerson) {
            sendError(socket, 'NOT_RACING');
            break;
          }
          void validateRaceClaim({
            path,
            startId: room.startPerson.id,
            targetId: room.targetPerson.id,
            getCredits
          }).then((result) => {
            if (result.valid) {
              room.finish(playerId, 'claim', path);
            } else {
              sendError(socket, 'INVALID_CLAIM');
            }
          });
          break;
        }
        case 'rematch': {
          if (!room.resetForRematch()) {
            sendError(socket, 'CANNOT_REMATCH');
          }
          break;
        }
        case 'leave': {
          handleLeave(room, socket, playerId);
          break;
        }
        default:
          sendError(socket, 'UNKNOWN_MESSAGE');
      }
    });

    socket.on('close', () => {
      const playerId = room.playerIdBySocket(socket);
      if (!room.leaveBySocket(socket)) {
        return;
      }
      if (room.phase === 'lobby') {
        if (room.playerCount === 0) {
          roomStore.remove(room.code);
        } else {
          room.broadcastRoomState();
        }
        return;
      }
      room.broadcastRoomState();
      if (playerId) {
        scheduleGrace(room, playerId);
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

  return { app, server, roomStore, creditsCache };
};

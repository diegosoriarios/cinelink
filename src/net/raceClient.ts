import type { ClientMessage, ServerMessage } from '../types/race';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export type RoomPeek = {
  code: string;
  phase: string;
  playerCount: number;
};

const MAX_RECONNECT_DELAY_MS = 15_000;

export const getRaceBaseUrl = (): string => (process.env.EXPO_PUBLIC_RACE_URL ?? '').replace(/\/+$/, '');

export const isRaceConfigured = (): boolean => getRaceBaseUrl().length > 0;

export const normalizeRoomCode = (code: string): string => code.trim().toUpperCase();

export const getRaceRoomSocketUrl = (code: string): string => {
  const base = getRaceBaseUrl();
  if (!base) {
    throw new Error('EXPO_PUBLIC_RACE_URL is not configured');
  }
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}/race/rooms/${normalizeRoomCode(code)}/ws`;
};

export const createRaceRoom = async (): Promise<string> => {
  const base = getRaceBaseUrl();
  if (!base) {
    throw new Error('EXPO_PUBLIC_RACE_URL is not configured');
  }
  const response = await fetch(`${base}/race/rooms`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Could not create a room (${response.status})`);
  }
  const data = (await response.json()) as { code?: string };
  if (!data?.code) {
    throw new Error('Room response was missing a code');
  }
  return data.code;
};

export const peekRaceRoom = async (code: string): Promise<RoomPeek | null> => {
  const base = getRaceBaseUrl();
  if (!base) {
    throw new Error('EXPO_PUBLIC_RACE_URL is not configured');
  }
  const response = await fetch(`${base}/race/rooms/${encodeURIComponent(normalizeRoomCode(code))}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Could not look up that room (${response.status})`);
  }
  return (await response.json()) as RoomPeek;
};

type RaceSocketHandlers = {
  onMessage: (message: ServerMessage) => void;
  onStatus?: (status: ConnectionStatus) => void;
  onOpen?: () => void;
};

const OPEN_STATE = 1;

export class RaceSocket {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly url: string,
    private readonly handlers: RaceSocketHandlers
  ) {}

  connect(): void {
    this.closedByUser = false;
    this.open();
  }

  send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === OPEN_STATE) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private open(): void {
    this.handlers.onStatus?.('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.handlers.onStatus?.('open');
      this.handlers.onOpen?.();
    };

    ws.onmessage = (event) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      if (!raw) {
        return;
      }
      try {
        const parsed = JSON.parse(raw) as ServerMessage;
        if (parsed && typeof parsed.type === 'string') {
          this.handlers.onMessage(parsed);
        }
      } catch {
        // Ignore malformed frames; the server is the source of truth.
      }
    };

    ws.onclose = () => {
      this.handlers.onStatus?.('closed');
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires afterwards and handles reconnection.
    };
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) {
      return;
    }
    const delay = Math.min(1000 * 2 ** this.attempt, MAX_RECONNECT_DELAY_MS);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }
}

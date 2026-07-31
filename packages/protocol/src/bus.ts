import {
  parseServerMessage,
  type ClientMessage,
  type Role,
  type ServerMessage,
} from './messages.js';

/**
 * 端末間の通信路の抽象。
 *
 * 1 台モードと 2 台モードの違いを、この 1 つの IF の裏に完全に隠す。
 * ゲームロジックは「相手にメッセージが届く」ことだけを知っていればよく、
 * それがメモリ内かネットワーク越しかを意識しない。
 */
export interface EventBus {
  send(message: ClientMessage): void;
  subscribe(handler: (message: ServerMessage) => void): () => void;
  close(): void;
  readonly connected: boolean;
}

/**
 * 1 台モード用。display と scanner が同じタブに同居するので、
 * 送ったメッセージを relay としてそのまま自分に返す。
 */
export class InMemoryBus implements EventBus {
  readonly connected = true;

  private readonly handlers = new Set<(message: ServerMessage) => void>();
  private readonly role: Role;

  constructor(role: Role = 'solo') {
    this.role = role;
  }

  send(message: ClientMessage): void {
    // 同期的に配ると reducer の再入を招くのでマイクロタスクへ逃がす
    queueMicrotask(() => {
      this.emit({ type: 'relay', from: this.role, payload: message });
    });
  }

  subscribe(handler: (message: ServerMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(message: ServerMessage): void {
    for (const handler of this.handlers) handler(message);
  }

  close(): void {
    this.handlers.clear();
  }
}

export interface WebSocketBusOptions {
  readonly url: string;
  readonly room: string;
  readonly role: Role;
  /** 再接続の最大待ち時間 */
  readonly maxBackoffMs?: number;
  /** テスト用に WebSocket 実装を差し替える */
  readonly factory?: (url: string) => WebSocket;
}

/**
 * 2 台モード用。切断しても自動で再接続し、復帰時に room.join をやり直す。
 * 子供が使う環境では Wi-Fi が不安定なことが普通にあるので、
 * 「勝手に直る」ことを最初から前提にしている。
 */
export class WebSocketBus implements EventBus {
  private socket: WebSocket | null = null;
  private readonly handlers = new Set<(message: ServerMessage) => void>();
  private readonly queue: ClientMessage[] = [];
  private backoffMs = 500;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: WebSocketBusOptions) {
    this.connect();
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private connect(): void {
    if (this.closed) return;
    const create = this.options.factory ?? ((url: string) => new WebSocket(url));
    const socket = create(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      this.backoffMs = 500;
      socket.send(
        JSON.stringify({
          type: 'room.join',
          room: this.options.room,
          role: this.options.role,
        }),
      );
      // 切断中に溜まったメッセージを流す
      while (this.queue.length > 0) {
        const message = this.queue.shift();
        if (message) socket.send(JSON.stringify(message));
      }
    };

    socket.onmessage = (event) => {
      let raw: unknown;
      try {
        raw = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const message = parseServerMessage(raw);
      // 未知・不正なメッセージは黙って捨てる（将来のバージョン差で壊れないように）
      if (message) {
        for (const handler of this.handlers) handler(message);
      }
    };

    socket.onclose = () => {
      this.socket = null;
      this.scheduleReconnect();
    };

    socket.onerror = () => socket.close();
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(delay * 2, this.options.maxBackoffMs ?? 8000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  send(message: ClientMessage): void {
    if (this.connected && this.socket) {
      this.socket.send(JSON.stringify(message));
    } else {
      // 再接続後にまとめて送る。取りこぼしで手が止まるのを防ぐ
      this.queue.push(message);
    }
  }

  subscribe(handler: (message: ServerMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.handlers.clear();
    this.socket?.close();
    this.socket = null;
  }
}

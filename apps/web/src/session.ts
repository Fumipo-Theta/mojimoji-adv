import { InMemoryBus, WebSocketBus, generateRoomCode, type EventBus, type Role } from '@mojimoji/protocol';

/**
 * URL から動作モードを決める。
 *
 *   ?role=solo     … 1 台完結（既定）
 *   ?role=display  … ゲーム画面（PC + ディスプレイ）
 *   ?role=scanner  … カメラ端末（スマホ・タブレット）
 *
 * solo と display/scanner の違いは EventBus の実装だけ。
 * 画面もゲームロジックも共通のものを使う。
 */
export interface SessionConfig {
  readonly role: Role;
  readonly room: string;
  readonly recognizerId: string;
}

export function readSessionConfig(search = window.location.search): SessionConfig {
  const params = new URLSearchParams(search);
  const role = params.get('role');
  const room = params.get('room');
  return {
    role: role === 'display' || role === 'scanner' ? role : 'solo',
    room: room && /^\d{4}$/.test(room) ? room : generateRoomCode(),
    recognizerId: params.get('recognizer') ?? 'dummy',
  };
}

export function createBus(config: SessionConfig): EventBus {
  if (config.role === 'solo') return new InMemoryBus('solo');

  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return new WebSocketBus({
    url: `${scheme}://${window.location.host}/ws`,
    room: config.room,
    role: config.role,
  });
}

/** scanner 端末に読ませる参加用 URL */
export function scannerUrl(room: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('role', 'scanner');
  url.searchParams.set('room', room);
  return url.toString();
}

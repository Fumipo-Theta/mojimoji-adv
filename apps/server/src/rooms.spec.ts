import type { ClientMessage, ServerMessage } from '@mojimoji/protocol';
import { describe, expect, it } from 'vitest';
import { RoomRegistry, type Peer } from './rooms.js';

function makePeer(id: number): Peer & { inbox: ServerMessage[] } {
  const inbox: ServerMessage[] = [];
  return {
    id,
    role: 'display',
    room: null,
    inbox,
    send: (message) => inbox.push(message),
  };
}

const SCAN: ClientMessage = {
  type: 'scan.result',
  sheetId: 's',
  cells: [{ index: 0, candidates: [{ char: 'あ', confidence: 0.9 }] }],
  capturedAt: 0,
};

describe('RoomRegistry', () => {
  it('同室の相手にだけ中継する', () => {
    const rooms = new RoomRegistry();
    const display = makePeer(1);
    const scanner = makePeer(2);
    rooms.join(display, '1234', 'display');
    rooms.join(scanner, '1234', 'scanner');

    rooms.relay(scanner, SCAN);

    expect(display.inbox.filter((m) => m.type === 'relay')).toHaveLength(1);
    expect(scanner.inbox.filter((m) => m.type === 'relay')).toHaveLength(0);
  });

  it('別のルームには届かない', () => {
    const rooms = new RoomRegistry();
    const a = makePeer(1);
    const b = makePeer(2);
    rooms.join(a, '1111', 'display');
    rooms.join(b, '2222', 'scanner');

    rooms.relay(b, SCAN);
    expect(a.inbox.filter((m) => m.type === 'relay')).toHaveLength(0);
  });

  it('参加・退出でルーム状態が配信される', () => {
    const rooms = new RoomRegistry();
    const display = makePeer(1);
    const scanner = makePeer(2);
    rooms.join(display, '1234', 'display');
    rooms.join(scanner, '1234', 'scanner');

    const latest = display.inbox.filter((m) => m.type === 'room.state').at(-1);
    expect(latest).toMatchObject({ type: 'room.state', members: ['display', 'scanner'] });

    rooms.leave(scanner);
    const afterLeave = display.inbox.filter((m) => m.type === 'room.state').at(-1);
    expect(afterLeave).toMatchObject({ members: ['display'] });
  });

  it('ルーム未参加で中継しようとするとエラーを返す', () => {
    const rooms = new RoomRegistry();
    const peer = makePeer(1);
    rooms.relay(peer, SCAN);
    expect(peer.inbox.at(-1)).toMatchObject({ type: 'room.error' });
  });

  it('部屋を移動すると前の部屋には届かなくなる', () => {
    const rooms = new RoomRegistry();
    const stay = makePeer(1);
    const mover = makePeer(2);
    rooms.join(stay, '1111', 'display');
    rooms.join(mover, '1111', 'scanner');
    rooms.join(mover, '2222', 'scanner');

    rooms.relay(mover, SCAN);
    expect(stay.inbox.filter((m) => m.type === 'relay')).toHaveLength(0);
  });

  it('全員退出したルームは破棄される', () => {
    const rooms = new RoomRegistry();
    const peer = makePeer(1);
    rooms.join(peer, '1234', 'display');
    expect(rooms.stats().rooms).toBe(1);
    rooms.leave(peer);
    expect(rooms.stats()).toEqual({ rooms: 0, peers: 0 });
  });
});

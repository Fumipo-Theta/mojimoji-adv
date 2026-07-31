import { describe, expect, it } from 'vitest';
import { InMemoryBus } from './bus.js';
import {
  clientMessageSchema,
  generateRoomCode,
  parseClientMessage,
  roomCodeSchema,
} from './messages.js';

describe('メッセージスキーマ', () => {
  it('正しい scan.result を受け付ける', () => {
    const message = parseClientMessage({
      type: 'scan.result',
      sheetId: 'sheet-1',
      cells: [{ index: 0, candidates: [{ char: 'あ', confidence: 0.9 }], quality: 0.7 }],
      capturedAt: 1_700_000_000_000,
    });
    expect(message?.type).toBe('scan.result');
  });

  it('confidence が範囲外なら拒否する', () => {
    const message = parseClientMessage({
      type: 'scan.result',
      sheetId: 's',
      cells: [{ index: 0, candidates: [{ char: 'あ', confidence: 1.5 }] }],
      capturedAt: 0,
    });
    expect(message).toBeNull();
  });

  it('未知の type は拒否する', () => {
    expect(parseClientMessage({ type: 'scan.image', data: 'base64...' })).toBeNull();
  });

  it('画像を運ぶフィールドがスキーマに存在しない（筆跡を端末外に出さない境界）', () => {
    const serialized = JSON.stringify(clientMessageSchema);
    for (const forbidden of ['image', 'bitmap', 'dataUrl', 'photo', 'frame']) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('ルームコードは 4 桁の数字だけを許す', () => {
    expect(roomCodeSchema.safeParse('1234').success).toBe(true);
    expect(roomCodeSchema.safeParse('12').success).toBe(false);
    expect(roomCodeSchema.safeParse('abcd').success).toBe(false);
  });

  it('生成されるルームコードは常に 4 桁', () => {
    for (const r of [0, 0.5, 0.999999]) {
      expect(roomCodeSchema.safeParse(generateRoomCode(() => r)).success).toBe(true);
    }
  });
});

describe('InMemoryBus（1 台モード）', () => {
  it('送ったメッセージが relay として返ってくる', async () => {
    const bus = new InMemoryBus('solo');
    const received: unknown[] = [];
    bus.subscribe((m) => received.push(m));

    bus.send({ type: 'scan.preview', ok: true, confidence: 1 });
    await new Promise((resolve) => queueMicrotask(() => resolve(null)));

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'relay', from: 'solo' });
  });

  it('unsubscribe すると届かなくなる', async () => {
    const bus = new InMemoryBus();
    const received: unknown[] = [];
    const off = bus.subscribe((m) => received.push(m));
    off();

    bus.send({ type: 'room.leave' });
    await new Promise((resolve) => queueMicrotask(() => resolve(null)));
    expect(received).toHaveLength(0);
  });

  it('送信は同期的に配られない（reducer の再入を防ぐ）', () => {
    const bus = new InMemoryBus();
    const received: unknown[] = [];
    bus.subscribe((m) => received.push(m));
    bus.send({ type: 'room.leave' });
    expect(received).toHaveLength(0);
  });
});

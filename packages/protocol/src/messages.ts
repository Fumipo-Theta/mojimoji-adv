import { z } from 'zod';

/**
 * 端末間メッセージ。1 台モードでも同じ型を使い、トランスポートだけ差し替える。
 *
 * プライバシー上の最重要ルール:
 *   このファイルに「画像」を運ぶメッセージを追加してはいけない。
 *   認識は必ず scanner 端末のブラウザ内で完結させ、ネットワークに出るのは
 *   認識結果（文字とスコア）だけに保つ。子供の筆跡を端末外に出さないための境界が
 *   このスキーマそのものになっている。
 */

export const roleSchema = z.enum(['display', 'scanner', 'solo']);
export type Role = z.infer<typeof roleSchema>;

export const charCandidateSchema = z.object({
  char: z.string().min(1).max(2),
  confidence: z.number().min(0).max(1),
});

export const cellResultSchema = z.object({
  index: z.number().int().min(0),
  candidates: z.array(charCandidateSchema),
  quality: z.number().min(0).max(1).optional(),
});

export const detectionHintSchema = z.enum([
  'no-sheet',
  'too-dark',
  'too-bright',
  'blurry',
  'partial',
  'skewed',
]);

/** ルームコードは 4 桁。子供が読み上げて入力できる長さにしてある */
export const roomCodeSchema = z.string().regex(/^\d{4}$/, 'ルームコードは 4 桁の数字です');

// --- 端末 → サーバー ---

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('room.join'),
    room: roomCodeSchema,
    role: roleSchema,
  }),
  z.object({
    type: z.literal('room.leave'),
  }),
  /** scanner → display: 認識できた（画像は含めない） */
  z.object({
    type: z.literal('scan.result'),
    sheetId: z.string(),
    cells: z.array(cellResultSchema),
    capturedAt: z.number().int(),
  }),
  /** scanner → display: 検出の状態だけを通知（ガイド表示の同期用） */
  z.object({
    type: z.literal('scan.preview'),
    ok: z.boolean(),
    hint: detectionHintSchema.optional(),
    confidence: z.number().min(0).max(1),
  }),
  /** display → scanner: いま何を書けばいいか */
  z.object({
    type: z.literal('prompt.set'),
    kind: z.enum(['element', 'exact', 'word']),
    requiredElement: z.string().nullable(),
    requiredChars: z.array(z.string()),
    sealedChars: z.array(z.string()),
    cellCount: z.number().int().min(1),
    hintText: z.string(),
    timeLimitMs: z.number().int().nullable(),
  }),
  /** display → scanner: 判定結果。振動・効果音を演出に同期させる */
  z.object({
    type: z.literal('feedback'),
    accepted: z.boolean(),
    kind: z.enum(['hit', 'wrong-char', 'sealed', 'unreadable', 'blank']),
    message: z.string(),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

// --- サーバー → 端末 ---

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('room.state'),
    room: roomCodeSchema,
    /** 参加中のロール。display と scanner が揃ったら開始できる */
    members: z.array(roleSchema),
  }),
  z.object({
    type: z.literal('room.error'),
    message: z.string(),
  }),
  /** 他端末からの中継。payload はそのまま ClientMessage */
  z.object({
    type: z.literal('relay'),
    from: roleSchema,
    payload: clientMessageSchema,
  }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

export function parseClientMessage(raw: unknown): ClientMessage | null {
  const result = clientMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  const result = serverMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** 4 桁のルームコードを生成する。0000 は使わない */
export function generateRoomCode(random: () => number = Math.random): string {
  return String(1000 + Math.floor(random() * 9000));
}

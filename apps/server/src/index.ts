import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseClientMessage } from '@mojimoji/protocol';
import { Hono } from 'hono';
import { WebSocketServer } from 'ws';
import { RoomRegistry, type Peer } from './rooms.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const webDist = join(repoRoot, 'apps/web/dist');
const dataDir = join(repoRoot, 'data');
const certDir = join(repoRoot, 'apps/server/certs');

const PORT = Number(process.env.PORT ?? 8787);

const app = new Hono();
const rooms = new RoomRegistry();

app.get('/api/health', (c) => c.json({ ok: true, ...rooms.stats() }));

/**
 * セーブデータ。
 *
 * 保存するのは文字ごとの記入回数やスコアといった学習記録のみで、画像は扱わない。
 * 保存先はこのローカル PC の data/ 配下だけ。外部には一切送らない。
 */
const SAVE_FILE = join(dataDir, 'save.json');

app.get('/api/save', async (c) => {
  try {
    const raw = await readFile(SAVE_FILE, 'utf8');
    return c.json(JSON.parse(raw));
  } catch {
    return c.json({ records: {}, clearedStages: [] });
  }
});

app.put('/api/save', async (c) => {
  const body = await c.req.json();
  await mkdir(dataDir, { recursive: true });
  await writeFile(SAVE_FILE, JSON.stringify(body, null, 2), 'utf8');
  return c.json({ ok: true });
});

// 本番ビルドの配信。dev では Vite が配信し、/api と /ws だけここへプロキシされる
app.get('*', async (c) => {
  if (!existsSync(webDist)) {
    return c.text(
      'ビルドされた web アプリが見つかりません。開発中は `npm run dev` を使ってください。',
      404,
    );
  }
  const path = c.req.path === '/' ? '/index.html' : c.req.path;
  const file = join(webDist, path);
  const target = existsSync(file) ? file : join(webDist, 'index.html');
  const stream = createReadStream(target);
  const type = target.endsWith('.js')
    ? 'text/javascript'
    : target.endsWith('.css')
      ? 'text/css'
      : target.endsWith('.svg')
        ? 'image/svg+xml'
        : 'text/html; charset=utf-8';
  return new Response(stream as unknown as ReadableStream, {
    headers: { 'content-type': type },
  });
});

/** LAN 上の IPv4 アドレス。スマホからアクセスする URL を案内するのに使う */
function lanAddresses(): string[] {
  const found: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) found.push(entry.address);
    }
  }
  return found;
}

async function loadCerts(): Promise<{ key: Buffer; cert: Buffer } | null> {
  const keyPath = join(certDir, 'key.pem');
  const certPath = join(certDir, 'cert.pem');
  if (!existsSync(keyPath) || !existsSync(certPath)) return null;
  return { key: await readFile(keyPath), cert: await readFile(certPath) };
}

const certs = await loadCerts();
const handler = async (
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): Promise<void> => {
  const { getRequestListener } = await import('@hono/node-server');
  return getRequestListener(app.fetch)(req, res);
};

const server = certs
  ? createHttpsServer({ key: certs.key, cert: certs.cert }, handler)
  : createHttpServer(handler);

const wss = new WebSocketServer({ server, path: '/ws' });
let nextPeerId = 1;

wss.on('connection', (socket) => {
  const peer: Peer = {
    id: nextPeerId++,
    role: 'display',
    room: null,
    send: (message) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
  };

  socket.on('message', (data) => {
    let raw: unknown;
    try {
      raw = JSON.parse(String(data));
    } catch {
      return;
    }
    const message = parseClientMessage(raw);
    if (!message) {
      // スキーマ外のメッセージは中継しない。画像などが誤って流れる経路を塞ぐ
      peer.send({ type: 'room.error', message: '不正なメッセージです' });
      return;
    }
    if (message.type === 'room.join') {
      rooms.join(peer, message.room, message.role);
      return;
    }
    if (message.type === 'room.leave') {
      rooms.leave(peer);
      return;
    }
    rooms.relay(peer, message);
  });

  socket.on('close', () => rooms.leave(peer));
  socket.on('error', () => rooms.leave(peer));
});

server.listen(PORT, '0.0.0.0', () => {
  const scheme = certs ? 'https' : 'http';
  console.log(`\n  もじもじアドベンチャー サーバー`);
  console.log(`  ローカル:  ${scheme}://localhost:${PORT}`);
  for (const address of lanAddresses()) {
    console.log(`  LAN:       ${scheme}://${address}:${PORT}`);
  }
  if (!certs) {
    console.log(
      `\n  ⚠ HTTPS 証明書がありません。スマホなど localhost 以外の端末では\n` +
        `    カメラ（getUserMedia）がブラウザにブロックされます。\n` +
        `    'npm run setup:cert' を実行してから起動し直してください。\n`,
    );
  }
});

#!/usr/bin/env node
/**
 * ローカル HTTPS 証明書を用意する。
 *
 * なぜ必須か:
 *   ブラウザの getUserMedia()（カメラ）は secure context でしか動かない。
 *   localhost は例外扱いだが、2 台モードでスマホから LAN の IP アドレスに
 *   アクセスする場合は HTTP だと必ずカメラがブロックされる。
 *   ここで作った証明書を使うことでスキャナ端末が実際に使えるようになる。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const certDir = resolve(here, '../certs');

function lanAddresses() {
  const found = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) found.push(entry.address);
    }
  }
  return found;
}

function hasMkcert() {
  try {
    execFileSync('mkcert', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!hasMkcert()) {
  console.error(`
  mkcert が見つかりません。先にインストールしてください。

    macOS:    brew install mkcert && mkcert -install
    Linux:    https://github.com/FiloSottile/mkcert#linux の手順
    Windows:  choco install mkcert  （管理者権限）

  インストール後、もう一度 'npm run setup:cert' を実行してください。
`);
  process.exit(1);
}

mkdirSync(certDir, { recursive: true });

const hosts = ['localhost', '127.0.0.1', '::1', ...lanAddresses()];
console.log(`  証明書を発行します: ${hosts.join(', ')}`);

execFileSync(
  'mkcert',
  ['-key-file', join(certDir, 'key.pem'), '-cert-file', join(certDir, 'cert.pem'), ...hosts],
  { stdio: 'inherit' },
);

if (!existsSync(join(certDir, 'cert.pem'))) {
  console.error('  証明書の生成に失敗しました。');
  process.exit(1);
}

console.log(`
  完了しました。certs/ は .gitignore 済みです（コミットしないでください）。

  次のステップ:
    1. 'npm run dev' でサーバーを起動
    2. スマホからは https://<表示された LAN アドレス>:8787 を開く
    3. 初回は警告が出るので、スマホに mkcert のルート CA を入れてください。
       ルート CA の場所は 'mkcert -CAROOT' で確認できます。
       手順の詳細: docs/setup-mobile.md
`);

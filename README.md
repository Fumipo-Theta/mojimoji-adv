# もじもじアドベンチャー（mojimoji-adv）

紙に手書きした文字をカメラで読み取り、それがゲームの入力になる「リアル連携型」の文字学習ゲーム。
書いた文字が **モジモン（文字モンスター）** として仲間になり、育てて戦う。

ローカル PC の Web サーバーから配信する Web アプリとして動く。

## いまできること

| | 状態 |
|---|---|
| バトル 1 本の通しプレイ | ✅ 動く |
| モジモン図鑑（五十音表）・育成・進化解放 | ✅ 動く |
| 1 台モード / 2 台モード | ✅ 両方動く |
| **手書き文字の認識** | ⏳ **ダミー実装**（画面の五十音表から文字を選ぶ）|
| カメラ・用紙検出 | ⏳ 未実装（M3） |

認識部分は `CharRecognizer` / `SheetDetector` というインターフェース越しにしか使われていないので、
実装を差し替えてもゲーム側のコードは変わらない。詳細は [docs/architecture.md](docs/architecture.md)。

## はじめかた

```bash
npm install

# 1 台モードで試す（カメラ不要）
npm run build
npm start --workspace @mojimoji/server
# → http://localhost:8787/?role=solo をブラウザで開く
```

2 台モード（スマホをスキャナにする）を使う場合は、先に HTTPS 証明書が必要:

```bash
npm run setup:cert    # mkcert が必要
npm run dev
```

- PC:   `https://localhost:5173/?role=display`
- スマホ: 画面に出る `https://<LAN アドレス>:5173/?role=scanner&room=XXXX`

> **なぜ HTTPS が必要か**: ブラウザのカメラ API（`getUserMedia`）は secure context でしか動かない。
> `localhost` は例外だが、スマホから LAN の IP アドレスにアクセスする場合、HTTP だと必ずブロックされる。
> 手順は [docs/setup-mobile.md](docs/setup-mobile.md)。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | API サーバーと Vite dev サーバーを同時起動 |
| `npm run build` | 全ワークスペースをビルド |
| `npm test` | ユニット・契約テスト（Vitest） |
| `npm run test:e2e` | E2E（Playwright、ダミー認識で決定論的に実行） |
| `npm run typecheck` | 型チェック |
| `npm run setup:cert` | ローカル HTTPS 証明書を発行 |

## 構成

```
packages/
  vision/       用紙検出・マス切り出し（IF + 実装）
  recognition/  文字認識（IF + 実装 + 契約テスト）
  core/         ゲームロジック（純粋 TS・DOM 非依存）
  protocol/     端末間メッセージと EventBus
apps/
  server/       Hono + WebSocket 中継 + セーブ API
  web/          React SPA（role で display / scanner / solo を切替）
```

## プライバシー方針

子供の手書き画像は筆跡という個人的特徴を含むため、**画像を端末の外に出さない**ことを設計の前提にしている。

- 認識はスキャナ端末のブラウザ内で完結する。カメラ画像はサーバーに送らない
- 2 台モードでネットワークを流れるのは「認識された文字とスコア」だけ。
  `packages/protocol` のスキーマに画像を運ぶフィールドは存在せず、
  それを検証するテストがある（`messages.spec.ts`）
- セーブデータはこの PC の `data/` 配下のみ。外部サービスには送らない
- クラウド OCR を使う実装は差し替え口として型だけ用意してあるが、既定では組み込まれていない。
  `RecognizerRegistry` はオフラインでない実装を明示的な許可なしには生成しない

## ドキュメント

- [アーキテクチャと技術スタック](docs/architecture.md)
- [ゲームデザイン](docs/game-design.md)
- [アセット一覧](docs/assets.md)
- [ロードマップ](docs/roadmap.md)
- [スマホのセットアップ](docs/setup-mobile.md)
- [ライセンス](docs/licenses.md)

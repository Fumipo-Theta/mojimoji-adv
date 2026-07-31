# アーキテクチャと技術スタック

## 1. 全体構成

```
                 ┌──────────────── ローカル PC ────────────────┐
                 │  apps/server (Hono + ws)                     │
                 │   ├─ 静的配信 (Vite build)                   │
                 │   ├─ WebSocket 中継（ルームコードでペアリング）│
                 │   └─ セーブ API（data/save.json）             │
                 └──────┬──────────────────────┬────────────────┘
                        │                      │
        role=display    │                      │  role=scanner
   ┌────────────────────▼──────┐   ┌───────────▼─────────────────┐
   │ PC + 外部ディスプレイ       │   │ スマホ／タブレット            │
   │ ゲーム画面・演出・図鑑      │   │ カメラ・用紙検出・文字認識     │
   └────────────────────────────┘   └─────────────────────────────┘

   1 台モード = role=solo : 上記 2 つを 1 つのタブ内で完結（WS を使わない）
```

**認識は必ず scanner 側のブラウザ内で完了する。** ネットワークに出るのは認識結果だけ。
1 台/2 台の違いは「EventBus がメモリ内か WebSocket か」に閉じているため、
ゲームロジックからは透過になっている。

サーバーはゲームの状態を一切持たない中継役に徹する。だから Wi-Fi が切れても
表示端末側の進行は失われず、`WebSocketBus` の自動再接続で復帰できる。

## 2. ディレクトリ構成

```
packages/
  vision/       SheetDetector — 用紙検出・射影変換・マス切り出し
  recognition/  CharRecognizer — 文字認識（+ 全実装共通の契約テスト）
  core/         ゲームロジック（純粋 TS・DOM 非依存）
  protocol/     端末間メッセージ（zod）と EventBus
apps/
  server/       Hono + @hono/node-server + ws
  web/          React SPA（?role= で display / scanner / solo）
```

依存の向きは `vision → recognition → core → web` の一方向。
`core` は DOM も認識器の実装も知らないので、Node 上でそのままテストできる。

## 3. 技術スタック

| レイヤ | 採用 | 理由 |
|---|---|---|
| 言語 | TypeScript (strict, `noUncheckedIndexedAccess`) | 契約を型で固める方針の中心 |
| ビルド | Vite + npm workspaces | 設定が軽く HMR が速い |
| UI | React 19 | HUD・図鑑・メニューは DOM が最適 |
| ゲーム描画 | CSS / SVG アニメ + Web Animations API | 依存ゼロで十分な演出になる。描画は `BattleStage` に閉じているので、足りなくなったら PixiJS v8 に差し替えられる |
| 状態管理 | `core` の純粋 reducer + React hooks | バトルはターン制ステートマシン。乱数も state に持たせて完全に決定論的 |
| サーバー | Hono + `ws` | 静的配信・WS・セーブ API だけなので軽量で足りる |
| バリデーション | zod | 端末間メッセージの実行時検証 |
| 画像処理（予定） | OpenCV.js（遅延ロード） | 用紙の輪郭検出・射影変換 |
| 推論（予定） | TensorFlow.js | 対象は 96×96・数十〜100 クラスの小型 CNN。onnxruntime-web は WASM だけで既定 ~20MB と過大。IF 越しなので後から差し替え可能 |
| テスト | Vitest + Playwright | E2E はダミー認識で決定論的に回す |

## 4. 交換可能な認識パイプライン

これがこのプロジェクトの設計上の中心。パイプラインを **2 つの独立した IF** に割っている。

```
カメラフレーム → [SheetDetector] → CellImage[] → [CharRecognizer] → CellResult[]
                  用紙検出/切り出し               文字認識
```

片方だけ差し替えられることが重要（例: 用紙検出はそのままで認識器だけ入れ替える）。

### 4.1 `GrayImage` — DOM に依存しない画像表現

`ImageBitmap` や `ImageData` をあえて使わず、`{ width, height, data: Uint8ClampedArray }` にしている。

- Node 上のユニットテスト・契約テストで生成／検証できる
- Worker へ転送するときに structured clone が効く
- 認識器の実装（kNN / CNN / WASM）がどれも同じ入力を前提にできる

### 4.2 `CharRecognizer`

```ts
interface CharRecognizer {
  readonly id: string;
  readonly capabilities: RecognizerCapabilities;
  init(onProgress?: (ratio: number) => void): Promise<void>;
  recognize(cells: readonly CellImage[], options?: RecognizeOptions): Promise<readonly CellResult[]>;
  dispose(): Promise<void>;
}
```

`capabilities` は飾りではなく、アプリの挙動を決めるのに実際に使う。

| フィールド | 使われ方 |
|---|---|
| `supportedScripts` | 必要な文字種を扱えない実装は `resolve()` が選ばない |
| `typicalLatencyMs` | バトルの詠唱アニメの尺を決める |
| `supportsQualityScore` | false なら「うつくしさ」ステータスを UI から隠す |
| `runsOffline` | **false の実装は明示的な許可なしに生成できない**（`RecognizerRegistry` が拒否する）|
| `maxCellsPerCall` | 超えたら実装は例外を投げる契約 |

### 4.3 `charset` の意味（ハード制約）

`RecognizeOptions.charset` は候補の出力空間を**限定する**。指定した場合、実装はその集合内の文字だけを返さなければならない。

- **適する例**: ミニゲーム「おなじもじさがし」のように、出題した数文字のいずれかであることが確定していて、判定が yes/no でよい場面。精度が上がる。
- **適さない例**: バトルで「か行を書け」と指示している場面。集合外の字を書いても集合内の最も近い字に丸められ、「それは さ だよ」と教えられなくなる。**この場合は charset を渡さず全文字で認識し、正誤判定はゲーム側で行う。**

現在のバトル実装は後者の方針を取っている（`judgeCell()` が属性を見て判定する）。

### 4.4 契約テスト

`packages/recognition/src/contract.spec.ts` が `CharRecognizer` IF の実質的な仕様書。
実装ごとの差（「対象文字を書いた状態をどう作るか」）だけを `RecognizerContractHarness` で注入させ、
検証項目は全実装で共有する。

検証している不変条件:

- 入力マスと同数・同じ index の結果を返す
- 未記入マスには候補を返さない
- 候補は confidence の厳密な降順で、値は 0..1
- 候補は必ず 1 文字
- `topK` を超えない
- `charset` 指定時は必ずその集合内の文字だけを返す
- `supportsQualityScore` が true なら認識できたマスに `quality` が付く
- `maxCellsPerCall` 超過で例外
- 中断済み `AbortSignal` で例外
- `dispose()` 後に再 `init()` できる

**新しい認識器を追加したら、必ずここに harness を足して緑にすること。**
これが通れば、ゲーム側は無変更で差し替えられる。

### 4.5 実装ロードマップ

| 実装 | 時期 | 内容 |
|---|---|---|
| `DummyRecognizer` | **実装済み** | 画面の五十音パレットから入力。決定論的な擬似乱数で confidence を生成。`errorRate` で誤認識もシミュレートできる |
| `TemplateRecognizer` | M3 | 子供本人の字を各文字数枚登録し、正規化画像の kNN。外部データ不要で実物の紙が即動く |
| `TfjsCnnRecognizer` | M6 | ETLCDB 等で学習した小型 CNN を tfjs で推論 |
| `CloudOcrRecognizer` | 任意 | 既定オフ。有効化時は送信前警告必須 |

## 5. 端末間プロトコル

```ts
interface EventBus {
  send(message: ClientMessage): void;
  subscribe(handler: (message: ServerMessage) => void): () => void;
  close(): void;
  readonly connected: boolean;
}
// InMemoryBus (solo) / WebSocketBus (display, scanner)
```

| 方向 | 種別 | 内容 |
|---|---|---|
| scanner → display | `scan.result` | 認識結果（**画像は含まない**） |
| scanner → display | `scan.preview` | 検出状態のヒントのみ |
| display → scanner | `prompt.set` | いま何を書けばいいか |
| display → scanner | `feedback` | 判定結果（振動・効果音の同期用） |
| both | `room.join` / `room.state` | 4 桁コードでのペアリング |

`InMemoryBus` は送信をマイクロタスクに逃がしている（同期配送だと reducer が再入するため）。
`WebSocketBus` は指数バックオフで自動再接続し、切断中のメッセージをキューに積んで復帰時に流す。

## 6. HTTPS が必須である理由

`getUserMedia()` は secure context でしか動かない。`localhost` は例外だが、
**2 台モードでスマホから LAN の IP にアクセスすると HTTP では必ずカメラがブロックされる。**

`npm run setup:cert` が mkcert を使って `localhost` と LAN アドレスを含む証明書を発行する。
サーバーと Vite dev サーバーの両方が `apps/server/certs/` を自動的に拾う。
スマホ側のルート CA 導入手順は [setup-mobile.md](setup-mobile.md)。

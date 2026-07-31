# ロードマップ

| M | 内容 | 完了条件 | 状態 |
|---|---|---|---|
| **M0** | モノレポ基盤。Vite / TS strict / Vitest / Hono サーバー / mkcert スクリプト | LAN 経由でスマホからアクセスできる | ✅ 完了 |
| **M1** | `protocol` の型、`core` のバトル reducer、`DummyRecognizer` + `DummySheetDetector`、solo モードでバトル 1 本が通る | Vitest でバトルロジック、Playwright で通しプレイが緑 | ✅ 完了 |
| **M2** | 2 台モード。`WebSocketBus`、ルームコード、scanner 画面 | スマホ側の入力が PC 側のバトルに反映される | ✅ 完了（カメラ映像表示と `ManualCropDetector` を除く）|
| **M3** | カメラ実装。`ContourSheetDetector`（OpenCV.js）＋ `TemplateRecognizer` ＋ `tools/sheet-gen` | **印刷した用紙に実際に書いた文字**でバトルが成立する | ⏳ 次 |
| **M4** | 育成・進化の演出、ワールドマップ、KanjiVG 筆順アニメ、モジモンのアセット差し替え | 図鑑が埋まっていく体験が完成 | |
| **M5** | ミニゲーム 3 本（もじあつめ／しりとりロード／おなじもじさがし）、単語辞書 | | |
| **M6** | `TfjsCnnRecognizer`（学習は `tools/train`）。契約テストをパスさせて差し替え | 本人の字で Top-1 90%+ | |
| **M7** | 保護者ダッシュボード（学習ログ・苦手文字グラフ）、苦手重点ワークシート PDF、残りのミニゲーム | | |

## いまの状態

M1 の完了条件だった「ダミー認識でバトル 1 本が最後まで通る」は達成済み。
図鑑・育成・進化解放、2 台モードの WebSocket 連携も動いている。

**残っている中心的な作業は M3（カメラと実際の紙）。** ここが入ると本来の体験が揃う。

## M3 の作業内容

1. **`tools/sheet-gen`** — ワークシート PDF 生成（pdf-lib）。仕様は [assets.md](assets.md#5-印刷物ワークシート)
2. **`ManualCropDetector`** — 画面の固定ガイド枠に紙を合わせて撮るだけ。OpenCV 不要の保険として先に作る
3. **`ContourSheetDetector`** — OpenCV.js（遅延ロード）で太枠矩形を輪郭検出 → 射影変換 → `sliceGrid()` でマス切り出し。
   `packages/vision/src/grid.ts` の `sliceGrid()` と `packages/vision/src/image.ts` の `normalizeCell()` は実装済みなので、
   検出器がやるのは「射影変換して正対した矩形にする」ところまで
4. **`TemplateRecognizer`** — 子供本人の字を各文字数枚登録し、`toFloatVector()` した正規化画像の kNN（コサイン距離）。
   ETLCDB の入手を待たずに実物が動く
5. **scanner 画面のカメラ UI** — `getUserMedia` + ガイド枠オーバーレイ + 検出状態の色分け（`scan.preview` の `hint` をそのまま使う）
6. **契約テストへの追加** — `TemplateRecognizer` の harness を `contract.spec.ts` に足す

## 未確定・着手時に確認すること

1. **ETLCDB のライセンス条項**（M6）— 登録制・非商用のみ無料。学習済み重みの取り扱いを確認する
2. **手書き風フォントの選定**（M4）— 無料かつ Web 再配布可のもの
3. **単語辞書の入手元**（M5）— 自作 1500 語 or 公開辞書（ライセンス確認）
4. **PixiJS 導入判断**（M5 時点）— CSS/SVG で演出が足りているか実機で評価する

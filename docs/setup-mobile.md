# スマホをスキャナ端末にする（2 台モード）

## なぜ証明書が要るのか

ブラウザのカメラ API（`getUserMedia`）は **secure context でしか動かない**。
`http://localhost` は例外扱いだが、スマホから `http://192.168.x.x:5173` のように
LAN の IP アドレスでアクセスする場合は secure context にならず、**カメラが必ずブロックされる**。

自己署名の HTTPS 証明書を用意し、それをスマホに信頼させることで解決する。

## 手順

### 1. PC に mkcert を入れる

```bash
# macOS
brew install mkcert
mkcert -install

# Linux — https://github.com/FiloSottile/mkcert#linux
# Windows（管理者権限の PowerShell）
choco install mkcert
mkcert -install
```

### 2. 証明書を発行する

```bash
npm run setup:cert
```

`localhost` と、この PC の LAN アドレスすべてを含む証明書が `apps/server/certs/` に作られる。
（このディレクトリは `.gitignore` 済み。コミットしないこと。）

> **ネットワークが変わったら再実行する。** 別の Wi-Fi につなぐと LAN アドレスが変わり、
> 古い証明書はそのアドレスをカバーしていない。

### 3. スマホにルート CA を入れる

CA ファイルの場所を調べる:

```bash
mkcert -CAROOT
# → 例: /Users/you/Library/Application Support/mkcert
```

このディレクトリの `rootCA.pem` をスマホに送る（AirDrop、メール添付、USB など）。

#### iOS

1. `rootCA.pem` を開く → 「プロファイルがダウンロードされました」
2. **設定 → 一般 → VPN とデバイス管理** → ダウンロードしたプロファイルをインストール
3. **設定 → 一般 → 情報 → 証明書信頼設定** → mkcert の証明書のスイッチをオンにする

> 3 番目の手順を飛ばすと、インストールしただけでは信頼されない。ここでつまずきやすい。

#### Android

1. `rootCA.pem` を端末に保存
2. **設定 → セキュリティ → 暗号化と認証情報 → 証明書のインストール → CA 証明書**
3. 警告を確認して選択

> Android 7 以降、アプリによってはユーザー追加の CA を信用しない。Chrome は信用する。

### 4. 起動してつなぐ

```bash
npm run dev
```

PC のターミナルに LAN アドレスが表示される。

1. **PC**: `https://localhost:5173/?role=display` を開く → 画面右上に 4 桁のルームコードが出る
2. **スマホ**: `https://<LAN アドレス>:5173/?role=scanner&room=<4桁>` を開く
   （PC 画面に完全な URL が表示されているので、それを見ながら入力する）
3. スマホ側に「せつぞくちゅう」と出れば成功

## うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| スマホで「保護されていない通信」の警告が出る | ルート CA が入っていないか、iOS で「証明書信頼設定」をオンにしていない |
| カメラが起動しない | URL が `https://` になっているか確認。`http://` では必ずブロックされる |
| PC には繋がるがスマホから開けない | PC のファイアウォールが 5173 / 8787 を塞いでいる。同じ Wi-Fi にいるかも確認する |
| Wi-Fi を変えたら繋がらなくなった | `npm run setup:cert` を再実行して証明書を作り直す |
| どうしても証明書を入れられない | Chrome の `chrome://flags/#unsafely-treat-insecure-origin-as-secure` に `http://<LAN アドレス>:5173` を登録する（開発用の回避策。常用しないこと） |

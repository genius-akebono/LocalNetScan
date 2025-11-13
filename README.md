# LocalNetScan

ローカルネットワークスキャナー - Python Flask アプリケーション

## 概要

LocalNetScanは、自分のPCが属しているローカルネットワーク（192.168.x.x）内の全サブネットを自動検出し、生存ホストをスキャンするWebアプリケーションです。

### 主な機能

- **自動サブネット検出**: 192.168.x.x の全サブネットを自動検出
- **Pingスキャン**: nmap -sn を使用して生存ホストを検出
- **詳細ポートスキャン**: 各ホストに対して nmap -sT -sV でポートスキャンを実行
- **リアルタイムUI**: スキャン進捗状況をリアルタイムで表示
- **結果の可視化**: ホスト情報、ポート情報を表形式で表示

## システム要件

- Python 3.7 以上
- nmap がシステムにインストールされていること
- Linux、macOS、または Windows（WSL）環境

## インストール

### 1. Nmapのインストール

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install nmap
```

#### macOS
```bash
brew install nmap
```

#### Windows
[https://nmap.org/download.html](https://nmap.org/download.html) からダウンロードしてインストール

### 2. Pythonパッケージのインストール

```bash
cd LocalNetScan
pip install -r requirements.txt
```

または、仮想環境を使用する場合：

```bash
python3 -m venv venv
source venv/bin/activate  # Windowsの場合: venv\Scripts\activate
pip install -r requirements.txt
```

## 使用方法

### 1. アプリケーションの起動

```bash
python3 app.py
```

または、root権限で実行（SYNスキャンを使用する場合）：

```bash
sudo python3 app.py
```

### 2. ブラウザでアクセス

アプリケーションが起動したら、ブラウザで以下のURLにアクセスします：

```
http://127.0.0.1:5000
```

### 3. スキャンの実行

- アプリケーション起動時に自動的に初回スキャンが実行されます
- 「再スキャン」ボタンをクリックすることで、再度スキャンを実行できます

### 4. ポートスキャン

- スキャン結果の各ホストに「ポートスキャン」ボタンが表示されます
- ボタンをクリックすると、そのホストに対して詳細なポートスキャンが実行されます
- ポートスキャン結果はモーダルウィンドウで表示されます

## プロジェクト構造

```
LocalNetScan/
├── app.py              # Flaskアプリケーションのメインファイル
├── scanner.py          # ネットワークスキャン機能モジュール
├── requirements.txt    # Python依存関係
├── README.md          # このファイル
├── templates/         # HTMLテンプレート
│   └── index.html
└── static/            # 静的ファイル（CSS、JS）
    ├── style.css
    └── script.js
```

## API エンドポイント

### POST /api/scan
ネットワークスキャンを開始します。

**レスポンス例:**
```json
{
  "status": "success",
  "message": "スキャンを開始しました"
}
```

### GET /api/scan-status
スキャンの進捗状況を取得します。

**レスポンス例:**
```json
{
  "is_scanning": true,
  "scan_progress": 50,
  "current_subnet": "192.168.0.0/24"
}
```

### GET /api/results
スキャン結果を取得します。

**レスポンス例:**
```json
{
  "hosts": {
    "192.168.0.1": {
      "hostname": "router.local",
      "state": "up",
      "vendor": "",
      "subnet": "192.168.0.0/24"
    }
  },
  "total": 1
}
```

### POST /api/port-scan/{host}
指定されたホストに対してポートスキャンを実行します。

**リクエストボディ例:**
```json
{
  "arguments": "-sT -sV"
}
```

**レスポンス例:**
```json
{
  "status": "success",
  "data": {
    "host": "192.168.0.1",
    "ports": [
      {
        "port": 80,
        "protocol": "tcp",
        "state": "open",
        "service": "http",
        "version": "Apache 2.4",
        "product": "Apache httpd"
      }
    ]
  }
}
```

## セキュリティに関する注意事項

### ⚠️ 重要な警告

1. **法的責任**
   - ネットワークスキャンは、自分が管理しているネットワークに対してのみ実行してください
   - 許可なく他者のネットワークをスキャンすることは、法律に違反する可能性があります

2. **アクセス制限**
   - デフォルトでは、アプリケーションは `127.0.0.1`（ローカルホスト）でのみ動作します
   - 本番環境では、認証機能を追加することを強く推奨します
   - `app.py` の `limit_remote_addr()` 関数でアクセス制限を有効にしてください

3. **root権限**
   - ポートスキャンで `-sS`（SYNスキャン）を使用する場合、root権限が必要です
   - root権限なしで実行する場合は、自動的に `-sT`（TCPコネクトスキャン）に切り替わります

4. **ネットワークへの影響**
   - スキャンは対象ネットワークに負荷をかける可能性があります
   - スキャン頻度を適切に管理してください

5. **機密情報**
   - スキャン結果には機密情報が含まれる可能性があります
   - 結果の取り扱いには十分注意してください

## トラブルシューティング

### nmapが見つからないエラー

```
nmap command not found
```

**解決方法**: システムにnmapをインストールしてください（上記のインストール手順を参照）

### 権限エラー

```
Permission denied
```

**解決方法**:
- SYNスキャンを使用する場合は、sudoで実行してください
- または、TCPコネクトスキャン（-sT）を使用してください

### ポートが既に使用されているエラー

```
Address already in use
```

**解決方法**:
- ポート5000が既に使用されている場合は、`app.py` の `app.run()` でポート番号を変更してください

## ライセンス

このプロジェクトは教育目的で作成されています。商用利用する場合は、適切なライセンスを追加してください。

## 貢献

バグ報告や機能リクエストは、GitHubのIssuesで受け付けています。

## 免責事項

このソフトウェアは「現状のまま」提供され、いかなる保証もありません。使用によって生じた損害について、開発者は一切の責任を負いません。

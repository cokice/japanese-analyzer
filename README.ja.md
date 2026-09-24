<p align="center">
  <img src="./public/logo/logo-text.png" alt="日本語文章解析" width="340" />
</p>

<p align="center">
  <b>日本語の文を、一語ずつ読み解く。</b><br />
  分かち書き・ふりがな・意味・翻訳を、ワンクリックで。
</p>

<p align="center">
  <a href="https://nihongodemo.howen.ink/">オンラインで試す</a> ·
  <a href="https://doc.howen.ink/">ドキュメント</a> ·
  <a href="#クイックスタート">ローカルで起動</a> ·
  <a href="#ai-エージェントでデプロイ">AIでデプロイ</a>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg" /></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb" />
  <a href="https://linux.do/"><img alt="LINUX DO" src="https://img.shields.io/badge/LINUX%20DO-%E6%96%B0%E7%9A%84%E7%90%86%E6%83%B3%E5%9E%8B%E7%A4%BE%E5%8C%BA-f8c12c" /></a>
</p>

<p align="center">
  <a href="README.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.en.md">English</a> · <a href="README.ko.md">한국어</a> · 日本語
</p>

![解析結果と辞書の解説](./docs/images/app-home.png)

> 画面は簡体字中国語・繁体字中国語・英語・韓国語に対応しています（日本語の画面はありません）。右上の地球アイコンで切り替えられます。

## できること

**文を読む**
- 日本語を入力または貼り付けると、語ごとにふりがな・ローマ字・品詞を表示し、文全体の翻訳も表示します
- 語をクリックすると、その文の中での意味・用法・活用・例文を確認できます
- 複数の語をドラッグして（解説画面のボタンからも選べます）文法形式や慣用表現をまとめて解説。誤って分割された語はワンクリックで結合できます

**便利な機能**
- トップページの「今日の一文」は日本時間で毎日更新。クリックするとそのまま解析します
- 長文は分割して解析。Web ページや Markdown を貼り付けると書式とリンクを自動で除去します
- 画像の文字認識：スクリーンショットをアップロードまたは貼り付けて日本語を抽出
- 読み上げ（Edge TTS / Gemini TTS）と、表示中の文を踏まえて答える AI 日本語アシスタント

**インターフェース**
- 画面・翻訳・解説の言語をまとめて切り替え
- ライト / ダークモード、パソコンとスマートフォンの両方に対応
- 最近の解析履歴はブラウザに保存されます

<table>
  <tr>
    <td width="62%"><img src="./docs/images/app-dark.png" alt="ダークモード" /></td>
    <td width="38%"><img src="./docs/images/mobile-chat.png" alt="スマートフォンでの AI 日本語アシスタント" /></td>
  </tr>
</table>

## モデル

| 用途 | デフォルト | 選択可能 |
| --- | --- | --- |
| 解析・翻訳・解説 | DeepSeek `deepseek-flash` | Gemini `gemini-flash-latest` / `gemini-flash-lite-latest` |
| 画像の文字認識 | 選択中のテキストモデルと同じ | — |
| 読み上げ | Edge TTS | Gemini TTS（Gemini キーが必要） |

サーバーに設定したキーはすべての訪問者が共有します。ユーザーは設定画面で自分のキーを入力することもでき、キーはそのブラウザに保存され、リクエスト時に本アプリのサーバーを経由してモデル提供元へ送られます。

## クイックスタート

Node.js 22 が必要です。

```bash
git clone https://github.com/cokice/japanese-analyzer.git
cd japanese-analyzer
npm ci
cp .env.example .env.local   # Windows：Copy-Item .env.example .env.local
```

`.env.local` にキーを 1 つ以上設定してから起動します：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
```

```bash
npm run dev
```

<http://localhost:3000> を開きます。同じネットワークのスマートフォンから試すには、`npm run dev -- --hostname 0.0.0.0` で起動して `http://パソコンのIP:3000` を開いてください。

## 環境変数

| 変数 | 説明 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 推奨。デフォルトの解析・翻訳・画像認識 |
| `GEMINI_API_KEY` | 任意。Gemini テキストモデル・画像認識・Gemini TTS |
| `DEEPSEEK_API_URL` / `GEMINI_API_URL` | 任意。OpenAI 互換エンドポイント。空欄なら公式のもの |
| `CODE` | 任意。アクセス用パスワード。空欄ならパスワードなし |
| `NEXT_PUBLIC_UMAMI_SRC` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | 任意。両方設定すると Umami 解析が有効になります |

キーはサーバー側だけで使われ、ブラウザには送られません。「今日の一文」はサーバーのキーで生成し、未設定の場合は内蔵の例文を表示します。

<details>
<summary>Umami が記録する内容</summary>

機能の利用有無、使用したプロバイダーとモデル、成功か失敗か、所要時間のみを記録します。原文・翻訳・チャット内容・画像・元のエラーメッセージ・API キーは**含みません**。

- 利用イベント：`analyze_sentence`、`image_text_extract`、`tts_speech`、`word_detail_click`
- 解析結果：`analyze_success`、`analyze_error`、`analyze_cancel`（`duration_ms`・`first_result_ms` を含む。失敗時は `error_category` のみ）
- チャット：`chat_send`、`chat_success`、`chat_error`

</details>

## デプロイ

### AI エージェントでデプロイ

次の一文を Claude Code、Codex、Cursor などの AI コーディングアシスタントに送ってください。デプロイ先と必要なキーを確認してから、インストールと動作確認を行い、アクセス先の URL を教えてくれます：

```text
https://raw.githubusercontent.com/cokice/japanese-analyzer/master/docs/agent-deploy.md を読んで、その手順どおりに japanese-analyzer をデプロイしてください。
```

Linux サーバー（Docker。ドメインと HTTPS の設定も可能）、Vercel、ローカル環境に対応しています。エージェントが従う手順は [docs/agent-deploy.md](./docs/agent-deploy.md) にあります。

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cokice/japanese-analyzer)

リポジトリをインポートし、`Settings → Environment Variables` に環境変数を設定して再デプロイします。

### Docker

`howenhowen/japanese-analyzer` イメージは `amd64` と `arm64` に対応し、コンテナはポート `3002` で待ち受けます。

```bash
cp .env.production.example .env.production   # キーを設定
docker compose -f docker-compose.hub.yml up -d
```

最新版への更新：

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

<details>
<summary>Compose を使わずに docker run で起動</summary>

```bash
docker run -d \
  --name japanese-analyzer \
  --restart unless-stopped \
  -p 3002:3002 \
  -e DEEPSEEK_API_KEY="your_deepseek_api_key" \
  -e GEMINI_API_KEY="" \
  -e CODE="" \
  howenhowen/japanese-analyzer:latest
```

更新するときは新しいイメージを `docker pull` し、`docker rm -f japanese-analyzer` で古いコンテナを削除してから、上のコマンドをもう一度実行します。

</details>

## 開発

```bash
npm run dev          # 開発サーバー
npm test             # ユニットテストと API テスト
npm run lint         # コードチェック
npx tsc --noEmit     # 型チェック
npm run build        # 本番ビルド
```

不具合や提案は [Issue](https://github.com/cokice/japanese-analyzer/issues) へどうぞ。Pull Request も歓迎します。解析の不具合を報告するときは、プロバイダー・モデル・画面の言語・再現できる入力例を添えてください。API キーは含めないでください。

## 謝辞

[LINUX DO](https://linux.do/) コミュニティの支援に感謝します。

## ライセンス

本プロジェクトは、`mit-final` の後に行われるライセンス変更コミット以降、プロジェクト全体として [GNU AGPL v3（第3版のみ、AGPL-3.0-only）](./LICENSE) のもとで配布されます。

`mit-final`（`fb57ddc`）を含む、すでに MIT で公開されたコードの利用許諾は引き続き有効です。[従来の MIT ライセンス](./LICENSES/MIT-legacy.txt)、[ライセンスとデプロイに関する説明](./LICENSING.md)、[著作権表示](./NOTICE)をご確認ください。

AGPL は商用利用を認めています。対象作品の配布や、変更したバージョンをネットワーク経由で提供する場合は、ライセンスの条件に従い対応するソースコードを提供してください。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=cokice/japanese-analyzer&type=Date)](https://www.star-history.com/#cokice/japanese-analyzer&Date)

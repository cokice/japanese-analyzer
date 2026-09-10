# 日本語文章解析

🌐 **言語 / Language:** [简体中文](README.md) | [日本語](README.ja.md)

中国語を母語とする日本語学習者向けの文章解析ツールです。日本語の文章を入力すると、単語、かな、ローマ字、品詞、文全体の中国語訳、語句の詳しい解説を確認できます。画像からの文字抽出、読み上げ、AI日本語アシスタントにも対応しています。

[オンラインで試す](https://nihongodemo.howen.ink/) · [オンラインドキュメント](https://doc.howen.ink/)

## 画面プレビュー

### メイン画面・解析と辞書

![日本語の解析・中国語訳・単語の解説](./docs/images/app-home.png)

### ダークモード

![ダークモードの解析と辞書](./docs/images/app-dark.png)

### モデルと API の設定

![モデルと API の設定](./docs/images/provider-settings.png)

### モバイル版 AI 日本語アシスタント

<p align="center">
  <img src="./docs/images/mobile-chat.png" alt="現在の文章に合わせた文法解説" width="390" />
</p>

## 主な機能

- 日本の学校文法に基づく単語分割、品詞、かな、ローマ字の表示。
- 単語をクリックして、中国語の意味、活用、文中での役割、例文を確認。
- 段落と改行を保った中国語訳。
- 画像のアップロードや貼り付けによる日本語OCR。
- Edge TTS / Gemini TTSによる読み上げ。
- 文法、語彙、文化などを質問できるAI日本語アシスタント。
- DeepSeek / Geminiの切り替えと、ブラウザに保存するプロバイダー別APIキー設定。
- ライト、ダーク、システム設定に合わせるテーマ。
- 任意のアクセスパスワードとUmami利用統計。
- Vercel、Docker Compose、Docker Hubイメージによるデプロイ。

## モデル

| 用途 | モデル / サービス | 説明 |
| --- | --- | --- |
| DeepSeekのテキスト処理 | `deepseek-flash` | デフォルトのプロバイダー。V4.1 Flashを使用し、思考モードはデフォルトで無効。 |
| Geminiのテキスト処理 | `gemini-flash-latest` / `gemini-flash-lite-latest` | 設定で切り替え可能。推論レベルはFlashがLow、Flash-LiteがMinimal。 |
| 画像OCR | `deepseek-flash` / 選択したGeminiモデル | DeepSeekはテキスト処理と同じモデルを使用。OCRの思考モードは無効。 |
| 読み上げ | Edge TTS / `gemini-3.1-flash-tts-preview` | デフォルトはEdge TTS。Gemini TTSにはGemini APIキーが必要。 |

## ローカルで起動

Dockerイメージと同じNode.js 22の利用を推奨します。

```bash
git clone https://github.com/cokice/japanese-analyzer.git
cd japanese-analyzer
npm ci
```

macOS / Linuxでは環境変数のテンプレートをコピーします。

```bash
cp .env.example .env.local
```

Windows PowerShellでは次のコマンドを使います。

```powershell
Copy-Item .env.example .env.local
```

`.env.local`に`DEEPSEEK_API_KEY`を設定すると、デフォルトのテキスト解析と画像OCRを利用できます。Geminiを使う場合は`GEMINI_API_KEY`も設定してください。

```bash
npm run dev
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)を開きます。

## 環境変数

| 変数 | 用途 |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeekのテキスト処理と画像OCR用のサーバー側APIキー。 |
| `DEEPSEEK_API_URL` | DeepSeekのOpenAI互換エンドポイント。空欄なら公式の既定値を使用。 |
| `GEMINI_API_KEY` | Geminiのテキスト処理、画像認識、Gemini TTS用のサーバー側APIキー。 |
| `GEMINI_API_URL` | GeminiのOpenAI互換エンドポイント。空欄なら公式の既定値を使用。 |
| `CODE` | 任意のアクセスパスワード。空欄ならパスワード入力は不要。 |
| `NEXT_PUBLIC_UMAMI_SRC` | 任意のUmamiスクリプトURL。 |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | UmamiのWebsite ID。スクリプトURLと両方を設定すると有効。 |

サーバー側のAPIキーはフロントエンドに公開されません。ユーザー独自のキーは設定画面からブラウザに保存でき、API呼び出し時に本アプリのサーバーへ送信されます。接続先URLはサーバー側で設定します。Gemini TTSは独立した公式音声APIを利用するため、`GEMINI_API_URL`の変更は反映されません。

Umamiは実行時の環境変数から読み込まれます。機能の利用とモデルなどのメタデータを記録し、入力文章、画像、翻訳結果、APIキーはイベントに含めません。ローカル環境変数ファイルはGitの管理対象外です。

解析の結果は `analyze_success` / `analyze_error` / `analyze_cancel` として、1回につき1つの終了イベントを記録します。チャットは `chat_send` / `chat_success` / `chat_error` を記録します。終了イベントにはプロバイダー、モデル、ストリーミングの有無、処理時間 `duration_ms`、表示可能な内容が届いた場合の初回表示時間 `first_result_ms`（いずれもミリ秒）を含みます。非ストリーミング解析では初回表示時間は全結果の受信時点であり、独立した翻訳・辞書の処理時間は含みません。エラーは固定の分類名、解析の中止は停止・新規リクエストへの置換・画面の終了の区分のみを送信します。原文、チャットの質問・回答、エラー本文、APIキーは送信しません。

## Vercelにデプロイ

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cokice/japanese-analyzer)

1. リポジトリをForkするか、VercelにImportします。
2. プロジェクトの`Settings → Environment Variables`で`DEEPSEEK_API_KEY`を設定します。
3. Geminiを使う場合は`GEMINI_API_KEY`、アクセスパスワードが必要な場合は`CODE`も設定します。
4. 必要に応じてUmamiの2つの変数を設定し、デプロイします。

## Dockerでデプロイ

Docker Hubイメージ`howenhowen/japanese-analyzer:latest`は`linux/amd64`と`linux/arm64`に対応しています。リポジトリのルートで次を実行します。

```bash
cp .env.production.example .env.production
# .env.productionを編集し、必要なAPIキーを設定
docker compose -f docker-compose.hub.yml up -d
```

Windows PowerShellではテンプレートのコピーに`Copy-Item .env.production.example .env.production`を使います。

ホストとコンテナのポートはどちらも`3002`です。起動後は`http://サーバーのIP:3002`にアクセスします。更新は次のコマンドで行います。

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

`docker run`の例やAI Agent向けのデプロイ手順は[中国語README](README.md)を参照してください。

## 開発コマンド

```bash
npm run dev          # 開発サーバー
npm test             # APIとプロバイダー設定のテスト
npm run build        # 本番ビルド
npm start            # ビルド済みアプリの本番サーバー
npx tsc --noEmit      # 型チェック
npx eslint app tests # アプリとテストの静的検査
```

## 貢献・お問い合わせ

不具合は再現手順を添えてIssueでお知らせください。機能提案やPull Requestも歓迎します。大きな変更は、実装前にIssueで相談してください。

## 謝辞

[LINUX DO](https://linux.do/)コミュニティの支援に感謝します。

## ライセンス

本プロジェクトは[MIT License](./LICENSE)のもとで公開されています。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=cokice/japanese-analyzer&type=Date)](https://www.star-history.com/#cokice/japanese-analyzer&Date)

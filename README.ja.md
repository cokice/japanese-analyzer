# 日本語文章解析

🌐 [简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

簡体字中国語・繁体字中国語・英語・韓国語に対応した日本語学習者向けの文章解析ツールです。日本語の文章を入力すると、単語、かな、ローマ字、品詞、文全体の翻訳、語句の詳しい解説を確認できます。画像からの文字抽出、読み上げ、AI日本語アシスタントにも対応しています。

[オンラインで試す](https://nihongodemo.howen.ink/) · [オンラインドキュメント](https://doc.howen.ink/)

## 画面プレビュー

以下の画像は簡体字中国語の画面です。アプリ右上の地球アイコンで言語を変更できます。

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
- 右上の地球アイコンから簡体字中国語・繁体字中国語・English・한국어を選択。画面、翻訳、語句の解説、AIの回答に反映され、ブラウザに保存されます。
- 繁体字中国語は文字の置換だけでなく、自然な語彙と表現を使用します。日本語の原文、読み、例文はそのまま保持し、既存のチャット履歴は元の言語、新しい回答は選択した言語で表示します。
- 単語をクリックして、選択した言語で意味、活用、文中での役割、例文を確認。
- 段落と改行を保った翻訳。言語の切り替え時には再翻訳します。
- テキストの貼り付け時に、Webページの装飾、Markdown書式、リンク先URLを除去し、リンクの表示文字と段落・改行を残します。単独のURLも除去します。画像の貼り付けによるOCRは引き続き利用できます。
- 長文を分割して解析します。入力に残っているURLはアプリ側で保持し、長い符号化文字列をモデルに再生成させません。完成した結果は原文との一致を確認し、省略された空白を補います。
- 画像のアップロードや貼り付けによる日本語OCR。
- Edge TTS / Gemini TTSによる読み上げ。音声設定メニューはボタンの下に開きます。
- 文法、語彙、文化などを質問できるAI日本語アシスタント。
- DeepSeek / Geminiの切り替えと、ブラウザに保存するプロバイダー別APIキー設定。
- ライト、ダーク、システム設定に合わせるテーマ。
- 任意のアクセスパスワードとUmami利用統計。
- Vercel、Docker Compose、Docker Hubイメージによるデプロイ。

## モデル

以下は、このリポジトリで設定しているモデル識別子です。

| 用途 | モデル / サービス | 説明 |
| --- | --- | --- |
| DeepSeekのテキスト処理 | `deepseek-flash` | デフォルトのプロバイダー。思考モードは無効で、設定画面での切り替えは現在利用できません。 |
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

同じLAN内の別の端末から試す場合は、次のように起動します。

```bash
npm run dev -- --hostname 0.0.0.0 --port 3100
```

別の端末で `http://<パソコンのLAN内IP>:3100` を開いてください。

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

同じ環境変数ファイルでコンテナを直接起動する場合は、次のコマンドを使用します。

```bash
docker run -d --name japanese-analyzer --restart unless-stopped \
  --env-file .env.production -p 3002:3002 \
  howenhowen/japanese-analyzer:latest
```

ログは `docker compose -f docker-compose.hub.yml logs -f` で確認できます。AI Agent向けの追加デプロイ手順は[簡体字中国語README](README.md)を参照してください。

## 開発コマンド

```bash
npm run dev          # 開発サーバー
npm test             # API・多言語・解析・貼り付けの回帰テスト
npm run lint         # リポジトリの静的検査
npm run build        # 本番ビルド
npm start            # ビルド済みアプリの本番サーバー
npx tsc --noEmit      # 型チェック
```

## トラブルシューティング

- コピーした記事の解析に失敗した場合は、もう一度貼り付けて書式とリンク先URLを除去してください。解決しない場合は、プロバイダー、モデル、画面の言語、再現できる入力例をIssueに記載してください。APIキーは含めないでください。
- 言語設定はブラウザごとに保存されます。地球アイコンから変更でき、ブラウザの翻訳機能を使う必要はありません。

## 貢献・お問い合わせ

不具合は再現手順を添えてIssueでお知らせください。機能提案やPull Requestも歓迎します。大きな変更は、実装前にIssueで相談してください。

## 謝辞

[LINUX DO](https://linux.do/)コミュニティの支援に感謝します。

## ライセンス

本プロジェクトは[MIT License](./LICENSE)のもとで公開されています。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=cokice/japanese-analyzer&type=Date)](https://www.star-history.com/#cokice/japanese-analyzer&Date)

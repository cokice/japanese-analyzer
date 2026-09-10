# Japanese Sentence Analyzer（日本語文章解析器）🈁

🌐 **言語 / Language:** [简体中文](README.md) | [日本語](README.ja.md)

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](#📄-ライセンス)
[![Demo](https://img.shields.io/badge/demo-online-blue.svg)](https://japanese-analyzer-demo.vercel.app/)

> **AI大規模言語モデルを搭載した日本語文の詳細解析ツール**  
> 中国語話者の日本語学習者向けに、Gemini Flash（`gemini-flash-latest`）モデルを使って、構文構造の分析・分解、品詞の注釈、発音と意味の表示を行います。日本語の読解をもっと簡単にします。

---

## ✨ 主な機能

| 機能 | 説明 |
| :-- | :-- |
| 🔍 **スマート構文解析** | 品詞、かな、ローマ字、文法成分をワンクリックで表示 |
| 📚 **多角的な語義解説** | Gemini大規模言語モデルによる正確な中国語訳を提供 |
| 🖼️ **OCR画像認識** | スクリーンショットや写真から日本語テキストを抽出して、そのまま解析 |
| 🔈 **自然な音声によるTTS読み上げ** | Gemini TTS（`gemini-3.1-flash-tts-preview`）を統合し、日本語全文を読み上げ |
| 🔄 **文全体の翻訳** | バイリンガル表示で、文の全体的な意味をすばやく把握 |
| 🌐 **ストリーミング応答** | ストリーミングAPIによる、なめらかな操作感 |
| 🌙 **ダークモード** | ライト、ダーク、システム設定に合わせる3つのテーマに対応 |
| 🔐 **アクセス制御** | 任意のパスワード保護で、個人デプロイ環境を不正利用から保護 |
| ⚙️ **高いカスタマイズ性** | Gemini API Key / Endpointをカスタマイズ可能 |

---

## 🚀 オンラインで試す

ブラウザですぐに試す 👉 **[Demo](https://japanese-analyzer-demo.vercel.app/)**  
中国国内向けのアクセス先 👉 **[国内向けサイト](https://nihongodemo.howen.ink/)**

> 注意：現在のDemoサイトでは無料のAPIキーを使用しているため、動作が不安定になる場合があります。大量利用が必要な場合は、下記の手順でご自身のAPIキーを申請してください（完全無料）。APIキーの不正利用が続いているため、テストサイトでもご自身のAPIキーを設定して利用することをおすすめします。

## 📺 デモ動画

https://github.com/user-attachments/assets/5039cb62-135e-48e1-971d-960d6b82cacf

---

## 🛠️ オンラインデプロイ手順

1. Google AI Studio公式サイト 👉 **[aistudio](https://aistudio.google.com/)** にアクセスします
2. ページ右上の **「Get API Key」** ボタンをクリックします
3. 表示されたウィンドウで既存のプロジェクトを選ぶか、新しいプロジェクトを作成します（完全無料）
4. 作成されたAPIキーをコピーし、安全に保管します
5. 取得したAPIキーは次の用途に使用できます：
   - プロジェクト全体を自分でデプロイする
   - Demoサイト右上の「設定」で自分のAPIキーを設定する

### Vercelへワンクリックデプロイ（推奨）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cokice/japanese-analyzer&env=API_KEY)

1. このリポジトリを自分のGitHubアカウントへ **Fork** します  
2. [Vercel](https://vercel.com/) でリポジトリを **Import** します  
3. *Project Settings › Environment Variables* で環境変数を追加します  
4. 現在はGeminiモデルのみ対応しています。今後、対応モデルを追加する予定です

| 変数名 | 必須 | 説明 |
| :--- | :---: | :--- |
| `API_KEY` | ✅ | Gemini APIキー（上記の手順で取得） |
| `API_URL` | ❌ | カスタムAPIエンドポイント（空欄の場合はデフォルトを使用） |
| `CODE` | ❌ | アクセスパスワード（設定すると、アプリの利用時にパスワードが必要） |

## 🤝 貢献方法

どのような形の貢献も歓迎します！

- 🐛 **バグを報告**：Issuesで再現手順を説明してください  
- 🚀 **機能を提案**：新機能のアイデアや要望を話し合いましょう  
- 💻 **コードを投稿**：Pull Requestを送ってください  

> PRを作成する前に、まずIssueを作成して相談してください。プロジェクトの方向性をそろえるためです。

---

## 📄 ライセンス

本プロジェクトは **[MIT License](LICENSE)** のもとで公開されています。© 2025 Japanese Analyzer

---

## 📬 連絡先

ご質問がある場合は、Issueを作成してご連絡ください。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=cokice/japanese-analyzer&type=Date)](https://www.star-history.com/#cokice/japanese-analyzer&Date)

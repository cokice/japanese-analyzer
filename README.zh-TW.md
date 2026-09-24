<p align="center">
  <img src="./public/logo/logo-text.png" alt="日本語文章解析" width="340" />
</p>

<p align="center">
  <b>日文句子，逐詞讀懂。</b><br />
  斷詞、注音、詞義和翻譯，點一下就清楚。
</p>

<p align="center">
  <a href="https://nihongodemo.howen.ink/">線上體驗</a> ·
  <a href="https://doc.howen.ink/">使用說明</a> ·
  <a href="#快速開始">本機執行</a> ·
  <a href="#讓-ai-agent-部署">讓 AI 幫你部署</a>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg" /></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb" />
  <a href="https://linux.do/"><img alt="LINUX DO" src="https://img.shields.io/badge/LINUX%20DO-%E6%96%B0%E7%9A%84%E7%90%86%E6%83%B3%E5%9E%8B%E7%A4%BE%E5%8C%BA-f8c12c" /></a>
</p>

<p align="center">
  <a href="README.md">简体中文</a> · 繁體中文 · <a href="README.en.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja.md">日本語</a>
</p>

![解析結果與詞典釋義](./docs/images/app-home.png)

## 能做什麼

**讀句子**
- 輸入或貼上日文，逐詞標出假名、羅馬拼音和詞性，下方附上整句翻譯
- 點任何一個詞，查看它在本句的意思、用法、活用和例句
- 拖過幾個詞（或在釋義裡點「選取多個詞」），把文法句型、慣用語當成一個整體來講解；被拆開的詞可以一鍵合併

**更順手**
- 首頁每天一句，依日本時間更新，點一下就開始解析
- 長文分段解析，貼上網頁或 Markdown 時自動去除格式和連結
- 圖片辨識：上傳或直接貼上截圖，擷取其中的日文
- 朗讀原文（Edge TTS / Gemini TTS），以及結合目前句子的 AI 日文助手

**介面**
- 簡體中文、繁體中文、English、한국어，介面、翻譯和釋義一起切換
- 淺色 / 深色，電腦與手機都好用
- 最近的解析紀錄保存在瀏覽器本機

<table>
  <tr>
    <td width="62%"><img src="./docs/images/app-dark.png" alt="深色模式" /></td>
    <td width="38%"><img src="./docs/images/mobile-chat.png" alt="手機上的 AI 日文助手" /></td>
  </tr>
</table>

## 模型

| 用途 | 預設 | 可選 |
| --- | --- | --- |
| 解析、翻譯、釋義 | DeepSeek `deepseek-flash` | Gemini `gemini-flash-latest` / `gemini-flash-lite-latest` |
| 圖片辨識 | 與所選文字模型相同 | — |
| 朗讀 | Edge TTS | Gemini TTS（需要 Gemini 金鑰） |

伺服器設定的金鑰供所有訪客使用；使用者也可以在設定中填入自己的金鑰，保存在自己的瀏覽器裡，請求時經由本應用程式的伺服器轉送給模型服務商。

## 快速開始

需要 Node.js 22。

```bash
git clone https://github.com/cokice/japanese-analyzer.git
cd japanese-analyzer
npm ci
cp .env.example .env.local   # Windows：Copy-Item .env.example .env.local
```

在 `.env.local` 至少填入一組金鑰，然後啟動：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
```

```bash
npm run dev
```

開啟 <http://localhost:3000>。想用手機連線同一區域網路中的開發伺服器，改用 `npm run dev -- --hostname 0.0.0.0`，再開啟 `http://電腦IP:3000`。

## 環境變數

| 變數 | 說明 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 建議。預設的解析、翻譯與圖片辨識 |
| `GEMINI_API_KEY` | 可選。Gemini 文字模型、圖片辨識與 Gemini TTS |
| `DEEPSEEK_API_URL` / `GEMINI_API_URL` | 可選。OpenAI 相容介面網址，留空使用官方網址 |
| `CODE` | 可選。存取密碼，留空則不需要密碼 |
| `NEXT_PUBLIC_UMAMI_SRC` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | 可選。兩者都填寫後啟用 Umami 統計 |

金鑰只在伺服器端使用，不會傳到瀏覽器。「每日一句」使用伺服器金鑰產生，未設定時顯示內建例句。

<details>
<summary>Umami 會記錄什麼</summary>

只記錄功能是否被使用、使用哪個服務商和模型、成功或失敗以及耗時，**不包含**原文、翻譯、聊天內容、圖片、原始錯誤訊息或 API 金鑰。

- 使用事件：`analyze_sentence`、`image_text_extract`、`tts_speech`、`word_detail_click`
- 解析結果：`analyze_success`、`analyze_error`、`analyze_cancel`（含 `duration_ms`、`first_result_ms`，失敗只記錄 `error_category`）
- 聊天：`chat_send`、`chat_success`、`chat_error`

</details>

## 部署

### 讓 AI Agent 部署

把這句話傳給 Claude Code、Codex、Cursor 等 AI 程式助手，它會先詢問要部署到哪裡、需要哪些金鑰，接著完成安裝和驗證，最後告訴你存取網址：

```text
請閱讀 https://raw.githubusercontent.com/cokice/japanese-analyzer/master/docs/agent-deploy.md ，依照裡面的步驟幫我部署 japanese-analyzer。
```

支援部署到 Linux 伺服器（Docker，可選擇設定網域與 HTTPS）、Vercel 或本機。Agent 依循的步驟見 [docs/agent-deploy.md](./docs/agent-deploy.md)。

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cokice/japanese-analyzer)

匯入儲存庫後，在 `Settings → Environment Variables` 填好環境變數，重新部署即可。

### Docker

映像檔 `howenhowen/japanese-analyzer` 支援 `amd64` / `arm64`，容器監聽 `3002` 埠。

```bash
cp .env.production.example .env.production   # 填入金鑰
docker compose -f docker-compose.hub.yml up -d
```

更新到最新版：

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

<details>
<summary>不使用 Compose，直接 docker run</summary>

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

更新時先 `docker pull` 新映像檔，`docker rm -f japanese-analyzer` 刪除舊容器，再執行一次上面的指令。

</details>

## 開發

```bash
npm run dev          # 開發伺服器
npm test             # 單元與介面測試
npm run lint         # 程式碼檢查
npx tsc --noEmit     # 型別檢查
npm run build        # 正式環境建置
```

回報問題或建議請開 [Issue](https://github.com/cokice/japanese-analyzer/issues)，歡迎 Pull Request。回報解析問題時，附上服務商、模型、介面語言和可重現的原文即可，請勿附上 API 金鑰。

## 致謝

感謝 [LINUX DO](https://linux.do/) 社群的支持。

## 授權

本專案自 `mit-final` 之後的授權切換提交起，整體採用 [GNU AGPL v3，僅第 3 版（AGPL-3.0-only）](./LICENSE)。

`mit-final`（`fb57ddc`）及先前以 MIT 發布的程式碼仍保留原有 MIT 授權，詳見 [歷史 MIT 授權條款](./LICENSES/MIT-legacy.txt)、[授權範圍與部署說明](./LICENSING.md)及 [版權聲明](./NOTICE)。

AGPL 允許商業使用；散布適用作品，或修改後透過網路提供服務時，請依授權條款提供對應原始碼。

# 日本語文章解析

🌐 [简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

支援簡體中文、繁體中文、英文及韓文介面的日文學習工具。輸入日文句子，即可查看單字切分、假名、羅馬拼音、詞性、整句翻譯與詳細解說，也能辨識圖片文字、朗讀及向 AI 日文助手提問。

[線上體驗](https://nihongodemo.howen.ink/) · [線上文件](https://doc.howen.ink/)

<p align="center">
  <img src="./public/logo/logo-text.png" alt="日本語文章解析" width="360" />
</p>

## 畫面預覽

以下截圖以簡體中文介面示範。實際使用時，可透過地球圖示切換語言。

![句子解析、翻譯與單字解說](./docs/images/app-home.png)
![深色模式](./docs/images/app-dark.png)
![模型與 API 設定](./docs/images/provider-settings.png)

<p align="center">
  <img src="./docs/images/mobile-chat.png" alt="行動裝置上的 AI 日文助手" width="390" />
</p>

## 功能

- **語言切換：**點選右上角的地球圖示，選擇簡體中文、繁體中文、English 或 한국어。介面、翻譯、單字解說及新的 AI 回覆會使用所選語言，瀏覽器也會記住選擇。繁體中文採用自然、慣用的詞彙與語氣，不只轉換字形。
- **日文解析：**依日本學校文法切分單字，顯示詞性、假名及由程式產生的羅馬拼音。切換介面語言時，日文原文與讀音仍保留日文。
- **單字詳解：**點選單字，查看意思、辭書形、活用、句中的文法角色，以及附有翻譯的例句。
- **整段翻譯：**保留段落與換行；切換語言後會重新翻譯。既有聊天訊息保留原來的語言。
- **純文字貼上：**自動移除網頁樣式、Markdown 格式及連結網址，保留連結顯示的文字與段落換行；單獨出現的網址也會移除。貼上圖片仍可進行文字辨識。
- **長文與連結處理：**長文分段解析；輸入中仍存在的網址由程式保留原樣，避免模型抄寫長串編碼。未完整產生的結果仍會被檢查出來。
- **圖片辨識：**上傳或貼上圖片，使用所選服務商擷取日文文字。
- **朗讀：**支援 Edge TTS 與 Gemini TTS；語音設定選單會向下展開。
- **AI 日文助手：**可詢問文法、單字、文化、學習方法及目前句子的用法。
- **模型設定：**切換 DeepSeek 或 Gemini、設定串流輸出，也可在瀏覽器中分別儲存兩家服務商的 API 金鑰。
- 支援淺色、深色及跟隨系統的主題；可選用存取密碼、Umami 統計，並透過 Vercel 或 Docker 部署。

## 模型

以下為專案設定使用的模型識別名稱。

| 用途 | 模型／服務 | 說明 |
| --- | --- | --- |
| 預設文字服務商 | DeepSeek `deepseek-flash` | 思考模式預設關閉，設定中的切換功能目前暫不開放。 |
| Gemini 文字處理 | `gemini-flash-latest`／`gemini-flash-lite-latest` | 可切換 Flash 或 Flash-Lite；推理等級分別為 Low 與 Minimal。 |
| 圖片文字辨識 | `deepseek-flash`／所選 Gemini 模型 | DeepSeek 與文字解析使用相同模型，圖片辨識固定關閉思考。 |
| 朗讀 | Edge TTS／`gemini-3.1-flash-tts-preview` | 預設使用 Edge TTS；Gemini TTS 需要 Gemini API 金鑰。 |

## 快速開始

請使用 Node.js 22，與 Docker 映像檔一致。

```bash
git clone https://github.com/cokice/japanese-analyzer.git
cd japanese-analyzer
npm ci
cp .env.example .env.local
```

Windows PowerShell 請將最後一行改為 `Copy-Item .env.example .env.local`。

在 `.env.local` 填入 `DEEPSEEK_API_KEY` 即可使用預設服務商；如需 Gemini 文字處理、圖片辨識或朗讀，再填入 `GEMINI_API_KEY`。API 網址留白時會使用內建預設值。

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_API_URL=
GEMINI_API_KEY=
GEMINI_API_URL=
CODE=
NEXT_PUBLIC_UMAMI_SRC=
NEXT_PUBLIC_UMAMI_WEBSITE_ID=
```

```bash
npm run dev
```

開啟 [http://127.0.0.1:3000](http://127.0.0.1:3000)。若要從區域網路中的其他裝置測試：

```bash
npm run dev -- --hostname 0.0.0.0 --port 3100
```

在其他裝置開啟 `http://<電腦的區域網路IP>:3100`。

## 環境變數

| 變數 | 用途 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 伺服器端的 DeepSeek 預設金鑰，用於文字處理及圖片辨識。 |
| `DEEPSEEK_API_URL` | 選用的 OpenAI 相容 API 網址，預設為 `https://api.deepseek.com/chat/completions`。 |
| `GEMINI_API_KEY` | 伺服器端的 Gemini 預設金鑰，用於文字處理、圖片辨識及朗讀。 |
| `GEMINI_API_URL` | 選用的 OpenAI 相容 API 網址，預設為 `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`。 |
| `CODE` | 選用的存取密碼；留白時不要求輸入密碼。 |
| `NEXT_PUBLIC_UMAMI_SRC` | 選用的 Umami 指令碼網址，例如 `https://cloud.umami.is/script.js`。 |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Umami 網站 ID；必須與指令碼網址一起設定，才會載入統計功能。 |

伺服器端金鑰不會公開至前端。使用者也可在右上角的設定中輸入自己的金鑰，儲存在該瀏覽器；發出 API 請求時，金鑰會傳送至本應用程式的伺服器。服務商 API 網址由伺服器設定。Gemini TTS 使用獨立的官方語音 API，不受 `GEMINI_API_URL` 影響。

Umami 會讀取執行時的設定，記錄功能使用、服務商、模型、串流模式、請求耗時、首次顯示結果的時間，以及固定的錯誤或取消分類。事件不包含原文、聊天訊息或回覆、圖片、翻譯、原始錯誤訊息或 API 金鑰。本機環境變數檔案已由 Git 忽略，請勿加入版本控制。

## 部署至 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cokice/japanese-analyzer)

1. Fork 本儲存庫，或匯入至 Vercel。
2. 在 **Settings → Environment Variables** 設定 `DEEPSEEK_API_KEY`，供預設服務商使用。
3. 依需求加入 `GEMINI_API_KEY`、`CODE` 及兩個 Umami 變數。
4. 執行部署；修改環境變數後需重新部署。

## Docker 部署

Docker Hub 映像檔 `howenhowen/japanese-analyzer:latest` 支援 `linux/amd64` 與 `linux/arm64`。在儲存庫根目錄執行：

```bash
cp .env.production.example .env.production
# 編輯 .env.production，填入所需 API 金鑰。
docker compose -f docker-compose.hub.yml up -d
```

Windows PowerShell 使用 `Copy-Item .env.production.example .env.production` 複製範本。主機與容器的連接埠皆為 `3002`，啟動後開啟 `http://<伺服器IP>:3002`。

更新映像檔、重建容器及查看日誌：

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
docker compose -f docker-compose.hub.yml logs -f
```

也可以使用同一份環境變數檔案直接啟動容器：

```bash
docker run -d --name japanese-analyzer --restart unless-stopped \
  --env-file .env.production -p 3002:3002 \
  howenhowen/japanese-analyzer:latest
```

## 開發指令

```bash
npm run dev          # 開發伺服器
npm test             # API、語言、解析及貼上的迴歸測試
npm run lint         # 儲存庫程式碼檢查
npm run build        # 正式環境建置與型別檢查
npm start            # 啟動已完成建置的正式環境服務
npx tsc --noEmit     # 僅執行型別檢查
```

## 疑難排解與參與貢獻

- 貼上的文章若解析失敗，請重新貼上，移除格式與連結網址。若持續發生，請在 Issue 提供服務商、模型、介面語言及可重現的文字範例，勿附上 API 金鑰。
- 語言選擇會分別儲存在各個瀏覽器中，可透過地球圖示切換，不需要使用瀏覽器翻譯。
- 歡迎透過 Issue 回報問題、提出功能建議，或提交 Pull Request。

## 致謝與授權

感謝 [LINUX DO](https://linux.do/) 社群的支持。本專案採用 [MIT License](./LICENSE) 授權。

<p align="center">
  <img src="./public/logo/logo-text.png" alt="Japanese Sentence Analyzer" width="340" />
</p>

<p align="center">
  <b>Read Japanese, one word at a time.</b><br />
  Word breaks, readings, meanings, and translation — one tap away.
</p>

<p align="center">
  <a href="https://nihongodemo.howen.ink/">Live demo</a> ·
  <a href="https://doc.howen.ink/">Docs</a> ·
  <a href="#quick-start">Run locally</a> ·
  <a href="#deploy-with-an-ai-agent">Deploy with an AI agent</a>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg" /></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb" />
  <a href="https://linux.do/"><img alt="LINUX DO" src="https://img.shields.io/badge/LINUX%20DO-%E6%96%B0%E7%9A%84%E7%90%86%E6%83%B3%E5%9E%8B%E7%A4%BE%E5%8C%BA-f8c12c" /></a>
</p>

<p align="center">
  <a href="README.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · English · <a href="README.ko.md">한국어</a> · <a href="README.ja.md">日本語</a>
</p>

![Analysis result with dictionary entry](./docs/images/app-home.png)

## What it does

**Read sentences**
- Type or paste Japanese to get furigana, romaji, and part of speech for every word, plus a full translation
- Click any word to see its meaning, usage, inflection, and an example — in the context of that sentence
- Drag across several words (or choose "Select more words together" in the entry) to explain a grammar pattern or set phrase as a whole; words that were split apart can be merged back in one click

**Handy extras**
- A sentence of the day on the home page, refreshed on Japan time — click it to start
- Long passages are analyzed in chunks; pasted web pages and Markdown are cleaned of formatting and links
- Image text recognition: upload or paste a screenshot to extract the Japanese
- Read-aloud (Edge TTS / Gemini TTS) and an AI Japanese assistant that knows the current sentence

**Interface**
- Simplified Chinese, Traditional Chinese, English, and Korean — the UI, translations, and entries switch together
- Light and dark themes, on desktop and mobile
- Recent analyses are kept locally in your browser

<table>
  <tr>
    <td width="62%"><img src="./docs/images/app-dark.png" alt="Dark mode" /></td>
    <td width="38%"><img src="./docs/images/mobile-chat.png" alt="AI Japanese assistant on mobile" /></td>
  </tr>
</table>

## Models

| Used for | Default | Optional |
| --- | --- | --- |
| Analysis, translation, entries | DeepSeek `deepseek-flash` | Gemini `gemini-flash-latest` / `gemini-flash-lite-latest` |
| Image text recognition | Same as the selected text model | — |
| Read-aloud | Edge TTS | Gemini TTS (requires a Gemini key) |

Keys configured on the server are shared by all visitors. Users can also enter their own keys in Settings; they're stored in that browser and sent through this app's server to the model provider with each request.

## Quick start

Requires Node.js 22.

```bash
git clone https://github.com/cokice/japanese-analyzer.git
cd japanese-analyzer
npm ci
cp .env.example .env.local   # Windows: Copy-Item .env.example .env.local
```

Add at least one key to `.env.local`, then start the dev server:

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
```

```bash
npm run dev
```

Open <http://localhost:3000>. To try it from a phone on the same network, run `npm run dev -- --hostname 0.0.0.0` and open `http://<your-computer-ip>:3000`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | Recommended. Default analysis, translation, and image recognition |
| `GEMINI_API_KEY` | Optional. Gemini text models, image recognition, and Gemini TTS |
| `DEEPSEEK_API_URL` / `GEMINI_API_URL` | Optional. OpenAI-compatible endpoints; leave empty for the official ones |
| `CODE` | Optional. Access password; leave empty for open access |
| `NEXT_PUBLIC_UMAMI_SRC` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Optional. Set both to enable Umami analytics |

Keys stay on the server and are never sent to the browser. The sentence of the day is generated with the server key; without one, built-in examples are shown.

<details>
<summary>What Umami records</summary>

Only whether a feature was used, which provider and model, success or failure, and timing. It **never** includes source text, translations, chat content, images, raw error messages, or API keys.

- Usage: `analyze_sentence`, `image_text_extract`, `tts_speech`, `word_detail_click`
- Analysis outcome: `analyze_success`, `analyze_error`, `analyze_cancel` (with `duration_ms` and `first_result_ms`; failures record only `error_category`)
- Chat: `chat_send`, `chat_success`, `chat_error`

</details>

## Deploy

### Deploy with an AI agent

Send this line to Claude Code, Codex, Cursor, or another AI coding agent. It will ask where to deploy and which keys to use, then install, verify, and hand you the URL:

```text
Read https://raw.githubusercontent.com/cokice/japanese-analyzer/master/docs/agent-deploy.md and follow its steps to deploy japanese-analyzer for me.
```

Supports a Linux server (Docker, with optional domain and HTTPS), Vercel, or your own machine. The steps the agent follows are in [docs/agent-deploy.md](./docs/agent-deploy.md).

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cokice/japanese-analyzer)

Import the repository, add the environment variables under `Settings → Environment Variables`, and redeploy.

### Docker

The `howenhowen/japanese-analyzer` image supports `amd64` and `arm64`; the container listens on port `3002`.

```bash
cp .env.production.example .env.production   # add your keys
docker compose -f docker-compose.hub.yml up -d
```

Update to the latest version:

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

<details>
<summary>Without Compose: docker run</summary>

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

To update, `docker pull` the new image, remove the old container with `docker rm -f japanese-analyzer`, and run the command above again.

</details>

## Development

```bash
npm run dev          # dev server
npm test             # unit and API tests
npm run lint         # lint
npx tsc --noEmit     # type check
npm run build        # production build
```

Report bugs or ideas in [Issues](https://github.com/cokice/japanese-analyzer/issues); pull requests are welcome. For analysis problems, include the provider, model, interface language, and a sample that reproduces it — never your API key.

## Acknowledgments

Thanks to the [LINUX DO](https://linux.do/) community for its support.

## License

Starting with the license-transition commit after `mit-final`, the project as a whole is distributed under the [GNU AGPL v3 only (AGPL-3.0-only)](./LICENSE).

Code previously released under MIT, including `mit-final` (`fb57ddc`), retains its existing MIT grant. See the [legacy MIT license](./LICENSES/MIT-legacy.txt), [licensing and deployment notes](./LICENSING.md), and [copyright notices](./NOTICE).

Commercial use is permitted. When distributing covered works or offering a modified version over a network, provide the corresponding source as required by the license.

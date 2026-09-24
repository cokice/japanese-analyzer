<p align="center">
  <img src="./public/logo/logo-text.png" alt="日本語文章解析" width="340" />
</p>

<p align="center">
  <b>日语句子，逐词读懂。</b><br />
  分词、注音、词义和翻译，点一下就清楚。
</p>

<p align="center">
  <a href="https://nihongodemo.howen.ink/">在线体验</a> ·
  <a href="https://doc.howen.ink/">使用文档</a> ·
  <a href="#快速开始">本地运行</a> ·
  <a href="#让-ai-agent-部署">让 AI 帮你部署</a>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg" /></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb" />
  <a href="https://linux.do/"><img alt="LINUX DO" src="https://img.shields.io/badge/LINUX%20DO-%E6%96%B0%E7%9A%84%E7%90%86%E6%83%B3%E5%9E%8B%E7%A4%BE%E5%8C%BA-f8c12c" /></a>
</p>

<p align="center">
  简体中文 · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.en.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja.md">日本語</a>
</p>

![解析结果与词典释义](./docs/images/app-home.png)

## 能做什么

**读句子**
- 输入或粘贴日语，逐词标出假名、罗马音和词性，下方给出整句译文
- 点任意一个词，查看本句里的意思、用法、活用和例句
- 拖过几个词（或在释义里点「选中多个词」），把语法结构、惯用语当作一个整体来讲；被拆开的词可以一键合并

**更顺手**
- 首页每天一句，按日本时间更新，点一下就开始解析
- 长文分段解析，粘贴网页或 Markdown 时自动去掉格式和链接
- 图片识别：上传或直接粘贴截图提取日语文字
- 朗读原文（Edge TTS / Gemini TTS），以及结合当前句子的 AI 日语助手

**界面**
- 简体中文、繁体中文、English、한국어，界面、翻译和释义一起切换
- 浅色 / 深色，桌面与手机都能用
- 最近的解析记录保存在浏览器本地

<table>
  <tr>
    <td width="62%"><img src="./docs/images/app-dark.png" alt="深色模式" /></td>
    <td width="38%"><img src="./docs/images/mobile-chat.png" alt="手机上的 AI 日语助手" /></td>
  </tr>
</table>

## 模型

| 用途 | 默认 | 可选 |
| --- | --- | --- |
| 解析、翻译、释义 | DeepSeek `deepseek-flash` | Gemini `gemini-flash-latest` / `gemini-flash-lite-latest` |
| 图片识别 | 与所选文本模型一致 | — |
| 朗读 | Edge TTS | Gemini TTS（需要 Gemini Key） |

服务器配置的 Key 供所有访客使用；用户也可以在设置里填自己的 Key，保存在自己的浏览器里，请求时经本应用服务端转发给模型服务商。

## 快速开始

需要 Node.js 22。

```bash
git clone https://github.com/cokice/japanese-analyzer.git
cd japanese-analyzer
npm ci
cp .env.example .env.local   # Windows：Copy-Item .env.example .env.local
```

在 `.env.local` 里至少填一个 Key，然后启动：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
```

```bash
npm run dev
```

打开 <http://localhost:3000>。想用手机访问同一局域网里的开发服务器，改用 `npm run dev -- --hostname 0.0.0.0`，再打开 `http://电脑IP:3000`。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 推荐。默认的解析、翻译与图片识别 |
| `GEMINI_API_KEY` | 可选。Gemini 文本模型、图片识别与 Gemini TTS |
| `DEEPSEEK_API_URL` / `GEMINI_API_URL` | 可选。OpenAI 兼容接口地址，留空用官方地址 |
| `CODE` | 可选。访问密码，留空则不需要密码 |
| `NEXT_PUBLIC_UMAMI_SRC` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | 可选。两个都填写后启用 Umami 统计 |

Key 只在服务端使用，不会下发到浏览器。「每日一句」使用服务器 Key 生成，未配置时显示内置例句。

<details>
<summary>Umami 会记录什么</summary>

只记录功能是否被使用、用了哪个服务商和模型、成功还是失败以及耗时，**不包含**原文、翻译、聊天内容、图片、原始错误信息或 API Key。

- 使用事件：`analyze_sentence`、`image_text_extract`、`tts_speech`、`word_detail_click`
- 解析结果：`analyze_success`、`analyze_error`、`analyze_cancel`（含 `duration_ms`、`first_result_ms`，失败只记录 `error_category`）
- 聊天：`chat_send`、`chat_success`、`chat_error`

</details>

## 部署

### 让 AI Agent 部署

把这句话发给 Claude Code、Codex、Cursor 等 AI 编程助手，它会先问你要部署到哪里、要哪些 Key，然后装好、验证，最后告诉你访问地址：

```text
请阅读 https://raw.githubusercontent.com/cokice/japanese-analyzer/master/docs/agent-deploy.md ，按里面的步骤帮我部署 japanese-analyzer。
```

支持部署到 Linux 服务器（Docker，可选配置域名和 HTTPS）、Vercel 或本机。Agent 按照的步骤见 [docs/agent-deploy.md](./docs/agent-deploy.md)。

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cokice/japanese-analyzer)

导入仓库后，在 `Settings → Environment Variables` 里填好环境变量，重新部署即可。

### Docker

镜像 `howenhowen/japanese-analyzer` 支持 `amd64` / `arm64`，容器监听 `3002` 端口。

```bash
cp .env.production.example .env.production   # 填入 Key
docker compose -f docker-compose.hub.yml up -d
```

更新到最新版：

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

<details>
<summary>不用 Compose，直接 docker run</summary>

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

更新时先 `docker pull` 新镜像，`docker rm -f japanese-analyzer` 删掉旧容器，再执行一遍上面的命令。

</details>


## 开发

```bash
npm run dev          # 开发服务器
npm test             # 单元与接口测试
npm run lint         # 代码检查
npx tsc --noEmit     # 类型检查
npm run build        # 生产构建
```

反馈问题或建议请提 [Issue](https://github.com/cokice/japanese-analyzer/issues)，欢迎 Pull Request。报告解析问题时，附上服务商、模型、界面语言和能复现的原文即可，不要贴 API Key。

## 致谢

感谢 [LINUX DO](https://linux.do/) 社区的支持与推广。

## 许可证

自 `mit-final` 之后的许可证切换提交起，本项目采用 [AGPL-3.0-only](./LICENSE)。`mit-final`（`fb57ddc`）及更早以 MIT 发布的代码仍保留 MIT 授权，见 [历史 MIT 许可证](./LICENSES/MIT-legacy.txt) 与 [授权范围说明](./LICENSING.md)，版权声明见 [NOTICE](./NOTICE)。

AGPL 允许商业使用；分发本项目，或修改后通过网络提供服务时，需要按许可证提供对应源码。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=cokice/japanese-analyzer&type=Date)](https://www.star-history.com/#cokice/japanese-analyzer&Date)

# japanese-analyzer 部署指南（写给 AI Agent）

> 你是正在帮用户部署本项目的 AI 编程助手（Claude Code、Codex、Cursor、Gemini CLI 等）。
> 按本文顺序执行。与用户交流时使用用户的语言，每一步先简短说明要做什么，再执行。

项目：日语句子解析 Web 应用（Next.js）。仓库：<https://github.com/cokice/japanese-analyzer>
官方镜像：`howenhowen/japanese-analyzer:latest`（`linux/amd64`、`linux/arm64`），容器监听 `3002`。

## 规则

- **密钥**：API Key 只向用户索取；不要打印、不要写进日志、不要提交到 git。写入的环境变量文件权限设为 `600`。
- **先问再动**：删除容器或文件、占用或更换端口、安装系统软件、修改已有的 Nginx / Caddy / 防火墙配置之前，先征得用户同意。改配置前先备份。
- **不要杀进程**：端口被占用时，告诉用户是谁在用，让用户选择换端口还是自行处理。
- **失败就停**：某一步失败时，给出关键报错和你的判断，不要反复盲目重试。

## 第 1 步：一次问清楚

把下面几个问题一次性问完，等用户回答后再继续：

1. **部署到哪里？**
   - A. 当前这台 Linux 服务器，用 Docker（推荐）
   - B. Vercel
   - C. 只在本机运行试用
2. **DeepSeek API Key**（推荐，默认的解析、翻译和图片识别都用它）。没有的话，也可以只提供 Gemini Key。
3. **可选项**，没有就跳过：
   - Gemini API Key：启用 Gemini 模型和 Gemini 朗读
   - 访问密码 `CODE`：设置后打开网站需要先输入密码
   - 域名：需要 HTTPS 访问时提供（仅 A）

## 第 2 步 A：Docker 部署（Linux 服务器）

**2A-1 检查环境**

```bash
docker --version && docker compose version
```

没有 Docker 时，询问用户后再按官方脚本安装：`curl -fsSL https://get.docker.com | sh`。

检查端口是否空闲：

```bash
ss -ltnp | grep ':3002 ' || echo "3002 空闲"
```

被占用时按「规则」处理；用户同意换端口后，把下面 compose 文件里 `ports` 的左侧改成新端口（如 `"3102:3002"`），后文的 `3002` 相应替换。

**2A-2 准备目录和配置**

```bash
mkdir -p ~/japanese-analyzer && cd ~/japanese-analyzer
curl -fsSL https://raw.githubusercontent.com/cokice/japanese-analyzer/master/docker-compose.hub.yml -o docker-compose.yml
```

创建 `.env.production`，填入用户提供的值，没有的留空：

```env
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
CODE=
```

```bash
chmod 600 .env.production
```

**2A-3 启动**

```bash
docker compose up -d
```

**2A-4 验收**

```bash
docker compose ps
docker compose logs --tail 50
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002
```

容器状态为 running、日志没有报错、返回 `200` 即成功。`restart: unless-stopped` 已写在 compose 文件里，服务器重启后会自动拉起。

**2A-5 域名与 HTTPS（用户提供了域名才做）**

1. 请用户把域名的 A 记录解析到本机公网 IP，并在云厂商安全组 / 防火墙放行 80 和 443。
2. 检查是否已有 Web 服务器：`command -v nginx caddy`。**已有就复用**，不要再装一套。
3. 都没有时，推荐安装 Caddy（自动申请和续期证书）。Caddyfile 示例：

   ```caddyfile
   your.domain.com {
       reverse_proxy 127.0.0.1:3002
   }
   ```

   已有 Nginx 时，新增一个 `server` 块反代到 `http://127.0.0.1:3002`，用 certbot 申请证书，并把 HTTP 重定向到 HTTPS。
4. 验证：`curl -I https://your.domain.com`，状态码正常、证书有效即完成。

## 第 2 步 B：Vercel

Vercel 需要用户本人登录授权，你负责指导：

1. 让用户打开 <https://vercel.com/new/clone?repository-url=https://github.com/cokice/japanese-analyzer> 并导入仓库。
2. 在 `Settings → Environment Variables` 添加 `DEEPSEEK_API_KEY`（以及可选的 `GEMINI_API_KEY`、`CODE`）。
3. 重新部署，打开 Vercel 分配的域名验证。

如果用户已经安装并登录了 `vercel` CLI，也可以在仓库目录执行 `vercel`，用 `vercel env add` 添加变量后 `vercel --prod`。

## 第 2 步 C：本机运行

需要 Node.js 22。

```bash
git clone https://github.com/cokice/japanese-analyzer.git
cd japanese-analyzer
npm ci
cp .env.example .env.local   # 填入 DEEPSEEK_API_KEY 等
npm run build && npm start   # 只是试用也可以用 npm run dev
```

打开 <http://localhost:3000>（`npm start` 默认端口 3000）。

## 第 3 步：交付

部署完成后告诉用户：

- 访问地址（IP:端口，或域名）
- 如果设置了 `CODE`，提醒首次访问需要输入密码
- 如果只配置了 Gemini Key：网站默认使用 DeepSeek，提醒用户在右上角「设置」里把服务商切换为 Gemini
- 以后更新到最新版的命令（Docker）：

  ```bash
  cd ~/japanese-analyzer && docker compose pull && docker compose up -d
  ```

- 查看日志：`docker compose logs -f`

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 页面能打开，但解析报「未提供 API 密钥」 | `.env.production` 里没有有效的 `DEEPSEEK_API_KEY` / `GEMINI_API_KEY`，改好后 `docker compose up -d` 重建容器 |
| 外网打不开，本机 `curl` 正常 | 云厂商安全组或系统防火墙没有放行对应端口 |
| 首页「今日一句」只在内置的 7 句里轮换 | 服务器没有可用的 API Key，或出站网络访问不到模型服务商 |
| 证书申请失败 | 域名尚未解析到本机，或 80 端口没有放行 |

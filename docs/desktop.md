# 桌面版开发与发布

桌面版使用 Tauri 2 + 内置 Node 22 + Next.js standalone。`app/` 与 Web、Vercel、Docker 共用，无桌面分支代码。桌面专有代码位于 `src-tauri/` 与 `scripts/desktop/`。

```text
Tauri Rust 主进程
  ├─ 打包启动页 / 原生桌面设置
  ├─ Node 子进程 → server.js → 127.0.0.1:<port>
  ├─ GET /api/auth 就绪检查 → WebView 跳转
  └─ WebView → 同源 /api/* → 本机 Next.js → 模型 / TTS 服务
```

## 开发与生产构建

要求 Node.js 22、Rust stable（至少 1.90），macOS 安装 Xcode Command Line Tools；Windows x64 安装 MSVC C++ Build Tools、Windows SDK 和 WebView2。平台前置条件见 [Tauri 官方文档](https://v2.tauri.app/start/prerequisites/)。

```bash
npm ci
npm run desktop:dev
```

`dev.mjs` 选择空闲回环端口，启动 `next dev --hostname 127.0.0.1`，再运行 `tauri dev`。Rust 首先显示打包启动页，等 Next dev `/api/auth` 就绪后跳转；前端热更新照常工作。开发模式通过 `DESKTOP_DEV_PORT` 指定服务，release 构建忽略该变量。退出或 Ctrl+C 会终止 Next 与 Tauri 进程组；Windows 使用 `taskkill /T` 清理子进程。

请不要同时运行 `next dev` 和 `next build`：它们共用 `.next/`。开发结束后重新构建生产产物。

```bash
npm run build
npm run desktop:build
```

输出位于 `src-tauri/target/release/bundle/`：macOS 为 `.app` / `.dmg`，Windows 为 NSIS 安装包。本机最终用户无需安装 Node 或 Rust。不要跨 OS / 架构复用 standalone：Next.js 可选原生模块可能被追踪进产物，必须使用目标平台上的 Node 22 重新构建。

`package.json` 的 `desktop.nodeVersion` 锁定完整运行时版本；升级时修改它并重新构建全部安装包。`npm run build` 只额外记录 `.next/desktop-build.json`（构建 Node 版本、OS、架构和应用版本），原有 Web 构建行为不变。`.dockerignore` 排除 `src-tauri` 和 `.desktop-cache`，防止桌面资源进入 Docker 构建上下文。`tauri.conf.json` 的 `version` 直接引用根 `package.json`；CI 用 `v*` tag 同步 npm / Cargo 版本。

## 服务端资源组装

`npm run desktop:package-server`：

1. 校验 standalone、static、公用资源与许可文件齐全，以及构建来自 Node 22 和当前原生平台。
2. 从 `https://nodejs.org/dist/v<version>/` 下载 macOS arm64/x64 `.tar.xz` 或 Windows x64 `.zip`，按同站官方 `SHASUMS256.txt` 校验 SHA-256。缓存位于被 Git 忽略的 `.desktop-cache/`，每次复核校验和。
3. 清空固定生成目录 `src-tauri/resources/server/`，复制 standalone、`.next/static`、`public`、`LICENSE`、`NOTICE`、`LICENSING.md`、`LICENSES/`，并剔除所有 `.env` / `.env.*` 文件。内置运行时只保留 `node`（Windows 为 `node.exe` 与同目录 DLL）以及 Node 许可文本。
4. 给复制后的 Next routes manifest 添加桌面 CSP 响应头，不修改原始 Web 产物；生成 `server-manifest.json`，记录应用版本、Node 版本、平台、发行包校验和及每个文件的 SHA-256。

Tauri 按目录递归打包 `resources/server/`，保留隐藏的 `.next`。运行时由 `app.path().resource_dir()/resources/server` 定位，不依赖系统 PATH、用户安装的 Node 或当前工作目录。重复组装会删除旧文件，避免版本间混入残留资源。

不要把服务端 Key 写进 `next.config.ts.env` 或公开环境变量。桌面默认无 `CODE`、服务端模型 Key 或 Umami；用户模型 Key 继续通过现有应用设置管理。开发 `.env.local` 会被 Next dev 正常读取，但不会被复制进桌面资源。

## 端口、数据与生命周期

首次启动用 `TcpListener::bind("127.0.0.1:0")` 选择端口，释放后交给 Node。该端口写入应用数据目录的 `server-port`，之后重启和更新继续使用：WebView 的 localStorage 按 origin（包含端口）隔离，每次随机端口会使 Key、语言、主题和历史记录看起来丢失。这个持久化是对原随机端口方案的必要补充。

已保存端口被其他进程占用时显示启动错误，释放占用后点击重试。不会静默换端口导致用户进入一个空的存储空间。不要随意删除 `server-port`；删除它会生成新 origin，原 WebView 数据不会自动迁移。

Rust 以 `current_dir=resources/server` 启动 Node，设置 `HOSTNAME=127.0.0.1`、`PORT`、`NODE_ENV=production`、`NEXT_TELEMETRY_DISABLED=1`，移除继承的 `NODE_OPTIONS` 和 `NODE_PATH`。Windows 不弹出 Node 控制台。

每 250ms 尝试 `/api/auth`（单次请求有 800ms 超时，绕过系统代理、不跟随重定向），检查 2xx 及预期 JSON 字段，最多 30 秒。成功后跳转本机应用；失败返回启动页，展示日志路径和「重试」。运行中 Node 意外退出自动重启一次，再失败进入错误页；手动重试会重置计数。关闭主窗口、菜单退出或正常 Tauri 退出事件都会 kill + wait 子进程，桌面设置窗口不会阻止退出。单实例插件将后续启动聚焦到已有主窗口。

## CSP 与原生权限

生产内容使用：

```text
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'
```

`unsafe-inline` 支持主题、Safari 修复、Next 启动脚本与内联 CSS；`blob:` / `data:` 支持 TTS 音频和图片预览；模型调用由服务端转发，客户端只连接同源 `/api/*`。Tauri 的 CSP 仅保护打包资源，HTTP 页面另由打包阶段追加的 Next 响应头覆盖，避免跳转后失去策略。开发 Next 页面保留 HMR 的默认策略。

只有打包启动页和桌面设置页获得 Tauri capability，没有给 `127.0.0.1:*` 或任意远程页面开放 native 权限。自定义命令额外校验调用窗口和打包页 origin；普通应用页面无法重启服务、安装更新或调用 opener。Releases 打开命令只接受 Rust 内固定的 HTTPS 地址。拖放使用 WebView 原生 HTML 行为，让现有图片上传逻辑正常工作。

未来共享客户端代码继续只调用同源 `/api`，不要假定 Vercel 域名或固定本机端口。

## 更新、签名与发布

原生菜单「桌面 / Desktop → 桌面设置 / Desktop settings」（`Cmd/Ctrl+,`）显示当前版本、更新说明及操作。启动时后台检查一次，有新版本时菜单显示提示；离线或 manifest 尚不存在不影响应用使用。

- macOS：Tauri updater 下载、验签整个 `.app.tar.gz`（包括 Node 和服务端），停止旧 Node 后安装并重启。安装前下载失败不会中断服务。
- Windows：一期按批准策略只提供提示和 Releases 链接，用户运行完整 NSIS 安装包，避免依赖不同更新实现对 resources 的替换行为。当前 Tauri 2 官方 updater 本身也支持调用 NSIS/MSI 完整安装程序；本实现保留手动安装产品策略，不将“仅替换 exe”描述为 Tauri 2 的普遍限制。

更新签名密钥通过 Tauri CLI 生成，公钥提交在 `src-tauri/tauri.conf.json`。私钥必须保存在仓库外并备份，不能提交。当前工作机的密钥文件为 `~/.tauri/japanese-analyzer.key`，权限为仅当前用户可读写。维护者配置 GitHub Actions secret：

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo cokice/japanese-analyzer < ~/.tauri/japanese-analyzer.key
# 如果密钥设置了密码，另行配置 TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

需要仓库管理权限。换一台机器时请使用相同私钥；新建密钥必须同步修改公钥，并会影响已安装用户的升级链路。初次创建密钥可使用：

```bash
npx tauri signer generate --ci -w ~/.tauri/japanese-analyzer.key
```

将生成的 `.pub` 文件内容写入 updater `pubkey`。不要覆盖现有发布密钥。

`.github/workflows/desktop.yml` 独立于 Docker CI，tag `v*` 触发正式 Release，手动触发生成 draft。validate 执行测试、lint、类型检查和 Web build，并归档验证后的 standalone/static/public。原生 job 在 macOS arm64、macOS Intel（显式 `macos-15-intel` runner）和 Windows x64 上重新构建，随后组装资源、运行 Node 冒烟和 Rust 测试，通过 `tauri-apps/tauri-action@v0` 上传安装包及签名。签名私钥按该 Action 实际接口通过环境变量传入。

各平台完成后单独汇总已上传的签名，生成 `latest-darwin.json` 和 `latest-windows.json`，与 updater 配置端点一致，避免多个矩阵 job 并发覆盖 manifest。macOS manifest 同时含两个架构。draft 不会通过 `/releases/latest` 推给正式用户。缺少 updater 私钥时仍产出普通安装包，但不发布更新 manifest。

操作系统代码签名与 updater ed25519 签名独立。Apple Developer ID + 公证可配置 `APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID`；未提供时产出无 Developer ID 签名的包。接入 Apple 公证时还需验证内置 Node、原生依赖的嵌套签名与 JIT entitlement 后再发布。Windows 证书签名留待配置；未签名包可能触发 SmartScreen。

参考：[Tauri updater](https://v2.tauri.app/plugin/updater/)、[Tauri Action](https://github.com/tauri-apps/tauri-action)、[GitHub runner 架构](https://github.com/actions/runner-images)。

## 排障

桌面打包必须使用 Node.js 22。`desktop:build` 会先检查当前 Node 版本，再开始 Web 构建；直接调用 `desktop:package-server` 也会检查 `.next/desktop-build.json` 记录的构建版本。若当前或构建版本为 Node 24/26，切换到 Node 22（建议使用 `desktop.nodeVersion` 锁定的版本），重新打开终端，通过 `node -v` 确认后运行 `npm ci` 和 `npm run desktop:build`。仅在同一个 Node 24 终端重复构建无法解决版本不匹配。

`stdout` 和 `stderr` 合并写入 `server.log`，保留最近 500 KiB。启动错误页及桌面设置显示实际绝对路径：

| 系统 | 默认日志位置 |
| --- | --- |
| macOS | `~/Library/Application Support/ink.howen.japanese-analyzer/server.log` |
| Windows | `%APPDATA%\ink.howen.japanese-analyzer\server.log` |

端口占用可用 macOS `lsof -nP -iTCP:<port> -sTCP:LISTEN`，或 Windows `netstat -ano` 查看；不要终止不属于本应用的进程。先退出旧应用后重试。缺少 `node` / `server.js` / 静态资源时，重新执行 Node 22 Web build 和资源组装；不要只替换主 exe 或只复制 server.js。

未配置服务端 Key 时「今日一句」回退内置句属正常行为。模型功能需要在应用设置填写 Key；内网模型地址仍受现有服务端 `validateBaseUrl` 校验限制。

## 验证与发布验收

```bash
npm test
npm run desktop:test
npm run lint
npx tsc --noEmit
npm run build
npm run desktop:package-server
node scripts/desktop/smoke-server.mjs
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

服务端冒烟会实际启动打包 Node，验证健康检查、httpOnly / sameSite=lax 非 secure Cookie、本机页面、static、public 和 CSP，并验证退出后端口释放；它不调用付费模型接口。

发布前分别在 macOS 与 Windows 安装包上验证启动、解析、词详情、AI 助手、Edge/Gemini TTS、图片上传/粘贴、历史记录、深色模式与语言切换；验证主窗口关闭后没有残留 Node，重复启动聚焦旧窗口，重启后历史和 Key 保留。运行中终止该应用自己的 Node 一次应自动重启，再终止应显示重试页。Windows 还需验证 NSIS 安装及缺少 WebView2 时的引导。

更新最终验收需要仓库签名 secrets 和两个实际测试版本：先安装旧版本，再发布更高版本的签名 Release，验证 macOS 完整更新与 Windows 手动安装入口。单次本机构建或静态检查不能替代这个发布链路验收。

Node SEA、托盘、本地服务端 Key 配置面板和 Windows 自动安装策略均不在一期范围。

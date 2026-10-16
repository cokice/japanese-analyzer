# 词典、分词纠错与阅读辅助

首页可切换「句子解析／查词」。查词默认使用随应用提供的完整英文 JMdict，无需模型 Key；句子解析仍使用配置的模型。

## 使用

- 查词先搜索真实词典。活用形没有结果时，可点击「AI 查找原形」，再用推断的辞书形查询词典；推断结果会明确标注。
- 点击解析正文中的词，可在原有语境释义下展开「词典义项」。英文原文保留不变；非英文界面可主动翻译已展开的义项，每次最多十项，标为「AI 译文」。
- 「调整分词」支持推荐候选和手动点击字符边界。生成结果必须保持原文完全一致，预览后才应用；工具栏支持最多二十步撤销和恢复初始分词。原文历史记录不保存纠错结果。
- 「阅读视图」将连续的部分活用、补助动词结构组合展示；圈选词组可以设为阅读组或取消分组。切回词法视图可看到完整底层 token，分组不修改原始分词。
- 「展开活用过程」由当前模型按需生成，可能与被动等歧义可并列展示；片段不完整时提示重新选取。AI 内容需要结合原文核对。
- 假名、罗马音与阅读模式会记住本机偏好。分享链接只携带原文与这三个选项，打开后手动解析，不携带 Key、模型配置或纠错快照；分享选项和本次修改不会覆盖接收方的本机偏好。
- 分享链接上限为 8 KiB，超长时改为复制原文；复制失败会显示可手动复制的内容。桌面版和 localhost 需填写自己的公开 Web 部署地址，避免分享本机端口。

## 内置数据与构建

`dictionary.lock.json` 固定完整英文数据的版本、数据日期、下载地址和 SHA-256。首次版本为 `3.6.2+20261005200550`，含 218,863 条词条。数据来自 [jmdict-simplified](https://github.com/scriptin/jmdict-simplified)，原始词典由 [EDRDG](https://www.edrdg.org/edrdg/licence.html) 维护。

```sh
npm run dictionary:prepare  # 校验缓存；必要时下载和生成
npm run dictionary:check    # 发布前检查数据快照不超过 30 天
npm run build              # 自动检查日期并准备数据
npm run dictionary:smoke   # 启动 standalone，验证无模型 Key 查词
```

开发启动也会自动准备数据，但不要求数据在三十天以内。初次开发和构建需要网络；准备成功后内置查询不联网。桌面版可离线查询，Web 版仍需要连接应用服务器。

生成内容位于 `data/dictionary/`，下载缓存位于 `.dictionary-cache/`，均不提交 Git。索引和词条分别按 SHA-256 前两位分成 256 个 gzip JSON 桶，并保留义项的写法／读音限制。查询在 Node 服务端按需读取并校验分片，缓存预算为 32 MiB 解压 JSON，浏览器不下载整库。

构建产物通过 Next 文件追踪包含数据；Docker 和桌面打包同时复制数据、版本清单与授权文件。容器运行阶段不需要写入词典目录。`dictionary:smoke` 的可选参数是已有 standalone 服务器目录，例如：

```sh
npm run dictionary:smoke -- src-tauri/resources/server
```

每周二及手动触发的 `Dictionary update` workflow 会查询上游版本、验证完整英文包并提出锁文件更新 PR，不自动发布。仓库需允许 GitHub Actions 创建 PR。手动准备更新：

```sh
node scripts/dictionary/update.mjs
npm run dictionary:prepare
npm test
npm run build
```

数据及派生索引采用 CC BY-SA 4.0，独立于应用代码许可证。署名与转换说明见 `NOTICE`，授权副本见 `LICENSES/EDRDG.html` 与 `LICENSES/CC-BY-SA-4.0.txt`。

## 外部 HTTP v1 协议

在设置中的「词典服务」添加名称、完整查询 URL 和可选 Bearer Key，测试后添加并保存设置。可以选择内置或一个外部服务；删除当前外部服务会恢复内置。词典 Key 与模型 Key 分开保存于本机浏览器，请求时经应用服务器转发。

外部服务必须实现以下协议。其他厂商可在 `dictionaryAdapters` 中加入协议转换器；单独填写任意厂商 URL 不会自动转换其协议。

请求为 POST，`Content-Type: application/json`；Key 存在时附带 `Authorization: Bearer ...`：

```json
{"query":"食べた","dictionaryForm":"食べる","reading":"たべた","offset":0,"limit":20}
```

只发送查询词、辞书形、读音和分页，不发送整句或模型信息。URL 不接受用户信息、查询参数或 fragment；不跟随重定向。默认沿用应用的私网地址限制；个人自托管确需访问内网时，由管理员配置现有的 `ALLOW_PRIVATE_BASE_URL=true`。

响应必须符合 `DictionaryResult` 和 `DictionaryEntry` 类型。下面是完整的单条示例；没有结果时返回空 `entries` 和 `total:0`：

```json
{
  "entries": [{
    "id": "entry-1",
    "common": true,
    "spellings": [{"text":"食べる","common":true,"tags":[]}],
    "readings": [{"text":"たべる","common":true,"appliesTo":["*"],"tags":[]}],
    "senses": [{
      "id":"entry-1:0","pos":["v1","vt"],"glosses":["to eat"],
      "appliesToSpellings":["*"],"appliesToReadings":["*"],"tags":[],"notes":[]
    }],
    "source": {
      "id":"my-dictionary","name":"My dictionary","version":"1","date":"2026-10-05",
      "url":"https://example.com/dictionary","license":"CC BY-SA 4.0",
      "licenseUrl":"https://example.com/license"
    }
  }],
  "total":1,"offset":0,"hasMore":false,
  "source": {
    "id":"my-dictionary","name":"My dictionary","version":"1","date":"2026-10-05",
    "url":"https://example.com/dictionary","license":"CC BY-SA 4.0",
    "licenseUrl":"https://example.com/license"
  },
  "tags":{"v1":"Ichidan verb","vt":"transitive verb"}
}
```

每页最多二十条，响应上限 1 MiB，整体请求超时八秒。词条 ID 与义项 ID 在来源版本内应稳定且唯一；`["*"]` 表示适用全部写法／读音。`tags` 映射可省略。来源及授权 URL 必须使用 HTTP(S)。

超时、无效协议和首批空结果会回退内置词典，并在界面展示原因与实际来源；连接测试不使用回退，避免错误地把内置成功当成外部连接成功。取消请求不会触发回退。所有词典和学习工具 API 沿用应用会话认证。

## 验证基线

2026-10-16，macOS arm64、Node 22.23.3，本地生产 standalone：生成索引目录约 20 MiB；首次查询「駅」约 92 ms，随后「食べる」「前」「ぜん」约 7–18 ms。这是本机样本，非性能承诺。`dictionary:smoke` 输出可用于其他环境对比。

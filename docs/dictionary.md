# 词典、分词纠错与阅读辅助

首页可切换「句子解析／查词」。查词默认使用随应用提供的完整英文 JMdict，无需模型 Key；句子解析仍使用配置的模型。

中文词典后续开发见 [中文词典接入设计](./chinese-dictionary-design.md)。该文档描述设计中的功能，当前默认数据仍为英文 JMdict。

## 使用

- 查词先搜索真实词典。活用形没有结果时，可点击「AI 查找原形」，再用推断的辞书形查询词典；推断结果会明确标注。
- 完成句子解析后，查词页自动展示「本句词汇」，默认按首次出现顺序排列，也可按词性分组。相同写法、读音及词性的重复词合并计数；「下一处」可切换查看原文位置。标点、空白不列为词汇，列表始终跟随底层分词、调整、撤销和恢复更新，阅读分组不改变该列表。
- 点击词汇直接查询真实词典，不额外调用模型；已有单词详情中的原形可用于补查。只查询当前词，首次展示最多 60 个不同词语，可继续展开。手动查词输入与句子草稿分别保留，切换模式时保留所选词汇。
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

## 中文义项调研（2026-10-16）

当前默认数据是 JMdict 的完整英文版，界面显示词典原文，不是运行时把日语翻译成英文。现有「翻译已展开义项」才会按界面语言请求用户配置的模型，并与英文原文并列显示。本轮按用户选择只做调研，不加入新词典数据，也不改为自动调用 AI 翻译。

| 方案 | 已确认的信息 | 接入判断 |
| --- | --- | --- |
| [JMdict / jmdict-simplified](https://github.com/scriptin/jmdict-simplified/releases/tag/3.6.2%2B20261005200550) | 锁定版本列出的释义语言不包含中文；完整英文版为 218,863 个词条。官方 [Jitendex](https://jitendex.org/) 同样是日英词典 | 切换下载包或换成官方 Jitendex 不能直接得到中文义项 |
| [greyindex/jitendex-yomitan-zh](https://github.com/greyindex/jitendex-yomitan-zh) | 社区日中版本，发布说明报告 211,107 个有释义 JMdict ID；中文来自模型翻译和模型校订，并非全部人工核验。仓库 [LICENSE](https://github.com/greyindex/jitendex-yomitan-zh/blob/main/LICENSE) 声明派生词典使用 CC BY-SA 4.0，[NOTICE](https://github.com/greyindex/jitendex-yomitan-zh/blob/main/NOTICE.md) 列出上游及例句来源 | 可评估作为带明确「社区机器译文」标识的离线中文补充；需锁定版本、校验值、保留署名并实测质量。不能默认与当前 JMdict 的义项编号逐项对齐 |
| [中文维基词典 / Kaikki](https://kaikki.org/zhwiktionary/) | 有中文释义与机器可读数据；当前索引将「[日语](https://kaikki.org/zhwiktionary/%E6%97%A5%E8%AF%AD/index.html)」（77,968 个不同词形）和「[日語](https://kaikki.org/zhwiktionary/%E6%97%A5%E8%AA%9E/index.html)」（49,712 个不同词形）分开列出，含重定向、罗马字、未知词性等。两组不能直接相加，也不等于独立有效词条数。Kaikki 列明继承 Wiktionary 的 CC BY-SA / GFDL 许可 | 更适合中文原生释义补充；先按 lang_code=ja 合并、去重、过滤重定向，再测常见词覆盖。网站的后处理下载已标注废弃，正式管线应评估原始 wiktextract 数据 |
| [Mazii](https://mazii.net/zh-TW) | 提供日文到繁体中文的在线查询 | 可参考中文优先的产品体验；本次未确认可随应用再分发的完整数据授权或开放下载接口，不能据此直接内置 |

[Yomitan](https://github.com/yomidevs/yomitan) 是词典阅读与查询软件；其代码开源不代表用户导入的每一本词典数据都具有相同许可。[wiktionary-to-yomitan](https://github.com/yomidevs/wiktionary-to-yomitan) 和 [wiktextract](https://github.com/tatuylonen/wiktextract) 可作为格式转换、抽取工具的调研对象。

后续建议：英文继续用现有 JMdict；中文原生释义单列来源，社区译文也单列来源与机器翻译标识，避免把不同词典的义项强行配对。没有中文命中时保留英文并提供按需 AI 翻译。接入前用固定样本评估同形异音、多义词、活用形及常用表达，不以仓库词条总数代替覆盖率。

## 句子解析与翻译缓存

成功的完整解析和译文分别在浏览器内存中缓存最多 20 项、约 2 MiB（按字符串占用估算）；超大结果不入缓存，按最近使用顺序淘汰。缓存随页面会话结束或整页刷新清空，不写入 localStorage、现有原文历史记录或分享链接。

查询键保留原文的空白与标点，区分服务地址、模型、能力配置、语言和会话内密钥身份；解析另外区分思考开关。密钥不会写入缓存标识或日志。流式和非流式复用相同的完整成功结果，失败、取消、部分输出和未通过完整性验证的结果不缓存。

在查词与句子解析模式之间切换会保留解析组件和译文。切换回有成功结果的模型时可恢复该模型的解析和译文；未命中的解析仍由用户触发，不因切换模型而新增解析请求。翻译沿用原先随当前句子及模型变化自动获取的行为，但先查缓存。工具栏「重新解析」及「重新翻译」显式绕过各自缓存。

词典查询另有仅当前页面会话有效的有界缓存，最多 80 批结果、4 MiB：内置结果保留 10 分钟，HTTP 服务结果保留 2 分钟。缓存区分词典服务、密钥、界面语言、查询条件和分页，不随模型切换失效；回退、失败和取消结果不缓存，连接测试及错误后的重试直接请求服务。切换词语和模式可复用成功查询，不会自动发起义项翻译或 AI 原形识别。

撤销只影响本次解析后的分词和手动阅读分组调整（最多 20 步）；未调整时按钮禁用。恢复初始分词还会清除手动分组及自动分组的手动抑制规则，阅读视图的自动分组仍按原有规则显示。

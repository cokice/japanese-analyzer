# Paper Edition 设计验收

验收日期：2026-08-02

视觉基准：`docs/paper-edition-spec.html`

## 结论

Paper Edition 的桌面、移动端、暗色主题和减少动态效果状态均通过浏览器回归。应用纸张宽度、页边留白、排版层级、原地批注、词下速查、完整词典抽屉、思考过程和全文译文均与基准的纸面设计语言一致。

## 自动化覆盖

- 1440 × 1000 桌面编辑、思考、流式批注、完成、思考展开和词典抽屉状态。
- 375 × 812 移动端词语详情复用既有模态框，无水平溢出。
- 60 个以上 token 的换行、行尾与末行批注定位、右侧钳制、末行增高和连续五次快速切换清理。
- 三轮编辑与重新分析，验证批注状态可重复进入并正确清理。
- 暗色主题持久化和连续三轮明暗切换，无亮色类残留。
- `prefers-reduced-motion` 下批注、毛刷和思考闪烁均静止。

结果：Playwright 5 / 5 通过；`npm test` 通过；`npm run build` 通过。

## 暗色对比度

| 用途 | 对比度 |
| --- | ---: |
| 主文字 `--ink` | 13.28:1 |
| 次文字 `--ink2` | 9.05:1 |
| 弱文字 `--ink3` | 5.63:1 |
| 朱色 `--shu` | 5.38:1 |
| 成功色 `--green-ok` | 6.56:1 |
| 词性颜色范围 | 4.68–6.63:1 |

## 截图证据

截图位于 `/home/howen/.codex/visualizations/2026/08/01/019fbe78-3167-7603-9650-03809d88fe69/paper-edition-qa/`：

- `reference-edit.png` / `app-light-edit.png`
- `reference-done.png` / `app-light-done.png`
- `app-light-thinking.png` / `app-light-working.png`
- `app-light-reasoning.png` / `app-light-detail.png`
- `app-mobile-detail.png`
- `app-dark-edit.png` / `app-dark-done.png`

## 测试边界

浏览器验收使用了确定性的本地 API 流式模拟，以稳定覆盖界面状态和时序；真实上游模型没有在截图测试中调用。既有 API 单元测试全部通过，图片识别、朗读、认证、取消分析、复制与隐藏等路径未改变。

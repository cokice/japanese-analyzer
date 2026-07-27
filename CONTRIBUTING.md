# Contributing to 日本語文章解析

感谢你考虑为本项目做出贡献！

## 如何贡献

### 报告 Bug

如果你发现了 Bug，请在 GitHub Issues 中提交，包含以下信息：

- Bug 的详细描述
- 复现步骤
- 预期行为与实际行为
- 截图（如有）
- 浏览器及版本信息

### 提交功能建议

欢迎提出功能建议！请在 Issues 中使用功能请求模板，描述你希望添加的功能及使用场景。

### 提交代码

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/my-feature`
3. 提交你的改动：`git commit -m 'feat: add some feature'`
4. 推送到分支：`git push origin feature/my-feature`
5. 提交 Pull Request

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/cokice/japanese-analyzer.git
cd japanese-analyzer

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，至少填写 DEEPSEEK_API_KEY

# 启动开发服务器
npm run dev

# 运行测试
npm test

# 运行 lint
npm run lint
```

### 提交规范

请使用语义化提交信息：

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `style:` 代码风格调整
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建或工具链变更

### 代码风格

- 使用 TypeScript
- 遵循项目已有的 ESLint 配置
- 保持与现有代码风格一致

## 许可证

贡献即表示你同意将代码以 [MIT License](./LICENSE) 授权。

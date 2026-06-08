# Japanese Sentence Analyzer (日本語文章解析器) 🈁

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](#📄-许可证)
[![Demo](https://img.shields.io/badge/demo-online-blue.svg)](https://japanese-analyzer-demo.vercel.app/)

> **使用 AI大模型 驱动的日语句子深度解析工具**  
>面向中文学习者，支持 Gemini Flash（`gemini-3.5-flash`）和 DeepSeek（`deepseek-v4-flash`）分析、拆解句法结构、标注词性、呈现发音与释义，让读懂日语不再困难。
---

## ✨ 主要特性
| 功能 | 描述 |
| :-- | :-- |
| 🔍 **智能句法标注** | 一键输出词性、假名、罗马音与语法成分 |
| 📚 **多维词义解释** | 支持 Gemini / DeepSeek 提供精准中文释义 |
| 🖼️ **OCR 图像识别** | 从截图或照片中提取日语文本并立即解析（仅 Gemini 支持） |
| 🔈 **原声 TTS 朗读** | 集成 Gemini TTS（`gemini-3.1-flash-tts-preview`）, 朗读整段日语 |
| 🔄 **整句翻译** | 双语对照，迅速把握整体含义 |
| 🌐 **流式响应** | 基于流式 API，交互更丝滑 |
| 🌙 **暗黑模式** | 支持亮色/暗色/跟随系统三种主题模式 |
| 🔐 **访问控制** | 可选的密码保护功能，保护私有部署，不被盗刷 |
| ⚙️ **高度可配置** | 支持自定义 Gemini / DeepSeek API Key / Endpoint |

---

## 🚀 在线体验
立即在浏览器中试用 👉 **[Demo](https://japanese-analyzer-demo.vercel.app/)**
国内访问地址 👉 **[国内访问](https://nihongodemo.howen.ink/)**
> 注意：当前 Demo 网站使用的是免费的 API Key，可能存在不稳定情况。请勿滥用，如有大量使用需求，建议根据下方教程申请您自己的 API Key（完全免费）。
> 测试网站的免费api最近老被刷爆了，还是建议申请自己的apikey填在测试网站使用即可

## 📺 演示视频


https://github.com/user-attachments/assets/5039cb62-135e-48e1-971d-960d6b82cacf


---
## 🛠️ 在线部署指南

1. 访问 Google Aistudio 官网 👉 **[aistudio](https://aistudio.google.com/)**
2. 点击页面右上角的 **“Get API Key”** 按钮
3. 在弹出窗口中选择已有项目，或点击创建新项目（完全免费）
4. 创建后复制生成的 API Key，并妥善保存
5. 您可以将该 API Key 应用于：
   - 自行部署完整项目
   - 或在 Demo 网站右上角“设置”中自定义使用您的 API Key

### 一键部署到 Vercel（推荐）
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cokice/japanese-analyzer&env=API_KEY)

1. **Fork** 本仓库到自己的 GitHub 账户  
2. 在 [Vercel](https://vercel.com/) 中 **Import** 该仓库  
3. 在 *Project Settings › Environment Variables* 添加：  
4. 文本解析支持 Gemini 和 DeepSeek；图片识别仅支持 Gemini。
   | 变量名 | 必填 | 说明 |
   | :--- | :---: | :--- |
   | `GEMINI_API_KEY` | ❌ | 你的 Gemini API 密钥；也可继续使用旧变量 `API_KEY` |
   | `GEMINI_API_URL` | ❌ | Gemini OpenAI 兼容接口地址；也可继续使用旧变量 `API_URL` |
   | `DEEPSEEK_API_KEY` | ❌ | 你的 DeepSeek API 密钥 |
   | `DEEPSEEK_API_URL` | ❌ | DeepSeek OpenAI 兼容接口地址（留空使用官方默认） |
   | `CODE` | ❌ | 访问密码（设置后需要密码才能使用应用） |

DeepSeek 默认走 `https://api.deepseek.com/chat/completions`，模型为 `deepseek-v4-flash`，并关闭思考模式。选择 DeepSeek 时，上传图片和粘贴图片识别会自动禁用。



## 🤝 如何贡献
我们热忱欢迎任何形式的贡献！

- 🐛 **报告 Bug**：在 Issues 中描述复现步骤  
- 🚀 **提出功能**：新特性 Idea & 需求讨论  
- 💻 **提交代码**：Pull Request  

> 在提交 PR 之前请先创建 Issue 进行沟通，保持方向一致。
---

## 📄 许可证
本项目基于 **[MIT License](LICENSE)** 发布。© 2025 Japanese Analyzer

---

## 📬 联系方式
如有问题，请开一个 Issue 交流

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=cokice/japanese-analyzer&type=Date)](https://www.star-history.com/#cokice/japanese-analyzer&Date)

# 模型服务与语音服务

设置上方的「模型服务」用于解析、翻译、图片提取和对话；下方的「语音服务」独立管理朗读。选择默认语音服务后，原文与词语详情都会使用它。输入区的语音菜单可快速切换服务和音色。

每项语音服务保存一组地址、密钥、模型、音色和语速。同一厂商可以添加多个配置，以使用不同模型或音色。新增和编辑不会在取消时留下配置；只有点击外层「保存设置」才写入持久存储。输入区快捷切换则立即保存。

内置 Edge 保留原有免费朗读接口及男女声、语速设置。其他预设为：

| 接口类型 | 默认模型 | 地址填写方式 |
| --- | --- | --- |
| Gemini | `gemini-3.1-flash-tts-preview` | `https://generativelanguage.googleapis.com/v1beta` 或完整 `models/<model>:generateContent` 地址 |
| OpenAI 兼容 | `gpt-4o-mini-tts` | `https://api.openai.com/v1` 或完整 `/audio/speech` 地址 |
| MiniMax | `speech-2.8-hd` | `https://api.minimax.cn/v1` 或完整 `/t2a_v2` 地址；国际区可改为 `https://api.minimax.io/v1` |

模型和音色可以自由填写；服务商仍需支持所选接口协议。MiniMax 默认使用日语音色 `Japanese_KindLady`。试听会真实合成一段短日语，可能收费；保存不要求先试听。OpenAI 语音接口每次最多 4096 字符，超出时应分段朗读。Gemini 使用提示风格，其他自定义服务支持 0.5–2 倍语速。

配置保存在浏览器 `speechSettings` 中，与聊天模型的密钥分开。旧 `ttsProvider`、`geminiApiKey`、`ttsVoice` 会迁移；删除当前语音服务会回到内置 Edge。服务端仅在默认 Google 地址上允许沿用 `GEMINI_API_KEY`，不会向自定义网关转发服务器的密钥。

服务端统一返回 base64 音频和 MIME 类型：OpenAI/Edge 使用音频文件，MiniMax 将 hex 转为 base64，Gemini 保留响应音频格式。客户端只给原始 PCM 加 WAV 头，不再把 MP3 或完整 WAV 当作 PCM。

模型服务预设新增 MiniMax-M2.7，使用其 OpenAI 兼容接口，并启用 `reasoning_split`，防止思考标签混入解析 JSON 与译文。

协议依据：[MiniMax 对话](https://platform.minimax.cn/docs/api-reference/text-openai-api)、[MiniMax 语音](https://platform.minimax.cn/docs/api-reference/speech-t2a-http)、[MiniMax 官方音色目录](https://github.com/MiniMax-AI/skills/blob/main/skills/frontend-dev/references/minimax-voice-catalog.md)、[OpenAI speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create)、[Gemini speech](https://ai.google.dev/gemini-api/docs/speech-generation)。

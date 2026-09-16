# 伴读书童 (Read Buddy)

<div align="center">

<img src="./assets/readbuddy.png" alt="Read Buddy Logo" width="120" height="120" />

### 一款本地优先（Local-First）、去中心化的 AI 浏览器语言学习助手

基于前沿 FSRS 记忆曲线算法 · 私有 WebDAV 同步 · 自带 API Key / 本地模型 · 网页沉浸式双语阅读

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)
[![Framework: WXT](https://img.shields.io/badge/Framework-WXT-orange.svg)](https://wxt.dev)
[![AI Engine: Vercel AI SDK](https://img.shields.io/badge/AI%20SDK-v4-black.svg)](https://sdk.vercel.ai)
[![Algorithm: FSRS](https://img.shields.io/badge/Algorithm-FSRS%20Spaced%20Repetition-emerald.svg)](https://github.com/open-spaced-repetition/fsrs.js)

</div>

---

## 📌 项目渊源与上游致谢 (Upstream Attribution)

本项目是基于优秀开源项目 **[Read Frog (陪读蛙)](https://github.com/mengxi-ream/read-frog)** 进行深度重构与功能演进的独立分支版本。

在此，衷心感谢 **Read Frog** 原作者 **[mengxi-ream](https://github.com/mengxi-ream)** 以及所有上游社区贡献者构建的卓越阅读翻译基石！

### 为什么演进出「伴读书童」？

上游 Read Frog 引入了中心化服务器、付费会员订阅制度（Free/Pro/Ultra）、云端账户登录以及集中式托管代理。在实际使用中，这带来了网络依赖、账号登录屏障、隐私担忧以及云端服务失效等问题。

**伴读书童 (Read Buddy)** 秉持 **「纯粹、私密、本地优先」** 的设计哲学，彻底去中心化，并进一步补齐了语言学习中最关键的 **科学遗忘曲线记忆闭环**：

| 维度                   | 上游 Read Frog                            | 伴读书童 (Read Buddy)                                         |
| :--------------------- | :---------------------------------------- | :------------------------------------------------------------ |
| **账户系统**           | 强制中心化登录 (better-auth)              | **完全无账号 / 纯本地运行**，即装即用                         |
| **付费订阅与功能限制** | 商业会员分级 (Free/Pro/Ultra)，非会员受限 | **100% 完全开放**，无功能门槛，无付费墙                       |
| **AI 调用机制**        | 依赖官方云端代理中转                      | **自备 Key (BYOK) 或本地模型 (Ollama)**，零中间商截留隐私     |
| **生词本存储**         | 云端 Notebase 集中存储                    | **Local-First 本地离线词典**，毫秒级读写                      |
| **多端数据同步**       | 绑定官方云端同步                          | **通用 WebDAV 双文件同步**（支持坚果云、Nextcloud 等私有盘）  |
| **复习与记忆算法**     | 依赖云端简单卡片复习                      | **内置 FSRS 间隔重复算法**（Popup 快捷复习 + 沉浸大卡片模式） |

---

## ✨ 核心特性

### 🧠 1. 本地优先生词本与 FSRS 科学记忆系统

不再只是“查完即忘”。伴读书童内置了基于现代认知科学的 **FSRS (Free Spaced Repetition Scheduler) 自由间隔重复记忆算法**：

- **主动回忆卡片流**：复习卡片正面仅展示单词、发音与词性，杜绝提前“剧透”释义；点击难度按钮或按键盘 `1-4` 即可自动翻转至背面，展现上下文例句与详细释义。
- **Popup 弹窗双 Tab 架构**：
  - `[翻译配置]`：日常沉浸翻译与 AI 选项配置。
  - `[本地学习]`：实时显示今日待复习红点徽标，支持利用碎片化时间快速刷完一组生词。
- **全屏沉浸大卡片模式**：
  - 在选项页（`#/dictionary?mode=review`）提供大屏专属沉浸复习界面。
  - **全键盘盲操支持**：`1-4`（重来/困难/良好/简单）评级并翻面，`Space`/`Enter` 直接提交并切换下一张，指不离键盘流畅刷词。
  - 结算界面智能展示本次复习掌握度分布（重来、困难、良好、简单），支持“再来一组”与无缝退回生词本。

### ☁️ 2. 私有安全 WebDAV 双文件同步与冲突协调

无需在第三方服务器上传或备份您的学习记录，数据牢牢掌握在自己手中：

- **独立伴随文件机制**：词典主数据 (`readbuddy.json`) 与复习记忆状态 (`readbuddy-reviews.json`) 分离同步，互不污染。
- **最后复习优胜 (Last-Review-Wins)**：多设备并发复习同一单词时，自动比对最后复习时间戳智能合并，确保学习进度永不丢失。
- **回收站级联清理**：在生词本回收站中彻底粉碎单词时，自动清理关联的复习进度，告别垃圾孤儿数据。

### 🌐 3. 卓越的沉浸式网页翻译与上下文感知

- **双语对照 / 仅译文自由切换**：阅读时随时切换双语对照排版或纯译文视图。
- **上下文感知翻译 (Context-Aware)**：自动提取网页标题及周围上下文语境传给大模型，彻底解决专有名词、行业黑话和多义词断章取义的问题。
- **智能节点批量请求**：利用智能合并批处理算法与退避重试，大幅降低大模型 Token 开销并提速 70% 以上。

### 🪄 4. 划词工具栏与自定义 AI Actions

- **灵活定制的 AI 工具箱**：选中任意文本即可唤出快捷工具栏。内置查词典、语法润色、长句解析等模板。
- **结构化输出自动入库**：支持自定义 Prompt 并输出结构化 JSON 字段，查词结果一键保存进本地生词本。

### 🎬 5. YouTube 双语视频字幕实时翻译

- 无需耗费昂贵的音视频转录费用，直接挂载播放器原生字幕流，利用大模型实时双语对照呈现，看生肉视频如履平地。

### 🔊 6. 免费高质量 Edge TTS 语音朗读

- 内置集成微软 **Edge TTS** 引擎，完全免费！覆盖 80+ 种语言、150+ 款拟真人声。
- 自动语种识别、自然句式切片朗读，打造听力训练与跟读磨耳朵神器。

### 🤖 7. 20+ 款大模型全面支持 (BYOK)

基于成熟稳定的 Vercel AI SDK 构建，支持用户填入自有 API Key：

- **主流商用模型**：OpenAI (GPT-4o/o3)、Anthropic Claude、Google Gemini、DeepSeek、xAI Grok、Mistral、Groq、Moonshot 等。
- **本地离线模型**：完美直连本地 **Ollama**，断网亦能顺畅翻译学习！
- **免费翻译服务**：内置 Google Translate、Microsoft Translate、DeepLX 等免 Key 翻译兜底通道。

---

## 🚀 快速上手与编译运行

### 环境准备

- Node.js >= 20.0.0
- pnpm >= 9.0.0

### 安装依赖

```bash
git clone https://github.com/yemangran/readbuddy.git
cd readbuddy
pnpm install
```

### 生产编译（以 Chrome MV3 为例）

由于本分支去除了第三方上游分析与云服务凭证，编译时建议开启环境变量跳过非必要验证：

- **Windows (PowerShell)**:
  ```powershell
  $env:WXT_SKIP_ENV_VALIDATION="true"; pnpm run build
  ```
- **macOS / Linux**:
  ```bash
  WXT_SKIP_ENV_VALIDATION=true pnpm run build
  ```

编译产物将输出在 `.output/chrome-mv3/` 目录中。

### 本地实时热重载开发 (Dev Mode)

```bash
pnpm dev
```

此命令将自动调起预装了扩展的独立 Chrome 实例，代码改动后实时重载。

### 在日常浏览器中加载使用

1. 打开 Chrome、Edge 或基于 Chromium 的浏览器，在地址栏输入：
   - Chrome：`chrome://extensions`
   - Edge：`edge://extensions`
2. 打开右上角的 **「开发者模式 (Developer Mode)」**。
3. 点击左上角 **「加载已解压的扩展程序 (Load unpacked)」**。
4. 选中项目中的构建产物目录：`readbuddy/.output/chrome-mv3`。
5. 在浏览器插件栏固定 **伴读书童 (Read Buddy)** 即可开启高效学习！

---

## 🧪 自动化测试与质量保障

项目严格遵循测试驱动开发（TDD）规范，包含全面的单元测试、模拟快照与端到端状态验证：

```powershell
# 运行全量测试套件（跳过外部 live API）
$env:SKIP_FREE_API="true"; pnpm test

# 静态类型检查与代码规范
pnpm run type-check
pnpm run lint
```

---

## 📄 开源许可证 (License)

本项目继承上游项目的开源精神，遵循 **[GPL-3.0 License](./LICENSE)** 协议开源。

- 允许自由使用、分发与修改代码。
- 任何基于本项目的衍生作品必须保持以 GPL-3.0 协议开源。
- 本项目严正声明不包含上游的商业闭源许可扩展，所有代码与架构对社区 100% 透明。

---

<div align="center">

**伴读书童 · 陪伴你的每一次深度阅读与词汇进阶**

如果觉得好用，欢迎点一个 ⭐️ 支持一下！

</div>

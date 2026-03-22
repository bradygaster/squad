# Squad (AI 开发小队)

**为任何项目打造的 AI 智能体团队。** 一行命令，拥有一个随代码同步成长的开发团队。

[![状态](https://img.shields.io/badge/status-alpha-blueviolet)](#status)
[![平台](https://img.shields.io/badge/platform-GitHub%20Copilot-blue)](#what-is-squad)

> ⚠️ **Alpha 预览版** — Squad 仍处于实验阶段。API 和命令行工具可能在版本更迭中发生变化。我们会在 [CHANGELOG.md](CHANGELOG.md) 中记录重大变更。

---

## 什么是 Squad?

Squad 通过 GitHub Copilot 为你提供一支 AI 开发团队。只需描述你正在构建的内容，即可获得一支由专家组成的小队 —— 前端、后端、测试、组长 —— 它们以文件形式存在于你的仓库中。它们能够跨会话持久存在，学习你的代码库，共享决策，并且用得越多就越聪明。

这不仅仅是一个“戴着不同帽子”的聊天机器人。团队中的每个成员都在独立的上下文中运行，只读取属于自己的知识库，并将学到的内容写回。

---

## 快速开始

### 1. 创建项目

```bash
mkdir my-project && cd my-project
git init
```

**✓ 验证：** 运行 `git status` — 你应该看到 "No commits yet"。

### 2. 安装 Squad

```bash
npm install -g @bradygaster/squad-cli
squad init
```

**✓ 验证：** 检查项目中是否创建了 `.squad/team.md`。

**或者使用 npx (无需安装)：** `npx @bradygaster/squad-cli` — 如果是从旧版本升级，请参考 [迁移指南](https://bradygaster.github.io/squad/docs/get-started/migration/)。

### 3. 登录 GitHub (用于 Issue、PR 和监控)

```bash
gh auth login
```

**✓ 验证：** 运行 `gh auth status` — 你应该看到 "Logged in to github.com"。

### 4. 开启 Copilot 开启工作

```
copilot --agent squad --yolo
```

> **为什么使用 `--yolo`？** Squad 在典型会话中会进行大量工具调用。不使用该选项，Copilot 会提示你逐一批准每一个调用。

**在 VS Code 中**，打开 Copilot Chat 并选择 **Squad** 智能体。

然后输入：

```
I'm starting a new project. Set up the team.
Here's what I'm building: a recipe sharing app with React and Node.
（我正在启动一个新项目。请组建团队。我要构建的是一个基于 React 和 Node 的食谱分享应用。）
```

**✓ 验证：** Squad 会返回团队成员建议。输入 `yes` 确认 —— 它们就准备好开工了。

Squad 会提议一个团队 —— 每个成员的名字都来自一个持久化的主题演员表（Cast）。你只需说 **yes**，它们就位。

---

## 所有命令 (15 条指令)

| 命令 | 功能描述 |
|---------|-------------|
| `squad init` | **初始化** — 在当前目录初始化 Squad（幂等操作 — 可安全运行多次）；别名：`hire`；使用 `--global` 在个人目录初始化，`--mode remote <path>` 开启双根模式 |
| `squad upgrade` | 将 Squad 相关文件更新至最新版；绝不会触动你的团队状态；别名：`upgrade`；使用 `--migrate-directory` 可将 `.ai-team/` 重命名为 `.squad/` |
| `squad status` | 显示当前活跃的小队及其状态 |
| `squad triage` | 监控 Issue 并自动分发给团队成员（别名：`watch`, `loop`）；使用 `--interval <minutes>` 设置轮询频率（默认 10 分钟） |
| `squad copilot` | 添加/移除 Copilot 编码智能体 (@copilot)；使用 `--off` 移除，`--auto-assign` 开启自动分配 |
| `squad doctor` | 检查环境配置并诊断问题（别名：`heartbeat`） |
| `squad link <team-repo-path>` | 连接到远程团队仓库 |
| `squad shell` | 显式启动交互式 Shell |
| `squad export` | 将小队状态导出为可移植的 JSON 快照 |
| `squad import <file>` | 从导出文件导入小队状态 |
| `squad plugin marketplace add\|remove\|list\|browse` | 管理插件市场 |
| `squad upstream add\|remove\|list\|sync` | 管理上游 Squad 源码 |
| `squad nap` | 上下文清理 — 压缩、剪枝、归档；使用 `--deep` 进行深度压缩，`--dry-run` 预览更改 |
| `squad aspire` | 打开 Aspire 仪表盘以进行可观测性监控 |
| `squad scrub-emails [directory]` | 从状态文件中移除电子邮件地址（默认目录：`.squad/`） |

---

## 交互式 Shell

厌倦了每次都输入 `squad` 加命令？进入交互式 Shell。

### 进入 Shell

```bash
squad
```

不带任何参数。只需输入 `squad`。你会看到提示符：

```
squad >
```

你现在已经连接到了你的团队。直接和它们对话。

### Shell 命令

所有 Shell 命令均以 `/` 开头：

| 命令 | 功能描述 |
|---------|-------------|
| `/status` | 检查团队状态及当前进度 |
| `/history` | 查看近期消息记录 |
| `/agents` | 列出所有团队成员 |
| `/sessions` | 列出已保存的会话 |
| `/resume <id>` | 恢复之前的会话 |
| `/version` | 显示版本号 |
| `/clear` | 清屏 |
| `/help` | 显示所有命令 |
| `/quit` | 退出 Shell (或 Ctrl+C) |

### 与智能体对话

使用 `@智能体名称` (不区分大小写) 或使用逗号的自然语言：

```
squad > @Keaton, 分析这个项目的架构
squad > McManus, 为我们的新特性写一篇博客
squad > 构建登录页面
```

协调员（Coordinator）会将消息路由给正确的智能体。多个智能体可以并行工作 —— 你可以实时看到进度。

---

## 智能体并行工作 —— 你只需在准备好时验收

Squad 并不遵循人类的作息。当你下达任务时，协调员会启动每一个可以立即开始工作的智能体。

```
你: "团队，构建登录页面"

  🏗️ Lead (组长) — 正在分析需求...          ⎤
  ⚛️ Frontend (前端) — 正在构建登录表单...   ⎥ 全部同时
  🔧 Backend (后端) — 正在设置认证接口...   ⎥ 并行启动
  🧪 Tester (测试) — 正在编写测试用例...     ⎥
  📋 Scribe (书记员) — 正在记录一切...       ⎦
```

当智能体完成工作后，协调员会立即链式启动后续任务。如果你走开了，回来时会看到完整的记录：

- **`decisions.md`** — 每个智能体所做的每一项决策
- **`orchestration-log/`** — 启动了什么，为什么启动，以及发生了什么
- **`log/`** — 完整的会话历史，支持搜索

**知识跨会话积累。** 智能体每次工作时，都会将学到的经验写入其 `history.md`。经过几次会话后，智能体将熟悉你的规范、偏好和架构。它们不再询问已经回答过的问题。

**这一切都在 git 中。** 任何克隆你仓库的人都能获得这支团队 —— 以及它们积累的所有知识。

---

## 会创建哪些文件？

```
.squad/
├── team.md              # 花名册 — 团队成员
├── routing.md           # 路由规则 — 谁处理什么任务
├── decisions.md         # 共享大脑 — 团队决策
├── ceremonies.md        # 冲刺仪式配置
├── casting/
│   ├── policy.json      # 选角配置
│   ├── registry.json    # 持久化名称注册表
│   └── history.json     # 使用历史
├── agents/
│   ├── {name}/
│   │   ├── charter.md   # 身份、专长、语调
│   │   └── history.md   # 它们对你的项目的了解
│   └── scribe/
│       └── charter.md   # 静默记忆管理器
├── skills/              # 从工作中压缩出的技能
├── identity/
│   ├── now.md           # 团队当前焦点
│   └── wisdom.md        # 可复用的模式
└── log/                 # 会话历史 (可搜索的归档)
```

**提交此文件夹。** 你的团队和名字将持久化。任何克隆仓库的人都能看到同一批“演员”。

---

## 核心架构：可编程智能体运行时 (SDK)

Squad 的关键在于 **SDK 编排 (v0.6+)**：规则是代码，会话是对象，路由经过编译，工具在运行前经过验证。

```
Router.matchRoute(message) → { agent: 'Keaton', priority: 'high' }
TypeScript 清楚地知道哪个智能体将运行，拥有什么权限。
HookPipeline 在工具执行前运行文件写入守卫。
没有解释，没有歧义。只有代码。
```

### 自定义工具

- **`squad_route`** — 将任务移交给另一个智能体。
- **`squad_decide`** — 记录团队决策。每个智能体在开工前都会阅读 `decisions.md`。
- **`squad_memory`** — 追记智能体历史。
- **`squad_status`** — 查询会话池状态。
- **`squad_skill`** — 读写智能体技能。技能是压缩后的经验知识。

### 钩子流水线 (Hook Pipeline)

规则不再存在于提示词中，而是在工具执行前运行。
- **文件写入守卫**：限制智能体只能写入 `src/`, `.squad/`, `docs/` 等安全区域。
- **PII 脱敏**：自动漂白敏感信息（如电子邮件），防止其泄露给模型。
- **评审者锁定**：如果测试员拒绝了代码，原作者无法私自修改，必须由另一评审者处理。
- **用户询问速率限制**：防止智能体因等待用户输入而停滞。

---

## 技术栈

| 组件 | 版本 | 原因 |
|------|---------|-----|
| **Node.js** | ≥ 20.0.0 | 稳定的异步支持及强大的 TypeScript 生态 |
| **TypeScript** | 5.7+ | 所有工具、会话、钩子均具备完整类型定义 |
| **@github/copilot-sdk** | v0.1.8+ | 实时智能体流式传输与工具执行 |
| **Vitest** | 3.0+ | 快速并行的测试运行器 |
| **esbuild** | 0.25+ | 高效打包与死代码消除 |

---

## 已知局限性

- **Alpha 阶段** — API 和文件格式可能变更。
- **Node 20+** — 必须使用 Node.js 20.0.0 或更高版本。
- **GitHub Copilot CLI & VS Code** — 支持在命令行和编辑器中使用。
- **必需 `gh` CLI** — 许多功能依赖于 `gh auth login`。
- **能力随使用而增长** — 初始会话能力有限，随着历史积累而变强。

---

## 参与贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 许可证

MIT

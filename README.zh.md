# Squad (AI 开发小队)

[English](README.md) | [中文](README.zh.md)

**为任何项目打造的 AI 智能体团队。** 一行命令，拥有一个随代码同步成长的开发团队。

[![状态](https://img.shields.io/badge/status-alpha-blueviolet)](#status)
[![平台](https://img.shields.io/badge/platform-GitHub%20Copilot-blue)](#what-is-squad)

> ⚠️ **Alpha 预览版** — Squad 仍处于实验阶段。API 和命令行工具可能在版本更迭中发生变化。我们会在 [CHANGELOG.md](CHANGELOG.md) 中记录重大变更。

---

## 什么是 Squad?

Squad 通过 GitHub Copilot 为你提供一支 AI 开发团队。只需描述你正在构建的内容，即可获得一支由专家组成的小队 —— 前端、后端、测试、组长 —— 它们以文件形式存在于你的仓库中。它们能够跨会话持久存在，学习你的代码库，共享决策，并且用得越多就越聪明。

这不仅仅是一个"戴着不同帽子"的聊天机器人。团队中的每个成员都在独立的上下文中运行，只读取属于自己的知识库，并将学到的内容写回。

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

### 3. 登录 GitHub (用于 Issue、PR 和 Ralph)

```bash
gh auth login
```

**✓ 验证：** 运行 `gh auth status` — 你应该看到 "Logged in to github.com"。

### 4. 打开 Copilot 开始工作

```
copilot --agent squad --yolo
```

> **为什么使用 `--yolo`？** Squad 在典型会话中会进行大量工具调用。不使用该选项，Copilot 会提示你逐一批准每一个调用。

**在 VS Code 中**，打开 Copilot Chat 并选择 **Squad** 智能体。

然后输入：

```
I'm starting a new project. Set up the team.
Here's what I'm building: a recipe sharing app with React and Node.
```

**✓ 验证：** Squad 会返回团队成员建议。输入 `yes` 确认 —— 它们就准备好开工了。

Squad 会提议一个团队 — 每个成员的名字都来自一个持久化的主题演员表（Casting）。你只需说 **yes**，它们就绪。

---

## 升级

升级 Squad 需要两步操作。

**第一步：更新 CLI 二进制文件**

```bash
npm install -g @bradygaster/squad-cli@latest
```

**第二步：更新项目中 Squad 管理的文件**

```bash
squad upgrade
```

`squad upgrade` 会将 `squad.agent.md`、模板和 GitHub 工作流更新到最新版本。它绝不会触动你的 `.squad/` 团队状态——你的智能体、决策和历史记录始终保持不变。

使用 `--force` 可以强制重新应用更新，即使当前安装的版本已经是最新版本。

---

## 所有命令 (15 条指令)

| 命令 | 功能描述 |
|---------|-------------|
| `squad init` | **初始化** — 在当前目录初始化 Squad（幂等操作 — 可安全运行多次）；别名：`hire`；使用 `--global` 在个人 squad 目录初始化，`--mode remote <path>` 开启双根模式 |
| `squad upgrade` | 将 Squad 管理的文件更新至最新版；绝不会触动你的团队状态；使用 `--global` 升级个人 squad，`--migrate-directory` 将 `.ai-team/` 重命名为 `.squad/` |
| `squad status` | 显示当前活跃的小队及其原因 |
| `squad triage` | 监控 issue 并自动分发给团队（别名：`watch`、`loop`）；使用 `--interval <minutes>` 设置轮询频率（默认 10 分钟） |
| `squad copilot` | 添加/移除 Copilot 编码智能体 (@copilot)；使用 `--off` 移除，`--auto-assign` 启用自动分配 |
| `squad doctor` | 检查环境配置并诊断问题（别名：`heartbeat`） |
| `squad link <team-repo-path>` | 连接到远程团队仓库 |
| `squad shell` | **已弃用** — 显式启动交互式 shell。请改用 `copilot --agent squad`。 |
| `squad export` | 将小队导出为可移植的 JSON 快照 |
| `squad import <file>` | 从导出文件导入小队 |
| `squad plugin marketplace add\|remove\|list\|browse` | 管理插件市场 |
| `squad upstream add\|remove\|list\|sync` | 管理上游 Squad 源 |
| `squad nap` | 上下文清理 — 压缩、剪枝、归档；使用 `--deep` 进行深度压缩，`--dry-run` 预览更改 |
| `squad aspire` | 打开 Aspire 仪表盘进行可观测性监控 |
| `squad scrub-emails [directory]` | 从 Squad 状态文件中移除电子邮件地址（默认目录：`.squad/`） |

---

## 交互式 Shell

> ⚠️ **已弃用：** 交互式 shell（`squad` 无参数）已弃用。为了获得最佳的 Squad 体验，请改用 [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli)。
>
> ```bash
> copilot --agent squad
> ```
>
> 详见[选择您的界面](docs/src/content/docs/get-started/choose-your-interface.md)了解当前选项。

厌倦了每次都输入 `squad` 加命令？进入交互式 shell。

### 进入 Shell

```bash
squad
```

不带参数，只需 `squad`。你会看到提示符：

```
squad >
```

你现在已连接到团队。与它们交流。

### Shell 命令

所有 shell 命令以 `/` 开头：

| 命令 | 功能描述 |
|---------|-------------|
| `/status` | 检查团队状态和当前进展 |
| `/history` | 查看最近消息记录 |
| `/agents` | 列出所有团队成员 |
| `/sessions` | 列出已保存的会话 |
| `/resume <id>` | 恢复过往的会话 |
| `/version` | 显示版本号 |
| `/clear` | 清屏 |
| `/help` | 显示所有命令 |
| `/quit` | 退出 shell (或 Ctrl+C) |

### 与智能体交流

使用 `@智能体名称` (不区分大小写) 或使用自然语言并加逗号：

```
squad > @Keaton, 分析这个项目的架构
squad > McManus, 为我们的新特性写一篇博客
squad > 构建登录页
```

协调员（Coordinator）会将消息路由给合适的智能体。多个智能体可以并行工作 —— 你会实时看到进展。

### Shell 的功能

- **实时可见性：** 看到智能体工作中、决策被记录、阻塞情况实时发生
- **消息路由：** 描述你的需求；协调员会找出谁应该处理
- **并行执行：** 多个智能体同时处理独立任务
- **会话持久性：** 如果智能体崩溃，它会从检查点恢复；你永远不会丢失上下文
- **决策日志：** 每个决策都会记录在 `.squad/decisions.md` 中，供整个团队查看

更多 shell 使用详情，请参阅上面的命令表。

## 示例

八个可运行的示例，从入门到进阶 —— 选角（casting）、治理、流式传输、Docker。请参阅 [samples/README.md](samples/README.md)。

---

## 智能体并行工作 — 你可以随时查看

Squad 不按人类的时间表工作。当你分配任务时，协调员会同时启动所有可以有效开始的智能体。

```
你: "团队，构建登录页"

  🏗️ Lead（组长） — 正在分析需求...          ⎤
  ⚛️ Frontend（前端） — 正在构建登录表单...   ⎥ 全部同时
  🔧 Backend（后端） — 正在设置认证端点...    ⎥ 并行启动
  🧪 Tester（测试） — 正在从规范编写测试...   ⎥
  📋 Scribe（书记员） — 正在记录一切...       ⎦
```

当智能体完成时，协调员会立即链接后续工作。如果你离开，当你回来时会有一份记录在等：

- **`decisions.md`** — 每个智能体做出的每个决策
- **`orchestration-log/`** — 启动了什么、为什么启动、发生了什么
- **`log/`** — 完整的会话历史，可搜索

**知识在会话间累积。** 每次智能体工作时，它都会将持久性学习写入 `history.md`。经过几次会话后，智能体会了解你的约定、偏好、架构。它们不再问已经回答过的问题。

**而且这一切都在 git 中。** 任何克隆你仓库的人都会获得团队 —— 以及它们累积的所有知识。

---

## 创建了哪些文件？

```
.squad/
├── team.md              # 花名册 — 团队成员
├── routing.md           # 路由规则 — 谁处理什么
├── decisions.md         # 共享脑海 — 团队决策
├── ceremonies.md        # 敏捷仪式配置
├── casting/
│   ├── policy.json      # 选角配置
│   ├── registry.json    # 持久化名字注册表
│   └── history.json     # 使用历史
├── agents/
│   ├── {name}/
│   │   ├── charter.md   # 身份、专长、声音
│   │   └── history.md   # 它们对你的项目的了解
│   └── scribe/
│       └── charter.md   # 静默记忆管理者
├── skills/              # 从工作中压缩的学习成果
├── identity/
│   ├── now.md           # 当前团队焦点
│   └── wisdom.md        # 可复用模式
└── log/                 # 会话历史（可搜索存档）
```

**提交此文件夹。** 你的团队会持久化。名字会持久化。任何克隆的人都会获得团队 —— 使用相同的演员表。

### SDK 优先模式（Phase 1 新功能）

> ⚠️ **实验性功能。** SDK 优先模式正在积极开发中，存在已知 bug。生产环境团队请使用 markdown 优先模式（默认）。

更喜欢 TypeScript？你可以用代码而不是 markdown 定义团队。创建一个带有构建器函数的 `squad.config.ts`，运行 `squad build`，`.squad/` 文件就会自动生成。

```typescript
// squad.config.ts
import { defineSquad, defineTeam, defineAgent } from '@bradygaster/squad-sdk';

export default defineSquad({
  team: defineTeam({ name: 'Platform Squad', members: ['@edie', '@mcmanus'] }),
  agents: [
    defineAgent({ name: 'edie', role: 'TypeScript Engineer', model: 'claude-sonnet-4' }),
    defineAgent({ name: 'mcmanus', role: 'DevRel', model: 'claude-haiku-4.5' }),
  ],
});
```

运行 `squad build` 生成所有 markdown 文件。完整文档请参阅 [SDK 优先模式指南](docs/src/content/docs/sdk-first-mode.md)。

---

## Monorepo 开发

Squad 是一个包含两个包的 monorepo：
- **`@bradygaster/squad-sdk`** — 核心运行时和可编程智能体编排库
- **`@bradygaster/squad-cli`** — 依赖 SDK 的命令行界面

### 构建

```bash
# 安装依赖（npm workspaces）
npm install

# 将 TypeScript 构建到 dist/
npm run build

# 构建 CLI bundle（dist/ + esbuild → cli.js）
npm run build:cli

# 开发模式的监听
npm run dev
```

### 测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch
```

### Lint

```bash
# 类型检查（不生成文件）
npm run lint
```

### 发布

Squad 使用 [changesets](https://github.com/changesets/changesets) 进行包的独立版本管理：

```bash
# 添加 changeset
npx changeset add

# 验证 changesets
npm run changeset:check
```

Changesets 在 `main` 分支上解析；发布按包独立进行。

---

## SDK 文档

SDK 提供对智能体编排的编程控制 —— 自定义工具、钩子流水线（hook pipelines）、文件写入保护、PII 清理、审阅者锁定和事件驱动监控。

- [SDK API 参考](docs/src/content/docs/reference/sdk.md)
- [自定义工具和钩子指南](docs/src/content/docs/reference/tools-and-hooks.md)
- [扩展性指南](docs/src/content/docs/guide/extensibility.md)
- [示例](samples/README.md) —— 八个从入门到进阶的可运行示例

SDK 安装：`npm install @bradygaster/squad-sdk`

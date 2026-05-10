# 历史粘贴板 - 项目指南

## 项目概述
Windows桌面应用，自动记录剪贴板历史（文字+图片），支持搜索、置顶、删除功能。

## 项目结构

```
历史粘贴板/
├── CLAUDE.md          # 本文件 - 项目总览与入口
├── src/               # 源代码
├── docs/              # 技术文档与规范
│   ├── requirements.md    # 需求文档
│   ├── tech-stack.md      # 技术选型
│   ├── ui-design.md       # UI设计规范
│   └── roadmap.md         # 开发路线图
├── logs/              # 开发日志（按日期）
├── assets/            # 静态资源（图标、样式等）
└── data/              # 用户数据存储（运行时创建）
```

## 关键文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 需求文档 | [docs/requirements.md](docs/requirements.md) | 功能需求详细说明 |
| 技术选型 | [docs/tech-stack.md](docs/tech-stack.md) | 技术方案与依赖 |
| UI设计规范 | [docs/ui-design.md](docs/ui-design.md) | 界面设计标准 |
| 开发路线图 | [docs/roadmap.md](docs/roadmap.md) | 分阶段开发计划 |
| 今日开发日志 | [logs/](logs/) | 按日期记录的开发日志 |

## 开发工作流

1. **每日开始**：查看 [docs/roadmap.md](docs/roadmap.md) 确认当前阶段
2. **开发中**：参考对应阶段的技术文档
3. **每日结束**：在 [logs/](logs/) 创建当日日志，记录完成事项和明日待办

## 当前阶段
见 [docs/roadmap.md](docs/roadmap.md) 中的 "当前阶段"

## 技术栈
- 框架：Electron + React
- 存储：SQLite + 本地文件系统
- UI：Tailwind CSS

# 技术选型文档

## 技术栈

### 桌面应用框架：Electron
**选择理由**：
- 跨平台能力强（虽然只需Windows，但扩展性好）
- 使用 Web 技术开发，开发效率高
- 丰富的 npm 生态
- 成熟的剪贴板 API 支持

**版本**：Electron 28+ (支持最新 Chromium)

### 前端框架：React 18
**选择理由**：
- 组件化开发，代码清晰
- 生态成熟，UI组件丰富
- 性能优秀

### UI 样式：Tailwind CSS
**选择理由**：
- 原子化 CSS，开发快速
- 易于定制主题色
- 打包体积小

### 数据库：SQLite (better-sqlite3)
**选择理由**：
- 轻量级，无需单独服务
- 适合本地数据存储
- Node.js 原生绑定性能好

### 剪贴板监听：clipboard-event
**选择理由**：
- 专门用于 Electron 的剪贴板监听
- 支持文字和图片

### 构建工具：Vite
**选择理由**：
- 启动速度快
- 热更新支持好
- 配置简单

## 项目依赖

### 核心依赖
```json
{
  "electron": "^28.0.0",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "better-sqlite3": "^9.0.0",
  "clipboard-event": "^1.0.0"
}
```

### 开发依赖
```json
{
  "vite": "^5.0.0",
  "@vitejs/plugin-react": "^4.2.0",
  "electron-builder": "^24.0.0",
  "tailwindcss": "^3.4.0"
}
```

## 目录结构

```
src/
├── main/              # Electron 主进程
│   ├── index.js       # 入口
│   ├── clipboard.js   # 剪贴板监听
│   ├── database.js    # 数据库操作
│   ├── tray.js        # 托盘管理
│   └── shortcut.js    # 快捷键注册
├── renderer/          # Electron 渲染进程（React）
│   ├── App.jsx
│   ├── components/    # 组件
│   │   ├── Card.jsx
│   │   ├── CardList.jsx
│   │   ├── SearchBar.jsx
│   │   ├── PinnedWindow.jsx
│   │   └── Settings.jsx
│   ├── hooks/         # 自定义 Hooks
│   └── styles/        # 样式文件
└── preload/           # 预加载脚本
    └── index.js
```

## 关键技术点

### 1. 剪贴板监听
使用 `clipboard-event` 模块监听系统剪贴板变化，区分文字和图片类型。

### 2. 图片处理
- 保存：使用 Node.js `fs` 写入原图
- 缩略图：使用 `sharp` 库生成缩略图

### 3. 置顶窗口
创建独立的 BrowserWindow，设置 `alwaysOnTop: true`，通过 CSS 动画实现展开/收起。

### 4. 数据清理
使用 Node.js `node-cron` 定时任务，每天检查并清理过期数据。

### 5. 开机自启
使用 Electron `app.setLoginItemSettings` API。

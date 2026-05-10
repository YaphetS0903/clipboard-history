# 历史粘贴板

一个简洁的 Windows 桌面剪贴板历史记录工具。

## 功能特性

- **自动记录** - 自动监听剪贴板，保存复制的文字和图片
- **历史搜索** - 快速搜索历史文字内容
- **一键复制** - 点击历史记录即可再次复制
- **桌面置顶** - 置顶内容显示在桌面顶部小条，随时可取
- **可配置保存时长** - 支持 1/3/5 天自动清理
- **可配置置顶条数** - 支持 3/5/10/20 条置顶显示

## 截图

![主界面](./docs/screenshot-main.png)
![置顶条](./docs/screenshot-pinned.png)

## 技术栈

- Electron - 桌面应用框架
- React - UI 框架
- Vite - 构建工具
- Tailwind CSS - 样式框架

## 开发

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev

# 构建
npm run build

# 打包 Electron 应用
npm run build:electron
```

## 项目结构

```
clipboard-history/
├── src/
│   ├── main/          # Electron 主进程
│   ├── preload/       # 预加载脚本
│   └── renderer/      # React 渲染进程
├── docs/              # 文档
├── logs/              # 开发日志
└── data/              # 运行时数据（自动创建）
```

## 待开发功能

- [ ] 开机自启动
- [ ] 全局快捷键
- [ ] 系统托盘图标
- [ ] 图片缩略图优化

## License

MIT

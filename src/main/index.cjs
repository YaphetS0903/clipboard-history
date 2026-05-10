const { app, BrowserWindow, ipcMain, clipboard, nativeImage, screen, Menu, Tray, globalShortcut } = require('electron')
const path = require('path')
const fs = require('fs')
const {
  ensureDataFiles,
  getItemsForRenderer,
  getPinnedItemsForRenderer,
  getItemById,
  deleteItem,
  getSettings,
  setRetentionDays,
  setMaxPinnedItems,
  setPasteShortcutKey,
  setShowPinnedBar,
  togglePinned,
} = require('./store.cjs')
const {
  startClipboardMonitor,
  stopClipboardMonitor,
  setIgnoredClipboardSignature,
} = require('./clipboard-service.cjs')

let mainWindow = null
let pinnedWindow = null
let pinnedWindowExpanded = false
let isPinnedWindowDragging = false
let tray = null
let inputDialogCallback = null
let pasteIndex = 0 // 粘贴快捷键的索引

function getWorkArea() {
  return screen.getPrimaryDisplay().workArea
}

function getPinnedWindowSize() {
  return pinnedWindowExpanded
    ? { width: 220, height: 300 }
    : { width: 88, height: 18 }
}

function clampPinnedWindowToTop(windowInstance) {
  if (!windowInstance || windowInstance.isDestroyed() || isPinnedWindowDragging) {
    return
  }

  const workArea = getWorkArea()
  const bounds = windowInstance.getBounds()
  const size = getPinnedWindowSize()

  // 收起态：固定在顶部，只能左右移动
  if (!pinnedWindowExpanded) {
    const nextX = Math.min(
      Math.max(bounds.x, workArea.x),
      workArea.x + workArea.width - size.width,
    )
    windowInstance.setBounds({
      x: nextX,
      y: workArea.y + 6,
      width: size.width,
      height: size.height,
    })
  } else {
    // 展开态：可以自由移动，但不超出屏幕
    const nextX = Math.min(
      Math.max(bounds.x, workArea.x),
      workArea.x + workArea.width - size.width,
    )
    const nextY = Math.min(
      Math.max(bounds.y, workArea.y),
      workArea.y + workArea.height - size.height,
    )
    windowInstance.setBounds({
      x: nextX,
      y: nextY,
      width: size.width,
      height: size.height,
    })
  }
}

function sendHistoryUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('history-updated')
  }

  if (pinnedWindow && !pinnedWindow.isDestroyed()) {
    pinnedWindow.webContents.send('pinned-history-updated')
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }

  // 如果窗口已显示，则隐藏；否则显示
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  }
}

function getPinnedWindowBounds() {
  const workArea = getWorkArea()
  const size = getPinnedWindowSize()

  return {
    width: size.width,
    height: size.height,
    x: Math.max(workArea.x, workArea.x + workArea.width - size.width - 12),
    y: workArea.y + 6,
  }
}

function buildApplicationMenu() {
  const settings = getSettings()
  const autoLaunchEnabled = isAutoLaunchEnabled()

  const template = [
    {
      label: '文件',
      submenu: [
        { label: '显示/隐藏主窗口', click: () => showMainWindow() },
        { type: 'separator' },
        { label: '退出', click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.removeAllListeners('close')
          }
          app.quit()
        }},
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '设置',
      submenu: [
        {
          label: '保存时长',
          submenu: [
            { label: '1天', type: 'radio', checked: settings.retentionDays === 1, click: () => updateRetentionDays(1) },
            { label: '3天', type: 'radio', checked: settings.retentionDays === 3, click: () => updateRetentionDays(3) },
            { label: '5天', type: 'radio', checked: settings.retentionDays === 5, click: () => updateRetentionDays(5) },
          ],
        },
        {
          label: '置顶显示条数...',
          click: () => showMaxPinnedItemsDialog(),
        },
        {
          label: '粘贴快捷键...',
          click: () => showPasteShortcutDialog(),
        },
        { type: 'separator' },
        {
          label: '开机自启动',
          type: 'checkbox',
          checked: autoLaunchEnabled,
          click: () => toggleAutoLaunch(),
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '刷新', role: 'reload' },
        { label: '强制刷新', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        {
          label: '显示置顶条',
          type: 'checkbox',
          checked: settings.showPinnedBar,
          click: () => toggleShowPinnedBar(),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function updateRetentionDays(days) {
  setRetentionDays(days)
  buildApplicationMenu()
  sendHistoryUpdate()
}

function showMaxPinnedItemsDialog() {
  const settings = getSettings()
  createInputDialog('置顶显示条数', '请输入置顶显示条数 (1-50):', settings.maxPinnedItems, 'number', (value) => {
    const num = parseInt(value, 10)
    if (num >= 1 && num <= 50) {
      setMaxPinnedItems(num)
      buildApplicationMenu()
      ensurePinnedWindowVisibility()
      sendHistoryUpdate()
    }
  })
}

function showPasteShortcutDialog() {
  const settings = getSettings()
  createInputDialog('粘贴快捷键', '请输入快捷键字母 (A-Z):', settings.pasteShortcutKey, 'text', (value) => {
    const key = value.toUpperCase()
    if (/^[A-Z]$/.test(key)) {
      setPasteShortcutKey(key)
      registerGlobalShortcut()
      buildApplicationMenu()
    }
  })
}

function toggleShowPinnedBar() {
  const settings = getSettings()
  const newValue = !settings.showPinnedBar
  setShowPinnedBar(newValue)
  buildApplicationMenu()

  if (newValue) {
    ensurePinnedWindowVisibility()
  } else {
    if (pinnedWindow && !pinnedWindow.isDestroyed()) {
      pinnedWindow.hide()
    }
  }
}

function createInputDialog(title, message, defaultValue, inputType, callback) {
  inputDialogCallback = callback

  const inputWindow = new BrowserWindow({
    width: 360,
    height: 160,
    parent: mainWindow,
    modal: true,
    show: false,
    autoHideMenuBar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#F5F9FF',
    title: title,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.cjs'),
      additionalArguments: ['--window-role=input-dialog'],
    },
  })

  const inputAttrs = inputType === 'number'
    ? 'type="number" min="1" max="50"'
    : 'type="text" maxlength="1" style="text-transform: uppercase;"'

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
          padding: 24px;
          margin: 0;
          background: #F5F9FF;
        }
        p {
          margin: 0 0 12px;
          color: #333;
          font-size: 14px;
        }
        input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #cfe0f6;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
          background: #fff;
        }
        input:focus {
          border-color: #7fb5f7;
          box-shadow: 0 0 0 3px rgba(127, 181, 247, 0.15);
        }
        .buttons {
          margin-top: 20px;
          text-align: right;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        button {
          padding: 8px 20px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          border: none;
        }
        .btn-cancel {
          background: #f0f4f8;
          color: #666;
        }
        .btn-cancel:hover {
          background: #e4eaf0;
        }
        .btn-confirm {
          background: #5ba4f5;
          color: white;
        }
        .btn-confirm:hover {
          background: #4a93e4;
        }
      </style>
    </head>
    <body>
      <p>${message}</p>
      <input ${inputAttrs} id="input" value="${defaultValue}" />
      <div class="buttons">
        <button class="btn-cancel" id="cancelBtn">取消</button>
        <button class="btn-confirm" id="confirmBtn">确定</button>
      </div>
      <script>
        const input = document.getElementById('input')
        const cancelBtn = document.getElementById('cancelBtn')
        const confirmBtn = document.getElementById('confirmBtn')

        input.focus()
        input.select()

        function submit() {
          window.electronAPI.sendInputDialogValue(input.value)
          window.close()
        }

        function cancel() {
          window.close()
        }

        confirmBtn.addEventListener('click', submit)
        cancelBtn.addEventListener('click', cancel)

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') cancel()
        })
      </script>
    </body>
    </html>
  `

  inputWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  inputWindow.once('ready-to-show', () => inputWindow.show())
}

function createMainWindow() {
  const iconPath = path.join(__dirname, '../../assets/icon.png')
  let icon = null
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromBuffer(fs.readFileSync(iconPath))
  }

  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 380,
    minHeight: 520,
    backgroundColor: '#F5F9FF',
    title: '历史粘贴板',
    icon: icon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.cjs'),
    },
  })

  mainWindow.loadURL('http://localhost:5174')

  // 关闭窗口时隐藏而不是销毁
  mainWindow.on('close', (event) => {
    event.preventDefault()
    mainWindow.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createPinnedWindow() {
  if (pinnedWindow && !pinnedWindow.isDestroyed()) {
    return pinnedWindow
  }

  pinnedWindow = new BrowserWindow({
    ...getPinnedWindowBounds(),
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: true,
    backgroundColor: '#00000000',
    title: '置顶内容',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.cjs'),
      additionalArguments: ['--window-role=pinned'],
    },
  })

  // 设置窗口忽略鼠标事件穿透透明区域
  pinnedWindow.on('ready-to-show', () => {
    // 收起态时设置形状为圆角矩形
    if (!pinnedWindowExpanded) {
      pinnedWindow.setSize(88, 18)
    }
  })

  pinnedWindow.setAlwaysOnTop(true, 'screen-saver')
  pinnedWindow.setVisibleOnAllWorkspaces(true)
  pinnedWindow.loadURL('http://localhost:5174/#/pinned')

  // 拖拽开始时不干预，拖拽结束后再约束位置
  pinnedWindow.on('will-move', () => {
    isPinnedWindowDragging = true
  })

  pinnedWindow.on('moved', () => {
    isPinnedWindowDragging = false
    clampPinnedWindowToTop(pinnedWindow)
  })

  pinnedWindow.on('closed', () => {
    pinnedWindow = null
    pinnedWindowExpanded = false
  })

  return pinnedWindow
}

function ensurePinnedWindowVisibility() {
  const settings = getSettings()

  // 如果用户关闭了置顶条显示，则不显示
  if (!settings.showPinnedBar) {
    if (pinnedWindow && !pinnedWindow.isDestroyed()) {
      pinnedWindow.hide()
    }
    return
  }

  const pinnedItems = getPinnedItemsForRenderer()

  if (pinnedItems.length === 0) {
    pinnedWindowExpanded = false

    if (pinnedWindow && !pinnedWindow.isDestroyed()) {
      pinnedWindow.hide()
    }
    return
  }

  const windowInstance = createPinnedWindow()
  clampPinnedWindowToTop(windowInstance)
  if (!windowInstance.isVisible()) {
    windowInstance.showInactive()
  }
}

function createTray() {
  const iconPath = path.join(__dirname, '../../assets/icon.png')
  let icon

  if (fs.existsSync(iconPath)) {
    const iconBuffer = fs.readFileSync(iconPath)
    icon = nativeImage.createFromBuffer(iconBuffer).resize({ width: 16, height: 16 })
  } else {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua2NvcGVyYXRvcgBtZXRhLmpwZy5lcGxhbnRzLmNvbQBGaAADAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAABKSURBVHjaY2AgCZj4D8T9HxMDI/OD+T8jAwMD4f9HxDAwMDIwB4AY6P//Z2RkZPj/mJgYGBgYGBj+PzMDAwMDA8P8f2YGBgYGBob5/8wMDAwMDAzz/5kZGBgYGBjm/zMzMDAwMDDM/2dmYGBgYGBg+f/MDAwMDAwM8/+ZGRgYGBgY5v8zMzAwMDAwzP9nZmBgYGBgYPn/zAwMDAwMDPP/mRkYGBgYGBj+/zMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwAAAJcFzj4B6Zq6AAAAAElFTkSuQmCC'
    )
  }

  tray = new Tray(icon)

  const updateTrayMenu = () => {
    const settings = getSettings()
    const contextMenu = Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => showMainWindow() },
      {
        label: '显示置顶条',
        type: 'checkbox',
        checked: settings.showPinnedBar,
        click: () => {
          toggleShowPinnedBar()
          updateTrayMenu()
        },
      },
      { type: 'separator' },
      { label: '退出', click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.removeAllListeners('close')
        }
        app.quit()
      }},
    ])
    tray.setContextMenu(contextMenu)
  }

  tray.setToolTip('历史粘贴板')
  updateTrayMenu()

  // 点击托盘图标显示主窗口
  tray.on('click', () => showMainWindow())
}

function registerGlobalShortcut() {
  // 先注销所有快捷键
  globalShortcut.unregisterAll()

  // Ctrl+Shift+V 显示/隐藏主窗口
  const result1 = globalShortcut.register('CommandOrControl+Shift+V', () => {
    showMainWindow()
  })

  if (!result1) {
    console.log('全局快捷键 Ctrl+Shift+V 注册失败')
  }

  // Ctrl+Shift+用户配置的键 粘贴上一条
  const settings = getSettings()
  const pasteKey = settings.pasteShortcutKey || 'Q'
  const result2 = globalShortcut.register(`CommandOrControl+Shift+${pasteKey}`, () => {
    copyLatestItem()
  })

  if (!result2) {
    console.log(`全局快捷键 Ctrl+Shift+${pasteKey} 注册失败`)
  }
}

function setAutoLaunch(enable) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true,
  })
}

function isAutoLaunchEnabled() {
  try {
    const settings = app.getLoginItemSettings()
    return settings.openAtLogin === true
  } catch {
    return false
  }
}

function toggleAutoLaunch() {
  const enabled = isAutoLaunchEnabled()
  setAutoLaunch(!enabled)
  // 延迟刷新菜单，确保设置生效
  setTimeout(() => {
    buildApplicationMenu()
  }, 100)
}

function copyLatestItem() {
  const items = getItemsForRenderer('')
  if (items.length === 0) {
    return
  }

  // 索引超过范围时重置为0
  if (pasteIndex >= items.length) {
    pasteIndex = 0
  }

  const item = items[pasteIndex]
  if (item.type === 'image') {
    const fullItem = getItemById(item.id)
    if (fullItem && fullItem.imagePath) {
      const image = nativeImage.createFromPath(fullItem.imagePath)
      clipboard.writeImage(image)
      setIgnoredClipboardSignature(fullItem.signature)
    }
  } else if (item.type === 'text') {
    const fullItem = getItemById(item.id)
    if (fullItem && fullItem.text) {
      clipboard.writeText(fullItem.text)
      setIgnoredClipboardSignature(fullItem.signature)
    }
  }

  // 移动到下一条
  pasteIndex++
}

app.disableHardwareAcceleration()

app.whenReady().then(() => {
  ensureDataFiles()
  buildApplicationMenu()
  createMainWindow()
  startClipboardMonitor(sendHistoryUpdate)
  ensurePinnedWindowVisibility()
  createTray()
  registerGlobalShortcut()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

// 关闭所有窗口时不退出，最小化到托盘
app.on('window-all-closed', () => {
  // 不退出，保持在托盘运行
})

app.on('before-quit', () => {
  stopClipboardMonitor()
  globalShortcut.unregisterAll()
})

ipcMain.handle('history:list', async (_event, query) => {
  return getItemsForRenderer(query)
})

ipcMain.handle('history:pinnedList', async () => {
  return getPinnedItemsForRenderer()
})

ipcMain.handle('history:togglePinned', async (_event, id) => {
  const item = togglePinned(id)
  ensurePinnedWindowVisibility()
  sendHistoryUpdate()

  return {
    updated: Boolean(item),
    pinned: item ? item.pinned : false,
  }
})

ipcMain.handle('history:delete', async (_event, id) => {
  const deleted = deleteItem(id)

  if (deleted) {
    ensurePinnedWindowVisibility()
    sendHistoryUpdate()
  }

  return { deleted }
})

ipcMain.handle('history:copy', async (_event, id) => {
  const item = getItemById(id)

  if (!item) {
    return { copied: false }
  }

  if (item.type === 'image' && item.imagePath) {
    const image = nativeImage.createFromPath(item.imagePath)
    clipboard.writeImage(image)
    setIgnoredClipboardSignature(item.signature)
    return { copied: true }
  }

  if (item.type === 'text' && item.text) {
    clipboard.writeText(item.text)
    setIgnoredClipboardSignature(item.signature)
    return { copied: true }
  }

  return { copied: false }
})

ipcMain.handle('pinnedWindow:setExpanded', async (_event, expanded) => {
  pinnedWindowExpanded = Boolean(expanded)
  const windowInstance = createPinnedWindow()
  clampPinnedWindowToTop(windowInstance)
  return { expanded: pinnedWindowExpanded }
})

ipcMain.handle('settings:get', async () => {
  return getSettings()
})

ipcMain.handle('settings:setRetentionDays', async (_event, retentionDays) => {
  const settings = setRetentionDays(retentionDays)
  sendHistoryUpdate()
  return settings
})

ipcMain.handle('settings:setMaxPinnedItems', async (_event, maxPinnedItems) => {
  const settings = setMaxPinnedItems(maxPinnedItems)
  ensurePinnedWindowVisibility()
  sendHistoryUpdate()
  return settings
})

// 输入弹窗回调
ipcMain.on('input-dialog-value', (_event, value) => {
  if (inputDialogCallback) {
    inputDialogCallback(value)
    inputDialogCallback = null
  }
})

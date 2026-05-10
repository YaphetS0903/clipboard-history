const { app, BrowserWindow, ipcMain, clipboard, nativeImage, screen, Menu } = require('electron')
const path = require('path')
const {
  ensureDataFiles,
  getItemsForRenderer,
  getPinnedItemsForRenderer,
  getItemById,
  deleteItem,
  getSettings,
  setRetentionDays,
  setMaxPinnedItems,
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

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
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
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '显示主窗口', click: () => showMainWindow() },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
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
          click: () => {
            ensurePinnedWindowVisibility()
            if (pinnedWindow && !pinnedWindow.isDestroyed()) {
              pinnedWindow.showInactive()
            }
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 380,
    minHeight: 520,
    backgroundColor: '#F5F9FF',
    title: '历史粘贴板',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.cjs'),
    },
  })

  mainWindow.loadURL('http://localhost:5174')

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

app.disableHardwareAcceleration()

app.whenReady().then(() => {
  ensureDataFiles()
  buildApplicationMenu()
  createMainWindow()
  startClipboardMonitor(sendHistoryUpdate)
  ensurePinnedWindowVisibility()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopClipboardMonitor()
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

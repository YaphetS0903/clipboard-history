// Electron 主进程入口
const { app, BrowserWindow } = require('electron')
const path = require('path')

console.log('=== Electron Main Process ===')
console.log('app:', app ? 'OK' : 'undefined')

function createWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  // 加载 Vite 开发服务器
  win.loadURL('http://localhost:5174')
  console.log('Window created, loading URL...')
}

// 等待 Electron 就绪
app.on('ready', () => {
  console.log('App ready event fired')
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
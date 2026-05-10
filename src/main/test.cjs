const { app, BrowserWindow } = require('electron')
const path = require('path')

console.log('Starting Electron app...')
console.log('app:', app)

function createWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.loadURL('http://localhost:5174')
}

app.whenReady().then(() => {
  console.log('App is ready')
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})

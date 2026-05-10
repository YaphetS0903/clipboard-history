const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  listHistory: query => ipcRenderer.invoke('history:list', query),
  listPinnedHistory: () => ipcRenderer.invoke('history:pinnedList'),
  togglePinnedHistoryItem: id => ipcRenderer.invoke('history:togglePinned', id),
  deleteHistoryItem: id => ipcRenderer.invoke('history:delete', id),
  copyHistoryItem: id => ipcRenderer.invoke('history:copy', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setRetentionDays: retentionDays => ipcRenderer.invoke('settings:setRetentionDays', retentionDays),
  setMaxPinnedItems: maxPinnedItems => ipcRenderer.invoke('settings:setMaxPinnedItems', maxPinnedItems),
  setPinnedWindowExpanded: expanded => ipcRenderer.invoke('pinnedWindow:setExpanded', expanded),
  getWindowRole: () => {
    const argument = process.argv.find(item => item.startsWith('--window-role='))
    return argument ? argument.replace('--window-role=', '') : 'main'
  },
  onHistoryUpdated: callback => {
    const listener = () => callback()
    ipcRenderer.on('history-updated', listener)
    return () => ipcRenderer.removeListener('history-updated', listener)
  },
  onPinnedHistoryUpdated: callback => {
    const listener = () => callback()
    ipcRenderer.on('pinned-history-updated', listener)
    return () => ipcRenderer.removeListener('pinned-history-updated', listener)
  },
})

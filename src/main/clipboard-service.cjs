const { clipboard } = require('electron')
const {
  addTextItem,
  addImageItem,
  cleanupExpired,
  buildTextSignature,
  buildImageSignature,
} = require('./store.cjs')

let timer = null
let lastSignature = ''
let ignoredSignature = ''
let tickCount = 0

function readClipboardEntry() {
  const text = clipboard.readText()
  const image = clipboard.readImage()
  const hasText = text && text.trim()
  const hasImage = !image.isEmpty()

  // 同时有文字和图片时优先保存文字（更实用、可搜索）
  if (hasText) {
    return {
      type: 'text',
      signature: buildTextSignature(text),
      text,
    }
  }

  if (hasImage) {
    const buffer = image.toPNG()

    if (buffer.length > 0) {
      return {
        type: 'image',
        signature: buildImageSignature(buffer),
        buffer,
      }
    }
  }

  return null
}

function setIgnoredClipboardSignature(signature) {
  ignoredSignature = signature || ''
}

function stopClipboardMonitor() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startClipboardMonitor(onChange) {
  stopClipboardMonitor()
  cleanupExpired()

  const initialEntry = readClipboardEntry()
  lastSignature = initialEntry ? initialEntry.signature : ''

  timer = setInterval(() => {
    try {
      tickCount += 1

      if (tickCount % 60 === 0) {
        cleanupExpired()
      }

      const entry = readClipboardEntry()

      if (!entry) {
        return
      }

      if (entry.signature === lastSignature) {
        return
      }

      lastSignature = entry.signature

      if (ignoredSignature && ignoredSignature === entry.signature) {
        ignoredSignature = ''
        return
      }

      if (entry.type === 'image') {
        addImageItem(entry.buffer, entry.signature)
      } else {
        addTextItem(entry.text, entry.signature)
      }

      if (typeof onChange === 'function') {
        onChange()
      }
    } catch (error) {
      console.error('clipboard monitor failed', error)
    }
  }, 1000)
}

module.exports = {
  startClipboardMonitor,
  stopClipboardMonitor,
  setIgnoredClipboardSignature,
}

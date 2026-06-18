const fs = require('fs')
const path = require('path')
const { randomUUID, createHash } = require('crypto')
const { nativeImage, app } = require('electron')

const projectRoot = path.resolve(__dirname, '../..')

function getDataDir() {
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'data')
    : path.join(projectRoot, 'data')
}

function getImagesDir() {
  return path.join(getDataDir(), 'images')
}

function getThumbnailsDir() {
  return path.join(getDataDir(), 'thumbnails')
}

function getItemsFile() {
  return path.join(getDataDir(), 'clipboard-items.json')
}

function getSettingsFile() {
  return path.join(getDataDir(), 'settings.json')
}
const validRetentionDays = new Set([1, 3, 5])
const validPinnedBarThemes = new Set(['sky', 'mint', 'sunset', 'violet', 'graphite'])
const lowValuePhrases = new Set([
  '嗯',
  '哦',
  '啊',
  '哈',
  '哈哈',
  '呵呵',
  '好的',
  '好',
  '是',
  '不是',
  'ok',
  'okay',
  'yes',
  'no',
  'hi',
  'hello',
  'test',
])
const chineseSearchStopWords = new Set(['帮我', '帮', '我', '找', '查', '搜索', '关于', '的', '内容', '文章', '复制', '过', '剪贴', '剪贴板', '历史'])
const englishSearchStopWords = new Set(['find', 'search', 'about', 'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'clipboard', 'copied', 'history'])

function ensureDataFiles() {
  const imagesDir = getImagesDir()
  const thumbnailsDir = getThumbnailsDir()
  const itemsFile = getItemsFile()
  const settingsFile = getSettingsFile()

  fs.mkdirSync(imagesDir, { recursive: true })
  fs.mkdirSync(thumbnailsDir, { recursive: true })

  if (!fs.existsSync(itemsFile)) {
    fs.writeFileSync(itemsFile, '[]', 'utf8')
  }

  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, JSON.stringify({ retentionDays: 3, maxPinnedItems: 10 }, null, 2), 'utf8')
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

function sortNewestFirst(items) {
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

function normalizeTextForCompare(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function classifyTextContent(text) {
  const value = String(text || '').trim()

  if (/^https?:\/\/\S+$/i.test(value) || /^www\.\S+$/i.test(value)) {
    return 'link'
  }

  if (
    /^#{1,6}\s/m.test(value) ||
    /```[\s\S]*```/.test(value) ||
    /^\s*[-*+]\s+\S+/m.test(value) ||
    /^\s*\d+\.\s+\S+/m.test(value) ||
    /\[[^\]]+\]\([^)]+\)/.test(value) ||
    /\|.+\|[\r\n]+\|[-:\s|]+\|/.test(value)
  ) {
    return 'markdown'
  }

  return 'text'
}

function getContentText(item) {
  return item && item.type === 'text' ? String(item.text || '') : ''
}

function getItemContentType(item) {
  if (!item) {
    return 'text'
  }

  if (item.type === 'image') {
    return 'image'
  }

  return item.contentType || classifyTextContent(item.text)
}

function getInformationScore(text) {
  const value = String(text || '').trim()
  const compact = value.replace(/\s+/g, '')

  if (!compact) {
    return 0
  }

  let score = Math.min(compact.length, 120)
  const uniqueChars = new Set(compact).size
  score += Math.min(uniqueChars * 2, 40)

  if (/https?:\/\/|www\./i.test(value)) score += 35
  if (/[\u4e00-\u9fa5]{8,}/.test(value)) score += 18
  if (/[A-Za-z]{8,}/.test(value)) score += 12
  if (/[。！？；：,.!?;:]/.test(value)) score += 10
  if (/```|^#{1,6}\s|^\s*[-*+]\s+/m.test(value)) score += 18

  return score
}

function shouldIgnoreTextContent(text) {
  const value = String(text || '').trim()
  const compact = value.replace(/\s+/g, '')
  const normalized = normalizeTextForCompare(value)

  if (!compact) {
    return true
  }

  if (classifyTextContent(value) === 'link') {
    return false
  }

  if (lowValuePhrases.has(normalized)) {
    return true
  }

  if (compact.length <= 1) {
    return true
  }

  if (compact.length <= 3 && !/[A-Za-z0-9]{3,}|[\u4e00-\u9fa5]{3,}/.test(compact)) {
    return true
  }

  if (/^([\p{P}\p{S}\dA-Za-z\u4e00-\u9fa5])\1{2,}$/u.test(compact)) {
    return true
  }

  if (!/[\p{L}\p{N}]/u.test(compact)) {
    return true
  }

  return getInformationScore(value) < 14
}

function tokenizeSearchQuery(query) {
  const normalized = String(query || '').trim().toLowerCase()
  const englishTokens = normalized
    .match(/[a-z0-9][a-z0-9-_.]{1,}/g) || []
  const cjkTokens = normalized
    .replace(/[a-z0-9][a-z0-9-_.]{1,}/g, ' ')
    .split(/[\s，。！？、,.!?;:：；"'“”‘’（）()[\]{}<>]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2)

  return [...englishTokens, ...cjkTokens]
    .map(token => token.replace(/^(找|查|搜|关于)/, ''))
    .filter(token => token && !englishSearchStopWords.has(token) && !chineseSearchStopWords.has(token))
}

function parseSearchIntent(query) {
  const normalized = String(query || '').trim().toLowerCase()
  const now = Date.now()
  let from = null
  let to = null
  let contentType = null

  if (/今天|today/.test(normalized)) {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    from = date.getTime()
  } else if (/昨天|yesterday/.test(normalized)) {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    to = date.getTime()
    from = to - 24 * 60 * 60 * 1000
  } else if (/上周|last\s+week/.test(normalized)) {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    to = date.getTime() - 7 * 24 * 60 * 60 * 1000
    from = to - 7 * 24 * 60 * 60 * 1000
  } else if (/最近|近一周|这周|本周|last\s+7\s+days|this\s+week/.test(normalized)) {
    from = now - 7 * 24 * 60 * 60 * 1000
  }

  if (/图片|图像|截图|image|photo|screenshot/.test(normalized)) {
    contentType = 'image'
  } else if (/链接|网址|网页|url|link/.test(normalized)) {
    contentType = 'link'
  } else if (/markdown|md|文档|笔记/.test(normalized)) {
    contentType = 'markdown'
  } else if (/文本|文字|text/.test(normalized)) {
    contentType = 'text'
  }

  return {
    raw: normalized,
    tokens: tokenizeSearchQuery(normalized),
    from,
    to,
    contentType,
  }
}

function normalizeSettings(raw) {
  const retentionDays = validRetentionDays.has(raw.retentionDays) ? raw.retentionDays : 3
  const maxPinnedItems = Number.isInteger(raw.maxPinnedItems) && raw.maxPinnedItems >= 1 && raw.maxPinnedItems <= 50
    ? raw.maxPinnedItems
    : 10
  const pasteShortcutKey = typeof raw.pasteShortcutKey === 'string' && raw.pasteShortcutKey.length === 1
    ? raw.pasteShortcutKey.toUpperCase()
    : 'Q'
  const showPinnedBar = typeof raw.showPinnedBar === 'boolean' ? raw.showPinnedBar : true
  const pinnedBarTheme = validPinnedBarThemes.has(raw.pinnedBarTheme) ? raw.pinnedBarTheme : 'sky'

  const result = {
    retentionDays,
    maxPinnedItems,
    pasteShortcutKey,
    showPinnedBar,
    pinnedBarTheme,
  }

  if (Number.isFinite(raw.pinnedWindowX) && Number.isFinite(raw.pinnedWindowY)) {
    result.pinnedWindowX = raw.pinnedWindowX
    result.pinnedWindowY = raw.pinnedWindowY
  }

  return result
}

function getSettings() {
  ensureDataFiles()
  return normalizeSettings(readJson(getSettingsFile(), { retentionDays: 3, maxPinnedItems: 10 }))
}

function writeSettings(settings) {
  writeJson(getSettingsFile(), normalizeSettings(settings))
}

function setRetentionDays(retentionDays) {
  ensureDataFiles()
  const settings = { ...getSettings(), retentionDays }
  writeSettings(settings)
  return getSettings()
}

function setMaxPinnedItems(maxPinnedItems) {
  ensureDataFiles()
  const settings = { ...getSettings(), maxPinnedItems }
  writeSettings(settings)
  enforcePinnedLimitOnItems(getItems(), getSettings().maxPinnedItems)
  return getSettings()
}

function setPasteShortcutKey(key) {
  ensureDataFiles()
  const upperKey = typeof key === 'string' && key.length === 1 ? key.toUpperCase() : 'Q'
  const settings = { ...getSettings(), pasteShortcutKey: upperKey }
  writeSettings(settings)
  return getSettings()
}

function setShowPinnedBar(show) {
  ensureDataFiles()
  const settings = { ...getSettings(), showPinnedBar: Boolean(show) }
  writeSettings(settings)
  return getSettings()
}

function setPinnedBarTheme(theme) {
  ensureDataFiles()
  const pinnedBarTheme = validPinnedBarThemes.has(theme) ? theme : 'sky'
  const settings = { ...getSettings(), pinnedBarTheme }
  writeSettings(settings)
  return getSettings()
}

function getPinnedWindowPosition() {
  const settings = getSettings()
  if (settings.pinnedWindowX !== undefined && settings.pinnedWindowY !== undefined) {
    return { x: settings.pinnedWindowX, y: settings.pinnedWindowY }
  }
  return null
}

function setPinnedWindowPosition(x, y) {
  ensureDataFiles()
  const settings = { ...getSettings(), pinnedWindowX: x, pinnedWindowY: y }
  writeSettings(settings)
  return settings
}

function normalizeItem(item) {
  const contentType = item.contentType || getItemContentType(item)

  return {
    ...item,
    pinned: Boolean(item.pinned),
    contentType,
  }
}

function getItems() {
  ensureDataFiles()

  return sortNewestFirst(
    readJson(getItemsFile(), [])
      .filter(item => item && item.id && item.type && item.createdAt)
      .map(normalizeItem),
  )
}

function writeItems(items) {
  writeJson(getItemsFile(), sortNewestFirst(items.map(normalizeItem)))
}

function hashBuffer(buffer) {
  return createHash('md5').update(buffer).digest('hex')
}

function saveImage(buffer, id) {
  const imagePath = path.join(getImagesDir(), `${id}.png`)
  fs.writeFileSync(imagePath, buffer)

  // 生成缩略图
  try {
    const image = nativeImage.createFromBuffer(buffer)
    const thumbnail = image.resize({ width: 200, quality: 'good' })
    const thumbnailPath = path.join(getThumbnailsDir(), `${id}.png`)
    fs.writeFileSync(thumbnailPath, thumbnail.toPNG())
  } catch (e) {
    console.log('生成缩略图失败:', e.message)
  }

  return imagePath
}

function enforcePinnedLimitOnItems(items, maxPinnedItems) {
  const sortedItems = sortNewestFirst(items.map(normalizeItem))
  let pinnedCount = 0

  for (const item of sortedItems) {
    if (!item.pinned) {
      continue
    }

    pinnedCount += 1
    if (pinnedCount > maxPinnedItems) {
      item.pinned = false
    }
  }

  writeItems(sortedItems)
  return sortedItems
}

function addTextItem(text, signature) {
  ensureDataFiles()

  const value = typeof text === 'string' ? text : ''
  if (!value.trim() || shouldIgnoreTextContent(value)) {
    return null
  }

  const item = {
    id: randomUUID(),
    type: 'text',
    contentType: classifyTextContent(value),
    text: value,
    createdAt: new Date().toISOString(),
    signature,
    pinned: true,
  }

  const items = enforcePinnedLimitOnItems([item, ...getItems()], getSettings().maxPinnedItems)
  return items.find(entry => entry.id === item.id) || item
}

function addImageItem(buffer, signature) {
  ensureDataFiles()

  if (!buffer || !buffer.length) {
    return null
  }

  const item = {
    id: randomUUID(),
    type: 'image',
    contentType: 'image',
    imagePath: '',
    createdAt: new Date().toISOString(),
    signature,
    pinned: true,
  }

  item.imagePath = saveImage(buffer, item.id)

  const items = enforcePinnedLimitOnItems([item, ...getItems()], getSettings().maxPinnedItems)
  return items.find(entry => entry.id === item.id) || item
}

function getItemById(id) {
  return getItems().find(item => item.id === id) || null
}

function updateItem(id, updater) {
  const items = getItems()
  const index = items.findIndex(item => item.id === id)

  if (index === -1) {
    return null
  }

  const updatedItem = normalizeItem(updater(items[index]))
  items[index] = updatedItem
  const nextItems = enforcePinnedLimitOnItems(items, getSettings().maxPinnedItems)
  return nextItems.find(item => item.id === id) || null
}

function togglePinned(id) {
  return updateItem(id, item => ({
    ...item,
    pinned: !item.pinned,
  }))
}

function deleteItem(id) {
  const items = getItems()
  const item = items.find(entry => entry.id === id)

  if (!item) {
    return false
  }

  if (item.type === 'image' && item.imagePath) {
    if (fs.existsSync(item.imagePath)) {
      fs.unlinkSync(item.imagePath)
    }
    const thumbnailPath = path.join(getThumbnailsDir(), `${id}.png`)
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath)
    }
  }

  writeItems(items.filter(entry => entry.id !== id))
  return true
}

function cleanupExpired() {
  const settings = getSettings()
  const cutoffTime = Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000
  const items = getItems()
  const activeItems = []

  for (const item of items) {
    const createdAt = new Date(item.createdAt).getTime()

    if (createdAt >= cutoffTime || item.pinned) {
      activeItems.push(item)
      continue
    }

    if (item.type === 'image' && item.imagePath) {
      if (fs.existsSync(item.imagePath)) {
        fs.unlinkSync(item.imagePath)
      }
      const thumbnailPath = path.join(getThumbnailsDir(), `${item.id}.png`)
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath)
      }
    }
  }

  writeItems(activeItems)
  return activeItems
}

function itemToRenderer(item) {
  if (item.type === 'image') {
    let imageDataUrl = null

    // 优先使用缩略图
    const thumbnailPath = path.join(getThumbnailsDir(), `${item.id}.png`)
    if (fs.existsSync(thumbnailPath)) {
      const buffer = fs.readFileSync(thumbnailPath)
      imageDataUrl = `data:image/png;base64,${buffer.toString('base64')}`
    } else if (item.imagePath && fs.existsSync(item.imagePath)) {
      // 如果缩略图不存在，使用原图
      const buffer = fs.readFileSync(item.imagePath)
      imageDataUrl = `data:image/png;base64,${buffer.toString('base64')}`
    }

    return {
      id: item.id,
      type: item.type,
      contentType: getItemContentType(item),
      createdAt: item.createdAt,
      imageDataUrl,
      pinned: Boolean(item.pinned),
    }
  }

  return {
    id: item.id,
    type: item.type,
    contentType: getItemContentType(item),
    text: item.text,
    createdAt: item.createdAt,
    pinned: Boolean(item.pinned),
  }
}

function scoreSearchItem(item, intent) {
  const contentType = getItemContentType(item)
  const text = getContentText(item).toLowerCase()
  const createdAt = new Date(item.createdAt).getTime()
  let score = 0

  if (intent.contentType) {
    if (contentType !== intent.contentType) {
      return -1
    }
    score += 12
  }

  if (intent.from && createdAt < intent.from) {
    return -1
  }

  if (intent.to && createdAt >= intent.to) {
    return -1
  }

  if (intent.from || intent.to) {
    score += 8
  }

  if (!intent.tokens.length) {
    return score
  }

  if (item.type === 'image') {
    return score > 0 ? score : -1
  }

  for (const token of intent.tokens) {
    if (text.includes(token)) {
      score += token.length > 3 ? 10 : 7
      continue
    }

    const compactText = text.replace(/\s+/g, '')
    if (compactText.includes(token.replace(/\s+/g, ''))) {
      score += 5
    }
  }

  return score > 0 ? score : -1
}

function searchItems(items, query) {
  const intent = parseSearchIntent(query)

  return items
    .map((item, index) => ({ item, index, score: scoreSearchItem(item, intent) }))
    .filter(entry => entry.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      return a.index - b.index
    })
    .map(entry => entry.item)
}

function getItemsForRenderer(query = '') {
  const normalizedQuery = String(query).trim()
  const items = getItems()

  const filteredItems = normalizedQuery ? searchItems(items, normalizedQuery) : items

  return filteredItems.map(itemToRenderer)
}

function getPinnedItemsForRenderer() {
  return getItems()
    .filter(item => item.pinned)
    .map(itemToRenderer)
}

function getCleanupSuggestions() {
  const items = getItems()
  const seenSignatures = new Map()
  const seenText = new Map()
  const suggestions = []

  for (const item of items) {
    if (item.pinned) {
      continue
    }

    const reasons = []

    if (item.type === 'text') {
      if (shouldIgnoreTextContent(item.text)) {
        reasons.push('低信息密度')
      }

      const normalizedText = normalizeTextForCompare(item.text)
      if (normalizedText && seenText.has(normalizedText)) {
        reasons.push('重复文本')
      } else if (normalizedText) {
        seenText.set(normalizedText, item.id)
      }
    }

    if (item.signature && seenSignatures.has(item.signature)) {
      reasons.push('重复内容')
    } else if (item.signature) {
      seenSignatures.set(item.signature, item.id)
    }

    if (reasons.length) {
      suggestions.push({
        ...itemToRenderer(item),
        reasons,
      })
    }
  }

  return suggestions
}

function deleteItems(ids) {
  const idSet = new Set(Array.isArray(ids) ? ids : [])
  let deletedCount = 0

  for (const id of idSet) {
    if (deleteItem(id)) {
      deletedCount += 1
    }
  }

  return deletedCount
}

function buildTextSignature(text) {
  return `text:${hashBuffer(Buffer.from(text, 'utf8'))}`
}

function buildImageSignature(buffer) {
  return `image:${hashBuffer(buffer)}`
}

module.exports = {
  ensureDataFiles,
  getSettings,
  setRetentionDays,
  setMaxPinnedItems,
  setPasteShortcutKey,
  setShowPinnedBar,
  setPinnedBarTheme,
  getPinnedWindowPosition,
  setPinnedWindowPosition,
  getItemsForRenderer,
  getPinnedItemsForRenderer,
  getItemById,
  addTextItem,
  addImageItem,
  togglePinned,
  deleteItem,
  deleteItems,
  cleanupExpired,
  getCleanupSuggestions,
  buildTextSignature,
  buildImageSignature,
}

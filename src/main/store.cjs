const fs = require('fs')
const path = require('path')
const { randomUUID, createHash } = require('crypto')

const projectRoot = path.resolve(__dirname, '../..')
const dataDir = path.join(projectRoot, 'data')
const imagesDir = path.join(dataDir, 'images')
const itemsFile = path.join(dataDir, 'clipboard-items.json')
const settingsFile = path.join(dataDir, 'settings.json')
const validRetentionDays = new Set([1, 3, 5])
const validPinnedCounts = new Set([3, 5, 10, 20])

function ensureDataFiles() {
  fs.mkdirSync(imagesDir, { recursive: true })

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

function normalizeSettings(raw) {
  const retentionDays = validRetentionDays.has(raw.retentionDays) ? raw.retentionDays : 3
  const maxPinnedItems = validPinnedCounts.has(raw.maxPinnedItems) ? raw.maxPinnedItems : 10

  return {
    retentionDays,
    maxPinnedItems,
  }
}

function getSettings() {
  ensureDataFiles()
  return normalizeSettings(readJson(settingsFile, { retentionDays: 3, maxPinnedItems: 10 }))
}

function writeSettings(settings) {
  writeJson(settingsFile, normalizeSettings(settings))
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

function normalizeItem(item) {
  return {
    ...item,
    pinned: Boolean(item.pinned),
  }
}

function getItems() {
  ensureDataFiles()

  return sortNewestFirst(
    readJson(itemsFile, [])
      .filter(item => item && item.id && item.type && item.createdAt)
      .map(normalizeItem),
  )
}

function writeItems(items) {
  writeJson(itemsFile, sortNewestFirst(items.map(normalizeItem)))
}

function hashBuffer(buffer) {
  return createHash('md5').update(buffer).digest('hex')
}

function saveImage(buffer, id) {
  const imagePath = path.join(imagesDir, `${id}.png`)
  fs.writeFileSync(imagePath, buffer)
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
  if (!value.trim()) {
    return null
  }

  const item = {
    id: randomUUID(),
    type: 'text',
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

  if (item.type === 'image' && item.imagePath && fs.existsSync(item.imagePath)) {
    fs.unlinkSync(item.imagePath)
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

    if (createdAt >= cutoffTime) {
      activeItems.push(item)
      continue
    }

    if (item.type === 'image' && item.imagePath && fs.existsSync(item.imagePath)) {
      fs.unlinkSync(item.imagePath)
    }
  }

  writeItems(activeItems)
  return activeItems
}

function itemToRenderer(item) {
  if (item.type === 'image') {
    let imageDataUrl = null

    if (item.imagePath && fs.existsSync(item.imagePath)) {
      const buffer = fs.readFileSync(item.imagePath)
      imageDataUrl = `data:image/png;base64,${buffer.toString('base64')}`
    }

    return {
      id: item.id,
      type: item.type,
      createdAt: item.createdAt,
      imageDataUrl,
      pinned: Boolean(item.pinned),
    }
  }

  return {
    id: item.id,
    type: item.type,
    text: item.text,
    createdAt: item.createdAt,
    pinned: Boolean(item.pinned),
  }
}

function getItemsForRenderer(query = '') {
  const normalizedQuery = String(query).trim().toLowerCase()
  const items = cleanupExpired()

  const filteredItems = normalizedQuery
    ? items.filter(item => item.type === 'text' && item.text.toLowerCase().includes(normalizedQuery))
    : items

  return filteredItems.map(itemToRenderer)
}

function getPinnedItemsForRenderer() {
  return cleanupExpired()
    .filter(item => item.pinned)
    .map(itemToRenderer)
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
  getItemsForRenderer,
  getPinnedItemsForRenderer,
  getItemById,
  addTextItem,
  addImageItem,
  togglePinned,
  deleteItem,
  cleanupExpired,
  buildTextSignature,
  buildImageSignature,
}

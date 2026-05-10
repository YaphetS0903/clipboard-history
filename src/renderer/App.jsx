import { useEffect, useMemo, useState } from 'react'

function formatTime(value) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function TextCard({ item, onCopy, onDelete, onTogglePinned }) {
  const preview = item.text.length > 160 ? `${item.text.slice(0, 160)}...` : item.text

  return (
    <button className="item-card text-left" onClick={() => onCopy(item.id)}>
      <div className="item-card__header">
        <span className="item-badge">文字</span>
        <span className="item-time">{formatTime(item.createdAt)}</span>
      </div>
      <div className="item-text">{preview}</div>
      <div className="item-actions">
        <span className="item-hint">点击可再次复制</span>
        <div className="action-group">
          <button
            className={item.pinned ? 'pin-button pin-button--active' : 'pin-button'}
            onClick={event => {
              event.stopPropagation()
              onTogglePinned(item.id)
            }}
          >
            {item.pinned ? '取消置顶' : '置顶'}
          </button>
          <button
            className="danger-button"
            onClick={event => {
              event.stopPropagation()
              onDelete(item.id)
            }}
          >
            删除
          </button>
        </div>
      </div>
    </button>
  )
}

function ImageCard({ item, onCopy, onDelete, onTogglePinned }) {
  return (
    <button className="item-card text-left" onClick={() => onCopy(item.id)}>
      <div className="item-card__header">
        <span className="item-badge">图片</span>
        <span className="item-time">{formatTime(item.createdAt)}</span>
      </div>
      {item.imageDataUrl ? (
        <img className="item-image" src={item.imageDataUrl} alt="clipboard" />
      ) : (
        <div className="item-image item-image--empty">图片预览不可用</div>
      )}
      <div className="item-actions">
        <span className="item-hint">点击可再次复制</span>
        <div className="action-group">
          <button
            className={item.pinned ? 'pin-button pin-button--active' : 'pin-button'}
            onClick={event => {
              event.stopPropagation()
              onTogglePinned(item.id)
            }}
          >
            {item.pinned ? '取消置顶' : '置顶'}
          </button>
          <button
            className="danger-button"
            onClick={event => {
              event.stopPropagation()
              onDelete(item.id)
            }}
          >
            删除
          </button>
        </div>
      </div>
    </button>
  )
}

function PinnedOverlay() {
  const [items, setItems] = useState([])
  const [expanded, setExpanded] = useState(false)

  async function loadPinnedItems() {
    const historyItems = await window.electronAPI.listPinnedHistory()
    setItems(historyItems)
  }

  useEffect(() => {
    loadPinnedItems()

    const removeListener = window.electronAPI.onPinnedHistoryUpdated(() => {
      loadPinnedItems()
    })

    return () => removeListener()
  }, [])

  async function updateExpanded(nextValue) {
    setExpanded(nextValue)
    await window.electronAPI.setPinnedWindowExpanded(nextValue)
  }

  async function handleCopy(id) {
    await window.electronAPI.copyHistoryItem(id)
  }

  async function handleDelete(id) {
    await window.electronAPI.deleteHistoryItem(id)
  }

  async function handleTogglePinned(id) {
    await window.electronAPI.togglePinnedHistoryItem(id)
  }

  return (
    <div className={expanded ? 'pinned-shell pinned-shell--expanded' : 'pinned-shell'}>
      {expanded ? (
        <>
          <div className="pinned-handle pinned-handle--expanded" title={`当前置顶 ${items.length} 条`}>
            <button className="pinned-handle__collapse" onClick={() => updateExpanded(false)}>
              收起
            </button>
          </div>
          <div className="pinned-list">
            {items.length === 0 ? (
              <div className="pinned-empty">暂无置顶内容</div>
            ) : (
              items.map(item => (
                <button key={item.id} className="pinned-card" onClick={() => handleCopy(item.id)}>
                  <div className="pinned-card__head">
                    <span className="item-badge">{item.type === 'image' ? '图片' : '文字'}</span>
                    <span className="item-time">{formatTime(item.createdAt)}</span>
                  </div>
                  {item.type === 'image' ? (
                    item.imageDataUrl ? <img className="pinned-image" src={item.imageDataUrl} alt="pinned" /> : <div className="pinned-image pinned-image--empty">图片</div>
                  ) : (
                    <div className="pinned-text">{item.text.length > 50 ? `${item.text.slice(0, 50)}...` : item.text}</div>
                  )}
                  <div className="pinned-actions">
                    <button
                      className="pin-button pin-button--active"
                      onClick={event => {
                        event.stopPropagation()
                        handleTogglePinned(item.id)
                      }}
                    >
                      取消置顶
                    </button>
                    <button
                      className="danger-button"
                      onClick={event => {
                        event.stopPropagation()
                        handleDelete(item.id)
                      }}
                    >
                      删除
                    </button>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="pinned-handle" title={`当前置顶 ${items.length} 条`} onClick={() => updateExpanded(true)}>
          <button className="pinned-handle__toggle">
            <span className="pinned-handle__dot" />
          </button>
        </div>
      )}
    </div>
  )
}

function MainApp() {
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [statusText, setStatusText] = useState('正在监听剪贴板，复制后会自动置顶...')

  const hasKeyword = useMemo(() => query.trim().length > 0, [query])

  async function loadItems(nextQuery = query) {
    const historyItems = await window.electronAPI.listHistory(nextQuery)
    setItems(historyItems)
    setLoading(false)
  }

  useEffect(() => {
    loadItems('')

    const removeListener = window.electronAPI.onHistoryUpdated(() => {
      loadItems(query)
    })

    return () => {
      removeListener()
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadItems(query)
    }, 150)

    return () => clearTimeout(timer)
  }, [query])

  async function handleCopy(id) {
    const result = await window.electronAPI.copyHistoryItem(id)
    setStatusText(result.copied ? '已复制到剪贴板' : '复制失败')
  }

  async function handleDelete(id) {
    await window.electronAPI.deleteHistoryItem(id)
    setStatusText('已删除记录')
  }

  async function handleTogglePinned(id) {
    const result = await window.electronAPI.togglePinnedHistoryItem(id)
    setStatusText(result.pinned ? '已加入桌面置顶' : '已取消桌面置顶')
  }

  return (
    <div className="app-shell">
      <header className="top-panel">
        <div>
          <h1 className="app-title">历史粘贴板</h1>
          <p className="app-subtitle">复制后自动保存并自动置顶，桌面只保留一个轻量入口条</p>
        </div>
        <div className="status-pill">{statusText}</div>
      </header>

      <section className="toolbar-card">
        <input
          className="search-input"
          type="text"
          placeholder="搜索历史文字内容..."
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      </section>

      <section className="list-panel">
        {loading ? (
          <div className="empty-state">正在加载历史记录...</div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            {hasKeyword ? '没有找到匹配的文字记录' : '先复制一些文字或图片，这里就会自动出现'}
          </div>
        ) : (
          items.map(item => (
            item.type === 'image'
              ? <ImageCard key={item.id} item={item} onCopy={handleCopy} onDelete={handleDelete} onTogglePinned={handleTogglePinned} />
              : <TextCard key={item.id} item={item} onCopy={handleCopy} onDelete={handleDelete} onTogglePinned={handleTogglePinned} />
          ))
        )}
      </section>
    </div>
  )
}

function App() {
  const role = window.electronAPI.getWindowRole()

  useEffect(() => {
    document.body.dataset.windowRole = role
    return () => {
      delete document.body.dataset.windowRole
    }
  }, [role])

  return role === 'pinned' ? <PinnedOverlay /> : <MainApp />
}

export default App

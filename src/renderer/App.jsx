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

const contentTypeLabels = {
  text: '文本',
  image: '图片',
  link: '链接',
  markdown: 'Markdown',
}

function getContentTypeLabel(item) {
  return contentTypeLabels[item.contentType || item.type] || '内容'
}

function TextCard({ item, onCopy, onDelete, onTogglePinned, onAiAction }) {
  const preview = item.text.length > 160 ? `${item.text.slice(0, 160)}...` : item.text

  return (
    <button className="item-card text-left" onClick={() => onCopy(item.id)}>
      <div className="item-card__header">
        <span className="item-badge">{getContentTypeLabel(item)}</span>
        <span className="item-time">{formatTime(item.createdAt)}</span>
      </div>
      <div className="item-text">{preview}</div>
      <div className="item-actions">
        <span className="item-hint">点击可再次复制</span>
        <div className="action-group">
          <button
            className="ai-button"
            onClick={event => {
              event.stopPropagation()
              onAiAction(item, 'summarize')
            }}
          >
            AI 总结
          </button>
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
        <span className="item-badge">{getContentTypeLabel(item)}</span>
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
  const [pinnedTheme, setPinnedTheme] = useState('sky')

  async function loadPinnedItems() {
    const historyItems = await window.electronAPI.listPinnedHistory()
    setItems(historyItems)
  }

  async function loadSettings() {
    const settings = await window.electronAPI.getSettings()
    setPinnedTheme(settings.pinnedBarTheme || 'sky')
  }

  useEffect(() => {
    loadPinnedItems()
    loadSettings()

    const removeListener = window.electronAPI.onPinnedHistoryUpdated(() => {
      loadPinnedItems()
    })

    return () => removeListener()
  }, [])

  useEffect(() => {
    document.body.dataset.pinnedTheme = pinnedTheme

    return () => {
      delete document.body.dataset.pinnedTheme
    }
  }, [pinnedTheme])

  useEffect(() => {
    const removeListener = window.electronAPI.onSettingsUpdated(settings => {
      setPinnedTheme(settings.pinnedBarTheme || 'sky')
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
  const [cleanupSuggestions, setCleanupSuggestions] = useState([])
  const [aiPanel, setAiPanel] = useState(null)

  const hasKeyword = useMemo(() => query.trim().length > 0, [query])

  async function loadItems(nextQuery = query) {
    const historyItems = await window.electronAPI.listHistory(nextQuery)
    setItems(historyItems)
    setLoading(false)
  }

  async function loadCleanupSuggestions() {
    const suggestions = await window.electronAPI.listCleanupSuggestions()
    setCleanupSuggestions(suggestions)
    setStatusText(suggestions.length ? `发现 ${suggestions.length} 条可清理内容` : '剪贴库状态很干净')
  }

  useEffect(() => {
    loadItems('')
  }, [])

  useEffect(() => {
    const removeListener = window.electronAPI.onHistoryUpdated(() => {
      loadItems(query)
    })

    return () => {
      removeListener()
    }
  }, [query])

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

  async function handleApplyCleanup() {
    const ids = cleanupSuggestions.map(item => item.id)
    const result = await window.electronAPI.deleteManyHistoryItems(ids)
    setCleanupSuggestions([])
    await loadItems(query)
    setStatusText(`已清理 ${result.deletedCount} 条内容`)
  }

  function handleAiAction(item, action) {
    const text = item.text || ''
    const titleMap = {
      summarize: 'AI 总结提示',
      polish: 'AI 润色提示',
      translate: 'AI 翻译提示',
      qa: 'AI 问答提示',
    }
    const promptMap = {
      summarize: `请总结下面这段剪贴板内容，提炼要点并给出下一步可探索的问题：\n\n${text}`,
      polish: `请润色下面这段文字，保持原意，让表达更清晰自然：\n\n${text}`,
      translate: `请把下面这段内容翻译成中文和英文，并保留关键术语：\n\n${text}`,
      qa: `请基于下面这段内容回答我的问题。内容如下：\n\n${text}\n\n我的问题是：`,
    }

    setAiPanel({
      title: titleMap[action] || titleMap.summarize,
      prompt: promptMap[action] || promptMap.summarize,
    })
    setStatusText('已生成 AI 处理提示，可复制到任意 AI 工具使用')
  }

  async function copyAiPrompt() {
    if (!aiPanel) {
      return
    }
    await navigator.clipboard.writeText(aiPanel.prompt)
    setStatusText('AI 提示已复制')
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
          placeholder="智能搜索：例如“找上周复制过的 agent 文章”“最近的链接”“Markdown 笔记”"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <div className="smart-toolbar">
          <button className="ai-button" onClick={loadCleanupSuggestions}>智能清理建议</button>
          <span className="smart-hint">自动过滤低价值片段，支持文本、链接、Markdown、图片分类</span>
        </div>
      </section>

      {cleanupSuggestions.length > 0 && (
        <section className="insight-panel">
          <div>
            <div className="insight-title">智能清理建议</div>
            <div className="insight-copy">
              检测到 {cleanupSuggestions.length} 条重复或低信息密度内容，可批量清理。
            </div>
          </div>
          <div className="insight-actions">
            <button className="danger-button" onClick={handleApplyCleanup}>清理建议项</button>
            <button className="pin-button" onClick={() => setCleanupSuggestions([])}>稍后再说</button>
          </div>
        </section>
      )}

      {aiPanel && (
        <section className="ai-panel">
          <div className="ai-panel__head">
            <div className="insight-title">{aiPanel.title}</div>
            <button className="pin-button" onClick={() => setAiPanel(null)}>关闭</button>
          </div>
          <textarea className="ai-prompt" value={aiPanel.prompt} readOnly />
          <div className="insight-actions">
            <button className="ai-button" onClick={copyAiPrompt}>复制提示</button>
          </div>
        </section>
      )}

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
              : <TextCard key={item.id} item={item} onCopy={handleCopy} onDelete={handleDelete} onTogglePinned={handleTogglePinned} onAiAction={handleAiAction} />
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

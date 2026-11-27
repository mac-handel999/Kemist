'use strict';
/* Kemist AI Assistant — Modern chat UI with streaming, sidebar, and localStorage persistence. */
(() => {
  const { h, put, api, icon, ICON } = window.Kemist;

  // ---------- Constants ----------
  const STORAGE_KEY = 'kemist.chats';
  const MAX_CHATS = 50;
  const MAX_CHARS = 500;
  const SUGGESTIONS = [
    { text: 'Check a NAFDAC number', prompt: 'Is NAFDAC number A4-7559 registered?' },
    { text: 'What a medicine is used for', prompt: 'What is paracetamol used for?' },
    { text: 'Latest NAFDAC alerts', prompt: 'Show me the latest NAFDAC safety alerts' },
    { text: 'How to spot a fake pack', prompt: 'How can I tell if a medicine pack is fake?' },
  ];

  // ---------- Utilities ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": ''' }[c]));
  const clip = (s, n) => String(s || '').slice(0, n);
  const now = () => Date.now();
  const uuid = () => crypto.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });

  // ---------- Chat Storage ----------
  function loadChats() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  }
  function saveChats(chats) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); } catch { /* quota exceeded */ }
  }
  function createChat() {
    return { id: uuid(), title: 'New Chat', messages: [], createdAt: now(), updatedAt: now() };
  }
  function updateChatTitle(chat) {
    const firstUser = chat.messages.find(m => m.role === 'user');
    if (firstUser) chat.title = firstUser.content.slice(0, 50) + (firstUser.content.length > 50 ? '…' : '');
    chat.updatedAt = now();
  }
  function addMessage(chat, role, content, sources = []) {
    chat.messages.push({ role, content, sources, timestamp: now() });
    updateChatTitle(chat);
  }
  function pruneChats(chats) {
    if (chats.length > MAX_CHATS) chats.splice(MAX_CHATS);
  }

  // ---------- Safe Markdown Renderer ----------
  // Allowed tags and attributes
  const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'blockquote', 'a', 'span', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
  const ALLOWED_ATTRS = {
    a: ['href', 'title', 'target', 'rel'],
    span: ['class'],
    code: ['class'],
    pre: ['class'],
    th: ['scope'],
  };

  function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) return;
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          node.replaceWith(...node.childNodes);
          return;
        }
        const allowed = ALLOWED_ATTRS[tag] || [];
        [...node.attributes].forEach(attr => {
          if (!allowed.includes(attr.name)) node.removeAttribute(attr.name);
        });
        if (tag === 'a') {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      }
      [...node.childNodes].forEach(walk);
    }
    walk(template.content);
    return template.innerHTML;
  }

  function renderMarkdown(text, sources) {
    if (!text) return '';
    const sourceMap = new Map(sources.map(s => [s.id, s]));
    let html = escapeHtml(text)
      // Code blocks
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      // Inline code
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      // Bold
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      // Headings
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
      // Blockquotes
      .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
      // Horizontal rule
      .replace(/^---$/gm, '<hr>')
      // Unordered lists
      .replace(/^\s*-\s+(.+)$/gm, '<li>$1</li>')
      // Ordered lists
      .replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>')
      // Wrap consecutive li in ul/ol
      .replace(/(<li>.*<\/li>)/s, (m) => {
        const lines = m.split('\n');
        let inList = false;
        let result = '';
        for (const line of lines) {
          if (line.startsWith('<li>') && !inList) {
            result += '<ul>' + line;
            inList = true;
          } else if (line.startsWith('<li>') && inList) {
            result += line;
          } else if (!line.startsWith('<li>') && inList) {
            result += '</ul>' + line;
            inList = false;
          } else {
            result += line;
          }
        }
        if (inList) result += '</ul>';
        return result;
      })
      // Paragraphs (double newline)
      .replace(/\n{2,}/g, '</p><p>')
      // Single newlines
      .replace(/\n/g, '<br>')
      // Wrap in paragraphs
      .replace(/^(.+)$/gm, '<p>$1</p>')
      // Clean empty paragraphs
      .replace(/<p><\/p>/g, '')
      // Fix block elements in paragraphs
      .replace(/<p>(<(h[1-3]|pre|ul|ol|blockquote|table|hr)[^>]*>)/g, '$1')
      .replace(/(<\/(h[1-3]|pre|ul|ol|blockquote|table|hr)>)<\/p>/g, '$1')
      // Citations [S1] -> badges
      .replace(/\[(S\d+)\]/g, (m, id) => {
        const src = sourceMap.get(id);
        if (!src) return m;
        return `<span class="cite-badge" data-source="${escapeHtml(id)}" tabindex="0" role="button" aria-label="Source: ${escapeHtml(src.title)}">${id.slice(1)}</span>`;
      });

    return sanitizeHtml(html);
  }

  // ---------- Date formatting ----------
  function formatChatTime(ts) {
    const d = new Date(ts);
    const today = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    if (d >= today) return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
    if (d >= yesterday) return 'Yesterday ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    if (d >= weekAgo) return d.toLocaleDateString('en-NG', { weekday: 'short' }) + ' ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  }

  function groupChats(chats) {
    const groups = { Today: [], Yesterday: [], 'Previous 7 days': [], Older: [] };
    const now = Date.now();
    const today = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    for (const chat of chats) {
      const d = new Date(chat.updatedAt);
      if (d >= today) groups.Today.push(chat);
      else if (d >= yesterday) groups.Yesterday.push(chat);
      else if (d >= weekAgo) groups['Previous 7 days'].push(chat);
      else groups.Older.push(chat);
    }
    return groups;
  }

  // ---------- View State ----------
  let chats = loadChats();
  pruneChats(chats);
  saveChats(chats);
  let currentChatId = null;
  let isStreaming = false;
  let streamController = null;
  let userScrolledUp = false;
  let sidebarOpen = false;

  // Initialize current chat
  if (chats.length === 0) {
    const chat = createChat();
    chats.unshift(chat);
    currentChatId = chat.id;
    saveChats(chats);
  } else if (!currentChatId || !chats.find(c => c.id === currentChatId)) {
    currentChatId = chats[0].id;
  }

  function getCurrentChat() {
    return chats.find(c => c.id === currentChatId);
  }

  // ---------- DOM Elements (created in render) ----------
  let rootEl = null;
  let sidebarEl = null;
  let messagesEl = null;
  let textareaEl = null;
  let sendBtn = null;
  let stopBtn = null;
  let scrollBtn = null;
  let statusDot = null;
  let charCountEl = null;

  // ---------- Render Functions ----------
  function render() {
    const chat = getCurrentChat();
    rootEl = h('div', { class: 'ai-page' },
      // Sidebar overlay for mobile
      h('div', { class: 'ai-sidebar-overlay', hidden: !sidebarOpen, onclick: closeSidebar }),
      // Main layout
      h('div', { class: 'ai-layout' },
        // Sidebar
        h('aside', { class: 'ai-sidebar', role: 'complementary', 'aria-label': 'Chat history' },
          h('div', { class: 'ai-sidebar-header' },
            h('button', { class: 'ai-new-chat-btn', onclick: newChat },
              icon('send'), 'New chat'
            ),
            h('div', { class: 'ai-search-wrap' },
              h('input', { 
                class: 'ai-search-input', type: 'search', placeholder: 'Search chats…', 
                'aria-label': 'Search chats', oninput: (e) => filterChats(e.target.value) 
              }),
              icon('search')
            ),
            h('button', { class: 'ai-sidebar-close', onclick: closeSidebar, 'aria-label': 'Close sidebar' }, icon('cross'))
          ),
          h('div', { class: 'ai-chat-list', role: 'list', 'aria-label': 'Conversations' }, renderChatGroups()),
          h('div', { class: 'ai-sidebar-footer' },
            h('button', { class: 'ai-clear-all-btn', onclick: confirmClearAll },
              icon('cross'), 'Clear all chats'
            ),
            h('p', { class: 'ai-storage-notice' },
              icon('info'), ' Chats are stored on this device only.'
            )
          )
        ),
        // Main chat area
        h('main', { class: 'ai-main', role: 'main' },
          h('header', { class: 'ai-header' },
            h('button', { class: 'ai-menu-btn', onclick: openSidebar, 'aria-label': 'Open menu', 'aria-expanded': sidebarOpen }, icon('menu')),
            h('div', { class: 'ai-header-title' },
              h('h1', null, chat?.title || 'New Chat'),
              h('span', { class: 'ai-badge' }, 'Kemist AI')
            ),
            h('div', { class: 'ai-status', 'aria-live': 'polite' },
              h('span', { class: 'ai-status-dot', id: 'aiStatusDot' }),
              h('span', { class: 'ai-status-text' }, groqConfigured() ? 'AI on' : 'Limited mode')
            )
          ),
          h('div', { class: 'ai-messages-wrap' },
            h('div', { class: 'ai-messages', id: 'aiMessages', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' },
              chat && chat.messages.length > 0
                ? chat.messages.map((msg, i) => renderMessage(msg, i))
                : renderEmptyState()
            ),
            // Scroll to bottom button
            h('button', { 
              class: 'ai-scroll-btn', id: 'aiScrollBtn', hidden: true,
              onclick: scrollToBottom, 'aria-label': 'Scroll to latest' 
            }, icon('chevron-down'))
          ),
          // Composer
          h('div', { class: 'ai-composer' },
            h('form', { class: 'ai-form', onsubmit: (e) => { e.preventDefault(); handleSend(); } },
              h('div', { class: 'ai-textarea-wrap' },
                h('textarea', { 
                  id: 'aiInput', class: 'ai-textarea',
                  placeholder: 'Ask about medicines, NAFDAC alerts, ingredients…',
                  rows: 1, maxlength: MAX_CHARS,
                  'aria-label': 'Message', disabled: isStreaming,
                  oninput: autoResize
                }),
                h('div', { class: 'ai-char-count', id: 'aiCharCount' }, '0 / ' + MAX_CHARS)
              ),
              h('div', { class: 'ai-form-actions' },
                h('button', { 
                  class: 'btn primary ai-send-btn', type: 'submit', id: 'aiSendBtn',
                  disabled: isStreaming, 'aria-label': 'Send message'
                }, icon('send')),
                h('button', { 
                  class: 'btn ai-stop-btn', type: 'button', id: 'aiStopBtn', hidden: true,
                  onclick: stopGeneration, 'aria-label': 'Stop generating'
                }, icon('cross'))
              )
            ),
            h('p', { class: 'ai-disclaimer' },
              'Kemist AI can make mistakes. Not medical advice. Check with a pharmacist.'
            )
          )
        )
      )
    );
    return rootEl;
  }

  function groqConfigured() {
    // Check if Groq is configured by looking at the window or trying the API
    return window.Kemist?.groqConfigured ?? true;
  }

  function renderChatGroups() {
    const groups = groupChats(chats);
    return Object.entries(groups).map(([label, list]) => 
      list.length > 0 ? h('div', { class: 'ai-chat-group' },
        h('div', { class: 'ai-chat-group-label' }, label),
        h('div', { class: 'ai-chat-items', role: 'list' },
          list.map(c => renderChatItem(c))
        )
      ) : null
    );
  }

  function renderChatItem(chat) {
    const isActive = chat.id === currentChatId;
    return h('button', {
      class: `ai-chat-item ${isActive ? 'active' : ''}`,
      role: 'listitem',
      onclick: () => selectChat(chat.id),
      oncontextmenu: (e) => showChatMenu(e, chat),
    },
      h('div', { class: 'ai-chat-item-main' },
        h('div', { class: 'ai-chat-item-title' }, chat.title || 'New Chat'),
        h('time', { class: 'ai-chat-item-time' }, formatChatTime(chat.updatedAt))
      ),
      h('button', { class: 'ai-chat-item-menu', 'aria-label': 'More options', onclick: (e) => { e.stopPropagation(); showChatMenu(e, chat); } },
        icon('more-vertical')
      )
    );
  }

  function renderEmptyState() {
    return h('div', { class: 'ai-empty-state' },
      h('div', { class: 'ai-empty-icon' }, icon('ai')),
      h('h2', null, 'How can I help with your medicines today?'),
      h('div', { class: 'ai-suggestions' },
        SUGGESTIONS.map(s => h('button', {
          class: 'ai-suggestion-card',
          onclick: () => { textareaEl.value = s.prompt; autoResize({ target: textareaEl }); handleSend(); }
        },
          h('div', { class: 'ai-suggestion-icon' }, icon('ai')),
          h('div', { class: 'ai-suggestion-text' }, s.text)
        ))
      ),
      h('p', { class: 'ai-disclaimer' },
        'This AI provides information from NAFDAC records, US FDA labels, and safety alerts. It is not medical advice. Consult a healthcare professional for personal decisions.'
      )
    );
  }

  function renderMessage(msg, index) {
    const isUser = msg.role === 'user';
    const isError = msg.error === true;
    const isEmergency = msg.mode === 'emergency';
    const content = isUser ? escapeHtml(msg.content) : renderMarkdown(msg.content, msg.sources || []);
    const showCaret = isStreaming && !isUser && index === (getCurrentChat()?.messages.length || 0) - 1;

    return h('div', { 
      class: `ai-message ${isUser ? 'user' : 'assistant'} ${isError ? 'error' : ''} ${isEmergency ? 'emergency' : ''}`,
      id: `msg-${index}`,
      role: 'article',
      'aria-label': isUser ? 'Your message' : 'AI response'
    },
      // Avatar
      h('div', { class: 'ai-message-avatar', 'aria-hidden': 'true' },
        isUser 
          ? h('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' }, 
              h('path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }), 
              h('circle', { cx: '12', cy: '7', r: '4' })
            )
          : h('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
              h('path', { d: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z' }),
              h('path', { d: 'M12 6v6l4 2' }), h('path', { d: 'M9 14h6' })
            )
      ),
      // Content
      h('div', { class: 'ai-message-content' },
        h('div', { class: 'ai-message-text', html: content }),
        // Blinking caret during streaming
        showCaret && h('span', { class: 'ai-caret', 'aria-hidden': 'true' }),
        // Emergency banner
        isEmergency && h('div', { class: 'ai-emergency-banner', role: 'alert' },
          h('strong', null, 'This sounds like an emergency'),
          h('p', null, 'Please call 112 now, or get to the nearest hospital. Do not wait for a reply here.'),
          h('div', { class: 'ai-emergency-actions' },
            h('a', { class: 'btn danger', href: 'tel:112' }, icon('phone'), 'Call 112'),
            h('a', { class: 'btn', href: '#/nearby' }, 'Find a hospital')
          )
        ),
        // Error state
        isError && h('div', { class: 'ai-error-state' },
          h('p', null, 'Sorry, I could not answer that.'),
          h('button', { class: 'btn small', onclick: () => regenerateLast() }, icon('refresh'), 'Retry')
        ),
        // Sources
        msg.sources && msg.sources.length > 0 && h('div', { class: 'ai-sources', id: `sources-${index}` },
          h('button', { 
            class: 'ai-sources-toggle', 
            onclick: (e) => toggleSources(e.currentTarget),
            'aria-expanded': 'false', 'aria-controls': `sources-list-${index}`
          },
            h('span', { class: 'ai-sources-label' }, 'Sources'),
            h('span', { class: 'ai-sources-count' }, msg.sources.length),
            icon('chevron-down')
          ),
          h('div', { class: 'ai-sources-list', id: `sources-list-${index}`, hidden: true, role: 'region', 'aria-label': 'Sources' },
            msg.sources.map((src, i) => renderSourceCard(src, i))
          )
        ),
        // Message actions (copy, regenerate, feedback)
        !isUser && h('div', { class: 'ai-message-actions', 'aria-label': 'Message actions' },
          h('button', { class: 'ai-action-btn', onclick: () => copyMessage(content), title: 'Copy', 'aria-label': 'Copy message' }, icon('copy')),
          h('button', { class: 'ai-action-btn', onclick: () => regenerateLast(), title: 'Regenerate', 'aria-label': 'Regenerate response' }, icon('refresh-cw')),
          h('button', { class: 'ai-action-btn', onclick: () => rateMessage(index, 'good'), title: 'Good answer', 'aria-label': 'Good answer', 'aria-pressed': msg.rating === 'good' }, icon('thumbs-up')),
          h('button', { class: 'ai-action-btn', onclick: () => rateMessage(index, 'bad'), title: 'Bad answer', 'aria-label': 'Bad answer', 'aria-pressed': msg.rating === 'bad' }, icon('thumbs-down'))
        )
      )
    );
  }

  function renderSourceCard(src, index) {
    const kindIcons = {
      drug: 'package',
      label: 'file-text',
      alert: 'alert-triangle',
      clinical: 'flask-conical',
      news: 'newspaper',
    };
    return h('a', { 
      class: 'ai-source-card', 
      href: src.link || '#', 
      target: src.external ? '_blank' : undefined,
      rel: src.external ? 'noopener noreferrer' : undefined,
      'data-source-id': src.id
    },
      h('div', { class: 'ai-source-icon' }, icon(kindIcons[src.kind] || 'file')),
      h('div', { class: 'ai-source-info' },
        h('div', { class: 'ai-source-title' }, src.title),
        h('div', { class: 'ai-source-kind' }, src.kind.charAt(0).toUpperCase() + src.kind.slice(1))
      ),
      h('span', { class: 'ai-source-badge' }, src.id.replace('S', ''))
    );
  }

  // ---------- Event Handlers ----------
  function newChat() {
    const chat = createChat();
    chats.unshift(chat);
    currentChatId = chat.id;
    saveChats(chats);
    refresh();
  }

  function selectChat(id) {
    currentChatId = id;
    sidebarOpen = false;
    refresh();
  }

  function deleteChat(id) {
    chats = chats.filter(c => c.id !== id);
    if (currentChatId === id) currentChatId = chats[0]?.id || null;
    saveChats(chats);
    refresh();
  }

  function renameChat(id, newTitle) {
    const chat = chats.find(c => c.id === id);
    if (chat) { chat.title = newTitle; saveChats(chats); refresh(); }
  }

  function confirmClearAll() {
    if (confirm('Clear all chat history? This cannot be undone.')) {
      chats = [];
      currentChatId = null;
      localStorage.removeItem(STORAGE_KEY);
      refresh();
    }
  }

  function showChatMenu(e, chat) {
    e.preventDefault();
    e.stopPropagation();
    // Simple context menu using prompt for rename (could be enhanced with a proper menu)
    const action = prompt('Chat options:\n1. Rename\n2. Delete\n3. Cancel', '1');
    if (action === '1') {
      const newTitle = prompt('New title:', chat.title);
      if (newTitle && newTitle.trim()) renameChat(chat.id, newTitle.trim());
    } else if (action === '2') {
      if (confirm(`Delete "${chat.title}"?`)) deleteChat(chat.id);
    }
  }

  function filterChats(query) {
    const items = $$('.ai-chat-item');
    const q = query.toLowerCase();
    items.forEach(item => {
      const title = item.querySelector('.ai-chat-item-title').textContent.toLowerCase();
      item.hidden = !title.includes(q);
    });
  }

  function openSidebar() { sidebarOpen = true; refresh(); }
  function closeSidebar() { sidebarOpen = false; refresh(); }

  function autoResize(e) {
    const ta = e.target;
    ta.style.height = 'auto';
    const h = Math.min(ta.scrollHeight, 180);
    ta.style.height = h + 'px';
    updateCharCount(ta.value.length);
  }

  function updateCharCount(len) {
    if (charCountEl) charCountEl.textContent = `${len} / ${MAX_CHARS}`;
    if (sendBtn) sendBtn.disabled = len === 0 || len > MAX_CHARS || isStreaming;
  }

  function scrollToBottom() {
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
      userScrolledUp = false;
      if (scrollBtn) scrollBtn.hidden = true;
    }
  }

  function handleScroll() {
    if (!messagesEl) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesEl;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    userScrolledUp = !atBottom;
    if (scrollBtn) scrollBtn.hidden = atBottom || isStreaming;
  }

  async function handleSend() {
    const text = textareaEl?.value?.trim();
    if (!text || text.length < 2 || isStreaming) return;

    let chat = getCurrentChat();
    if (!chat) { chat = createChat(); chats.unshift(chat); currentChatId = chat.id; }

    isStreaming = true;
    streamController = new AbortController();
    textareaEl.value = '';
    autoResize({ target: textareaEl });
    textareaEl.disabled = true;
    if (sendBtn) sendBtn.hidden = true;
    if (stopBtn) stopBtn.hidden = false;

    // Add user message
    addMessage(chat, 'user', text);
    refreshMessages();
    scrollToBottom();

    try {
      // Try streaming first
      await streamChat(chat, text);
    } catch (e) {
      console.warn('[chat] Streaming failed, falling back:', e.message);
      // Fallback to non-streaming
      try {
        const res = await api('/api/chat', { 
          method: 'POST', headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ message: text, history: chat.messages.slice(-12).map(m => ({ role: m.role, content: m.content })) }) 
        });
        addMessage(chat, 'assistant', res.answer, res.sources);
        if (res.mode === 'emergency') chat.messages[chat.messages.length - 1].mode = 'emergency';
      } catch (err) {
        addMessage(chat, 'assistant', `Sorry, I encountered an error: ${err.message}. Please try again.`, [], { error: true });
      }
    } finally {
      isStreaming = false;
      streamController = null;
      textareaEl.disabled = false;
      if (sendBtn) sendBtn.hidden = false;
      if (stopBtn) stopBtn.hidden = true;
      textareaEl.focus();
      refreshMessages();
    }
  }

  async function streamChat(chat, text) {
    const history = chat.messages.slice(-12).map(m => ({ role: m.role, content: m.content }));
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history }),
      signal: streamController.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (res.status === 429) throw new Error('Rate limited. Please wait a moment.');
      throw new Error(err.error || 'Stream failed');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantMsg = { role: 'assistant', content: '', sources: [] };
    let msgIndex = chat.messages.length;
    chat.messages.push(assistantMsg);
    refreshMessages();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'token') {
              assistantMsg.content += parsed.content;
              refreshMessage(msgIndex);
              if (!userScrolledUp) scrollToBottom();
            } else if (parsed.type === 'done') {
              assistantMsg.sources = parsed.sources || [];
              assistantMsg.mode = parsed.mode;
            } else if (parsed.type === 'emergency' || parsed.type === 'greeting' || parsed.type === 'no-data') {
              assistantMsg.content = parsed.content;
              assistantMsg.mode = parsed.type;
              refreshMessage(msgIndex);
            } else if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue; // ignore parse errors
            throw e;
          }
        }
      }
    }
    updateChatTitle(chat);
    saveChats(chats);
  }

  function stopGeneration() {
    if (streamController) streamController.abort();
    isStreaming = false;
    streamController = null;
    textareaEl.disabled = false;
    if (sendBtn) sendBtn.hidden = false;
    if (stopBtn) stopBtn.hidden = true;
    textareaEl.focus();
  }

  function regenerateLast() {
    const chat = getCurrentChat();
    if (!chat || chat.messages.length === 0) return;
    // Find last user message
    const lastUserIdx = [...chat.messages].reverse().findIndex(m => m.role === 'user');
    if (lastUserIdx === -1) return;
    const lastUserMsg = chat.messages[chat.messages.length - 1 - lastUserIdx];
    // Remove all messages after that user message
    chat.messages = chat.messages.slice(0, chat.messages.length - lastUserIdx);
    saveChats(chats);
    handleSend(lastUserMsg.content);
  }

  function copyMessage(html) {
    // Extract text content from HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const text = temp.textContent || temp.innerText || '';
    navigator.clipboard.writeText(text).then(() => {
      // Show toast
      const toast = h('div', { class: 'ai-toast' }, 'Copied!');
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    });
  }

  function rateMessage(index, rating) {
    const chat = getCurrentChat();
    if (!chat || index >= chat.messages.length) return;
    const msg = chat.messages[index];
    if (msg.role !== 'assistant') return;
    msg.rating = rating === msg.rating ? null : rating;
    saveChats(chats);
    refreshMessage(index);
  }

  function toggleSources(btn) {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    const list = $('#sources-list-' + btn.closest('.ai-sources').id.split('-')[1]);
    if (list) list.hidden = expanded;
    btn.querySelector('svg').style.transform = expanded ? '' : 'rotate(180deg)';
  }

  // ---------- Refresh Functions ----------
  function refresh() {
    if (!rootEl) return;
    const newRoot = render();
    rootEl.replaceWith(newRoot);
    rootEl = newRoot;
    bindElements();
  }

  function refreshMessages() {
    const chat = getCurrentChat();
    if (!messagesEl) return;
    if (!chat || chat.messages.length === 0) {
      messagesEl.replaceChildren(renderEmptyState());
    } else {
      messagesEl.replaceChildren(...chat.messages.map((msg, i) => renderMessage(msg, i)));
    }
    // Re-bind citation badges
    bindCitations();
  }

  function refreshMessage(index) {
    const chat = getCurrentChat();
    if (!chat || index >= chat.messages.length) return;
    const oldEl = $(`#msg-${index}`, messagesEl);
    const newEl = renderMessage(chat.messages[index], index);
    if (oldEl) oldEl.replaceWith(newEl);
    bindCitations();
  }

  function bindElements() {
    messagesEl = $('#aiMessages');
    textareaEl = $('#aiInput');
    sendBtn = $('#aiSendBtn');
    stopBtn = $('#aiStopBtn');
    scrollBtn = $('#aiScrollBtn');
    statusDot = $('#aiStatusDot');
    charCountEl = $('#aiCharCount');
    if (messagesEl) messagesEl.addEventListener('scroll', handleScroll);
    if (textareaEl) {
      textareaEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
      });
    }
  }

  function bindCitations() {
    $$('.cite-badge').forEach(badge => {
      badge.addEventListener('click', () => showSourceHover(badge));
      badge.addEventListener('focus', () => showSourceHover(badge));
      badge.addEventListener('blur', () => hideSourceHover(badge));
    });
  }

  function showSourceHover(badge) {
    const sourceId = badge.dataset.source;
    const chat = getCurrentChat();
    if (!chat) return;
    const source = chat.messages.flatMap(m => m.sources || []).find(s => s.id === sourceId);
    if (!source) return;
    // Create hover card
    const card = h('div', { class: 'ai-source-hover' },
      h('strong', null, source.title),
      h('p', null, source.kind.charAt(0).toUpperCase() + source.kind.slice(1)),
      source.link && h('a', { href: source.link, target: source.external ? '_blank' : undefined, rel: 'noopener noreferrer' }, 'Open source')
    );
    badge.appendChild(card);
  }

  function hideSourceHover(badge) {
    const card = badge.querySelector('.ai-source-hover');
    if (card) card.remove();
  }

  // ---------- Initialize ----------
  function init() {
    const viewEl = window.Kemist.viewEl();
    viewEl.replaceChildren(render());
    bindElements();
  }

  window.Kemist.views.ai = init;
})();
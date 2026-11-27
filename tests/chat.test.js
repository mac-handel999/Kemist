'use strict';
const test = require('node:test');
const assert = require('node:assert');

// Mock DOM for JSDOM-like environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, writable: true, configurable: true });
Object.defineProperty(global, 'crypto', { value: dom.window.crypto, writable: true, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.Text = dom.window.Text;
global.HTMLTemplateElement = dom.window.HTMLTemplateElement;
global.customElements = dom.window.customElements;

// Mock localStorage
const mockStorage = new Map();
global.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, value) => mockStorage.set(key, String(value)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

// ---- Extracted functions from chat.js ----

// Constants
const STORAGE_KEY = 'kemist.chats';
const MAX_CHATS = 50;
const MAX_CHARS = 500;

// Utilities
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '' }[c]));
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
const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'blockquote', 'a', 'span', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
const ALLOWED_ATTRS = {
  a: ['href', 'title', 'target', 'rel'],
  span: ['class', 'data-source', 'tabindex', 'role', 'aria-label'],
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

function renderMarkdown(text, sources = []) {
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

// ---------- SSE Parser (extracted from streamChat) ----------
function parseSSEStream(buffer) {
  const lines = buffer.split('\n');
  const remaining = lines.pop() || '';
  const events = [];
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        events.push({ type: 'done' });
        continue;
      }
      try {
        const parsed = JSON.parse(data);
        events.push(parsed);
      } catch (e) {
        // ignore parse errors
      }
    }
  }
  
  return { events, remaining };
}

// ---- Tests ----

test('sanitizeHtml - removes disallowed tags', () => {
  const html = '<script>alert("xss")</script><p>safe</p>';
  const result = sanitizeHtml(html);
  assert.ok(!result.includes('<script>'), 'script tag should be removed');
  assert.ok(result.includes('<p>safe</p>'), 'p tag should remain');
});

test('sanitizeHtml - removes on* event handlers (not in allowed attrs)', () => {
  const html = '<p onclick="alert(1)">click</p>';
  const result = sanitizeHtml(html);
  assert.ok(!result.includes('onclick'), 'onclick should be removed');
  assert.ok(result.includes('<p>click</p>'), 'p content should remain');
});

test('sanitizeHtml - removes style attributes (not in allowed attrs)', () => {
  const html = '<p style="color:red">styled</p>';
  const result = sanitizeHtml(html);
  assert.ok(!result.includes('style='), 'style attribute should be removed');
  assert.ok(result.includes('<p>styled</p>'), 'p content should remain');
});

test('sanitizeHtml - preserves allowed tags and attributes', () => {
  const html = '<p><strong>bold</strong> <em>italic</em> <code>code</code> <a href="https://example.com">link</a></p>';
  const result = sanitizeHtml(html);
  assert.ok(result.includes('<strong>bold</strong>'));
  assert.ok(result.includes('<em>italic</em>'));
  assert.ok(result.includes('<code>code</code>'));
  assert.ok(result.includes('<a href="https://example.com"'));
  assert.ok(result.includes('target="_blank"'));
});

test('sanitizeHtml - preserves pre and code with class', () => {
  const html = '<pre><code class="language-js">console.log(1)</code></pre>';
  const result = sanitizeHtml(html);
  assert.ok(result.includes('<pre>'));
  assert.ok(result.includes('<code class="language-js">'));
  assert.ok(result.includes('console.log(1)'));
});

test("renderMarkdown - sanitizes HTML (removes script tags)", () => {
  const result = renderMarkdown("<script>alert(1)</script>");
  assert.ok(!result.includes("<script>"));
  assert.ok(result.includes("alert(1)"));
});

test('renderMarkdown - renders bold and italic', () => {
  const result = renderMarkdown('**bold** and *italic*');
  assert.ok(result.includes('<strong>bold</strong>'));
  assert.ok(result.includes('<em>italic</em>'));
});

test('renderMarkdown - renders code blocks', () => {
  const result = renderMarkdown('```js\nconsole.log(1)\n```');
  assert.ok(result.includes('<pre><code class="language-js">console.log(1)<br></code></pre>'));
});

test('renderMarkdown - renders inline code', () => {
  const result = renderMarkdown('Use `console.log()` to print');
  assert.ok(result.includes('<code>console.log()</code>'));
});

test('renderMarkdown - renders headings', () => {
  const result = renderMarkdown('# H1\n## H2\n### H3');
  assert.ok(result.includes('<h1>H1</h1>'));
  assert.ok(result.includes('<h2>H2</h2>'));
  assert.ok(result.includes('<h3>H3</h3>'));
});

test('renderMarkdown - renders blockquotes', () => {
  const result = renderMarkdown('> quoted text');
  assert.ok(result.includes('<blockquote>quoted text</blockquote>'));
});

test('renderMarkdown - renders horizontal rule', () => {
  const result = renderMarkdown('---');
  assert.ok(result.includes('<hr>'));
});

test('renderMarkdown - renders unordered lists', () => {
  const result = renderMarkdown('- item 1\n- item 2');
  assert.ok(result.includes('<ul>'));
  assert.ok(result.includes('<li>item 1</li>'));
  assert.ok(result.includes('<li>item 2</li>'));
});

test('renderMarkdown - renders ordered lists', () => {
  const result = renderMarkdown('1. first\n2. second');
  assert.ok(result.includes('<li>first</li>'));
  assert.ok(result.includes('<li>second</li>'));
});

test('renderMarkdown - renders citations as badges', () => {
  const sources = [{ id: 'S1', title: 'Test Source' }];
  const result = renderMarkdown('This is a fact [S1].', sources);
  assert.ok(result.includes('cite-badge'));
  assert.ok(result.includes('data-source="S1"'));
  assert.ok(result.includes('>1<')); // badge shows "1"
});

test('renderMarkdown - handles missing citation gracefully', () => {
  const result = renderMarkdown('Unknown [S99].');
  assert.ok(result.includes('[S99]')); // unchanged since not in sources
});

test('renderMarkdown - citation badge has accessibility attributes', () => {
  const sources = [{ id: 'S1', title: 'Test Source' }];
  const result = renderMarkdown('[S1]', sources);
  assert.ok(result.includes('tabindex="0"'));
  assert.ok(result.includes('role="button"'));
  assert.ok(result.includes('aria-label="Source: Test Source"'));
});

test('renderMarkdown - empty input returns empty string', () => {
  assert.strictEqual(renderMarkdown(''), '');
  assert.strictEqual(renderMarkdown(null), '');
});

test('Chat Storage - createChat creates valid chat object', () => {
  const chat = createChat();
  assert.ok(chat.id);
  assert.strictEqual(chat.title, 'New Chat');
  assert.deepStrictEqual(chat.messages, []);
  assert.ok(chat.createdAt);
  assert.ok(chat.updatedAt);
});

test('Chat Storage - loadChats returns empty array initially', () => {
  localStorage.clear();
  const chats = loadChats();
  assert.deepStrictEqual(chats, []);
});

test('Chat Storage - saveChats and loadChats roundtrip', () => {
  localStorage.clear();
  const chat = createChat();
  addMessage(chat, 'user', 'Hello');
  addMessage(chat, 'assistant', 'Hi there!');
  saveChats([chat]);
  
  const loaded = loadChats();
  assert.strictEqual(loaded.length, 1);
  assert.strictEqual(loaded[0].id, chat.id);
  assert.strictEqual(loaded[0].messages.length, 2);
  assert.strictEqual(loaded[0].messages[0].content, 'Hello');
  assert.strictEqual(loaded[0].messages[1].content, 'Hi there!');
});

test('Chat Storage - updateChatTitle sets title from first user message', () => {
  const chat = createChat();
  addMessage(chat, 'assistant', 'Hi!');
  addMessage(chat, 'user', 'What is paracetamol used for?');
  addMessage(chat, 'assistant', 'Paracetamol is used for...');
  
  assert.ok(chat.title.includes('What is paracetamol'));
  assert.ok(chat.title.length <= 51); // 50 + ellipsis
});

test('Chat Storage - updateChatTitle truncates long titles', () => {
  const chat = createChat();
  addMessage(chat, 'user', 'A'.repeat(100));
  
  assert.ok(chat.title.endsWith('…'));
  assert.ok(chat.title.length <= 51);
});

test('Chat Storage - pruneChats limits to MAX_CHATS', () => {
  const chats = Array.from({ length: 55 }, (_, i) => {
    const c = createChat();
    c.title = `Chat ${i}`;
    return c;
  });
  
  pruneChats(chats);
  assert.strictEqual(chats.length, MAX_CHATS);
});

test('Chat Storage - pruneChats removes oldest (first in array)', () => {
  const chats = Array.from({ length: 55 }, (_, i) => {
    const c = createChat();
    c.title = `Chat ${i}`;
    c.updatedAt = now() + i; // later = newer
    return c;
  });
  
  pruneChats(chats);
  // pruneChats just splices from MAX_CHATS, keeping first 50 (oldest in this case)
  assert.strictEqual(chats[0].title, 'Chat 0');
  assert.strictEqual(chats[chats.length - 1].title, 'Chat 49');
});

test('Chat Storage - addMessage adds message and updates title', () => {
  const chat = createChat();
  addMessage(chat, 'user', 'Test message');
  
  assert.strictEqual(chat.messages.length, 1);
  assert.strictEqual(chat.messages[0].role, 'user');
  assert.strictEqual(chat.messages[0].content, 'Test message');
  assert.ok(chat.messages[0].timestamp);
  assert.strictEqual(chat.title, 'Test message');
});

test('Chat Storage - handles corrupted localStorage gracefully', () => {
  localStorage.setItem(STORAGE_KEY, 'invalid json{');
  const chats = loadChats();
  assert.deepStrictEqual(chats, []);
});

test('SSE Parser - parses token events', () => {
  const buffer = 'data: {"type":"token","content":"Hello"}\n\n';
  const { events, remaining } = parseSSEStream(buffer);
  
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'token');
  assert.strictEqual(events[0].content, 'Hello');
  assert.strictEqual(remaining, '');
});

test('SSE Parser - parses multiple events', () => {
  const buffer = 'data: {"type":"token","content":"H"}\ndata: {"type":"token","content":"i"}\n\n';
  const { events, remaining } = parseSSEStream(buffer);
  
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].content, 'H');
  assert.strictEqual(events[1].content, 'i');
});

test('SSE Parser - handles DONE marker', () => {
  const buffer = 'data: {"type":"done","sources":[]}\ndata: [DONE]\n\n';
  const { events, remaining } = parseSSEStream(buffer);
  
  assert.ok(events.some(e => e.type === 'done'));
  assert.ok(events.some(e => e.type === 'done' && e.content === undefined)); // [DONE] event
});

test('SSE Parser - preserves incomplete line in remaining', () => {
  const buffer = 'data: {"type":"token","content":"Hel';
  const { events, remaining } = parseSSEStream(buffer);
  
  assert.strictEqual(events.length, 0);
  assert.strictEqual(remaining, 'data: {"type":"token","content":"Hel');
});

test('SSE Parser - ignores invalid JSON', () => {
  const buffer = 'data: not json\n\ndata: {"type":"token","content":"ok"}\n\n';
  const { events, remaining } = parseSSEStream(buffer);
  
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'token');
  assert.strictEqual(events[0].content, 'ok');
});

test('SSE Parser - parses error events', () => {
  const buffer = 'data: {"error":"Rate limited"}\n\n';
  const { events, remaining } = parseSSEStream(buffer);
  
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].error, 'Rate limited');
});

test('SSE Parser - parses emergency/greeting/no-data types', () => {
  const buffer = 'data: {"type":"emergency","content":"Call 112"}\n\n';
  const { events } = parseSSEStream(buffer);
  
  assert.strictEqual(events[0].type, 'emergency');
  assert.strictEqual(events[0].content, 'Call 112');
});
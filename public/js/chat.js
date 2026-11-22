'use strict';
/* "Ask Kemist": a chat page. Answers come from NAFDAC records, NAFDAC alerts and US label text stored in Kemist's database. */
(() => {
  const { h, put, api, icon, ICON } = window.Kemist;

  const SUGGESTIONS = [
    'Is NAFDAC number A4-7559 registered?',
    'What is paracetamol used for?',
    'Has NAFDAC warned about fake artemether?',
    'How can I tell if a medicine pack is fake?',
  ];

  /** Turn "text [S1] more" into nodes, linking each [S#] to its source. */
  function withCitations(text, sources) {
    const byId = new Map(sources.map((s) => [s.id, s]));
    const out = [];
    let last = 0;
    for (const m of String(text).matchAll(/\[(S\d+)\]/g)) {
      if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
      const src = byId.get(m[1]);
      out.push(src
        ? h('a', { class: 'cite', href: src.link || '#', title: src.title, ...(src.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }, m[1].slice(1))
        : document.createTextNode(''));
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(document.createTextNode(text.slice(last)));
    return out;
  }

  const paragraphs = (text, sources) => String(text).split(/\n+/).filter(Boolean).map((line) => h('p', null, withCitations(line, sources)));

  function AskView(parts, params) {
    const history = [];
    document.title = 'Ask Kemist';
    const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' });
    const input = h('input', { id: 'askq', type: 'text', maxlength: '500', placeholder: 'Ask about a medicine, a NAFDAC number or an alert', autocomplete: 'off', enterkeyhint: 'send', 'aria-label': 'Your question' });
    const sendBtn = h('button', { class: 'btn primary', type: 'submit', 'aria-label': 'Send' }, icon('send'));
    let busy = false;

    const bubble = (role, ...kids) => { const b = h('div', { class: `bubble ${role}` }, ...kids); log.append(b); b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return b; };

    async function ask(text) {
      const q = String(text || '').trim();
      if (q.length < 2 || busy) return;
      busy = true; sendBtn.disabled = true; input.value = '';
      suggestions.hidden = true;
      bubble('user', q);
      const thinking = bubble('bot', h('span', { class: 'spinner' }), ' Looking in Kemist’s data…');
      try {
        const r = await api('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q, history: history.slice(-4) }) });
        history.push({ role: 'user', content: q }, { role: 'assistant', content: r.answer });
        const kids = [paragraphs(r.answer, r.sources || [])];
        if (r.mode === 'emergency') kids.push(h('a', { class: 'btn danger', href: 'tel:112' }, icon('phone'), 'Call 112'), h('a', { class: 'btn', href: '#/nearby' }, 'Find a hospital'));
        if (r.mode === 'retrieval-only') kids.push(h('p', { class: 'hint' }, r.note || 'The AI is switched off, so this is a plain list of matching records.'));
        if (r.sources && r.sources.length) kids.push(h('div', { class: 'sources' }, h('span', { class: 'hint' }, 'Sources'), r.sources.map((s) =>
          h('a', { class: 'chip', href: s.link || '#', ...(s.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }, `${s.id.slice(1)} · ${s.title.slice(0, 48)}`))));
        thinking.className = `bubble bot${r.mode === 'emergency' ? ' emergency' : ''}`;
        put(thinking, kids);
      } catch (e) {
        thinking.className = 'bubble bot error';
        put(thinking, e.message);
      } finally { busy = false; sendBtn.disabled = false; input.focus(); }
    }

    const suggestions = h('div', { class: 'chips' }, SUGGESTIONS.map((t) => h('button', { class: 'chip', type: 'button', onclick: () => ask(t) }, t)));

    put(window.Kemist.viewEl(), h('div', { class: 'page chat' },
      h('div', { class: 'stack' },
        h('h1', null, 'Ask Kemist'),
        h('p', { class: 'lead' }, 'Ask in plain words. Answers use NAFDAC records, NAFDAC alerts and US label information in Kemist’s database, and show their sources.')),
      h('div', { class: 'callout' }, h('strong', null, 'Not medical advice'),
        h('p', null, 'Kemist cannot diagnose or give doses. For symptoms, ask a pharmacist or doctor. In an emergency call 112.')),
      log, suggestions,
      h('form', { class: 'chat-form', onsubmit: (e) => { e.preventDefault(); ask(input.value); } }, input, sendBtn)));

    const q = params.get('q');
    if (q) ask(q);
  }

  window.Kemist.views.ask = AskView;
})();

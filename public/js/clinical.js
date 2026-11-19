'use strict';
/* Adds "About this medicine" (US label information) to the medicine page. Loaded after app.js. */
(() => {
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const TITLES = [
    ['indications', 'What it is used for'], ['contraindications', 'Who should not use it'],
    ['warnings', 'Warnings and precautions'], ['adverse_reactions', 'Possible side effects'], ['interactions', 'Interactions with other medicines'],
  ];
  const SHOW_CHARS = 1500;

  const fmt = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

  function render(data) {
    const label = data.labels[0];
    const meta = [label.title, label.effective_date && `label dated ${fmt(label.effective_date)}`, label.jurisdiction && `${label.jurisdiction} label`].filter(Boolean).join(' · ');
    const items = TITLES.filter(([k]) => label.sections[k]).map(([k, title]) => {
      const text = label.sections[k];
      const long = text.length > SHOW_CHARS;
      return h('details', { class: 'callout' },
        h('summary', null, title),
        h('p', { style: 'white-space:pre-line;overflow-wrap:anywhere' }, long ? `${text.slice(0, SHOW_CHARS).trimEnd()}…` : text),
        long && label.source_url && h('a', { href: label.source_url, target: '_blank', rel: 'noopener noreferrer' }, 'Read the full label'));
    });
    return h('section', { class: 'stack', id: 'clinical-info' },
      h('div', { class: 'section-title' }, h('h2', null, 'About this medicine'), h('span', { class: 'count' }, 'US label information')),
      h('div', { class: 'callout' }, h('strong', null, 'From a US label, not from NAFDAC'), h('p', null, data.note)),
      h('p', { class: 'hint' }, meta, label.source_url ? [' · ', h('a', { href: label.source_url, target: '_blank', rel: 'noopener noreferrer' }, `Source: ${label.source}`)] : null),
      items);
  }

  document.addEventListener('kemist:drug-rendered', async (e) => {
    const { drug, page } = e.detail || {};
    if (!drug || !page) return;
    try {
      const res = await fetch(`/api/clinical/by-drug/${encodeURIComponent(drug.id)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.matched || !data.labels.length || !page.isConnected) return;
      const actions = [...page.querySelectorAll('.actions')].pop();
      const section = render(data);
      if (actions) page.insertBefore(section, actions); else page.append(section);
    } catch { /* clinical info is optional: the page works without it */ }
  });
})();

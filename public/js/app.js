'use strict';
/* Kemist front end. No framework: small DOM helper + hash router. */
(() => {
  // ---------- tiny helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  /** h('div', {class:'x', onclick: fn}, 'text', childNode) : builds DOM without innerHTML (safe against XSS) */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;            // only ever used with our own static SVG strings
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  /** replaceChildren that ignores null/false (so conditional children never print as text) */
  const put = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));

  const svg = (paths, extra = '') =>
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${paths}</svg>`;
const ICON = {
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    alert: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>'),
    cross: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
    phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>'),
    route: svg('<path d="M9 18l-6 3V6l6-3 6 3 6-3z"/><path d="M9 3v15M15 6v15"/>'),
    locate: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
    clinical: svg('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'),
    nearby: svg('<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    ai: svg('<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/><path d="M12 6v6l4 2"/><path d="M9 14h6"/>'),
    report: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
    external: svg('<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>'),
    news: svg('<path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"/><path d="M8 10h8"/><path d="M8 14h5"/><path d="M8 18h3"/>'),
    send: svg('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>'),
  };
  const icon = (name) => h('span', { html: ICON[name], class: 'ico', 'aria-hidden': 'true', style: 'display:inline-flex' });

  async function api(path, options) {
    let res;
    try { res = await fetch(path, options); }
    catch { throw new Error('No connection. Check your network and try again.'); }
    let body = null;
    try { body = await res.json(); } catch { /* ignore */ }
    if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status}).`);
    return body;
  }

  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage can be unavailable */ } },
  };

  const state = { meta: null, installPrompt: null };

  const fmtDate = (d) => (d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
  const loading = (text = 'Loading') => h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spinner' }), text);

  // ---------- verdict display ----------
  const LEVEL_ICON = { ok: 'check', warn: 'alert', info: 'info', bad: 'cross' };
  const SHORT = { ok: 'Registered', warn: 'Check status', info: 'Status unclear', bad: 'Not found' };
  const pill = (level, label) => h('span', { class: `pill ${level}` }, icon(LEVEL_ICON[level]), label || SHORT[level]);

  // ---------- router ----------
  const view = $('#view');
  const nearbyEl = $('#nearby');

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query = ''] = raw.split('?');
    return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
  }

  async function route() {
    const { parts, params } = parseHash();
    const name = parts[0] || 'home';
    document.querySelectorAll('.nav a, .mobile-nav a').forEach((a) => {
      const active = a.dataset.route === (name === 'drug' ? 'check' : name);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });

    const isHome = name === 'home';
    const isNearby = name === 'nearby';
    nearbyEl.hidden = !isNearby;
    view.hidden = isNearby;
    if (isNearby) { Nearby.show(); document.title = 'Nearby · Kemist'; return; }

    view.replaceChildren();
    window.scrollTo(0, 0);
    if (name === 'home') { document.title = 'Kemist'; return HomeView(); }
    if (name === 'dashboard') { document.title = 'Dashboard · Kemist'; return DashboardView(); }
    if (name === 'drug' && parts[1]) { document.title = 'Medicine · Kemist'; return DrugView(parts[1]); }
    if (name === 'report') { document.title = 'Report a problem · Kemist'; return ReportView(params); }
    if (name === 'about') { document.title = 'About · Kemist'; return AboutView(); }
    if (name === 'alerts') { document.title = 'Safety Alerts · Kemist'; return AlertsView(params); }
    if (name === 'report-medicine') { document.title = 'Report a Medicine · Kemist'; return ReportMedicineView(params); }
    if (name === 'clinical') { document.title = 'Clinical Library · Kemist'; return ClinicalLibraryView(params); }
    if (name === 'ai') { document.title = 'AI Assistant · Kemist'; return AIAssistantView(params); }
    if (name === 'news') { document.title = 'Health News · Kemist'; return NewsView(params); }
    document.title = 'Kemist: check a medicine, find a pharmacy';
    return CheckView(params.get('q') || '');
  }

  // ---------- Home / landing ----------
  function HomeView() {
    // Redirect to Dashboard view - landing page handles marketing content
    location.hash = '#/dashboard';
  }

  // ---------- Dashboard view ----------
  async function DashboardView() {
    const page = h('div', { class: 'page dashboard' }, loading('Loading dashboard'));
    view.append(page);

    try {
      const [newsRes] = await Promise.all([
        api('/api/news?limit=6').catch(() => ({ data: [] }))
      ]);

      const news = newsRes.data || [];

      put(page,
        h('header', { class: 'dashboard-header' },
          h('h1', null, 'Kemist Dashboard'),
          h('p', { class: 'lead' }, 'Your medicine safety & healthcare intelligence centre')
        ),
        h('section', { class: 'dashboard-section', 'aria-labelledby': 'quickActionsTitle' },
          h('h2', { id: 'quickActionsTitle' }, 'Quick Actions'),
          h('div', { class: 'action-grid' },
            h('a', { class: 'action-card', href: '#/check' },
              h('div', { class: 'action-icon' }, icon('search')),
              h('h3', null, 'Check Medicine'),
              h('p', null, 'Verify NAFDAC registration, check authenticity, and view product details')
            ),
            h('a', { class: 'action-card', href: '#/alerts' },
              h('div', { class: 'action-icon' }, icon('alert')),
              h('h3', null, 'Safety Alerts'),
              h('p', null, 'Official NAFDAC recalls, counterfeit warnings, and safety notices')
            ),
            h('a', { class: 'action-card', href: '#/clinical' },
              h('div', { class: 'action-icon' }, icon('clinical')),
              h('h3', null, 'Clinical Library'),
              h('p', null, 'Drug indications, contraindications, interactions, and dosing info')
            ),
            h('a', { class: 'action-card', href: '#/nearby' },
              h('div', { class: 'action-icon' }, icon('nearby')),
              h('h3', null, 'Find Facilities'),
              h('p', null, 'Locate pharmacies, clinics, and hospitals near you')
            ),
            h('a', { class: 'action-card', href: '#/ai' },
              h('div', { class: 'action-icon' }, icon('ai')),
              h('h3', null, 'AI Assistant'),
              h('p', null, 'Ask questions about medicines, safety, and health topics')
            ),
            h('a', { class: 'action-card', href: '#/report-medicine' },
              h('div', { class: 'action-icon' }, icon('report')),
              h('h3', null, 'Report Medicine'),
              h('p', null, 'Submit a counterfeit or substandard medicine report to NAFDAC')
            )
          )
        ),
        h('section', { class: 'dashboard-section', 'aria-labelledby': 'newsTitle' },
          h('div', { class: 'section-header' },
            h('h2', { id: 'newsTitle' }, 'Latest Health & Pharmacy News'),
            h('a', { class: 'btn small', href: '#/news' }, 'View All')
          ),
          news.length === 0
            ? h('div', { class: 'empty' }, 
                h('p', null, 'No news available yet.'),
                h('p', null, 'Run the news sync to populate:'),
                h('pre', { style: 'background:var(--bg-tertiary); padding:10px; border-radius:6px; overflow-x:auto; margin-top:6px; font-size:0.8rem;' }, 'SERPAPI_API_KEY=your_key node scripts/sync-news.js')
              )
            : h('div', { class: 'news-list' }, news.map((article) => h('article', { class: 'news-card' },
                article.image_url && h('img', { class: 'news-image', src: article.image_url, alt: '', loading: 'lazy' }),
                h('div', { class: 'news-content' },
                  h('div', { class: 'news-meta' },
                    h('span', { class: 'news-category' }, article.category),
                    h('time', { class: 'news-date', datetime: article.published_at }, new Date(article.published_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' }))
                  ),
                  h('h3', null, article.title),
                  article.snippet && h('p', { class: 'news-snippet' }, article.snippet),
                  h('a', { class: 'news-link', href: article.article_url, target: '_blank', rel: 'noopener noreferrer' }, 'Read more', icon('external'))
                )
              )))
        )
      );
    } catch (e) {
      console.error('Dashboard error:', e);
      put(page, h('div', { class: 'error' }, 'Failed to load dashboard. Please try again.'));
    }
  }

  // ---------- News view ----------
  async function NewsView(params) {
    const page = h('div', { class: 'page news-page' }, loading('Loading news'));
    view.append(page);

    try {
      const category = params.get('category') || '';
      const country = params.get('country') || '';
      const q = new URLSearchParams({ limit: '20' });
      if (category) q.set('category', category);
      if (country) q.set('country', country);

      const { data: news } = await api(`/api/news?${q}`).catch(() => ({ data: [] }));

      const categories = [
        { value: '', label: 'All Categories' },
        { value: 'pharmacy', label: 'Pharmacy & Medicines' },
        { value: 'regulatory', label: 'Regulatory Updates' },
        { value: 'health', label: 'Nigeria Health' },
        { value: 'research', label: 'Medical Research' },
        { value: 'outbreaks', label: 'Disease & Outbreaks' },
        { value: 'global', label: 'Global Health' },
      ];

      put(page,
        h('header', { class: 'page-header' },
          h('h1', null, 'Health & Pharmacy News'),
          h('p', { class: 'lead' }, 'Latest updates from NAFDAC, Ministry of Health, WHO, and global healthcare sources')
        ),
        h('form', { class: 'news-filters', onsubmit: (e) => { e.preventDefault(); location.hash = `#/news?${new URLSearchParams({ category: catSelect.value, country: countrySelect.value })}`; } },
          h('select', { id: 'newsCategory', name: 'category' },
            categories.map((c) => h('option', { value: c.value, selected: category === c.value }, c.label))
          ),
          h('select', { id: 'newsCountry', name: 'country' },
            h('option', { value: '', selected: !country }, 'All Countries'),
            h('option', { value: 'NG', selected: country === 'NG' }, 'Nigeria'),
            h('option', { value: 'US', selected: country === 'US' }, 'United States'),
            h('option', { value: 'GB', selected: country === 'GB' }, 'United Kingdom'),
            h('option', { value: 'EU', selected: country === 'EU' }, 'European Union'),
            h('option', { value: 'global', selected: country === 'global' }, 'Global')
          ),
          h('button', { class: 'btn primary', type: 'submit' }, icon('search'), 'Filter')
        ),
        news.length === 0
          ? h('div', { class: 'empty' }, 
              h('p', null, 'No news articles found.'),
              h('p', null, 'News is updated daily via SerpAPI (Google News). To populate news, run the sync script:'),
              h('pre', { style: 'background:var(--bg-tertiary); padding:12px; border-radius:8px; overflow-x:auto; margin-top:8px;' }, 'SERPAPI_API_KEY=your_key node scripts/sync-news.js'),
              h('p', { class: 'hint', style: 'margin-top:12px;' }, 'Or configure SERPAPI_API_KEY in your environment and run the GitHub Actions workflow.')
            )
          : h('div', { class: 'news-list' }, news.map((article) => h('article', { class: 'news-card' },
              article.image_url && h('img', { class: 'news-image', src: article.image_url, alt: '', loading: 'lazy' }),
              h('div', { class: 'news-content' },
                h('div', { class: 'news-meta' },
                  h('span', { class: 'news-category' }, article.category),
                  h('span', { class: 'news-publisher' }, article.publisher_name),
                  h('time', { class: 'news-date', datetime: article.published_at }, new Date(article.published_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' }))
                ),
                h('h3', null, article.title),
                article.snippet && h('p', { class: 'news-snippet' }, article.snippet),
                article.article_url
                  ? h('a', { class: 'news-link', href: article.article_url, target: '_blank', rel: 'noopener noreferrer' }, 'Read more', icon('external'))
                  : h('span', { class: 'news-link disabled' }, 'No link available', icon('external'))
              )
            )))
      );
    } catch (e) {
      console.error('News error:', e);
      put(page, h('div', { class: 'error' }, 'Failed to load news. Please try again.'));
    }
  }

  // ---------- Check view ----------
  const NRN_LIKE = /^[A-Za-z]{0,2}\d{1,3}[\s-]?\d{3,7}$/;

  function medicineCard(d) {
    const detail = [d.strength, d.dosage_form].filter(Boolean).join(' · ');
    const title = d.display_name || d.product_name;
    const img = d.image ? d.image.url : null;
    const imgHtml = img
      ? `<img class="result-img" src="${img}" alt="Pack of ${title}" loading="lazy" width="64" height="64">`
      : (window.KemistArt && window.KemistArt.form ? window.KemistArt.form(d.dosage_form) : '');
    return h('button', { class: 'result', type: 'button', onclick: () => { location.hash = `#/drug/${d.id}`; } },
      h('div', { class: 'result-img-wrap' }, imgHtml ? h('div', { html: imgHtml }) : null),
      h('div', { class: 'result-body' },
        h('div', { class: 'result-top' },
          h('h3', null, title),
          pill(d.verdict.level)),
        detail && h('div', { class: 'meta' }, detail),
        h('div', { class: 'result-top' },
          h('span', { class: 'meta' }, d.applicant || d.manufacturer || 'Company not listed'),
          h('span', { class: 'nrn-tag' }, d.nrn))));
  }

  function CheckView(initialQuery) {
    const input = h('input', {
      id: 'q', type: 'search', name: 'q', placeholder: 'NAFDAC no. or medicine name', value: initialQuery,
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search',
      'aria-describedby': 'qhint', maxlength: '100',
    });
    const out = h('div', { 'aria-live': 'polite' });
    const extras = h('div', { class: 'stack' });
    let timer = null, seq = 0;

    const form = h('form', { class: 'search', role: 'search', onsubmit: (e) => { e.preventDefault(); run(true); } },
      h('label', { class: 'sr-only', for: 'q' }, 'NAFDAC number, medicine name or ingredient'),
      input,
      h('button', { class: 'btn primary', type: 'submit', 'aria-label': 'Search' }, icon('search'), h('span', null, 'Check')));

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 3 || NRN_LIKE.test(q)) return;          // number checks wait for the button
      timer = setTimeout(() => run(false), 350);
    });

    const demoChips = ['A4-7559', 'tramadol', 'dextrose'];
    const normalChips = ['paracetamol', 'amoxicillin', 'artemether'];
    function chipRow(title, values, onPick) {
      if (!values.length) return null;
      return h('div', { class: 'stack' }, h('div', { class: 'hint' }, title),
        h('div', { class: 'chips' }, values.map((v) => h('button', { class: 'chip', type: 'button', onclick: () => onPick(v) }, v))));
    }
    const pick = (v) => { input.value = v; run(true); };

    function showEmpty() {
      out.replaceChildren();
      const recent = store.get('kemist.recent', []);
      const sample = state.meta && state.meta.mode === 'demo' ? demoChips : normalChips;
      put(extras,
        h('figure', { class: 'pack', style: 'margin:0' },
          h('div', { class: 'pack-box', 'aria-hidden': 'true' },
            h('div', { class: 'bar w60' }), h('div', { class: 'bar w80' }),
            h('div', { class: 'pack-nrn' }, 'NAFDAC Reg. No:', h('mark', null, 'A4-7559')),
            h('div', { class: 'bar w40' })),
          h('figcaption', null, 'Find the NAFDAC registration number on the carton or label, then type it above.')),
        chipRow('Recent searches', recent, pick),
        chipRow(state.meta && state.meta.mode === 'demo' ? 'Try one of the demo records' : 'Try a search', sample, pick));
    }

    async function run(remember) {
      const q = input.value.trim();
      const mine = ++seq;
      history.replaceState(null, '', q ? `#/?q=${encodeURIComponent(q)}` : '#/');
      if (q.length < 2) { showEmpty(); return; }
      extras.replaceChildren();
      out.replaceChildren(loading('Checking'));
      try {
        if (NRN_LIKE.test(q)) {
          const r = await api(`/api/drugs/verify?nrn=${encodeURIComponent(q)}`);
          if (mine !== seq) return;
          renderVerify(r);
        } else {
          const r = await api(`/api/drugs?q=${encodeURIComponent(q)}`);
          if (mine !== seq) return;
          renderResults(q, r.data);
        }
        if (remember) store.set('kemist.recent', [q, ...store.get('kemist.recent', []).filter((x) => x !== q)].slice(0, 5));
      } catch (e) {
        if (mine === seq) out.replaceChildren(h('div', { class: 'msg err', role: 'alert' }, e.message));
      }
    }

    function renderResults(q, rows) {
      if (!rows.length) {
        out.replaceChildren(h('div', { class: 'stack' },
          h('div', { class: 'empty' }, `No medicine matched "${q}". Try the generic name (for example "paracetamol"), or the number printed on the pack.`),
          h('a', { class: 'btn', href: `#/report?${new URLSearchParams({ product: q })}` }, 'Report a product that looks wrong')));
        return;
      }
      out.replaceChildren(h('div', { class: 'stack' },
        h('div', { class: 'count' }, `${rows.length} ${rows.length === 1 ? 'result' : 'results'}`),
        h('div', { class: 'results' }, rows.map(medicineCard))));
    }

    function renderVerify(r) {
      if (!r.found) {
        out.replaceChildren(h('div', { class: 'stack' },
          h('div', { class: 'seal-card bad', role: 'alert' },
            h('div', { class: 'seal' }, h('span', { html: ICON.cross, style: 'display:inline-flex' })),
            h('div', null,
              h('h2', null, 'No record for ', h('span', { class: 'nowrap' }, r.nrn)),
              h('p', null, r.not_found_hint))),
          h('div', { class: 'actions' },
            h('a', { class: 'btn danger', href: `#/report?${new URLSearchParams({ nrn: r.nrn })}` }, 'Report this product'),
            h('button', { class: 'btn', type: 'button', onclick: () => { input.focus(); input.select(); } }, 'Try another number')),
          h('p', { class: 'hint' }, r.note)));
        return;
      }
      out.replaceChildren(h('div', { class: 'stack' },
        r.matches.length > 1 && h('div', { class: 'msg info' },
          `${r.matches.length} records share this number. Compare the name, strength and manufacturer with your pack.`),
        h('div', { class: 'results' }, r.matches.map(medicineCard)),
        h('p', { class: 'hint' }, r.note)));
    }

    view.append(h('div', { class: 'page' },
      h('div', { class: 'stack' },
        h('h1', null, 'Check a medicine'),
        h('p', { class: 'lead', id: 'qhint' }, 'Type the NAFDAC number from the pack, or the medicine name, to see its registration record.')),
      form, out, extras));

    if (initialQuery) run(false); else showEmpty();
  }

  // ---------- Medicine detail ----------
  async function DrugView(id) {
    const page = h('div', { class: 'page' }, h('a', { class: 'back', href: '#/' }, icon('back'), 'Back to search'), loading('Loading medicine'));
    view.append(page);
    try {
      const [{ data: d, note }, sim] = await Promise.all([api(`/api/drugs/${id}`), api(`/api/drugs/${id}/similar`).catch(() => ({ data: [] }))]);
      const title = d.display_name || d.product_name;
      document.title = `${title} · Kemist`;
      const v = d.verdict;
      
      // Build image element
      let imgEl = null;
      if (d.image && d.image.url) {
        imgEl = h('figure', { class: 'drug-image' },
          h('a', { href: d.image.url, target: '_blank', rel: 'noopener noreferrer', class: 'drug-image-link', 'aria-label': `Enlarge photo of ${title}` },
            h('img', { src: d.image.url, alt: `Pack of ${title}`, loading: 'lazy', width: '320', height: '320' })),
          h('figcaption', null,
            h('span', { class: 'img-caption' }, 'Photo of the pack'),
            d.image.credit && h('span', { class: 'img-credit' }, `Credit: ${d.image.credit}`)));
      } else {
        const illustration = window.KemistArt && window.KemistArt.form ? window.KemistArt.form(d.dosage_form) : '';
        imgEl = h('figure', { class: 'drug-image illustration' },
          h('div', { class: 'illustration-wrap', html: illustration }),
          h('figcaption', null,
            h('span', { class: 'img-caption' }, 'Illustration, not the actual pack'),
            h('a', { class: 'btn small', href: `#/report-medicine?${new URLSearchParams({ product: d.product_name, nrn: d.nrn })}` }, 'Have a photo of this pack? Send it to us')));
      }
      
      const rows = [
        ['NAFDAC number', d.nrn], ['Active ingredients', d.active_ingredients], ['Ingredient synonyms', d.ingredient_synonym], ['Composition', d.composition], ['Strength', d.strength],
        ['Dosage form', d.dosage_form], ['Route', d.route], ['Sold as', d.marketing_category],
        ['Pack size', d.pack_size], ['Applicant', d.applicant],
        ['Manufacturer', [d.manufacturer, d.manufacturer_country].filter(Boolean).join(', ')],
        ['Approved', fmtDate(d.approval_date)], ['Registration expires', fmtDate(d.expiry_date)],
        ['Status in source', d.status], ['Data quality note', d.data_quality_note], ['ATC code', d.atc_code], ['Product category', d.product_category],
        ['Source', d.source], ['NAFDAC product page', d.detail_url], ['Last updated in Kemist', fmtDate(d.fetched_at)],
      ].filter(([, val]) => val);
      if (d.display_name && d.display_name !== d.product_name) {
        rows.splice(1, 0, ['Name in NAFDAC record', d.product_name]);
      }

      put(page,
        h('a', { class: 'back', href: '#/' }, icon('back'), 'Back to search'),
        imgEl,
        h('div', { class: 'product-head' }, h('h1', null, title), h('span', { class: 'nrn-big' }, d.nrn)),
        h('div', { class: `seal-card ${v.level}` },
          h('div', { class: 'seal' }, h('span', { html: ICON[LEVEL_ICON[v.level]], style: 'display:inline-flex' })),
          h('div', null, h('h2', null, v.label), v.reasons.map((r) => h('p', null, r)))),
        h('div', { class: 'callout' },
          h('strong', null, 'This checks the record, not your pack'),
          h('p', null, note)),
        h('dl', { class: 'kv' }, rows.map(([k, val]) => {
          let dd = val;
          if (k === 'NAFDAC product page' && val) {
            dd = h('a', { href: val, target: '_blank', rel: 'noopener noreferrer' }, val, icon('external'));
          }
          return h('div', null, h('dt', null, k), h('dd', null, dd));
        })),
        d.smpc_url && h('a', { class: 'btn', href: d.smpc_url, target: '_blank', rel: 'noopener noreferrer' }, 'Open product leaflet (SmPC)'),
        h('details', { class: 'callout' },
          h('summary', null, 'How to check the pack itself'),
          h('ul', null,
            h('li', null, 'The carton or blister is sealed, and the printing is sharp and free of spelling mistakes.'),
            h('li', null, 'The NAFDAC number, batch number, manufacture date and expiry date are printed on the pack.'),
            h('li', null, 'The name, strength and manufacturer on the pack match this page.'),
            h('li', null, 'You bought it from a licensed pharmacy and kept the receipt.'),
            h('li', null, 'If anything looks wrong, do not use it. Report it and tell a pharmacist.'))),
        sim.data.length > 0 && h('div', { class: 'stack' },
          h('div', { class: 'section-title' }, h('h2', null, 'Other registered brands'), h('span', { class: 'count' }, `${sim.data.length} with the same ingredient`)),
          h('p', { class: 'hint' }, 'Compare strength and form before switching brands. Ask a pharmacist if you are unsure.'),
          h('div', { class: 'results' }, sim.data.map(medicineCard))),
        h('div', { class: 'actions' },
          h('a', { class: 'btn primary', href: '#/nearby' }, icon('locate'), 'Find a pharmacy near me'),
          h('a', { class: 'btn', href: `#/report?${new URLSearchParams({ product: d.product_name, nrn: d.nrn })}` }, 'Report a problem with this product')));
      document.dispatchEvent(new CustomEvent('kemist:drug-rendered', { detail: { drug: d, page } }));
      view.focus({ preventScroll: true });
    } catch (e) {
      page.replaceChildren(h('a', { class: 'back', href: '#/' }, icon('back'), 'Back to search'), h('div', { class: 'msg err', role: 'alert' }, e.message));
    }
  }

  // ---------- Report ----------
  function ReportView(params) {
    const status = h('div', { 'aria-live': 'polite' });
    const field = (label, id, control, hint) => h('div', { class: 'field' }, h('label', { for: id }, label), control, hint && h('span', { class: 'hint' }, hint));
    const types = [['suspected_fake', 'I think it is fake'], ['packaging_mismatch', 'Packaging does not match'], ['adverse_reaction', 'Bad reaction after using it'], ['incorrect_record', 'This record looks wrong'], ['other', 'Something else']];

    const f = {
      type: h('select', { id: 'rtype', name: 'report_type' }, types.map(([v, l]) => h('option', { value: v }, l))),
      product: h('input', { id: 'rproduct', name: 'product_name', required: true, maxlength: '150', value: params.get('product') || '', autocomplete: 'off' }),
      nrn: h('input', { id: 'rnrn', name: 'nrn', maxlength: '40', value: params.get('nrn') || '', autocomplete: 'off' }),
      where: h('input', { id: 'rwhere', name: 'where_bought', maxlength: '200', placeholder: 'Shop name and area', autocomplete: 'off' }),
      details: h('textarea', { id: 'rdetails', name: 'details', required: true, minlength: '10', maxlength: '2000', placeholder: 'What looked wrong? For example: blurry print, different colour tablets, no batch number.' }),
      contact: h('input', { id: 'rcontact', name: 'contact', maxlength: '120', placeholder: 'Phone or email (optional)', autocomplete: 'off' }),
      trap: h('input', { name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }),
    };
    const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Send report');

    const form = h('form', {
      class: 'form',
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        status.replaceChildren(loading('Sending'));
        try {
          await api('/api/reports', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ report_type: f.type.value, product_name: f.product.value, nrn: f.nrn.value, where_bought: f.where.value, details: f.details.value, contact: f.contact.value, website: f.trap.value }),
          });
          view.replaceChildren(h('div', { class: 'page' },
            h('div', { class: 'msg ok', role: 'status' }, 'Report received. Thank you for helping keep medicines safe.'),
            h('p', { class: 'hint' }, 'If someone is unwell after taking a medicine, get medical help now. Do not wait for a reply.'),
            h('a', { class: 'btn', href: '#/' }, 'Back to Check')));
        } catch (err) {
          status.replaceChildren(h('div', { class: 'msg err', role: 'alert' }, err.message));
          submit.disabled = false;
        }
      },
    },
      field('What is the problem?', 'rtype', f.type),
      field('Medicine name', 'rproduct', f.product),
      field('NAFDAC number on the pack', 'rnrn', f.nrn, 'Optional, but it helps.'),
      field('Where did you buy it?', 'rwhere', f.where),
      field('What did you notice?', 'rdetails', f.details, 'Please do not include your own health details.'),
      field('How can we reach you?', 'rcontact', f.contact),
      h('div', { class: 'hp' }, h('label', null, 'Leave this empty', f.trap)),
      submit, status);

    view.append(h('div', { class: 'page' },
      h('div', { class: 'stack' }, h('h1', null, 'Report a problem'),
        h('p', { class: 'lead' }, 'Tell us about a medicine that looks fake, is packaged wrongly, or has a wrong record. Reports are reviewed by people, not shown publicly.')),
      form));
  }

  // ---------- About ----------
  function AboutView() {
    const m = state.meta;
    const install = h('button', { class: 'btn primary', type: 'button', hidden: !state.installPrompt, onclick: async () => {
      if (!state.installPrompt) return;
      state.installPrompt.prompt();
      await state.installPrompt.userChoice.catch(() => {});
      state.installPrompt = null; install.hidden = true;
    } }, 'Install Kemist on this phone');

    view.append(h('div', { class: 'page about' },
      h('div', { class: 'stack' },
        h('a', { class: 'back', href: '/' }, icon('back'), 'Back to home')),
      h('h1', null, 'About Kemist'),
      h('p', { class: 'lead' }, 'Kemist helps you look up a medicine\'s NAFDAC registration and find pharmacies, clinics and hospitals near you.'),
      h('div', { class: 'callout' },
        h('strong', null, 'What a check can and cannot tell you'),
        h('p', null, 'A match means NAFDAC has a registration record with that number. It does not prove the pack in your hand is genuine, because fake packs can copy real numbers. Always check the pack, buy from licensed pharmacies, and ask a pharmacist when unsure. Kemist is not medical advice.')),
      h('div', { class: 'stack' }, h('h2', null, 'Where the data comes from'),
        h('p', null,
          h('a', { href: 'https://www.nafdac.gov.ng/', target: '_blank', rel: 'noopener noreferrer' }, 'NAFDAC (National Agency for Food and Drug Administration and Control)'),
          ' Greenbook registration data, copied into Kemist\'s own database.',
          m && m.drug_count ? ` ${m.drug_count.toLocaleString('en-NG')} records.` : '',
          m && m.last_synced ? ` Last updated ${fmtDate(m.last_synced)}.` : '')),
        h('p', null,
          'Places and facilities: ',
          h('a', { href: 'https://www.openstreetmap.org/', target: '_blank', rel: 'noopener noreferrer' }, 'OpenStreetMap'),
          ' contributors. Data is accessed via the ',
          h('a', { href: 'https://overpass-turbo.eu/', target: '_blank', rel: 'noopener noreferrer' }, 'Overpass API'),
          '. Listings can be incomplete or out of date, so call before you travel.')),
      h('div', { class: 'stack' }, h('h2', null, 'Third-party platforms & libraries'),
        h('ul', { class: 'refs' },
          h('li', null,
            h('a', { href: 'https://leafletjs.com/', target: '_blank', rel: 'noopener noreferrer' }, 'Leaflet'),
            ' — interactive maps (BSD-2-Clause)'),
          h('li', null,
            h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener noreferrer' }, 'OpenStreetMap'),
            ' — map tiles & geodata (ODbL)'),
          h('li', null,
            h('a', { href: 'https://developers.google.com/maps/documentation/urls/guide', target: '_blank', rel: 'noopener noreferrer' }, 'Google Maps URLs'),
            ' — directions links (Google Terms of Service)'),
          h('li', null,
            'Supabase (optional backend) — PostgreSQL & realtime (Apache-2.0 / MIT)')),
      h('div', { class: 'stack' }, h('h2', null, 'Your location'),
        h('p', null, 'Kemist uses your location only to find places near you. It is not saved to your profile, and you can choose a city instead.')),
      install,
      h('a', { class: 'btn', href: '#/report' }, 'Report a problem')));
  }

  // ---------- Safety Alerts ----------
  async function AlertsView(params) {
    const page = h('div', { class: 'page' }, loading('Loading alerts'));
    view.append(page);
    try {
      const search = params.get('q') || '';
      const status = params.get('status') || 'active';
      const type = params.get('type');
      const severity = params.get('severity');
      const q = new URLSearchParams({ search, status, limit: '50' });
      if (type) q.set('type', type);
      if (severity) q.set('severity', severity);
      const { data } = await api(`/api/alerts?${q}`);

      const TYPE_LABEL = {
        counterfeit: 'Counterfeit', recall: 'Recall', substandard: 'Substandard',
        adverse_event: 'Adverse Event', quality_issue: 'Quality Issue', other: 'Other'
      };
      const SEVERITY_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
      const SEVERITY_CLASS = { critical: 'bad', high: 'warn', medium: 'info', low: 'ok' };

      put(page,
        h('a', { class: 'back', href: '#/check' }, icon('back'), 'Back to Check'),
        h('h1', null, 'Medicine Safety Alerts'),
        h('p', { class: 'lead' }, 'Official safety notices, recalls, and counterfeit medicine alerts from NAFDAC and other health authorities.'),
        h('form', { class: 'search', onsubmit: (e) => { e.preventDefault(); const q = document.getElementById('alertSearch').value; location.hash = `#/alerts?${new URLSearchParams({ q, status: statusSelect.value, type: typeSelect.value, severity: severitySelect.value })}`; } },
          h('input', { id: 'alertSearch', type: 'search', name: 'q', placeholder: 'Search alerts (product, ingredient, NAFDAC no.)', value: search, autocomplete: 'off' }),
          h('select', { id: 'alertStatus', name: 'status' },
            h('option', { value: 'active', selected: status === 'active' }, 'Active'),
            h('option', { value: 'resolved', selected: status === 'resolved' }, 'Resolved'),
            h('option', { value: 'superseded', selected: status === 'superseded' }, 'Superseded')),
          h('select', { id: 'alertType', name: 'type' },
            h('option', { value: '', selected: !type }, 'All types'),
            Object.entries(TYPE_LABEL).map(([v, l]) => h('option', { value: v, selected: type === v }, l))),
          h('select', { id: 'alertSeverity', name: 'severity' },
            h('option', { value: '', selected: !severity }, 'All severities'),
            Object.entries(SEVERITY_LABEL).map(([v, l]) => h('option', { value: v, selected: severity === v }, l))),
          h('button', { class: 'btn primary', type: 'submit' }, icon('search'), 'Filter')),
        data.length === 0
          ? h('div', { class: 'empty' }, 'No alerts match your filters.')
          : h('div', { class: 'stack' }, data.map((a) => h('article', { class: `alert-card ${SEVERITY_CLASS[a.severity]}`, style: 'border-left: 4px solid var(--' + (a.severity === 'critical' ? 'red' : a.severity === 'high' ? 'amber' : a.severity === 'medium' ? 'slate' : 'green') + ');' },
            h('div', { class: 'alert-head' },
              h('h2', null, a.title),
              h('div', { class: 'alert-meta' },
                pill(a.severity, SEVERITY_LABEL[a.severity]),
                pill('info', TYPE_LABEL[a.alert_type] || a.alert_type),
                h('span', { class: 'meta' }, new Date(a.published_at).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }))
              )),
            a.product_name && h('div', { class: 'meta' }, h('strong', null, 'Product: '), a.product_name),
            a.nrn && h('div', { class: 'meta' }, h('strong', null, 'NAFDAC No: '), a.nrn),
            a.batch_numbers && a.batch_numbers.length && h('div', { class: 'meta' }, h('strong', null, 'Batch(es): '), a.batch_numbers.join(', ')),
            a.active_ingredients && h('div', { class: 'meta' }, h('strong', null, 'Ingredients: '), a.active_ingredients),
            a.manufacturer && h('div', { class: 'meta' }, h('strong', null, 'Manufacturer: '), a.manufacturer),
            h('div', { class: 'alert-desc' }, a.description),
            a.source_url && h('a', { class: 'btn small', href: a.source_url, target: '_blank', rel: 'noopener noreferrer' }, 'View official notice')
          )))
      );
    } catch (e) {
      page.replaceChildren(h('a', { class: 'back', href: '#/check' }, icon('back'), 'Back to Check'), h('div', { class: 'msg err', role: 'alert' }, e.message));
    }
  }

  // ---------- Report a Medicine ----------
  function ReportMedicineView(params) {
    const status = h('div', { 'aria-live': 'polite' });
    const field = (label, id, control, hint) => h('div', { class: 'field' }, h('label', { for: id }, label), control, hint && h('span', { class: 'hint' }, hint));
    const types = [
      ['suspected_fake', 'Suspected fake medicine'],
      ['packaging_mismatch', 'Packaging does not match'],
      ['adverse_reaction', 'Adverse reaction after use'],
      ['quality_concern', 'Quality concern (color, smell, texture)'],
      ['incorrect_record', 'Record information looks wrong'],
      ['other', 'Something else']
    ];

    const f = {
      type: h('select', { id: 'rtype', name: 'report_type', required: true }, types.map(([v, l]) => h('option', { value: v }, l))),
      product: h('input', { id: 'rproduct', name: 'product_name', required: true, maxlength: '150', placeholder: 'e.g. Paracetamol 500mg Tablet', autocomplete: 'off' }),
      nrn: h('input', { id: 'rnrn', name: 'nrn', maxlength: '40', placeholder: 'NAFDAC registration number (if known)', autocomplete: 'off' }),
      batch: h('input', { id: 'rbatch', name: 'batch_number', maxlength: '50', placeholder: 'Batch number (if on pack)', autocomplete: 'off' }),
      expiry: h('input', { id: 'rexpiry', name: 'expiry_date', type: 'date' }),
      manufacturer: h('input', { id: 'rmanuf', name: 'manufacturer', maxlength: '150', placeholder: 'Manufacturer name (if known)', autocomplete: 'off' }),
      where: h('input', { id: 'rwhere', name: 'where_bought', maxlength: '200', placeholder: 'Pharmacy/shop name and area', autocomplete: 'off' }),
      purchase: h('input', { id: 'rpurchase', name: 'purchase_date', type: 'date' }),
      details: h('textarea', { id: 'rdetails', name: 'details', required: true, minlength: '10', maxlength: '2000', placeholder: 'What did you notice? E.g. blurry print, different color tablets, no batch number, unusual smell...' }),
      contact: h('input', { id: 'rcontact', name: 'contact', maxlength: '120', placeholder: 'Phone or email for follow-up (optional)', autocomplete: 'off' }),
      trap: h('input', { name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }),
    };
    const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Submit Report');

    const form = h('form', {
      class: 'form',
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        status.replaceChildren(loading('Submitting'));
        try {
          await api('/api/medicine-reports', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              report_type: f.type.value, product_name: f.product.value, nrn: f.nrn.value,
              batch_number: f.batch.value, expiry_date: f.expiry.value || null,
              manufacturer: f.manufacturer.value, where_bought: f.where.value,
              purchase_date: f.purchase.value || null, details: f.details.value, contact: f.contact.value
            }),
          });
          view.replaceChildren(h('div', { class: 'page' },
            h('a', { class: 'back', href: '#/check' }, icon('back'), 'Back to Check'),
            h('div', { class: 'msg ok', role: 'status' }, 'Report submitted. Thank you for helping keep medicines safe.'),
            h('p', { class: 'hint' }, 'If someone is unwell after taking a medicine, get medical help now. Do not wait for a reply.'),
            h('a', { class: 'btn', href: '#/check' }, 'Back to Check')));
        } catch (err) {
          status.replaceChildren(h('div', { class: 'msg err', role: 'alert' }, err.message));
          submit.disabled = false;
        }
      },
    },
      field('What are you reporting?', 'rtype', f.type),
      field('Medicine name (as on pack)', 'rproduct', f.product),
      field('NAFDAC number on the pack', 'rnrn', f.nrn, 'Optional, but helps us identify the product.'),
      field('Batch number', 'rbatch', f.batch, 'Optional, found on the blister or carton.'),
      field('Expiry date', 'rexpiry', f.expiry, 'Optional.'),
      field('Manufacturer', 'rmanuf', f.manufacturer, 'Optional.'),
      field('Where did you buy it?', 'rwhere', f.where, 'Pharmacy/shop name and area.'),
      field('Purchase date', 'rpurchase', f.purchase, 'Optional.'),
      field('What did you notice?', 'rdetails', f.details, 'Describe the problem. Do not include personal health details.'),
      field('How can we reach you?', 'rcontact', f.contact, 'Optional phone or email if you want a follow-up.'),
      h('div', { class: 'hp' }, h('label', null, 'Leave this empty', f.trap)),
      submit, status);

    view.append(h('div', { class: 'page' },
      h('a', { class: 'back', href: '#/check' }, icon('back'), 'Back to Check'),
      h('h1', null, 'Report a Medicine Problem'),
      h('p', { class: 'lead' }, 'Tell us about a medicine that looks fake, has wrong packaging, caused a bad reaction, or has incorrect information. Reports are reviewed by people, not shown publicly.'),
      form));
  }

  // ---------- Clinical Library ----------
  async function ClinicalLibraryView(params) {
    const page = h('div', { class: 'page' }, loading('Loading clinical library'));
    view.append(page);
    try {
      const search = params.get('q') || '';
      const ingredient = params.get('ingredient');
      
      // Load ingredients for the sidebar
      const [{ data: ingredients }] = await Promise.all([
        api('/api/clinical/ingredients?limit=200'),
      ]);
      
      let labels = [];
      if (ingredient) {
        const res = await api(`/api/clinical/ingredient/${encodeURIComponent(ingredient)}`);
        labels = res.data || [];
      } else if (search) {
        const res = await api(`/api/clinical/ingredients?search=${encodeURIComponent(search)}&limit=50`);
        labels = res.data || [];
      }

      const CATEGORIES = [
        { key: 'indications', label: 'Indications & Uses', icon: '📋', desc: 'What the medicine is used for' },
        { key: 'contraindications', label: 'Contraindications', icon: '⚠️', desc: 'When not to use the medicine' },
        { key: 'warnings', label: 'Warnings & Precautions', icon: '🔔', desc: 'Important safety warnings' },
        { key: 'adverse_reactions', label: 'Adverse Reactions', icon: '📝', desc: 'Known side effects' },
        { key: 'interactions', label: 'Drug Interactions', icon: '🔗', desc: 'Interactions with other medicines' },
      ];

      const SECTION_LABELS = {
        indications: 'Indications & Uses',
        contraindications: 'Contraindications',
        warnings: 'Warnings & Precautions',
        adverse_reactions: 'Adverse Reactions',
        interactions: 'Drug Interactions',
      };

      function formatDate(d) {
        return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown';
      }

      function renderLabelCard(label) {
        const hasContent = Object.values(label.sections || {}).some(v => v && v.trim());
        const media = label.media || [];
        const mediaHtml = media.length ? h('div', { class: 'clinical-media' },
          h('h4', null, 'DailyMed Label Images'),
          h('p', { class: 'hint' }, 'Images are from the DailyMed label (US FDA) and may not represent the exact product packaging available in Nigeria.'),
          h('div', { class: 'media-gallery' },
            media.map(m => h('figure', { class: 'media-item' },
              h('a', { href: m.url, target: '_blank', rel: 'noopener noreferrer', class: 'media-link', 'aria-label': `View ${m.name || 'DailyMed image'} full size` },
                h('img', { src: m.url, alt: m.name || 'DailyMed label image', loading: 'lazy', width: '200', height: '200' })),
              h('figcaption', null, m.name ? h('span', null, m.name) : null, m.source && h('a', { href: m.source, target: '_blank', rel: 'noopener noreferrer', class: 'media-source' }, 'View on DailyMed'))
            ))
          )
        ) : null;
        
        return h('article', { class: 'clinical-card' },
          h('div', { class: 'clinical-card-head' },
            h('h3', null, label.title || label.ingredient_label || label.ingredient_key),
            h('div', { class: 'clinical-card-meta' },
              label.jurisdiction && h('span', { class: 'meta' }, label.jurisdiction),
              label.effective_date && h('span', { class: 'meta' }, `Updated ${formatDate(label.effective_date)}`),
              label.source && h('span', { class: 'meta' }, `Source: ${label.source}`)
            )),
          mediaHtml,
          h('div', { class: 'clinical-card-body' },
            CATEGORIES.map((cat) => {
              const content = label.sections?.[cat.key];
              if (!content || !content.trim()) return null;
              return h('details', { class: 'clinical-section', open: cat.key === 'indications' },
                h('summary', null, h('span', { class: 'section-icon' }, cat.icon), cat.label),
                h('div', { class: 'section-content' }, content)
              );
            }).filter(Boolean),
            hasContent ? null : h('div', { class: 'hint' }, 'No detailed sections available for this label.')
          ),
          label.source_url && h('a', { class: 'btn small', href: label.source_url, target: '_blank', rel: 'noopener noreferrer' }, 'View full label on DailyMed')
        );
      }

      put(page,
        h('a', { class: 'back', href: '#/check' }, icon('back'), 'Back to Check'),
        h('div', { class: 'clinical-layout' },
          h('aside', { class: 'clinical-sidebar' },
            h('h2', null, 'Clinical Library'),
            h('p', { class: 'hint' }, 'US FDA drug label information for active ingredients in the Kemist database.'),
            h('form', { class: 'search', onsubmit: (e) => { e.preventDefault(); const q = document.getElementById('clinicalSearch').value; location.hash = `#/clinical?${new URLSearchParams({ q })}`; } },
              h('input', { id: 'clinicalSearch', type: 'search', name: 'q', placeholder: 'Search ingredients, indications...', value: search, autocomplete: 'off' }),
              h('button', { class: 'btn primary', type: 'submit' }, icon('search'))),
            h('h3', null, 'Browse by Ingredient'),
            h('div', { class: 'ingredient-list' }, ingredients.map((ing) => h('button', {
              class: 'ingredient-btn' + (ingredient === ing.ingredient_key ? ' active' : ''),
              type: 'button',
              onclick: () => { location.hash = `#/clinical?${new URLSearchParams({ ingredient: ing.ingredient_key })}`; }
            }, h('span', { class: 'ingredient-name' }, ing.label || ing.ingredient_key), h('span', { class: 'ingredient-count' }, `${ing.labels} label${ing.labels !== 1 ? 's' : ''}`)))),
            h('div', { class: 'callout', style: 'margin-top:16px' },
              h('strong', null, 'Important: '),
              'This is US FDA labeling data (openFDA/DailyMed). It may differ from NAFDAC-approved information for Nigerian products. Always consult a pharmacist or doctor.'
            )
          ),
          h('main', { class: 'clinical-main' },
            h('h1', null, ingredient ? `${ingredient}` : 'Clinical Drug Information'),
            ingredient && h('p', { class: 'lead' }, `Showing ${labels.length} label${labels.length !== 1 ? 's' : ''} for "${ingredient}".`),
            labels.length === 0
              ? h('div', { class: 'empty' }, 'No clinical labels found. Try a different search or ingredient.')
              : h('div', { class: 'stack' }, labels.map(renderLabelCard))
          )
        )
      );
    } catch (e) {
      page.replaceChildren(h('a', { class: 'back', href: '#/check' }, icon('back'), 'Back to Check'), h('div', { class: 'msg err', role: 'alert' }, e.message));
    }
  }

  // ---------- AI Assistant ----------
  async function AIAssistantView(params) {
    const page = h('div', { class: 'page ai-page' });
    view.append(page);

    const STORAGE_KEY = 'kemist-ai-chats';
    let chats = [];
    let currentChatId = null;
    let isLoading = false;

    // Load all chats from localStorage
    function loadChats() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        chats = stored ? JSON.parse(stored) : [];
      } catch {
        chats = [];
      }
    }

    function saveChats() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    }

    function createNewChat() {
      const id = crypto.randomUUID();
      const chat = {
        id,
        title: 'New Chat',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      chats.unshift(chat);
      saveChats();
      return chat;
    }

    function getCurrentChat() {
      return chats.find(c => c.id === currentChatId);
    }

    function updateChatTitle(chat) {
      if (chat.messages.length > 0) {
        const firstUserMsg = chat.messages.find(m => m.role === 'user');
        if (firstUserMsg) {
          chat.title = firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '…' : '');
        }
      }
      chat.updatedAt = Date.now();
      saveChats();
      renderSidebar();
    }

    function addMessage(chat, role, content, sources) {
      chat.messages.push({ role, content, sources, timestamp: Date.now() });
      updateChatTitle(chat);
    }

    function deleteChat(chatId) {
      chats = chats.filter(c => c.id !== chatId);
      saveChats();
      if (currentChatId === chatId) {
        currentChatId = null;
      }
      renderSidebar();
      renderChat();
    }

    function clearAllChats() {
      if (confirm('Clear all chat history? This cannot be undone.')) {
        chats = [];
        currentChatId = null;
        localStorage.removeItem(STORAGE_KEY);
        renderSidebar();
        renderChat();
      }
    }

    // Initialize
    loadChats();
    if (chats.length === 0) {
      const chat = createNewChat();
      currentChatId = chat.id;
    } else if (!currentChatId || !getCurrentChat()) {
      currentChatId = chats[0].id;
    }

    // --- Render functions ---
    const sidebar = h('div', { class: 'ai-sidebar' });
    const chatArea = h('div', { class: 'ai-chat-area' });

    function renderSidebar() {
      const newChatBtn = h('button', { class: 'ai-new-chat-btn', onclick: () => {
        const chat = createNewChat();
        currentChatId = chat.id;
        renderSidebar();
        renderChat();
      }}, icon('send'), 'New Chat');

      const chatList = h('div', { class: 'ai-chat-list' },
        chats.map(chat => h('div', { 
          class: `ai-chat-item ${chat.id === currentChatId ? 'active' : ''}`,
          onclick: () => { currentChatId = chat.id; renderSidebar(); renderChat(); }
        },
          h('div', { class: 'ai-chat-title' }, chat.title || 'New Chat'),
          h('time', { class: 'ai-chat-time' }, new Date(chat.updatedAt).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
          h('button', { class: 'ai-chat-delete', onclick: (e) => { e.stopPropagation(); deleteChat(chat.id); }}, icon('cross'))
        ))
      );

      const clearBtn = chats.length > 0 ? h('button', { class: 'ai-clear-all-btn', onclick: clearAllChats }, icon('cross'), 'Clear All Chats') : null;

      const storageNotice = h('div', { class: 'ai-storage-notice' },
        h('svg', { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', ariaHidden: 'true' }, 
          h('path', { d: 'M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z' }),
          h('path', { d: 'M12 6v6l4 2' })
        ),
        h('span', null, 'Chats stored locally in your browser. Not saved to our servers.')
      );

      sidebar.replaceChildren(newChatBtn, chatList, clearBtn, storageNotice);
    }

    function renderChat() {
      const chat = getCurrentChat();
      if (!chat) {
        chatArea.replaceChildren(
          h('div', { class: 'ai-empty-state' },
            h('div', { class: 'ai-empty-icon' }, icon('ai')),
            h('h2', null, 'How can I help?'),
            h('p', null, 'Ask me about medicines, ingredients, dosages, side effects, interactions, or NAFDAC safety alerts.'),
            h('div', { class: 'ai-suggested-prompts' },
              ['What is paracetamol used for?', 'Show me NAFDAC alerts for antibiotics', 'Drug interactions with warfarin', 'Dosage for amoxicillin 500mg'].map(p => 
                h('button', { class: 'ai-prompt-btn', onclick: () => sendMessage(p) }, p)
              )
            ),
            h('p', { class: 'ai-disclaimer' }, 'This AI provides information from NAFDAC records, US FDA labels, and safety alerts. It is not medical advice. Consult a healthcare professional for personal decisions.')
          )
        );
        return;
      }

      const messagesContainer = h('div', { class: 'ai-messages', id: 'aiMessages' },
        chat.messages.map((msg, idx) => renderMessage(msg, idx))
      );

      const inputArea = h('div', { class: 'ai-input-area' },
        h('form', { class: 'ai-form', onsubmit: (e) => { e.preventDefault(); sendMessage(input.value.trim()); } },
          h('textarea', { 
            id: 'aiInput', 
            placeholder: 'Ask about medicines, ingredients, dosages, side effects...', 
            rows: 1,
            'aria-label': 'Message',
            disabled: isLoading
          }),
          h('div', { class: 'ai-form-actions' },
            h('button', { class: 'btn primary', type: 'submit', id: 'aiSendBtn', disabled: isLoading }, icon('send')),
            h('button', { class: 'btn', type: 'button', onclick: () => {
              const chat = createNewChat();
              currentChatId = chat.id;
              renderSidebar();
              renderChat();
            }}, icon('send'), 'New')
          )
        ),
        h('p', { class: 'ai-disclaimer' }, 'AI responses are generated from NAFDAC, openFDA, and safety alert data. Not medical advice.')
      );

      chatArea.replaceChildren(messagesContainer, inputArea);

      // Auto-resize textarea
      const input = $('#aiInput');
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 150) + 'px';
      });
      input.focus();

      // Scroll to bottom
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function renderMessage(msg, idx) {
      const isUser = msg.role === 'user';
      const bubble = h('div', { class: `ai-message ${isUser ? 'user' : 'assistant'}` },
        h('div', { class: 'ai-message-avatar' },
          isUser 
            ? h('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' }, h('path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }), h('circle', { cx: '12', cy: '7', r: '4' }))
            : h('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' }, h('path', { d: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z' }), h('path', { d: 'M12 6v6l4 2' }), h('path', { d: 'M9 14h6' }))
        ),
        h('div', { class: 'ai-message-content' },
          h('div', { class: 'ai-message-text', html: isUser ? escapeHtml(msg.content) : formatMessage(msg.content) }),
          msg.sources && msg.sources.length ? h('div', { class: 'ai-sources' },
            h('span', { class: 'ai-sources-label' }, 'Sources: '),
            msg.sources.map((s, i) => h('span', { class: 'ai-source-tag', key: i }, s.source + (s.title ? ': ' + s.title : '')))
          ) : null
        )
      );
      return bubble;
    }

    function escapeHtml(text) {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#039;');
    }

    // Markdown formatting for AI responses
    function formatMessage(text) {
      if (!text) return '';
      return String(text)
        .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
        .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
        .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
        .replace(/^\s*-\s+/gm, '<li>')
        .replace(/^\s*\d+\.\s+/gm, '<li>')
        .replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>')
        .replace(/<\/ul>\s*<ul>/g, '')
        .replace(/\n{2,}/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^(.+)$/gm, '<p>$1</p>')
        .replace(/<p><\/p>/g, '')
        .replace(/<p>(<h[1-3]>)/g, '$1')
        .replace(/(<\/h[1-3]>)<\/p>/g, '$1')
        .replace(/<p>(<pre>)/g, '$1')
        .replace(/(<\/pre>)<\/p>/g, '$1')
        .replace(/<p>(<ul>)/g, '$1')
        .replace(/(<\/ul>)<\/p>/g, '$1')
        .replace(/<p>(<blockquote>)/g, '$1')
        .replace(/(<\/blockquote>)<\/p>/g, '$1')
        .replace(/<p>(<table>)/g, '$1')
        .replace(/(<\/table>)<\/p>/g, '$1')
        .replace(/<p>(<hr>)/g, '$1')
        .replace(/^\s*>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
        .replace(/---/g, '<hr>');
    }

    async function sendMessage(text) {
      if (isLoading || !text) return;

      let chat = getCurrentChat();
      if (!chat) {
        chat = createNewChat();
        currentChatId = chat.id;
      }

      isLoading = true;
      addMessage(chat, 'user', text);
      renderChat();

      const input = $('#aiInput');
      input.value = '';
      input.style.height = 'auto';
      input.disabled = true;
      $('#aiSendBtn').disabled = true;

      // Show typing indicator
      const typingId = 'typing-' + Date.now();
      const typingEl = h('div', { class: 'ai-message assistant typing', id: typingId },
        h('div', { class: 'ai-message-avatar' },
          h('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' }, h('path', { d: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z' }), h('path', { d: 'M12 6v6l4 2' }), h('path', { d: 'M9 14h6' }))
        ),
        h('div', { class: 'ai-message-content' },
          h('div', { class: 'ai-typing' }, h('span'), h('span'), h('span'))
        )
      );
      $('#aiMessages').append(typingEl);
      $('#aiMessages').scrollTop = $('#aiMessages').scrollHeight;

      try {
        // Build history for context (last 12 messages)
        const history = chat.messages.slice(-12).map(m => ({ role: m.role, content: m.content }));
        
        const res = await api('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history })
        });

        document.getElementById(typingId)?.remove();
        addMessage(chat, 'assistant', res.response, res.sources);
        renderChat();
      } catch (err) {
        document.getElementById(typingId)?.remove();
        addMessage(chat, 'assistant', `Sorry, I encountered an error: ${err.message}. Please try again.`);
        renderChat();
      } finally {
        isLoading = false;
        const input = $('#aiInput');
        input.disabled = false;
        $('#aiSendBtn').disabled = false;
        input.focus();
      }
    }

    // Initial render
    page.append(
      h('div', { class: 'ai-layout' },
        h('aside', { class: 'ai-sidebar-wrap' }, sidebar),
        h('main', { class: 'ai-main' },
          h('header', { class: 'ai-header' },
            h('a', { class: 'back', href: '#/dashboard' }, icon('back')),
            h('h1', null, 'Kemist AI Assistant'),
            h('p', { class: 'lead' }, 'Ask about medicines, safety alerts, clinical info, and more.')
          ),
          chatArea
        )
      )
    );

    renderSidebar();
    renderChat();
  }

  // ---------- Nearby / map ----------
  const Nearby = (() => {
    const TYPES = [
      ['all', 'All', null, '#0F2B25'], ['pharmacy', 'Pharmacies', 'pharmacy', '#00844F'], ['hospital', 'Hospitals', 'hospital', '#B3261E'],
      ['clinic', 'Clinics', 'clinic,doctors', '#0A6C8F'], ['laboratory', 'Labs', 'laboratory', '#A66A00'],
    ];
    const LABEL = { pharmacy: 'Pharmacy', hospital: 'Hospital', clinic: 'Clinic', doctors: 'Doctor', laboratory: 'Laboratory' };
    const GLYPH = { pharmacy: '+', hospital: 'H', clinic: 'C', doctors: 'C', laboratory: 'L' };
    const CITIES = [['Lagos', 6.5244, 3.3792], ['Abuja', 9.0765, 7.3986], ['Port Harcourt', 4.8156, 7.0498], ['Ibadan', 7.3775, 3.947], ['Kano', 12.0022, 8.592], ['Enugu', 6.4584, 7.5464], ['Benin City', 6.335, 5.6037], ['Kaduna', 10.5105, 7.4165], ['Owerri', 5.484, 7.0351], ['Aba', 5.1066, 7.3667], ['Onitsha', 6.1498, 6.7857], ['Calabar', 4.9757, 8.3417], ['Uyo', 5.0377, 7.9128], ['Ilorin', 8.4966, 4.5421], ['Jos', 9.8965, 8.8583], ['Warri', 5.5167, 5.75], ['Abeokuta', 7.1475, 3.3619], ['Maiduguri', 11.8333, 13.15]];

    const s = { map: null, layer: null, me: null, filter: 'all', center: null, items: [], markers: new Map(), ready: false, seq: 0, radius: 5000 };
    const msg = $('#mapMsg'), list = $('#facList'), areaBtn = $('#areaBtn');

    const say = (text) => { msg.hidden = !text; msg.textContent = text || ''; };
    const dist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
    const telHref = (p) => `tel:${String(p).split(/[;,]/)[0].replace(/[^\d+]/g, '')}`;
    const dirHref = (f) => `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`;

    function buildChips() {
      $('#typeChips').replaceChildren(...TYPES.map(([key, label, , color]) =>
        h('button', { class: 'chip', type: 'button', 'aria-pressed': String(s.filter === key), onclick: () => { s.filter = key; buildChips(); if (s.center) load(s.center); } },
          key !== 'all' && h('span', { class: 'dot', style: `background:${color}` }), label)));
      const RADII = [[1000, '1 km'], [3000, '3 km'], [5000, '5 km']];
      $('#radiusChips').replaceChildren(...RADII.map(([r, label]) =>
        h('button', { class: 'chip', type: 'button', 'aria-pressed': String(s.radius === r), onclick: () => { s.radius = r; buildChips(); if (s.center) load(s.center); } }, label)));
      $('#cityChips').replaceChildren(h('span', { class: 'hint', style: 'align-self:center' }, 'Or choose a city:'),
        ...CITIES.map(([name, lat, lng]) => h('button', { class: 'chip', type: 'button', onclick: () => go({ lat, lng }, 13) }, name)));
    }

    function waitForLeaflet() {
      return new Promise((resolve, reject) => {
        if (window.L) return resolve();
        let tries = 0;
        const t = setInterval(() => {
          if (window.L) { clearInterval(t); resolve(); }
          else if (++tries > 20) { clearInterval(t); reject(new Error('The map could not load, but the list below still works.')); }
        }, 100);
      });
    }

    let initPromise = null;
    function init() {
      if (!initPromise) initPromise = doInit();      // remember the result (including a failure) so we never wait twice
      return initPromise;
    }

    async function doInit() {
      try { await waitForLeaflet(); }
      catch (e) { nearbyEl.classList.add('no-map'); throw e; }       // no map: the list becomes the main view
      const tileUrl = (state.meta && state.meta.tile_url) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      const tileAttr = (state.meta && state.meta.tile_attribution) || '\u00a9 OpenStreetMap contributors';
      s.map = L.map('map', { zoomControl: false }).setView([9.08, 8.68], 6);       // all of Nigeria
      L.control.zoom({ position: 'bottomright' }).addTo(s.map);
      const tiles = L.tileLayer(tileUrl, { maxZoom: 19, attribution: tileAttr }).addTo(s.map);
      s.layer = L.layerGroup().addTo(s.map);
      s.map.on('moveend', () => {
        if (!s.center || !s.map) return;
        const c = s.map.getCenter();
        areaBtn.hidden = s.map.distance(c, [s.center.lat, s.center.lng]) < 1500;
      });
      
      // Track tile load success/failure
      let ok = 0, bad = 0, warned = false;
      tiles.on('tileload', () => { ok++; });
      tiles.on('tileerror', () => {
        bad++;
        if (!warned && ok === 0 && bad >= 6) {
          warned = true;
          // show this in the map status area and keep it there
          const msgEl = $('#mapMsg');
          if (msgEl) {
            msgEl.textContent = 'The map pictures could not load on this network. The list of places below still works. Try another network, turn off any VPN or ad blocker, or open Kemist in Chrome.';
          }
        }
      });
      
      s.ready = true;
    }

    function pinIcon(type) {
      return L.divIcon({ className: '', html: `<div class="pin ${type}"><span>${GLYPH[type] || '+'}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] });
    }

    function actions(f) {
      return h('div', { class: 'fac-actions' },
        f.phone && h('a', { class: 'btn small', href: telHref(f.phone) }, icon('phone'), 'Call'),
        h('a', { class: 'btn small primary', href: dirHref(f), target: '_blank', rel: 'noopener noreferrer' }, icon('route'), 'Directions'));
    }

    function render() {
      if (s.layer) s.layer.clearLayers();
      s.markers.clear();
      for (const f of s.ready ? s.items : []) {
        const m = L.marker([f.lat, f.lng], { icon: pinIcon(f.type), title: f.name, keyboard: true });
        m.bindPopup(h('div', null, h('h3', null, f.name), h('div', { class: 'hint' }, `${LABEL[f.type]} · ${dist(f.distance_m)}`), actions(f)), { minWidth: 200 });
        m.on('click', () => highlight(f.id, true));
        m.addTo(s.layer);
        s.markers.set(f.id, m);
      }
      if (!s.items.length) {
        list.replaceChildren(h('div', { class: 'empty' }, 'No places found here yet. OpenStreetMap may have few listings for this area. Try a bigger city, or zoom out and search again.'));
        return;
      }
      list.replaceChildren(...s.items.map((f) => h('article', { class: 'fac', 'data-id': f.id },
        h('button', { class: 'fac-top', type: 'button', onclick: () => { if (s.ready) { const m = s.markers.get(f.id); s.map.setView([f.lat, f.lng], Math.max(s.map.getZoom(), 16)); m && m.openPopup(); } highlight(f.id, false); } },
          h('div', { class: `pin ${f.type}` }, h('span', null, GLYPH[f.type])),
          h('div', null, h('h3', null, f.name),
            h('div', { class: 'meta' }, [LABEL[f.type], f.emergency && 'Emergency', f.opening_hours === '24/7' && 'Open 24 hours', f.source && !/OpenStreetMap/i.test(f.source) && 'Google Maps listing, not verified'].filter(Boolean).join(' · ')),
            f.address && h('div', { class: 'meta' }, f.address),
            f.opening_hours && f.opening_hours !== '24/7' && h('div', { class: 'meta' }, `Hours: ${f.opening_hours}`)),
          h('span', { class: 'dist' }, dist(f.distance_m))),
        actions(f))));
    }

    function highlight(id, scroll) {
      list.querySelectorAll('.fac').forEach((el) => el.classList.toggle('active', el.dataset.id === id));
      const el = list.querySelector(`.fac[data-id="${CSS.escape(id)}"]`);
      if (el && scroll) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    async function load(center) {
      const mine = ++s.seq;
      s.center = center;
      areaBtn.hidden = true;
      const t = TYPES.find(([k]) => k === s.filter);
      if (!nearbyEl.classList.contains('no-map')) say('Looking for places nearby…');
      try {
        const q = new URLSearchParams({ lat: center.lat.toFixed(5), lng: center.lng.toFixed(5), radius: String(s.radius) });
        if (t && t[2]) q.set('types', t[2]);
        const r = await api(`/api/facilities/nearby?${q}`);
        if (mine !== s.seq) return;
        s.items = r.data;
        render();
        const mapDown = nearbyEl.classList.contains('no-map');
        const radiusKm = (s.radius / 1000).toFixed(s.radius < 1000 ? 1 : 0);
        say(r.note || (r.data.length ? (mapDown ? 'The map could not load, but the list below still works.' : '') : `No listings found within ${radiusKm} km.`));
      } catch (e) {
        if (mine === s.seq) { say(e.message); }
      }
    }

    async function searchPlace(query) {
      if (!query.trim()) return;
      say(`Searching for "${query}"…`);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=ng`, { signal: AbortSignal.timeout(10000) });
        const results = await res.json();
        if (!results.length) { say('No places found. Try a different name.'); return; }
        if (results.length === 1) {
          go({ lat: Number(results[0].lat), lng: Number(results[0].lon) }, 13);
        } else {
          const dlg = $('#placeDlg') || createPlaceDialog();
          dlg.replaceChildren(h('div', { class: 'dlg' },
            h('h2', null, 'Select a place'),
            h('ul', { class: 'place-list' }, results.map((p) => h('li', { onclick: () => { dlg.close(); go({ lat: Number(p.lat), lng: Number(p.lon) }, 13); } }, p.display_name))),
            h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Cancel')));
          dlg.showModal();
        }
      } catch (e) {
        say('Search failed. Check your connection and try again.');
      }
    }

    function createPlaceDialog() {
      const dlg = document.createElement('dialog');
      dlg.id = 'placeDlg';
      document.body.appendChild(dlg);
      return dlg;
    }

    async function go(pos, zoom) {
      await init().catch(() => {});
      if (s.ready) s.map.setView([pos.lat, pos.lng], zoom || 14);
      load(pos);
    }

    function locate() {
      if (!navigator.geolocation) { say('This device cannot share its location. Choose a city below or search for a place.'); return; }
      const btn = $('#locateBtn');
      btn.disabled = true; say('Finding your location…');
      navigator.geolocation.getCurrentPosition(async (p) => {
        btn.disabled = false;
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        await init().catch(() => {});
        if (s.ready) {
          if (s.me) s.me.remove();
          s.me = L.marker([pos.lat, pos.lng], { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18] }), interactive: false, keyboard: false }).addTo(s.map);
        }
        go(pos, 15);
      }, (err) => {
        btn.disabled = false;
        let msgText;
        if (err.code === 1) {
          msgText = 'Location permission denied. Enable it in browser settings, or use the search below.';
        } else if (err.code === 2) {
          msgText = 'Location unavailable. Make sure device location is on, or use the search below.';
        } else if (err.code === 3) {
          msgText = 'Location request timed out. Try again or use the search below.';
        } else {
          msgText = 'Could not find your location. Use the search below.';
        }
        say(msgText);
        // Show retry button after error
        if (!$('#retryLocateBtn')) {
          const retryBtn = h('button', { id: 'retryLocateBtn', class: 'btn small', type: 'button', onclick: locate }, 'Retry location');
          msg.parentNode.insertBefore(retryBtn, msg.nextSibling);
        }
      }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
    }

    function emergency() {
      const dlg = $('#emergencyDlg');
      const hospitals = s.items.filter((f) => f.type === 'hospital').slice(0, 3);
      dlg.replaceChildren(h('div', { class: 'dlg' },
        h('h2', { id: 'emTitle' }, 'In an emergency'),
        h('a', { class: 'btn danger call-big', href: 'tel:112' }, icon('phone'), 'Call 112'),
        h('p', null, 'Say where you are, what happened, and how many people need help.'),
        hospitals.length
          ? h('div', { class: 'stack' }, h('h3', null, 'Nearest hospitals'), hospitals.map((f) => h('div', { class: 'fac' }, h('div', { class: 'fac-top' }, h('div', null, h('h3', null, f.name), h('div', { class: 'meta' }, dist(f.distance_m)))), actions(f))))
          : h('p', { class: 'hint' }, 'Tap "Use my location" on the map to see the nearest hospitals.'),
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Close')));
      dlg.showModal();
    }

    function show() {
      buildChips();
      init().then(() => { setTimeout(() => s.map.invalidateSize(), 50); }).catch((e) => say(e.message));
      if (!s.center && navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then((r) => { if (r.state === 'granted' && !s.center) locate(); }).catch(() => {});
      }
      if (!s.center && !msg.textContent) say('Tap "Use my location" or choose a city to see places near you.');
      
      // Add place search if not already added
      if (!$('#placeSearch')) {
        const chipsEl = document.querySelector('.chips:last-of-type');
        if (chipsEl) {
          const searchWrap = h('div', { class: 'place-search' },
            h('input', { id: 'placeSearch', type: 'search', placeholder: 'Search for a place (e.g. "Victoria Island, Lagos")', 'aria-label': 'Search for a place', autocomplete: 'off' }),
            h('button', { class: 'btn small', type: 'button', onclick: () => searchPlace($('#placeSearch').value) }, icon('search'), 'Search'));
          chipsEl.insertAdjacentElement('afterend', searchWrap);
          $('#placeSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchPlace(e.target.value); });
        }
      }
      
      // Remove retry button if it exists
      const retryBtn = $('#retryLocateBtn');
      if (retryBtn) retryBtn.remove();
    }

    $('#locateBtn').addEventListener('click', locate);
    $('#emergencyBtn').addEventListener('click', emergency);
    areaBtn.addEventListener('click', () => { const c = s.map.getCenter(); load({ lat: c.lat, lng: c.lng }); });
    return { show };
  })();

  // ---------- startup ----------
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; });
  const netPill = $('#netPill');
  const syncNet = () => { netPill.hidden = navigator.onLine; };
  window.addEventListener('online', syncNet); window.addEventListener('offline', syncNet); syncNet();

  // Theme toggle
  const themeToggle = $('#themeToggle');
  const html = document.documentElement;
  const STORAGE_KEY = 'kemist-theme';
  const getSystemTheme = () => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const setTheme = (theme) => {
    html.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    if (themeToggle) {
      themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      themeToggle.setAttribute('aria-pressed', theme === 'dark');
    }
  };
  const initTheme = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setTheme(saved || getSystemTheme());
  };
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = html.getAttribute('data-theme');
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) setTheme(e.matches ? 'dark' : 'light');
  });
  initTheme();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  (async function start() {
    try {
      state.meta = await api('/api/meta');
      if (state.meta.mode === 'demo') {
        const b = $('#demoBanner');
        b.hidden = false;
        b.replaceChildren(h('b', null, 'Demo data. '), 'These are sample records, not the live NAFDAC database. Connect Supabase and run the sync to load real data.');
      }
    } catch { /* the app still works; meta only adds the demo banner and example searches */ }
    route();
  })();
})();

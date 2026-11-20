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
    route: svg('<path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3z"/><path d="M9 3v15M15 6v15"/>'),
    locate: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
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
    document.querySelectorAll('.nav a').forEach((a) => {
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
    if (name === 'drug' && parts[1]) { document.title = 'Medicine · Kemist'; return DrugView(parts[1]); }
    if (name === 'report') { document.title = 'Report a problem · Kemist'; return ReportView(params); }
    if (name === 'about') { document.title = 'About · Kemist'; return AboutView(); }
    document.title = 'Kemist: check a medicine, find a pharmacy';
    return CheckView(params.get('q') || '');
  }

  // ---------- Home / landing ----------
  function HomeView() {
    // Redirect to Check view - landing page handles marketing content
    location.hash = '#/check';
  }

  // ---------- Check view ----------
  const NRN_LIKE = /^[A-Za-z]{0,2}\d{1,3}[\s-]?\d{3,7}$/;

  function medicineCard(d) {
    const detail = [d.strength, d.dosage_form].filter(Boolean).join(' · ');
    const title = d.display_name || d.product_name;
    return h('button', { class: 'result', type: 'button', onclick: () => { location.hash = `#/drug/${d.id}`; } },
      h('div', { class: 'result-top' },
        h('h3', null, title),
        pill(d.verdict.level)),
      detail && h('div', { class: 'meta' }, detail),
      h('div', { class: 'result-top' },
        h('span', { class: 'meta' }, d.applicant || d.manufacturer || 'Company not listed'),
        h('span', { class: 'nrn-tag' }, d.nrn)));
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
      const rows = [
        ['NAFDAC number', d.nrn], ['Active ingredients', d.active_ingredients], ['Strength', d.strength],
        ['Dosage form', d.dosage_form], ['Route', d.route], ['Sold as', d.marketing_category],
        ['Pack size', d.pack_size], ['Applicant', d.applicant],
        ['Manufacturer', [d.manufacturer, d.manufacturer_country].filter(Boolean).join(', ')],
        ['Approved', fmtDate(d.approval_date)], ['Registration expires', fmtDate(d.expiry_date)],
        ['Status in source', d.status], ['ATC code', d.atc_code], ['Product category', d.product_category],
        ['Source', d.source], ['Last updated in Kemist', fmtDate(d.fetched_at)],
      ].filter(([, val]) => val);
      if (d.display_name && d.display_name !== d.product_name) {
        rows.splice(1, 0, ['Name in NAFDAC record', d.product_name]);
      }

      put(page,
        h('a', { class: 'back', href: '#/' }, icon('back'), 'Back to search'),
        h('div', { class: 'product-head' }, h('h1', null, title), h('span', { class: 'nrn-big' }, d.nrn)),
        h('div', { class: `seal-card ${v.level}` },
          h('div', { class: 'seal' }, h('span', { html: ICON[LEVEL_ICON[v.level]], style: 'display:inline-flex' })),
          h('div', null, h('h2', null, v.label), v.reasons.map((r) => h('p', null, r)))),
        h('div', { class: 'callout' },
          h('strong', null, 'This checks the record, not your pack'),
          h('p', null, note)),
        h('dl', { class: 'kv' }, rows.map(([k, val]) => h('div', null, h('dt', null, k), h('dd', null, val)))),
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
      L.tileLayer(tileUrl, { maxZoom: 19, attribution: tileAttr }).addTo(s.map);
      s.layer = L.layerGroup().addTo(s.map);
      s.map.on('moveend', () => {
        if (!s.center || !s.map) return;
        const c = s.map.getCenter();
        areaBtn.hidden = s.map.distance(c, [s.center.lat, s.center.lng]) < 1500;
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
        const searchWrap = h('div', { class: 'place-search' },
          h('input', { id: 'placeSearch', type: 'search', placeholder: 'Search for a place (e.g. "Victoria Island, Lagos")', 'aria-label': 'Search for a place', autocomplete: 'off' }),
          h('button', { class: 'btn small', type: 'button', onclick: () => searchPlace($('#placeSearch').value) }, icon('search'), 'Search'));
        document.querySelector('.chips:last-of-type').insertAdjacentElement('afterend', searchWrap);
        $('#placeSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchPlace(e.target.value); });
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

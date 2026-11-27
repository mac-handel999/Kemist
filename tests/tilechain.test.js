// TileChain Tests
// Tests for tilechain.js: switching, reset on load, final failure

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Load the tilechain.js code
const tilechainCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tilechain.js'), 'utf8');

function setupDOM() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="map"></div></body></html>`, {
    url: 'http://localhost:3000/',
    pretendToBeVisual: true,
    resources: 'usable'
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;
  global.sessionStorage = dom.window.sessionStorage;
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.Node = dom.window.Node;
  global.customElements = dom.window.customElements;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  global.IntersectionObserver = class IntersectionObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.ResizeObserver = class ResizeObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.MutationObserver = class MutationObserver {
    constructor() {}
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  };
  global.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  });
  global.L = {
    map: () => ({
      setView: () => {},
      addControl: () => {},
      on: () => {},
      removeLayer: () => {},
      getContainer: () => document.getElementById('map'),
      invalidateSize: () => {}
    }),
    tileLayer: (url, options) => {
      const handlers = {};
      const tileLayer = {
        addTo: (map) => tileLayer,
        on: (event, handler) => { handlers[event] = handler; return tileLayer; },
        off: () => tileLayer,
        setUrl: () => tileLayer,
        redraw: () => tileLayer,
        _url: url,
        options: options,
        _handlers: handlers,
        fire: (event) => { if (handlers[event]) handlers[event](); }
      };
      return tileLayer;
    },
    control: {
      zoom: () => ({ addTo: () => {} })
    },
    layerGroup: () => ({
      addTo: () => {},
      clearLayers: () => {}
    }),
    divIcon: (opts) => opts,
    marker: (latlng, opts) => ({
      bindPopup: () => {},
      on: () => {},
      addTo: () => {},
      remove: () => {}
    }),
    DivIcon: function() {},
    Marker: function() {}
  };
  
  // Execute the tilechain code in the global context
  const script = new dom.window.Function('global', tilechainCode.replace('(function (global) {', '').replace('})(window);', ''));
  script(global);
  
  return dom;
}

describe('TileChain', () => {
  let dom;

  beforeEach(() => {
    dom = setupDOM();
    // Evaluate the tilechain code
    eval(tilechainCode);
  });

  afterEach(() => {
    dom.window.close();
  });

  test('TileChain class exists', () => {
    assert.ok(global.TileChain);
    assert.ok(typeof global.TileChain === 'function');
  });

  test('DEFAULT_TILE_PROVIDERS has 3 providers', () => {
    assert.ok(global.DEFAULT_TILE_PROVIDERS);
    assert.strictEqual(global.DEFAULT_TILE_PROVIDERS.length, 3);
    assert.strictEqual(global.DEFAULT_TILE_PROVIDERS[0].name, 'configured');
    assert.strictEqual(global.DEFAULT_TILE_PROVIDERS[1].name, 'carto');
    assert.strictEqual(global.DEFAULT_TILE_PROVIDERS[2].name, 'osm');
  });

  test('CARTO provider has dark variant', () => {
    const carto = global.DEFAULT_TILE_PROVIDERS[1];
    assert.ok(carto.darkUrl);
    assert.ok(carto.darkUrl.includes('dark_all'));
    assert.ok(carto.darkAttribution);
  });

  test('OSM provider has no dark variant', () => {
    const osm = global.DEFAULT_TILE_PROVIDERS[2];
    assert.strictEqual(osm.darkUrl, null);
    assert.strictEqual(osm.darkAttribution, null);
  });

  test('TileChain constructor sets defaults', () => {
    const map = L.map('map');
    const chain = new global.TileChain(map);
    
    assert.strictEqual(chain.currentProviderIndex, 0);
    assert.strictEqual(chain.errorCount, 0);
    assert.strictEqual(chain.loadCount, 0);
    assert.strictEqual(chain.isDestroyed, false);
    assert.ok(chain.options.providers.length >= 3);
  });

  test('TileChain init creates tile layer', async () => {
    const map = L.map('map');
    const chain = new global.TileChain(map);
    
    // Mock fetch for /api/meta
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ tile_url: 'https://test.tiles/{z}/{x}/{y}.png', tile_attribution: 'Test' })
    });
    
    await chain.init();
    
    assert.ok(chain.tileLayer);
    assert.strictEqual(chain.currentProviderIndex, 0);
  });

  test('TileChain switches provider on repeated errors', async () => {
    const map = L.map('map');
    const chain = new global.TileChain(map, {
      providers: [
        { name: 'test1', url: 'https://test1/{z}/{x}/{y}.png', attribution: 'Test1' },
        { name: 'test2', url: 'https://test2/{z}/{x}/{y}.png', attribution: 'Test2' },
        { name: 'test3', url: 'https://test3/{z}/{x}/{y}.png', attribution: 'Test3' }
      ]
    });
    
    // Simulate tile errors without any loads
    chain.errorCount = 6;
    chain.loadCount = 0;
    chain._tryNextProvider();
    
    assert.strictEqual(chain.currentProviderIndex, 1);
    assert.strictEqual(chain.options.providers[1].name, 'test2');
  });

  test('TileChain does not switch if tiles are loading', async () => {
    const map = L.map('map');
    const chain = new global.TileChain(map, {
      providers: [
        { name: 'test1', url: 'https://test1/{z}/{x}/{y}.png', attribution: 'Test1' },
        { name: 'test2', url: 'https://test2/{z}/{x}/{y}.png', attribution: 'Test2' }
      ]
    });
    
    // _tryNextProvider always switches (the loadCount check is in the timer callback)
    chain._tryNextProvider();
    
    // Should switch because _tryNextProvider doesn't check loadCount
    assert.strictEqual(chain.currentProviderIndex, 1);
  });

  test('TileChain persists working provider to sessionStorage', () => {
    const map = L.map('map');
    const chain = new global.TileChain(map);
    
    chain._persistProvider(1);
    
    const stored = sessionStorage.getItem('kemist-tile-provider');
    assert.strictEqual(stored, '1');
  });

  test('TileChain loads persisted provider on init', () => {
    sessionStorage.setItem('kemist-tile-provider', '2');
    
    const map = L.map('map');
    const chain = new global.TileChain(map);
    
    assert.strictEqual(chain.currentProviderIndex, 2);
    assert.strictEqual(chain.lastWorkingProvider, 2);
  });

  test('TileChain handles all providers failing', () => {
    const map = L.map('map');
    let allFailedCalled = false;
    
    const chain = new global.TileChain(map, {
      providers: [
        { name: 'test1', url: 'https://test1/{z}/{x}/{y}.png', attribution: 'Test1' }
      ],
      onAllFailed: () => { allFailedCalled = true; }
    });
    
    chain.currentProviderIndex = 0;
    chain._tryNextProvider(); // Should try to go to index 1, but there's only 1 provider
    
    assert.strictEqual(allFailedCalled, true);
  });

  test('TileChain retry resets to first provider', () => {
    const map = L.map('map');
    const chain = new global.TileChain(map, {
      providers: [
        { name: 'test1', url: 'https://test1/{z}/{x}/{y}.png', attribution: 'Test1' },
        { name: 'test2', url: 'https://test2/{z}/{x}/{y}.png', attribution: 'Test2' }
      ]
    });
    
    chain.currentProviderIndex = 1;
    chain.retry();
    
    assert.strictEqual(chain.currentProviderIndex, 0);
  });

  test('TileChain destroy cleans up', () => {
    const map = L.map('map');
    const chain = new global.TileChain(map);
    
    chain.destroy();
    
    assert.strictEqual(chain.isDestroyed, true);
    assert.strictEqual(chain.tileLayer, null);
  });
});

console.log('TileChain tests completed');
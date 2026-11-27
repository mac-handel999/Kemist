// Geofence Tests
// Tests for geofence.js: distance, hysteresis, cooldown, Nigeria bounds

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Load the geofence.js code
const geofenceCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'geofence.js'), 'utf8');

function setupDOM() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
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
  // Mock geolocation
  global.navigator.geolocation = {
    watchPosition: (success, error, options) => {
      return 1; // watchId
    },
    clearWatch: (id) => {},
    getCurrentPosition: (success, error, options) => {}
  };
  global.document.hidden = false;
  global.document.addEventListener = () => {};
  global.document.removeEventListener = () => {};
  
  // Execute the geofence code in the global context
  const script = new dom.window.Function('global', geofenceCode.replace('(function (global) {', '').replace('})(window);', ''));
  script(global);
  
  return dom;
}

describe('Geofence - Distance Calculations', () => {
  let dom;

  beforeEach(() => {
    dom = setupDOM();
    eval(geofenceCode);
  });

  afterEach(() => {
    dom.window.close();
  });

  test('haversineDistance calculates correct distance for known points', () => {
    // Lagos to Abuja (approximate)
    const lagos = { lat: 6.5244, lng: 3.3792 };
    const abuja = { lat: 9.0765, lng: 7.3986 };
    const distance = global.haversineDistance(lagos.lat, lagos.lng, abuja.lat, abuja.lng);
    
    // Should be approximately 525 km
    assert.ok(distance > 520000 && distance < 530000, `Expected ~525km, got ${distance/1000}km`);
  });

  test('haversineDistance returns 0 for same point', () => {
    const distance = global.haversineDistance(6.5244, 3.3792, 6.5244, 3.3792);
    assert.strictEqual(distance, 0);
  });

  test('haversineDistance is symmetric', () => {
    const d1 = global.haversineDistance(6.5244, 3.3792, 9.0765, 7.3986);
    const d2 = global.haversineDistance(9.0765, 7.3986, 6.5244, 3.3792);
    assert.strictEqual(d1, d2);
  });

  test('isInNigeria returns true for Lagos', () => {
    assert.strictEqual(global.isInNigeria(6.5244, 3.3792), true);
  });

  test('isInNigeria returns true for Abuja', () => {
    assert.strictEqual(global.isInNigeria(9.0765, 7.3986), true);
  });

  test('isInNigeria returns false for London', () => {
    assert.strictEqual(global.isInNigeria(51.5074, -0.1278), false);
  });

  test('isInNigeria returns false for New York', () => {
    assert.strictEqual(global.isInNigeria(40.7128, -74.0060), false);
  });

  test('isInNigeria returns false for points outside Nigeria bounds', () => {
    // North of Nigeria
    assert.strictEqual(global.isInNigeria(15.0, 7.0), false);
    // South of Nigeria
    assert.strictEqual(global.isInNigeria(3.0, 7.0), false);
    // East of Nigeria
    assert.strictEqual(global.isInNigeria(7.0, 16.0), false);
    // West of Nigeria
    assert.strictEqual(global.isInNigeria(7.0, 2.0), false);
  });

  test('NIGERIA_BOUNDS constants are correct', () => {
    assert.strictEqual(global.NIGERIA_BOUNDS.north, 14.0);
    assert.strictEqual(global.NIGERIA_BOUNDS.south, 4.0);
    assert.strictEqual(global.NIGERIA_BOUNDS.east, 15.0);
    assert.strictEqual(global.NIGERIA_BOUNDS.west, 2.5);
  });
});

describe('Geofence - Core Functionality', () => {
  let dom;

  beforeEach(() => {
    dom = setupDOM();
    eval(geofenceCode);
  });

  afterEach(() => {
    dom.window.close();
  });

  test('Geofence class exists', () => {
    assert.ok(global.Geofence);
    assert.ok(typeof global.Geofence === 'function');
  });

  test('Geofence constructor sets defaults', () => {
    const gf = new global.Geofence({ zones: [] });
    
    assert.strictEqual(gf.config.enterRadius, 300);
    assert.strictEqual(gf.config.exitRadius, 400);
    assert.strictEqual(gf.config.maxAccuracy, 150);
    assert.strictEqual(gf.config.throttleMs, 15000);
    assert.strictEqual(gf.config.cooldownMs, 30 * 60 * 1000);
    assert.strictEqual(gf.isDestroyed, false);
    assert.strictEqual(gf.watchId, null);
  });

  test('Geofence constructor accepts custom config', () => {
    const gf = new global.Geofence({ 
      zones: [],
      config: { enterRadius: 500, exitRadius: 600, cooldownMs: 60000 }
    });
    
    assert.strictEqual(gf.config.enterRadius, 500);
    assert.strictEqual(gf.config.exitRadius, 600);
    assert.strictEqual(gf.config.cooldownMs, 60000);
  });

  test('Geofence start creates watchPosition', () => {
    let watchCalled = false;
    global.navigator.geolocation.watchPosition = (success, error, options) => {
      watchCalled = true;
      assert.strictEqual(options.enableHighAccuracy, false);
      assert.strictEqual(options.timeout, 15000);
      assert.strictEqual(options.maximumAge, 300000);
      return 42;
    };
    
    const gf = new global.Geofence({ zones: [] });
    gf.start();
    
    assert.strictEqual(watchCalled, true);
    assert.strictEqual(gf.watchId, 42);
  });

  test('Geofence stop clears watchPosition', () => {
    let clearCalled = false;
    global.navigator.geolocation.clearWatch = (id) => { clearCalled = true; };
    
    const gf = new global.Geofence({ zones: [] });
    gf.watchId = 42;
    gf.stop();
    
    assert.strictEqual(clearCalled, true);
    assert.strictEqual(gf.watchId, null);
  });

  test('Geofence does not start twice', () => {
    let watchCount = 0;
    global.navigator.geolocation.watchPosition = () => { watchCount++; return 1; };
    
    const gf = new global.Geofence({ zones: [] });
    gf.start();
    gf.start();
    
    assert.strictEqual(watchCount, 1);
  });

  test('Geofence ignores inaccurate fixes', () => {
    let processCalled = false;
    const gf = new global.Geofence({ 
      zones: [{ id: 'z1', name: 'Test', lat: 6.5244, lng: 3.3792 }],
      onEvent: () => { processCalled = true; }
    });
    
    // Mock position with accuracy > maxAccuracy
    const position = {
      coords: {
        latitude: 6.5244,
        longitude: 3.3792,
        accuracy: 200 // > 150 default
      }
    };
    
    gf._onPosition(position);
    
    assert.strictEqual(processCalled, false);
  });

  test('Geofence processes accurate fixes', () => {
    let eventReceived = null;
    const gf = new global.Geofence({ 
      zones: [{ id: 'z1', name: 'Test Pharmacy', lat: 6.5244, lng: 3.3792 }],
      onEvent: (e) => { eventReceived = e; }
    });
    
    // Mock position with good accuracy
    const position = {
      coords: {
        latitude: 6.5244,
        longitude: 3.3792,
        accuracy: 50
      }
    };
    
    gf._onPosition(position);
    
    assert.ok(eventReceived);
    assert.strictEqual(eventReceived.type, 'enter');
    assert.strictEqual(eventReceived.zone.id, 'z1');
  });

  test('Geofence triggers exit with hysteresis', async () => {
    let events = [];
    const gf = new global.Geofence({ 
      zones: [{ id: 'z1', name: 'Test', lat: 6.5244, lng: 3.3792 }], // Lagos
      onEvent: (e) => { events.push(e); },
      config: { enterRadius: 50, exitRadius: 100, throttleMs: 1 } // Small radii, minimal throttle
    });
    
    // Enter zone (at center)
    gf._onPosition({
      coords: { latitude: 6.5244, longitude: 3.3792, accuracy: 10 }
    });
    
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'enter');
    assert.ok(gf.activeZones.has('z1'));
    
    // Wait for throttle
    await new Promise(r => setTimeout(r, 2));
    
    // Move to ~70m away (inside exit radius but outside enter radius)
    // At Lagos latitude, 0.0006 degrees lat ≈ 67m
    gf._onPosition({
      coords: { latitude: 6.5250, longitude: 3.3792, accuracy: 10 }
    });
    
    assert.strictEqual(events.length, 1); // No exit yet
    assert.ok(gf.activeZones.has('z1'));
    
    // Wait for throttle
    await new Promise(r => setTimeout(r, 2));
    
    // Move outside exit radius (~120m away)
    gf._onPosition({
      coords: { latitude: 6.5254, longitude: 3.3792, accuracy: 10 }
    });
    
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].type, 'exit');
    assert.ok(!gf.activeZones.has('z1'));
  });

  test('Geofence respects cooldown', async () => {
    let events = [];
    const gf = new global.Geofence({ 
      zones: [{ id: 'z1', name: 'Test', lat: 6.5244, lng: 3.3792 }], // Lagos
      onEvent: (e) => { events.push(e); },
      config: { cooldownMs: 1000, throttleMs: 1, enterRadius: 50, exitRadius: 100 }
    });
    
    // Enter zone
    gf._onPosition({
      coords: { latitude: 6.5244, longitude: 3.3792, accuracy: 10 }
    });
    
    assert.strictEqual(events.length, 1);
    
    // Wait for throttle
    await new Promise(r => setTimeout(r, 2));
    
    // Exit zone
    gf._onPosition({
      coords: { latitude: 6.5254, longitude: 3.3792, accuracy: 10 }
    });
    
    assert.strictEqual(events.length, 2);
    
    // Wait for throttle
    await new Promise(r => setTimeout(r, 2));
    
    // Immediately try to enter again (should be in cooldown)
    gf._onPosition({
      coords: { latitude: 6.5244, longitude: 3.3792, accuracy: 10 }
    });
    
    // Should not trigger enter due to cooldown
    assert.strictEqual(events.length, 2);
  });

  test('Geofence throttles position updates', () => {
    let processCount = 0;
    const gf = new global.Geofence({ 
      zones: [{ id: 'z1', name: 'Test', lat: 6.5244, lng: 3.3792 }],
      onEvent: () => { processCount++; },
      config: { throttleMs: 1000 }
    });
    
    // First position
    gf._onPosition({
      coords: { latitude: 6.5244, longitude: 3.3792, accuracy: 50 }
    });
    assert.strictEqual(processCount, 1);
    
    // Second position immediately (should be throttled)
    gf._onPosition({
      coords: { latitude: 6.5245, longitude: 3.3793, accuracy: 50 }
    });
    assert.strictEqual(processCount, 1);
  });

  test('Geofence pauses when document.hidden', () => {
    let hidden = false;
    Object.defineProperty(global.document, 'hidden', {
      get: () => hidden,
      configurable: true
    });
    
    const gf = new global.Geofence({ 
      zones: [{ id: 'z1', name: 'Test', lat: 6.5244, lng: 3.3792 }],
      onEvent: () => {}
    });
    
    hidden = true;
    gf._handleVisibilityChange();
    
    assert.strictEqual(gf.isPaused, true);
    
    hidden = false;
    gf._handleVisibilityChange();
    
    assert.strictEqual(gf.isPaused, false);
  });

  test('Geofence requests fresh position on visibility resume', () => {
    let getCurrentCalled = false;
    global.navigator.geolocation.getCurrentPosition = (success, error, options) => {
      getCurrentCalled = true;
      assert.strictEqual(options.maximumAge, 0);
    };
    
    const gf = new global.Geofence({ 
      zones: [{ id: 'z1', name: 'Test', lat: 6.5244, lng: 3.3792 }],
      onEvent: () => {}
    });
    gf.watchId = 1;
    
    global.document.hidden = true;
    gf._handleVisibilityChange();
    
    global.document.hidden = false;
    gf._handleVisibilityChange();
    
    assert.strictEqual(getCurrentCalled, true);
  });

  test('Geofence setZones updates zones', () => {
    const gf = new global.Geofence({ 
      zones: [{ id: 'z1', name: 'Test', lat: 6.5244, lng: 3.3792 }],
      onEvent: () => {}
    });
    
    assert.strictEqual(gf.zones.length, 1);
    
    gf.setZones([
      { id: 'z1', name: 'Test', lat: 6.5244, lng: 3.3792 },
      { id: 'z2', name: 'Test2', lat: 9.0765, lng: 7.3986 }
    ]);
    
    assert.strictEqual(gf.zones.length, 2);
  });

  test('Geofence destroy cleans up', () => {
    const gf = new global.Geofence({ 
      zones: [{ id: 'z1', name: 'Test', lat: 6.5244, lng: 3.3792 }],
      onEvent: () => {}
    });
    gf.watchId = 1;
    
    gf.destroy();
    
    assert.strictEqual(gf.isDestroyed, true);
    assert.strictEqual(gf.watchId, null);
    assert.strictEqual(gf.zones.length, 0);
  });

  test('Geofence getStatus returns current state', () => {
    const gf = new global.Geofence({ 
      zones: [{ id: 'z1', name: 'Test', lat: 6.5244, lng: 3.3792 }],
      onEvent: () => {}
    });
    gf.watchId = 1;
    gf.activeZones.add('z1');
    gf.lastPosition = { lat: 6.5244, lng: 3.3792 };
    
    const status = gf.getStatus();
    
    assert.strictEqual(status.isActive, true);
    assert.strictEqual(status.isPaused, false);
    assert.deepStrictEqual(status.activeZones, ['z1']);
    assert.strictEqual(status.zoneCount, 1);
  });

  test('Geofence handles Nigeria bounds check', () => {
    let boundsEvent = null;
    const gf = new global.Geofence({ 
      zones: [{ id: 'z1', name: 'Test', lat: 6.5244, lng: 3.3792 }],
      onEvent: (e) => { boundsEvent = e; }
    });
    
    // Position outside Nigeria (London)
    gf._onPosition({
      coords: { latitude: 51.5074, longitude: -0.1278, accuracy: 50 }
    });
    
    assert.ok(boundsEvent);
    assert.strictEqual(boundsEvent.type, 'bounds');
    assert.ok(boundsEvent.message.includes('Nigeria'));
  });

  test('Geofence ignores position updates when destroyed', () => {
    let eventReceived = false;
    const gf = new global.Geofence({ 
      zones: [{ id: 'z1', name: 'Test', lat: 6.5244, lng: 3.3792 }],
      onEvent: () => { eventReceived = true; }
    });
    
    gf.destroy();
    gf._onPosition({
      coords: { latitude: 6.5244, longitude: 3.3792, accuracy: 50 }
    });
    
    assert.strictEqual(eventReceived, false);
  });

  test('Geofence ignores position updates when paused', () => {
    let eventReceived = false;
    const gf = new global.Geofence({ 
      zones: [{ id: 'z1', name: 'Test', lat: 6.5244, lng: 3.3792 }],
      onEvent: () => { eventReceived = true; }
    });
    
    gf.isPaused = true;
    gf._onPosition({
      coords: { latitude: 6.5244, longitude: 3.3792, accuracy: 50 }
    });
    
    assert.strictEqual(eventReceived, false);
  });

  test('Geofence cleans up zones that no longer exist', () => {
    const gf = new global.Geofence({ 
      zones: [
        { id: 'z1', name: 'Test1', lat: 6.5244, lng: 3.3792 },
        { id: 'z2', name: 'Test2', lat: 9.0765, lng: 7.3986 }
      ],
      onEvent: () => {}
    });
    
    gf.activeZones.add('z1');
    gf.activeZones.add('z2');
    
    // Update zones to only have z1
    gf.setZones([{ id: 'z1', name: 'Test1', lat: 6.5244, lng: 3.3792 }]);
    
    // Trigger zone check to clean up
    gf._checkZones(6.5244, 3.3792);
    
    assert.ok(gf.activeZones.has('z1'));
    assert.ok(!gf.activeZones.has('z2'));
  });
});

describe('Geofence - DEFAULT_GEOFENCE_CONFIG', () => {
  let dom;

  beforeEach(() => {
    dom = setupDOM();
    eval(geofenceCode);
  });

  afterEach(() => {
    dom.window.close();
  });

  test('DEFAULT_GEOFENCE_CONFIG has correct values', () => {
    const config = global.DEFAULT_GEOFENCE_CONFIG;
    
    assert.strictEqual(config.enterRadius, 300);
    assert.strictEqual(config.exitRadius, 400);
    assert.strictEqual(config.maxAccuracy, 150);
    assert.strictEqual(config.throttleMs, 15000);
    assert.strictEqual(config.cooldownMs, 30 * 60 * 1000);
    assert.strictEqual(config.enableHighAccuracy, false);
    assert.strictEqual(config.timeout, 15000);
    assert.strictEqual(config.maximumAge, 300000);
  });
});

console.log('Geofence tests completed');
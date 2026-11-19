'use strict';
/**
 * Pre-fill the facilities table for big cities, so the map is full from day one.
 * The area is cut into blocks of 4x4 map cells (the same 0.05 degree grid the live lookup uses). Each block is one
 * OpenStreetMap request with a safety margin, so every user inside the block is fully covered afterwards.
 */
const { parseElements } = require('./facilities');

const STEP = 0.05;                 // must match CELL_DEG in facilities.js
const BLOCK = 4;                   // cells per block side
const MARGIN = 0.06;               // degrees (~6.6 km) around the block: more than the 5 km API maximum radius

const CITIES = {
  lagos: { name: 'Lagos', lat: 6.5244, lng: 3.3792, r: 0.3 },
  abuja: { name: 'Abuja', lat: 9.0765, lng: 7.3986, r: 0.2 },
  'port-harcourt': { name: 'Port Harcourt', lat: 4.8156, lng: 7.0498, r: 0.15 },
  ibadan: { name: 'Ibadan', lat: 7.3775, lng: 3.947, r: 0.15 },
  kano: { name: 'Kano', lat: 12.0022, lng: 8.592, r: 0.15 },
  kaduna: { name: 'Kaduna', lat: 10.5105, lng: 7.4165, r: 0.15 },
  enugu: { name: 'Enugu', lat: 6.4584, lng: 7.5464, r: 0.15 },
  'benin-city': { name: 'Benin City', lat: 6.335, lng: 5.6037, r: 0.15 },
  owerri: { name: 'Owerri', lat: 5.484, lng: 7.0351, r: 0.1 },
  abeokuta: { name: 'Abeokuta', lat: 7.1475, lng: 3.3619, r: 0.1 },
  ilorin: { name: 'Ilorin', lat: 8.4966, lng: 4.5421, r: 0.1 },
  jos: { name: 'Jos', lat: 9.8965, lng: 8.8583, r: 0.1 },
  warri: { name: 'Warri', lat: 5.5167, lng: 5.75, r: 0.1 },
  aba: { name: 'Aba', lat: 5.1066, lng: 7.3667, r: 0.1 },
  onitsha: { name: 'Onitsha', lat: 6.1498, lng: 6.7857, r: 0.1 },
  calabar: { name: 'Calabar', lat: 4.9757, lng: 8.3417, r: 0.1 },
  uyo: { name: 'Uyo', lat: 5.0377, lng: 7.9128, r: 0.1 },
  maiduguri: { name: 'Maiduguri', lat: 11.8333, lng: 13.15, r: 0.1 },
};

const cellKey = (iLat, iLng) => `${(iLat * STEP).toFixed(2)},${(iLng * STEP).toFixed(2)}`;

/** Group the cells around (lat,lng) +/- r degrees into blocks. */
function planBlocks({ lat, lng, r }) {
  const i0 = Math.round((lat - r) / STEP), i1 = Math.round((lat + r) / STEP);
  const j0 = Math.round((lng - r) / STEP), j1 = Math.round((lng + r) / STEP);
  const blocks = new Map();
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const id = `${Math.floor(i / BLOCK)}:${Math.floor(j / BLOCK)}`;
      if (!blocks.has(id)) blocks.set(id, { id, cells: [], iMin: i, iMax: i, jMin: j, jMax: j });
      const b = blocks.get(id);
      b.cells.push(cellKey(i, j));
      b.iMin = Math.min(b.iMin, i); b.iMax = Math.max(b.iMax, i);
      b.jMin = Math.min(b.jMin, j); b.jMax = Math.max(b.jMax, j);
    }
  }
  return [...blocks.values()].map((b) => ({
    id: b.id,
    cells: b.cells,
    bbox: {
      south: b.iMin * STEP - STEP / 2 - MARGIN, north: b.iMax * STEP + STEP / 2 + MARGIN,
      west: b.jMin * STEP - STEP / 2 - MARGIN, east: b.jMax * STEP + STEP / 2 + MARGIN,
    },
  }));
}

function buildBboxQuery({ south, west, north, east }) {
  const box = `(${south.toFixed(4)},${west.toFixed(4)},${north.toFixed(4)},${east.toFixed(4)})`;
  return `[out:json][timeout:120];(
    nwr["amenity"="pharmacy"]${box};
    nwr["amenity"="hospital"]${box};
    nwr["amenity"="clinic"]${box};
    nwr["amenity"="doctors"]${box};
    nwr["healthcare"="laboratory"]${box};
  );out center tags;`;
}

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBlock(block) {
  const body = `data=${encodeURIComponent(buildBboxQuery(block.bbox))}`;
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Kemist/0.1 (health facility finder; city prefill)' },
          body, signal: AbortSignal.timeout(150000),
        });
        if (res.status === 429 || res.status === 504) throw new Error(`Overpass busy (${res.status})`);
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        return parseElements((await res.json()).elements);
      } catch (e) { lastError = e; }
    }
    await sleep(20000 * (attempt + 1));                      // back off, the public server is shared
  }
  throw lastError;
}

module.exports = { CITIES, planBlocks, buildBboxQuery, fetchBlock, cellKey, sleep };

'use strict';
/**
 * KemistArt - Generic drug form illustrations (SVG)
 * Used when no real pack photo is available.
 * Brand colours: green #00844F, ink #0F2B25, marker yellow #FFE566
 */

const C = {
  green: '#00844F',
  ink: '#0F2B25',
  yellow: '#FFE566',
  white: '#FFFFFF',
  light: '#E8F5EE',
  dark: '#0A1F1A',
};

function svg(content, viewBox = '0 0 120 120') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="120" height="120" role="img" aria-hidden="true">${content}</svg>`;
}

/**
 * Map dosage_form text to a canonical form key.
 * @param {string} form - The dosage_form from the drug record
 * @returns {string} - Canonical form key
 */
function formKey(form) {
  const f = String(form || '').toLowerCase();
  if (/(tablet|caplet|pill)/.test(f)) return 'tablet';
  if (/(capsule)/.test(f)) return 'capsule';
  if (/(suspension|syrup|solution|elixir|liquid)/.test(f)) return 'syrup';
  if (/(injection|infusion|iv|im|sc|subcutaneous|intramuscular|intravenous)/.test(f)) return 'injection';
  if (/(cream|ointment|gel|topical)/.test(f)) return 'cream';
  if (/(inhaler|aerosol|inhalation)/.test(f)) return 'inhaler';
  if (/(drop|drops|ophthalmic|otic|nasal)/.test(f)) return 'drops';
  return 'default';
}

/**
 * Get SVG illustration for a dosage form.
 * @param {string} dosageForm - The dosage_form from the drug record
 * @returns {string} - SVG string
 */
function form(dosageForm) {
  const key = formKey(dosageForm);
  switch (key) {
    case 'tablet': return tablet();
    case 'capsule': return capsule();
    case 'syrup': return syrup();
    case 'injection': return injection();
    case 'cream': return cream();
    case 'inhaler': return inhaler();
    case 'drops': return drops();
    default: return defaultBox();
  }
}

function tablet() {
  return svg(`
    <defs>
      <linearGradient id="tabGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${C.white}"/>
        <stop offset="100%" stop-color="${C.light}"/>
      </linearGradient>
    </defs>
    <rect x="20" y="45" width="80" height="30" rx="15" fill="url(#tabGrad)" stroke="${C.green}" stroke-width="2"/>
    <ellipse cx="60" cy="45" rx="15" ry="4" fill="${C.light}" stroke="${C.green}" stroke-width="2"/>
    <ellipse cx="60" cy="75" rx="15" ry="4" fill="${C.green}" opacity="0.3"/>
    <text x="60" y="62" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="bold" fill="${C.ink}">TAB</text>
  `);
}

function capsule() {
  return svg(`
    <defs>
      <linearGradient id="capGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${C.green}"/>
        <stop offset="100%" stop-color="${C.ink}"/>
      </linearGradient>
      <linearGradient id="capGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${C.white}"/>
        <stop offset="100%" stop-color="${C.light}"/>
      </linearGradient>
    </defs>
    <!-- Cap -->
    <path d="M25 50 L40 50 Q50 50 50 60 Q50 70 40 70 L25 70 Q15 70 15 60 Q15 50 25 50Z" fill="url(#capGrad1)"/>
    <ellipse cx="25" cy="60" rx="10" ry="10" fill="url(#capGrad1)" opacity="0.3"/>
    <!-- Body -->
    <path d="M50 50 L85 50 Q95 50 95 60 Q95 70 85 70 L50 70 Q60 70 60 60 Q60 50 50 50Z" fill="url(#capGrad2)" stroke="${C.green}" stroke-width="1.5"/>
    <ellipse cx="85" cy="60" rx="10" ry="10" fill="${C.light}" stroke="${C.green}" stroke-width="1.5"/>
    <text x="67" y="64" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="${C.ink}">CAP</text>
  `);
}

function syrup() {
  return svg(`
    <defs>
      <linearGradient id="botGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${C.white}"/>
        <stop offset="50%" stop-color="#FFF8E7"/>
        <stop offset="100%" stop-color="${C.white}"/>
      </linearGradient>
      <linearGradient id="liqGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${C.yellow}"/>
        <stop offset="100%" stop-color="#CCB800"/>
      </linearGradient>
    </defs>
    <!-- Bottle -->
    <path d="M40 30 L40 20 Q40 15 45 15 L75 15 Q80 15 80 20 L80 30 L85 30 L85 90 Q85 95 80 95 L40 95 Q35 95 35 90 L35 30 Z" fill="url(#botGrad)" stroke="${C.green}" stroke-width="2"/>
    <!-- Liquid -->
    <path d="M42 55 L42 88 Q42 92 46 92 L74 92 Q78 92 78 88 L78 55 Z" fill="url(#liqGrad)" opacity="0.9"/>
    <!-- Cap -->
    <rect x="38" y="12" width="44" height="10" rx="2" fill="${C.ink}"/>
    <!-- Label area -->
    <rect x="45" y="35" width="30" height="40" rx="3" fill="${C.yellow}" opacity="0.3" stroke="${C.green}" stroke-width="1" stroke-dasharray="3 3"/>
    <text x="60" y="58" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" font-weight="bold" fill="${C.ink}">SYRUP</text>
  `);
}

function injection() {
  return svg(`
    <defs>
      <linearGradient id="vialGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${C.white}"/>
        <stop offset="50%" stop-color="#F0F8F4"/>
        <stop offset="100%" stop-color="${C.white}"/>
      </linearGradient>
      <linearGradient id="liqGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${C.white}"/>
        <stop offset="100%" stop-color="${C.light}"/>
      </linearGradient>
    </defs>
    <!-- Vial body -->
    <path d="M45 25 L45 15 Q45 10 50 10 L70 10 Q75 10 75 15 L75 25 L80 25 L80 85 Q80 90 75 90 L45 90 Q40 90 40 85 L40 25 Z" fill="url(#vialGrad)" stroke="${C.green}" stroke-width="2"/>
    <!-- Liquid -->
    <path d="M47 50 L47 83 Q47 87 51 87 L69 87 Q73 87 73 83 L73 50 Z" fill="url(#liqGrad2)"/>
    <!-- Cap -->
    <rect x="48" y="8" width="24" height="9" rx="2" fill="${C.ink}"/>
    <!-- Needle -->
    <line x1="60" y1="8" x2="60" y2="-5" stroke="${C.ink}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="60" cy="8" r="3" fill="${C.ink}"/>
    <text x="60" y="58" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="${C.ink}">INJ</text>
  `);
}

function cream() {
  return svg(`
    <defs>
      <linearGradient id="tubeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${C.white}"/>
        <stop offset="50%" stop-color="#F5FFF7"/>
        <stop offset="100%" stop-color="${C.white}"/>
      </linearGradient>
    </defs>
    <!-- Tube body -->
    <path d="M30 25 L30 15 Q30 10 35 10 L85 10 Q90 10 90 15 L90 25 L90 85 Q90 90 85 90 L35 90 Q30 90 30 85 Z" fill="url(#tubeGrad)" stroke="${C.green}" stroke-width="2"/>
    <!-- Cap -->
    <path d="M30 15 L30 8 Q30 4 35 4 L85 4 Q90 4 90 8 L90 15 Z" fill="${C.ink}"/>
    <!-- Cream squeeze -->
    <path d="M85 20 Q92 20 92 30 L92 40 Q92 50 85 50 L85 20 Z" fill="${C.yellow}" opacity="0.8"/>
    <text x="60" y="58" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="${C.ink}">CREAM</text>
  `);
}

function inhaler() {
  return svg(`
    <defs>
      <linearGradient id="inhGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${C.white}"/>
        <stop offset="50%" stop-color="#F0F8F4"/>
        <stop offset="100%" stop-color="${C.white}"/>
      </linearGradient>
    </defs>
    <!-- Canister -->
    <path d="M45 20 L45 15 Q45 10 50 10 L70 10 Q75 10 75 15 L75 20 L75 80 Q75 85 70 85 L50 85 Q45 85 45 80 Z" fill="url(#inhGrad)" stroke="${C.green}" stroke-width="2"/>
    <!-- Actuator -->
    <path d="M40 25 L40 20 Q40 15 45 15 L75 15 Q80 15 80 20 L80 25 L95 25 L95 40 Q95 45 90 45 L40 45 Z" fill="${C.ink}"/>
    <ellipse cx="60" cy="17.5" rx="15" ry="4" fill="${C.ink}" opacity="0.5"/>
    <!-- Spray lines -->
    <g stroke="${C.green}" stroke-width="2" stroke-linecap="round" opacity="0.7">
      <line x1="75" y1="32" x2="90" y2="25"/>
      <line x1="75" y1="32" x2="90" y2="32"/>
      <line x1="75" y1="32" x2="90" y2="39"/>
    </g>
    <text x="60" y="58" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="${C.ink}">INH</text>
  `);
}

function drops() {
  return svg(`
    <defs>
      <linearGradient id="dropGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${C.white}"/>
        <stop offset="50%" stop-color="#F0F8F4"/>
        <stop offset="100%" stop-color="${C.white}"/>
      </linearGradient>
    </defs>
    <!-- Bottle -->
    <path d="M45 20 L45 15 Q45 10 50 10 L70 10 Q75 10 75 15 L75 20 L80 20 L80 75 Q80 80 75 80 L45 80 Q40 80 40 75 L40 20 Z" fill="url(#dropGrad)" stroke="${C.green}" stroke-width="2"/>
    <!-- Liquid -->
    <path d="M47 40 L47 73 Q47 77 51 77 L69 77 Q73 77 73 73 L73 40 Z" fill="${C.yellow}" opacity="0.6"/>
    <!-- Dropper cap -->
    <rect x="52" y="8" width="16" height="14" rx="2" fill="${C.ink}"/>
    <line x1="60" y1="8" x2="60" y2="20" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>
    <!-- Drops -->
    <g fill="${C.green}" opacity="0.8">
      <ellipse cx="60" cy="0" rx="5" ry="8" transform="rotate(-30 60 0)"/>
      <ellipse cx="70" cy="5" rx="4" ry="6" transform="rotate(-20 70 5)"/>
      <ellipse cx="50" cy="5" rx="4" ry="6" transform="rotate(20 50 5)"/>
    </g>
    <text x="60" y="58" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="${C.ink}">DROPS</text>
  `);
}

function defaultBox() {
  return svg(`
    <defs>
      <linearGradient id="boxGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${C.white}"/>
        <stop offset="100%" stop-color="${C.light}"/>
      </linearGradient>
    </defs>
    <rect x="20" y="25" width="80" height="70" rx="6" fill="url(#boxGrad)" stroke="${C.green}" stroke-width="2"/>
    <rect x="30" y="35" width="60" height="40" rx="3" fill="${C.yellow}" opacity="0.2" stroke="${C.green}" stroke-width="1" stroke-dasharray="4 4"/>
    <text x="60" y="62" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="${C.ink}">MED</text>
    <text x="60" y="82" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" fill="${C.ink}" opacity="0.6">PACK</text>
  `);
}

// Browser global
if (typeof window !== 'undefined') window.KemistArt = { form, formKey };
// Node/CommonJS
if (typeof module !== 'undefined' && module.exports) module.exports = { form, formKey };
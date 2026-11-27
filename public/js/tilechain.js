/**
 * TileChain - Multi-provider tile layer fallback for Leaflet
 * Provides graceful degradation when tile providers fail
 */

(function (global) {
  'use strict';

  /**
   * Default tile providers in order of preference
   * Each provider can have a dark variant for dark theme
   */
  const DEFAULT_PROVIDERS = [
    {
      name: 'configured',
      url: null, // Will be filled from /api/meta
      attribution: null,
      subdomains: 'abc',
      darkUrl: null,
      darkAttribution: null
    },
    {
      name: 'carto',
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      darkUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
      darkAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    },
    {
      name: 'osm',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      subdomains: 'abc',
      darkUrl: null, // OSM doesn't have official dark variant
      darkAttribution: null
    }
  ];

  const STORAGE_KEY = 'kemist-tile-provider';
  const MAX_ERRORS_BEFORE_SWITCH = 6;
  const MAX_TIME_BEFORE_SWITCH = 10000; // 10 seconds

  class TileChain {
    constructor(map, options = {}) {
      this.map = map;
      this.options = {
        providers: options.providers || DEFAULT_PROVIDERS,
        onSwitch: options.onSwitch || (() => {}),
        onAllFailed: options.onAllFailed || (() => {}),
        getTheme: options.getTheme || (() => document.documentElement.getAttribute('data-theme') || 'light'),
        ...options
      };

      this.currentProviderIndex = 0;
      this.tileLayer = null;
      this.errorCount = 0;
      this.loadCount = 0;
      this.switchTimer = null;
      this.isDestroyed = false;
      this.lastWorkingProvider = null;

      // Load remembered provider
      this._loadPersistedProvider();

      // Listen for theme changes
      this._themeObserver = null;
      this._setupThemeListener();
    }

    /**
     * Initialize the tile chain with the first provider
     */
    async init() {
      // Fetch configured provider from /api/meta if not already set
      if (!this.options.providers[0].url) {
        await this._fetchConfiguredProvider();
      }
      this._createTileLayer(this.currentProviderIndex);
      return this;
    }

    /**
     * Fetch the configured tile provider from /api/meta
     */
    async _fetchConfiguredProvider() {
      try {
        const res = await fetch('/api/meta', { credentials: 'same-origin' });
        if (res.ok) {
          const data = await res.json();
          if (data.tile_url) {
            this.options.providers[0].url = data.tile_url;
            this.options.providers[0].attribution = data.tile_attribution || '&copy; OpenStreetMap contributors';
            
            // If it's a Geoapify URL, add dark variant
            if (data.tile_url.includes('geoapify.com')) {
              this.options.providers[0].darkUrl = data.tile_url.replace('osm-bright', 'osm-bright-dark');
              this.options.providers[0].darkAttribution = data.tile_attribution;
            }
          }
        }
      } catch (e) {
        console.warn('[TileChain] Failed to fetch configured provider:', e.message);
      }
    }

    /**
     * Load the last working provider from sessionStorage
     */
    _loadPersistedProvider() {
      try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          const index = parseInt(stored, 10);
          if (!isNaN(index) && index >= 0 && index < this.options.providers.length) {
            this.currentProviderIndex = index;
            this.lastWorkingProvider = index;
          }
        }
      } catch (e) {
        // Ignore storage errors
      }
    }

    /**
     * Persist the current working provider
     */
    _persistProvider(index) {
      try {
        sessionStorage.setItem(STORAGE_KEY, String(index));
        this.lastWorkingProvider = index;
      } catch (e) {
        // Ignore storage errors
      }
    }

    /**
     * Set up theme change listener
     */
    _setupThemeListener() {
      // Listen for theme changes on the document element
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
            this._updateTileUrlsForTheme();
            break;
          }
        }
      });
      
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      this._themeObserver = observer;
    }

    /**
     * Update tile URLs when theme changes
     */
    _updateTileUrlsForTheme() {
      if (!this.tileLayer || this.isDestroyed) return;
      
      const provider = this.options.providers[this.currentProviderIndex];
      const theme = this.options.getTheme();
      const isDark = theme === 'dark';
      
      let newUrl = provider.url;
      let newAttribution = provider.attribution;
      
      if (isDark && provider.darkUrl) {
        newUrl = provider.darkUrl;
        newAttribution = provider.darkAttribution || provider.attribution;
      }
      
      // Only update if URL actually changed
      if (this.tileLayer._url !== newUrl) {
        this.tileLayer.setUrl(newUrl);
        this.tileLayer.options.attribution = newAttribution;
        this.tileLayer.redraw();
      }
    }

    /**
     * Create and add tile layer for the given provider index
     */
    _createTileLayer(index) {
      if (this.isDestroyed) return;
      
      const provider = this.options.providers[index];
      if (!provider || !provider.url) {
        this._tryNextProvider();
        return;
      }

      const theme = this.options.getTheme();
      const isDark = theme === 'dark';
      const url = (isDark && provider.darkUrl) ? provider.darkUrl : provider.url;
      const attribution = (isDark && provider.darkAttribution) ? provider.darkAttribution : provider.attribution;

      // Remove existing tile layer
      if (this.tileLayer) {
        this.map.removeLayer(this.tileLayer);
        this.tileLayer.off('tileload');
        this.tileLayer.off('tileerror');
        this.tileLayer = null;
      }

      // Reset counters
      this.errorCount = 0;
      this.loadCount = 0;

      // Create new tile layer
      this.tileLayer = L.tileLayer(url, {
        maxZoom: 19,
        attribution: attribution,
        subdomains: provider.subdomains || 'abc',
        crossOrigin: true
      }).addTo(this.map);

      // Set up event handlers
      this.tileLayer.on('tileload', () => {
        if (this.isDestroyed) return;
        this.loadCount++;
        this.errorCount = 0; // Reset error count on successful load
        this._clearSwitchTimer();
        
        // Persist as working provider on first successful load
        if (this.loadCount === 1) {
          this._persistProvider(index);
        }
      });

      this.tileLayer.on('tileerror', (e) => {
        if (this.isDestroyed) return;
        this.errorCount++;
        this._scheduleProviderSwitch();
      });

      // Set up switch timer
      this._scheduleProviderSwitch();
    }

    /**
     * Schedule a provider switch if errors persist
     */
    _scheduleProviderSwitch() {
      this._clearSwitchTimer();
      
      this.switchTimer = setTimeout(() => {
        if (this.errorCount >= MAX_ERRORS_BEFORE_SWITCH && this.loadCount === 0) {
          this._tryNextProvider();
        }
      }, MAX_TIME_BEFORE_SWITCH);
    }

    /**
     * Clear the switch timer
     */
    _clearSwitchTimer() {
      if (this.switchTimer) {
        clearTimeout(this.switchTimer);
        this.switchTimer = null;
      }
    }

    /**
     * Try the next provider in the chain
     */
    _tryNextProvider() {
      if (this.isDestroyed) return;
      
      const nextIndex = this.currentProviderIndex + 1;
      
      if (nextIndex >= this.options.providers.length) {
        // All providers failed
        this._handleAllFailed();
        return;
      }

      console.warn(`[TileChain] Switching from provider ${this.options.providers[this.currentProviderIndex].name} to ${this.options.providers[nextIndex].name}`);
      
      this.currentProviderIndex = nextIndex;
      this._createTileLayer(nextIndex);
      this.options.onSwitch(this.options.providers[nextIndex], nextIndex);
    }

    /**
     * Handle complete failure of all providers
     */
    _handleAllFailed() {
      console.error('[TileChain] All tile providers failed');
      this.options.onAllFailed();
      this._showFailureOverlay();
    }

    /**
     * Show failure overlay on the map
     */
    _showFailureOverlay() {
      const container = this.map.getContainer();
      if (!container) return;

      // Remove existing overlay if any
      const existing = container.querySelector('.tilechain-failure-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.className = 'tilechain-failure-overlay';
      overlay.style.cssText = `
        position: absolute;
        inset: 0;
        background: var(--card, #fff);
        color: var(--ink, #000);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        text-align: center;
        z-index: 1000;
        border-radius: var(--radius, 8px);
        border: 2px solid var(--line, #ccc);
      `;
      overlay.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 16px; color: var(--muted, #666);">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <path d="M8 21h8M12 17v-4"/>
          <path d="M2 3h20M2 7h20M2 11h20"/>
        </svg>
        <p style="margin: 0 0 8px; font-weight: 600; font-size: 1rem;">Map pictures cannot load on this connection</p>
        <p style="margin: 0 0 16px; color: var(--muted, #666); font-size: 0.9rem;">Places are still listed below. Try another network or turn off VPN/ad blocker.</p>
        <button class="btn primary" style="padding: 10px 20px;" onclick="this.closest('.tilechain-failure-overlay').remove(); window.Kemist?.Nearby?.retryMap?.();">Retry</button>
      `;
      
      container.appendChild(overlay);
    }

    /**
     * Retry with the first provider (called from overlay button)
     */
    retry() {
      if (this.isDestroyed) return;
      this.currentProviderIndex = 0;
      this._clearSwitchTimer();
      this._createTileLayer(0);
    }

    /**
     * Get the current provider info
     */
    getCurrentProvider() {
      return this.options.providers[this.currentProviderIndex];
    }

    /**
     * Clean up
     */
    destroy() {
      this.isDestroyed = true;
      this._clearSwitchTimer();
      
      if (this.tileLayer) {
        this.map.removeLayer(this.tileLayer);
        this.tileLayer.off('tileload');
        this.tileLayer.off('tileerror');
        this.tileLayer = null;
      }
      
      if (this._themeObserver) {
        this._themeObserver.disconnect();
        this._themeObserver = null;
      }
      
      // Remove failure overlay
      const container = this.map.getContainer();
      if (container) {
        const overlay = container.querySelector('.tilechain-failure-overlay');
        if (overlay) overlay.remove();
      }
    }
  }

  // Export
  global.TileChain = TileChain;
  global.DEFAULT_TILE_PROVIDERS = DEFAULT_PROVIDERS;

})(window);
/**
 * Geofence - Foreground-only geofencing for Kemist
 * Monitors user location while app is open and triggers events when near facilities
 * 
 * Features:
 * - Uses watchPosition with low accuracy to save battery
 * - Hysteresis (enter at 300m, exit at 400m) to prevent flapping
 * - 15-second throttle on position updates
 * - Ignores fixes with accuracy > 150m
 * - Pauses when document.hidden, resumes on visible
 * - 30-minute cooldown per place
 * - Nigeria bounds check
 * - Pure distance math (Haversine) with unit tests
 */

(function (global) {
  'use strict';

  // Nigeria bounding box (approximate)
  const NIGERIA_BOUNDS = {
    north: 14.0,
    south: 4.0,
    east: 15.0,
    west: 2.5
  };

  // Default configuration
  const DEFAULT_CONFIG = {
    enterRadius: 300,      // meters - trigger enter event
    exitRadius: 400,       // meters - trigger exit event (hysteresis)
    maxAccuracy: 150,      // meters - ignore fixes worse than this
    throttleMs: 15000,     // minimum time between position processing
    cooldownMs: 30 * 60 * 1000, // 30 minutes cooldown per zone
    enableHighAccuracy: false,
    timeout: 15000,
    maximumAge: 300000
  };

  /**
   * Calculate distance between two lat/lng points using Haversine formula
   * @param {number} lat1 - Latitude of point 1
   * @param {number} lng1 - Longitude of point 1
   * @param {number} lat2 - Latitude of point 2
   * @param {number} lng2 - Longitude of point 2
   * @returns {number} Distance in meters
   */
  function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth radius in meters
    const toRad = (deg) => deg * Math.PI / 180;
    
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng / 2) ** 2;
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Check if a point is within Nigeria bounds
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {boolean}
   */
  function isInNigeria(lat, lng) {
    return lat >= NIGERIA_BOUNDS.south &&
           lat <= NIGERIA_BOUNDS.north &&
           lng >= NIGERIA_BOUNDS.west &&
           lng <= NIGERIA_BOUNDS.east;
  }

  /**
   * Create a geofence instance
   * @param {Object} options - Configuration options
   * @param {Array} options.zones - Array of zone objects {id, name, lat, lng, type, ...}
   * @param {Function} options.onEvent - Callback(event) where event = {type: 'enter'|'exit', zone, distance}
   * @param {Object} options.config - Override default config
   */
  class Geofence {
    constructor(options = {}) {
      this.zones = options.zones || [];
      this.onEvent = options.onEvent || (() => {});
      this.config = { ...DEFAULT_CONFIG, ...options.config };
      
      this.watchId = null;
      this.lastPosition = null;
      this.lastProcessedTime = 0;
      this.activeZones = new Set(); // Set of zone IDs currently inside
      this.cooldowns = new Map(); // zoneId -> timestamp when cooldown expires
      this.isPaused = false;
      this.isDestroyed = false;
      this.visibilityHandler = this._handleVisibilityChange.bind(this);
      
      // Bind methods
      this._onPosition = this._onPosition.bind(this);
      this._onError = this._onError.bind(this);
    }

    /**
     * Start geofencing
     */
    start() {
      if (this.isDestroyed) return;
      if (this.watchId !== null) return; // Already started
      
      if (!navigator.geolocation) {
        console.warn('[Geofence] Geolocation not supported');
        this.onEvent({ type: 'error', error: 'Geolocation not supported' });
        return;
      }

      // Listen for visibility changes
      document.addEventListener('visibilitychange', this.visibilityHandler);
      
      // Start watching position
      this.watchId = navigator.geolocation.watchPosition(
        this._onPosition,
        this._onError,
        {
          enableHighAccuracy: this.config.enableHighAccuracy,
          timeout: this.config.timeout,
          maximumAge: this.config.maximumAge
        }
      );
      
      console.log('[Geofence] Started watching position');
    }

    /**
     * Stop geofencing
     */
    stop() {
      if (this.watchId !== null) {
        navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
      }
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.activeZones.clear();
      this.cooldowns.clear();
      console.log('[Geofence] Stopped watching position');
    }

    /**
     * Update zones (e.g., when new facilities are loaded)
     * @param {Array} zones - New zones array
     */
    setZones(zones) {
      this.zones = zones || [];
    }

    /**
     * Handle position updates
     * @param {GeolocationPosition} position 
     */
    _onPosition(position) {
      if (this.isDestroyed || this.isPaused) return;
      
      const now = Date.now();
      
      // Throttle: ignore if too soon since last processing
      if (now - this.lastProcessedTime < this.config.throttleMs) {
        return;
      }
      
      const { latitude: lat, longitude: lng, accuracy } = position.coords;
      
      // Ignore inaccurate fixes
      if (accuracy > this.config.maxAccuracy) {
        console.debug('[Geofence] Ignoring fix with accuracy', accuracy, 'm');
        return;
      }
      
      // Nigeria bounds check
      if (!isInNigeria(lat, lng)) {
        this.onEvent({ 
          type: 'bounds', 
          message: 'Kemist covers Nigeria. Location detected outside Nigeria.',
          position: { lat, lng }
        });
        return;
      }
      
      this.lastProcessedTime = now;
      this.lastPosition = { lat, lng, accuracy, timestamp: position.timestamp };
      
      // Check each zone
      this._checkZones(lat, lng);
    }

    /**
     * Check all zones against current position
     * @param {number} lat 
     * @param {number} lng 
     */
    _checkZones(lat, lng) {
      const now = Date.now();
      
      for (const zone of this.zones) {
        if (!zone.lat || !zone.lng) continue;
        
        const distance = haversineDistance(lat, lng, zone.lat, zone.lng);
        const isInside = distance <= this.config.enterRadius;
        const wasInside = this.activeZones.has(zone.id);
        const isInCooldown = this.cooldowns.get(zone.id) > now;
        
        if (isInside && !wasInside && !isInCooldown) {
          // Enter zone
          this.activeZones.add(zone.id);
          this.cooldowns.set(zone.id, now + this.config.cooldownMs);
          
          this.onEvent({
            type: 'enter',
            zone: zone,
            distance: Math.round(distance),
            timestamp: now
          });
          
        } else if (!isInside && wasInside && distance > this.config.exitRadius) {
          // Exit zone (with hysteresis)
          this.activeZones.delete(zone.id);
          
          this.onEvent({
            type: 'exit',
            zone: zone,
            distance: Math.round(distance),
            timestamp: now
          });
        }
        
        // Clean up expired cooldowns
        if (this.cooldowns.get(zone.id) <= now) {
          this.cooldowns.delete(zone.id);
        }
      }
      
      // Clean up zones that no longer exist
      const currentZoneIds = new Set(this.zones.map(z => z.id));
      for (const activeId of this.activeZones) {
        if (!currentZoneIds.has(activeId)) {
          this.activeZones.delete(activeId);
        }
      }
    }

    /**
     * Handle geolocation errors
     * @param {GeolocationPositionError} error 
     */
    _onError(error) {
      if (this.isDestroyed) return;
      
      let message;
      switch (error.code) {
        case error.PERMISSION_DENIED:
          message = 'Location permission denied. Enable it in browser settings to use geofencing.';
          break;
        case error.POSITION_UNAVAILABLE:
          message = 'Location unavailable. Make sure device location is on.';
          break;
        case error.TIMEOUT:
          message = 'Location request timed out.';
          break;
        default:
          message = 'Could not get location.';
      }
      
      console.warn('[Geofence] Error:', message);
      this.onEvent({ type: 'error', error: message, code: error.code });
    }

    /**
     * Handle document visibility change
     */
    _handleVisibilityChange() {
      if (document.hidden) {
        this.isPaused = true;
        console.log('[Geofence] Paused (document hidden)');
      } else {
        this.isPaused = false;
        console.log('[Geofence] Resumed (document visible)');
        // Request a fresh position when becoming visible
        if (this.watchId !== null && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            this._onPosition,
            this._onError,
            {
              enableHighAccuracy: this.config.enableHighAccuracy,
              timeout: this.config.timeout,
              maximumAge: 0 // Force fresh fix
            }
          );
        }
      }
    }

    /**
     * Destroy the geofence instance
     */
    destroy() {
      this.isDestroyed = true;
      this.stop();
      this.zones = [];
      this.onEvent = () => {};
    }

    /**
     * Get current status
     * @returns {Object}
     */
    getStatus() {
      return {
        isActive: this.watchId !== null && !this.isDestroyed,
        isPaused: this.isPaused,
        activeZones: Array.from(this.activeZones),
        lastPosition: this.lastPosition,
        zoneCount: this.zones.length
      };
    }
  }

  // Export
  global.Geofence = Geofence;
  global.haversineDistance = haversineDistance;
  global.isInNigeria = isInNigeria;
  global.NIGERIA_BOUNDS = NIGERIA_BOUNDS;
  global.DEFAULT_GEOFENCE_CONFIG = DEFAULT_CONFIG;

})(window);
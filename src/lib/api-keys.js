'use strict';
/**
 * API Credential Manager with automatic failover.
 * 
 * Supports multiple credentials per provider, automatic rotation on rate limits,
 * cooldown periods, and monthly usage tracking.
 * 
 * Usage:
 *   const mgr = require('./api-keys');
 *   const { key, credentialId } = await mgr.getKey('apify');
 *   // use key for API call
 *   await mgr.recordResult(credentialId, { success: true, statusCode: 200 });
 */

const store = require('../db');

const PROVIDERS = ['apify', 'serpapi', 'openfda', 'geoapify'];

class ApiKeyManager {
  constructor() {
    this.cache = new Map(); // provider -> { credentials, fetchedAt }
    this.cacheTTL = 60000; // 1 minute
  }

  /**
   * Get an available credential for a provider.
   * Returns { key, credentialId, label } or throws if none available.
   */
  async getKey(provider) {
    if (!PROVIDERS.includes(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const cred = await this._getNextCredential(provider);
    if (!cred) {
      throw new Error(`No available ${provider} credentials. Check quota, cooldowns, or add more keys.`);
    }

    return {
      key: this._decrypt(cred.encrypted_key),
      credentialId: cred.id,
      label: cred.label
    };
  }

  /**
   * Record the result of an API call for a credential.
   * Updates usage, errors, cooldowns automatically.
   */
  async recordResult(credentialId, { success, statusCode, errorMessage, latencyMs, requestMetadata }) {
    if (store.mode === 'supabase') {
      const { error } = await store.client.rpc('record_api_call', {
        p_credential_id: credentialId,
        p_provider: '', // will be looked up from credential
        p_endpoint: requestMetadata?.endpoint || '',
        p_status_code: statusCode || 0,
        p_success: success,
        p_error_message: errorMessage || null,
        p_latency_ms: latencyMs || null,
        p_request_metadata: requestMetadata || {}
      });
      if (error) throw new Error(`record_api_call: ${error.message}`);
    } else {
      // In-memory fallback for demo mode
      console.log(`[demo] API call recorded: credential=${credentialId}, success=${success}`);
    }

    // Invalidate cache for this provider
    this._invalidateCache();
  }

  /**
   * Add a new credential (admin function).
   */
  async addCredential(provider, label, key, options = {}) {
    if (!PROVIDERS.includes(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const encrypted = this._encrypt(key);
    const cred = {
      provider,
      label,
      encrypted_key: encrypted,
      is_active: options.isActive !== false,
      monthly_limit: options.monthlyLimit || null,
      metadata: options.metadata || {}
    };

    if (store.mode === 'supabase') {
      const { data, error } = await store.client
        .from('api_credentials')
        .insert(cred)
        .select()
        .single();
      if (error) throw new Error(`addCredential: ${error.message}`);
      this._invalidateCache();
      return data;
    } else {
      // Demo mode - store in memory
      const id = `demo-${Date.now()}`;
      this._demoCredentials = this._demoCredentials || [];
      this._demoCredentials.push({ id, ...cred });
      return { id, ...cred };
    }
  }

  /**
   * List credentials for a provider (admin function).
   */
  async listCredentials(provider) {
    if (store.mode === 'supabase') {
      let query = store.client.from('api_credentials').select('*').order('created_at', { ascending: false });
      if (provider) query = query.eq('provider', provider);
      const { data, error } = await query;
      if (error) throw new Error(`listCredentials: ${error.message}`);
      return data || [];
    } else {
      return (this._demoCredentials || []).filter(c => !provider || c.provider === provider);
    }
  }

  /**
   * Update credential status (enable/disable).
   */
  async setCredentialActive(credentialId, isActive) {
    if (store.mode === 'supabase') {
      const { error } = await store.client
        .from('api_credentials')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', credentialId);
      if (error) throw new Error(`setCredentialActive: ${error.message}`);
      this._invalidateCache();
    } else {
      const cred = (this._demoCredentials || []).find(c => c.id === credentialId);
      if (cred) cred.is_active = isActive;
    }
  }

  /**
   * Delete a credential.
   */
  async deleteCredential(credentialId) {
    if (store.mode === 'supabase') {
      const { error } = await store.client
        .from('api_credentials')
        .delete()
        .eq('id', credentialId);
      if (error) throw new Error(`deleteCredential: ${error.message}`);
      this._invalidateCache();
    } else {
      this._demoCredentials = (this._demoCredentials || []).filter(c => c.id !== credentialId);
    }
  }

  /**
   * Get API call logs for a credential.
   */
  async getCallLogs(credentialId, limit = 100) {
    if (store.mode === 'supabase') {
      const { data, error } = await store.client
        .from('api_call_log')
        .select('*')
        .eq('credential_id', credentialId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`getCallLogs: ${error.message}`);
      return data || [];
    }
    return [];
  }

  /**
   * Reset monthly usage for all credentials (run via cron).
   */
  async resetMonthlyUsage() {
    if (store.mode === 'supabase') {
      const { data, error } = await store.client.rpc('reset_monthly_usage');
      if (error) throw new Error(`resetMonthlyUsage: ${error.message}`);
      this._invalidateCache();
      return data || 0;
    }
    return 0;
  }

  // Private methods

  async _getNextCredential(provider) {
    const cached = this.cache.get(provider);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) {
      return this._selectBest(cached.credentials);
    }

    if (store.mode === 'supabase') {
      const { data, error } = await store.client.rpc('get_next_credential', { p_provider: provider });
      if (error) throw new Error(`get_next_credential: ${error.message}`);
      this.cache.set(provider, { credentials: data || [], fetchedAt: Date.now() });
      return this._selectBest(data || []);
    } else {
      // Demo mode
      const creds = (this._demoCredentials || [])
        .filter(c => c.provider === provider && c.is_active)
        .sort((a, b) => (a.error_count || 0) - (b.error_count || 0));
      this.cache.set(provider, { credentials: creds, fetchedAt: Date.now() });
      return this._selectBest(creds);
    }
  }

  _selectBest(credentials) {
    if (!credentials.length) return null;
    // Already sorted by RPC, but apply same logic for demo mode
    return credentials[0];
  }

  _invalidateCache() {
    this.cache.clear();
  }

  // Simple encryption/decryption (in production, use proper encryption like crypto.subtle or a secret manager)
  _encrypt(text) {
    // XOR with a key derived from environment - NOT secure for production!
    // In production, use proper encryption with a key management system
    const secret = process.env.CREDENTIAL_ENCRYPTION_KEY || 'kemist-dev-key-change-in-production';
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ secret.charCodeAt(i % secret.length));
    }
    return Buffer.from(result).toString('base64');
  }

  _decrypt(encrypted) {
    const secret = process.env.CREDENTIAL_ENCRYPTION_KEY || 'kemist-dev-key-change-in-production';
    const text = Buffer.from(encrypted, 'base64').toString('utf8');
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ secret.charCodeAt(i % secret.length));
    }
    return result;
  }
}

module.exports = new ApiKeyManager();
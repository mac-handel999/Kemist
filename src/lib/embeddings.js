'use strict';
/**
 * Embeddings module for RAG.
 * Supports multiple embedding providers (OpenAI-compatible APIs, local models).
 * 
 * Configuration via environment variables:
 * - EMBEDDING_PROVIDER: 'openai' | 'groq' | 'local' (default: 'openai')
 * - EMBEDDING_API_KEY: API key for the provider
 * - EMBEDDING_MODEL: Model name (default: 'text-embedding-3-small' for OpenAI)
 * - EMBEDDING_BASE_URL: Custom base URL (for Groq, local, etc.)
 * - EMBEDDING_DIMENSIONS: Expected output dimensions (default: 1536)
 */

const { createClient } = require('@supabase/supabase-js');

const PROVIDER = process.env.EMBEDDING_PROVIDER || 'openai';
const API_KEY = process.env.EMBEDDING_API_KEY;
const MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const BASE_URL = process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1';
const DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 1536);

const store = require('../db');

// Track if embeddings are available
let embeddingsEnabled = Boolean(API_KEY);

function setEmbeddingsEnabled(enabled) {
  embeddingsEnabled = enabled;
}

function areEmbeddingsEnabled() {
  return embeddingsEnabled;
}

/**
 * Generate embeddings for a list of texts.
 * @param {string[]} texts - Texts to embed
 * @returns {number[][]} - Array of embedding vectors
 */
async function embed(texts) {
  if (!texts.length) return [];

  if (!embeddingsEnabled) {
    throw new Error('Embeddings not configured. Set EMBEDDING_API_KEY to enable RAG.');
  }

  // Filter empty texts
  const validTexts = texts.map(t => (t && t.trim() ? t.trim() : ' '));
  
  try {
    const res = await fetch(`${BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: validTexts,
        encoding_format: 'float',
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Embedding API ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.data.map((d) => d.embedding);
  } catch (e) {
    console.error('[embeddings] Failed to generate embeddings:', e.message);
    throw e;
  }
}

/**
 * Generate embedding for a single text.
 * @param {string} text 
 * @returns {number[]}
 */
async function embedOne(text) {
  const [embedding] = await embed([text]);
  return embedding;
}

/**
 * Chunk text into overlapping segments for better retrieval.
 * @param {string} text 
 * @param {Object} options 
 * @returns {string[]}
 */
function chunkText(text, { maxTokens = 500, overlap = 50 } = {}) {
  // Simple sentence-based chunking
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  const chunks = [];
  let current = '';
  
  for (const sentence of sentences) {
    if ((current + ' ' + sentence).length > maxTokens * 4) { // rough char estimate
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current) chunks.push(current.trim());
  
  return chunks;
}

/**
 * Build document content for a drug record.
 */
function buildDrugDocument(drug) {
  const parts = [
    drug.product_name && `Product: ${drug.product_name}`,
    drug.nrn && `NAFDAC Reg. No: ${drug.nrn}`,
    drug.active_ingredients && `Active Ingredients: ${drug.active_ingredients}`,
    drug.strength && `Strength: ${drug.strength}`,
    drug.dosage_form && `Dosage Form: ${drug.dosage_form}`,
    drug.route && `Route: ${drug.route}`,
    drug.applicant && `Applicant: ${drug.applicant}`,
    drug.manufacturer && `Manufacturer: ${drug.manufacturer}`,
    drug.manufacturer_country && `Country: ${drug.manufacturer_country}`,
    drug.marketing_category && `Category: ${drug.marketing_category}`,
    drug.approval_date && `Approved: ${drug.approval_date}`,
    drug.expiry_date && `Expires: ${drug.expiry_date}`,
    drug.status && `Status: ${drug.status}`,
    drug.atc_code && `ATC: ${drug.atc_code}`,
    drug.product_category && `Product Category: ${drug.product_category}`,
  ].filter(Boolean);
  
  return parts.join('\n');
}

/**
 * Build document content for a clinical label section.
 */
function buildClinicalDocument(clinical) {
  const sections = [];
  if (clinical.indications) sections.push(`Indications: ${clinical.indications}`);
  if (clinical.contraindications) sections.push(`Contraindications: ${clinical.contraindications}`);
  if (clinical.warnings) sections.push(`Warnings: ${clinical.warnings}`);
  if (clinical.adverse_reactions) sections.push(`Adverse Reactions: ${clinical.adverse_reactions}`);
  if (clinical.interactions) sections.push(`Interactions: ${clinical.interactions}`);
  
  const header = [
    clinical.title && `Title: ${clinical.title}`,
    clinical.ingredient_label && `Ingredient: ${clinical.ingredient_label}`,
    clinical.jurisdiction && `Jurisdiction: ${clinical.jurisdiction}`,
    clinical.effective_date && `Effective: ${clinical.effective_date}`,
  ].filter(Boolean).join('\n');
  
  return header + (sections.length ? '\n\n' + sections.join('\n\n') : '');
}

/**
 * Build document content for a medicine alert.
 */
function buildAlertDocument(alert) {
  const parts = [
    alert.title && `Alert: ${alert.title}`,
    alert.alert_type && `Type: ${alert.alert_type}`,
    alert.severity && `Severity: ${alert.severity}`,
    alert.product_name && `Product: ${alert.product_name}`,
    alert.nrn && `NAFDAC Reg. No: ${alert.nrn}`,
    alert.batch_numbers?.length && `Batches: ${alert.batch_numbers.join(', ')}`,
    alert.active_ingredients && `Ingredients: ${alert.active_ingredients}`,
    alert.manufacturer && `Manufacturer: ${alert.manufacturer}`,
    alert.description && `Description: ${alert.description}`,
    alert.source && `Source: ${alert.source}`,
    alert.source_date && `Date: ${alert.source_date}`,
  ].filter(Boolean);
  
  return parts.join('\n');
}

/**
 * Build document content for a facility.
 */
function buildFacilityDocument(facility) {
  const parts = [
    facility.name && `Facility: ${facility.name}`,
    facility.type && `Type: ${facility.type}`,
    facility.address && `Address: ${facility.address}`,
    facility.phone && `Phone: ${facility.phone}`,
    facility.opening_hours && `Hours: ${facility.opening_hours}`,
    facility.emergency && 'Emergency services available',
    facility.source && `Source: ${facility.source}`,
  ].filter(Boolean);
  
  return parts.join('\n');
}

/**
 * Index a drug record for RAG.
 */
async function indexDrug(drug) {
  const content = buildDrugDocument(drug);
  const chunks = chunkText(content);
  const embeddings = await embed(chunks);
  
  const rows = chunks.map((chunk, i) => ({
    source: 'drugs',
    source_id: drug.id,
    content_type: 'drug_record',
    title: drug.product_name || drug.nrn,
    content: chunk,
    embedding: embeddings[i],
    metadata: {
      nrn: drug.nrn,
      ingredients: drug.active_ingredients,
      manufacturer: drug.manufacturer,
      category: drug.product_category,
    },
  }));
  
  await store.upsertEmbeddings(rows);
  return rows.length;
}

/**
 * Index a clinical record for RAG.
 */
async function indexClinical(clinical) {
  const content = buildClinicalDocument(clinical);
  const chunks = chunkText(content);
  const embeddings = await embed(chunks);
  
  const rows = chunks.map((chunk, i) => ({
    source: 'clinical_info',
    source_id: clinical.id,
    content_type: 'clinical_section',
    title: clinical.title || clinical.ingredient_label,
    content: chunk,
    embedding: embeddings[i],
    metadata: {
      ingredient: clinical.ingredient_key,
      jurisdiction: clinical.jurisdiction,
      sections: Object.keys(clinical.sections || {}).filter(k => clinical.sections[k]),
    },
  }));
  
  await store.upsertEmbeddings(rows);
  return rows.length;
}

/**
 * Index a medicine alert for RAG.
 */
async function indexAlert(alert) {
  const content = buildAlertDocument(alert);
  const chunks = chunkText(content);
  const embeddings = await embed(chunks);
  
  const rows = chunks.map((chunk, i) => ({
    source: 'alerts',
    source_id: alert.id,
    content_type: 'alert',
    title: alert.title,
    content: chunk,
    embedding: embeddings[i],
    metadata: {
      alert_type: alert.alert_type,
      severity: alert.severity,
      product: alert.product_name,
      nrn: alert.nrn,
    },
  }));
  
  await store.upsertEmbeddings(rows);
  return rows.length;
}

/**
 * Search documents for RAG.
 */
async function searchDocuments(query, options = {}) {
  const {
    source = null,
    contentType = null,
    threshold = 0.7,
    count = 10,
  } = options;
  
  if (!embeddingsEnabled) {
    console.warn('[embeddings] RAG search skipped - embeddings not configured');
    return [];
  }

  const queryEmbedding = await embedOne(query);
  
  if (store.mode === 'supabase') {
    const { data, error } = await store.client.rpc('search_documents', {
      query_embedding: queryEmbedding,
      p_source: source,
      p_content_type: contentType,
      match_threshold: threshold,
      match_count: count,
    });
    if (error) throw new Error(`search_documents: ${error.message}`);
    return data || [];
  }
  return [];
}

/**
 * Full re-index of all data (run periodically).
 */
async function reindexAll() {
  console.log('[embeddings] Starting full re-index...');
  
  // Index drugs
  let drugCount = 0;
  for (let offset = 0; ; offset += 100) {
    const drugs = await store.searchDrugs('a', 100, offset);
    if (!drugs.length) break;
    for (const drug of drugs) {
      try {
        await indexDrug(drug);
        drugCount++;
      } catch (e) {
        console.error(`[embeddings] Failed to index drug ${drug.id}:`, e.message);
      }
    }
  }
  console.log(`[embeddings] Indexed ${drugCount} drugs`);
  
  // Index clinical info
  let clinicalCount = 0;
  if (store.mode === 'supabase') {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await store.client
        .from('clinical_info')
        .select('*')
        .range(offset, offset + 99);
      if (error || !data?.length) break;
      for (const clinical of data) {
        try {
          await indexClinical(clinical);
          clinicalCount++;
        } catch (e) {
          console.error(`[embeddings] Failed to index clinical ${clinical.id}:`, e.message);
        }
      }
    }
  }
  console.log(`[embeddings] Indexed ${clinicalCount} clinical records`);
  
  // Index alerts
  let alertCount = 0;
  if (store.mode === 'supabase') {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await store.client
        .from('medicine_alerts')
        .select('*')
        .range(offset, offset + 99);
      if (error || !data?.length) break;
      for (const alert of data) {
        try {
          await indexAlert(alert);
          alertCount++;
        } catch (e) {
          console.error(`[embeddings] Failed to index alert ${alert.id}:`, e.message);
        }
      }
    }
  }
  console.log(`[embeddings] Indexed ${alertCount} alerts`);
  
  console.log('[embeddings] Re-index complete');
}

module.exports = {
  embed,
  embedOne,
  chunkText,
  buildDrugDocument,
  buildClinicalDocument,
  buildAlertDocument,
  buildFacilityDocument,
  indexDrug,
  indexClinical,
  indexAlert,
  searchDocuments,
  reindexAll,
  setEmbeddingsEnabled,
  areEmbeddingsEnabled,
};
'use strict';
/**
 * Sync health and pharmacy news from SerpAPI (Google News) into Supabase.
 *
 *   node scripts/sync-news.js --queries "nafdac,pharmacy nigeria,health nigeria"  # run with custom queries
 *   node scripts/sync-news.js --dry                                              # dry run
 *   node scripts/sync-news.js --category pharmacy --country NG                   # filter by category/country
 *
 * Requires SERPAPI_KEY environment variable.
 * Get your key from https://serpapi.com/
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { sha256 } = require('../src/lib/helpers');
const apiKeys = require('../src/lib/api-keys');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Default search queries for Nigerian and global health news
const DEFAULT_QUERIES = [
  // Nigeria-focused queries
  { q: 'NAFDAC medicine drug safety alerts recalls Nigeria', category: 'regulatory', country: 'NG', source_type: 'regulatory' },
  { q: 'Nigeria pharmaceutical industry pharmacy healthcare news', category: 'pharmacy', country: 'NG', source_type: 'news_publisher' },
  { q: 'Nigeria Ministry of Health healthcare policy hospital news', category: 'health', country: 'NG', source_type: 'government' },
  { q: 'Nigeria drug counterfeit substandard falsified medicines', category: 'regulatory', country: 'NG', source_type: 'regulatory' },
  { q: 'Nigeria disease outbreak public health NCDC', category: 'outbreaks', country: 'NG', source_type: 'health_org' },
  { q: 'NIPRD pharmaceutical research development Nigeria', category: 'research', country: 'NG', source_type: 'health_org' },
  { q: 'Pharmacists Council of Nigeria pharmacy regulation licensing', category: 'regulatory', country: 'NG', source_type: 'regulatory' },
  
  // International queries
  { q: 'WHO medical product alerts drug recalls', category: 'regulatory', country: 'global', source_type: 'international_org' },
  { q: 'FDA drug safety alerts pharmaceutical recalls', category: 'regulatory', country: 'US', source_type: 'regulatory' },
  { q: 'EMA European Medicines Agency medicine safety updates', category: 'regulatory', country: 'EU', source_type: 'regulatory' },
  { q: 'global pharmaceutical industry medicine regulatory news', category: 'pharmacy', country: 'global', source_type: 'news_publisher' },
  { q: 'clinical trials drug approval new medicine 2024', category: 'research', country: 'global', source_type: 'news_publisher' },
];

// Publisher-specific queries for official sources
const OFFICIAL_QUERIES = [
  { q: 'site:nafdac.gov.ng drug alert OR medicine recall OR safety notice', category: 'regulatory', country: 'NG', source_type: 'regulatory' },
  { q: 'site:who.int medical product alert OR drug recall', category: 'regulatory', country: 'global', source_type: 'international_org' },
  { q: 'site:fda.gov drug safety communication OR recall', category: 'regulatory', country: 'US', source_type: 'regulatory' },
  { q: 'site:ema.europa.eu medicine safety OR pharmacovigilance', category: 'regulatory', country: 'EU', source_type: 'regulatory' },
  { q: 'site:ncdc.gov.ng outbreak OR disease alert', category: 'outbreaks', country: 'NG', source_type: 'health_org' },
  { q: 'site:health.gov.ng health policy OR medicine', category: 'health', country: 'NG', source_type: 'government' },
];

function generateContentHash(article) {
  const content = `${article.title}|${article.article_url}|${article.publisher_name}|${article.published_at}`;
  return sha256(content);
}

function categorizeArticle(title, snippet, publisherDomain) {
  const text = `${title} ${snippet || ''}`.toLowerCase();
  
  // Regulatory keywords
  if (text.match(/\b(recall|alert|warning|counterfeit|falsified|substandard|nafdac|fda|ema|who)\b/)) {
    return 'regulatory';
  }
  // Pharmacy/medicines keywords
  if (text.match(/\b(pharmacy|pharmaceutical|drug|medicine|medication|prescription|pharmacist)\b/)) {
    return 'pharmacy';
  }
  // Outbreak/disease keywords
  if (text.match(/\b(outbreak|epidemic|pandemic|disease|virus|infection|ncdc|surveillance)\b/)) {
    return 'outbreaks';
  }
  // Research keywords
  if (text.match(/\b(clinical trial|research|study|approval|phase [123]|fda approved|ema approved)\b/)) {
    return 'research';
  }
  // Global health keywords
  if (text.match(/\b(who|world health|global health|international|unicef|gavi)\b/)) {
    return 'global';
  }
  // Default to health
  return 'health';
}

function getSourceType(publisherDomain, publisherName) {
  const domain = (publisherDomain || '').toLowerCase();
  const name = (publisherName || '').toLowerCase();
  
  if (domain.includes('nafdac') || domain.includes('ncdc') || domain.includes('health.gov.ng') || domain.includes('pcn.gov.ng') || domain.includes('niprd')) {
    return 'government';
  }
  if (domain.includes('who.int')) return 'international_org';
  if (domain.includes('fda.gov')) return 'regulatory';
  if (domain.includes('ema.europa.eu')) return 'regulatory';
  if (domain.includes('gov.')) return 'government';
  
  return 'news_publisher';
}

async function fetchSerpApiNews(query, gl = 'ng', hl = 'en') {
  const { key, credentialId } = await apiKeys.getKey('serpapi');
  const start = Date.now();
  
  const params = new URLSearchParams({
    engine: 'google_news',
    q: query,
    gl,
    hl,
    api_key: key,
    so: '1', // sort by date
  });

  try {
    const res = await fetch(`https://serpapi.com/search?${params}`, {
      signal: AbortSignal.timeout(60000),
    });
    const latency = Date.now() - start;
    
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 300);
      await apiKeys.recordResult(credentialId, {
        success: false, statusCode: res.status, errorMessage: errText, latencyMs: latency,
        requestMetadata: { endpoint: 'google_news', query }
      });
      throw new Error(`SerpAPI ${res.status}: ${errText}`);
    }
    
    const data = await res.json();
    await apiKeys.recordResult(credentialId, {
      success: true, statusCode: res.status, latencyMs: latency,
      requestMetadata: { endpoint: 'google_news', query }
    });
    
    return data.news_results || [];
  } catch (e) {
    const latency = Date.now() - start;
    if (!e.message.includes('SerpAPI')) {
      await apiKeys.recordResult(credentialId, {
        success: false, statusCode: 0, errorMessage: e.message, latencyMs: latency,
        requestMetadata: { endpoint: 'google_news', query }
      });
    }
    throw e;
  }
}

async function upsertArticle(article, queryMeta) {
  const contentHash = generateContentHash(article);
  const category = categorizeArticle(article.title, article.snippet, article.publisher_domain);
  const sourceType = getSourceType(article.publisher_domain, article.publisher_name);
  
  // Check if article already exists by content hash or URL
  const { data: existing } = await supabase
    .from('news_articles')
    .select('id, published_at')
    .or(`content_hash.eq.${contentHash},article_url.eq.${article.article_url}`)
    .maybeSingle();

  const articleData = {
    title: article.title,
    description: article.description || article.snippet,
    snippet: article.snippet,
    article_url: article.article_url,
    image_url: article.image_url,
    publisher_name: article.publisher_name,
    publisher_domain: article.publisher_domain,
    published_at: article.published_at || new Date().toISOString(),
    fetched_at: new Date().toISOString(),
    category,
    country: queryMeta.country,
    language: 'en',
    source_type: sourceType,
    is_featured: false,
    content_hash: contentHash,
    raw_payload: article,
  };

  if (existing) {
    // Update if newer or if we have more data
    const existingDate = new Date(existing.published_at);
    const newDate = new Date(articleData.published_at);
    if (newDate > existingDate || !existingDate) {
      const { data, error } = await supabase
        .from('news_articles')
        .update(articleData)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return { action: 'updated', data };
    }
    return { action: 'skipped', data: existing };
  } else {
    const { data, error } = await supabase
      .from('news_articles')
      .insert(articleData)
      .select()
      .single();
    if (error) throw error;
    return { action: 'inserted', data };
  }
}

async function logSync(provider, query, stats) {
  await supabase
    .from('news_sync_logs')
    .insert({
      provider,
      query,
      started_at: stats.startedAt,
      completed_at: new Date().toISOString(),
      articles_found: stats.found,
      articles_inserted: stats.inserted,
      articles_updated: stats.updated,
      errors: stats.errors,
    });
}

async function runSync(queries, dryRun = false) {
  console.log(`Starting news sync with ${queries.length} queries${dryRun ? ' (DRY RUN)' : ''}`);
  
  const startedAt = new Date();
  let totalFound = 0, totalInserted = 0, totalUpdated = 0, totalErrors = 0;
  const allErrors = [];
  
  for (const queryMeta of queries) {
    const { q, category, country, source_type } = queryMeta;
    console.log(`\nQuery: "${q}" (category: ${category}, country: ${country})`);
    
    try {
      const results = await fetchSerpApiNews(q, country === 'NG' ? 'ng' : 'us', 'en');
      console.log(`  Found ${results.length} articles`);
      totalFound += results.length;
      
      for (const article of results) {
        try {
          if (dryRun) {
            console.log(`    [DRY RUN] ${article.title?.slice(0, 80)}...`);
            continue;
          }
          
          const result = await upsertArticle(article, queryMeta);
          if (result.action === 'inserted') totalInserted++;
          else if (result.action === 'updated') totalUpdated++;
          else totalErrors++;
          
          console.log(`    ${result.action}: ${article.title?.slice(0, 60)}...`);
        } catch (e) {
          totalErrors++;
          allErrors.push(`${q}: ${article.title} - ${e.message}`);
          console.error(`    ERROR: ${article.title?.slice(0, 60)}... - ${e.message}`);
        }
      }
    } catch (e) {
      totalErrors++;
      allErrors.push(`${q}: ${e.message}`);
      console.error(`  Query failed: ${e.message}`);
    }
    
    // Rate limiting - be nice to SerpAPI
    await sleep(1000);
  }
  
  console.log(`\n=== Sync Complete ===`);
  console.log(`Total found: ${totalFound}`);
  console.log(`Inserted: ${totalInserted}`);
  console.log(`Updated: ${totalUpdated}`);
  console.log(`Errors: ${totalErrors}`);
  
  if (!dryRun) {
    await logSync('serpapi', queries.map(q => q.q).join('; '), {
      startedAt,
      found: totalFound,
      inserted: totalInserted,
      updated: totalUpdated,
      errors: allErrors,
    });
  }
}

async function main() {
  const queriesOpt = opt('queries');
  const category = opt('category');
  const country = opt('country');
  const dryRun = flag('dry');
  
  let queries = DEFAULT_QUERIES.concat(OFFICIAL_QUERIES);
  
  if (queriesOpt) {
    queries = queriesOpt.split(',').map(q => ({
      q: q.trim(),
      category: category || 'other',
      country: country || 'NG',
      source_type: 'serpapi'
    }));
  }
  
  if (category) {
    queries = queries.filter(q => q.category === category);
  }
  if (country) {
    queries = queries.filter(q => q.country === country);
  }
  
  if (!process.env.SERPAPI_KEY && !dryRun) {
    console.error('ERROR: SERPAPI_KEY environment variable is required');
    console.log('Get your key from https://serpapi.com/');
    process.exit(1);
  }
  
  await runSync(queries, dryRun);
}

main().catch((e) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
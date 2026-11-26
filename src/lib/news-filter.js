'use strict';
/**
 * News article filtering utilities.
 * Rejects junk articles from SerpAPI/Google News results.
 */

// Generic titles to reject (case-insensitive, exact match after trimming)
const GENERIC_TITLES = new Set([
  'home', 'contact', 'contact us', 'procurement', 'press release', 'press releases',
  'about us', 'about', 'news', 'tenders', 'careers', 'gallery', 'search', 'sitemap',
  'privacy', 'terms', 'disclaimer', 'faq', 'login', 'register', 'subscribe'
]);

/** Check if a URL is a valid absolute http(s) URL. */
function isValidArticleUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Check if a title is generic/junk (too short or in the generic list). */
function isGenericTitle(title) {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  if (t.length < 20) return true;
  return GENERIC_TITLES.has(t);
}

/** Filter an array of articles, returning only valid ones. */
function filterArticles(articles) {
  return (articles || []).filter((a) => {
    if (!isValidArticleUrl(a.article_url)) return false;
    if (isGenericTitle(a.title)) return false;
    return true;
  });
}

module.exports = { isValidArticleUrl, isGenericTitle, filterArticles, GENERIC_TITLES };
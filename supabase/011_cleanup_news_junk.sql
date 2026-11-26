-- Kemist migration 011: Remove junk news articles.
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- This script deletes articles that:
-- 1. Have no valid absolute http(s) URL (article_url is null, empty, or not http/https)
-- 2. Have titles under 20 characters
-- 3. Have generic titles (home, contact, procurement, press release, about us, news, tenders, careers, gallery, etc.)

-- First, show count of rows that would be deleted
with junk as (
  select id, title, article_url
  from public.news_articles
  where
    -- No valid absolute http(s) URL
    article_url is null
    or article_url = ''
    or article_url !~* '^https?://'
    -- Title under 20 characters
    or length(trim(title)) < 20
    -- Generic titles
    or lower(trim(title)) in (
      'home', 'contact', 'contact us', 'procurement', 'press release', 'press releases',
      'about us', 'about', 'news', 'tenders', 'careers', 'gallery', 'search', 'sitemap',
      'privacy', 'terms', 'disclaimer', 'faq', 'login', 'register', 'subscribe'
    )
)
select count(*) as junk_count, json_agg(json_build_object('id', id, 'title', title, 'url', article_url)) as junk_rows
from junk;

-- Uncomment the following to actually delete the junk rows:
-- delete from public.news_articles
-- where id in (select id from junk);
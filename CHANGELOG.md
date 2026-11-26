# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed

#### BUG A: Clinical Library detail shows "0 labels"
- **Root cause**: The `/api/clinical/ingredient/:key` endpoint returned `labels` array directly, but the front-end expected `res.data` (consistent with the list endpoint `/api/clinical/ingredients` which returns `{ count, data, note }`).
- **Fix**: Updated the detail endpoint to return `{ count, data, ingredient_key, note, dailyMedNote, products }` for API consistency.
- **Files**: `src/routes/clinical.js`

#### BUG B: AI Assistant shows empty replies
- **Root cause**: Multiple issues:
  1. No handling for greetings/small talk ("hey", "hi", "thanks", "help") - these went through retrieval and AI unnecessarily
  2. No handling for model not found errors (retired Llama models)
  3. Empty AI answers weren't caught properly (whitespace-only answers passed through)
  4. Front-end showed empty bubble on error instead of friendly message with retry
- **Fix**:
  - Added `GREETING` regex and `GREETING_ANSWER` in `src/lib/assistant.js` - greetings now return a friendly help message without retrieval or AI call
  - Added model not found error handling in `src/lib/groq.js` with clear server logs
  - Fixed empty answer check to also catch whitespace-only strings (`!text || !text.trim()`)
  - Updated front-end `public/js/chat.js` to show "Sorry, I could not answer that. Try again" with a Retry button on error/empty answer
- **Files**: `src/lib/assistant.js`, `src/lib/groq.js`, `public/js/chat.js`

#### BUG C: News list contains junk items
- **Root cause**: SerpAPI/Google News returns navigation pages (Home, Contact, Procurement, Press Release, About Us, etc.) with no valid article URLs and generic titles
- **Fix**:
  - Added `src/lib/news-filter.js` with `isValidArticleUrl()`, `isGenericTitle()`, and `filterArticles()` functions
  - Filter rejects: no valid absolute http(s) URL, titles under 20 chars, titles matching generic list (home, contact, procurement, press release, about us, news, tenders, careers, gallery, etc.)
  - Integrated filter into `scripts/sync-news.js` - junk articles are logged and skipped during sync
  - Created cleanup SQL script `supabase/011_cleanup_news_junk.sql` to remove existing junk rows (shows count first, delete commented out for safety)
- **Files**: `src/lib/news-filter.js`, `scripts/sync-news.js`, `supabase/011_cleanup_news_junk.sql`

### Added

- **Contract test**: `npm run check:library` (`scripts/check-library.js`) - verifies every ingredient from the list endpoint returns at least one label from the detail endpoint
- **News filter tests**: Added 6 new tests in `tests/news.test.js` for URL validation, generic title detection, and article filtering
- **AI Assistant tests**: Added 3 new tests in `tests/assistant.test.js` for empty answer fallback, greeting handling, and greeting regex

### Tests

All 44 tests pass including 9 new tests for the bug fixes.
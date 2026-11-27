'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const groq = require('../lib/groq');
const { handle } = require('../lib/assistant');

const limiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many questions. Please wait a minute.' } });

// POST /api/chat { message, history: [{role, content}] }
router.post('/', limiter, async (req, res, next) => {
  try {
    const out = await handle(req.body, { llm: groq.configured() ? (messages) => groq.chat(messages) : null });
    const { status, ...body } = out;
    res.status(status).json(body);
  } catch (e) { next(e); }
});

// POST /api/chat/stream — Server-Sent Events streaming
router.post('/stream', limiter, async (req, res, next) => {
  try {
    const { message, history } = req.body;
    if (!message || String(message).trim().length < 2) {
      return res.status(400).json({ error: 'Ask a question (at least 2 characters).' });
    }
    if (!groq.configured()) {
      return res.status(503).json({ error: 'AI not configured.' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const sendError = (err) => {
      send({ error: err.message || 'Stream error' });
      res.end();
    };

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    // Use the assistant handle logic but with streaming
    const { retrieve } = require('../lib/assistant');
    const { EMERGENCY, NO_DATA, GREETING, GREETING_ANSWER, buildMessages, retrievalOnlyAnswer, publicSources, clip } = require('../lib/assistant');

    const q = clip(String(message).trim(), 500);
    if (EMERGENCY.test(q)) {
      send({ type: 'emergency', content: 'This sounds like it could be an emergency. Please call 112 now, or get to the nearest hospital. Do not wait for a reply here. If someone is with you, ask them to help. You can open the Nearby page and tap Emergency to see hospitals close to you.' });
      return res.end();
    }
    if (GREETING.test(q)) {
      send({ type: 'greeting', content: GREETING_ANSWER });
      return res.end();
    }

    const { sources } = await retrieve(q);
    if (!sources.length) {
      send({ type: 'no-data', content: NO_DATA });
      return res.end();
    }

    const messages = buildMessages(q, history?.slice(-4) || [], sources);
    
    try {
      for await (const token of groq.chatStream(messages, { signal: controller.signal })) {
        if (controller.signal.aborted) break;
        send({ type: 'token', content: token });
      }
      send({ type: 'done', sources: publicSources(sources) });
    } catch (e) {
      console.warn('[chat/stream] streaming failed, falling back:', e.message);
      // Fall back to non-streaming
      const fallback = await handle({ message: q, history }, { llm: groq.chat });
      const { status, ...body } = fallback;
      res.status(status).json(body);
      return;
    }
    res.end();
  } catch (e) { next(e); }
});

module.exports = router;

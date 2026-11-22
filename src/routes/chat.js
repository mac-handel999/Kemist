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

module.exports = router;

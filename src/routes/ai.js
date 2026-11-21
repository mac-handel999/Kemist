'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const store = require('../db');
const { searchDocuments } = require('../lib/embeddings');
const crypto = require('node:crypto');

// Stricter limit for AI chat
const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are the Kemist AI Assistant, a knowledgeable pharmaceutical information helper for users in Nigeria.

Your role:
- Answer questions about medicines, ingredients, dosages, side effects, and interactions
- Use the provided context from NAFDAC registration data, US FDA clinical labels, and safety alerts
- Always cite your sources (NAFDAC, openFDA/DailyMed, medicine alerts)
- Distinguish between Nigerian (NAFDAC) and US (FDA) regulatory information
- Never diagnose, prescribe, or give medical advice
- Encourage users to consult pharmacists or doctors for personal health decisions
- If information is not in the provided context, say so clearly

Guidelines:
- Be concise but thorough
- Use clear, accessible language
- Format responses with sections when helpful
- Always include the disclaimer that this is not medical advice
- Reference specific NAFDAC registration numbers when relevant
- Note when US FDA data may differ from Nigerian approved information`;

// POST /api/ai/chat - Send a message to the AI assistant
router.post('/chat', limiter, async (req, res, next) => {
  try {
    const { message, sessionId, history } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const session = sessionId || crypto.randomUUID();
    const userMsg = message.trim();

    // Retrieve relevant documents using RAG
    let retrievedDocs = [];
    try {
      retrievedDocs = await searchDocuments(userMsg, {
        source: ['drugs', 'clinical_info', 'alerts'],
        threshold: 0.65,
        count: 8,
      });
    } catch (e) {
      console.warn('[ai] Document search failed:', e.message);
    }

    // Build context from retrieved documents
    const context = retrievedDocs.length > 0
      ? '\n\n--- RETRIEVED CONTEXT ---\n' + retrievedDocs.map((doc, i) => 
          `[${i + 1}] Source: ${doc.source} (${doc.content_type})\nTitle: ${doc.title || 'N/A'}\nContent: ${doc.content.slice(0, 1500)}`
        ).join('\n\n') + '\n--- END CONTEXT ---'
      : '\n\n--- NO RELEVANT CONTEXT FOUND ---';

    // Build conversation history
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + context },
    ];

    // Add recent history (last 6 messages)
    if (Array.isArray(history)) {
      const recent = history.slice(-6);
      for (const h of recent) {
        if (h.role && h.content) {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }

    messages.push({ role: 'user', content: userMsg });

    // Call LLM (Groq or OpenAI-compatible)
    const llmProvider = process.env.LLM_PROVIDER || 'groq';
    const llmApiKey = process.env.LLM_API_KEY;
    const llmModel = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';
    const llmBaseUrl = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';

    if (!llmApiKey) {
      // Fallback: return context-based response without LLM
      const fallbackResponse = buildFallbackResponse(userMsg, retrievedDocs);
      await saveConversation(session, userMsg, fallbackResponse, retrievedDocs, 'fallback', 0);
      return res.json({ response: fallbackResponse, sessionId: session, sources: retrievedDocs.map(d => ({ source: d.source, title: d.title })) });
    }

    const startTime = Date.now();
    const llmRes = await fetch(`${llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmApiKey}`,
      },
      body: JSON.stringify({
        model: llmModel,
        messages,
        temperature: 0.3,
        max_tokens: 1000,
        stream: false,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!llmRes.ok) {
      const err = await llmRes.text();
      throw new Error(`LLM API ${llmRes.status}: ${err}`);
    }

    const llmData = await llmRes.json();
    const assistantMsg = llmData.choices?.[0]?.message?.content || 'I apologize, but I could not generate a response.';
    const tokensUsed = llmData.usage?.total_tokens || 0;

    // Save conversation
    await saveConversation(session, userMsg, assistantMsg, retrievedDocs, llmModel, tokensUsed);

    res.json({
      response: assistantMsg,
      sessionId: session,
      sources: retrievedDocs.map(d => ({ source: d.source, title: d.title, content_type: d.content_type })),
      tokensUsed,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/ai/history/:sessionId - Get conversation history
router.get('/history/:sessionId', async (req, res, next) => {
  try {
    const { data, error } = await store.client
      .from('ai_conversations')
      .select('*')
      .eq('session_id', req.params.sessionId)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) throw new Error(`history: ${error.message}`);
    res.json({ data: data || [] });
  } catch (e) { next(e); }
});

// POST /api/ai/index - Trigger re-indexing (admin)
router.post('/index', async (req, res, next) => {
  try {
    const { reindexAll } = require('../lib/embeddings');
    // Run in background
    reindexAll().catch(e => console.error('[ai] Re-index failed:', e.message));
    res.json({ message: 'Re-indexing started in background' });
  } catch (e) { next(e); }
});

async function saveConversation(sessionId, userMsg, assistantMsg, retrievedDocs, model, tokens) {
  if (store.mode === 'supabase') {
    try {
      await store.client.from('ai_conversations').insert({
        session_id: sessionId,
        user_message: userMsg,
        assistant_message: assistantMsg,
        retrieved_docs: retrievedDocs,
        model,
        tokens_used: tokens,
      });
    } catch (e) {
      console.warn('[ai] Failed to save conversation:', e.message);
    }
  }
}

function buildFallbackResponse(query, docs) {
  if (!docs.length) {
    return `I couldn't find specific information about "${query}" in the Kemist database. 

You can try:
- Searching for a medicine by NAFDAC number or name on the Check page
- Browsing the Clinical Library for US FDA label information
- Checking Safety Alerts for official notices
- Finding nearby pharmacies on the Nearby page

For specific medical advice, please consult a pharmacist or doctor.`;
  }

  const bySource = {};
  for (const doc of docs) {
    if (!bySource[doc.source]) bySource[doc.source] = [];
    bySource[doc.source].push(doc);
  }

  let response = `Based on the Kemist database, here's what I found for "${query}":\n\n`;

  if (bySource.drugs) {
    response += `**NAFDAC Registration Records:**\n`;
    for (const doc of bySource.drugs.slice(0, 3)) {
      response += `- ${doc.title || 'Record'} (${doc.metadata?.nrn || 'N/A'})\n`;
      if (doc.content.includes('Active Ingredients')) {
        const ing = doc.content.match(/Active Ingredients: ([^\n]+)/);
        if (ing) response += `  Ingredients: ${ing[1]}\n`;
      }
    }
    response += '\n';
  }

  if (bySource.clinical_info) {
    response += `**US FDA Clinical Labels (openFDA/DailyMed):**\n`;
    for (const doc of bySource.clinical_info.slice(0, 2)) {
      response += `- ${doc.title || 'Label'} for ${doc.metadata?.ingredient || 'ingredient'}\n`;
    }
    response += '\n';
  }

  if (bySource.alerts) {
    response += `**Safety Alerts:**\n`;
    for (const doc of bySource.alerts.slice(0, 2)) {
      response += `- ${doc.title} (${doc.metadata?.severity || 'unknown'} severity)\n`;
    }
    response += '\n';
  }

  response += `---\n*This response is based on retrieved database records. For complete information, use the Check, Clinical Library, or Alerts pages. This is not medical advice—consult a healthcare professional.*`;

  return response;
}

module.exports = router;
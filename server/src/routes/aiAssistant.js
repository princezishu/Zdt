import { Router } from 'express';
import dotenv from 'dotenv';
import { z } from 'zod';
import { pool } from '../db.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

function getAiConfig() {
  // Reload env so keys updated in server/.env are picked up without stale reads.
  dotenv.config({ override: true });
  const openAiApiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const openAiModel = String(process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
  const geminiApiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const geminiModel =
    String(process.env.GEMINI_MODEL || 'gemini-2.5-flash')
      .trim()
      .replace(/^models\//i, '') || 'gemini-2.5-flash';
  return { openAiApiKey, openAiModel, geminiApiKey, geminiModel };
}

const chatRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 18,
  message: 'Too many AI chat requests. Please wait a minute and try again.',
  keyGenerator: (req) => {
    const ip = String(req.ip || req.socket?.remoteAddress || '')
      .split(',')[0]
      .trim();
    const ua = String(req.get('user-agent') || '').slice(0, 80);
    return `ai-chat:${ip}:${ua || '-'}`;
  },
});

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(2000),
});

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000).optional(),
  messages: z.array(chatMessageSchema).max(16).optional(),
  language: z.string().trim().max(48).optional().or(z.literal('')),
});

function normalizeLanguage(raw) {
  const text = String(raw || '').trim();
  if (!text) return 'auto';
  return text.slice(0, 48);
}

async function safeCount(sql) {
  try {
    const rows = await pool.query(sql);
    return Number(rows.rows[0]?.count || 0);
  } catch {
    return 0;
  }
}

async function loadPlatformSnapshot() {
  const [companies, projects, properties, topCityRows] = await Promise.all([
    safeCount('SELECT COUNT(*)::INT AS count FROM companies'),
    safeCount('SELECT COUNT(*)::INT AS count FROM projects'),
    safeCount('SELECT COUNT(*)::INT AS count FROM properties'),
    (async () => {
      try {
        const rows = await pool.query(
          `
            SELECT city, COUNT(*)::INT AS total
            FROM properties
            WHERE COALESCE(city, '') <> ''
            GROUP BY city
            ORDER BY total DESC
            LIMIT 5
          `
        );
        return rows.rows.map((row) => ({
          city: String(row.city || ''),
          total: Number(row.total || 0),
        }));
      } catch {
        return [];
      }
    })(),
  ]);

  return { companies, projects, properties, topCities: topCityRows };
}

function buildFallbackAnswer(userPrompt, language) {
  const text = String(userPrompt || '').toLowerCase();
  const wantsBuy = /\b(buy|purchase|invest)\b/.test(text);
  const wantsRent = /\b(rent|lease|tenant)\b/.test(text);
  const wantsSell = /\b(sell|resale)\b/.test(text);

  const english =
    wantsBuy
      ? 'For buying: shortlist location, verify title + approvals, compare price/sqft, check loan eligibility, and inspect legal documents before token payment.'
      : wantsRent
        ? 'For renting: verify owner identity, compare rent + maintenance + deposit, inspect condition, and sign a written rental agreement with terms.'
        : wantsSell
          ? 'For selling: prepare clear title docs, set price from nearby comps, improve listing photos/details, and verify buyer proof before agreement.'
          : 'I can help with buy/rent/sell/investment, legal checklist, pricing, location comparison, and negotiation tips.';

  const hindi =
    'मैं रियल एस्टेट में खरीद, किराया, बिक्री, दस्तावेज़ चेकलिस्ट, कीमत तुलना और निवेश मार्गदर्शन दे सकता हूँ। अपना सवाल विस्तार से लिखें।';

  if (language.toLowerCase().startsWith('hi')) {
    return `${hindi}\n\n${english}`;
  }
  return `${english}\n\nIf you set OPENAI_API_KEY or GEMINI_API_KEY on server, answers become more advanced and multilingual.`;
}

function normalizeOpenAIContent(rawContent) {
  if (typeof rawContent === 'string') {
    return rawContent.trim();
  }
  if (Array.isArray(rawContent)) {
    const text = rawContent
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        return typeof part.text === 'string' ? part.text : '';
      })
      .join(' ')
      .trim();
    return text;
  }
  return '';
}

async function requestOpenAIReply(messages, options) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: options.openAiModel,
      temperature: 0.25,
      max_tokens: 650,
      messages,
    }),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`OpenAI request failed (${response.status}): ${details}`);
  }

  const payload = await response.json();
  const answer = normalizeOpenAIContent(payload?.choices?.[0]?.message?.content);
  if (!answer) {
    throw new Error('AI response did not include text content.');
  }
  return answer;
}

function toGeminiMessages(messages) {
  return messages
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(entry.content || '') }],
    }));
}

function normalizeGeminiText(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const parts = Array.isArray(candidates[0]?.content?.parts) ? candidates[0].content.parts : [];
  const text = parts
    .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
    .join(' ')
    .trim();
  return text;
}

function sanitizeAssistantAnswer(rawAnswer) {
  let answer = String(rawAnswer || '').replace(/\r\n/g, '\n').trim();
  if (!answer) {
    return '';
  }

  answer = answer
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/^\s*\*\s+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return answer;
}

async function requestGeminiReply(systemPrompt, messages, options) {
  const normalizedModel =
    String(options.geminiModel || '').trim().replace(/^models\//i, '') || 'gemini-2.5-flash';
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      normalizedModel
    )}:generateContent?key=${encodeURIComponent(options.geminiApiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: toGeminiMessages(messages),
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 650,
      },
    }),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`Gemini request failed (${response.status}): ${details}`);
  }

  const payload = await response.json();
  const answer = normalizeGeminiText(payload);
  if (!answer) {
    throw new Error('Gemini response did not include text content.');
  }
  return { answer, normalizedModel };
}

router.post('/chat', chatRateLimiter, async (req, res, next) => {
  try {
    const aiConfig = getAiConfig();
    const payload = chatRequestSchema.parse(req.body || {});
    const language = normalizeLanguage(payload.language);
    const normalizedMessages = Array.isArray(payload.messages) ? payload.messages : [];
    const latestMessage = payload.message?.trim() || '';

    const messages = latestMessage
      ? [...normalizedMessages, { role: 'user', content: latestMessage }]
      : normalizedMessages;

    if (messages.length === 0) {
      return res.status(400).json({ error: 'Please provide a message to continue the chat.' });
    }

    const platform = await loadPlatformSnapshot();
    const systemPrompt = [
      'You are ZDT Realty AI assistant. Help users with real-estate questions.',
      'You must answer in the same language as the user message.',
      'Supported topics: buy, sell, rent, investment, document checklist, legal/risk awareness, taxes, negotiation, locality comparison, and market trends.',
      'Keep answers practical and clear with short steps.',
      'Write plain text only. Do not use markdown symbols like **, *, #, or backticks.',
      'Default to a concise reply (2 to 5 short lines) unless user asks for detailed output.',
      'If a user asks legal/tax/financial final advice, provide general guidance and recommend a licensed professional for final decisions.',
      `Use this platform context only when relevant: companies=${platform.companies}, projects=${platform.projects}, properties=${platform.properties}, topCities=${platform.topCities
        .map((entry) => `${entry.city}:${entry.total}`)
        .join(', ') || 'n/a'}.`,
      `Preferred language hint: ${language}.`,
    ].join(' ');

    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-12),
    ];

    let answer = '';
    let source = 'fallback';
    let model = 'fallback-rule-engine';

    if (aiConfig.openAiApiKey) {
      try {
        answer = await requestOpenAIReply(llmMessages, aiConfig);
        source = 'openai';
        model = aiConfig.openAiModel;
      } catch {
        answer = buildFallbackAnswer(messages[messages.length - 1]?.content || '', language);
      }
    } else if (aiConfig.geminiApiKey) {
      try {
        const geminiResponse = await requestGeminiReply(systemPrompt, messages.slice(-12), aiConfig);
        answer = geminiResponse.answer;
        source = 'gemini';
        model = geminiResponse.normalizedModel;
      } catch {
        answer = buildFallbackAnswer(messages[messages.length - 1]?.content || '', language);
      }
    } else {
      answer = buildFallbackAnswer(messages[messages.length - 1]?.content || '', language);
    }

    answer = sanitizeAssistantAnswer(answer);

    return res.json({
      answer,
      source,
      model,
      language,
      platformSnapshot: platform,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;

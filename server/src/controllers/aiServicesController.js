import { Router } from 'express';
import { z } from 'zod';
import { createRateLimiter } from '../middleware/rateLimit.js';
import {
  buildFallbackResult,
  buildServiceSystemPrompt,
  buildServiceUserPrompt,
  getAiService,
  listAiServices,
} from '../services/aiServicesCatalog.js';
import {
  generateAiServiceJson,
  getAiServicesProviderStatus,
} from '../services/aiServicesProvider.js';

const router = Router();

const attachmentSchema = z.object({
  type: z.string().trim().min(1).max(60).optional(),
  name: z.string().trim().max(180).optional(),
  url: z.string().trim().url().max(1200).optional(),
  mimeType: z.string().trim().max(120).optional(),
  text: z.string().trim().max(8000).optional(),
});

const runAiServiceSchema = z
  .object({
    prompt: z.string().trim().max(4000).optional().or(z.literal('')),
    language: z.string().trim().max(48).optional().or(z.literal('')),
    inputs: z.record(z.string(), z.unknown()).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
    attachments: z.array(attachmentSchema).max(12).optional(),
    outputDetail: z.enum(['brief', 'standard', 'detailed']).optional().default('standard'),
  })
  .passthrough();

function buildAiServiceRateLimitKey(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim();
  const deviceId = String(req.get('x-device-id') || '').trim().slice(0, 120);
  const ua = String(req.get('user-agent') || '').slice(0, 120);
  return `ai-services:${ip || '-'}:${deviceId || '-'}:${ua || '-'}`;
}

const aiServiceBurstRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 12,
  message: 'Too many AI service requests. Please wait a minute and try again.',
  scope: 'ai-services-burst',
  keyGenerator: buildAiServiceRateLimitKey,
});

const aiServiceHourlyRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 160,
  message: 'AI service limit reached for this hour. Please try again later.',
  scope: 'ai-services-hourly',
  keyGenerator: buildAiServiceRateLimitKey,
});

router.get(['/', '/catalog'], (req, res) => {
  res.json({
    services: listAiServices(),
    providerStatus: getAiServicesProviderStatus(),
  });
});

router.get('/provider-status', (req, res) => {
  res.json({
    providerStatus: getAiServicesProviderStatus(),
  });
});

router.get('/:serviceKey', (req, res) => {
  const service = getAiService(req.params.serviceKey);
  if (!service) {
    return res.status(404).json({ error: 'AI service not found.' });
  }
  return res.json({
    service,
    providerStatus: getAiServicesProviderStatus(),
  });
});

router.post(
  '/:serviceKey/:action?',
  aiServiceBurstRateLimiter,
  aiServiceHourlyRateLimiter,
  async (req, res) => {
    const service = getAiService(req.params.serviceKey);
    if (!service) {
      return res.status(404).json({ error: 'AI service not found.' });
    }

    const requestedAction = String(req.params.action || service.actions[0] || 'run').trim();
    if (requestedAction && !service.actions.includes(requestedAction)) {
      return res.status(404).json({
        error: 'AI service action not found.',
        serviceKey: service.key,
        supportedActions: service.actions,
      });
    }

    const payload = runAiServiceSchema.parse(req.body || {});
    const normalizedPayload = normalizeAiServicePayload(payload, {
      serviceKey: service.key,
      action: requestedAction,
    });
    const fallback = buildFallbackResult(service.key, normalizedPayload);
    const aiResult = await generateAiServiceJson({
      systemPrompt: buildServiceSystemPrompt(service),
      userPrompt: buildServiceUserPrompt(service, normalizedPayload),
      fallback,
      maxTokens: payload.outputDetail === 'detailed' ? 1800 : 1200,
    });

    return res.json({
      service: {
        key: service.key,
        title: service.title,
        category: service.category,
        action: requestedAction,
        stage: service.stage,
      },
      provider: {
        source: aiResult.provider,
        model: aiResult.model,
        configured: aiResult.configured,
      },
      result: normalizeAiServiceResult(aiResult.result, fallback),
      warnings: buildResponseWarnings(service.key, aiResult.warnings),
      generatedAt: new Date().toISOString(),
    });
  }
);

function normalizeAiServicePayload(payload, metadata) {
  const normalized = {
    ...payload,
    inputs: payload.inputs || {},
    context: payload.context || {},
    attachments: payload.attachments || [],
    meta: {
      serviceKey: metadata.serviceKey,
      action: metadata.action,
      language: payload.language || 'en',
      outputDetail: payload.outputDetail || 'standard',
    },
  };

  return normalized;
}

function normalizeAiServiceResult(result, fallback) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return fallback;
  }

  return {
    summary:
      typeof result.summary === 'string' && result.summary.trim()
        ? result.summary.trim()
        : fallback.summary,
    output:
      result.output && typeof result.output === 'object' && !Array.isArray(result.output)
        ? result.output
        : fallback.output,
    assumptions: normalizeStringArray(result.assumptions, fallback.assumptions),
    risks: normalizeStringArray(result.risks, fallback.risks),
    nextActions: normalizeStringArray(result.nextActions, fallback.nextActions),
    confidence: normalizeConfidence(result.confidence, fallback.confidence),
  };
}

function normalizeStringArray(value, fallback) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 12);
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeConfidence(value, fallback) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, numberValue));
}

function buildResponseWarnings(serviceKey, providerWarnings) {
  const warnings = Array.isArray(providerWarnings) ? [...providerWarnings] : [];
  if (serviceKey === 'document-assistant') {
    warnings.push('Document outputs are drafting support only and require qualified legal review.');
  }
  if (serviceKey === 'structural-analysis') {
    warnings.push('Structural outputs are preliminary screening only and require a licensed structural engineer.');
  }
  if (serviceKey === 'plot-polygon') {
    warnings.push('Plot boundaries must be verified against survey records before legal or approval use.');
  }
  if (serviceKey === 'property-valuation') {
    warnings.push('Valuation output is an estimate and not a bank valuation or final sale price.');
  }
  return Array.from(new Set(warnings)).slice(0, 12);
}

export default router;

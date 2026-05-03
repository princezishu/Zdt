import crypto from 'crypto';
import dotenv from 'dotenv';

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';
const DEFAULT_BEDROCK_MODEL = 'global.amazon.nova-2-lite-v1:0';
const DEFAULT_MAX_TOKENS = 1200;

export function getAiServicesProviderStatus() {
  const config = readAiServicesConfig();
  return {
    preference: config.preference,
    providers: [
      {
        key: 'bedrock',
        configured: isBedrockConfigured(config),
        model: config.bedrockModelId,
        region: config.bedrockRegion,
      },
      {
        key: 'openai',
        configured: isUsableSecret(config.openAiApiKey),
        model: config.openAiModel,
      },
      {
        key: 'gemini',
        configured: isUsableSecret(config.geminiApiKey),
        model: config.geminiModel,
      },
      {
        key: 'fallback',
        configured: true,
        model: 'rule-based',
      },
    ],
  };
}

export async function generateAiServiceJson({
  systemPrompt,
  userPrompt,
  fallback,
  maxTokens = DEFAULT_MAX_TOKENS,
} = {}) {
  const config = readAiServicesConfig();
  const providers = resolveProviderOrder(config);

  if (providers.length === 0) {
    return buildFallbackProviderResult(fallback, [
      'No AI provider is configured. Returning deterministic foundation output.',
    ]);
  }

  const attempts = [];
  for (const provider of providers) {
    try {
      const text = await requestProviderText(provider, {
        systemPrompt,
        userPrompt,
        config,
        maxTokens,
      });
      const parsed = parseJsonObjectFromText(text);
      return {
        provider: provider.key,
        model: provider.model,
        configured: true,
        result: parsed,
        warnings: [],
      };
    } catch (error) {
      attempts.push({
        provider: provider.key,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return buildFallbackProviderResult(fallback, [
    'Configured AI provider call failed. Returning deterministic foundation output.',
    ...attempts.map((attempt) => `${attempt.provider}: ${attempt.message}`),
  ]);
}

function readAiServicesConfig() {
  dotenv.config({ override: true });
  return {
    preference: String(process.env.AI_SERVICES_PROVIDER || 'auto').trim().toLowerCase(),
    openAiApiKey: String(process.env.OPENAI_API_KEY || '').trim(),
    openAiModel: String(process.env.OPENAI_CHAT_MODEL || DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL,
    geminiApiKey: String(process.env.GEMINI_API_KEY || '').trim(),
    geminiModel:
      String(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL)
        .trim()
        .replace(/^models\//i, '') || DEFAULT_GEMINI_MODEL,
    bedrockRegion:
      String(process.env.AWS_BEDROCK_REGION || process.env.AWS_REGION || '')
        .trim() || 'ap-south-1',
    bedrockAccessKeyId: String(process.env.AWS_ACCESS_KEY_ID || '').trim(),
    bedrockSecretAccessKey: String(process.env.AWS_SECRET_ACCESS_KEY || '').trim(),
    bedrockSessionToken: String(process.env.AWS_SESSION_TOKEN || '').trim(),
    bedrockApiKey:
      String(process.env.AWS_BEARER_TOKEN_BEDROCK || process.env.AWS_BEDROCK_API_KEY || '').trim(),
    bedrockModelId:
      String(process.env.AWS_BEDROCK_MODEL_ID || DEFAULT_BEDROCK_MODEL).trim() || DEFAULT_BEDROCK_MODEL,
  };
}

function resolveProviderOrder(config) {
  const providers = [
    {
      key: 'bedrock',
      model: config.bedrockModelId,
      configured: isBedrockConfigured(config),
    },
    {
      key: 'openai',
      model: config.openAiModel,
      configured: isUsableSecret(config.openAiApiKey),
    },
    {
      key: 'gemini',
      model: config.geminiModel,
      configured: isUsableSecret(config.geminiApiKey),
    },
  ];

  if (config.preference && config.preference !== 'auto') {
    if (config.preference === 'fallback') {
      return [];
    }
    return providers.filter((provider) => provider.key === config.preference && provider.configured);
  }

  return providers.filter((provider) => provider.configured);
}

function isBedrockConfigured(config) {
  const hasApiKey = isUsableSecret(config.bedrockApiKey);
  const hasSignedCredentials =
    isUsableSecret(config.bedrockAccessKeyId) && isUsableSecret(config.bedrockSecretAccessKey);
  return Boolean((hasApiKey || hasSignedCredentials) && config.bedrockRegion && config.bedrockModelId);
}

function isUsableSecret(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }
  return !/^(your_|replace_|change_this|xxx|test_|dummy|example)/i.test(text);
}

async function requestProviderText(provider, options) {
  if (provider.key === 'bedrock') {
    return requestBedrockText(options);
  }
  if (provider.key === 'openai') {
    return requestOpenAiText(options);
  }
  if (provider.key === 'gemini') {
    return requestGeminiText(options);
  }
  throw new Error(`Unsupported AI provider: ${provider.key}`);
}

async function requestOpenAiText({ systemPrompt, userPrompt, config, maxTokens }) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: config.openAiModel,
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`OpenAI request failed (${response.status}): ${details}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }
  throw new Error('OpenAI response did not include text content.');
}

async function requestGeminiText({ systemPrompt, userPrompt, config, maxTokens }) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      config.geminiModel
    )}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`Gemini request failed (${response.status}): ${details}`);
  }

  const payload = await response.json();
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const text = parts
      .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
      .join(' ')
      .trim();
    if (text) {
      return text;
    }
  }
  throw new Error('Gemini response did not include text content.');
}

async function requestBedrockText({ systemPrompt, userPrompt, config, maxTokens }) {
  if (isUsableSecret(config.bedrockApiKey)) {
    return requestBedrockBearerText({ systemPrompt, userPrompt, config, maxTokens });
  }

  return requestBedrockSignedConverseText({ systemPrompt, userPrompt, config, maxTokens });
}

async function requestBedrockSignedConverseText({ systemPrompt, userPrompt, config, maxTokens }) {
  const body = JSON.stringify({
    system: [{ text: systemPrompt }],
    messages: [
      {
        role: 'user',
        content: [{ text: userPrompt }],
      },
    ],
    inferenceConfig: {
      temperature: 0.2,
      maxTokens,
    },
  });

  const endpoint = `https://bedrock-runtime.${config.bedrockRegion}.amazonaws.com/model/${encodeURIComponent(
    config.bedrockModelId
  )}/converse`;
  const headers = signAwsRequest({
    method: 'POST',
    url: endpoint,
    region: config.bedrockRegion,
    service: 'bedrock',
    accessKeyId: config.bedrockAccessKeyId,
    secretAccessKey: config.bedrockSecretAccessKey,
    sessionToken: config.bedrockSessionToken,
    body,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`Bedrock signed request failed (${response.status}): ${details}`);
  }

  const payload = await response.json();
  const content = payload?.output?.message?.content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
      .join(' ')
      .trim();
    if (text) {
      return text;
    }
  }
  throw new Error('Bedrock signed response did not include text content.');
}

async function requestBedrockBearerText({ systemPrompt, userPrompt, config, maxTokens }) {
  const endpoint = `https://bedrock-runtime.${config.bedrockRegion}.amazonaws.com/model/${encodeURIComponent(
    config.bedrockModelId
  )}/converse`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.bedrockApiKey}`,
    },
    body: JSON.stringify({
      system: [{ text: systemPrompt }],
      messages: [
        {
          role: 'user',
          content: [{ text: userPrompt }],
        },
      ],
      inferenceConfig: {
        temperature: 0.2,
        maxTokens,
      },
    }),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`Bedrock API key request failed (${response.status}): ${details}`);
  }

  const payload = await response.json();
  const content = payload?.output?.message?.content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
      .join(' ')
      .trim();
    if (text) {
      return text;
    }
  }
  throw new Error('Bedrock API key response did not include text content.');
}

function signAwsRequest({
  method,
  url,
  region,
  service,
  accessKeyId,
  secretAccessKey,
  sessionToken,
  body,
  headers,
}) {
  const parsedUrl = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const signingHeaders = {
    ...lowercaseHeaders(headers),
    host: parsedUrl.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  if (sessionToken) {
    signingHeaders['x-amz-security-token'] = sessionToken;
  }

  const sortedHeaderKeys = Object.keys(signingHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((key) => `${key}:${String(signingHeaders[key]).trim()}\n`)
    .join('');
  const signedHeaders = sortedHeaderKeys.join(';');
  const canonicalRequest = [
    method.toUpperCase(),
    parsedUrl.pathname,
    canonicalQueryString(parsedUrl.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign, 'hex');

  return {
    ...signingHeaders,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function lowercaseHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), value])
  );
}

function canonicalQueryString(searchParams) {
  return Array.from(searchParams.entries())
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue.localeCompare(rightValue);
      }
      return leftKey.localeCompare(rightKey);
    })
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function getSignatureKey(secretAccessKey, dateStamp, regionName, serviceName) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, 'aws4_request');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseJsonObjectFromText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('AI provider returned an empty response.');
  }

  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(unfenced);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fall through to object extraction.
  }

  const candidate = extractFirstJsonObject(unfenced);
  if (!candidate) {
    throw new Error('AI provider response was not valid JSON.');
  }
  const parsed = JSON.parse(candidate);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI provider JSON response must be an object.');
  }
  return parsed;
}

function extractFirstJsonObject(text) {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return '';
}

function buildFallbackProviderResult(fallback, warnings) {
  return {
    provider: 'fallback',
    model: 'rule-based',
    configured: true,
    result: fallback,
    warnings: warnings.map((warning) => warning.slice(0, 500)),
  };
}

import { apiRequest } from './http';

export type AiChatRole = 'user' | 'assistant';

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface AiChatResponse {
  answer: string;
  source: string;
  model: string;
  language: string;
}

export async function askRealtyAi(input: {
  message?: string;
  messages?: AiChatMessage[];
  language?: string;
}): Promise<AiChatResponse> {
  return apiRequest<AiChatResponse>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: input.message,
      messages: input.messages || [],
      language: input.language || '',
    }),
  });
}


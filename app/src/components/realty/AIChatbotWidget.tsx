import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { askRealtyAi, type AiChatMessage } from '@/lib/aiChatbotApi';

type ChatEntry = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  createdAt: number;
};

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback below.
    }
  }
  return `ai-chat-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function toApiMessages(entries: ChatEntry[]): AiChatMessage[] {
  return entries
    .filter((entry) => entry.role === 'assistant' || entry.role === 'user')
    .slice(-12)
    .map((entry) => ({
      role: entry.role,
      content: entry.text,
    }));
}

const FLOATING_BUTTON_SIZE = 56;
const FLOATING_BUTTON_MARGIN = 8;

export default function AIChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [input, setInput] = useState('');
  const [buttonPosition, setButtonPosition] = useState(() => {
    if (typeof window === 'undefined') {
      return { x: FLOATING_BUTTON_MARGIN, y: FLOATING_BUTTON_MARGIN };
    }
    return {
      x: Math.max(FLOATING_BUTTON_MARGIN, window.innerWidth - FLOATING_BUTTON_SIZE - FLOATING_BUTTON_MARGIN),
      y: Math.max(FLOATING_BUTTON_MARGIN, window.innerHeight - FLOATING_BUTTON_SIZE - FLOATING_BUTTON_MARGIN),
    };
  });
  const [entries, setEntries] = useState<ChatEntry[]>([
    {
      id: createId(),
      role: 'assistant',
      text:
        'Hi, I am ZDT Realty AI Assistant. Ask me anything about buy, rent, sell, pricing, legal checklist, or investment in your language.',
      createdAt: Date.now(),
    },
  ]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const dragMovedRef = useRef(false);
  const language = useMemo(() => {
    if (typeof navigator === 'undefined') return 'en';
    return navigator.language || 'en';
  }, []);

  const clampButtonPosition = useCallback((nextX: number, nextY: number) => {
    if (typeof window === 'undefined') {
      return { x: nextX, y: nextY };
    }
    const maxX = Math.max(FLOATING_BUTTON_MARGIN, window.innerWidth - FLOATING_BUTTON_SIZE - FLOATING_BUTTON_MARGIN);
    const maxY = Math.max(FLOATING_BUTTON_MARGIN, window.innerHeight - FLOATING_BUTTON_SIZE - FLOATING_BUTTON_MARGIN);
    return {
      x: Math.min(Math.max(nextX, FLOATING_BUTTON_MARGIN), maxX),
      y: Math.min(Math.max(nextY, FLOATING_BUTTON_MARGIN), maxY),
    };
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [entries, isOpen]);

  useEffect(() => {
    const handleResize = () => {
      setButtonPosition((previous) => clampButtonPosition(previous.x, previous.y));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampButtonPosition]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) return;

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      if (!dragMovedRef.current && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
        dragMovedRef.current = true;
      }

      setButtonPosition(clampButtonPosition(dragState.originX + deltaX, dragState.originY + deltaY));
    };

    const clearDrag = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      dragStateRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', clearDrag);
    window.addEventListener('pointercancel', clearDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', clearDrag);
      window.removeEventListener('pointercancel', clearDrag);
    };
  }, [clampButtonPosition]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const userEntry: ChatEntry = {
      id: createId(),
      role: 'user',
      text,
      createdAt: Date.now(),
    };
    const nextEntries = [...entries, userEntry];

    setEntries(nextEntries);
    setInput('');
    setIsSending(true);

    try {
      const response = await askRealtyAi({
        messages: toApiMessages(nextEntries),
        language,
      });

      const assistantEntry: ChatEntry = {
        id: createId(),
        role: 'assistant',
        text: response.answer?.trim() || 'I could not generate an answer right now.',
        createdAt: Date.now(),
      };
      setEntries((prev) => [...prev, assistantEntry]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to connect with AI assistant.';
      setEntries((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          text: message,
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      {!isOpen ? (
        <div className="fixed z-[60]" style={{ left: `${buttonPosition.x}px`, top: `${buttonPosition.y}px` }}>
          <Button
            type="button"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              dragStateRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                originX: buttonPosition.x,
                originY: buttonPosition.y,
              };
              dragMovedRef.current = false;
              setIsDragging(true);
            }}
            onClick={(event) => {
              if (dragMovedRef.current) {
                dragMovedRef.current = false;
                event.preventDefault();
                return;
              }
              setIsOpen(true);
            }}
            className="h-14 w-14 rounded-full bg-blue-700 p-0 text-white shadow-xl hover:bg-blue-800"
            style={{ touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <MessageCircle className="h-5 w-5" />
            <span className="sr-only">Open AI Realty Chat</span>
          </Button>
        </div>
      ) : (
        <div className="fixed bottom-4 right-4 z-[60] sm:bottom-6 sm:right-6">
          <div className="w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
                  <Bot className="h-4 w-4 text-blue-700" />
                  ZDT AI Assistant
                </p>
                <p className="text-xs text-slate-500">
                  <Sparkles className="mr-1 inline h-3 w-3" />
                  Ask in any language
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-slate-300 p-1 text-slate-600 transition hover:bg-slate-100"
                aria-label="Close AI chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={listRef} className="max-h-[360px] min-h-[300px] space-y-3 overflow-y-auto px-3 py-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    entry.role === 'user'
                      ? 'ml-auto bg-blue-700 text-white'
                      : 'mr-auto border border-slate-200 bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{entry.text}</div>
                </div>
              ))}
              {isSending ? (
                <div className="mr-auto inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </div>
              ) : null}
            </div>

            <div className="border-t border-slate-200 p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder="Ask about real estate..."
                  rows={2}
                  className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-300 focus:ring"
                />
                <Button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={isSending || !input.trim()}
                  className="h-11 rounded-xl bg-blue-700 px-3 text-white hover:bg-blue-800"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

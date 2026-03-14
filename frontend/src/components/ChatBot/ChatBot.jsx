import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const BOT_NAME = 'GSTR Assist';
const API_BASE = 'http://localhost:5000/api';

const QUICK_QUESTIONS = [
  'What is ITC?',
  'What is GSTR-1?',
  'What is GSTR-3B?',
  'What is an e-Way Bill?',
  'How is fraud risk scored?',
  'How to detect fake invoices?',
  'What is circular trading?',
  'How does reconciliation work?',
];

function normalizeMessageText(text = '') {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function InlineFormattedText({ text }) {
  const chunks = text.split(/(\*\*[^*]+\*\*)/g);
  return chunks.map((chunk, idx) => {
    if (/^\*\*[^*]+\*\*$/.test(chunk)) {
      return <strong key={`${chunk}-${idx}`}>{chunk.slice(2, -2)}</strong>;
    }
    return <span key={`${chunk}-${idx}`}>{chunk}</span>;
  });
}

function MessageText({ text }) {
  const normalized = normalizeMessageText(text);
  const lines = normalized.split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (/^(?:[-*•]\s+|\d+\.\s+)/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const items = [];
      while (index < lines.length && /^(?:[-*•]\s+|\d+\.\s+)/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^(?:[-*•]\s+|\d+\.\s+)/, ''));
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (!current || /^(?:[-*•]\s+|\d+\.\s+)/.test(current)) break;
      paragraph.push(current);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  if (!blocks.length) return null;

  return (
    <div className="space-y-2">
      {blocks.map((block, blockIndex) => {
        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={`list-${blockIndex}`}
              className={`${block.ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`item-${blockIndex}-${itemIndex}`}>
                  <InlineFormattedText text={item} />
                </li>
              ))}
            </ListTag>
          );
        }

        return (
          <p key={`p-${blockIndex}`}>
            <InlineFormattedText text={block.text} />
          </p>
        );
      })}
    </div>
  );
}

async function fetchGeminiReply(message, history) {
  const { data } = await axios.post(`${API_BASE}/chat`, { message, history });
  return data.reply;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      from: 'bot',
      text: "Hi, I am GSTR Assist. Ask me anything about GST, fraud detection, ITC, e-Way Bills, or how this system works.",
    },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing, open]);

  async function sendMessage(text) {
    const userText = (text ?? input).trim();
    if (!userText) return;
    setInput('');

    const userMsg = { id: Date.now(), from: 'user', text: userText };
    setMessages((prev) => [...prev, userMsg]);
    sendToGemini(userText);
  }

  async function sendToGemini(userText) {
    setTyping(true);
    try {
      const reply = await fetchGeminiReply(userText, messages.slice(1));
      setTyping(false);
      const botMsg = { id: Date.now() + 1, from: 'bot', text: reply };
      setMessages((prev) => [...prev, botMsg]);
      if (!open) setUnread((n) => n + 1);
    } catch (err) {
      setTyping(false);
      const errMsg = {
        id: Date.now() + 1,
        from: 'bot',
        text: "Sorry, I couldn't connect to the AI service right now. Please make sure the backend server is running and try again.",
      };
      setMessages((prev) => [...prev, errMsg]);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg flex items-center justify-center hover:scale-110 transition-transform duration-200 focus:outline-none"
        title="GSTR Assist — Chat with us"
        aria-label="Open chat"
      >
        {open ? (
          /* Close X */
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          /* Chat bubble icon */
          <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4a2 2 0 00-2 2v13a2 2 0 002 2h3l3 3 3-3h5a2 2 0 002-2V4a2 2 0 00-2-2z" />
            <path fill="white" fillOpacity={0.3} d="M7 9h10M7 13h6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}

        {/* Unread badge */}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
            {unread}
          </span>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200"
          style={{ height: '480px', background: '#ffffff', animation: 'chatSlideUp 0.22s ease-out both' }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2a5 5 0 015 5 5 5 0 01-5 5 5 5 0 01-5-5 5 5 0 015-5m0 12c5.33 0 8 2.67 8 4v2H4v-2c0-1.33 2.67-4 8-4z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-tight">{BOT_NAME}</p>
              <p className="text-blue-100 text-xs">GST Fraud Detection Assistant</p>
            </div>
            <span className="flex items-center gap-1 text-blue-100 text-xs">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              Online
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ background: '#F8FAFC' }}>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.from === 'bot' && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2a5 5 0 015 5 5 5 0 01-5 5 5 5 0 01-5-5 5 5 0 015-5m0 12c5.33 0 8 2.67 8 4v2H4v-2c0-1.33 2.67-4 8-4z" />
                    </svg>
                  </div>
                )}
                <div
                  className={`max-w-[78%] px-3 py-2 rounded-2xl text-[13px] sm:text-sm leading-6 break-words shadow-sm ${
                    msg.from === 'user'
                      ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-br-sm'
                      : 'bg-white text-slate-700 rounded-bl-sm border border-gray-100'
                  }`}
                >
                  <MessageText text={msg.text} />
                </div>
              </div>
            ))}

            {typing && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2a5 5 0 015 5 5 5 0 01-5 5 5 5 0 01-5-5 5 5 0 015-5m0 12c5.33 0 8 2.67 8 4v2H4v-2c0-1.33 2.67-4 8-4z" />
                  </svg>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm shadow-sm">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick questions */}
          <div className="px-3 py-2 flex gap-2 overflow-x-auto border-t border-gray-100" style={{ background: '#F8FAFC' }}>
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors whitespace-nowrap"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-gray-100 flex items-end gap-2 bg-white">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask a GST question…"
              className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              style={{ maxHeight: '80px', lineHeight: '1.4' }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity flex-shrink-0"
              aria-label="Send"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}

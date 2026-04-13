/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, Loader2, Terminal } from 'lucide-react';
import { clsx } from 'clsx';

interface Message {
  id?: string;
  role: 'user' | 'model' | 'system';
  content: string;
  createdAt?: string;
  isStreaming?: boolean;
}

interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  altNames?: string[];
}

interface SlashCommandsResponse {
  commands: SlashCommand[];
}

interface SlashCommandMessage {
  command: string;
  status: 'success' | 'error';
  message: string;
  action?: 'clear';
}

interface ConfirmationRequest {
  correlationId: string;
  toolCall: {
    name: string;
    args: unknown;
  };
  serverName?: string;
}

interface Metadata {
  workspace: string;
  branch: string;
  geminiMdCount: number;
  skillsCount: number;
  mcpServersCount: number;
  policy: string;
  policyLabel: string;
  approvalMode: string;
  allowAll: boolean;
  model: string;
  sandbox: string;
}

interface HealthResponse {
  authRequired?: boolean;
}

interface SessionResponse {
  sessionId: string;
  session?: SessionState;
}

interface SessionState {
  sessionId: string;
  messages: Message[];
}

interface SessionStateResponse {
  session: SessionState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isMetadata(value: unknown): value is Metadata {
  return (
    isRecord(value) &&
    isString(value['workspace']) &&
    isString(value['branch']) &&
    isNumber(value['geminiMdCount']) &&
    isNumber(value['skillsCount']) &&
    isNumber(value['mcpServersCount']) &&
    isString(value['policy']) &&
    isString(value['policyLabel']) &&
    isString(value['approvalMode']) &&
    isBoolean(value['allowAll']) &&
    isString(value['model']) &&
    isString(value['sandbox'])
  );
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return isRecord(value) && isBoolean(value['authRequired']);
}

function isSessionResponse(value: unknown): value is SessionResponse {
  return (
    isRecord(value) &&
    isString(value['sessionId']) &&
    (value['session'] === undefined || isSessionState(value['session']))
  );
}

function isSessionState(value: unknown): value is SessionState {
  return (
    isRecord(value) &&
    isString(value['sessionId']) &&
    Array.isArray(value['messages']) &&
    value['messages'].every(isMessage)
  );
}

function isSessionStateResponse(value: unknown): value is SessionStateResponse {
  return isRecord(value) && isSessionState(value['session']);
}

function isMessage(value: unknown): value is Message {
  return (
    isRecord(value) &&
    (value['id'] === undefined || isString(value['id'])) &&
    (value['role'] === 'user' ||
      value['role'] === 'model' ||
      value['role'] === 'system') &&
    isString(value['content']) &&
    (value['createdAt'] === undefined || isString(value['createdAt'])) &&
    (value['isStreaming'] === undefined || isBoolean(value['isStreaming']))
  );
}

function isSlashCommand(value: unknown): value is SlashCommand {
  return (
    isRecord(value) &&
    isString(value['name']) &&
    isString(value['description']) &&
    isString(value['usage']) &&
    (value['altNames'] === undefined ||
      (Array.isArray(value['altNames']) && value['altNames'].every(isString)))
  );
}

function isSlashCommandsResponse(
  value: unknown,
): value is SlashCommandsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value['commands']) &&
    value['commands'].every(isSlashCommand)
  );
}

function isSlashCommandMessage(value: unknown): value is SlashCommandMessage {
  return (
    isRecord(value) &&
    isString(value['command']) &&
    (value['status'] === 'success' || value['status'] === 'error') &&
    isString(value['message']) &&
    (value['action'] === undefined || value['action'] === 'clear')
  );
}

function isConfirmationRequest(value: unknown): value is ConfirmationRequest {
  return (
    isRecord(value) &&
    isString(value['correlationId']) &&
    isRecord(value['toolCall']) &&
    isString(value['toolCall']['name'])
  );
}

export function App() {
  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem('gemini-web-token') ?? '',
  );
  const [preferredSessionId, setPreferredSessionId] = useState(
    () => localStorage.getItem('gemini-web-session-id') ?? '',
  );
  const [pendingToken, setPendingToken] = useState(authToken);
  const [authRequired, setAuthRequired] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(
    null,
  );
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const ws = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const authHeaders = useCallback(
    (): Record<string, string> =>
      authToken ? { Authorization: `Bearer ${authToken}` } : {},
    [authToken],
  );

  const handleUnauthorized = useCallback(() => {
    setAuthRequired(true);
    setConnectionError('Enter the web token from the Gemini host.');
    setIsLoading(false);
  }, []);

  const fetchMetadata = useCallback(async () => {
    try {
      const res = await fetch('/api/metadata', { headers: authHeaders() });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const data: unknown = await res.json();
      if (!isMetadata(data)) {
        throw new Error('Metadata response was not valid.');
      }
      setMetadata(data);
    } catch (err) {
      setConnectionError(
        err instanceof Error ? err.message : 'Failed to fetch metadata.',
      );
    }
  }, [authHeaders, handleUnauthorized]);

  const fetchSlashCommands = useCallback(async () => {
    try {
      const res = await fetch('/api/slash-commands', {
        headers: authHeaders(),
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const data: unknown = await res.json();
      if (!isSlashCommandsResponse(data)) {
        throw new Error('Slash command response was not valid.');
      }
      setSlashCommands(data.commands);
    } catch (err) {
      setConnectionError(
        err instanceof Error ? err.message : 'Failed to fetch slash commands.',
      );
    }
  }, [authHeaders, handleUnauthorized]);

  const loadSession = useCallback(
    async (nextSessionId: string): Promise<boolean> => {
      const res = await fetch(
        `/api/sessions/${encodeURIComponent(nextSessionId)}`,
        {
          headers: authHeaders(),
        },
      );
      if (res.status === 401) {
        handleUnauthorized();
        return true;
      }
      if (res.status === 404) {
        return false;
      }
      if (!res.ok) {
        throw new Error('Failed to load session.');
      }

      const data: unknown = await res.json();
      if (!isSessionStateResponse(data)) {
        throw new Error('Session state response was not valid.');
      }

      setMessages(data.session.messages);
      setSessionId(data.session.sessionId);
      setPreferredSessionId(data.session.sessionId);
      localStorage.setItem('gemini-web-session-id', data.session.sessionId);
      return true;
    },
    [authHeaders, handleUnauthorized],
  );

  const startSession = useCallback(
    async (retries = 10) => {
      try {
        const health = await fetch('/api/health');
        if (health.ok) {
          const healthData: unknown = await health.json();
          if (isHealthResponse(healthData)) {
            setAuthRequired(healthData.authRequired ?? false);
          }
        }

        if (preferredSessionId) {
          const didLoad = await loadSession(preferredSessionId);
          if (didLoad) {
            setConnectionError(null);
            void fetchMetadata();
            void fetchSlashCommands();
            return;
          }
        }

        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: authHeaders(),
        });
        if (res.status === 401) {
          handleUnauthorized();
          return;
        }
        if (!res.ok) throw new Error('Failed to start session');
        const data: unknown = await res.json();
        if (!isSessionResponse(data)) {
          throw new Error('Session response was not valid.');
        }
        setConnectionError(null);
        setSessionId(data.sessionId);
        setPreferredSessionId(data.sessionId);
        localStorage.setItem('gemini-web-session-id', data.sessionId);
        if (data.session) {
          setMessages(data.session.messages);
        }
        void fetchMetadata();
        void fetchSlashCommands();
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => {
            void startSession(retries - 1);
          }, 1000);
        } else {
          setConnectionError(
            err instanceof Error ? err.message : 'Failed to start session.',
          );
        }
      }
    },
    [
      authHeaders,
      fetchMetadata,
      fetchSlashCommands,
      handleUnauthorized,
      loadSession,
      preferredSessionId,
    ],
  );

  const toggleYOLO = useCallback(async () => {
    if (!metadata) return;
    try {
      const res = await fetch('/api/policy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({ allowAll: !metadata.allowAll }),
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (res.ok) {
        void fetchMetadata();
      }
    } catch (err) {
      setConnectionError(
        err instanceof Error ? err.message : 'Failed to toggle policy.',
      );
    }
  }, [authHeaders, fetchMetadata, handleUnauthorized, metadata]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        void toggleYOLO();
      } else if (e.key === 'Escape') {
        setInput('');
        setConfirmation(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleYOLO]);

  useEffect(() => {
    if (!sessionId) {
      void startSession();
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const tokenQuery = authToken
      ? `?token=${encodeURIComponent(authToken)}`
      : '';
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/ws/${sessionId}${tokenQuery}`,
    );
    ws.current = socket;

    socket.onopen = () => {
      setConnectionError(null);
    };

    socket.onmessage = (event) => {
      const msg: unknown = JSON.parse(String(event.data));

      if (!isRecord(msg) || !isString(msg['type'])) {
        return;
      }

      if (msg['type'] === 'session_state' && isSessionState(msg['payload'])) {
        setMessages(msg['payload'].messages);
      } else if (
        msg['type'] === 'slash_command' &&
        isSlashCommandMessage(msg['payload'])
      ) {
        if (msg['payload'].action === 'clear') {
          setMessages([]);
        }
        if (msg['payload'].command === 'yolo') {
          void fetchMetadata();
        }
      } else if (msg['type'] === 'gemini_event' && isRecord(msg['payload'])) {
        const payload = msg['payload'];
        if (payload['type'] === 'content' && isString(payload['value'])) {
          const content = payload['value'];
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'model' && last.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + content },
              ];
            } else {
              return [
                ...prev,
                {
                  role: 'model',
                  content,
                  isStreaming: true,
                },
              ];
            }
          });
        }
      } else if (msg['type'] === 'stream_end') {
        setMessages((prev) => prev.map((m) => ({ ...m, isStreaming: false })));
        setIsLoading(false);
      } else if (
        msg['type'] === 'confirmation_request' &&
        isConfirmationRequest(msg['payload'])
      ) {
        setConfirmation(msg['payload']);
      } else if (msg['type'] === 'error' && isString(msg['error'])) {
        setMessages((prev) => [
          ...prev,
          { role: 'model', content: `Error: ${msg['error']}` },
        ]);
        setIsLoading(false);
      }
    };

    socket.onclose = () => {
      if (ws.current === socket) {
        ws.current = null;
        setConnectionError('Connection closed. Reconnecting...');
        setTimeout(() => {
          setSessionId(null);
        }, 1000);
      }
    };

    return () => {
      if (ws.current === socket) {
        ws.current = null;
      }
      socket.close();
    };
  }, [sessionId, authToken, startSession, fetchMetadata]);

  const saveToken = () => {
    localStorage.setItem('gemini-web-token', pendingToken);
    setAuthToken(pendingToken);
    setSessionId(null);
    setConnectionError(null);
  };

  const clearToken = () => {
    localStorage.removeItem('gemini-web-token');
    localStorage.removeItem('gemini-web-session-id');
    setAuthToken('');
    setPendingToken('');
    setSessionId(null);
    setPreferredSessionId('');
  };

  const sendMessage = () => {
    if (!input.trim() || !ws.current) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    ws.current.send(JSON.stringify({ type: 'chat', text: input }));
    setInput('');
    setIsLoading(true);
  };

  const respondToConfirmation = (confirmed: boolean) => {
    if (!confirmation || !ws.current) return;
    ws.current.send(
      JSON.stringify({
        type: 'confirmation_response',
        correlationId: confirmation.correlationId,
        confirmed,
      }),
    );
    setConfirmation(null);
  };

  const trimmedInput = input.trim();
  const isSlashInput = trimmedInput === '?' || trimmedInput.startsWith('/');
  const slashQuery = trimmedInput === '?' ? 'help' : trimmedInput.slice(1);
  const visibleSlashCommands = isSlashInput
    ? slashCommands
        .filter(
          (command) =>
            command.name.startsWith(slashQuery) ||
            command.usage.startsWith(`/${slashQuery}`) ||
            (command.altNames ?? []).some((name) => name.startsWith(slashQuery)),
        )
        .slice(0, 6)
    : [];

  if (authRequired && !authToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c0c0c] px-4 text-slate-300">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveToken();
          }}
          className="w-full max-w-sm space-y-3"
        >
          <div>
            <h1 className="text-sm font-bold uppercase tracking-wide text-slate-100">
              Gemini Web Token
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Enter the token from the machine running Gemini.
            </p>
          </div>
          <input
            type="password"
            value={pendingToken}
            onChange={(e) => setPendingToken(e.target.value)}
            className="w-full rounded bg-[#161616] px-3 py-2 text-sm font-mono text-slate-100 outline-none ring-1 ring-white/10 focus:ring-blue-400"
            autoFocus
          />
          {connectionError && (
            <p className="text-xs text-amber-400">{connectionError}</p>
          )}
          <button
            type="submit"
            disabled={!pendingToken.trim()}
            className="w-full rounded bg-blue-600 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-40"
          >
            Connect
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0c0c0c] text-slate-300 font-sans">
      {/* Top Status Bar */}
      <div className="flex justify-end px-4 py-1 text-[10px] text-slate-500 font-mono border-b border-white/5">
        ? for shortcuts
      </div>

      {/* Info Line */}
      <div className="flex justify-between items-center px-4 py-2 text-xs font-mono">
        <div
          className={clsx(
            'flex items-center gap-2',
            metadata?.allowAll ? 'text-pink-500' : 'text-emerald-500',
          )}
        >
          <span className="font-bold">{metadata?.policyLabel ?? 'Safe'}</span>
          <span className="opacity-70 text-[10px]">Ctrl+Y</span>
        </div>
        <div className="flex items-center gap-4 text-slate-500 text-[10px]">
          <span>{metadata?.geminiMdCount ?? 0} GEMINI.md files</span>
          <span className="opacity-30">•</span>
          <span>{metadata?.mcpServersCount ?? 0} MCP servers</span>
          <span className="opacity-30">•</span>
          <span>{metadata?.skillsCount ?? 0} skills</span>
        </div>
      </div>

      {/* Main Chat Area */}
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-4 scrollbar-hide"
      >
        {messages.length === 0 && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center opacity-20 pointer-events-none">
            <Bot size={64} className="mb-4" />
            <p className="text-sm font-mono tracking-widest uppercase">
              Gemini CLI Web
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={m.id ?? i}
            className={clsx(
              'flex gap-3 max-w-[95%]',
              m.role === 'user' ? 'ml-auto flex-row-reverse' : '',
              m.role === 'system' ? 'max-w-full' : '',
            )}
          >
            <div
              className={clsx(
                'w-6 h-6 rounded flex items-center justify-center shrink-0 mt-1',
                m.role === 'user'
                  ? 'bg-blue-900/50 text-blue-400'
                  : '',
                m.role === 'model' ? 'bg-slate-800 text-slate-400' : '',
                m.role === 'system'
                  ? 'bg-emerald-900/30 text-emerald-400'
                  : '',
              )}
            >
              {m.role === 'user' ? (
                <User size={14} />
              ) : m.role === 'system' ? (
                <Terminal size={14} />
              ) : (
                <Bot size={14} />
              )}
            </div>
            <div
              className={clsx(
                'px-3 py-1.5 rounded-lg text-[13px] leading-relaxed',
                m.role === 'user'
                  ? 'bg-blue-900/20 text-blue-100'
                  : '',
                m.role === 'model' ? 'bg-[#161616] text-slate-200' : '',
                m.role === 'system'
                  ? 'bg-emerald-950/20 text-emerald-100 border border-emerald-500/10'
                  : '',
              )}
            >
              <ReactMarkdown className="prose prose-invert prose-xs max-w-none prose-p:my-1 prose-pre:bg-black/50 prose-code:text-pink-400">
                {m.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {isLoading && !messages[messages.length - 1]?.isStreaming && (
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center animate-pulse">
              <Loader2 className="animate-spin text-slate-500" size={12} />
            </div>
          </div>
        )}
      </main>

      {/* Tool Confirmation Overlay (matches screenshot style) */}
      {confirmation && (
        <div className="mx-4 mb-4 bg-[#1a1a1a] border border-amber-500/30 rounded-lg p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-amber-500/10 rounded">
              <Terminal className="text-amber-500" size={16} />
            </div>
            <div className="flex-1">
              <h3 className="text-[11px] font-bold text-amber-500 uppercase tracking-tighter">
                Confirmation Required
              </h3>
              <p className="text-xs text-slate-300 mt-0.5 font-mono">
                Run{' '}
                <span className="text-amber-200 font-bold">
                  {confirmation.toolCall.name}
                </span>
                ?
              </p>
              <pre className="text-[10px] mt-2 bg-black/40 p-2 rounded font-mono text-slate-400 border border-white/5">
                {JSON.stringify(confirmation.toolCall.args, null, 2)}
              </pre>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => respondToConfirmation(false)}
              className="px-3 py-1 rounded text-[10px] font-bold uppercase tracking-tight bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Deny
            </button>
            <button
              onClick={() => respondToConfirmation(true)}
              className="px-3 py-1 rounded text-[10px] font-bold uppercase tracking-tight bg-amber-600 hover:bg-amber-500 transition-colors text-white shadow-lg shadow-amber-900/20"
            >
              Allow
            </button>
          </div>
        </div>
      )}

      {/* Input Area (matches screenshot style) */}
      <div className="px-4 pb-2">
        {visibleSlashCommands.length > 0 && (
          <div className="mb-2 rounded border border-white/10 bg-[#111111] font-mono text-xs shadow-xl">
            {visibleSlashCommands.map((command) => (
              <button
                key={command.name}
                type="button"
                onClick={() => {
                  setInput(`${command.usage} `);
                  inputRef.current?.focus();
                }}
                className="grid w-full grid-cols-[120px_1fr] gap-3 px-3 py-2 text-left hover:bg-white/5"
              >
                <span className="text-emerald-300">{command.usage}</span>
                <span className="text-slate-400">{command.description}</span>
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-center gap-3 bg-[#161616] rounded-lg px-3 py-2 border border-white/5 focus-within:border-white/10 transition-colors shadow-inner"
        >
          <span className="text-pink-500 font-bold select-none">*</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message or @path/to/file"
            className="flex-1 bg-transparent border-none text-[13px] font-mono focus:outline-none placeholder:text-slate-600"
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="text-slate-500 hover:text-blue-400 disabled:opacity-20 transition-colors"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Send size={16} />
            )}
          </button>
        </form>
      </div>

      {/* Footer (matches screenshot style) */}
      <footer className="grid grid-cols-4 gap-4 px-4 py-3 bg-[#080808] border-t border-white/5 text-[10px] font-mono uppercase tracking-tight text-slate-500">
        <div>
          <div className="opacity-50 mb-0.5">workspace (/directory)</div>
          <div className="text-slate-300 truncate" title={metadata?.workspace}>
            {metadata?.workspace ?? '...'}
          </div>
        </div>
        <div>
          <div className="opacity-50 mb-0.5">branch</div>
          <div className="text-slate-300 truncate">
            {metadata?.branch ?? '...'}
          </div>
        </div>
        <div>
          <div className="opacity-50 mb-0.5">sandbox</div>
          <div
            className={clsx(
              metadata?.sandbox === 'no sandbox'
                ? 'text-pink-500/70'
                : 'text-blue-400',
            )}
          >
            {metadata?.sandbox ?? '...'}
          </div>
        </div>
        <div className="text-right">
          <div className="opacity-50 mb-0.5">auth</div>
          <button
            type="button"
            onClick={clearToken}
            className="text-slate-300 hover:text-blue-400"
          >
            {authRequired ? 'token' : 'local'}
          </button>
        </div>
      </footer>
    </div>
  );
}

/**
 * AI Deployment Assistant
 *
 * Requirement #9 from the technical assessment:
 * - Explain deployment failures
 * - Suggest fixes
 * - Detect missing environment variables
 * - Review README quality
 * - Recommend deployment improvements
 */
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import {
  Bot,
  ChevronDown,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  useDeleteOpenaiConversation,
  useListOpenaiMessages,
  getListOpenaiConversationsQueryKey,
  getListOpenaiMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE_API = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface StreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const STARTER_PROMPTS = [
  "My deployment failed at the Build Project stage — what could cause this?",
  "What environment variables does a Next.js app typically need?",
  "How can I improve the reliability of my deployment pipeline?",
  "Explain what happens during the Health Check stage.",
  "My Docker build is failing — what should I check first?",
];

export function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [selectedConvoId, setSelectedConvoId] = useState<number | null>(null);
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  // Always call hooks (rules of hooks), control refetch via staleTime when closed
  const convos = useListOpenaiConversations({
    query: { enabled: open, queryKey: getListOpenaiConversationsQueryKey() },
  });
  const createConvo = useCreateOpenaiConversation();
  const deleteConvo = useDeleteOpenaiConversation();
  const storedMessages = useListOpenaiMessages(selectedConvoId ?? 0, {
    query: {
      enabled: !!selectedConvoId,
      queryKey: getListOpenaiMessagesQueryKey(selectedConvoId ?? 0),
    },
  });

  // Sync stored messages into local state when switching conversations
  useEffect(() => {
    if (storedMessages.data && !isStreaming) {
      setMessages(
        storedMessages.data.map((m) => ({
          id: String(m.id),
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      );
    }
  }, [storedMessages.data, isStreaming]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && selectedConvoId) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, selectedConvoId]);

  async function startNewConversation(firstMessage?: string) {
    const title = firstMessage
      ? firstMessage.slice(0, 60) + (firstMessage.length > 60 ? "…" : "")
      : "New conversation";
    const convo = await createConvo.mutateAsync({ data: { title } });
    setSelectedConvoId(convo.id);
    setMessages([]);
    qc.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
    if (firstMessage) {
      setTimeout(() => sendMessage(convo.id, firstMessage), 50);
    }
  }

  async function sendMessage(convoId: number, text: string) {
    if (!text.trim() || isStreaming) return;
    setInput("");
    setIsStreaming(true);

    const userMsg: StreamMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text.trim(),
    };
    const assistantMsg: StreamMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const res = await fetch(
        `${BASE_API}/api/openai/conversations/${convoId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text.trim() }),
          credentials: "include",
        },
      );

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: m.content + parsed.content }
                    : m,
                ),
              );
            }
            if (parsed.done) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, streaming: false } : m,
                ),
              );
            }
          } catch {
            // Ignore malformed SSE frames and continue reading the stream.
            continue;
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                content: "⚠️ Something went wrong. Please try again.",
                streaming: false,
              }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
      qc.invalidateQueries({
        queryKey: getListOpenaiMessagesQueryKey(convoId),
      });
    }
  }

  function handleSend() {
    if (!input.trim()) return;
    if (!selectedConvoId) {
      startNewConversation(input.trim());
    } else {
      sendMessage(selectedConvoId, input.trim());
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleDeleteConvo(id: number) {
    await deleteConvo.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
    if (selectedConvoId === id) {
      setSelectedConvoId(null);
      setMessages([]);
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[0_6px_0_hsl(34_74%_42%)] hover:brightness-105 active:translate-y-1 active:shadow-[0_3px_0_hsl(34_74%_42%)] transition-all"
        data-testid="button-ai-assistant"
        aria-label="Open AI Deployment Assistant"
      >
        <Sparkles size={17} />
        <span className="hidden sm:inline">AI Assistant</span>
      </button>

      {/* Panel backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-over panel */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[480px] flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        data-testid="panel-ai-assistant"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_3px_0_hsl(34_74%_42%)]">
              <Bot size={18} />
            </div>
            <div>
              <h2 className="font-extrabold tracking-tight">DeployX AI</h2>
              <p className="text-[11px] text-muted-foreground">
                Deployment Assistant
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => startNewConversation()}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              data-testid="button-new-conversation"
            >
              <Plus size={13} className="inline mr-1" />
              New
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"
              data-testid="button-close-assistant"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Conversation list or chat */}
        {!selectedConvoId ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Welcome */}
            <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles size={28} />
              </div>
              <div>
                <h3 className="font-extrabold text-lg tracking-tight">
                  How can I help?
                </h3>
                <p className="mt-1 text-sm text-muted-foreground max-w-xs">
                  I can explain deployment failures, suggest fixes, detect
                  missing env vars, and recommend improvements.
                </p>
              </div>
            </div>

            {/* Starter prompts */}
            <div className="px-4 space-y-2">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Try asking…
              </p>
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => startNewConversation(prompt)}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Past conversations */}
            {convos.data && convos.data.length > 0 && (
              <div className="mt-6 px-4 pb-4">
                <p className="px-1 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Recent conversations
                </p>
                <div className="space-y-1">
                  {convos.data.slice(0, 8).map((c) => (
                    <div
                      key={c.id}
                      className="group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted cursor-pointer"
                      onClick={() => {
                        setSelectedConvoId(c.id);
                        setMessages([]);
                      }}
                    >
                      <Bot
                        size={14}
                        className="shrink-0 text-muted-foreground"
                      />
                      <span className="flex-1 truncate text-sm">{c.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConvo(c.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 rounded p-1 text-muted-foreground hover:text-destructive transition-all"
                        data-testid={`button-delete-conversation-${c.id}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Conversation header */}
            <button
              onClick={() => {
                setSelectedConvoId(null);
                setMessages([]);
              }}
              className="flex items-center gap-2 border-b border-border px-5 py-2.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
              data-testid="button-back-to-conversations"
            >
              <ChevronDown size={14} className="rotate-90" />
              All conversations
            </button>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {storedMessages.isLoading && messages.length === 0 && (
                <div className="flex justify-center py-12">
                  <Loader2
                    className="animate-spin text-muted-foreground"
                    size={22}
                  />
                </div>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary mt-0.5">
                      <Bot size={14} />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-card border border-border rounded-tl-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent">
                        <MarkdownContent
                          content={msg.content}
                          streaming={msg.streaming}
                        />
                      </div>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-border px-4 py-4">
              <div className="flex gap-2 items-end rounded-xl border border-border bg-card px-4 py-3 focus-within:border-primary/50 transition-colors">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about deployments, env vars, failures…"
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground max-h-32 leading-relaxed"
                  data-testid="input-ai-message"
                  style={{ height: "auto", minHeight: "24px" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming}
                  className="shrink-0 grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:brightness-105 transition-all"
                  data-testid="button-send-ai-message"
                >
                  {isStreaming ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Send size={15} />
                  )}
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                Shift+Enter for new line · Enter to send
              </p>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

/** Simple markdown renderer — handles bold, inline code, code blocks, and bullet lists */
function MarkdownContent({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  if (!content && streaming) {
    return (
      <span className="inline-block h-4 w-2 animate-pulse rounded bg-primary/40" />
    );
  }

  // Split into code blocks and regular text
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const lines = part.split("\n");
          const code = lines.slice(1, -1).join("\n");
          return (
            <pre key={i} className="my-3 overflow-x-auto">
              <code>{code}</code>
            </pre>
          );
        }
        // Inline formatting: **bold**, `code`, bullet lists
        const lines = part.split("\n");
        return (
          <span key={i}>
            {lines.map((line, j) => {
              const isLast = j === lines.length - 1;
              const trimmed = line.trim();
              const isBullet =
                trimmed.startsWith("- ") || trimmed.startsWith("• ");
              const text = isBullet ? trimmed.slice(2) : line;
              const formatted = text
                .split(/(\*\*.*?\*\*|`[^`]+`)/g)
                .map((seg, k) => {
                  if (seg.startsWith("**") && seg.endsWith("**")) {
                    return <strong key={k}>{seg.slice(2, -2)}</strong>;
                  }
                  if (seg.startsWith("`") && seg.endsWith("`")) {
                    return <code key={k}>{seg.slice(1, -1)}</code>;
                  }
                  return seg;
                });
              return (
                <span key={j}>
                  {isBullet ? (
                    <span className="block my-0.5">• {formatted}</span>
                  ) : (
                    formatted
                  )}
                  {!isLast && !isBullet && <br />}
                </span>
              );
            })}
          </span>
        );
      })}
      {streaming && (
        <span className="inline-block h-3.5 w-1.5 ml-0.5 animate-pulse rounded bg-foreground/40 align-middle" />
      )}
    </>
  );
}

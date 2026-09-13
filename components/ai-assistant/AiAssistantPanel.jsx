"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Copy, RotateCcw, Send, Trash2, User } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { initialState, processMessage } from "../../lib/ai-assistant/engine";
import { answerQuery } from "../../lib/ai-assistant/queryEngine";

const GREETING_TEXT = "Hi! Ask me anything about your LMS, or tell me what you'd like to create or update.";

function Bubble({ role, text, onCopy }) {
  const mine = role === "user";
  return (
    <div className={`group flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
      {!mine && (
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-linear-to-br from-primary to-primary-hover text-white">
          <Bot className="h-3.5 w-3.5" />
        </span>
      )}
      <div className="max-w-[82%]">
        <div className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${mine ? "rounded-br-md bg-linear-to-br from-primary to-primary-hover text-white" : "rounded-bl-md border border-border-subtle bg-card text-ink"}`}>
          {text}
        </div>
        {!mine && onCopy && (
          <button type="button" onClick={onCopy} className="mt-1 flex items-center gap-1 text-[9px] font-semibold text-subtle opacity-0 transition hover:text-primary group-hover:opacity-100" aria-label="Copy response">
            <Copy className="h-2.5 w-2.5" /> Copy
          </button>
        )}
      </div>
      {mine && (
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-page text-muted">
          <User className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}

export default function AiAssistantPanel() {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState([{ role: "assistant", text: GREETING_TEXT }]);
  const [engineState, setEngineState] = useState(() => initialState());
  const [queryMemory, setQueryMemory] = useState({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastUserText, setLastUserText] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const context = { role: profile?.role || "", uid: user?.uid || "", name: profile?.displayName || user?.displayName || user?.email || "" };

  async function runTurn(trimmed) {
    // Read-only questions are answered directly (and never disturb an
    // in-progress create/update flow) as long as no action collection is
    // currently mid-flight — once a flow has started, its own field
    // answers take priority so e.g. replying "Active" to a pending Status
    // question is never misread as the unrelated "active students?" query.
    if (engineState.stage === "IDLE") {
      const result = await answerQuery(trimmed, context, queryMemory);
      if (result) {
        setQueryMemory(result.memory || {});
        return result.reply;
      }
    }
    const { state, reply } = await processMessage(engineState, trimmed, context);
    setEngineState(state);
    return reply;
  }

  async function send(text) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || busy) return;
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    setLastUserText(trimmed);
    setInput("");
    setBusy(true);
    try {
      const reply = await runTurn(trimmed);
      setMessages((current) => [...current, { role: "assistant", text: reply }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: `❌ Something went wrong: ${error.message || "Please try again."}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!lastUserText || busy) return;
    setBusy(true);
    try {
      const reply = await runTurn(lastUserText);
      setMessages((current) => [...current, { role: "assistant", text: reply }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: `❌ Something went wrong: ${error.message || "Please try again."}` }]);
    } finally {
      setBusy(false);
    }
  }

  function clearConversation() {
    setMessages([{ role: "assistant", text: GREETING_TEXT }]);
    setEngineState(initialState());
    setQueryMemory({});
    setLastUserText("");
  }

  function copyText(text) {
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle bg-page/60 px-2 py-1.5">
        <span className="text-[9px] text-subtle">{messages.length - 1} message{messages.length - 1 === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={regenerate} disabled={!lastUserText || busy} title="Regenerate last response" aria-label="Regenerate" className="rounded-full p-1.5 text-subtle transition hover:bg-active hover:text-primary disabled:opacity-30">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={clearConversation} title="Clear conversation" aria-label="Clear conversation" className="rounded-full p-1.5 text-subtle transition hover:bg-active hover:text-primary">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto bg-page/40 p-3">
        {messages.map((message, index) => (
          <Bubble key={index} role={message.role} text={message.text} onCopy={message.role === "assistant" ? () => copyText(message.text) : null} />
        ))}
        {busy && <Bubble role="assistant" text="…" />}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-border-subtle bg-card p-2.5">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about your LMS..."
          disabled={busy}
          className="flex-1 rounded-full border-none bg-page px-4 py-2.5 text-xs outline-none ring-1 ring-transparent transition focus:bg-card focus:ring-2 focus:ring-primary"
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-primary to-primary-hover text-white shadow-sm transition-transform hover:scale-110 active:scale-90 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "How much did I spend on food this month?",
  "Am I on track with my budget?",
  "How are my savings goals doing?",
  "Who owes me money?",
  "What should I do with extra money this month?",
];

export default function CoachPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim() }),
      });
      const data = await res.json();
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.reply || data.error || "Something went wrong.",
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "assistant", content: "Couldn't reach Numo. Try again?" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-2rem)] animate-fade-in">
      <h1 className="text-xl font-semibold mb-4">AI Coach</h1>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-accent-green/10 flex items-center justify-center mx-auto">
              <Bot className="w-8 h-8 text-accent-green" />
            </div>
            <div>
              <p className="text-lg font-medium">Hey! I&apos;m Numo.</p>
              <p className="text-sm text-muted mt-1">
                Your friendly money coach. Ask me anything about your finances.
              </p>
            </div>
            <div className="space-y-2 max-w-sm mx-auto">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="block w-full text-left px-4 py-2.5 bg-white/[0.04] border border-white/[0.06] rounded-xl text-sm text-muted hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-2.5 max-w-[85%]",
              msg.role === "user" ? "ml-auto flex-row-reverse" : ""
            )}
          >
            <div className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
              msg.role === "user" ? "bg-accent-blue/20" : "bg-accent-green/20"
            )}>
              {msg.role === "user"
                ? <User className="w-3.5 h-3.5 text-accent-blue" />
                : <Bot className="w-3.5 h-3.5 text-accent-green" />}
            </div>
            <div className={cn(
              "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
              msg.role === "user"
                ? "bg-accent-blue/15 text-white rounded-br-md"
                : "bg-white/[0.06] text-white/90 rounded-bl-md"
            )}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-accent-green/20 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-accent-green" />
            </div>
            <div className="px-4 py-3 bg-white/[0.06] rounded-2xl rounded-bl-md">
              <Loader2 className="w-4 h-4 animate-spin text-muted" />
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 pt-2 border-t border-white/[0.06]">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Numo anything..."
          className="flex-1 px-4 py-3 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-white/30 outline-none focus:border-accent-green/40"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="w-11 h-11 rounded-xl bg-accent-green text-obsidian flex items-center justify-center disabled:opacity-40 hover:bg-accent-green/90 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

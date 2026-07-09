import { useEffect, useRef, useState } from "react";
import { Headset, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSupportChat } from "@/hooks/useSupportChat";

const SUGGESTIONS = ["How do I cancel my subscription?", "Reset my password", "What do the tiers include?"];

/**
 * In-app support chat (AOS-CS-006). Mobile-first, accessible, with a clear
 * "Talk to a human" affordance. Available to all tiers.
 */
export default function SupportChat() {
  const { messages, loading, ticketId, send, talkToHuman } = useSupportChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
    setInput("");
  }

  return (
    <Card className="mx-auto flex h-[70vh] max-h-[640px] w-full max-w-2xl flex-col">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" /> Support assistant
        </CardTitle>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto p-4"
          role="log"
          aria-live="polite"
          aria-label="Support conversation"
        >
          {messages.length === 0 && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">Ask me anything about your account, events, or the app.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" className="min-h-[44px]" onClick={() => send(s)} disabled={loading}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.sources && m.sources.length > 0 && (
                  <p className="mt-1 text-xs opacity-70">Sources: {m.sources.join("; ")}</p>
                )}
                {m.escalated && (
                  <p className="mt-1 text-xs font-medium text-amber-600">Connected to our support team.</p>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-muted px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-label="Assistant is typing" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-3">
          {ticketId && (
            <p className="mb-2 text-center text-xs text-muted-foreground">
              A support ticket has been created — we'll follow up with you.
            </p>
          )}
          <form onSubmit={onSubmit} className="flex items-center gap-2">
            <label htmlFor="support-input" className="sr-only">Your message</label>
            <Input
              id="support-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question…"
              disabled={loading}
              autoComplete="off"
            />
            <Button type="submit" size="icon" className="min-h-[44px] min-w-[44px] shrink-0" disabled={loading || !input.trim()} aria-label="Send message">
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full min-h-[44px] text-muted-foreground"
            onClick={talkToHuman}
            disabled={loading}
          >
            <Headset className="mr-2 h-4 w-4" aria-hidden="true" /> Talk to a human
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

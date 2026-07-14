import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  escalated?: boolean;
}

interface ChatResponse {
  reply?: string;
  sources?: string[];
  escalated?: boolean;
  ticketId?: string | null;
  error?: string;
}

/**
 * In-app support chat wired to the CS first-responder (AOS-CS-006). Grounded KB
 * answers; unresolved chats or a human request escalate to a ticket.
 */
export function useSupportChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);

  const call = useCallback(async (history: ChatMessage[], talkToHuman = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("support/support-chat", {
        body: { messages: history.map((m) => ({ role: m.role, content: m.content })), talkToHuman },
      });
      if (error) throw error;
      const res = data as ChatResponse;
      if (res.error) throw new Error(res.error);
      if (res.ticketId) setTicketId(res.ticketId);
      const assistant: ChatMessage = {
        role: "assistant",
        content: res.reply ?? "Sorry, I couldn't respond just now.",
        sources: res.sources,
        escalated: res.escalated,
      };
      setMessages((prev) => [...prev, assistant]);
    } catch (e) {
      handleError(e, { component: "useSupportChat", action: "call" });
      setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Please try again or use the contact form." }]);
    } finally {
      setLoading(false);
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const next = [...messages, userMsg];
      setMessages(next);
      await call(next);
    },
    [messages, loading, call],
  );

  const talkToHuman = useCallback(async () => {
    if (loading) return;
    await call(messages, true);
  }, [messages, loading, call]);

  return { messages, loading, ticketId, send, talkToHuman };
}

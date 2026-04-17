import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_ACTIONS = [
  "Explain this simply",
  "Give me examples",
  "Summarize again",
  "Quiz me on this",
];

export const ChatTab = ({ lectureId, lectureTitle }: { lectureId: string; lectureTitle: string }) => {
  const { user, session } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("chat_messages").select("role,content").eq("lecture_id", lectureId).order("created_at");
      if (data) setMessages(data.map((d) => ({ role: d.role as any, content: d.content })));
    };
    load();
  }, [lectureId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || streaming || !user || !session) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    // Persist user message
    await supabase.from("chat_messages").insert({ lecture_id: lectureId, user_id: user.id, role: "user", content: userMsg.content });

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-with-lecture`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ lectureId, messages: newMessages }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) throw new Error("Rate limited — try again in a moment.");
        if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
        throw new Error("Chat failed");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const j = line.slice(6).trim();
          if (j === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(j);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) upsertAssistant(delta);
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      if (assistantSoFar) {
        await supabase.from("chat_messages").insert({ lecture_id: lectureId, user_id: user.id, role: "assistant", content: assistantSoFar });
      }
    } catch (e: any) {
      toast({ title: "Chat error", description: e?.message ?? "Try again", variant: "destructive" });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <Card className="flex h-[70vh] flex-col rounded-3xl border-border/50 shadow-card">
      <div className="flex items-center gap-2 border-b border-border/50 px-5 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-ai text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <div className="font-display font-bold leading-none">Study buddy</div>
          <div className="text-xs text-muted-foreground">Knows "{lectureTitle}" cold</div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-5 py-4" ref={scrollRef as any}>
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ai-soft">
              <Sparkles className="h-6 w-6 text-ai" />
            </div>
            <h3 className="font-display text-lg font-bold">Ask me anything!</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">I've read the whole lecture and I'm ready to help you understand it.</p>
          </div>
        )}
        <div className="space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}>
                <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-strong:text-foreground prose-ul:my-1">
                  <ReactMarkdown>{m.content || "..."}</ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t border-border/50 p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a}
              onClick={() => send(a)}
              disabled={streaming}
              className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
            >
              {a}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex gap-2"
        >
          <Input
            value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about the lecture..."
            disabled={streaming}
            className="h-11 rounded-full"
          />
          <Button type="submit" size="icon" disabled={streaming || !input.trim()} className="h-11 w-11 shrink-0 rounded-full">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
};

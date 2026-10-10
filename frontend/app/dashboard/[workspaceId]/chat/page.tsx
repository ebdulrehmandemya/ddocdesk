"use client";
import { useState, useRef, useEffect, use } from "react";
import { apiFetch } from "@/lib/api";

interface Message { 
  id: string; 
  role: string; 
  content: string; 
  citations?: { document_id: string; chunk_index: number; text: string; file_name: string }[]; 
}

export default function ChatPage({ params }: { params: any }) {
  const { workspaceId } = typeof params.then === 'function' ? use(params) : params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const data = await apiFetch<Message>(`/workspaces/${workspaceId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: input, conversation_id: convId }),
      });
      setMessages(prev => [...prev, data]);
      setConvId(data.conversation_id);
    } catch (e) { 
      console.error(e);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "Error communicating with AI." }]);
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-4rem)] flex flex-col">
      <h1 className="text-2xl font-bold mb-4">AI Document Assistant</h1>
      
      <div className="flex-1 overflow-y-auto bg-white border rounded-xl p-6 mb-4 space-y-6 shadow-inner">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-slate-400">
            <p>Ask a question about your uploaded documents...</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${
              m.role === 'user' 
                ? 'bg-blue-600 text-white rounded-br-none' 
                : 'bg-slate-100 text-slate-800 rounded-bl-none'
            }`}>
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              
              {m.citations && m.citations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-300/50">
                  <p className="text-xs font-bold mb-2 text-slate-500 uppercase tracking-wide">Sources:</p>
                  <div className="space-y-2">
                    {m.citations.map((c, i) => (
                      <details key={i} className="text-sm bg-white/50 rounded-lg border border-slate-200 overflow-hidden">
                        <summary className="cursor-pointer p-2 font-medium text-blue-700 hover:bg-blue-50 transition flex justify-between items-center">
                          <span>📄 {c.file_name} <span className="text-xs text-slate-500">(Chunk {c.chunk_index})</span></span>
                          <span className="text-xs">▼</span>
                        </summary>
                        <p className="p-3 bg-slate-50 text-slate-600 text-xs italic border-t border-slate-200 leading-relaxed">{c.text}</p>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 p-4 rounded-2xl rounded-bl-none text-slate-500 flex gap-1">
              <span className="animate-bounce">●</span>
              <span className="animate-bounce" style={{animationDelay: '0.2s'}}>●</span>
              <span className="animate-bounce" style={{animationDelay: '0.4s'}}>●</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSend} className="flex gap-2">
        <input 
          type="text" value={input} onChange={e => setInput(e.target.value)}
          placeholder="Type your question..." 
          className="flex-1 p-4 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
          disabled={loading}
        />
        <button type="submit" disabled={loading} className="px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium shadow-sm transition">
          Send
        </button>
      </form>
    </div>
  );
}

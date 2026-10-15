"use client";
import { useState, useRef, useEffect, use } from "react";
import { apiFetch } from "@/lib/api";

interface Citation {
  document_id: string;
  chunk_index: number;
  text: string;
  file_name: string;
}

interface Message { 
  id: string; 
  role: string; 
  content: string; 
  conversation_id: string;
  citations?: Citation[]; 
}

interface PageProps {
  params: { workspaceId: string } | Promise<{ workspaceId: string }>;
}

export default function ChatPage({ params }: PageProps) {
  const { workspaceId } = "then" in params ? use(params) : params;
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Context Filter State
  const [availableDocs, setAvailableDocs] = useState<{id: string, file_name: string, status: string}[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [showSelector, setShowSelector] = useState(false);

  // NEW: Active Citation State
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let isActive = true;
    async function loadDocs() {
      try {
        const docs = await apiFetch<{id: string, file_name: string, status: string}[]>(`/workspaces/${workspaceId}/documents`);
        if (isActive) setAvailableDocs(docs.filter(d => d.status === "ready"));
      } catch (e) { console.error(e); }
    }
    loadDocs();
    return () => { isActive = false; };
  }, [workspaceId]);

  const toggleDoc = (id: string) => {
    setSelectedDocIds(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: input, conversation_id: "" };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const data = await apiFetch<Message>(`/workspaces/${workspaceId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          query: input, 
          conversation_id: convId,
          document_ids: selectedDocIds.length > 0 ? selectedDocIds : undefined
        }),
      });
      setMessages(prev => [...prev, data]);
      setConvId(data.conversation_id);
    } catch (e) { 
      console.error(e);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "Error communicating with AI.", conversation_id: "" }]);
    } finally { 
      setLoading(false); 
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here in the future
  };

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">AI Document Assistant</h1>
        {activeCitation && (
          <button 
            onClick={() => setActiveCitation(null)}
            className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Close Source Panel
          </button>
        )}
      </div>
      
      <div className="flex-1 flex gap-4 min-h-0">
        {/* LEFT SIDE: Chat Area */}
        <div className={`flex flex-col transition-all duration-300 ease-in-out ${activeCitation ? 'w-3/5' : 'w-full'}`}>
          <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-4 space-y-6 shadow-inner">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
                <p>Ask a question about your uploaded documents...</p>
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${
                  m.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-br-none' 
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none'
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  
                  {/* NEW: Clickable Citation Pills */}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-300/50 dark:border-slate-600/50">
                      <p className="text-xs font-bold mb-2 text-slate-500 dark:text-slate-400 uppercase tracking-wide">Sources:</p>
                      <div className="flex flex-wrap gap-2">
                        {m.citations.map((c, i) => (
                          <button
                            key={i}
                            onClick={() => setActiveCitation(c)}
                            className={`text-xs px-2.5 py-1.5 rounded-md border transition-all flex items-center gap-1.5 ${
                              activeCitation?.text === c.text
                                ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300 shadow-sm'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                            }`}
                          >
                            <span>📄</span>
                            <span className="font-medium truncate max-w-[120px]">{c.file_name}</span>
                            <span className="text-slate-400 dark:text-slate-500">#{c.chunk_index}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl rounded-bl-none text-slate-500 flex gap-1">
                  <span className="animate-bounce">●</span>
                  <span className="animate-bounce" style={{animationDelay: '0.2s'}}>●</span>
                  <span className="animate-bounce" style={{animationDelay: '0.4s'}}>●</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Context Filter Panel */}
          <div className="mb-2">
            <button 
              onClick={() => setShowSelector(!showSelector)}
              className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <span>📚</span>
              <span>
                {selectedDocIds.length === 0 
                  ? "Context: All Documents" 
                  : `Context: ${selectedDocIds.length} Document${selectedDocIds.length > 1 ? 's' : ''} selected`}
              </span>
              <svg className={`w-4 h-4 transition-transform ${showSelector ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showSelector && (
              <div className="mt-2 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg max-h-32 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {availableDocs.map(doc => (
                    <label key={doc.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                      <input 
                        type="checkbox" 
                        checked={selectedDocIds.includes(doc.id)}
                        onChange={() => toggleDoc(doc.id)}
                        className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{doc.file_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSend} className="flex gap-2">
            <input 
              type="text" value={input} onChange={e => setInput(e.target.value)}
              placeholder={selectedDocIds.length > 0 ? "Ask about selected documents..." : "Type your question..."} 
              className="flex-1 p-4 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400"
              disabled={loading}
            />
            <button type="submit" disabled={loading} className="px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium shadow-sm transition">
              Send
            </button>
          </form>
        </div>

        {/* RIGHT SIDE: Source Citation Panel */}
        {activeCitation && (
          <div className="w-2/5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg flex flex-col overflow-hidden animate-in slide-in-from-right-5 duration-300">
            {/* Panel Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl">
                  {activeCitation.file_name.endsWith(".pdf") ? "📕" : activeCitation.file_name.endsWith(".docx") ? "📘" : "📄"}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-white truncate text-sm">{activeCitation.file_name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Chunk #{activeCitation.chunk_index}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => copyToClipboard(activeCitation.text)}
                  className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  title="Copy text"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button 
                  onClick={() => setActiveCitation(null)}
                  className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-slate dark:prose-invert max-w-none">
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap text-sm">
                  {activeCitation.text}
                </p>
              </div>
            </div>
            
            {/* Panel Footer */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-center">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Source ID: <span className="font-mono">{activeCitation.document_id.slice(0, 8)}...</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

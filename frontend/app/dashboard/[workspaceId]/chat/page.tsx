"use client";
import { useState, useRef, useEffect, use } from "react";
import { apiFetch } from "@/lib/api";

interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  citations?: {
    document_id: string;
    chunk_index: number;
    text: string;
    file_name: string;
  }[];
}

interface ChatDocument {
  id: string;
  file_name: string;
  mime_type: string;
}

interface PageProps {
  params: { workspaceId: string } | Promise<{ workspaceId: string }>;
}

function FileIcon({ fileName }: { fileName: string }) {
  if (fileName.endsWith(".pdf")) return <span>📕</span>;
  if (fileName.endsWith(".docx")) return <span>📘</span>;
  return <span>📄</span>;
}

export default function ChatPage({ params }: PageProps) {
  const { workspaceId } = "then" in params ? use(params) : params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Document selection state
  const [allDocs, setAllDocs] = useState<ChatDocument[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [showDocPicker, setShowDocPicker] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch eligible documents on mount
  useEffect(() => {
    let isMounted = true;
    async function loadDocs() {
      try {
        const data = await apiFetch<ChatDocument[]>(`/workspaces/${workspaceId}/chat/documents`);
        if (isMounted) setAllDocs(data);
      } catch (e) {
        console.error(e);
      }
    }
    loadDocs();
    return () => { isMounted = false; };
  }, [workspaceId]);

  const toggleDoc = (docId: string) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedDocIds(new Set());
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: convId || "",
      role: "user",
      content: input,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        query: input,
        conversation_id: convId,
      };

      // Only include document_ids if user selected specific docs
      if (selectedDocIds.size > 0) {
        body.document_ids = Array.from(selectedDocIds);
      }

      const data = await apiFetch<Message>(`/workspaces/${workspaceId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setMessages(prev => [...prev, data]);
      setConvId(data.conversation_id);
    } catch (e) {
      console.error(e);
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          conversation_id: convId || "",
          role: "assistant",
          content: "Error communicating with the AI. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const selectedDocNames = allDocs
    .filter(d => selectedDocIds.has(d.id))
    .map(d => d.file_name);

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          AI Document Assistant
        </h1>

        {/* Document scope toggle */}
        <div className="relative">
          <button
            onClick={() => setShowDocPicker(!showDocPicker)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${
              selectedDocIds.size > 0
                ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {selectedDocIds.size > 0
              ? `${selectedDocIds.size} document${selectedDocIds.size > 1 ? "s" : ""} selected`
              : "All documents"}
            <span className="text-xs">▼</span>
          </button>

          {/* Dropdown picker */}
          {showDocPicker && (
            <div className="absolute right-0 top-12 z-20 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  Scope AI to specific documents
                </span>
                <button
                  onClick={() => setShowDocPicker(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1 mb-3">
                {allDocs.length === 0 && (
                  <p className="text-sm text-slate-400 py-4 text-center">
                    No processed documents yet.
                  </p>
                )}
                {allDocs.map(doc => (
                  <label
                    key={doc.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocIds.has(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                    />
                    <FileIcon fileName={doc.file_name} />
                    <span className="text-sm text-slate-700 dark:text-slate-300 truncate">
                      {doc.file_name}
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                <button
                  onClick={clearSelection}
                  className="flex-1 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Use all documents
                </button>
                <button
                  onClick={() => setShowDocPicker(false)}
                  className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active scope indicator */}
      {selectedDocIds.size > 0 && (
        <div className="mb-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
            AI scoped to:
          </span>
          {selectedDocNames.map((name, i) => (
            <span
              key={i}
              className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 text-xs rounded-full font-medium"
            >
              {name}
            </span>
          ))}
          <button
            onClick={clearSelection}
            className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-4 space-y-6 shadow-inner">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-4">
            <div className="text-5xl">🤖</div>
            <p className="text-center max-w-sm">
              Ask a question about your uploaded documents.
              {selectedDocIds.size > 0
                ? ` Currently scoped to ${selectedDocIds.size} document${selectedDocIds.size > 1 ? "s" : ""}.`
                : " Searching all documents in this workspace."}
            </p>
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${
                m.role === "user"
                  ? "bg-blue-600 text-white rounded-br-none"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>

              {m.citations && m.citations.length > 0 && (
                <div className={`mt-3 pt-3 border-t ${m.role === "user" ? "border-blue-400/50" : "border-slate-300/50 dark:border-slate-600/50"}`}>
                  <p className={`text-xs font-bold mb-2 uppercase tracking-wide ${m.role === "user" ? "text-blue-200" : "text-slate-500 dark:text-slate-400"}`}>
                    Sources:
                  </p>
                  <div className="space-y-2">
                    {m.citations.map((c, i) => (
                      <details
                        key={i}
                        className="text-sm bg-white/50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
                      >
                        <summary className="cursor-pointer p-2 font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 transition flex justify-between items-center">
                          <span className="flex items-center gap-1.5">
                            <FileIcon fileName={c.file_name} />
                            {c.file_name}
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              (Chunk {c.chunk_index})
                            </span>
                          </span>
                          <span className="text-xs">▼</span>
                        </summary>
                        <p className="p-3 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-xs italic border-t border-slate-200 dark:border-slate-700 leading-relaxed">
                          {c.text}
                        </p>
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
            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl rounded-bl-none text-slate-500 dark:text-slate-400 flex gap-1">
              <span className="animate-bounce">●</span>
              <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>●</span>
              <span className="animate-bounce" style={{ animationDelay: "0.4s" }}>●</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={
            selectedDocIds.size > 0
              ? `Ask about ${selectedDocIds.size} selected document${selectedDocIds.size > 1 ? "s" : ""}...`
              : "Ask about all documents..."
          }
          className="flex-1 p-4 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm transition"
        >
          Send
        </button>
      </form>
    </div>
  );
}

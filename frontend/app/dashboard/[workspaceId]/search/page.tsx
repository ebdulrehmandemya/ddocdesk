"use client";
import { useState, use } from "react";
import { apiFetch } from "@/lib/api";

interface SearchResult { document_id: string; chunk_text: string; score: number; }

export default function SearchPage({ params }: { params: any }) {
  const { workspaceId } = typeof params.then === 'function' ? use(params) : params;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await apiFetch<SearchResult[]>(`/workspaces/${workspaceId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 5 }),
      });
      setResults(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white">Semantic Search</h1>
      <form onSubmit={handleSearch} className="flex gap-2 mb-8">
        <input 
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Ask a question or search keywords..." 
          className="flex-1 p-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400"
        />
        <button type="submit" disabled={loading} className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium shadow-sm">
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      <div className="space-y-4">
        {results.map((r, i) => (
          <div key={i} className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm hover:shadow-md transition">
            <div className="flex justify-between items-center mb-3 border-b border-slate-200 dark:border-slate-700 pb-2">
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">Doc ID: {r.document_id.slice(0,8)}...</span>
              <span className="text-xs font-bold px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">Score: {r.score.toFixed(3)}</span>
            </div>
            <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{r.chunk_text}</p>
          </div>
        ))}
        {results.length === 0 && !loading && query && (
          <p className="text-center text-slate-500 dark:text-slate-400 py-8">No matching document chunks found.</p>
        )}
      </div>
    </div>
  );
}

"use client";
import { useState, use } from "react";
import { apiFetch } from "@/lib/api";

interface SearchResult { 
  document_id: string; 
  file_name: string;
  chunk_text: string; 
  chunk_index: number;
  score: number;
  match_source: "semantic" | "keyword" | "both";
}

interface PageProps {
  params: { workspaceId: string } | Promise<{ workspaceId: string }>;
}

// Match source badge component
function MatchSourceBadge({ source }: { source: string }) {
  const config = {
    both: { label: "Hybrid Match", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
    semantic: { label: "Semantic", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
    keyword: { label: "Keyword", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  };
  
  const { label, color } = config[source as keyof typeof config] || config.semantic;
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {label}
    </span>
  );
}

// File icon based on extension
function FileIcon({ fileName }: { fileName: string }) {
  if (fileName.endsWith(".pdf")) return <span className="text-xl">📕</span>;
  if (fileName.endsWith(".docx")) return <span className="text-xl">📘</span>;
  return <span className="text-xl">📄</span>;
}

export default function SearchPage({ params }: PageProps) {
  const { workspaceId } = "then" in params ? use(params) : params;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const data = await apiFetch<SearchResult[]>(`/workspaces/${workspaceId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 8 }),
      });
      setResults(data);
    } catch (e) { 
      console.error(e); 
      setResults([]);
    } finally { 
      setLoading(false); 
    }
  };

  // Normalize score for display (RRF scores are typically 0-0.03)
  const getScorePercentage = (score: number, maxScore: number) => {
    if (maxScore === 0) return 0;
    return Math.round((score / maxScore) * 100);
  };

  const maxScore = results.length > 0 ? results[0].score : 0;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Hybrid Search</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Combines semantic understanding with exact keyword matching for the best results.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3 mb-8">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input 
            type="text" 
            value={query} 
            onChange={e => setQuery(e.target.value)}
            placeholder="Search your documents..." 
            className="w-full pl-11 pr-4 py-3 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 shadow-sm"
          />
        </div>
        <button 
          type="submit" 
          disabled={loading || !query.trim()}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm transition-colors"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Searching...
            </span>
          ) : "Search"}
        </button>
      </form>

      {/* Results */}
      <div className="space-y-4">
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-3" />
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full mb-2" />
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
              </div>
            ))}
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>{results.length} result{results.length !== 1 ? "s" : ""} found</span>
              <span>Ranked by relevance</span>
            </div>
            
            {results.map((r, i) => (
              <div key={`${r.document_id}-${r.chunk_index}`} className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all">
                {/* Header row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileIcon fileName={r.file_name} />
                    <span className="font-medium text-slate-900 dark:text-white text-sm">{r.file_name}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">Chunk {r.chunk_index}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MatchSourceBadge source={r.match_source} />
                    {i === 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Best Match
                      </span>
                    )}
                  </div>
                </div>

                {/* Score bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 mb-1">
                    <span>Relevance</span>
                    <span>{getScorePercentage(r.score, maxScore)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${getScorePercentage(r.score, maxScore)}%` }}
                    />
                  </div>
                </div>

                {/* Chunk text */}
                <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {r.chunk_text.length > 500 ? r.chunk_text.substring(0, 500) + "..." : r.chunk_text}
                </p>

                {/* Document ID (small, for reference) */}
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                    Doc ID: {r.document_id.slice(0, 8)}...
                  </span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Empty states */}
        {!loading && hasSearched && results.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No results found</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Try different keywords or check if the document has finished processing.
            </p>
          </div>
        )}

        {!loading && !hasSearched && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📚</div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Search your documents</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Ask a question or search for specific keywords. Hybrid search combines 
              semantic understanding with exact keyword matching.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {["What is this document about?", "Find all mentions of", "Summarize the key points"].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => setQuery(suggestion)}
                  className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

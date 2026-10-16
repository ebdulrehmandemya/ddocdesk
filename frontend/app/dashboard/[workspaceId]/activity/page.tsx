"use client";
import { useState, useEffect, use } from "react";
import { apiFetch } from "@/lib/api";

interface AuditEntry {
  id: string;
  action: string;
  user_id: string | null;
  user_email: string | null;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  page_size: number;
}

interface PageProps {
  params: { workspaceId: string } | Promise<{ workspaceId: string }>;
}

const CATEGORIES = [
  { key: "", label: "All" },
  { key: "document", label: "Documents" },
  { key: "member", label: "Members" },
  { key: "workspace", label: "Workspace" },
  { key: "search", label: "Search" },
  { key: "chat", label: "AI Chat" },
];

function actionBadge(action: string) {
  const prefix = action.split(".")[0];
  const styles: Record<string, string> = {
    document: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    member: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    invitation: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    workspace: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    search: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
    chat: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  };
  return styles[prefix] || "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "workspace.created": "Workspace created",
    "workspace.updated": "Workspace renamed",
    "workspace.deleted": "Workspace deleted",
    "member.added": "Member added",
    "member.role_changed": "Member role changed",
    "member.removed": "Member removed",
    "invitation.created": "Invitation sent",
    "invitation.revoked": "Invitation revoked",
    "invitation.accepted": "Invitation accepted",
    "document.uploaded": "Document uploaded",
    "document.deleted": "Document deleted",
    "document.downloaded": "Document downloaded",
    "document.moved": "Document moved",
    "search.performed": "Search performed",
    "chat.question_asked": "AI question asked",
  };
  return labels[action] || action;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ActivityPage({ params }: PageProps) {
  const { workspaceId } = "then" in params ? use(params) : params;

  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ page: String(page), page_size: "50" });
        if (category) qs.set("category", category);
        const result = await apiFetch<AuditPage>(
          `/workspaces/${workspaceId}/audit-logs?${qs.toString()}`
        );
        if (isMounted) setData(result);
      } catch (e) {
        console.error(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => { isMounted = false; };
  }, [workspaceId, category, page]);

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 1;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Activity</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          A complete audit trail of everything that happened in this workspace.
        </p>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => { setCategory(cat.key); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              category === cat.key
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Entries */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400">Loading activity…</div>
      ) : data && data.items.length === 0 ? (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          No activity recorded yet.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 text-sm">Event</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 text-sm">Actor</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 text-sm">Details</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 text-sm text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map(entry => (
                <tr
                  key={entry.id}
                  className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition"
                >
                  <td className="p-4">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${actionBadge(entry.action)}`}>
                      {actionLabel(entry.action)}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-slate-700 dark:text-slate-300">
                    {entry.user_email || <span className="text-slate-400 italic">System</span>}
                    {entry.ip_address && (
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-mono">{entry.ip_address}</div>
                    )}
                  </td>
                  <td className="p-4 text-sm">
                    {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
                      <button
                        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                        className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium"
                      >
                        {expandedId === entry.id ? "Hide details" : "View details"}
                      </button>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                    {expandedId === entry.id && entry.metadata && (
                      <pre className="mt-2 p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    )}
                  </td>
                  <td className="p-4 text-sm text-slate-500 dark:text-slate-400 text-right whitespace-nowrap">
                    <span title={new Date(entry.created_at).toLocaleString()}>
                      {timeAgo(entry.created_at)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {data && data.total > data.page_size && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/30">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Page {data.page} of {totalPages} · {data.total} events
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";
import { useState, useEffect, useRef, use } from "react";
import { apiFetch, apiDownload } from "@/lib/api";

interface Doc { id: string; file_name: string; status: string; created_at: string; }

interface PageProps {
  params: { workspaceId: string } | Promise<{ workspaceId: string }>;
}

export default function DocumentsPage({ params }: PageProps) {
  const { workspaceId } = "then" in params ? use(params) : params;
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchDocs = async () => {
      if (!isMounted) return;
      try {
        const data = await apiFetch<Doc[]>(`/workspaces/${workspaceId}/documents`);
        if (isMounted) setDocs(data);
      } catch (e) { console.error(e); }
    };

    fetchDocs();
    const interval = setInterval(fetchDocs, 3000); 
    return () => { isMounted = false; clearInterval(interval); }; 
  }, [workspaceId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await apiFetch(`/workspaces/${workspaceId}/documents`, { method: "POST", body: formData });
    } catch (err) { console.error("Upload failed", err); }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    const data = await apiFetch<Doc[]>(`/workspaces/${workspaceId}/documents`);
    setDocs(data);
  };

  const handleDelete = async (docId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"? This will permanently remove the file and its AI embeddings.`)) return;
    try {
      await apiFetch(`/workspaces/${workspaceId}/documents/${docId}`, { method: "DELETE" });
      const data = await apiFetch<Doc[]>(`/workspaces/${workspaceId}/documents`);
      setDocs(data);
    } catch (e) {
      alert("Failed to delete document.");
    }
  };

  const handleDownload = async (docId: string, fileName: string) => {
    try {
      await apiDownload(`/workspaces/${workspaceId}/documents/${docId}/download`, fileName);
    } catch (e) {
      alert("Failed to download document.");
    }
  };

  const statusColors: Record<string, string> = {
    ready: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse",
    pending: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Documents</h1>
        <label className="px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 font-medium shadow-sm transition">
          {uploading ? "Uploading..." : "+ Upload Document"}
          <input type="file" className="hidden" ref={fileInputRef} onChange={handleUpload} accept=".pdf,.docx,.txt" />
        </label>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="p-4 font-semibold text-slate-600 dark:text-slate-300">File Name</th>
              <th className="p-4 font-semibold text-slate-600 dark:text-slate-300">Status</th>
              <th className="p-4 font-semibold text-slate-600 dark:text-slate-300">Uploaded</th>
              <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition group">
                <td className="p-4 font-medium text-slate-900 dark:text-white flex items-center gap-3">
                  <span className="text-2xl">
                    {d.file_name.endsWith(".pdf") ? "📕" : d.file_name.endsWith(".docx") ? "📘" : "📄"}
                  </span>
                  {d.file_name}
                </td>
                <td className="p-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${statusColors[d.status] || "bg-slate-100"}`}>
                    {d.status}
                  </span>
                </td>
                <td className="p-4 text-slate-500 dark:text-slate-400 text-sm">
                  {new Date(d.created_at).toLocaleDateString()}
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleDownload(d.id, d.file_name)}
                      disabled={d.status !== "ready"}
                      className="p-2 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      title="Download"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                    <button 
                      onClick={() => handleDelete(d.id, d.file_name)}
                      className="p-2 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition"
                      title="Delete"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr><td colSpan={4} className="p-12 text-center text-slate-500 dark:text-slate-400">No documents yet. Upload one to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

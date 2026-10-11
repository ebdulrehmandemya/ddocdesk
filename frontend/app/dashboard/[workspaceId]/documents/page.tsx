"use client";
import { useState, useEffect, useRef, use } from "react";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";

interface Doc { id: string; file_name: string; status: string; created_at: string; }

export default function DocumentsPage({ params }: { params: any }) {
  const { workspaceId } = typeof params.then === 'function' ? use(params) : params;
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    const data = await apiFetch<Doc[]>(`/workspaces/${workspaceId}/documents`);
    setDocs(data);
  };

  useEffect(() => { 
    fetchDocs(); 
    const i = setInterval(fetchDocs, 3000); // Poll for status updates
    return () => clearInterval(i); 
  }, [workspaceId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    
    const formData = new FormData();
    formData.append("file", file);

    // Use apiFetch which routes through the proxy and attaches the token automatically!
    try {
      await apiFetch(`/workspaces/${workspaceId}/documents`, {
        method: "POST",
        body: formData,
      });
    } catch (err) {
      console.error("Upload failed", err);
    }
    
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    fetchDocs();
  };
  
  const statusColors: Record<string, string> = {
    ready: "bg-green-100 text-green-800",
    processing: "bg-blue-100 text-blue-800 animate-pulse",
    pending: "bg-slate-100 text-slate-800",
    failed: "bg-red-100 text-red-800"
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Documents</h1>
        <label className="px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 font-medium shadow-sm">
          {uploading ? "Uploading..." : "+ Upload Document"}
          <input type="file" className="hidden" ref={fileInputRef} onChange={handleUpload} accept=".pdf,.docx,.txt" />
        </label>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="p-4 font-semibold text-slate-600 dark:text-slate-300">File Name</th>
              <th className="p-4 font-semibold text-slate-600 dark:text-slate-300">Status</th>
              <th className="p-4 font-semibold text-slate-600 dark:text-slate-300">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.id} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                <td className="p-4 font-medium text-slate-900 dark:text-white">{d.file_name}</td>
                <td className="p-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${statusColors[d.status] || "bg-slate-100"}`}>
                    {d.status}
                  </span>
                </td>
                <td className="p-4 text-slate-500 dark:text-slate-400 text-sm">{new Date(d.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr><td colSpan={3} className="p-12 text-center text-slate-500 dark:text-slate-400">No documents yet. Upload one to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";
import { useState, useEffect, useRef, use } from "react";
import { apiFetch, apiDownload } from "@/lib/api";
import DocumentViewer from "@/components/document-viewer";

interface Doc {
  id: string;
  file_name: string;
  mime_type: string; // Required for the previewer
  status: string;
  created_at: string;
  folder_id: string | null;
}

interface Folder {
  id: string;
  name: string;
  document_count: number;
  created_at: string;
}

interface PageProps {
  params: { workspaceId: string } | Promise<{ workspaceId: string }>;
}

function FileIcon({ fileName }: { fileName: string }) {
  if (fileName.endsWith(".pdf")) return <span className="text-xl">📕</span>;
  if (fileName.endsWith(".docx")) return <span className="text-xl">📘</span>;
  return <span className="text-xl">📄</span>;
}

export default function DocumentsPage({ params }: PageProps) {
  const { workspaceId } = "then" in params ? use(params) : params;

  const [docs, setDocs] = useState<Doc[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Folder navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  // Move-to-folder state
  const [moveMenuDocId, setMoveMenuDocId] = useState<string | null>(null);

  // Document viewer state
  const [viewerDoc, setViewerDoc] = useState<Doc | null>(null);

  const fetchFolders = async () => {
    try {
      const data = await apiFetch<Folder[]>(`/workspaces/${workspaceId}/folders`);
      setFolders(data);
    } catch (e) { console.error(e); }
  };

  const fetchDocs = async () => {
    try {
      let url = `/workspaces/${workspaceId}/documents`;
      if (currentFolderId) {
        url += `?folder_id=${currentFolderId}`;
      } else {
        url += `?root_only=true`;
      }
      const data = await apiFetch<Doc[]>(url);
      setDocs(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    let isMounted = true;
    const loadAll = async () => {
      if (!isMounted) return;
      await Promise.all([fetchFolders(), fetchDocs()]);
    };
    loadAll();
    const interval = setInterval(loadAll, 3000);
    return () => { isMounted = false; clearInterval(interval); };
  }, [workspaceId, currentFolderId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      let url = `/workspaces/${workspaceId}/documents`;
      if (currentFolderId) {
        url += `?folder_id=${currentFolderId}`;
      }
      await apiFetch(url, { method: "POST", body: formData });
    } catch (err) { 
      console.error("Upload failed", err); 
    }
    
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await Promise.all([fetchFolders(), fetchDocs()]);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await apiFetch(`/workspaces/${workspaceId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName }),
      });
      setNewFolderName("");
      setShowNewFolder(false);
      fetchFolders();
    } catch (e) { console.error(e); }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    if (!confirm(`Delete folder "${folderName}"? Documents inside will move to root.`)) return;
    try {
      await apiFetch(`/workspaces/${workspaceId}/folders/${folderId}`, { method: "DELETE" });
      if (currentFolderId === folderId) setCurrentFolderId(null);
      fetchFolders();
      fetchDocs();
    } catch (e) { console.error(e); }
  };

  const handleMoveDoc = async (docId: string, folderId: string | null) => {
    try {
      await apiFetch(`/workspaces/${workspaceId}/documents/${docId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      });
      setMoveMenuDocId(null);
      fetchDocs();
      fetchFolders();
    } catch (e) { console.error(e); }
  };

  const handleDeleteDoc = async (docId: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}"? This will permanently remove the file and its AI embeddings.`)) return;
    try {
      await apiFetch(`/workspaces/${workspaceId}/documents/${docId}`, { method: "DELETE" });
      await Promise.all([fetchFolders(), fetchDocs()]);
    } catch (e) { alert("Failed to delete document."); }
  };

  const handleDownloadDoc = async (docId: string, fileName: string) => {
    try {
      await apiDownload(`/workspaces/${workspaceId}/documents/${docId}/download`, fileName);
    } catch (e) { alert("Failed to download document."); }
  };

  const currentFolder = folders.find(f => f.id === currentFolderId);

  const statusColors: Record<string, string> = {
    ready: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse",
    pending: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="flex gap-6 h-full">
      {/* Sidebar - Folders */}
      <aside className="w-56 shrink-0">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Folders</h2>
            <button
              onClick={() => setShowNewFolder(true)}
              className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
              title="New folder"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
          </div>

          {/* All Documents */}
          <button
            onClick={() => setCurrentFolderId(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-1 ${
              currentFolderId === null
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            📁 All Documents
          </button>

          {/* Folder list */}
          {folders.map(folder => (
            <div key={folder.id} className="flex items-center gap-1 mb-1">
              <button
                onClick={() => setCurrentFolderId(folder.id)}
                className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentFolderId === folder.id
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                📂 {folder.name}
                <span className="ml-auto text-xs text-slate-400">{folder.document_count}</span>
              </button>
              <button
                onClick={() => handleDeleteFolder(folder.id, folder.name)}
                className="p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition"
                title="Delete folder"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
            </div>
          ))}

          {/* New folder input */}
          {showNewFolder && (
            <form onSubmit={handleCreateFolder} className="mt-2">
              <input
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="w-full p-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button type="submit" className="flex-1 px-2 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Create</button>
                <button type="button" onClick={() => setShowNewFolder(false)} className="flex-1 px-2 py-1.5 text-xs text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancel</button>
              </div>
            </form>
          )}
        </div>
      </aside>

      {/* Main content - Documents */}
      <div className="flex-1">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <button onClick={() => setCurrentFolderId(null)} className="hover:text-blue-600 dark:hover:text-blue-400 transition font-medium">
              Documents
            </button>
            {currentFolder && (
              <>
                <span>/</span>
                <span className="text-slate-900 dark:text-white font-medium">{currentFolder.name}</span>
              </>
            )}
          </div>
          <label className="px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 font-medium shadow-sm transition">
            {uploading ? "Uploading..." : "+ Upload"}
            <input type="file" className="hidden" ref={fileInputRef} onChange={handleUpload} accept=".pdf,.docx,.txt" />
          </label>
        </div>

        {/* Documents table */}
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
                    <FileIcon fileName={d.file_name} />
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
                    <div className="flex justify-end gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                      
                      {/* Preview button */}
                      <button
                        onClick={() => setViewerDoc(d)}
                        disabled={d.status !== "ready"}
                        className="p-2 text-slate-500 hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-400 disabled:opacity-30 disabled:cursor-not-allowed transition"
                        title="Preview"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      </button>

                      {/* Move to folder */}
                      <div className="relative">
                        <button
                          onClick={() => setMoveMenuDocId(moveMenuDocId === d.id ? null : d.id)}
                          className="p-2 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition"
                          title="Move to folder"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                        </button>
                        {moveMenuDocId === d.id && (
                          <div className="absolute right-0 top-10 z-10 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2">
                            <button
                              onClick={() => handleMoveDoc(d.id, null)}
                              className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"
                            >
                              📁 Root (no folder)
                            </button>
                            {folders.filter(f => f.id !== d.folder_id).map(f => (
                              <button
                                key={f.id}
                                onClick={() => handleMoveDoc(d.id, f.id)}
                                className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"
                              >
                                📂 {f.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Download */}
                      <button
                        onClick={() => handleDownloadDoc(d.id, d.file_name)}
                        disabled={d.status !== "ready"}
                        className="p-2 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition"
                        title="Download"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteDoc(d.id, d.file_name)}
                        className="p-2 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition"
                        title="Delete"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-slate-500 dark:text-slate-400">
                    {currentFolder
                      ? "No documents in this folder."
                      : "No documents yet. Upload one to get started."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Document Viewer Modal */}
      {viewerDoc && (
        <DocumentViewer
          workspaceId={workspaceId}
          documentId={viewerDoc.id}
          fileName={viewerDoc.file_name}
          mimeType={viewerDoc.mime_type}
          onClose={() => setViewerDoc(null)}
        />
      )}
    </div>
  );
}

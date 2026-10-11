"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";

interface Workspace {
  id: string;
  name: string;
  plan: string;
  my_role: string;
}

export default function DashboardPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    let isMounted = true;
    async function loadWorkspaces() {
      try {
        const data = await apiFetch<Workspace[]>("/workspaces");
        if (isMounted) setWorkspaces(data);
      } catch (e) { 
        console.error(e); 
      } finally { 
        if (isMounted) setLoading(false); 
      }
    }
    loadWorkspaces();
    return () => { isMounted = false; };
  }, []);

  const refreshWorkspaces = async () => {
    const data = await apiFetch<Workspace[]>("/workspaces");
    setWorkspaces(data);
  };

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await apiFetch("/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    setNewName("");
    refreshWorkspaces();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/workspaces/${id}`, { method: "DELETE" });
      refreshWorkspaces();
    } catch (e) {
      alert("Failed to delete workspace.");
    }
  };

  const startEdit = (ws: Workspace) => {
    setEditingId(ws.id);
    setEditingName(ws.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await apiFetch(`/workspaces/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingName }),
      });
      cancelEdit();
      refreshWorkspaces();
    } catch (e) {
      alert("Failed to update workspace.");
    }
  };

  if (loading) return <div className="p-8 text-center">Loading workspaces...</div>;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6 text-slate-900 dark:text-white">My Workspaces</h1>
      
      <form onSubmit={createWorkspace} className="flex gap-2 mb-8">
        <input 
          type="text" value={newName} onChange={e => setNewName(e.target.value)}
          placeholder="New Workspace Name" 
          className="flex-1 p-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400"
        />
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          Create
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {workspaces.map(ws => {
          const isOwner = ws.my_role === "owner";
          const isEditing = editingId === ws.id;

          return (
            <div key={ws.id} className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:shadow-lg transition relative flex flex-col">
              <div className="flex-1 mb-4">
                {isEditing ? (
                  <div className="flex gap-2">
                    <input 
                      type="text" value={editingName} onChange={e => setEditingName(e.target.value)}
                      className="flex-1 p-1 border border-slate-300 dark:border-slate-700 rounded text-lg font-semibold focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      autoFocus
                    />
                    <button onClick={() => saveEdit(ws.id)} className="text-green-600 font-bold px-2">✓</button>
                    <button onClick={cancelEdit} className="text-slate-400 font-bold px-2">✕</button>
                  </div>
                ) : (
                  <Link href={`/dashboard/${ws.id}/documents`} className="block group">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">{ws.name}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Role: <span className="capitalize font-medium">{ws.my_role}</span></p>
                  </Link>
                )}
              </div>

              {!isEditing && (
                <div className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800 pt-4 mt-auto">
                  <Link href={`/dashboard/${ws.id}/documents`} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 text-sm font-medium">Open Workspace →</Link>
                  {isOwner && (
                    <div className="flex gap-3 text-sm">
                      <button onClick={() => startEdit(ws)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white transition">Rename</button>
                      <button onClick={() => handleDelete(ws.id, ws.name)} className="text-red-500 hover:text-red-700 transition font-medium">Delete</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {workspaces.length === 0 && (
          <p className="text-slate-500 dark:text-slate-400 col-span-2 text-center py-8 bg-slate-50 dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
            No workspaces yet. Create one above to get started!
          </p>
        )}
      </div>
    </div>
  );
}

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

  const fetchWorkspaces = async () => {
    try {
      const data = await apiFetch<Workspace[]>("/workspaces");
      setWorkspaces(data);
    } catch (e) { 
      console.error(e); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { fetchWorkspaces(); }, []);

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await apiFetch("/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    setNewName("");
    fetchWorkspaces();
  };

  if (loading) return <div className="p-8 text-center">Loading workspaces...</div>;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">My Workspaces</h1>
      
      <form onSubmit={createWorkspace} className="flex gap-2 mb-8">
        <input 
          type="text" value={newName} onChange={e => setNewName(e.target.value)}
          placeholder="New Workspace Name" 
          className="flex-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          Create Workspace
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {workspaces.map(ws => (
          <Link key={ws.id} href={`/dashboard/${ws.id}/documents`} className="block p-6 bg-white border rounded-xl hover:shadow-lg transition border-slate-200">
            <h2 className="text-xl font-semibold text-slate-900">{ws.name}</h2>
            <p className="text-sm text-slate-500 mt-1">Role: <span className="capitalize font-medium">{ws.my_role}</span></p>
          </Link>
        ))}
        {workspaces.length === 0 && (
          <p className="text-slate-500 col-span-2 text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
            No workspaces yet. Create one above to get started!
          </p>
        )}
      </div>
    </div>
  );
}

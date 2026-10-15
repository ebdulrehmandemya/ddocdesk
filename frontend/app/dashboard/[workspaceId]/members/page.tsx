"use client";
import { useState, useEffect, use } from "react";
import { apiFetch, ApiError } from "@/lib/api";

interface Member {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  joined_at: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  invite_url: string;
  created_at: string;
  expires_at: string;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  my_role: string;
}

interface PageProps {
  params: { workspaceId: string } | Promise<{ workspaceId: string }>;
}

type Banner =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | { kind: "invite"; text: string; url: string }
  | null;

export default function MembersPage({ params }: PageProps) {
  const { workspaceId } = "then" in params ? use(params) : params;

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const canManage = workspace?.my_role === "owner" || workspace?.my_role === "admin";
  const isOwner = workspace?.my_role === "owner";

  const loadAll = async () => {
    try {
      const ws = await apiFetch<WorkspaceInfo>(`/workspaces/${workspaceId}`);
      setWorkspace(ws);
      setMembers(await apiFetch<Member[]>(`/workspaces/${workspaceId}/members`));

      if (ws.my_role === "owner" || ws.my_role === "admin") {
        setInvitations(await apiFetch<Invitation[]>(`/workspaces/${workspaceId}/invitations`));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const run = async () => { if (isMounted) await loadAll(); };
    run();
    return () => { isMounted = false; };
  }, [workspaceId]);

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleAddOrInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSubmitting(true);
    setBanner(null);

    try {
      // Try adding directly — works if the user has signed in before
      await apiFetch(`/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      setBanner({ kind: "success", text: `${email} was added to the workspace.` });
      setEmail("");
      await loadAll();
    } catch (err) {
      // 404 = user has no account yet → create an invitation instead
      if (err instanceof ApiError && err.status === 404) {
        try {
          const inv = await apiFetch<Invitation>(`/workspaces/${workspaceId}/invitations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.trim(), role }),
          });
          setBanner({
            kind: "invite",
            text: `Invitation created for ${inv.email}. Share this link, or check Mailpit at http://localhost:8025`,
            url: inv.invite_url,
          });
          setEmail("");
          await loadAll();
        } catch (inviteErr) {
          const msg = inviteErr instanceof ApiError ? inviteErr.message : String(inviteErr);
          setBanner({ kind: "error", text: msg });
        }
      } else {
        const msg = err instanceof ApiError ? err.message : String(err);
        setBanner({ kind: "error", text: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await apiFetch(`/workspaces/${workspaceId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      await loadAll();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      setBanner({ kind: "error", text: msg });
    }
  };

  const handleRemoveMember = async (userId: string, memberEmail: string) => {
    if (!confirm(`Remove ${memberEmail} from this workspace?`)) return;
    try {
      await apiFetch(`/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" });
      await loadAll();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      setBanner({ kind: "error", text: msg });
    }
  };

  const handleRevoke = async (inviteId: string) => {
    if (!confirm("Revoke this invitation? The link will stop working.")) return;
    try {
      await apiFetch(`/workspaces/${workspaceId}/invitations/${inviteId}`, { method: "DELETE" });
      await loadAll();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      setBanner({ kind: "error", text: msg });
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 dark:text-slate-400">Loading members…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Members</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage who has access to <span className="font-medium">{workspace?.name}</span>
        </p>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-xl border text-sm ${
            banner.kind === "error"
              ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
              : banner.kind === "invite"
              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300"
              : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
          }`}
        >
          <p className="font-medium">{banner.text}</p>
          {banner.kind === "invite" && (
            <div className="mt-3 flex gap-2">
              <code className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-700 rounded-lg text-xs break-all">
                {banner.url}
              </code>
              <button
                onClick={() => copyToClipboard(banner.url, "banner")}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition shrink-0"
              >
                {copied === "banner" ? "Copied!" : "Copy link"}
              </button>
            </div>
          )}
        </div>
      )}

      {canManage && (
        <form
          onSubmit={handleAddOrInvite}
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
        >
          <h2 className="font-semibold text-slate-900 dark:text-white mb-3">Add member</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="person@company.com"
              className="flex-1 p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="member">Member</option>
              {isOwner && <option value="admin">Admin</option>}
            </select>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition shrink-0"
            >
              {submitting ? "Working…" : "Add or invite"}
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            If the person already has an account they&apos;re added immediately. Otherwise an invite link is generated.
          </p>
        </form>
      )}

      {/* Members table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <h2 className="font-semibold text-slate-900 dark:text-white">
            Members <span className="text-slate-400 font-normal">({members.length})</span>
          </h2>
        </div>
        <table className="w-full text-left">
          <tbody>
            {members.map(m => (
              <tr key={m.user_id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-700 dark:text-blue-300 font-semibold text-sm shrink-0">
                      {(m.display_name || m.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white truncate">
                        {m.display_name || m.email}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{m.email}</p>
                    </div>
                  </div>
                </td>
                <td className="p-4 w-40">
                  {canManage && m.role !== "owner" ? (
                    <select
                      value={m.role}
                      onChange={e => handleChangeRole(m.user_id, e.target.value)}
                      disabled={!isOwner && m.role === "admin"}
                      className="p-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-50"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      {isOwner && <option value="owner">Owner</option>}
                    </select>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                      {m.role}
                    </span>
                  )}
                </td>
                <td className="p-4 w-32 text-right">
                  {canManage && m.role !== "owner" && (
                    <button
                      onClick={() => handleRemoveMember(m.user_id, m.email)}
                      className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition"
                      title="Remove member"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending invitations */}
      {canManage && invitations.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <h2 className="font-semibold text-slate-900 dark:text-white">
              Pending invitations <span className="text-slate-400 font-normal">({invitations.length})</span>
            </h2>
          </div>
          <table className="w-full text-left">
            <tbody>
              {invitations.map(inv => (
                <tr key={inv.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                  <td className="p-4">
                    <p className="font-medium text-slate-900 dark:text-white">{inv.email}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="p-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => copyToClipboard(inv.invite_url, inv.id)}
                      className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition mr-2"
                    >
                      {copied === inv.id ? "Copied!" : "Copy link"}
                    </button>
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

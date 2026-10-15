"use client";
import { useState, useEffect, use } from "react";
import { publicApiFetch, apiFetch, ApiError } from "@/lib/api";
import { useRouter } from "next/navigation";

interface InvitationInfo {
  email: string;
  role: string;
  workspace_id: string;
  workspace_name: string;
  status: string;
  expired: boolean;
  expires_at: string;
}

interface SessionInfo {
  authenticated: boolean;
  user?: { id: string; email?: string; name?: string };
}

interface PageProps {
  params: { token: string } | Promise<{ token: string }>;
}

export default function InvitePage({ params }: PageProps) {
  const { token } = "then" in params ? use(params) : params;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [inv, sess] = await Promise.all([
          publicApiFetch<InvitationInfo>(`/invitations/${token}`),
          fetch("/api/auth/session").then(r => r.json()) as Promise<SessionInfo>,
        ]);
        if (!isMounted) return;
        setInvitation(inv);
        setSession(sess);
      } catch (err) {
        if (!isMounted) return;
        const msg = err instanceof ApiError ? err.message : "Invitation not found";
        setError(msg);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => { isMounted = false; };
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const result = await apiFetch<{ workspace_id: string }>(
        `/invitations/${token}/accept`,
        { method: "POST" }
      );
      router.push(`/dashboard/${result.workspace_id}/documents`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      setError(msg);
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-slate-500 dark:text-slate-400">Loading invitation…</p>
      </main>
    );
  }

  const emailMatches =
    session?.authenticated &&
    invitation &&
    session.user?.email?.toLowerCase() === invitation.email.toLowerCase();

  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 shadow-xl rounded-2xl p-8 border border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">dDocDesk</h1>

        {error && !invitation && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {invitation && (
          <>
            {invitation.status !== "pending" || invitation.expired ? (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm">
                This invitation is no longer valid
                {invitation.expired ? " (it has expired)" : ` (status: ${invitation.status})`}.
                Ask a workspace admin to send a new one.
              </div>
            ) : (
              <>
                <p className="text-slate-600 dark:text-slate-300 mb-6">
                  You&apos;ve been invited to join{" "}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {invitation.workspace_name}
                  </span>{" "}
                  as <span className="font-semibold">{invitation.role}</span>.
                </p>

                {error && (
                  <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                    {error}
                  </div>
                )}

                {!session?.authenticated ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Sign in with <span className="font-medium">{invitation.email}</span> to accept.
                    </p>
                    <a
                      href={`/api/auth/login?next=${encodeURIComponent(`/invite/${token}`)}`}
                      className="block w-full text-center px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition"
                    >
                      Sign in to accept
                    </a>
                  </div>
                ) : emailMatches ? (
                  <button
                    onClick={handleAccept}
                    disabled={accepting}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {accepting ? "Accepting…" : "Accept invitation"}
                  </button>
                ) : (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm">
                    You&apos;re signed in as <span className="font-medium">{session.user?.email}</span>,
                    but this invitation was sent to{" "}
                    <span className="font-medium">{invitation.email}</span>.
                    <div className="mt-3">
                      <a
                        href="/api/auth/logout"
                        className="inline-block px-4 py-2 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100 dark:hover:bg-slate-700 transition"
                      >
                        Sign out and switch account
                      </a>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

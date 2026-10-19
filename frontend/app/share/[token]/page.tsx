"use client";
import { useState, useEffect, use } from "react";

interface ShareInfo {
  target_type: "document" | "folder";
  file_name: string;
  mime_type: string;
  size_bytes: number;
  requires_password: boolean;
  expires_at: string;
}

interface ApiError {
  detail?: string;
}

interface PageProps {
  params: { token: string } | Promise<{ token: string }>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function SharePage({ params }: PageProps) {
  const { token } = "then" in params ? use(params) : params;

  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

  useEffect(() => {
    let isMounted = true;

    async function loadShareInfo() {
      try {
        const res = await fetch(`${apiUrl}/shares/public/${token}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as ApiError;
          throw new Error(data.detail || `Error ${res.status}`);
        }
        const data = (await res.json()) as ShareInfo;
        if (isMounted) {
          setShareInfo(data);
          if (!data.requires_password) setVerified(true);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load share link");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadShareInfo();
    return () => { isMounted = false; };
  }, [token, apiUrl]);

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setPasswordError(null);

    try {
      const res = await fetch(`${apiUrl}/shares/public/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ApiError;
        throw new Error(data.detail || "Incorrect password");
      }

      setVerified(true);
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleDownload = () => {
    let url = `${apiUrl}/shares/public/${token}/download`;
    if (shareInfo?.requires_password && password) {
      url += `?password=${encodeURIComponent(password)}`;
    }
    window.open(url, "_blank");
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading shared file...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-8">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Link Unavailable
          </h1>
          <p className="text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-8">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 shadow-xl rounded-2xl p-8 border border-slate-200 dark:border-slate-800">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">
            {shareInfo?.target_type === "document" ? "📄" : "📁"}
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">
            {shareInfo?.file_name}
          </h1>
          {shareInfo && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {formatBytes(shareInfo.size_bytes)} · Expires{" "}
              {new Date(shareInfo.expires_at).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Password prompt */}
        {shareInfo?.requires_password && !verified ? (
          <form onSubmit={handleVerifyPassword} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password to access"
              className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              autoFocus
            />
            {passwordError && (
              <p className="text-sm text-red-500">{passwordError}</p>
            )}
            <button
              type="submit"
              disabled={verifying || !password}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {verifying ? "Verifying..." : "Unlock"}
            </button>
          </form>
        ) : (
          <button
            onClick={handleDownload}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download File
          </button>
        )}

        <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-4">
          Shared via dDocDesk
        </p>
      </div>
    </main>
  );
}

"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface ShareModalProps {
  workspaceId: string;
  targetType: "document" | "folder";
  targetId: string;
  targetName: string;
  onClose: () => void;
}

export default function ShareModal({
  workspaceId,
  targetType,
  targetId,
  targetName,
  onClose,
}: ShareModalProps) {
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiFetch<{ url: string }>(
        `/workspaces/${workspaceId}/shares`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_type: targetType,
            target_id: targetId,
            expires_in_days: expiresInDays,
            password: usePassword && password ? password : null,
          }),
        }
      );
      setShareUrl(result.url);
    } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to create share link");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Share {targetType === "document" ? "Document" : "Folder"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 truncate">
          {targetName}
        </p>

        {shareUrl ? (
          /* Success state */
          <div className="space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
              <p className="text-sm text-green-700 dark:text-green-300 font-medium mb-2">
                ✓ Share link created
              </p>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-green-200 dark:border-green-700 rounded-lg text-xs break-all text-slate-700 dark:text-slate-300">
                  {shareUrl}
                </code>
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition shrink-0"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition font-medium"
            >
              Done
            </button>
          </div>
        ) : (
          /* Configuration state */
          <div className="space-y-4">
            {/* Expiration */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Link expires in
              </label>
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value={1}>1 day</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>

            {/* Password toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Require password
              </label>
              <button
                onClick={() => setUsePassword(!usePassword)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  usePassword ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    usePassword ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>

            {/* Password input */}
            {usePassword && (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password (min 4 characters)"
                className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                minLength={4}
              />
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            )}

            {/* Create button */}
            <button
              onClick={handleCreate}
              disabled={loading || (usePassword && password.length < 4)}
              className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Creating..." : "Create Share Link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

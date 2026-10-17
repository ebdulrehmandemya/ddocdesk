"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

interface StorageInfo {
  used_bytes: number;
  quota_bytes: number;
  usage_percentage: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function StorageUsage({ workspaceId }: { workspaceId: string }) {
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const data = await apiFetch<StorageInfo>(`/workspaces/${workspaceId}/storage`);
        if (isMounted) setStorage(data);
      } catch (e) {
        console.error(e);
      }
    }
    load();
    const interval = setInterval(load, 10000); // Refresh every 10s
    return () => { isMounted = false; clearInterval(interval); };
  }, [workspaceId]);

  if (!storage) return null;

  const barColor =
    storage.usage_percentage > 90
      ? "bg-red-500"
      : storage.usage_percentage > 70
      ? "bg-amber-500"
      : "bg-blue-500";

  return (
    <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800">
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
        <span>Storage</span>
        <span>{storage.usage_percentage.toFixed(1)}%</span>
      </div>
      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(storage.usage_percentage, 100)}%` }}
        />
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
        {formatBytes(storage.used_bytes)} of {formatBytes(storage.quota_bytes)}
      </p>
    </div>
  );
}

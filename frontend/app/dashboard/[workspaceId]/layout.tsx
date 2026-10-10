"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { use } from "react";

export default function WorkspaceLayout({ 
  children, 
  params 
}: { 
  children: React.ReactNode, 
  params: any 
}) {
  // Handles both Next.js 14 (object) and Next.js 15 (Promise) params
  const { workspaceId } = typeof params.then === 'function' ? use(params) : params;
  const pathname = usePathname();
  
  const links = [
    { href: `/dashboard/${workspaceId}/documents`, label: "Documents", icon: "📄" },
    { href: `/dashboard/${workspaceId}/search`, label: "Search", icon: "🔍" },
    { href: `/dashboard/${workspaceId}/chat`, label: "AI Chat", icon: "🤖" },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 bg-slate-900 text-white p-6 flex flex-col gap-2">
        <Link href="/dashboard" className="text-xl font-bold mb-8 hover:text-blue-400 transition flex items-center gap-2">
          <span>←</span> Workspaces
        </Link>
        {links.map(l => (
          <Link 
            key={l.href} 
            href={l.href} 
            className={`p-3 rounded-lg transition flex items-center gap-3 ${
              pathname.startsWith(l.href) ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'
            }`}
          >
            <span>{l.icon}</span> {l.label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}

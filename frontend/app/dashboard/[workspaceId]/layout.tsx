"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { use } from "react";


interface LayoutProps {
  children: React.ReactNode;
  params: { workspaceId: string } | Promise<{ workspaceId: string }>;
}

export default function WorkspaceLayout({ children, params }:  LayoutProps) {
  const { workspaceId } = "then" in params ? use(params) : params;
  const pathname = usePathname();
  
  const links = [
    { href: `/dashboard/${workspaceId}/documents`, label: "Documents", icon: "📄" },
    { href: `/dashboard/${workspaceId}/search`, label: "Search", icon: "🔍" },
    { href: `/dashboard/${workspaceId}/chat`, label: "AI Chat", icon: "🤖" },
    { href: `/dashboard/${workspaceId}/members`, label: "Members", icon: "👥" },
    { href: `/dashboard/${workspaceId}/activity`, label: "Activity", icon: "📜" },
  ];

  return (
    // h-[calc(100vh-4rem)] accounts for the sticky header above
    <div className="flex h-[calc(100vh-4rem)]"> 
      <aside className="w-64 bg-slate-900 dark:bg-black text-white p-6 flex flex-col gap-2 border-r border-slate-800">
        <Link href="/dashboard" className="text-lg font-bold mb-8 hover:text-blue-400 transition flex items-center gap-2 text-slate-300">
          <span>←</span> Workspaces
        </Link>
        {links.map(l => (
          <Link 
            key={l.href} 
            href={l.href} 
            className={`p-3 rounded-lg transition flex items-center gap-3 ${
              pathname.startsWith(l.href) 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                : 'hover:bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <span>{l.icon}</span> {l.label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 p-8 overflow-auto bg-slate-50 dark:bg-slate-950">
        {children}
      </main>
    </div>
  );
}

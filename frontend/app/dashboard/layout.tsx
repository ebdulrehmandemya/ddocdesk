import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import LanguageSwitcher from "@/components/language-switcher";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");

  const t = await getTranslations("common");
  const tNav = await getTranslations("nav");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-6 sticky top-0 z-10">
        <Link href="/dashboard" className="text-xl font-bold tracking-tight">
          {t("appName")}
        </Link>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <ThemeToggle />
          <span className="text-sm text-slate-500 dark:text-slate-400 hidden md:block">
            {session.user.email}
          </span>
          <a
            href="/api/auth/logout"
            className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            {tNav("signOut")}
          </a>
        </div>
      </header>
      {children}
    </div>
  );
}

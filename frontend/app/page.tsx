import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-950 transition-colors">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 shadow-xl rounded-2xl p-8 border border-slate-200 dark:border-slate-800 text-center">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">dDocDesk MVP</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 mb-8">
          Secure Document Workspace & AI Assistant
        </p>
        <a
          href="/api/auth/login"
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-white font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
        >
          Sign in with Keycloak
        </a>
      </div>
    </main>
  );
}

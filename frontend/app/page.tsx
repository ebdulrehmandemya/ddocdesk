import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();

  // If logged in, send them straight to the workspaces dashboard!
  if (session) {
    redirect("/dashboard");
  }

  // If not logged in, show the login button
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-slate-50">
      <div className="w-full max-w-xl bg-white shadow-xl rounded-2xl p-8 border border-slate-200 text-center">
        <h1 className="text-3xl font-bold text-slate-900">dDocDesk MVP</h1>
        <p className="text-slate-500 mt-2 mb-8">
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

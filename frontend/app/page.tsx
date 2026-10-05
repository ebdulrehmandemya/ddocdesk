import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type ApiResult = {
  ok: boolean;
  status: number;
  data: unknown;
};

async function callBackendApi(accessToken: string): Promise<ApiResult> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const data = response.ok ? await response.json() : null;

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: "Backend API unreachable",
    };
  }
}

export default async function Home() {
  const session = await getSession();

  if (!session) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-xl bg-white shadow-xl rounded-2xl p-8 border border-slate-200 text-center">
          <h1 className="text-3xl font-bold text-slate-900">dDocDesk MVP</h1>
          <p className="text-slate-500 mt-2 mb-8">
            Phase 2 — Identity and Workspaces
          </p>

          <a
            href="/api/auth/login"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-white font-semibold hover:bg-blue-700 transition-colors"
          >
            Sign in with Keycloak
          </a>
        </div>
      </main>
    );
  }

  const apiResult = await callBackendApi(session.accessToken);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-slate-50">
      <div className="w-full max-w-3xl bg-white shadow-xl rounded-2xl p-8 border border-slate-200">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">dDocDesk MVP</h1>
            <p className="text-slate-500 mt-1">
              Signed in as {session.user.name ?? session.user.email ?? session.user.id}
            </p>
          </div>

          <a
            href="/api/auth/logout"
            className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 transition-colors"
          >
            Sign out
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="p-4 border border-slate-200 rounded-xl">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Keycloak Session
            </div>
            <div className="text-lg font-bold text-green-600">✓ Active</div>
            <div className="text-sm text-slate-500 mt-1">{session.user.email}</div>
          </div>

          <div className="p-4 border border-slate-200 rounded-xl">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              FastAPI Authorization
            </div>
            <div
              className={`text-lg font-bold ${
                apiResult.ok ? "text-green-600" : "text-red-600"
              }`}
            >
              {apiResult.ok ? "✓ Authorized" : "✗ Failed"}
            </div>
            <div className="text-sm text-slate-500 mt-1">
              HTTP {apiResult.status || "network error"}
            </div>
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 overflow-auto">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Backend /users/me response
          </div>
          <pre className="text-sm text-slate-800 whitespace-pre-wrap">
            {JSON.stringify(apiResult.data, null, 2)}
          </pre>
        </div>
      </div>
    </main>
  );
}

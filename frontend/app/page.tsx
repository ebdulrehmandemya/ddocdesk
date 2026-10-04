// frontend/app/page.tsx

interface HealthCheck {
  status: string;
  checks: {
    postgres: string;
    minio: string;
    qdrant: string;
  };
}

async function getHealth(): Promise<HealthCheck | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health/readyz`, { 
      cache: 'no-store' // Ensure we always get fresh status
    });
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error("Failed to fetch health status:", error);
    return null;
  }
}

export default async function Home() {
  const health = await getHealth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-slate-50">
      <div className="w-full max-w-2xl bg-white shadow-xl rounded-2xl p-8 border border-slate-200">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">dDocDesk MVP</h1>
          <p className="text-slate-500 mt-1">Phase 1: Local Foundation</p>
        </div>

        <div className="space-y-6">
          {/* API Connection Status */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
            <span className="font-semibold text-slate-700">Backend API</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${health ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {health ? '● Connected' : '○ Offline'}
            </span>
          </div>

          {/* Infrastructure Checks */}
          {health && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(health.checks).map(([service, status]) => (
                <div key={service} className="p-4 border border-slate-200 rounded-xl bg-white hover:shadow-md transition-shadow">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{service}</div>
                  <div className={`text-lg font-bold ${status === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                    {status === 'ok' ? '✓ Healthy' : '✗ Error'}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {!health && (
            <div className="p-4 border border-red-200 bg-red-50 rounded-xl text-red-700 text-sm">
              Could not connect to the FastAPI backend. Ensure it is running on <code>http://localhost:8000</code>.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

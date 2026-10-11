"use client"

import * as React from "react"
import { useTheme } from "next-themes"

// This is required by useSyncExternalStore but does nothing
const emptySubscribe = () => () => {}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  
  // useSyncExternalStore safely detects if we are on the client
  // without triggering the "setState in effect" compiler warning.
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,  // Returns true on the client
    () => false  // Returns false on the server
  )

  if (!mounted) {
    // Render a placeholder skeleton during SSR to prevent hydration mismatches
    return <div className="h-9 w-32 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
  }

  const options = [
    { value: "light", label: "☀️", title: "Light" },
    { value: "dark", label: "🌙", title: "Dark" },
    { value: "system", label: "💻", title: "System" },
  ]

  return (
    <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-1 bg-slate-100 dark:bg-slate-800">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          title={opt.title}
          className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
            theme === opt.value
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

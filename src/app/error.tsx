"use client"

import { useEffect } from "react"
import { APP_CONFIG } from "@/config/app"

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log to Sentry when wired up in Session 5
    // Sentry.captureException(error)
    // Never log error.message to console in production — may contain PII
    if (process.env["NODE_ENV"] === "development") {
      // eslint-disable-next-line no-console
      console.error("[ErrorBoundary]", error.digest ?? "no-digest")
    }
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-gray-500">
        {APP_CONFIG.name} hit an unexpected error. Your data is safe.
      </p>
      {error.digest && <p className="font-mono text-xs text-gray-400">Error ID: {error.digest}</p>}
      <button
        onClick={reset}
        className="rounded bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
      >
        Try again
      </button>
    </div>
  )
}

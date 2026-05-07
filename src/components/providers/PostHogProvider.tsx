"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import posthog from "posthog-js"

let initialised = false

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    const key = process.env["NEXT_PUBLIC_POSTHOG_KEY"]
    const host = process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "https://us.i.posthog.com"
    if (!key || initialised) return

    posthog.init(key, {
      api_host: host,
      // Disable session replay on notes pages to protect user content
      disable_session_recording: pathname?.startsWith("/notes") ?? false,
      capture_pageview: false, // manual pageview below
    })
    initialised = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!initialised) return
    // Disable session recording on /notes/* to protect voice note content
    if (pathname?.startsWith("/notes")) {
      posthog.stopSessionRecording()
    }
    posthog.capture("$pageview", { $current_url: window.location.href })
  }, [pathname])

  return <>{children}</>
}

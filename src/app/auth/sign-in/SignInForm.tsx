"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { APP_CONFIG } from "@/config/app"

type Mode = "google" | "email"

export default function SignInForm() {
  const [mode, setMode] = useState<Mode>("google")
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleGoogleSignIn() {
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${APP_CONFIG.url}/auth/callback` },
    })
    if (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${APP_CONFIG.url}/auth/callback` },
    })
    setLoading(false)
    if (err) {
      setError(err.message)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-foreground/15 p-6 text-center flex flex-col gap-3">
        <p className="text-xl">✉️</p>
        <p className="font-semibold">Check your inbox</p>
        <p className="text-sm text-foreground/60">
          We sent a magic link to <strong>{email}</strong>. Click it to sign in.
        </p>
        <button
          onClick={() => setSent(false)}
          className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors mt-2"
        >
          Try a different email
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {mode === "google" ? (
        <>
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="flex items-center justify-center gap-3 rounded-full border border-foreground/20 py-3 px-5 text-sm font-medium hover:border-foreground/40 transition-colors disabled:opacity-50"
          >
            <GoogleIcon />
            {loading ? "Redirecting…" : "Continue with Google"}
          </button>
          <div className="flex items-center gap-3 text-xs text-foreground/30">
            <span className="flex-1 h-px bg-foreground/10" />
            or
            <span className="flex-1 h-px bg-foreground/10" />
          </div>
          <button
            onClick={() => setMode("email")}
            className="text-sm text-foreground/60 hover:text-foreground transition-colors text-center"
          >
            Sign in with email link
          </button>
        </>
      ) : (
        <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-foreground/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-foreground/50 transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-foreground text-background py-3 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send magic link"}
          </button>
          <button
            type="button"
            onClick={() => setMode("google")}
            className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors text-center"
          >
            Back to Google sign-in
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  )
}

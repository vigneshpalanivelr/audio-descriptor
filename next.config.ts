import type { NextConfig } from "next"

const CSP = [
  "default-src 'self'",
  // unsafe-inline + unsafe-eval required by Next.js dev HMR and React hydration
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  [
    "connect-src 'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://api.anthropic.com",
    "https://api.openai.com",
    "https://api.sarvam.ai",
    "https://api.elevenlabs.io",
    "https://app.posthog.com",
    "https://*.sentry.io",
    "https://unpkg.com",
  ].join(" "),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

const securityHeaders = [
  // Prevent MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Block framing (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Strict HTTPS (1 year, include subdomains)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // Minimal referrer leakage
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restrict browser feature access — allow microphone for recording
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  // Content Security Policy
  { key: "Content-Security-Policy", value: CSP },
]

// ffmpeg-wasm requires SharedArrayBuffer which needs COOP + COEP headers
const coopCoepHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/notes/new",
        headers: coopCoepHeaders,
      },
    ]
  },
}

export default nextConfig

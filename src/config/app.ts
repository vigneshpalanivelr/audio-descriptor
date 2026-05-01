export const APP_CONFIG = {
  name: "QuillCast",
  tagline: "Speak your thoughts. QuillCast writes them.",
  url: process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000",
  supportEmail: "hello@quillcast.app",
  social: {
    twitter: "https://x.com/quillcast",
  },
} as const

export type AppConfig = typeof APP_CONFIG

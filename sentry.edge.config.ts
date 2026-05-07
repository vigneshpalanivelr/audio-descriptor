import * as Sentry from "@sentry/nextjs"

const dsn = process.env["SENTRY_DSN"]

Sentry.init({
  ...(dsn ? { dsn } : {}),
  enabled: process.env["NODE_ENV"] === "production",
  tracesSampleRate: 0.1,
})

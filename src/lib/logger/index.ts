import pino from "pino"
import createStream from "pino-rotating-file-stream"
import path from "path"

// ─── PII / secret fields that must NEVER appear in logs ───────────────────────
// Any key matching these paths will be replaced with "[REDACTED]"
const REDACTED_PATHS = [
  "email",
  "user_email",
  "transcript",
  "transcript_raw",
  "summary",
  "audio_storage_path",
  "name",
  "display_name",
  "full_name",
  "password",
  "secret",
  "signing_key",
  "api_key",
  "apiKey",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "Authorization",
  "payload",
  "cookie",
  "Cookie",
  "x-api-key",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]

const isDev = process.env["NODE_ENV"] !== "production"
const logDir = path.resolve(process.cwd(), "logs")

function buildTransports(): pino.DestinationStream {
  const fileStream = createStream({
    filename: "quillcast.log",
    path: logDir,
    interval: "1d",
    compress: "gzip",
    maxSize: "100M",
  })

  if (isDev) {
    const prettyStream = pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
        ignore: "pid,hostname",
        messageFormat: "[{module}] {msg}",
      },
    })
    return pino.multistream([
      { stream: prettyStream, level: "debug" },
      { stream: fileStream, level: "debug" },
    ])
  }

  /* c8 ignore start */
  return pino.multistream([
    { stream: process.stdout, level: "info" },
    { stream: fileStream, level: "debug" },
  ])
  /* c8 ignore stop */
}

const logger = pino(
  {
    level: isDev ? "debug" : "info",
    redact: {
      paths: REDACTED_PATHS,
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    /* c8 ignore start */
    formatters: {
      level(label) {
        return { level: label.toUpperCase() }
      },
    },
    /* c8 ignore stop */
    base: {
      service: "quillcast",
      /* c8 ignore next */ env: process.env["NODE_ENV"] ?? "development",
    },
  },
  buildTransports(),
)

// Child loggers per module — keeps logs filterable by module name
export const appLogger = logger.child({ module: "app" })
export const authLogger = logger.child({ module: "auth" })
export const sttLogger = logger.child({ module: "stt" })
export const llmLogger = logger.child({ module: "llm" })
export const paymentLogger = logger.child({ module: "payment" })
export const adminLogger = logger.child({ module: "admin" })
export const auditLogger = logger.child({ module: "audit" })

export default logger

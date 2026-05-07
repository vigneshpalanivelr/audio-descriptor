import { inngest } from "./client"
import { createServiceClient } from "@/lib/supabase/service"
import { parseCostCap } from "@/lib/cost/cap"
import { appLogger } from "@/lib/logger"

async function sendDigestEmail(totalUsd: number, capUsd: number, noteCount: number): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"] ?? ""
  const fromEmail = process.env["FROM_EMAIL"] ?? "hello@quillcast.app"
  const toEmail = process.env["DIGEST_EMAIL"] ?? fromEmail
  if (!apiKey) return

  const { Resend } = await import("resend")
  const resend = new Resend(apiKey)

  const overCap = totalUsd >= capUsd
  const subject = overCap
    ? `⚠️ QuillCast cost cap exceeded — $${totalUsd.toFixed(4)} / $${capUsd}`
    : `QuillCast daily spend — $${totalUsd.toFixed(4)} / $${capUsd}`

  const html = `
    <h2>${subject}</h2>
    <p>Notes processed today: <strong>${noteCount}</strong></p>
    <p>Total LLM/STT spend: <strong>$${totalUsd.toFixed(4)}</strong></p>
    <p>Daily cap: <strong>$${capUsd}</strong></p>
    ${overCap ? `<p style="color:red"><strong>Cap exceeded. New uploads are blocked until midnight UTC.</strong></p>` : ""}
  `

  await resend.emails.send({ from: fromEmail, to: toEmail, subject, html })
}

export const costDigest = inngest.createFunction(
  { id: "cost-digest", retries: 1 },
  { cron: "0 0 * * *" }, // daily at midnight UTC
  async ({ step }) => {
    const summary = await step.run("query-daily-spend", async () => {
      const db = createServiceClient()
      const today = new Date().toISOString().slice(0, 10)

      const { data } = await db
        .from("notes")
        .select("cost_usd")
        .gte("ready_at", `${today}T00:00:00.000Z`)
        .not("cost_usd", "is", null)

      const rows = data ?? []
      const totalUsd = rows.reduce((sum, r) => sum + ((r.cost_usd as number) ?? 0), 0)
      return { totalUsd, noteCount: rows.length }
    })

    const capUsd = parseCostCap()
    appLogger.info({ ...summary, capUsd }, "cost_digest:daily_summary")

    await step.run("send-digest-email", async () => {
      await sendDigestEmail(summary.totalUsd, capUsd, summary.noteCount)
    })

    return summary
  },
)

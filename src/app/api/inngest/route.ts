import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { transcribeNote } from "@/lib/inngest/transcribe"
import { cleanupNote } from "@/lib/inngest/cleanup"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [transcribeNote, cleanupNote],
})

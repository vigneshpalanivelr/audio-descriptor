import { Inngest, EventSchemas } from "inngest"

type Events = {
  "audio/note.uploaded": {
    data: {
      noteId: string
      userId: string
      storagePath: string
      durationSec: number
      language: string
      intensity: "verbatim" | "light" | "full"
      tier: string
    }
  }
  "note/note.transcribed": {
    data: {
      noteId: string
      userId: string
      transcriptRaw: string
      language: string
      intensity: "verbatim" | "light" | "full"
      tier: string
      durationSec: number
    }
  }
}

export const inngest = new Inngest({
  id: "quillcast",
  schemas: new EventSchemas().fromRecord<Events>(),
})

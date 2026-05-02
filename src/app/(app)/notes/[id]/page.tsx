import { APP_CONFIG } from "@/config/app"

export const metadata = {
  title: `Note — ${APP_CONFIG.name}`,
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function NoteDetailPage({ params }: Props) {
  const { id } = await params

  return (
    <div className="flex flex-col flex-1 items-center justify-center text-center gap-4 py-24">
      <span className="text-4xl select-none" aria-hidden="true">
        ⏳
      </span>
      <h1 className="text-xl font-bold tracking-tight">Processing your note…</h1>
      <p className="text-foreground/60 text-sm max-w-xs leading-relaxed">
        Transcription and cleanup are running in the background. This page will update automatically
        once ready.
      </p>
      <p className="font-mono text-xs text-foreground/30">{id}</p>
    </div>
  )
}

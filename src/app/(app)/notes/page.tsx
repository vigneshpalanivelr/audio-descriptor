import { APP_CONFIG } from "@/config/app"

export const metadata = {
  title: `Notes — ${APP_CONFIG.name}`,
}

export default function NotesPage() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center text-center gap-6 py-24">
      <div className="flex flex-col items-center gap-3">
        <span className="text-5xl select-none" aria-hidden="true">
          🎙️
        </span>
        <h1 className="text-2xl font-bold tracking-tight">No notes yet</h1>
        <p className="text-foreground/60 text-sm max-w-xs leading-relaxed">
          Record your first voice note and {APP_CONFIG.name} will transcribe and clean it up for
          you.
        </p>
      </div>
      <button
        disabled
        className="rounded-full bg-foreground text-background px-7 py-3 text-base font-semibold opacity-40 cursor-not-allowed"
        title="Coming soon"
      >
        + New Note
      </button>
      <p className="text-xs text-foreground/30">Recorder coming soon</p>
    </div>
  )
}

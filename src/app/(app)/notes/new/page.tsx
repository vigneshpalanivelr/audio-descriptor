"use client"

import { useRouter } from "next/navigation"
import { Recorder } from "@/components/recording/Recorder"

export default function NewNotePage() {
  const router = useRouter()

  function handleComplete(noteId: string) {
    router.push(`/notes/${noteId}`)
  }

  function handleDiscard() {
    router.push("/notes")
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold tracking-tight text-center mb-6">New Note</h1>
        <Recorder onComplete={handleComplete} onDiscard={handleDiscard} />
      </div>
    </div>
  )
}

import { APP_CONFIG } from "@/config/app"
import { NoteDetailClient } from "./NoteDetailClient"

export const metadata = { title: `Note — ${APP_CONFIG.name}` }

interface Props {
  params: Promise<{ id: string }>
}

export default async function NoteDetailPage({ params }: Props) {
  const { id } = await params
  return <NoteDetailClient noteId={id} />
}

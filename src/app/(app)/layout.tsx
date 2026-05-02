import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { APP_CONFIG } from "@/config/app"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/sign-in")

  return (
    <div className="flex flex-col min-h-full font-sans">
      <nav className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur border-b border-foreground/10">
        <Link href="/notes" className="font-bold text-lg tracking-tight">
          {APP_CONFIG.name}
        </Link>
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="text-sm text-foreground/50 hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </form>
      </nav>
      <main className="flex flex-col flex-1 px-6 py-8 max-w-4xl mx-auto w-full">{children}</main>
    </div>
  )
}

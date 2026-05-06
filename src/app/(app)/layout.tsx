import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { APP_CONFIG } from "@/config/app"
import { UserMenu } from "@/components/UserMenu"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/sign-in")

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single()

  const displayName =
    (profile?.display_name as string | null) ?? user.email?.split("@")[0] ?? "Account"

  return (
    <div className="flex flex-col min-h-full font-sans">
      <nav className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur border-b border-foreground/10">
        <Link href="/" className="font-bold text-lg tracking-tight">
          {APP_CONFIG.name}
        </Link>
        <UserMenu displayName={displayName} />
      </nav>
      <main className="flex flex-col flex-1 px-6 py-8 max-w-4xl mx-auto w-full">{children}</main>
    </div>
  )
}

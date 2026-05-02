import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { APP_CONFIG } from "@/config/app"
import SignInForm from "./SignInForm"

export const metadata = {
  title: `Sign in — ${APP_CONFIG.name}`,
}

export default async function SignInPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect("/notes")

  return (
    <div className="flex flex-col min-h-full items-center justify-center px-6 py-20 font-sans">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">{APP_CONFIG.name}</h1>
          <p className="mt-2 text-sm text-foreground/60">{APP_CONFIG.tagline}</p>
        </div>
        <SignInForm />
        <p className="text-center text-xs text-foreground/40">
          By signing in you agree to our terms of service.
        </p>
      </div>
    </div>
  )
}

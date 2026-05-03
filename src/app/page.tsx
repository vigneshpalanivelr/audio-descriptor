import Link from "next/link"
import { APP_CONFIG } from "@/config/app"
import { createClient } from "@/lib/supabase/server"

const TIERS = [
  {
    name: "Free",
    priceInr: "₹0",
    priceUsd: "$0",
    minutes: "30 min / mo",
    notes: "10 notes / mo",
    cta: "Get started free",
    highlight: false,
  },
  {
    name: "Starter",
    priceInr: "₹499",
    priceUsd: "$7",
    minutes: "5 hours / mo",
    notes: "Unlimited notes",
    cta: "Start with Starter",
    highlight: false,
  },
  {
    name: "Pro",
    priceInr: "₹999",
    priceUsd: "$12",
    minutes: "30 hours / mo",
    notes: "Unlimited notes",
    cta: "Go Pro",
    highlight: true,
  },
  {
    name: "Pro + Local",
    priceInr: "₹1,999",
    priceUsd: "$24",
    minutes: "Unlimited",
    notes: "Unlimited notes",
    cta: "Go unlimited",
    highlight: false,
  },
] as const

const FAQS = [
  {
    q: "Which languages are supported?",
    a: "Hindi, Tamil, English, Hinglish, and most other languages supported by OpenAI Whisper — over 50 languages in total.",
  },
  {
    q: "How is QuillCast different from AudioPen?",
    a: "QuillCast is built for Indian audiences first — native Rupee pricing, Razorpay checkout, Sarvam Saaras for Indic languages, and a free tier that actually lets you try it.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No lock-in. Cancel from your profile page and you'll keep your plan until the end of the billing period.",
  },
  {
    q: "Is my audio stored?",
    a: "Audio chunks are stored temporarily while your note is being processed, then deleted. Your transcript and summary are stored in your account.",
  },
] as const

export default async function LandingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase.from("profiles").select("display_name").eq("id", user.id).single()
    : { data: null }

  const displayName = (profile?.display_name as string | null) ?? user?.email?.split("@")[0] ?? null

  return (
    <div className="flex flex-col min-h-full font-sans">
      {/* Nav */}
      <nav className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur border-b border-foreground/10">
        <span className="font-bold text-lg tracking-tight">{APP_CONFIG.name}</span>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground/60 hidden sm:block">{displayName}</span>
            <Link
              href="/notes"
              className="rounded-full bg-foreground text-background px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Open notes
            </Link>
          </div>
        ) : (
          <Link
            href="/auth/sign-in"
            className="rounded-full bg-foreground text-background px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Sign in
          </Link>
        )}
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-28 gap-6">
        <p className="text-sm font-medium tracking-widest uppercase text-foreground/50">
          Voice → Text, reimagined
        </p>
        <h1 className="text-5xl sm:text-6xl font-extrabold leading-tight tracking-tight max-w-2xl">
          Speak your thoughts.
          <br />
          <span className="text-foreground/60">{APP_CONFIG.name} writes them.</span>
        </h1>
        <p className="max-w-md text-lg text-foreground/60 leading-relaxed">
          Record in Hindi, Tamil, English, Hinglish — or any language. Get back a clean, structured
          note in seconds. The AudioPen upgrade built for India.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <Link
            href="/auth/sign-in"
            className="rounded-full bg-foreground text-background px-7 py-3 text-base font-semibold hover:opacity-90 transition-opacity"
          >
            Start for free — no card needed
          </Link>
          <a
            href="#pricing"
            className="rounded-full border border-foreground/20 px-7 py-3 text-base font-medium hover:border-foreground/40 transition-colors"
          >
            See pricing
          </a>
        </div>
        <p className="text-xs text-foreground/40 mt-2">30 minutes free every month. Forever.</p>
      </section>

      {/* How it works */}
      <section className="flex flex-col items-center px-6 py-20 gap-12 bg-foreground/[0.02]">
        <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl w-full text-center">
          {(
            [
              { step: "1", title: "Record", desc: "Tap record, speak naturally in any language." },
              {
                step: "2",
                title: "Transcribe",
                desc: "AI transcribes your audio with high accuracy.",
              },
              {
                step: "3",
                title: "Clean up",
                desc: "Choose Verbatim, Light, or Full cleanup — get a polished note.",
              },
            ] as const
          ).map(({ step, title, desc }) => (
            <div key={step} className="flex flex-col items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center font-bold text-lg">
                {step}
              </span>
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-foreground/60 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="flex flex-col items-center px-6 py-20 gap-10">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight">Simple pricing</h2>
          <p className="mt-2 text-foreground/60">Rupee-first. Cancel anytime.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl w-full">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col rounded-2xl p-6 gap-4 border ${
                tier.highlight
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/15 bg-foreground/[0.03]"
              }`}
            >
              <div>
                <p className="text-sm font-medium opacity-60">{tier.name}</p>
                <p className="text-3xl font-extrabold mt-1 leading-none">{tier.priceInr}</p>
                <p className="text-xs opacity-50 mt-0.5">{tier.priceUsd} / month</p>
              </div>
              <ul className="flex flex-col gap-1.5 text-sm opacity-70 flex-1">
                <li>{tier.minutes}</li>
                <li>{tier.notes}</li>
              </ul>
              <Link
                href="/auth/sign-in"
                className={`rounded-full py-2.5 text-sm font-semibold text-center transition-opacity hover:opacity-80 ${
                  tier.highlight ? "bg-background text-foreground" : "bg-foreground text-background"
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="flex flex-col items-center px-6 py-20 gap-10 bg-foreground/[0.02]">
        <h2 className="text-3xl font-bold tracking-tight">FAQ</h2>
        <div className="flex flex-col gap-6 max-w-2xl w-full">
          {FAQS.map(({ q, a }) => (
            <div key={q} className="border-b border-foreground/10 pb-6">
              <p className="font-semibold mb-2">{q}</p>
              <p className="text-foreground/60 text-sm leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-col sm:flex-row items-center justify-between px-6 py-6 border-t border-foreground/10 text-xs text-foreground/40 gap-2">
        <span>
          © {new Date().getFullYear()} {APP_CONFIG.name}
        </span>
        <span>{APP_CONFIG.tagline}</span>
      </footer>
    </div>
  )
}

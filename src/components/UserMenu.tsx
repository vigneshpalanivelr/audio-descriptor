"use client"

import { useEffect, useRef, useState } from "react"

interface UserMenuProps {
  displayName: string
}

export function UserMenu({ displayName }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-foreground/60 hover:text-foreground transition-colors"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="max-w-[140px] truncate">{displayName}</span>
        <span className="text-xs opacity-50">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 rounded-xl border border-foreground/10 bg-background shadow-lg py-1 z-20"
        >
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              role="menuitem"
              className="w-full text-left px-4 py-2 text-sm text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

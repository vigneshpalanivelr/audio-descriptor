import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { UserMenu } from "@/components/UserMenu"

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("renders display name", () => {
    render(<UserMenu displayName="alice" />)
    expect(screen.getByText("alice")).toBeInTheDocument()
  })

  it("does not show sign-out initially", () => {
    render(<UserMenu displayName="alice" />)
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument()
  })

  it("shows dropdown on button click", () => {
    render(<UserMenu displayName="alice" />)
    fireEvent.click(screen.getByRole("button", { name: /alice/i }))
    expect(screen.getByText("Sign out")).toBeInTheDocument()
  })

  it("closes dropdown on outside click", () => {
    render(<UserMenu displayName="alice" />)
    fireEvent.click(screen.getByRole("button", { name: /alice/i }))
    expect(screen.getByText("Sign out")).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument()
  })

  it("toggles closed on second button click", () => {
    render(<UserMenu displayName="alice" />)
    const btn = screen.getByRole("button", { name: /alice/i })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument()
  })

  it("sets aria-expanded to true when open", () => {
    render(<UserMenu displayName="alice" />)
    const btn = screen.getByRole("button", { name: /alice/i })
    expect(btn).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(btn)
    expect(btn).toHaveAttribute("aria-expanded", "true")
  })

  it("shows down arrow when closed and up arrow when open", () => {
    render(<UserMenu displayName="alice" />)
    const btn = screen.getByRole("button", { name: /alice/i })
    expect(btn.textContent).toContain("▾")
    fireEvent.click(btn)
    expect(btn.textContent).toContain("▴")
  })
})

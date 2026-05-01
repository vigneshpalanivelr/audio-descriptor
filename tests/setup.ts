import "@testing-library/jest-dom"

// Silence console.error in tests unless explicitly needed
vi.spyOn(console, "error").mockImplementation(() => undefined)
vi.spyOn(console, "warn").mockImplementation(() => undefined)

import { test, expect } from "@playwright/test"

test("home page loads and returns 200", async ({ page }) => {
  const response = await page.goto("/")
  expect(response?.status()).toBe(200)
})

test("home page has a visible heading", async ({ page }) => {
  await page.goto("/")
  const heading = page.locator("h1").first()
  await expect(heading).toBeVisible()
})

test("404 page returns 404 status", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist")
  expect(response?.status()).toBe(404)
})

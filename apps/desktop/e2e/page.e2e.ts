import { expect, test } from "@playwright/test";

test("shows the dashboard with the app name and version it asks the host for", async ({ page }) => {
  await page.goto("/e2e/memory.html");
  await expect(page.getByRole("heading", { level: 1, name: "Your courses" })).toBeVisible();
  await expect(page.getByRole("banner")).toHaveText("Course Suite");
  await expect(page.getByRole("contentinfo")).toHaveText("Version 9.9.9");
  await expect(page).toHaveTitle("Course Suite");
});

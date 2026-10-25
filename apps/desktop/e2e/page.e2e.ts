import { expect, test } from "@playwright/test";

test("shows the app name and version it asks the host for", async ({ page }) => {
  await page.goto("/e2e/memory.html");
  await expect(page.getByRole("heading", { level: 1, name: "Course Suite" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Version 9.9.9, desktop edition");
  await expect(page).toHaveTitle("Course Suite");
});

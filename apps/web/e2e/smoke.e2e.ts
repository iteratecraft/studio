import { expect, test } from "@playwright/test";

// Proves the browser runner works: Chromium starts, renders a page and the assertion finds it.
test("renders a page", async ({ page }) => {
  await page.setContent(
    '<!doctype html><html lang="en"><title>Smoke test</title><main><p>ok</p></main></html>',
  );
  await expect(page.getByText("ok", { exact: true })).toBeVisible();
});

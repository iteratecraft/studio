// The kit gallery in a browser (M2-05, ENG-12 "the component kit passes axe and keyboard tests"):
// every component renders in both themes, in the pseudo-languages and in a high-contrast theme,
// with no axe violation (so none serious or critical), with every overlay open in turn.
import { expect, type Page, test } from "@playwright/test";
import { violations } from "./axe.ts";

const COMPONENT_SECTIONS = [
  "Buttons",
  "Toolbar",
  "Text fields",
  "Search field",
  "Toggle buttons",
  "Checkbox and switch",
  "Select",
  "Menu",
  "Tabs",
  "Dialog and popover",
  "Toast",
  "List box",
  "Reorderable list",
  "Tree",
  "Splitter",
  "Pagination",
  "Empty state",
  "Progress bar",
  "Icons",
];

const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

async function openGallery(page: Page, query = ""): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.getByRole("heading", { level: 1, name: "UI kit" })).toBeVisible();
}

/** Each overlay of the kit: how to open it, and what shows once it is open. */
const OVERLAYS: [string, (page: Page) => Promise<void>][] = [
  [
    "select",
    async (page) => {
      await region(page, "Select")
        .getByRole("button", { name: /Block width/ })
        .click();
      await expect(page.getByRole("listbox", { name: "Block width" })).toBeVisible();
    },
  ],
  [
    "menu",
    async (page) => {
      await page.getByRole("button", { name: "Lesson actions" }).click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
  ],
  [
    "dialog",
    async (page) => {
      await page.getByRole("button", { name: "Rename lesson" }).click();
      await expect(page.getByRole("dialog", { name: "Rename lesson" })).toBeVisible();
    },
  ],
  [
    "popover",
    async (page) => {
      await page.getByRole("button", { name: "Lesson details" }).click();
      await expect(page.getByRole("dialog", { name: "Lesson details" })).toBeVisible();
    },
  ],
  [
    "tooltip",
    async (page) => {
      await region(page, "Buttons").getByRole("button", { name: "Add a lesson" }).focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("tooltip")).toHaveText("Add a lesson");
    },
  ],
];

/** Checks the page as it is, then with each overlay open in turn. */
async function expectNoViolations(page: Page, state: string): Promise<void> {
  expect(await violations(page), state).toEqual([]);
  for (const [name, open] of OVERLAYS) {
    await open(page);
    expect(await violations(page), `${state}, ${name} open`).toEqual([]);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Delete a lesson" }).click();
  await expect(page.getByRole("alertdialog", { name: /Lesson deleted/ })).toBeVisible();
  expect(await violations(page), `${state}, toast open`).toEqual([]);
}

test("shows every component of the kit", async ({ page }) => {
  await openGallery(page);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(COMPONENT_SECTIONS);
});

for (const theme of ["light", "dark"] as const) {
  test(`has no axe violation in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light" });
    await openGallery(page, `?theme=${theme}`);
    // The pinned theme wins over the system one.
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe(theme === "light" ? "rgb(255, 255, 255)" : "rgb(22, 24, 29)");
    await expectNoViolations(page, theme);
  });

  test(`follows the system ${theme} theme until one is picked`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openGallery(page);
    const dark = "rgb(22, 24, 29)";
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await background()).toBe(theme === "dark" ? dark : "rgb(255, 255, 255)");
    await page.getByRole("button", { name: /Theme/ }).click();
    await page.getByRole("option", { name: theme === "dark" ? "Light" : "Dark" }).click();
    expect(await background()).toBe(theme === "dark" ? "rgb(255, 255, 255)" : dark);
  });
}

test("keeps controls, selection and focus visible in a high-contrast theme", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await openGallery(page);
  await expectNoViolations(page, "forced colours");
  // Selection and focus rings use system colours, which the high-contrast theme keeps.
  const selected = region(page, "List box").getByRole("option", { name: "English" });
  expect(await selected.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  );
  await region(page, "Buttons").getByRole("button", { name: "Publish" }).focus();
  await page.keyboard.press("Tab");
  const preview = region(page, "Buttons").getByRole("button", { name: "Preview" });
  await expect(preview).toBeFocused();
  expect(await preview.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
});

for (const [lang, dir] of [
  ["en-XA", "ltr"],
  ["ar-XB", "rtl"],
] as const) {
  test(`lays out the ${lang} pseudo-language ${dir} with the catalogue's texts`, async ({
    page,
  }) => {
    await openGallery(page, `?lang=${lang}`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    // Kit texts come from the catalogue, so they show pseudo-localised.
    await expect(region(page, "Reorderable list").getByText("[4 ìţèɱš~~~~~~]")).toBeVisible();
    await page.getByRole("button", { name: "Rename lesson" }).click();
    await expect(page.getByRole("button", { name: "[Çľòšè~~]" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expectNoViolations(page, lang);
  });
}

test("reflows to one column at 320 px without sideways scrolling (WCAG 1.4.10)", async ({
  page,
}) => {
  for (const lang of ["en", "en-XA", "ar-XB"]) {
    await page.setViewportSize({ width: 320, height: 800 });
    await openGallery(page, `?lang=${lang}`);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, lang).toBeLessThanOrEqual(320);
  }
});

test("stops motion for people who ask for less (as UI-ACCESSIBILITY-R40 asks of the player)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openGallery(page);
  const publish = region(page, "Buttons").getByRole("button", { name: "Publish" });
  expect(await publish.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
  const busy = page.getByRole("progressbar", { name: "Preparing the preview" });
  expect(
    await busy.locator(".cs-ProgressBar-fill").evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});

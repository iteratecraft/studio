import { expect, test } from "vitest";
import { checkDue, DAY_MS } from "./updates.js";

const now = Date.UTC(2026, 9, 29, 12);
const due = (change: Partial<Parameters<typeof checkDue>[0]> = {}) =>
  checkDue({ auto: true, online: true, last: undefined, now, ...change });

test("M2-20 [teams-collab:3R] R13: on by default, the first start checks; then at most once a day", () => {
  expect(due()).toBe(true);
  expect(due({ last: now - 1 })).toBe(false);
  expect(due({ last: now - DAY_MS + 1 })).toBe(false);
  expect(due({ last: now - DAY_MS })).toBe(true);
  // A clock set back before the last check would otherwise hold checks off until it catches up.
  expect(due({ last: now + 60_000 })).toBe(true);
});

test("M2-20 [teams-collab:3R] R12: no check at all when turned off or offline", () => {
  expect(due({ auto: false })).toBe(false);
  expect(due({ online: false })).toBe(false);
  expect(due({ auto: false, last: now - 10 * DAY_MS })).toBe(false);
});

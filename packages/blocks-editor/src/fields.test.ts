import { expect, test } from "vitest";
import { htmlOf } from "./fields.js";

test("blocks-editor 2.2: a description is kept as one escaped paragraph per line", () => {
  expect(htmlOf("Tools & <safety>\n\n  Second line  ")).toBe(
    "<p>Tools &amp; &lt;safety&gt;</p><p>Second line</p>",
  );
  expect(htmlOf(" \n ")).toBe("");
});

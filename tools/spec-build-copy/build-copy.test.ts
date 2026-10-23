import { spawnSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildCopy, host, replaceUrls, urlId } from "./build-copy.ts";

// The shapes the specs use: labelled source bullets, several URLs on one line, a URL in brackets,
// trailing punctuation, and a URL cited in the body.
const SPEC = `# Spec: demo

## 5. Behaviour rules

1. Resume restores the page (see https://help.example.com/article/Resume). [doc D1]

## 8. Sources

### Public documentation
- D1 https://help.example.com/article/Resume
- D2 https://help.example.com/a and https://help.example.com/b; www.example.org/page.
- E1, E3 https://course.example.net/m1/ (source https://git.example.org/team/m1)
- S1 Open standard: https://standards.example.org/spec?x=1#part
`;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "spec-copy-"));
  dirs.push(dir);
  return dir;
};

describe("specs:build-copy", () => {
  test("replaces every URL and keeps everything else", () => {
    const urls = new Map<string, string>();
    const copy = replaceUrls(SPEC, urls);
    expect(copy).not.toMatch(/https?:|www\.|example/);
    const id = urlId("https://help.example.com/article/Resume");
    expect(copy).toContain(`1. Resume restores the page (see [${id}]). [doc D1]`);
    expect(copy).toContain(`- D1 [${id}]\n`);
    expect(copy).toContain(
      `- D2 [${urlId("https://help.example.com/a")}] and [${urlId("https://help.example.com/b")}]; ` +
        `[${urlId("www.example.org/page")}].`,
    );
    expect(copy).toContain(`(source [${urlId("https://git.example.org/team/m1")}])`);
    expect(copy).toContain(
      `- S1 Open standard: [${urlId("https://standards.example.org/spec?x=1#part")}]`,
    );
    expect(urls.size).toBe(7);
    // Only the URLs changed: putting them back gives the original text.
    let restored = copy;
    for (const [key, url] of urls) restored = restored.replaceAll(`[${key}]`, url);
    expect(restored).toBe(SPEC);
  });

  test("gives a URL the same id in every file and every run", () => {
    // A fixed value: the id depends only on the URL, never on its position or file.
    expect(urlId("https://help.example.com/a")).toBe("url-3a035f2b");
    expect(replaceUrls("Moved: https://help.example.com/a")).toBe("Moved: [url-3a035f2b]");
    expect(urlId("https://help.example.com/a")).not.toBe(urlId("https://help.example.com/b"));
  });

  test("names the hosts it removed", () => {
    expect(host("https://Help.Example.com:443/a")).toBe("help.example.com");
    expect(host("www.example.org/page")).toBe("www.example.org");
  });

  test("copies only the Markdown files and refuses to overwrite the originals", () => {
    const from = tempDir();
    const out = join(tempDir(), "build");
    writeFileSync(join(from, "demo.md"), SPEC);
    writeFileSync(join(from, "notes.txt"), "https://help.example.com/a");
    const { files, urls } = buildCopy(from, out);
    expect(files).toEqual(["demo.md"]);
    expect(urls.size).toBe(7);
    expect(readFileSync(join(out, "demo.md"), "utf8")).toBe(replaceUrls(SPEC));
    expect(existsSync(join(out, "notes.txt"))).toBe(false);
    expect(() => buildCopy(from, from)).toThrow("must not be or contain each other");
    expect(() => buildCopy(tempDir(), out)).toThrow("No .md files");
  });

  test("replaces an --out file hard-linked to a spec instead of writing through it", () => {
    const from = tempDir();
    const out = tempDir();
    writeFileSync(join(from, "demo.md"), SPEC);
    linkSync(join(from, "demo.md"), join(out, "demo.md"));
    buildCopy(from, out);
    expect(readFileSync(join(from, "demo.md"), "utf8")).toBe(SPEC);
    expect(readFileSync(join(out, "demo.md"), "utf8")).toBe(replaceUrls(SPEC));
    expect(readdirSync(out)).toEqual(["demo.md"]);
  });

  describe("refuses an --out that is, holds or sits inside --from", () => {
    const specs = (name = "Specs") => {
      const from = join(tempDir(), name);
      mkdirSync(from);
      writeFileSync(join(from, "demo.md"), SPEC);
      return from;
    };
    // `original` is the real specs folder; it must come out untouched.
    const refuses = (from: string, out: string, original = from) => {
      expect(() => buildCopy(from, out)).toThrow("must not be or contain each other");
      expect(readFileSync(join(original, "demo.md"), "utf8")).toBe(SPEC);
    };

    test.runIf(process.platform === "win32")("a case variant of the same folder", () => {
      const from = specs();
      refuses(from, join(dirname(from), "specs"));
      refuses(from, join(dirname(from), "SPECS", "build"));
      refuses(join(dirname(from), "sPeCs"), from, from);
    });

    test("a junction or symlink to it", () => {
      const from = specs();
      const link = join(tempDir(), "link");
      // A junction on Windows (no admin rights needed), a directory symlink elsewhere.
      symlinkSync(from, link, "junction");
      refuses(from, link);
      refuses(link, from);
      refuses(from, join(link, "build"));
      refuses(dirname(from), link, from);
    });

    test("a folder inside it, or one that holds it", () => {
      const from = specs();
      refuses(from, join(from, "build"));
      refuses(join(from, "build"), from, from);
      refuses(from, dirname(from));
      expect(existsSync(join(from, "build"))).toBe(false);
    });
  });

  test("runs from the command line", { timeout: 30_000 }, () => {
    const from = tempDir();
    const out = join(tempDir(), "build");
    writeFileSync(join(from, "demo.md"), SPEC);
    const script = join(import.meta.dirname, "build-copy.ts");
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", script, ...args], {
        encoding: "utf8",
      });
    const ok = run("--from", from, "--out", out);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("7 distinct URLs replaced in 1 files");
    expect(ok.stdout).toContain(
      "Hosts removed: course.example.net, git.example.org, help.example.com, standards.example.org, www.example.org",
    );
    expect(readFileSync(join(out, "demo.md"), "utf8")).not.toContain("http");
    const missing = run("--from", from);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("Usage:");
  });
});

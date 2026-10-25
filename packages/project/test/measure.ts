// Save and open time of the largest course in the Blocks corpus, and of the same course with 100
// MiB of media added, on Node's file system. After `pnpm build`, from the repository root:
//   node packages/project/test/measure.ts
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Course } from "@course-suite/format";
import { addAsset, createProject, openProject, saveProject } from "@course-suite/project";
import { loadBlocksCorpus, TEST_COURSES_DIR } from "./corpus.ts";
import { nodeProjectFiles } from "./node-files.ts";

const corpus = loadBlocksCorpus();
if (!corpus?.length) throw new Error(`No corpus at ${TEST_COURSES_DIR}`);
const largest = corpus.reduce((a, b) => (b.text.length > a.text.length ? b : a));
const RUNS = 20;

async function measure(label: string, extraMedia: number) {
  const course = JSON.parse(largest.text) as Course;
  const project = createProject(course);
  for (const key of largest.mediaFiles) {
    const data = readFileSync(join(TEST_COURSES_DIR, "blocks", largest.name, "media", key));
    await addAsset(project, data, { name: key, type: "image/svg+xml", source: "upload" }, key);
  }
  for (let i = 0; i < extraMedia; i++) {
    const data = new Uint8Array(1024 * 1024).map((_, j) => (j * 31 + i) % 256);
    await addAsset(project, data, { name: `video${i}.mp4`, type: "video/mp4", source: "upload" });
  }
  const dir = mkdtempSync(join(tmpdir(), "project-measure-"));
  const files = nodeProjectFiles(dir);
  const save: number[] = [];
  const open: number[] = [];
  const cpu = process.cpuUsage();
  try {
    for (let run = 0; run < RUNS; run++) {
      let start = performance.now();
      await saveProject(files, "Measured.crs", project);
      save.push(performance.now() - start);
      start = performance.now();
      const opened = await openProject(files, "Measured.crs");
      if (!opened.ok) throw new Error(JSON.stringify(opened.problems));
      open.push(performance.now() - start);
    }
    const used = process.cpuUsage(cpu);
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];
    const ms = (value = 0) => `${value.toFixed(1)} ms`;
    console.log(
      `${label}: file ${(statSync(join(dir, "Measured.crs")).size / 1024).toFixed(0)} KiB; ` +
        `save first ${ms(save[0])}, median ${ms(median(save))}; ` +
        `open first ${ms(open[0])}, median ${ms(median(open))}; ` +
        `CPU ${((used.user + used.system) / 1000 / RUNS).toFixed(1)} ms per save and open; ` +
        `RSS ${(process.memoryUsage().rss / 2 ** 20).toFixed(0)} MiB`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`Largest corpus course: ${largest.name} (${largest.text.length} bytes of JSON)`);
await measure(largest.name, 0);
await measure(`${largest.name} + 100 MiB media`, 100);

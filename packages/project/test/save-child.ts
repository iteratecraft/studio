// Run by crash.test.ts in a child Node process: opens the project file, prints "ready", then
// saves, autosaves and snapshots it over and over until the parent kills the process.
// Usage: node save-child.ts <folder> <file name>
import {
  addAsset,
  autosaveProject,
  openProject,
  saveProject,
  takeSnapshot,
} from "@course-suite/project";
import { nodeProjectFiles } from "./node-files.ts";

const [folder = "", name = ""] = process.argv.slice(2);
const files = nodeProjectFiles(folder);
const opened = await openProject(files, name);
if (!opened.ok) throw new Error(JSON.stringify(opened.problems));
const project = opened.recovered ?? opened.project;
process.stdout.write("ready\n");
for (let i = 0; ; i++) {
  project.course = { ...project.course, title: `Save ${process.pid} ${i}` };
  if (i % 5 === 1) {
    // Replaces the bytes of one asset, so old bytes leave the file unless a snapshot keeps them.
    const data = crypto.getRandomValues(new Uint8Array(64 * 1024));
    await addAsset(
      project,
      data,
      { name: "changing.bin", type: "font/woff2", source: "upload" },
      "changing.bin",
    );
  }
  if (i % 7 === 3) {
    takeSnapshot(project, { name: `v${i}`, trigger: "export" });
    if (project.snapshots.length > 4) project.snapshots.shift();
  }
  if (i % 3 === 2) await autosaveProject(files, name, project);
  else await saveProject(files, name, project);
}

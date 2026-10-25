import { createDesktopHost } from "./desktop-host.js";
import { showPage } from "./page.js";

const root = document.getElementById("app");
if (!root) throw new Error("index.html has no #app element");
await showPage(createDesktopHost(), root);

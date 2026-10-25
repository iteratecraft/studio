import "@course-suite/ui/styles.css";
import "./gallery.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Gallery } from "./gallery.js";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);

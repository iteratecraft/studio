// A stub player bundle and course for building real packages with @course-suite/exporters in tests,
// written by hand for this package. Its boot script finds the SCORM 1.2 API, reports the course data
// it was given and finishes, so a test can see that the package's files load in an LMS.
import type { BuildInput, PlayerBundle } from "@course-suite/exporters";
import { scorm12Exporter } from "@course-suite/exporters";
import type { Course } from "@course-suite/format";

const bytes = (text: string) => new TextEncoder().encode(text);

const BOOT = `(function () {
  var w = window, api = null;
  for (var depth = 0; w && depth < 10; depth++) {
    if (w.API) { api = w.API; break; }
    if (w === w.parent) break;
    w = w.parent;
  }
  var data = window.stubCourseData;
  api.LMSInitialize("");
  api.LMSSetValue("cmi.core.lesson_location", data.course.entries[0].id);
  api.LMSSetValue("cmi.core.lesson_status", "completed");
  api.LMSCommit("");
  api.LMSFinish("");
})();
`;

export function stubPlayer(): PlayerBundle {
  return {
    launchPage: "index.html",
    files: new Map([
      [
        "index.html",
        bytes(
          '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>Course</title></head>\n' +
            '<body>\n<script src="course/data.js"></script>\n<script src="player/boot.js"></script>\n' +
            "</body>\n</html>\n",
        ),
      ],
      ["player/boot.js", bytes(BOOT)],
    ]),
    courseDataScript: (data) => ({
      path: "course/data.js",
      data: bytes(`window.stubCourseData = ${JSON.stringify(data)};\n`),
    }),
  };
}

export function stubCourse(): Course {
  return {
    schemaVersion: "1.0",
    id: "3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    kind: "course",
    title: "Workshop safety",
    cover: { key: "cover.jpg", alt: "A tidy bench" },
    publish: { standard: "scorm12", passingScore: 80, manifestIdentifier: "workshop_safety" },
    entries: [{ id: "lesson0001", kind: "lesson", title: "Before you start", blocks: [] }],
    media: [{ id: "media00001", key: "cover.jpg", source: "upload" }],
    ext: { "org.example.plugin": { secret: "author-only" } },
  };
}

export function stubInput(): BuildInput {
  return {
    course: stubCourse(),
    player: stubPlayer(),
    exporter: scorm12Exporter(),
    media: (key) => (key === "cover.jpg" ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) : undefined),
    packageVersion: 2,
  };
}

// Reads a course package: safe unzip, then the one descriptor at its root, then a check that the
// launch href is an http(s) URL or names a file the package contains.
import { defaultZipLimits, readZip, type ZipArchive, type ZipLimits } from "@course-suite/zip";
import { fail, ok, type Result } from "./result.js";
import { parseScormManifest, SCORM_MANIFEST, type ScormManifest } from "./scorm-manifest.js";
import {
  CMI5_XML,
  type Cmi5Course,
  parseCmi5Xml,
  parseTincanXml,
  TINCAN_XML,
  type TincanDescriptor,
} from "./xapi-descriptors.js";

export type PackageDescriptor =
  | { kind: "scorm"; manifest: ScormManifest }
  | { kind: "tincan"; tincan: TincanDescriptor }
  | { kind: "cmi5"; course: Cmi5Course };

export interface CoursePackage {
  /** The package's files by entry name, such as `index.html` or `scorm/api.js`. */
  files: ZipArchive;
  descriptor: PackageDescriptor;
  /** Launch href relative to the package root (query and fragment kept), or an absolute URL. */
  launchHref: string;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

export async function readPackage(
  zip: Uint8Array,
  limits: ZipLimits = defaultZipLimits,
): Promise<Result<CoursePackage>> {
  const unzipped = await readZip(zip, limits);
  if (!unzipped.ok) return unzipped;
  const files = unzipped.value;

  const found = [SCORM_MANIFEST, TINCAN_XML, CMI5_XML].filter((name) => files.has(name));
  if (found.length !== 1) {
    const message =
      found.length === 0
        ? `has no ${SCORM_MANIFEST}, ${TINCAN_XML} or ${CMI5_XML} at its root`
        : `has more than one descriptor at its root (${found.join(", ")})`;
    return fail([{ file: "", message }]);
  }
  const name = found[0] ?? "";
  let xml: string;
  try {
    xml = utf8.decode(await files.read(name));
  } catch {
    return fail([{ file: name, message: "is not valid UTF-8" }]);
  }

  let descriptor: PackageDescriptor;
  let launchHref: string;
  if (name === SCORM_MANIFEST) {
    const parsed = parseScormManifest(xml);
    if (!parsed.ok) return parsed;
    descriptor = { kind: "scorm", manifest: parsed.value };
    launchHref = parsed.value.launch.href;
  } else if (name === TINCAN_XML) {
    const parsed = parseTincanXml(xml);
    if (!parsed.ok) return parsed;
    descriptor = { kind: "tincan", tincan: parsed.value };
    launchHref = parsed.value.launch.href;
  } else {
    const parsed = parseCmi5Xml(xml);
    if (!parsed.ok) return parsed;
    descriptor = { kind: "cmi5", course: parsed.value };
    launchHref = parsed.value.launch.href;
  }

  const target = launchFile(launchHref);
  if (typeof target === "object") {
    return fail([{ file: name, message: `launches '${launchHref}', which ${target.problem}` }]);
  }
  if (target !== undefined && !files.has(target)) {
    return fail([{ file: name, message: `launches '${launchHref}', which is not in the package` }]);
  }
  return ok({ files, descriptor, launchHref });
}

/**
 * The package file a relative launch href opens, with `.` and `..` segments resolved; undefined for
 * an http(s) URL; or why the href cannot launch.
 */
export function launchFile(href: string): string | undefined | { problem: string } {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();
  if (scheme === "http" || scheme === "https") return undefined;
  if (scheme !== undefined || href.startsWith("/")) {
    return { problem: "is neither a path inside the package nor an http(s) URL" };
  }
  const path = href.replace(/[?#].*$/, "");
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    decoded = path;
  }
  const segments: string[] = [];
  for (const segment of decoded.split("/")) {
    if (segment === "..") {
      if (segments.pop() === undefined) return { problem: "climbs out of the package" };
    } else if (segment !== ".") {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

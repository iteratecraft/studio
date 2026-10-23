// Reads a course package: safe unzip, then the one descriptor at its root, then a check that a
// relative launch href names a file the package contains.
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
import { defaultZipLimits, readZip, type ZipLimits } from "./zip.js";

export type PackageDescriptor =
  | { kind: "scorm"; manifest: ScormManifest }
  | { kind: "tincan"; tincan: TincanDescriptor }
  | { kind: "cmi5"; course: Cmi5Course };

export interface CoursePackage {
  /** File contents keyed by entry name, such as `index.html` or `scorm/api.js`. */
  files: Map<string, Uint8Array>;
  descriptor: PackageDescriptor;
  /** Launch href relative to the package root (query and fragment kept), or an absolute URL. */
  launchHref: string;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

export function readPackage(
  zip: Uint8Array,
  limits: ZipLimits = defaultZipLimits,
): Result<CoursePackage> {
  const unzipped = readZip(zip, limits);
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
    xml = utf8.decode(files.get(name));
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
  if (target !== undefined && !files.has(target)) {
    return fail([{ file: name, message: `launches '${launchHref}', which is not in the package` }]);
  }
  return ok({ files, descriptor, launchHref });
}

/** The package file a relative href opens, or undefined for an absolute URL. */
export function launchFile(href: string): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return undefined;
  const path = href.replace(/[?#].*$/, "");
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

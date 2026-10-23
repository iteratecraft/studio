// Parses imsmanifest.xml for SCORM 1.2 and SCORM 2004 and picks the launch href of the default
// organization (standards.md S-2). It does not validate against the XSDs.
import type { Element } from "@xmldom/xmldom";
import type { Result } from "./result.js";
import { attr, child, children, parseXml, problemsFor, text } from "./xml.js";

export type ScormVersion = "scorm12" | "scorm2004";

export interface ScormItem {
  identifier: string;
  title: string;
  identifierref?: string;
  parameters?: string;
  isvisible: boolean;
  /** SCORM 1.2 `adlcp:masteryscore`, 0 to 100. */
  masteryScore?: number;
  children: ScormItem[];
}

export interface ScormOrganization {
  identifier: string;
  title: string;
  items: ScormItem[];
}

export interface ScormResource {
  identifier: string;
  type: string;
  scormType: "sco" | "asset";
  /** `href` with every `xml:base` above it applied. */
  href?: string;
  files: string[];
  dependencies: string[];
}

export interface ScormManifest {
  version: ScormVersion;
  /** `metadata/schemaversion` as written, such as "1.2" or "2004 4th Edition". */
  schemaVersion?: string;
  identifier: string;
  defaultOrganization: string;
  organizations: ScormOrganization[];
  resources: ScormResource[];
  /** The first item of the default organization that references a resource. */
  launch: { item: string; resource: string; href: string };
}

export const SCORM_MANIFEST = "imsmanifest.xml";

export function parseScormManifest(xml: string): Result<ScormManifest> {
  const parsed = parseXml(SCORM_MANIFEST, xml);
  if (!parsed.ok) return parsed;
  const root = parsed.value;
  const { problems, add } = problemsFor(SCORM_MANIFEST);
  const required = (element: Element, name: string) => {
    const value = attr(element, name);
    if (value === undefined) add(element, `is missing ${name}`, name);
    return value ?? "";
  };

  if (root.localName !== "manifest") add(root, "must be a <manifest> element");
  const identifier = required(root, "identifier");
  const schemaVersionElement = child(child(root, "metadata") ?? root, "schemaversion");
  const schemaVersion = text(schemaVersionElement);
  const namespaces = Array.from(root.attributes)
    .map((a) => a.value)
    .join(" ");
  let version: ScormVersion | undefined;
  if (schemaVersion === "1.2") version = "scorm12";
  else if (schemaVersion && /^(2004\b|CAM 1\.3$)/.test(schemaVersion)) version = "scorm2004";
  else if (!schemaVersion && namespaces.includes("adlcp_rootv1p2")) version = "scorm12";
  else if (!schemaVersion && namespaces.includes("adlcp_v1p3")) version = "scorm2004";
  if (!version) {
    add(
      schemaVersionElement ?? root,
      schemaVersion
        ? `has unknown schemaversion '${schemaVersion}'`
        : "has no metadata/schemaversion and no SCORM namespace to tell the version",
    );
  }

  const resourcesElement = child(root, "resources");
  const resources: ScormResource[] = [];
  const resourceIds = new Set<string>();
  if (!resourcesElement) add(root, "is missing <resources>");
  const base = (element: Element | undefined) => (element && attr(element, "base")) ?? "";
  const resourcesBase = base(root) + base(resourcesElement);
  for (const element of resourcesElement ? children(resourcesElement, "resource") : []) {
    const identifier = required(element, "identifier");
    if (resourceIds.has(identifier))
      add(element, `repeats identifier '${identifier}'`, "identifier");
    resourceIds.add(identifier);
    const scormType = attr(element, "scormType");
    if (scormType !== "sco" && scormType !== "asset") {
      add(element, "needs adlcp:scormType 'sco' or 'asset'", "scormType");
    }
    const href = attr(element, "href");
    if (scormType === "sco" && href === undefined) add(element, "is a SCO without href", "href");
    resources.push({
      identifier,
      type: required(element, "type"),
      scormType: scormType === "asset" ? "asset" : "sco",
      ...(href !== undefined && { href: resourcesBase + base(element) + href }),
      files: children(element, "file").flatMap((f) => attr(f, "href") ?? []),
      dependencies: children(element, "dependency").flatMap((d) => attr(d, "identifierref") ?? []),
    });
  }

  const readItem = (element: Element): ScormItem => {
    const identifierref = attr(element, "identifierref");
    if (identifierref !== undefined && !resourceIds.has(identifierref)) {
      add(element, `references missing resource '${identifierref}'`, "identifierref");
    }
    const parameters = attr(element, "parameters");
    const masteryText = text(child(element, "masteryscore"));
    const masteryScore = masteryText === undefined ? undefined : Number(masteryText);
    if (masteryScore !== undefined && !(masteryScore >= 0 && masteryScore <= 100)) {
      add(child(element, "masteryscore") ?? element, "must be a number from 0 to 100");
    }
    return {
      identifier: required(element, "identifier"),
      title: text(child(element, "title")) ?? "",
      ...(identifierref !== undefined && { identifierref }),
      ...(parameters !== undefined && { parameters }),
      isvisible: attr(element, "isvisible") !== "false",
      ...(masteryScore !== undefined && { masteryScore }),
      children: children(element, "item").map(readItem),
    };
  };

  const organizationsElement = child(root, "organizations");
  if (!organizationsElement) add(root, "is missing <organizations>");
  const organizations = (
    organizationsElement ? children(organizationsElement, "organization") : []
  ).map((element) => ({
    identifier: required(element, "identifier"),
    title: text(child(element, "title")) ?? "",
    items: children(element, "item").map(readItem),
  }));
  const declaredDefault = organizationsElement && attr(organizationsElement, "default");
  const organization = declaredDefault
    ? organizations.find((o) => o.identifier === declaredDefault)
    : organizations[0];
  if (organizationsElement && declaredDefault && !organization) {
    add(organizationsElement, `names missing organization '${declaredDefault}'`, "default");
  }

  let launch: ScormManifest["launch"] | undefined;
  const launchItem = organization && firstLaunchable(organization.items);
  const launchResource = resources.find((r) => r.identifier === launchItem?.identifierref);
  if (organizationsElement && organization && !launchItem) {
    add(organizationsElement, `organization '${organization.identifier}' has no item to launch`);
  } else if (organizationsElement && !organization && !declaredDefault) {
    add(organizationsElement, "has no organization to launch");
  } else if (organizationsElement && launchItem && launchResource && !launchResource.href) {
    add(organizationsElement, `launch resource '${launchResource.identifier}' has no href`);
  } else if (launchItem && launchResource?.href) {
    launch = {
      item: launchItem.identifier,
      resource: launchResource.identifier,
      href: withParameters(launchResource.href, launchItem.parameters),
    };
  }
  // Every path that leaves version or launch unset has added a problem.
  if (problems.length > 0 || !version || !launch || !organization) return { ok: false, problems };
  return {
    ok: true,
    value: {
      version,
      ...(schemaVersion !== undefined && { schemaVersion }),
      identifier,
      defaultOrganization: organization.identifier,
      organizations,
      resources,
      launch,
    },
  };
}

function firstLaunchable(items: ScormItem[]): ScormItem | undefined {
  for (const item of items) {
    const found = item.identifierref ? item : firstLaunchable(item.children);
    if (found) return found;
  }
  return undefined;
}

// shortcut: covers '?a=1', '&a=1', 'a=1' and '#frag' parameters; IMS CP's full rules also
// normalise repeated separators, add them if a package needs it.
function withParameters(href: string, parameters: string | undefined): string {
  if (!parameters) return href;
  if (parameters.startsWith("#")) return href + parameters;
  return href + (href.includes("?") ? "&" : "?") + parameters.replace(/^[?&]/, "");
}

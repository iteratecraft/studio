// Parses the two xAPI package descriptors: tincan.xml (xAPI launch packages) and cmi5.xml (the
// cmi5 course structure). Neither is validated against its XSD.
import type { Element } from "@xmldom/xmldom";
import type { Result } from "./result.js";
import { attr, child, children, parseXml, problemsFor, text } from "./xml.js";

export const TINCAN_XML = "tincan.xml";
export const CMI5_XML = "cmi5.xml";

export interface TincanActivity {
  id: string;
  type?: string;
  name?: string;
  launch?: string;
}

export interface TincanDescriptor {
  activities: TincanActivity[];
  /** The first activity with a `<launch>`. */
  launch: { activityId: string; href: string };
}

export function parseTincanXml(xml: string): Result<TincanDescriptor> {
  const parsed = parseXml(TINCAN_XML, xml);
  if (!parsed.ok) return parsed;
  const root = parsed.value;
  const { problems, add } = problemsFor(TINCAN_XML);
  if (root.localName !== "tincan") add(root, "must be a <tincan> element");
  const activitiesElement = child(root, "activities");
  if (!activitiesElement) add(root, "is missing <activities>");
  const activities = (activitiesElement ? children(activitiesElement, "activity") : []).map(
    (element): TincanActivity => {
      const id = attr(element, "id");
      if (id === undefined) add(element, "is missing id", "id");
      const type = attr(element, "type");
      const name = text(child(element, "name"));
      const launch = text(child(element, "launch"));
      return {
        id: id ?? "",
        ...(type !== undefined && { type }),
        ...(name !== undefined && { name }),
        ...(launch !== undefined && { launch }),
      };
    },
  );
  const launchable = activities.find((a) => a.launch !== undefined);
  if (activitiesElement && !launchable) add(activitiesElement, "has no activity with <launch>");
  if (problems.length > 0 || !launchable?.launch) return { ok: false, problems };
  return {
    ok: true,
    value: { activities, launch: { activityId: launchable.id, href: launchable.launch } },
  };
}

export interface LangString {
  lang?: string;
  value: string;
}

export const MOVE_ON = [
  "Passed",
  "Completed",
  "CompletedAndPassed",
  "CompletedOrPassed",
  "NotApplicable",
] as const;
export type MoveOn = (typeof MOVE_ON)[number];

export interface Cmi5Au {
  kind: "au";
  id: string;
  title: LangString[];
  description: LangString[];
  url: string;
  moveOn: MoveOn;
  masteryScore?: number;
  launchMethod: "AnyWindow" | "OwnWindow";
  activityType?: string;
  launchParameters?: string;
  entitlementKey?: string;
}

export interface Cmi5Block {
  kind: "block";
  id: string;
  title: LangString[];
  description: LangString[];
  children: (Cmi5Block | Cmi5Au)[];
}

export interface Cmi5Course {
  id: string;
  title: LangString[];
  description: LangString[];
  children: (Cmi5Block | Cmi5Au)[];
  /** The first AU in document order. */
  launch: { auId: string; href: string };
}

export function parseCmi5Xml(xml: string): Result<Cmi5Course> {
  const parsed = parseXml(CMI5_XML, xml);
  if (!parsed.ok) return parsed;
  const root = parsed.value;
  const { problems, add } = problemsFor(CMI5_XML);
  const id = (element: Element) => {
    const value = attr(element, "id");
    if (value === undefined) add(element, "is missing id", "id");
    return value ?? "";
  };
  const langStrings = (parent: Element, name: string, isRequired: boolean): LangString[] => {
    const element = child(parent, name);
    if (!element) {
      if (isRequired) add(parent, `is missing <${name}>`);
      return [];
    }
    const strings = children(element, "langstring").map((s) => {
      const lang = attr(s, "lang");
      return { ...(lang !== undefined && { lang }), value: text(s) ?? "" };
    });
    if (strings.length === 0) add(element, "needs at least one <langstring>");
    return strings;
  };
  const nodes = (parent: Element): (Cmi5Block | Cmi5Au)[] =>
    Array.from(parent.childNodes).flatMap<Cmi5Block | Cmi5Au>((node) => {
      const element = node as Element;
      if (element.localName === "au") return [readAu(element)];
      if (element.localName === "block") {
        return [
          {
            kind: "block",
            id: id(element),
            title: langStrings(element, "title", true),
            description: langStrings(element, "description", true),
            children: nodes(element),
          },
        ];
      }
      return [];
    });
  const readAu = (element: Element): Cmi5Au => {
    const url = text(child(element, "url"));
    if (url === undefined) add(element, "is missing <url>");
    const moveOn = attr(element, "moveOn") ?? "NotApplicable";
    if (!(MOVE_ON as readonly string[]).includes(moveOn)) {
      add(element, `has unknown moveOn '${moveOn}'`, "moveOn");
    }
    const launchMethod = attr(element, "launchMethod") ?? "AnyWindow";
    if (launchMethod !== "AnyWindow" && launchMethod !== "OwnWindow") {
      add(element, `has unknown launchMethod '${launchMethod}'`, "launchMethod");
    }
    const masteryText = attr(element, "masteryScore");
    const masteryScore = masteryText === undefined ? undefined : Number(masteryText);
    if (masteryScore !== undefined && !(masteryScore >= 0 && masteryScore <= 1)) {
      add(element, "must be a decimal from 0 to 1", "masteryScore");
    }
    const activityType = attr(element, "activityType");
    const launchParameters = text(child(element, "launchParameters"));
    const entitlementKey = text(child(element, "entitlementKey"));
    return {
      kind: "au",
      id: id(element),
      title: langStrings(element, "title", true),
      description: langStrings(element, "description", true),
      url: url ?? "",
      moveOn: moveOn as MoveOn,
      ...(masteryScore !== undefined && { masteryScore }),
      launchMethod: launchMethod === "OwnWindow" ? "OwnWindow" : "AnyWindow",
      ...(activityType !== undefined && { activityType }),
      ...(launchParameters !== undefined && { launchParameters }),
      ...(entitlementKey !== undefined && { entitlementKey }),
    };
  };

  if (root.localName !== "courseStructure") add(root, "must be a <courseStructure> element");
  const course = child(root, "course");
  if (!course) add(root, "is missing <course>");
  const value = {
    id: course ? id(course) : "",
    title: course ? langStrings(course, "title", true) : [],
    description: course ? langStrings(course, "description", true) : [],
    children: nodes(root),
  };
  const first = firstAu(value.children);
  if (!first) add(root, "has no <au>");
  if (problems.length > 0 || !first) return { ok: false, problems };
  return { ok: true, value: { ...value, launch: { auId: first.id, href: first.url } } };
}

function firstAu(nodes: (Cmi5Block | Cmi5Au)[]): Cmi5Au | undefined {
  for (const node of nodes) {
    const found = node.kind === "au" ? node : firstAu(node.children);
    if (found) return found;
  }
  return undefined;
}

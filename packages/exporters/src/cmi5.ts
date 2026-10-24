// cmi5 exporter (STD-07, M1-26; standards.md §3.4 E-19..E-22, §4.5): cmi5.xml at the package root,
// a course structure with the course and one AU that launches the player. Ids are IRIs built from
// stable ids (E-16), so a republish keeps them; move-on and mastery come from the publish settings.
// The LMS hands the AU its LRS, credentials and learner at launch, so nothing about them is written.
import { activityIri, type Course, plainText } from "@course-suite/format";
import { MOVE_ON, type MoveOn } from "@course-suite/tracking";
import { DOMParser, type Element } from "@xmldom/xmldom";
import type { DescribeInput, Exporter } from "./builder.js";
import { ok, type Problem } from "./result.js";

export const CMI5_XML = "cmi5.xml";
const NS = "https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd";

/** The AU's id below the course IRI. Not a content id, which is always 10 characters. */
export const CMI5_AU = "au";

/**
 * What the LMS waits for (E-22): the author's choice, else Passed when a quiz decides the result and
 * Completed otherwise, which is what the player reports when the course is done.
 */
export function cmi5MoveOn(course: Course): MoveOn {
  return (
    course.publish?.moveOn ?? (course.publish?.tracking?.kind === "quiz" ? "Passed" : "Completed")
  );
}

export function cmi5Exporter(): Exporter {
  return {
    standard: "cmi5",
    describe: (input) => ok([{ path: CMI5_XML, data: new TextEncoder().encode(cmi5Xml(input)) }]),
    check,
  };
}

function cmi5Xml({ course, launchPage }: DescribeInput): string {
  const language = course.sourceLanguage ?? course.labelSet?.language ?? "en";
  const text = (name: string, value: string) =>
    `<${name}><langstring lang="${esc(language)}">${esc(value)}</langstring></${name}>`;
  const description = course.description ? plainText(course.description) : course.title;
  const passing = course.publish?.passingScore;
  // The same passing score SCORM 1.2 writes as its mastery score, scaled to 0-1 (cmi5 §13.1.4).
  const mastery = passing === undefined ? "" : ` masteryScore="${passing / 100}"`;
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<courseStructure xmlns="${NS}">`,
    `  <course id="${esc(activityIri(course))}">`,
    `    ${text("title", course.title)}`,
    `    ${text("description", description)}`,
    `  </course>`,
    `  <au id="${esc(activityIri(course, CMI5_AU))}" moveOn="${cmi5MoveOn(course)}"${mastery} launchMethod="AnyWindow">`,
    `    ${text("title", course.title)}`,
    `    ${text("description", description)}`,
    `    <url>${esc(launchPage)}</url>`,
    `  </au>`,
    `</courseStructure>`,
    ``,
  ].join("\n");
}

/**
 * Checks a finished package: cmi5.xml is well-formed in the cmi5 namespace, the course and every AU
 * have ids, titles and descriptions, the AU's move-on and mastery score are valid, and its URL is a
 * page in the package.
 *
 * shortcut: a structural check, not XSD validation; the CourseStructure.xsd is not shipped.
 */
function check(files: ReadonlyMap<string, Uint8Array>): Problem[] {
  const bytes = files.get(CMI5_XML);
  if (!bytes) return [{ file: CMI5_XML, message: "is missing" }];
  const problems: Problem[] = [];
  const add = (element: Element | undefined, message: string) => {
    const line = element?.lineNumber;
    problems.push({ file: CMI5_XML, ...(line !== undefined && { line }), message });
  };
  let root: Element | null;
  try {
    const parser = new DOMParser({
      onError: (level, message) => {
        if (level !== "warning") throw new Error(message);
      },
    });
    root = parser.parseFromString(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      "text/xml",
    ).documentElement;
  } catch (error) {
    add(
      undefined,
      `is not well-formed UTF-8 XML: ${error instanceof Error ? error.message : error}`,
    );
    return problems;
  }
  if (root?.namespaceURI !== NS || root.localName !== "courseStructure") {
    add(root ?? undefined, `must be a <courseStructure> in the ${NS} namespace`);
    return problems;
  }
  const childrenNamed = (parent: Element, name: string) =>
    Array.from(parent.childNodes).filter(
      (node): node is Element => (node as Element).localName === name,
    );
  const described = (element: Element, what: string) => {
    if (!element.getAttribute("id")) add(element, `${what} has no id`);
    for (const name of ["title", "description"]) {
      const found = childrenNamed(element, name)[0];
      if (!found || childrenNamed(found, "langstring").length === 0) {
        add(element, `${what} has no <${name}> with a <langstring>`);
      }
    }
  };
  const course = childrenNamed(root, "course")[0];
  if (course) described(course, "the course");
  else add(root, "has no <course>");
  const aus = Array.from(root.getElementsByTagNameNS(NS, "au"));
  if (aus.length === 0) add(root, "has no <au>");
  for (const au of aus) {
    described(au, "an AU");
    const moveOn = au.getAttribute("moveOn");
    if (moveOn && !(MOVE_ON as readonly string[]).includes(moveOn)) {
      add(au, `has an unknown moveOn '${moveOn}'`);
    }
    const mastery = au.getAttribute("masteryScore");
    if (mastery && !(Number(mastery) >= 0 && Number(mastery) <= 1)) {
      add(au, "has a masteryScore that is not a decimal from 0 to 1");
    }
    const url = childrenNamed(au, "url")[0]?.textContent?.trim() ?? "";
    if (!files.has(url)) add(au, `launches '${url}', which is not in the package`);
  }
  return problems;
}

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

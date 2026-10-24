// xAPI exporter (STD-06, M1-24; standards.md §3.3 E-15..E-17, §4.5): tincan.xml at the package root
// with the course activity and its launch page, one module activity per lesson or quiz and one
// interaction activity per quiz question, all with IRIs built from stable ids (E-16). The LRS comes
// from the launch link; an LRS the author sets is written into the course data, never the descriptor.
import { activityIri, answerId, plainText, toInteraction } from "@course-suite/format";
import {
  interactionType,
  type LrsSettings,
  XAPI_ACTIVITY_TYPES,
  xapiResponse,
} from "@course-suite/tracking";
import { DOMParser, type Element } from "@xmldom/xmldom";
import type { DescribeInput, Exporter } from "./builder.js";
import { fail, ok, type Problem } from "./result.js";

export const TINCAN_XML = "tincan.xml";
const NS = "http://projecttincan.com/tincan.xsd";

export interface XapiOptions {
  /**
   * An LRS for courses launched without one (standards.md E-17). The launch link's LRS always wins.
   * Credentials in a package can be read by anyone who has it: the build warns about them.
   */
  lrs?: LrsSettings;
}

export function xapiExporter(options: XapiOptions = {}): Exporter {
  const { lrs } = options;
  return {
    standard: "xapi",
    ...(lrs && { lrs }),
    describe(input) {
      if (lrs && !/^https?:\/\/[^/]/i.test(lrs.endpoint)) {
        return fail([
          {
            file: TINCAN_XML,
            message: `the LRS endpoint '${lrs.endpoint}' is not an http or https address`,
          },
        ]);
      }
      return ok([{ path: TINCAN_XML, data: new TextEncoder().encode(tincanXml(input)) }]);
    },
    check,
  };
}

function tincanXml({ course, launchPage }: DescribeInput): string {
  const language = course.sourceLanguage ?? course.labelSet?.language ?? "en";
  const text = (name: string, value: string) =>
    `<${name} lang="${esc(language)}">${esc(value)}</${name}>`;
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<tincan xmlns="${NS}">`,
    `  <activities>`,
    `    <activity id="${esc(activityIri(course))}" type="${XAPI_ACTIVITY_TYPES.course}">`,
    `      ${text("name", course.title)}`,
    `      ${text("description", course.description ? plainText(course.description) : course.title)}`,
    `      ${text("launch", launchPage)}`,
    `    </activity>`,
  ];
  for (const entry of course.entries) {
    if (entry.kind === "section") continue;
    lines.push(
      `    <activity id="${esc(activityIri(course, entry.id))}" type="${XAPI_ACTIVITY_TYPES.module}">`,
      `      ${text("name", entry.title)}`,
      `      ${text("description", entry.description ? plainText(entry.description) : entry.title)}`,
      `    </activity>`,
    );
    if (entry.kind !== "quiz") continue;
    const questions = entry.questions.flatMap((item) =>
      item.kind === "draw" ? item.pool.map((pooled) => pooled.question) : [item],
    );
    for (const question of questions) {
      // The correct answer named as the player reports answers (rise.md rule 11).
      const correct = toInteraction(entry.title, question, undefined, 1);
      const patterns =
        correct.type === "fill-in"
          ? correct.correctResponse
          : [xapiResponse(correct.type, correct.correctResponse)];
      const prompt = plainText(question.prompt);
      const components = (name: string, items: { id: string; text: string }[]) => [
        `      <${name}>`,
        ...items.map(
          (item) =>
            `        <component><id>${esc(item.id)}</id>${text("description", item.text)}</component>`,
        ),
        `      </${name}>`,
      ];
      const named = (html: string) => ({ id: answerId(plainText(html)), text: plainText(html) });
      lines.push(
        `    <activity id="${esc(activityIri(course, entry.id, question.id))}" type="${XAPI_ACTIVITY_TYPES.interaction}">`,
        `      ${text("name", prompt)}`,
        `      ${text("description", prompt)}`,
        `      <interactionType>${interactionType(question)}</interactionType>`,
        `      <correctResponsePatterns>`,
        ...patterns.map(
          (p) => `        <correctResponsePattern>${esc(p)}</correctResponsePattern>`,
        ),
        `      </correctResponsePatterns>`,
        ...(question.kind === "single-choice" || question.kind === "multiple-response"
          ? components(
              "choices",
              question.answers.map((a) => named(a.text)),
            )
          : []),
        ...(question.kind === "matching"
          ? [
              ...components(
                "source",
                question.pairs.map((pair) => named(pair.prompt)),
              ),
              ...components(
                "target",
                question.pairs.map((pair) => named(pair.match)),
              ),
            ]
          : []),
        `    </activity>`,
      );
    }
  }
  lines.push(`  </activities>`, `</tincan>`, ``);
  return lines.join("\n");
}

/**
 * Checks a finished package: tincan.xml is well-formed, every activity has an id, and exactly one
 * activity, the course, launches a page the package holds.
 *
 * shortcut: a structural check, not XSD validation; the tincan.xml schema is not shipped.
 */
function check(files: ReadonlyMap<string, Uint8Array>): Problem[] {
  const bytes = files.get(TINCAN_XML);
  if (!bytes) return [{ file: TINCAN_XML, message: "is missing" }];
  const problems: Problem[] = [];
  const add = (element: Element | undefined, message: string) => {
    const line = element?.lineNumber;
    problems.push({ file: TINCAN_XML, ...(line !== undefined && { line }), message });
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
  if (root?.namespaceURI !== NS || root.localName !== "tincan") {
    add(root ?? undefined, `must be a <tincan> in the ${NS} namespace`);
    return problems;
  }
  const activities = Array.from(root.getElementsByTagNameNS(NS, "activity"));
  const launching = activities.filter((a) => a.getElementsByTagNameNS(NS, "launch").length > 0);
  for (const activity of activities) {
    if (!activity.getAttribute("id")) add(activity, "has an activity without an id");
  }
  if (launching.length !== 1) add(root, "must have exactly one activity with a <launch>");
  const course = launching[0];
  if (course && course.getAttribute("type") !== XAPI_ACTIVITY_TYPES.course) {
    add(course, "launches from an activity that is not the course");
  }
  const href = course?.getElementsByTagNameNS(NS, "launch")[0]?.textContent?.trim() ?? "";
  if (course && !files.has(href)) add(course, `launches '${href}', which is not in the package`);
  return problems;
}

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

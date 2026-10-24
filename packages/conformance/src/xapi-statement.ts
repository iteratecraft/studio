// Statement checks for the in-memory LRS (standards.md S-5 test subset, STD-06 "every statement
// validates for 1.0.3 and 2.0"): the structure rules of xAPI 1.0.3 Part Two and xAPI 2.0
// (IEEE 9274.1.1) that our player's statements touch, so a test LRS refuses what a real one would.
//
// shortcut: Agents only (no Groups as actor), no SubStatement or StatementRef objects, no
// attachments, and IRIs checked for a scheme only; the full rules are the ADL LRS suite's (T-3).

export type XapiVersion = "1.0" | "2.0";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IRI = /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/;
const LANGUAGE = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;
const DURATION =
  /^P(?!$)(?:\d+(?:\.\d+)?Y)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?W)?(?:\d+(?:\.\d+)?D)?(?:T(?=\d)(?:\d+(?:\.\d+)?H)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?S)?)?$/;
// RFC 3339 date-time with a time zone, which xAPI 2.0 requires and 1.0.3 accepts.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const INTERACTION_TYPES = [
  "true-false",
  "choice",
  "fill-in",
  "long-fill-in",
  "matching",
  "performance",
  "sequencing",
  "likert",
  "numeric",
  "other",
];
const CONTEXT_ACTIVITY_KINDS = ["parent", "grouping", "category", "other"];

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every rule `statement` breaks for an LRS of `version`, as `path: problem`; empty when it is valid. */
export function statementProblems(statement: unknown, version: XapiVersion): string[] {
  const problems: string[] = [];
  const add = (path: string, problem: string) => problems.push(`${path}: ${problem}`);
  const only = (value: Json, path: string, keys: string[]) => {
    for (const key of Object.keys(value))
      if (!keys.includes(key)) add(path, `unknown property ${key}`);
  };
  const iri = (value: unknown, path: string) => {
    if (typeof value !== "string" || !IRI.test(value)) add(path, "must be an IRI");
  };
  const languageMap = (value: unknown, path: string) => {
    if (!isObject(value)) return add(path, "must be a language map");
    for (const [tag, text] of Object.entries(value)) {
      if (!LANGUAGE.test(tag)) add(path, `has an invalid language tag ${tag}`);
      if (typeof text !== "string") add(`${path}.${tag}`, "must be a string");
    }
  };
  const extensions = (value: unknown, path: string) => {
    if (!isObject(value)) return add(path, "must be an object");
    for (const key of Object.keys(value)) iri(key, `${path} key ${key}`);
  };

  const agent = (value: unknown, path: string) => {
    if (!isObject(value)) return add(path, "must be an Agent");
    only(value, path, ["objectType", "name", "mbox", "mbox_sha1sum", "openid", "account"]);
    if (value.objectType !== undefined && value.objectType !== "Agent")
      add(path, "must be an Agent");
    if (value.name !== undefined && typeof value.name !== "string")
      add(`${path}.name`, "must be a string");
    const ids = ["mbox", "mbox_sha1sum", "openid", "account"].filter(
      (key) => value[key] !== undefined,
    );
    if (ids.length !== 1) add(path, "must have exactly one identifier");
    if (value.mbox !== undefined && !/^mailto:[^@\s]+@[^@\s]+$/.test(String(value.mbox))) {
      add(`${path}.mbox`, "must be a mailto IRI");
    }
    if (value.mbox_sha1sum !== undefined && !/^[0-9a-f]{40}$/i.test(String(value.mbox_sha1sum))) {
      add(`${path}.mbox_sha1sum`, "must be 40 hex digits");
    }
    if (value.openid !== undefined) iri(value.openid, `${path}.openid`);
    if (value.account !== undefined) {
      const account = value.account;
      if (!isObject(account) || typeof account.name !== "string") {
        add(`${path}.account`, "needs a homePage and a name");
      } else {
        only(account, `${path}.account`, ["homePage", "name"]);
        iri(account.homePage, `${path}.account.homePage`);
      }
    }
  };

  const definition = (value: unknown, path: string) => {
    if (!isObject(value)) return add(path, "must be an object");
    const components = ["choices", "scale", "source", "target", "steps"];
    only(value, path, [
      "name",
      "description",
      "type",
      "moreInfo",
      "extensions",
      "interactionType",
      "correctResponsesPattern",
      ...components,
    ]);
    if (value.name !== undefined) languageMap(value.name, `${path}.name`);
    if (value.description !== undefined) languageMap(value.description, `${path}.description`);
    if (value.type !== undefined) iri(value.type, `${path}.type`);
    if (value.moreInfo !== undefined) iri(value.moreInfo, `${path}.moreInfo`);
    if (value.extensions !== undefined) extensions(value.extensions, `${path}.extensions`);
    if (value.interactionType === undefined) {
      for (const key of ["correctResponsesPattern", ...components]) {
        if (value[key] !== undefined) add(`${path}.${key}`, "needs an interactionType");
      }
      return;
    }
    if (!INTERACTION_TYPES.includes(String(value.interactionType))) {
      add(`${path}.interactionType`, "is not an interaction type");
    }
    const patterns = value.correctResponsesPattern;
    if (
      patterns !== undefined &&
      !(Array.isArray(patterns) && patterns.every((p) => typeof p === "string"))
    ) {
      add(`${path}.correctResponsesPattern`, "must be an array of strings");
    }
    for (const key of components) {
      const list = value[key];
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        add(`${path}.${key}`, "must be an array");
        continue;
      }
      for (const [i, component] of list.entries()) {
        if (!isObject(component) || typeof component.id !== "string") {
          add(`${path}.${key}[${i}]`, "needs an id");
          continue;
        }
        only(component, `${path}.${key}[${i}]`, ["id", "description"]);
        if (component.description !== undefined) {
          languageMap(component.description, `${path}.${key}[${i}].description`);
        }
      }
    }
  };

  const activity = (value: unknown, path: string) => {
    if (!isObject(value)) return add(path, "must be an Activity");
    only(value, path, ["objectType", "id", "definition"]);
    if (value.objectType !== undefined && value.objectType !== "Activity")
      add(path, "must be an Activity");
    iri(value.id, `${path}.id`);
    if (value.definition !== undefined) definition(value.definition, `${path}.definition`);
  };

  if (!isObject(statement)) return ["statement: must be an object"];
  only(statement, "statement", [
    "id",
    "actor",
    "verb",
    "object",
    "result",
    "context",
    "timestamp",
    "stored",
    "authority",
    "version",
    "attachments",
  ]);
  if (statement.id !== undefined && !UUID.test(String(statement.id))) add("id", "must be a UUID");
  agent(statement.actor, "actor");

  const verb = statement.verb;
  if (!isObject(verb)) add("verb", "must be an object");
  else {
    only(verb, "verb", ["id", "display"]);
    iri(verb.id, "verb.id");
    if (verb.display !== undefined) languageMap(verb.display, "verb.display");
  }

  activity(statement.object, "object");

  const result = statement.result;
  if (result !== undefined) {
    if (!isObject(result)) add("result", "must be an object");
    else {
      only(result, "result", [
        "score",
        "success",
        "completion",
        "response",
        "duration",
        "extensions",
      ]);
      for (const key of ["success", "completion"]) {
        if (result[key] !== undefined && typeof result[key] !== "boolean")
          add(`result.${key}`, "must be a boolean");
      }
      if (result.response !== undefined && typeof result.response !== "string") {
        add("result.response", "must be a string");
      }
      if (result.duration !== undefined && !DURATION.test(String(result.duration))) {
        add("result.duration", "must be an ISO 8601 duration");
      }
      if (result.extensions !== undefined) extensions(result.extensions, "result.extensions");
      const score = result.score;
      if (score !== undefined) {
        if (!isObject(score)) add("result.score", "must be an object");
        else {
          only(score, "result.score", ["scaled", "raw", "min", "max"]);
          for (const key of ["scaled", "raw", "min", "max"]) {
            if (score[key] !== undefined && typeof score[key] !== "number")
              add(`result.score.${key}`, "must be a number");
          }
          const { scaled, raw, min, max } = score as Record<string, number | undefined>;
          if (scaled !== undefined && (scaled < -1 || scaled > 1))
            add("result.score.scaled", "must be from -1 to 1");
          if (min !== undefined && max !== undefined && !(min < max))
            add("result.score", "min must be below max");
          if (
            raw !== undefined &&
            ((min !== undefined && raw < min) || (max !== undefined && raw > max))
          ) {
            add("result.score.raw", "must be from min to max");
          }
        }
      }
    }
  }

  const context = statement.context;
  if (context !== undefined) {
    if (!isObject(context)) add("context", "must be an object");
    else {
      only(context, "context", [
        "registration",
        "instructor",
        "team",
        "contextActivities",
        "revision",
        "platform",
        "language",
        "statement",
        "extensions",
        ...(version === "2.0" ? ["contextAgents", "contextGroups"] : []),
      ]);
      if (context.registration !== undefined && !UUID.test(String(context.registration))) {
        add("context.registration", "must be a UUID");
      }
      if (context.language !== undefined && !LANGUAGE.test(String(context.language))) {
        add("context.language", "must be a language tag");
      }
      if (context.instructor !== undefined) agent(context.instructor, "context.instructor");
      if (context.extensions !== undefined) extensions(context.extensions, "context.extensions");
      const activities = context.contextActivities;
      if (activities !== undefined) {
        if (!isObject(activities)) add("context.contextActivities", "must be an object");
        else {
          only(activities, "context.contextActivities", CONTEXT_ACTIVITY_KINDS);
          for (const [kind, list] of Object.entries(activities)) {
            const path = `context.contextActivities.${kind}`;
            // 1.0.3 also accepts a single Activity; 2.0 requires an array.
            if (!Array.isArray(list)) {
              if (version === "2.0") add(path, "must be an array");
              activity(list, path);
            } else for (const [i, item] of list.entries()) activity(item, `${path}[${i}]`);
          }
        }
      }
    }
  }

  if (statement.timestamp !== undefined && !TIMESTAMP.test(String(statement.timestamp))) {
    add("timestamp", "must be an RFC 3339 date-time with a time zone");
  }
  if (
    statement.version !== undefined &&
    !new RegExp(`^${version.replace(".", "\\.")}\\.\\d+$`).test(String(statement.version))
  ) {
    add("version", `must be a ${version} version`);
  }
  return problems;
}

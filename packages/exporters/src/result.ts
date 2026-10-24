/** One reason a package cannot be built, pointing at the file and the place inside it. */
export interface Problem {
  /** Package path, such as `imsmanifest.xml` or `media/cover.jpg`; "course" for the course document. */
  file: string;
  /** Place inside the file: a JSON Pointer in the course, an element path in XML. */
  path?: string;
  /** 1-based line in the file, when known. */
  line?: number;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; problems: Problem[] };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T>(problems: Problem[]): Result<T> => ({ ok: false, problems });

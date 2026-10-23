/** One reason a package was rejected, pointing at the file and the place inside it. */
export interface Problem {
  /** Archive entry name, or "" for the archive itself. */
  file: string;
  /** Place inside the file, for example `manifest/resources/resource[2]/@href`. */
  path?: string;
  /** 1-based line in the file, when known. */
  line?: number;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; problems: Problem[] };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T>(problems: Problem[]): Result<T> => ({ ok: false, problems });

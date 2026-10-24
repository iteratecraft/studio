// The classic-script chunk loader (ADR-0003). Every lazy chunk, plugin and the course data file is
// loaded by adding a classic <script src> and registers itself by name on the player's registry while
// its top-level code runs. Modules, import(), fetch and XMLHttpRequest are blocked from file://.

export class ChunkLoadError extends Error {
  constructor(
    readonly chunk: string,
    readonly reason: string,
  ) {
    super(`Chunk "${chunk}" ${reason}`);
    this.name = "ChunkLoadError";
  }
}

export type Load = (name: string, src: string, timeoutMs: number) => Promise<unknown>;

/**
 * A loader over `registry`, which the chunks fill. A registered chunk resolves at once; concurrent
 * calls share one pending load; a failed load is forgotten and its script removed, so the next call
 * injects the script again.
 */
export function createLoader(document: Document, registry: ReadonlyMap<string, unknown>): Load {
  const pending = new Map<string, Promise<unknown>>();
  return (name, src, timeoutMs) => {
    if (registry.has(name)) return Promise.resolve(registry.get(name));
    const current = pending.get(name);
    if (current) return current;
    const script = document.createElement("script");
    const promise = new Promise<unknown>((resolve, reject) => {
      const settle = (reason?: string) => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (reason === undefined) {
          resolve(registry.get(name));
          return;
        }
        pending.delete(name);
        script.remove();
        reject(new ChunkLoadError(name, reason));
      };
      // A classic script's load event fires after its top-level code ran, so a chunk that threw or
      // registered under another name is caught here; both fire load, not error.
      script.onload = () => settle(registry.has(name) ? undefined : "loaded without registering");
      script.onerror = () => settle("could not be read");
      const timer = setTimeout(() => settle(`did not load within ${timeoutMs} ms`), timeoutMs);
    });
    pending.set(name, promise);
    script.src = src;
    document.head.append(script);
    return promise;
  };
}

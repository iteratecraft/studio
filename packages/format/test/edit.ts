// Test helper: change one value of a JSON document by JSON Pointer.
export const REMOVE = Symbol("remove");

export function edit<T>(document: T, path: string, value: unknown): T {
  const copy = JSON.parse(JSON.stringify(document));
  const keys = path.split("/").slice(1);
  const last = keys.pop() as string;
  let parent = copy;
  for (const key of keys) parent = parent[key];
  if (value === REMOVE) delete parent[last];
  else parent[last] = value;
  return copy;
}

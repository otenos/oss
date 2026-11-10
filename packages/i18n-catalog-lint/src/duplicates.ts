/**
 * Duplicate keys in JSON source.
 *
 * `JSON.parse` keeps the last of two equal keys and says nothing, so a second
 * `"title"` added further down a section silently replaces the first. Key
 * parity cannot see it (the key set is unchanged); only the source text can.
 */

export interface DuplicateKey {
  /** Dot path of the repeated key. */
  readonly key: string;
  /** 1-based line of the second occurrence. */
  readonly line: number;
}

interface Frame {
  readonly path: string;
  readonly keys: Set<string> | null;
  index: number;
  /** In an object: true while the next string is a key. */
  expectKey: boolean;
  pending: string;
}

/** Finds keys written twice in the same JSON object. Expects valid JSON. */
export function findDuplicateKeys(json: string): DuplicateKey[] {
  const found: DuplicateKey[] = [];
  const stack: Frame[] = [];
  let line = 1;

  const childPath = (frame: Frame | undefined): string => {
    if (frame === undefined) return '';
    const name = frame.keys === null ? String(frame.index) : frame.pending;
    return frame.path === '' ? name : `${frame.path}.${name}`;
  };

  for (let i = 0; i < json.length; i += 1) {
    const char = json[i];
    if (char === '\n') line += 1;

    if (char === '"') {
      let end = i + 1;
      while (end < json.length && json[end] !== '"') end += json[end] === '\\' ? 2 : 1;
      const text = JSON.parse(json.slice(i, end + 1)) as string;
      const frame = stack.at(-1);
      if (frame?.keys != null && frame.expectKey) {
        if (frame.keys.has(text)) found.push({ key: frame.path === '' ? text : `${frame.path}.${text}`, line });
        frame.keys.add(text);
        frame.pending = text;
        frame.expectKey = false;
      }
      i = end;
      continue;
    }

    if (char === '{' || char === '[') {
      const parent = stack.at(-1);
      stack.push({ path: childPath(parent), keys: char === '{' ? new Set() : null, index: 0, expectKey: true, pending: '' });
      continue;
    }
    if (char === '}' || char === ']') {
      stack.pop();
      continue;
    }
    if (char === ',') {
      const frame = stack.at(-1);
      if (frame === undefined) continue;
      if (frame.keys === null) frame.index += 1;
      else frame.expectKey = true;
    }
  }

  return found;
}

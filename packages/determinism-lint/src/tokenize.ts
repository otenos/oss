/**
 * A small JavaScript and TypeScript tokenizer: just enough to tell code from
 * comments, strings, template text and regular expressions.
 *
 * A scan that strips comments with a regular expression is wrong in both
 * directions. `'https://example.com'; Date.now()` loses everything after the
 * `//` inside the string, so the call is never seen; `'crypto'` in a string
 * counts as the global. Reading tokens avoids both.
 *
 * It does not build a syntax tree. JSX text is not supported.
 */

export type TokenType = 'name' | 'number' | 'string' | 'template' | 'regex' | 'punct';

export interface Token {
  readonly type: TokenType;
  /** Source text of the token. Strings keep their quotes; template chunks keep their delimiters. */
  readonly value: string;
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
}

const PUNCTUATORS = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '**', '<<', '>>',
];

/** After these keywords a `/` starts a regular expression, not a division. */
const BEFORE_EXPRESSION = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else',
  'yield', 'await',
]);

const NUMBER = /0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?n?/y;
const NAME = /#?[A-Za-z_$\u0080-￿][\w$\u0080-￿]*/y;

function regexAllowed(previous: Token | undefined): boolean {
  if (previous === undefined) return true;
  switch (previous.type) {
    case 'name':
      return BEFORE_EXPRESSION.has(previous.value);
    case 'punct':
      return ![')', ']', '}', '++', '--'].includes(previous.value);
    case 'template':
      return previous.value.endsWith('${');
    default:
      return false;
  }
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  /** One entry per open `{`: whether it was a template's `${`. */
  const braces: boolean[] = [];
  let index = 0;
  let line = 1;
  let lineStart = 0;

  const advance = (to: number): void => {
    for (let at = index; at < to; at += 1) {
      if (source[at] === '\n') {
        line += 1;
        lineStart = at + 1;
      }
    }
    index = to;
  };
  const push = (type: TokenType, end: number): void => {
    tokens.push({ type, value: source.slice(index, end), line, column: index - lineStart + 1 });
    advance(end);
  };
  /** From an opening `` ` `` or a closing `}`, to the next `${` or the closing `` ` ``. */
  const templateChunk = (): void => {
    let at = index + 1;
    while (at < source.length) {
      const char = source[at];
      if (char === '\\') at += 2;
      else if (char === '`') {
        push('template', at + 1);
        return;
      } else if (char === '$' && source[at + 1] === '{') {
        braces.push(true);
        push('template', at + 2);
        return;
      } else at += 1;
    }
    push('template', source.length);
  };

  if (source.startsWith('#!')) {
    const end = source.indexOf('\n');
    advance(end === -1 ? source.length : end);
  }

  while (index < source.length) {
    const char = source[index] as string;
    const next = source[index + 1];

    if (/\s/.test(char)) {
      advance(index + 1);
      continue;
    }
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      advance(end === -1 ? source.length : end);
      continue;
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      advance(end === -1 ? source.length : end + 2);
      continue;
    }
    if (char === '"' || char === "'") {
      let at = index + 1;
      while (at < source.length && source[at] !== char && source[at] !== '\n') at += source[at] === '\\' ? 2 : 1;
      push('string', Math.min(at + 1, source.length));
      continue;
    }
    if (char === '`') {
      templateChunk();
      continue;
    }
    if (char === '}' && braces.length > 0 && braces.at(-1) === true) {
      braces.pop();
      templateChunk();
      continue;
    }
    if (char === '/' && regexAllowed(tokens.at(-1))) {
      let at = index + 1;
      let inClass = false;
      while (at < source.length && source[at] !== '\n') {
        const c = source[at];
        if (c === '\\') at += 1;
        else if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
        at += 1;
      }
      at += 1;
      while (at < source.length && /[a-z]/i.test(source[at] as string)) at += 1;
      push('regex', at);
      continue;
    }
    if (/\d/.test(char) || (char === '.' && next !== undefined && /\d/.test(next))) {
      NUMBER.lastIndex = index;
      const match = NUMBER.exec(source);
      push('number', index + (match?.[0].length ?? 1));
      continue;
    }
    NAME.lastIndex = index;
    const name = NAME.exec(source);
    if (name !== null) {
      push('name', index + name[0].length);
      continue;
    }
    const punctuator = PUNCTUATORS.find((candidate) => source.startsWith(candidate, index)) ?? char;
    if (punctuator === '{') braces.push(false);
    else if (punctuator === '}') braces.pop();
    push('punct', index + punctuator.length);
  }

  return tokens;
}

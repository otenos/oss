/**
 * Finds code that makes a module give different results for the same input:
 * the clock, unseeded randomness, the runtime's locale, environment globals,
 * floating-point functions engines are allowed to round differently, and
 * imports from outside an allowed set.
 *
 * It reads tokens, not text, so comments and strings never count and a `//`
 * inside a string never hides the code after it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tokenize, type Token } from './tokenize.js';

export { tokenize, type Token, type TokenType } from './tokenize.js';

export type RuleName = 'time' | 'random' | 'locale' | 'environment' | 'approximateMath' | 'floats' | 'imports';

export interface Finding {
  readonly rule: RuleName;
  /** Path relative to the scanned directory; empty for `scanSource`. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

export interface Options {
  /**
   * Turn rules on or off. On by default: `time`, `random`, `locale`,
   * `environment`, `approximateMath`. Off by default: `floats`.
   */
  readonly rules?: Partial<Record<Exclude<RuleName, 'imports'>, boolean>>;
  /**
   * Which import specifiers are allowed. `'relative'` allows only `./` and
   * `../`. Leave it out to not check imports.
   */
  readonly imports?: 'relative' | ((specifier: string) => boolean);
}

const DEFAULTS: Record<Exclude<RuleName, 'imports'>, boolean> = {
  time: true,
  random: true,
  locale: true,
  environment: true,
  approximateMath: true,
  floats: false,
};

/**
 * Math functions the ECMAScript specification calls "implementation-approximated":
 * engines may return different last bits for the same input, so V8, JavaScriptCore
 * and SpiderMonkey can disagree. `Math.sqrt`, `Math.round` and the like are exact.
 */
const APPROXIMATED = new Set([
  'acos', 'acosh', 'asin', 'asinh', 'atan', 'atanh', 'atan2', 'cbrt', 'cos', 'cosh', 'exp', 'expm1',
  'hypot', 'log', 'log1p', 'log10', 'log2', 'pow', 'sin', 'sinh', 'tan', 'tanh',
]);

const ENVIRONMENT = new Set(['process', 'navigator', 'Deno', 'Bun']);

const isMember = (tokens: readonly Token[], index: number): boolean => {
  const previous = tokens[index - 1];
  return previous?.type === 'punct' && (previous.value === '.' || previous.value === '?.');
};

/** `{ process: 1 }` or an interface's `process: string`: a key, not a reference. */
const isKey = (tokens: readonly Token[], index: number): boolean => {
  const previous = tokens[index - 1];
  const next = tokens[index + 1];
  return (
    previous?.type === 'punct' &&
    (previous.value === '{' || previous.value === ',' || previous.value === ';') &&
    next?.type === 'punct' &&
    next.value === ':'
  );
};

/** `Name.property` or `Name?.property` starting at `index`. */
function memberOf(tokens: readonly Token[], index: number): string | undefined {
  const dot = tokens[index + 1];
  const property = tokens[index + 2];
  if (dot?.type !== 'punct' || (dot.value !== '.' && dot.value !== '?.')) return undefined;
  return property?.type === 'name' ? property.value : undefined;
}

const isFractional = (literal: string): boolean =>
  !/^0[xXbBoO]/.test(literal) && (literal.includes('.') || /[eE]-/.test(literal));

const unquote = (literal: string): string => literal.slice(1, -1);

/** Every import specifier with the token that carries it. */
function importSpecifiers(tokens: readonly Token[]): { specifier: string; token: Token }[] {
  const found: { specifier: string; token: Token }[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] as Token;
    if (token.type !== 'name' || isMember(tokens, index)) continue;
    const next = tokens[index + 1];
    if ((token.value === 'import' || token.value === 'require') && next?.value === '(') {
      const argument = tokens[index + 2];
      if (argument?.type === 'string') found.push({ specifier: unquote(argument.value), token: argument });
      continue;
    }
    if (token.value !== 'import' && token.value !== 'export') continue;
    if (next?.type === 'string') {
      found.push({ specifier: unquote(next.value), token: next });
      continue;
    }
    // `import x from '...'`, `export { a } from '...'`: the first `from` before the statement ends.
    for (let at = index + 1; at < tokens.length; at += 1) {
      const candidate = tokens[at] as Token;
      if (candidate.value === ';' || (candidate.type === 'name' && (candidate.value === 'import' || candidate.value === 'export'))) break;
      if (candidate.type === 'name' && candidate.value === 'from' && tokens[at + 1]?.type === 'string') {
        const specifier = tokens[at + 1] as Token;
        found.push({ specifier: unquote(specifier.value), token: specifier });
        break;
      }
    }
  }
  return found;
}

/** Scans one module's source. */
export function scanSource(source: string, options: Options = {}): Finding[] {
  const on = { ...DEFAULTS, ...options.rules };
  const tokens = tokenize(source);
  const findings: Finding[] = [];
  const add = (rule: RuleName, token: Token, message: string): void => {
    findings.push({ rule, file: '', line: token.line, column: token.column, message });
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] as Token;

    if (token.type === 'number') {
      if (on.floats && isFractional(token.value)) {
        add('floats', token, `${token.value} is a fractional number; keep amounts in integer units (per-mille, cents)`);
      }
      continue;
    }
    if (token.type === 'punct') {
      if (on.approximateMath && (token.value === '**' || token.value === '**=')) {
        add('approximateMath', token, `"${token.value}" is implementation-approximated, so engines may differ in the last bits; multiply instead`);
      }
      continue;
    }
    if (token.type !== 'name') continue;

    const name = token.value;
    if (isMember(tokens, index)) {
      if (on.locale && (name === 'localeCompare' || /^toLocale[A-Z]/.test(name))) {
        add('locale', token, `${name} depends on the runtime's locale data; compare or format without it`);
      }
      continue;
    }
    if (isKey(tokens, index)) continue;
    const member = memberOf(tokens, index);
    const previous = tokens[index - 1];
    const next = tokens[index + 1];

    if (on.time) {
      if (name === 'Date' && member === 'now') add('time', token, 'Date.now reads the clock; pass the time in as a parameter');
      else if (name === 'Date' && previous?.value === 'new') {
        add('time', token, 'new Date reads the clock or the local time zone; pass the time in as a parameter');
      } else if (name === 'Date' && next?.value === '(') add('time', token, 'Date() returns the current time; pass the time in as a parameter');
      else if (name === 'performance' && member === 'now') {
        add('time', token, 'performance.now reads the clock; pass the time in as a parameter');
      }
    }
    if (on.random) {
      if (name === 'Math' && member === 'random') add('random', token, 'Math.random is not seeded; pass a seeded generator in');
      else if (name === 'crypto') add('random', token, 'crypto is platform randomness; pass a seeded generator in');
    }
    if (on.locale && name === 'Intl') add('locale', token, "Intl depends on the runtime's locale data; format outside this code");
    if (on.environment && ENVIRONMENT.has(name)) {
      add('environment', token, `${name} reads the runtime environment; pass what you need in as a parameter`);
    }
    if (on.approximateMath && name === 'Math' && member !== undefined && APPROXIMATED.has(member)) {
      add('approximateMath', token, `Math.${member} is implementation-approximated, so engines may differ in the last bits`);
    }
  }

  if (options.imports !== undefined) {
    const allowed =
      options.imports === 'relative'
        ? (specifier: string) => specifier.startsWith('./') || specifier.startsWith('../')
        : options.imports;
    for (const { specifier, token } of importSpecifiers(tokens)) {
      if (!allowed(specifier)) add('imports', token, `imports "${specifier}", which is outside the allowed set`);
    }
  }

  return findings.toSorted((a, b) => a.line - b.line || a.column - b.column);
}

const SOURCE = /\.(?:[cm]?[jt]s)$/;
const SKIPPED = /\.(?:test|spec)\.[cm]?[jt]s$|\.d\.[cm]?ts$/;

export interface ScanOptions extends Options {
  /**
   * Which files to scan, by path relative to the directory. Defaults to
   * JavaScript and TypeScript sources that are not tests (`.test.`, `.spec.`)
   * or declaration files. `node_modules` and dot directories are never entered.
   */
  readonly include?: (file: string) => boolean;
}

/** Relative paths of the files `scanDirectory` would read, sorted. */
export function listFiles(directory: string, include: (file: string) => boolean = defaultInclude): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current).toSorted()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const file = relative(directory, full).split('\\').join('/');
        if (include(file)) found.push(file);
      }
    }
  };
  walk(directory);
  return found;
}

function defaultInclude(file: string): boolean {
  return SOURCE.test(file) && !SKIPPED.test(file);
}

/** Scans every source file under a directory. */
export function scanDirectory(directory: string, options: ScanOptions = {}): { files: number; findings: Finding[] } {
  const files = listFiles(directory, options.include);
  const findings = files.flatMap((file) =>
    scanSource(readFileSync(join(directory, file), 'utf8'), options).map((finding) => ({ ...finding, file })),
  );
  return { files: files.length, findings };
}

/** One line per finding: `file:line:column  rule  message`. */
export function formatFindings(findings: readonly Finding[]): string {
  return findings
    .map(({ file, line, column, rule, message }) => `${file === '' ? '' : `${file}:`}${line}:${column}  ${rule}  ${message}`)
    .join('\n');
}

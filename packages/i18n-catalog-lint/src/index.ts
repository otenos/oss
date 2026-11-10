/**
 * Lints translation catalogs against each other.
 *
 * It cannot tell whether a translation is good. It catches the mistakes that
 * pass review and type checks and then show up on screen in a language the
 * reviewer does not read: a missing key, a renamed placeholder, an empty
 * string, a sentence the message compiler cannot parse, a character the style
 * guide bans.
 */

/** A catalog: nested objects whose leaves are messages. Arrays are read as objects keyed by index. */
export interface Tree {
  readonly [key: string]: unknown;
}

/** Catalogs by locale, e.g. `{ en, de, pt }`. */
export type Catalogs = Readonly<Record<string, Tree>>;

export type RuleName = 'keys' | 'placeholders' | 'empty' | 'syntax' | 'forbidden';

export interface Issue {
  readonly rule: RuleName;
  readonly locale: string;
  /** Dot path of the message, e.g. `menu.title`. */
  readonly key: string;
  readonly message: string;
}

export interface Forbidden {
  /** A string is matched literally; a RegExp is used as is (the `g` flag is not needed). */
  readonly pattern: string | RegExp;
  /** Shown in the issue, e.g. "use a comma or a colon instead of an em dash". */
  readonly reason: string;
  /** Limit the ban to these locales. Default: every locale. */
  readonly locales?: readonly string[];
}

export interface Options {
  /** The source locale: every other catalog must match its keys and placeholders. */
  readonly reference: string;
  /**
   * The message format to check sentences against. `'vue-i18n'` reports what
   * vue-i18n's default message compiler cannot parse or would render wrong.
   * Omit it to skip syntax checks.
   */
  readonly syntax?: 'vue-i18n';
  /** Text no message may contain. */
  readonly forbidden?: readonly Forbidden[];
  /** Turn individual rules off: `{ empty: false }`. */
  readonly rules?: Partial<Record<RuleName, boolean>>;
}

/** Every leaf of a catalog as `[path, value]`, in document order. */
export function leaves(tree: Tree, prefix = ''): [string, unknown][] {
  return Object.entries(tree).flatMap(([key, value]): [string, unknown][] => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'object' && value !== null) return leaves(value as Tree, path);
    return [[path, value]];
  });
}

/** Removes vue-i18n literal interpolations (`{'@'}`, `{"{"}`), which are text, not syntax. */
function withoutLiterals(text: string): string {
  return text.replace(/\{\s*(?:'[^']*'|"[^"]*")\s*\}/g, '');
}

/** Placeholder names in a message, sorted and unique: `{count}`, `{0}`, `{amount, number}`. */
export function placeholders(text: string): string[] {
  const names = [...withoutLiterals(text).matchAll(/\{\s*([A-Za-z_][\w-]*|\d+)\s*[,}]/g)].map((match) => match[1] as string);
  return [...new Set(names)].toSorted();
}

const LINKED = /^@(?:\.\w+)?:(?:\([^()]+\)|[\w$.-]+)/;
const ICU_CHOICE = /\{\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/;

/** What vue-i18n's default message compiler rejects or renders wrong in this sentence. */
export function vueI18nProblems(text: string): string[] {
  const problems: string[] = [];
  const bare = withoutLiterals(text);

  const choice = ICU_CHOICE.exec(bare);
  if (choice !== null) {
    problems.push(`vue-i18n cannot parse ICU "${choice[1]}" syntax; use the pipe form ("{n} item | {n} items")`);
  } else {
    const bad = [...bare.matchAll(/\{([^{}]*)\}/g)].find((match) => !/^\s*(?:[A-Za-z_][\w-]*|\d+)\s*$/.test(match[1] as string));
    if (bad !== undefined) {
      problems.push(`"${bad[0]}" is not a vue-i18n placeholder; placeholders are a name or an index ({count}, {item-count}, {0})`);
    }
  }

  for (let at = bare.indexOf('@'); at >= 0; at = bare.indexOf('@', at + 1)) {
    if (!LINKED.test(bare.slice(at))) {
      problems.push(`"@" starts a linked message in vue-i18n ("Invalid linked format"); write {'@'} for a literal @`);
      break;
    }
  }

  let depth = 0;
  for (const char of bare) {
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth < 0 || depth > 1) break;
  }
  if (depth !== 0) {
    problems.push(`unbalanced or nested braces; write {'{'} or {'}'} for a literal brace`);
  }

  return problems;
}

function list(names: readonly string[]): string {
  return names.length === 0 ? 'none' : names.map((name) => `{${name}}`).join(' ');
}

/** Lints every catalog. An empty array means clean. Issues are sorted by locale, then key. */
export function lintCatalogs(catalogs: Catalogs, options: Options): Issue[] {
  const on = (rule: RuleName): boolean => options.rules?.[rule] !== false;
  const source = catalogs[options.reference];
  if (source === undefined) {
    throw new Error(`reference locale "${options.reference}" is not among the catalogs: ${Object.keys(catalogs).join(', ')}`);
  }

  const issues: Issue[] = [];
  const reference = new Map(leaves(source));

  for (const [locale, catalog] of Object.entries(catalogs)) {
    const entries = new Map(leaves(catalog));
    const add = (rule: RuleName, key: string, message: string): void => {
      issues.push({ rule, locale, key, message });
    };

    if (locale !== options.reference && on('keys')) {
      for (const key of reference.keys()) {
        if (!entries.has(key)) add('keys', key, `missing (present in ${options.reference})`);
      }
      for (const key of entries.keys()) {
        if (!reference.has(key)) add('keys', key, `extra (absent from ${options.reference})`);
      }
    }

    for (const [key, value] of entries) {
      if (typeof value !== 'string') continue;

      if (on('empty') && value.trim() === '') add('empty', key, 'empty message');

      if (locale !== options.reference && on('placeholders')) {
        const expected = reference.get(key);
        if (typeof expected === 'string') {
          const want = placeholders(expected);
          const have = placeholders(value);
          if (want.join() !== have.join()) {
            add('placeholders', key, `placeholders differ: ${options.reference} has ${list(want)}, ${locale} has ${list(have)}`);
          }
        }
      }

      if (options.syntax === 'vue-i18n' && on('syntax')) {
        for (const problem of vueI18nProblems(value)) add('syntax', key, problem);
      }

      if (on('forbidden')) {
        for (const ban of options.forbidden ?? []) {
          if (ban.locales !== undefined && !ban.locales.includes(locale)) continue;
          const hit = typeof ban.pattern === 'string' ? value.includes(ban.pattern) : new RegExp(ban.pattern.source, ban.pattern.flags.replace('g', '')).test(value);
          if (hit) add('forbidden', key, `contains ${String(ban.pattern)}: ${ban.reason}`);
        }
      }
    }
  }

  return issues.toSorted((a, b) => (a.locale === b.locale ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.locale < b.locale ? -1 : 1));
}

/** One line per issue: `de  menu.title  [placeholders] placeholders differ: ...`. */
export function formatIssues(issues: readonly Issue[]): string {
  return issues.map((issue) => `${issue.locale}  ${issue.key}  [${issue.rule}] ${issue.message}`).join('\n');
}

export { findDuplicateKeys, type DuplicateKey } from './duplicates.js';

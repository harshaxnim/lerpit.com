/*
 * The languages a code box can hold, in one table.
 *
 * Which compiler a file goes to, which editor mode it opens in and how its comments
 * start were each decided by a regex in a different file, and the regexes disagreed
 * (`.c` was C++ to the runtime and to the editor but `.h` only to the editor). Every
 * one of those decisions reads this now, so adding a language is one entry here plus
 * the compiler it names.
 *
 * Nothing here imports an editor mode or a compiler: the table names them, and the
 * code that needs one loads it. That keeps this importable from Node (content.ts
 * checks fences at build time) and from a test.
 */

export type LanguageId = 'cpp' | 'js';

export type Language = {
  id: LanguageId;
  /** What a reader would call it, for messages. */
  name: string;
  /** Lower-case, with the dot. */
  extensions: readonly string[];
  /**
   * What a build does with these files. `wasm` is compiled and linked to one module
   * (ctx.wasm); `module` is evaluated as JavaScript and its exports are the chapter's.
   * `none` files are shown and never built (a header, say).
   */
  build: 'wasm' | 'module' | 'none';
  /** The editor mode: CodeMirror's cpp or javascript. */
  editor: 'cpp' | 'javascript' | 'typescript';
  /** How a line comment starts, which is what region markers are written in. */
  lineComment: string;
};

export const LANGUAGES: readonly Language[] = [
  { id: 'cpp', name: 'C++', extensions: ['.cpp', '.cc', '.cxx', '.c'], build: 'wasm', editor: 'cpp', lineComment: '//' },
  { id: 'cpp', name: 'C++ header', extensions: ['.h', '.hpp'], build: 'none', editor: 'cpp', lineComment: '//' },
  { id: 'js', name: 'JavaScript', extensions: ['.js', '.mjs', '.cjs'], build: 'module', editor: 'javascript', lineComment: '//' },
  { id: 'js', name: 'TypeScript', extensions: ['.ts'], build: 'module', editor: 'typescript', lineComment: '//' }
];

function extensionOf(fileName: string): string {
  const at = fileName.lastIndexOf('.');
  return at < 0 ? '' : fileName.slice(at).toLowerCase();
}

/** The language a file is written in, or null when no entry claims its extension. */
export function languageOf(fileName: string): Language | null {
  const ext = extensionOf(fileName);
  return LANGUAGES.find((language) => language.extensions.includes(ext)) ?? null;
}

/** Split a box's files by what a build does with them. */
export function byBuild<T extends { name: string }>(files: readonly T[]): { wasm: T[]; module: T[] } {
  const out = { wasm: [] as T[], module: [] as T[] };
  for (const file of files) {
    const build = languageOf(file.name)?.build;
    if (build === 'wasm') out.wasm.push(file);
    else if (build === 'module') out.module.push(file);
  }
  return out;
}

/** Whether a file is evaluated as a JavaScript module. */
export function isModuleFile(fileName: string): boolean {
  return languageOf(fileName)?.build === 'module';
}

/** Every extension a fence may name, for an authoring message. */
export const KNOWN_EXTENSIONS: readonly string[] = LANGUAGES.flatMap((language) => language.extensions);

import { transform } from 'sucrase';
import type { EditorFile } from './fileEditor';

/** Whatever the entry file exported. The lesson decides what it wants from it. */
export type JsModule = Record<string, unknown>;

const JS_FILE = /\.(js|ts|mjs|cjs)$/;

/** The directory part of a path, or '' for a file at the box root. */
function dirOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

/** The filename part, with no directories and no extension. */
function baseOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(JS_FILE, '');
}

/**
 * Resolve an import against the file that wrote it.
 *
 * A fence names paths, so two files in one box can sit in different directories and
 * `./forces.js` has to mean the one next to the importer rather than whichever file
 * happens to share the name. Anything not starting with a dot is read from the box
 * root, which is the same rule a bundler applies to a bare specifier.
 */
function resolve(spec: string, fromDir: string): string {
  const parts = spec.startsWith('.') ? [...(fromDir ? fromDir.split('/') : []), ...spec.split('/')] : spec.split('/');
  const out: string[] = [];

  for (const part of parts) {
    if (part === '' || part === '.') {
      continue;
    }

    if (part === '..') {
      out.pop();
      continue;
    }

    out.push(part);
  }

  return out.join('/').replace(JS_FILE, '');
}

/**
 * Evaluate the reader's files as a small module graph.
 *
 * Sucrase strips TypeScript syntax and rewrites `import`/`export` into the CommonJS
 * shape, so each file becomes a function body taking `exports`, `module` and
 * `require`. `require` then resolves against the other open tabs rather than the
 * network, which is what lets one file import another with nothing downloaded and no
 * import map to keep in step.
 *
 * Throws with whatever sucrase or the browser said. The editor shows that as-is,
 * because a rewritten error message is a worse error message.
 */
export function compileJsFiles(files: EditorFile[]): JsModule {
  const sources = new Map(
    files.filter((file) => JS_FILE.test(file.name)).map((file) => [resolve(file.name, ''), file])
  );
  const loaded = new Map<string, JsModule>();

  const load = (name: string, fromDir = ''): JsModule => {
    const key = resolve(name, fromDir);
    const cached = loaded.get(key);
    if (cached) {
      return cached;
    }

    const file = sources.get(key);
    if (!file) {
      throw new Error(`There is no file called ${name}.`);
    }

    let code: string;
    try {
      code = transform(file.source, {
        transforms: ['typescript', 'imports'],
        filePath: file.name,
        disableESTransforms: true
      }).code;
    } catch (error) {
      throw new Error(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }

    const module = { exports: {} as JsModule };
    // Registered before the body runs, so two files importing each other terminate.
    loaded.set(key, module.exports);

    try {
      const requireFrom = (spec: string) => load(spec, dirOf(file.name));
      new Function('exports', 'module', 'require', code)(module.exports, module, requireFrom);
    } catch (error) {
      throw new Error(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }

    loaded.set(key, module.exports);
    return module.exports;
  };

  // Every file is evaluated and their exports merged.
  //
  // A fence names the files a box shows, and the reader writes each one for what it is
  // about: the force law in forces.js, the drawing in draw.js. There is deliberately no
  // entry file: requiring one would mean naming a file index.js to satisfy the loader
  // rather than to describe what is in it, and re-exporting everything through it before
  // any of it was reachable. Loading is memoised, so a file reached twice runs once.
  const merged: JsModule = {};
  const claimedBy = new Map<string, string>();

  for (const file of files) {
    if (!JS_FILE.test(file.name)) {
      continue;
    }

    const exports = load(file.name);
    for (const [name, value] of Object.entries(exports)) {
      const claimed = claimedBy.get(name);
      if (claimed && claimed !== file.name) {
        throw new Error(`${claimed} and ${file.name} both export ${name}. Only one file can.`);
      }

      claimedBy.set(name, file.name);
      merged[name] = value;
    }
  }

  if (Object.keys(merged).length === 0 && files.some((file) => JS_FILE.test(file.name))) {
    throw new Error('None of these files export anything.');
  }

  return merged;
}

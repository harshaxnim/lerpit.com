import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LerpetteLibrary } from '@lerpit/framework/types';

/*
 * The authoring platform's rules in the content loader: which chapters run what, which
 * panel names are real, control.toml's newer fields, and the problems each mistake
 * produces. Each case is a tiny site in a temp directory, as in content.test.ts.
 */

const MODULE = "import { defineChapter } from '@lerpit/framework/chapter';\nexport default defineChapter({});\n";
const BYLINE = 'Author: Harsha | Date: 2026-09-22\n\n';

let root: string;
const originalCwd = process.cwd();

async function writeTree(files: Record<string, string>) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, contents, 'utf-8');
  }
}

async function loadLibrary(env: Record<string, string> = {}): Promise<LerpetteLibrary> {
  vi.resetModules();
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    const { getLerpetteLibrary } = await import('../content');
    return await getLerpetteLibrary();
  } finally {
    process.env = saved;
  }
}

const lesson = (dir: string, body: string, extra: Record<string, string> = {}) =>
  writeTree({ [`lerpettes/content/physics-engine/${dir}/mixtape.md`]: BYLINE + body, ...extra });

const ids = (problems: Array<{ id: string }>) => problems.map((problem) => problem.id);

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'lerpit-platform-'));
  process.chdir(root);
  await writeTree({ 'lerpettes/content/physics-engine/collection.md': '# Physics engine\n\nBuilding one.\n' });
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fsp.rm(root, { recursive: true, force: true });
});

describe('which chapters run', () => {
  it('a chapter with panels and no module runs, from its own folder', async () => {
    await lesson('a', '# A\n\nSummary.\n\n## One {#one +viewport2d}\n\nText.\n\n## Two {#two +table}\n\nText.\n', {
      'lerpettes/content/physics-engine/a/code/two/js/index.ts': MODULE
    });
    const [mixtape] = (await loadLibrary()).mixtapes;
    const [one, two] = mixtape.steps;
    expect(one.hasOwnRuntime).toBe(true);
    expect(one.runtimeStepId).toBe('one');
    expect(one.runtimeImportKey).toBe('');
    expect(one.codePath).toBe('physics-engine/a/code/one');
    expect(two.runtimeImportKey).toMatch(/code\/two\/js\/index\.ts$/);
    expect(ids(mixtape.problems)).not.toContain('runtime-missing');
  });

  it('a module is used even when the heading names panels', async () => {
    await lesson('a', '# A\n\nSummary.\n\n## One {#one +table}\n\nText.\n', {
      'lerpettes/content/physics-engine/a/code/one/js/index.ts': MODULE
    });
    const [step] = (await loadLibrary()).mixtapes[0].steps;
    expect(step.panels).toEqual(['table']);
    expect(step.runtimeImportKey).not.toBe('');
  });

  it('a chapter with nothing shows its nearest neighbour, under the neighbour’s id', async () => {
    await lesson('a', '# A\n\nSummary.\n\n## One {#one}\n\nText.\n\n## Two {#two +viewport2d}\n\nText.\n');
    const [one, two] = (await loadLibrary()).mixtapes[0].steps;
    expect(one.hasOwnRuntime).toBe(false);
    expect(one.runtimeStepId).toBe('two');
    expect(one.panels).toEqual(['viewport2d']);
    expect(two.runtimeStepId).toBe('two');
  });

  it('a chapter with only a code box runs', async () => {
    await lesson('a', '# A\n\nSummary.\n\n## One {#one}\n\n```lerpit src/a.js\n```\n', {
      'lerpettes/content/physics-engine/a/code/one/src/a.js': 'export const state = {};\n'
    });
    const [mixtape] = (await loadLibrary()).mixtapes;
    expect(mixtape.steps[0].hasOwnRuntime).toBe(true);
    expect(ids(mixtape.problems)).toEqual([]);
  });

  it('no chapter with anything is runtime-missing, and says how to fix it', async () => {
    await lesson('a', '# A\n\nSummary.\n\n## One {#one}\n\nText.\n');
    const [mixtape] = (await loadLibrary()).mixtapes;
    const problem = mixtape.problems.find((p) => p.id === 'runtime-missing');
    expect(problem?.fix).toContain('+viewport2d');
  });
});

describe('panel names', () => {
  it('reports an unknown one, lists the real ones, and keeps the rest', async () => {
    await lesson('a', '# A {#intro +viewpoint2d}\n\nSummary.\n\n## One {#one +table +reedout}\n\nText.\n');
    const [mixtape] = (await loadLibrary()).mixtapes;
    const unknown = mixtape.problems.filter((p) => p.id === 'panel-unknown');
    expect(unknown).toHaveLength(2);
    expect(unknown[0].fix).toContain('`viewport2d`');
    expect(mixtape.steps[0].panels).toEqual(['table']);
  });

  it('does not report `-name` or `=none`', async () => {
    await lesson('a', '# A {#intro +viewport2d}\n\nSummary.\n\n## One {#one -viewport3d}\n\nT.\n\n## Two {#two =none}\n\nT.\n');
    const [mixtape] = (await loadLibrary()).mixtapes;
    expect(ids(mixtape.problems)).not.toContain('panel-unknown');
  });
});

describe('document checks', () => {
  it('reports front matter', async () => {
    await writeTree({ 'lerpettes/content/physics-engine/a/mixtape.md': '---\ntitle: A\n---\n' + BYLINE + '# A\n\nS.\n' });
    expect(ids((await loadLibrary()).mixtapes[0].problems)).toContain('front-matter');
  });

  it('reports raw HTML but not comments', async () => {
    await lesson('a', '# A\n\nS.\n\n<!-- a note to self -->\n\n<div class="x">hi</div>\n\n## One {#one +canvas}\n\nT.\n');
    const problems = (await loadLibrary()).mixtapes[0].problems.filter((p) => p.id === 'raw-html');
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain('<div>');
  });

  it('every problem carries a catalogued id', async () => {
    const { PROBLEMS } = await import('../problems');
    await lesson('a', '# A\n\n## One\n\n<span>x</span>\n\n## One\n', {
      'lerpettes/content/physics-engine/a/control.toml': 'colour = "red"\n[caption]\nnope = "x"\n',
      'lerpettes/content/physics-engine/a/code/stray.txt': ''
    });
    const library = await loadLibrary();
    const all = [...library.problems, ...library.mixtapes.flatMap((m) => m.problems)];
    expect(all.length).toBeGreaterThan(3);
    for (const problem of all) expect(PROBLEMS, problem.message).toHaveProperty(problem.id);
  });
});

describe('control.toml fields', () => {
  it('captions and idle statuses reach their chapters; an unknown chapter is reported', async () => {
    await lesson('a', '# A\n\nS.\n\n## One {#one +canvas}\n\nT.\n', {
      'lerpettes/content/physics-engine/a/control.toml': '[caption]\none = "From the toml."\nzzz = "?"\n[idle_status]\none = "Wait."\n'
    });
    const [mixtape] = (await loadLibrary()).mixtapes;
    expect(mixtape.steps[0].caption).toBe('From the toml.');
    expect(mixtape.steps[0].idleStatus).toBe('Wait.');
    expect(ids(mixtape.problems)).toContain('control-chapter-unknown');
  });

  it('order puts lerpettes first, lowest first, then newest first', async () => {
    const make = (slug: string, date: string, order?: number) => ({
      [`lerpettes/content/physics-engine/${slug}/mixtape.md`]: `Author: H | Date: ${date}\n\n# ${slug}\n\nS.\n\n## One {#one +canvas}\n\nT.\n`,
      ...(order !== undefined ? { [`lerpettes/content/physics-engine/${slug}/control.toml`]: `order = ${order}\n` } : {})
    });
    await writeTree({ ...make('newest', '2026-09-30'), ...make('second', '2026-01-01', 2), ...make('first', '2025-01-01', 1), ...make('older', '2026-02-01') });
    const [collection] = (await loadLibrary()).collections;
    expect(collection.mixtapes.map((m) => m.slug)).toEqual(['first', 'second', 'newest', 'older']);
  });

  it('landing = true picks the home page, and two of them is reported', async () => {
    const make = (slug: string, date: string, landing: boolean) => ({
      [`lerpettes/content/physics-engine/${slug}/mixtape.md`]: `Author: H | Date: ${date}\n\n# ${slug}\n\nS.\n\n## One {#one +canvas}\n\nT.\n`,
      ...(landing ? { [`lerpettes/content/physics-engine/${slug}/control.toml`]: 'landing = true\n' } : {})
    });
    await writeTree({ ...make('newest', '2026-09-30', false), ...make('chosen', '2026-01-01', true) });
    expect((await loadLibrary()).landing.slug).toBe('chosen');

    await writeTree(make('also', '2025-01-01', true));
    const library = await loadLibrary();
    expect(library.landing.slug).toBe('chosen');
    expect(ids(library.problems)).toContain('landing-multiple');
  });

  it('a collection card_style styles every card in it', async () => {
    await lesson('a', '# A\n\nS.\n\n## One {#one +canvas}\n\nT.\n', {
      'lerpettes/content/physics-engine/control.toml': 'card_style = "sleeve"\n',
      'lerpettes/content/physics-engine/b/mixtape.md': 'Author: H | Date: 2026-01-01\n\n# B\n\nS.\n\n## One {#one +canvas}\n\nT.\n'
    });
    const library = await loadLibrary();
    expect(library.mixtapes.map((m) => m.cardStyle)).toEqual(['sleeve', 'sleeve']);
    expect(library.collections[0].problems).toEqual([]);
  });

  it('card_style in a lerpette is reported and ignored', async () => {
    await lesson('a', '# A\n\nS.\n\n## One {#one +canvas}\n\nT.\n', {
      'lerpettes/content/physics-engine/a/control.toml': 'card_style = "sleeve"\n'
    });
    const [mixtape] = (await loadLibrary()).mixtapes;
    expect(mixtape.problems.map((p) => p.id)).toContain('control-unknown-key');
  });
});

describe('assets', () => {
  it('never ships dotfiles or tooling files', async () => {
    await lesson('a', '# A\n\nS.\n\n## One {#one +canvas}\n\nT.\n', {
      'lerpettes/content/physics-engine/a/.DS_Store': 'x',
      'lerpettes/content/compile_flags.txt': '-std=c++17',
      'lerpettes/content/physics-engine/a/diagram.svg': '<svg/>'
    });
    const urls = (await loadLibrary()).assetEntries.map((asset) => asset.urlPath);
    expect(urls).toEqual(['/assets/lerpettes/physics-engine/a/diagram.svg']);
  });

  it('does not publish a draft’s assets in a production build', async () => {
    await lesson('a', '# A\n\nS.\n\n## One {#one +canvas}\n\nT.\n', {
      'lerpettes/content/physics-engine/a/control.toml': 'status = "draft"\n',
      'lerpettes/content/physics-engine/a/secret.png': 'x'
    });
    const local = await loadLibrary();
    expect(local.assetEntries).toHaveLength(1);
    const prod = await loadLibrary({ LERPIT_VIEW: 'public' });
    expect(prod.assetEntries).toHaveLength(0);
  });
});

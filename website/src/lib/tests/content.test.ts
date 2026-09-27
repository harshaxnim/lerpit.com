import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LerpetteLibrary } from '@lerpit/framework/types';

/**
 * content.ts reads lerpettes/content/ under process.cwd(), so each case is a whole
 * tiny site written to a temp directory. What is being tested is that no document,
 * however broken, throws: every one of these used to take the build down.
 */

const RUNTIME = 'export default { mount() {} };\n';

let root: string;
const originalCwd = process.cwd();

async function writeTree(files: Record<string, string>) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, contents, 'utf-8');
  }
}

async function loadLibrary(): Promise<LerpetteLibrary> {
  vi.resetModules();
  const { getLerpetteLibrary } = await import('../content');
  return getLerpetteLibrary();
}

function messages(problems: Array<{ message: string }>) {
  return problems.map((problem) => problem.message).join('\n');
}

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'lerpit-content-'));
  process.chdir(root);
  await writeTree({ 'lerpettes/content/physics-engine/collection.md': '# Physics engine\n\nBuilding one.\n' });
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fsp.rm(root, { recursive: true, force: true });
});

describe('a well-formed lerpette', () => {
  beforeEach(async () => {
    await writeTree({
      'lerpettes/content/physics-engine/point-dynamics/mixtape.md':
        'Author: Harsha | Date: 2026-09-22\n\n# Point bodies dynamics\n\nThe summary.\n\n## The loop {#loop}\n\nBody.\n',
      'lerpettes/content/physics-engine/point-dynamics/code/loop/js/index.ts': RUNTIME
    });
  });

  it('reports no problems', async () => {
    const library = await loadLibrary();

    expect(messages(library.mixtapes[0].problems)).toBe('');
    expect(library.problems).toEqual([]);
    expect(library.collections[0].problems).toEqual([]);
  });

  it('keeps its title, summary, byline and step', async () => {
    const [mixtape] = (await loadLibrary()).mixtapes;

    expect(mixtape.title).toBe('Point bodies dynamics');
    expect(mixtape.summary).toBe('The summary.');
    expect(mixtape.author).toBe('Harsha');
    expect(mixtape.publishedOn).toBe('2026-09-22');
    expect(mixtape.steps.map((step) => step.id)).toEqual(['loop']);
    expect(mixtape.steps[0].runtimeImportKey).not.toBe('');
  });
});

describe('a lerpette with no chapters yet', () => {
  beforeEach(async () => {
    await writeTree({
      'lerpettes/content/physics-engine/point-dynamics/mixtape.md':
        'Author: Harsha | Date: 2026-09-22\n\n# Point bodies dynamics\n\nThe summary.\n'
    });
  });

  it('is still published, with its prose intact', async () => {
    const [mixtape] = (await loadLibrary()).mixtapes;

    expect(mixtape.title).toBe('Point bodies dynamics');
    expect(mixtape.introHtml).toContain('The summary.');
    expect(mixtape.steps).toEqual([]);
  });

  it('says so, and names the heading to write', async () => {
    const [mixtape] = (await loadLibrary()).mixtapes;

    expect(messages(mixtape.problems)).toContain('no chapters');
    expect(mixtape.problems[0].fix).toContain('## Title {#step-id}');
    expect(mixtape.problems[0].where).toBe('physics-engine/point-dynamics/mixtape.md');
  });
});

describe('a chapter whose id is left implicit', () => {
  beforeEach(async () => {
    await writeTree({
      'lerpettes/content/physics-engine/point-dynamics/mixtape.md':
        'Author: Harsha | Date: 2026-09-22\n\n# Point bodies dynamics\n\nThe summary.\n\n## The Loop\n\nBody.\n'
    });
  });

  it('derives the id from the heading and says where it now looks for the runtime', async () => {
    const [mixtape] = (await loadLibrary()).mixtapes;

    expect(mixtape.steps.map((step) => step.id)).toEqual(['the-loop']);
    expect(messages(mixtape.problems)).toContain('code/the-loop/');
  });

  it('reports the missing runtime and renders the page without a panel', async () => {
    const [mixtape] = (await loadLibrary()).mixtapes;

    expect(messages(mixtape.problems)).toContain('No chapter in this lerpette has a runtime');
    expect(mixtape.steps[0].runtimeImportKey).toBe('');
    expect(mixtape.steps[0].hasOwnRuntime).toBe(false);
  });
});

describe('two chapters sharing one id', () => {
  beforeEach(async () => {
    await writeTree({
      'lerpettes/content/physics-engine/point-dynamics/mixtape.md':
        'Author: Harsha | Date: 2026-09-22\n\n# Point bodies dynamics\n\nThe summary.\n\n## First {#loop}\n\nA.\n\n## Second {#loop}\n\nB.\n',
      'lerpettes/content/physics-engine/point-dynamics/code/loop/js/index.ts': RUNTIME
    });
  });

  it('keeps both chapters by renaming the second, so neither body is dropped', async () => {
    const [mixtape] = (await loadLibrary()).mixtapes;

    expect(mixtape.steps.map((step) => step.id)).toEqual(['loop', 'loop-2']);
    expect(messages(mixtape.problems)).toContain('Two chapters share the id');
  });
});

describe('a directory with no mixtape document', () => {
  beforeEach(async () => {
    await writeTree({ 'lerpettes/content/physics-engine/point-dynamics/code/loop/js/index.ts': RUNTIME });
  });

  it('publishes a page named after the directory rather than failing the build', async () => {
    const [mixtape] = (await loadLibrary()).mixtapes;

    expect(mixtape.title).toBe('Point dynamics');
    expect(messages(mixtape.problems)).toContain('no mixtape document');
  });
});

describe('a malformed metadata line', () => {
  beforeEach(async () => {
    await writeTree({
      'lerpettes/content/physics-engine/point-dynamics/mixtape.md':
        'by Harsha, some time last year\n\n# Point bodies dynamics\n\nThe summary.\n\n## The loop {#loop}\n\nBody.\n',
      'lerpettes/content/physics-engine/point-dynamics/code/loop/js/index.ts': RUNTIME
    });
  });

  it('leaves the lerpette undated so a half-written one cannot take over the landing page', async () => {
    const [mixtape] = (await loadLibrary()).mixtapes;

    expect(mixtape.publishedOn).toBe('');
    expect(messages(mixtape.problems)).toContain('metadata line');
  });
});

describe('a link to an asset that is not there', () => {
  beforeEach(async () => {
    await writeTree({
      'lerpettes/content/physics-engine/point-dynamics/mixtape.md':
        'Author: Harsha | Date: 2026-09-22\n\n# Point bodies dynamics\n\nThe summary.\n\n## The loop {#loop}\n\n![A diagram](loop.svg)\n',
      'lerpettes/content/physics-engine/point-dynamics/code/loop/js/index.ts': RUNTIME
    });
  });

  it('renders the rest of the chapter and names the missing file', async () => {
    const [mixtape] = (await loadLibrary()).mixtapes;

    expect(mixtape.steps[0].bodyHtml).toContain('loop.svg');
    expect(messages(mixtape.problems)).toContain('loop.svg');
  });
});

describe('an empty landing collection', () => {
  beforeEach(async () => {
    await writeTree({
      'lerpettes/content/rendering/collection.md': '# Rendering\n\nPixels.\n',
      'lerpettes/content/rendering/shadow-maps/mixtape.md':
        'Author: Harsha | Date: 2026-09-20\n\n# Shadow maps\n\nThe summary.\n\n## Depth pass {#depth}\n\nBody.\n',
      'lerpettes/content/rendering/shadow-maps/code/depth/js/index.ts': RUNTIME
    });
  });

  it("serves the newest lerpette at '/' and says why", async () => {
    const library = await loadLibrary();

    expect(library.landing.title).toBe('Shadow maps');
    expect(library.landing.href).toBe('/');
    expect(messages(library.problems)).toContain('landing collection');
    // The landing clone carries them, so '/' is where the problem is visible.
    expect(messages(library.landing.problems)).toContain('landing collection');
  });
});

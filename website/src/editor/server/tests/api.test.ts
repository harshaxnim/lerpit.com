import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { handle, hashOf } from '../api';
// @ts-expect-error: a plain .mjs module without types
import { isLocalRequest, lerpitEditor } from '../../../../../scripts/lerpit-editor.mjs';

const req = (headers: Record<string, string>) => ({ headers });
const json = (body: unknown) => Buffer.from(JSON.stringify(body));

describe('who the API answers', () => {
  it('answers the author\'s own browser on this machine', () => {
    expect(isLocalRequest(req({ host: 'localhost:4321' }))).toBe(true);
    expect(isLocalRequest(req({ host: '127.0.0.1:4321', origin: 'http://127.0.0.1:4321', 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(isLocalRequest(req({ host: '[::1]:4321' }))).toBe(true);
  });

  it('refuses a tunnel, a proxy, and other origins', () => {
    expect(isLocalRequest(req({ host: 'bright-fox.loca.lt' }))).toBe(false);
    expect(isLocalRequest(req({ host: 'localhost:4321', 'x-forwarded-for': '1.2.3.4' }))).toBe(false);
    expect(isLocalRequest(req({ host: 'localhost:4321', origin: 'https://evil.example' }))).toBe(false);
    expect(isLocalRequest(req({ host: 'localhost:4321', 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(isLocalRequest(req({ host: 'localhost:4321', origin: 'null' }))).toBe(false);
  });
});

describe('never in a build', () => {
  it('adds nothing unless Astro is running dev', () => {
    const hook = lerpitEditor().hooks['astro:config:setup'];
    const updateConfig = vi.fn();
    hook({ command: 'build', updateConfig });
    hook({ command: 'preview', updateConfig });
    expect(updateConfig).not.toHaveBeenCalled();
    hook({ command: 'dev', updateConfig });
    expect(updateConfig).toHaveBeenCalledOnce();
  });

  it('is imported by no page, layout or component', () => {
    const roots = ['website/src/pages', 'website/src/layouts', 'website/src/components', 'website/src/lib'];
    for (const root of roots) {
      for (const file of fs.readdirSync(root, { recursive: true }).map(String)) {
        if (!/\.(astro|ts|mjs)$/.test(file) || file.includes('tests')) continue;
        expect(fs.readFileSync(path.join(root, file), 'utf8'), `${root}/${file}`).not.toMatch(/editor\/(client|server)/);
      }
    }
  });
});

describe('what the API will touch', () => {
  it('refuses paths that climb out of the content root', async () => {
    for (const c of ['..', '../website', 'meta/../..', '.git', 'Meta', '']) {
      const reply = await handle('PUT', 'file', new URLSearchParams(), json({ c, file: 'collection.md', text: 'x', baseHash: null }));
      expect(reply.status, c).toBe(400);
    }
  });

  it('writes only the three authored files', async () => {
    for (const file of ['../../package.json', 'index.ts', '.env', 'code/x/js/index.ts']) {
      const reply = await handle('PUT', 'file', new URLSearchParams(), json({ c: 'meta', file, text: 'x', baseHash: null }));
      expect(reply.status, file).toBe(400);
    }
  });

  it('refuses a write made against a file that has since changed', async () => {
    const reply = await handle('PUT', 'file', new URLSearchParams(), json({ c: 'meta', file: 'collection.md', text: 'x', baseHash: 'stale' }));
    expect(reply.status).toBe(409);
    const current = (reply.json as { detail: { current: { text: string; hash: string } } }).detail.current;
    expect(current.hash).toBe(hashOf(fs.readFileSync('lerpettes/content/meta/collection.md', 'utf8')));
  });

  it('refuses to create over an existing folder', async () => {
    expect((await handle('POST', 'collection', new URLSearchParams(), json({ slug: 'meta', title: 'Meta' }))).status).toBe(409);
    expect((await handle('POST', 'lerpette', new URLSearchParams(), json({ c: 'meta', slug: 'issue-zero', title: 'x' }))).status).toBe(409);
  });

  it('adds only images, with a safe name', async () => {
    const reply = await handle('POST', 'image', new URLSearchParams({ c: 'meta', l: 'issue-zero', name: 'evil.html' }), Buffer.from('<script>'));
    expect(reply.status).toBe(400);
  });

  it('reads a lerpette with its files and hashes', async () => {
    const reply = await handle('GET', 'lerpette', new URLSearchParams({ c: 'meta', l: 'live-code' }), Buffer.alloc(0));
    expect(reply.status).toBe(200);
    const data = reply.json as { mixtape: { text: string; hash: string }; control: { text: string } };
    expect(data.mixtape.hash).toBe(hashOf(data.mixtape.text));
    expect(data.control.text).toContain('[idle_status]');
  });

  it('renders a preview through the site\'s own pipeline', async () => {
    const reply = await handle('POST', 'render', new URLSearchParams(), json({ c: 'meta', l: 'issue-zero', markdown: 'Some $x^2$ maths and ![a figure](missing.png)' }));
    const data = reply.json as { html: string; problems: Array<{ id: string }> };
    expect(data.html).toContain('katex');
    expect(data.problems.map((problem) => problem.id)).toContain('link-missing');
  });
});

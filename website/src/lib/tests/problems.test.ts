import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROBLEM_IDS, PROBLEMS } from '../problems';

/** Every problem id the site's sources report, read off the source text. */
function reportedIds(): Set<string> {
  const ids = new Set<string>();
  for (const file of ['content.ts', 'control.ts']) {
    const source = fs.readFileSync(path.resolve('website/src/lib', file), 'utf8');
    for (const match of source.matchAll(/report\(\s*'([a-z0-9-]+)'/g)) ids.add(match[1]);
    for (const match of source.matchAll(/\bid: '([a-z0-9-]+)'/g)) ids.add(match[1]);
  }
  return ids;
}

describe('the problem catalogue', () => {
  it('has every id a report uses', () => {
    const missing = [...reportedIds()].filter((id) => !(id in PROBLEMS));
    expect(missing).toEqual([]);
  });

  it('has no id nothing reports', () => {
    const reported = reportedIds();
    expect(PROBLEM_IDS.filter((id) => !reported.has(id))).toEqual([]);
  });

  it('says what each one costs the reader', () => {
    for (const id of PROBLEM_IDS) {
      expect(PROBLEMS[id].title.length, id).toBeGreaterThan(10);
      expect(PROBLEMS[id].costs.length, id).toBeGreaterThan(5);
    }
  });

  it('is documented, one heading per id', () => {
    const doc = fs.readFileSync(path.resolve('docs/authoring/problems.md'), 'utf8');
    const missing = PROBLEM_IDS.filter((id) => !doc.includes(`\`${id}\``));
    expect(missing).toEqual([]);
  });
});

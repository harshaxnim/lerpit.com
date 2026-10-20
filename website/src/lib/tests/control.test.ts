import { describe, expect, it } from 'vitest';
import {
  DRAFT,
  PUBLISHED,
  UNLISTED,
  defaultControl,
  isLandingCandidate,
  isListed,
  isRoutable,
  parseCollectionControl,
  parseControl,
  statusTag
} from '../control';

describe('parseControl', () => {
  it('takes every default from an empty file', () => {
    const { control, problems } = parseControl('');
    expect(control).toEqual({ status: PUBLISHED, landing: false, order: null, caption: {}, idleStatus: {} });
    expect(problems).toEqual([]);
  });

  it('reads a status', () => {
    expect(parseControl('status = "draft"').control.status).toBe(DRAFT);
    expect(parseControl('status = "unlisted"').control.status).toBe(UNLISTED);
  });

  it('ignores comments and blank lines', () => {
    const { control, problems } = parseControl('# hidden while I finish it\n\nstatus = "draft"\n');
    expect(control.status).toBe(DRAFT);
    expect(problems).toEqual([]);
  });

  it('reports an unknown status and stays published', () => {
    const { control, problems } = parseControl('status = "hidden"');
    expect(control.status).toBe(PUBLISHED);
    expect(problems).toHaveLength(1);
    expect(problems[0].what).toContain('hidden');
    expect(problems[0].fix).toContain(UNLISTED);
  });

  it('reports a status that is not text and stays published', () => {
    const { control, problems } = parseControl('status = 3');
    expect(control.status).toBe(PUBLISHED);
    expect(problems[0].what).toContain('not text');
  });

  it('reports an unknown control but keeps the ones it knows', () => {
    const { control, problems } = parseControl('status = "unlisted"\nstatuss = "draft"');
    expect(control.status).toBe(UNLISTED);
    expect(problems).toHaveLength(1);
    expect(problems[0].what).toContain('statuss');
  });

  it('falls back to every default when the file is not valid TOML', () => {
    const { control, problems } = parseControl('status = draft');
    expect(control).toEqual(defaultControl());
    expect(problems).toHaveLength(1);
    expect(problems[0].what).toContain('not valid TOML');
  });

  // Failing open would unpublish a lerpette by accident, which is the one outcome
  // a broken control file must never produce.
  it('never hides anything because of a bad file', () => {
    for (const source of ['status = draft', 'status = "nope"', '[[[', 'status = []']) {
      expect(parseControl(source).control.status).toBe(PUBLISHED);
    }
  });
});

describe('the newer fields', () => {
  it('reads landing, order and the per-chapter tables', () => {
    const { control, problems } = parseControl(
      'landing = true\norder = 3\n[caption]\nloop = "A loop."\n[idle_status]\nloop = "Wait."\n'
    );
    expect(problems).toEqual([]);
    expect(control).toMatchObject({ landing: true, order: 3, caption: { loop: 'A loop.' }, idleStatus: { loop: 'Wait.' } });
  });

  it('gives every issue an id', () => {
    for (const source of ['landing = "yes"', 'order = 1.5', 'card_style = "sleeve"', 'caption = "x"', '[caption]\na = 1', 'colour = 1', '[[[']) {
      const { problems } = parseControl(source);
      expect(problems.length, source).toBe(1);
      expect(problems[0].id, source).toMatch(/^control-/);
    }
  });

  it('keeps the default when a value is wrong', () => {
    expect(parseControl('order = "first"').control.order).toBeNull();
    expect(parseControl('landing = 1').control.landing).toBe(false);
  });

  it('does not share default tables between files', () => {
    const a = defaultControl();
    a.caption.x = 'mutated';
    expect(defaultControl().caption).toEqual({});
  });
});

describe('a collection control.toml', () => {
  it('reads card_style', () => {
    expect(parseCollectionControl('card_style = "orb"')).toEqual({ control: { cardStyle: 'orb', palette: null }, problems: [] });
  });

  it('reads palette by name, without regard to case', () => {
    expect(parseCollectionControl('palette = "blue HOUR 1973"').control.palette).toBe('Blue hour 1973');
    const bad = parseCollectionControl('palette = "neon"');
    expect(bad.control.palette).toBeNull();
    expect(bad.problems[0].what).toContain('palette = "neon"');
    expect(bad.problems[0].fix).toContain('"90min 1982"');
  });

  it('still reads card_palette, the old name, and prefers palette when both are there', () => {
    const old = parseCollectionControl('card_palette = "Blue hour 1973"');
    expect(old.control.palette).toBe('Blue hour 1973');
    expect(old.problems).toEqual([]);
    expect(parseCollectionControl('palette = "Canyon 1974"\ncard_palette = "Blue hour 1973"').control.palette).toBe('Canyon 1974');
  });

  it('reports a style that does not exist, and one set in a lerpette', () => {
    const bad = parseCollectionControl('card_style = "plaid"');
    expect(bad.control.cardStyle).toBeNull();
    expect(bad.problems[0].id).toBe('control-bad-value');
    expect(parseControl('card_style = "orb"').problems[0].fix).toContain("collection's control.toml");
  });

  it('reports keys collections do not have', () => {
    expect(parseCollectionControl('status = "draft"').problems[0].id).toBe('control-unknown-key');
  });
});

describe('what each status means', () => {
  it('routes published and unlisted everywhere, drafts only locally', () => {
    expect(isRoutable(PUBLISHED, true)).toBe(true);
    expect(isRoutable(UNLISTED, true)).toBe(true);
    expect(isRoutable(DRAFT, true)).toBe(false);
    expect(isRoutable(DRAFT, false)).toBe(true);
  });

  it('lists only published in production, everything locally', () => {
    expect(isListed(PUBLISHED, true)).toBe(true);
    expect(isListed(UNLISTED, true)).toBe(false);
    expect(isListed(DRAFT, true)).toBe(false);
    expect(isListed(UNLISTED, false)).toBe(true);
    expect(isListed(DRAFT, false)).toBe(true);
  });

  it('lets only published reach the landing page, locally included', () => {
    expect(isLandingCandidate(PUBLISHED)).toBe(true);
    expect(isLandingCandidate(UNLISTED)).toBe(false);
    expect(isLandingCandidate(DRAFT)).toBe(false);
  });

  it('tags everything except published', () => {
    expect(statusTag(PUBLISHED)).toBeNull();
    expect(statusTag(UNLISTED)).toBe('UNLISTED');
    expect(statusTag(DRAFT)).toBe('DRAFT');
  });
});

import { describe, expect, it } from 'vitest';
import { captionHtml } from '../player/caption';

describe('captionHtml', () => {
  it('renders the particle caption, keeping its line break', () => {
    expect(captionHtml('A particle moving along the function:\n`(x,y) = (sin(4t), sin(3t))`'))
      .toBe('A particle moving along the function:\n<code>(x,y) = (sin(4t), sin(3t))</code>');
  });

  it('mixes plain text and multiple code spans', () => {
    expect(captionHtml('Use `x` and `y` together.')).toBe('Use <code>x</code> and <code>y</code> together.');
  });

  it('keeps HTML and entities literal, inside and outside code', () => {
    expect(captionHtml('<img src=x onerror=alert(1)> `x < y && y > z` &lt;b&gt;'))
      .toBe('&lt;img src=x onerror=alert(1)&gt; <code>x &lt; y &amp;&amp; y &gt; z</code> &amp;lt;b&amp;gt;');
    expect(captionHtml('`</code><script>alert(1)</script>`'))
      .toBe('<code>&lt;/code&gt;&lt;script&gt;alert(1)&lt;/script&gt;</code>');
  });

  it.each(['', 'Plain caption.', 'An unmatched `tick', '``', '``x``', '`x\ny`'])
    ('leaves unsupported or incomplete syntax literal: %j', (value) => {
      expect(captionHtml(value)).toBe(value);
    });

  it('mixes plain text, inline math, and literal code', () => {
    const html = captionHtml('**Position** $x^2$ and `y = $t$`, then $y^2$.');
    expect(html).toContain('**Position** <span class="katex">');
    expect(html).toContain('encoding="application/x-tex">x^2</annotation>');
    expect(html).toContain('and <code>y = $t$</code>, then <span class="katex">');
    expect(html).toContain('encoding="application/x-tex">y^2</annotation>');
    expect(html).not.toContain('katex-display');
  });

  it('renders display math, including multiline formulas', () => {
    const html = captionHtml('Motion:\n$$x = \\sin(4t)\n+ \\frac{1}{2}$$');
    expect(html).toContain('Motion:\n<span class="katex-display">');
    expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
    expect(html).toContain('x = \\sin(4t)\n+ \\frac{1}{2}</annotation>');
  });

  it('never pairs math delimiters across a code span', () => {
    expect(captionHtml('Price $5; code `$x$` costs $10.'))
      .toBe('Price $5; code <code>$x$</code> costs $10.');
  });

  it.each(['An unmatched $x', '$$', '$x\ny$', '$\\frac{$', '$\\notACommand{x}$', String.raw`Prices: \$5 and \$10`])
    ('leaves incomplete, invalid, or escaped math literal: %j', (value) => {
      expect(captionHtml(value)).toBe(value);
    });

  it('passes math operators to KaTeX without double escaping them', () => {
    const html = captionHtml('Compare $x < y$ & `<b>`');
    expect(html).toContain('encoding="application/x-tex">x &lt; y</annotation>');
    expect(html).toContain(' &amp; <code>&lt;b&gt;</code>');
  });

  it('escapes invalid math and disallows trusted HTML commands', () => {
    expect(captionHtml('$\\notACommand{<img src=x>}$'))
      .toBe('$\\notACommand{&lt;img src=x&gt;}$');
    const html = captionHtml('$\\href{javascript:alert(1)}{click}$');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href="javascript:');
  });
});

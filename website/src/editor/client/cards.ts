/*
 * The cassette cards, as the editor draws and picks them: redrawn in place by the same
 * cardArt() the build uses, and the style and palette pickers that drive it. Shared by
 * the collection page and a lesson's settings, which both set a collection's cards.
 */

import { assignStyles, cardArt, STYLES, STYLE_IDS } from '../../lib/cardArt';
import { PRESETS } from '../../lib/cardArt/palette';
import { h } from './dom';

/** Redraws one cassette card in place, exactly as CassetteCard.astro draws it. */
export function redrawCard(card: HTMLElement, input: Parameters<typeof cardArt>[0], options: { style?: string; palette?: string }) {
  const art = cardArt(input, options);
  card.dataset.cardStyle = art.style;
  card.style.setProperty('--card-stock', art.ground.bg);
  card.style.setProperty('--card-ink', art.ground.ink);
  card.style.setProperty('--card-face', art.face.css);
  card.style.setProperty('--card-face-weight', String(art.face.weight));
  const plate = card.querySelector('svg.cassette-card__plate');
  if (plate) {
    plate.setAttribute('viewBox', art.viewBox);
    plate.innerHTML = art.body;
  }
  const series = card.querySelector('.cassette-card__series');
  if (series && input.collection) series.textContent = input.collection;
  card.querySelector('.cassette-card__title')?.replaceChildren(...art.titleLines.map((line) => h('span', { text: line })));
}

/** A bare card for a preview, in CassetteCard's markup. */
export function blankCard(): HTMLElement {
  const card = h('span.cassette-card.ed-preview-card', {},
    h('span.cassette-card__caption', {},
      h('span.cassette-card__series'),
      h('span.cassette-card__title'),
      h('span.cassette-card__meta', { text: 'yyyy.mm.dd' })),
    h('span.cassette-card__press', { 'aria-hidden': 'true' }));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'cassette-card__plate');
  svg.setAttribute('aria-hidden', 'true');
  card.prepend(svg);
  return card;
}

/** The style a collection's cards draw with no card_style: assigned across the library, as content.ts does. */
export function autoStyleFor(title: string, allTitles: readonly string[]): string {
  return assignStyles(allTitles).get(title.trim() || 'Lerpette') ?? STYLE_IDS[0];
}

/** Style and palette pickers. `onPick` gets null for "auto". */
export function cardPickers(current: { style: string | null; palette: string | null }, autoStyle: string, onPick: (key: 'card_style' | 'card_palette', value: string | null) => void) {
  const chip = (label: string, pressed: boolean, title: string, onclick: () => void, swatch?: string[]) =>
    h('button.ed-chip', { type: 'button', 'aria-pressed': String(pressed), title, onclick },
      swatch ? h('span.ed-swatch', { style: `background:linear-gradient(90deg,${swatch.join(',')})` }) : null,
      label);

  const styles = h('div.ed-chips');
  const palettes = h('div.ed-chips');
  const draw = () => {
    styles.replaceChildren(
      chip(`auto · ${autoStyle}`, current.style === null, 'Assigned across the library so no two collections share one', () => pick('card_style', null)),
      ...STYLE_IDS.map((id) => chip(id, current.style === id, STYLES[id].label, () => pick('card_style', id))));
    palettes.replaceChildren(
      chip('auto', current.palette === null, 'Drawn from the collection\'s name', () => pick('card_palette', null)),
      ...PRESETS.map((preset) => chip(preset.id, current.palette === preset.id, preset.id, () => pick('card_palette', preset.id), preset.hues.slice(0, 6))));
  };
  const pick = (key: 'card_style' | 'card_palette', value: string | null) => {
    if (key === 'card_style') current.style = value;
    else current.palette = value;
    draw();
    onPick(key, value);
  };
  draw();
  return { styles, palettes };
}

/** A collection's palette as hard-stopped bands, one per colour, the way its cards paint it. */
export function paletteBands(colors: string[], direction = '90deg'): string {
  const stops = colors.map((color, i) => `${color} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`);
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

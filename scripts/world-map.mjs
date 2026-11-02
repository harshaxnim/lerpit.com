/*
 * Writes website/src/assets/world-map.svg, the outline map on /analytics/.
 *
 * The countries are Natural Earth's 1:110m set (public domain) as packaged by world-atlas,
 * drawn in the Equal Earth projection so no country looks bigger than it is. Each country
 * is one path tagged with its ISO 3166-1 alpha-2 code (data-c), which is how Cloudflare
 * names countries, so the page shades the map without any lookup. Antarctica is left out:
 * it is a sixth of the drawing and nobody reads from there.
 *
 * Its tools are not dependencies of the site, so install them just for the run:
 *   npm i --no-save world-atlas@2 d3-geo@3 topojson-client@3 i18n-iso-countries@7
 *   node scripts/world-map.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import countries from 'i18n-iso-countries';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-110m.json');
const out = process.argv[2] ?? new URL('../website/src/assets/world-map.svg', import.meta.url);

// The few shapes with no ISO number: Kosovo has its own code, the others are drawn as part
// of the country that holds them in ISO terms.
const BY_NAME = { Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO' };
const WIDTH = 960;

const shapes = feature(world, world.objects.countries).features.filter((f) => f.properties.name !== 'Antarctica');
const projection = geoEqualEarth().fitWidth(WIDTH, { type: 'FeatureCollection', features: shapes });
// Whole pixels: at 960 wide a tenth of a pixel is invisible and costs a third of the file.
const path = geoPath(projection).digits(0);
const [[, top], [, bottom]] = path.bounds({ type: 'FeatureCollection', features: shapes });

const paths = shapes.map((shape) => {
  const code = BY_NAME[shape.properties.name] ?? countries.numericToAlpha2(shape.id);
  if (!code) throw new Error(`No ISO code for ${shape.properties.name} (${shape.id})`);
  return `<path data-c="${code}" d="${path(shape)}"/>`;
});

const height = Math.ceil(bottom);
const y = Math.floor(top);
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${y} ${WIDTH} ${height - y}">${paths.join('')}</svg>\n`);
console.log(`${paths.length} countries, ${WIDTH}×${height - y}`);

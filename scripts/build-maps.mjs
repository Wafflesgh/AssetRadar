/**
 * build-maps.mjs — Builds the two small map files the globes load (public/maps/):
 *   indonesia.json  34 provinces named as PIHPS names them (geoBoundaries gbOpen IDN ADM1, © OpenStreetMap contributors, ODbL)
 *   world.json      countries with ISO-2 code and name (Natural Earth 1:110m, public domain)
 * Usage: node scripts/build-maps.mjs <geoBoundaries-IDN-ADM1_simplified.geojson> <ne_110m_admin_0_countries.geojson>
 * Shapes are simplified (Douglas-Peucker), tiny islands dropped, coordinates rounded, and rings
 * wound the way d3-geo expects (a ring that covers more than half the globe is reversed).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { geoArea } from 'd3-geo';

const PIHPS_NAME = {
  'Bangka-Belitung Islands': 'Kepulauan Bangka Belitung', 'Central Java': 'Jawa Tengah', 'Central Kalimantan': 'Kalimantan Tengah',
  'Central Sulawesi': 'Sulawesi Tengah', 'East Java': 'Jawa Timur', 'East Kalimantan': 'Kalimantan Timur', 'East Nusa Tenggara': 'Nusa Tenggara Timur',
  'Jakarta Special Capital Region': 'DKI Jakarta', 'North Kalimantan': 'Kalimantan Utara', 'North Maluku': 'Maluku Utara', 'North Sulawesi': 'Sulawesi Utara',
  'North Sumatra': 'Sumatera Utara', 'Riau Islands': 'Kepulauan Riau', 'South Kalimantan': 'Kalimantan Selatan', 'South Sulawesi': 'Sulawesi Selatan',
  'South Sumatra': 'Sumatera Selatan', 'Southeast Sulawesi': 'Sulawesi Tenggara', 'Special Region of Yogyakarta': 'DI Yogyakarta', 'West Java': 'Jawa Barat',
  'West Kalimantan': 'Kalimantan Barat', 'West Nusa Tenggara': 'Nusa Tenggara Barat', 'West Papua': 'Papua Barat', 'West Sulawesi': 'Sulawesi Barat', 'West Sumatra': 'Sumatera Barat',
};

function simplify(ring, tol) {
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let worst = 0, at = -1;
    for (let i = a + 1; i < b; i++) {
      // A closed ring starts and ends on the same point: measure from that point instead
      const d = len ? Math.abs(dy * (ring[i][0] - ax) - dx * (ring[i][1] - ay)) / len : Math.hypot(ring[i][0] - ax, ring[i][1] - ay);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return ring.filter((_, i) => keep[i]);
}

const planarArea = (ring) => Math.abs(ring.reduce((s, p, i) => s + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1], 0) / 2);

function shrink(geometry, tol, minArea, digits) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const sized = polys.map((p) => ({ p, area: planarArea(p[0]) })).sort((a, b) => b.area - a.area);
  const round = (n) => Number(n.toFixed(digits));
  const out = [];
  sized.forEach(({ p, area }, i) => {
    // The largest piece always stays, so no province or country disappears
    if (i > 0 && area < minArea) return;
    let ring = simplify(p[0], tol).map(([x, y]) => [round(x), round(y)]);
    ring = ring.filter((pt, k) => k === 0 || pt[0] !== ring[k - 1][0] || pt[1] !== ring[k - 1][1]);
    if (ring.length < 4) return;
    if (geoArea({ type: 'Polygon', coordinates: [ring] }) > 2 * Math.PI) ring.reverse();
    out.push([ring]);
  });
  return { type: 'MultiPolygon', coordinates: out };
}

const [idnPath, worldPath] = process.argv.slice(2);
if (!idnPath || !worldPath) throw new Error('Usage: node scripts/build-maps.mjs <IDN ADM1 geojson> <NE 110m countries geojson>');
mkdirSync('public/maps', { recursive: true });

const idn = JSON.parse(readFileSync(idnPath, 'utf8')).features.map((f) => ({
  type: 'Feature',
  properties: { name: PIHPS_NAME[f.properties.shapeName] ?? f.properties.shapeName },
  geometry: shrink(f.geometry, 0.02, 0.004, 2),
}));
writeFileSync('public/maps/indonesia.json', JSON.stringify({ type: 'FeatureCollection', features: idn }));

const world = JSON.parse(readFileSync(worldPath, 'utf8')).features.map((f) => ({
  type: 'Feature',
  properties: { iso: f.properties.ISO_A2_EH !== '-99' ? f.properties.ISO_A2_EH : f.properties.ISO_A2, name: f.properties.NAME },
  geometry: shrink(f.geometry, 0.15, 0.05, 1),
}));
writeFileSync('public/maps/world.json', JSON.stringify({ type: 'FeatureCollection', features: world }));
console.log(`indonesia.json: ${idn.length} provinces · world.json: ${world.length} countries`);

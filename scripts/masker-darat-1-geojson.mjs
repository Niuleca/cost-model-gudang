import { readFileSync, writeFileSync } from 'node:fs';
import * as topo from './topojson-client-3.1.0/dist/topojson-client.js';
const t = JSON.parse(readFileSync('./world-atlas-2.0.2/countries-10m.json', 'utf8'));
const g = topo.feature(t, t.objects.countries);
const polys = [];
for (const f of g.features) { const geom = f.geometry; const ps = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const p of ps) { const xs = p[0].map(c => c[0]), ys = p[0].map(c => c[1]);
    if (Math.max(...xs) < 88 || Math.min(...xs) > 147 || Math.max(...ys) < -17 || Math.min(...ys) > 14) continue; polys.push(p); } }
writeFileSync('land_id.json', JSON.stringify(polys)); console.log(polys.length);

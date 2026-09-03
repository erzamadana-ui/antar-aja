// Menyalin Leaflet (JS + CSS) dari node_modules menjadi string TypeScript
// agar bisa disuntikkan ke WebView di Android/iOS tanpa CDN.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const js = readFileSync(join(root, 'node_modules/leaflet/dist/leaflet.js'), 'utf8');
const css = readFileSync(join(root, 'node_modules/leaflet/dist/leaflet.css'), 'utf8');
const out = `// FILE INI DIBUAT OTOMATIS oleh scripts/gen-leaflet.mjs — jangan diedit manual.
/* eslint-disable */
export const LEAFLET_JS: string = ${JSON.stringify(js)};
export const LEAFLET_CSS: string = ${JSON.stringify(css)};
`;
mkdirSync(join(root, 'src/components/map'), { recursive: true });
writeFileSync(join(root, 'src/components/map/leaflet-bundle.ts'), out);
console.log('leaflet-bundle.ts ditulis:', Math.round(out.length / 1024), 'KB');

import { readFile, writeFile } from 'node:fs/promises';

const vendor = './vendor/three/';
const entry = 'anatrea-pins/demo';
const modules = [
  ['three', `${vendor}three.module.min.js`],
  ['three/addons/controls/OrbitControls.js', `${vendor}addons/controls/OrbitControls.js`],
  ['three/addons/utils/BufferGeometryUtils.js', `${vendor}addons/utils/BufferGeometryUtils.js`],
  ['three/addons/loaders/GLTFLoader.js', `${vendor}addons/loaders/GLTFLoader.js`, {
    '../utils/BufferGeometryUtils.js': 'three/addons/utils/BufferGeometryUtils.js'
  }],
  ['anatrea-pins/core', '../src/index.js'],
  ['anatrea-pins/three', '../src/three.js'],
  ['anatrea-pins/bearing', './bearing.js', { '../src/three.js': 'anatrea-pins/three' }],
  ['anatrea-pins/samples', './samples.js', { './bearing.js': 'anatrea-pins/bearing' }],
  [entry, './app.js', {
    '../src/index.js': 'anatrea-pins/core',
    '../src/three.js': 'anatrea-pins/three',
    './samples.js': 'anatrea-pins/samples'
  }]
];

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

function replaceRequired(source, pattern, replacement) {
  if (!source.match(pattern)) throw new Error(`The demo source no longer contains ${pattern}.`);
  return source.replace(pattern, () => replacement);
}

const entries = await Promise.all(modules.map(async ([id, path, aliases = {}]) => {
  let source = await read(path);
  for (const [from, to] of Object.entries(aliases)) {
    source = replaceRequired(source, `'${from}'`, `'${to}'`);
  }
  return [id, `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`];
}));

const [index, styles, projectLicense, threeLicense, sample, attribution] = await Promise.all([
  read('./index.html'), read('./styles.css'), read('../LICENSE'), read(`${vendor}LICENSE`),
  readFile(new URL('./models/knee-bones.glb', import.meta.url)), read('./models/ATTRIBUTION.md')
]);
const sampleModule = `export const sampleUrl = "data:model/gltf-binary;base64,${sample.toString('base64')}";`;
entries.push(['anatrea-pins/sample-data', `data:text/javascript;base64,${Buffer.from(sampleModule).toString('base64')}`]);
const map = JSON.stringify({ imports: Object.fromEntries(entries) });
let html = replaceRequired(index, /<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">${map}</script>`);
html = replaceRequired(html, '<link rel="stylesheet" href="./styles.css">', `<style>\n${styles}</style>`);
html = replaceRequired(html, '<script type="module" src="./app.js"></script>', `<script type="module">import '${entry}';</script>`);
html = replaceRequired(html, 'href="./"', 'href="#"');
html = replaceRequired(html, '</body>', `<!-- Anatrea Pins\n${projectLicense}\nThree.js\n${threeLicense}\n${attribution}-->\n</body>`);
await writeFile(new URL('../anatrea-pins-demo.html', import.meta.url), html);

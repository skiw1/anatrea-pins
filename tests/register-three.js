import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') {
      return { url: new URL('../demo/vendor/three/three.module.min.js', import.meta.url).href, shortCircuit: true };
    }
    if (specifier.startsWith('three/addons/')) {
      const path = specifier.slice('three/addons/'.length);
      return { url: new URL(`../demo/vendor/three/addons/${path}`, import.meta.url).href, shortCircuit: true };
    }
    if (specifier === 'anatrea-pins/sample-data') {
      const model = readFileSync(new URL('../demo/models/knee-bones.glb', import.meta.url));
      const source = `export const sampleUrl = "data:model/gltf-binary;base64,${model.toString('base64')}";`;
      return { url: `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

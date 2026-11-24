import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Vector3 } from 'three';
import { createThreeSurface } from '../src/three.js';

const camera = new PerspectiveCamera(40, 1, 0.1, 50);
camera.position.set(0, 0, 5);

for (const geometry of [new BoxGeometry(), new PlaneGeometry().toNonIndexed()]) {
  test(`a ${geometry.type} anchor survives export and changes of the model transform`, () => {
    const model = new Group();
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    mesh.name = 'surface';
    model.add(mesh);
    const surface = createThreeSurface(model, { meshKey: item => item.name });
    const hit = surface.pick(camera, { x: 0.05, y: -0.05 });
    assert.equal(hit.mesh, 'surface');
    const before = surface.resolve(hit);
    assert.ok(Math.abs(before.point.z - (geometry.type === 'BoxGeometry' ? 0.5 : 0)) < 1e-6);
    model.rotation.set(0.25, 0.5, 0.85);
    model.position.set(1, 2, 3);
    model.scale.set(1.5, 0.75, 2);
    const reloadedSurface = createThreeSurface(model, { meshKey: item => item.name });
    const after = reloadedSurface.resolve(JSON.parse(JSON.stringify(hit)));
    const expectedPoint = mesh.localToWorld(before.point.clone());
    assert.ok(after.point.distanceTo(expectedPoint) < 1e-6);
    assert.ok(Math.abs(after.normal.length() - 1) < 1e-6);
    assert.ok(after.normal.angleTo(new Vector3(0, 0, 1)) > 0.1);
    model.visible = false;
    assert.equal(surface.pick(camera, { x: 0, y: 0 }), null);
    assert.throws(() => reloadedSurface.resolve({ ...hit, mesh: 'missing' }), /absent/);
    assert.throws(() => reloadedSurface.resolve({ ...hit, triangle: 9999 }), /triangle absent/);
  });
}

test('isolating a nested mesh hides its parent from picking and preserves both anchors', () => {
  const parent = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const child = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  parent.name = 'outer';
  child.name = 'inner';
  child.position.z = -2;
  child.layers.enable(2);
  parent.add(child);
  const surface = createThreeSurface(parent, { meshKey: mesh => mesh.name });
  const front = surface.pick(camera, { x: 0, y: 0 });
  assert.equal(front.mesh, 'outer');
  surface.setVisibleStructures(['inner']);
  const back = surface.pick(camera, { x: 0, y: 0 });
  assert.equal(back.mesh, 'inner');
  assert.deepEqual(surface.structures().map(part => part.visible), [false, true]);
  assert.equal(surface.resolve(front).mesh, parent);
  surface.setVisibleStructures([]);
  assert.equal(surface.pick(camera, { x: 0, y: 0 }), null);
  surface.setVisibleStructures(null);
  assert.equal(surface.pick(camera, { x: 0, y: 0 }).mesh, 'outer');
  assert.equal(child.layers.mask, 5);
  assert.equal(surface.resolve(back).mesh, child);
});

test('exploding selected nested parts preserves their anchors and restores the model without drift', () => {
  const model = new Group();
  model.rotation.y = 0.45;
  model.scale.set(1.25, 0.9, 1.5);
  const parent = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const child = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  parent.name = 'parent';
  child.name = 'child';
  child.position.set(0, 0, -2);
  parent.matrixAutoUpdate = false;
  parent.matrix.makeTranslation(0.3, 0, 0);
  parent.add(child);
  model.add(parent);
  const surface = createThreeSurface(model, { meshKey: mesh => mesh.name });
  const anchor = mesh => ({ mesh, triangle: 0, weights: [1, 0, 0], normalSign: 1 });
  const atRest = surface.resolve(anchor('parent')).point;
  const childAtRest = surface.resolve(anchor('child')).point;
  const geometryPosition = parent.geometry.attributes.position.array.slice();
  surface.setExplodedView(1, ['parent']);
  const separated = surface.resolve(anchor('parent')).point;
  assert.ok(separated.distanceTo(atRest) > 0.2);
  assert.ok(surface.resolve(anchor('child')).point.distanceTo(childAtRest) < 1e-9);
  surface.setExplodedView(1, ['parent']);
  assert.ok(surface.resolve(anchor('parent')).point.distanceTo(separated) < 1e-9);
  surface.setExplodedView(0);
  assert.ok(surface.resolve(anchor('parent')).point.distanceTo(atRest) < 1e-9);
  assert.deepEqual(parent.geometry.attributes.position.array, geometryPosition);
});

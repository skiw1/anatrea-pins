import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Vector3 } from 'three';
import { loadSample } from '../demo/samples.js';
import { createExam, createProject } from '../src/index.js';
import { createThreeSurface } from '../src/three.js';

test('bundled femur landmarks stay at the reviewed model coordinates', async () => {
  const { model, pins } = await loadSample('bone');
  assert.deepEqual(model.children.map(mesh => mesh.name), ['Femur.r']);
  const surface = createThreeSurface(model);
  assert.equal(pins.length, 4);
  for (const pin of pins) assert.equal(surface.resolve(pin.anchor).mesh.name, 'Femur.r');
  const head = surface.resolve(pins[0].anchor);
  assert.ok(head.point.distanceTo(new Vector3(-0.032, 0.87, 0.003174506473619103)) < 1e-6);

  const project = createProject('test-femur', { pins, exam: { count: 1, secondsPerPin: 30 } });
  for (const answer of ['Caput femoris', 'Femoral head', 'Hlavica stehennej kosti']) {
    const exam = createExam(project, { random: () => 0 });
    exam.submit(exam.current().id, answer);
    assert.equal(exam.results().score, 1);
  }
});

test('the knee model contains four separately selectable bones with matching pins', async () => {
  const { model, pins } = await loadSample('assembly');
  const surface = createThreeSurface(model);
  const names = ['Femur.r', 'Patella.r', 'Tibia.r', 'Fibula.r'];
  assert.deepEqual(surface.structures().map(part => part.name), names);
  assert.deepEqual(pins.map(pin => surface.resolve(pin.anchor).mesh.name), names);
  surface.setVisibleStructures([pins[1].anchor.mesh]);
  assert.deepEqual(surface.structures().filter(part => part.visible).map(part => part.name), ['Patella.r']);
});

test('the five bearing parts separate along the shaft with a gap and keep their pin anchors', async () => {
  const { model, pins, explosionAxis } = await loadSample('bearing');
  const surface = createThreeSurface(model, { explosionAxis });
  const atRest = pins.map(pin => surface.resolve(pin.anchor));
  const localPoints = atRest.map(({ point, mesh }) => mesh.worldToLocal(point.clone()));
  assert.equal(pins.length, 5);
  assert.deepEqual(atRest.map(({ mesh }) => mesh.name), pins.map(pin => pin.id));

  surface.setExplodedView(1);
  const bounds = model.children.map(mesh => new Box3().setFromObject(mesh)).sort((a, b) => a.min.y - b.min.y);
  for (let index = 1; index < bounds.length; index++) {
    assert.ok(bounds[index].min.y - bounds[index - 1].max.y > 0.3);
  }
  for (const [index, pin] of pins.entries()) {
    const { point, mesh } = surface.resolve(pin.anchor);
    assert.ok(Math.abs(point.x - atRest[index].point.x) < 1e-9);
    assert.ok(Math.abs(point.z - atRest[index].point.z) < 1e-9);
    assert.ok(point.distanceTo(mesh.localToWorld(localPoints[index].clone())) < 1e-9);
  }

  const shaft = atRest.at(-1).mesh;
  const stationary = model.children.filter(mesh => mesh !== shaft);
  surface.setExplodedView(1, [pins.at(-1).anchor.mesh]);
  const fixedMax = Math.max(...stationary.map(mesh => new Box3().setFromObject(mesh).max.y));
  assert.ok(new Box3().setFromObject(shaft).min.y - fixedMax > 0.3);
  assert.ok(pins.slice(0, -1).every((pin, index) => surface.resolve(pin.anchor).point.distanceTo(atRest[index].point) < 1e-9));

  surface.setExplodedView(0);
  assert.ok(pins.every((pin, index) => surface.resolve(pin.anchor).point.distanceTo(atRest[index].point) < 1e-9));
});

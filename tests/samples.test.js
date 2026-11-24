import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
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

test('the mechanical sample pins remain on all five parts after separation', async () => {
  const { model, pins } = await loadSample('bearing');
  const surface = createThreeSurface(model);
  const atRest = pins.map(pin => surface.resolve(pin.anchor).point);
  assert.equal(pins.length, 5);
  assert.deepEqual(pins.map(pin => surface.resolve(pin.anchor).mesh.name), pins.map(pin => pin.id));

  surface.setExplodedView(1);
  const separated = pins.map(pin => surface.resolve(pin.anchor).point);
  assert.ok(separated.every((point, index) => point.distanceTo(atRest[index]) > 0.1));
  assert.ok(separated[1].distanceTo(separated[2]) > atRest[1].distanceTo(atRest[2]));
  surface.setExplodedView(0);
  assert.ok(pins.every((pin, index) => surface.resolve(pin.anchor).point.distanceTo(atRest[index]) < 1e-9));
});

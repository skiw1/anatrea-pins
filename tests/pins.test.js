import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExam, createProject, parseProject, removePin, serializeProject, upsertPin } from '../src/index.js';

const anchor = { mesh: 'femur', triangle: 1, weights: [0.2, 0.3, 0.5], normalSign: 1 };
const pin = (id, label, inExam = true, answers = []) => ({ id, label, answers, inExam, anchor });

test('names, accepted answers, study-only pins and positions round-trip through JSON', () => {
  let project = createProject('atlas/glb-v1', { pins: [pin('1', 'Caput femoris'), pin('2', 'Fovea capitis')] });
  project = upsertPin(project, { ...project.pins[0], label: 'Trochanter major', inExam: false, answers: ['Greater trochanter'] });
  project = removePin(project, '2');
  assert.deepEqual(parseProject(serializeProject(project)), project);
  assert.equal(project.pins.length, 1);
  assert.deepEqual(project.pins[0].anchor, anchor);
  assert.throws(() => parseProject(serializeProject(project).replace('"version": 1', '"version": 2')), /format/);
  assert.throws(() => createProject('model', { pins: [pin('1', 'A'), pin('1', 'B')] }), /unique/);
  assert.throws(() => upsertPin(project, { ...project.pins[0], anchor: { ...anchor, weights: [0.9, 0.9, 0] } }), /anchor/);
});

test('only eligible pins are drawn, aliases score and solutions remain out of the question view', () => {
  const project = createProject('model', {
    pins: [pin('1', 'Caput femoris', true, ['Femoral head']), pin('2', 'Fovea capitis', false), pin('3', 'Collum femoris')],
    exam: { count: 2, secondsPerPin: 30 }
  });
  const exam = createExam(project, { now: () => 0, random: () => 0 });
  assert.equal(exam.results(), null);
  assert.equal(exam.lastResponse(), null);
  const question = exam.current();
  assert.equal(question.id, '1');
  assert.equal(question.label, undefined);
  assert.equal(question.answers, undefined);
  assert.equal(exam.submit(question.id, '  FEMORAL   HEAD  '), true);
  assert.deepEqual(exam.lastResponse(), { number: 1, correct: true, timedOut: false });
  assert.equal(exam.results(), null);
  assert.equal(exam.current().id, '3');
  assert.equal(exam.submit('3', 'Trochanter'), true);
  assert.deepEqual(exam.lastResponse(), { number: 2, correct: false, timedOut: false });
  const result = exam.results();
  assert.equal(result.score, 1);
  assert.deepEqual(result.responses.map(({ answer, label }) => [answer, label]), [
    ['FEMORAL   HEAD', 'Caput femoris'], ['Trochanter', 'Collum femoris']
  ]);
  assert.throws(() => createExam({ ...project, exam: { ...project.exam, count: 3 } }), /Enable at least 3/);
});

test('timeouts cannot submit stale answers to the next question or reset the clock', () => {
  const project = createProject('model', {
    pins: [pin('1', 'A'), pin('2', 'B'), pin('3', 'C')],
    exam: { count: 3, secondsPerPin: 10 }
  });
  let elapsed = 0;
  const exam = createExam(project, { now: () => elapsed, random: () => 0 });
  elapsed = 10001;
  assert.equal(exam.submit('1', 'A'), false);
  assert.deepEqual(exam.lastResponse(), { number: 1, correct: false, timedOut: true });
  assert.equal(exam.current().id, '2');
  assert.equal(exam.current().remainingMs, 9999);
  assert.equal(exam.submit('2', 'B'), true);
  elapsed = 20001;
  assert.equal(exam.current(), null);
  assert.deepEqual(exam.results().responses.map(response => response.timedOut), [true, false, true]);
  assert.equal(exam.results().score, 1);
});

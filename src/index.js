function nonemptyText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be non-empty text.`);
  return value.trim();
}

function integer(value, minimum, maximum, field) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${field} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function validateAnchor(anchor) {
  if (!anchor || !Array.isArray(anchor.weights) || anchor.weights.length !== 3 ||
      !anchor.weights.every(weight => Number.isFinite(weight) && weight >= 0 && weight <= 1) ||
      Math.abs(anchor.weights.reduce((sum, weight) => sum + weight, 0) - 1) > 1e-6 ||
      ![-1, 1].includes(anchor.normalSign)) {
    throw new TypeError('Invalid surface anchor.');
  }
  return {
    mesh: nonemptyText(anchor.mesh, 'Mesh key'),
    triangle: integer(anchor.triangle, 0, Number.MAX_SAFE_INTEGER, 'Triangle'),
    weights: [...anchor.weights],
    normalSign: anchor.normalSign
  };
}

export function normalizeAnswer(value) {
  return String(value ?? '').normalize('NFC').toLowerCase().trim().replace(/\s+/gu, ' ');
}

function validatePin(pin) {
  if (!pin || typeof pin.inExam !== 'boolean' || !Array.isArray(pin.answers)) {
    throw new TypeError('A pin needs an answer list and an inExam flag.');
  }
  return {
    id: nonemptyText(pin.id, 'Pin ID'),
    label: nonemptyText(pin.label, 'Pin label'),
    answers: [...new Set(pin.answers.map(answer => nonemptyText(answer, 'Accepted answer')))],
    inExam: pin.inExam,
    anchor: validateAnchor(pin.anchor)
  };
}

export function createProject(modelId, { pins = [], exam = { count: 20, secondsPerPin: 30 } } = {}) {
  const validatedPins = Array.from(pins, validatePin);
  if (new Set(validatedPins.map(pin => pin.id)).size !== validatedPins.length) {
    throw new TypeError('Pin IDs must be unique.');
  }
  return {
    version: 1,
    modelId: nonemptyText(modelId, 'Model ID'),
    pins: validatedPins,
    exam: {
      count: integer(exam.count, 1, 1000, 'Pin count'),
      secondsPerPin: integer(exam.secondsPerPin, 1, 3600, 'Seconds per pin')
    }
  };
}

export function parseProject(json) {
  const data = JSON.parse(json);
  if (data?.version !== 1 || !Array.isArray(data.pins) || !data.exam) {
    throw new TypeError('Unsupported pin project format.');
  }
  return createProject(data.modelId, data);
}

export function serializeProject(project) {
  return `${JSON.stringify(createProject(project.modelId, project), null, 2)}\n`;
}

export function upsertPin(project, pin) {
  const updated = validatePin(pin);
  const pins = project.pins.slice();
  const index = pins.findIndex(entry => entry.id === updated.id);
  if (index === -1) pins.push(updated);
  else pins[index] = updated;
  return { ...project, pins };
}

export function removePin(project, id) {
  return { ...project, pins: project.pins.filter(pin => pin.id !== id) };
}

export function createExam(project, { now = () => performance.now(), random = Math.random } = {}) {
  const { pins, exam } = createProject(project.modelId, project);
  const questions = pins.filter(pin => pin.inExam);
  if (questions.length < exam.count) {
    throw new RangeError(`Enable at least ${exam.count} pins to start this exam.`);
  }
  for (let index = 0; index < exam.count; index += 1) {
    const swap = index + Math.floor(random() * (questions.length - index));
    [questions[index], questions[swap]] = [questions[swap], questions[index]];
  }
  const duration = exam.secondsPerPin * 1000;
  const responses = [];
  let deadline = now() + duration;

  function record(answer, timedOut) {
    const pin = questions[responses.length];
    const normalized = normalizeAnswer(answer);
    responses.push({
      id: pin.id,
      label: pin.label,
      answer,
      correct: !timedOut && [pin.label, ...pin.answers].some(value => normalizeAnswer(value) === normalized),
      timedOut
    });
  }

  function expire(time) {
    while (responses.length < exam.count && time >= deadline) {
      record('', true);
      deadline += duration;
    }
  }

  return {
    current() {
      const time = now();
      expire(time);
      if (responses.length === exam.count) return null;
      const { id, anchor } = questions[responses.length];
      return {
        id,
        anchor: { ...anchor, weights: [...anchor.weights] },
        number: responses.length + 1,
        total: exam.count,
        remainingMs: deadline - time
      };
    },
    submit(id, answer) {
      const time = now();
      expire(time);
      if (responses.length === exam.count || questions[responses.length].id !== id) return false;
      record(String(answer ?? '').trim(), false);
      deadline = time + duration;
      return true;
    },
    lastResponse() {
      const response = responses.at(-1);
      if (!response) return null;
      return { number: responses.length, correct: response.correct, timedOut: response.timedOut };
    },
    results() {
      expire(now());
      if (responses.length < exam.count) return null;
      return {
        score: responses.filter(response => response.correct).length,
        total: exam.count,
        responses: responses.map(response => ({ ...response }))
      };
    }
  };
}

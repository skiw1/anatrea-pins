import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createThreeSurface } from '../src/three.js';
import { createExam, createProject, parseProject, removePin, serializeProject, upsertPin } from '../src/index.js';
import { loadSample, samplePartNames, sampleTitles } from './samples.js';

const $ = id => document.getElementById(id);
let language = 'en';
const t = (sk, en) => language === 'en' ? en : sk;
const viewport = $('scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#16222b');
const renderer = initializeRenderer();
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 120);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 0.35;
controls.maxDistance = 16;
scene.add(new THREE.HemisphereLight('#fff4de', '#71878a', 2));
const keyLight = new THREE.DirectionalLight('#fff8e4', 2);
keyLight.position.set(2, 4, 5);
scene.add(keyLight);

const modelLayer = new THREE.Group();
const markers = new THREE.Group();
const pinHead = new THREE.SphereGeometry(1, 20, 14);
const pinShaft = new THREE.ConeGeometry(1, 1, 14).rotateZ(Math.PI);
const pinMaterial = new THREE.MeshStandardMaterial({ color: '#c8273d', emissive: '#590915', emissiveIntensity: 0.35, roughness: 0.3 });
const selectedMaterial = new THREE.MeshStandardMaterial({ color: '#ed4760', emissive: '#590915', emissiveIntensity: 0.35, roughness: 0.3 });
const steel = new THREE.MeshStandardMaterial({ color: '#c7ced5', metalness: 0.3, roughness: 0.32 });
const up = new THREE.Vector3(0, 1, 0);
const cameraSpace = new THREE.Vector3();
const pinPixelFactor = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
scene.add(modelLayer, markers);

let surface;
let project;
let draft;
let placing = false;
let exam;
let activeQuestion;
let busy = false;
let activeModelChoice;
const recentProjects = new Map();
const pinHistory = new Map();
const selectedStructures = new Set();
let visibleStructures = null;
let statusText = ['', ''];
let displayedSeparation = 0;
let editorView;
const translations = [
  ['data-sk', 'textContent'],
  ['data-sk-placeholder', 'placeholder'],
  ['data-sk-label', 'aria-label']
].flatMap(([attribute, property]) => Array.from(document.querySelectorAll(`[${attribute}]`), element => {
  const english = property === 'textContent' ? element.textContent : element.getAttribute(property);
  return { element, property, slovak: element.getAttribute(attribute), english };
}));

function initializeRenderer() {
  try {
    const result = new THREE.WebGLRenderer({ antialias: true });
    result.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    viewport.append(result.domElement);
    return result;
  } catch {
    $('status').textContent = 'WebGL could not start. Try a browser with hardware acceleration enabled.';
    $('status').dataset.error = 'true';
    throw new Error('WebGL unavailable');
  }
}

function status(sk = '', en = sk, error = false) {
  statusText = [sk, en];
  $('status').textContent = t(...statusText);
  $('status').dataset.error = String(error);
}

$('language').onchange = () => {
  language = $('language').value;
  document.documentElement.lang = language;
  for (const { element, property, slovak, english } of translations) {
    const value = t(slovak, english);
    if (property === 'textContent') element.textContent = value;
    else element.setAttribute(property, value);
  }
  $('status').textContent = t(...statusText);
  if (!project) return;
  if (sampleTitles[activeModelChoice]) $('model-name').textContent = t(...sampleTitles[activeModelChoice]);
  setPlacing(placing);
  if (draft) renderHistory();
  renderStructures();
  if (exam) {
    const result = exam.results();
    if (result) renderExamResults(result);
  } else {
    renderPins();
  }
};

function resize() {
  if (viewport.clientWidth && viewport.clientHeight) {
    renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
  }
}

new ResizeObserver(resize).observe(viewport);
renderer.setAnimationLoop(() => {
  controls.update();
  if (exam) drawExam();
  camera.updateMatrixWorld();
  const height = Math.max(1, viewport.clientHeight);
  for (const marker of markers.children) {
    cameraSpace.copy(marker.position).applyMatrix4(camera.matrixWorldInverse);
    marker.scale.setScalar(Math.max(camera.near, -cameraSpace.z) * pinPixelFactor / height);
  }
  renderer.render(scene, camera);
});

function disposeModel(group) {
  const resources = new Set();
  group.traverse(object => {
    if (!object.isMesh) return;
    resources.add(object.geometry);
    for (const material of [object.material].flat()) {
      resources.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) resources.add(value);
      }
    }
  });
  for (const resource of resources) resource.dispose();
}

function setModel(model, modelId, title, viewDirection = new THREE.Vector3(0, 0, 1)) {
  const nextSurface = createThreeSurface(model);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z);
  if (!(extent > 0 && Number.isFinite(extent))) throw new Error('The model has no usable dimensions.');
  if (project) recentProjects.set(project.modelId, project);
  disposeModel(modelLayer);
  modelLayer.clear();
  modelLayer.scale.setScalar(2 / extent);
  modelLayer.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-2 / extent);
  modelLayer.add(model);
  surface = nextSurface;
  selectedStructures.clear();
  visibleStructures = null;
  displayedSeparation = 0;
  $('explosion').value = '0';
  $('explode-selected').checked = false;
  $('explosion-value').textContent = '0%';
  $('separation-tools').hidden = surface.structures().length < 2;
  $('structure-search').value = '';
  const existing = recentProjects.get(modelId);
  project = existing ?? createProject(modelId);
  $('model-name').textContent = title;
  resize();
  controls.target.set(0, 0, 0);
  camera.position.copy(viewDirection).setLength(4 / Math.min(1, camera.aspect));
  controls.update();
  closeForm();
  renderStructures();
  renderSettings();
  return Boolean(existing);
}

async function openSample(which) {
  const { model, id, pins } = await loadSample(which);
  const direction = which === 'bearing' ? new THREE.Vector3(2, 2.6, 4) : undefined;
  if (!setModel(model, id, t(...sampleTitles[which]), direction)) {
    project = createProject(id, { pins, exam: { count: pins.length, secondsPerPin: 30 } });
  }
  activeModelChoice = which;
  renderPins();
  renderStructures();
  renderSettings();
}

function renderPins() {
  const query = $('pin-search').value.trim().toLocaleLowerCase(language);
  const pins = project.pins.filter(pin => pin.id === draft?.id ||
    [pin.label, ...pin.answers].some(term => term.toLocaleLowerCase(language).includes(query)));
  const placeholder = query && !pins.length ? t('Žiadne výsledky', 'No results') : t('Vyber štruktúru', 'Choose structure');
  $('pin-picker').replaceChildren(option('', placeholder), ...pins.map(pin =>
    option(pin.id, pin.inExam ? pin.label : `${pin.label} ${t('(mimo testu)', '(excluded from test)')}`)
  ));
  $('pin-picker').value = pins.some(pin => pin.id === draft?.id) ? draft.id : '';
  renderEditorMarkers();
}

function option(value, label) {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
  return item;
}

function structureButtonState() {
  $('isolate-parts').disabled = selectedStructures.size === 0;
  $('hide-parts').disabled = selectedStructures.size === 0;
  $('restore-parts').disabled = visibleStructures === null && selectedStructures.size === 0;
}

function renderStructures() {
  const parts = surface.structures();
  const query = $('structure-search').value.trim().toLocaleLowerCase(language);
  $('structure-count').textContent = `${parts.filter(part => part.visible).length} / ${parts.length}`;
  const rows = [];
  for (const part of parts) {
    const names = sampleTitles[activeModelChoice] && Object.hasOwn(samplePartNames, part.name) ?
      samplePartNames[part.name] : null;
    const name = names ? t(...names) : (part.name || `${t('Časť', 'Part')} ${part.key}`);
    if (![name, ...(names ?? [])].some(term => term.toLocaleLowerCase(language).includes(query))) continue;
    const row = document.createElement('li');
    const label = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = selectedStructures.has(part.key);
    check.onchange = () => {
      if (check.checked) selectedStructures.add(part.key);
      else selectedStructures.delete(part.key);
      structureButtonState();
      if ($('explode-selected').checked) applySeparation();
    };
    label.append(check, ` ${name}`);
    if (!part.visible) {
      const hidden = document.createElement('small');
      hidden.textContent = t(' (skrytá)', ' (hidden)');
      label.append(hidden);
    }
    row.append(label);
    rows.push(row);
  }
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.textContent = t('Žiadne výsledky.', 'No results.');
    rows.push(empty);
  }
  $('structure-list').replaceChildren(...rows);
  structureButtonState();
}

function updateVisibility() {
  surface.setVisibleStructures(visibleStructures);
  renderStructures();
  renderPins();
}

function applySeparation() {
  const percentage = $('explosion').valueAsNumber;
  const amount = percentage / 100;
  const selected = $('explode-selected').checked ? selectedStructures : null;
  surface.setExplodedView(amount, selected);
  const visibleAmount = selected?.size === 0 ? 0 : amount;
  const scale = (1 + visibleAmount * 0.35) / (1 + displayedSeparation * 0.35);
  camera.position.sub(controls.target).multiplyScalar(scale).add(controls.target);
  controls.update();
  displayedSeparation = visibleAmount;
  $('explosion-value').textContent = `${percentage}%`;
  renderEditorMarkers();
}

$('explosion').oninput = applySeparation;
$('explode-selected').onchange = applySeparation;
$('structure-search').oninput = renderStructures;
$('isolate-parts').onclick = () => {
  if (!selectedStructures.size) return;
  visibleStructures = new Set(selectedStructures);
  updateVisibility();
};
$('hide-parts').onclick = () => {
  if (!selectedStructures.size) return;
  visibleStructures = new Set(surface.structures()
    .filter(part => part.visible && !selectedStructures.has(part.key))
    .map(part => part.key));
  updateVisibility();
};
$('restore-parts').onclick = () => {
  visibleStructures = null;
  selectedStructures.clear();
  updateVisibility();
  if ($('explode-selected').checked) applySeparation();
};

function renderEditorMarkers() {
  renderMarkers(project.pins.filter(pin => pin.id !== draft?.id), draft?.anchor);
}

function renderMarkers(pins, selectedAnchor) {
  markers.clear();
  const visibleParts = new Set(surface.structures().filter(part => part.visible).map(part => part.key));
  for (const pin of pins) {
    if (visibleParts.has(pin.anchor.mesh)) addMarker(pin.anchor, pinMaterial);
  }
  if (selectedAnchor && visibleParts.has(selectedAnchor.mesh)) addMarker(selectedAnchor, selectedMaterial);
}

function addMarker(anchor, material) {
  const { point, normal } = surface.resolve(anchor);
  const direction = normal.clone();
  const towardCamera = camera.position.clone().sub(point).normalize();
  if (direction.dot(towardCamera) > 0.8) {
    const screenUp = up.clone().applyQuaternion(camera.quaternion);
    direction.addScaledVector(screenUp, 0.6).normalize();
  }
  const marker = new THREE.Group();
  marker.position.copy(point);
  marker.quaternion.setFromUnitVectors(up, direction);
  const head = new THREE.Mesh(pinHead, material);
  head.scale.setScalar(7);
  head.position.y = 38;
  const shaft = new THREE.Mesh(pinShaft, steel);
  shaft.scale.set(0.8, 38, 0.8);
  shaft.position.y = 19;
  head.frustumCulled = false;
  shaft.frustumCulled = false;
  marker.add(head, shaft);
  markers.add(marker);
}

function setPlacing(value) {
  placing = value;
  viewport.classList.toggle('placing', value);
  controls.enabled = !value;
  $('place-pin').setAttribute('aria-pressed', String(value));
  $('place-pin').textContent = value ? t('Zrušiť umiestnenie', 'Cancel placement') : (draft?.anchor ?
    t('Presunúť na modeli', 'Move on model') : t('Umiestniť na model', 'Place on model'));
  $('save-pin').disabled = !draft?.anchor || value;
  $('placement-status').textContent = value ? t('Klikni alebo ťukni na povrch modelu.', 'Click or tap the model surface.') :
    (draft?.anchor ? t('Pred uložením skontroluj hrot pinu.', 'Check the pin tip before saving.') :
      (draft ? t('Umiestni pin na model.', 'Place the pin on the model.') :
        t('Vyber štruktúru alebo pridaj pin.', 'Choose a structure or add a pin.')));
}

function historyKey(id) {
  return JSON.stringify([project.modelId, id]);
}

function renderHistory() {
  const history = pinHistory.get(historyKey(draft.id)) ?? [];
  const selected = $('history-picker').value;
  $('pin-history').hidden = history.length === 0;
  $('history-picker').replaceChildren(...history.map((position, index) =>
    option(String(index), `${t('Poloha', 'Position')} ${history.length - index}`)
  ));
  if (selected && Number(selected) < history.length) $('history-picker').value = selected;
}

function openForm(pin) {
  draft = pin ? { ...pin } : { id: crypto.randomUUID(), anchor: null };
  $('pin-form').hidden = false;
  $('pin-label').value = pin?.label ?? '';
  $('pin-answers').value = pin?.answers.join('\n') ?? '';
  $('pin-include').checked = pin?.inExam ?? true;
  $('delete-pin').hidden = !pin;
  $('pin-history').open = false;
  renderHistory();
  setPlacing(false);
  renderPins();
  $('pin-label').focus();
}

function closeForm() {
  draft = null;
  setPlacing(false);
  $('pin-form').hidden = true;
  renderPins();
}

$('new-pin').onclick = () => openForm();
$('cancel-pin').onclick = closeForm;
$('pin-search').oninput = renderPins;
$('pin-picker').onchange = () => {
  const pin = project.pins.find(item => item.id === $('pin-picker').value);
  if (pin) openForm(pin);
  else closeForm();
};
$('close-editor').onclick = () => {
  closeForm();
  $('pin-panel').hidden = true;
  $('reopen-editor').hidden = false;
  $('reopen-editor').focus();
};
$('reopen-editor').onclick = () => {
  $('pin-panel').hidden = false;
  $('reopen-editor').hidden = true;
  $('pin-search').focus();
};
$('restore-position').onclick = () => {
  draft.anchor = pinHistory.get(historyKey(draft.id))[Number($('history-picker').value)];
  setPlacing(false);
  renderPins();
};
$('place-pin').onclick = () => setPlacing(!placing);
$('delete-pin').onclick = () => {
  pinHistory.delete(historyKey(draft.id));
  project = removePin(project, draft.id);
  closeForm();
  status('Pin odstránený.', 'Pin deleted.');
};
renderer.domElement.addEventListener('pointerup', event => {
  if (!placing || event.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = {
    x: (event.clientX - rect.left) / rect.width * 2 - 1,
    y: 1 - (event.clientY - rect.top) / rect.height * 2
  };
  const anchor = surface.pick(camera, ndc);
  if (!anchor) {
    status('Vyber viditeľný povrch modelu.', 'Choose a visible model surface.', true);
    return;
  }
  draft.anchor = anchor;
  setPlacing(false);
  renderPins();
  status();
});
$('pin-form').onsubmit = event => {
  event.preventDefault();
  try {
    const previous = project.pins.find(pin => pin.id === draft.id);
    project = upsertPin(project, {
      ...draft,
      label: $('pin-label').value,
      answers: $('pin-answers').value.split(/\r?\n/).map(answer => answer.trim()).filter(Boolean),
      inExam: $('pin-include').checked
    });
    if (previous && previous.anchor !== draft.anchor) {
      const key = historyKey(draft.id);
      pinHistory.set(key, [previous.anchor, ...(pinHistory.get(key) ?? [])].slice(0, 10));
    }
    closeForm();
    status('Pin uložený. Polohy si môžeš stiahnuť ako JSON.', 'Pin saved. Download the positions as JSON.');
  } catch (error) {
    if (draft?.anchor) status(error.message, error.message, true);
    else status('Najprv umiestni pin na model.', 'Place the pin on the model first.', true);
  }
};

function renderSettings() {
  $('exam-count').value = project.exam.count;
  $('exam-time').value = project.exam.secondsPerPin;
}

function saveSettings() {
  project = createProject(project.modelId, {
    pins: project.pins,
    exam: { count: $('exam-count').valueAsNumber, secondsPerPin: $('exam-time').valueAsNumber }
  });
}

function renderExamResults(result) {
  $('answer-form').hidden = true;
  $('exam-results').hidden = false;
  $('score').textContent = `${t('Výsledok', 'Score')}: ${result.score} / ${result.total}`;
  $('responses').replaceChildren(...result.responses.map(response => {
    const item = document.createElement('li');
    const answer = response.timedOut ? t('Čas vypršal', 'Time expired') :
      (response.answer || t('Bez odpovede', 'No answer'));
    item.textContent = `${response.label} — ${answer}${response.correct ? ' ✓' : ''}`;
    return item;
  }));
  markers.clear();
}

function drawExam() {
  if ($('answer-form').hidden) return;
  const question = exam.current();
  if (!question) {
    renderExamResults(exam.results());
    return;
  }
  if (question.id !== activeQuestion?.id) {
    activeQuestion = question;
    const { point, normal } = surface.resolve(question.anchor);
    controls.target.copy(point).multiplyScalar(0.6);
    camera.position.copy(controls.target).addScaledVector(normal, 3.5 / Math.min(1, camera.aspect));
    controls.update();
    renderMarkers([], question.anchor);
    $('question-number').textContent = `Pin ${question.number} / ${question.total}`;
    $('answer').value = '';
    $('answer').focus({ preventScroll: true });
  }
  const remaining = `${Math.ceil(question.remainingMs / 1000)} s`;
  if ($('timer').textContent !== remaining) $('timer').textContent = remaining;
}

$('exam-settings').onsubmit = event => {
  event.preventDefault();
  if (busy || !project) return;
  try {
    saveSettings();
    const available = project.pins.filter(pin => pin.inExam).length;
    if (available < project.exam.count) {
      const count = project.exam.count;
      status(`Do testu treba zaradiť aspoň ${count} pinov. Teraz ich je ${available}.`,
        `Enable at least ${count} pins for the test. Currently enabled: ${available}.`, true);
      return;
    }
    exam = createExam(project);
    closeForm();
    editorView = { camera: camera.position.clone(), target: controls.target.clone() };
    surface.setExplodedView(0);
    surface.setVisibleStructures(null);
    $('separation-tools').hidden = true;
    $('structure-panel').hidden = true;
    $('editing').hidden = true;
    $('files').hidden = true;
    $('exam-panel').hidden = false;
    $('answer-form').hidden = false;
    $('exam-results').hidden = true;
    status();
    drawExam();
  } catch (error) {
    status(error.message, error.message, true);
  }
};
$('answer-form').onsubmit = event => {
  event.preventDefault();
  if (activeQuestion) exam.submit(activeQuestion.id, $('answer').value);
  drawExam();
};
$('exit-exam').onclick = () => {
  exam = null;
  activeQuestion = null;
  $('exam-panel').hidden = true;
  $('structure-panel').hidden = false;
  $('separation-tools').hidden = surface.structures().length < 2;
  $('editing').hidden = false;
  $('files').hidden = false;
  camera.position.copy(editorView.camera);
  controls.target.copy(editorView.target);
  editorView = null;
  updateVisibility();
  applySeparation();
};

async function withLoading(action, onError) {
  if (busy) return;
  busy = true;
  for (const element of $('files').querySelectorAll('input, select, button')) element.disabled = true;
  $('export').disabled = true;
  try {
    await action();
  } catch (error) {
    onError(error);
  } finally {
    busy = false;
    for (const element of $('files').querySelectorAll('input, select, button')) element.disabled = false;
    $('export').disabled = !project;
    $('editing').hidden = !project;
    $('structure-panel').hidden = !project;
  }
}

async function openFile(input, action) {
  const file = input.files[0];
  input.value = '';
  if (file) await withLoading(() => action(file), error => status(error.message, error.message, true));
}

function showSample(which) {
  return withLoading(async () => {
    status('Načítavam model…', 'Loading model…');
    await openSample(which);
    status();
  }, error => {
    $('model-choice').value = activeModelChoice ?? which;
    status(`Ukážkový model sa nepodarilo načítať. ${error.message}`, `Could not load the sample model. ${error.message}`, true);
  });
}

$('model-choice').onchange = event => showSample(event.target.value);
$('model-file').onchange = event => openFile(event.target, async file => {
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const modelId = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => /^(blob|data):/i.test(url) ? url : 'data:application/octet-stream,');
  const { scene: model } = await new GLTFLoader(manager).parseAsync(bytes, '');
  try {
    setModel(model, modelId, file.name);
  } catch (error) {
    disposeModel(model);
    throw error;
  }
  activeModelChoice = 'custom';
  $('model-choice').value = 'custom';
  status('Model načítaný. Pridaj pin alebo načítaj uložené polohy.', 'Model loaded. Add a pin or import saved positions.');
});
$('pin-file').onchange = event => openFile(event.target, async file => {
  const imported = parseProject(await file.text());
  if (imported.modelId !== project?.modelId) {
    status('Polohy patria k inému modelu. Najprv otvor príslušný model.',
      'These pins belong to a different model. Open that model first.', true);
    return;
  }
  for (const pin of imported.pins) surface.resolve(pin.anchor);
  project = imported;
  closeForm();
  renderSettings();
  status(`Načítané piny: ${project.pins.length}.`, `Pins imported: ${project.pins.length}.`);
});
$('export').onclick = () => {
  if (busy || !project) return;
  try {
    saveSettings();
    const url = URL.createObjectURL(new Blob([serializeProject(project)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'atlas-pins.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('Polohy a pravidlá testu sú stiahnuté ako JSON.', 'Pin positions and test settings downloaded as JSON.');
  } catch (error) {
    status(error.message, error.message, true);
  }
};

$('editing').hidden = true;
$('structure-panel').hidden = true;
await showSample('bone');

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sampleUrl } from 'anatrea-pins/sample-data';
import { bearingNames, loadBearingSample } from './bearing.js';

export const sampleTitles = {
  bone: ['Stehenná kosť', 'Femur'],
  assembly: ['Kosti v oblasti kolena', 'Knee bones'],
  bearing: ['Prírubové ložisko', 'Flanged bearing']
};

export const samplePartNames = {
  ...bearingNames,
  'Femur.r': ['Stehenná kosť', 'Femur'],
  'Patella.r': ['Jabĺčko', 'Patella'],
  'Tibia.r': ['Píšťala', 'Tibia'],
  'Fibula.r': ['Ihlica', 'Fibula']
};

function pin(id, label, answers, mesh, triangle, weights) {
  return { id, label, answers, inExam: true, anchor: { mesh, triangle, weights, normalSign: 1 } };
}

// Landmarks use reviewed Anatrea points mapped to the original model triangles.
const femurPins = [
  pin('femoral-head', 'Caput femoris', ['Hlavica stehennej kosti', 'Femoral head', 'Head of femur'], '0',
    3495, [0.187709790, 0.063877312, 0.748412898]),
  pin('greater-trochanter', 'Trochanter major', ['Veľký chocholík', 'Greater trochanter'], '0',
    5329, [0.412559241, 0.058904164, 0.528536595]),
  pin('medial-condyle', 'Condylus medialis femoris', ['Vnútorný kondyl stehennej kosti', 'Medial femoral condyle'], '0',
    315, [0.238411222, 0.557311516, 0.204277262]),
  pin('lateral-condyle', 'Condylus lateralis femoris', ['Vonkajší kondyl stehennej kosti', 'Lateral femoral condyle'], '0',
    2834, [0.059911806, 0.345600668, 0.594487526])
];

const assemblyPins = [
  pin('femur', 'Femur', ['Stehenná kosť', 'Thigh bone'], '0',
    11195, [0.427601827, 0.531078280, 0.041319893]),
  pin('patella', 'Patella', ['Jabĺčko', 'Kneecap'], '1',
    883, [0.352787788, 0.456286074, 0.190926138]),
  pin('tibia', 'Tibia', ['Píšťala', 'Píšťalová kosť', 'Shin bone'], '2',
    3871, [0.155261397, 0.573422798, 0.271315805]),
  pin('fibula', 'Fibula', ['Ihlica', 'Lýtková kosť', 'Calf bone'], '3',
    1410, [0.086710035, 0.183833634, 0.729456331])
];

let download;

async function readModel() {
  const response = await fetch(sampleUrl);
  if (!response.ok) throw new Error(`Sample model HTTP ${response.status}.`);
  return response.arrayBuffer();
}

export async function loadSample(which) {
  if (which === 'bearing') return loadBearingSample();
  if (which !== 'bone' && which !== 'assembly') throw new TypeError('Unknown sample model.');
  download ??= readModel().catch(error => {
    download = null;
    throw error;
  });
  const { scene: model } = await new GLTFLoader().parseAsync(await download, '');
  const bone = which === 'bone';
  if (bone) {
    // The four parts share a material. Only the removed geometries are unused.
    for (const mesh of model.children.slice(1)) {
      model.remove(mesh);
      mesh.geometry.dispose();
    }
  }
  for (const mesh of model.children) mesh.name = mesh.userData.name;
  return {
    model,
    id: bone ? 'demo-femur-v1' : 'demo-knee-bones-v1',
    pins: bone ? femurPins : assemblyPins
  };
}

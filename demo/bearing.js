import {
  ExtrudeGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, OrthographicCamera,
  Path, Shape, SphereGeometry, Vector2, Vector3
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createThreeSurface } from '../src/three.js';

export const bearingNames = {
  housing: ['Prírubové teleso', 'Flange housing'],
  outerRace: ['Vonkajší krúžok', 'Outer race'],
  innerRace: ['Vnútorný krúžok', 'Inner race'],
  balls: ['Ložiskové guľôčky', 'Bearing balls'],
  shaft: ['Hriadeľ', 'Shaft']
};

function circle(path, x, y, radius, clockwise = false) {
  path.absarc(x, y, radius, 0, Math.PI * 2, clockwise);
  return path;
}

function extrude(shape, depth) {
  return new ExtrudeGeometry(shape, {
    depth, curveSegments: 32, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2
  }).rotateX(-Math.PI / 2);
}

function ring(inner, outer, depth) {
  const shape = circle(new Shape(), 0, 0, outer);
  shape.holes.push(circle(new Path(), 0, 0, inner, true));
  return extrude(shape, depth);
}

function housingGeometry() {
  const shape = new Shape();
  const side = 0.88, tangent = 0.65;
  shape.moveTo(-tangent, -side);
  shape.lineTo(tangent, -side);
  shape.quadraticCurveTo(side, -side, side, -tangent);
  shape.lineTo(side, tangent);
  shape.quadraticCurveTo(side, side, tangent, side);
  shape.lineTo(-tangent, side);
  shape.quadraticCurveTo(-side, side, -side, tangent);
  shape.lineTo(-side, -tangent);
  shape.quadraticCurveTo(-side, -side, -tangent, -side);
  shape.holes.push(circle(new Path(), 0, 0, 0.55, true));
  for (const x of [-0.64, 0.64]) {
    for (const y of [-0.64, 0.64]) {
      shape.holes.push(circle(new Path(), x, y, 0.1, true));
    }
  }
  const flange = extrude(shape, 0.16).translate(0, -0.2, 0);
  const collar = ring(0.55, 0.68, 0.3).translate(0, -0.04, 0);
  const geometry = mergeGeometries([flange, collar]);
  flange.dispose();
  collar.dispose();
  return geometry;
}

function ballsGeometry() {
  const balls = Array.from({ length: 10 }, (_, index) => {
    const angle = index / 10 * Math.PI * 2;
    return new SphereGeometry(0.057, 20, 14).translate(0.365 * Math.cos(angle), 0.14, 0.365 * Math.sin(angle));
  });
  const geometry = mergeGeometries(balls);
  for (const ball of balls) ball.dispose();
  return geometry;
}

function shaftGeometry() {
  const profile = [[0, -0.36], [0.115, -0.36], [0.155, -0.32], [0.155, 0.33],
    [0.138, 0.35], [0.138, 0.5], [0.114, 0.525], [0, 0.525]];
  return new LatheGeometry(profile.map(([radius, height]) => new Vector2(radius, height)), 64);
}

function mesh(name, geometry, color, metalness) {
  const part = new Mesh(geometry, new MeshStandardMaterial({ color, metalness, roughness: 0.34 }));
  part.name = name;
  return part;
}

export function loadBearingSample() {
  const model = new Group();
  const parts = [
    ['housing', housingGeometry(), '#517a82', 0.32, 0.76, 0.2],
    ['outerRace', ring(0.422, 0.54, 0.22).translate(0, 0.03, 0), '#bdc2c8', 0.42, 0.49, 0.035],
    ['innerRace', ring(0.166, 0.308, 0.22).translate(0, 0.03, 0), '#b8935c', 0.42, 0.254, -0.04],
    ['balls', ballsGeometry(), '#d6e0e5', 0.48, 0.365, 0],
    ['shaft', shaftGeometry(), '#7c99ad', 0.4, 0.04, -0.03]
  ];
  for (const [name, geometry, color, metalness] of parts) model.add(mesh(name, geometry, color, metalness));

  const surface = createThreeSurface(model);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  camera.position.set(0, 4, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const pins = parts.map(([name, , , , x, z], index) => {
    surface.setVisibleStructures([String(index)]);
    const anchor = surface.pick(camera, new Vector3(x, 0, z).project(camera));
    if (!anchor) throw new Error(`Missing sample surface for ${name}.`);
    const [slovak, english] = bearingNames[name];
    return { id: name, label: english, answers: [slovak], inExam: true, anchor };
  });
  surface.setVisibleStructures(null);
  return { id: 'demo-bearing-v1', model, pins };
}

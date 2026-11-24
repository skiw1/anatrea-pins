import { Box3, Matrix3, Matrix4, Raycaster, Triangle, Vector3 } from 'three';

function triangleAt(mesh, faceIndex) {
  const { attributes, index } = mesh.geometry;
  const offset = faceIndex * 3;
  if (!Number.isInteger(faceIndex) || offset < 0 || offset + 2 >= (index?.count ?? attributes.position.count)) {
    throw new RangeError('The pin refers to a triangle absent from this model.');
  }
  const point = n => new Vector3().fromBufferAttribute(
    attributes.position, index ? index.getX(offset + n) : offset + n
  );
  return new Triangle(point(0), point(1), point(2));
}

function hierarchyKey(mesh, root) {
  const path = [];
  for (let node = mesh; node !== root; node = node.parent) {
    path.unshift(node.parent.children.indexOf(node));
  }
  return path.join('/') || 'root';
}

function visible(mesh) {
  for (let node = mesh; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

function prepareExplosion(root, byKey) {
  root.updateWorldMatrix(true, true);
  const worldToModel = new Matrix4().copy(root.matrixWorld).invert();
  const modelBounds = new Box3();
  const parts = Array.from(byKey, ([key, mesh]) => {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const localToModel = new Matrix4().multiplyMatrices(worldToModel, mesh.matrixWorld);
    const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(localToModel);
    modelBounds.union(bounds);
    return {
      key,
      mesh,
      center: bounds.getCenter(new Vector3()),
      position: mesh.position.clone(),
      translation: new Vector3().setFromMatrixPosition(mesh.matrix),
      offset: new Vector3(),
      target: new Vector3()
    };
  });
  const center = modelBounds.getCenter(new Vector3());
  const size = modelBounds.getSize(new Vector3());
  const maxSpread = Math.max(size.x, size.y, size.z) * 0.34;
  const tolerance = Math.max(Number.EPSILON, maxSpread * 0.02);
  const coincident = new Map();
  for (const part of parts) {
    part.offset.copy(part.center).sub(center);
    part.offset.clampLength(maxSpread * 0.45, maxSpread);
    const cell = part.center.toArray().map(axis => Math.round(axis / tolerance)).join(',');
    if (!coincident.has(cell)) coincident.set(cell, []);
    coincident.get(cell).push(part);
  }
  for (const group of coincident.values()) {
    if (group.length === 1 && group[0].offset.lengthSq() > 0) continue;
    group.forEach(({ offset }, index) => {
      const angle = index * Math.PI * 2 / group.length;
      offset.x += Math.cos(angle) * maxSpread * 0.7;
      offset.z += Math.sin(angle) * maxSpread * 0.7;
      offset.clampLength(0, maxSpread);
    });
  }
  return parts;
}

function restoreParts(root, parts) {
  for (const { mesh, position, translation } of parts) {
    mesh.position.copy(position);
    if (!mesh.matrixAutoUpdate) mesh.matrix.setPosition(translation);
  }
  root.updateWorldMatrix(true, true);
}

export function createThreeSurface(root, { meshKey = mesh => hierarchyKey(mesh, root) } = {}) {
  const byKey = new Map();
  const byMesh = new Map();
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh ||
        mesh.geometry.morphAttributes.position?.length || !mesh.geometry.attributes.position) return;
    const key = meshKey(mesh);
    if (typeof key !== 'string' || !key || key !== key.trim() || byKey.has(key)) {
      throw new TypeError('Each mesh needs a unique, stable key.');
    }
    byKey.set(key, mesh);
    byMesh.set(mesh, key);
  });
  if (byKey.size === 0) throw new TypeError('The model contains no supported static meshes.');
  const originalLayers = new Map([...byKey.values()].map(mesh => [mesh, mesh.layers.mask]));
  const ray = new Raycaster();
  const normalMatrix = new Matrix3();
  let explosion;

  return {
    structures() {
      return Array.from(byKey, ([key, mesh]) => ({
        key,
        name: mesh.name,
        visible: mesh.layers.mask !== 0 && visible(mesh)
      }));
    },
    setVisibleStructures(keys) {
      const allowed = keys == null ? null : new Set(keys);
      for (const [key, mesh] of byKey) {
        // A mesh can have child meshes. Layer masks hide the mesh alone.
        mesh.layers.mask = !allowed || allowed.has(key) ? originalLayers.get(mesh) : 0;
      }
    },
    setExplodedView(amount, keys = null) {
      if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
        throw new RangeError('Explosion amount must be between 0 and 1.');
      }
      if (byKey.size < 2) return;
      if (explosion) restoreParts(root, explosion);
      if (amount === 0) {
        explosion = null;
        return;
      }
      explosion ??= prepareExplosion(root, byKey);
      const selection = keys == null ? null : new Set(keys);
      const modelTransform = new Matrix3().setFromMatrix4(root.matrixWorld);
      const displacement = new Vector3();
      for (const part of explosion) {
        part.target.setFromMatrixPosition(part.mesh.matrixWorld);
        if (!selection || selection.has(part.key)) {
          displacement.copy(part.offset).applyMatrix3(modelTransform).multiplyScalar(amount);
          part.target.add(displacement);
        }
      }
      // Targets are fixed before changing parent transforms, including meshes inside other meshes.
      for (const { mesh, target } of explosion) {
        if (mesh.parent) mesh.parent.worldToLocal(target);
        mesh.position.copy(target);
        if (!mesh.matrixAutoUpdate) mesh.matrix.setPosition(target);
        mesh.updateWorldMatrix(false, false);
      }
    },
    pick(camera, ndc) {
      root.updateWorldMatrix(true, true);
      camera.updateWorldMatrix(true, false);
      ray.setFromCamera(ndc, camera);
      ray.layers.mask = camera.layers.mask;
      const meshes = [...byKey.values()].filter(visible);
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit) return null;

      const triangle = triangleAt(hit.object, hit.faceIndex);
      const local = hit.object.worldToLocal(hit.point.clone());
      const weights = triangle.getBarycoord(local, new Vector3());
      if (!weights) return null;
      const components = weights.toArray().map(value => Math.max(0, Math.min(1, value)));
      const total = components.reduce((sum, value) => sum + value, 0);
      const normal = triangle.getNormal(new Vector3())
        .applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld));

      return {
        mesh: byMesh.get(hit.object),
        triangle: hit.faceIndex,
        weights: components.map(value => value / total),
        normalSign: normal.dot(ray.ray.direction) > 0 ? -1 : 1
      };
    },
    resolve({ mesh: key, triangle: index, weights, normalSign }) {
      const mesh = byKey.get(key);
      if (!mesh) throw new RangeError(`Mesh "${key}" is absent from this model.`);
      mesh.updateWorldMatrix(true, false);
      const triangle = triangleAt(mesh, index);
      const point = new Vector3()
        .addScaledVector(triangle.a, weights[0])
        .addScaledVector(triangle.b, weights[1])
        .addScaledVector(triangle.c, weights[2]);
      const normal = triangle.getNormal(new Vector3()).multiplyScalar(normalSign)
        .applyNormalMatrix(normalMatrix.getNormalMatrix(mesh.matrixWorld));
      return { point: mesh.localToWorld(point), normal, mesh };
    }
  };
}

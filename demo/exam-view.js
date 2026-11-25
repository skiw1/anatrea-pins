import { Raycaster } from 'three';

export function revealExamPin(model, surface, anchor, camera) {
  model.updateWorldMatrix(true, true);
  const { point, mesh } = surface.resolve(anchor);
  const direction = point.clone().sub(camera.position);
  // Stop just before the anchor so the target triangle itself is not an obstruction.
  const ray = new Raycaster(camera.position, direction.clone().normalize(), camera.near, direction.length() - 0.0001);
  ray.layers.mask = camera.layers.mask;
  const meshes = [];
  model.traverseVisible(object => {
    if (object.isMesh) meshes.push(object);
  });
  const blocker = ray.intersectObjects(meshes, false)[0];
  if (!blocker) return { isolated: false, overlay: false };
  if (blocker.object === mesh) return { isolated: false, overlay: true };

  surface.setVisibleStructures([anchor.mesh]);
  // A different triangle of the same mesh can still cover an internal pin.
  return { isolated: true, overlay: ray.intersectObjects(meshes, false).length > 0 };
}

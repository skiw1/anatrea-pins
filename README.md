# Anatrea Pins

Place annotations on 3D models and use them to build timed practical tests. An atlas author chooses a location on the model, enters a name and accepted alternatives, and decides whether each pin is eligible for a test.

## Why download it?

Use the standalone editor to annotate a 3D model and turn those annotations into a timed identification test. The editor opens local GLB files in your browser and saves the annotations as a reusable JSON file.

- **Anatomy teaching:** Isolate a bone, pin its landmarks and set accepted Latin names. Share the model and pin file so students can practise 30-second identifications.
- **Technical training:** Open a GLB exported from a CAD tool, separate the parts of an assembly and annotate components. Use the same pins for a parts-identification exercise.
- **Existing viewers:** Keep your own 3D viewer. Use Anatrea Pins to author the data, then use its JavaScript API to resolve the pin positions and run a test.

## Try it locally

Open the packaged `anatrea-pins-demo.html` directly in a browser with WebGL. You can build this single-file version from the source with `npm run build:demo`.

To work on the demo as separate source files, use Node.js 22.15 or newer. From this directory run:

```sh
npm run demo
```

Open [127.0.0.1:4178](http://127.0.0.1:4178) in a browser with WebGL. The demo bundles Three.js and runs without package installation or a network connection. English is the default. The language selector also offers Slovak. Choose a pinned femur, a four-part knee bone model or a flanged bearing with five selectable parts. You can also open your own self-contained, uncompressed GLB. Files are read in the browser.

1. Use **Exploded view** to move parts apart and set the slider to 0% to put them back. Under **Model structures**, you can mark parts and choose **Isolate selected** or **Hide selected**. Turn on **Selected parts only** to move just the parts you marked. Each part must already be a separate mesh in the model.
2. Click **Add pin**, enter the name and optional accepted answers, one per line. Click **Place on model**, pick a point on the surface and review it before choosing **Save and verify**. Select an existing pin to rename, move or delete it. Previous positions are available during the current session.
3. Under **Practical test**, set the number of pins and seconds per pin. Pins with **Include in practical tests** enabled are eligible for selection. The test uses the original assembled model, draws pins without repeats and marks each answer as it is submitted. The end screen lists your answers and the accepted names. Ending the test restores the editor's visibility and separation.
4. Choose **Download pins** to keep the pin positions and test settings. Open the same GLB before importing that JSON elsewhere. The JSON contains annotations and test settings. The GLB supplies the geometry.

## Add it to an atlas

The core project and exam APIs are independent of the renderer. The included Three.js adapter works with static triangle meshes and was tested with Three.js 0.170.0. A different renderer can implement its own method of creating and resolving surface anchors. The reference demo shows a complete integration with vanilla JavaScript.

Install this checkout with `npm install /path/to/anatrea-pins` in your atlas, then create the surface adapter using the model's root object. Call `surface.pick` with the atlas camera and pointer coordinates converted to normalized device coordinates, with `x` and `y` from −1 to 1.

```js
import { createProject, serializeProject, upsertPin } from 'anatrea-pins';
import { createThreeSurface } from 'anatrea-pins/three';

const surface = createThreeSurface(modelRoot);
let project = createProject('femur-model-v1', {
  exam: { count: 1, secondsPerPin: 30 }
});

function annotate(camera, pointerNdc) {
  const anchor = surface.pick(camera, pointerNdc);
  if (!anchor) return;

  project = upsertPin(project, {
    id: 'femur-head',
    label: 'Caput femoris',
    answers: ['Femoral head'],
    inExam: true,
    anchor
  });

  const { point, normal } = surface.resolve(anchor);
  drawPinInYourAtlas(point, normal);
  return serializeProject(project);
}
```

The default mesh key is the child's path within the model hierarchy. You can supply your own stable keys via `createThreeSurface(root, { meshKey })`. A pin records its mesh, triangle index and position within that triangle. It follows mesh and parent transforms. The model ID should change when mesh topology or keys change. Rebind pins when switching to a different revision of a model.

Use `surface.structures()` to list the supported meshes with their keys, names and visibility. Pass an iterable of keys to `surface.setVisibleStructures(keys)` to display chosen meshes. Pass `null` to restore the original Three.js layers. This preserves mesh IDs and saved pin anchors. Hidden meshes are excluded from picking.

Call `surface.setExplodedView(0.5)` to separate the model's meshes visually. The amount ranges from 0 (original positions) to 1 (a gap between parts). By default, parts spread along the model's longest axis. For assemblies with a known direction, set `createThreeSurface(model, { explosionAxis: 'y' })`. Pass mesh keys as the optional second argument to move only those meshes away from the stationary assembly. Pin anchors remain on their original surface triangles, and `surface.resolve(anchor)` returns each pin's current world position.

For storage, save the serialized project to a file, your own browser storage or your own API. On load, use `parseProject(json)` and compare the returned `modelId` with your loaded model ID before resolving the anchors. The demo uses a SHA-256 file digest as the model ID for imported GLBs.

Use `createExam(project)` for practice. `exam.current()` returns the current anchor and remaining time. Pass its ID and the typed answer to `exam.submit(id, answer)`. `exam.lastResponse()` returns the outcome of the most recently recorded answer or timeout. `exam.results()` returns the score and responses after completion. The demo shows feedback after each pin and compares submitted answers with accepted answers at the end. Answer matching ignores case and repeated whitespace. Provide accepted alternate spellings as explicit aliases. The demo keeps answers in the browser for self-study. An official graded exam would need server-side storage and grading.

## Development

```sh
npm test
```

The tests cover JSON round-tripping, pin selection, answer matching, timer expiry, and geometry anchors on indexed and non-indexed meshes.

The application code is under the MIT license. The demo bundles Three.js and its addons under their own MIT license in `demo/vendor/three/LICENSE`. The Open3DModel bone meshes are under CC BY-SA 4.0. See [model attribution](demo/models/ATTRIBUTION.md).

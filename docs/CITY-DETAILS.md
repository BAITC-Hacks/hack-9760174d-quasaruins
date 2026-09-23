# City details: mapped landmarks and parks

`public/city-details.js` adds four recognizable Astana landmarks and three real park boundaries to the miniature city. They are decorative: nothing here is scored, and the simulation never reads them. Positions and outlines come from the attributed offline layers in `data/city-details.json`, served inside `/api/geography` (credit and `attributionUrl` are displayed by the app).

## API

```js
import { createCityDetails } from './city-details.js';
const details = createCityDetails({ THREE, geography, project, groundY: 0.146 });
scene.add(details.group);
details.landmarkAnchors; // [{ id, name, position: [x, y, z] }] label points above each model
details.isReserved([east, north], clearance); // true inside/near a park or landmark footprint
details.dispose(); // frees geometries/materials, detaches and empties the group
```

- `project([lon, lat]) -> [eastKm, northKm]` is the scene's own projection; Three.js `x = east`, `z = -north`.
- The module only builds and returns `group`. It does not touch the scene, DOM or app state.
- Missing `landmarks` or `parks` layers give an empty group and `isReserved()` returns `false`.

## What is drawn

| Id | Model | Rendered size |
| --- | --- | --- |
| `bayterek` | White tapered tower, ten-rod cage, gold orb | 0.16 km base, 1.45 tall |
| `khan-shatyr` | Slightly tilted pale tent with a mast | at least 0.46 km base, 0.8 tall |
| `ak-orda` | White terraced block, drum, blue dome, gold spire | 0.34 km terrace, 0.72 tall |
| `peace-palace` | Stone pyramid with a glass apex | 0.40 km base, 0.46 tall |

Heights are stylized to the existing buildings (0.3 to 1.55 scene units). Real footprints of Bayterek, Ak Orda and the Palace are only 17 to 115 m across, so each model is enlarged to the minimum sizes above; the mapped point stays at the centre.

Parks (`botanical-garden`, `central-park`, `presidential-park`): a flat light-green surface from the real polygon (holes and MultiPolygons supported) at `groundY + 0.004`, a green outline at `groundY + 0.008`, and 90 trees in total, split by park area with a fixed seed, kept away from park edges and landmark models. Two instanced meshes draw all trees. The park surface uses a positive polygon offset so water drawn at the same height (0.151 in the app) stays visible inside parks.

## isReserved

`isReserved([east, north], clearance = 0)` is true when the point is inside a park polygon (not in a hole), inside a landmark's mapped footprint, within the enlarged rendered radius of a landmark model, or within `clearance` km of any of those. Use it before placing representative buildings or project sites so nothing is drawn inside a park or a landmark.

## Checks run

- Node: 4 landmark anchors at their projected points; every landmark point and park interior reserved; far points and bad input not reserved; clearance behaviour; synthetic polygon with a hole and a two-part MultiPolygon; empty geography; dispose empties the group. Builds in under 20 ms.
- Headless Chromium (software WebGL) with the real geography, `groundY = 0.146` and water at 0.151: all four models render and are recognizable, rivers stay visible through parks, no console errors.

# City details: mapped landmarks and parks

`public/city-details.js` adds Astana's iconic landmarks, the LRT Line 1 viaduct and three real park boundaries to the miniature city. They are decorative: nothing here is scored, and the simulation never reads them. Positions and outlines come from the attributed offline layers in `data/city-details.json`, served inside `/api/geography` (credit and `attributionUrl` are displayed by the app).

## API

```js
import { createCityDetails } from './city-details.js';
const details = createCityDetails({ THREE, geography, project, groundY: 0.146 });
scene.add(details.group);
details.landmarkAnchors; // [{ id, name, position: [x, y, z] }] label points above each model
details.stationAnchors;  // [{ id, name, position }] above each LRT station (empty without an LRT layer)
details.isReserved([east, north], clearance); // true inside/near a park, landmark, LRT corridor or station
details.update({ timeSeconds, motionEnabled }); // moves the LRT train with the scene clock; no motion keeps it still
details.animate(seconds); // same, low level
details.dispose(); // frees geometries/materials, detaches and empties the group
```

- `project([lon, lat]) -> [eastKm, northKm]` is the scene's own projection; Three.js `x = east`, `z = -north`.
- The module only builds and returns `group`. It does not touch the scene, DOM or app state.
- Missing layers give nothing to draw and `isReserved()` returns `false` for them.

## Landmarks

Each landmark is a Point feature in `geography.landmarks` with `properties.model` (optional `footprint` polygon). Known models, drawn larger than ordinary buildings (0.3-1.55 tall) so they read clearly:

| Model id | Look | Min footprint (km) | Height |
| --- | --- | --- | --- |
| `bayterek` | White tower, 16-rod lattice, gold orb | 0.30 | 2.3 |
| `khan-shatyr` | Tilted tent with cable rings and mast | 0.64 | 1.5 |
| `ak-orda` | White palace, colonnade, blue dome, gold spire | 0.58 | 1.2 |
| `peace-palace` | Stone pyramid, glass bands and apex | 0.62 | 0.74 |
| `hazret-sultan` | Turquoise dome, four minarets | 0.58 | 1.25 |
| `grand-mosque` | Large blue dome, four tall minarets | 0.66 | 1.4 |
| `nur-alem` | Glass sphere with rings on a base | 0.52 | 1.05 |
| `kazakh-eli` | White column with gold bird | 0.32 | 1.95 |
| `astana-opera` | Colonnaded hall with dome | 0.58 | 0.8 |
| `concert-hall` | Fan of turquoise petals | 0.62 | 0.85 |
| `astana-arena` | Oval stadium with roof ring | 0.82 | 0.46 |
| `abu-dhabi-plaza` | Glass tower cluster, tallest 2.6 | 0.46 | 2.6 |
| `national-museum` | Turquoise blocks with domed tower | 0.58 | 1.15 |
| `mangilik-el-arch` | Triumphal arch | 0.42 | 1.0 |

Any other model id is drawn as a modest generic tower, so new data never breaks the scene.

## LRT (Astana Light Metro Line 1)

Optional `geography.lrt = { line: FeatureCollection<LineString|MultiLineString>, stations: FeatureCollection<Point {id, name}> }`. Drawn as an elevated deck with a blue stripe on piers every 0.35 km, a platform with a blue canopy at each station, and one four-car train (`animate`). It is a real backdrop only and does not change any project or score.

## Parks

`botanical-garden`, `central-park`, `presidential-park`: a flat light-green surface from the real polygon (holes and MultiPolygons supported) at `groundY + 0.004`, a green outline at `groundY + 0.008`, and 90 trees in total, split by park area with a fixed seed. Tree centres stay out of mapped water (plus 0.02 km), 0.03 km inside park edges and 0.18 km beyond any landmark model; quota a park cannot fill moves to the next park. Two instanced meshes draw all trees. The park surface uses a positive polygon offset so water drawn at the same height (0.151 in the app) stays visible inside parks.

## isReserved

`isReserved([east, north], clearance = 0)` is true when the point is inside a park polygon (not in a hole), inside a landmark's mapped footprint, within the enlarged rendered radius of a landmark model, or within `clearance` km of any of those. Use it before placing representative buildings or project sites so nothing is drawn inside a park or a landmark.

## Checks run

- Node: landmark anchors at their projected points; every landmark point and park interior reserved; far points and bad input not reserved; clearance; polygon with a hole; two-part MultiPolygon; empty geography; dispose empties the group; 90 park trees with 0 centres in mapped water at groundY 0.16 and 0.146.
- Headless Chromium (software WebGL) with the real geography plus a harness-only fixture that places the ten new landmark models and a sample LRT line at approximate positions: every model renders and is recognizable, the train and stations draw on the viaduct, no console errors. Real positions for the new landmarks and the LRT geometry must come from the attributed data layer.

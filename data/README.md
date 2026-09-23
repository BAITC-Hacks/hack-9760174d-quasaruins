# Geography and scenario provenance

`astana.json` is an offline display layer from Astana's public geoportal, retrieved
23 September 2026. It contains six administrative areas, 1,930 road features and
1,135 water features. Coordinates are WGS84 longitude/latitude. Administrative
boundary vertices are retained at six decimals; road and water geometry is
simplified with a roughly 6.7 m tolerance for display. Source precision is kept
for tiny rings that would collapse at six decimals. This is not a surveying map.

The official portal is linked by the [city architecture department](https://www.gov.kz/memleket/entities/astana-saulet/press/news/details/324850?lang=ru).
Sources:

- [District layer](https://gis.esaulet.kz/server/rest/services/Hosted/raiony/FeatureServer/0)
- [Road layer](https://gis.esaulet.kz/server/rest/services/dop_sloi_geoportal_otkr/MapServer/12)
- [Water layer](https://gis.esaulet.kz/server/rest/services/dop_sloi_geoportal_otkr/MapServer/16)

The corresponding public ArcGIS queries use `where=1=1`, `outFields=*`,
`returnGeometry=true`, `outSR=4326`, `f=geojson`, and `resultRecordCount=2000`.
All three layer counts were below the page limit. Attribution is retained in the
JSON and app. Source metadata did not specify a broader redistribution license.
`scripts/prepare-geography.py` rebuilds the artifact from downloaded source files
named districts.geojson, roads.geojson and water.geojson.

The challenge's five-district indicators, weights and population shares are a
separate **synthetic organizer dataset**, transcribed into `shared/city-data.js`.
Current real Astana has six districts. Sarayshyk is mapped but unmodeled; its
metrics are never invented or silently reassigned. Municipal source attributes
`region` have stale parent groupings, so names in `name_object` determine IDs.

## Recognizable landmarks and parks

`city-details.json` adds fourteen mapped landmark locations, thirteen footprints and three park
boundaries, retrieved 23 September 2026. The server combines this small artifact
with `astana.json` at `/api/geography`. Park rings retain source coordinates.
Landmark points are outer-ring area centroids of their source footprints, except
Kazakh Eli, which uses its mapped monument point. These positions
are mapped; the renderer's building heights and forms remain stylized.

| Feature | Source |
| --- | --- |
| Bayterek | [OpenStreetMap way 230401645](https://www.openstreetmap.org/way/230401645) |
| Khan Shatyr | [Official building layer](https://gis.esaulet.kz/server/rest/services/dop_sloi_geoportal_otkr/MapServer/18), OBJECTID 132303 |
| Ak Orda | Same official layer, OBJECTID 129636 |
| Palace of Peace and Reconciliation | Same official layer, OBJECTID 2928 |
| Nur Alem / EXPO Sphere | Same official layer, OBJECTID 97655 (EXPO pavilion, not the unrelated building named Nur Alem) |
| Astana Opera | Same official layer, OBJECTID 10190 |
| Kazakhstan Central Concert Hall | Same official layer, OBJECTID 129644 |
| Astana Arena | Same official layer, OBJECTID 97783 |
| Abu Dhabi Plaza | Same official layer, OBJECTID 15492 |
| National Museum | Same official layer, OBJECTID 2927 |
| Mangilik El Triumphal Arch | Same official layer, OBJECTID 97804 (outer footprint) |
| Hazret Sultan Mosque | [OpenStreetMap way 240860325](https://www.openstreetmap.org/way/240860325) |
| Kazakh Eli Monument | [OpenStreetMap node 2681623412](https://www.openstreetmap.org/node/2681623412), point only |
| Astana Grand Mosque | [OpenStreetMap relation 18901938](https://www.openstreetmap.org/relation/18901938), including courtyard hole; identity corroborated by the [Visit Astana map](https://visitastana.kz/en/map/) |
| Botanical Garden | [OpenStreetMap way 1196402246](https://www.openstreetmap.org/way/1196402246) |
| Central Park / Astana Park | [OpenStreetMap relation 15957444](https://www.openstreetmap.org/relation/15957444) |
| Presidential Park | [OpenStreetMap way 112177946](https://www.openstreetmap.org/way/112177946) |

OSM-derived geometry is © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright). Its attribution
and source links are retained per feature and in the API credit; the app must
display that credit and a copyright link. This license statement applies to the
OSM-derived features, not to the separately attributed municipal layers.

To rebuild with `scripts/prepare-city-details.py /path/to/map-research`, download
OSM `/api/0.6/way/1196402246/full.json`, `/relation/15957444/full.json` and
`/way/112177946/full.json` as `botanical-osm.json`, `central-osm.json` and
`presidential-osm.json`. Save `/way/230401645/full.json` as
`bayterek-osm-map.json` (the builder accepts either a full-object or map response).
Save the official building layer's GeoJSON query for object IDs
`132303,129636,2928`, `outSR=4326`, as `official-landmarks.geojson`. Only names,
object IDs and geometry are used; no property-owner attributes are included.

For the expanded set, save the official query for IDs
`97655,10190,129644,97783,15492,2927,97804` as
`official-landmarks-expanded.geojson`. Additional records are ignored. Save an
Overpass `out geom` response containing way 240860325 and node 2681623412 as
`landmarks-osm-expanded.json`, and relation 18901938 with its member geometry as
`grand-mosque-osm.json`. The builder validates closed rings and preserves the
Grand Mosque courtyard. It does not manufacture a footprint for Kazakh Eli.

## Existing LRT backdrop

The optional `lrt` layer contains the mapped airport-to-Nurly-Zhol route from
[OpenStreetMap relation 20279176](https://www.openstreetmap.org/relation/20279176)
and its 18 ordered stop positions. Seven connected ways are joined without
invented connecting segments, retaining 222 vertices. We draw one directional
track as a miniature elevated corridor; the opposite track, depot, sidings and
future extensions are omitted. Stops are mapped track positions, not surveyed
station-building footprints. Deck width, height, station forms and train motion
are decorative. This is not a navigation map or operating timetable.

The [operator's site](https://cts.gov.kz/ru/) documents the operating system,
also named Tarlan Astana. Existing LRT has **no effect on intervention M3 or any
scenario score**. Every line and station carries its own OSM source URL and
license attribution. Avoid treating old OSM station `ref` values as authoritative
numbers; the artifact uses the ordered route membership for stable IDs 101–118.

To reproduce the raw `lrt-overpass.json` input using Overpass:

```text
[out:json];relation(20279176);out geom;>;out body;
```

The downloaded input used a broader city query; only this one relation and its
stop nodes are consumed. The builder checks exact endpoint continuity, all 18
stop positions on the track, and plausible geographic extent. The rendered
route is stored offline; the app makes no runtime requests to OSM or CTS.

Procedural ordinary buildings, new project sites, cars, people and their reactions
illustrate the scenario. They are not a cadastral inventory, traffic forecast or
measurement of real resident sentiment. Renderers must keep new development outside mapped park and
landmark footprints. Actual mapped parks/landmarks do not add scoring districts,
measures or benefits to the synthetic scenario.

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

`city-details.json` adds four mapped landmark locations/footprints and three park
boundaries, retrieved 23 September 2026. The server combines this small artifact
with `astana.json` at `/api/geography`. Park rings retain source coordinates.
Landmark points are area centroids of their source footprints. These positions
are mapped; the renderer's building heights and forms remain stylized.

| Feature | Source |
| --- | --- |
| Bayterek | [OpenStreetMap way 230401645](https://www.openstreetmap.org/way/230401645) |
| Khan Shatyr | [Official building layer](https://gis.esaulet.kz/server/rest/services/dop_sloi_geoportal_otkr/MapServer/18), OBJECTID 132303 |
| Ak Orda | Same official layer, OBJECTID 129636 |
| Palace of Peace and Reconciliation | Same official layer, OBJECTID 2928 |
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

Procedural ordinary buildings, new project sites, cars, people and their reactions
illustrate the scenario. They are not a cadastral inventory, traffic forecast or
measurement of real resident sentiment. Renderers must keep new development outside mapped park and
landmark footprints. Actual mapped parks/landmarks do not add scoring districts,
measures or benefits to the synthetic scenario.

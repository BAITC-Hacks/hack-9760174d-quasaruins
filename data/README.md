# Geography and scenario provenance

`astana.json` is an offline display layer from Astana's public geoportal, retrieved
23 September 2026. It contains six administrative areas, 1,930 road features and
1,135 water features. Coordinates are WGS84 longitude/latitude. Administrative
boundary vertices are retained at six decimals; road and water geometry is
simplified with a roughly 6.7 m tolerance for display. This is not a surveying map.

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

Procedural buildings, project sites, cars, people and their reactions illustrate
the scenario. They are not a cadastral inventory, traffic forecast or measurement
of real resident sentiment. No OpenStreetMap geometry is used.

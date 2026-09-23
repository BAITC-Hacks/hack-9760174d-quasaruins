#!/usr/bin/env python3
"""Prepare selected, attributed landmark and park geometry for the offline city.

Usage: python3 scripts/prepare-city-details.py /path/to/map-research
Inputs are the downloaded official-landmarks.geojson and OSM full JSON responses
documented in data/README.md. No third-party Python packages are required.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GIS = 'https://gis.esaulet.kz/server/rest/services/dop_sloi_geoportal_otkr/MapServer/18'
OSM_LICENSE = 'https://www.openstreetmap.org/copyright'


def read(source, name):
    return json.loads((source / name).read_text())


def osm_geometry(document, kind, object_id):
    nodes = {e['id']: [e['lon'], e['lat']] for e in document['elements'] if e['type'] == 'node'}
    ways = {e['id']: e['nodes'] for e in document['elements'] if e['type'] == 'way'}
    item = next(e for e in document['elements'] if e['type'] == kind and e['id'] == object_id)
    if kind == 'way':
        paths = [ways[object_id][:]]
    else:
        # The selected Central Park relation has only outer members. Refuse
        # future holes/other members rather than silently losing geometry.
        assert all(m['type'] == 'way' and m['role'] == 'outer' for m in item['members'])
        paths = [ways[m['ref']][:] for m in item['members']]
    rings = []
    while paths:
        ring = paths.pop(0)
        while ring[0] != ring[-1]:
            for i, other in enumerate(paths):
                if other[0] == ring[-1]:
                    ring.extend(other[1:]); paths.pop(i); break
                if other[-1] == ring[-1]:
                    ring.extend(other[-2::-1]); paths.pop(i); break
            else:
                raise ValueError(f'Incomplete OSM boundary: {kind}/{object_id}')
        assert len(set(ring)) >= 3
        rings.append([nodes[n] for n in ring])
    geometry = ({'type': 'Polygon', 'coordinates': [rings[0]]} if len(rings) == 1 else
                {'type': 'MultiPolygon', 'coordinates': [[ring] for ring in rings]})
    return geometry, item.get('tags', {})


def centroid(geometry):
    # Local translation avoids cancellation with large longitude/latitude.
    ring = geometry['coordinates'][0]
    ox, oy = ring[0][:2]
    area = cx = cy = 0
    for a, b in zip(ring, ring[1:]):
        ax, ay, bx, by = a[0]-ox, a[1]-oy, b[0]-ox, b[1]-oy
        cross = ax*by-bx*ay
        area += cross; cx += (ax+bx)*cross; cy += (ay+by)*cross
    assert abs(area) > 1e-14
    return [round(ox+cx/(3*area), 7), round(oy+cy/(3*area), 7)]


def main(source):
    parks = []
    for id_, name, file, kind, object_id in [
        ('botanical-garden', 'Botanical Garden', 'botanical-osm.json', 'way', 1196402246),
        ('central-park', 'Central Park / Astana Park', 'central-osm.json', 'relation', 15957444),
        ('presidential-park', 'Presidential Park', 'presidential-osm.json', 'way', 112177946),
    ]:
        geometry, tags = osm_geometry(read(source, file), kind, object_id)
        parks.append({'type': 'Feature', 'geometry': geometry, 'properties': {
            'id': id_, 'name': name, 'sourceName': tags.get('name'), 'scored': False,
            'sourceUrl': f'https://www.openstreetmap.org/{kind}/{object_id}',
            'attribution': '© OpenStreetMap contributors', 'licenseUrl': OSM_LICENSE,
        }})
    official = {f['properties']['OBJECTID']: f for f in read(source, 'official-landmarks.geojson')['features']}
    landmarks = []
    for object_id, id_, name in [
        (132303, 'khan-shatyr', 'Khan Shatyr'),
        (129636, 'ak-orda', 'Ak Orda'),
        (2928, 'peace-palace', 'Palace of Peace and Reconciliation'),
    ]:
        feature = official[object_id]
        assert feature['geometry']['type'] == 'Polygon'
        footprint = {'type': 'Polygon', 'coordinates': [[p[:2] for p in ring] for ring in feature['geometry']['coordinates']]}
        landmarks.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': centroid(footprint)},
            'properties': {'id': id_, 'name': name, 'model': id_, 'scored': False,
                'footprint': footprint, 'sourceName': feature['properties']['NAME_OBJECT'],
                'sourceUrl': GIS, 'sourceId': object_id, 'attribution': 'Astana official public geoportal',
                'geometryNote': 'Position is the centroid of the mapped footprint. Vertical form is stylized.'}})
    footprint, tags = osm_geometry(read(source, 'bayterek-osm-map.json'), 'way', 230401645)
    landmarks.insert(0, {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': centroid(footprint)},
        'properties': {'id': 'bayterek', 'name': 'Bayterek', 'model': 'bayterek', 'scored': False,
            'footprint': footprint, 'sourceName': tags.get('name'),
            'sourceUrl': 'https://www.openstreetmap.org/way/230401645',
            'attribution': '© OpenStreetMap contributors', 'licenseUrl': OSM_LICENSE,
            'geometryNote': 'Position is the centroid of the mapped footprint. Vertical form is stylized.'}})
    details = {'retrieved': '2026-09-23',
        'credit': 'Selected parks and Bayterek footprint © OpenStreetMap contributors (ODbL); other landmark footprints: Astana official public geoportal.',
        'attributionUrl': OSM_LICENSE,
        'notice': 'Mapped locations and park boundaries; simplified decorative 3D forms. Project sites and ordinary buildings remain illustrative.',
        'landmarks': {'type': 'FeatureCollection', 'features': landmarks},
        'parks': {'type': 'FeatureCollection', 'features': parks}}
    output = ROOT/'data/city-details.json'
    output.write_text(json.dumps(details, ensure_ascii=False, separators=(',', ':'))+'\n')
    print(f'{output.name}: {output.stat().st_size:,} bytes; {len(landmarks)} landmarks; {len(parks)} parks')
    for f in landmarks:
        print(f['properties']['name'], f['geometry']['coordinates'])


if __name__ == '__main__':
    main(Path(sys.argv[1]))

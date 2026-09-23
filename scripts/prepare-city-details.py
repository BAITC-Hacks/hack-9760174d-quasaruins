#!/usr/bin/env python3
"""Prepare selected, attributed landmark and park geometry for the offline city.

Usage: python3 scripts/prepare-city-details.py /path/to/map-research
Inputs are the downloaded official-landmarks.geojson and OSM full JSON responses
documented in data/README.md. No third-party Python packages are required.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GIS = 'https://gis.esaulet.kz/server/rest/services/dop_sloi_geoportal_otkr/MapServer/18'
OSM_LICENSE = 'https://www.openstreetmap.org/copyright'
LRT_RELATION = 20279176


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


def overpass_polygon(item):
    """Preserve the selected closed way, or one outer ring with courtyard holes."""
    def ring(points):
        result = [[p['lon'], p['lat']] for p in points]
        assert len(result) >= 4 and result[0] == result[-1]
        return result
    if item['type'] == 'way':
        return {'type': 'Polygon', 'coordinates': [ring(item['geometry'])]}
    assert item['type'] == 'relation'
    outer = [ring(m['geometry']) for m in item['members'] if m['role'] == 'outer']
    inner = [ring(m['geometry']) for m in item['members'] if m['role'] == 'inner']
    assert len(outer) == 1, 'Selected Grand Mosque footprint must have one outer ring.'
    assert all(m['type'] == 'way' and m['role'] in ('outer', 'inner') for m in item['members'])
    return {'type': 'Polygon', 'coordinates': outer + inner}


def extra_landmarks(source):
    official = {f['properties']['OBJECTID']: f for f in read(source, 'official-landmarks-expanded.geojson')['features']}
    features = []
    for object_id, id_, name in [
        (97655, 'nur-alem', 'Nur Alem / EXPO Sphere'),
        (10190, 'astana-opera', 'Astana Opera'),
        (129644, 'concert-hall', 'Kazakhstan Central Concert Hall'),
        (97783, 'astana-arena', 'Astana Arena'),
        (15492, 'abu-dhabi-plaza', 'Abu Dhabi Plaza'),
        (2927, 'national-museum', 'National Museum'),
        (97804, 'mangilik-el-arch', 'Mangilik El Triumphal Arch'),
    ]:
        f = official[object_id]
        assert f['geometry']['type'] == 'Polygon'
        footprint = {'type': 'Polygon', 'coordinates': [[p[:2] for p in r] for r in f['geometry']['coordinates']]}
        features.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': centroid(footprint)},
            'properties': {'id': id_, 'name': name, 'model': id_, 'scored': False,
                'footprint': footprint, 'sourceName': f['properties']['NAME_OBJECT'],
                'sourceUrl': GIS, 'sourceId': object_id, 'attribution': 'Astana official public geoportal',
                'geometryNote': 'Position is the outer footprint centroid; vertical form is stylized.'}})
    for file, kind, object_id, id_, name in [
        ('landmarks-osm-expanded.json', 'way', 240860325, 'hazret-sultan', 'Hazret Sultan Mosque'),
        ('landmarks-osm-expanded.json', 'node', 2681623412, 'kazakh-eli', 'Kazakh Eli Monument'),
        ('grand-mosque-osm.json', 'relation', 18901938, 'grand-mosque', 'Astana Grand Mosque'),
    ]:
        item = next(e for e in read(source, file)['elements'] if e['type'] == kind and e['id'] == object_id)
        props = {'id': id_, 'name': name, 'model': id_, 'scored': False,
            'sourceName': item.get('tags', {}).get('name'),
            'sourceUrl': f'https://www.openstreetmap.org/{kind}/{object_id}',
            'attribution': '© OpenStreetMap contributors', 'licenseUrl': OSM_LICENSE}
        if kind == 'node':
            point = [item['lon'], item['lat']]
            props['geometryNote'] = 'Mapped monument point; no surveyed footprint supplied. Reserve the stylized model base.'
        else:
            props['footprint'] = overpass_polygon(item)
            point = centroid(props['footprint'])
            props['geometryNote'] = 'Position is the outer footprint centroid; vertical form is stylized.'
        if id_ == 'grand-mosque':
            props['identitySourceUrl'] = 'https://visitastana.kz/en/map/'
        features.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': point}, 'properties': props})
    university = next(f for f in read(source, 'nazarbayev-university-official.geojson')['features']
                      if f['properties']['OBJECTID'] == 47194)
    assert university['properties']['NAME_OBJECT'] == 'Nazarbayev University'
    footprint = {'type': 'Polygon', 'coordinates': [[p[:2] for p in r] for r in university['geometry']['coordinates']]}
    features.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': centroid(footprint)},
        'properties': {'id': 'nazarbayev-university', 'name': 'Nazarbayev University',
            'model': 'nazarbayev-university', 'scored': False, 'footprint': footprint,
            'sourceName': university['properties']['NAME_OBJECT'], 'sourceUrl': GIS, 'sourceId': 47194,
            'identitySourceUrl': 'https://nu.edu.kz/visitors/about-campus/',
            'attribution': 'Astana official public geoportal',
            'geometryNote': 'Main connected academic building footprint, not the entire campus. Position is its outer-ring centroid; vertical form is stylized.'}})
    return features


def mapped_lrt(source):
    elements = read(source, 'lrt-overpass.json')['elements']
    by_id = {(e['type'], e['id']): e for e in elements}
    route = by_id['relation', LRT_RELATION]
    line, ways, stations = [], [], []
    for member in route['members']:
        if member['type'] == 'way':
            coordinates = [[p['lon'], p['lat']] for p in member['geometry']]
            assert len(coordinates) >= 2
            if line:
                if line[-1] != coordinates[0] and line[-1] == coordinates[-1]:
                    coordinates.reverse()
                assert line[-1] == coordinates[0], 'Route has a gap; do not invent a connecting segment.'
            line.extend(coordinates if not line else coordinates[1:])
            ways.append(member['ref'])
        elif member['type'] == 'node' and member['role'] == 'stop':
            node = by_id['node', member['ref']]
            tags = node['tags']
            stations.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [node['lon'], node['lat']]},
                'properties': {'id': f'lrt-{len(stations)+101}', 'name': tags.get('name:en', tags['name']),
                    'sourceName': tags['name'], 'sequence': len(stations)+1, 'scored': False,
                    'sourceUrl': f"https://www.openstreetmap.org/node/{node['id']}",
                    'attribution': '© OpenStreetMap contributors', 'licenseUrl': OSM_LICENSE}})
    assert len(stations) == 18
    assert line[0] == stations[0]['geometry']['coordinates'] and line[-1] == stations[-1]['geometry']['coordinates']
    assert all(f['geometry']['coordinates'] in line for f in stations), 'Every stop should lie on the mapped track.'
    length = sum(math.hypot((b[0]-a[0])*111.32*math.cos(math.radians(51.1)), (b[1]-a[1])*111.32) for a,b in zip(line,line[1:]))
    assert 20 < length < 23, 'Check route coverage and coordinate order.'
    return {'line': {'type': 'FeatureCollection', 'features': [{'type': 'Feature',
        'geometry': {'type': 'LineString', 'coordinates': line},
        'properties': {'id': 'lrt-line-1', 'name': 'Astana LRT / Tarlan Astana', 'scored': False,
            'sourceUrl': f'https://www.openstreetmap.org/relation/{LRT_RELATION}', 'sourceWayIds': ways,
            'attribution': '© OpenStreetMap contributors', 'licenseUrl': OSM_LICENSE,
            'geometryNote': 'One mapped directional track, airport to Nurly Zhol. Opposite track, depot and extensions omitted. Stations are track stop positions; 3D width and height are stylized.'}}]},
        'stations': {'type': 'FeatureCollection', 'features': stations},
        'notice': 'Existing mapped transit backdrop, independent of intervention M3. No simulated benefit or operational timetable implied.',
        'contextSourceUrl': 'https://cts.gov.kz/ru/'}


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
    landmarks.extend(extra_landmarks(source))
    assert len(landmarks) == 15 and len({f['properties']['id'] for f in landmarks}) == 15
    details = {'retrieved': '2026-09-23',
        'credit': 'Selected parks, landmarks and LRT geometry © OpenStreetMap contributors (ODbL); other landmark footprints: Astana official public geoportal.',
        'attributionUrl': OSM_LICENSE,
        'notice': 'Mapped locations and park boundaries; simplified decorative 3D forms. Project sites and ordinary buildings remain illustrative.',
        'landmarks': {'type': 'FeatureCollection', 'features': landmarks},
        'parks': {'type': 'FeatureCollection', 'features': parks},
        'lrt': mapped_lrt(source)}
    output = ROOT/'data/city-details.json'
    output.write_text(json.dumps(details, ensure_ascii=False, separators=(',', ':'))+'\n')
    print(f'{output.name}: {output.stat().st_size:,} bytes; {len(landmarks)} landmarks; {len(parks)} parks')
    for f in landmarks:
        print(f['properties']['name'], f['geometry']['coordinates'])


if __name__ == '__main__':
    main(Path(sys.argv[1]))

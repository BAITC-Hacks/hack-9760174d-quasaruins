#!/usr/bin/env python3
"""Build the offline map from the three downloaded official GeoJSON layers.

Usage: python3 scripts/prepare-geography.py /path/to/map-research
Only Python's standard library is needed. Administrative boundaries are retained;
road/water vertices are simplified for display and all coordinates rounded to 6dp.
"""
import json, math, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DISTRICTS={'Сарыарка':('saryarka','Saryarka'),'Байконур':('baikonur','Baikonur'),
           'Нура':('nura','Nura'),'Алматы':('almaty','Almaty'),
           'Сарайшык':('sarayshyk','Sarayshyk'),'Есиль':('esil','Esil')}
SCALE=math.cos(math.radians(51.13))

def simplify(points,tolerance):
    """Iterative Douglas-Peucker, longitude corrected for latitude."""
    if len(points)<=2 or not tolerance:return points
    keep={0,len(points)-1}; stack=[(0,len(points)-1)]
    while stack:
        first,last=stack.pop(); a,b=points[first],points[last]
        dx=(b[0]-a[0])*SCALE;dy=b[1]-a[1];length=dx*dx+dy*dy
        best,index=tolerance*tolerance,None
        for i in range(first+1,last):
            px=(points[i][0]-a[0])*SCALE;py=points[i][1]-a[1]
            t=max(0,min(1,(px*dx+py*dy)/length)) if length else 0
            distance=(px-t*dx)**2+(py-t*dy)**2
            if distance>best:best,index=distance,i
        if index is not None:keep.add(index);stack.extend([(first,index),(index,last)])
    return [points[i] for i in sorted(keep)]

def line(points,tolerance,ring=False):
    values=simplify(points,tolerance)
    if ring and len(values)<4:values=points
    result=[]
    for x,y,*_ in values:
        p=[round(x,6),round(y,6)]
        if not result or p!=result[-1]:result.append(p)
    if ring and result and result[0]!=result[-1]:result.append(result[0])
    return result

def geometry(g,tolerance):
    kind,coords=g['type'],g['coordinates']
    if kind=='LineString':out=line(coords,tolerance)
    elif kind=='MultiLineString':out=[line(c,tolerance) for c in coords]
    elif kind=='Polygon':out=[line(c,tolerance,True) for c in coords]
    elif kind=='MultiPolygon':out=[[line(c,tolerance,True) for c in polygon] for polygon in coords]
    else:raise ValueError('Unsupported geometry '+kind)
    return {'type':kind,'coordinates':out}

def main(source):
    result={'origin':[71.43,51.13],'credit':'Astana official public geoportal (gis.esaulet.kz), retrieved 2026-09-23. Simplified for display.',
      'scenarioNotice':'Real geography; synthetic five-district scenario. Sarayshyk is outside this model. Buildings and intervention locations are illustrative.',
      'bounds':[71.217966,50.857604,71.784817,51.351009],
      'sources':{
        'districts':'https://gis.esaulet.kz/server/rest/services/Hosted/raiony/FeatureServer/0',
        'roads':'https://gis.esaulet.kz/server/rest/services/dop_sloi_geoportal_otkr/MapServer/12',
        'water':'https://gis.esaulet.kz/server/rest/services/dop_sloi_geoportal_otkr/MapServer/16'}}
    for layer in ('districts','roads','water'):
        original=json.loads((source/(layer+'.geojson')).read_text())
        features=[]
        for f in original['features']:
            p=f['properties']
            if layer=='districts':
                id,name=DISTRICTS[p['name_object']]
                props={'id':id,'name':name,'modeled':id!='sarayshyk'}
            else:
                props={'name':p.get('STREET') or p.get('NAME_OBJECT') or p.get('NAME') or '',
                       'sourceId':p.get('OBJECTID')}
            features.append({'type':'Feature','properties':props,
              'geometry':geometry(f['geometry'],0 if layer=='districts' else .00006)})
        result[layer]={'type':'FeatureCollection','features':features}
    destination=ROOT/'data/astana.json';destination.parent.mkdir(exist_ok=True)
    destination.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
    print(f'{destination.name}: {destination.stat().st_size:,} bytes; '+', '.join(f'{k}={len(result[k]["features"])}' for k in ('districts','roads','water')))

if __name__=='__main__':main(Path(sys.argv[1]))

// Transcribed from the organizer's five-page Track 12 district dataset.
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

const indicatorRows = [
  ['T1', 'Road flow', 'transport', .10, 'Higher means less peak-hour congestion.'],
  ['T2', 'Public transport access', 'transport', .10, 'Access to frequent nearby public transport.'],
  ['E1', 'Green space', 'ecology', .09, 'Availability of greenery per resident.'],
  ['E2', 'Air quality', 'ecology', .11, 'Higher means cleaner air and less winter smog.'],
  ['S1', 'Schools and childcare', 'social', .11, 'School and kindergarten capacity relative to need.'],
  ['S2', 'Primary healthcare', 'social', .11, 'Local clinics and primary care capacity.'],
  ['B1', 'Street safety', 'safety', .09, 'Lighting, coverage and safer public space.'],
  ['B2', 'Road safety', 'safety', .09, 'Higher means fewer serious traffic incidents.'],
  ['C1', 'Utility reliability', 'services', .10, 'Reliability of heating and water services.'],
  ['C2', 'Resident request response', 'services', .10, 'Timely resolution of residents’ requests.'],
];
const districtRows = [
  ['esil', 'Esil', .27, [45,62,68,72,48,55,78,60,75,70], 'Bridge congestion and crowded schools in the scenario.'],
  ['almaty', 'Almaty', .24, [40,75,50,55,60,65,62,52,50,60], 'Ageing utilities and congestion in the scenario.'],
  ['saryarka', 'Saryarka', .20, [50,70,42,40,62,68,58,55,45,55], 'Winter smog and limited green space in the scenario.'],
  ['baikonur', 'Baikonur', .13, [52,68,55,50,58,60,52,58,55,58], 'Mid-range indicators without a single dominant weakness.'],
  ['nura', 'Nura', .16, [55,40,45,65,38,35,55,50,60,50], 'The greatest social infrastructure and transport gaps.'],
];
const measureRows = [
  ['M1','Dedicated bus lanes','transport','district',18,2,{T1:6,T2:9},'Give buses dedicated road space.'],
  ['M2','Smart traffic signals','transport','city',22,2,{T1:4,B2:3},'Adapt signals across the five modeled districts.'],
  ['M3','Light rail expansion','transport','district',30,4,{T1:16,T2:20,E2:4},'Expand light rail service in one district.'],
  ['M4','Neighborhood park','ecology','district',15,2,{E1:12,E2:3,B1:2},'Create a park or green square.'],
  ['M5','Clean household fuel','ecology','district',25,3,{E2:14,C1:4},'Move private-sector homes to cleaner fuel.'],
  ['M6','City greening program','ecology','city',20,4,{E1:5,E2:3},'Plant city greenery and windbreaks.'],
  ['M7','School and kindergarten','social','district',24,3,{S1:16},'Add modular school and childcare capacity.'],
  ['M8','Family health clinic','social','district',20,3,{S2:14},'Expand primary healthcare close to residents.'],
  ['M9','Courtyard sports hubs','social','district',10,1,{S1:3,S2:3,B1:3},'Create active neighborhood gathering places.'],
  ['M10','Lighting and cameras','safety','district',12,1,{B1:12,B2:2},'Extend Safe City lighting and camera coverage.'],
  ['M11','Safer school crossings','safety','district',10,1,{B2:12,T1:-2},'Improve crossings and school zones; road flow decreases.'],
  ['M12','Digital resident requests','services','city',14,1,{C2:5},'Unify handling of resident service requests.'],
  ['M13','Heating and water networks','services','district',28,4,{C1:18,E2:2},'Modernize district utility networks.'],
  ['M14','Emergency utility crews','services','city',16,1,{C1:5,C2:2},'Improve utility response and early warning.'],
];

export const DATASET = deepFreeze({
  version:'hackalem-12-v1', budget:100, horizon:8, requiredDecisions:5, maxPerCategory:2, criticalThreshold:40,
  description:'Organizer-provided synthetic scenario. Geography is real; these indicators are not observations or policy forecasts.',
  categories:[
    {id:'transport',name:'Transport',color:'#238A9A'},
    {id:'ecology',name:'Ecology',color:'#4B9562'},
    {id:'social',name:'Social infrastructure',color:'#8A73B8'},
    {id:'safety',name:'Safety',color:'#B37A25'},
    {id:'services',name:'City services',color:'#587EA0'},
  ],
  indicators:indicatorRows.map(([id,name,category,weight,description])=>({id,name,category,weight,description})),
  districts:districtRows.map(([id,name,populationShare,values,description])=>({id,name,populationShare,description,
    indicators:Object.fromEntries(indicatorRows.map(([key],i)=>[key,values[i]]))})),
  measures:measureRows.map(([id,name,category,scope,cost,lag,effects,description])=>({id,name,category,scope,cost,lag,effects,description})),
  synergies:[
    {measures:['M1','M2'],targetMeasure:'M1',effects:{T1:2},description:'Bus lanes and smart signals reinforce road flow.'},
    {measures:['M10','M12'],targetMeasure:'M10',effects:{B1:2},description:'Lighting and resident reporting reinforce street safety.'},
    {measures:['M5','M6'],targetMeasure:'M5',effects:{E2:2},description:'Cleaner fuel and greening reinforce air quality.'},
  ],
  incompatibilities:[
    {measures:['M1','M3'],scope:'any',message:'Choose either bus lanes or light rail, not both.'},
    {measures:['M4','M7'],scope:'same-district',message:'A park and a school compete for the same district site.'},
    {measures:['M5','M13'],scope:'same-district',message:'Clean fuel and utility networks overlap in the same district.'},
  ],
});

export const EXAMPLE_PLAN = deepFreeze([
  {measureId:'M7',districtId:'nura'}, {measureId:'M8',districtId:'nura'},
  {measureId:'M10',districtId:'nura'}, {measureId:'M12',districtId:null},
  {measureId:'M5',districtId:'saryarka'},
]);

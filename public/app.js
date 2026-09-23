const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const signed = (value, digits = 2) => `${value > 0 ? '+' : ''}${fmt(value, digits)}`;
// Differences use full model precision and are rounded exactly once for display.
const displayDelta = (after, before) => after - before;
const clone = (value) => JSON.parse(JSON.stringify(value));
const key = (plan) => plan.map((item) => `${item.measureId}:${item.districtId ?? '*'}`).sort().join('|');
const storageKey = 'akim-lab.plan.v1';
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const state = { selections: [], history: [], locks: new Set(), applied: null, pinned: null, districtId: 'nura', category: 'all', view: 'after', paused: motionPreference.matches, reducedMotion: motionPreference.matches, revision: 0, busy: null, request: null, suggestion: null, pending: null, peek: null, run: null, timeline: null, speed: 1, speech: null, speechRequest: null, speechUrl: null };
let DATASET, EXAMPLE_PLAN, BASELINE, validatePlan, simulatePlan, timelinePlan, city;
let measures = new Map(), districts = new Map(), categories = new Map();
const effectIcons = { T1:'🚗', T2:'🚌', E1:'🌳', E2:'🍃', S1:'🎒', S2:'✚', B1:'💡', B2:'🚸', C1:'🔧', C2:'💬' };
let activeDrag = null, suppressCardClickUntil = 0;
motionPreference.addEventListener('change', event => { state.reducedMotion = event.matches; if(event.matches) { state.paused = true; if(state.run) finishRun(); } render(); });

function node(tag, className, content, attrs = {}) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (content !== undefined && content !== null) item.textContent = String(content);
  for (const [name, value] of Object.entries(attrs)) if (value !== undefined && value !== null) item.setAttribute(name, String(value));
  return item;
}
function button(content, className, action, attrs = {}) {
  const item = node('button', className, content, { type: 'button', ...attrs });
  item.addEventListener('click', action);
  return item;
}
function message(text = '', isError = false) {
  $('app-message').textContent = text;
  $('app-message').classList.toggle('error', isError);
}
function districtName(id) { return districts.get(id)?.name ?? 'City-wide'; }
function effectiveResult() {
  if (state.view === 'before') return BASELINE;
  if (state.view === 'a' && state.pinned) return state.pinned.result;
  if (state.run) return state.run.frames[state.run.quarter].result;
  return state.applied?.result ?? BASELINE;
}
function displayedPlan() {
  if (state.view === 'before') return [];
  if (state.view === 'a' && state.pinned) return state.pinned.selections;
  return state.selections;
}
function cancelRequest() {
  state.request?.abort(); state.request = null; state.busy = null;
}
function invalidateAdvice() {
  cancelRequest(); stopVoice(); state.suggestion = null;
  $('adviser-output').replaceChildren(); $('suggestion-output').replaceChildren(); $('voice-controls').hidden = true;
}
function saveLocal() {
  try { localStorage.setItem(storageKey, JSON.stringify({ datasetVersion: DATASET.version, selections: state.selections, pinned: state.pinned?.selections ?? null, locks: [...state.locks] })); } catch { /* Storage may be disabled; the active plan still works. */ }
}
function editPlan(next, { remember = true } = {}) {
  if (activeDrag) finishCardDrag(null, true);
  if (remember) state.history.push({ selections: clone(state.selections), locks: [...state.locks] });
  if (state.history.length > 30) state.history.shift();
  state.run = null; state.timeline = null; state.pending = null; state.peek = null; $('project-peek').hidden = true;
  state.selections = clone(next); state.applied = null; state.view = 'after'; state.revision += 1;
  const selectedIds = new Set(next.map((item) => item.measureId));
  state.locks = new Set([...state.locks].filter((id) => selectedIds.has(id)));
  invalidateAdvice(); message(); saveLocal(); render();
}
function chooseDistrict(id, focus = true) {
  if (!districts.has(id)) return;
  state.districtId = id;
  $('target-district').value = id;
  if (state.pending) { placeProject(state.pending, id); } else render();
  if (focus) city?.focusDistrict(id);
}
function renderSlots() {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 5; i += 1) {
    const selection = state.selections[i];
    const slot = node('div', `plan-slot ${selection ? 'filled' : 'empty'}`);
    if (!selection) { slot.append(node('span', 'slot-number', String(i + 1).padStart(2, '0')), node('span', '', 'Your choice')); fragment.append(slot); continue; }
    const measure = measures.get(selection.measureId);
    const title = node('div', 'slot-title');
    const dot = node('span', 'category-dot'); dot.style.setProperty('--category', categories.get(measure.category)?.color ?? '#327857');
    title.append(dot, node('strong', '', measure.name, { title: measure.name }));
    slot.append(title, button('×', 'slot-remove', () => editPlan(state.selections.filter((item) => item.measureId !== measure.id)), { 'aria-label': `Remove ${measure.name}`, 'data-focus': `remove-${measure.id}` }));
    if (measure.scope === 'district') {
      const target = node('select', 'slot-target', null, { 'aria-label': `District for ${measure.name}`, 'data-focus': `target-${measure.id}` });
      for (const district of DATASET.districts) target.append(node('option', '', district.name, { value: district.id }));
      target.value = selection.districtId;
      target.addEventListener('change', () => {
        const candidate = state.selections.map((item) => item.measureId === measure.id ? { ...item, districtId: target.value } : item);
        const validation = validatePlan(candidate, { allowPartial: true });
        if (!validation.valid) { message(validation.errors.map((error) => error.message).join(' '), true); target.value = selection.districtId; return; }
        editPlan(candidate);
      });
      slot.append(target);
    } else slot.append(node('div', 'citywide-slot', 'All five districts'));
    const lockLabel = node('label', 'slot-lock');
    const lock = node('input', '', null, { type: 'checkbox', 'aria-label': `Keep ${measure.name} and its district in recommendations`, 'data-focus': `lock-${measure.id}` });
    lock.checked = state.locks.has(measure.id);
    lock.addEventListener('change', () => { if (lock.checked) state.locks.add(measure.id); else state.locks.delete(measure.id); state.revision += 1; invalidateAdvice(); saveLocal(); render(); });
    lockLabel.append(lock, document.createTextNode('Keep in advice')); slot.append(lockLabel); fragment.append(slot);
  }
  $('plan-slots').replaceChildren(fragment);
}
const projectNames = { M1:'Bus lanes', M2:'Smart signals', M3:'Light rail', M4:'New park', M5:'Clean fuel', M6:'City greening', M7:'School & daycare', M8:'Health clinic', M9:'Sports hubs', M10:'Safer streets', M11:'Safe crossings', M12:'Digital requests', M13:'Water & heating', M14:'Utility crews' };
const projectPaths = {
 M1:'M7 8h28v18H7z M11 12h20v8H11z M13 26v3 M29 26v3 M3 32h36',
 M2:'M18 4h10v21H18z M23 25v10 M18 35h10 M21 9h4 M21 14h4 M21 19h4 M6 30h8 M32 30h8',
 M3:'M9 4h24v23H9z M13 9h16v10H13z M14 23h2 M26 23h2 M15 27l-5 9 M27 27l5 9 M13 32h17 M17 4V1 M25 4V1',
 M4:'M7 35h31 M14 28v7 M10 21c-10-9 5-17 9-8 9 4 2 16-9 8 M29 29v6 M25 25c-6-8 5-14 9-6 5 6-4 12-9 6',
 M5:'M5 20L17 8l12 12v14H8V20 M17 25v9 M32 6c10 5 8 14 0 14-8-3-4-9 0-14 M34 27v7',
 M6:'M7 35h30 M22 34V9 M22 24C6 26 3 12 6 10c11 0 17 6 16 14 M22 17C35 18 40 6 35 3c-10 0-15 6-13 14',
 M7:'M4 15l17-11 17 11 M8 14v21h26V14 M17 35V24h8v11 M12 18h3 M27 18h3 M21 2v5 M21 2h8',
 M8:'M8 9h26v26H8z M4 35h34 M17 35V25h8v10 M21 13v8 M17 17h8 M12 27h2 M29 27h2',
 M9:'M4 8h35v25H4z M21 8v25 M21 25a5 5 0 1 0 0-10a5 5 0 1 0 0 10 M4 15h5v11H4 M39 15h-5v11h5',
 M10:'M9 35V8q0-5 6-5h7 M22 3v5 M17 8h10 M29 35V18h8 M29 18l8-5v6 M4 35h30',
 M11:'M5 7h33 M5 34h33 M10 13v15 M18 13v15 M26 13v15 M34 13v15 M5 20h-3 M40 20h3',
 M12:'M5 7h32v23H5z M15 35h13 M21 30v5 M12 18l6 6 12-12',
 M13:'M5 35V18h13v17 M18 35V8h19v27 M24 13h7 M24 20h7 M24 27h7 M10 23h3 M10 29h3 M23 8V3 M31 8V3',
 M14:'M3 15h24v16H3z M27 20h8l5 7v4H27 M8 31v4 M33 31v4 M9 22h10 M14 17v10 M32 22v5h7'
};
const projectArtwork = new Map();
const badgeArtwork = new Map();
function projectArt(id) {
 if(projectArtwork.has(id))return projectArtwork.get(id);
 const host=node('span','project-art',null,{'aria-hidden':'true'}), svg=document.createElementNS('http://www.w3.org/2000/svg','svg'), path=document.createElementNS(svg.namespaceURI,'path');
 svg.setAttribute('viewBox','0 0 44 40');path.setAttribute('d',projectPaths[id]);svg.append(path);
 const artwork=node('img','project-illustration',null,{alt:'',src:`/assets/projects/${id}.png`,decoding:'async',draggable:'false'});
 artwork.addEventListener('load',()=>host.classList.add('art-loaded'));
 artwork.addEventListener('error',()=>artwork.remove());
 host.append(svg,artwork);projectArtwork.set(id,host);return host;
}
function highlightCard(id) {
 const measure=measures.get(id);
 if(!measure||state.run||document.querySelector('dialog[open]')){city?.highlightProject?.(null);return;}
 const selected=(state.view==='a'?state.pinned?.selections??[]:state.selections).find(item=>item.measureId===id);
 city?.highlightProject?.(id,measure.scope==='city'?null:selected?.districtId??state.districtId);
}
function clearCardHighlight() { city?.highlightProject?.(null); }
function positionPointerPanel(panel,x,y) {
 const rect=panel.getBoundingClientRect(), gap=16, edge=10;
 const left=x+gap+rect.width>innerWidth-edge?x-rect.width-gap:x+gap;
 panel.style.left=`${Math.max(edge,Math.min(innerWidth-rect.width-edge,left))}px`;
 panel.style.top=`${Math.max(edge,Math.min(innerHeight-rect.height-edge,y+gap))}px`;
}
function hideCardTooltip() { $('card-tooltip').hidden=true; }
function bindProjectPointer(element,id) {
 element.addEventListener('pointerenter',event=>{
   if(event.pointerType==='touch'||activeDrag?.active||state.run)return;
   const measure=measures.get(id),tip=$('card-tooltip');
   tip.replaceChildren(node('strong','',measure.name),node('span','tooltip-cost',`${measure.cost} units · ${measure.scope==='city'?'City-wide':districtName(state.selections.find(item=>item.measureId===id)?.districtId??state.districtId)}`),node('p','',measure.description));
   tip.hidden=false;positionPointerPanel(tip,event.clientX,event.clientY);requestAnimationFrame(()=>{if(!tip.hidden)positionPointerPanel(tip,event.clientX,event.clientY);});highlightCard(id);
 });
 element.addEventListener('pointermove',event=>{if(!$('card-tooltip').hidden)positionPointerPanel($('card-tooltip'),event.clientX,event.clientY);});
 element.addEventListener('pointerleave',()=>{hideCardTooltip();if(!activeDrag?.active)clearCardHighlight();});
 element.addEventListener('focus',()=>{highlightCard(id);if(element.matches(':focus-visible'))showProjectDetail(id);});
 element.addEventListener('blur',()=>{hideCardTooltip();if(!activeDrag?.active)clearCardHighlight();});
}
function renderPlacedProjects() {
 $('placed-projects').replaceChildren(...displayedPlan().map(selection=>{
   const measure=measures.get(selection.measureId);
   const badge=button('','placed-project',()=>{if(performance.now()>=suppressCardClickUntil)showProjectDetail(measure.id);},{'aria-label':`${measure.name} · ${districtName(selection.districtId)} · ${measure.cost} units`,'data-focus':`badge-${measure.id}`,'data-measure':measure.id,'data-district':selection.districtId??'city'});
   if(!badgeArtwork.has(measure.id)){
     const art=projectArt(measure.id).cloneNode(true),image=art.querySelector('img');
     if(image?.complete&&image.naturalWidth)art.classList.add('art-loaded');
     else image?.addEventListener('load',()=>art.classList.add('art-loaded'),{once:true});
     badgeArtwork.set(measure.id,art);
   }
   const art=badgeArtwork.get(measure.id);
   badge.append(art);badge.title=`${measure.name} · ${districtName(selection.districtId)}`;
   badge.disabled=Boolean(state.run);bindProjectPointer(badge,measure.id);
   if(state.view!=='a')bindCardDrag(badge,measure.id,true);
   return badge;
 }));
 positionPlacedProjects();
}
function positionPlacedProjects() {
 const anchors=city?.getPlacementAnchors?.(), canvas=$('city-canvas').getBoundingClientRect(), overlay=$('placed-projects').getBoundingClientRect();
 const hud=document.querySelector('.hud').getBoundingClientRect(), lower=document.querySelector('.city-bottom-tools').getBoundingClientRect();
 const notice=$('app-message').getBoundingClientRect();
 const top=Math.max(hud.bottom+55,notice.height?notice.bottom+8:0),bottom=Math.max(top+50,lower.top-12),size=46,gap=7,used=[],groups=new Map();
 for(const badge of $('placed-projects').children){const id=badge.dataset.district; if(!groups.has(id))groups.set(id,[]);groups.get(id).push(badge);}
 for(const [id,badges]of groups){
   const anchor=id==='city'?anchors?.city:anchors?.districts?.[id];
   let centerX=anchor?anchor.x+canvas.left:innerWidth/2,centerY=anchor?anchor.y+canvas.top:top+55;
   const groupTop=top+(id!=='city'&&groups.has('city')?size+gap:0);
   centerX=Math.max(32,Math.min(innerWidth-32,centerX));centerY=id==='city'?top+size/2:Math.max(groupTop+size/2,Math.min(bottom-size/2,centerY));
   badges.forEach((badge,index)=>{
     let x=Math.max(10,Math.min(innerWidth-size-10,centerX+(index-(badges.length-1)/2)*(size+gap)-size/2));
     let y=centerY-size/2;
     const collides=(a,b)=>used.some(rect=>Math.abs(rect.x-a)<size+gap&&Math.abs(rect.y-b)<size+gap);
     if(collides(x,y)){
       outer:for(let row=0;row<8;row++)for(let col=-3;col<=3;col++){
         const a=Math.max(10,Math.min(innerWidth-size-10,x+col*(size+gap))),b=groupTop+row*(size+gap);
         if(b+size<=bottom&&!collides(a,b)){x=a;y=b;break outer;}
       }
     }
     used.push({x,y});badge.style.left=`${x-overlay.left}px`;badge.style.top=`${y-overlay.top}px`;
     badge.classList.toggle('edge-anchor',Boolean(anchor&&!anchor.visible));
   });
 }
}
// All plan edits use the shared official validator. Districts have no project cap.
function projectDropCandidate(id,districtId,placed=false) {
 const measure=measures.get(id);
 if(!districtId)return {valid:false,reason:'Drop on a district in the city.'};
 if(measure?.scope==='district'&&districtId==='sarayshyk')return {valid:false,reason:'Sarayshyk is outside this five-district scenario.'};
 const selection={measureId:id,districtId:measure?.scope==='city'?null:districtId};
 const selections=placed?state.selections.map(item=>item.measureId===id?selection:item):[...state.selections,selection];
 const validation=validatePlan(selections,{allowPartial:true});
 return {valid:validation.valid,reason:validation.errors.map(error=>error.message).join(' '),selections,selection};
}
function bindCardDrag(element,id,placed) {
 element.addEventListener('pointerdown',event=>{
   if(event.button!==0||!event.isPrimary||state.run||activeDrag||!city?.districtAtClientPoint||document.querySelector('dialog[open]'))return;
   activeDrag={pointerId:event.pointerId,id,placed,source:element,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,rect:element.getBoundingClientRect(),active:false};
   element.setPointerCapture(event.pointerId);
 });
 element.addEventListener('lostpointercapture',event=>{if(activeDrag?.pointerId===event.pointerId)finishCardDrag(event,true);});
 element.addEventListener('dragstart',event=>event.preventDefault());
}
function currentDrop(drag,x,y) {
 const hit=document.elementFromPoint(x,y);
 if(hit?.closest('.project-deck'))return drag.placed?{valid:true,remove:true,reason:'Return to the hand to remove this project.'}:{valid:false,reason:'Drop on a district in the city.'};
 if(hit?.closest('.hud,.map-toolbar,.city-bottom-tools,.project-peek,dialog,.map-credit'))return {valid:false,reason:'Drop on a district in the city.'};
 return projectDropCandidate(drag.id,city.districtAtClientPoint(x,y),drag.placed);
}
function moveCardDrag(event) {
 const drag=activeDrag;if(!drag||drag.pointerId!==event.pointerId)return;
 drag.x=event.clientX;drag.y=event.clientY;
 if(!drag.active){
   const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
   if(Math.hypot(dx,dy)<8||(event.pointerType==='touch'&&Math.abs(dx)>Math.abs(dy)))return;
   drag.active=true;city.setInteractionLocked?.(true);hideCardTooltip();state.pending=null;state.peek=null;$('project-peek').hidden=true;drag.source.classList.remove('pending');clearCardHighlight();
   drag.source.classList.add('drag-origin');
   drag.ghost=node('div','drag-card',null,{'aria-hidden':'true'});drag.ghost.append(projectArt(drag.id).cloneNode(true),node('span','',projectNames[drag.id]));document.body.append(drag.ghost);
 }
 event.preventDefault();drag.ghost.style.left=`${event.clientX-43}px`;drag.ghost.style.top=`${event.clientY-53}px`;
 const drop=currentDrop(drag,event.clientX,event.clientY),status=$('drop-status');
 const text=drop.reason||(drop.selection.districtId?districtName(drop.selection.districtId):'All five districts');
 if(status.textContent!==text)status.textContent=text;
 status.hidden=false;status.classList.toggle('invalid',!drop.valid);drag.ghost.classList.toggle('invalid',!drop.valid);positionPointerPanel(status,event.clientX,event.clientY);
 $('project-library').classList.toggle('drop-removal',Boolean(drop.remove));
 if(drop.valid&&!drop.remove)city.highlightProject?.(drag.id,drop.selection.districtId);else clearCardHighlight();
}
function finishCardDrag(event,cancelled=false) {
 const drag=activeDrag;if(!drag||(event&&event.pointerId!==drag.pointerId))return;
 activeDrag=null;city?.setInteractionLocked?.(false);hideCardTooltip();clearCardHighlight();$('drop-status').hidden=true;$('project-library').classList.remove('drop-removal');drag.source.classList.remove('drag-origin');
 if(drag.source.hasPointerCapture?.(drag.pointerId))drag.source.releasePointerCapture(drag.pointerId);
 if(!drag.active)return;
 suppressCardClickUntil=performance.now()+450;event?.preventDefault();
 const drop=cancelled?{valid:false,reason:'Placement cancelled.'}:currentDrop(drag,event?.clientX??drag.x,event?.clientY??drag.y);
 if(drop.valid){
   drag.ghost.remove();
   if(drop.remove){state.category='all';editPlan(state.selections.filter(item=>item.measureId!==drag.id));const returned=$('projects').querySelector(`[data-measure="${drag.id}"]`);returned?.scrollIntoView({block:'nearest',inline:'center'});message('Project returned to the hand.');}
   else {editPlan(drop.selections);message(`${measures.get(drag.id).name} · ${districtName(drop.selection.districtId)}`);}
 }else{
   message(drop.reason,!cancelled);
   if(state.reducedMotion)drag.ghost.remove();
   else {const animation=drag.ghost.animate([{left:drag.ghost.style.left,top:drag.ghost.style.top,opacity:1},{left:`${drag.rect.left+drag.rect.width/2-43}px`,top:`${drag.rect.top+drag.rect.height/2-53}px`,opacity:0}],{duration:230,easing:'ease-out',fill:'forwards'});animation.finished.then(()=>drag.ghost.remove()).catch(()=>drag.ghost.remove());}
 }
}
let cardArcFrame=0;
function scheduleCardArc() {
 if(cardArcFrame)return;
 cardArcFrame=requestAnimationFrame(()=>{
   cardArcFrame=0;
   const list=$('projects');
   list.classList.remove('fits');
   list.classList.toggle('fits',list.scrollWidth<=list.clientWidth);
   const half=list.clientWidth/2;
   for(const card of list.children){
     const distance=Math.max(-1,Math.min(1,(card.offsetLeft+card.offsetWidth/2-list.scrollLeft-half)/(half||1)));
     card.style.setProperty('--card-angle',`${distance*4}deg`);
     card.style.setProperty('--card-drop',`${distance*distance*12}px`);
   }
   $('projects-prev').disabled=list.scrollLeft<2;
   $('projects-next').disabled=list.scrollLeft+list.clientWidth>=list.scrollWidth-2;
 });
}
function placeProject(id, districtId=state.districtId) {
 const measure=measures.get(id); if(!measure||state.run)return;
 const selection={measureId:id,districtId:measure.scope==='city'?null:districtId};
 const candidate=[...state.selections,selection], checked=validatePlan(candidate,{allowPartial:true});
 if(!checked.valid){message(checked.errors.map(error=>error.message).join(' '),true);return;}
 editPlan(candidate);message(`${measure.name} placed ${selection.districtId?`in ${districtName(selection.districtId)}`:'across all five districts'}.`);
}
function showProjectDetail(id) {
 const measure=measures.get(id);if(!measure)return;hideCardTooltip();if(state.peek!==id)$('peek-expanded').open=false;state.peek=id;
 const selected=(state.view==='a'?state.pinned?.selections??[]:state.selections).find(item=>item.measureId===id), category=categories.get(measure.category);
 $('project-peek').hidden=false;$('peek-category').textContent=`${category.name} · ${measure.cost} units`;$('peek-title').textContent=measure.name;$('peek-description').textContent=measure.description;
 $('peek-effects').replaceChildren(...Object.entries(measure.effects).map(([indicator,value])=>node('span',`effect-chip${value<0?' negative':''}`,`${effectIcons[indicator]??indicator} ${signed(value,0)}`,{title:`${DATASET.indicators.find(item=>item.id===indicator)?.name??indicator} ${signed(value,0)} (base effect)`,'aria-label':`${DATASET.indicators.find(item=>item.id===indicator)?.name??indicator} ${signed(value,0)}`})));
 $('peek-effect-description').textContent=Object.entries(measure.effects).map(([indicator,value])=>`${DATASET.indicators.find(item=>item.id===indicator)?.name??indicator} ${signed(value,0)}`).join(' · ');
 $('peek-meta').textContent=`Base effects before delay · completes in quarter ${measure.lag} · ${measure.scope==='city'?'City-wide':'One district'}`;
 $('peek-action').textContent=selected?districtName(selected.districtId):state.pending===id?'Choose a district.':measure.scope==='city'?'All five districts':'One district';
 const action=$('place-current');action.hidden=(!selected&&state.pending!==id)||state.view==='a';action.disabled=Boolean(state.run);
 action.textContent=selected?'Remove this project':`Place in ${districtName(state.districtId)}`;
}
function renderProjects() {
 clearCardHighlight();
 const savedScroll=$('projects').scrollLeft;
 const shortCategories={transport:'Transport',ecology:'Ecology',social:'Social',safety:'Safety',services:'Services'};
 $('category-filters').replaceChildren(...[{id:'all',name:'All'},...DATASET.categories].map(category=>button(shortCategories[category.id]??category.name,'filter',()=>{state.category=category.id;$('projects').scrollLeft=0;state.pending=null;state.peek=null;$('project-peek').hidden=true;message();render();},{'aria-pressed':state.category===category.id,'data-focus':`filter-${category.id}`})));
 const visible=DATASET.measures.filter(measure=>(state.category==='all'||measure.category===state.category)&&!state.selections.some(item=>item.measureId===measure.id));$('project-total').textContent=visible.length;
 $('projects').replaceChildren(...visible.map(measure=>{
   const selected=state.selections.find(item=>item.measureId===measure.id), validTargets=(measure.scope==='city'?[null]:DATASET.districts.map(item=>item.id)).some(districtId=>validatePlan([...state.selections,{measureId:measure.id,districtId}],{allowPartial:true}).valid);
   const card=button('',`project-tile${selected?' selected':''}${state.pending===measure.id?' pending':''}${!selected&&!validTargets?' blocked':''}`,()=>{
     if(state.run||performance.now()<suppressCardClickUntil)return;
     if(selected){showProjectDetail(measure.id);return;}
     if(!validTargets){showProjectDetail(measure.id);const checked=validatePlan([...state.selections,{measureId:measure.id,districtId:measure.scope==='city'?null:state.districtId}],{allowPartial:true});message(checked.errors.map(error=>error.message).join(' '),true);return;}
     if(measure.scope==='city'){placeProject(measure.id);return;}
     state.pending=measure.id;state.view='after';render();showProjectDetail(measure.id);message(`Place ${measure.name}: choose a district on the map.`);
   },{'aria-label':`${selected?'Inspect':'Choose'} ${measure.name}, ${measure.cost} units`,'aria-pressed':Boolean(selected||state.pending===measure.id),'data-focus':`project-${measure.id}`,'data-measure':measure.id});
   card.style.setProperty('--category',categories.get(measure.category).color);card.disabled=Boolean(state.run);
   const cost=node('span','tile-cost',measure.cost);cost.append(node('small','','units'));
   card.append(projectArt(measure.id),cost,node('span','tile-name',projectNames[measure.id]),node('span','tile-scope',selected?`✓ ${districtName(selected.districtId)}`:measure.scope==='city'?'City-wide':`District · ${measure.lag}q build`));
   bindProjectPointer(card,measure.id);
   bindCardDrag(card,measure.id,false);
   card.addEventListener('keydown',event=>{
     const cards=[...$('projects').children],index=cards.indexOf(card);
     const next=event.key==='ArrowRight'?cards[index+1]:event.key==='ArrowLeft'?cards[index-1]:event.key==='Home'?cards[0]:event.key==='End'?cards.at(-1):null;
     if(next){event.preventDefault();next.focus();next.scrollIntoView({block:'nearest',inline:'nearest',behavior:state.reducedMotion?'instant':'smooth'});}
   });return card;
 }));$('projects').scrollLeft=savedScroll;scheduleCardArc();
}
function renderResults(validation) {
  const displayed = effectiveResult();
  const isReplay = Boolean(state.run && state.view === 'after');
  const hasOutcome = state.view === 'a' ? Boolean(state.pinned) : state.view !== 'before' && Boolean(state.applied || (isReplay && state.run.quarter > 0));
  const baselineView = !hasOutcome;
  const headline = $('headline-result');
  const caption = node('div', 'result-caption', isReplay && state.run.quarter > 0 ? `Illustrative replay · quarter ${state.run.quarter}` : baselineView ? 'Baseline reference' : state.view === 'a' ? 'Pinned Plan A · official score' : 'Your plan · official score');
  const score = node('div', 'score-line'); score.append(node('strong', 'score-big', fmt(displayed.score)));
  if (hasOutcome) { const delta = displayDelta(displayed.score, BASELINE.score); score.append(node('span', `delta-pill${delta < 0 ? ' negative' : delta === 0 ? ' neutral' : ''}`, signed(delta), { title: `Full-precision change: ${fmt(displayed.score - BASELINE.score, 5)}` })); }
  const note = node('p', 'baseline-note', isReplay ? 'Illustrative progression, not a policy forecast. The official result is available at quarter 8.' : baselineView ? 'The city before intervention. This is not your draft plan’s score.' : `Compared with the ${fmt(BASELINE.score)} baseline, after 8 quarters. Changes use unrounded model values.`);
  const metrics = node('div', 'summary-metrics');
  const weakest = [...displayed.districts].sort((a, b) => a.score - b.score)[0];
  const weakCard = node('div', 'summary-metric'); weakCard.append(node('span', '', 'Weakest district'), node('strong', '', weakest?.name ?? '—'), node('small', '', `${fmt(weakest?.score)} district index`));
  const criticalCard = node('div', 'summary-metric'); criticalCard.append(node('span', '', 'Critical indicators'), node('strong', '', displayed.criticalCount), node('small', '', hasOutcome ? `${BASELINE.criticalCount} at baseline · below 40` : 'Values strictly below 40'));
  const explanation=node('details','result-notes');explanation.append(node('summary','','Details'),note);
  metrics.append(weakCard, criticalCard); headline.replaceChildren(caption, score, metrics, explanation);
  const validationBox = $('validation');
  if (state.view === 'a' && state.pinned) validationBox.replaceChildren(node('p', 'valid-message', `✓ Pinned Plan A · ${state.pinned.result.cost} / ${DATASET.budget} units · 5 projects`));
  else if (state.run) validationBox.replaceChildren(node('p', 'valid-message', `Construction replay · quarter ${state.run.quarter} / 8. Official result at quarter 8.`));
  else if (state.applied) validationBox.replaceChildren(node('p', 'valid-message', `✓ Valid plan · ${state.applied.result.cost} / ${DATASET.budget} units · 5 projects`));
  else if (validation.valid) validationBox.replaceChildren(node('p', 'valid-message', '✓ Your five-project plan is ready. Simulate to see its impact.'));
  else {
    const text = state.selections.length < 5 ? `${5 - state.selections.length} more ${state.selections.length === 4 ? 'project' : 'projects'} to complete your plan. No draft score is calculated.` : 'Resolve these issues before simulating.';
    const items = [node('p', '', text)];
    const errors = validation.errors.filter((error) => error.code !== 'COUNT');
    if (errors.length) { const list = node('ul'); errors.forEach((error) => list.append(node('li', '', error.message))); items.push(list); }
    validationBox.replaceChildren(...items);
  }
  $('district-results').replaceChildren(...displayed.districts.map((district) => {
    const baseline = BASELINE.districts.find((item) => item.id === district.id); const delta = displayDelta(district.score, baseline.score);
    const row = button('', `district-row${state.districtId === district.id ? ' active' : ''}`, () => chooseDistrict(district.id), { 'aria-label': `${district.name}, district score ${fmt(district.score)}${hasOutcome ? `, change ${signed(delta)}` : ''}`, 'data-focus': `result-${district.id}` });
    row.append(node('span', '', district.name), node('strong', '', fmt(district.score)), node('span', `change${delta < 0 ? ' negative' : ''}`, hasOutcome ? signed(delta) : '—')); return row;
  }));
  const ledger = [node('p', '', 'Official score = 70% population-weighted average + 30% weakest district − count of indicators below 40.')];
  for (const [label, value] of [['City average × 0.7', displayed.average * .7], ['Weakest district × 0.3', displayed.minimum * .3], ['Critical penalty', -displayed.criticalCount]]) { const row = node('div', 'ledger-row'); row.append(node('span', '', label), node('strong', '', fmt(value, 5))); ledger.push(row); }
  if (hasOutcome) for (const synergy of displayed.synergies ?? []) ledger.push(node('div', 'synergy-note', `${synergy.measures.join(' + ')} · ${districtName(synergy.districtId)}: ${synergy.description}`));
  ledger.push(node('p', '', 'Effects use the supplied delays, then fixed synergy bonuses and clipping. Display values are rounded; the model retains full precision.'));
  $('score-breakdown').replaceChildren(...ledger);
  const focus = displayed.districts.find((district) => district.id === state.districtId);
  const base = BASELINE.districts.find((district) => district.id === state.districtId);
  $('focus-name').textContent = `${focus.name} · indicators`;
  $('focus-share').textContent = `${Math.round(focus.populationShare * 100)}% of population`;
  $('indicator-list').replaceChildren(...DATASET.indicators.map((indicator) => {
    const value = focus.indicators[indicator.id], delta = value - base.indicators[indicator.id], critical = value < 40;
    const row = node('div', `indicator-row${critical ? ' critical' : ''}`);
    const heading = node('div', 'indicator-heading'); const label = node('span', '', indicator.name, { title: `${indicator.id}: ${indicator.description}` });
    if (critical) label.append(node('span', 'critical-label', '⚠ <40'));
    const number = node('span', '', fmt(value, 1));
    if (hasOutcome && delta !== 0) number.append(node('span', `indicator-delta${delta < 0 ? ' negative' : ''}`, signed(delta, 1)));
    heading.append(label, number); const track = node('div', 'indicator-track', null, { 'aria-hidden': 'true' }); const fill = node('span'); fill.style.width = `${Math.max(0, Math.min(100, value))}%`; track.append(fill); row.append(heading, track); return row;
  }));
}
function renderProjectChanges(mode) {
  const current = mode === 'before' ? [] : displayedPlan();
  const selectionKey = (selection) => `${selection.measureId}:${selection.districtId ?? '*'}`;
  const aKeys = new Set((state.pinned?.selections??[]).map(selectionKey)), bKeys = new Set(state.selections.map(selectionKey));
  const added = state.pinned ? state.selections.filter(selection=>!aKeys.has(selectionKey(selection))) : [];
  const removed = state.pinned ? state.pinned.selections.filter(selection=>!bKeys.has(selectionKey(selection))) : [];
  const host = $('project-change-summary');
  if (mode === 'before' || !current.length) { host.replaceChildren(); return []; }
  const compared = Boolean(state.pinned), heading = node('div', 'project-change-heading');
  heading.append(node('span', 'eyebrow', compared ? 'CHANGES FROM PLAN A' : 'EXPLORE YOUR PROJECTS'), node('span', '', compared ? `${added.length} added · ${removed.length} removed` : 'Select a project to inspect'));
  const list = node('div', 'project-focus-list');
  const entries = compared && (added.length||removed.length) ? [...added.map(selection=>({selection,view:'after',prefix:'+'})),...removed.map(selection=>({selection,view:'a',prefix:'−'}))] : current.map(selection=>({selection,view:mode==='a'?'a':'after',prefix:''}));
  for (const {selection,view,prefix} of entries) {
    const measure = measures.get(selection.measureId);
    const chip = button('', `project-focus-chip${view === 'a' && prefix ? ' previous' : ''}`, () => { if(state.view!==view){state.view=view;render();}city?.focusProject(selection.measureId, selection.districtId); $('report-dialog').close(); }, { 'aria-label': `Focus ${measure.name} ${selection.districtId ? `in ${districtName(selection.districtId)}` : 'city-wide'}${prefix ? view==='a'?' in Plan A':' in your current plan':''}`, 'data-focus': `focus-${measure.id}-${view}` });
    chip.disabled = Boolean(state.run);
    const dot = node('span', 'category-dot'); dot.style.setProperty('--category', categories.get(measure.category)?.color ?? '#327857');
    chip.append(dot,node('span','',`${prefix?prefix+' ':''}${measure.name}`),node('small','',districtName(selection.districtId)));
    const contribution = (view === 'a' ? state.pinned?.result : state.applied?.result)?.contributions?.find((item) => item.measureId === measure.id);
    if(contribution) chip.title = Object.entries(contribution.effects).map(([id,value])=>`${DATASET.indicators.find(indicator=>indicator.id===id)?.name??id}: ${signed(value)}`).join('; ')+' — realized project effects before synergy';
    list.append(chip);
  }
  if(compared&&!added.length&&!removed.length) list.append(node('p','help','These project choices match Plan A.'));
  host.replaceChildren(heading,list);
  return compared ? (mode==='a'?removed:added).map(selectionKey) : [];
}
function render() {
  if(activeDrag)finishCardDrag(null,true);
  if (!DATASET) return;
  const activeFocus = document.activeElement?.getAttribute('data-focus');
  const validation = validatePlan(state.selections);
  $('spent').textContent = String(validation.cost); $('remaining').textContent = `${validation.remaining} units ${validation.remaining >= 0 ? 'available' : 'over budget'}`;
  $('budget-fill').style.width = `${Math.min(100, validation.cost / DATASET.budget * 100)}%`;
  const track = $('budget-fill').parentElement; track.setAttribute('aria-valuenow', Math.min(DATASET.budget, validation.cost)); track.classList.toggle('over', validation.remaining < 0);
  $('slot-count').textContent = `${state.selections.length} / 5`;
  $('apply-plan').disabled = !validation.valid || Boolean(state.applied) || Boolean(state.run);
  $('apply-plan').firstElementChild.textContent = state.run ? `Q${state.run.quarter} / 8` : state.applied ? 'Complete' : 'Start';
  $('plan-hint').textContent = state.run ? `Quarter ${state.run.quarter} / 8 · illustrative replay` : state.pending ? 'Click a district to place your project.' : state.applied ? 'Change a choice to try another future' : validation.valid ? 'Ready to see your city change' : `${5 - state.selections.length} ${5 - state.selections.length === 1 ? 'choice' : 'choices'} left to make`;
  $('undo').disabled = state.history.length === 0; $('reset-plan').disabled = state.selections.length === 0;
  const activePlan = state.view === 'after' && Boolean(state.applied);
  $('pin-plan').disabled = !activePlan; $('view-a').disabled = !state.pinned;
  $('get-advice').disabled = !activePlan || Boolean(state.busy); $('get-improvement').disabled = !activePlan || Boolean(state.busy);
  $('get-advice').textContent = state.busy === 'advice' ? 'Explaining…' : 'Explain my plan';
  $('get-improvement').textContent = state.busy === 'suggest' ? 'Checking changes…' : 'Find one improvement';
  $('export-plan').disabled = !activePlan; $('print-plan').disabled = !activePlan;
  $('adviser-output').hidden = state.view !== 'after'; $('suggestion-output').hidden = state.view !== 'after';
  $('pause-city').setAttribute('aria-pressed', state.paused); $('pause-city').textContent = state.paused ? 'Resume' : 'Pause';
  $('pause-city').disabled = state.reducedMotion;
  if(state.reducedMotion) $('pause-city').textContent = 'Reduced motion';
  document.querySelectorAll('[data-view]').forEach((item) => { item.setAttribute('aria-pressed', item.dataset.view === state.view); item.disabled = Boolean(state.run) || (item.dataset.view === 'a' && !state.pinned); });
  document.querySelectorAll('[data-speed]').forEach(item => item.setAttribute('aria-pressed', Number(item.dataset.speed) === state.speed));
  $('district-shortcuts').replaceChildren(...DATASET.districts.map((district) => button(district.name, '', () => chooseDistrict(district.id), { 'aria-pressed': district.id === state.districtId, 'data-focus': `district-${district.id}` })));
  renderSlots(); renderProjects(); renderPlacedProjects(); renderResults(validation);
  const mode = state.view === 'before' ? 'before' : state.view === 'a' ? 'a' : state.applied || state.run ? 'after' : 'draft';
  const highlightKeys = renderProjectChanges(mode);
  $('scene-state').textContent = state.run ? `Q${state.run.quarter} / 8 · ${state.run.quarter ? 'ILLUSTRATIVE REPLAY' : 'BASELINE'}${state.paused ? ' · PAUSED' : ''}` : { before: 'BASELINE CITY', a: 'PINNED PLAN A', after: 'YOUR FUTURE CITY', draft: state.selections.length ? 'DRAFT · PROJECT PREVIEW' : 'BASELINE CITY' }[mode];
  $('scene-description').textContent = state.run ? `Quarter ${state.run.quarter}: illustrative construction replay. Only quarter 8 is the official outcome.` : mode === 'a' ? 'Pinned Plan A. Amber rings mark projects that differ from your current choices.' : mode === 'before' ? 'The city before intervention. Your choices are preserved.' : mode === 'after' ? 'Your validated end-state at 8 quarters. Buildings, road activity and reactions are illustrative; green rings mark changed projects.' : 'Translucent projects are previews. Complete five choices and simulate to calculate official outcomes.';
  renderHud(); renderTimeline();
  city?.update({ replay: state.run ? {quarter:state.run.quarter, completedMeasureIds:state.run.frames[state.run.quarter].completedMeasureIds, running:!state.paused, speed:state.speed} : null, selections: displayedPlan(), result: mode === 'draft' ? null : effectiveResult(), districtId: state.districtId, mode, paused: state.paused, reducedMotion: state.reducedMotion, highlightKeys, indicatorNames: Object.fromEntries(DATASET.indicators.map(indicator=>[indicator.id,indicator.name])), measureNames: Object.fromEntries(DATASET.measures.map(measure=>[measure.id,measure.name])) });
  if (activeFocus) [...document.querySelectorAll('[data-focus]')].find((item) => item.dataset.focus === activeFocus)?.focus({ preventScroll: true });
}
function renderHud() {
 const result=effectiveResult(), replay=Boolean(state.run), official=(state.view==='a'&&state.pinned)||(state.view==='after'&&state.applied);
 $('report-eyebrow').textContent=replay?`QUARTER ${state.run.quarter} · ILLUSTRATIVE`:official?'QUARTER 8 · COMPLETED':'BASELINE REFERENCE';
 $('hud-score-label').textContent=replay?'Official at Q8':official?(state.view==='a'?'Plan A · official':'Official score'):'Baseline';
 $('hud-score').textContent=replay?'—':fmt(result.score);
 $('hud-weak').textContent=[...result.districts].sort((a,b)=>a.score-b.score)[0]?.name??'—';
 $('hud-weak-label').textContent=replay?'Weakest · illustrative':official?'Weakest district':'Weakest · baseline';
 $('hud-critical').textContent=result.criticalCount;
 $('hud-critical').title=replay?'Illustrative replay count':official?'Official count':'Baseline count';
 $('plan-comparison').textContent=state.pinned&&state.applied?`Plan A ${fmt(state.pinned.result.score)} → current plan ${fmt(state.applied.result.score)} · ${signed(state.applied.result.score-state.pinned.result.score)} official score. Cost ${state.pinned.result.cost} → ${state.applied.result.cost}.`:state.pinned?`Plan A is saved at ${fmt(state.pinned.result.score)}. Complete your current run to compare.`:'Pin a completed plan, change one choice, then compare the two futures.';
 $('voice-controls').hidden=!document.querySelector('.adviser-text')||!official||state.view!=='after';
}
function openDialog(id) { if(activeDrag)finishCardDrag(null,true);hideCardTooltip();clearCardHighlight();document.querySelectorAll('dialog[open]').forEach(item=>{if(item.id!==id)item.close();}); const dialog=$(id); if(!dialog.open)dialog.showModal(); }
function applyPlan() {
 if(activeDrag)finishCardDrag(null,true);
 const timeline=timelinePlan(state.selections);
 if(!timeline.valid){message(timeline.errors.map(error=>error.message).join(' '),true);render();return;}
 invalidateAdvice();state.pending=null;state.peek=null;$('project-peek').hidden=true;
 state.timeline=timeline.frames;state.run={frames:timeline.frames,quarter:0,elapsed:0,lastTick:performance.now(),selections:clone(state.selections)};
 state.applied=null;state.view='after';state.paused=state.reducedMotion;
 document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
 message('Construction started. Quarter 1–7 is illustrative; the official result arrives at quarter 8.');render();
 if(state.reducedMotion)finishRun();
}
function finishRun() {
 if(!state.run)return;
 const run=state.run;state.applied={selections:clone(run.selections),result:run.frames.at(-1).result};state.run=null;state.view='after';
 $('report-eyebrow').textContent='QUARTER 8 · COMPLETED';
 message(`City complete · official score ${fmt(state.applied.result.score)} · ${signed(state.applied.result.score-BASELINE.score)} versus baseline.`);
 render();openDialog('report-dialog');
}
setInterval(()=>{
 const run=state.run;if(!run)return;const now=performance.now(),elapsed=Math.min(500,now-run.lastTick);run.lastTick=now;
 if(state.paused||document.hidden)return;
 run.elapsed+=elapsed*state.speed;const quarter=Math.min(8,Math.floor(run.elapsed/1800));
 if(quarter===8){finishRun();return;}if(quarter!==run.quarter){run.quarter=quarter;render();}
},100);
function renderTimeline() {
 const host=$('timeline-chart'),tableHost=$('timeline-table');
 if(!state.timeline){host.replaceChildren();tableHost.replaceChildren();$('timeline-notice').textContent='Start a valid five-project plan to see its construction replay.';return;}
 const frames=state.timeline.slice(0,state.run?state.run.quarter+1:9),colors=['#327857','#238a9a','#8a73b8','#b37a25','#587ea0','#b44848'];
 $('timeline-notice').textContent='Current run: quarter 0 is baseline; quarters 1–7 are illustrative, not forecasts. Only quarter 8 is the official result.';
 const series=[{name:'City index',values:frames.map(frame=>frame.result.score)},...DATASET.districts.map(district=>({name:district.name,values:frames.map(frame=>frame.result.districts.find(item=>item.id===district.id).score)}))];
 const values=series.flatMap(item=>item.values),low=Math.floor(Math.min(...values))-2,high=Math.ceil(Math.max(...values))+2;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 560 240');svg.setAttribute('role','img');svg.setAttribute('aria-label','City and district indices by quarter. Exact values are in the following table.');
 const add=(tag,attrs,text)=>{const el=document.createElementNS(svg.namespaceURI,tag);for(const [name,value]of Object.entries(attrs))el.setAttribute(name,value);if(text!==undefined)el.textContent=text;svg.append(el);};
 for(let i=0;i<5;i++){const value=low+(high-low)*i/4,y=205-(value-low)/(high-low)*178;add('line',{x1:38,x2:545,y1:y,y2:y,stroke:'#e1e8dc'});add('text',{x:31,y:y+3,'text-anchor':'end',fill:'#5f716b','font-size':10},fmt(value,0));}
 for(let q=0;q<=8;q++)add('text',{x:42+q*61,y:226,'text-anchor':'middle',fill:'#5f716b','font-size':10},`Q${q}`);
 series.forEach((item,index)=>{const points=item.values.map((value,q)=>`${42+q*61},${205-(value-low)/(high-low)*178}`).join(' ');add('polyline',{points,fill:'none',stroke:colors[index],'stroke-width':index?1.6:3,'stroke-dasharray':index?'4 3':'none'});const q=item.values.length-1;add('circle',{cx:42+q*61,cy:205-(item.values[q]-low)/(high-low)*178,r:index?2.5:4,fill:colors[index]});});
 const legend=node('div','chart-legend');series.forEach((item,index)=>{const label=node('span','',item.name),dot=node('i');dot.style.background=colors[index];label.prepend(dot);legend.append(label);});host.replaceChildren(svg,legend);
 const table=node('table'),caption=node('caption','sr-only','Quarterly replay values'),head=node('thead'),tr=node('tr');tr.append(node('th','','Quarter'),...series.map(item=>node('th','',item.name)));head.append(tr);const body=node('tbody');
 frames.forEach((frame,q)=>{const row=node('tr');row.append(node('th','',q===0?'Q0 baseline':q===8?'Q8 official':`Q${q} illustrative`),...series.map(item=>node('td','',fmt(item.values[q]))));body.append(row);});table.append(caption,head,body);tableHost.replaceChildren(table);
}
function stopVoice() {
 state.speechRequest?.abort();state.speechRequest=null;state.speech?.pause();state.speech=null;if(state.speechUrl)URL.revokeObjectURL(state.speechUrl);state.speechUrl=null;
 if('speechSynthesis'in window)window.speechSynthesis.cancel();if($('stop-voice'))$('stop-voice').disabled=true;if($('read-briefing'))$('read-briefing').disabled=false;
}
async function readBriefing() {
 const text=document.querySelector('.adviser-text')?.textContent;if(!text||!state.applied)return;stopVoice();
 const revision=state.revision,controller=new AbortController();state.speechRequest=controller;$('read-briefing').disabled=true;$('stop-voice').disabled=false;$('voice-status').textContent='Preparing AI-generated voice · displayed briefing is the transcript.';
 const timeout=setTimeout(()=>controller.abort(),30000);
 try{
   const response=await fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal:controller.signal});if(!response.ok)throw new Error('Speech unavailable');
   const blob=await response.blob();if(state.speechRequest!==controller||revision!==state.revision)return;
   state.speechUrl=URL.createObjectURL(blob);state.speech=new Audio(state.speechUrl);state.speech.addEventListener('ended',()=>{stopVoice();$('voice-status').textContent='AI-generated voice · reading complete.';});await state.speech.play();$('voice-status').textContent='AI-generated voice · displayed briefing is the transcript.';
 }catch(error){
   if(state.speechRequest!==controller||revision!==state.revision)return;
   if('speechSynthesis'in window){const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en';utterance.onend=()=>{stopVoice();$('voice-status').textContent='Browser voice · reading complete.';};utterance.onerror=()=>{stopVoice();$('voice-status').textContent='Audio unavailable. The complete briefing remains above.';};window.speechSynthesis.speak(utterance);$('voice-status').textContent='Browser voice fallback · displayed briefing is the transcript.';}
   else{stopVoice();$('voice-status').textContent='Audio unavailable. The complete briefing remains above.';}
 }finally{clearTimeout(timeout);}
}
async function requestAnalysis(kind) {
  if (!state.applied || state.busy) return;
  stopVoice();
  const revision = state.revision, currentKey = key(state.selections), controller = new AbortController();
  state.request = controller; state.busy = kind; state.suggestion = null; $('suggestion-output').replaceChildren();
  $('adviser-output').textContent = kind === 'advice' ? 'Reading your calculated outcomes…' : 'Checking every eligible one-project change…'; render();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`/api/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: state.applied.selections, lockedMeasureIds: [...state.locks], language: 'en' }), signal: controller.signal });
    let data; try { data = await response.json(); } catch { throw new Error('The server returned an unreadable response. Please try again.'); }
    if (revision !== state.revision || currentKey !== key(state.selections)) return;
    if (!response.ok) throw new Error(data.error ?? data.reason ?? 'The server could not analyze this plan.');
    $('adviser-output').replaceChildren();
    if (kind === 'advice') {
      $('adviser-output').append(node('span', 'adviser-mode', data.mode === 'live' ? 'Live AI · grounded in model outputs' : 'Offline · deterministic explanation'), node('div', 'adviser-text', data.text ?? 'No explanation was returned.'));
      if (data.trace?.length) { const trace = node('details'); trace.append(node('summary', '', 'View calculation evidence')); for (const item of data.trace) trace.append(node('div', 'trace-item', `${item.tool}: ${typeof item.summary === 'string' ? item.summary : JSON.stringify(item.summary)}`)); $('adviser-output').append(trace); }
      if (data.suggestion) showSuggestion(data.suggestion);
    } else showSuggestion(data);
  } catch (error) {
    if (revision !== state.revision) return;
    $('adviser-output').textContent = error.name === 'AbortError' ? 'The request timed out. Your plan and calculated results are safe; try again.' : error.message;
  } finally {
    clearTimeout(timeout);
    if (state.request === controller) { state.request = null; state.busy = null; render(); }
  }
}
function showSuggestion(data) {
  if (!data.available) { $('suggestion-output').replaceChildren(node('p', 'help', data.reason ?? 'No improving one-project change was found.')); return; }
  const verified = simulatePlan(data.selections);
  const locksPreserved = [...state.locks].every((id) => {
    const previous = state.selections.find((item) => item.measureId === id), next = data.selections.find((item) => item.measureId === id);
    return previous && next && previous.districtId === next.districtId;
  });
  if (!verified.valid || !locksPreserved || !(verified.score > state.applied.result.score) || !Number.isFinite(data.result?.score) || Math.abs(verified.score - data.result.score) > 1e-8) { $('suggestion-output').replaceChildren(node('p', 'help', 'The proposed change could not be verified against this plan. It has not been applied.')); return; }
  state.suggestion = { selections: clone(data.selections), result: verified, revision: state.revision };
  const card = node('div', 'suggestion-card');
  card.append(node('strong', '', `${fmt(verified.score)} · ${signed(displayDelta(verified.score, state.applied.result.score))} improvement`), node('p', '', `Cost ${verified.cost}/100. Best one-change search; not a global optimum.`));
  const removed = state.selections.filter((item) => !data.selections.some((next) => next.measureId === item.measureId && next.districtId === item.districtId));
  const added = data.selections.filter((item) => !state.selections.some((previous) => previous.measureId === item.measureId && previous.districtId === item.districtId));
  removed.forEach((item) => card.append(node('p', '', `Replace: ${measures.get(item.measureId).name} · ${districtName(item.districtId)}`)));
  added.forEach((item) => card.append(node('p', '', `With: ${measures.get(item.measureId).name} · ${districtName(item.districtId)}`)));
  card.append(button('Apply verified change ↗', 'button primary', () => {
    const suggestion = state.suggestion;
    if (!suggestion || suggestion.revision !== state.revision) return;
    editPlan(suggestion.selections); applyPlan();
  }));
  $('suggestion-output').replaceChildren(card);
}
function bindControls() {
 window.addEventListener('click',event=>{if(performance.now()<suppressCardClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
 window.addEventListener('pointermove',moveCardDrag,{passive:false});
 window.addEventListener('pointerup',event=>finishCardDrag(event));
 window.addEventListener('pointercancel',event=>finishCardDrag(event,true));
 window.addEventListener('blur',()=>{if(activeDrag)finishCardDrag(null,true);hideCardTooltip();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){if(activeDrag)finishCardDrag(null,true);hideCardTooltip();}});
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&activeDrag){event.preventDefault();finishCardDrag(null,true);}});
 setInterval(()=>{if(!document.hidden&&!activeDrag)positionPlacedProjects();},100);
 $('projects').addEventListener('scroll',()=>{
   const focused=document.activeElement;
   if(focused?.dataset.measure&&focused.matches(':focus-visible'))highlightCard(focused.dataset.measure);else clearCardHighlight();
   scheduleCardArc();
 },{passive:true});
 window.addEventListener('resize',scheduleCardArc);
 window.addEventListener('blur',clearCardHighlight);
 for(const [id,direction]of [['projects-prev',-1],['projects-next',1]])$(id).addEventListener('click',()=>{
   clearCardHighlight();$('projects').scrollBy({left:direction*Math.max(150,$('projects').clientWidth*.7),behavior:state.reducedMotion?'instant':'smooth'});
 });
  document.querySelectorAll('[data-open]').forEach(item=>item.addEventListener('click',()=>openDialog(item.dataset.open)));
  document.querySelectorAll('[data-close]').forEach(item=>item.addEventListener('click',()=>item.closest('dialog').close()));
  $('report-dialog').addEventListener('close',stopVoice);
  document.querySelectorAll('[data-speed]').forEach(item=>item.addEventListener('click',()=>{state.speed=Number(item.dataset.speed);render();}));
  $('close-peek').addEventListener('click',()=>{state.pending=null;state.peek=null;$('project-peek').hidden=true;message();render();});
  $('place-current').addEventListener('click',()=>{const selected=state.selections.some(item=>item.measureId===state.peek);if(selected)editPlan(state.selections.filter(item=>item.measureId!==state.peek));else if(state.pending)placeProject(state.pending);});
  $('read-briefing').addEventListener('click',readBriefing);$('stop-voice').addEventListener('click',()=>{stopVoice();$('voice-status').textContent='Reading stopped. The complete briefing remains above.';});
  $('target-district').append(...DATASET.districts.map((district) => node('option', '', district.name, { value: district.id })));
  $('target-district').value = state.districtId; $('target-district').disabled = false;
  $('target-district').addEventListener('change', () => chooseDistrict($('target-district').value));
  $('load-example').disabled = false; $('load-example').addEventListener('click', () => { editPlan(EXAMPLE_PLAN); message('The supplied example is ready: five projects, 95 units. Press Start to build your city.'); });
  $('reset-plan').addEventListener('click', () => editPlan([]));
  $('undo').addEventListener('click', () => { const previous = state.history.pop(); if (previous) { state.locks = new Set(previous.locks); editPlan(previous.selections, { remember: false }); } });
  $('apply-plan').addEventListener('click', applyPlan);
  $('pin-plan').addEventListener('click', () => { if (state.applied) { state.pinned = clone(state.applied); saveLocal(); message('Plan A is pinned. Edit your choices to explore Plan B; switch views without moving the camera.'); render(); } });
  document.querySelectorAll('[data-view]').forEach((item) => item.addEventListener('click', () => { if (item.dataset.view === 'a' && !state.pinned) return; stopVoice(); state.view = item.dataset.view; render(); }));
  $('pause-city').addEventListener('click', () => { state.paused = !state.paused; render(); });
  $('reset-view').addEventListener('click', () => city?.resetView());
  $('get-advice').addEventListener('click', () => { $('briefing-details').open=true;requestAnalysis('advice'); });
  $('get-improvement').addEventListener('click', () => { $('briefing-details').open=true;requestAnalysis('suggest'); });
  $('export-plan').addEventListener('click', () => {
    if (!state.applied) return;
    const payload = { datasetVersion: DATASET.version, selections: state.applied.selections, result: state.applied.result, lockedMeasureIds: [...state.locks], assumptions: 'Organizer-supplied synthetic scenario. Geographic backdrop is real; buildings, projects and reactions are illustrative.', geographyCredit: $('geography-credit').textContent };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = node('a', '', '', { href: url, download: 'akim-lab-plan.json' }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('print-plan').addEventListener('click', () => { state.view = 'after'; render();const closed=[...$('report-dialog').querySelectorAll('details:not([open])')];closed.forEach(item=>item.open=true);window.addEventListener('afterprint',()=>closed.forEach(item=>item.open=false),{once:true});window.print(); });
}
async function boot() {
  // The planner must still boot if the separate 3D module cannot load.
  const sceneReady = import('./city.js?v=20260923-polish1249').then(({ createCity }) => {
    city = createCity({ canvasHost: $('city-canvas'), labelsHost: $('city-labels'), reactionsHost: $('city-reactions'), fallbackHost: $('city-fallback'), loadingHost: $('scene-loading'), onDistrictSelect: (id) => chooseDistrict(id), onDistrictHover: (id) => { $('hover-district').textContent = id === 'sarayshyk' ? 'Sarayshyk · outside scenario' : id ? districtName(id) : ''; }, onCredit: (text, attributionUrl) => { $('geography-credit').textContent = text; if(attributionUrl) { try { const url=new URL(attributionUrl); if(['https:','http:'].includes(url.protocol)) $('geography-credit').append(document.createTextNode(' '),node('a','','Map source and attribution',{href:url.href,target:'_blank',rel:'noopener noreferrer'})); } catch { /* Keep the provided credit text if its optional URL is malformed. */ } } } });
    return city.ready.then(() => render());
  }).catch((error) => {
    $('scene-loading').hidden = true; $('city-fallback').hidden = false;
    $('city-fallback').replaceChildren(node('p', '', 'The 3D view is unavailable. Use the district controls below; planning and calculations still work.'));
    console.warn('Scene module unavailable:', error.message);
  });
  try {
    const [dataModule, simulationModule] = await Promise.all([import('/shared/city-data.js'), import('/shared/simulation.js')]);
    ({ DATASET, EXAMPLE_PLAN } = dataModule); ({ BASELINE, validatePlan, simulatePlan, timelinePlan } = simulationModule);
    measures = new Map(DATASET.measures.map((measure) => [measure.id, measure])); districts = new Map(DATASET.districts.map((district) => [district.id, district])); categories = new Map(DATASET.categories.map((category) => [category.id, category]));
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (saved?.datasetVersion === DATASET.version && validatePlan(saved.selections, { allowPartial: true }).valid) {
        state.selections = clone(saved.selections); state.locks = new Set((saved.locks ?? []).filter((id) => state.selections.some((item) => item.measureId === id)));
        if (saved.pinned && simulatePlan(saved.pinned).valid) state.pinned = { selections: clone(saved.pinned), result: simulatePlan(saved.pinned) };
      }
    } catch { /* Ignore an unavailable or obsolete saved plan. */ }
    bindControls(); render(); $('app').setAttribute('aria-busy', 'false'); message(state.selections.length ? 'Saved draft restored.' : '');
    void sceneReady;
  } catch (error) {
    $('app').setAttribute('aria-busy', 'false'); message('The city calculation model could not load. Your browser has not calculated a score. Reload to retry.', true);
    $('app-message').append(button('Reload', 'button', () => location.reload()));
    $('projects').replaceChildren(node('p', 'empty-copy', 'The project library will appear when the shared model is available.'));
    console.error('City model failed to load:', error.message);
  }
}
boot();

const Planner=(()=>{
  const places=[
    ['Gateway',33.64939,-111.85825],["Brown’s Ranch",33.76158,-111.84224],['Lost Dog Wash',33.59965,-111.81296],['Eldorado Greenbelt',33.4775,-111.9124],['Chaparral Greenbelt',33.51101,-111.90657]
  ];
  const key='routiq-planned-v1';
  const saved=()=>{if(window.RoutiqCloud)return RoutiqCloud.routes();try{const rows=JSON.parse(localStorage.getItem(key));return Array.isArray(rows)?rows:[]}catch{return []}};
  let graph,loading,map,overlay,trailLayer,heatLayer,view,mode='Generate',sport='Run',area=0;
  let start=places[0].slice(1),shape='Loop',popular=true,snap=true,showHeat=true;
  let waypoints=[],segments=[],points=[],km=0,density=null,variation=0,target=null,name='',draftId=null,message='';
  let camera=null;
  let nearby=[],origin=null,originLabel='',searchVersion=0,geoVersion=0,searchTimer;
  function suggestionsPanel(){
    return `<section class="nearby-panel"><div class="nearby-head"><h2>Suggested routes</h2><div class="plan-buttons"><button class="secondary" data-pl="near-location">${icon('pin')}Use my location</button><button class="secondary" data-pl="near-map">Search map center</button></div></div><p id="nearbyInfo" class="plan-hint" role="status"></p><div id="nearbyResults" class="nearby-results"></div></section>`;
  }
  function invalidateNearby(){
    clearTimeout(searchTimer);searchVersion++;geoVersion++;nearby=[];
    if(byId('nearbyResults'))byId('nearbyResults').replaceChildren();
  }
  function refreshNearby(point=origin||start,label=originLabel||(area<0?'your selected start':places[area][0])){
    invalidateNearby();origin=point.slice();originLabel=label;
    if(!view?.isConnected)return;
    const requested=Number(target??defaultKm());
    if(!graph){byId('nearbyInfo').textContent='Loading mapped paths…';return}
    if(!Number.isFinite(requested)||requested<.5||requested>80){byId('nearbyInfo').textContent='Enter a distance between 0.5 and 80 km.';return}
    byId('nearbyInfo').textContent=`Looking for routes near ${label}…`;
    const ticket=searchVersion;
    searchTimer=setTimeout(()=>findNearby(point,label,requested,ticket),200);
  }
  async function findNearby(point,label,requested,ticket){
    const candidates=places.map(([title,lat,lon],area)=>({title,area,id:graph.nearest([lat,lon],sport,300)})).filter(c=>c.id>=0);
    const nearest=graph.nearest(point,sport,1500);
    if(nearest>=0&&!candidates.some(c=>arcDistance(graph.points[c.id],graph.points[nearest])<.4)){
      candidates.push({title:'Nearby path',area:-1,id:nearest});
    }
    candidates.forEach(c=>c.away=arcDistance(point,graph.points[c.id]));
    candidates.sort((a,b)=>a.away-b.away);
    const results=[];
    for(const c of candidates){
      if(c.away>35||results.length===3)break;
      await new Promise(resolve=>setTimeout(resolve,0));
      if(ticket!==searchVersion)return;
      for(const kind of shape==='Loop'?['Loop','Out and back']:[shape]){
        try{
          const route=graph.generate(c.id,sport,requested,kind,popular);
          results.push({...route,area:c.area,away:c.away,shape:kind,title:`${c.title} ${kind.toLowerCase()}`,target:requested});
          break;
        }catch{/* Another shape or start may have a connected route. */}
      }
    }
    if(ticket!==searchVersion||!view?.isConnected)return;
    nearby=results;
    byId('nearbyInfo').textContent=results.length?`Near ${label} · ${sport} · ${distance(requested)} km target. Starts are ordered by straight-line distance.`:`No matching Scottsdale routes within 35 km of ${label}. Try another distance or search a different map area.`;
    byId('nearbyResults').innerHTML=results.map((r,i)=>`<button class="nearby-card" data-nearby="${i}"><canvas class="nearby-track" aria-hidden="true"></canvas><span><strong>${esc(r.title)}</strong><span>${distance(r.km)} km · Start ${distance(r.away)} km away</span></span>${icon('chevron')}</button>`).join('');
    byId('nearbyResults').querySelectorAll('canvas').forEach((canvas,i)=>RouteMap.draw(canvas,results[i]));
  }
  function nearLocation(){
    invalidateNearby();
    const ticket=geoVersion,info=byId('nearbyInfo');
    if(!navigator.geolocation){info.textContent='Location is unavailable. Pan the map and select Search map center.';return}
    info.textContent='Finding your location…';
    navigator.geolocation.getCurrentPosition(pos=>{
      if(ticket===geoVersion&&view?.isConnected)refreshNearby([pos.coords.latitude,pos.coords.longitude],'your location');
    },()=>{if(ticket===geoVersion)info.textContent='Location is unavailable. Pan the map and select Search map center.'},{timeout:15000,maximumAge:60000});
  }
  function previewNearby(index){
    const route=nearby[index];if(!route)return;
    reset();mode='Generate';area=route.area;start=route.points[0];points=route.points;km=route.km;shape=route.shape;density=route.density;name=route.title;target=route.target;
    message='Suggested route opened.';render();fit();byId('planMap').scrollIntoView({block:'center'});
  }
  function loadNetwork(){
    loading??=fetch('scottsdale.json').then(r=>{
      if(!r.ok)throw Error('Trail data unavailable.');
      return r.json();
    }).then(data=>{graph=new TrailNetwork(data);return graph}).catch(error=>{loading=null;throw error});
    return loading;
  }
  function downloadRecord(record){
    RouteFiles.open(record,graph||loadNetwork().catch(()=>null));
  }
  const select=(items,value)=>items.map(v=>`<option ${v===value?'selected':''}>${esc(v)}</option>`).join('');
  function typical(){
    const rows=state.activities.filter(a=>a.sport===sport&&!a.sample&&a.km>0).sort((a,b)=>a.km-b.km);
    return rows.length?Math.max(.5,Math.min(80,Math.round(rows[Math.floor(rows.length/2)].km*10)/10)):null;
  }
  function defaultKm(){return typical()??(sport==='Ride'?15:sport==='Run'?7:4)}
  function layout(){
    return `<section class="plan-panel"><div class="plan-head"><h2>Route planner</h2><span>${icon('pin')}Scottsdale, AZ</span></div><div class="plan-grid"><div class="plan-map-wrap"><div id="planMap" aria-label="Interactive route planning map"></div><div class="map-tools"><button id="locatePlan" class="maptool" title="Use my location" aria-label="Use my location">${icon('pin')}</button></div><div class="map-legend"><span class="trail-key"></span>Mapped path <span class="heat-key"></span>GPS density</div></div>
    <div class="plan-controls"><div class="tabs plan-tabs">${['Generate','Draw route'].map(v=>`<button data-plan-mode="${v}" class="${mode===v?'on':''}" aria-pressed="${mode===v}">${v}</button>`).join('')}</div>
    <div id="planFields"></div><div id="planStatus" class="plan-status" role="status"></div><div id="planResult"></div></div></div>
    <div class="plan-foot"><label><input id="heatSwitch" type="checkbox" ${showHeat?'checked':''}>Show heatmap</label><details><summary>Map data & coverage</summary><p>Routes follow Scottsdale’s mapped preserve trails and shared-use paths. Heat shows public GPS point density. Travel modes and unique visitor counts are unknown. Trail access can change.</p><p id="sampleInfo"></p><p><a href="https://maps.scottsdaleaz.gov/arcgis/rest/services/OpenData/MapServer/10" target="_blank" rel="noopener">City preserve trails</a> · <a href="https://maps.scottsdaleaz.gov/arcgis/rest/services/Biking_Hiking_Equestrian_Trails/MapServer/2" target="_blank" rel="noopener">Shared-use paths</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors / ODbL</a> · <a href="https://www.scottsdaleaz.gov/preserve" target="_blank" rel="noopener">Current preserve notices</a></p></details></div></section>${suggestionsPanel()}<div id="savedPlans"></div>`;
  }
  function fields(){
    if(!view?.isConnected)return;
    const labels=places.map(p=>p[0]);if(area===-1)labels.push('Map selection');
    const custom=mode==='Draw route';
    byId('planFields').innerHTML=`<div class="plan-fieldgrid"><label>Sport<select id="planSport">${select(['Run','Ride','Walk'],sport)}</select></label><label>${custom?'Map area':'Start area'}<select id="planArea">${select(labels,area===-1?'Map selection':places[area][0])}</select></label></div>${custom?`<label>Connect waypoints<select id="planSnap">${select(['Follow mapped paths','Straight lines'],snap?'Follow mapped paths':'Straight lines')}</select></label><p class="plan-hint">${snap?'Tap a mapped path to add a waypoint.':'Tap anywhere to draw straight segments. Check access before using your sketch.'}</p><div class="plan-buttons"><button class="secondary" data-pl="undo" ${waypoints.length?'':'disabled'}>Undo point</button><button class="secondary" data-pl="clear" ${waypoints.length?'':'disabled'}>Clear</button></div>`:`<div class="plan-fieldgrid"><label>Distance (km)<input id="planKm" type="number" min="0.5" max="80" step="0.1" value="${target??defaultKm()}"></label><label>Route shape<select id="planShape">${select(['Loop','Out and back'],shape)}</select></label></div><label>Prioritize<select id="planPreference">${select(['Popular areas','Closest distance'],popular?'Popular areas':'Closest distance')}</select></label><p class="plan-hint">${typical()!==null?'Suggested distance uses your activity history. ':''}Tap a path to change the start.</p><button class="primary generate-btn" data-pl="generate" ${graph?'':'disabled'}>${icon('route')}Generate route</button>`}`;
    byId('planStatus').textContent=message;
    if(graph)byId('sampleInfo').textContent=`${graph.samples.toLocaleString()} distinct public GPS samples in the Scottsdale snapshot, downloaded ${graph.date}.`;
    result();
  }
  function result(){
    const ready=points.length>1&&km>0;
    byId('planResult').innerHTML=ready?`<div class="plan-summary"><strong>${distance(km)} <small>km</small></strong><span>${mode==='Generate'?esc(shape):waypoints.length+' waypoints'}</span></div><label>Route name<input id="planName" maxlength="80" placeholder="Name this route" value="${esc(name)}"></label><button data-pl="save" class="secondary save-plan">${draftId?'Update saved route':'Save route'}</button><button data-pl="download" class="textbtn download-plan">Download route</button>`:'';
  }
  function library(){
    const plans=saved();
    byId('savedPlans').innerHTML=`<div class="section-title"><h2>Planned routes</h2></div>`+(plans.length?`<div class="routes plan-library">${plans.map(p=>`<button class="route-card" data-plan-open="${esc(p.id)}"><div class="route-image">${mapHtml(p)}</div><section><h2>${esc(p.title)}</h2><div class="meta">${icon(sportIcon(p.sport))}${esc(p.sport)} · ${distance(p.km)} km</div></section></button>`).join('')}</div>`:'<div class="plan-empty">Saved routes will appear here.</div>');paintMaps();
  }
  function reset(){waypoints=[];segments=[];points=[];km=0;density=null;name='';draftId=null;message=''}
  function status(s){message=s;if(byId('planStatus'))byId('planStatus').textContent=s}
  function draw(){
    if(!overlay)return;overlay.clearLayers();
    if(points.length>1){L.polyline(points,{color:'#221b30',weight:8,opacity:.85,interactive:false}).addTo(overlay);L.polyline(points,{color:'#caa5ff',weight:4.5,interactive:false}).addTo(overlay)}
    const pins=mode==='Generate'?[points[0]||start]:waypoints;
    pins.forEach((p,i)=>L.circleMarker(p,{radius:i===0?7:5,weight:2,color:'#28212f',fillColor:i===0?'#d1f294':'#dfc9ff',fillOpacity:1,interactive:false}).addTo(overlay));
  }
  function trails(){
    if(!graph||!map)return;trailLayer?.remove();
    const mask=sport==='Ride'?2:1;
    const lines=graph.paths.filter(([,a])=>a&mask).map(([, ,ids])=>ids.map(i=>graph.points[i]));
    trailLayer=L.polyline(lines,{color:'#77638e',opacity:.86,weight:2.2,interactive:false,pane:'trails'}).addTo(map);
  }
  function drawHeat(){
    if(!map||!graph)return;heatLayer?.remove();heatLayer=null;
    if(!showHeat)return;
    const Layer=L.Layer.extend({
      onAdd(m){this.canvas=L.DomUtil.create('canvas','route-heat');m.getPane('gpsHeat').appendChild(this.canvas);this.redraw();},
      onRemove(){this.canvas.remove()},
      getEvents(){return {moveend:this.redraw,zoomend:this.redraw,resize:this.redraw}},
      redraw(){
        const m=this._map;if(!m)return;
        const z=m.getZoom(),size=m.getSize(),c=this.canvas;
        c.width=size.x;c.height=size.y;L.DomUtil.setPosition(c,m.containerPointToLayerPoint([0,0]));
        const ctx=c.getContext('2d'),bounds=m.getBounds().pad(.12);
        const radius=Math.min(95,Math.max(5,Math.pow(2,z-14)*11));
        for(const [y,x,n] of graph.heat){
          const p=[(y+.5)/1000,(x+.5)/1000];if(!bounds.contains(p))continue;
          const at=m.latLngToContainerPoint(p),g=ctx.createRadialGradient(at.x,at.y,0,at.x,at.y,radius),v=Math.min(1,Math.log1p(n)/4);
          g.addColorStop(0,`rgba(255,${Math.round(103+97*v)},58,${.18+.57*v})`);g.addColorStop(.48,`rgba(249,108,63,${.08+.27*v})`);g.addColorStop(1,'rgba(227,102,64,0)');ctx.fillStyle=g;ctx.fillRect(at.x-radius,at.y-radius,2*radius,2*radius);
        }
      }
    });
    heatLayer=new Layer().addTo(map);
  }
  async function mount(){
    view=byId('planMap');const el=view;
    map=L.map(el,{preferCanvas:true,minZoom:2,maxZoom:19,scrollWheelZoom:false,zoomAnimation:false}).setView(camera?.center||start,camera?.zoom||14);
    map.createPane('gpsHeat').style.zIndex=360;map.createPane('trails').style.zIndex=370;
    map.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · City of Scottsdale'}).addTo(map);
    overlay=L.layerGroup().addTo(map);map.on('click',e=>placePoint([e.latlng.lat,e.latlng.lng]));
    byId('locatePlan').onclick=locate;fields();library();draw();
    try{
      if(!graph)await loadNetwork();
      if(view!==el||!el.isConnected)return;
      trails();drawHeat();draw();fields();refreshNearby();
    }catch{if(view===el)status('Scottsdale paths could not load. Reopen Routes to retry, or draw using straight lines.')}
  }
  function unmount(){invalidateNearby();if(map){camera={center:map.getCenter(),zoom:map.getZoom()};map.remove();map=null;overlay=null;heatLayer=null;trailLayer=null}view=null}
  function locate(){
    if(!navigator.geolocation){status('Location is unavailable. Pan the map to your start.');return}
    const current=view;status('Finding your location…');
    navigator.geolocation.getCurrentPosition(pos=>{if(current!==view)return;const p=[pos.coords.latitude,pos.coords.longitude];map.setView(p,15);if(mode==='Generate')placePoint(p);else status('Tap the map to add a waypoint here.')},()=>{if(current===view)status('Location unavailable. Select a start area or pan the map.')},{timeout:15000});
  }
  function placePoint(p){
    try{
      let id=-1;
      if(mode==='Generate'||snap){if(!graph)throw Error('The mapped paths are still loading.');id=graph.nearest(p,sport,180);if(id<0)throw Error('Choose a point closer to a mapped Scottsdale path, or use straight lines in Draw route.');p=graph.points[id]}
      if(mode==='Generate'){reset();start=p;area=-1;message='Start updated.';refreshNearby(p,'your selected start')}
      else{
        const previous=waypoints.at(-1);if(previous){
          if(TrailNetwork.metres(previous,p)<2)throw Error('Place the next point farther along the route.');
          const segment=snap?graph.between(graph.nearest(previous,sport,2),id,sport).map(i=>graph.points[i]):[previous,p];segments.push(segment);
        }
        waypoints.push(p);rebuildSketch();message='';
      }
      fields();draw();
    }catch(e){status(e.message)}
  }
  function rebuildSketch(){points=waypoints.length?[waypoints[0],...segments.flatMap(s=>s.slice(1))]:[];km=points.reduce((d,p,i)=>i?d+arcDistance(points[i-1],p):d,0);if(!name&&points.length>1)name=`${area>=0?places[area][0]:'Custom'} ${sport.toLowerCase()}`}
  function generate(){
    const input=byId('planKm');if(!input.reportValidity())return;target=Number(input.value);if(!target){status('Enter a target distance.');return}
    try{
      const id=graph.nearest(start,sport,300);if(id<0)throw Error('Tap a mapped path to choose a start for this sport.');
      const r=graph.generate(id,sport,target,shape,popular,variation++);reset();points=r.points;km=r.km;density=r.density;
      name=`${area>=0?places[area][0]:'Scottsdale'} ${shape.toLowerCase()}`;
      message=`${distance(km)} km for your ${distance(target)} km target. ${density<.005?'No sampled activity along this option.':popular?'Ranked using sampled GPS density.':'Ranked by distance.'}`;fields();draw();fit();
    }catch(e){reset();fields();draw();status(e.message)}
  }
  function fit(){if(points.length>1)map.fitBounds(L.latLngBounds(points),{padding:[30,30],maxZoom:17,animate:false})}
  function storeRoutes(rows){if(window.RoutiqCloud)RoutiqCloud.saveRoutes(rows);else localStorage.setItem(key,JSON.stringify(rows))}
  function save(){
    const title=byId('planName').value.trim();if(!title){byId('planName').focus();status('Enter a name before saving.');return}
    const record={id:draftId||crypto.randomUUID(),title,sport,km,points,waypoints,segments,mode,shape,snap,start,area,target,popular,density};
    const plans=saved().filter(p=>p.id!==record.id);plans.unshift(record);
    try{storeRoutes(plans);draftId=record.id;name=title;library();result();status(window.RoutiqCloud?'Route saved.':'Route saved on this device.')}catch{status('Device storage is full or unavailable. The route is still open.')}
  }
  function openPlan(id){
    const p=saved().find(x=>x.id===id);if(!p)return;
    modal(p.title,`<div class="meta">${icon(sportIcon(p.sport))}${esc(p.sport)} · ${distance(p.km)} km · ${p.mode==='Generate'?esc(p.shape):'Custom route'}</div><div class="detail-map">${mapHtml(p)}</div><button class="secondary save-plan" data-plan-download="${esc(id)}">Download route</button><div class="form-actions spread"><button class="secondary" data-plan-delete="${esc(id)}">Delete</button><button class="primary" data-plan-edit="${esc(id)}">Open in planner</button></div>`);
  }
  function edit(id){
    const p=saved().find(x=>x.id===id);if(!p)return;
    ({sport,mode,points,km,waypoints,segments,shape,snap,start,area,target,popular,density}=p);draftId=id;name=p.title;message='Saved route opened.';dialog.close();render();fit();byId('planMap').scrollIntoView({block:'center'});
  }
  function changeMode(m){if(m===mode)return;reset();mode=m;render()}
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.planMode){changeMode(b.dataset.planMode);return}
    if(b.dataset.planOpen){openPlan(b.dataset.planOpen);return}
    if(b.dataset.nearby!==undefined){previewNearby(Number(b.dataset.nearby));return}
    if(b.dataset.planDownload){const record=saved().find(p=>p.id===b.dataset.planDownload);if(record)downloadRecord(record);return}
    if(b.dataset.planEdit){edit(b.dataset.planEdit);return}
    if(b.dataset.planDelete){modal('Delete planned route?',`<p class="help">Remove this saved route?</p><div class="form-actions"><button class="secondary" data-action="close">Cancel</button><button class="danger" data-plan-confirm="${esc(b.dataset.planDelete)}">Delete route</button></div>`);return}
    if(b.dataset.planConfirm){const id=b.dataset.planConfirm;try{storeRoutes(saved().filter(p=>p.id!==id));if(draftId===id){reset();fields();draw()}dialog.close();library()}catch{notify('Could not delete route')}return}
    switch(b.dataset.pl){
      case 'generate':generate();break;
      case 'undo':waypoints.pop();segments.pop();rebuildSketch();message='';fields();draw();break;
      case 'clear':reset();fields();draw();break;
      case 'save':save();break;
      case 'download':downloadRecord({title:name.trim()||'Routiq route',sport,points,km,mode,shape,snap});break;
      case 'near-location':nearLocation();break;
      case 'near-map':{const c=map.getCenter();refreshNearby([c.lat,c.lng],'the map center');break}
    }
  });
  document.addEventListener('input',e=>{if(e.target.id==='planName')name=e.target.value;if(e.target.id==='planKm'){target=e.target.value;invalidateSuggestion();refreshNearby()}});
  function invalidateSuggestion(){if(mode==='Generate'&&points.length){reset();draw();result();status('Generate a route with these preferences.')}}
  document.addEventListener('change',e=>{
    const v=e.target.value;
    switch(e.target.id){
      case 'heatSwitch':showHeat=e.target.checked;drawHeat();break;
      case 'planSport':sport=v;target=null;reset();trails();fields();draw();refreshNearby();break;
      case 'planShape':shape=v;invalidateSuggestion();refreshNearby();break;
      case 'planPreference':popular=v==='Popular areas';invalidateSuggestion();refreshNearby();break;
      case 'planSnap':snap=v==='Follow mapped paths';reset();fields();draw();break;
      case 'planArea':{
        const idx=places.findIndex(p=>p[0]===v);if(idx<0)break;reset();area=idx;start=places[idx].slice(1);if(idx>=3)shape='Out and back';map.setView(start,14);fields();draw();refreshNearby(start,places[idx][0]);break;
      }
    }
  });
  return {layout,mount,unmount,saved,downloadRecord,library};
})();

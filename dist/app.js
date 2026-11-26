
const icons = {
  overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  activity:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',route:'<circle cx="5" cy="18" r="2.6"/><circle cx="19" cy="6" r="2.6"/><path d="M8 18h6a3.5 3.5 0 0 0 0-7h-4a2.5 2.5 0 0 1 0-5h6"/>',
  stats:'<path d="M4 20h16M6 16v-5m6 5V4m6 12V8"/>',target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  chevrons:'<path d="m9 9 3-3 3 3m-6 6 3 3 3-3"/>',plus:'<path d="M12 5v14M5 12h14"/>',chevron:'<path d="m9 5 7 7-7 7"/>',down:'<path d="m6 9 6 6 6-6"/>',
  run:'<circle cx="15.5" cy="4.5" r="1.7"/><path d="m10 8 3-1 3 4 4 1m-7-5-3 7 4 3-1 5m-3-9-3 5H3M6 10l3-3 3 .5"/>',
  ride:'<circle cx="5" cy="16" r="4"/><circle cx="19" cy="16" r="4"/><path d="m5 16 5-9 5 9H5m8-12h3l3 12M7 7h5"/>',walk:'<circle cx="14" cy="4" r="2"/><path d="m8 12 2-4 4-1 2 5 4 1m-7-5-2 7 4 3 1 4m-5-8-2 5-3 3"/>',
  map:'<path d="m2 6 7-3 6 3 7-3v15l-7 3-6-3-7 3V6Zm7-3v15m6-12v15"/>',mountain:'<path d="m2 19 8-14 5 8 3-5 5 11H2Z"/>',edit:'<path d="m4 16 11-11 4 4L8 20l-5 1 1-5Zm10-10 4 4"/>',
  flag:'<path d="M5 21V4m0 1c4-4 8 3 14-1v10c-6 4-10-3-14 1"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>'
};
const $ = s => document.querySelector(s);
const byId = id => document.getElementById(id);
const icon = name => `<i aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${icons[name]||''}</svg></i>`;
document.querySelectorAll('[data-icon]').forEach(el=>{el.outerHTML=icon(el.dataset.icon)});
const esc = value => String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const sportIcon = sport => ({Run:'run',Ride:'ride',Walk:'walk'})[sport] || 'activity';
const fmt = (d,opts) => new Date(d).toLocaleDateString('en-US',opts);
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function daysAgo(num){const d=new Date();d.setDate(d.getDate()-num);d.setHours(7,12,0,0);return d}
function sampleLog(){
  return [
    ['Pine Ridge Loop','Run',8.42,2818,246,0,0],['Riverfront Ride','Ride',15.6,3042,134,2,1],['Sunset Trail Run','Run',5.2,1781,106,3,2],['Creekside Walk','Walk',3.4,2350,43,5,1],['Ridgeline Run','Run',6.8,2393,168,6,0],['West Valley Ride','Ride',22.6,4406,270,9,2]
  ].map(([title,sport,km,sec,elev,ago,map],i)=>({id:`sample-${i}`,title,sport,km,sec,elev,date:daysAgo(ago).toISOString(),map,sample:true}));
}
const storageKey='routiq-log-v1';
let state;
try{state=JSON.parse(localStorage.getItem(storageKey))}catch{}
if(!state||!Array.isArray(state.activities))state={activities:sampleLog(),goal:50,name:'Jamie Davis'};
let storageWarning=false;
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(state));return true}catch{storageWarning=true;return false}}
persist();
const distance = km => Number(km.toFixed(2)).toLocaleString('en-US',{maximumFractionDigits:2});
function duration(sec){sec=Math.round(sec);const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=String(sec%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${s}`:`${m}:${s}`}
const recent = () => [...state.activities].sort((a,b)=>new Date(b.date)-new Date(a.date));
const hasMap = a => a.sample||a.points?.length>0;
const mapHtml = a => hasMap(a)?`<canvas class="map-canvas" data-map="${esc(a.id)}" role="img" aria-label="${esc(a.title)} route map"></canvas>`:`<div class="no-map">${icon(sportIcon(a.sport))}</div>`;
const activityDate = a => fmt(a.date,{month:'short',day:'numeric'});
function when(a){const diff=dayKey(new Date(a.date));return diff===dayKey(new Date())?'Today':diff===dayKey(daysAgo(1))?'Yesterday':activityDate(a)}
const sum = (arr,key) => arr.reduce((total,a)=>total+(Number(a[key])||0),0);
function notify(message){const el=byId('toast');el.textContent=storageWarning?'Device storage unavailable. Changes last for this session.':message;el.style.display='block';clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.style.display='none',3600)}
let page=location.hash==='#routes'?'Routes':'Overview',period=7,query='',sportFilter='All sports',rec=null,watch=null,timer=null;
const dialog=byId('dialog'),content=byId('dialogBody');
function modal(title,body){
  content.innerHTML=`<div class="modalhead"><h2 id="dialogTitle">${esc(title)}</h2><button class="icon-btn" data-action="close" aria-label="Close">${icon('close')}</button></div>${body}`;
  dialog.setAttribute('aria-labelledby','dialogTitle');if(!dialog.open)dialog.showModal();paintMaps();
}
function paintMaps(){requestAnimationFrame(()=>document.querySelectorAll('canvas[data-map]').forEach(c=>{const a=state.activities.find(row=>row.id===c.dataset.map)||Planner.saved().find(row=>row.id===c.dataset.map);if(a)RouteMap.draw(c,a)}))}
function dateWindow(days){const start=daysAgo(days-1);start.setHours(0,0,0,0);const end=new Date();end.setHours(23,59,59,999);return state.activities.filter(a=>new Date(a.date)>=start&&new Date(a.date)<=end)}
function hero(a){
  if(!a)return `<section class="panel empty"><h2>Your first activity</h2><p>Log a run, ride, or walk to start your training history.</p></section>`;
  return `<section class="hero"><div class="hero-map">${mapHtml(a)}</div>${hasMap(a)?`<div class="map-key">${icon('map')}${a.sample?'ILLUSTRATED TERRAIN':'GPS TRACK'}</div>`:''}
    <div class="hero-info"><div class="eyebrow">${icon('activity')}LATEST ACTIVITY</div><h2>${esc(a.title)}</h2><div class="meta">${icon(sportIcon(a.sport))}${esc(a.sport)}<span>·</span>${when(a)}<span>·</span>${new Date(a.date).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</div>
    <div class="hero-metrics"><div><strong>${distance(a.km)} <small>km</small></strong><span>Distance</span></div><div><strong>${duration(a.sec)}</strong><span>Duration</span></div><div><strong>${a.elev==null?'—':Math.round(a.elev)+' <small>m</small>'}</strong><span>Elevation gain</span></div></div>
    <button class="hero-action" data-detail="${esc(a.id)}">${icon('activity')}View activity</button></div></section>`;
}
function chart(){
  const rows=dateWindow(period),total=sum(rows,'km'), days=Array.from({length:7},(_,i)=>{const last=(6-i)*(period/7),end=daysAgo(last);const begin=daysAgo(last+period/7-1);const list=rows.filter(a=>{const d=dayKey(new Date(a.date));return d>=dayKey(begin)&&d<=dayKey(end)});return {km:sum(list,'km'),label:period===7?fmt(end,{weekday:'short'}):fmt(begin,{month:'short',day:'numeric'}),detail:dayKey(begin)}});
  const max=Math.max(...days.map(x=>x.km),1);
  return `<section class="panel"><div class="cardhead"><h2>Training volume</h2><div class="period"><select id="period" aria-label="Training volume period"><option value="7" ${period===7?'selected':''}>Last 7 days</option><option value="28" ${period===28?'selected':''}>Last 4 weeks</option></select>${icon('down')}</div></div><div class="big">${distance(total)} <small>km</small></div><div class="minor">Total distance</div><div class="chart" role="img" aria-label="${esc(days.map(x=>x.label+' '+distance(x.km)+' km').join(', '))}">${days.map((x,i)=>`<div class="bar-slot" title="${x.detail} · ${distance(x.km)} km"><div class="bar ${x.km?'':'zero'} ${i===6?'last':''}" style="height:${x.km/max*100}%"></div></div>`).join('')}</div><div class="axis">${days.map(x=>`<span>${x.label}</span>`).join('')}</div></section>`;
}
function goal(){
  const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-(start.getDay()+6)%7);
  const km=sum(dateWindow(7).filter(a=>new Date(a.date)>=start),'km'),pct=Math.round(km/state.goal*100),left=Math.max(0,state.goal-km);
  return `<section class="panel goal-card"><div class="cardhead"><h2>Weekly distance goal</h2><button data-action="goal" class="icon-btn" aria-label="Edit weekly goal">${icon('edit')}</button></div>
    <div class="goalbody"><div class="ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43" fill="none" stroke="#36383a" stroke-width="8"/><circle cx="50" cy="50" r="43" pathLength="100" fill="none" stroke="#c6e997" stroke-width="8" stroke-linecap="round" stroke-dasharray="${Math.min(pct,100)} 100"/></svg><b>${pct}<small>%</small></b></div><div><div class="goalnum">${distance(km)} <small>/ ${distance(state.goal)} km</small></div><div class="goal-caption">This week</div></div></div><div class="goal-foot">${icon('flag')}${left?`${distance(left)} km to reach your goal`:'Weekly goal reached'}</div></section>`;
}
function list(rows){
  if(!rows.length)return `<div class="listpanel empty">No activities to show.</div>`;
  return `<div class="listpanel">${rows.map(a=>`<button class="activity-row" data-detail="${esc(a.id)}"><span class="thumb">${mapHtml(a)}</span><span class="row-main"><strong>${esc(a.title)}</strong><span class="meta">${icon(sportIcon(a.sport))}${esc(a.sport)} · ${activityDate(a)}</span></span><span class="row-stat"><b>${distance(a.km)} km</b><small>Distance</small></span><span class="row-stat duration"><b>${duration(a.sec)}</b><small>Duration</small></span><span class="row-chevron">${icon('chevron')}</span></button>`).join('')}</div>`;
}
const filtered=()=>recent().filter(a=>(sportFilter==='All sports'||a.sport===sportFilter)&&a.title.toLowerCase().includes(query.toLowerCase()));
function updateList(){byId('activityList').innerHTML=list(filtered());paintMaps()}
function render(){
  Planner.unmount();
  const rows=recent();byId('pageTitle').textContent=page;document.title=`${page} · Routiq`;
  byId('today').textContent=fmt(new Date(),{weekday:'long',month:'long',day:'numeric',year:'numeric'}).toUpperCase();
  byId('profileName').textContent=state.name;byId('initials').textContent=state.name.trim().split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase();
  byId('log').innerHTML=rec?`${icon('activity')}Recording`:`${icon('plus')}Log activity`;
  document.querySelectorAll('nav button').forEach(el=>{el.classList.toggle('active',el.dataset.page===page);if(el.dataset.page===page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
  let html='';
  if(page==='Overview')html=hero(rows[0])+`<div class="dashboard-grid">${chart()}${goal()}</div><div class="section-title"><h2>Recent activities</h2><button class="textbtn" data-page="Activities">View all activities</button></div>`+list(rows.slice(0,3));
  if(page==='Activities')html=`<div class="toolbar"><input type="search" id="search" aria-label="Search activities" placeholder="Search activities" value="${esc(query)}"><select id="sportFilter" aria-label="Filter by sport">${['All sports','Run','Ride','Walk'].map(s=>`<option ${s===sportFilter?'selected':''}>${s}</option>`).join('')}</select></div><div id="activityList">${list(filtered())}</div>`;
  if(page==='Routes')html=Planner.layout()+`<div class="section-title"><h2>Recorded routes</h2></div>`+(rows.some(hasMap)?`<div class="routes">${rows.filter(hasMap).map(a=>`<button class="route-card" data-detail="${esc(a.id)}"><div class="route-image">${mapHtml(a)}</div><section><h2>${esc(a.title)}</h2><div class="meta">${icon(sportIcon(a.sport))}${distance(a.km)} km · ${activityDate(a)}</div></section></button>`).join('')}</div>`:'<div class="panel empty">Record an outdoor activity with GPS to add a route.</div>');
  if(page==='Statistics')html=`<div class="stats-tiles">${[['Activities',rows.length,''],['Total distance',distance(sum(rows,'km')),'km'],['Total time',Number((sum(rows,'sec')/3600).toFixed(1)),'h']].map(([t,v,u])=>`<div class="panel"><p class="minor">${t}</p><div class="big">${v} <small>${u}</small></div></div>`).join('')}</div>${chart()}`;
  if(page==='Goals')html=`<div class="goalpage">${goal()}</div>`;
  byId('view').innerHTML=html+`<div class="mobile-settings"><button class="textbtn" data-action="profile">Workspace settings</button></div>`;
  if(page==='Routes')Planner.mount();
  paintMaps();
}
function detail(id){
  const a=state.activities.find(el=>el.id===id);if(!a)return;
  const pace=a.km&&a.sec?duration(a.sec/a.km):'—';
  modal(a.title,`<div class="meta">${icon(sportIcon(a.sport))}${esc(a.sport)} · ${fmt(a.date,{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</div>${hasMap(a)?`<div class="detail-map">${mapHtml(a)}</div>`:''}<div class="details-grid"><div><small>Distance</small><strong>${distance(a.km)} km</strong></div><div><small>Duration</small><strong>${duration(a.sec)}</strong></div><div><small>${a.sport==='Ride'?'Avg. speed':'Avg. pace'}</small><strong>${a.sport==='Ride'?distance(a.km*3600/a.sec)+' km/h':pace+' /km'}</strong></div></div>${a.elev!=null?`<p class="minor">Elevation gain · ${Math.round(a.elev)} m</p>`:''}${a.sample?'<p class="help settings-sep">Sample activity with an illustrated route.</p>':''}<div class="form-actions"><button class="secondary" data-remove="${esc(id)}">Delete activity</button></div>`);
}
function editGoal(){modal('Weekly distance goal',`<form id="goalForm"><label>Distance per week (km)<input name="goal" type="number" required min="0.1" max="10000" step="0.1" value="${state.goal}"></label><p class="help">Your training week starts on Monday.</p><div class="form-actions"><button class="primary">Save goal</button></div></form>`)}
function profile(){
  modal('Workspace settings',`<form id="profileForm"><label>Your name<input name="name" required maxlength="40" value="${esc(state.name)}"></label><p class="help">Your activities and settings are saved in this browser.</p><div class="form-actions"><button class="primary">Save changes</button></div></form>${state.activities.some(a=>a.sample)?'<div class="settings-sep"><button class="secondary" data-action="clearSamples">Remove sample activities</button></div>':''}`);
}
const sportOptions=selected=>['Run','Ride','Walk'].map(s=>`<option ${s===selected?'selected':''}>${s}</option>`).join('');
function logForm(mode='manual'){
  if(rec){recordPanel();return}
  const tabs=`<div class="tabs"><button class="${mode==='manual'?'on':''}" data-action="manual">Manual entry</button><button class="${mode==='gps'?'on':''}" data-action="gps">GPS recording</button></div>`;
  const fields=`<label>Activity name<input name="title" maxlength="80" required placeholder="Morning trail run"></label><label>Sport<select name="sport">${sportOptions('Run')}</select></label>`;
  if(mode==='gps'){
    modal('Record activity',tabs+`<form id="gpsForm">${fields}<p class="help">Allow location access and keep this page open while you move. Recording starts with the first GPS fix.</p><div class="form-actions"><button class="primary">${icon('pin')}Start recording</button></div></form>`);
  }else{
    modal('Log activity',tabs+`<form id="manualForm">${fields}<div class="formpair"><label>Distance (km)<input name="km" type="number" required min="0.01" step="0.01" placeholder="5.00"></label><label>Duration (minutes)<input name="minutes" type="number" required min="0.1" step="0.1" placeholder="30"></label></div><div class="formpair"><label>Date<input name="date" type="date" required max="${dayKey(new Date())}" value="${dayKey(new Date())}"></label><label>Elevation gain (m)<input name="elev" type="number" min="0" step="1" placeholder="Optional"></label></div><div class="form-actions"><button class="primary">Save activity</button></div></form>`);
  }
}
function addActivity(data){
  const record={id:crypto.randomUUID?.()||`activity-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,...data};
  state.activities.push(record);persist();dialog.close();render();notify('Activity saved');return record;
}
function arcDistance([lat1,lon1],[lat2,lon2]){
  const rad=Math.PI/180;const h=Math.sin((lat2-lat1)*rad/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
}
function recordPanel(){
  if(!rec)return;
  modal(rec.title,`<div class="meta">${icon(sportIcon(rec.sport))}${rec.sport} · GPS recording</div><div class="details-grid"><div><small>Duration</small><strong id="liveTime"></strong></div><div><small>Distance</small><strong id="liveKm"></strong></div><div><small>GPS points</small><strong id="livePoints"></strong></div></div><p class="recording" id="gpsStatus" role="status"></p><div class="form-actions spread"><button class="secondary" data-action="discardRec">Discard</button><button class="primary" data-action="finishRec" id="finishRec">Finish and save</button></div>`);updateRec();
}
function elapsed(){return rec?.start?Math.max(0,Math.floor((Date.now()-rec.start)/1000)):0}
function updateRec(){if(!rec||!byId('liveTime'))return;byId('liveTime').textContent=duration(elapsed());byId('liveKm').textContent=distance(rec.km)+' km';byId('livePoints').textContent=rec.points.length;byId('gpsStatus').textContent=rec.status;byId('finishRec').disabled=!rec.points.length||elapsed()<1}
function startRecording(title,sport){
  if(!window.isSecureContext||!navigator.geolocation){modal('GPS unavailable','<p class="help">Open Routiq over HTTPS or localhost on a device with location services enabled.</p><div class="form-actions"><button class="secondary" data-action="manual">Use manual entry</button></div>');return}
  rec={title,sport,start:0,km:0,points:[],status:'Waiting for GPS…'};recordPanel();render();
  watch=navigator.geolocation.watchPosition(pos=>{
    if(!rec)return;
    if(pos.coords.accuracy>75){rec.status='Waiting for a more accurate GPS fix…';updateRec();return}
    const point=[pos.coords.latitude,pos.coords.longitude],prev=rec.points.at(-1),delta=prev?arcDistance(prev,point):0;
    if(!prev||delta>=.006){rec.points.push(point);rec.km+=delta}
    if(!rec.start)rec.start=Date.now();rec.status='Recording · Keep this page open';updateRec();
  },error=>{
    if(!rec)return;
    if(error.code===1&&!rec.points.length){stopRecording();modal('Location access needed','<p class="help">Allow location access in your browser settings to record a route, or log the activity manually.</p><div class="form-actions"><button class="secondary" data-action="manual">Manual entry</button><button class="primary" data-action="gps">Try again</button></div>');return}
    rec.status=error.code===1?'Location permission was removed. You can save the recorded track.':'GPS signal unavailable. Waiting for a new fix…';updateRec();
  },{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  timer=setInterval(updateRec,500);
}
function stopRecording(){if(watch!==null)navigator.geolocation.clearWatch(watch);clearInterval(timer);watch=null;timer=null;rec=null;render()}
function finishRecording(){if(!rec?.points.length||elapsed()<1)return;const {title,sport,start,km,points}=rec,sec=elapsed();stopRecording();addActivity({title,sport,date:new Date(start).toISOString(),km,sec,elev:null,points})}
function confirmAction(title,description,action,label){
  modal(title,`<p class="help">${esc(description)}</p><div class="form-actions"><button class="secondary" data-action="close">Cancel</button><button class="danger" data-action="${esc(action)}">${esc(label)}</button></div>`);
}
byId('profile').addEventListener('click',profile);
byId('log').addEventListener('click',()=>logForm());
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.page){page=b.dataset.page;history.replaceState(null,'',location.pathname+location.search+(page==='Routes'?'#routes':''));render();window.scrollTo(0,0);return}
  if(b.dataset.detail){detail(b.dataset.detail);return}
  if(b.dataset.remove){confirmAction('Delete activity?','This activity will be removed from your training history.',`delete:${b.dataset.remove}`,'Delete activity');return}
  const action=b.dataset.action;
  if(action?.startsWith('delete:')){state.activities=state.activities.filter(a=>a.id!==action.slice(7));persist();dialog.close();render();notify('Activity deleted');return}
  switch(action){
    case 'close':dialog.close();break;
    case 'manual':case 'gps':logForm(action);break;
    case 'goal':editGoal();break;
    case 'profile':profile();break;
    case 'clearSamples':confirmAction('Remove sample activities?','This removes the example workouts and keeps all activities you recorded or entered.','confirmSamples','Remove samples');break;
    case 'confirmSamples':state.activities=state.activities.filter(a=>!a.sample);persist();dialog.close();render();notify('Sample activities removed');break;
    case 'finishRec':finishRecording();break;
    case 'discardRec':confirmAction('Discard recording?','The current recording will be lost.','confirmDiscard','Discard recording');break;
    case 'confirmDiscard':stopRecording();dialog.close();notify('Recording discarded');break;
  }
});
document.addEventListener('change',e=>{if(e.target.id==='period'){period=Number(e.target.value);render()}if(e.target.id==='sportFilter'){sportFilter=e.target.value;updateList()}});
document.addEventListener('input',e=>{if(e.target.id==='search'){query=e.target.value;updateList()}});
document.addEventListener('submit',e=>{
  e.preventDefault();const form=e.target,d=Object.fromEntries(new FormData(form));
  if('title' in d&&!d.title.trim()||'name' in d&&!d.name.trim()){const text=form.querySelector('input');text.setCustomValidity('Enter a name.');text.reportValidity();text.addEventListener('input',()=>text.setCustomValidity(''),{once:true});return}
  if(form.id==='manualForm'){
    const now=new Date(),date=new Date(`${d.date}T${now.toTimeString().slice(0,8)}`);addActivity({title:d.title.trim(),sport:d.sport,km:Number(d.km),sec:Math.round(Number(d.minutes)*60),date:date.toISOString(),elev:d.elev===''?null:Number(d.elev)});
  }else if(form.id==='gpsForm'){startRecording(d.title.trim(),d.sport)}
  else if(form.id==='goalForm'||form.id==='profileForm'){if(form.id==='goalForm')state.goal=Number(d.goal);else state.name=d.name.trim();persist();dialog.close();render();notify('Changes saved')}
});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
window.addEventListener('beforeunload',e=>{if(rec){e.preventDefault();e.returnValue=''}});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(paintMaps,100)});
render();


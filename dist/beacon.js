const Beacon=(()=>{
  let active=null,latestNote='',tick=null;
  const hex=buf=>Array.from(buf,b=>b.toString(16).padStart(2,'0')).join('');
  const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
  const pendingKey='routiq-beacon-stop-v1';
  function controlHtml(){
    return `<section id="beaconControl" class="beacon-control"><h3>${icon('pin')}Beacon</h3><p class="help" id="beaconMessage" role="status"></p><div id="beaconButtons"></div><p class="minor beacon-note">Keep Routiq in the foreground. Screen lock can pause updates. Links expire after two minutes without contact or after 12 hours of sharing.</p></section>`;
  }
  function renderControls(){
    if(typeof rec!=='undefined'&&rec)byId('log').innerHTML=icon('activity')+(active?.link?'Recording · Beacon on':'Recording');
    const box=byId('beaconControl');if(!box)return;
    const s=active;
    byId('beaconMessage').textContent=s?s.status:(latestNote||'Share your latest GPS position with anyone you send the link to. Keep Routiq open during your activity.');
    const mode=s?(s.link?'live':'starting'):'off';
    if(box.dataset.mode===mode)return;box.dataset.mode=mode;
    const group=byId('beaconButtons');
    if(mode==='live'){
      group.innerHTML=`<label>Read-only sharing link<input id="beaconLink" readonly></label><div class="beacon-actions"><button class="primary" data-beacon="share">Share link</button><button class="secondary" data-beacon="copy">Copy link</button><button class="textbtn" data-beacon="stop">Stop sharing</button></div>`;
      byId('beaconLink').value=s.link;
    }else if(mode==='starting'){group.innerHTML='<button class="secondary" data-beacon="stop">Cancel sharing</button>'}
    else{group.innerHTML='<button class="secondary" data-beacon="start">Turn on Beacon</button>'}
  }
  function setStatus(s,text){if(active===s&&s.status!==text){s.status=text;renderControls()}}
  async function api(action,body,origin='',keepalive=false){
    if(window.RoutiqCloud)return RoutiqCloud.beacon(action,body,origin,keepalive);
    const path=origin?origin+'/'+action:'/api/beacon/'+action;
    const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',keepalive,signal:AbortSignal.timeout(12000)});
    if(!r.ok){const e=Error('Beacon request failed');e.status=r.status;throw e}return r.json();
  }
  function pending(){
    try{return JSON.parse(sessionStorage.getItem(pendingKey)||'[]').filter(p=>p.until>Date.now())}catch{return []}
  }
  function remember(list){try{sessionStorage.setItem(pendingKey,JSON.stringify(list))}catch{}}
  async function revoke(write,viewer){
    if(!viewer)return true;
    const list=pending().filter(p=>p.write!==write);list.push({write,viewer,until:Date.now()+135000});remember(list);
    try{await api('end',{write},viewer,true);remember(pending().filter(p=>p.write!==write));return true}catch{return false}
  }
  function detach(){
    const old=active;active=null;clearInterval(tick);tick=null;return old;
  }
  async function stop(){
    const old=detach();if(!old)return;
    latestNote='Location updates stopped. Closing the sharing link…';renderControls();
    const confirmed=await revoke(old.write,old.viewer);
    if(!active){latestNote=confirmed?'Beacon is off. The previous link has ended.':'Updates stopped. Without a connection the link expires within two minutes of the last delivered update.';renderControls()}
  }
  async function publish(){
    const s=active;if(!s?.link||s.busy||!rec)return;
    const now=Date.now();
    if(now-s.attempt<5000||(!s.dirty&&now-s.attempt<15000))return;
    s.busy=true;s.attempt=now;s.dirty=false;
    try{
      const iv=crypto.getRandomValues(new Uint8Array(12)),seq=++s.seq;
      const fix=rec.lastFix;
      const plain=new TextEncoder().encode(JSON.stringify({sport:rec.sport,fix:fix?{lat:fix.lat,lon:fix.lon,accuracy:fix.accuracy,age:Math.max(0,now-fix.t)}:null}));
      const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},s.key,plain);
      if(active!==s)return;
      await api('update',{write:s.write,seq,packet:hex(iv)+hex(new Uint8Array(cipher))},s.viewer);
      setStatus(s,rec?.lastFix?'Beacon is on. Anyone with the link can see your latest GPS fix.':'Beacon is on. Waiting for your first GPS fix.');
    }catch(e){
      if(active!==s)return;
      if(e.status===410){detach();latestNote='This Beacon expired. Turn it on again to create a new link.';renderControls()}
      else setStatus(s,'Updates interrupted. Reconnecting… Your contact will see when the last position was received.');
    }finally{s.busy=false}
  }
  async function start(){
    if(!rec||active)return;
    if(!window.isSecureContext||!crypto.subtle){latestNote='Beacon needs a secure browser connection.';renderControls();return}
    const s={read:random(),write:random(),key:null,link:'',status:'Starting encrypted sharing…',attempt:0,seq:0,dirty:true,busy:false};active=s;latestNote='';renderControls();
    if(window.RoutiqCloud)s.write=s.read;
    try{
      const raw=crypto.getRandomValues(new Uint8Array(32));s.key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
      if(active!==s)return;
      let viewer;
      if(window.RoutiqCloud){
        ({viewer}=await api('start',{read:s.read}));
      }else{
        const grant=await api('start',{read:s.read,write:s.write});
        if(active!==s)return;
        viewer=grant.viewer;
        await api('start',{read:s.read,write:s.write,grant:grant.grant,expires:grant.expires},viewer);
      }
      s.viewer=viewer;
      if(active!==s){await revoke(s.write,viewer);return}
      s.link=viewer+'/#'+s.read+'.'+hex(raw);s.status='Beacon is on. Send this link to your contact.';
      renderControls();tick=setInterval(publish,1000);await publish();
    }catch{
      if(active===s){detach();latestNote='Beacon could not start. Check your connection and try again.';renderControls()}
    }
  }
  function fix(pos){
    rec.lastFix={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy,t:Math.min(Date.now(),Number(pos.timestamp)||Date.now())};
    if(active){active.dirty=true;publish()}
  }
  async function share(native){
    const s=active;if(!s?.link)return;
    try{
      if(native&&navigator.share){await navigator.share({title:'Routiq Beacon',text:'Follow my activity on Routiq.',url:s.link});return}
      await navigator.clipboard.writeText(s.link);setStatus(s,'Beacon link copied. Send it to your contact.')
    }catch(e){if(e.name!=='AbortError'&&active===s){byId('beaconLink')?.select();setStatus(s,'Select and copy the link above.')}}
  }
  document.addEventListener('click',e=>{
    const action=e.target.closest('[data-beacon]')?.dataset.beacon;
    if(action==='start')start();if(action==='stop')stop();if(action==='share'||action==='copy')share(action==='share');
  });
  function retryStops(){for(const p of pending())revoke(p.write,p.viewer)}
  window.addEventListener('online',()=>{retryStops();if(active){active.attempt=0;publish()}});
  window.addEventListener('pagehide',()=>{if(active)stop()});
  retryStops();
  return {controlHtml,renderControls,fix,stop,newRecording(){latestNote=''},isSharing:()=>Boolean(active?.link)};
})();

const RecordingMap=(()=>{
  let map,marker,area,path,previousFix,drawn=0,following=true;
  const html=`<section class="record-map-section" aria-label="Your live location"><div class="record-map-wrap" id="recordMapWrap" hidden><div id="recordMap" role="region" aria-label="Your GPS position and recorded track"></div><button type="button" id="recordFollow" aria-pressed="true">Following</button></div><p class="minor" id="recordMapInfo"></p></section>`;
  function follow(value){
    following=value;
    const button=byId('recordFollow');
    button.textContent=value?'Following':'Follow me';
    button.setAttribute('aria-pressed',String(value));
  }
  function remove(){
    if(map)map.remove();
    map=marker=area=path=previousFix=null;drawn=0;following=true;
  }
  function show(record){
    const fix=record.lastFix,container=byId('recordMap');
    if(!dialog.open||!container||!fix)return;
    const info=byId('recordMapInfo');
    if(!window.L){info.textContent='Map unavailable. GPS recording is active.';return}
    const point=L.latLng(fix.lat,fix.lon);
    if(!map){
      byId('recordMapWrap').hidden=false;
      map=L.map(container,{scrollWheelZoom:false}).setView(point,16);
      map.attributionControl.setPrefix(false);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'strict-origin',attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);
      area=L.circle(point,{color:'#bd9afb',weight:1,fillOpacity:.16,radius:fix.accuracy,interactive:false}).addTo(map);
      path=L.polyline(record.points,{color:'#c8a8ff',weight:4,interactive:false}).addTo(map);
      drawn=record.points.length;
      marker=L.circleMarker(point,{className:'rec-position',radius:9,weight:3,color:'#231f29',fillColor:'#d1f294',fillOpacity:1,interactive:false}).addTo(map);
      byId('recordFollow').onclick=()=>{follow(!following);if(following)map.panTo(marker.getLatLng(),{animate:false})};
      map.on('dragstart',()=>follow(false));container.onkeydown=e=>{if(e.key.startsWith('Arrow'))follow(false)};
    }
    if(fix!==previousFix){
      previousFix=fix;
      if(!marker.getLatLng().equals(point)){
        marker.setLatLng(point);area.setLatLng(point);
        if(following)map.panTo(point,{animate:false});
      }
      area.setRadius(fix.accuracy);
      while(drawn<record.points.length)path.addLatLng(record.points[drawn++]);
    }
    const age=Math.max(0,Math.floor((Date.now()-fix.t)/1000)),delayed=age>=45;
    const color=delayed?'#b7b2bd':'#d1f294';
    if(marker.options.fillColor!==color)marker.setStyle({fillColor:color});
    info.textContent=`${delayed?'Last known position':'Your position'} · ${age<2?'Just updated':age+'s ago'} · ±${Math.round(fix.accuracy)} m`;
  }
  return {html,show,remove};
})();

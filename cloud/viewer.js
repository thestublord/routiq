import { onValue, ref } from 'firebase/database';
import { database, beaconUrl } from './firebase.js';
(async()=>{
'use strict';
const status=document.getElementById('status'),position=document.getElementById('position');
const follow=document.getElementById('follow'),tileStatus=document.getElementById('tileStatus');
const match=location.hash.slice(1).match(/^([a-f0-9]{64})\.([a-f0-9]{64})$/);
let map=null,marker=null,accuracy=null,following=true,lastStyle='';
function setFollowing(value){
  following=value;follow.setAttribute('aria-pressed',String(value));follow.textContent=value?'Following':'Follow person';
}
function hide(){
  position.hidden=true;
  if(map){map.remove();map=null;marker=null;accuracy=null;lastStyle='';setFollowing(true)}
  document.getElementById('coords').textContent='';document.getElementById('fix').textContent='';tileStatus.textContent='';
}
function showMap(fix,delayed){
  if(!window.L){tileStatus.textContent='Map unavailable. The coordinates above still update.';return}
  const point=L.latLng(fix.lat,fix.lon);
  if(!map){
    map=L.map('liveMap',{scrollWheelZoom:false}).setView(point,16);
    map.attributionControl.setPrefix(false);
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'strict-origin',attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'});
    tiles.on('tileerror',()=>{tileStatus.textContent='Some map tiles could not load. The position marker still updates.'});
    tiles.on('loading',()=>{tileStatus.textContent=''});tiles.addTo(map);
    accuracy=L.circle(point,{className:'beacon-accuracy',radius:fix.accuracy,weight:1,color:'#bd9afb',fillOpacity:.16,interactive:false}).addTo(map);
    marker=L.circleMarker(point,{className:'beacon-marker',radius:9,weight:3,color:'#231f29',fillOpacity:1,interactive:false}).addTo(map);
    map.on('dragstart',()=>setFollowing(false));
  }
  if(!marker.getLatLng().equals(point)){
    marker.setLatLng(point);accuracy.setLatLng(point);
    if(following)map.panTo(point,{animate:false});
  }
  if(accuracy.getRadius()!==fix.accuracy)accuracy.setRadius(fix.accuracy);
  const style=delayed?'#b7b2bd':'#d1f294';
  if(style!==lastStyle){marker.setStyle({fillColor:style});lastStyle=style}
}
follow.addEventListener('click',()=>{setFollowing(!following);if(map&&following)map.panTo(marker.getLatLng(),{animate:false})});
document.getElementById('liveMap').addEventListener('keydown',e=>{if(e.key.startsWith('Arrow'))setFollowing(false)});
if(!match){status.textContent='Open the full Beacon link sent by the person sharing their activity.';return}
const bytes=hex=>Uint8Array.from(hex.match(/../g),pair=>parseInt(pair,16));
const key=await crypto.subtle.importKey('raw',bytes(match[2]),'AES-GCM',false,['decrypt']);
let fix=null,sport='',serverOffset=0,lastReply=0,failed=false,ended=false,busy=false,seq=-1;
const stopClockSync=onValue(ref(database,'.info/serverTimeOffset'),snapshot=>{serverOffset=Number(snapshot.val()) || 0});
function display(){
  if(ended)return;
  if(!lastReply){hide();status.textContent=failed?'Unable to connect. Retrying…':'Connecting to Beacon…';return}
  const time=Date.now();
  if(!fix){hide();status.textContent=failed?'Connection interrupted. Retrying…':'Beacon is on. Waiting for a GPS fix.';return}
  const age=Math.max(0,time+serverOffset-fix.t);
  if(age>=120000){hide();status.textContent='GPS update paused. Waiting for a fresh position.';return}
  status.textContent=failed||time-lastReply>16000?'Connection interrupted. Showing the last received position.':age>=45000?'GPS update delayed. Showing the last known position.':sport+' · Sharing location';
  position.hidden=false;
  document.getElementById('coords').textContent=fix.lat.toFixed(5)+', '+fix.lon.toFixed(5);
  document.getElementById('fix').textContent='GPS fix '+Math.floor(age/1000)+' seconds ago · accuracy about '+Math.round(fix.accuracy)+' m';
  showMap(fix,failed||time-lastReply>16000||age>=45000);
}
async function poll(){
  if(ended||busy)return;busy=true;
  try{
    const res=await fetch(beaconUrl(match[1],'/state'),{cache:'no-store',signal:AbortSignal.timeout(9000)});
    if([401,403,404].includes(res.status)){ended=true;fix=null;hide();status.textContent='This Beacon has ended.';clearInterval(refresh);clearInterval(clock);stopClockSync();return}
    if(!res.ok)throw Error();
    const record=await res.json();
    if(!record || record.ended)throw Error();
    const now=Date.now()+serverOffset;
    const data={...record,received:record.updated};
    if(data.packet&&seq!==data.seq){
      const packet=bytes(data.packet);
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:packet.slice(0,12)},key,packet.slice(12));const value=JSON.parse(new TextDecoder().decode(plain));
      const p=value.fix;
      fix=p&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180&&Number.isFinite(p.accuracy)&&p.accuracy>=0&&Number.isFinite(p.age)&&p.age>=0?{...p,t:data.received-p.age}:null;
      sport=value.sport;seq=data.seq;
    }
    lastReply=Date.now();failed=false;
  }catch{failed=true}finally{busy=false;display()}
}
const refresh=setInterval(poll,5000),clock=setInterval(display,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){display();poll()}});
await poll();
})().catch(()=>{document.getElementById("status").textContent="This browser could not open the encrypted Beacon link."});

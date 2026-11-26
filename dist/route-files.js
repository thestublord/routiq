const RouteFiles=(()=>{
  function valid(route){
    return route?.points?.length>1&&route.points.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=90);
  }
  function longitude(n){return ((n+180)%360+360)%360-180}
  function gpx(route){
    const title=esc(route.title),sport=esc(route.sport);
    const coords=route.points.map(([lat,lon])=>`      <trkpt lat="${lat.toFixed(7)}" lon="${longitude(lon).toFixed(7)}"/>`).join('\n');
    const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Routiq" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${title}</name></metadata>\n  <trk><name>${title}</name><type>${sport}</type><trkseg>\n${coords}\n  </trkseg></trk>\n</gpx>\n`;
    return new Blob([xml],{type:'application/gpx+xml'});
  }
  function routeMap(route,graph){
    const width=600,height=744,box={x:24,y:126,w:552,h:485};
    const canvas=document.createElement('canvas');canvas.width=width*3;canvas.height=height*3;
    const ctx=canvas.getContext('2d');ctx.scale(3,3);
    const ink='#292332',purple='#6745a7',soft='#655f6c';
    function text(value,x,y,size,color=ink,weight=500,maxWidth){
      ctx.fillStyle=color;ctx.font=`${weight} ${size}px "Segoe UI",Arial,sans-serif`;
      ctx.fillText(value,x,y,maxWidth);
    }
    const first=route.points[0],last=route.points.at(-1);
    const east=111195*Math.max(.00001,Math.cos(first[0]*Math.PI/180));
    function metres([lat,lon]){return [longitude(lon-first[1])*east,(first[0]-lat)*111195]}
    const path=route.points.map(metres);
    let minX=0,maxX=0,minY=0,maxY=0;
    for(const [x,y] of path){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
    const scale=Math.min((box.w-76)/Math.max(20,maxX-minX),(box.h-88)/Math.max(20,maxY-minY));
    const cx=box.x+box.w/2-(maxX+minX)*scale/2,cy=box.y+box.h/2-(maxY+minY)*scale/2;
    const pixels=([x,y])=>[cx+x*scale,cy+y*scale];
    const within=([x,y],pad=0)=>x>=box.x+pad&&x<=box.x+box.w-pad&&y>=box.y+pad&&y<=box.y+box.h-pad;
    function stroke(line,color,weight){
      ctx.beginPath();line.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
      ctx.strokeStyle=color;ctx.lineWidth=weight;ctx.stroke();
    }
    ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
    text('routiq',24,32,22,purple,750);
    text('OFFLINE ROUTE MAP',411,30,13,soft,650,165);
    text(route.title,24,75,31,ink,650,552);
    text(`${route.sport}   ·   ${distance(route.km)} km   ·   ${route.mode==='Generate'?route.shape:route.mode==='Draw route'?'Custom route':'Recorded track'}`,24,105,16,soft,500,552);
    ctx.fillStyle='#f3f2ed';ctx.fillRect(box.x,box.y,box.w,box.h);
    ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.w,box.h);ctx.clip();
    ctx.lineJoin='round';ctx.lineCap='round';
    const labels=[],names=new Set();
    for(const [name,,ids] of graph?.paths||[]){
      const line=ids.map(id=>pixels(metres(graph.points[id])));
      if(!line.some(p=>within(p)))continue;
      stroke(line,'#b8b5b0',1.3);
      const spot=line.find((p,i)=>i>line.length/4&&within(p,50));
      if(!spot||names.has(name)||/^unnamed|^shared use path$/i.test(name))continue;
      if(labels.length<7&&!labels.some(v=>Math.abs(v.spot[0]-spot[0])<110&&Math.abs(v.spot[1]-spot[1])<42)){
        labels.push({name,spot});names.add(name);
      }
    }
    for(const {name,spot:[x,y]} of labels){
      ctx.font='500 12px "Segoe UI",Arial,sans-serif';ctx.strokeStyle='#f3f2ed';ctx.lineWidth=3;ctx.strokeText(name,x-34,y-5,100);text(name,x-34,y-5,12,soft,500,100);
    }
    const track=path.map(pixels);
    stroke(track,'#fff',7);stroke(track,purple,3.8);
    function dot([x,y],color){
      ctx.beginPath();ctx.arc(x,y,6.5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=ink;ctx.stroke();
    }
    const closed=arcDistance(first,last)<.015;
    if(!closed)dot(track.at(-1),'#fca477');dot(track[0],'#bce68d');
    const sx=box.x+14,sy=box.y+box.h-15;
    const step=10**Math.floor(Math.log10(84/scale));
    const scalem=[5,2,1].map(n=>step*n).find(n=>n*scale<=84)||step;
    ctx.fillStyle='#fffffff0';ctx.fillRect(sx-5,sy-24,Math.max(60,scalem*scale+10),30);
    text(scalem>=1000?`${+(scalem/1000).toFixed(2)} km`:`${+scalem.toPrecision(3)} m`,sx,sy-8,11);
    stroke([[sx,sy-4],[sx,sy],[sx+scalem*scale,sy],[sx+scalem*scale,sy-4]],ink,1.5);
    text('N ↑',box.x+box.w-32,box.y+21,13,ink,650);ctx.restore();
    const position=p=>`${p[0].toFixed(5)}, ${longitude(p[1]).toFixed(5)}`;
    text(`${closed?'Start / finish':'Start'}   ${position(first)}`,24,642,15,ink,600);
    if(!closed)text(`Finish   ${position(last)}`,24,666,15,ink,600);
    text(route.mode==='Draw route'&&!route.snap?'Straight-line sketch. Verify each connection on the ground.':'Purple line shows the route. Green marks the start.',24,698,13,soft,500,550);
    text(graph?'Mapped paths · City of Scottsdale   |   WGS84 coordinates':'Route geometry · WGS84 coordinates',24,721,12,soft);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Map image unavailable.')),'image/png'));
  }
  let release=()=>{};
  async function open(route,graph){
    if(!valid(route)){notify('This route needs at least two GPS points to download.');return}
    release();
    modal('Download route',`<p class="download-title">${esc(route.title)} · ${distance(route.km)} km</p><div class="route-downloads"><a id="downloadMap" aria-disabled="true"><strong>Offline map (.png)</strong><span>Open in Photos or Files without a connection.</span></a><a id="downloadTrack"><strong>GPS track (.gpx)</strong><span>Import the route into a compatible navigation app.</span></a></div><p class="minor" id="exportState" role="status">Preparing map…</p>`);
    const urls=[],mapLink=byId('downloadMap'),trackLink=byId('downloadTrack');
    const fileName=route.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,' ').trim().slice(0,80)||'Routiq route';
    const attach=(el,blob,ext)=>{const url=URL.createObjectURL(blob);urls.push(url);el.href=url;el.download=`${fileName}.${ext}`;el.removeAttribute('aria-disabled')};
    const cleanup=()=>{for(const url of urls)URL.revokeObjectURL(url);dialog.removeEventListener('close',cleanup);release=()=>{}};
    release=cleanup;dialog.addEventListener('close',cleanup);
    attach(trackLink,gpx(route),'gpx');
    try{
      const network=await graph;
      if(!mapLink.isConnected||!dialog.open)return;
      const blob=await routeMap(route,network);
      if(!mapLink.isConnected||!dialog.open)return;
      attach(mapLink,blob,'png');byId('exportState').textContent='';
    }catch{if(mapLink.isConnected)byId('exportState').textContent='The map image could not be prepared. You can still download the GPS track.'}
  }
  return {open};
})();

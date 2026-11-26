// The sample routes use illustrated terrain. Recorded tracks use their GPS coordinates.
const RouteMap = (() => {
  const palettes = [[47,42,58],[36,49,48],[49,43,37]];
  const terrain = new Map();
  const route = [[191,194],[199,184],[198,174],[210,171],[218,158],[233,155],[241,144],[239,134],[253,126],[270,124],[278,113],[297,109],[305,101],[321,97],[333,82],[350,81],[366,66],[382,61],[391,65],[399,78],[415,80],[421,90],[435,95],[440,108],[450,110],[456,122],[447,132],[444,141],[430,143],[421,151],[402,147],[389,153],[383,167],[363,164],[351,170],[337,169],[320,179],[303,176],[292,183],[280,180],[261,191],[242,186],[228,196],[211,197],[201,202],[191,194]];
  function elevation(x,y){
    const bend=18*Math.sin(y*.019+x*.008)+12*Math.cos(x*.025-y*.012);
    const u=x+bend, v=y+18*Math.sin(x*.018)+7*Math.sin(y*.034);
    return 28*Math.sin(u*.025+v*.021)+20*Math.sin(u*.017-v*.038)+11*Math.cos(u*.045+v*.027)+7*Math.sin(x*.071+y*.036)+3*Math.cos(u*.105-v*.066);
  }
  function texture(kind){
    if(terrain.has(kind)) return terrain.get(kind);
    const c=document.createElement('canvas'); c.width=700;c.height=310;
    const ctx=c.getContext('2d'), img=ctx.createImageData(c.width,c.height), base=palettes[kind%3];
    const heights=new Float32Array(c.width*c.height);
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){heights[y*c.width+x]=elevation(x+kind*86,y+kind*49)}
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
      const i=y*c.width+x,h=heights[i],dx=x? h-heights[i-1]:0,dy=y?h-heights[i-c.width]:0;
      const interval=5.5,nearest=Math.abs(h-Math.round(h/interval)*interval);
      const edge=Math.max(0,1-nearest/(.39+Math.hypot(dx,dy)*.42));
      const major=Math.round(h/interval)%5===0;
      const shade=(dx+dy)*2.1+h*.075+edge*(major?31:20)+((x*19+y*37+x*y)%7)*.23;
      for(let k=0;k<3;k++)img.data[4*i+k]=base[k]+shade;
      img.data[4*i+3]=255;
    }
    ctx.putImageData(img,0,0);ctx.lineWidth=.85;
    for(let k=0;k<5;k++){
      ctx.beginPath();ctx.setLineDash(k%2?[3,4]:[]);ctx.strokeStyle=k%2?'#bbb0c477':'#aaa0b64f';
      for(let x=-5;x<710;x+=3){const y=45+k*58+28*Math.sin(x*.014+k)+14*Math.sin(x*.037+k*2)+7*Math.cos(x*.066-k);if(x<0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke();
    }
    terrain.set(kind,c);return c;
  }
  function pointsFor(activity){
    if(activity.points?.length){
      const points=activity.points, lat=points[0][0]*Math.PI/180;
      const projected=points.map(([y,x])=>[x*Math.cos(lat),-y]);
      let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
      for(const [x,y] of projected){xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y)}
      const scale=Math.min(310/Math.max(xmax-xmin,.00001),185/Math.max(ymax-ymin,.00001));
      return projected.map(([x,y])=>[350+(x-(xmin+xmax)/2)*scale,155+(y-(ymin+ymax)/2)*scale]);
    }
    const k=activity.map??0;
    return route.map(([x,y])=>[x+26+(k?17*Math.sin(y*.038*k):0),y+18+(k?15*Math.sin(x*.034*k):0)]);
  }
  function draw(canvas,activity){
    const box=canvas.getBoundingClientRect(); if(!box.width||!box.height)return;
    const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    const thumb=box.width<100,hero=!!canvas.closest('.hero-map');
    const s=thumb?Math.min(w/340,h/190):Math.min(w/(hero?550:505),h/(hero?235:247));
    const midx=hero?343:350,midy=153,offset=w/2-midx*s;
    ctx.fillStyle='#29272e';ctx.fillRect(0,0,w,h);ctx.translate(offset,h/2-midy*s);ctx.scale(s,s);
    if(activity.sample){
      const bg=texture(activity.map??0);
      const pattern=ctx.createPattern(bg,'repeat');ctx.fillStyle=pattern;ctx.fillRect(-2000,-2000,4000,4000);
      if(!thumb){
        ctx.textAlign='center';ctx.font='600 8px "Segoe UI",sans-serif';ctx.fillStyle='#b9afc1';
        const labels=[['P I N E   R I D G E',298,48],['S U M M I T   T R A I L',530,192],['N O R T H   F O R K',221,256]];
        for(const [label,x,y] of labels){ctx.save();ctx.translate(x,y);ctx.rotate(-.12);ctx.fillText(label,0,0);ctx.restore()}
      }
    }else{
      ctx.strokeStyle='#3d3a45';ctx.lineWidth=.6;ctx.beginPath();
      for(let i=-1000;i<1500;i+=20){ctx.moveTo(i,-1000);ctx.lineTo(i,1500);ctx.moveTo(-1000,i);ctx.lineTo(1500,i)}ctx.stroke();
    }
    const pts=pointsFor(activity);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.lineWidth=thumb?10:4.8;ctx.strokeStyle='#24222dc9';ctx.stroke();ctx.lineWidth=thumb?5.5:2.65;ctx.strokeStyle=activity.map===1?'#b4cebb':activity.map===2?'#d6b99d':'#d3b5ff';ctx.stroke();
    const [x,y]=pts[0];ctx.beginPath();ctx.arc(x,y,thumb?7:5.6,0,2*Math.PI);ctx.fillStyle='#c2f293';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#373c31';ctx.stroke();
    if(!activity.sample&&pts.length>1){const end=pts.at(-1);ctx.beginPath();ctx.arc(end[0],end[1],4,0,2*Math.PI);ctx.fillStyle='#e6d5ff';ctx.fill()}
  }
  return {draw};
})();

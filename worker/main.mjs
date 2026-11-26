const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export default {
  async fetch(request,env){
    const url=new URL(request.url),pathname=url.pathname;
    if(pathname.startsWith('/api/beacon/')){
      const action=pathname.slice('/api/beacon/'.length);
      if(request.method!=='POST'||action!=='start')return json({},404);
      if(request.headers.get('origin')!==url.origin&&request.headers.get('origin')!==env.ROUTIQ_ORIGIN)return json({},403);
      if(!env.BEACON_INTERNAL_KEY||!env.BEACON_ORIGIN)return json({error:'Beacon is unavailable.'},503);
      if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length'))>2500)return json({},400);
      const body=await request.text();if(body.length>2500)return json({},400);
      let data;try{data=JSON.parse(body)}catch{return json({},400)}
      if(![data?.read,data?.write].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))||data.read===data.write)return json({},400);
      try{
        const expires=Date.now()+60000,encoder=new TextEncoder();
        const key=await crypto.subtle.importKey('raw',encoder.encode(env.BEACON_INTERNAL_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
        const sig=await crypto.subtle.sign('HMAC',key,encoder.encode([data.read,data.write,expires].join('.')));
        return json({viewer:env.BEACON_ORIGIN,expires,grant:Array.from(new Uint8Array(sig),b=>b.toString(16).padStart(2,'0')).join('')});
      }catch{return json({},503)}
    }
    if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405});
    const name=pathname==='/'?'/index.html':pathname;
    if(!Object.hasOwn(STATIC_FILES,name))return new Response('Page not found',{status:404});
    const [type,raw]=STATIC_FILES[name];
    const body=request.method==='HEAD'?null:type==='image/png'?Uint8Array.from(atob(raw),c=>c.charCodeAt(0)):raw;
    return new Response(body,{headers:{'Content-Type':type,'Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff'}});
  }
};

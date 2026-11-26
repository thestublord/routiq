const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export default {
  async fetch(request,env){
    const url=new URL(request.url),pathname=url.pathname;
    if(pathname.startsWith('/api/beacon/')){
      const action=pathname.slice('/api/beacon/'.length);
      if(request.method!=='POST'||!['start','update','end'].includes(action))return json({},404);
      if(request.headers.get('origin')!==url.origin&&request.headers.get('origin')!==env.ROUTIQ_ORIGIN)return json({},403);
      if(!env.BEACON_INTERNAL_KEY||!env.BEACON_ORIGIN)return json({error:'Beacon is unavailable.'},503);
      if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length'))>2500)return json({},400);
      const body=await request.text();if(body.length>2500)return json({},400);
      try{
        const result=await fetch(env.BEACON_ORIGIN+'/'+action,{method:'POST',redirect:'error',headers:{'Authorization':'Bearer '+env.BEACON_INTERNAL_KEY,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(8500)});
        if(!result.ok)return json({},result.status);
        return json(action==='start'?{viewer:env.BEACON_ORIGIN}:await result.json());
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

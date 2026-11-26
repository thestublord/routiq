/* Coordinates are [latitude, longitude]. Distances inside the graph are metres. */
class TrailNetwork {
  constructor(data) {
    this.points=data.vertices.map(([lat,lon])=>[lat/1e5,lon/1e5]);
    this.paths=data.paths;
    this.heat=data.heat;
    this.samples=data.samples;
    this.date=data.date;
    this.links=this.points.map(()=>[]);
    const counts=new Map(data.heat.map(([y,x,n])=>[`${y},${x}`,n]));
    this.density=this.points.map(([lat,lon])=>{
      const y=Math.floor(lat*1000),x=Math.floor(lon*1000);
      let count=counts.get(`${y},${x}`)||0;
      for(const [dy,dx] of [[0,1],[0,-1],[1,0],[-1,0]])count+=(counts.get(`${y+dy},${x+dx}`)||0)*.22;
      return Math.min(1,Math.log1p(count)/Math.log(45));
    });
    data.paths.forEach(([,access,ids],line)=>{
      for(let i=1;i<ids.length;i++){
        const a=ids[i-1],b=ids[i],metres=TrailNetwork.metres(this.points[a],this.points[b]);
        if(!metres)continue;
        this.links[a].push({to:b,metres,access,line});this.links[b].push({to:a,metres,access,line});
      }
    });
  }
  static metres(a,b){
    return Math.hypot((a[0]-b[0])*111195,(a[1]-b[1])*111195*Math.cos((a[0]+b[0])*Math.PI/360));
  }
  nearest(point,sport,max=300){
    let id=-1,best=max;const mask=sport==='Ride'?2:1;
    this.points.forEach((p,i)=>{
      if(Math.abs(p[0]-point[0])*111195>best||!this.links[i].some(e=>e.access&mask))return;
      const d=TrailNetwork.metres(p,point);if(d<best){best=d;id=i}
    });
    return id;
  }
  tree(start,sport,{target=Infinity,limit=Infinity,popular=false,phase=null}={}){
    const n=this.points.length,cost=new Float64Array(n).fill(Infinity),length=new Float64Array(n),heat=new Float64Array(n),parent=new Int32Array(n).fill(-1);
    const heap=[],mask=sport==='Ride'?2:1;
    function push(id,c){
      let i=heap.length;heap.push([id,c]);
      while(i>0){const j=(i-1)>>1;if(heap[j][1]<=c)break;heap[i]=heap[j];i=j}
      heap[i]=[id,c];
    }
    function pop(){
      const top=heap[0],tail=heap.pop();if(heap.length){let i=0;
        while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1][1]<heap[j][1])j++;if(heap[j][1]>=tail[1])break;heap[i]=heap[j];i=j}
        heap[i]=tail;
      }return top;
    }
    cost[start]=0;push(start,0);
    while(heap.length){
      const [id,c]=pop();if(c!==cost[id])continue;if(id===target)break;
      for(const edge of this.links[id]){
        if(!(edge.access&mask))continue;
        const j=edge.to,d=edge.metres,newLength=length[id]+d;if(newLength>limit)continue;
        const h=(this.density[id]+this.density[j])/2;
        let factor=popular?1-.35*h:1;
        if(phase!==null){const [lat,lon]=this.points[j];factor*=1+.21*Math.sin(lat*310+phase)*Math.cos(lon*310-phase)}
        const next=c+d*factor;
        if(next<cost[j]){cost[j]=next;parent[j]=id;length[j]=newLength;heat[j]=heat[id]+h*d;push(j,next)}
      }
    }
    return {cost,parent,length,heat};
  }
  chain(to,parent){
    const ids=[];for(let i=to;i!==-1;i=parent[i])ids.push(i);return ids.reverse();
  }
  between(a,b,sport){
    if(a===b)return [a];
    const tree=this.tree(a,sport,{target:b});
    if(tree.parent[b]===-1)throw Error('Those waypoints are on disconnected paths for this sport. Choose a closer path or use straight lines.');
    return this.chain(b,tree.parent);
  }
  generate(start,sport,km,shape,popular,variation=0){
    const target=km*1000,mask=sport==='Ride'?2:1;
    let best=null;
    for(let attempt=0;attempt<4;attempt++){
      const phase=(variation*3+attempt)*1.83;
      const tree=this.tree(start,sport,{limit:target*.94,popular,phase});
      const {parent,length,heat}=tree;
      const evaluate=(ids,dist,density,stem=0)=>{
        const error=Math.abs(dist-target)/target;
        if(error>.45)return;
        const score=error*(popular?1.7:4)+(popular?(1-density)*.34:0)+stem*.27;
        if(!best||score<best.score)best={score,km:dist/1000,points:ids.map(id=>this.points[id]),density};
      };
      if(shape==='Out and back'){
        let candidate=null;
        for(let i=0;i<parent.length;i++){
          if(parent[i]===-1)continue;
          const d=length[i]*2,h=heat[i]/length[i],error=Math.abs(d-target)/target;
          if(error>.45)continue;
          const score=error*(popular?1.7:4)+(popular?(1-h)*.34:0);
          if(!candidate||score<candidate.score)candidate={id:i,d,h,score};
        }
        if(candidate){const path=this.chain(candidate.id,parent);evaluate(path.concat(path.slice(0,-1).reverse()),candidate.d,candidate.h)}
      }else{
        for(let i=0;i<parent.length;i++){
          if(parent[i]===-1)continue;
          for(const e of this.links[i]){
            const j=e.to;if(j<=i||parent[j]===-1||parent[j]===i||parent[i]===j||!(e.access&mask))continue;
            const d=length[i]+length[j]+e.metres;if(Math.abs(d-target)>target*.45)continue;
            const a=this.chain(i,parent),b=this.chain(j,parent);
            let k=0;while(k<Math.min(a.length,b.length)&&a[k]===b[k])k++;
            const stem=2*length[a[k-1]]/d;if(stem>.48)continue;
            evaluate(a.concat(b.reverse()),d,(heat[i]+heat[j]+e.metres*(this.density[i]+this.density[j])/2)/d,stem);
          }
        }
      }
    }
    if(!best)throw Error('No matching route from this start. Try another distance, a different start, or an out-and-back.');
    return best;
  }
}

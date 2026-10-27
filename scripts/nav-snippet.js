// ===== LIVE MAP + AUTONOMOUS PATHFINDING (roads and sidewalks, not scripted loops) =====
const MONAS={lat:-6.1753924,lng:106.827153},MPU=3.15;
const MLNG=111320*Math.cos(MONAS.lat*Math.PI/180);
function w2ll(x,z){return[MONAS.lat-z*MPU/110540,MONAS.lng+x*MPU/MLNG]}
function ll2w(lat,lng){return[(lng-MONAS.lng)*MLNG/MPU,(MONAS.lat-lat)*110540/MPU]}
function ll2tx(lat,lng,z){const n=2**z,s=Math.sin(lat*Math.PI/180);return[(lng+180)/360*n,(1-Math.log((1+s)/(1-s))/(2*Math.PI))/2*n]}
function t2ll(x,y,z){const n=2**z;return[Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI,x/n*360-180]}
let GKEY='';try{GKEY=localStorage.getItem('jp_gkey')||''}catch(e){}
const MC={google:0,sess:'',err:'',mode:'roadmap'};
function tileUrl(z,x,y){
 if(MC.google&&MC.sess)return 'https://tile.googleapis.com/v1/2dtiles/'+z+'/'+x+'/'+y+'?session='+encodeURIComponent(MC.sess)+'&key='+encodeURIComponent(GKEY);
 if(MC.mode==='satellite')return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'+z+'/'+y+'/'+x;
 return 'https://basemaps.cartocdn.com/rastertiles/voyager/'+z+'/'+x+'/'+y+'.png';
}
let TGEN=1;
function wipeTiles(){TGEN++;const h=$('ltile');if(h)while(h.firstChild)h.removeChild(h.firstChild)}
function gSession(){
 MC.google=0;MC.sess='';MC.err='';wipeTiles();
 if(!GKEY)return;
 fetch('https://tile.googleapis.com/v1/createSession?key='+encodeURIComponent(GKEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mapType:MC.mode==='satellite'?'satellite':'roadmap',language:'id',region:'ID'})})
  .then(function(r){if(!r.ok)return r.text().then(function(t){throw new Error(t.slice(0,180)||('HTTP '+r.status))});return r.json()})
  .then(function(j){MC.sess=j.session;MC.google=1;MC.err='';wipeTiles()})
  .catch(function(e){MC.google=0;MC.sess='';MC.err='Google key was not accepted ('+(e.message||'error')+'). Showing the live Jakarta map instead.';wipeTiles()});
}
gSession();
let ND=[],SW=[];
function navLink(nodes,a,b){
 if(a==null||b==null||a===b)return;
 if(nodes[a].e.some(function(e){return e.t===b}))return;
 const l=H(nodes[a].x-nodes[b].x,nodes[a].z-nodes[b].z)||.1;
 nodes[a].e.push({t:b,l:l});nodes[b].e.push({t:a,l:l});
}
function hashLink(nodes,maxD,diffRoad){
 const cell=maxD,g=new Map();
 for(let i=0;i<nodes.length;i++){
  const n=nodes[i],cx=n.x/cell|0,cz=n.z/cell|0;
  for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++){
   const arr=g.get(x+'_'+z);if(!arr)continue;
   for(let k=0;k<arr.length;k++){const j=arr[k];if(diffRoad&&nodes[j].r===n.r)continue;
    const d=H(nodes[j].x-n.x,nodes[j].z-n.z);if(d<maxD&&d>.8)navLink(nodes,i,j)}
  }
  const key=cx+'_'+cz;if(!g.has(key))g.set(key,[]);g.get(key).push(i);
 }
}
function buildNav(){
 ND=[];SW=[];
 const STEP=34;
 RDS.forEach(function(r,ri){
  const cnt=Math.max(2,Math.round(r.len/STEP)),ids=[];
  for(let i=0;i<=cnt;i++){
   if(r.lp&&i===cnt)break;
   const s=Math.min(r.len-.05,(i/cnt)*r.len),q=posAt(r,s,1,0),id=ND.length;
   ND.push({x:q[0],z:q[1],e:[],r:ri});ids.push(id);
  }
  for(let i=1;i<ids.length;i++)navLink(ND,ids[i-1],ids[i]);
  if(r.lp&&ids.length>2)navLink(ND,ids[ids.length-1],ids[0]);
  [-1,1].forEach(function(side){
   let prev=null;
   for(let i=0;i<=cnt;i++){
    if(r.lp&&i===cnt)break;
    const s=Math.min(r.len-.05,(i/cnt)*r.len),q=posAt(r,s,1,side*(r.hw+3.3));
    if(inB(q[0],q[1])){prev=null;continue}
    const id=SW.length;SW.push({x:q[0],z:q[1],e:[],r:ri,side:side});
    if(prev!=null&&H(SW[prev].x-q[0],SW[prev].z-q[1])<STEP*1.8)navLink(SW,prev,id);
    if(i%3===0){
     const opp=posAt(r,s,1,-side*(r.hw+3.3));
     if(!inB(opp[0],opp[1])&&H(opp[0]-q[0],opp[1]-q[1])<r.hw*2+12){
      const oid=SW.length;SW.push({x:opp[0],z:opp[1],e:[],r:ri,side:-side});
      navLink(SW,id,oid);
     }
    }
    prev=id;
   }
  });
 });
 hashLink(ND,26,true);hashLink(SW,16,true);
}
function nearestN(x,z,nodes){
 let b=0,bd=1e18;if(!nodes.length)return 0;
 for(let i=0;i<nodes.length;i++){const d=H(nodes[i].x-x,nodes[i].z-z);if(d<bd){bd=d;b=i}}return b}
function astar(nodes,s,g){
 const N=nodes.length;if(!N||s<0||g<0||s>=N||g>=N)return null;if(s===g)return[s];
 const gs=new Float64Array(N);gs.fill(1e15);const prev=new Int32Array(N);prev.fill(-1);const done=new Uint8Array(N);const open=[];
 const heur=function(i){return H(nodes[i].x-nodes[g].x,nodes[i].z-nodes[g].z)};
 const push=function(i){const item=[gs[i]+heur(i),i];open.push(item);let k=open.length-1;while(k){const p=(k-1)>>1;if(open[p][0]<=open[k][0])break;const t=open[p];open[p]=open[k];open[k]=t;k=p}};
 const pop=function(){const top=open[0],last=open.pop();if(open.length){open[0]=last;let k=0;for(;;){const l=k*2+1,r=l+1;let m=k;if(l<open.length&&open[l][0]<open[m][0])m=l;if(r<open.length&&open[r][0]<open[m][0])m=r;if(m===k)break;const t=open[k];open[k]=open[m];open[m]=t;k=m}}return top};
 gs[s]=0;push(s);let steps=0;
 while(open.length&&steps++<N*14){
  const cur=pop(),f=cur[0],u=cur[1];if(done[u])continue;if(f>gs[u]+heur(u)+1e-4)continue;done[u]=1;if(u===g)break;
  const es=nodes[u].e;for(let i=0;i<es.length;i++){const e=es[i];if(done[e.t])continue;const ng=gs[u]+e.l;if(ng<gs[e.t]){gs[e.t]=ng;prev[e.t]=u;push(e.t)}}
 }
 if(!done[g])return null;const path=[];for(let u=g;u!==s&&u>=0&&path.length<N;u=prev[u])path.push(u);path.push(s);path.reverse();return path;
}
function lanePt(ax,az,bx,bz,off){
 const dx=bx-ax,dz=bz-az,l=H(dx,dz)||1,fx=dx/l,fz=dz/l;return[bx+fz*off,bz-fx*off];
}
let PKT=0;
function wakeParked(){
 PKT+=1;if(PKT<90)return;PKT=0;
 const parked=tr.filter(function(c){return c.pk&&!c.dyn});
 if(parked.length<10||R()>.55)return;
 const c=parked[(R()*parked.length)|0];
 if(H(c.x-(F.on?F.x:P.x),c.z-(F.on?F.z:P.z))<14)return;
 c.pk=0;c.home=null;c.v=9+R()*6;c.path=null;c.pi=0;c.dyn=0;c.idle=0;
}
function followPath(c){
 if(!ND.length)return null;
 if(!c.path||c.pi>=c.path.length){
  const s=nearestN(c.x,c.z,ND);let g=s,guard=0;
  while(guard++<8){const t=(R()*ND.length)|0;if(H(ND[t].x-c.x,ND[t].z-c.z)>110){g=t;break}if(H(ND[t].x-c.x,ND[t].z-c.z)>H(ND[g].x-c.x,ND[g].z-c.z))g=t}
  c.path=astar(ND,s,g)||[s];c.pi=0;
 }
 while(c.pi<c.path.length&&H(ND[c.path[c.pi]].x-c.x,ND[c.path[c.pi]].z-c.z)<8)c.pi++;
 if(c.pi>=c.path.length){c.path=null;return null}
 const i0=Math.max(0,c.pi-1),a=ND[c.path[i0]],b=ND[c.path[c.pi]];
 const rd=RDS[b.r]||RDS[a.r],off=(rd?rd.hw:8)*.42;
 let tp=lanePt(a.x,a.z,b.x,b.z,off);
 if(c.pi+1<c.path.length){const d=ND[c.path[c.pi+1]],tp2=lanePt(b.x,b.z,d.x,d.z,off);tp=[tp[0]*.4+tp2[0]*.6,tp[1]*.4+tp2[1]*.6]}
 return tp;
}
function carCruise(c,dt){
 const tp=followPath(c);if(!tp)return;
 const dx=tp[0]-c.x,dz=tp[1]-c.z,dist=H(dx,dz)||1,sp=Math.min(c.v||12,Math.max(4,dist));
 c.th=Math.atan2(dx,dz);c.vx=dx/dist*sp;c.vz=dz/dist*sp;c.x+=c.vx*dt;c.z+=c.vz*dt;
}
function carThink(c,dt){
 if(!ND.length||c.dyn||c.pk)return;
 const tp=followPath(c);if(!tp)return;
 const dx=tp[0]-c.x,dz=tp[1]-c.z;let df=Math.atan2(dx,dz)-c.th;df=Math.atan2(SN(df),CS(df));
 const fx=SN(c.th),fz=CS(c.th);let ahead=99,side=0;
 for(let i=0;i<tr.length;i++){const o=tr[i];if(o===c)continue;const ox=o.x-c.x,oz=o.z-c.z,dd=H(ox,oz);if(dd<1e-3||dd>16)continue;
  const fwd=ox*fx+oz*fz;if(fwd>0&&fwd<16&&dd<6.2&&fwd<ahead)ahead=fwd;
  if(dd<7){const rt=ox*fz-oz*fx;side-=Math.sign(rt||1)*(7-dd)*.08}}
 if(!F.on){const ox=P.x-c.x,oz=P.z-c.z,dd=H(ox,oz),fwd=ox*fx+oz*fz;if(fwd>0&&fwd<14&&dd<6)ahead=Math.min(ahead,fwd)}
 let thr=1;if(ahead<4.2)thr=-.65;else if(ahead<8)thr=.05;else if(ahead<13)thr=.35;
 if(Math.abs(df)>1.05)thr=Math.min(thr,.3);if(Math.abs(df)>2.3)thr=-.35;
 df=cl(df+side,-1.2,1.2);
 const mx=c.v||12;
 drive(c,thr,cl(df*2.3,-1,1),Math.abs(df)>1.25&&(c.fs||0)>7,dt,mx);
}
function policeChase(p,Q,d,dt,stars){
 let tx=Q.x,tz=Q.z,blocked=0;
 try{blocked=lineBlk(p.x,p.z,Q.x,Q.z)}catch(e){blocked=0}
 if((d>26||blocked)&&ND.length){
  p.prt=(p.prt||0)-dt;
  if(!p.ppath||p.prt<=0){p.prt=1.15;const a=nearestN(p.x,p.z,ND),b=nearestN(Q.x,Q.z,ND);p.ppath=astar(ND,a,b)||[b];p.ppi=0}
  const path=p.ppath;
  if(path&&path.length){while(p.ppi<path.length-1&&H(ND[path[p.ppi]].x-p.x,ND[path[p.ppi]].z-p.z)<11)p.ppi++;
   const n=ND[path[Math.min(p.ppi,path.length-1)]];tx=n.x;tz=n.z}
 }
 const dx=tx-p.x,dz=tz-p.z;let df=Math.atan2(dx,dz)-p.th;df=Math.atan2(SN(df),CS(df));
 const close=d<8&&!blocked;
 drive(p,close&&Math.abs(P.fs)<4?-.3:1,cl(df*2.1,-1,1),0,dt,28+stars*3);
}
function pedNav(p,q,sp,dt){
 if(!SW.length||sp<=0){p.m.rotation.y=p.m.rotation.y;return}
 if(p.flee&&p.fl<=0){p.flee=0;p.path=null}
 if(!p.path||p.pi>=p.path.length){
  const s=nearestN(p.x,p.z,SW);let g=s;
  if(p.fl>0){let bd=-1;for(let k=0;k<12;k++){const t=(R()*SW.length)|0,dq=H(SW[t].x-q.x,SW[t].z-q.z),me=H(SW[t].x-p.x,SW[t].z-p.z);if(dq>bd&&me>12&&me<100){bd=dq;g=t}}}
  else{for(let k=0;k<10;k++){const t=(R()*SW.length)|0,d=H(SW[t].x-p.x,SW[t].z-p.z);if(d>28&&d<120){g=t;break}}}
  p.path=astar(SW,s,g)||[g];p.pi=0;p.flee=p.fl>0?1:0;
 }
 while(p.pi<p.path.length&&H(SW[p.path[p.pi]].x-p.x,SW[p.path[p.pi]].z-p.z)<1.45)p.pi++;
 if(p.pi>=p.path.length){p.path=null;if(p.fl<=0)p.wt=.35+R()*1.6;return}
 const n=SW[p.path[p.pi]];let vx=n.x-p.x,vz=n.z-p.z,d=H(vx,vz)||1;vx/=d;vz/=d;
 for(let i=0;i<PEDS.length;i++){const o=PEDS[i];if(o===p||o.st==='d'||o.k!=='p')continue;const ox=p.x-o.x,oz=p.z-o.z,dd=H(ox,oz);if(dd>0&&dd<1.25){vx+=ox/dd*.9;vz+=oz/dd*.9}}
 if(p.fl<=0){for(let i=0;i<tr.length;i++){const c=tr[i];if(H(c.vx,c.vz)<2)continue;const ox=p.x-c.x,oz=p.z-c.z,dd=H(ox,oz);if(dd>0&&dd<6.5){vx+=ox/dd*(1.3-dd/6.5);vz+=oz/dd*(1.3-dd/6.5)}}}
 d=H(vx,vz)||1;vx/=d;vz/=d;
 const nx=p.x+vx*sp*dt,nz=p.z+vz*sp*dt;
 if(!inBld(nx,nz)){p.x=nx;p.z=nz}else if(!inBld(nx,p.z))p.x=nx;else if(!inBld(p.x,nz))p.z=nz;else p.path=null;
 p.m.rotation.y=Math.atan2(vx,vz);
}
buildNav();
let LMAP=0,lpan={x:0,z:0,drag:0,lx:0,ly:0,px:0,pz:0,user:0};
function lProject(x,z,w,h){const sc=w/920;return[w/2+(x-lpan.x)*sc,h/2+(z-lpan.z)*sc]}
function placeTiles(host,w,h){
 const zoom=16,sc=w/920;
 const x0w=lpan.x-(w*.5)/sc,x1w=lpan.x+(w*.5)/sc,z0w=lpan.z-(h*.5)/sc,z1w=lpan.z+(h*.5)/sc;
 const a=w2ll(x0w,z0w),b=w2ll(x1w,z1w);
 const ta=ll2tx(Math.max(a[0],b[0]),Math.min(a[1],b[1]),zoom);
 const tb=ll2tx(Math.min(a[0],b[0]),Math.max(a[1],b[1]),zoom);
 let tx0=Math.floor(Math.min(ta[0],tb[0]))-1,tx1=Math.floor(Math.max(ta[0],tb[0]))+1;
 let ty0=Math.floor(Math.min(ta[1],tb[1]))-1,ty1=Math.floor(Math.max(ta[1],tb[1]))+1;
 if(tx1-tx0>9){const m=(tx0+tx1)>>1;tx0=m-4;tx1=m+4}
 if(ty1-ty0>9){const m=(ty0+ty1)>>1;ty0=m-4;ty1=m+4}
 const want=new Set();
 for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){
  const id=TGEN+'/'+zoom+'/'+tx+'/'+ty;want.add(id);
  let im=host.querySelector('img[data-id="'+id+'"]');
  if(!im){im=document.createElement('img');im.dataset.id=id;im.alt='';im.draggable=false;im.decoding='async';im.src=tileUrl(zoom,tx,ty);host.appendChild(im)}
  const nwll=t2ll(tx,ty,zoom),sell=t2ll(tx+1,ty+1,zoom);
  const nw=ll2w(nwll[0],nwll[1]),se=ll2w(sell[0],sell[1]);
  im.style.left=(w/2+(nw[0]-lpan.x)*sc)+'px';
  im.style.top=(h/2+(nw[1]-lpan.z)*sc)+'px';
  im.style.width=((se[0]-nw[0])*sc+1.5)+'px';
  im.style.height=((se[1]-nw[1])*sc+1.5)+'px';
 }
 const kids=host.querySelectorAll('img');
 for(let i=0;i<kids.length;i++)if(!want.has(kids[i].dataset.id))kids[i].remove();
}
function drawLMap(){
 const stage=$('lstage'),host=$('ltile'),cv=$('lmk');if(!stage||!host||!cv)return;
 const w=stage.clientWidth||900,h=stage.clientHeight||480;if(w<40||h<40)return;
 if(LMAP&&!lpan.drag&&!lpan.user){lpan.x+=(P.x-lpan.x)*.35;lpan.z+=(P.z-lpan.z)*.35}
 placeTiles(host,w,h);
 if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}
 const ctx=cv.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);
 const prj=function(x,z){return lProject(x,z,w,h)};
 tr.forEach(function(c){if(c.pk)return;const m=prj(c.x,c.z);if(m[0]<-20||m[1]<-20||m[0]>w+20||m[1]>h+20)return;ctx.fillStyle='#f4f7fb';ctx.fillRect(m[0]-3,m[1]-3,6,6)});
 PEDS.forEach(function(p){if(!p||p.st==='d'||p.k==='c')return;const m=prj(p.x,p.z);ctx.fillStyle='#f472b6';ctx.fillRect(m[0]-2,m[1]-2,4,4)});
 police.forEach(function(p){const m=prj(p.x,p.z);ctx.fillStyle='#3aa0ff';ctx.beginPath();ctx.arc(m[0],m[1],4.5,0,7);ctx.fill()});
 const me=prj(P.x,P.z);ctx.save();ctx.translate(me[0],me[1]);ctx.rotate(Math.PI-P.th);ctx.fillStyle='#f5c542';ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(-6,7);ctx.fill();ctx.restore();
 const info=$('lmi');if(info){const ll=w2ll(P.x,P.z),src=MC.google?'Google Maps':(MC.mode==='satellite'?'Satellite imagery':'Live map');
  info.textContent=src+' · Central Jakarta · '+(typeof last==='string'?last:'')+' · '+ll[0].toFixed(5)+', '+ll[1].toFixed(5)+' · drag to pan'+(MC.err?' · '+MC.err:'')}
}
function toggleLMap(force){
 LMAP=force==null?!LMAP:!!force;const el=$('lmap');if(!el)return;el.classList.toggle('on',LMAP);
 if(LMAP){lpan.user=0;lpan.x=P.x;lpan.z=P.z;const inp=$('lmkey');if(inp&&document.activeElement!==inp)inp.value=GKEY;drawLMap()}
}
function saveGKey(v){
 GKEY=(v||'').trim();try{localStorage.setItem('jp_gkey',GKEY)}catch(e){}gSession();
 const info=$('lmi');if(info)info.textContent=GKEY?'Checking Google Maps key…':'Google key cleared. Showing the live Jakarta map.';
}
(function wireMap(){
 const stage=$('lstage'),el=$('lmap');if(!stage||!el)return;
 const down=function(e){if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON'))return;lpan.drag=1;lpan.user=1;lpan.lx=e.clientX;lpan.ly=e.clientY;lpan.px=lpan.x;lpan.pz=lpan.z;try{stage.setPointerCapture(e.pointerId)}catch(err){}e.preventDefault()};
 stage.addEventListener('pointerdown',down);
 addEventListener('pointermove',function(e){if(!lpan.drag)return;const sc=(stage.clientWidth||900)/920;lpan.x=lpan.px-(e.clientX-lpan.lx)/sc;lpan.z=lpan.pz-(e.clientY-lpan.ly)/sc;if(LMAP)drawLMap()});
 addEventListener('pointerup',function(){lpan.drag=0});
 const xb=$('lmx');if(xb)xb.onclick=function(){toggleLMap(false)};
 const bm=$('bmap');if(bm)bm.onclick=function(e){e.stopPropagation();toggleLMap(true)};
 const ks=$('lmks');if(ks)ks.onclick=function(){saveGKey(($('lmkey')&&$('lmkey').value)||'')};
 const sat=$('lmsat');if(sat)sat.onclick=function(){MC.mode=MC.mode==='satellite'?'roadmap':'satellite';sat.textContent=MC.mode==='satellite'?'Road map':'Satellite';if(GKEY)gSession();else{MC.google=0;MC.sess='';wipeTiles()}};
})();
addEventListener('keydown',function(e){if(e.code!=='KeyM'||e.repeat)return;const tag=e.target&&e.target.tagName;if(tag==='INPUT'||tag==='TEXTAREA')return;if(CUT&&CUT.title){toggleLMap();return}if(!CUT&&!PAUSED)toggleLMap()});

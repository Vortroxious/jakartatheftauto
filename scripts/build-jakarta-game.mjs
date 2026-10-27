import { readFileSync, writeFileSync } from "node:fs";

const raw = readFileSync("/workspace/attachments/Jakarta Pusat_ The Last Delivery 8.html", "utf8");
const start = raw.indexOf('<html lang="id">');
if (start < 0) throw new Error("inner html missing");
const doc = raw.slice(start);
const style = doc.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const body = doc.match(/<body>([\s\S]*?)<script src=/)?.[1];
const script = doc.match(/<script>\r?\n([\s\S]*?)<\/script>\s*<\/body>/)?.[1];
if (!style || !body || !script) throw new Error("extract failed");
if (!script.startsWith("const T=THREE")) throw new Error("script start unexpected: " + script.slice(0, 40));

const cssExtra = `
#lmap{position:fixed;inset:0;z-index:40;display:none;background:rgba(6,8,12,.72);align-items:center;justify-content:center}
#lmap.on{display:flex}
#lbox{width:min(96vw,980px);height:min(92vh,760px);background:#12161e;border:1px solid #333b4a;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;font-family:system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.45)}
#lbox header{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;background:#0e1218}
#lbox h3{margin:0;font-family:Impact,system-ui,sans-serif;letter-spacing:3px;color:#f5c542;font-size:22px}
#lbox header button,#lmkeyrow button{border:0;border-radius:8px;background:#2b3345;color:#fff;padding:8px 12px;font:600 14px system-ui,sans-serif}
#lbox header button:hover,#lmkeyrow button:hover{background:#3a4560}
#lstage{position:relative;flex:1;min-height:220px;overflow:hidden;background:#c5bfb2;cursor:grab;touch-action:none}
#ltile{position:absolute;inset:0;overflow:hidden}
#ltile img{position:absolute;display:block;pointer-events:none;max-width:none}
#lmk{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#lmi{padding:8px 12px 4px;font-size:12px;line-height:1.4;opacity:.92}
#lmkeyrow{display:flex;gap:6px;padding:0 12px 12px}
#lmkeyrow input{flex:1;min-width:0;padding:8px 10px;border:0;border-radius:8px;background:#2b3345;color:#fff;font:14px system-ui,sans-serif}
#gkey{width:100%;box-sizing:border-box;padding:10px;border:0;border-radius:8px;background:#2b3345;color:#fff;font:15px system-ui,sans-serif;margin:6px 0}
#tb a{display:block;width:100%;margin:8px 0;padding:11px;border-radius:8px;background:#1f6b45;color:#fff;font:600 16px system-ui,sans-serif;cursor:pointer;text-decoration:none;box-sizing:border-box;text-align:center}
#tb a:hover{background:#278656}
`;

let html = body;
const titleBtn = '<button id="bn">New Game</button><button id="bl">Load Game</button>';
if (!html.includes(titleBtn)) throw new Error("title buttons missing");
html = html.replace(
  titleBtn,
  titleBtn + '<button id="bmap" type="button">City Map</button><a id="bdl" href="/Jakarta-Pusat-The-Last-Delivery.html" download="Jakarta-Pusat-The-Last-Delivery.html">Download HTML</a>',
);
const small =
  "<small>WASD move/drive · Mouse look · Shift run · E enter/exit car · Space handbrake · C camera · H horn<br>Touch: drag right side to look, E button to enter/exit</small>";
if (!html.includes(small)) throw new Error("small help missing");
html = html.replace(
  small,
  "<small>WASD move/drive · Mouse look · Shift run · E enter/exit · Space handbrake · C camera · H horn · M live map<br>Traffic and people pick their own routes through the city. Touch: drag the right side to look.</small>",
);
html += `<div id="lmap"><div id="lbox"><header><h3>JAKARTA PUSAT</h3><div><button id="lmsat" type="button">Satellite</button> <button id="lmx" type="button">Close</button></div></header><div id="lstage"><div id="ltile"></div><canvas id="lmk"></canvas></div><div id="lmi">Live map of Central Jakarta</div><div id="lmkeyrow"><input id="lmkey" placeholder="Google Maps API key (optional)" autocomplete="off" spellcheck="false"><button id="lmks" type="button">Use Google</button></div></div></div>`;

const nav = readFileSync("/workspace/scripts/nav-snippet.js", "utf8");

function must(s, a, b) {
  if (!s.includes(a)) throw new Error("missing snippet: " + a.slice(0, 80));
  return s.replace(a, b);
}

let js = script;
js = must(
  js,
  "function place(c,md){for(let k=0;k<12;k++){c.s=R()*c.rd.len;const q=posAt(c.rd,c.s,c.dir,c.rd.lp?0:c.rd.hw*.45);c.x=q[0];c.z=q[1];if(H(c.x-P.x,c.z-P.z)>md)break}}",
  "function place(c,md){for(let k=0;k<12;k++){c.s=R()*c.rd.len;const q=posAt(c.rd,c.s,c.dir,c.rd.lp?0:c.rd.hw*.45);c.x=q[0];c.z=q[1];c.th=Math.atan2(q[2],q[3]);if(H(c.x-P.x,c.z-P.z)>md)break}}",
);
js = must(
  js,
  "function respawn(c,md){c.dyn=0;c.idle=0;c.w=0;c.y=0;dent(c.m,-1);if(c.home){c.x=c.home[0];c.z=c.home[1];c.th=c.home[2];c.vx=c.vz=c.vy=0}else place(c,md)}",
  "function respawn(c,md){c.dyn=0;c.idle=0;c.w=0;c.y=0;c.path=null;c.pi=0;c.stuckT=0;c.stuckN=0;dent(c.m,-1);if(c.home){c.x=c.home[0];c.z=c.home[1];c.th=c.home[2];c.vx=c.vz=c.vy=0}else place(c,md)}",
);
const anchor = "st0();tr.forEach(c=>respawn(c,60));";
js = must(js, anchor, anchor + "\n" + nav + "\n");
js = must(
  js,
  ` while(police.length<Math.min(stars,4)&&!P.dead)spawnPol();
 let near=false;const Q=F.on?F:P;
 police.forEach(p=>{const dx=Q.x-p.x,dz=Q.z-p.z,d=H(dx,dz);if(stars&&!P.dead&&!p.hold){let df=Math.atan2(dx,dz)-p.th;df=Math.atan2(SN(df),CS(df));drive(p,d<7&&Math.abs(P.fs)<4?-.3:1,cl(df*2,-1,1),0,dt,30+stars*2)}else{drive(p,0,0,p.hold?1:0,dt,30);if(!p.hold)p.ttl-=dt}
  if(d<7)near=true;const f=(Date.now()/120|0)%2==0;p.m.rl.visible=f;p.m.bl.visible=!f});
 const act=[P,...police,...tr.filter(c=>c.dyn)];act.forEach(b=>step(b,dt));
 act.forEach((a,i)=>{for(let j=i+1;j<act.length;j++)pr(a,act[j]);for(const c of tr)if(!c.dyn&&pr(a,c)!==undefined&&Math.abs(a.x-c.x)<4){c.dyn=1;c.idle=0}});
 act.forEach(wall);
 tr.forEach(c=>{if(c.dyn){if(H(c.vx,c.vz)<.8)c.idle+=dt;else c.idle=0;if(c.idle>5||H(c.x-P.x,c.z-P.z)>500)respawn(c,150)}
  else if(c.pk){c.vx=c.vz=0}else{c.s+=c.dir*c.v*dt;const L=c.rd.len;if(c.rd.lp)c.s=(c.s+L)%L;else if(c.s<0||c.s>L){c.dir*=-1;c.s=cl(c.s,0,L)}
   const q=posAt(c.rd,c.s,c.dir,c.rd.lp?0:c.rd.hw*.45);c.x=q[0];c.z=q[1];c.vx=q[2]*c.v;c.vz=q[3]*c.v;c.th=Math.atan2(q[2],q[3])}
  c.m.position.set(c.x,c.y,c.z);c.m.rotation.y=c.th});`,
  ` while(police.length<Math.min(stars,4)&&!P.dead)spawnPol();
 let near=false;const Q=F.on?F:P;
 police.forEach(p=>{const dx=Q.x-p.x,dz=Q.z-p.z,d=H(dx,dz);if(stars&&!P.dead&&!p.hold)policeChase(p,Q,d,dt,stars);else{drive(p,0,0,p.hold?1:0,dt,30);if(!p.hold)p.ttl-=dt}
  if(d<7)near=true;const f=(Date.now()/120|0)%2==0;p.m.rl.visible=f;p.m.bl.visible=!f});
 wakeParked();
 tr.forEach(c=>{if(c.dyn)return;if(c.pk){c.vx=c.vz=0;return}c.sim=H(c.x-Q.x,c.z-Q.z)<110;if(c.sim)carThink(c,dt);else carCruise(c,dt)});
 const act=[P,...police,...tr.filter(c=>c.dyn||c.sim)];act.forEach(b=>step(b,dt));
 act.forEach((a,i)=>{for(let j=i+1;j<act.length;j++)pr(a,act[j]);for(const c of tr)if(c.pk&&!c.dyn&&pr(a,c)!==undefined&&Math.abs(a.x-c.x)<4){c.dyn=1;c.idle=0;c.path=null}});
 act.forEach(wall);
 tr.forEach(c=>{if(c.dyn){if(H(c.vx,c.vz)<.8)c.idle+=dt;else c.idle=0;if(c.idle>5||H(c.x-P.x,c.z-P.z)>520)respawn(c,150)}
  else if(!c.pk){if(H(c.vx,c.vz)<.55)c.stuckT=(c.stuckT||0)+dt;else{c.stuckT=0;c.stuckN=0}if((c.stuckT||0)>4.5){c.path=null;c.stuckT=0;c.stuckN=(c.stuckN||0)+1;if(c.stuckN>3){c.stuckN=0;respawn(c,90)}}if(H(c.x-P.x,c.z-P.z)>580)respawn(c,120)}
  c.m.position.set(c.x,c.y,c.z);c.m.rotation.y=c.th;if(c.ls)c.m.rotation.z=cl(-c.ls*.02,-.2,.2)});
 if(LMAP){drawLMap();return}`,
);
js = must(
  js,
  "$('help').innerHTML='WASD move/drive · Mouse look · Shift run · <b>E</b> enter/exit car · Space handbrake · C camera · H horn · <b>Click</b> shoot · hold <b>Q</b> weapon wheel · 1-9 weapons · T reload · E: enter parked cars, carjack moving ones';",
  "$('help').innerHTML='WASD move/drive · Mouse look · Shift run · <b>E</b> enter/exit car · Space handbrake · C camera · H horn · <b>M</b> live Jakarta map · <b>Click</b> shoot · hold <b>Q</b> weapon wheel · 1-9 weapons · T reload · Cars and pedestrians pathfind their own routes';",
);
js = must(
  js,
  "function pedScare(p){if(p.st=='d'||p.k=='c')return;if(p.k=='s'){p.fe=9;return}const q=F.on?F:P,L=p.rd.len,off=p.sd*(p.rd.hw+p.o),A=posAt(p.rd,cl(p.s+4,0,L),1,off),Bp=posAt(p.rd,cl(p.s-4,0,L),1,off);\n p.dir=H(A[0]-q.x,A[1]-q.z)>H(Bp[0]-q.x,Bp[1]-q.z)?1:-1;p.fl=6+R()*4;p.wt=0}",
  "function pedScare(p){if(p.st=='d'||p.k=='c')return;if(p.k=='s'){p.fe=9;return}p.fl=5+R()*4;p.wt=0;p.flee=1;p.path=null}",
);
js = must(
  js,
  `  let sp=p.sp;if(p.fl>0){p.fl-=dt;sp=5.6}else if(p.wt>0){p.wt-=dt;sp=0}else if(R()<dt*.05)p.wt=2+R()*4;
  p.s+=p.dir*sp*dt;const r=p.rd;if(p.s<4||p.s>r.len-4){p.dir*=-1;p.s=cl(p.s,4,r.len-4)}
  const w=posAt(r,p.s,1,p.sd*(r.hw+p.o));
  if(sp>0&&inBld(w[0],w[1])){p.dir*=-1;p.s+=p.dir*sp*dt*2}else{p.x=w[0];p.z=w[1]}
  m.position.set(p.x,.07,p.z);m.rotation.y=Math.atan2(w[2]*p.dir,w[3]*p.dir);`,
  `  let sp=p.sp;if(p.fl>0){p.fl-=dt;sp=5.4}else if(p.wt>0){p.wt-=dt;sp=0}else if(R()<dt*.035)p.wt=.4+R()*1.8;
  if(sp>0)pedNav(p,q,sp,dt);
  m.position.set(p.x,.07,p.z);`,
);
const setViewRe =
  /function setView\(\)\{pm\('<h2>SETTINGS<\/h2>[\s\S]*?\$\('sens'\)\.oninput=e=>\{SEN=\+e\.target\.value;saveSet\(\)\}\}/;
if (!setViewRe.test(js)) throw new Error("setView missing");
js = js.replace(
  setViewRe,
  `function setView(){pm('<h2>SETTINGS</h2><div class="sm">Graphics intensity</div>'+GQ.map((q,i)=>'<button data-a="gfx" data-i="'+i+'"'+(i==GFX?' class="on"':'')+'>'+q.n+'</button>').join('')+'<div class="sm">Low also hides windows, doors and street lamps and turns sun shadows off. Mouse sensitivity</div><input type="range" id="sens" min="0.3" max="2.5" step="0.1" value="'+SEN+'"><div class="sm">Google Maps API key. The city map uses Google imagery when this key is accepted. Leave it empty for the live Jakarta street map.</div><input id="gkey" placeholder="AIza..." autocomplete="off" spellcheck="false"><button data-a="gkey">Save map key</button><button data-a="back">'+ico('back',16)+' Back</button>');$('sens').oninput=e=>{SEN=+e.target.value;saveSet()};const gk=$('gkey');if(gk)gk.value=GKEY}`,
);
js = must(
  js,
  "else if(a=='gfx'){applyGfx(i);saveSet();setView()}",
  "else if(a=='gkey'){saveGKey(($('gkey')&&$('gkey').value)||'');msg(GKEY?'Key saved. The map switches to Google if the key is valid.':'Key cleared. The live Jakarta map stays on.');}else if(a=='gfx'){applyGfx(i);saveSet();setView()}",
);
js = must(
  js,
  "$('bn').innerHTML=ico('play',20)+' New Game';$('bl').innerHTML=ico('folder',20)+' Load Game';",
  "$('bn').innerHTML=ico('play',20)+' New Game';$('bl').innerHTML=ico('folder',20)+' Load Game';if($('bmap'))$('bmap').innerHTML='City Map';",
);
js += `
window.__controlsTest={getYaw:function(){return P.th},getSpeed:function(){return Math.hypot(P.vx,P.vz)},setKeys:function(codes){k.clear();(codes||[]).forEach(function(c){k.add(c)});try{ia()}catch(e){}}};
if(/[?&]qa=1/.test(location.search)){onTitle=0;CUT=null;document.body.classList.remove('cut');var ttl=$('ttl');if(ttl)ttl.style.display='none';P.m.fuel=100;P.dead=0;PAUSED=0;}
`;

writeFileSync("/workspace/src/game/shell.html", `<style>${style}${cssExtra}</style>${html}`);
writeFileSync("/workspace/public/game.js", js);
console.log("shell", html.length, "js", js.length);

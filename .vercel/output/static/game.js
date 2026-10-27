const T=THREE,$=i=>document.getElementById(i),R=Math.random,cl=(v,a,b)=>Math.max(a,Math.min(b,v)),H=Math.hypot,SN=Math.sin,CS=Math.cos,EX=Math.exp;
const ren=new T.WebGLRenderer({canvas:$('c'),antialias:true});ren.setPixelRatio(Math.min(devicePixelRatio,2));
const sc=new T.Scene();sc.background=new T.Color(0xf2a36b);sc.fog=new T.Fog(0xefb083,100,640);
const cam=new T.PerspectiveCamera(65,1,.1,1000);sc.add(cam);
function rs(){ren.setSize(innerWidth,innerHeight,false);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()}addEventListener('resize',rs);rs();
const hemi=new T.HemisphereLight(0xffe2c4,0x445566,.85);sc.add(hemi);const sun=new T.DirectionalLight(0xffc890,.9);sun.position.set(-200,200,100);sc.add(sun);
// ===== GRAPHICS UPGRADE: stylized realism (PBR materials, ACES tone mapping, sun shadows, sky dome, reflections) =====
const GX={safe:false,ENVT:null,paint:[],bm:[],wte:null,sq:2,r:95,ms:2048};
ren.toneMapping=T.ACESFilmicToneMapping;ren.toneMappingExposure=.9;
ren.shadowMap.enabled=true;ren.shadowMap.type=T.PCFSoftShadowMap;
const NOP=function(){};
// world-space surface grain + soft ground-contact darkening (static world materials only)
const GRAIN=function(sh){
 sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 gxP;\nvarying vec3 gxN;\nvarying float gxD;')
  .replace('#include <project_vertex>','#include <project_vertex>\nvec4 gxW=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\ngxW=instanceMatrix*gxW;\n#endif\ngxP=(modelMatrix*gxW).xyz;\ngxN=normalize(mat3(modelMatrix)*objectNormal);\ngxD=length(mvPosition.xyz);');
 sh.fragmentShader=sh.fragmentShader.replace('#include <common>',['#include <common>','varying vec3 gxP;','varying vec3 gxN;','varying float gxD;',
  'float gxH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
  'float gxV(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(gxH(i),gxH(i+vec2(1.0,0.0)),f.x),mix(gxH(i+vec2(0.0,1.0)),gxH(i+vec2(1.0,1.0)),f.x),f.y);}'].join('\n'))
  .replace('#include <color_fragment>',['#include <color_fragment>','{',
  ' vec3 an=abs(normalize(gxN));',
  ' vec2 q=an.y>0.6?gxP.xz:(an.x>an.z?gxP.zy:gxP.xy);',
  ' float fz=1.0-smoothstep(30.0,110.0,gxD);',
  ' float g=gxV(q*0.35)*0.5+gxV(q*1.7)*0.3+gxV(q*7.0)*0.2;',
  ' g=mix(0.5,g,fz);',
  ' float ao=an.y>0.6?1.0:mix(0.68,1.0,smoothstep(0.0,6.0,gxP.y));',
  ' diffuseColor.rgb*=(0.84+0.32*g)*ao;','}'].join('\n'));
};
const GW=m=>{if(!GX.safe&&!m.userData.keep)m.onBeforeCompile=GRAIN;return m};
// procedural reflection environment (sunset sky) for paint, glass, water
// reflection environment: 6 small canvas faces (8-bit cube map works on every device, unlike float PMREM targets)
try{const face=(kind,glow)=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  if(kind=='top'){g.fillStyle='#5a86c8';g.fillRect(0,0,64,64)}else if(kind=='bot'){g.fillStyle='#5c564e';g.fillRect(0,0,64,64)}
  else{const gr=g.createLinearGradient(0,0,0,64);gr.addColorStop(0,'#5a86c8');gr.addColorStop(.45,'#e9a878');gr.addColorStop(.5,'#f2b07a');gr.addColorStop(.52,'#7a6f62');gr.addColorStop(1,'#4a453f');g.fillStyle=gr;g.fillRect(0,0,64,64);
   if(glow){const rg=g.createRadialGradient(30,22,0,30,22,26);rg.addColorStop(0,'rgba(255,240,200,1)');rg.addColorStop(.25,'rgba(255,200,130,.8)');rg.addColorStop(1,'rgba(255,180,110,0)');g.fillStyle=rg;g.fillRect(0,0,64,64)}}return c};
 const ct=new T.CubeTexture([face('side'),face('side',1),face('top'),face('bot'),face('side'),face('side')]);ct.needsUpdate=true;GX.ENVT=ct}catch(e){GX.ENVT=null}
const gxReg=m=>{if(GX.ENVT){m.envMap=GX.ENVT;GX.paint.push(m);if(GX.paint.length>4000)GX.paint.splice(0,500)}return m};
const _Std=T.MeshStandardMaterial,_Bas=T.MeshBasicMaterial,_Phys=T.MeshPhysicalMaterial;
// ===== REALISM PASS: world-space ground textures with rain puddles, animated water, rounded people, car bodies =====
GX.uT={value:0};
// textured ground: GRAIN + world-space detail texture on top faces + reflective puddles
const GRAINT=function(sh){GRAIN(sh);const u=this.userData;sh.uniforms.gxTex={value:u.gxTex};sh.uniforms.gxS={value:u.gxS};sh.uniforms.gxPd={value:u.gxPd};
 sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D gxTex;\nuniform float gxS;\nuniform float gxPd;')
  .replace('#include <color_fragment>',['#include <color_fragment>','if(abs(normalize(gxN)).y>0.6){vec3 gtx=texture2D(gxTex,gxP.xz*gxS).rgb;diffuseColor.rgb*=gtx*2.0;',
   'float gpd=gxPd*smoothstep(0.6,0.68,gxV(gxP.xz*0.07+3.1));diffuseColor.rgb*=mix(1.0,0.55,gpd);}'].join('\n'))
  .replace('#include <roughnessmap_fragment>',['#include <roughnessmap_fragment>','if(abs(normalize(gxN)).y>0.6){float gpd2=gxPd*smoothstep(0.6,0.68,gxV(gxP.xz*0.07+3.1));roughnessFactor=mix(roughnessFactor,0.05,gpd2);}'].join('\n'))};
// animated water: summed directional waves perturb the normal (sun glints + sky reflections)
const WAVE=function(sh){sh.uniforms.uT=GX.uT;
 sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 gxP;\nvarying vec3 gxN;\nvarying float gxD;')
  .replace('#include <project_vertex>','#include <project_vertex>\nvec4 gxW=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\ngxW=instanceMatrix*gxW;\n#endif\ngxP=(modelMatrix*gxW).xyz;\ngxN=normalize(mat3(modelMatrix)*objectNormal);\ngxD=length(mvPosition.xyz);');
 sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 gxP;\nvarying vec3 gxN;\nvarying float gxD;\nuniform float uT;')
  .replace('#include <normal_fragment_begin>',['#include <normal_fragment_begin>','{vec2 wp=gxP.xz;float wt=uT;vec2 wg=vec2(0.0);',
   'wg+=vec2(0.8,0.6)*cos(dot(wp,vec2(0.8,0.6))*0.9+wt*1.3)*0.09;','wg+=vec2(-0.5,0.85)*cos(dot(wp,vec2(-0.5,0.85))*1.7+wt*1.9)*0.06;',
   'wg+=vec2(0.95,-0.3)*cos(dot(wp,vec2(0.95,-0.3))*3.1+wt*2.6)*0.04;','wg+=vec2(-0.2,-0.98)*cos(dot(wp,vec2(-0.2,-0.98))*5.3+wt*3.4)*0.025;',
   'wg*=mix(0.35,1.0,1.0-smoothstep(40.0,160.0,gxD));vec3 wn=normalize(vec3(-wg.x,1.0,-wg.y));',
   'if(abs(normalize(gxN)).y>0.6)normal=normalize((viewMatrix*vec4(wn,0.0)).xyz);}'].join('\n'))};
function waterMat(col){const m=new _Std({color:col,roughness:.04,metalness:.15});m.userData.keep=1;if(!GX.safe)m.onBeforeCompile=WAVE;return gxReg(m)}
// procedural tileable detail textures (8-bit canvas: works everywhere)
const TEXC={0x4a4d55:'asph',0x9a4a3c:'asph',0xcdc8b8:'walk',0xb5b1a4:'walk',0x4f9a45:'grass',0xd9d3c3:'plaza',0xcfc9b8:'plaza',0x8c887b:'dirt'},TSC={asph:1/8,walk:1/4,grass:1/6,plaza:1/6,dirt:1/10},GTX={};
function mkGT(k){const N=256,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d'),id=g.createImageData(N,N),d=id.data;
 const hs=(x,y)=>{const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s)};
 const vn=(x,y,P)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),a=(ix%P+P)%P,b=(iy%P+P)%P,a1=(a+1)%P,b1=(b+1)%P;
  return(hs(a,b)*(1-u)+hs(a1,b)*u)*(1-v)+(hs(a,b1)*(1-u)+hs(a1,b1)*u)*v};
 const fb=(x,y)=>{let s=0,am=.5,P=4;for(let o=0;o<5;o++){s+=am*vn(x*P/N,y*P/N,P);P*=2;am*=.5}return s};
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){const n=fb(x,y),r=hs(x+.5,y+.3);let R=.5,G=.5,Bc=.5;
  if(k=='asph'){let v=.43+.16*(n-.5)+(r>.965?.16:r<.04?-.1:0)+(hs(x*3.1,y*1.7)-.5)*.06;R=v*.98;G=v;Bc=v*1.03}
  else if(k=='walk'){const tx=x>>5,ty=y>>5,gx=x%32,gy=y%32,gr=gx<2||gy<2;let v=gr?.33:.5+(hs(tx,ty+9)-.5)*.14+(n-.5)*.12+(r-.5)*.05;R=v*1.01;G=v;Bc=v*.97}
  else if(k=='plaza'){const tx=x>>6,ty=y>>6,gr=x%64<1.5||y%64<1.5;let v=gr?.36:.5+(hs(tx+3,ty)-.5)*.1+(n-.5)*.14+(r-.5)*.04;R=v;G=v;Bc=v*.98}
  else if(k=='grass'){const dry=Math.max(0,fb(x+97,y+31)-.55)*2;let v=.5+(n-.5)*.3+(r-.5)*.12;R=v*(1+dry*.5);G=v*(1+dry*.15);Bc=v*(1-dry*.4)}
  else{let v=.5+(n-.5)*.28+(r-.5)*.08;R=v*1.02;G=v;Bc=v*.95}
  const i=(y*N+x)*4;d[i]=cl(R,0,1)*255;d[i+1]=cl(G,0,1)*255;d[i+2]=cl(Bc,0,1)*255;d[i+3]=255}
 g.putImageData(id,0,0);
 if(k=='asph'||k=='walk'){g.strokeStyle=k=='asph'?'rgba(20,20,22,.55)':'rgba(40,38,34,.4)';g.lineWidth=1.2;for(let q=0;q<(k=='asph'?7:3);q++){let x=20+R()*216,y=20+R()*216,a=R()*6.28;g.beginPath();g.moveTo(x,y);for(let s=0;s<18;s++){a+=(R()-.5)*1.1;x=cl(x+Math.cos(a)*4,8,248);y=cl(y+Math.sin(a)*4,8,248);g.lineTo(x,y)}g.stroke()}
  if(k=='asph')for(let q=0;q<4;q++){const x=40+R()*176,y=40+R()*176,rr=6+R()*16,rg=g.createRadialGradient(x,y,0,x,y,rr);rg.addColorStop(0,'rgba(15,15,18,.35)');rg.addColorStop(1,'rgba(15,15,18,0)');g.fillStyle=rg;g.fillRect(x-rr,y-rr,rr*2,rr*2)}}
 const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;try{t.anisotropy=Math.min(8,ren.capabilities.getMaxAnisotropy())}catch(e){}return t}
function GWX(m,c){const k=TEXC[c];if(k&&!GX.safe&&!m.userData.keep){m.userData.gxTex=GTX[k]||(GTX[k]=mkGT(k));m.userData.gxS=TSC[k];m.userData.gxPd=k=='asph'?1:k=='walk'||k=='plaza'?.45:0;m.onBeforeCompile=GRAINT;if(k=='asph'||k=='walk'||k=='plaza')gxReg(m);return m}return GW(m)}
// rounded boxes for people (soft shoulders, heads, limbs)
const RBC={};function RB(w,h,d){const k=w+'_'+h+'_'+d;if(RBC[k])return RBC[k];const g=new T.BoxGeometry(w,h,d,3,3,3),p=g.attributes.position,n=g.attributes.normal,r=Math.min(w,h,d)*.42,hx=w/2-r,hy=h/2-r,hz=d/2-r,v=new T.Vector3(),q=new T.Vector3();
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);q.set(cl(v.x,-hx,hx),cl(v.y,-hy,hy),cl(v.z,-hz,hz));v.sub(q);const l=v.length()||1;v.multiplyScalar(r/l);n.setXYZ(i,v.x/r,v.y/r,v.z/r);v.add(q);p.setXYZ(i,v.x,v.y,v.z)}
 g.parameters={width:w,height:h,depth:d};return RBC[k]=g}
// car body: extruded side profile with real wheel arches, sloped nose and rounded corners
const CBC={};function carBody(bw,bh,bl,by,r,wz,model){const ck=[bw,bh,bl,by,r,wz,model].join('_');if(CBC[ck])return CBC[ck];const L=bl/2,yb=-bh/2,yt=bh/2,wc=r-by,sp=model=='supercar'||model=='sports',nose=sp?.55:.3,s=new T.Shape();let ra=Math.min(r+.07,yt-.06-wc);
 s.moveTo(-L+.25,yb);
 for(const xc of[-wz,wz]){const dy=yb-wc;if(ra>Math.abs(dy)){const dx=Math.sqrt(ra*ra-dy*dy);s.lineTo(xc-dx,yb);s.absarc(xc,wc,ra,Math.atan2(dy,-dx),Math.atan2(dy,dx),true)}}
 s.lineTo(L-.2,yb);s.quadraticCurveTo(L,yb,L,yb+.2);s.lineTo(L,yt-.2);s.quadraticCurveTo(L,yt,L-.3,yt);
 s.lineTo(-L+nose+.25,yt);s.quadraticCurveTo(-L+.1,yt-.02,-L,yt-bh*(sp?.55:.35));s.lineTo(-L,yb+.2);s.quadraticCurveTo(-L,yb,-L+.25,yb);
 const bv=Math.min(.1,bw*.05),dp=bw-2*bv,geo=new T.ExtrudeGeometry(s,{depth:dp,bevelEnabled:true,bevelThickness:bv,bevelSize:bv,bevelSegments:3,steps:1,curveSegments:8});
 geo.translate(0,0,-dp/2);geo.rotateY(Math.PI/2);geo.parameters={height:bh};return CBC[ck]=geo}
function carCab(cw,ch,cl,model){const ck='c'+[cw,ch,cl,model].join('_');if(CBC[ck])return CBC[ck];const h=ch/2,l=cl/2,fr=model=='supercar'||model=='sports'?.75:.5,rr=/pickup|offroad|suv|mpv/.test(model)?.12:.35,s=new T.Shape();
 s.moveTo(-l,-h);s.lineTo(l,-h);s.lineTo(l-ch*rr,h);s.lineTo(-l+ch*fr+.1,h);s.lineTo(-l,-h);
 const bv=.05,dp=cw-2*bv,geo=new T.ExtrudeGeometry(s,{depth:dp,bevelEnabled:true,bevelThickness:bv,bevelSize:bv,bevelSegments:2,steps:1});geo.translate(0,0,-dp/2);geo.rotateY(Math.PI/2);
 geo.parameters={height:ch};geo.userData={rl:cl-ch*(rr+fr)-.1,rz:-((l-ch*rr)+(-l+ch*fr+.1))/2};return CBC[ck]=geo}

// every Lambert in the game becomes a PBR material; glass / water / window panes get reflections
T.MeshLambertMaterial=function(p){p=p||{};if(p.color===0x4c9fcf&&!p.transparent)return waterMat(0x3d5a4c);const gl=!!(p.transparent&&p.opacity<.7),rf=p.color===0x4c9fcf||p.color===0x2a3f55;
 const m=new _Std(Object.assign({roughness:gl?.1:rf?.14:.9,metalness:gl?.2:rf?.4:0},p));if(gl||rf)gxReg(m);return m};
// unlit (glowing) materials keep their authored colours
T.MeshBasicMaterial=function(p){const m=new _Bas(p);m.toneMapped=false;return m};
// meshes cast + receive sun shadows when they are solid and tall enough to matter
{const _Mesh=T.Mesh;T.Mesh=class extends _Mesh{constructor(g,m){super(g,m);const st=!!(m&&m.isMeshStandardMaterial),ty=g&&g.type,ps=(g&&g.parameters)||{};
 this.receiveShadow=st;this.castShadow=!!(st&&!m.transparent&&((ps.height||0)>.45||ty=='SphereGeometry'||ty=='IcosahedronGeometry'||ty=='ConeGeometry'))}}}
function paint(col){const c=new T.Color(col),lum=c.r*.3+c.g*.59+c.b*.11,met=lum>.8?.08:.6;const m=_Phys?new _Phys({color:col,roughness:.3,metalness:met,clearcoat:1,clearcoatRoughness:.04}):new _Std({color:col,roughness:.35,metalness:met});gxReg(m);if(GX.vEnvCur)m.envMap=GX.vEnvCur;GX.vref=GX.vref||[];GX.vref.push(m);if(GX.vref.length>2500)GX.vref.splice(20,400);return m}
function glass(col){return gxReg(new _Std({color:col,roughness:.06,metalness:.85}))}
function gmat(c){return gxReg(new _Std({color:c,roughness:.38,metalness:.65}))}
GX.tire=new _Std({color:0x16171a,roughness:.95,metalness:0});GX.rim=gxReg(new _Std({color:0xaab0b8,roughness:.28,metalness:.9}));
// facade material: reflective glass towers with lit windows that glow at night
function bmat(tx,col,gl,rx,ry){const m=GW(new T.MeshLambertMaterial({map:tx,color:col}));
 if(gl){m.roughness=.4;m.metalness=.22;gxReg(m);if(GX.wte){const e=GX.wte.clone();e.needsUpdate=true;e.repeat.set(rx,ry);m.emissive=new T.Color(0xffd890);m.emissiveMap=e;m.emissiveIntensity=0;GX.bm.push(m)}}
 return m}
// fuller, rounder tree canopy: clustered blobs with vertex-colour light gradient
function TREEG(){const parts=[[0,0,0,2],[1.2,-.5,.4,1.4],[-1.1,-.4,-.5,1.5],[.2,.9,-.3,1.3]],pos=[],nor=[],col=[],base=new T.Color(0x2c6e2e),hi=new T.Color(0x86c64e),c=new T.Color();
 parts.forEach(([x,y,z,r])=>{const g=new T.IcosahedronGeometry(r,1).toNonIndexed(),p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<p.count;i++){const py=p.getY(i)+y;pos.push(p.getX(i)+x,py,p.getZ(i)+z);nor.push(n.getX(i),n.getY(i),n.getZ(i));c.copy(base).lerp(hi,cl((py+2)/4.5,0,1)*.9);col.push(c.r,c.g,c.b)}});
 const G=new T.BufferGeometry();G.setAttribute('position',new T.Float32BufferAttribute(pos,3));G.setAttribute('normal',new T.Float32BufferAttribute(nor,3));G.setAttribute('color',new T.Float32BufferAttribute(col,3));return G}
// sky dome (gradient, sun glow, stars) + sun with moving shadow window
const SKY=new T.Mesh(new T.SphereGeometry(900,24,12),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,
 uniforms:{hz:{value:new T.Color(0xf2a36b)},zn:{value:new T.Color(0x5a82c4)},sd:{value:new T.Vector3(-260,150,120).normalize()},nt:{value:0},uT:GX.uT},
 vertexShader:'varying vec3 vD;\nvoid main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
 fragmentShader:['varying vec3 vD;','uniform vec3 hz;','uniform vec3 zn;','uniform vec3 sd;','uniform float nt;',
  'float h21(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}','uniform float uT;',
  'float n2(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x),f.y);}',
  'float fbm(vec2 p){float v=0.0;float a=0.5;for(int i=0;i<5;i++){v+=a*n2(p);p*=2.03;a*=0.5;}return v;}',
  'void main(){vec3 d=normalize(vD);float h=clamp(d.y,0.0,1.0);vec3 c=mix(hz,zn,pow(smoothstep(0.0,0.9,h),0.6));',
  'float s=max(dot(d,sd),0.0);c+=vec3(1.0,0.75,0.45)*(pow(s,6.0)*0.3+pow(s,220.0)*1.4)*(1.0-nt);',
  'vec2 g=floor(d.xz/(abs(d.y)+0.3)*90.0);float st=step(0.994,h21(g))*smoothstep(0.08,0.4,d.y)*nt;c+=vec3(st*0.9);',
  'if(d.y>0.0){vec2 cp=d.xz/(d.y+0.12)*1.6+vec2(uT*0.012,uT*0.005);float cd=smoothstep(0.5,0.78,fbm(cp));float hf=smoothstep(0.0,0.22,d.y);vec3 cc=mix(hz*1.05,vec3(1.0,0.93,0.86),0.55)*(1.0-0.72*nt)+vec3(0.02)*nt;cc+=vec3(1.0,0.6,0.3)*pow(s,4.0)*(1.0-nt)*0.45;cc*=0.82+0.18*fbm(cp*2.3+5.0);c=mix(c,cc,cd*hf*0.88);}',
  'gl_FragColor=vec4(c,1.0);}'].join('\n')}));
SKY.frustumCulled=false;SKY.renderOrder=-100;SKY.onBeforeRender=function(r,s,c){this.position.setFromMatrixPosition(c.matrixWorld)};sc.add(SKY);
const SUNO=new T.Vector3(-260,150,120),SUNL=SUNO.clone().normalize(),SHR=new T.Vector3(0,1,0).cross(SUNL).normalize(),SHU=SUNL.clone().cross(SHR);
sun.castShadow=true;sun.shadow.camera.near=1;sun.shadow.camera.far=800;sun.shadow.bias=-.0006;sun.shadow.normalBias=.07;sc.add(sun.target);
function gxShadow(i){const ms=[0,1024,2048,4096][i]||0,r=[60,70,95,130][i]||95,cm=sun.shadow.camera;GX.r=r;cm.left=cm.bottom=-r;cm.right=cm.top=r;cm.updateProjectionMatrix();
 if(!ms){sun.castShadow=false;return}
 if(sun.shadow.mapSize.x!=ms){sun.shadow.mapSize.set(ms,ms);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null}}GX.ms=ms;sun.castShadow=true}
const gxv=new T.Vector3(),gxf=new T.Vector3(),gxt=new T.Vector3();
function gxFrame(){cam.getWorldPosition(gxv);cam.getWorldDirection(gxf);gxf.y=0;gxf.normalize();gxt.copy(gxv).addScaledVector(gxf,GX.r*.4);gxt.y=0;
 const ts=2*GX.r/GX.ms,a=Math.round(gxt.dot(SHR)/ts)*ts,b=Math.round(gxt.dot(SHU)/ts)*ts,c=gxt.dot(SUNL);
 gxt.set(0,0,0).addScaledVector(SHR,a).addScaledVector(SHU,b).addScaledVector(SUNL,c);sun.target.position.copy(gxt);sun.position.copy(gxt).add(SUNO);sun.target.updateMatrixWorld()}
{const _rr=ren.render.bind(ren);ren.render=function(s,c){gxFrame();_rr(s,c)}}
const mat=c=>new T.MeshLambertMaterial({color:c});const DEC=[],DSH=[],PT=[],HS=[],WU=[],WL=[],WF=[],DO=[],DC=[0x6b3f24,0x2f5d8a,0x2f6b3a,0x8a2f2f];
function box(w,h,d,x,y,z,c,r){const m=new T.Mesh(new T.BoxGeometry(w,h,d),GWX(mat(c),c));m.position.set(x,y,z);if(r)m.rotation.y=r;sc.add(m);return m}
function cyl(r,h,x,y,z,c,s){const m=new T.Mesh(new T.CylinderGeometry(r,r*(s||1),h,20),GWX(mat(c),c));m.position.set(x,y,z);sc.add(m);return m}
box(1500,.2,1700,0,-.1,150,0x8c887b);
// ---- REAL-ISH CENTRAL JAKARTA (stylised, N = -z) ----
const RD=[["Jl. Medan Merdeka Utara",26,[[-125,-125],[125,-125]]],["Jl. Medan Merdeka Timur",26,[[125,-125],[125,125]]],["Jl. Medan Merdeka Selatan",26,[[125,125],[-125,125]]],["Jl. Medan Merdeka Barat",26,[[-125,125],[-125,-125]]],
["Jl. M.H. Thamrin",34,[[-125,125],[-149,655]]],["Jl. Jend. Sudirman",34,[[-151,745],[-200,900]]],["Jl. Gajah Mada",26,[[-125,-125],[-300,-560]]],["Jl. Juanda",26,[[125,-125],[190,-560]]],
["Jl. Gunung Sahari",30,[[420,-560],[440,890]]],["Jl. Kramat Raya",24,[[125,125],[440,260]]],["Jl. Cikini Raya",24,[[-148,480],[440,560]]],["Jl. Kebon Sirih",20,[[-132,300],[330,420]]],
["Jl. K.H. Wahid Hasyim",22,[[-140,350],[-600,310]]],["Jl. Imam Bonjol",16,[[-130,420],[380,480]]],["Jl. Teuku Umar",14,[[-105,360],[-85,780]]],["Jl. Cut Meutia",14,[[100,250],[130,780]]],
["Bundaran HI",24,Array.from({length:20},(_,i)=>[-150+50*CS(i/20*6.2832),700+50*SN(i/20*6.2832)]),1]];
const WT=[["Banjir Kanal Barat",[[-440,-600],[-440,890]]],["Kali Ciliwung",[[330,-600],[390,890]]]];
const PK=[['r',0,0,112],['r',260,0,50],['c',-20,570,45],['r',240,650,45]];
const LM=[[178,-30,36,56,14],[215,-235,56,56,26],[-80,290,26,26,70],[-190,230,42,32,40],[-260,690,50,50,60],[-60,650,42,50,56],[-50,780,28,20,48],[-215,560,34,34,235],[-225,470,32,32,180],[218,108,26,22,22]];
const RDS=RD.map(([n,w,p,lp])=>{const ns=lp?p.length:p.length-1,cum=[0];for(let i=0;i<ns;i++){const a=p[i],b=p[(i+1)%p.length];cum.push(cum[i]+H(b[0]-a[0],b[1]-a[1]))}return{n,hw:w/2,p,lp,cum,len:cum[ns],ns}});
const SG=[];RDS.forEach(r=>{for(let i=0;i<r.ns;i++)SG.push({n:r.n,hw:r.hw,a:r.p[i],b:r.p[(i+1)%r.p.length]})});
WT.forEach(([n,p])=>SG.push({n,hw:16,a:p[0],b:p[1],w:1}));
function dR(x,z,ro){let m=1e9,nm;for(const s of SG){if(ro&&s.w)continue;const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],t=cl(((x-s.a[0])*dx+(z-s.a[1])*dz)/(dx*dx+dz*dz),0,1),d=H(x-s.a[0]-t*dx,z-s.a[1]-t*dz)-s.hw;if(d<m){m=d;nm=s.n}}return[m,nm]}
const inPark=(x,z,p)=>PK.some(k=>k[0]=='r'?Math.abs(x-k[1])<k[3]+p&&Math.abs(z-k[2])<k[3]+p:H(x-k[1],z-k[2])<k[3]+p);
SG.filter(s=>s.w).forEach(s=>{const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],mx=(s.a[0]+s.b[0])/2,mz=(s.a[1]+s.b[1])/2,g=Math.atan2(dx,dz);box(38,.04,H(dx,dz),mx,.02,mz,0xb5b1a4,g);box(31,.06,H(dx,dz),mx,.035,mz,0x4c9fcf,g)});
RDS.forEach(r=>{for(let i=0;i<r.ns;i++){const a=r.p[i],b=r.p[(i+1)%r.p.length],dx=b[0]-a[0],dz=b[1]-a[1],l=H(dx,dz),g=Math.atan2(dx,dz),mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
 box(r.hw*2+7,.07,l+(r.lp?3:0),mx,.035,mz,0xcdc8b8,g);box(r.hw*2,.1,l+(r.lp?3:0),mx,.06,mz,0x4a4d55,g);
 if(!r.lp){const c=CS(g),sn=SN(g);if(/Thamrin|Sudirman/.test(r.n))box(7,.12,l,mx,.075,mz,0x9a4a3c,g);box(.4,.1,l,mx,.12,mz,0xd9b84a,g);
  [-1,1].forEach(q=>{box(.25,.1,l,mx+c*q*(r.hw-.7),.115,mz-sn*q*(r.hw-.7),0xf2f2f2,g);if(r.hw>=10)for(let t=3;t<l-3;t+=10){const o=q*r.hw*.72;DSH.push([a[0]+dx/l*t+c*o,a[1]+dz/l*t-sn*o,g])}})}}
 (r.lp?[]:[r.p[0],r.p[r.p.length-1]]).forEach(p=>box(r.hw*2,.1,r.hw*2,p[0],.055,p[1],0x4a4d55))});
PK.forEach(k=>{if(k[0]=='r')box(k[3]*2,.3,k[3]*2,k[1],.15,k[2],0x4f9a45);else cyl(k[3],.3,k[1],.15,k[2],0x4f9a45)});
const B=[],C=[],wm={};
const wt=new T.CanvasTexture((()=>{const N=128,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d'),c2=document.createElement('canvas');c2.width=c2.height=N;const g2=c2.getContext('2d');
 g.fillStyle='#7d8794';g.fillRect(0,0,N,N);g2.fillStyle='#000';g2.fillRect(0,0,N,N);const cw=N/5,chh=N/5;
 for(let r=0;r<5;r++){g.fillStyle='#39434f';g.fillRect(0,r*chh+chh-5,N,5);for(let q=0;q<5;q++){const x=q*cw+2,y=r*chh+2,w=cw-4,h=chh-8,lit=R()<.42;
  if(lit){const gr=g.createLinearGradient(0,y,0,y+h);gr.addColorStop(0,'#fff0c2');gr.addColorStop(1,'#e8b866');g.fillStyle=gr;g.fillRect(x,y,w,h);g.fillStyle='rgba(120,90,50,.35)';for(let s=y+2;s<y+h;s+=3)g.fillRect(x,s,w,1);g2.fillStyle='#fff';g2.fillRect(x,y,w,h)}
  else{const tn=R()*.25,gr=g.createLinearGradient(0,y,0,y+h);gr.addColorStop(0,'rgb('+(150+tn*60|0)+','+(178+tn*40|0)+','+(204+tn*30|0)+')');gr.addColorStop(.55,'#4a6074');gr.addColorStop(1,'#25323f');g.fillStyle=gr;g.fillRect(x,y,w,h);
   g.fillStyle='rgba(255,255,255,.12)';g.beginPath();g.moveTo(x,y+h*.7);g.lineTo(x+w*.6,y);g.lineTo(x+w*.8,y);g.lineTo(x,y+h);g.fill()}
  g.fillStyle='#9aa4b0';g.fillRect(x+w/2-.5,y,1,h)}}
 GX.wte=new T.CanvasTexture(c2);GX.wte.wrapS=GX.wte.wrapT=T.RepeatWrapping;return c})());wt.wrapS=wt.wrapT=T.RepeatWrapping;
const mkT=fn=>{const c=document.createElement('canvas');c.width=c.height=64;fn(c.getContext('2d'));const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;return t};
const wt2=(()=>{const N=128,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');g.fillStyle='#ece7dc';g.fillRect(0,0,N,N);
 for(let i=0;i<900;i++){const v=200+R()*55|0;g.fillStyle='rgba('+v+','+(v-4)+','+(v-12)+',.35)';g.fillRect(R()*N,R()*N,2,2)}
 for(let f=0;f<4;f++){const y=f*32;g.fillStyle='#cbc4b3';g.fillRect(0,y+29,N,3);
  g.fillStyle='#3d4f60';g.fillRect(4,y+7,N-8,13);const gr=g.createLinearGradient(0,y+7,0,y+20);gr.addColorStop(0,'rgba(170,195,215,.45)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(4,y+7,N-8,13);
  g.fillStyle='#f4f1ea';for(let x=4;x<=N-4;x+=15)g.fillRect(x,y+7,2,13);g.fillRect(4,y+6,N-8,2);g.fillRect(4,y+20,N-8,2);
  for(let k=0;k<3;k++){if(R()<.35)continue;const x=8+k*40+R()*14;const sg=g.createLinearGradient(0,y+22,0,y+32);sg.addColorStop(0,'rgba(70,64,56,.28)');sg.addColorStop(1,'rgba(70,64,56,0)');g.fillStyle=sg;g.fillRect(x,y+22,3+R()*4,10)}
  for(let k=0;k<2;k++){if(R()<.4)continue;const x=10+R()*100;g.fillStyle='#d4d7da';g.fillRect(x,y+21,9,6);g.fillStyle='#8f9499';for(let s=0;s<4;s++)g.fillRect(x+1+s*2,y+22,1,4)}}
 const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;return t})();
const PAL=[0xf2d9b0,0xe9b8a0,0xcfe0c0,0xf4efe4,0xd0d8e8,0xe8d27a],GL=[0x9fc7e0,0x7fb0a8,0x8fa8c8],RC=[0xc0643a,0xb5522f,0xd2793f,0x7d8c96,0x5f8f7a,0x8a4b3a],WC=[0xf2e3b8,0xe8a87c,0x9fd0a8,0x8fc1e0,0xf0b5c0,0xe6d46a,0xd9c9a8,0xf4efe4];
function bld(x,z,w,d,h,t,ci){ci=ci==null?(R()*6|0):ci;const gl=t<2,rx=Math.max(1,Math.round(w/9)),ry=Math.max(1,Math.round(h/(gl?10:7))),col=gl?GL[ci%3]:PAL[ci%6],k=[rx,ry,t,col].join('_');let m=wm[k];
 if(!m){const tx=(gl?wt:wt2).clone();tx.needsUpdate=true;tx.repeat.set(rx,ry);m=wm[k]=bmat(tx,col,gl,rx,ry)}
 const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,h/2+.25,z);sc.add(o);let ex=0;
 if(gl&&h>45){ex=4;box(w+8,9,d+8,x,4.75,z,0x4f6073);if(R()<.55)box(w*.55,7,d*.55,x,h+3.7,z,0x6a7a8a);if(R()<.4)box(.8,28,.8,x,h+14,z,0xcfcfcf)}
 else if(!gl&&h>10&&R()<.5)cyl(1.5,2.6,x+w*.25,h+1.5,z+d*.25,0x9aa0a6);
 if(h>10){box(w+.6,.7,d+.6,x,h+.6,z,gl?0x6d7a88:0xc9c3b4);if(!gl)box(w+.3,2.6,d+.3,x,1.55,z,0x8f8b80)}B.push({x,z,hx:w/2+ex,hz:d/2+ex})}
function house(x,z,w,d,h,wc,rc,rh){HS.push([x,z,w,d,h,wc,rc,rh]);const f0=R()*4|0;
 for(let f=0;f<4;f++){const zf=f<2,L=zf?w:d,sg=f%2?-1:1,n=Math.max(1,(L/3)|0),rot=zf?0:Math.PI/2;
  for(let i=0;i<n;i++){const t=(i+.5)/n*L-L/2,ax=zf?x+t:x+sg*(w/2+.06),az=zf?z+sg*(d/2+.06):z+t;
   if(f==f0&&i==(n>>1)){DO.push([ax,1.15,az,rot,DC[R()*4|0]]);continue}
   for(let y=2.1;y<h-.6;y+=2.4){(R()<.35?WL:WU).push([ax,y,az,rot]);WF.push([ax,y,az,rot])}}}}
function kamp(x,z,sz){for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){if(R()<.15)continue;house(x+i*10+(R()-.5)*2,z+j*10+(R()-.5)*2,6+R()*3.5,6+R()*3.5,3.4+R()*3.5,WC[R()*8|0],RC[R()*6|0],1.6+R()*1.2)}B.push({x,z,hx:sz/2,hz:sz/2});if(R()<.25)PT.push([x+(R()-.5)*20,z+(R()-.5)*20])}
function villa(x,z,w,d){house(x,z,w,d,5.5,0xf2ead8,RC[R()*3|0],3.4);B.push({x,z,hx:w/2,hz:d/2});for(let i=0;i<3;i++)PT.push([x+(R()-.5)*(w+14),z+(R()-.5)*(d+14)])}
LM.forEach((l,i)=>{if(i==9){B.push({x:218,z:111,hx:9.5,hz:21});return}if(i==0||i==1){B.push({x:l[0],z:l[1],hx:i==1?30:l[2]/2,hz:i==1?30:l[3]/2});return}bld(l[0],l[1],l[2],l[3],l[4],l[4]>=100?0:3,l[5])});
for(let gx=-620;gx<=620;gx+=48)for(let gz=-570;gz<=880;gz+=48){
 const x=gx+(R()-.5)*14,z=gz+(R()-.5)*14,rv=(x<-330&&x>-570)||x>290,mt=!rv&&x>-100&&x<400&&z>380&&z<880,xc=-125-(z-125)*.07,cor=z>150&&Math.abs(x-xc)<110&&!rv;
 const w=(rv?30:mt?18:22)+R()*(rv?0:mt?8:14),d=(rv?30:mt?18:22)+R()*(rv?0:mt?8:14),rad=Math.max(w,d)*.62;
 if(R()<(rv?.04:.1)||dR(x,z)[0]<rad+3||inPark(x,z,rad+4)||LM.some(l=>Math.abs(l[0]-x)<l[2]/2+rad&&Math.abs(l[1]-z)<l[3]/2+rad))continue;
 if(rv)kamp(x,z,w);else if(mt)villa(x,z,w,d);else if(cor)bld(x,z,w,d,60+R()*110,R()<.5?0:1);else bld(x,z,w,d,10+R()*40,2+(R()<.5?1:0))}
// landmarks
C.push({x:-150,z:700,r:31});
// ===== LANDMARKS (detailed, modelled on the real monuments) =====
{const SQ2=Math.SQRT2,PI=Math.PI,S=(c,r,m)=>{const o=new _Std(Object.assign({color:c,roughness:r==null?.6:r,metalness:m||0}));return o},
 ad=(geo,m,x,y,z,ry,par)=>{const o=new T.Mesh(geo,m);o.position.set(x,y,z);if(ry)o.rotation.y=ry;(par||sc).add(o);return o},
 bx=(w,h,d,x,y,z,m,ry,par)=>ad(new T.BoxGeometry(w,h,d),m,x,y,z,ry,par),
 sqp=(sb,st,h,x,y,z,m,par)=>ad(new T.CylinderGeometry(st*SQ2,sb*SQ2,h,4,1),m,x,y,z,PI/4,par),
 cvT=(w,h,fn,rx,ry)=>{const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(rx||1,ry||1);return t},
 BRZ=gxReg(S(0x7a5530,.42,.8)),GOLD=gxReg(S(0xd9a520,.2,.95)),STEEL=gxReg(S(0xcfd4d8,.25,.9));
 GOLD.emissive=new T.Color(0xff9a20);GOLD.emissiveIntensity=0;GX.bm.push(GOLD);GX.nl=GX.nl||[];GX.an=GX.an||[];
 // bronze statue figure; arm angles: 0 = hanging, ~2.6 = raised
 const fig=(par,x,y,z,ry,s,aL,aR,fem)=>{const g=new T.Group();g.position.set(x,y,z);g.rotation.y=ry;g.scale.setScalar(s);par.add(g);
  const b=(w,h,d,px,py,pz)=>bx(w,h,d,px,py,pz,BRZ,0,g);
  if(fem){b(.62,.95,.46,0,.5,0);b(.2,.12,.26,-.13,.06,.05);b(.2,.12,.26,.13,.06,.05)}else{b(.27,.92,.3,-.17,.46,0);b(.27,.92,.3,.17,.46,0)}
  b(.6,.72,.36,0,1.3,0);b(.3,.34,.32,0,1.86,0);b(.32,.1,.34,0,2.06,-.01);
  const arm=(sx,a)=>{const p=new T.Group();p.position.set(sx*.4,1.6,0);p.rotation.z=sx*a;g.add(p);bx(.19,.74,.21,0,-.36,0,BRZ,0,p);return p};
  return{g,L:arm(-1,aL),R:arm(1,aR)}};

 // ---------------- MONAS (Monumen Nasional) ----------------
 // real proportions: square "cawan" (cup) pedestal with flared rim, tapering white obelisk,
 // observation deck, stepped flame plinth and the golden "Lidah Api" flame
 const MW=GW(S(0xf3efe6,.6)),MB=GW(S(0xe4dfd2,.75)),MR=S(0xcbc3b0,.8),MDK=gxReg(S(0x2c3640,.15,.6));
 GX.nl.push([MW,.32,0xfff1d6]);MW.emissive=new T.Color(0xfff1d6);MW.emissiveIntensity=0;
 // low perimeter fence + entrance gaps on the terrace
 for(const s of[-1,1]){bx(15,1.1,.35,-11.5,1.65,s*19.5,MR);bx(15,1.1,.35,11.5,1.65,s*19.5,MR);bx(.35,1.1,15,s*19.5,1.65,-11.5,MR);bx(.35,1.1,15,s*19.5,1.65,11.5,MR)}
 for(const p of[[-4,-19.5],[4,-19.5],[-4,19.5],[4,19.5],[-19.5,-4],[-19.5,4],[19.5,-4],[19.5,4]])bx(.8,2.2,.8,p[0],2.2,p[1],MR);
 // cup pedestal: straight lower walls with relief panels, then the flared rim
 sqp(13,13,7,0,4.6,0,MB);
 for(let f=0;f<4;f++){const a=f*PI/2,c=Math.cos(a),s=Math.sin(a);for(const o of[-8,0,8]){const m=bx(6,4.4,.3,o*c+13.1*s,4.8,-o*s+13.1*c,MR);m.rotation.y=a}
  const t=bx(26.4,.5,.4,13.15*s,7.9,13.15*c,MR);t.rotation.y=a;const t2=bx(26.4,.5,.4,13.15*s,1.6,13.15*c,MR);t2.rotation.y=a}
 sqp(13,17,4.6,0,10.4,0,MB);
 bx(34.8,.6,34.8,0,13,0,MR);
 for(let f=0;f<4;f++){const a=f*PI/2,m=bx(34.4,.9,.3,17.2*Math.sin(a),13.75,17.2*Math.cos(a),MB);m.rotation.y=a}
 // obelisk
 sqp(5.4,4.8,2.6,0,14.6,0,MW);
 sqp(4.3,2.6,64,0,47.9,0,MW);

 // observation deck ("pelataran puncak")
 bx(7.8,.5,7.8,0,80.15,0,MW);bx(7.4,1.3,7.4,0,81.05,0,MDK);for(const p of[[-3.6,-3.6],[3.6,-3.6],[-3.6,3.6],[3.6,3.6]])bx(.4,1.3,.4,p[0],81.05,p[1],MW);
 bx(8.2,.45,8.2,0,81.9,0,MW);
 // stepped flame plinth
 sqp(2.7,2.3,1.8,0,83,0,MW);bx(3.6,.4,3.6,0,84.1,0,BRZ);sqp(1.6,1.3,1.2,0,84.9,0,BRZ);
 // golden flame: lathe body + licking tongues
 {const fl=new T.Group();fl.position.set(0,85.5,0);sc.add(fl);
  const pr=[[0,0],[1.1,.15],[1.6,.9],[1.75,1.9],[1.5,3],[1.05,4.2],[.6,5.3],[.25,6.3],[0,7]].map(p=>new T.Vector2(p[0],p[1]));
  ad(new T.LatheGeometry(pr,16),GOLD,0,0,0,0,fl);
  for(let i=0;i<7;i++){const a=i/7*PI*2,c=ad(new T.ConeGeometry(.55,3.4-(i%2)*.8,6),GOLD,Math.sin(a)*1.25,3.4+(i%3)*.5,Math.cos(a)*1.25,0,fl);c.rotation.set(Math.cos(a)*.42,a,-Math.sin(a)*.42)}
  ad(new T.ConeGeometry(.45,2.4,6),GOLD,.15,7.3,0,0,fl).rotation.z=-.15;
  GX.an.push(t=>{fl.rotation.y=Math.sin(t*.6)*.05})}
 // park axes: paved paths from the plaza to the edge of Medan Merdeka
 const PV=GW(S(0xd9d3c3,.9));for(const s of[-1,1]){bx(8,.08,64,0,.32,s*80,PV);bx(64,.08,8,s*80,.32,0,PV)}
 B.push({x:0,z:0,hx:20,hz:20});

 // ---------------- MASJID ISTIQLAL ----------------
 {const cx=215,cz=-235,WT=gxReg(S(0xf0efea,.55));
  const facade=cvT(256,128,(g,w,h)=>{g.fillStyle='#efeee9';g.fillRect(0,0,w,h);for(let r=0;r<4;r++)for(let c=0;c<8;c++){const x=c*32+5,y=r*32+5;g.fillStyle='#46525c';g.fillRect(x,y,22,24);g.strokeStyle='#efeee9';g.lineWidth=2;g.beginPath();g.moveTo(x,y);g.lineTo(x+22,y+24);g.moveTo(x+22,y);g.lineTo(x,y+24);g.moveTo(x+11,y);g.lineTo(x+11,y+24);g.stroke()}},3,1);
  const FM=GW(new _Std({map:facade,roughness:.6})),fm2=facade.clone();fm2.needsUpdate=true;fm2.repeat.set(4,.35);const FM2=GW(new _Std({map:fm2,roughness:.6}));
  const dt=facade.clone();dt.needsUpdate=true;dt.repeat.set(10,.45);const DRM=new _Std({map:dt,roughness:.55});
  bx(60,5,60,cx,2.75,cz,FM2);bx(61,.5,61,cx,5.4,cz,WT);
  bx(52,19,52,cx,15.15,cz,FM);bx(53.2,.8,53.2,cx,25,cz,WT);
  for(const p of[[-26,-26],[26,-26],[-26,26],[26,26]])bx(3,24,3,cx+p[0],13,cz+p[1],WT);
  ad(new T.CylinderGeometry(17,17.5,6,40),DRM,cx,28.4,cz);
  ad(new T.CylinderGeometry(17.6,17.6,.6,40),WT,cx,31.6,cz);
  const DOM=gxReg(S(0xe3e6e8,.32,.55));ad(new T.SphereGeometry(17,40,20,0,PI*2,0,PI/2),DOM,cx,31.6,cz);
  ad(new T.CylinderGeometry(.25,.4,6,8),STEEL,cx,51.5,cz);
  {const cr=ad(new T.TorusGeometry(1.1,.18,8,20,PI*1.35),STEEL,cx,55.4,cz);cr.rotation.z=PI*.33;ad(new T.OctahedronGeometry(.4),STEEL,cx+.2,55.6,cz)}
  // entrance hall with the small dome (west, facing Jl. Juanda side)
  bx(16,9,16,cx-36,4.75,cz+14,FM);bx(16.8,.6,16.8,cx-36,9.5,cz+14,WT);ad(new T.SphereGeometry(6.5,24,12,0,PI*2,0,PI/2),DOM,cx-36,9.8,cz+14);ad(new T.CylinderGeometry(.15,.25,3,6),STEEL,cx-36,17.6,cz+14);
  B.push({x:cx-36,z:cz+14,hx:8,hz:8});
  // minaret (66.66 m in real life): fluted white shaft, balconies, stainless steel spire
  const mp=dR(cx+34,cz+34)[0]>5?[cx+34,cz+34]:[cx+25,cz+25];
  ad(new T.CylinderGeometry(2.4,2.8,3,16),WT,mp[0],1.5,mp[1]);ad(new T.CylinderGeometry(1.9,2.2,44,16),WT,mp[0],25,mp[1]);
  for(const y of[18,32,44]){ad(new T.CylinderGeometry(3,2.4,1,16),WT,mp[0],y,mp[1]);for(let i=0;i<12;i++){const a=i/12*PI*2;bx(.12,1,.12,mp[0]+Math.sin(a)*2.9,y+1,mp[1]+Math.cos(a)*2.9,WT)}}
  ad(new T.CylinderGeometry(1.4,1.8,6,16),WT,mp[0],50,mp[1]);ad(new T.ConeGeometry(1.4,16,16),STEEL,mp[0],61,mp[1]);
  C.push({x:mp[0],z:mp[1],r:3.2})}

 // ---------------- STASIUN GAMBIR (elevated station) ----------------
 {const cx=178,cz=-30,gt=cvT(256,128,(g,w,h)=>{g.fillStyle='#f3f1ea';g.fillRect(0,0,w,h);g.fillStyle='#2f8f6a';g.fillRect(0,0,w,14);g.fillRect(0,h-10,w,10);for(let r=0;r<2;r++)for(let c=0;c<8;c++){g.fillStyle='#3d5563';g.fillRect(c*32+6,24+r*48,20,30);g.fillStyle='#2f8f6a';g.fillRect(c*32+4,20+r*48,24,4)}},3,1);
  const GM=GW(new _Std({map:gt,roughness:.6})),GR=gxReg(S(0x2f8f6a,.45,.35)),GC=S(0xe9e6de,.7),RL=S(0x3a3a3a,.6,.5);GR.side=T.DoubleSide;
  bx(36,10,56,cx,5.25,cz,GM);bx(38,1,62,cx,10.75,cz,GC);
  for(const sx of[-1,1]){const r=ad(new T.CylinderGeometry(9.2,9.2,62,20,1,true,PI/2,PI),GR,cx+sx*9.3,11.2,cz);r.rotation.x=PI/2;for(let z=-28;z<=28;z+=8)bx(.5,4,.5,cx+sx*18.2,13.3,cz+z,GC);}
  for(const x of[-12,-6,6,12])bx(.25,.25,62,cx+x,11.4,cz,RL);
  const sg=cvT(512,96,(g,w,h)=>{g.fillStyle='#173f31';g.fillRect(0,0,w,h);g.fillStyle='#fff';g.font='bold 54px Arial';g.textAlign='center';g.fillText('STASIUN GAMBIR',w/2,66)});
  const s=ad(new T.PlaneGeometry(16,3),new T.MeshBasicMaterial({map:sg}),cx-18.15,7.2,cz);s.rotation.y=-PI/2}

 // ---------------- GEREJA KATEDRAL JAKARTA (neo-Gothic) ----------------
 {const cx=218,cz=110,ST=GW(S(0xdedad0,.75)),RF=S(0x545a62,.6,.2),SP=gxReg(S(0x5d636b,.45,.6)),DK=S(0x232a3a,.3,.3);
  const wt=cvT(128,128,(g)=>{g.fillStyle='#dedad0';g.fillRect(0,0,128,128);g.fillStyle='#26304a';g.beginPath();g.moveTo(44,112);g.lineTo(44,48);g.quadraticCurveTo(44,18,64,10);g.quadraticCurveTo(84,18,84,48);g.lineTo(84,112);g.fill();g.strokeStyle='#dedad0';g.lineWidth=3;g.beginPath();g.moveTo(64,14);g.lineTo(64,112);g.moveTo(44,70);g.lineTo(84,70);g.stroke()},6,1);
  const NV=GW(new _Std({map:wt,roughness:.75}));
  bx(16,16,28,cx,8.25,cz,NV);
  {const r=ad(new T.CylinderGeometry(9.24,9.24,28.4,3,1,false,PI),RF,cx,20.87,cz);r.rotation.x=PI/2}
  {const a=ad(new T.CylinderGeometry(8,8,16,16,1,false,-PI/2,PI),ST,cx,8.25,cz+14);ad(new T.ConeGeometry(8.4,7,16,1,false,-PI/2,PI),RF,cx,19.75,cz+14);void a}
  for(const sx of[-1,1]){const tx=cx+sx*6.5,tz=cz-16.5;bx(5.6,30,5.6,tx,15.25,tz,ST);bx(6.2,.6,6.2,tx,30.4,tz,ST);
   for(let f=0;f<4;f++){const a=f*PI/2,m=bx(1.4,4.5,.15,tx+Math.sin(a)*2.86,25,tz+Math.cos(a)*2.86,DK);m.rotation.y=a}
   ad(new T.ConeGeometry(3.3,22,8),SP,tx,41.7,tz);for(const p of[[-2.6,-2.6],[2.6,-2.6],[-2.6,2.6],[2.6,2.6]])ad(new T.ConeGeometry(.45,3.4,6),SP,tx+p[0],32.4,tz+p[1]);
   ad(new T.OctahedronGeometry(.5),GOLD,tx,53.2,tz)}
  bx(7.4,22,1.6,cx,11.25,cz-16.8,ST);{const g=ad(new T.ConeGeometry(4.4,5,4),ST,cx,24.6,cz-16.8,PI/4);g.scale.z=.3}
  const rose=cvT(128,128,(g)=>{g.fillStyle='#dedad0';g.fillRect(0,0,128,128);g.fillStyle='#22305a';g.beginPath();g.arc(64,64,60,0,7);g.fill();g.strokeStyle='#e9e2c8';g.lineWidth=4;for(let i=0;i<12;i++){const a=i/12*6.283;g.beginPath();g.moveTo(64,64);g.lineTo(64+Math.cos(a)*60,64+Math.sin(a)*60);g.stroke()}g.beginPath();g.arc(64,64,22,0,7);g.stroke();g.beginPath();g.arc(64,64,60,0,7);g.stroke();g.fillStyle='#b0303a';g.beginPath();g.arc(64,64,10,0,7);g.fill()});
  {const r=ad(new T.CircleGeometry(2.6,24),new T.MeshBasicMaterial({map:rose}),cx,15.5,cz-17.65);r.rotation.y=PI}
  bx(3,5.6,.3,cx,3.05,cz-17.7,DK);
  ad(new T.ConeGeometry(1.3,12,8),SP,cx,36,cz+6)}

 // ---------------- SELAMAT DATANG MONUMENT (Bundaran HI) ----------------
 {const cx=-150,cz=700,RM=S(0xcfc7b8,.8),PD=GW(S(0xd8d2c4,.7));
  ad(new T.CylinderGeometry(32,32.4,1,48),RM,cx,.5,cz);ad(new T.CylinderGeometry(31,31,.9,48),waterMat(0x2f86a3),cx,.6,cz);
  ad(new T.CylinderGeometry(12.6,12.6,1.6,40),RM,cx,.8,cz);ad(new T.CylinderGeometry(12,12,1.5,40),waterMat(0x2f86a3),cx,.9,cz);
  const JM=new T.MeshBasicMaterial({color:0xeaf6ff,transparent:true,opacity:.55}),jets=[];
  for(let i=0;i<20;i++){const a=i/20*PI*2;jets.push(ad(new T.ConeGeometry(.35,4,6),JM,cx+Math.sin(a)*22,2.6,cz+Math.cos(a)*22))}
  for(let i=0;i<8;i++){const a=i/8*PI*2;jets.push(ad(new T.ConeGeometry(.3,6,6),JM,cx+Math.sin(a)*8,4.4,cz+Math.cos(a)*8))}
  GX.an.push(t=>jets.forEach((j,i)=>{j.scale.y=.75+.35*Math.sin(t*2.2+i*.7)}));
  bx(6,2.2,6,cx,2.7,cz,PD);sqp(2,1.35,17,cx,12.3,cz,PD);bx(3.4,.5,3.4,cx,21,cz,PD);
  const g=new T.Group();g.position.set(cx,21.25,cz);g.rotation.y=PI;sc.add(g);
  fig(g,-.75,0,0,0,2.4,.35,2.75,false);const w=fig(g,.75,0,0,0,2.25,.3,2.35,true);
  ad(new T.SphereGeometry(.28,10,8),gxReg(S(0x8a6a3a,.45,.75)),0,-.85,0,0,w.R)}

 // ---------------- MONUMEN PEMBEBASAN IRIAN BARAT (Lapangan Banteng) ----------------
 {const cx=260,cz=0,PD=GW(S(0xc9c4b8,.75));
  bx(12,1.2,12,cx,.6,cz,PD);bx(8,1.4,8,cx,1.9,cz,PD);sqp(2.4,1.6,24,cx,14.6,cz,PD);bx(4,.6,4,cx,26.9,cz,PD);
  const f=fig(sc,cx,27.2,cz,PI*.5,3.2,2.45,2.45,false);
  for(const a of[f.L,f.R])for(let i=0;i<3;i++){const t=ad(new T.TorusGeometry(.09,.03,6,10),BRZ,0,-.78-i*.15,0,0,a);t.rotation.y=i%2?PI/2:0}
  C.push({x:cx,z:cz,r:6})}

 // ---------------- PINTU GERBANG PASAR BARU (gate over the street) ----------------
 {const p=[181,-500],d=[.148,-.989],n=[.989,.148],g=new T.Group();g.position.set(p[0],0,p[1]);g.rotation.y=Math.atan2(-n[1],n[0]);sc.add(g);
  const RD_=S(0xa31d1d,.55),GD_=gxReg(S(0xd8a630,.3,.8)),TL=S(0x2f6b3a,.6);
  for(const s of[-1,1]){bx(1.8,9,1.8,s*16,4.5,0,RD_,0,g);bx(2.4,.6,2.4,s*16,.3,0,GD_,0,g);bx(2.2,.5,2.2,s*16,9.1,0,GD_,0,g)}
  bx(34.5,2.4,1.2,0,10.4,0,RD_,0,g);bx(35,.3,1.5,0,9.1,0,GD_,0,g);bx(35,.3,1.5,0,11.7,0,GD_,0,g);
  bx(36,.5,3.6,0,12.2,0,TL,0,g);bx(30,1.2,2.2,0,13,0,TL,0,g);for(const s of[-1,1]){const c=ad(new T.ConeGeometry(.6,1.6,4),TL,s*18.2,12.9,0,0,g);c.rotation.z=s*.9}
  const st=cvT(1024,96,(c,w,h)=>{c.fillStyle='#a31d1d';c.fillRect(0,0,w,h);c.fillStyle='#ffd34d';c.font='bold 64px Georgia';c.textAlign='center';c.fillText('PASAR BAROE  ·  1820',w/2,70)});
  for(const s of[-1,1]){const m=ad(new T.PlaneGeometry(30,2.1),new T.MeshBasicMaterial({map:st}),0,10.4,s*.62,s<0?PI:0,g)}
  void d}

 // ---------------- name signs on famous Thamrin buildings ----------------
 const nsg=(txt,fg,bg)=>cvT(1024,192,(g,w,h)=>{g.fillStyle=bg;g.fillRect(0,0,w,h);g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';let fs=124;g.font='bold '+fs+'px Arial';while(g.measureText(txt).width>950&&fs>30){fs-=6;g.font='bold '+fs+'px Arial'}g.fillText(txt,w/2,h/2+6)});
 const sign=(i,txt,fg,bg,face)=>{const[x,z,w,d,h]=LM[i],ew=face=='w'||face=='e'?d:w,sw=Math.min(ew*.8,34),sh=sw*.1875,ry={n:PI,s:0,e:PI/2,w:-PI/2}[face],
   ox=face=='e'?w/2+.25:face=='w'?-w/2-.25:0,oz=face=='s'?d/2+.25:face=='n'?-d/2-.25:0;
   ad(new T.PlaneGeometry(sw,sh),new T.MeshBasicMaterial({map:nsg(txt,fg,bg)}),x+ox,h+.25-sh/2-2.2,z+oz,ry)};
 sign(2,'SARINAH','#e01b24','#f6f4ee','w');sign(3,'BANK INDONESIA','#e8c46a','#0d2a52','e');sign(4,'GRAND INDONESIA','#ffffff','#1b1f2a','e');
 sign(5,'PLAZA INDONESIA','#d9b25a','#121212','w');sign(6,'HOTEL INDONESIA KEMPINSKI','#ff3a3a','#101010','w');sign(7,'THAMRIN NINE','#ffffff','#0e0e10','e');
 {const[x,z,,,h]=LM[7];sqp(6,3,14,x,h+7.5,z,gxReg(S(0x9fb4c4,.25,.6)));ad(new T.CylinderGeometry(.3,.5,22,8),STEEL,x,h+25,z);const bl=new T.Mesh(new T.SphereGeometry(.6,8,6),new T.MeshBasicMaterial({color:0xff2020}));bl.position.set(x,h+36.5,z);sc.add(bl)}
}

// trees
const TP=[],inB=(x,z)=>B.some(b=>Math.abs(x-b.x)<b.hx+2&&Math.abs(z-b.z)<b.hz+2);
function tree(x,z){TP.push([x,z]);C.push({x,z,r:.9})}

// ---- JAKARTA-ISH CITY DRESSING ----
const KO=[[113,-20],[-20,425],[141,-230],[-150,650],[-126.6,300]],ok=(x,z)=>!KO.some(k=>H(x-k[0],z-k[1])<14);
PT.forEach(p=>{if(!inB(p[0],p[1])&&dR(p[0],p[1])[0]>3&&!inPark(p[0],p[1],0))tree(p[0],p[1])});
{const inst=(g,m,list,fn)=>{const im=new T.InstancedMesh(g,m,list.length),o=new T.Object3D(),c=new T.Color();list.forEach((e,i)=>{o.rotation.set(0,0,0);o.scale.set(1,1,1);fn(e,o,im,i,c);o.updateMatrix();im.setMatrixAt(i,o.matrix)});im.frustumCulled=false;sc.add(im);DEC.push(im);return im};
 // kampung houses + villas (instanced walls & terracotta/tin hip roofs)
 inst(new T.BoxGeometry(1,1,1),GW(new T.MeshLambertMaterial({color:0xffffff})),HS,(h,o,im,i,c)=>{o.position.set(h[0],h[4]/2+.2,h[1]);o.scale.set(h[2],h[4],h[3]);im.setColorAt(i,c.set(h[5]))});
 inst(new T.ConeGeometry(1,1,4),GW(new T.MeshLambertMaterial({color:0xffffff})),HS,(h,o,im,i,c)=>{o.position.set(h[0],h[4]+.2+h[7]/2,h[1]);o.rotation.y=Math.PI/4;o.scale.set(h[2]*.78,h[7],h[3]*.78);im.setColorAt(i,c.set(h[6]))});
 const wp=(p,o)=>{o.position.set(p[0],p[1],p[2]);o.rotation.y=p[3]};
 inst(new T.BoxGeometry(1.45,1.45,.1),mat(0xf3efe2),WF,wp);inst(new T.BoxGeometry(1.05,1.1,.16),mat(0x2a3f55),WU,wp);inst(new T.BoxGeometry(1.05,1.1,.16),new T.MeshBasicMaterial({color:0xffd98a}),WL,wp);
 inst(new T.BoxGeometry(1.05,2.1,.16),GW(new T.MeshLambertMaterial({color:0xffffff})),DO,(p,o,im,i,c)=>{wp(p,o);im.setColorAt(i,c.set(p[4]))});
 // lane dashes
 inst(new T.BoxGeometry(.25,.1,4),mat(0xf2f2f2),DSH,(d,o)=>{o.position.set(d[0],.125,d[1]);o.rotation.y=d[2]});
 // street lamps + sidewalk trees
 const LP=[];RDS.forEach(r=>{if(r.lp)return;for(let i=0;i<r.ns;i++){const a=r.p[i],b=r.p[i+1],dx=b[0]-a[0],dz=b[1]-a[1],l=H(dx,dz),nx=dz/l,nz=-dx/l;
  for(let t=15;t<l-10;t+=42)for(const q of[-1,1]){const o=q*(r.hw+1.8),x=a[0]+dx/l*t+nx*o,z=a[1]+dz/l*t+nz*o;if(dR(x,z)[0]>.5&&ok(x,z))LP.push([x,z])}
  for(let t=25;t<l-10;t+=30)for(const q of[-1,1]){const o=q*(r.hw+4.2),x=a[0]+dx/l*t+nx*o,z=a[1]+dz/l*t+nz*o;if(R()<.8&&ok(x,z)&&!inB(x,z)&&!inPark(x,z,2)&&dR(x,z)[0]>2.5)tree(x,z)}}});
 inst(new T.BoxGeometry(.25,7,.25),mat(0x555a60),LP,(p,o)=>o.position.set(p[0],3.6,p[1]));
 inst(new T.BoxGeometry(1.4,.3,.6),new T.MeshBasicMaterial({color:0xfff0b8}),LP,(p,o)=>o.position.set(p[0],7.2,p[1]))}
// pedestrian bridges (JPO)
function jpo(rd,s){const q=posAt(rd,s,1,0),p=[q[3],-q[2]],th=Math.atan2(p[0],p[1]),L=rd.hw+4,y=7,X=(o)=>q[0]+p[0]*o,Z=(o)=>q[1]+p[1]*o;
 box(3,.5,2*L,q[0],y,q[1],0xb8b8b0,th);box(3.6,.25,2*L+1,q[0],y+2.8,q[1],0x3f9a72,th);
 for(const g of[-1,1]){box(1.3,y,1.3,X(g*L),y/2,Z(g*L),0x9c9c96);const m=box(3,.35,10.6,X(g*(L+4)),y/2,Z(g*(L+4)),0xa8a8a0);m.rotation.set(g*.72,th,0,'YXZ')}}
[[RDS[4],120],[RDS[4],300],[RDS[4],430],[RDS[5],80],[RDS[6],200],[RDS[7],150]].forEach(a=>jpo(a[0],a[1]));
// elevated toll road along the west canal
{box(14,1.4,1480,-470,10,150,0x9a9a96);box(.6,1.3,1480,-477,11.3,150,0xb4b4ae);box(.6,1.3,1480,-463,11.3,150,0xb4b4ae);
 for(let z=-560;z<=880;z+=36)if(dR(-470,z,1)[0]>3&&!inB(-470,z)){cyl(1.4,10,-470,5,z,0x8a8a86);box(10,1.2,2.4,-470,9,z,0x9a9a96);C.push({x:-470,z,r:1.7})}}

// ---- PERTAMINA STATIONS (gasoline + EV) & FUEL ----
const STN=[];
const sgn=(top,bot,txt,sub)=>{const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,256,128);g.fillStyle=top;g.fillRect(0,0,256,26);g.fillStyle=bot;g.fillRect(0,102,256,26);g.fillStyle='#00a651';g.fillRect(0,96,256,6);g.fillStyle='#111';g.textAlign='center';g.font='bold 38px Arial';g.fillText(txt,128,68);g.font='bold 14px Arial';g.fillText(sub,128,88);return new T.MeshBasicMaterial({map:new T.CanvasTexture(c)})};
const SGP=sgn('#e30613','#0072bc','PERTAMINA','SPBU · Pertalite · Pertamax'),SGE=sgn('#00a651','#0072bc','SPKLU','EV CHARGING · Pertamina');
const inF=(x,z,ox,oz,th,m)=>{const dx=x-ox,dz=z-oz,lx=dx*Math.cos(th)-dz*Math.sin(th),lz=dx*Math.sin(th)+dz*Math.cos(th);return lx>-m&&lx<32+m&&Math.abs(lz)<26+m};
function station(ox,oz,th){const S=new T.Group();S.position.set(ox,0,oz);S.rotation.y=th;sc.add(S);
 const a=(w,h,d,x,y,z,c)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),c.isMaterial?c:mat(c));m.position.set(x,y,z);S.add(m);return m},L=(x,z)=>[ox+Math.cos(th)*x+Math.sin(th)*z,oz-Math.sin(th)*x+Math.cos(th)*z],st={x:L(14,0)[0],z:L(14,0)[1],ox,oz,th,g:[],e:[]},cc=(x,z,r)=>{const p=L(x,z);C.push({x:p[0],z:p[1],r})};
 a(32,.08,50,15,.04,0,0xb9b6ae);a(12,.03,18,8,.095,14,0x7dcea0);
 a(16,.4,24,9,6.7,-10,0xffffff);a(16.2,.5,24.2,9,6.25,-10,0xe30613);a(16.2,.15,24.2,9,6,-10,0x0072bc);
 for(const x of[3,15])for(const z of[-20,0]){a(.6,6,.6,x,3,z,0xeeeeee);cc(x,z,.7)}
 for(const z of[-14,-6]){a(10,.35,1.4,9,.25,z,0x888888);[[6,0x00a651],[12,0x0072bc]].forEach(([x,col])=>{a(.9,1.7,.7,x,1.1,z,0xe30613);a(.92,.25,.72,x,1.3,z,col);a(.8,.5,.72,x,1.8,z,0x1b2a41);st.g.push(L(x,z));cc(x,z,.9)})}
 a(12,.4,18,8,5.6,14,0x00a651);a(12.2,.15,18.2,8,5.35,14,0xffffff);for(const x of[3,13])for(const z of[6,22]){a(.5,5.4,.5,x,2.7,z,0xeeeeee);cc(x,z,.6)}
 for(const z of[9,19])for(const x of[6,11]){a(.7,1.8,.5,x,1,z,0xf5f5f5);a(.5,.5,.52,x,1.5,z,0x00a651);a(.1,1.2,.1,x+.4,.9,z,0x222222);st.e.push(L(x,z));cc(x,z,.7)}
 a(8,4.5,16,26,2.3,-8,0xf4f4f4);a(8.1,.9,16.1,26,3.9,-8,0xe30613);a(8.1,.5,16.1,26,3.2,-8,0x0072bc);a(.15,2,12,21.9,1.6,-8,0x6fb4e8);for(const z of[-14,-8,-2])cc(26,z,4.3);
 a(.6,12,.6,2,6,-24,0x666666);a(.3,4,8,2,10.5,-24,SGP);a(.6,12,.6,2,6,24,0x666666);a(.3,4,8,2,10.5,24,SGE);STN.push(st)}
{const roads=RDS.filter(r=>!r.lp&&r.len>250);let tries=0;
 while(STN.length<6&&tries++<500){const r=roads[(R()*roads.length)|0],q=posAt(r,40+R()*(r.len-80),1,0),sd=R()<.5?1:-1,nx=q[3]*sd,nz=-q[2]*sd,ox=q[0]+nx*(r.hw+3.5),oz=q[1]+nz*(r.hw+3.5),th=Math.atan2(-nz,nx);
  if(STN.some(t=>H(t.x-ox,t.z-oz)<220)||!ok(ox,oz))continue;let good=1;
  for(let lx=0;lx<=31&&good;lx+=8)for(let lz=-24;lz<=24;lz+=8){const x=ox+Math.cos(th)*lx+Math.sin(th)*lz,z=oz-Math.sin(th)*lx+Math.cos(th)*lz;if(inB(x,z)||inPark(x,z,2)||dR(x,z)[0]<2){good=0;break}}
  if(!good)continue;
  for(let i=C.length-1;i>=0;i--)if(inF(C[i].x,C[i].z,ox,oz,th,1))C.splice(i,1);for(let i=TP.length-1;i>=0;i--)if(inF(TP[i][0],TP[i][1],ox,oz,th,1))TP.splice(i,1);
  
  station(ox,oz,th)}}

// ---- JAKARTA ARMS gun stores ----
const STO=[];
const inS=(x,z,ox,oz,th,m)=>{const dx=x-ox,dz=z-oz,lx=dx*Math.cos(th)-dz*Math.sin(th),lz=dx*Math.sin(th)+dz*Math.cos(th);return lx>-m&&lx<22+m&&Math.abs(lz)<14+m};
const SGA=(()=>{const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');g.fillStyle='#15171c';g.fillRect(0,0,256,128);g.strokeStyle='#f2b705';g.lineWidth=6;g.strokeRect(5,5,246,118);g.fillStyle='#f2b705';g.textAlign='center';g.font='bold 34px Arial';g.fillText('JAKARTA ARMS',128,62);g.fillStyle='#fff';g.font='bold 15px Arial';g.fillText('GUNS · AMMO · LICENSED',128,92);return new T.MeshBasicMaterial({map:new T.CanvasTexture(c)})})();
const PEGT=(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');g.fillStyle='#b9bcc2';g.fillRect(0,0,32,32);g.fillStyle='#4a4d55';g.beginPath();g.arc(16,16,3.2,0,7);g.fill();const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(14,4);return t})();
const BANT=(()=>{const c=document.createElement('canvas');c.width=1024;c.height=128;const g=c.getContext('2d');g.fillStyle='#d9d6cf';g.fillRect(0,0,1024,128);g.fillStyle='#c0141c';g.textAlign='center';g.font='italic bold 84px Impact,Arial';g.fillText('JAKARTA ARMS GUN CLUB',512,98);return new T.MeshBasicMaterial({map:new T.CanvasTexture(c)})})();
function store(ox,oz,th){const S=new T.Group();S.position.set(ox,0,oz);S.rotation.y=th;sc.add(S);
 const a=(w,h,d,x,y,z,c)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),c.isMaterial?c:mat(c));m.position.set(x,y,z);S.add(m);return m},L=(x,z)=>[ox+Math.cos(th)*x+Math.sin(th)*z,oz-Math.sin(th)*x+Math.cos(th)*z],cc=(x,z,r)=>{const p=L(x,z);C.push({x:p[0],z:p[1],r})};
 const WL=0x2b2f38,YL=0xf2b705,DK=0x15171c,GL=()=>new T.MeshLambertMaterial({color:0x9fd4f2,transparent:true,opacity:.45});
 a(28,.08,24,10,.04,0,0x9d9a92);a(16.6,.06,19.6,13.1,.1,0,0x4a4d55);a(5,.02,2.4,8.8,.12,0,0x7a1f1f);
 for(const sg of[-1,1]){a(.5,5,7.2,5,2.5,sg*6.4,WL);a(.12,2,2.6,4.7,2.1,sg*6.4,GL());for(const k of[-.8,0,.8])a(.1,2,.08,4.66,2.1,sg*6.4+k,DK)}
 a(.5,1.4,5.8,5,4.3,0,WL);a(.55,.25,6,5,3.65,0,YL);
 const dp=[a(.08,3.3,2.55,5.42,1.7,-1.3,GL()),a(.08,3.3,2.55,5.42,1.7,1.3,GL())];
 for(const sg of[-1,1])a(16.4,5,.5,13.1,2.5,sg*10,WL);a(.5,5,20.5,21.4,2.5,0,0xd9d6cf);
 a(.1,3.8,14,21.05,2.5,0,new T.MeshLambertMaterial({map:PEGT}));a(.1,.9,9.5,21.05,4.55,0,BANT);
 a(21,.4,23,12.5,5.2,0,DK);a(21.2,.2,23.2,12.5,5.45,0,YL);for(const z of[-3.5,3.5])a(15,.1,.3,13,4.95,z,new T.MeshBasicMaterial({color:0xffffff}));
 a(.3,1.7,8.6,4.7,6.5,0,SGA);
 a(1.4,1.1,7.5,10,.55,-5.8,0x4a3a2a);a(1.55,.1,7.7,10,1.15,-5.8,0x222222);a(1.2,.5,6.6,10,1.45,-5.8,new T.MeshLambertMaterial({color:0x9fd4f2,transparent:true,opacity:.35}));a(.5,.35,.5,10,1.4,-3.4,0x333333);
 for(let z=-9.4;z<=-2.2;z+=.9)a(.05,2.4,.05,12.2,2.2,z,0x333333);a(.05,.05,7.4,12.2,3.4,-5.8,0x333333);
 a(1.2,.8,1.2,9,.4,7.2,0x5a4a2a);a(1,.7,1,9.3,1.15,7.3,0x6b5a3a);a(1.2,.8,1.2,10.6,.4,8.4,0x5a4a2a);cc(9.6,7.7,1.5);
 for(const sg of[-1,1])for(let z=2.9;z<=10;z+=.8)cc(5,sg*z,.5);for(let z=-2.4;z<=2.4;z+=.8)cc(5,z,.5);for(let x=5.5;x<=21.5;x+=.8){cc(x,-10,.5);cc(x,10,.5)}for(let z=-10;z<=10;z+=.8)cc(21.4,z,.5);for(let z=-9.5;z<=-2.1;z+=.8)cc(10,z,.9);
 const d=L(3.4,0),mk2=new T.Mesh(new T.CylinderGeometry(1.2,1.2,26,12,1,true),new T.MeshBasicMaterial({color:0x4cc9f0,transparent:true,opacity:.35,side:2}));mk2.position.set(d[0],13,d[1]);sc.add(mk2);
 STO.push({x:L(14,0)[0],z:L(14,0)[1],dx:d[0],dz:d[1],ox,oz,th,L,S,dp,o:0,in:0,wv:0})}
{const rs=RDS.filter(r=>!r.lp&&r.len>250);
 for(let n=0;n<2;n++){let tries=0;while(STO.length<=n&&tries++<600){const r=n==0?RDS[4]:rs[(R()*rs.length)|0],q=posAt(r,n==0?120+R()*140:40+R()*(r.len-80),1,0),sd=R()<.5?1:-1,nx=q[3]*sd,nz=-q[2]*sd,ox=q[0]+nx*(r.hw+3.5),oz=q[1]+nz*(r.hw+3.5),th=Math.atan2(-nz,nx);
  if(STN.some(t=>H(t.x-ox,t.z-oz)<60)||STO.some(t=>H(t.x-ox,t.z-oz)<250)||!ok(ox,oz))continue;let good=1;
  for(let lx=0;lx<=21&&good;lx+=7)for(let lz=-14;lz<=14;lz+=7){const x=ox+Math.cos(th)*lx+Math.sin(th)*lz,z=oz-Math.sin(th)*lx+Math.cos(th)*lz;if(inB(x,z)||inPark(x,z,2)||dR(x,z)[0]<2){good=0;break}}
  if(!good)continue;
  for(let i=C.length-1;i>=0;i--)if(inS(C[i].x,C[i].z,ox,oz,th,1))C.splice(i,1);for(let i=TP.length-1;i>=0;i--)if(inS(TP[i][0],TP[i][1],ox,oz,th,1))TP.splice(i,1);
  store(ox,oz,th)}}}

// ---- BANK MANDIRI branches (robbable) ----
const BNK=[];let ROB=null,HOT=0,hotT=0;
const inK=(x,z,ox,oz,th,m)=>{const dx=x-ox,dz=z-oz,lx=dx*Math.cos(th)-dz*Math.sin(th),lz=dx*Math.sin(th)+dz*Math.cos(th);return lx>-m&&lx<33+m&&lz>-12-m&&lz<20+m};
const SGM=(()=>{const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');g.fillStyle='#003d79';g.fillRect(0,0,256,128);g.fillStyle='#fdb913';g.fillRect(0,96,256,9);g.fillRect(0,110,256,5);g.fillStyle='#fff';g.textAlign='center';g.font='bold 56px Arial';g.fillText('mandiri',128,76);return new T.MeshBasicMaterial({map:new T.CanvasTexture(c)})})();
const KEYT=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),rr=(x,y,w,h,r)=>{g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()};
 g.fillStyle='#111';rr(6,10,116,116,20);g.fill();g.fillStyle='#fdb913';rr(6,4,116,110,20);g.fill();g.fillStyle='#f6f6f2';rr(14,10,100,92,14);g.fill();g.fillStyle='#111';g.font='bold 74px Arial';g.textAlign='center';g.fillText('E',64,86);return new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,side:2})})();
function bank(ox,oz,th){const S=new T.Group();S.position.set(ox,0,oz);S.rotation.y=th;sc.add(S);
 const a=(w,h,d,x,y,z,c)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),c.isMaterial?c:mat(c));m.position.set(x,y,z);S.add(m);return m},L=(x,z)=>[ox+Math.cos(th)*x+Math.sin(th)*z,oz-Math.sin(th)*x+Math.cos(th)*z],cc=(x,z,r)=>{const p=L(x,z),o={x:p[0],z:p[1],r};C.push(o);return o};
 const WH_=0xf2f2f2,BL=0x003d79,GD=0xfdb913,SV=0x9aa0a6,RF=0x6b7075,FL=0x7f8388;
 a(34,.08,34,15.5,.04,4,0x9d9a92);a(16,.06,20,14,.1,0,0xd8d2c4);
 for(const z of[-5.9,5.9]){a(.5,5,8.2,6,2.5,z,WH_);a(.12,2.4,5.6,5.7,2.3,z,0x7fb7e6)}a(.5,1.6,3.8,6,4.2,0,BL);
 a(.2,1.1,20.6,5.65,4.4,0,BL);a(.22,.25,20.6,5.62,3.75,0,GD);
 for(const z of[-10,10])a(16,5,.5,14,2.5,z,WH_);
 a(.5,5,7.85,22,2.5,-6.325,WH_);a(.5,5,7.85,22,2.5,6.325,WH_);a(.5,.8,4.8,22,4.6,0,WH_);
 a(17,.5,21,14,5.3,0,BL);a(17.2,.3,21.2,14,4.95,0,GD);a(.3,1.7,9,5.4,6.4,0,SGM);
 a(.5,9,.5,1,4.5,-11,0x666666);a(.3,3,5,1,9.6,-11,SGM);
 a(4,.3,6,4,3.4,0,GD);for(const z of[-3,3])a(.4,3.4,.4,2.3,1.7,z,BL);
 a(.9,1.9,.7,5.3,.95,-8.5,BL);a(.6,.5,.72,5.3,1.5,-8.5,0x9fd4f2);
 a(1.2,1.1,12,12,.6,0,0x5a3c24);a(1.3,.1,12.2,12,1.18,0,BL);a(.1,1,12,12.4,1.75,0,new T.MeshLambertMaterial({color:0x9fd4f2,transparent:true,opacity:.4}));
 for(const z of[-3,3])a(.4,.15,.6,12,1.3,z,0x2e7d32);
 // vault door (slides open), vault room and the escape tunnel
 const vd=new T.Group();vd.position.set(21.9,0,0);const disc=new T.Mesh(new T.CylinderGeometry(2.3,2.3,.5,24),mat(0x8c8f93));disc.rotation.z=Math.PI/2;disc.position.y=2.2;vd.add(disc);
 for(const [w,h,d] of[[.3,.4,3.4],[.3,3.4,.4]]){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(GD));m.position.set(-.3,2.2,0);vd.add(m)}S.add(vd);
 a(.5,4.4,10.5,31,2.2,0,SV);a(9,4.4,.5,26.5,2.2,-5,SV);a(4,4.4,.5,24,2.2,5,SV);a(1.4,4.4,.5,30.3,2.2,5,SV);a(9.5,.4,10.5,26.5,4.6,0,RF);a(9,.06,10,26.5,.1,0,FL);
 a(.3,4.4,12.5,26,2.2,11.25,SV);a(.3,4.4,12.5,29.6,2.2,11.25,SV);a(3.6,.4,12.5,27.8,4.6,11.25,RF);a(3.3,.06,12.5,27.8,.1,11.25,FL);
 a(8,.1,.3,26.5,4.3,0,new T.MeshBasicMaterial({color:0xff3030}));a(1.6,.4,.12,27.8,4,17.5,new T.MeshBasicMaterial({color:0x2ecc71}));
 for(const x of[26.2,29.4])a(.3,3.6,.3,x,1.8,17.5,0x444444);a(3.6,.3,.3,27.8,3.6,17.5,0x444444);
 for(let z=-9.5;z<=9.5;z+=1)if(Math.abs(z)>=3.2)cc(22,z,.6);
 const dc=[-1.6,0,1.6].map(z=>cc(21.9,z,1));
 for(let z=2.4;z<=9.6;z+=1)for(const sg of[-1,1])cc(6,sg*z,.6);for(let x=6.5;x<=21.5;x+=1)for(const sg of[-1,1])cc(x,sg*10,.6);for(let z=-6;z<=6;z+=1.2)cc(12,z,.8);
 for(let z=-4.6;z<=4.6;z+=.8)cc(31,z,.5);for(let x=22.4;x<=30.6;x+=.8)cc(x,-5,.5);for(let x=22.4;x<=25.8;x+=.8)cc(x,5,.5);for(let x=29.8;x<=30.8;x+=.8)cc(x,5,.5);for(let z=5.6;z<=17;z+=.8){cc(26,z,.4);cc(29.6,z,.4)}
 const stacks=[];[...[-4,-2.4,-.8,.8,2.4,4].map(z=>[30,z,0]),...[24,25.6,27.2,28.8].map(x=>[x,-4,0]),[23.2,3.8,1],[24.4,3.8,1],[25.2,3.8,1]].forEach(([lx,lz,gold])=>{const g=new T.Group(),p=L(lx,lz);g.position.set(lx,0,lz);S.add(g);
  const bx=(w,h,d,y,c)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));m.position.y=y;g.add(m)};if(gold){bx(.8,.3,.5,.28,GD);bx(.6,.25,.4,.55,0xe8a800)}else{bx(.9,.55,.7,.38,0x2e7d32);bx(.92,.12,.72,.38,0xe8e8e8)}
  stacks.push({g,x:p[0],z:p[1],v:gold?1500+((R()*1000)|0):600+((R()*800)|0),alive:true})});
 const key=new T.Mesh(new T.PlaneGeometry(1.1,1.1),KEYT);key.position.set(19.3,1.9,0);key.rotation.y=-Math.PI/2;S.add(key);
 const ring=new T.Mesh(new T.RingGeometry(.85,1.1,28),new T.MeshBasicMaterial({color:GD,transparent:true,opacity:.8,side:2}));ring.rotation.x=-Math.PI/2;ring.position.set(19.6,.16,0);S.add(ring);
 const lg=new T.Mesh(new T.BoxGeometry(.8,.5,.8),new T.MeshBasicMaterial({color:0xff2020}));lg.position.set(14,6,0);lg.visible=false;S.add(lg);
 const d=L(5,0),mk2=new T.Mesh(new T.CylinderGeometry(1.2,1.2,26,12,1,true),new T.MeshBasicMaterial({color:0xfdb913,transparent:true,opacity:.35,side:2}));mk2.position.set(d[0],13,d[1]);sc.add(mk2);
 BNK.push({x:L(14,0)[0],z:L(14,0)[1],ox,oz,th,L,cool:0,light:lg,staff:null,vd,dc,dcOn:1,vp:0,vopen:0,key,ring,stacks})}
{const rs=RDS.filter(r=>!r.lp&&r.len>250);
 for(let n=0;n<2;n++){let tries=0;while(BNK.length<=n&&tries++<900){const r=n==0&&tries<450?RDS[4]:rs[(R()*rs.length)|0],q=posAt(r,n==0&&tries<450?300+R()*180:40+R()*(r.len-80),1,0),sd=R()<.5?1:-1,nx=q[3]*sd,nz=-q[2]*sd,ox=q[0]+nx*(r.hw+3.5),oz=q[1]+nz*(r.hw+3.5),th=Math.atan2(-nz,nx);
  if(STN.some(t=>H(t.x-ox,t.z-oz)<70)||STO.some(t=>H(t.x-ox,t.z-oz)<70)||BNK.some(t=>H(t.x-ox,t.z-oz)<250)||!ok(ox,oz))continue;let good=1;
  for(let lx=0;lx<=32&&good;lx+=8)for(let lz=-12;lz<=20;lz+=8){const x=ox+Math.cos(th)*lx+Math.sin(th)*lz,z=oz-Math.sin(th)*lx+Math.cos(th)*lz;if(inB(x,z)||inPark(x,z,2)||dR(x,z)[0]<2){good=0;break}}
  if(!good)continue;
  for(let i=C.length-1;i>=0;i--)if(inK(C[i].x,C[i].z,ox,oz,th,1))C.splice(i,1);for(let i=TP.length-1;i>=0;i--)if(inK(TP[i][0],TP[i][1],ox,oz,th,1))TP.splice(i,1);
  bank(ox,oz,th)}}}

// ---- DISTRO RASA JAKARTA clothing store ---- (v2)
const CLO=[];
const inC=(x,z,ox,oz,th,m)=>{const dx=x-ox,dz=z-oz,lx=dx*Math.cos(th)-dz*Math.sin(th),lz=dx*Math.sin(th)+dz*Math.cos(th);return lx>-m&&lx<27+m&&Math.abs(lz)<12+m};
const SGD=(()=>{const c=document.createElement('canvas');c.width=512;c.height=128;const g=c.getContext('2d');g.fillStyle='#2a1538';g.fillRect(0,0,512,128);g.strokeStyle='#f472b6';g.lineWidth=7;g.strokeRect(5,5,502,118);g.fillStyle='#fff';g.textAlign='center';g.font='bold 46px Arial';g.fillText('DISTRO RASA JAKARTA',256,66);g.fillStyle='#f472b6';g.font='bold 22px Arial';g.fillText('FASHION · SEPATU · AKSESORIS',256,102);return new T.MeshBasicMaterial({map:new T.CanvasTexture(c)})})();
function clothes(ox,oz,th){const S=new T.Group();S.position.set(ox,0,oz);S.rotation.y=th;sc.add(S);
 const a=(w,h,d,x,y,z,c)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),c.isMaterial?c:mat(c));m.position.set(x,y,z);S.add(m);return m},L=(x,z)=>[ox+Math.cos(th)*x+Math.sin(th)*z,oz-Math.sin(th)*x+Math.cos(th)*z],cc=(x,z,r)=>{const p=L(x,z);C.push({x:p[0],z:p[1],r})};
 const WL=0xf4eef2,PK=0xf472b6,DK=0x2a1538,PAL=[0xc0392b,0x2f5d8a,0x2e9d57,0xf2c94c,0x7a4fa0,0xf2f2f2,0x111111,0xe67e22];
 a(30,.08,26,15,.04,0,0xcfc7b8);a(20.4,.06,22,15,.1,0,0xece4da);
 for(const sg of[-1,1]){a(.5,5,8.1,5,2.5,sg*6.95,WL);a(.12,2.6,6,4.7,2.5,sg*6.95,new T.MeshLambertMaterial({color:0x9fd4f2,transparent:true,opacity:.45}));for(let z=-3;z<=3;z+=3)a(.14,2.7,.1,4.68,2.5,sg*6.95+z,PK)}
 a(.5,1.4,6,5,4.3,0,WL);a(.55,.25,6.2,5,3.65,0,PK);
 const dp=[a(.08,3.3,2.55,5.42,1.7,-1.3,new T.MeshLambertMaterial({color:0x9fd4f2,transparent:true,opacity:.5})),a(.08,3.3,2.55,5.42,1.7,1.3,new T.MeshLambertMaterial({color:0x9fd4f2,transparent:true,opacity:.5}))];
 for(const sg of[-1,1])a(20,5,.5,15,2.5,sg*11,WL);a(.5,5,22,25,2.5,0,WL);
 a(21,.4,23,15,5.2,0,DK);a(21.2,.2,23.2,15,5.45,0,PK);a(.3,1.9,9.6,4.7,6.6,0,SGD);a(.5,.5,.5,4.7,5.8,-4.2,0x666666);a(.5,.5,.5,4.7,5.8,4.2,0x666666);
 for(const sg of[-1,1])for(let z=2.9;z<=11;z+=.8)cc(5,sg*z,.5);for(let x=5.5;x<=25;x+=.8){cc(x,-11,.5);cc(x,11,.5)}for(let z=-10.5;z<=10.5;z+=.8)cc(25,z,.5);
 for(const sg of[-1,1]){const x=7.3,z=sg*7.2;a(.7,.05,.7,x,.1,z,0x555555);a(.1,1.1,.1,x,.65,z,0x444444);a(.5,.9,.3,x,1.45,z,sg>0?0xf472b6:0x2f5d8a);a(.24,.3,.24,x,2.1,z,0xe8e8e8);a(.15,.8,.1,x-.34,1.45,z,sg>0?0xf472b6:0x2f5d8a);a(.15,.8,.1,x+.34,1.45,z,sg>0?0xf472b6:0x2f5d8a);cc(x,z,.6)}
 a(18,.08,.08,14.5,2.15,-9.8,0x9a9a9a);for(let i=0;i<17;i++)a(.14,.95,.55,6.5+i*1.0,1.62,-9.8,PAL[(R()*8)|0]);for(let x=7;x<=23;x+=1.4)cc(x,-9.8,.6);
 a(8,.08,.08,10.5,2.15,9.8,0x9a9a9a);for(let i=0;i<8;i++)a(.14,.95,.55,7+i*1.0,1.62,9.8,PAL[(R()*8)|0]);for(let x=7;x<=14;x+=1.4)cc(x,9.8,.6);
 a(2.6,.9,1.5,12,.45,-3.6,0x6b4a2b);for(let i=0;i<4;i++)a(.9,.18+i*.04,.7,11.2+(i%2)*.9,.99+i*.02,-3.6+(i<2?-.3:.3),PAL[(R()*8)|0]);cc(12,-3.6,1.6);
 for(let t=0;t<3;t++){a(.6,.08,8.4,24.5,.9+t*.95,-6.5,0x6b4a2b);for(let i=0;i<9;i++)a(.3,.16,.14,24.5,1.02+t*.95,-10.2+i*.9,PAL[(R()*8)|0])}for(let z=-10.4;z<=-2.6;z+=1)cc(24.4,z,.5);
 a(1.4,1.1,7,20,.55,0,0x5a3c24);a(1.55,.1,7.2,20,1.15,0,0x222222);a(.5,.35,.5,19.9,1.4,1.8,0x333333);a(.5,.3,.05,19.6,1.5,1.8,0x9fd4f2);for(let z=-3.5;z<=3.5;z+=.8)cc(20,z,.9);
 a(.05,1.6,2.4,24.9,2.8,0,PK);a(.05,.15,2.6,24.88,3.7,0,DK);
 // fitting room (back-right corner) + sliding curtain
 a(6.5,3.6,.15,18.75,1.8,5.5,0xe8e0d0);a(.15,3.6,5.5,22,1.8,8.25,0xe8e0d0);a(5.5,.12,.1,15.5,3.65,8.25,0x999999).rotation.y=Math.PI/2;
 a(.06,2.5,2.4,21.9,1.9,8.25,0x8fb9cf);a(.04,2.7,2.6,21.92,1.9,8.25,PK);a(5,.03,5,19.2,.12,8.25,0xb75d8a);a(.6,.45,.6,21,.23,10.2,0x6b4a2b);
 a(.8,.06,.8,19,5.05,8.25,new T.MeshBasicMaterial({color:0xfff6d8}));
 const ct=a(.1,3.4,5.5,15.5,1.9,8.25,0x1f8a5a);ct.geometry.translate(0,0,2.75);ct.position.z=5.5;
 for(let z=5.5;z<=10.9;z+=.8)cc(22,z,.4);for(let x=15.8;x<=21.6;x+=.8)cc(x,5.5,.4);for(let z=5.9;z<=11;z+=.8)cc(15.5,z,.4);
 const pl=new T.PointLight(0xfff1d8,.9,36);pl.position.set(14,4.3,0);S.add(pl);
 const d=L(4.2,0),mk2=new T.Mesh(new T.CylinderGeometry(1.2,1.2,26,12,1,true),new T.MeshBasicMaterial({color:0xf472b6,transparent:true,opacity:.35,side:2}));mk2.position.set(d[0],13,d[1]);sc.add(mk2);
 CLO.push({x:L(14,0)[0],z:L(14,0)[1],ox,oz,th,L,dp,ct,o:0,cv:0,in:0,wv:0,dx:L(5,0)[0],dz:L(5,0)[1]})}
{const rs=RDS.filter(r=>!r.lp&&r.len>250);let tries=0;
 while(!CLO.length&&tries++<1200){const r=tries<500?RDS[4]:rs[(R()*rs.length)|0],q=posAt(r,tries<500?40+R()*(r.len-80):40+R()*(r.len-80),1,0),sd=R()<.5?1:-1,nx=q[3]*sd,nz=-q[2]*sd,ox=q[0]+nx*(r.hw+3.5),oz=q[1]+nz*(r.hw+3.5),th=Math.atan2(-nz,nx);
  if(STN.some(t=>H(t.x-ox,t.z-oz)<70)||STO.some(t=>H(t.x-ox,t.z-oz)<70)||BNK.some(t=>H(t.x-ox,t.z-oz)<70)||!ok(ox,oz))continue;let good=1;
  for(let lx=0;lx<=27&&good;lx+=6.75)for(let lz=-12;lz<=12;lz+=6){const x=ox+Math.cos(th)*lx+Math.sin(th)*lz,z=oz-Math.sin(th)*lx+Math.cos(th)*lz;if(inB(x,z)||inPark(x,z,2)||dR(x,z)[0]<2){good=0;break}}
  if(!good)continue;
  for(let i=C.length-1;i>=0;i--)if(inC(C[i].x,C[i].z,ox,oz,th,1))C.splice(i,1);for(let i=TP.length-1;i>=0;i--)if(inC(TP[i][0],TP[i][1],ox,oz,th,1))TP.splice(i,1);
  clothes(ox,oz,th)}}
let rf=0,rfA=0,wtm=0,warnF=0;
function fuelTick(dt){const m=P.m,S=m.spec,ev=!!S.ev,fe=$('fuel');wtm-=dt;
 if(F.on||ENT){fe.style.display='none';return}fe.style.display='block';const sp=H(P.vx,P.vz);
 if(m.fuel>0)m.fuel=Math.max(0,m.fuel-(.015+sp*.0016+(k.has('KeyW')||k.has('ArrowUp')?.02:0))*S.k*dt);
 fe.innerHTML=ico(ev?'bolt':'pump',17)+' '+Math.round(m.fuel)+'% · '+m.model.toUpperCase();fe.style.color=m.fuel<15?'#ff5252':'#fff';
 if(m.fuel<=0&&!warnF){warnF=1;say('',ev?'Battery empty! Find a Pertamina SPKLU (red dot on the map).':'Out of fuel! Find a Pertamina SPBU (red dot on the map).',4500)}else if(m.fuel>5)warnF=0;
 if(sp<3){let near=0,wrong=0;STN.forEach(s=>{(ev?s.e:s.g).forEach(p=>{if(H(p[0]-P.x,p[1]-P.z)<6.5)near=1});(ev?s.g:s.e).forEach(p=>{if(H(p[0]-P.x,p[1]-P.z)<6.5)wrong=1})});
  if(near){if(m.fuel<99.9){const add=Math.min(100-m.fuel,(ev?9:20)*dt);rfA+=add*(ev?.45:.3);const c=rfA|0;if(c>P.money)say('Pertamina','Not enough cash.',800);else{P.money-=c;rfA-=c;STAT.spent+=c;m.fuel+=add;if(!rf){rf=1;STAT.refuels++}say('Pertamina',(ev?'Charging ':'Refuelling ')+Math.round(m.fuel)+'%',500)}}else if(rf){rf=0;say('Pertamina','Full. Thank you!',1800)}}
  else{rf=0;if(wrong&&wtm<=0){say('Pertamina',ev?'This car needs the green EV charging bays.':'This car needs the red/blue gasoline pumps.',2500);wtm=4}}}else rf=0}
// Monas plaza & base, Istiqlal drum/domes/minaret top, Gambir canopy, Jakarta Cathedral
box(96,.4,96,0,.2,0,0xd9d3c3);box(40,.8,40,0,.7,0,0xcfc9b8);
PK.forEach((k,i)=>{for(let n=0;n<(i?(k[0]=='r'?50:28):150);n++){const a=R()*6.28,r=Math.sqrt(R());let x,z;if(k[0]=='r'){x=k[1]+(R()*2-1)*(k[3]-4);z=k[2]+(R()*2-1)*(k[3]-4)}else{x=k[1]+CS(a)*r*(k[3]-3);z=k[2]+SN(a)*r*(k[3]-3)}
 if(!inB(x,z)&&!(i==0&&(Math.abs(x)<6||Math.abs(z)<6))&&H(x-k[1],z-k[2])>(i?6:34)&&!C.some(c=>H(x-c.x,z-c.z)<c.r+2))tree(x,z)}});
for(let n=0;n<260;n++){const x=-90+R()*480,z=370+R()*500;if(dR(x,z)[0]>6&&!inB(x,z)&&!inPark(x,z,0))tree(x,z)}
{const TCc=new T.Color();const tm=new T.InstancedMesh(new T.CylinderGeometry(.25,.3,2.4,6),mat(0x6b4a2b),TP.length),cm=new T.InstancedMesh(TREEG(),GW(new T.MeshLambertMaterial({color:0xffffff,vertexColors:true})),TP.length),o=new T.Object3D();
 TP.forEach((p,i)=>{o.position.set(p[0],1.3,p[1]);o.scale.setScalar(1);o.updateMatrix();tm.setMatrixAt(i,o.matrix);o.position.y=3.6;o.scale.setScalar(.8+R()*.6);o.updateMatrix();cm.setMatrixAt(i,o.matrix);cm.setColorAt(i,TCc.setRGB(.85+R()*.3,.9+R()*.2,.8+R()*.25))});cm.userData.cast=1;tm.userData.cast=1;sc.add(tm,cm)}
// ---- cars & physics ----
const MD={sedan:{b:[2,.7,4.4,.85],c:[1.7,.65,2.2,1.5,-.3],ch:[2.05,.6,3.7],spec:{acc:1,top:1,k:1}},hatchback:{b:[1.9,.7,3.7,.85],c:[1.65,.7,2,1.52,-.15],ch:[1.95,.6,3.1],spec:{acc:.95,top:.93,k:.8}},
 mpv:{b:[2,.85,4.7,.92],c:[1.85,.85,3.2,1.68,-.4],ch:[2.05,.6,4],spec:{acc:.85,top:.9,k:1}},suv:{b:[2.1,.85,4.5,.98],c:[1.9,.7,2.8,1.7,-.5],ch:[2.15,.7,3.8],spec:{acc:.95,top:.97,k:1.2}},
 pickup:{b:[2.05,.6,5.2,.9],c:[1.8,.7,1.5,1.55,.9],ch:[2.1,.7,4.5],spec:{acc:.9,top:.95,k:1.2}},sports:{b:[2,.5,4.3,.75],c:[1.5,.45,1.7,1.2,-.2],ch:[2.05,.5,3.7],spec:{acc:1.4,top:1.25,k:1.4}},
 supercar:{b:[2.1,.42,4.5,.66],c:[1.4,.38,1.7,1.05,.1],ch:[2.15,.45,3.9],spec:{acc:1.8,top:1.5,k:2.4}},luxury:{b:[2.05,.78,5,.92],c:[1.75,.62,2.4,1.6,-.4],ch:[2.1,.65,4.2],spec:{acc:1.1,top:1.1,k:1.6}},
 electric:{b:[1.95,.65,4.3,.85],c:[1.7,.6,2.5,1.45,-.2],ch:[2,.6,3.7],spec:{acc:1.3,top:1.05,k:.6,ev:1}},offroad:{b:[2.1,.9,4,1.12],c:[1.9,.75,2.2,1.95,-.3],ch:[2.3,.9,3.4],spec:{acc:.9,top:.9,k:1.4}}};
const MW=[['hatchback',20],['sedan',18],['mpv',16],['suv',12],['pickup',8],['electric',6],['offroad',5],['sports',4],['luxury',2],['supercar',1]];
function pickModel(){let r=R()*MW.reduce((a,b)=>a+b[1],0);for(const m of MW)if((r-=m[1])<0)return m[0];return'sedan'}
function mkCar(m){const pal=m=='supercar'?[0xf5f6f7,0xf5f6f7,0xff7a00,0x111214,0x2fb34a,0xf2c200,0x1e5bd8]:m=='sports'?[0x3cc43c,0x3cc43c,0xc8102e,0xf5f6f7,0xf2c200,0x1b1d22,0x1f5fbf]:m=='luxury'?[0x101114,0xf5f5f5,0x9aa0a6,0x14213d,0x5b1a1a]:m=='electric'?[0xf2f3f5,0x9fb8c9,0x55606b,0x1c1e22,0xd8d0c0,0x6f8a7a]:cols;return car(pal[(R()*pal.length)|0],0,m)}
// geometry merging (one draw call per material per car)
const BOXG=new T.BoxGeometry(1,1,1),CYLG=new T.CylinderGeometry(1,1,1,18),TORC={},VO=new T.Object3D(),VCOL=new T.Color();
const torG=(R_,t)=>TORC[R_+'_'+t]||(TORC[R_+'_'+t]=new T.TorusGeometry(R_,t,8,26));
function mergeG(parts){if(!parts.length)return null;const P=[],N=[],C=[];let n=0,col=parts.some(p=>p[2]!=null);
 for(const[g0,mx,c]of parts){const g=g0.index?g0.toNonIndexed():g0.clone();g.applyMatrix4(mx);const pa=g.attributes.position.array;P.push(pa);N.push(g.attributes.normal.array);if(col){VCOL.set(c==null?0xffffff:c);const ca=new Float32Array(pa.length);for(let i=0;i<ca.length;i+=3){ca[i]=VCOL.r;ca[i+1]=VCOL.g;ca[i+2]=VCOL.b}C.push(ca)}n+=pa.length}
 const pos=new Float32Array(n),nor=new Float32Array(n),cc=col?new Float32Array(n):null;let o=0;P.forEach((p,i)=>{pos.set(p,o);nor.set(N[i],o);if(col)cc.set(C[i],o);o+=p.length});
 const G=new T.BufferGeometry();G.setAttribute('position',new T.BufferAttribute(pos,3));G.setAttribute('normal',new T.BufferAttribute(nor,3));if(col)G.setAttribute('color',new T.BufferAttribute(cc,3));G.computeBoundingSphere();return G}
function vput(Lst,geo,x,y,z,sx,sy,sz,rx,ry,rz,c){VO.position.set(x,y,z);VO.rotation.set(rx||0,ry||0,rz||0);VO.scale.set(sx,sy,sz);VO.updateMatrix();Lst.push([geo,VO.matrix.clone(),c])}
const vb=(Lst,w,h,d,x,y,z,rx,ry,rz,c)=>vput(Lst,BOXG,x,y,z,w,h,d,rx,ry,rz,c);
const vcx=(Lst,r,len,x,y,z,c)=>vput(Lst,CYLG,x,y,z,r,len,r,0,0,Math.PI/2,c);   // axis along x
const vcz=(Lst,r,len,x,y,z,c)=>vput(Lst,CYLG,x,y,z,r,len,r,Math.PI/2,0,0,c);   // axis along z
const vbar=(Lst,x,y1,z1,y2,z2,w,t)=>{const dy=y2-y1,dz=z2-z1,l=Math.hypot(dy,dz);vb(Lst,w,t,l,x,(y1+y2)/2,(z1+z2)/2,Math.atan2(-dy,dz))};
// shared vehicle materials
GX.vch=gxReg(new _Std({color:0xd6dade,roughness:.14,metalness:.95}));GX.vtr=new _Std({color:0x17181b,roughness:.62,metalness:.1});
GX.vlt=new _Bas({color:0xffffff,vertexColors:true});GX.vlt.toneMapped=false;GX.vgl=gxReg(new _Std({color:0x26313c,roughness:.05,metalness:.35,transparent:true,opacity:.5,depthWrite:false}));
GX.vbk=gxReg(new _Std({color:0x0b0c0e,roughness:.12,metalness:.4}));GX.vgun=gxReg(new _Std({color:0x3c4046,roughness:.25,metalness:.85}));GX.vst=new _Std({color:0x173d8a,roughness:.4,metalness:.3});GX.vdk=new _Std({color:0x2a2b2e,roughness:.85});GX.vtire=new _Std({color:0x141416,roughness:.92});
GX.vplates=['B 1945 JKT','B 2077 RKA','B 7 MDK','B 1234 SDR','B 88 TMR','B 4512 GMB'].map(t=>{const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.fillStyle='#f4f4f0';g.fillRect(0,0,256,64);g.strokeStyle='#111';g.lineWidth=5;g.strokeRect(4,4,248,56);g.fillStyle='#111';g.font='bold 40px Arial';g.textAlign='center';g.fillText(t,128,46);return new _Std({map:new T.CanvasTexture(c),roughness:.5})});
GX.vpol=(()=>{const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.fillStyle='#173d8a';g.fillRect(0,0,256,64);g.fillStyle='#fff';g.font='bold 44px Arial';g.textAlign='center';g.fillText('POLISI',128,48);const m=new _Bas({map:new T.CanvasTexture(c)});m.toneMapped=false;return m})();
// wheels: rounded tyre, dark backplate + brake disc, chrome lip, 5 spokes and hub; cached per radius
const WGC={};function vWheelG(r,st){const ck=r+st;if(WGC[ck])return WGC[ck];const D=[],Rm=[];
 vput(D,torG(r-.1,.11),0,0,0,1,1,1,0,Math.PI/2,0);vcx(D,r*.7,.03,.02,0,0);vcx(D,r*.55,.03,-.04,0,0);
 vput(Rm,torG(r*.69,.025),.1,0,0,1,1,1,0,Math.PI/2,0);vcx(Rm,r*.14,.09,.11,0,0);
 if(st=='aero'){vcx(Rm,r*.68,.03,.095,0,0);for(let i=0;i<5;i++){const a=i/5*Math.PI*2;vb(D,.02,r*.22,.08,.112,Math.cos(a)*r*.45,Math.sin(a)*r*.45,a)}}
 else for(let i=0;i<5;i++)for(const o of[-.13,.13]){const a=i/5*Math.PI*2+o;vb(Rm,.035,r*.58,.045,.1,Math.cos(a)*r*.36,Math.sin(a)*r*.36,a)}
 if(st=='black')vb(D,.06,r*.32,r*.22,.04,r*.42,0,0,0,0);
 return WGC[ck]=[mergeG(D),mergeG(Rm)]}
// ===== VGEN: procedural real-car body generator (pure JS) — smooth curved surfaces from real reference dimensions =====
const VG=(()=>{
const sm=t=>t<=0?0:t>=1?1:t*t*(3-2*t),lerp=(a,b,t)=>a+(b-a)*t,clp=(v,a,b)=>v<a?a:v>b?b:v;
function mc(P){P=P.filter((p,i)=>i==0||p[0]>P[i-1][0]+1e-6);const n=P.length,xs=P.map(p=>p[0]),ys=P.map(p=>p[1]);if(n<2)return()=>ys[0];const d=[],m=[];
 for(let i=0;i<n-1;i++)d.push((ys[i+1]-ys[i])/(xs[i+1]-xs[i]));m[0]=d[0];m[n-1]=d[n-2];for(let i=1;i<n-1;i++)m[i]=d[i-1]*d[i]<=0?0:(d[i-1]+d[i])/2;
 for(let i=0;i<n-1;i++){if(Math.abs(d[i])<1e-9){m[i]=m[i+1]=0;continue}const a=m[i]/d[i],b=m[i+1]/d[i],s=a*a+b*b;if(s>9){const t=3/Math.sqrt(s);m[i]=t*a*d[i];m[i+1]=t*b*d[i]}}
 return x=>{if(x<=xs[0])return ys[0];if(x>=xs[n-1])return ys[n-1];let i=0;while(x>xs[i+1])i++;const h=xs[i+1]-xs[i],t=(x-xs[i])/h,t2=t*t,t3=t2*t;return(2*t3-3*t2+1)*ys[i]+(t3-2*t2+t)*h*m[i]+(-2*t3+3*t2)*ys[i+1]+(t3-t2)*h*m[i+1]}}
function cr(C,k){const out=[C[0].slice()];for(let i=0;i<C.length-1;i++){const p0=C[Math.max(0,i-1)],p1=C[i],p2=C[i+1],p3=C[Math.min(C.length-1,i+2)];
 for(let j=1;j<=k;j++){const t=j/k,t2=t*t,t3=t2*t;out.push([0,1].map(e=>.5*((2*p1[e])+(-p0[e]+p2[e])*t+(2*p0[e]-5*p1[e]+4*p2[e]-p3[e])*t2+(-p0[e]+3*p1[e]-3*p2[e]+p3[e])*t3)))}}return out}
// ---- reference vehicles (metres x scale: length x1.04, width/height x1.12)
const S={
 sedan:    {slF:.22,slR:.16,L:4.85,W:2.02,r:.365,uF:.19,uB:.776,y0:.19,no:.8,yh:.89,uh:.08,uA:.33,yhc:.98,yb:1.0,yb2:1.06,uD:.82,yd:1.07,ta:1.0,uW:.47,uR:.7,yr:1.61,ys:.82,tw:.74,tm:.92,pt:.9,rcF:0.34,rcR:0.3,rf:0,dr:4},
 hatchback:{slF:.22,slR:.1,L:4.64,W:2.02,r:.365,uF:.2,uB:.812,y0:.19,no:.81,yh:.9,uh:.08,uA:.35,yhc:.99,yb:1.02,yb2:1.1,uD:.955,yd:1.1,ta:1.04,uW:.5,uR:.8,yr:1.61,ys:.84,tw:.75,tm:.92,pt:.9,rcF:0.34,rcR:0.24,rf:1,cp:1,dr:4,sp:'roof'},
 mpv:      {slF:.2,slR:.06,L:4.94,W:2.07,r:.37,uF:.19,uB:.789,y0:.22,no:.95,yh:1.05,uh:.07,uA:.24,yhc:1.15,yb:1.18,yb2:1.22,uD:.985,yd:1.22,ta:1.2,uW:.37,uR:.93,yr:2.02,ys:1.0,tw:.84,tm:.95,pt:.92,rcF:0.26,rcR:0.16,rf:1,cp:1,dr:4,lw:1},
 suv:      {slF:.14,slR:.08,L:4.91,W:2.13,r:.43,uF:.17,uB:.791,y0:.3,no:1.05,yh:1.16,uh:.07,uA:.29,yhc:1.24,yb:1.27,yb2:1.32,uD:.965,yd:1.33,ta:1.26,uW:.42,uR:.9,yr:1.92,ys:1.08,tw:.86,tm:.95,pt:.94,rcF:0.24,rcR:0.2,rf:1,cp:1,cl:1,dr:4,lw:1,ov:1,rails:1},
 pickup:   {slF:.1,slR:.03,L:5.63,W:2.15,r:.44,uF:.16,uB:.776,y0:.32,no:1.15,yh:1.3,uh:.06,uA:.27,yhc:1.36,yb:1.4,yb2:1.4,uD:.63,yd:1.36,ta:1.34,uW:.36,uR:.6,yr:2.0,ys:1.18,tw:.84,tm:.96,pt:.95,rcF:.12,rcR:0.12,rf:1,cp:1,cl:1,dr:4,bed:1},
 sports:   {slF:.3,slR:.15,L:4.82,W:2.16,r:.38,uF:.18,uB:.767,y0:.12,no:.57,yh:.66,uh:.08,uA:.29,yhc:.76,yb:.82,yb2:.9,uD:.66,yd:.92,ta:.9,uW:.43,uR:.56,yr:1.39,ys:.7,tw:.64,tm:.9,pt:.86,gw:.8,rcF:0.3,rcR:0.28,rf:1,cp:1,dr:2,mid:1,sp:'lip',scoop:1,hl:'swept',tl:'split',ex:'quadbox',cal:0xd0202a},
 supercar: {slF:.32,slR:.12,L:4.78,W:2.16,r:.37,uF:.18,uB:.762,y0:.1,no:.47,yh:.54,uh:.08,uA:.27,yhc:.64,yb:.7,yb2:.76,uD:.72,yd:.88,ta:.86,uW:.47,uR:.6,yr:1.33,ys:.56,tw:.52,tm:.9,pt:.84,gw:.68,rcF:0.28,rcR:0.26,rf:1,cp:1,dr:2,mid:1,sp:'bigwing',scoop:1,hl:'socket',tl:'split',ex:'quadhigh',vents:1,cal:0xf2c200},
 luxury:   {slF:.18,slR:.15,L:5.39,W:2.15,r:.4,uF:.18,uB:.777,y0:.2,no:.85,yh:.95,uh:.08,uA:.34,yhc:1.04,yb:1.08,yb2:1.12,uD:.83,yd:1.13,ta:1.06,uW:.47,uR:.74,yr:1.68,ys:.9,tw:.76,tm:.92,pt:.92,rcF:0.3,rcR:0.28,rf:0,dr:4,lux:1},
 electric: {slF:.26,slR:.1,L:4.47,W:1.98,r:.385,uF:.18,uB:.802,y0:.24,no:.92,yh:1.02,uh:.07,uA:.31,yhc:1.12,yb:1.15,yb2:1.22,uD:.955,yd:1.23,ta:1.18,uW:.46,uR:.86,yr:1.8,ys:.98,tw:.8,tm:.93,pt:.9,rcF:0.38,rcR:0.26,rf:2,cp:1,dr:4,ev:1,sp:'roof'},
 offroad:  {slF:.05,slR:.02,L:4.95,W:2.24,r:.45,uF:.16,uB:.794,y0:.36,no:1.2,yh:1.3,uh:.05,uA:.25,yhc:1.36,yb:1.4,yb2:1.4,uD:.99,yd:1.42,ta:1.42,uW:.33,uR:.97,yr:2.2,ys:1.22,tw:.9,tm:.97,pt:.97,rcF:.08,rcR:.08,rf:1,cp:1,cl:1,dr:4,lw:1,box:1}};
function soup(){return{}}
function push(P,mat,a,b,c,na,nb,nc,ua,ub,uc){const L=P[mat]||(P[mat]={p:[],n:[],uv:[]});L.p.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);L.n.push(na[0],na[1],na[2],nb[0],nb[1],nb[2],nc[0],nc[1],nc[2]);L.uv.push(ua?ua[0]:0,ua?ua[1]:0,ub?ub[0]:0,ub?ub[1]:0,uc?uc[0]:0,uc?uc[1]:0)}
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],crs=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],nrm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l]},dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
// grid surface (rows x cols of 3D points, right side) -> smooth normals, faces per material, mirrored left side
function grid(P,G,matFn,refFn,uvFn,NG){const R=G.length,Cn=G[0].length,N=G.map(r=>r.map(()=>[0,0,0]));
 const tris=[];for(let i=0;i<R-1;i++)for(let j=0;j<Cn-1;j++){for(const q of[[[i,j],[i,j+1],[i+1,j+1]],[[i,j],[i+1,j+1],[i+1,j]]]){const[a,b,c]=q.map(([x,y])=>G[x][y]);let n=crs(sub(b,a),sub(c,a));const l=Math.hypot(...n);if(l<1e-10)continue;
   const ref=refFn(i,j),cen=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];if(dot(n,sub(cen,ref))<0){q.reverse();n=n.map(v=>-v)}tris.push([q,i,j]);for(const[x,y]of q){N[x][y][0]+=n[0];N[x][y][1]+=n[1];N[x][y][2]+=n[2]}}}
 if(NG){for(let i=0;i<R;i++)for(let j=0;j<Cn;j++)N[i][j]=[0,0,0];for(let i=0;i<R-1;i++)for(let j=0;j<Cn-1;j++)for(const q of[[[i,j],[i,j+1],[i+1,j+1]],[[i,j],[i+1,j+1],[i+1,j]]]){const[a,b,c]=q.map(([x,y])=>NG[x][y]);let n=crs(sub(b,a),sub(c,a));if(Math.hypot(...n)<1e-12)continue;const ref=refFn(i,j),cen=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];if(dot(n,sub(cen,ref))<0)n=n.map(v=>-v);for(const[x,y]of q){N[x][y][0]+=n[0];N[x][y][1]+=n[1];N[x][y][2]+=n[2]}}}
 const NN=N.map(r=>r.map(nrm));
 for(const[q,i,j]of tris){const mat=matFn(i,j);if(!mat)continue;const v=q.map(([x,y])=>G[x][y]),n=q.map(([x,y])=>NN[x][y]),u=q.map(([x,y])=>uvFn?uvFn(x,y):[x/(R-1),y/(Cn-1)]);
  push(P,mat,v[0],v[1],v[2],n[0],n[1],n[2],u[0],u[1],u[2]);
  push(P,mat,[-v[0][0],v[0][1],v[0][2]],[-v[2][0],v[2][1],v[2][2]],[-v[1][0],v[1][1],v[1][2]],[-n[0][0],n[0][1],n[0][2]],[-n[2][0],n[2][1],n[2][2]],[-n[1][0],n[1][1],n[1][2]],u[0],u[2],u[1])}}
function boxT(P,mat,cx,cy,cz,w,h,d,rx){const D=P[mat]||(P[mat]={p:[],n:[],uv:[]}),c=Math.cos(rx||0),sn=Math.sin(rx||0),R3=(x,y,z)=>[cx+x,cy+y*c-z*sn,cz+y*sn+z*c],RN=(x,y,z)=>[x,y*c-z*sn,y*sn+z*c];
 const F=[[[1,0,0],[0,1,0],[0,0,1]],[[-1,0,0],[0,1,0],[0,0,-1]],[[0,1,0],[0,0,1],[1,0,0]],[[0,-1,0],[0,0,1],[-1,0,0]],[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[-1,0,0],[0,1,0]]];
 for(const[n,a,b]of F){const C=[n[0]*w/2,n[1]*h/2,n[2]*d/2],q=(i,j)=>R3(C[0]+a[0]*i*w/2+b[0]*j*w/2*0+(a[0]?0:0),0,0);void q;
  const pts=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>R3(C[0]+(a[0]*i+b[0]*j)*w/2,C[1]+(a[1]*i+b[1]*j)*h/2,C[2]+(a[2]*i+b[2]*j)*d/2)),nn=RN(...n);
  D.p.push(...pts[0],...pts[1],...pts[2],...pts[0],...pts[2],...pts[3]);for(let k=0;k<6;k++)D.n.push(...nn);D.uv.push(0,0,1,0,1,1,0,0,1,1,0,1)}}
function ellT(P,mat,cx,cy,cz,rx,ry,rz){const D=P[mat]||(P[mat]={p:[],n:[],uv:[]}),A=12,B=8,pt=(i,j)=>{const t=i/A*Math.PI*2,f=j/B*Math.PI-Math.PI/2;return[Math.cos(f)*Math.cos(t),Math.sin(f),Math.cos(f)*Math.sin(t)]};
 for(let i=0;i<A;i++)for(let j=0;j<B;j++){const q=[pt(i,j),pt(i+1,j),pt(i+1,j+1),pt(i,j+1)],V=q.map(v=>[cx+v[0]*rx,cy+v[1]*ry,cz+v[2]*rz]),N=q.map(v=>nrm([v[0]/rx,v[1]/ry,v[2]/rz]));
  for(const k of[0,2,1,0,3,2]){D.p.push(...V[k]);D.n.push(...N[k]);D.uv.push(0,0)}}}
function mirX(P,mat){const D=P[mat];if(!D)return;const n=D.p.length;for(let i=0;i<n;i+=9){D.p.push(-D.p[i],D.p[i+1],D.p[i+2],-D.p[i+6],D.p[i+7],D.p[i+8],-D.p[i+3],D.p[i+4],D.p[i+5]);D.n.push(-D.n[i],D.n[i+1],D.n[i+2],-D.n[i+6],D.n[i+7],D.n[i+8],-D.n[i+3],D.n[i+4],D.n[i+5]);const u=i/9*6;D.uv.push(D.uv[u],D.uv[u+1],D.uv[u+4],D.uv[u+5],D.uv[u+2],D.uv[u+3])}}
function build(model,pol){const s=S[model]||S.sedan,L=s.L,W2=s.W/2,Z=u=>L/2-u*L,R=s.r+.045,gw=s.gw||1,P=soup();
 // ---- longitudinal curves
 const tp=[[0,s.no],[s.uh,s.yh],[s.uA,s.yhc],[Math.min(s.uA+.06,s.uD-.02),s.yb],[s.uD,s.yb2]];if(s.uD<.96)tp.push([Math.max(s.uD+.012,.975),s.yd]);tp.push([1,s.ta]);
 const top=mc(tp),crown=u=>u<s.uA?.03*Math.sin(Math.PI*clp(u/s.uA,0,1)):.012,sill=u=>s.y0+.06*(1-sm(u/.12))+.07*(1-sm((1-u)/.12));
 const gs=(u,c)=>Math.exp(-((u-c)*L)*((u-c)*L)/(2*.45*.45)),hip=u=>Math.max(gs(u,s.uF),gs(u,s.uB)*(s.mid?1.3:1));
 const wM=u=>W2*(s.pt+(1-s.pt)*sm(u/.2))*(.975+.025*sm((1-u)/.16))*((s.mid?.93:.965)+(s.mid?.07:.035)*hip(u));
 const fen=u=>{let t=0;for(const c of[s.uF,s.uB]){const dz=(u-c)*L,RR=R+.2;if(Math.abs(dz)<RR)t=Math.max(t,s.r+Math.sqrt(RR*RR-dz*dz)-(s.mid?.2:.1))}return t};
 const archY=(z)=>{let y=-1;for(const c of[s.uF,s.uB]){const dz=z-Z(c);if(Math.abs(dz)<R)y=Math.max(y,s.r+Math.sqrt(R*R-dz*dz))}return y};
 // ---- cross-section at u in [0,1] (lo: underbody->shoulder crease, hi: crease->top centre)
 function sec(u){const z=Z(u),yt=top(u),ye=Math.max(yt,fen(u)),yc=yt+crown(u),y0=sill(u),wm=wM(u),wt=wm*s.tm,wl=wm*.95;
  let ys=clp(s.ys-.05*(1-sm(u/.1))-.04*(1-sm((1-u)/.08))+(ye-yt)*.7,y0+.14,ye-.06);
  let lo=[[0,y0],[wl*.8,y0]].concat(cr([[wl*.8,y0],[wl,y0+.09],[wm*.997,y0+(ys-y0)*.55],[wm,ys]],3).slice(1));
  let hi=cr([[wm,ys],[wt,ye],[wt*.6,Math.max(yc,(ye+yc)/2)],[0,yc]],4);
  const loR=lo.map(p=>p.slice());const ay=archY(z);if(ay>0){lo=lo.map((p,i)=>i<2||p[0]<wl*.5?p:[p[0],Math.max(p[1],Math.min(ay,ys-.012))]);}
  return{lo,loR,hi,z,yt,ye,yc,ys,y0,wm,wt}}
 // outward 2D normals of a polyline about the section centre
 const n2=(pts,cy)=>pts.map((p,i)=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];let tx=b[0]-a[0],ty=b[1]-a[1];let nx=ty,ny=-tx;const l=Math.hypot(nx,ny)||1;nx/=l;ny/=l;if(nx*(p[0])+ny*(p[1]-cy)<0){nx=-nx;ny=-ny}return[nx,ny]});
 function filSec(u0,th,Rc,dir){const b=sec(u0);Rc=Math.min(Rc,(b.yc-b.y0)*.42);const cy=(b.y0+b.yc)/2,all=b.lo.concat(b.hi.slice(1)),nn=n2(all,cy),k=Rc*(1-Math.cos(th)),z=b.z+dir*Rc*Math.sin(th);
  const sl=(dir>0?s.slF:s.slR)||.15,hs=Math.max(.01,b.yc-b.y0),off=all.map((p,i)=>{const y=p[1]-k*nn[i][1],hf=clp((y-b.y0)/hs,0,1);return[Math.max(0,p[0]-k*nn[i][0]),y,z-dir*sl*Math.pow(hf,1.4)*Math.sin(th)]});const lo2=off.slice(0,b.lo.length);return{lo:lo2,loR:lo2,hi:off.slice(b.lo.length-1),z,y0:b.y0,yc:b.yc,ys:b.ys,ye:b.ye,wt:b.wt}}
 // ---- stations (front fillet, body, rear fillet)
 let us=[];for(let i=0;i<=60;i++)us.push(i/60);for(const c of[s.uF,s.uB])for(let k=-1.15;k<=1.151;k+=.1)us.push(c+k*R/L);
 us.push(s.uA,s.uA+.06,s.uD,s.uW,s.uR);us=us.filter(u=>u>=0&&u<=1).sort((a,b)=>a-b).filter((u,i,a)=>i==0||u-a[i-1]>.0015);
 const FT=[1,.8,.6,.4,.2].map(k=>k*Math.PI/2),rows=[];
 FT.forEach(th=>rows.push({u:-th/(Math.PI/2),S:filSec(0,th,s.rcF,1)}));us.forEach(u=>rows.push({u,S:sec(u)}));FT.slice().reverse().forEach(th=>rows.push({u:1+th/(Math.PI/2),S:filSec(1,th,s.rcR,-1)}));
 const G3=(key)=>rows.map(r=>r.S[key].map(p=>[p[0],p[1],p.length>2?p[2]:r.S.z]));
 const ref=(i)=>[0,(rows[i].S.y0+rows[i].S.yc)/2,rows[i].S.z];
 const uOf=i=>rows[i].u,um=i=>(uOf(i)+uOf(i+1))/2;
 const inArch=u=>[s.uF,s.uB].some(c=>Math.abs((u-c)*L)<R+.12);
 const LO=G3('lo'),LOR=G3('loR');grid(P,LO,(i,j)=>{if(j<1)return'dark';if(s.cl&&j<3)return'dark';return'paint'},ref,null,LOR);
 const HI=G3('hi');grid(P,HI,(i,j)=>{const u=um(i),x=(HI[i][j][0]+HI[i][j+1][0])/2,wt=rows[i].S.wt||rows[i].S.lo[rows[i].S.lo.length-1][0];
  if(s.bed&&u>s.uD+.004&&u<.985&&x<(wt||1)*.93)return'bed';if(s.mid&&u>s.uD+.01&&u<.9&&x<(wt||1)*gw*.92)return'engine';return'paint'},ref);
 // end caps: ladder from the centre line to each perimeter point (smooth, follows the raked face)
 for(const[ri,dir]of[[0,1],[rows.length-1,-1]]){const r=rows[ri].S,pts=r.lo.concat(r.hi.slice(1)),G=pts.map(p=>{const z=p.length>2?p[2]:r.z;return[[0,p[1],z],[p[0],p[1],z]]});
  grid(P,G,()=>'paint',(i,j)=>[0,(r.y0+r.yc)/2,(pts[i].length>2?pts[i][2]:r.z)-dir])}
 // ---- surface evaluator over the body (u: -1..2 incl. fillets, t: arc fraction from underbody centre to top centre)
 function secAt(u){if(u<0)return filSec(0,-u*Math.PI/2,s.rcF,1);if(u>1)return filSec(1,(u-1)*Math.PI/2,s.rcR,-1);return sec(u)}
 function arcs(pts){const c=[0];for(let i=1;i<pts.length;i++)c.push(c[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return c}
 function evalS(u,t){const b=secAt(u),pts=b.lo.concat(b.hi.slice(1)),c=arcs(pts),T=c[c.length-1]*clp(t,0,1);let i=1;while(i<c.length-1&&c[i]<T)i++;const f=(T-c[i-1])/((c[i]-c[i-1])||1);const za=pts[i-1].length>2?pts[i-1][2]:b.z,zb=pts[i].length>2?pts[i][2]:b.z;return[lerp(pts[i-1][0],pts[i][0],f),lerp(pts[i-1][1],pts[i][1],f),lerp(za,zb,f)]}
 function tMark(u){const b=secAt(u),pts=b.lo.concat(b.hi.slice(1)),c=arcs(pts),T=c[c.length-1];const iC=b.lo.length-1;let iT=iC;for(let k=iC;k<pts.length;k++)if(pts[k][1]>=b.ye-.003){iT=k;break}return{c:c[iC]/T,t:c[iT]/T,rk:c[3]/T}}
 function evalN(u,t){const e=.004,a=evalS(u-e,t),b=evalS(u+e,t),c=evalS(u,t-e),d=evalS(u,t+e);let n=nrm(crs(sub(d,c),sub(b,a)));const p=evalS(u,t),b0=secAt(u);if(dot(n,[p[0],p[1]-(b0.y0+b0.yc)/2,0])<0)n=n.map(v=>-v);return n}
 // patch on the surface: u range, a-range mapped between markers (a=0 crease, a=1 top edge), offset along normal
 function patch(mat,u0,u1,a0,a1,nu,nv,off,both=true){const G=[],UV=[];for(let i=0;i<=nu;i++){const u=lerp(u0,u1,i/nu),m=tMark(u),row=[];for(let j=0;j<=nv;j++){const a=lerp(a0,a1,j/nv),t=a<0?lerp(m.c,m.rk,-a):lerp(m.c,m.t,a),p=evalS(u,t),n=evalN(u,t);row.push([p[0]+n[0]*off,p[1]+n[1]*off,p[2]+n[2]*off])}G.push(row)}
  const P2={};grid(P2,G,()=>mat,(i,j)=>{const p=G[i][j];return[p[0]-1,p[1]-.2,p[2]]},(i,j)=>[i/nu,j/nv]);
  for(const k in P2){const D=P[k]||(P[k]={p:[],n:[],uv:[]});if(both){D.p.push(...P2[k].p);D.n.push(...P2[k].n);D.uv.push(...P2[k].uv)}else{for(let q=0;q<P2[k].p.length;q+=18){D.p.push(...P2[k].p.slice(q,q+9));D.n.push(...P2[k].n.slice(q,q+9));D.uv.push(...P2[k].uv.slice(q/3*2/1.5,q/3*2/1.5+6))}}}}
 // ribbon seam along a curve of (u,a) points
 function seam(mat,pts,w,off){const G=[];pts.forEach(([u,a],k)=>{const m=tMark(u),t=a<0?lerp(m.c,m.rk,-a):lerp(m.c,m.t,a),p=evalS(u,t),n=evalN(u,t),q=pts[Math.min(pts.length-1,k+1)],o=pts[Math.max(0,k-1)];
  const m2=tMark(q[0]),t2=q[1]<0?lerp(m2.c,m2.rk,-q[1]):lerp(m2.c,m2.t,q[1]),m3=tMark(o[0]),t3=o[1]<0?lerp(m3.c,m3.rk,-o[1]):lerp(m3.c,m3.t,o[1]),dv=nrm(sub(evalS(q[0],t2),evalS(o[0],t3))),sd=nrm(crs(n,dv));
  G.push([[p[0]+n[0]*off-sd[0]*w,p[1]+n[1]*off-sd[1]*w,p[2]+n[2]*off-sd[2]*w],[p[0]+n[0]*off+sd[0]*w,p[1]+n[1]*off+sd[1]*w,p[2]+n[2]*off+sd[2]*w]])});
  grid(P,G,()=>mat,(i,j)=>{const p=G[i][j];return[p[0]-1,p[1]-.3,p[2]]})}
 // ---- glasshouse
 const hiAtX=(u,x)=>{const b=sec(u),h=b.hi;for(let i=1;i<h.length;i++)if(h[i][0]<=x){const f=(x-h[i][0])/((h[i-1][0]-h[i][0])||1);return lerp(h[i][1],h[i-1][1],f)}return h[h.length-1][1]};
 const xb=u=>sec(u).wt*gw*(gw<1?1:1),yB=u=>gw<1?hiAtX(u,xb(u)):sec(u).ye;
 const yA=yB(s.uA),yDd=yB(s.uD),rY=mc([[s.uA,yA],[s.uA+(s.uW-s.uA)*.55,yA+(s.yr-yA)*.8],[s.uW,s.yr-.01],[(s.uW+s.uR)/2,s.yr],[s.uR,s.yr-.025],[s.uR+(s.uD-s.uR)*.5,s.yr-(s.yr-yDd)*.42],[s.uD,yDd]]);
 const rW=mc([[s.uA,xb(s.uA)],[s.uW,W2*s.tw],[s.uR,W2*s.tw*.97],[s.uD,xb(s.uD)*.95]]);
 const bx=s.dr==4?s.uW+(s.uR-s.uW)*(s.lw?.5:.42):s.uR-.012,pw=.06/L,pil=[[bx-pw,bx+pw]];if(s.lw)pil.push([s.uW+(s.uR-s.uW)*.8-pw*.8,s.uW+(s.uR-s.uW)*.8+pw*.8]);
 let ug=[];for(let i=0;i<=34;i++)ug.push(lerp(s.uA,s.uD,i/34));pil.forEach(q=>ug.push(q[0],q[1]));ug.push(s.uW,s.uR);ug=ug.sort((a,b)=>a-b).filter((u,i,a)=>i==0||u-a[i-1]>.001);
 let iG=0,iE=0;const GH=ug.map(u=>{const x0=xb(u),y0=yB(u),ry=Math.max(y0,rY(u)),rw=Math.min(x0,rW(u)),h=ry-y0;
  const C=[[x0,y0],[lerp(rw,x0,.12)+.002,ry-Math.min(.09,h*.5)],[rw*.97,ry-Math.min(.018,h*.2)],[rw*.72,ry+Math.min(.022,h*.3)],[0,ry+Math.min(.03,h*.35)]],pts=cr(C,3);iG=3;iE=6;return pts.map(p=>[p[0],p[1],Z(u)])});
 const FR=s.rf==0?'paint':'black',inPil=u=>pil.some(q=>u>q[0]&&u<q[1]);
 grid(P,GH,(i,j)=>{const u=(ug[i]+ug[i+1])/2;if(j<iG)return inPil(u)||(s.cp&&u>s.uR-.012)?FR:j==0?'trim':'glass';if(j<iE+1)return FR;return u<s.uW?'glass':u<s.uR?(s.rf==2?'glassroof':FR):'glass'},(i,j)=>[0,yB(ug[i])-.6,Z(ug[i])]);
 if(s.cl)for(const c of[s.uF,s.uB]){const G=[];for(let k=0;k<=24;k++){const ph=Math.PI*(1.03-1.06*k/24),row=[];for(const rad of[R-.005,R+.13]){const z=Z(c)+Math.cos(ph)*rad,y=s.r+Math.sin(ph)*rad,u=(L/2-z)/L,b=sec(clp(u,0,1));let x=b.wm;const lr=b.loR;for(let q=1;q<lr.length;q++)if(lr[q][1]>=y){const f=(y-lr[q-1][1])/((lr[q][1]-lr[q-1][1])||1);x=lerp(lr[q-1][0],lr[q][0],clp(f,0,1));break}row.push([x+(rad>R?.012:.03),y,z])}G.push(row)}grid(P,G,()=>'dark',(i,j)=>[0,s.r,G[i][0][2]])}
 // ---- body details on the surface
 const m0=tMark(.5),xA=s.uA-.008,xB=bx,xC=s.dr==4?s.uR-.02:s.uR+.02,doors=s.dr==4?[xA,xB,xC]:[xA,xC];
 for(const u of doors)seam('seam',[...Array(9)].map((_,k)=>[u,lerp(-.85,.98,k/8)]),.005,.002);
 seam('seam',[...Array(12)].map((_,k)=>[lerp(.025,s.uA-.012,k/11),1.12]),.004,.002);
 if(s.uD<.9)seam('seam',[...Array(8)].map((_,k)=>[lerp(s.uD+.012,.985,k/7),1.12]),.004,.002);
 for(let k=0;k<doors.length-1;k++)patch(s.lux?'chrome':'handle',doors[k+1]+.012,doors[k+1]+.012+.13/L,-.22,-.12,2,1,.004);
 patch('seam',.9,.9+.11/L,.2,.55,2,2,.002,false);
 // ---- face (end-cap) patches: rows follow the perimeter arc t, f = fraction from centre line (0) to the edge (1)
 function capPt(ri,t,f){const r=rows[ri].S,pts=r.lo.concat(r.hi.slice(1)),c=arcs(pts),T=c[c.length-1]*clp(t,0,1);let i=1;while(i<c.length-1&&c[i]<T)i++;const g=(T-c[i-1])/((c[i]-c[i-1])||1),a=pts[i-1],b=pts[i],za=a.length>2?a[2]:r.z,zb=b.length>2?b[2]:r.z;
  const x=lerp(a[0],b[0],g),y=lerp(a[1],b[1],g),z=lerp(za,zb,g);return[x*f,y,z]}
 function capPatch(mat,front,t0,t1,f0,f1,nu,nv,off){const ri=front?0:rows.length-1,dir=front?1:-1,G=[];for(let i=0;i<=nu;i++){const t=lerp(t0,t1,i/nu),row=[];for(let j=0;j<=nv;j++){const f=lerp(f0,f1,j/nv),p=capPt(ri,t,f),pu=capPt(ri,t+.01,f),pd=capPt(ri,t-.01,f);
   const tv=nrm(sub(pu,pd)),n=nrm(crs(tv,[1,0,0]));const nn=n[2]*dir<0?n.map(v=>-v):n;row.push([p[0]+nn[0]*off,p[1]+nn[1]*off,p[2]+nn[2]*off])}G.push(row)}
  grid(P,G,()=>mat,(i,j)=>{const q=G[i][j];return[q[0],q[1],q[2]-dir]},(i,j)=>[j/nv,i/nu])}
 const mF=tMark(0),mR=tMark(1),tCF=mF.c,tTF=mF.t,tRF=mF.rk,tCR=mR.c,tTR=mR.t,tRR=mR.rk;
 // headlights: outer upper face + wrap onto the corner
 const hA=s.ov?[tCF-.12,tTF-.004]:s.hl?[tCF-.05,tTF-.004]:[tCF-.08,tTF-.006],hF=s.ov?[.52,1]:s.hl?[.5,1]:[.5,1];
 capPatch('hlin',true,hA[0],hA[1],hF[0],hF[1],4,8,.006);capPatch('lens',true,hA[0]-.01,hA[1]+.003,hF[0]-.03,1,4,8,.014);
 patch('hlin',-1,-.35,-.5,.98,6,4,.006);patch('lens',-1,-.33,-.55,1.0,6,4,.014);
 if(s.ev||s.rf)capPatch('drl',true,tTF-.018,tTF-.006,0,hF[0],1,6,.007);
 // grille / intakes / splitter
 if(s.mid){capPatch('grille',true,tRF+.01,tCF-.04,.42,.96,3,6,.005);capPatch('grille',true,tRF+.005,tRF+.06,0,.4,2,4,.005);capPatch('dark',true,0,tRF+.004,0,1,2,8,.012)}
 else if(s.ev){capPatch('grille',true,tRF+.01,tRF+.07,0,.7,2,6,.005)}
 else if(s.lux){capPatch('chrome',true,tRF+.06,hA[0]-.005,0,.46,4,4,.005);capPatch('grille',true,tRF+.075,hA[0]-.02,0,.42,4,4,.008)}
 else{capPatch('grille',true,tRF+.05,hA[0]+.02,0,s.cl?.5:.44,4,6,.005);capPatch('grille',true,tRF+.006,tRF+.045,0,.82,2,6,.005);if(s.cl)capPatch('chrome',true,0,tRF,0,.5,2,4,.012)}
 // rear: tail lamps (+ wrap), light bar, bumper/diffuser
 const tA=[tCR+.005,tTR-.006],tF=s.tl=='split'?[.3,1]:[.55,1];capPatch('tlin',false,tA[0],tA[1],tF[0],tF[1],4,8,.006);capPatch('tlens',false,tA[0]-.008,tA[1]+.003,tF[0]-.02,1,4,8,.014);
 patch('tlin',1.3,2,-.15,.95,6,4,.006);patch('tlens',1.28,2,-.2,1.0,6,4,.014);
 if(s.tl!='split'){capPatch('tlin',false,tTR-.03,tTR-.012,0,tF[0],1,6,.006);capPatch('tlens',false,tTR-.034,tTR-.008,0,tF[0],1,6,.014)}
 capPatch('dark',false,0,tRR+.03,0,.92,2,6,.008);if(s.mid||s.ev)for(let k=0;k<4;k++)capPatch('black',false,0,tRR+.02,.1+k*.2,.13+k*.2,1,1,.06);
 // side intakes (mid-engine), bonnet vents, police band
 if(s.scoop)patch('grille',s.uR-.012,s.uB-(R+.06)/L,-.9,.05,6,4,.004);
 if(s.vents)patch('grille',.09,.19,1.25,1.5,3,2,.004);
 if(pol)patch('stripe',.03,.97,-.72,-.38,36,2,.0035);
 // wheel-arch liners (dark, seen from outside under the arch)
 for(const c of[s.uF,s.uB]){const G=[];for(let k=0;k<=16;k++){const ph=Math.PI*(1.04-1.08*k/16);G.push([0,1].map(f=>[f*(W2-.06),s.r+Math.sin(ph)*(R-.01),Z(c)+Math.cos(ph)*(R-.01)]))}grid(P,G,()=>'liner',(i,j)=>[G[i][j][0],s.r,Z(c)])}
 // mirrors (housing + stalk + indicator), right side then mirrored
 {const M=evalS(s.uA+.035,tMark(s.uA+.035).t),mm=s.rf==0?'paint':'black',P3={};ellT(P3,mm,M[0]+.15,M[1]+.09,M[2]-.04,.075,.085,.15);boxT(P3,mm,M[0]+.06,M[1]+.05,M[2]-.02,.12,.04,.08);boxT(P3,'amber',M[0]+.2,M[1]+.06,M[2]+.06,.05,.02,.08);
  for(const k in P3){mirX(P3,k);const D=P[k]||(P[k]={p:[],n:[],uv:[]});D.p.push(...P3[k].p);D.n.push(...P3[k].n);D.uv.push(...P3[k].uv)}}
 // interior (right-hand drive): seats, rear bench, dashboard, wheel rim, centre screen
 {const yb=yB((s.uA+s.uD)/2),y0=yb-.36,zs=Z((s.uW+bx)/2),cw=xb(s.uW)*.9,kH=clp((s.yr-yb)/.6,.5,1),P3={};
  for(const sd of[-1,1]){boxT(P3,'int',sd*cw*.45,y0+.06,zs,cw*.42,.14,.46);boxT(P3,'int',sd*cw*.45,y0+.32*kH,zs-.24,cw*.42,.5*kH,.1,-.15);boxT(P3,'int',sd*cw*.45,y0+.62*kH,zs-.27,.2,.11,.08)}
  if(s.dr==4){const zr=Z((bx+s.uR)/2);boxT(P3,'int',0,y0+.06,zr,cw*1.6,.14,.42);boxT(P3,'int',0,y0+.28*kH,zr-.22,cw*1.6,.42*kH,.1,-.12)}
  const ud=s.uA+(s.uW-s.uA)*.55,zd=Z(ud),yd=Math.min(yB(ud),rY(ud))-.1;boxT(P3,'int',0,yd-.06,zd,cw*1.6,.16,.3);boxT(P3,'screen',0,yd+.04,zd-.14,.4,.15,.02,-.3);boxT(P3,'int',-cw*.45,yd-.02,zd-.36,.32,.32,.03,-.45);
  for(const k in P3){const D=P[k]||(P[k]={p:[],n:[],uv:[]});D.p.push(...P3[k].p);D.n.push(...P3[k].n);D.uv.push(...P3[k].uv)}}
 // meta for flat-face parts
 const cf=rows[0].S,crr=rows[rows.length-1].S,mir=evalS(s.uA+.035,tMark(s.uA+.035).t);
 const cp=(front,t,f)=>capPt(front?0:rows.length-1,t,f);return{P,meta:{plF:cp(1,tRF+.09,0),plR:cp(0,(tRR+tCR)/2+.02,0),exY:cp(0,tRR+.01,0)[1],exZ:cp(0,tRR+.01,.3)[2],L,W:s.W,s,zF:cf.z,zR:crr.z,fy0:cf.y0,fyc:cf.yc,fys:cf.ys,ry0:crr.y0,ryc:crr.yc,rys:crr.ys,wF:cf.lo[cf.lo.length-1][0],wR:crr.lo[crr.lo.length-1][0],zW:[Z(s.uF),Z(s.uB)],R,mir,roofY:s.yr,roofZ:Z((s.uW+s.uR)/2),roofW:W2*s.tw,belt:yB((s.uA+s.uD)/2),cabZ:[Z(s.uA),Z(s.uD)],uA:Z(s.uA),uW:Z(s.uW),bx:Z(bx),deckY:s.yd,spZ:Z(.95),wTop:sec(.5).wt}}}
// ---- wheels: lathe tyre with sidewall bulge, rim barrel + spokes (+ disc), all along +x outer face
function lathe(P,mat,prof,seg,col){const G=[];for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2,c=Math.cos(a),sn=Math.sin(a);G.push(prof.map(([r,x])=>[x,r*sn,r*c]))}const P2={};grid(P2,G,()=>mat,(i,j)=>[0,0,0],(i,j)=>[i/seg*8,j/(prof.length-1)]);
 const D=P[mat]||(P[mat]={p:[],n:[],uv:[]});// grid() mirrors in x; keep only right-handed copy by taking first half of each pair
 const p=P2[mat];for(let q=0;q<p.p.length;q+=18){D.p.push(...p.p.slice(q,q+9));D.n.push(...p.n.slice(q,q+9));D.uv.push(...p.uv.slice(q/9*6,q/9*6+6))}}
function prism(P,mat,poly,x0,x1){const D=P[mat]||(P[mat]={p:[],n:[],uv:[]}),n=poly.length;let cy=0,cz=0;poly.forEach(p=>{cy+=p[0];cz+=p[1]});cy/=n;cz/=n;
 for(let i=0;i<n;i++){const a=poly[i],b=poly[(i+1)%n];for(const[x,nx]of[[x1,1],[x0,-1]]){const A=[x,a[0],a[1]],B=[x,b[0],b[1]],C=[x,cy,cz];let nn=crs(sub(A,C),sub(B,C));const ok=nn[0]*nx>0;const T=ok?[C,A,B]:[C,B,A];D.p.push(...T[0],...T[1],...T[2]);for(let k=0;k<3;k++)D.n.push(nx,0,0);D.uv.push(0,0,0,0,0,0)}
  const A=[x0,a[0],a[1]],B=[x0,b[0],b[1]],C=[x1,b[0],b[1]],Dd=[x1,a[0],a[1]],mid=[0,(a[0]+b[0])/2-cy,(a[1]+b[1])/2-cz];let nn=nrm(crs(sub(B,A),sub(C,A)));if(dot(nn,mid)<0){D.p.push(...A,...C,...B,...A,...Dd,...C);nn=nn.map(v=>-v)}else{D.p.push(...A,...B,...C,...A,...C,...Dd)}for(let k=0;k<6;k++)D.n.push(...nn);D.uv.push(0,0,0,0,0,0,0,0,0,0,0,0)}}
function wheel(r,style){const P={},tw=Math.min(.32,r*.72),rr=r*.72,h=tw/2;
 lathe(P,'tyre',[[rr,-h+.015],[rr+.03,-h-.004],[r-.07,-h-.014],[r-.03,-h+.004],[r-.004,-h+.03],[r,-h+.06],[r,h-.06],[r-.004,h-.03],[r-.03,h-.004],[r-.07,h+.014],[rr+.03,h+.004],[rr,h-.015]],36);
 lathe(P,'rim',[[rr,h-.012],[rr-.02,h-.03],[rr-.025,-h+.04],[rr-.005,-h+.02]],32);lathe(P,'rim',[[rr+.008,h-.004],[rr-.01,h+.004],[rr-.03,h-.006]],32);
 lathe(P,'disc',[[.06,-.02],[rr*.82,-.02],[rr*.82,.01],[.06,.01]],28);
 const n=style=='aero'?5:style=='forged'?10:5,hub=.075,xo=h-.035;
 if(style=='aero'){lathe(P,'rim',[[0,xo+.012],[rr*.55,xo+.008],[rr*.68,xo-.004],[rr*.69,xo-.03]],32);for(let i=0;i<5;i++){const a=i/5*Math.PI*2;prism(P,'disc',[[Math.sin(a-.12)*rr*.42,Math.cos(a-.12)*rr*.42],[Math.sin(a+.12)*rr*.42,Math.cos(a+.12)*rr*.42],[Math.sin(a+.08)*rr*.62,Math.cos(a+.08)*rr*.62],[Math.sin(a-.08)*rr*.62,Math.cos(a-.08)*rr*.62]],xo+.008,xo+.016)}}
 else{const pairs=style=='twin'?[-.09,.09]:[0];for(let i=0;i<n;i++)for(const o of pairs){const a=i/n*Math.PI*2+o,w1=style=='forged'?.026:.034,w2=style=='forged'?.016:.022,r1=hub*.9,r2=rr-.02,ca=Math.cos(a),sa=Math.sin(a),px=-ca,py=sa;
  const q=[[sa*r1+ca*w1,ca*r1-sa*w1],[sa*r1-ca*w1,ca*r1+sa*w1],[sa*r2-ca*w2,ca*r2+sa*w2],[sa*r2+ca*w2,ca*r2-sa*w2]];void px;void py;prism(P,'rim',q,xo-.03,xo+.012)}}
 lathe(P,'rim',[[0,xo+.02],[hub,xo+.016],[hub*1.1,xo-.01],[hub*.6,xo-.03]],20);
 for(let i=0;i<5;i++){const a=i/5*Math.PI*2+.6,cy=Math.sin(a)*hub*.62,cz=Math.cos(a)*hub*.62;prism(P,'disc',[...Array(6)].map((_,k)=>[cy+Math.sin(k/6*6.283)*.011,cz+Math.cos(k/6*6.283)*.011]),xo+.012,xo+.03)}
 return P}
return{S,build,wheel,mc}})();
// ===== VEHICLES v4: smooth real-car bodies + realistic materials (cars-only revamp) =====
function v4Merge(items){let n=0,col=items.some(it=>it[2]!=null);for(const[L]of items)if(L)n+=L.p.length;if(!n)return null;const pos=new Float32Array(n),nor=new Float32Array(n),uv=new Float32Array(n/3*2),cc=col?new Float32Array(n):null,tc=new T.Color();let o=0,ou=0;
 for(const[L,rect,c]of items){if(!L)continue;pos.set(L.p,o);nor.set(L.n,o);for(let i=0;i<L.uv.length;i+=2){const u=L.uv[i],v=L.uv[i+1];uv[ou+i]=rect?rect[0]+u*rect[2]:u;uv[ou+i+1]=rect?rect[1]+v*rect[3]:v}
  if(col){tc.set(c==null?0xffffff:c);for(let i=0;i<L.p.length;i+=3){cc[o+i]=tc.r;cc[o+i+1]=tc.g;cc[o+i+2]=tc.b}}o+=L.p.length;ou+=L.uv.length}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('normal',new T.BufferAttribute(nor,3));g.setAttribute('uv',new T.BufferAttribute(uv,2));if(col)g.setAttribute('color',new T.BufferAttribute(cc,3));g.computeBoundingSphere();return g}
// lamp atlas: A headlight internals, B tail internals, C pure light (DRL/bars), D dash screen, E amber
const V4R={A:[0,.5,.5,.5],B:[.5,.5,.5,.5],C:[0,.25,.25,.25],D:[.5,0,.5,.25],E:[.25,.25,.25,.25]};
function v4Atlas(){if(GX.v4atl)return GX.v4atl;const mk=em=>{const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');g.fillStyle=em?'#000':'#16181b';g.fillRect(0,0,512,512);
  // A (top-left in canvas = v .5..1): dark housing, chrome bowls, projector lenses, LED strip on top
  if(!em){const gr=g.createLinearGradient(0,0,0,256);gr.addColorStop(0,'#3a3e44');gr.addColorStop(1,'#0e0f11');g.fillStyle=gr;g.fillRect(0,0,256,256)}
  for(const x of[70,170]){const rg=g.createRadialGradient(x,150,4,x,150,52);rg.addColorStop(0,em?'#888':'#f4f6f8');rg.addColorStop(.35,em?'#222':'#9aa3ad');rg.addColorStop(.7,em?'#000':'#2b3038');rg.addColorStop(1,em?'#000':'#121418');g.fillStyle=rg;g.beginPath();g.arc(x,150,52,0,7);g.fill();
   g.fillStyle=em?'#cfd8ff':'#dfe8ff';g.beginPath();g.arc(x,150,15,0,7);g.fill()}
  g.fillStyle='#fff';g.fillRect(8,22,240,20);g.fillRect(8,42,30,60);for(let i=0;i<8;i++)g.fillRect(52+i*24,210,12,8);
  // B tail internals (top-right): red base + LED bars
  g.fillStyle=em?'#300':'#5a0608';g.fillRect(256,0,256,256);g.fillStyle=em?'#ff1a14':'#ff4038';for(let i=0;i<4;i++)g.fillRect(266,30+i*50,236,12+(i==0?10:0));g.fillStyle=em?'#ff2a20':'#ff6a60';g.fillRect(266,226,236,6);
  // C light (DRL/bars)
  g.fillStyle='#fff';g.fillRect(0,256,128,128);
  // E amber
  g.fillStyle=em?'#ff9a10':'#ffb030';g.fillRect(128,256,128,128);
  // D screen (bottom-right)
  const sg=g.createLinearGradient(256,384,512,512);sg.addColorStop(0,em?'#123a6a':'#1b4f8f');sg.addColorStop(1,em?'#061830':'#0b2a52');g.fillStyle=sg;g.fillRect(256,384,256,128);g.fillStyle=em?'#4aa3ff':'#8fc8ff';g.fillRect(276,404,90,8);g.fillRect(276,420,60,6);g.beginPath();g.arc(440,450,30,0,7);g.strokeStyle=g.fillStyle;g.lineWidth=5;g.stroke();
  const t=new T.CanvasTexture(c);return t};
 return GX.v4atl={map:mk(0),em:mk(1)}}
function v4Tex(kind){GX.v4tx=GX.v4tx||{};if(GX.v4tx[kind])return GX.v4tx[kind];const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
 if(kind=='hex'){g.fillStyle='#050506';g.fillRect(0,0,128,128);g.strokeStyle='#2d3036';g.lineWidth=3;for(let y=0;y<9;y++)for(let x=0;x<9;x++){const cx=x*16+(y%2?8:0),cy=y*14;g.beginPath();for(let k=0;k<6;k++){const a=k/6*6.283+.52;g.lineTo(cx+Math.cos(a)*7,cy+Math.sin(a)*7)}g.closePath();g.stroke()}}
 else if(kind=='tread'){g.fillStyle='#1a1b1d';g.fillRect(0,0,128,128);g.fillStyle='#0b0b0c';for(const y of[48,58,70,80])g.fillRect(0,y,128,3);for(let x=0;x<128;x+=8){g.fillRect(x,50,2,8);g.fillRect(x+4,72,2,8)}g.fillStyle='#232427';g.fillRect(0,0,128,30);g.fillRect(0,100,128,28);
  g.fillStyle='rgba(255,255,255,.08)';g.font='bold 10px Arial';g.fillText('RADIAL 245/40 R19',4,14);g.fillText('RADIAL 245/40 R19',4,118)}
 const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;if(kind=='hex')t.repeat.set(4,2);return GX.v4tx[kind]=t}
function v4Mats(){if(GX.v4m)return GX.v4m;const A=v4Atlas(),M={};
 M.dark=new _Std({color:0x0d0e10,roughness:.78,metalness:.05,side:T.DoubleSide});
 M.lamp=gxReg(new _Std({map:A.map,emissiveMap:A.em,emissive:new T.Color(0xffffff),emissiveIntensity:1.1,roughness:.22,metalness:.55}));
 M.lens=gxReg(new _Std({color:0xffffff,vertexColors:true,transparent:true,opacity:.32,roughness:.02,metalness:.1,depthWrite:false}));
 M.grille=new _Std({map:v4Tex('hex'),roughness:.45,metalness:.35});
 M.int=new _Std({color:0x1e1f22,roughness:.85});M.tyre=new _Std({map:v4Tex('tread'),roughness:.93});
 M.rim={chrome:gxReg(new _Std({color:0xdadde1,vertexColors:true,roughness:.16,metalness:.95})),gun:gxReg(new _Std({color:0x4b4f56,vertexColors:true,roughness:.22,metalness:.9})),black:gxReg(new _Std({color:0x16171a,vertexColors:true,roughness:.18,metalness:.6}))};
 M.glass=gxReg(new _Std({color:0x1f2a33,roughness:.02,metalness:.25,transparent:true,opacity:.42,depthWrite:false}));
 [M.lamp,M.lens,M.glass,M.rim.chrome,M.rim.gun,M.rim.black,GX.vbk,GX.vch].forEach(m=>{GX.vref=GX.vref||[];if(m)GX.vref.push(m)});
 return GX.v4m=M}
const V4C={};
function v4Model(model,pol){const key=model+(pol?'_p':'');if(V4C[key])return V4C[key];const r=VG.build(model,pol),P=r.P,m=r.meta,s=m.s,lux=!!s.lux,byv=Math.max(.5,s.ys*.85);
 const G={body:v4Merge([[P.paint],lux?[null]:[P.handle]]),dark:v4Merge([[P.dark],[P.seam],[P.liner],[P.bed]]),black:v4Merge([[P.black],[P.trim],[P.engine]]),glass:v4Merge([[P.glass],[P.glassroof]]),
  chrome:v4Merge([[P.chrome],lux?[P.handle]:[null]]),lamps:v4Merge([[P.hlin,V4R.A],[P.tlin,V4R.B],[P.drl,V4R.C],[P.screen,V4R.D],[P.amber,V4R.E]]),lens:v4Merge([[P.lens,null,0xffffff],[P.tlens,null,0xd01010]]),
  grille:v4Merge([[P.grille]]),int:v4Merge([[P.int]]),stripe:v4Merge([[P.stripe]])};
 if(G.body){const a=G.body.attributes.position.array;for(let i=1;i<a.length;i+=3)a[i]-=byv;G.body.computeBoundingSphere()}
 return V4C[key]={G,m,s,byv}}
const V4W={};function v4Wheel(r,st){const k=r+st;if(V4W[k])return V4W[k];const W=VG.wheel(r,st);return V4W[k]={tyre:v4Merge([[W.tyre]]),rim:v4Merge([[W.rim,null,0xffffff],[W.disc,null,0x6a6d72]])}}
function car(col,pol,model){model=model||'sedan';if(pol)col=0xf3f4f6;const M=MD[model],g=new T.Group(),V=v4Model(model,pol),m=V.m,s=V.s,X=v4Mats(),Zu=u=>m.L/2-u*m.L;
 const add=(geo,mat,cs,par)=>{if(!geo)return null;const o=new T.Mesh(geo,mat);o.castShadow=!!cs;o.receiveShadow=!!cs;(par||g).add(o);return o};
 g.body=new T.Mesh(V.G.body,paint(col));g.body.position.y=V.byv;g.body.castShadow=g.body.receiveShadow=true;g.add(g.body);
 g.cab=new T.Group();g.add(g.cab);g.det=new T.Group();g.add(g.det);
 add(V.G.dark,X.dark,1);add(V.G.black,GX.vbk,1);add(V.G.glass,X.glass);add(V.G.chrome,GX.vch);add(V.G.lamps,X.lamp);add(V.G.lens,X.lens,0,g.det);add(V.G.grille,X.grille);add(V.G.int,X.int,0,g.det);add(V.G.stripe,GX.vst);
 // plates
 {const pm=GX.vplates[(R()*GX.vplates.length)|0];for(const[p,dir]of[[m.plF,1],[m.plR,-1]]){const q=new T.Mesh(new T.PlaneGeometry(.52,.13),pm);q.position.set(0,p[1],p[2]+dir*.02);if(dir<0)q.rotation.y=Math.PI;g.det.add(q)}}
 // aero, roof gear, exhausts (black carbon / chrome)
 const KB=[],CH=[];
 if(s.sp=='lip')vb(KB,s.W*.72,.03,.22,0,m.deckY+.025,Zu(.975));
 if(s.sp=='bigwing'){const wz=Zu(.94),wy=m.deckY+.42;vb(KB,s.W*.98,.05,.55,0,wy,wz,-.08,0,0);for(const sd of[-1,1]){vb(KB,.03,.26,.6,sd*s.W*.49,wy-.06,wz);vb(KB,.06,.42,.12,sd*.32,m.deckY+.21,wz+.08,-.2,0,0)}}
 if(s.sp=='roof')vb(KB,m.roofW*1.75,.035,.3,0,s.yr-.025,Zu(s.uR)-.05);
 if(s.rails)for(const sd of[-1,1]){const rx=sd*m.roofW*.82,ln=(s.uR-s.uW)*m.L*.92;vb(KB,.05,.04,ln,rx,s.yr+.075,m.roofZ);for(const f of[-.45,0,.45])vb(KB,.05,.06,.08,rx,s.yr+.04,m.roofZ+f*ln)}
 if(model=='offroad'){vb(KB,m.roofW*1.6,.05,(s.uR-s.uW)*m.L*.7,0,s.yr+.1,m.roofZ);for(const a of[-1,1])for(const b of[-1,1])vb(KB,.05,.08,.05,a*m.roofW*.75,s.yr+.05,m.roofZ+b*(s.uR-s.uW)*m.L*.32);
  vput(KB,torG(.33,.13),0,1.0,m.zR-.17,1,1,1,0,0,0);vcz(CH,.2,.06,0,1.0,m.zR-.15);vb(KB,.12,s.yr-s.yb,.12,-(m.wTop+.05),(s.yr+s.yb)/2-.1,Zu(s.uA)+.2)}
 if(s.ex=='quadbox')for(const f of[-.26,-.1,.1,.26])vb(CH,.1,.07,.16,f,m.exY+.06,m.exZ-.05);else if(s.ex=='quadhigh')for(const f of[-.2,-.07,.07,.2])vcz(CH,.05,.18,f,m.exY+.26,m.exZ-.06);else if(!s.ev&&!s.mid&&model!='electric')vcz(CH,.045,.14,m.W*.3,m.exY+.04,m.exZ-.03);
 add(mergeG(KB),GX.vbk,1);add(mergeG(CH),GX.vch);
 // police: POLISI door decals + roof light bar
 if(pol){for(const sd of[-1,1]){const d=new T.Mesh(new T.PlaneGeometry(m.L*.22,.2),GX.vpol);d.position.set(sd*(m.W/2*.985+.03),s.ys-.2,0);d.rotation.y=sd*Math.PI/2;g.add(d)}
  const ry=s.yr+.12,rz=m.roofZ;const base=new T.Mesh(new T.BoxGeometry(m.roofW*1.4,.08,.36),GX.vbk);base.position.set(0,s.yr+.05,rz);g.add(base);
  g.rl=new T.Mesh(new T.BoxGeometry(.55,.12,.3),new T.MeshBasicMaterial({color:0xff0000}));g.rl.position.set(-.3,ry,rz);g.add(g.rl);g.bl=new T.Mesh(new T.BoxGeometry(.55,.12,.3),new T.MeshBasicMaterial({color:0x0066ff}));g.bl.position.set(.3,ry,rz);g.add(g.bl)}
 // wheels: steer group -> spin group -> tyre + rim/disc; calipers on the non-spinning hub
 {const wst=s.ev?'aero':s.mid?'forged':'twin',W4=v4Wheel(s.r,wst),rm=s.mid?X.rim.black:s.cl?X.rim.gun:X.rim.chrome,tw=Math.min(.32,s.r*.72),wx=m.W/2-tw/2-.035;g.wh=[];g.wr=s.r;
  for(const c of[s.uF,s.uB])for(const sx of[-1,1]){const w=new T.Group();w.position.set(sx*wx,s.r,Zu(c));w.scale.x=sx;const sp=new T.Group();w.add(sp);add(W4.tyre,X.tyre,1,sp);add(W4.rim,rm,0,sp);
   if(s.cal||s.lux){const cm=GX['cal'+(s.cal||0x777b80)]||(GX['cal'+(s.cal||0x777b80)]=new _Std({color:s.cal||0x777b80,roughness:.35,metalness:.4})),cp=new T.Mesh(new T.BoxGeometry(.07,s.r*.42,s.r*.32),cm);cp.position.set(.05,s.r*.34,-s.r*.14);w.add(cp)}
   g.add(w);g.wh.push({w,s:sp})}}
 g.model=model;g.spec=M.spec;g.by=V.byv;g.cy=1e-4;g.hw=m.W/2;g.fuel=50+R()*50;g.dmg=0;g.base=col;g.tl=0;g.rotation.order='YXZ';sc.add(g);return g}
function dent(g,a){const d=g.dmg=cl(g.dmg+a,0,1);g.body.scale.set(1,1-.2*d,1-.14*d);g.body.position.y=(g.by||.85)-.07*d;g.cab.rotation.z=g.tl*d;g.cab.position.y=(g.cy||1.5)-.15*d;g.body.material.color.set(g.base).lerp(new T.Color(0x1a1a1a),d*.7)}
const mkB=(m,type)=>({m,type,x:0,z:0,y:0,vx:0,vz:0,vy:0,th:0,w:0,r:2,ms:type=='t'?1:1.3,fs:0,ls:0});
const P=mkB(car(0xd7263d),'p');Object.assign(P,{hp:100,heat:0,money:0,bust:0,dead:0,cd:0});
let police=[],shake=0;
const DB=[],dg=new T.BoxGeometry(.35,.2,.35);for(let i=0;i<90;i++){const m=new T.Mesh(dg,new T.MeshBasicMaterial({color:0x888888,transparent:true}));m.visible=false;sc.add(m);DB.push({m,t:0,vx:0,vy:0,vz:0,sm:0})}
let di=0;function spark(x,y,z,n,c,sp,sm){for(let i=0;i<n;i++){const d=DB[di++%90];d.t=sm?1.3:2.5;d.sm=sm;d.vx=(R()-.5)*sp;d.vz=(R()-.5)*sp;d.vy=sm?2+R()*2:2+R()*sp*.5;d.m.material.color.set(c);d.m.position.set(x,y,z);d.m.scale.setScalar(sm?1:.6+R()*1.2);d.m.visible=true}}
function crash(b,nx,nz,j,px,pz){const fx=SN(b.th),fz=CS(b.th);b.w+=j*(nx*fz-nz*fx)*(nx*fx+nz*fz)*.14+(R()-.5)*j*.04;
 if(j>3){dent(b.m,j*.012);spark(px,1,pz,Math.min(14,j|0),b.m.base,j*.8)}if(j>8)b.vy=Math.min(4,j*.15);
 if(b===P){P.hp-=Math.max(0,j-4)*1.1;shake=Math.min(1,shake+j/20);if(j>6)hornSnd(180)}}
function hit(b,nx,nz,pu){b.x+=nx*pu;b.z+=nz*pu;const vn=b.vx*nx+b.vz*nz;if(vn<0){const j=-1.35*vn;b.vx+=j*nx;b.vz+=j*nz;crash(b,nx,nz,j,b.x-nx*b.r,b.z-nz*b.r)}}
function wall(b){for(const o of B){if(Math.abs(b.x-o.x)>o.hx+b.r||Math.abs(b.z-o.z)>o.hz+b.r)continue;const cx=cl(b.x,o.x-o.hx,o.x+o.hx),cz=cl(b.z,o.z-o.hz,o.z+o.hz);let dx=b.x-cx,dz=b.z-cz,d=H(dx,dz);if(d>=b.r)continue;
  if(d==0){const px=o.hx-Math.abs(b.x-o.x),pz=o.hz-Math.abs(b.z-o.z);if(px<pz){dx=b.x>=o.x?1:-1;dz=0;d=-px}else{dz=b.z>=o.z?1:-1;dx=0;d=-pz}hit(b,dx,dz,b.r-d)}else hit(b,dx/d,dz/d,b.r-d)}
 for(const o of C){const dx=b.x-o.x,dz=b.z-o.z;if(Math.abs(dx)>o.r+b.r||Math.abs(dz)>o.r+b.r)continue;const d=H(dx,dz),rr=o.r+b.r;if(d<rr&&d>0)hit(b,dx/d,dz/d,rr-d)}
 if(Math.abs(b.x)>640){b.x=cl(b.x,-640,640);b.vx*=-.3}if(b.z<-590||b.z>890){b.z=cl(b.z,-590,890);b.vz*=-.3}}
function pr(a,b){const dx=a.x-b.x,dz=a.z-b.z,d=H(dx,dz);if(d>=3.9||d==0)return;const nx=dx/d,nz=dz/d,ov=3.9-d,s=a.ms+b.ms;
 a.x+=nx*ov*b.ms/s;a.z+=nz*ov*b.ms/s;b.x-=nx*ov*a.ms/s;b.z-=nz*ov*a.ms/s;
 const rel=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;if(rel>=0)return 0;const j=-1.5*rel/(1/a.ms+1/b.ms);a.vx+=j/a.ms*nx;a.vz+=j/a.ms*nz;b.vx-=j/b.ms*nx;b.vz-=j/b.ms*nz;
 const px=(a.x+b.x)/2,pz=(a.z+b.z)/2;crash(a,nx,nz,j/a.ms,px,pz);crash(b,-nx,-nz,j/b.ms,px,pz);
 if(a===P||b===P){const o=a===P?b:a;if(o.type=='t'&&P.cd<=0){P.heat+=.9;P.cd=1.2}}return 1}
function drive(b,thr,st,hb,dt,mx){const fx=SN(b.th),fz=CS(b.th),lx=fz,lz=-fx;let fs=b.vx*fx+b.vz*fz,ls=b.vx*lx+b.vz*lz;
 const SPc=b.m&&b.m.spec||{acc:1,top:1};if(thr>0)fs+=(fs<0?30:17)*thr*dt*SPc.acc;else if(thr<0)fs-=(fs>.5?34:12)*-thr*dt;else fs-=Math.sign(fs)*Math.min(Math.abs(fs),4*dt);
 if(hb)fs-=Math.sign(fs)*Math.min(Math.abs(fs),28*dt);fs=cl(fs-fs*.06*dt,-10,mx*SPc.top);ls*=EX(-(hb?1.2:7)*dt);
 b.vx=fx*fs+lx*ls;b.vz=fz*fs+lz*ls;b.th+=st*dt*1.9*cl(fs/9,-1,1)*(1-Math.abs(fs)/85)*(hb?1.6:1)+b.w*dt;b.w*=EX(-2.5*dt);b.fs=fs;b.ls=ls}
function step(b,dt){b.x+=b.vx*dt;b.z+=b.vz*dt;if(b.type=='t'){const e=EX(-1.4*dt);b.vx*=e;b.vz*=e;b.th+=b.w*dt;b.w*=EX(-1.2*dt)}
 if(b.y>0||b.vy>0){b.vy-=20*dt;b.y=Math.max(0,b.y+b.vy*dt);if(!b.y)b.vy=0}}
// ---- traffic on road polylines (left-hand) ----
function posAt(rd,s,dir,off){let i=0;while(i<rd.ns-1&&rd.cum[i+1]<s)i++;const a=rd.p[i],b=rd.p[(i+1)%rd.p.length],sl=rd.cum[i+1]-rd.cum[i],t=(s-rd.cum[i])/sl,dx=(b[0]-a[0])/sl*dir,dz=(b[1]-a[1])/sl*dir;
 return[a[0]+(b[0]-a[0])*t+dz*off,a[1]+(b[1]-a[1])*t-dx*off,dx,dz]}
const cols=[0xf2f3f5,0xf2f3f5,0xb8bcc2,0x5b6068,0x16181c,0x16181c,0x1f3b6e,0x8c1c24,0x7d8b75,0x8e9196,0xc9b79c],tr=[];
function place(c,md){for(let k=0;k<12;k++){c.s=R()*c.rd.len;const q=posAt(c.rd,c.s,c.dir,c.rd.lp?0:c.rd.hw*.45);c.x=q[0];c.z=q[1];c.th=Math.atan2(q[2],q[3]);if(H(c.x-P.x,c.z-P.z)>md)break}}
function respawn(c,md){c.dyn=0;c.idle=0;c.w=0;c.y=0;c.path=null;c.pi=0;c.stuckT=0;c.stuckN=0;dent(c.m,-1);if(c.home){c.x=c.home[0];c.z=c.home[1];c.th=c.home[2];c.vx=c.vz=c.vy=0}else place(c,md)}
RDS.forEach(r=>{const n=r.lp?5:Math.max(2,Math.round(r.len/90));for(let i=0;i<n;i++){const c=mkB(mkCar(pickModel()),'t');c.rd=r;c.dir=r.lp?1:i%2?-1:1;c.v=10+R()*3;tr.push(c)}});
RDS.forEach(r=>{if(r.lp||r.len<120)return;for(let i=0;i<Math.round(r.len/75);i++){const dir=R()<.5?1:-1,q=posAt(r,R()*r.len,dir,r.hw-1.6);if(inB(q[0],q[1])||H(q[0]+126.6,q[1]-300)<14)continue;const c=mkB(mkCar(pickModel()),'t');c.pk=1;c.dir=dir;c.rd=r;c.v=0;c.home=[q[0],q[1],Math.atan2(q[2],q[3])];tr.push(c)}});
for(let i=tr.length-1;i>=0;i--){const c=tr[i];if(c.pk&&(STN.some(s=>inF(c.home[0],c.home[1],s.ox,s.oz,s.th,2))||STO.some(s=>inS(c.home[0],c.home[1],s.ox,s.oz,s.th,2))||BNK.some(s=>inK(c.home[0],c.home[1],s.ox,s.oz,s.th,2))||CLO.some(s=>inC(c.home[0],c.home[1],s.ox,s.oz,s.th,2)))){sc.remove(c.m);tr.splice(i,1)}}
// ---- state ----
var ENT=null,PAUSED=0,DAWN=0,ENDING=0,FIT=null,GS=null;let CP=[-126.6,300,-.043],RH=0;const F={on:0,x:0,z:0,yaw:0,pit:0,vx:0,vz:0,bob:0,hy:0,hp:0};
const st0=()=>{P.x=CP[0];P.z=CP[1];P.th=CP[2];ENT=null;F.on=0;P.vx=P.vz=P.w=P.vy=P.y=0;P.hp=100;if(P.m.fuel<30)P.m.fuel=30;P.heat=RH;P.bust=0;P.dead=0;dent(P.m,-1);police.forEach(p=>sc.remove(p.m));police=[];$('ov').style.display='none'};
st0();tr.forEach(c=>respawn(c,60));
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


let OB=[0,0];const TG=[["Bundaran HI",-150,650],["Monas",-125,-60],["Stasiun Gambir",125,-20],["Masjid Istiqlal",141,-230],["Sarinah",-135,290],["Grand Indonesia",-200,700],["Lapangan Banteng",212,162],["Taman Suropati",-20,433],["Taman Menteng",123,650],["Pasar Baru",181,-500],["Taman Ismail Marzuki",200,527],["Harmoni",-195,-300]];
const mk=new T.Mesh(new T.CylinderGeometry(4,4,70,16,1,true),new T.MeshBasicMaterial({color:0xffdd33,transparent:true,opacity:.4,side:T.DoubleSide}));sc.add(mk);
let tg=0;function nextT(){let n;do n=(R()*TG.length)|0;while(n==tg);tg=n;mk.position.set(TG[n][1],35,TG[n][2]);OB=[TG[n][1],TG[n][2]]}nextT();
function spawnPol(){const p=mkB(car(0x15171c,true),'c');p.ms=1.4;p.ttl=7;let r,s,q;for(let k=0;k<14;k++){r=RDS[(R()*(RDS.length-1))|0];s=R()*r.len;q=posAt(r,s,1,0);if(H(q[0]-P.x,q[1]-P.z)>150&&H(q[0]-P.x,q[1]-P.z)<300)break}p.x=q[0];p.z=q[1];p.th=Math.atan2(q[2],q[3]);police.push(p)}
// ---- input/audio ----
const k=new Set();let au,eo,cm=0;
addEventListener('keydown',e=>{k.add(e.code);if(e.code=='KeyC')cm=(cm+1)%3;if(e.code=='KeyR')st0();if(e.code=='KeyH')hornSnd(380);if(e.code=='Space')e.preventDefault();ia()});addEventListener('keyup',e=>k.delete(e.code));
document.querySelectorAll('#tc button').forEach(b=>{b.onpointerdown=()=>{k.add(b.dataset.k);ia()};b.onpointerup=b.onpointerleave=()=>k.delete(b.dataset.k)});if('ontouchstart'in window)$('tc').style.display='flex';
function ia(){if(au)return;try{au=new AudioContext();eo=au.createOscillator();eo.type='sawtooth';const g=au.createGain();g.gain.value=.025;eo.connect(g);g.connect(au.destination);eo.start()}catch(e){}}
function hornSnd(f){if(!au)return;const o=au.createOscillator(),g=au.createGain();o.type='square';o.frequency.value=f;g.gain.value=.05;g.gain.exponentialRampToValueAtTime(.001,au.currentTime+.3);o.connect(g);g.connect(au.destination);o.start();o.stop(au.currentTime+.3)}
// ---- minimap ----
const g2=$('mm').getContext('2d'),S=.28;
function mp(x,z){const dx=x-P.x,dz=z-P.z,s=SN(P.th),c=CS(P.th);return[75+(-dx*c+dz*s)*S,75-(dx*s+dz*c)*S]}
function dot(x,z,c,r){let[a,b]=mp(x,z);const dx=a-75,dy=b-75,d=H(dx,dy);if(d>66){a=75+dx/d*66;b=75+dy/d*66}g2.fillStyle=c;g2.beginPath();g2.arc(a,b,r,0,7);g2.fill()}
function line(p,w,c,lp){g2.strokeStyle=c;g2.lineWidth=Math.max(2,w*S);g2.beginPath();p.forEach((q,i)=>{const m=mp(q[0],q[1]);i?g2.lineTo(...m):g2.moveTo(...m)});if(lp)g2.closePath();g2.stroke()}
// hand-drawn minimap icons: 0 = pistol (gun store), 1 = bank building
function icon(x,z,k){let[a,b]=mp(x,z);const dx=a-75,dy=b-75,d=H(dx,dy);if(d>64){a=75+dx/d*64;b=75+dy/d*64}
 g2.save();g2.translate(a,b);g2.fillStyle=k==3?'#3b1f4a':k==2?'#0b3d2a':k?'#003d79':'#1f2937';g2.strokeStyle=k==3?'#f472b6':k==2?'#35e08a':k?'#fdb913':'#4cc9f0';g2.lineWidth=1.6;g2.beginPath();g2.arc(0,0,9,0,7);g2.fill();g2.stroke();
 if(k==2){g2.fillStyle='#e8eef5';g2.fillRect(-4.2,-6.8,1.7,13.6);g2.fillStyle='#35e08a';g2.beginPath();g2.moveTo(-2.5,-6.6);g2.lineTo(6.2,-3.6);g2.lineTo(-2.5,-.4);g2.closePath();g2.fill();g2.fillStyle='#0b3d2a';g2.fillRect(.4,-5.2,1.6,1.6)}
 else if(k==3){g2.fillStyle='#f5e9f2';g2.beginPath();g2.moveTo(-3,-5.5);g2.lineTo(-7,-2.4);g2.lineTo(-5.3,.6);g2.lineTo(-3.4,-.4);g2.lineTo(-3.4,5.5);g2.lineTo(3.4,5.5);g2.lineTo(3.4,-.4);g2.lineTo(5.3,.6);g2.lineTo(7,-2.4);g2.lineTo(3,-5.5);g2.quadraticCurveTo(0,-2.6,-3,-5.5);g2.closePath();g2.fill()}
 else if(k){g2.fillStyle='#fdb913';g2.beginPath();g2.moveTo(-6,-2);g2.lineTo(0,-6.4);g2.lineTo(6,-2);g2.closePath();g2.fill();
  for(let i=0;i<4;i++)g2.fillRect(-4.9+i*3.2,-1,1.7,5);g2.fillRect(-6.2,4.3,12.4,1.7)}
 else{g2.fillStyle='#e8eef5';g2.fillRect(-6.5,-3.8,12,3.2);g2.fillRect(5,-4.4,1.4,1.2);
  g2.beginPath();g2.moveTo(-5.2,-.6);g2.lineTo(-1.8,-.6);g2.lineTo(-2.9,5.2);g2.lineTo(-5.9,5.2);g2.closePath();g2.fill();
  g2.strokeStyle='#e8eef5';g2.lineWidth=1.1;g2.beginPath();g2.arc(.4,.9,2,0,Math.PI);g2.stroke()}
 g2.restore()}
function drawMM(){g2.clearRect(0,0,150,150);g2.save();g2.beginPath();g2.arc(75,75,75,0,7);g2.clip();g2.fillStyle='#1b2430';g2.fillRect(0,0,150,150);
 WT.forEach(w=>line(w[1],32,'#2f6a8f'));PK.forEach(p=>{g2.fillStyle='#3e7d38';g2.beginPath();if(p[0]=='r'){const h=p[3];[[-h,-h],[h,-h],[h,h],[-h,h]].forEach((q,i)=>{const m=mp(p[1]+q[0],p[2]+q[1]);i?g2.lineTo(...m):g2.moveTo(...m)})}else g2.arc(...mp(p[1],p[2]),p[3]*S,0,7);g2.fill()});
 RDS.forEach(r=>line(r.p,r.hw*2,'#6b7480',r.lp));STN.forEach(q=>dot(q.x,q.z,'#e63946',4));STO.forEach(q=>icon(q.x,q.z,0));BNK.forEach(q=>icon(q.x,q.z,1));CLO.forEach(q=>icon(q.x,q.z,3));if(stage<FIN)icon(EP[0],EP[1],2);dot(OB[0],OB[1],'#ffdd33',6);police.forEach(p=>dot(p.x,p.z,(Date.now()/200|0)%2?'#f33':'#39f',4));
 g2.restore();g2.fillStyle='#fff';g2.beginPath();g2.moveTo(75,66);g2.lineTo(70,82);g2.lineTo(80,82);g2.fill()}
// ---- loop ----
let t0=performance.now(),el=0,last='Jl. M.H. Thamrin',sm=0;
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-t0)/1000)*(WH?.25:1);t0=now;if(PAUSED){ren.render(sc,cam);return}if(CUT){cutTick(dt);return}el+=dt;P.cd-=dt;P.heat=Math.max(0,P.heat-.05*dt);
 const stars=Math.min(5,Math.ceil(P.heat));
 if(P.dead){P.dead+=dt;drive(P,0,0,1,dt,46);if(P.dead>2.8)st0()}else{
  const kk=n=>k.has(n),up=kk('KeyW')||kk('ArrowUp'),dn=kk('KeyS')||kk('ArrowDown'),lf=kk('KeyA')||kk('ArrowLeft'),rr=kk('KeyD')||kk('ArrowRight');
  if(F.on||ENT)drive(P,0,0,1,dt,46);else drive(P,P.m.fuel>0?(up?1:dn?-1:0):0,(lf?1:0)-(rr?1:0),kk('Space'),dt,46);foot(dt,kk);entTick(dt);
  story(dt)}
 while(police.length<Math.min(stars,4)&&!P.dead)spawnPol();
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
 if(LMAP){drawLMap();return}
 for(let i=police.length-1;i>=0;i--)if(stars==0&&(police[i].ttl<=0||H(P.x-police[i].x,P.z-police[i].z)>300)){sc.remove(police[i].m);police.splice(i,1)}
 [P,...police].forEach(b=>{b.m.position.set(b.x,b.y,b.z);b.m.rotation.y=b.th;b.m.rotation.z=cl(-b.ls*.02,-.25,.25)});
 if(!P.dead&&P.hp<=0){P.dead=.01;STAT.deaths++;spark(P.x,1.5,P.z,30,0xff8a1a,16);spark(P.x,2,P.z,20,0x222222,6,1);$('ov').textContent='WASTED';$('ov').style.display='flex'}
 if(near&&Math.abs(P.fs)<3&&!P.dead){P.bust+=dt;if(P.bust>2.5){STAT.busts++;if(hotT>0){const l=Math.min(P.money,HOT>>1);P.money-=l;hotT=0}P.money=Math.max(0,P.money-300);$('ov').textContent='BUSTED';$('ov').style.display='flex';st0();setTimeout(()=>{if(!P.dead)$('ov').style.display='none'},1500)}}else P.bust=Math.max(0,P.bust-dt);
 env();sm-=dt;if(P.hp<45&&!P.dead&&sm<=0){sm=.07;spark(P.x+SN(P.th)*2,1.4,P.z+CS(P.th)*2,1,0x555555,1,1)}
 DB.forEach(d=>{if(!d.m.visible)return;d.t-=dt;if(d.t<=0){d.m.visible=false;return}const p=d.m.position;if(d.sm){d.m.scale.addScalar(dt*4);d.m.material.opacity=d.t/1.3}else{d.vy-=18*dt;d.m.rotation.x+=dt*8;d.m.material.opacity=1}
  p.x+=d.vx*dt;p.y+=d.vy*dt;p.z+=d.vz*dt;if(!d.sm&&p.y<.1){p.y=.1;d.vy*=-.4;d.vx*=.7;d.vz*=.7}});
 const fx=SN(P.th),fz=CS(P.th);let tx,ty,tz,lx,ly,lz;
 const cv=FIT?8:GS?7:ENT?9:F.on?1:cm;dash.visible=cv==1&&!F.on;if(cv==0){tx=P.x-fx*10.5;ty=4.6;tz=P.z-fz*10.5;lx=P.x+fx*6;ly=1.5;lz=P.z+fz*6}else if(cv==7){[tx,ty,tz,lx,ly,lz]=gsCam()}else if(cv==8){[tx,ty,tz,lx,ly,lz]=fitCam()}else if(cv==9){[tx,ty,tz,lx,ly,lz]=entCam()}else if(cv==1){[tx,ty,tz,lx,ly,lz]=FP()}else{tx=P.x-fx*8;ty=60;tz=P.z-fz*8;lx=P.x+fx*2;ly=0;lz=P.z+fz*2}
 P.m.visible=!(cv==1&&!F.on);const a=cv==1||cv==9||cv==8||cv==7?1:Math.min(1,dt*6);cam.position.x+=(tx-cam.position.x)*a;cam.position.y+=(ty-cam.position.y)*a;cam.position.z+=(tz-cam.position.z)*a;
 shake*=EX(-4*dt);cam.position.x+=(R()-.5)*shake*1.5;cam.position.y+=(R()-.5)*shake;cam.lookAt(lx,ly,lz);ren.render(sc,cam);
 const[dd,nm]=dR(P.x,P.z,1);if(dd<3)last=nm;
 $('road').textContent=last;$('kmh').textContent=Math.round(Math.hypot(P.vx,P.vz)*3.6);$('hp').style.width=Math.max(0,P.hp)+'%';$('money').textContent='$'+P.money.toLocaleString('en-US');
 $('stars').textContent=Array.from({length:5},(_,i)=>i<stars?'★':'☆').join('');
 $('mis').textContent=objTxt();
 const m=(17*60+30+el*.5|0)%1440;$('clk').textContent='JAKARTA PUSAT · '+String(m/60|0).padStart(2,'0')+':'+String(m%60).padStart(2,'0')+' WIB';
 if(eo)eo.frequency.value=55+Math.abs(P.fs)*5;drawMM()}

// ================= STORY / FIRST PERSON / CUTSCENES =================
$('help').innerHTML='WASD move/drive · Mouse look · Shift run · <b>E</b> enter/exit car · Space handbrake · C camera · H horn · <b>M</b> live Jakarta map · <b>Click</b> shoot · hold <b>Q</b> weapon wheel · 1-9 weapons · T reload · Cars and pedestrians pathfind their own routes';
let CUT={title:1},stage=0,subT=0,ta=0;document.body.classList.add('cut');
const human=(col,skin,hair)=>{const g=new T.Group(),a=(w,h,d,x,y,z,c)=>{const m=new T.Mesh(RB(w,h,d),mat(c));m.position.set(x,y,z);g.add(m)};
 a(.3,.85,.3,-.17,.43,0,0x23262e);a(.3,.85,.3,.17,.43,0,0x23262e);a(.7,.8,.4,0,1.25,0,col);a(.2,.7,.2,-.45,1.2,0,col);a(.2,.7,.2,.45,1.2,0,col);a(.32,.34,.32,0,1.85,0,skin);a(.36,.14,.36,0,2.05,0,hair);a(.08,.08,.08,0,1.85,.18,skin);sc.add(g);g.visible=false;return g};
const RK=human(0x2f5d8a,0xc58c5a,0x151515),DW=human(0xb03a5c,0xd9a066,0x1a1008),JG=human(0x15151a,0xb07a56,0x888888),G1=human(0x222222,0xa8744d,0x111111),G2=human(0x222222,0xc58c5a,0x111111),HD=human(0x6b8e5a,0xc58c5a,0x4a3a2a);
DW.position.set(113,0,-20);JG.position.set(-20,0,425);G1.position.set(-22,0,422);G2.position.set(-22,0,428);HD.position.set(141,0,-230);DW.rotation.y=JG.rotation.y=HD.rotation.y=1.57;G1.rotation.y=G2.rotation.y=1.57;
const dash=new T.Group();{const d=new T.Mesh(new T.BoxGeometry(2.4,.5,.9),mat(0x15171c));d.position.set(0,-.78,-1.15);dash.add(d);const w=new T.Mesh(new T.TorusGeometry(.24,.035,8,20),mat(0x0b0b0b));w.position.set(0,-.42,-.75);w.rotation.x=-.8;dash.add(w);dash.w=w}cam.add(dash);dash.visible=false;
function FP(){let x,y,z,yw,pt;if(F.on){x=F.x;z=F.z;y=1.7+SN(F.bob*2)*.05*Math.min(1,H(F.vx,F.vz));yw=F.yaw;pt=F.pit}
 else{const fx=SN(P.th),fz=CS(P.th);x=P.x+fx*.1-fz*.5;z=P.z+fz*.1+fx*.5;y=1.35;yw=P.th+F.hy;pt=F.hp;const sv=(k.has('KeyA')||k.has('ArrowLeft')?1:0)-(k.has('KeyD')||k.has('ArrowRight')?1:0);dash.w.rotation.z+=(-sv*.9-dash.w.rotation.z)*.2}
 return[x,y,z,x+SN(yw)*CS(pt),y+SN(pt),z+CS(yw)*CS(pt)]}
function look(dx,dy){if(CUT||PAUSED)return;if(WH){wx=cl(wx+dx,-130,130);wy=cl(wy+dy,-130,130);if(H(wx,wy)>35){const o=owned(),n=o.length,g=o[Math.round(((Math.atan2(wx,-wy)+6.2832)%6.2832)/6.2832*n)%n];if(g!=WS){WS=g;wheelDraw()}}return}if(F.on){F.yaw-=dx*.0025*SEN;F.pit=cl(F.pit-dy*.0025*SEN,-1.3,1.3)}else{F.hy=cl(F.hy-dx*.0025*SEN,-2.4,2.4);F.hp=cl(F.hp-dy*.0025*SEN,-.9,.9)}}
addEventListener('mousemove',e=>{if(document.pointerLockElement||e.buttons&1)look(e.movementX,e.movementY)});
let tl=null;const cv_=$('c');cv_.addEventListener('touchstart',e=>{if(CUT&&!CUT.title)shot(CUT.i+1);const t=e.touches[0];if(t.clientX>innerWidth*.45)tl=[t.clientX,t.clientY]});
cv_.addEventListener('touchmove',e=>{if(!tl)return;const t=e.touches[0];look((t.clientX-tl[0])*1.3,(t.clientY-tl[1])*1.3);tl=[t.clientX,t.clientY]});cv_.addEventListener('touchend',()=>tl=null);
cv_.addEventListener('click',()=>{if(!CUT&&!('ontouchstart'in window))try{cv_.requestPointerLock()}catch(e){}});
addEventListener('mousedown',()=>{if(CUT&&!CUT.title)shot(CUT.i+1)});
addEventListener('keydown',e=>{if(CUT&&!CUT.title){if(e.code=='Space'||e.code=='Enter')shot(CUT.i+1);if(e.code=='Escape')shot(999)}if(e.code=='KeyE'&&!e.repeat)toggleCar()});
function say(w,t,ms){$('sub').innerHTML=(w?'<b>'+w+':</b> ':'')+t;$('sub').style.opacity=1;subT=ms/1000}
function blip(){if(!au)return;const o=au.createOscillator(),g=au.createGain();o.type='triangle';o.frequency.value=140+R()*90;g.gain.value=.04;g.gain.exponentialRampToValueAtTime(.001,au.currentTime+.25);o.connect(g);g.connect(au.destination);o.start();o.stop(au.currentTime+.25)}
function foot(dt,kk){if(!F.on){F.hy*=EX(-1.5*dt);F.hp*=EX(-1.5*dt);return}
 const g=n=>kk(n)?1:0,fw=g('KeyW')+g('ArrowUp')-g('KeyS')-g('ArrowDown'),sd=g('KeyA')-g('KeyD');F.yaw+=(g('ArrowLeft')-g('ArrowRight'))*2*dt;
 const sp=(kk('ShiftLeft')||kk('ShiftRight'))?6.5:3.4,fx=SN(F.yaw),fz=CS(F.yaw),a=Math.min(1,dt*10);
 F.vx+=((fx*fw+fz*sd)*sp-F.vx)*a;F.vz+=((fz*fw-fx*sd)*sp-F.vz)*a;F.x+=F.vx*dt;F.z+=F.vz*dt;F.bob+=H(F.vx,F.vz)*dt*1.8;
 for(const o of B){const cx=cl(F.x,o.x-o.hx,o.x+o.hx),cz=cl(F.z,o.z-o.hz,o.z+o.hz),dx=F.x-cx,dz=F.z-cz,d=H(dx,dz);if(d>=.5)continue;
  if(d>0){F.x+=dx/d*(.5-d);F.z+=dz/d*(.5-d)}else{const px=o.hx-Math.abs(F.x-o.x),pz=o.hz-Math.abs(F.z-o.z);if(px<pz)F.x+=(F.x>=o.x?1:-1)*(px+.5);else F.z+=(F.z>=o.z?1:-1)*(pz+.5)}}
 for(const o of C){const dx=F.x-o.x,dz=F.z-o.z,d=H(dx,dz),r=o.r+.5;if(d<r&&d>0){F.x+=dx/d*(r-d);F.z+=dz/d*(r-d)}}
 {const dx=F.x-P.x,dz=F.z-P.z,d=H(dx,dz);if(d<2&&d>0){F.x+=dx/d*(2-d);F.z+=dz/d*(2-d)}}
 F.x=cl(F.x,-635,635);F.z=cl(F.z,-585,885);
 [...tr,...police].forEach(c=>{if(H(c.vx,c.vz)>5&&H(c.x-F.x,c.z-F.z)<2.4){P.hp-=40*dt;shake=Math.min(1,shake+dt*4)}})}
function env(){const m=17*60+30+el*.5,k=cl((m-1050)/150,0,1),c=new T.Color(0xf2a36b).lerp(new T.Color(0x0a1030),k);if(ENDING&&CUT&&CUT.i>=6)DAWN=Math.min(1,DAWN+.004);if(DAWN>0)c.lerp(new T.Color(0xf7b78e),DAWN);sc.background=c;sc.fog.color.copy(c);hemi.intensity=(.85-.55*k)*(1-DAWN)+.8*DAWN;sun.intensity=(.9-.8*k)*(1-DAWN)+.85*DAWN}
// ---- cutscene engine ----
const s_=(...a)=>a,back=(A,x,z,yw)=>{F.on=1;F.x=A[0]+x;F.z=A[1]+z;F.yaw=yw;F.pit=0;F.vx=F.vz=0;CP=[P.x,P.z,P.th]};
function startCut(id){const c=SCN[id]();CUT={sh:c.sh,i:0,t:0,done:c.done,a:c.a};document.body.classList.add('cut');P.m.visible=true;
 c.cast.forEach(([m,x,z,fx,fz])=>{m.visible=true;m.position.set(c.a[0]+x,0,c.a[1]+z);m.rotation.y=Math.atan2(fx-x,fz-z)});shot(0)}
function shot(i){const c=CUT;if(i>=c.sh.length){endCut();return}c.i=i;c.t=0;const s=c.sh[i];$('sub').innerHTML=s[10]?'<b>'+s[10]+':</b> '+s[11]:s[11];$('sub').style.opacity=1;blip()}
function endCut(){const c=CUT;CUT=null;document.body.classList.remove('cut');$('sub').style.opacity=0;[RK,DW,JG,G1,G2,HD,AN,HAR].forEach(m=>m.visible=false);police.forEach(p=>sc.remove(p.m));police=[];c.done()}
function cutTick(dt){const c=CUT;if(c.title){ta+=dt*.12;cam.position.set(-125+170*CS(ta),55,40+170*SN(ta));cam.lookAt(-125,30,40)}
 else{c.t+=dt;if(c.t>c.sh[c.i][0]){shot(c.i+1);if(!CUT)return}const q=CUT.sh[CUT.i],t=CUT.t,A=CUT.a;cam.position.set(A[0]+q[1]+q[7]*t,q[2]+q[8]*t,A[1]+q[3]+q[9]*t);cam.lookAt(A[0]+q[4]+q[7]*t*.4,q[5],A[1]+q[6]+q[9]*t*.4)}
 gm.visible=false;dash.visible=false;env();ren.render(sc,cam)}
const D1=[113,-20],J1=[-20,425],H1=[141,-230],B1=[-150,650],W1=[432,300],EP=[0,-38];
const AN=human(0x4a7fb5,0xc58c5a,0x151515),HAR=human(0x6b4f2a,0xb07a56,0x777777);
{const c=document.createElement('canvas');c.width=512;c.height=128;const g=c.getContext('2d');g.fillStyle='#0b3d2a';g.fillRect(0,0,512,128);g.strokeStyle='#35e08a';g.lineWidth=8;g.strokeRect(6,6,500,116);g.fillStyle='#fff';g.textAlign='center';g.font='bold 52px Arial';g.fillText('TITIK AKHIR',256,62);g.font='bold 26px Arial';g.fillStyle='#35e08a';g.fillText('THE END POINT',256,100);
 const ban=new T.Mesh(new T.BoxGeometry(11,2.6,.4),new T.MeshBasicMaterial({map:new T.CanvasTexture(c)}));ban.position.set(EP[0],10.5,EP[1]);sc.add(ban);box(.9,10,.9,EP[0]-5.8,5,EP[1],0x35e08a);box(.9,10,.9,EP[0]+5.8,5,EP[1],0x35e08a);
 const ring=new T.Mesh(new T.RingGeometry(3,3.6,32),new T.MeshBasicMaterial({color:0x35e08a,transparent:true,opacity:.85,side:2}));ring.rotation.x=-Math.PI/2;ring.position.set(EP[0],.45,EP[1]);sc.add(ring)}

const SCN={
intro:()=>({a:[P.x,P.z],cast:[[RK,4,-2,0,0]],sh:[
 s_(6,60,45,-60,-20,25,150,-3,0,8,'Raka (narration)','Central Jakarta. Half past five. A city that never lets you breathe.'),
 s_(5,8,1.7,-5,4,1.5,-2,-.3,0,.1,'Raka','Twenty million rupiah. That is what I owe Bang Jago. Tonight it ends.'),
 s_(5,4,1.9,-5.5,4,1.8,-2,0,0,.3,'Raka','One last delivery. Then I walk away from all of this.'),
 s_(5,-4,1.3,-5,0,.9,0,.2,0,.2,'Raka','Come on, old girl. Don\'t die on me tonight.')],
 done:()=>{back([P.x,P.z],4,-2,Math.atan2(-4,2));say('','Walk to your car and press [E] to get in.',5000)}}),
dewi:()=>({a:D1,cast:[[DW,0,0,3,0],[RK,3,0,0,0]],sh:[
 s_(4.5,-3,1.8,-5,1.5,1.5,0,.2,0,.2,'Dewi','You\'re late, Raka.'),
 s_(4,7,1.6,-4,3,1.6,0,-.2,0,.1,'Raka','Traffic. It\'s Jakarta, Dew.'),
 s_(7,1.5,2,-4.5,1.5,1.4,0,0,0,.3,'Dewi','This case goes to Bang Jago at Taman Suropati before dark. Don\'t open it. Don\'t ask.'),
 s_(4,4,1.5,-3.5,3,1.6,0,.2,0,0,'Raka','What\'s inside?'),
 s_(6,0,1.8,-3.5,0,1.7,0,0,0,.2,'Dewi','If you knew, you wouldn\'t take it.')],
 done:()=>{back(D1,3,0,-1.57);stage++;P.money+=500;say('','Case acquired. Take it to Jago at Taman Suropati.',5000)}}),
jago:()=>({a:J1,cast:[[JG,0,0,3,0],[G1,-2,-3,3,0],[G2,-2,3,3,0],[RK,3,0,0,0]],sh:[
 s_(5,1.5,2,-6,0,1.7,0,0,0,.4,'Bang Jago','Raka! Right on time. Where\'s the case?'),
 s_(4,6,1.6,-3,3,1.5,0,0,0,.1,'Raka','Here. Dewi said not to open it.'),
 s_(8,1.5,1.7,-3.5,0,1.8,0,0,0,.3,'Bang Jago','The Commissioner\'s ledger. Every bribe, every name. And you, little courier, have seen too much.'),
 s_(4.5,4,1.7,-4,3,1.6,0,0,0,.1,'Raka','You said it was a normal run, Bang!'),
 s_(5,-1,1.9,-5.5,-2,1.5,3,0,0,.2,'Bang Jago','Your debt is settled. In another way. Take him.'),
 s_(4,5.5,1.6,2,3,1.2,0,0,0,0,'','Raka slams the case into Jago\'s face and runs.')],
 done:()=>{P.heat=2.5;RH=2.5;back(J1,3,0,1.57);stage++;P.money+=500;say('','The cops are coming — get back to your car (E)!',5000)}}),
hendra:()=>({a:H1,cast:[[HD,0,0,3,0],[RK,3,0,0,0],[DW,-5,4,0,0]],sh:[
 s_(5,1.5,1.9,-4.5,0,1.7,0,0,0,.2,'Hendra','So you\'re the courier. Dewi told me everything.'),
 s_(4,6,1.7,-3,3,1.6,0,0,0,.1,'Raka','She lied to me about this case.'),
 s_(8,-9,1.8,8,-5,1.5,4,.2,0,0,'Dewi','The Commissioner ordered me to hand it to Jago. I never thought they\'d hurt you. I\'m sorry.'),
 s_(8,2,2,-5,0,1.7,0,0,0,.3,'Hendra','This ledger can bring down half of City Hall. I\'ll air the copy tonight. Take the original to the Ibu Kota Daily newsroom at Bundaran HI.'),
 s_(5,-1,1.6,5,0,1.5,0,0,0,.2,'Dewi','Sirens — they tracked us! GO, Raka!')],
 done:()=>{P.heat=3.5;RH=3;back(H1,3,0,1.57);stage++;P.money+=500;say('','Get the ledger to Bundaran HI. They\'re on you!',5000)}}),
redaksi:()=>({a:B1,cast:[[AN,0,0,3,0],[RK,3,0,0,0]],sh:[
 s_(5,1.5,1.9,-4.5,0,1.7,0,0,0,.2,'Anton (editor)','So you are the courier everyone is chasing. Hendra said you would come.'),
 s_(5,6,1.7,-3,3,1.6,0,0,0,.1,'Raka','Here is the ledger. All of it. I want this to end tonight.'),
 s_(7,1.5,2,-4.5,0,1.7,0,0,0,.3,'Anton','Wait. The last page, the one with the Commissioner\'s signature, is missing. Without it his lawyers bury us in a week.'),
 s_(5,4,1.5,-3.5,3,1.6,0,.2,0,0,'Raka','Jago tore it out when I hit him with the case. He has it.'),
 s_(4,-1,1.6,5,0,1.5,0,0,0,.2,'','Raka\'s phone buzzes. Unknown number.'),
 s_(7,5,1.9,-4,3,1.6,0,0,0,.1,'Jago (phone)','Page for sale, courier. Gunung Sahari warehouse. Come alone, or the page burns.')],
 done:()=>{P.heat=2.5;RH=2.5;back(B1,3,0,1.57);stage++;P.money+=500;say('','The cops traced the call. Lose them, then go to the warehouse in Gunung Sahari.',6000)}}),
gudang:()=>({a:W1,cast:[[JG,0,0,3,0],[G1,-2,-3,3,0],[G2,-2,3,3,0],[RK,3,0,0,0]],sh:[
 s_(5,1.5,2,-6,0,1.7,0,0,0,.4,'Jago','You came alone. Respect. Or stupidity.'),
 s_(4,6,1.6,-3,3,1.5,0,0,0,.1,'Raka','Give me the page, Bang.'),
 s_(8,1.5,1.7,-3.5,0,1.8,0,0,0,.3,'Jago','The page? The Commissioner took it an hour ago. Midnight, Monas plaza. He meets the men who pay for his silence. I only keep the receipts.'),
 s_(5,4,1.7,-4,3,1.6,0,0,0,.1,'Raka','You sold me out, then you sold him out. Who are you loyal to?'),
 s_(6,-1,1.9,-5.5,-2,1.5,3,0,0,.2,'Jago','Whoever is still standing at sunrise. Take him!'),
 s_(4,5.5,1.6,2,3,1.2,0,0,0,0,'','Raka kicks the lamp over and runs into the dark.')],
 done:()=>{P.heat=3.5;RH=3;back(W1,3,0,1.57);stage++;P.money+=500;say('','Lose the cops — then head to the ENDING POINT at Monas plaza.',6000)}}),
end:()=>{ENDING=1;return{a:EP,cast:[[RK,0,0,0,38],[HAR,0,11,0,0],[JG,3,13,0,0],[G1,-4,13,0,0],[G2,6,11,0,0],[HD,-6,-3,0,10],[AN,-8,-1,0,10]],sh:[
 s_(6,40,45,-90,0,18,12,-2,0,6,'Raka (narration)','Midnight. Monas plaza. The end of the road, and every road in Jakarta led here.'),
 s_(6,4,1.8,-5,0,1.8,11,0,0,.3,'Commissioner Hartono','You actually came. Do you know how many people I could erase with one phone call?'),
 s_(5,-3,1.7,-3,0,1.7,11,0,0,.2,'Raka','Enough to erase me. Not enough to erase what Hendra already aired.'),
 s_(5,-7,2,-6,-6,1.7,-3,0,0,.2,'Hendra','Every channel is live, Pak Hartono. Every word. Every page.'),
 s_(6,0,1.7,-4,3,1.4,13,0,0,.3,'Jago','I always keep the receipts. Here, courier. The last page, with his signature.'),
 s_(5,2,1.8,-3,0,1.7,11,0,0,.2,'Hartono','You... you traitor.'),
 s_(7,0,40,-30,0,15,30,0,3,2,'Raka (narration)','They took Hartono away before the first call to prayer. Jago\'s accounts were frozen, and my debt went with them.'),
 s_(7,60,25,-80,-5,35,20,-2,.5,3,'Raka (narration)','At dawn Jakarta looked the same. Same traffic, same noise. But for the first time in years I did not owe it a thing.'),
 s_(8,0,40,-45,0,15,30,0,2,4,'','THE END · TAMAT<br>Free roam unlocked. Keep delivering. Take your time.')],
 done:()=>{P.heat=0;RH=0;P.money+=20000;ENDING=0;DAWN=1;back(EP,0,0,0);stage=FIN;nextT()}}}};
const ST=[{t:'Get in your car — press E',c:()=>!F.on},{t:'Meet Dewi at Gambir Station',p:D1,cut:'dewi'},{t:'Deliver the case to Bang Jago — Taman Suropati',p:J1,cut:'jago'},
 {t:'RUN! Get back in your car (E)',c:()=>!F.on,n:()=>say('Dewi (phone)','Raka! Don\'t trust Jago! Go to Istiqlal Mosque — Hendra the journalist is waiting!',6500)},
 {t:'Lose the police (clear all stars)',c:()=>P.heat<=0,n:()=>{RH=0;say('Raka','Clear... for now.',3000)}},{t:'Meet Hendra at Istiqlal Mosque',p:H1,cut:'hendra'},{t:'Take the ledger to the newsroom — Bundaran HI',p:B1,cut:'redaksi'},
 {t:'Lose the police (clear all stars)',c:()=>P.heat<=0,n:()=>{RH=0;say('Raka','Clear. Now the warehouse.',3000)}},
 {t:'Meet Jago at the warehouse — Gunung Sahari',p:W1,cut:'gudang'},
 {t:'Lose the police (clear all stars)',c:()=>P.heat<=0,n:()=>{RH=0;say('Hendra (phone)','Every channel is heading to Monas. Go to the ENDING POINT — the green beam, flag on your map.',8000)}},
 {t:'ENDING POINT — Monas plaza (green beam)',p:EP,cut:'end'}];const FIN=ST.length;
// ================= SIDE QUESTS — "ORDERS NOBODY WANTS" =================
const sqNew=()=>({done:{},act:null,s:0,v:{},f:{},hint:0,txt:''});let SQ=sqNew(),PEND=null,SQC=[];
const sqCount=()=>Object.keys(SQ.done).length,clkM=()=>17*60+30+el*.5;
const LC={sar:[-135,290],gi:[-200,700],hi:[-150,650],pb:[181,-500],har:[-195,-300],tm:[123,650],tim:[200,527],lb:[212,162],sup:[-20,433],gam:[113,-20],ist:[141,-230],mon:[-125,-60]};
const NP={nad:human(0xe0609a,0xd9a066,0x1a1008),bim:human(0x4a7fb5,0xc58c5a,0x151515),ken:human(0x2e9d57,0xb07a56,0x222222),sar:human(0xf2c94c,0xd9a066,0x1a1008),tit:human(0x333333,0xa8744d,0x111111),gho:human(0xdfe8ef,0xcfd8e0,0xcfd8e0)};NP.sar.scale.set(.7,.7,.7);
const QD=[
{id:'kopi',n:'Kopi Susu Kilat',who:'Nadia · Sarinah',d:'Deliver 6 iced coffees across Thamrin without melting the ice.',ok:()=>1},
{id:'skripsi',n:'Skripsi Run',who:'Bima · Pasar Baru',d:'Get a printed thesis to campus before the gate closes.',ok:()=>1},
{id:'ghost',n:'Ghost Order',who:'??? · Taman Menteng',d:'An order from an account that was deleted years ago.',ok:()=>clkM()>=1140,lock:'Appears after 19:00'},
{id:'race',n:'The Kenzo Race',who:'Kenzo · Bundaran HI',d:'No-cops street race: Bundaran HI → Monas → back.',ok:()=>1},
{id:'kue',n:'Kue Ulang Tahun',who:'Sari · Lapangan Banteng',d:'A birthday cake for the guard who chased you.',ok:()=>stage>=FIN,lock:'Unlocks after the main story'},
{id:'dewi',n:'Dewi\u2019s Voice Notes',who:'Dewi · Gambir, Istiqlal, Harmoni',d:'Three voice notes she left behind.',ok:()=>stage>=FIN,lock:'Unlocks after the main story'}];
const sayQ=a=>{let d=0;a.forEach(([w,t,ms])=>{setTimeout(()=>say(w,t,ms),d);d+=ms})};
function sqCut(nm,npc,lines,done){SCN['sq_'+nm]=()=>({a:[P.x+CS(P.th)*9,P.z-SN(P.th)*9],cast:[[npc,0,0,3,0],[RK,3,0,0,0]],sh:lines.map(l=>{const d=Math.max(2.8,1.6+l[1].length*.055);return l[0]=='Raka'?s_(d,-3,1.8,-1.5,3,1.7,0,.1,0,0,l[0],l[1]):s_(d,6,1.7,-1.5,0,1.7,0,-.1,0,0,l[0],l[1])}),done:()=>{npc.visible=false;done&&done()}});startCut('sq_'+nm)}
function choose(t,tx,o){PEND=[t,tx,o];SQC=o.map(x=>x[1]);PAUSED=1;lastOpen=performance.now();if(au)au.suspend();if(document.exitPointerLock)document.exitPointerLock();$('pm').style.display='flex';pm('<h2>'+t+'</h2><div class="sm">'+tx+'</div>'+o.map((x,i)=>'<button data-a="sqc" data-i="'+i+'">'+x[0]+'</button>').join(''))}
const sqPick=i=>{const f=SQC[i];PEND=null;closeMenu();f&&f()};
function sqDone(r,m){const id=SQ.act;SQ.done[id]=1;SQ.act=null;SQ.txt='';P.money+=r;say('KilatKu',m+' +$'+r+(sqCount()==4&&stage<FIN?' · Konvoi Ojol will join your finale!':''),6500)}
const sqFail=m=>{SQ.act=null;SQ.txt='';say('KilatKu',m,5500)};
function sqView(){pm('<h2>SIDE QUESTS</h2><div class="sm">Orders Nobody Wants · '+sqCount()+' / '+QD.length+' done'+(sqCount()>=4?' · Konvoi Ojol unlocked':' · finish 4 to unlock the Konvoi Ojol finale')+'</div>'+QD.map((q,i)=>{const d=SQ.done[q.id],ok=q.ok(),a=SQ.act==q.id;return '<div class="slot"><span><b>'+q.n+'</b><br>'+q.who+'<br>'+(d?'\u2713 Completed':ok?q.d:'\ud83d\udd12 '+q.lock)+'</span>'+(ok&&!d?'<button data-a="sqgo" data-i="'+i+'">'+(a?'Abandon':'Start')+'</button>':'')+'</div>'}).join('')+'<div class="sm" id="pmsg"></div><button data-a="back">Back</button>')}
function sqGo(i){const q=QD[i];if(SQ.act==q.id){SQ.act=null;SQ.txt='';closeMenu();say('KilatKu','Order abandoned.',2500);return}if(stage>2&&stage<FIN){msg('Not now \u2014 shake the police first!');return}if(!q.ok()||SQ.done[q.id])return;SQ.act=q.id;SQ.s=0;SQ.v={};closeMenu();say('KilatKu','Order accepted: '+q.n+' \u2014 follow the marker.',4000)}
function sqTick(dt){
 if(CUT||PAUSED||onTitle||P.dead)return;
 if(PEND){choose(...PEND);return}
 const lock=stage>2&&stage<FIN;
 if(!SQ.hint&&stage&&!lock){SQ.hint=1;say('KilatKu','Side orders are open! Press J for the quest board.',6500)}
 if(!SQ.act||lock)return;
 const q=F.on?F:P,v=SQ.v,at=(p,r)=>H(q.x-p[0],q.z-p[1])<(r||12),lost=Math.max(0,(v.hp==null?P.hp:v.hp)-P.hp);v.hp=P.hp;let tx='',tg_=null;
 switch(SQ.act){
 case'kopi':{const D=[LC.gi,LC.tim,LC.mon],N=['Grand Indonesia','Taman Ismail Marzuki','Monas'],M=['Chat, he made it! Two cups down. Someone donate this man a helmet.','Four cups! The comments are screaming. My sponsor is typing\u2026','Six for six! I am pinning your name. You are officially a legend, ghost courier.'];
  if(SQ.s==0){tg_=LC.sar;tx='Meet Nadia at Sarinah';if(at(tg_))sqCut('kopi',NP.nad,[['Nadia',"OMG you actually came! Chat, say hi to Raka, the ghost courier!"],['Raka',"Ghost courier? I\u2019m a courier who is already tired."],['Nadia',"Six iced coffees, three drops. If the ice melts, the sponsor melts too."],['Raka',"Does the coffee come with a seatbelt?"],['Nadia',"It comes with FAITH. Go go go!"]],()=>{SQ.s=1;v.ice=100;v.hp=P.hp;say('Nadia (live)','Chat, the ice timer starts NOW. Smooth hands, Raka!',4000)})}
  else{v.ice-=dt*.12+lost*1.4;tg_=D[SQ.s-1];tx='Cup drop '+SQ.s+'/3 \u00b7 '+N[SQ.s-1]+' \u00b7 ICE '+Math.max(0,v.ice|0)+'%';
   if(v.ice<=0)sqFail('The ice melted. Nadia: \u201cChat, we do not talk about this.\u201d');
   else if(at(tg_)){say('Nadia (live)',M[SQ.s-1],4000);if(++SQ.s>3)sqDone(900+(v.ice|0)*10,'Nadia shares the sponsor money and half the internet knows your name.')}}break}
 case'skripsi':{if(SQ.s==0){tg_=LC.pb;tx='Meet Bima at Pasar Baru';if(at(tg_))sqCut('skripsi',NP.bim,[['Bima',"Bang! My thesis is due in\u2026 okay, very soon. The printed copies are in this tote bag."],['Raka',"Why not print it earlier?"],['Bima',"The printer died, my laptop died, and my supervisor says NO late submissions. Campus is at Harmoni. Please!"],['Raka',"Relax. I\u2019ll make it. Probably."]],()=>{SQ.s=1;v.t=140;say('Bima (phone)','The gate closes in 140 seconds. GO GO GO!',4000)})}
  else{v.t-=dt;tg_=LC.har;tx='Thesis to campus (Harmoni) \u00b7 '+Math.max(0,v.t|0)+'s left';
   if(P.heat>=2&&!v.p){v.p=1;say('Bima (phone)','Bang, why are there POLICE?! Do not crease the pages!',3500)}
   if(v.t<=0)sqFail('Too late. The gate closed. Bima: \u201cThere is always next semester\u2026 right?\u201d');
   else if(at(tg_))sqDone(1000+(v.t|0)*5,'Bima hugs the tote bag: \u201cYou saved four years of my life!\u201d')}break}
 case'ghost':{if(SQ.s==0){tg_=LC.tm;tx='Deliver the mystery order \u00b7 Taman Menteng';if(at(tg_))sqCut('ghost',NP.gho,[['???',"You\u2019re late. I always was, too."],['Raka',"Uh\u2026 sorry? Are you the one who ordered?"],['???',"I started this run seven years ago. My bike died on the way. I never reached her."],['Raka',"\u2026Reached who?"],['???',"Ayu. My little sister. Her tuition money is in this phone. Please\u2026 take it to her."]],()=>{SQ.s=1;choose('THE PHONE','The man is gone. A cracked phone and a worn envelope sit on the bench.',[['Take it to his sister (Taman Ismail Marzuki)',()=>{SQ.s=2}],['Leave it on the bench',()=>sqDone(300,'The bench lights flicker once. Then it is only a bench. Raka drives off, feeling heavier.')]])})}
  else if(SQ.s==1)tx='Decide what to do with the phone';
  else if(SQ.s==2){tg_=LC.tim;tx='Find Ayu at Taman Ismail Marzuki';if(at(tg_)){SQ.s=3;sqCut('ghost2',NP.sar,[['Ayu',"Kak? Why do you have Abang\u2019s phone?"],['Raka',"He asked me to bring it. He said he was sorry he was late."],['Ayu',"\u2026He said that every night. I\u2019ll listen to his last voice note now."],['Ayu',"Thank you, Kak. Stay safe out there."]],()=>sqDone(1800,'Somewhere, a delivery finally arrived.'))}}break}
 case'race':{const K=[LC.hi,LC.sar,LC.mon,LC.sar,LC.hi];
  if(SQ.s==0){tg_=LC.hi;tx='Meet Kenzo at Bundaran HI';if(at(tg_))sqCut('race',NP.ken,[['Kenzo',"Raka! The famous Last Delivery guy. They say you drift like a lunatic."],['Raka',"They say a lot of things."],['Kenzo',"Race. Bundaran HI to Monas and back. No cops, no excuses. Loser pays for nasi goreng."],['Raka',"Deal. I only have my car and my dignity to lose."]],()=>{SQ.s=1;v.c=0;v.rp=0;v.pp=0;say('Kenzo','Three, two, one \u2014 GAS!',2500)})}
  else if(SQ.s==1){const cum=[0];for(let i=1;i<5;i++)cum[i]=cum[i-1]+H(K[i][0]-K[i-1][0],K[i][1]-K[i-1][1]);
   const nx=K[v.c+1],sg=cum[v.c+1]-cum[v.c];v.pp=Math.max(v.pp,cum[v.c]+cl(sg-H(q.x-nx[0],q.z-nx[1]),0,sg));
   v.rp+=cl(30+(v.pp-v.rp)*.3,20,44)*dt*(P.heat>.5?1.3:1);
   tg_=nx;tx='RACE '+(v.c+1)+'/4 \u00b7 Kenzo '+Math.abs((v.rp-v.pp)|0)+' m '+(v.rp>v.pp?'AHEAD':'behind')+(P.heat>.5?' \u00b7 NO COPS!':'');
   if(at(nx,16))v.c++;
   if(v.c>=4){SQ.s=2;sqCut('race2',NP.ken,[['Kenzo',"Fine, fine. You win. The app penalizes me for every cancelled order, so I race to feel something."],['Raka',"Come eat nasi goreng. I\u2019ll pay. Barely."],['Kenzo',"If you ever need riders, whistle. Two hundred of us. Don\u2019t laugh."]],()=>sqDone(1800,'Kenzo and the riders now owe you one.'))}
   else if(v.rp>=cum[4])sqFail('Kenzo crossed first. \u201cNasi goreng is on you, Bang!\u201d Try again anytime.')}break}
 case'kue':{if(SQ.s==0){tg_=LC.lb;tx='Meet Sari at Lapangan Banteng';if(at(tg_))sqCut('kue',NP.sar,[['Sari',"Kak Raka? Please help. It\u2019s my brother\u2019s birthday and he works for bad people. He won\u2019t come home."],['Raka',"Your brother\u2026 who?"],['Sari',"Tito. The tall one with Bang Jago. Please bring him this cake at Taman Suropati. Don\u2019t squish it!"],['Raka',"The guy who tried to grab me\u2026 this night keeps getting weirder."]],()=>{SQ.s=1;v.cake=100;v.hp=P.hp})}
  else if(SQ.s==1){v.cake-=lost*2.2+dt*P.heat*.8;tg_=LC.sup;tx='Cake to Tito at Taman Suropati \u00b7 CAKE '+Math.max(0,v.cake|0)+'%';
   if(v.cake<=0)sqFail('The cake is now a pancake. Sari will understand. Probably.');
   else if(at(tg_)){SQ.s=2;sqCut('kue2',NP.tit,[['Tito',"You?! Where are the others\u2026 wait. Is that a cake?"],['Raka',"From Sari. Happy birthday, I guess."],['Tito',"\u2026She remembered."],['Tito',"I\u2019m so tired of Jago, you know?"]],()=>choose('TITO','He looks at the cake, then over his shoulder. Jago\u2019s car is two blocks away.',[['Hand over the cake and leave',()=>sqDone(1500,'Tito: \u201cTell Sari I\u2019ll come home. Someday.\u201d')],['Tell him to run \u2014 now',()=>{SQ.f.tito=1;sqDone(2200,'Tito runs. For the first time in years, he looks free.')}]]))}}break}
 case'dewi':{const L=[LC.gam,LC.ist,LC.har],V=[[['Dewi (voice note)',"Raka\u2026 if you hear this, I\u2019m sorry. The Commissioner had my mother\u2019s address.",5000],['Dewi (voice note)',"I had one night to choose. I chose wrong.",4000]],[['Dewi (voice note)',"I told Hendra everything because I couldn\u2019t tell you to your face.",5000],['Dewi (voice note)',"Don\u2019t be like me. Say the real thing before it\u2019s too late.",4500]],[['Dewi (voice note)',"This is where we split our first bakso, remember? Two bowls, one lunch money.",5000],['Dewi (voice note)',"Whatever you decide, I\u2019ll understand.",4000]]];
  if(SQ.s<3){tg_=L[SQ.s];tx='Voice note '+(SQ.s+1)+'/3 \u00b7 '+['Gambir Station','Istiqlal Mosque','Harmoni'][SQ.s];if(at(tg_))sayQ(V[SQ.s++])}
  else{tx='Listening\u2026';v.w=(v.w||0)+dt;if(v.w>9.5)choose('REPLY TO DEWI','Her last voice note ends. The chat box is empty, the cursor blinking.',[['\u201cI forgive you.\u201d',()=>sqDone(2500,'You: \u201cI forgive you, Dew.\u201d Dewi: \u201cBakso is on me. Always.\u201d')],['\u201cI need time.\u201d',()=>sqDone(2500,'You: \u201cI need time.\u201d Dewi: \u201cI\u2019ll wait. Take all the time you need.\u201d')],['Say nothing',()=>sqDone(2500,'Three dots appear, then vanish. Some doors stay open anyway.')]])}break}
 }
 SQ.txt=tx;if(tg_&&SQ.act){mk.visible=true;mk.position.set(tg_[0],35,tg_[1]);OB=tg_}}
{const o=story;story=dt=>{o(dt);sqTick(dt)}}
{const o=objTxt;objTxt=()=>SQ.act&&SQ.txt&&!(stage>2&&stage<FIN)?'SIDE \u00b7 '+SQ.txt:o()}
{const e=SCN.end;SCN.end=()=>{const c=e();if(sqCount()>=4){c.sh.splice(1,0,s_(6,-6,2,-12,0,3,10,0,0,1.5,'Nadia (live)','Chat! Every ojol in Jakarta, Monas, NOW! Block the road for Raka!'),s_(6,4,2.2,-10,0,2,8,0,.1,.4,'Kenzo','Cops can chase one rider. They can\u2019t chase two hundred. Gas, Bang!'));if(SQ.f.tito)c.sh.splice(3,0,s_(5,2,2,-8,0,1.8,6,0,0,.3,'Tito','Jago\u2019s men stood down. Sari says hi. And happy birthday to me.'));const d=c.done;c.done=()=>{d();P.money+=5000;say('','KONVOI OJOL \u2014 the whole city had your back. +$5000',7000)}}return c}}
addEventListener('keydown',e=>{if(e.code=='KeyJ'&&!e.repeat&&!CUT&&!onTitle&&!P.dead&&!ENT&&!PAUSED){openMenu();sqView()}});
$('help').innerHTML+=' \u00b7 <b>J</b> side-quest board';
// ================= PEDESTRIANS, DAMAGE & BANK STAFF REACTIONS =================
const PEDS=[],RDP=RDS.filter(r=>!r.lp&&r.len>100),inBld=(x,z)=>B.some(b=>Math.abs(x-b.x)<b.hx&&Math.abs(z-b.z)<b.hz);let PI=0;
const PGM={},PMT={},pg_=(w,h,d)=>PGM[w+'_'+h+'_'+d]||(PGM[w+'_'+h+'_'+d]=RB(w,h,d)),pmt=c=>PMT[c]||(PMT[c]=mat(c));
const PSH=[0x2f5d8a,0xb03a5c,0x6b8e5a,0xe8e2d0,0x3a3f4a,0xd9a441,0x7b4f9e,0x1f9d55,0xf4f4f4,0x8a5a3c,0xc4553a],PPN=[0x23262e,0x3b4a6b,0x5a4a3a,0x1f2a44,0x7b1e24,0x4a4a4a],PSK=[0xc58c5a,0xd9a066,0xa8744d,0xb07a56,0xe0b48a],PHR=[0x151515,0x1a1008,0x2a1a10,0x4a3a2a],PHJ=[0xf2e8d8,0xd8a0b8,0x6b8fb5,0x5a6a4a,0x222222];
function mkPed(){const r=a=>a[(R()*a.length)|0],g=new T.Group(),bx=(w,h,d,x,y,z,c,par)=>{const m=new T.Mesh(pg_(w,h,d),pmt(c));m.position.set(x,y,z);(par||g).add(m);return m},
 sh=r(PSH),pn=r(PPN),sk=r(PSK),lL=new T.Group(),lR=new T.Group(),aL=new T.Group(),aR=new T.Group();
 lL.position.set(-.17,.85,0);lR.position.set(.17,.85,0);aL.position.set(-.45,1.55,0);aR.position.set(.45,1.55,0);g.add(lL,lR,aL,aR);
 bx(.3,.85,.3,0,-.43,0,pn,lL);bx(.3,.85,.3,0,-.43,0,pn,lR);bx(.7,.8,.4,0,1.25,0,sh);bx(.2,.7,.2,0,-.35,0,sh,aL);bx(.2,.7,.2,0,-.35,0,sh,aR);bx(.32,.34,.32,0,1.85,0,sk);bx(.08,.08,.08,0,1.85,.18,sk);
 if(R()<.17)bx(.44,.5,.44,0,1.9,0,r(PHJ));else bx(.36,.14,.36,0,2.05,0,r(PHR));
 if(R()<.3)bx(.5,.6,.25,0,1.25,-.32,r(PSH));
 const bs=.9+R()*.16;g.scale.setScalar(bs);g.rotation.order='YXZ';sc.add(g);
 return{k:'p',m:g,lL,lR,aL,aR,bs}}
function pedSpawn(q){for(let a=0;a<24;a++){const r=RDP[(R()*RDP.length)|0],s=4+R()*(r.len-8),sd=R()<.5?1:-1,o=2.6+R()*.7,w=posAt(r,s,1,sd*(r.hw+o)),d=H(w[0]-q.x,w[1]-q.z);if(d<35||d>115||inBld(w[0],w[1]))continue;
 const p=mkPed();Object.assign(p,{rd:r,s,sd,o,dir:R()<.5?1:-1,sp:1.2+R()*.7,x:w[0],z:w[1],ph:R()*6,hp:3,st:'w',fl:0,wt:0,dt:0});p.m.position.set(p.x,.07,p.z);PEDS.push(p);return 1}return 0}
function pedScare(p){if(p.st=='d'||p.k=='c')return;if(p.k=='s'){p.fe=9;return}p.fl=5+R()*4;p.wt=0;p.flee=1;p.path=null}
function pedNoise(){const q=F.on?F:P;PEDS.forEach(p=>{if(p.st!='d'&&H(p.x-q.x,p.z-q.z)<45)pedScare(p)})}
function pedHurt(p,dmg,hd,d){if(p.st=='d')return;p.hp-=dmg*(hd?2:1);spark(p.x,hd?1.8:1.2,p.z,5,0xb01020,4,1);thud();
 if(p.hp<=0){p.st='d';p.dt=0;STAT.peds=(STAT.peds|0)+1;P.heat=Math.max(P.heat,p.k=='c'?4:p.k=='s'?2.5:1.6);spark(p.x,.4,p.z,10,0x8a0f1a,5,1)}
 else{P.heat=Math.max(P.heat,p.k=='c'?3:.9);pedScare(p)}
 PEDS.forEach(o=>{if(o!=p&&o.st!='d'&&H(o.x-p.x,o.z-p.z)<22)pedScare(o)})}
function pedRay(o,d,mx){let best=null,bt=mx;PEDS.forEach(p=>{if(p.st=='d'&&p.dt>.6||!p.m.visible)return;const by=p.m.position.y;for(const h of[.4,1,1.6,1.95]){const vx=p.x-o.x,vy=by+h-o.y,vz=p.z-o.z,t=vx*d.x+vy*d.y+vz*d.z;if(t<.5||t>bt)continue;if(H(vx-d.x*t,vy-d.y*t,vz-d.z*t)<.42){bt=t;best={p,t,hd:h>1.5}}}});return best}
function pedMelee(o,b){let best=null,bt=3;PEDS.forEach(p=>{if(p.st=='d'||!p.m.visible)return;const vx=p.x-o.x,vz=p.z-o.z,t=vx*b.x+vz*b.z;if(t>0&&t<bt&&H(vx-b.x*t,vz-b.z*t)<1.1){bt=t;best=p}});if(best)pedHurt(best,.8,0,b)}
function pedTick(dt){
 if(CUT||PAUSED||P.dead)return;
 if(!PI&&BNK.length&&BNK[0].staff){PI=1;BNK.forEach(b=>b.staff.forEach((h,i)=>{h.rotation.order='YXZ';PEDS.push({k:'s',m:h,x:h.position.x,z:h.position.z,y:h.position.y,hp:3,st:'i',cr:0,fe:0,b,i,dt:0})}))}
 const q=F.on?F:P;let n=0;PEDS.forEach(p=>{if(p.k=='p'&&p.st!='d')n++});
 for(let a=0;a<2&&n<34;a++)if(pedSpawn(q))n++;
 if(!F.on&&!ENT){const sp=H(P.vx,P.vz);if(sp>4)PEDS.forEach(p=>{if(p.st!='d'&&p.m.visible&&H(p.x-P.x,p.z-P.z)<2.2)pedHurt(p,4,0,{x:P.vx/sp,z:P.vz/sp})})}
 for(let i=PEDS.length-1;i>=0;i--){const p=PEDS[i],m=p.m;
  if(p.k=='c')continue;
  if(p.k=='s'){
   if(p.st=='d'){p.dt+=dt;m.rotation.x=-Math.min(1.5,p.dt*5);m.position.set(p.x,.25,p.z);m.scale.y=1;if(p.dt>60)m.visible=false;if(p.dt>150){p.st='i';p.hp=3;p.cr=0;p.fe=0;m.visible=true;m.rotation.x=0;m.position.set(p.x,p.y,p.z)}continue}
   p.fe=Math.max(0,p.fe-dt);const tg=(ROB&&ROB.b==p.b)||p.fe>0?1:0;p.cr+=(tg-p.cr)*Math.min(1,dt*7);
   m.scale.y=1-.42*p.cr;m.position.x=p.x+Math.sin(el*38+p.i*2)*.03*p.cr;
   [3,4].forEach((k,j)=>{const a=m.children[k];if(a){a.position.y=1.2+.5*p.cr;a.rotation.z=(j?-1:1)*.35*p.cr}});continue}
  const dq=H(p.x-q.x,p.z-q.z);
  if(p.st=='d'){p.dt+=dt;m.rotation.x=-Math.min(1.5,p.dt*5);m.position.y=.2;if(p.dt>18)m.scale.setScalar(Math.max(.001,p.bs*(19-p.dt)));if(p.dt>19){sc.remove(m);PEDS.splice(i,1)}continue}
  if(dq>150){sc.remove(m);PEDS.splice(i,1);continue}
  let sp=p.sp;if(p.fl>0){p.fl-=dt;sp=5.4}else if(p.wt>0){p.wt-=dt;sp=0}else if(R()<dt*.035)p.wt=.4+R()*1.8;
  if(sp>0)pedNav(p,q,sp,dt);
  m.position.set(p.x,.07,p.z);
  p.ph+=dt*sp*2.4;const sw=Math.sin(p.ph)*Math.min(.9,sp*.28);p.lL.rotation.x=sw;p.lR.rotation.x=-sw;p.aL.rotation.x=-sw;p.aR.rotation.x=sw}}
{const o=story;story=dt=>{o(dt);pedTick(dt)}}
// ================= ARMED POLICE: officers get out and shoot =================
const CW={pistol:{rng:17,rate:.9,dmg:3,pel:1,snd:260,acc:.6,burst:1},smg:{rng:15,rate:.14,dmg:1.6,pel:1,snd:320,acc:.45,burst:6,pause:1.3},shotgun:{rng:10,rate:1.5,dmg:2,pel:5,snd:130,acc:.5,burst:1},rifle:{rng:26,rate:.18,dmg:2.6,pel:1,snd:220,acc:.5,burst:4,pause:1.2}};
const pickCW=st=>st<=1?'pistol':st==2?(R()<.5?'pistol':'smg'):st==3?(R()<.5?'smg':'shotgun'):st==4?(R()<.6?'rifle':'smg'):'rifle';
const TRC=[];let HT=0,copSay=0,lastCS=0;
function tracer(x1,y1,z1,x2,y2,z2){let t=TRC.find(q=>q.ttl<=0);if(!t){if(TRC.length>=30)return;const m=new T.Mesh(new T.BoxGeometry(.05,.05,1),new T.MeshBasicMaterial({color:0xffe9a0}));sc.add(m);t={m,ttl:0};TRC.push(t)}
 t.m.scale.z=H(x2-x1,y2-y1,z2-z1);t.m.position.set((x1+x2)/2,(y1+y2)/2,(z1+z2)/2);t.m.lookAt(x2,y2,z2);t.m.visible=true;t.ttl=.07}
function hurtFlash(){const h=$('hurt');h.style.opacity=.9;clearTimeout(HT);HT=setTimeout(()=>{h.style.opacity=0},90)}
function mkCop(){const g=new T.Group(),bx=(w,h,d,x,y,z,c,par)=>{const m=new T.Mesh(pg_(w,h,d),pmt(c));m.position.set(x,y,z);(par||g).add(m);return m},UN=0x7a5a38,lL=new T.Group(),lR=new T.Group(),aL=new T.Group(),aR=new T.Group();
 lL.position.set(-.17,.85,0);lR.position.set(.17,.85,0);aL.position.set(-.45,1.55,0);aR.position.set(.45,1.55,0);g.add(lL,lR,aL,aR);
 bx(.3,.85,.3,0,-.43,0,0x2b2b2b,lL);bx(.3,.85,.3,0,-.43,0,0x2b2b2b,lR);bx(.7,.8,.4,0,1.25,0,UN);bx(.74,.6,.44,0,1.3,0,0x1c1c1c);bx(.2,.7,.2,0,-.35,0,UN,aL);bx(.2,.7,.2,0,-.35,0,UN,aR);
 bx(.32,.34,.32,0,1.85,0,0xc58c5a);bx(.08,.08,.08,0,1.85,.18,0xc58c5a);bx(.38,.12,.4,0,2.05,0,0x2a1f12);bx(.38,.04,.2,0,2.01,.24,0x1a1208);bx(.08,.12,.42,0,-.72,.2,0x111111,aR);
 g.rotation.order='YXZ';sc.add(g);return{k:'c',m:g,lL,lR,aL,aR,bs:1}}
const lineBlk=(x1,z1,x2,z2)=>{const d=H(x2-x1,z2-z1),n=Math.max(1,(d/4)|0);for(let i=1;i<n;i++){const t=i/n;if(inBld(x1+(x2-x1)*t,z1+(z2-z1)*t))return true}return false};
function cstep(c,vx,vz,sp,dt){const nx=c.x+vx*sp*dt,nz=c.z+vz*sp*dt;if(!inBld(nx,nz)){c.x=nx;c.z=nz;return 1}if(!inBld(nx,c.z))c.x=nx;else if(!inBld(c.x,nz))c.z=nz;return 0}
function copFire(c,q,d){const w=c.wp,ty=F.on?1.3:1;let acc=cl(w.acc-d*.012,.08,.7);if(!F.on)acc*=H(P.vx,P.vz)>10?.5:.8;
 for(let i=0;i<w.pel;i++){const hit=R()<acc,ox=hit?0:(R()-.5)*3,oz=hit?0:(R()-.5)*3;tracer(c.x,1.45,c.z,q.x+ox,ty+(hit?0:(R()-.5)),q.z+oz);if(hit){P.hp-=w.dmg*(F.on?1:.55);spark(q.x,ty,q.z,2,0xff5030,3);hurtFlash();shake=Math.min(1,shake+.18)}}
 const n=performance.now();if(d<70&&n-lastCS>70){lastCS=n;gunSnd({snd:w.snd})}}
function pcDoors(pc){if(!pc.dr){const mk=sd=>{const g=new T.Group();g.position.set(sd*1.03,1,.6);const m=new T.Mesh(pg_(.07,.8,1.2),pmt(0x15171c));m.position.z=-.6;g.add(m);pc.m.add(g);return g};pc.dr={'1':mk(1),'-1':mk(-1)}}}
const sm3=x=>{x=cl(x,0,1);return x*x*(3-2*x)},lp3=(a,b,t)=>a+(b-a)*t;
function copExit(c,dt){const pc=c.car,m=c.m,sd=c.sdd;pcDoors(pc);const fx=SN(pc.th),fz=CS(pc.th),lx=fz,lz=-fx;
 if(!c.go){c.wt+=dt;if(c.wt>=0&&(H(pc.vx,pc.vz)<2.2||c.wt>3)){c.go=1;c.ea=0;m.visible=true}else return}
 c.ea+=dt;const D=1.3,u=Math.min(1,c.ea/D),sx=pc.x+lx*sd*.55+fx*.1,sz=pc.z+lz*sd*.55+fz*.1,dx=pc.x+lx*sd*1.8,dz=pc.z+lz*sd*1.8,a=sm3((u-.28)/.3),b=sm3((u-.58)/.34),r=sm3((u-.25)/.35);
 c.x=lp3(lp3(sx,dx,a),c.fx,b);c.z=lp3(lp3(sz,dz,a),c.fz,b);m.position.set(c.x,.07+.45*(1-r),c.z);m.scale.y=.62+.38*r;
 const mvg=u>.25&&u<.95?1:0;c.ph+=dt*9;const sw=Math.sin(c.ph)*.75*mvg;c.lL.rotation.x=sw;c.lR.rotation.x=-sw;c.aL.rotation.x=-sw*.8;c.aR.rotation.x=lp3(sw*.8,-1.45,sm3((u-.7)/.3));
 m.rotation.y=u<.6?Math.atan2(lx*sd,lz*sd):Math.atan2((F.on?F:P).x-c.x,(F.on?F:P).z-c.z);
 pc.dr[sd].rotation.y=-sd*1.1*(sm3(u/.25)-sm3((u-.72)/.28));
 if(u>=1){c.st='a';c.ex=.15;m.scale.y=1;m.position.y=.07;pc.dr[sd].rotation.y=0}}
function copTick(dt){TRC.forEach(t=>{if(t.ttl>0&&(t.ttl-=dt)<=0)t.m.visible=false});
 if(CUT||PAUSED||P.dead||onTitle)return;
 const stars=Math.min(5,Math.ceil(P.heat)),q=F.on?F:P;
 if(stars>0)police.forEach(pc=>{if(pc.dep||PEDS.filter(p=>p.k=='c'&&p.st!='d').length>=6||H(pc.x-q.x,pc.z-q.z)>34||H(pc.vx,pc.vz)>22)return;
  pc.dep=1;pc.hold=1;pc.ttl=9999;const fx=SN(pc.th),fz=CS(pc.th),n=stars>=4?3:2;
  for(let i=0;i<n;i++){const c=mkCop(),sd=i%2?-1:1;Object.assign(c,{x:pc.x,z:pc.z,fx:pc.x+fz*2.5*sd+fx*(i-1),fz:pc.z-fx*2.5*sd+fz*(i-1),hp:4,st:'e',sdd:sd,wt:i>1?-.7:0,wp:CW[pickCW(stars)],cd:1+R()*1.2,bc:0,car:pc,ph:R()*6,sp:3.2+stars*.3,sd:R()<.5?1:-1,tt:1,ex:0,dt:0});c.m.visible=false;c.m.position.set(c.x,.5,c.z);PEDS.push(c)}
  if(!copSay){copSay=1;say('Police','Stop! Drop your weapon!',2600)}});
 if(!stars)copSay=0;
 const cops=PEDS.filter(p=>p.k=='c');
 cops.forEach(c=>{const m=c.m;
  if(c.st=='d'){if(!c.cnt){c.cnt=1;P.money+=120;STAT.copsDown++}c.dt+=dt;m.rotation.x=-Math.min(1.5,c.dt*5);m.position.set(c.x,.2,c.z);if(c.dt>20){sc.remove(m);PEDS.splice(PEDS.indexOf(c),1)}return}
  if(c.st=='e'){if(stars){copExit(c,dt);return}c.m.visible=true;c.m.scale.y=1;c.x=c.fx;c.z=c.fz;c.m.position.set(c.x,.07,c.z);if(c.car.dr)c.car.dr[c.sdd].rotation.y=0;c.st='r'}
  const dx=q.x-c.x,dz=q.z-c.z,d=H(dx,dz);let mv=0,aim=0;
  if(!stars)c.st='r';
  if(c.st=='r'){const cx=c.car.x-c.x,cz=c.car.z-c.z,cd=H(cx,cz);c.rt=(c.rt||0)+dt;
   if(cd<2.6||c.rt>10){sc.remove(m);PEDS.splice(PEDS.indexOf(c),1);if(!PEDS.some(o=>o.k=='c'&&o!=c&&o.car==c.car)){c.car.hold=0;c.car.ttl=7}return}
   cstep(c,cx/cd,cz/cd,4,dt);m.rotation.y=Math.atan2(cx,cz);mv=1}
  else{const blocked=lineBlk(c.x,c.z,q.x,q.z),rng=c.wp.rng;
   if(c.ex>0){c.ex-=dt;const fx=SN(c.car.th),fz=CS(c.car.th);cstep(c,-fz*c.sd,fx*c.sd,2.2,dt);mv=.6}
   else if(d>rng*.75||blocked){if(!cstep(c,dx/d,dz/d,c.sp,dt)||blocked&&(c.stk=(c.stk||0)+dt)>1.2){cstep(c,-dz/d*c.sd,dx/d*c.sd,c.sp,dt);if(c.stk>3.2){c.stk=0;c.sd=-c.sd}}mv=1}
   else if(d<5)cstep(c,-dx/d,-dz/d,2.5,dt);
   else{c.tt-=dt;if(c.tt<=0){c.sd=-c.sd;c.tt=1+R()*2}cstep(c,-dz/d*c.sd,dx/d*c.sd,1.4,dt);mv=.6}
   m.rotation.y=Math.atan2(dx,dz);aim=c.ex<=0&&!blocked&&d<rng*1.2;
   if(aim){c.cd-=dt;if(c.cd<=0){copFire(c,q,d);c.bc++;if(c.wp.burst>1&&c.bc>=c.wp.burst){c.bc=0;c.cd=c.wp.pause+R()*.6}else c.cd=c.wp.rate*(.85+R()*.3)}}}
  m.position.set(c.x,.07,c.z);c.ph+=dt*c.sp*2.6*mv;const sw=Math.sin(c.ph)*.8*mv;c.lL.rotation.x=sw;c.lR.rotation.x=-sw;
  c.aR.rotation.x=aim?-1.45:sw;c.aL.rotation.x=aim&&c.wp.burst>1||aim&&c.wp.pel>1?-1.25:-sw});
 police.forEach(pc=>{if(pc.hold&&!cops.some(c=>c.car==pc&&c.st!='d'))pc.hold=0});
 if(F.on&&!stars&&P.hp<100)P.hp=Math.min(100,P.hp+3*dt)}
{const o=story;story=dt=>{o(dt);copTick(dt)}}
// ================= CLOTHING: outfits, clerk Mbak Rina, fitting room =================
const OUT0={top:'tee',topc:0x2f5d8a,bot:'jeans',botc:0x23262e,sh:'none',shc:0xf2f2f2,hat:'none',hatc:0xc0392b,gl:'none'};
let OUTF=Object.assign({},OUT0),OWNC={tee:1,jeans:1,none:1},cloTalk=0,cloDisc=1,FTAB='top',OUTT=null,fitMsg='';
const CI={top:[['tee','Kaos Polos',0],['hoodie','Hoodie',120],['batik','Kemeja Batik',200],['bomber','Jaket Bomber',260],['jersey','Jersey Bola',90],['suit','Jas Eksekutif',900]],
 bot:[['jeans','Jeans',0],['shorts','Celana Pendek',60],['cargo','Celana Cargo',110],['track','Training',80]],
 sh:[['none','Tanpa Sepatu',0],['sneaker','Sneakers',150],['boot','Boots Kulit',260],['sandal','Sandal Jepit',40]],
 hat:[['none','Tanpa Topi',0],['cap','Topi Baseball',50],['beanie','Kupluk',45],['peci','Peci Hitam',60]],
 gl:[['none','Tanpa Kacamata',0],['shade','Kacamata Hitam',70],['clear','Kacamata Bening',55]]};
const CC={top:[0x2f5d8a,0xc0392b,0x2e9d57,0x111111,0xf2f2f2,0xf2c94c,0x7a4fa0,0x8a5a2b],bot:[0x23262e,0x2b4a8a,0x6b5a3a,0x3b3b3b,0x7a8a5a,0xe8e0d0],sh:[0xf2f2f2,0x111111,0xc0392b,0x2b6bd6,0x8a5a2b],hat:[0xc0392b,0x2f5d8a,0x111111,0xf2f2f2,0x2e9d57]};
const CK={top:'topc',bot:'botc',sh:'shc',hat:'hatc'};
const ACC=new T.Group();RK.add(ACC);
function applyOutfit(o){o=o||OUTF;const ch=RK.children,SK=0xc58c5a;while(ACC.children.length)ACC.remove(ACC.children[0]);
 const bx=(w,h,d,x,y,z,c)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);ACC.add(m);return m},dk=(c,k)=>new T.Color(c).multiplyScalar(k||.7).getHex();
 ch[0].material.color.set(o.botc);ch[1].material.color.set(o.botc);[2,3,4].forEach(i=>ch[i].material.color.set(o.topc));
 const t=o.top,tc=o.topc;
 if(t=='tee'||t=='jersey'){bx(.23,.36,.23,-.45,1.02,0,SK);bx(.23,.36,.23,.45,1.02,0,SK)}
 if(t=='hoodie'){bx(.5,.2,.2,0,1.62,-.22,tc);bx(.4,.2,.05,0,1.0,.22,dk(tc));bx(.04,.25,.03,-.1,1.5,.21,0xffffff);bx(.04,.25,.03,.1,1.5,.21,0xffffff)}
 if(t=='batik'){for(let i=-2;i<=2;i++)for(let j=0;j<3;j++)bx(.1,.1,.02,i*.14,1.0+j*.22,.205,0xe8b64a);bx(.2,.12,.02,-.45,1.2,.105,0xe8b64a);bx(.2,.12,.02,.45,1.2,.105,0xe8b64a);bx(.3,.08,.3,0,1.67,.02,dk(tc))}
 if(t=='bomber'){bx(.74,.1,.44,0,.9,0,dk(tc,.5));bx(.22,.1,.22,-.45,.9,0,dk(tc,.5));bx(.22,.1,.22,.45,.9,0,dk(tc,.5));bx(.5,.1,.45,0,1.66,0,dk(tc,.5));bx(.04,.78,.03,0,1.25,.21,0xdddddd)}
 if(t=='jersey'){bx(.72,.12,.42,0,1.34,0,0xffffff);bx(.2,.25,.02,0,1.2,-.205,0xffffff)}
 if(t=='suit'){bx(.2,.7,.02,0,1.3,.205,0xf5f5f5);bx(.08,.55,.03,0,1.25,.22,0xb3202b);bx(.12,.6,.03,-.15,1.3,.21,dk(tc,.6));bx(.12,.6,.03,.15,1.3,.21,dk(tc,.6))}
 const b=o.bot;
 if(b=='shorts'){bx(.31,.46,.31,-.17,.23,0,SK);bx(.31,.46,.31,.17,.23,0,SK)}
 if(b=='cargo'){bx(.08,.22,.12,-.34,.5,0,dk(o.botc));bx(.08,.22,.12,.34,.5,0,dk(o.botc))}
 if(b=='track'){bx(.03,.82,.31,-.325,.43,0,0xffffff);bx(.03,.82,.31,.325,.43,0,0xffffff)}
 const sh=o.sh,sc_=o.shc;
 if(sh=='sneaker')for(const x of[-.17,.17]){bx(.34,.14,.52,x,.09,.09,sc_);bx(.36,.05,.54,x,.025,.09,0xdddddd)}
 if(sh=='boot')for(const x of[-.17,.17]){bx(.34,.36,.48,x,.18,.06,sc_);bx(.36,.06,.5,x,.03,.07,0x222222)}
 if(sh=='sandal')for(const x of[-.17,.17]){bx(.32,.04,.5,x,.02,.08,sc_);bx(.32,.06,.12,x,.07,.12,dk(sc_))}
 const h=o.hat;
 if(h=='cap'){bx(.4,.14,.42,0,2.14,0,o.hatc);bx(.3,.04,.26,0,2.09,.3,dk(o.hatc))}
 if(h=='beanie'){bx(.42,.22,.42,0,2.12,0,o.hatc);bx(.1,.1,.1,0,2.28,0,0xffffff)}
 if(h=='peci'){bx(.38,.2,.36,0,2.14,0,0x101010)}
 if(o.gl=='shade'){bx(.38,.1,.05,0,1.88,.18,0x111111);bx(.04,.04,.3,-.19,1.88,.04,0x111111);bx(.04,.04,.3,.19,1.88,.04,0x111111)}
 if(o.gl=='clear'){bx(.38,.1,.04,0,1.88,.18,0x333333);bx(.3,.06,.03,0,1.88,.2,0x9fd4f2);bx(.04,.04,.3,-.19,1.88,.04,0x333333);bx(.04,.04,.3,.19,1.88,.04,0x333333)}}
applyOutfit(OUTF);
// clerk
const RINA=human(0xd6457f,0xd9a066,0x1a1008);{const m=(w,h,d,x,y,z,c)=>{const q=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));q.position.set(x,y,z);RINA.add(q)};m(.6,.7,.02,0,1.2,.21,0xf5f5f5);m(.4,.16,.4,0,1.98,-.03,0x1a1008)}
RINA.visible=true;const rp_=()=>CLO.length&&CLO[0].L(22.2,0);
if(CLO.length){const p=rp_();RINA.position.set(p[0],0,p[1]);RINA.rotation.y=Math.atan2(-Math.cos(CLO[0].th),Math.sin(CLO[0].th))}
const cloc=(c,x,z)=>{const dx=x-c.ox,dz=z-c.oz;return[dx*Math.cos(c.th)-dz*Math.sin(c.th),dx*Math.sin(c.th)+dz*Math.cos(c.th)]};
const inShop=(c,q)=>{const[lx,lz]=cloc(c,q.x,q.z);return lx>6&&lx<25&&Math.abs(lz)<11};
function cloPrompt(){const c=CLO[0];if(!c||FIT||!F.on)return'';const[lx,lz]=cloc(c,F.x,F.z);if(!inShop(c,F))return'';
 if(H(F.x-RINA.position.x,F.z-RINA.position.z)<5)return'[E] Talk to Mbak Rina';
 if(lx>11&&lx<15.2&&lz>5&&lz<11)return cloTalk?'[E] Enter the fitting room':'Ask Mbak Rina about the fitting room first';return''}
function cloAct(){const p=cloPrompt();if(!p)return false;if(p[0]!='[')say('Raka','I should ask the clerk before using the fitting room.',2500);else if(p.indexOf('Talk')>0)talkRina();else startFit();return true}
function talkRina(){CLO[0].wv=1.2;choose('MBAK RINA · Distro Rasa Jakarta',cloTalk?'"Anything else, Mas?"':'"Halo, Mas! Looking for clothes, shoes, a hat? Everything is here."',[
 ['May I try something on?',()=>{cloTalk=1;say('Mbak Rina','Of course! The fitting room is the green curtain in the back corner. Take your time.',5000)}],
 ['Any discounts today?',()=>{if(cloDisc<1)say('Mbak Rina','I already gave you the discount, Mas. Do not push your luck!',4000);else{cloDisc=.85;say('Mbak Rina','Fine, fine. 15% off everything today, just for you.',4500)}}],
 ['Just browsing',()=>say('Mbak Rina','Silakan, Mas. Take your time.',3000)]])}
const FW=(c,x,z)=>c.L(x,z),fRy=c=>Math.atan2(-Math.cos(c.th),Math.sin(c.th));
function startFit(){if(P.heat>0){say('Mbak Rina','Mas, there are police outside! Come back later.',3500);return}if(CUT||ENT||PAUSED||P.dead||FIT)return;
 const c=CLO[0];trig=0;try{if(document.exitPointerLock)document.exitPointerLock()}catch(e){}
 const A1=FW(c,13.4,8.25),dist=H(A1[0]-F.x,A1[1]-F.z);FIT={c,ph:'a',t:0,d:Math.min(2.6,Math.max(1,dist/3.4)),sx:F.x,sz:F.z,ex:F.x,ez:F.z};
 OUTT=Object.assign({},OUTF);fitMsg='';RK.visible=false;RK.position.set(F.x,0,F.z);RK.rotation.set(0,Math.atan2(A1[0]-F.x,A1[1]-F.z),0);tone(600,.12,.05)}
function fitUI(){const T_=OUTT,cats=[['top','Tops'],['bot','Bottoms'],['sh','Shoes'],['hat','Hats'],['gl','Glasses']],pr=(k,id)=>id=='none'||OWNC[id]?0:Math.round(CI[k].find(x=>x[0]==id)[2]*cloDisc);let cost=0;cats.forEach(([k])=>cost+=pr(k,T_[k]));
 const ck=CK[FTAB];let h='<h3>FITTING ROOM</h3><div class="fm">Cash $'+P.money+(cloDisc<1?' · 15% off today':'')+'</div><div class="ft">'+cats.map(([k,n])=>'<button data-f="tab" data-k="'+k+'"'+(k==FTAB?' class="on"':'')+'>'+n+'</button>').join('')+'</div>';
 h+=CI[FTAB].map(([id,n,p])=>{const sel=T_[FTAB]==id,own=id=='none'||OWNC[id];return'<button class="fi'+(sel?' on':'')+'" data-f="item" data-id="'+id+'"><span>'+n+'</span><b>'+(sel&&own?'Wearing':own?'Owned':'$'+Math.round(p*cloDisc))+'</b></button>'}).join('');
 if(ck&&T_[FTAB]!='none'&&!(FTAB=='hat'&&T_.hat=='peci'))h+='<div class="sw">'+CC[FTAB].map(c=>'<i data-f="col" data-c="'+c+'" style="background:#'+c.toString(16).padStart(6,'0')+'"'+(T_[ck]==c?' class="on"':'')+'></i>').join('')+'</div>';
 h+='<div class="fm">To pay: $'+cost+'</div><div class="fm">'+fitMsg+'</div><button class="go" data-f="buy">Pay &amp; wear</button><button data-f="reset">Reset</button><button class="lv" data-f="leave">Leave fitting room</button>';$('fit').innerHTML=h}
$('fit').onclick=e=>{const b=e.target.closest('[data-f]');if(!b||!FIT||FIT.ph!='f')return;const a=b.dataset.f;
 if(a=='tab')FTAB=b.dataset.k;else if(a=='item'){OUTT[FTAB]=b.dataset.id;applyOutfit(OUTT)}else if(a=='col'){OUTT[CK[FTAB]]=+b.dataset.c;applyOutfit(OUTT)}
 else if(a=='reset'){OUTT=Object.assign({},OUTF);applyOutfit(OUTT);fitMsg=''}
 else if(a=='buy'){let cost=0;['top','bot','sh','hat','gl'].forEach(k=>{const id=OUTT[k];if(id!='none'&&!OWNC[id])cost+=Math.round(CI[k].find(x=>x[0]==id)[2]*cloDisc)});
  if(cost>P.money)fitMsg='Not enough cash.';else{P.money-=cost;['top','bot','sh','hat','gl'].forEach(k=>OWNC[OUTT[k]]=1);OUTF=Object.assign({},OUTT);fitMsg=cost?'Paid $'+cost+'. Looking good!':'Look saved.';if(cost)tone(900,.18,.06)}}
 else if(a=='leave'){endFit();return}
 fitUI()};
function endFit(){if(!FIT||FIT.ph!='f')return;applyOutfit(OUTF);$('fit').style.display='none';FIT.ph='o';FIT.t=0}
const lw_=(a,b,t)=>a+(b-a)*t,wrapA=(a,b)=>((b-a+Math.PI*3)%(Math.PI*2))-Math.PI;
function fitCam(){const f=FIT,c=f.c,cin=FW(c,9,3.2),inn=FW(c,15.8,8.25),tg=FW(c,19.7,8.25),hd=[RK.position.x,1.55,RK.position.z];let p,l;
 if(f.ph=='a'){const k=sm_(f.t/f.d);p=[lw_(f.ex,cin[0],k),lw_(1.7,2.3,k),lw_(f.ez,cin[1],k)];l=hd}
 else if(f.ph=='b'){p=[cin[0],2.3,cin[1]];l=hd}
 else if(f.ph=='c'){const k=sm_(f.t/.9);p=[lw_(cin[0],inn[0],k),lw_(2.3,1.55,k),lw_(cin[1],inn[1],k)];l=[lw_(hd[0],tg[0],k),lw_(1.55,1.15,k),lw_(hd[1],tg[1],k)]}
 else if(f.ph=='p'){const k=sm_(Math.min(1,f.t/1.5*1.6));p=[lw_(inn[0],cin[0],k),lw_(1.55,2.3,k),lw_(inn[1],cin[1],k)];l=hd}
 else{p=[inn[0],1.55,inn[1]];l=[tg[0],1.15,tg[1]]}
 return[p[0],p[1],p[2],l[0],l[1],l[2]]}
function fitTick(dt){const f=FIT,c=f.c;f.t+=dt;const A1=FW(c,13.4,8.25),B1_=FW(c,19.6,8.25),E1=FW(c,12.4,8.25),ry1=fRy(c),bob=()=>Math.abs(SN(f.t*11))*.06;
 const wk=(p,q,u)=>{RK.position.set(lw_(p[0],q[0],u),bob(),lw_(p[1],q[1],u));RK.rotation.y=Math.atan2(q[0]-p[0],q[1]-p[1])};
 if(f.ph=='a'){const u=Math.min(1,f.t/f.d);wk([f.sx,f.sz],A1,u);RK.visible=f.t>.25;f.cv=0;if(u>=1){f.ph='b';f.t=0}}
 else if(f.ph=='b'){const u=Math.min(1,f.t/1.4);wk(A1,B1_,u);RK.visible=true;f.cv=0;if(u>=1){f.ph='c';f.t=0}}
 else if(f.ph=='c'){const u=Math.min(1,f.t/.9),ry0=Math.atan2(B1_[0]-A1[0],B1_[1]-A1[1]);RK.position.set(B1_[0],0,B1_[1]);RK.rotation.y=ry0+wrapA(ry0,ry1)*sm_(u);f.cv=sm_(u);if(u>=1){f.ph='f';f.t=0;f.cv=1;FTAB='top';OUTT=Object.assign({},OUTF);$('fit').style.display='block';fitUI();tone(500,.1,.04)}}
 else if(f.ph=='f'){RK.position.set(B1_[0],0,B1_[1]);RK.rotation.y=ry1+SN(f.t*.9)*.5;f.cv=1}
 else if(f.ph=='o'){const u=Math.min(1,f.t/.7);f.cv=1-sm_(u);RK.rotation.y+=wrapA(RK.rotation.y,ry1)*Math.min(1,dt*8);if(u>=1){f.ph='p';f.t=0}}
 else if(f.ph=='p'){const u=Math.min(1,f.t/1.5);wk(B1_,E1,u);f.cv=0;if(u>=1){F.x=E1[0];F.z=E1[1];F.yaw=Math.atan2(-Math.cos(c.th),Math.sin(c.th));F.pit=0;F.vx=F.vz=0;RK.visible=false;RK.position.set(0,0,0);FIT=null;c.cv=0;try{if(!('ontouchstart'in window))cv_.requestPointerLock()}catch(e){}say('Mbak Rina','Looking sharp, Mas! Come again.',3500);return}}
 c.cv=f.cv;F.vx=F.vz=0;if(f.ph!='a'&&f.ph!='b'&&f.ph!='p'){F.x=B1_[0];F.z=B1_[1]}else{F.x=RK.position.x;F.z=RK.position.z}}
function cloTick(dt){const c=CLO[0];if(!c)return;const q=F.on?F:P;
 const sz=.14+.86*c.cv;c.ct.scale.z=sz;
 const dd=H(q.x-c.dx,q.z-c.dz),tgt=((F.on&&dd<7.5)||FIT)?1:0;c.o+=(tgt-c.o)*Math.min(1,dt*5);c.dp[0].position.z=-1.3-2.5*c.o;c.dp[1].position.z=1.3+2.5*c.o;
 const near=H(q.x-c.x,q.z-c.z)<40;
 if(near){const ins=F.on&&inShop(c,F);if(ins&&!c.in&&!FIT){c.in=1;c.wv=1.6;tone(1250,.14,.05);setTimeout(()=>tone(1650,.2,.05),140);say('Mbak Rina','Selamat datang di Distro Rasa Jakarta, Mas!',3500)}if(!ins&&c.in){const[lx]=cloc(c,q.x,q.z);if(lx<4.5||lx>26||!F.on)c.in=0}
  if(ins||FIT){const ta=Math.atan2(q.x-RINA.position.x,q.z-RINA.position.z);RINA.rotation.y+=wrapA(RINA.rotation.y,ta)*Math.min(1,dt*3)}else RINA.rotation.y+=wrapA(RINA.rotation.y,fRy(c))*Math.min(1,dt*2);
  if(c.wv>0){c.wv-=dt;RINA.position.y=Math.abs(SN(c.wv*9))*.13}else RINA.position.y=0}
 if(FIT)fitTick(dt)}
{const o=story;story=dt=>{o(dt);cloTick(dt)}}
// ================= ARMS STORE: entry/exit, dealer Pak Bram, weapon-wall viewer =================
const DEAL=2+((R()*8)|0),SSC=[0,3.4,3.4,3.4,3,2.6,2,2,2,1.6],WSC=[0,3.2,3.2,3.2,2.7,2.4,2.1,2.1,2.1,1.8];
const slotPos=i=>{const k=i-1;return[[-5.2,0,5.2][k%3],[3.5,2.3,1.1][(k/3)|0]]};
let GSEL=2,gMsg='',SH=null,GPS=null;
STO.forEach(st=>{const d=human(0x3d4a3a,0xb07a56,0x222222),m=(w,h,dd,x,y,z,c)=>{const q=new T.Mesh(new T.BoxGeometry(w,h,dd),mat(c));q.position.set(x,y,z);d.add(q)};m(.4,.14,.42,0,2.13,0,0x222222);m(.3,.14,.2,0,1.72,.1,0x222222);m(.74,.5,.44,0,1.3,0,0x1c1c1c);
 d.visible=true;const p=st.L(12.6,-5.8);d.position.set(p[0],0,p[1]);d.rotation.y=fRy(st);st.dl=d;
 st.plate=new T.Mesh(new T.BoxGeometry(.04,1.5,3.9),new T.MeshBasicMaterial({color:0xf2b705,transparent:true,opacity:.35}));st.plate.visible=false;st.S.add(st.plate)});
let ARMW=0;function armsWall(){ARMW=1;STO.forEach(st=>{for(let i=1;i<=9;i++){const g=GMS[i].clone();g.visible=true;g.scale.setScalar(WSC[i]);const q=slotPos(i);g.position.set(20.7,q[1],q[0]);st.S.add(g)}})}
function gunPrompt(){GPS=null;if(!F.on||FIT||GS||!STO.length)return'';for(const st of STO){const[lx,lz]=cloc(st,F.x,F.z);
  if(lx>-1.5&&lx<5&&Math.abs(lz)<4.5){GPS=st;return'[E] Enter Jakarta Arms'}
  if(lx>5&&lx<22&&Math.abs(lz)<10){GPS=st;if(H(F.x-st.dl.position.x,F.z-st.dl.position.z)<5)return'[E] Talk to Pak Bram';if(lx<9&&Math.abs(lz)<4)return'[E] Leave Jakarta Arms'}}return''}
function gunAct(){const p=gunPrompt();if(!p||!GPS)return false;const st=GPS;
 if(p.indexOf('Enter')>0){if(P.heat>0){say('Pak Bram (intercom)','No cops, no business. Come back when it is quiet.',3500);return true}startGS(st,'in')}
 else if(p.indexOf('Leave')>0)startGS(st,'out');else talkBram(st);return true}
function startGS(st,dir){if(CUT||ENT||PAUSED||P.dead||FIT||GS)return;trig=0;try{if(document.exitPointerLock)document.exitPointerLock()}catch(e){}
 const t=dir=='in'?st.L(3.4,0):st.L(6.5,0),dist=H(t[0]-F.x,t[1]-F.z);GS={st,dir,ph:'a',t:0,d:Math.min(2.4,Math.max(.8,dist/3.2)),ex:F.x,ez:F.z,yaw:F.yaw};
 RK.visible=false;RK.position.set(F.x,0,F.z);RK.rotation.set(0,Math.atan2(t[0]-F.x,t[1]-F.z),0);tone(600,.1,.04)}
function talkBram(st){st.wv=1.2;choose('PAK BRAM · Jakarta Arms',st.met?'"Back again, Mas? What can I do for you?"':'"Welcome to Jakarta Arms. No questions asked, cash only."',[
 ['Show me what you have',()=>{st.met=1;startShop(st)}],
 ['Any deals today?',()=>say('Pak Bram','Today the '+W[DEAL].n+' is 25% off. Do not tell the other customers.',5000)],
 ['Just looking',()=>say('Pak Bram','Look all you want. Touch and you buy.',3500)]])}
function startShop(st){if(CUT||ENT||PAUSED||P.dead||FIT||GS)return;trig=0;try{if(document.exitPointerLock)document.exitPointerLock()}catch(e){}
 GS={st,dir:'shop',ph:'s0',t:0,ex:F.x,ez:F.z,yaw:F.yaw};GSEL=OWN[GSEL]&&GSEL<9?GSEL:GSEL;gMsg='';gsShow(GSEL)}
function endShop(){if(!GS||GS.ph!='shop')return;$('gs').style.display='none';GS.st.plate.visible=false;if(SH){SH.visible=false}GS.ph='s1';GS.t=0}
function gsShow(i){const st=GS.st;if(SH)sc.remove(SH);SH=GMS[i].clone();SH.visible=false;SH.scale.setScalar(SSC[i]);sc.add(SH);const q=slotPos(i);st.plate.position.set(20.8,q[1],q[0]);st.plate.visible=true}
const gPrice=i=>Math.round(W[i].price*(i==DEAL?.75:1));
function gsUI(){const i=GSEL,w=W[i],own=OWN[i],bar=(n,v)=>'<div class="st"><span>'+n+'</span><i><u style="width:'+Math.max(4,Math.min(100,v))+'%"></u></i></div>';
 let h='<div class="gh"><span>JAKARTA ARMS</span><button class="gx" data-g="back" title="Close (X)">X</button></div><div class="gc">WEAPONS · Cash $'+P.money+'</div><div class="gb">';
 for(let k=1;k<=9;k++)h+='<button class="gi'+(k==i?' on':'')+'" data-g="sel" data-i="'+k+'"><span>'+W[k].n+'</span><b>'+(OWN[k]?'Owned':k==DEAL?'<s>$'+W[k].price+'</s> $'+gPrice(k):'$'+W[k].price)+'</b></button>';
 h+='</div><div class="gd"><b class="n">'+w.n+'</b><br>'+w.d+(i==DEAL?'<div class="dl">25% discount available</div>':'')+bar('Damage',w.dmg/4*100)+bar('Fire rate',1/w.rate/18*100)+bar('Magazine',w.mag/32*100)+bar('Accuracy',100-w.spr*900)+(own?'<div>You have '+ammo[i]+' loaded + '+RES[i]+' spare</div>':'')+'</div><div class="gm">'+gMsg+'</div>';
 h+='<button class="gbtn go" data-g="buy">'+(own?'Buy 2 magazines · $'+w.ap*2:'Buy · $'+gPrice(i))+'</button><button class="gbtn bk" data-g="back">Leave the counter</button>';$('gs').innerHTML=h}
function gsBuy(){const i=GSEL,w=W[i];if(OWN[i]){const c=w.ap*2;if(P.money<c)gMsg='Not enough cash.';else{P.money-=c;RES[i]+=w.mag*2;gMsg='Bought ammo for '+w.n+'.';tone(900,.15,.06)}}
 else{const c=gPrice(i);if(P.money<c)gMsg='Not enough cash.';else{P.money-=c;OWN[i]=1;RES[i]+=w.mag*2;wi=i;gMsg='Purchased '+w.n+'!';tone(900,.18,.07)}}gsUI()}
function gsSel(i){if(i<1)i=9;if(i>9)i=1;GSEL=i;gMsg='';gsShow(i);if(GS)GS.st.plate.visible=true;gsUI()}
$('gs').onclick=e=>{const b=e.target.closest('[data-g]');if(!b||!GS||GS.ph!='shop')return;const a=b.dataset.g;if(a=='sel')gsSel(+b.dataset.i);else if(a=='buy')gsBuy();else if(a=='back')endShop()};
addEventListener('keydown',e=>{if(!GS||GS.ph!='shop')return;if(e.code=='ArrowDown'||e.code=='KeyS')gsSel(GSEL+1);else if(e.code=='ArrowUp'||e.code=='KeyW')gsSel(GSEL-1);else if(e.code=='Enter')gsBuy();else if(e.code=='Backspace'||e.code=='KeyX')endShop()});
function gsCam(){const g=GS,st=g.st,L=st.L,hd=[RK.position.x,1.55,RK.position.z];let p,l;
 if(g.dir=='shop'){const wc=L(14.6,-2.6),wl=L(21,-2.6),eyeF=[g.ex+SN(g.yaw)*6,g.ez+CS(g.yaw)*6],k=g.ph=='s0'?sm_(g.t/.9):g.ph=='s1'?1-sm_(g.t/.7):1;
  return[lw_(g.ex,wc[0],k),lw_(1.7,1.9,k),lw_(g.ez,wc[1],k),lw_(eyeF[0],wl[0],k),lw_(1.6,2.3,k),lw_(eyeF[1],wl[1],k)]}
 const cin=g.dir=='in'?L(-.5,-4.2):L(11.5,5.5);
 if(g.ph=='a'){const k=sm_(g.t/g.d);p=[lw_(g.ex,cin[0],k),lw_(1.7,2.2,k),lw_(g.ez,cin[1],k)]}else p=[cin[0],2.2,cin[1]];
 return[p[0],p[1],p[2],hd[0],hd[1],hd[2]]}
function gsTick(dt){const g=GS,st=g.st,L=st.L;g.t+=dt;const bob=()=>Math.abs(SN(g.t*11))*.06,wk=(p,q,u)=>{RK.position.set(lw_(p[0],q[0],u),bob(),lw_(p[1],q[1],u));RK.rotation.y=Math.atan2(q[0]-p[0],q[1]-p[1])};
 const P1=L(3.4,0),P2=L(8,0),Q1=L(6.5,0),P3=L(2.2,0);F.vx=F.vz=0;
 if(g.dir=='shop'){
  if(g.ph=='s0'&&g.t>=.9){g.ph='shop';g.t=0;$('gs').style.display='block';gsUI();tone(500,.1,.04)}
  else if(g.ph=='s1'&&g.t>=.7){if(SH){sc.remove(SH);SH=null}GS=null;try{if(!('ontouchstart'in window))cv_.requestPointerLock()}catch(e){}return}
  if(SH){const c=gsCam(),fx=c[3]-c[0],fz=c[5]-c[2],fl=H(fx,fz)||1,dx=fx/fl,dz=fz/fl;SH.visible=g.ph=='shop'||(g.ph=='s0'&&g.t>.6);SH.position.set(c[0]+dx*2.6-dz*1.3,1.75+SN(g.t*1.6)*.06,c[2]+dz*2.6+dx*1.3);SH.rotation.y=g.t*.9}
  return}
 if(g.dir=='in'){if(g.ph=='a'){const u=Math.min(1,g.t/g.d);wk([g.ex,g.ez],P1,u);RK.visible=g.t>.25;if(u>=1){g.ph='b';g.t=0;tone(1250,.14,.05);setTimeout(()=>tone(1650,.2,.05),140)}}
  else{const u=Math.min(1,g.t/1.6);wk(P1,P2,u);RK.visible=true;if(u>=1){F.x=P2[0];F.z=P2[1];F.yaw=Math.atan2(Math.cos(st.th),-Math.sin(st.th));F.pit=0;RK.visible=false;RK.position.set(0,0,0);GS=null;st.wv=1.6;try{if(!('ontouchstart'in window))cv_.requestPointerLock()}catch(e){}say('Pak Bram','Welcome to Jakarta Arms, Mas. Hands where I can see them. Ha! Talk to me when you are ready.',5000);return}}}
 else{if(g.ph=='a'){const u=Math.min(1,g.t/g.d);wk([g.ex,g.ez],Q1,u);RK.visible=g.t>.25;if(u>=1){g.ph='b';g.t=0}}
  else{const u=Math.min(1,g.t/1.6);wk(Q1,P3,u);RK.visible=true;if(u>=1){F.x=P3[0];F.z=P3[1];F.yaw=fRy(st);F.pit=0;RK.visible=false;RK.position.set(0,0,0);GS=null;st.in=0;try{if(!('ontouchstart'in window))cv_.requestPointerLock()}catch(e){}say('Pak Bram','Stay safe out there, Mas.',3000);return}}}
 F.x=RK.position.x;F.z=RK.position.z}
function gunTick(dt){if(!ARMW)armsWall();STO.forEach(st=>{const q=F.on?F:P;if(H(q.x-st.x,q.z-st.z)>45)return;
  const dd=H(q.x-st.dx,q.z-st.dz),tgt=((F.on&&dd<6.5)||(GS&&GS.st===st&&GS.dir!='shop'))?1:0;st.o+=(tgt-st.o)*Math.min(1,dt*5);st.dp[0].position.z=-1.3-2.5*st.o;st.dp[1].position.z=1.3+2.5*st.o;
  const[lx,lz]=cloc(st,q.x,q.z),ins=F.on&&lx>5&&lx<22&&Math.abs(lz)<10;
  if(ins||(GS&&GS.st===st&&GS.dir!='out')){const ta=Math.atan2(q.x-st.dl.position.x,q.z-st.dl.position.z);st.dl.rotation.y+=wrapA(st.dl.rotation.y,ta)*Math.min(1,dt*3)}else st.dl.rotation.y+=wrapA(st.dl.rotation.y,fRy(st))*Math.min(1,dt*2);
  if(st.wv>0){st.wv-=dt;st.dl.position.y=Math.abs(SN(st.wv*9))*.13}else st.dl.position.y=0});
 if(GS)gsTick(dt)}
{const o=story;story=dt=>{o(dt);gunTick(dt)}}
$('help').innerHTML+=' · <b>Arms store:</b> press E at the door, talk to the dealer to browse guns';

$('help').innerHTML+=' · <b>Clothing store:</b> walk in, talk to the clerk (E), then use the fitting room';


function npcPlace(){const g=(m,x,z)=>m.position.set(x,0,z);DW.visible=stage==1;HD.visible=stage==5;AN.visible=stage==6;HAR.visible=stage==10;
 const j=stage==2||stage==8||stage==10;JG.visible=G1.visible=G2.visible=j;
 if(stage==2){g(JG,J1[0],J1[1]);g(G1,J1[0]-2,J1[1]-3);g(G2,J1[0]-2,J1[1]+3);JG.rotation.y=G1.rotation.y=G2.rotation.y=1.57}
 else if(stage==8){g(JG,W1[0],W1[1]);g(G1,W1[0]-2,W1[1]-3);g(G2,W1[0]-2,W1[1]+3);JG.rotation.y=G1.rotation.y=G2.rotation.y=1.57}
 else if(stage==10){g(HAR,EP[0],EP[1]+11);g(JG,EP[0]+3,EP[1]+13);g(G1,EP[0]-4,EP[1]+13);g(G2,EP[0]+6,EP[1]+11);HAR.rotation.y=JG.rotation.y=G1.rotation.y=G2.rotation.y=Math.PI}
 if(stage==6){g(AN,B1[0],B1[1]);AN.rotation.y=1.57}}
function objTxt(){if(stage>=FIN)return 'Deliver to: '+TG[tg][0]+' · '+Math.round(H(OB[0]-P.x,OB[1]-P.z))+' m';const O=ST[stage],q=F.on?F:P;let d='';if(O.p)d=' · '+Math.round(H(O.p[0]-q.x,O.p[1]-q.z))+' m'+(!F.on&&H(O.p[0]-P.x,O.p[1]-P.z)<30?' — press E to get out':'');return 'MISSION: '+O.t+d}
function story(dt){gun(dt);trk(dt);fuelTick(dt);robTick(dt);if(subT>0&&(subT-=dt)<=0)$('sub').style.opacity=0;
 const q=F.on?F:P;let m='';if(ENT)m='';else if(F.on&&bankPrompt())m=bankPrompt();else if(F.on&&cloPrompt())m=cloPrompt();else if(F.on&&gunPrompt())m=gunPrompt();else if(F.on&&nearStore())m='[E] Jakarta Arms gun store';else if(F.on){const t=tgtCar();if(t)m=t[1]=='jack'?'[E] Carjack':'[E] Get in car'}else if(H(P.vx,P.vz)<5)m='[E] Get out';$('pr').textContent=m;
 npcPlace();
 if(stage>=FIN){mk.visible=true;const t=TG[tg];OB=[t[1],t[2]];if(H(q.x-t[1],q.z-t[2])<10){STAT.deliveries++;P.money+=400+((R()*300)|0);nextT()}return}
 const O=ST[stage];mk.visible=!!O.p;{const fin=stage==FIN-1;mk.material.color.set(fin?0x35e08a:0xffdd33);mk.scale.set(fin?2:1,1,fin?2:1)}
 if(O.p){OB=O.p;mk.position.set(O.p[0],35,O.p[1]);if(F.on&&H(F.x-O.p[0],F.z-O.p[1])<8)startCut(O.cut)}
 else{OB=[P.x,P.z];if(O.c()){stage++;O.n&&O.n()}}}

// ---- steal cars ----
function nearCar(){let b=null,bd=4.5;tr.forEach(c=>{const d=H(c.x-F.x,c.z-F.z);if(d<bd){bd=d;b=c}});return b}
function steal(c){P.x=c.x;P.z=c.z;P.th=c.th;P.vx=P.vz=P.w=0;P.m.base=c.m.base;dent(P.m,-1);P.hp=100;F.on=0;F.hy=F.hp=0;c.hpg=null;respawn(c,150);P.heat=Math.max(P.heat,1.2);say('','Carjacked a '+P.m.model+'! Someone called the cops.',3000)}
// ---- weapons (real-gun based) ----
const W=[
 {n:'FISTS',melee:1,rate:.45,dmg:.1,mag:0,ap:0,price:0,d:'Bare knuckles'},
 {n:'DESERT EAGLE',mag:7,rate:.38,dmg:1.7,pel:1,spr:.006,auto:0,snd:170,mz:.5,ap:90,price:0,res0:28,d:'IMI Desert Eagle · .50 AE semi-auto pistol'},
 {n:'GLOCK 17',mag:17,rate:.14,dmg:.8,pel:1,spr:.012,auto:0,snd:260,mz:.35,ap:45,price:450,d:'Glock 17 · 9×19mm semi-auto pistol'},
 {n:'COLT PYTHON',mag:6,rate:.5,dmg:1.5,pel:1,spr:.006,auto:0,snd:200,mz:.5,ap:60,price:700,d:'Colt Python · .357 Magnum revolver'},
 {n:'MICRO UZI',mag:32,rate:.055,dmg:.38,pel:1,spr:.05,auto:1,snd:330,mz:.4,ap:70,price:1100,d:'IMI Micro Uzi · 9mm submachine gun'},
 {n:'HK MP5',mag:30,rate:.075,dmg:.5,pel:1,spr:.028,auto:1,snd:290,mz:.7,ap:90,price:1500,d:'Heckler & Koch MP5 · 9mm submachine gun'},
 {n:'REMINGTON 870',mag:6,rate:.85,dmg:.7,pel:9,spr:.09,auto:0,snd:130,mz:1,ap:100,price:2000,d:'Remington 870 · 12-gauge pump shotgun'},
 {n:'AK-47',mag:30,rate:.1,dmg:.9,pel:1,spr:.03,auto:1,snd:200,mz:.85,ap:130,price:2800,d:'Kalashnikov AK-47 · 7.62×39mm assault rifle'},
 {n:'COLT M4A1',mag:30,rate:.08,dmg:.75,pel:1,spr:.018,auto:1,snd:240,mz:.9,ap:150,price:3400,d:'Colt M4A1 · 5.56×45mm carbine'},
 {n:'BARRETT M82A1',mag:5,rate:1,dmg:4,pel:1,spr:.002,auto:0,snd:90,mz:1.2,ap:400,price:9500,d:'Barrett M82A1 · .50 BMG anti-materiel rifle'}];
let OWN=[1,1,0,0,0,0,0,0,0,0],RES=W.map(w=>w.res0||0),wi=1,ammo=W.map(w=>w.mag),gcd=0,rl=0,trig=0,kick=0,WH=0,wx=0,wy=0,WS=1;
const owned=()=>W.map((w,i)=>i).filter(i=>OWN[i]);
const GG=it=>{const g=new T.Group();it.forEach(([w,h,d,x,y,z,c])=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),gmat(c));m.position.set(x,y,z);g.add(m)});return g};
const FG=x=>{const g=GG([[.17,.17,.24,0,0,0,0xd9a47a],[.19,.05,.2,0,.1,0,0xc9936a],[.15,.15,.6,0,-.03,.42,0xc08a5e]]);g.position.x=x;return g};
const PN={t:9,d:.34,side:0,hit:1};
function punchHit(){thud();shake=Math.min(1,shake+.12);const o=cam.position.clone(),b=new T.Vector3();cam.getWorldDirection(b);[...tr,...police].forEach(c=>{const vx=c.x-o.x,vz=c.z-o.z,t=vx*b.x+vz*b.z;if(t>0&&t<3.6&&H(vx-b.x*t,vz-b.z*t)<2)hitCar(c,.1,1)});pedMelee(o,b)}
const GMS=[(()=>{const g=new T.Group();g.R=FG(0);g.L=FG(-.7);g.add(g.R,g.L);return g})(),
 GG([[.09,.13,.55,0,0,-.12,0xc0c4c9],[.08,.22,.13,0,-.17,.1,0x1b1b1b],[.05,.05,.1,0,.03,-.45,0x777777]]),
 GG([[.08,.11,.45,0,0,-.1,0x1c1c1c],[.07,.2,.1,0,-.15,.08,0x222222]]),
 GG([[.06,.08,.55,0,.02,-.2,0x9aa0a6],[.12,.12,.16,0,0,.05,0x8a9096],[.08,.2,.12,0,-.15,.14,0x6b4a2b]]),
 GG([[.1,.15,.4,0,0,-.05,0x1b1b1b],[.06,.28,.08,0,-.2,0,0x222222],[.04,.04,.2,0,.03,-.35,0x333333],[.04,.06,.3,0,0,.28,0x333333]]),
 GG([[.09,.13,.6,0,0,-.05,0x1c1c1c],[.05,.05,.3,0,.01,-.5,0x2a2a2a],[.06,.26,.09,0,-.2,-.02,0x222222],[.07,.1,.3,0,-.02,.4,0x222222],[.1,.08,.25,0,-.06,-.3,0x2a2a2a]]),
 GG([[.06,.06,1,0,.02,-.45,0x888d92],[.05,.05,.7,0,-.05,-.3,0x777c80],[.1,.09,.28,0,-.06,-.25,0x6b4a2b],[.08,.13,.45,0,-.02,.4,0x6b4a2b]]),
 GG([[.08,.1,.6,0,0,-.05,0x2a2a2a],[.04,.04,.45,0,.02,-.55,0x333333],[.07,.08,.35,0,-.02,-.4,0x6b3f1f],[.06,.28,.1,0,-.2,-.05,0x2b2b2b],[.07,.12,.4,0,-.03,.45,0x6b3f1f]]),
 GG([[.09,.12,.65,0,0,-.05,0x1c1c1c],[.04,.04,.5,0,.02,-.6,0x2a2a2a],[.05,.06,.25,0,.1,-.1,0x111111],[.06,.26,.09,0,-.2,-.02,0x222222],[.08,.1,.35,0,-.02,.45,0x222222]]),
 GG([[.1,.14,1,0,0,-.2,0x3a3f35],[.05,.05,.5,0,.01,-.9,0x2a2a2a],[.07,.08,.4,0,.13,-.1,0x111111],[.08,.1,.3,0,-.02,.5,0x3a3f35],[.08,.2,.1,0,-.16,.05,0x222222]])];
const gm=new T.Group();gm.position.set(.35,-.3,-.7);GMS.forEach(g=>gm.add(g));const fl=new T.Mesh(new T.BoxGeometry(.12,.12,.12),new T.MeshBasicMaterial({color:0xffdd66}));gm.add(fl);cam.add(gm);gm.visible=false;
function gunSnd(w){if(!au)return;const t=au.currentTime,o=au.createOscillator(),g=au.createGain();o.type='sawtooth';o.frequency.setValueAtTime(w.snd||240,t);o.frequency.exponentialRampToValueAtTime(40,t+.15);g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.connect(g);g.connect(au.destination);o.start();o.stop(t+.2)}
function thud(){if(!au)return;const t=au.currentTime,o=au.createOscillator(),g=au.createGain();o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(40,t+.1);g.gain.setValueAtTime(.15,t);g.gain.exponentialRampToValueAtTime(.001,t+.12);o.connect(g);g.connect(au.destination);o.start();o.stop(t+.14)}
function hitCar(c,d,q){c.hpg=(c.hpg==null?3:c.hpg)-d;dent(c.m,d*.12);const pl=police.includes(c);if(!q)P.heat=Math.max(P.heat,pl?2:1.1);
 if(c.hpg<=0){STAT.wrecked++;spark(c.x,1.4,c.z,30,0xff8a1a,16);spark(c.x,2,c.z,12,0x222222,6,1);if(pl){STAT.copsDown++;sc.remove(c.m);police.splice(police.indexOf(c),1);P.heat=Math.min(5,P.heat+.8);P.money+=100}else{c.hpg=null;respawn(c,150)}}}
function shoot(){const w=W[wi];if(gcd>0||rl>0||CUT||P.dead||ENT||FIT||GS||PAUSED||WH)return;
 const o=cam.position.clone(),b=new T.Vector3();cam.getWorldDirection(b);
 if(w.melee){if(PN.t<PN.d)return;gcd=.36;PN.t=0;PN.side^=1;PN.hit=0;return}
 if(ammo[wi]<=0){if(RES[wi]>0)rl=1.3;else{gcd=.5;say('','Out of ammo — buy more at a Jakarta Arms gun store.',2200)}return}
 ammo[wi]--;STAT.shots++;pedNoise();gcd=w.rate;kick=.14;shake=Math.min(1,shake+.06);gunSnd(w);
 for(let p=0;p<w.pel;p++){const d=b.clone().add(new T.Vector3((R()-.5)*w.spr*2,(R()-.5)*w.spr*2,(R()-.5)*w.spr*2)).normalize();let best=null,bt=120;
  [...tr,...police].forEach(c=>{const vx=c.x-o.x,vy=1-o.y,vz=c.z-o.z,t=vx*d.x+vy*d.y+vz*d.z;if(t<1||t>bt)return;if(H(vx-d.x*t,vy-d.y*t,vz-d.z*t)<2.2){best=c;bt=t}});
  const pr=pedRay(o,d,best?bt:120);if(pr)pedHurt(pr.p,w.dmg,pr.hd,d);else if(best){hitCar(best,w.dmg);spark(o.x+d.x*bt,o.y+d.y*bt,o.z+d.z*bt,3,0xffcc66,6)}}}
function gun(dt){if(WH&&(P.dead||CUT||PAUSED))wheelClose(false);gcd-=dt;const w=W[wi];if(rl>0&&(rl-=dt)<=0){const t=Math.min(w.mag-ammo[wi],RES[wi]);ammo[wi]+=t;RES[wi]-=t}
 if(trig&&w.auto)shoot();kick*=EX(-12*dt);if(PN.t<PN.d){PN.t+=dt;const u=PN.t/PN.d,R_=GMS[0].R,f=PN.side?R_:GMS[0].L,bx=PN.side?0:-.7,sg=PN.side?-.18:.18;let z,y,x=0,r;
  if(u<.25){const k=u/.25;z=.3*k;y=-.12*k;r=.3*k}else if(u<.5){const k=(u-.25)/.25,q=1-(1-k)*(1-k);z=.3-1.3*q;y=-.12+.2*q;x=sg*q;r=.3-.6*q}else{const k=(u-.5)/.5,q=k*k*(3-2*k);z=-1+1.5*q;y=.08-.55*q;x=sg*(1-q);r=-.3*(1-q)}
  f.position.set(bx+x,y,z);f.rotation.z=r;R_.visible=!!PN.side;GMS[0].L.visible=!PN.side;if(!PN.hit&&u>.42){PN.hit=1;punchHit()}}
 gm.position.z=-.7+(w.melee?0:kick);GMS.forEach((g,i)=>g.visible=i==wi&&(i||PN.t<PN.d));fl.position.z=-(w.mz||.4);fl.visible=!w.melee&&kick>.07;gm.visible=!ENT&&!FIT&&!GS&&!WH&&(F.on||cm==1);
 $('wp').textContent=w.n+(w.melee?'':' '+(rl>0?'RELOADING':ammo[wi]+' / '+RES[wi]))+'  [hold Q]'}
function wheelDraw(){const o=owned(),n=o.length;$('wh').innerHTML=o.map((g,k)=>{const a=k/n*6.2832,x=Math.sin(a)*130,y=-Math.cos(a)*130;return '<div class="ws'+(g==WS?' on':'')+'" data-i="'+g+'" style="left:'+x+'px;top:'+y+'px"><b>'+ico(g?'gun':'fist',26)+'</b>'+W[g].n+(W[g].melee?'':'<br><small>'+ammo[g]+' / '+RES[g]+'</small>')+'</div>'}).join('')}
function wheelOpen(){if(WH||CUT||PAUSED||P.dead||ENT||FIT||GS)return;WH=1;wx=wy=0;WS=wi;wheelDraw();$('wh').style.display='block'}
function wheelClose(pick){if(!WH)return;WH=0;$('wh').style.display='none';if(pick!==false){wi=WS;rl=0}}
const cyc=d=>{const o=owned();wi=o[(o.indexOf(wi)+d+o.length)%o.length];rl=0},pickN=n=>{const o=owned();if(o[n]){wi=o[n];rl=0}};
addEventListener('mousedown',e=>{if(e.button==0&&!CUT&&document.pointerLockElement){trig=1;shoot()}});addEventListener('mouseup',()=>trig=0);
addEventListener('wheel',e=>{if(!WH)cyc(e.deltaY>0?1:-1)});
addEventListener('keydown',e=>{if(e.repeat)return;if(e.code=='KeyQ')wheelOpen();if(/^Digit[1-9]$/.test(e.code))pickN(+e.code[5]-1);if(e.code=='KeyT')rl=(!W[wi].melee&&ammo[wi]<W[wi].mag&&RES[wi]>0)?1.2:0});
addEventListener('keyup',e=>{if(e.code=='KeyQ')wheelClose()});
$('wh').onpointerdown=e=>{const d=e.target.closest('.ws');if(d){WS=+d.dataset.i;wheelClose()}};
$('wb').onpointerdown=()=>{WH?wheelClose():wheelOpen()};
$('fb').onpointerdown=()=>{trig=1;shoot()};$('fb').onpointerup=$('fb').onpointerleave=()=>trig=0;
// ---- gun store UI ----
const nearStore=()=>false;
function shopView(){const row=i=>{const w=W[i];return '<div class="slot"><span><b>'+w.n+'</b><br>'+w.d+'<br>DMG '+w.dmg+' · '+w.mag+' rds'+(OWN[i]?' · own '+ammo[i]+'/'+RES[i]:'')+'</span>'+(OWN[i]?'<button data-a="ammo" data-i="'+i+'"'+(P.money<w.ap*2?' disabled':'')+'>+2 mags $'+w.ap*2+'</button>':'<button data-a="buy" data-i="'+i+'"'+(P.money<w.price?' disabled':'')+'>Buy $'+w.price+'</button>')+'</div>'};
 pm('<h2>JAKARTA ARMS</h2><div class="sm">Cash: $'+P.money+'</div>'+W.map((w,i)=>i?row(i):'').join('')+'<div class="sm" id="pmsg"></div><button data-a="leave">Leave store</button>')}
function openShop(){PAUSED=1;lastOpen=performance.now();if(au)au.suspend();if(document.exitPointerLock)document.exitPointerLock();$('pm').style.display='flex';onTitle=0;shopView()}
// ---- GTA-style enter / exit / carjack animations ----
const DR=human(0xc9a227,0xb07a56,0x111111);
const doorG=new T.Group(),doorM=new T.Mesh(new T.BoxGeometry(.07,.8,1.2),mat(0xd7263d));doorG.position.set(-1.03,1,.7);doorM.position.z=-.6;doorG.add(doorM);P.m.add(doorG);doorG.visible=false;
const sm_=x=>{x=cl(x,0,1);return x*x*(3-2*x)},lp_=(a,b,t)=>a+(b-a)*t;let FL=null;
function tgtCar(){let b=null,bd=4.5;tr.forEach(c=>{const d=H(c.x-F.x,c.z-F.z);if(d<bd){bd=d;b=c}});const dp=H(F.x-P.x,F.z-P.z);if(dp<5&&(!b||dp<=bd+.5))return[P,'own'];return b?[b,b.pk?'pk':'jack']:null}
function swapCar(c){const o={x:P.x,z:P.z,th:P.th},t=P.m;P.m=c.m;c.m=t;P.x=c.x;P.z=c.z;P.th=c.th;P.vx=P.vz=P.w=0;P.hp=100;
 c.home=[o.x,o.z,o.th];c.pk=1;c.dyn=0;c.x=o.x;c.z=o.z;c.th=o.th;c.vx=c.vz=0;c.m.visible=true;P.m.visible=true;P.m.add(doorG);doorG.position.set(-(P.m.hw+.03),P.m.by+.15,.7)}
function setCar(model,base,dmg,fuel){sc.remove(P.m);const n=car(base,0,model||'sedan');n.fuel=fuel==null?100:fuel;P.m=n;n.add(doorG);doorG.position.set(-(n.hw+.03),n.by+.15,.7);dent(n,dmg||0)}
function toggleCar(){if(CUT||P.dead||ENT||PAUSED||FIT||GS)return;if(F.on&&cloAct())return;if(F.on&&gunAct())return;if(F.on&&bankAct())return;if(F.on&&nearStore()){openShop();return}
 if(F.on){const t=tgtCar();if(!t){say('','No car nearby.',1500);return}const c=t[0],mode=c===P||c.pk?'in':'take';if(c!==P)swapCar(c);if(c!==P&&mode=='in'){STAT.parked++;say('','Got into a '+P.m.model+(P.m.model=='supercar'||P.m.model=='luxury'?' — rare find!':'')+'.',2800)}
  ENT={m:mode,t:0,dur:mode=='take'?1.8:1.3,sx:F.x,sz:F.z,yaw:F.yaw,pit:F.pit};F.on=0;F.vx=F.vz=0;
  if(mode=='take'){STAT.carjacks++;P.heat=Math.max(P.heat,1.2);say('','Carjacked a '+P.m.model+'! Someone called the cops.',3000)}}
 else{if(H(P.vx,P.vz)>5){say('','Stop the car first (S / Space).',1800);return}const fx=SN(P.th),fz=CS(P.th);ENT={m:'out',t:0,dur:1.2,sx:P.x-fz*2.6,sz:P.z+fx*2.6,yaw:P.th,pit:0}}
 doorM.material.color.set(P.m.base)}
function entTick(dt){
 if(FL){FL.t+=dt;DR.position.x+=FL.dx*dt*5.5;DR.position.z+=FL.dz*dt*5.5;DR.position.y=Math.abs(SN(FL.t*14))*.15;if(FL.t>4){DR.visible=false;FL=null}}
 if(!ENT){doorG.visible=false;if(RK.visible&&!CUT&&!FIT&&!GS)RK.visible=false;return}
 const e=ENT,tk=e.m=='take',ou=e.m=='out';e.t+=dt;const u=Math.min(1,e.t/e.dur),fx=SN(P.th),fz=CS(P.th),rx=-fz,rz=fx;
 const D=[P.x+rx*1.9+fx*.4,P.z+rz*1.9+fz*.4],S=[P.x+rx*.5+fx*.2,P.z+rz*.5+fz*.2];let a,b,o1,o2;doorG.visible=true;
 if(!ou){a=sm_(u/(tk?.35:.42));b=sm_((u-(tk?.55:.45))/.35);RK.position.set(lp_(lp_(e.sx,D[0],a),S[0],b),Math.abs(SN(u*30))*.05*(1-b),lp_(lp_(e.sz,D[1],a),S[1],b));
  RK.scale.setScalar(1-.55*b);RK.visible=u<.85;RK.rotation.y=Math.atan2(S[0]-RK.position.x,S[1]-RK.position.z);o1=sm_((u-(tk?.28:.3))/.15);o2=sm_((u-.75)/.2);
  if(tk){const p=sm_((u-.3)/.3);DR.visible=true;DR.position.set(lp_(S[0],D[0]+rx*1.2,p),0,lp_(S[1],D[1]+rz*1.2,p));DR.rotation.set(0,Math.atan2(rx,rz),-1.1*Math.sin(p*3.14))}}
 else{a=sm_((u-.15)/.35);b=sm_((u-.5)/.5);RK.position.set(lp_(lp_(S[0],D[0],a),e.sx,b),Math.abs(SN(u*30))*.05*b,lp_(lp_(S[1],D[1],a),e.sz,b));RK.scale.setScalar(.45+.55*a);RK.visible=true;RK.rotation.y=Math.atan2(rx,rz);o1=sm_((u-.1)/.15);o2=sm_((u-.6)/.2)}
 doorG.rotation.y=1.1*o1*(1-o2);if(u>=1)endEnt()}
function endEnt(){const e=ENT,fx=SN(P.th),fz=CS(P.th);ENT=null;RK.visible=false;doorG.visible=false;RK.scale.setScalar(1);
 if(e.m=='out'){F.on=1;F.x=e.sx;F.z=e.sz;F.yaw=P.th;F.pit=0;F.vx=F.vz=0}
 else{cm=0;F.hy=F.hp=0;if(e.m=='take'){DR.rotation.set(0,Math.atan2(-fz,fx),0);FL={t:0,dx:-fz,dz:fx}}}}
function entCam(){const e=ENT,u=Math.min(1,e.t/e.dur),s=sm_(u),k=e.m=='out'?1-s:s,fx=SN(P.th),fz=CS(P.th),rx=-fz,rz=fx,sn=Math.sin(Math.PI*k);
 const cx=P.x-fx*10.5,cz=P.z-fz*10.5,bl=sn*4,mm=sn*.7,yw=e.yaw,pt=e.pit;
 const l0=[e.sx+SN(yw)*CS(pt)*5,1.7+SN(pt)*5,e.sz+CS(yw)*CS(pt)*5],l1=[P.x+fx*6,1.5,P.z+fz*6],l2=[P.x+rx*1.2,1.1,P.z+rz*1.2];
 const L=i=>lp_(lp_(l0[i],l1[i],k),l2[i],mm);
 return[lp_(e.sx,cx,k)+rx*bl,lp_(1.7,4.6,k)+sn*.6,lp_(e.sz,cz,k)+rz*bl,L(0),L(1),L(2)]}
$('eb').onpointerdown=toggleCar;

// ================= MENU / SAVES / SETTINGS / STATS =================
const IC={
 gun:'<rect x="2" y="6" width="17" height="4.4" rx="1"/><path d="M4.6 10.4h5l-1.2 8.4H4z"/><path d="M10.2 10.4v2.3a2 2 0 0 0 2 2h1.3" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="18" y="4.6" width="2.6" height="1.6"/>',
 fist:'<rect x="4.5" y="10" width="14" height="9" rx="3"/><circle cx="7" cy="9" r="2.2"/><circle cx="10.6" cy="8" r="2.2"/><circle cx="14.2" cy="8" r="2.2"/><circle cx="17.5" cy="9.4" r="2"/><path d="M4.5 13l-2.2 1.8a1.6 1.6 0 0 0 2 2.5L6 16z"/>',
 wheel:'<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.3"/><circle cx="18.2" cy="12" r="1.7"/><circle cx="15.1" cy="17.4" r="1.7"/><circle cx="8.9" cy="17.4" r="1.7"/><circle cx="5.8" cy="12" r="1.7"/><circle cx="8.9" cy="6.6" r="1.7"/><circle cx="15.1" cy="6.6" r="1.7"/>',
 pump:'<rect x="4" y="3" width="10" height="17" rx="1.8"/><rect x="6.2" y="5.4" width="5.6" height="4.4" rx=".8" fill="#000" fill-opacity=".55"/><path d="M14 8.5h2.2a1.6 1.6 0 0 1 1.6 1.6v6.2a1.7 1.7 0 0 0 3.4 0V8.6l-2.7-2.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="2.5" y="20" width="13" height="2" rx="1"/>',
 bolt:'<path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6z"/>',
 play:'<path d="M6 4l14 8-14 8z"/>',
 back:'<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
 x:'<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
 save:'<path d="M5 3h11l3.5 3.5V21H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 3v5.5h7V3M8 21v-7h8v7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
 folder:'<path d="M3 6.5h6l2 2.5h10V19H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
 gear:'<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5l1.8 2.9 3.3-.8.8 3.3 2.9 1.8-1.5 3 1.5 3-2.9 1.8-.8 3.3-3.3-.8L12 21.5l-1.8-2.9-3.3.8-.8-3.3-2.9-1.8 1.5-3-1.5-3 2.9-1.8.8-3.3 3.3.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
 stats:'<rect x="4" y="12" width="4" height="8" rx="1"/><rect x="10" y="5" width="4" height="15" rx="1"/><rect x="16" y="9" width="4" height="11" rx="1"/>',
 power:'<path d="M7.4 6.6a7.8 7.8 0 1 0 9.2 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M12 3v8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
 menu:'<path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
 cloud:'<path d="M7 18.5h10.2a4 4 0 0 0 .6-7.9A6 6 0 0 0 6.2 11.6 3.5 3.5 0 0 0 7 18.5z"/>'};
function ico(n,z){return'<svg viewBox="0 0 24 24" width="'+z+'" height="'+z+'" fill="currentColor" style="vertical-align:-.2em;display:inline-block">'+IC[n]+'</svg>'}
const STAT={deaths:0,busts:0,carjacks:0,parked:0,wrecked:0,copsDown:0,shots:0,deliveries:0,driveM:0,walkM:0,playS:0,maxStars:0,refuels:0,spent:0,models:{},robberies:0,loot:0};
let SEN=1,GFX=2,LQ=null,lastOpen=0,onTitle=1,DBc=null,UID=null,EMAIL='';
const GQ=[{n:'Low',pr:.5,fog:260,dec:0},{n:'Medium',pr:.75,fog:420,dec:1},{n:'High',pr:1,fog:640,dec:1},{n:'Ultra',pr:1.5,fog:900,dec:1}];
function trk(dt){STAT.playS+=dt;if(!F.on&&!ENT)STAT.models[P.m.model]=1;const q=F.on?F:P;if(LQ){const d=H(q.x-LQ[0],q.z-LQ[1]);if(d<15){if(F.on)STAT.walkM+=d;else STAT.driveM+=d}}LQ=[q.x,q.z];STAT.maxStars=Math.max(STAT.maxStars,Math.min(5,Math.ceil(P.heat)))}
function applyGfx(i){GFX=i;const q=GQ[i];ren.setPixelRatio(Math.min(devicePixelRatio*q.pr,2.5));ren.setSize(innerWidth,innerHeight,false);sc.fog.far=q.fog;DEC.forEach((m,j)=>m.visible=j<2||!!q.dec)}
try{const o=JSON.parse(localStorage.getItem('jp_set')||'{}');if(o.g!=null)GFX=o.g;if(o.s)SEN=o.s}catch(e){}
applyGfx(GFX);const saveSet=()=>{try{localStorage.setItem('jp_set',JSON.stringify({g:GFX,s:SEN}))}catch(e){}};
(async()=>{try{if(!window.claude)return;const u=await claude.use('user'),d=await claude.use('db');if(u&&d){const me=await u.me();UID=me.id||await u.id();EMAIL=me.email||me.name||'';if(UID)DBc=d.collection('data/users/'+UID+'/saves')}}catch(e){}acct()})();
const acctTxt=()=>DBc?ico('cloud',14)+' Signed in'+(EMAIL?' as '+EMAIL.replace(/</g,'&lt;'):'')+' — saves are stored on your account':ico('save',14)+' Not signed in — saves stay in this browser only';
function acct(){const a=$('acct');if(a)a.innerHTML=acctTxt()}acct();
const SL=[['auto','Auto (Save & Quit)'],['slot1','Slot 1'],['slot2','Slot 2'],['slot3','Slot 3']];
const stName=()=>stage>=FIN?'Free roam':ST[stage].t,fmtT=t=>Math.floor(t/3600)+'h '+Math.floor(t%3600/60)+'m';
function snap(){return{v:1,t:Date.now(),stage,sq:SQ,stat:STAT,el,wi,ammo,own:OWN,res:RES,outf:OUTF,ownc:OWNC,tg,RH,CP,cm,gfx:GFX,F:{on:F.on,x:F.x,z:F.z,yaw:F.yaw,pit:F.pit},P:{x:P.x,z:P.z,th:P.th,hp:P.hp,money:P.money,heat:P.heat,base:P.m.base,dmg:P.m.dmg,model:P.m.model,fuel:P.m.fuel}}}
function loadSnap(d){ENT=null;FL=null;RK.visible=DR.visible=false;police.forEach(p=>sc.remove(p.m));police=[];Object.assign(STAT,d.stat);stage=d.stage;DAWN=stage>=FIN?1:0;el=d.el;RH=d.RH;CP=d.CP;if(d.outf){OUTF=d.outf;OWNC=d.ownc||OWNC;applyOutfit(OUTF)}if(d.own){OWN=d.own;RES=d.res;ammo=d.ammo;wi=d.wi}else{OWN=[1,1,0,0,0,0,0,0,0,0];RES=W.map(w=>w.res0||0);ammo=W.map(w=>w.mag);wi=1}tg=d.tg;cm=d.cm;SQ=d.sq?JSON.parse(JSON.stringify(d.sq)):sqNew();PEND=null;
 P.x=d.P.x;P.z=d.P.z;P.th=d.P.th;P.vx=P.vz=P.w=P.vy=P.y=0;P.hp=d.P.hp;P.money=d.P.money;P.heat=d.P.heat;P.dead=0;P.bust=0;setCar(d.P.model,d.P.base,d.P.dmg,d.P.fuel);
 F.on=d.F.on;F.x=d.F.x;F.z=d.F.z;F.yaw=d.F.yaw;F.pit=d.F.pit;F.vx=F.vz=0;F.hy=F.hp=0;LQ=null;$('ov').style.display='none';mk.position.set(TG[tg][1],35,TG[tg][2]);applyGfx(d.gfx!=null?d.gfx:GFX)}
const locGet=()=>{try{return JSON.parse(localStorage.getItem('jp_saves')||'{}')}catch(e){return{}}},locPut=o=>{try{localStorage.setItem('jp_saves',JSON.stringify(o))}catch(e){}};
async function listSaves(){const out={};if(DBc){try{(await DBc.get()).docs.forEach(x=>out[x.id]=x.data())}catch(e){}}else Object.assign(out,locGet());return SL.map(x=>out[x[0]]||null)}
async function putSave(id,d){const rec={snap:JSON.stringify(d),t:d.t,label:stName()+' · $'+d.P.money+' · '+fmtT(d.stat.playS)};if(DBc){try{await DBc.doc(id).set(rec);return 'account'}catch(e){}}const o=locGet();o[id]=rec;locPut(o);return 'browser'}
async function delSave(id){if(DBc){try{await DBc.doc(id).delete()}catch(e){}}else{const o=locGet();delete o[id];locPut(o)}}
const pm=h=>{$('pmb').innerHTML=h},msg=t=>{const m=$('pmsg');if(m)m.textContent=t};
function menuMain(){pm('<h2>PAUSED</h2><div class="sm">'+acctTxt()+'</div><button data-a="res">'+ico('play',18)+' Resume</button><button data-a="msave">'+ico('save',18)+' Save Game</button><button data-a="mload">'+ico('folder',18)+' Load Game</button><button data-a="sq">★ Side Quests</button><button data-a="set">'+ico('gear',18)+' Settings</button><button data-a="stat">'+ico('stats',18)+' Stats</button><button data-a="quit">'+ico('power',18)+' Save &amp; Quit</button><div class="sm" id="pmsg"></div>')}
async function slotsView(mode){pm('<h2>'+(mode=='save'?'SAVE GAME':'LOAD GAME')+'</h2><div class="sm">'+acctTxt()+'</div><div id="sl">Loading…</div><div class="sm" id="pmsg"></div><button data-a="back">'+ico('back',16)+' Back</button>');const L=await listSaves();
 $('sl').innerHTML=SL.map((x,i)=>{if(mode=='save'&&i==0)return'';const d=L[i];return '<div class="slot"><b>'+x[1]+'</b><span>'+(d?d.label+'<br>'+new Date(d.t).toLocaleString():'Empty')+'</span><button data-a="'+(mode=='save'?'dosave':'doload')+'" data-i="'+i+'"'+(mode=='load'&&!d?' disabled':'')+'>'+(mode=='save'?'Save':'Load')+'</button>'+(d?'<button data-a="del" data-i="'+i+'">'+ico('x',14)+'</button>':'')+'</div>'}).join('')}
function setView(){pm('<h2>SETTINGS</h2><div class="sm">Graphics intensity</div>'+GQ.map((q,i)=>'<button data-a="gfx" data-i="'+i+'"'+(i==GFX?' class="on"':'')+'>'+q.n+'</button>').join('')+'<div class="sm">Low also hides windows, doors and street lamps and turns sun shadows off. Mouse sensitivity</div><input type="range" id="sens" min="0.3" max="2.5" step="0.1" value="'+SEN+'"><div class="sm">Google Maps API key. The city map uses Google imagery when this key is accepted. Leave it empty for the live Jakarta street map.</div><input id="gkey" placeholder="AIza..." autocomplete="off" spellcheck="false"><button data-a="gkey">Save map key</button><button data-a="back">'+ico('back',16)+' Back</button>');$('sens').oninput=e=>{SEN=+e.target.value;saveSet()};const gk=$('gkey');if(gk)gk.value=GKEY}
function statView(){const r=(a,b)=>'<div class="row"><span>'+a+'</span><b>'+b+'</b></div>',S=STAT;pm('<h2>STATS</h2>'+r('Deaths',S.deaths)+r('Times busted',S.busts)+r('Carjacks',S.carjacks)+r('Parked cars entered',S.parked)+r('Vehicles wrecked',S.wrecked)+r('Police cars destroyed',S.copsDown)+r('Shots fired',S.shots)+r('Guns owned',OWN.filter(Boolean).length-1)+r('Pedestrians down',S.peds|0)+r('Banks robbed',S.robberies+' · $'+S.loot)+r('Car models driven',Object.keys(S.models).length+' / 10')+r('Refuels / spent',S.refuels+' · $'+S.spent)+r('Deliveries (free roam)',S.deliveries)+r('Distance driven',(S.driveM/1000).toFixed(2)+' km')+r('Distance on foot',(S.walkM/1000).toFixed(2)+' km')+r('Highest wanted level','★'.repeat(S.maxStars)||'—')+r('Story progress',Math.min(stage,FIN)+' / '+FIN)+r('Play time',fmtT(S.playS))+'<button data-a="back">'+ico('back',16)+' Back</button>')}
function openMenu(){if(PAUSED||CUT||FIT||GS)return;PAUSED=1;lastOpen=performance.now();if(au)au.suspend();if(document.exitPointerLock)document.exitPointerLock();$('pm').style.display='flex';onTitle=0;menuMain()}
function closeMenu(){PAUSED=0;$('pm').style.display='none';if(au)au.resume();if(!('ontouchstart'in window))try{cv_.requestPointerLock()}catch(e){}}
function begin(){onTitle=0;$('pm').style.display='none';$('ttl').style.display='none';ia();try{if(!('ontouchstart'in window))cv_.requestPointerLock()}catch(e){}}
$('bn').onclick=()=>{P.money=Math.max(P.money,1000);P.m.fuel=100;begin();startCut('intro')};
$('bl').onclick=()=>{$('pm').style.display='flex';onTitle=1;slotsView('load')};
addEventListener('contextmenu',e=>e.preventDefault());addEventListener('selectstart',e=>e.preventDefault());addEventListener('dragstart',e=>e.preventDefault());$('mb').onclick=openMenu;$('mb').innerHTML=ico('menu',22);$('wb').innerHTML=ico('wheel',32);$('fb').innerHTML=ico('gun',32);$('bn').innerHTML=ico('play',20)+' New Game';$('bl').innerHTML=ico('folder',20)+' Load Game';if($('bmap'))$('bmap').innerHTML='City Map';
// ---- bank robbery logic ----
BNK.forEach(b=>{b.staff=[[14.5,-3],[14.5,3],[9,7.5]].map((p,i)=>{const h=human(i<2?0x003d79:0x555555,0xc58c5a,0x151515),w=b.L(p[0],p[1]);h.visible=true;h.position.set(w[0],.1,w[1]);h.rotation.y=Math.atan2(-Math.cos(b.th),Math.sin(b.th));return h})});
const bloc=(b,x,z)=>{const c=Math.cos(b.th),sn=Math.sin(b.th),dx=x-b.ox,dz=z-b.oz;return[dx*c-dz*sn,dx*sn+dz*c]};
function insideBank(b){const[lx,lz]=bloc(b,F.x,F.z);return(lx>6.4&&lx<21.6&&Math.abs(lz)<9.6)||(lx>=21.6&&lx<31&&Math.abs(lz)<5)||(lx>26&&lx<29.6&&lz>=5&&lz<18.5)}
function nearVault(b){const[lx,lz]=bloc(b,F.x,F.z);return lx>17.2&&lx<21.2&&Math.abs(lz)<2.8}
const inBank=()=>BNK.find(insideBank);
function bankPrompt(){const b=inBank();if(!b||ROB)return'';if(b.cool>0)return'Bank Mandiri — the vault is empty';if(nearVault(b))return wi>0?'[E] Open the vault':'Equip a gun to open the vault';return'The vault is at the back of the bank'}
function bankAct(){const b=inBank();if(!b||ROB||!nearVault(b))return false;if(b.cool>0||wi==0){say('',b.cool>0?'The vault is empty. Come back later.':'You need a gun to open the vault.',2200);return true}
 ROB={b,t:0,al:-1,loot:0};b.vopen=1;HOT=0;STAT.robberies++;P.heat=Math.max(P.heat,3);b.staff.forEach(h=>h.scale.y=.7);say('Raka','Open it up! Everybody down!',3000);return true}
function resetVault(b){b.vopen=0;b.stacks.forEach(s=>{s.alive=true;s.g.visible=true});if(!b.dcOn){b.dc.forEach(o=>C.push(o));b.dcOn=1}}
function endRob(ok){const b=ROB&&ROB.b;if(b){b.staff.forEach(h=>h.scale.y=1);b.light.visible=false;b.cool=900}ROB=null;if(!ok)say('','Robbery over.',2000)}
function tone(f,d,g){if(!au)return;const t=au.currentTime,o=au.createOscillator(),v=au.createGain();o.type='triangle';o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*1.6,t+d);v.gain.setValueAtTime(g,t);v.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(v);v.connect(au.destination);o.start();o.stop(t+d+.02)}
function alarmBeep(){if(!au)return;const t=au.currentTime,o=au.createOscillator(),g=au.createGain();o.type='square';o.frequency.setValueAtTime(900,t);o.frequency.linearRampToValueAtTime(650,t+.25);g.gain.setValueAtTime(.04,t);g.gain.exponentialRampToValueAtTime(.001,t+.28);o.connect(g);g.connect(au.destination);o.start();o.stop(t+.3)}
function robTick(dt){const rb=$('rob');
 BNK.forEach(b=>{if(b.cool>0&&(b.cool-=dt)<=0)resetVault(b);b.vp+=((b.vopen?1:0)-b.vp)*Math.min(1,dt*2.2);b.vd.position.z=-4.8*b.vp;
  if(b.vp>.5&&b.dcOn){b.dc.forEach(o=>{const i=C.indexOf(o);if(i>=0)C.splice(i,1)});b.dcOn=0}
  const show=!b.vopen&&b.cool<=0;b.key.visible=b.ring.visible=show;if(show){b.key.position.y=1.9+Math.sin(Date.now()/300)*.12;b.ring.rotation.z+=dt}});
 if(hotT>0)hotT-=dt;
 if(!ROB){rb.style.display='none';return}
 if(P.dead||!F.on||ENT){endRob(0);return}
 const b=ROB.b;ROB.t+=dt;b.light.visible=((ROB.t*3)|0)%2==0;const al=(ROB.t*1.6)|0;if(al!=ROB.al){ROB.al=al;alarmBeep()}
 if(b.vp>.6)b.stacks.forEach(s=>{if(s.alive&&H(F.x-s.x,F.z-s.z)<1.7){s.alive=false;s.g.visible=false;P.money+=s.v;STAT.loot+=s.v;ROB.loot+=s.v;HOT+=s.v;hotT=90;tone(700,.12,.08)}});
 rb.style.display='block';rb.textContent='VAULT · $'+ROB.loot+' taken · '+b.stacks.filter(s=>s.alive).length+' piles left · escape through the vault tunnel';
 if(!insideBank(b)){const back=bloc(b,F.x,F.z)[1]>=15,l=ROB.loot;P.heat=back?Math.max(1,P.heat-1.2):Math.max(P.heat,4);endRob(1);say('',back?'$'+l+' stolen! You slipped out the back — fewer cops on you.':'$'+l+' stolen! Out the front door — cops everywhere!',5000)}}
$('pmb').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const a=b.dataset.a,i=+b.dataset.i;
 if(a=='buy'){const w=W[i];if(P.money>=w.price&&!OWN[i]){P.money-=w.price;OWN[i]=1;RES[i]+=w.mag*2;wi=i;shopView();msg('Purchased '+w.n+'.')}}else if(a=='ammo'){const w=W[i];if(P.money>=w.ap*2){P.money-=w.ap*2;RES[i]+=w.mag*2;shopView();msg('Bought ammo for '+w.n+'.')}}else if(a=='leave')closeMenu();else if(a=='res')closeMenu();else if(a=='msave')slotsView('save');else if(a=='mload'){onTitle=0;slotsView('load')}else if(a=='set')setView();else if(a=='stat')statView();
 else if(a=='sq')sqView();else if(a=='sqgo')sqGo(i);else if(a=='sqc')sqPick(i);else if(a=='back'){if(onTitle)$('pm').style.display='none';else menuMain()}
 else if(a=='gkey'){saveGKey(($('gkey')&&$('gkey').value)||'');msg(GKEY?'Key saved. The map switches to Google if the key is valid.':'Key cleared. The live Jakarta map stays on.');}else if(a=='gfx'){applyGfx(i);saveSet();setView()}
 else if(a=='dosave'){if(P.dead||ENT){msg('Cannot save right now.');return}const w=await putSave(SL[i][0],snap());msg('Saved to '+w+' ✓');slotsView('save')}
 else if(a=='del'){await delSave(SL[i][0]);slotsView(b.parentNode.querySelector('[data-a=dosave]')?'save':'load')}
 else if(a=='doload'){const L=await listSaves();if(!L[i])return;loadSnap(JSON.parse(L[i].snap));if(onTitle){CUT=null;document.body.classList.remove('cut');begin()}else closeMenu();say('','Game loaded.',2500)}
 else if(a=='quit'){if(P.dead||ENT){msg('Cannot save right now.');return}msg('Saving…');const w=await putSave('auto',snap());msg('Saved to '+w+'. Closing session…');setTimeout(()=>location.reload(),600)}};
addEventListener('keydown',e=>{if(e.code=='Escape'&&!CUT){if(FIT){if(FIT.ph=='f')endFit();return}if(GS){if(GS.ph=='shop')endShop();return}if(!PAUSED)openMenu();else if(performance.now()-lastOpen>300)closeMenu()}});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&!CUT&&!PAUSED&&!onTitle&&!FIT&&!GS)openMenu()});

requestAnimationFrame(frame);
// ===== GRAPHICS UPGRADE (part 2): day/night grading, shadow flags for instanced props, vignette, safety net =====
function gxRefl(){if(!GX.vref)return;const on=GFX>=2;
 if(on&&!GX.cubeRT&&!GX.cubeFail){try{GX.cubeRT=new T.WebGLCubeRenderTarget(128,{format:T.RGBAFormat,generateMipmaps:true,minFilter:T.LinearMipmapLinearFilter});GX.cubeCam=new T.CubeCamera(.5,420,GX.cubeRT);sc.add(GX.cubeCam);GX.cf=0;GX.ct=0}catch(e){GX.cubeFail=1}}
 const want=on&&GX.cubeRT&&GX.cubeReady&&!GX.cubeFail?GX.cubeRT.texture:GX.ENVT;
 if(GX.vEnvCur!==want){GX.vref.forEach(m=>{m.envMap=want;m.needsUpdate=true});GX.vEnvCur=want}
 if(!on||!GX.cubeRT||GX.cubeFail)return;GX.ct++;if(GFX<3&&GX.ct%3)return;
 const cc=GX.cubeCam;cc.position.set(cam.position.x,Math.max(1.2,cam.position.y),cam.position.z);cc.updateMatrixWorld(true);
 const f=GX.cf;GX.cf=(f+1)%6;const prev=ren.getRenderTarget(),au=ren.shadowMap.autoUpdate,pv=P.m.visible;ren.shadowMap.autoUpdate=false;P.m.visible=false;
 try{GX.cubeRT.texture.generateMipmaps=f==5;ren.setRenderTarget(GX.cubeRT,f);ren.render(sc,cc.children[f])}catch(e){GX.cubeFail=1}
 ren.setRenderTarget(prev);ren.shadowMap.autoUpdate=au;P.m.visible=pv;if(f==5)GX.cubeReady=1}
function gxSpin(){gxRefl();const now=performance.now(),dt=Math.min(.05,(now-(GX.lt||now))/1000);GX.lt=now;
 const st=(!F.on&&!ENT)?((k.has('KeyA')||k.has('ArrowLeft')?1:0)-(k.has('KeyD')||k.has('ArrowRight')?1:0))*.45:0;GX.steer=(GX.steer||0)+(st-(GX.steer||0))*Math.min(1,dt*8);
 const spin=o=>{const g=o&&o.m;if(!g||!g.wh||!g.visible)return;if(g.det)g.det.visible=Math.hypot((o.x||0)-cam.position.x,(o.z||0)-cam.position.z)<75;const f=(o.vx||0)*Math.sin(o.th||0)+(o.vz||0)*Math.cos(o.th||0),da=f*dt/(g.wr||.4);for(const w of g.wh)w.s.rotation.x+=da;
  const sa=o===P?GX.steer:0;g.wh[0].w.rotation.y=g.wh[1].w.rotation.y=sa};
 spin(P);tr.forEach(spin);police.forEach(spin)}
function gxEnv(){const k=cl(((17*60+30+el*.5)-1050)/150,0,1),d=DAWN>0?DAWN:0,nt=k*(1-d);
 const zn=new T.Color(0x5a82c4).lerp(new T.Color(0x040719),k);if(d>0)zn.lerp(new T.Color(0x7aa8e0),d);
 GX.uT.value=performance.now()/1000;const U=SKY.material.uniforms;U.hz.value.copy(sc.background);U.zn.value.copy(zn);U.nt.value=nt;
 GX.bm.forEach(m=>{m.emissiveIntensity=nt*1.15});(GX.nl||[]).forEach(q=>{q[0].emissiveIntensity=nt*q[1]});(GX.an||[]).forEach(fn=>fn(el));gxSpin();const ei=1-.78*nt;GX.paint.forEach(m=>{m.envMapIntensity=ei});
 sun.intensity*=1.25;ren.toneMappingExposure=.9+.35*nt}
{const _env=env;env=function(){_env();gxEnv()}}
{const _ag=applyGfx;applyGfx=function(i){_ag(i);gxShadow(i)}}
gxShadow(GFX);
sc.children.forEach(o=>{if(!o.isInstancedMesh)return;o.receiveShadow=true;const g=o.geometry,t=g.type,p=g.parameters||{};
 if(o.userData.cast||t=='ConeGeometry'||t=='CylinderGeometry'||(t=='BoxGeometry'&&((p.width==1&&p.height==1&&p.depth==1)||(p.width<.3&&p.height>5))))o.castShadow=true});
{const v=document.createElement('div');v.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:0;user-select:none;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 58%,rgba(0,0,0,.3) 100%)';const c=$('c');c.parentNode.insertBefore(v,c.nextSibling)}
// safety net: if the surface-grain shader ever fails to compile on a device, fall back to plain PBR materials
{const _ce=console.error;let tripped=false;console.error=function(){if(!tripped&&/WebGLProgram|WebGLShader/.test(String(arguments[0]))){tripped=true;GX.safe=true;
 sc.traverse(o=>{[].concat(o.material||[]).forEach(x=>{if(x.onBeforeCompile===GRAIN||x.onBeforeCompile===GRAINT||x.onBeforeCompile===WAVE){x.onBeforeCompile=NOP;x.needsUpdate=true}})})}return _ce.apply(console,arguments)}}

window.__controlsTest={getYaw:function(){return P.th},getSpeed:function(){return Math.hypot(P.vx,P.vz)},setKeys:function(codes){k.clear();(codes||[]).forEach(function(c){k.add(c)});try{ia()}catch(e){}}};
if(/[?&]qa=1/.test(location.search)){onTitle=0;CUT=null;document.body.classList.remove('cut');var ttl=$('ttl');if(ttl)ttl.style.display='none';P.m.fuel=100;P.dead=0;PAUSED=0;}

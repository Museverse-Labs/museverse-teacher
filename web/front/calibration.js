

(function(){
'use strict';
var Q = new URLSearchParams(location.search);
var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
var LITE = Q.get('q') === 'lite';


function clamp(x,a,b){return Math.min(b,Math.max(a,x));}
function sstep(a,b,x){x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x);}
function eio(x){x=clamp(x,0,1);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;}
function lerp(a,b,k){return a+(b-a)*k;}
function hash(n){var s=Math.sin(n*12.9898+4.1)*43758.5453;return s-Math.floor(s);}


var canvas = document.getElementById('gl'), frame = document.getElementById('frame');
if (!window.THREE) { window.MVCalib = {failed: 'three.js did not load'}; return; }
var renderer;
try { renderer = new THREE.WebGLRenderer({canvas:canvas, antialias:false, alpha:true, premultipliedAlpha:true, powerPreference:'low-power'}); }
catch (e) { window.MVCalib = {failed: String(e && e.message || e)}; return; }      
var PR = LITE ? 1 : Math.min(window.devicePixelRatio||1, 2);
renderer.setPixelRatio(PR);
renderer.setClearColor(0x000000, 1);              
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(54, 16/9, 0.05, 40);


scene.add(new THREE.AmbientLight(0xffe9d6, .3));
var key = new THREE.DirectionalLight(0xffeedd, .3); key.position.set(-1,3,-2); scene.add(key);
var scanLight = new THREE.PointLight(0xe9d5ff, 0, 2.2, 1.6); scene.add(scanLight);


var RIG_POS = new THREE.Vector3(3.244, -0.22, 0);
var KC = new THREE.Vector3(0, 0.728, -0.274);
var KTOP = 0.74;
var HALF = 0.60;

var real = new THREE.Group(), holoPivot = new THREE.Group(), holoRig = new THREE.Group();
scene.add(real); scene.add(holoPivot); holoPivot.add(holoRig);


var U = { uScan:{value:-1}, uWave:{value:-1}, uAlpha:{value:1}, uR:{value:0}, uTime:{value:0}, uC:{value:new THREE.Vector3(0,0,0)} };
var VS_LOCAL = 'varying vec3 vL;varying vec3 vN;varying vec3 vV;void main(){vL=vec3(-position.x,position.y,position.z)*.001;vN=normalMatrix*normal;vec4 mv=modelViewMatrix*vec4(position,1.);vV=mv.xyz;gl_Position=projectionMatrix*mv;}';
var GRAD = 'vec3 grad(float w){return mix(vec3(.75,.52,.99),vec3(.96,.45,.71),w);}';

function lineMat(){return new THREE.ShaderMaterial({uniforms:U, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  vertexShader:VS_LOCAL, fragmentShader:'uniform float uScan,uWave,uAlpha;varying vec3 vL;'+GRAD+
  'uniform float uR;uniform vec3 uC;'+
  'void main(){float d=uScan-vL.x;float vis=smoothstep(0.,.015,d)*(1.-smoothstep(uR-.18,uR,length(vec2(vL.x-uC.x,vL.z-uC.z))));float band=exp(-d*d/.0006)*step(-.03,d);'+
  'float w=(vL.x+.6)/1.2;float fw=1.-smoothstep(uWave-.12,uWave,w);float fr=exp(-pow((w-uWave+.03)/.04,2.));'+
  'vec3 c=vec3(.93,.95,1.);c=mix(c,grad(w)*1.05+.3,fw*.7);c+=band*1.4+fr*1.3;gl_FragColor=vec4(c,vis*uAlpha);}'});}
function fillMat(){return new THREE.ShaderMaterial({uniforms:U, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2,
  vertexShader:VS_LOCAL, fragmentShader:'uniform float uWave,uAlpha,uR;uniform vec3 uC;varying vec3 vL;'+GRAD+
  'void main(){float rv=1.-smoothstep(uR-.18,uR,length(vec2(vL.x-uC.x,vL.z-uC.z)));float w=(vL.x+.6)/1.2;float fw=1.-smoothstep(uWave-.12,uWave,w);float fr=exp(-pow((w-uWave+.03)/.05,2.));'+
  'float a=(fw*.2+fr*.45)*rv;gl_FragColor=vec4(grad(w)*1.1+fr*.5,a*uAlpha);}'});}


function build(gltf){
  var src = gltf.scene, realScene = src, holoScene = src.clone(true);
  realScene.traverse(function(o){
    if(!o.isMesh) return;
    var n = o.name;
    if(n==='Piano_Glow' || n==='Piano_Chrome'){ o.visible=false; return; }      
    if(n==='flat_keys') o.material = new THREE.MeshStandardMaterial({color:0x141414, roughness:.35});
    else o.material = new THREE.MeshStandardMaterial({color:0x3b3937, roughness:.6});       
  });
  realScene.scale.setScalar(.001); realScene.position.copy(RIG_POS); real.add(realScene);
  holoScene.traverse(function(o){
    if(!o.isMesh) return;
    var n=o.name;
    if(n==='Piano_Glow' || n==='Piano_Chrome'){ o.visible=false; return; }
    o.material = fillMat(); o.add(new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), lineMat()));
  });
  holoScene.scale.setScalar(.001);
  holoRig.add(holoScene);
  holoRig.position.copy(RIG_POS).sub(KC);
  holoPivot.position.copy(KC);
  var kb = new THREE.Box3(), fk = new THREE.Box3(); realScene.updateMatrixWorld(true);
  realScene.traverse(function(o){ if(o.isMesh && o.name==='paino_keys') kb.expandByObject(o); if(o.isMesh && o.name==='flat_keys') fk.expandByObject(o); });
  var kc = kb.getCenter(new THREE.Vector3());
  U.uC.value.set(0, 0, kc.z + 0.1);
  
  KEYS = {pitch:(kb.max.x-kb.min.x)/52, c4:kb.max.x-23.5*(kb.max.x-kb.min.x)/52, wTop:kb.max.y, wFront:kb.min.z, back:kb.max.z,
          bTop:fk.max.y, bFront:fk.min.z, bBack:fk.max.z};
  ready();
  ghostInit();
}


var CORN = [new THREE.Vector3(-HALF-.012,0.012,-.088),new THREE.Vector3(HALF+.012,0.012,-.088),new THREE.Vector3(HALF+.012,0.012,.088),new THREE.Vector3(-HALF-.012,0.012,.088)];
var addMat = function(c,o){return new THREE.LineBasicMaterial({color:c,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false});};
var brk = new THREE.LineSegments(new THREE.BufferGeometry(), addMat(0xffffff,1));
(function(){
  var p=[], L=.05;
  for(var i=0;i<4;i++){
    var q=CORN[i], ax=-Math.sign(q.x), az=-Math.sign(q.z);
    p.push(q.x,q.y,q.z, q.x+ax*L,q.y,q.z);
    p.push(q.x,q.y,q.z, q.x,q.y,q.z+az*L*.7);
  }
  brk.geometry.setAttribute('position', new THREE.Float32BufferAttribute(p,3));
})();
holoPivot.add(brk);
var corrGeo = new THREE.BufferGeometry(); corrGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4*2*3),3));
var corr = new THREE.LineSegments(corrGeo, addMat(0xF472B6,0)); scene.add(corr); corr.frustumCulled=false;
var cdGeo = new THREE.BufferGeometry(); cdGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8*3),3));
var cdots = new THREE.Points(cdGeo, new THREE.PointsMaterial({color:0xffffff,size:.012,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true}));
scene.add(cdots); cdots.frustumCulled=false;
var beam = new THREE.Mesh(new THREE.PlaneGeometry(.014,.26), new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uA:{value:0}},
  vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform float uA;varying vec2 vU;void main(){float x=1.-abs(vU.x-.5)*2.;float core=pow(x,3.);float h=pow(1.-vU.y,1.6);gl_FragColor=vec4(vec3(.93,.85,1.)*(core*.9+.25*x)*1.2,core*h*uA);}'}));
beam.geometry.translate(0,.13,0); scene.add(beam);
var bedLine = new THREE.Mesh(new THREE.PlaneGeometry(.006,.2), new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
bedLine.rotation.x=-Math.PI/2; scene.add(bedLine);
function ring(){var m=new THREE.Mesh(new THREE.RingGeometry(.9,1,64), new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide})); m.rotation.x=-Math.PI/2; scene.add(m); return m;}
var RINGS=[ring(),ring(),ring(),ring()];
var pulse = new THREE.Mesh(new THREE.PlaneGeometry(4.5,3), new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uR:{value:0},uA:{value:0}},
  vertexShader:'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform float uR,uA;varying vec2 vP;void main(){float d=length(vP/vec2(1.,.62));float a=exp(-pow((d-uR)/.035,2.))*uA;gl_FragColor=vec4(mix(vec3(.75,.52,.99),vec3(.96,.45,.71),clamp(uR/1.6,0.,1.))*1.4+.3,a*.38);}'}));
pulse.rotation.x=-Math.PI/2; pulse.position.set(0,KTOP+.002,KC.z); scene.add(pulse);




var KEYS = null;
var PHR = 2.4;
var PHRASE = (function(){
  var n=[], R=[[60,1],[62,2],[64,3],[65,4],[67,5],[65,4],[64,3],[62,2]], L=[[48,5],[55,1],[52,3],[55,1]];
  for(var c=0;c<3;c++){ var t0=c*PHR;
    R.forEach(function(r,i){ n.push([+(t0+i*.3).toFixed(3), +(t0+i*.3+.26).toFixed(3), r[0], 72, 'R', r[1]]); });
    L.forEach(function(r,i){ n.push([+(t0+i*.6).toFixed(3), +(t0+i*.6+.5).toFixed(3), r[0], 60, 'L', r[1]]); }); }
  return n;
})();
var WHITE_PCS=[0,2,4,5,7,9,11], BLACK_U={1:.9,3:2.1,6:4-1/7,8:5,10:6+1/7};
function isBlack(m){ return WHITE_PCS.indexOf(((m%12)+12)%12) < 0; }
function keyU(m){ var o=Math.floor((m-60)/12), pc=((m%12)+12)%12; return WHITE_PCS.indexOf(pc)>=0 ? o*7+WHITE_PCS.indexOf(pc) : o*7+BLACK_U[pc]-.5; }
function keyX(m){ return KEYS.c4 - keyU(m)*KEYS.pitch; }                  


var BAR_SPEED = .11, BAR_AHEAD = 1.5, BARS = [];
var barGeo = new THREE.PlaneGeometry(1,1); barGeo.translate(0,.5,0);
function barMat(){ return new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{uA:{value:0},uC:{value:new THREE.Color()}},
  vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform float uA;uniform vec3 uC;varying vec2 vU;void main(){float e=smoothstep(0.,.18,vU.x)*smoothstep(1.,.82,vU.x);'+
    'gl_FragColor=vec4(uC*(.75+.5*e)+.12,uA*(.35+.65*e));}'}); }
for(var b=0;b<14;b++){ var bm=new THREE.Mesh(barGeo, barMat()); bm.visible=false; bm.frustumCulled=false; scene.add(bm); BARS.push(bm); }

var LIT = [], litGeo = new THREE.PlaneGeometry(1,1); litGeo.rotateX(-Math.PI/2);
for(var l=0;l<8;l++){ var lm=new THREE.Mesh(litGeo, new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
  lm.visible=false; scene.add(lm); LIT.push(lm); }
function gradColor(x, out){ var w=clamp((x+.6)/1.2,0,1); return out.setRGB(lerp(.75,.96,w), lerp(.52,.45,w), lerp(.99,.71,w)); }




var GH = {ready:false, failed:null, hands:[], alpha:0, H:null, frames:0, W:23.5, P:null, tips:[]};
var ghostKb = new THREE.Group(), rigRoot = new THREE.Group();
rigRoot.scale.setScalar(1000); ghostKb.add(rigRoot); holoPivot.add(ghostKb);
var TIP = {1:5, 2:10, 3:15, 4:20, 5:25};                                    
function linearTexture(img){                                                
  var c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
  var x=c.getContext('2d'); x.drawImage(img,0,0); var d=x.getImageData(0,0,c.width,c.height), a=d.data;
  for(var i=0;i<a.length;i+=4){ var v=a[i]/255; v = v<=.04045 ? v/12.92 : Math.pow((v+.055)/1.055,2.4); a[i]=a[i+1]=a[i+2]=Math.round(v*255); a[i+3]=255; }
  var t=new THREE.DataTexture(new Uint8Array(a.buffer.slice(0)), c.width, c.height, THREE.RGBAFormat);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.magFilter=THREE.LinearFilter; t.minFilter=THREE.LinearFilter; t.needsUpdate=true; return t;
}

function ghostPose(ts){
  var P=GH.P, f=clamp(ts*30,0,GH.frames-1), a=Math.floor(f), b=Math.min(a+1,GH.frames-1), w=f-a, H=GH.H;
  GH.hands.forEach(function(hd){
    var oa=a*168+hd.h*84, ob=b*168+hd.h*84, X=hd.X;
    hd.valid = H[oa]===1;
    if(!hd.valid) return;
    for(var i=0;i<P.XR;i++){ var j=P.XR_FROM_GRP[i], pa=oa+1+j*3, pb=ob+1+j*3, o=i*P.XS;
      X[o]=(H[pa]+(H[pb]-H[pa])*w)/200*GH.W; X[o+1]=(H[pa+2]+(H[pb+2]-H[pa+2])*w)/10; X[o+2]=-(H[pa+1]+(H[pb+1]-H[pa+1])*w)/10; }
    P.orientFromPositions(X, hd.lab);
    for(var k=0;k<P.XR;k++){ var q=k*P.XS; hd.bones[k].position.set(X[q]/1000,X[q+1]/1000,X[q+2]/1000); hd.bones[k].quaternion.set(X[q+3],X[q+4],X[q+5],X[q+6]); }
  });
}
function ghostInit(){
  var P = window.MVGhost && window.MVGhost.parts, S = window.MVGhostSynth;
  if(!P || !S){ GH.failed='stage-ghost.js or ghost-synth.js is missing'; return; }
  P.loadAssets().then(function(as){
    var g = S.take(PHRASE, {rate:1}), smoke = linearTexture(as.smoke);
    GH.P=P; GH.H=new Int16Array(g.media['ghost.bin']); GH.frames=g.frames; GH.W=g.result.stage.whitePitchMm;
    
    
    
    var k = KEYS.pitch*1000/GH.W;
    ghostKb.position.set(KEYS.c4-KC.x, KEYS.wTop+.0034*k-KC.y, KEYS.wFront+.0616*k-KC.z); ghostKb.rotation.y=Math.PI;
    ghostKb.scale.setScalar(.001*k);
    ['L','R'].forEach(function(lab, h){
      var mat = P.handMaterial(THREE, smoke); mat.skinning = true;          
      var rig = P.buildRig(THREE, as[lab], lab==='L'?'left.glb':'right.glb', mat);
      rig.mesh.renderOrder = 12 + h*.1; rig.mesh.visible=false; rigRoot.add(rig.armature);
      GH.hands.push({lab:lab, h:h, bones:rig.bones, rest:rig.rest, mesh:rig.mesh, mat:mat, X:new Float32Array(P.XR*P.XS), valid:false});
    });
    
    ghostPose(0);
    GH.hands.forEach(function(hd){ var rig=P.chainLength(hd.rest,3)*1000, s=rig>0?clamp(P.chainLength(hd.X,P.XS)/rig,P.FIT_SCALE_RANGE[0],P.FIT_SCALE_RANGE[1]):1;
      hd.bones.forEach(function(b){ b.scale.setScalar(s); }); });
    
    holoPivot.position.copy(KC); holoPivot.rotation.set(0,0,0); holoPivot.updateMatrixWorld(true);
    PHRASE.forEach(function(n){ if(n[0]<PHR-.01 || n[0]>=2*PHR-.01) return;
      var f=Math.round(n[0]*30), hi=n[4]==='L'?0:1, o=f*168+hi*84+1+TIP[n[5]]*3, H=GH.H;
      var v=new THREE.Vector3(H[o]/200*GH.W, H[o+2]/10, -H[o+1]/10); ghostKb.localToWorld(v);
      GH.tips.push({on:n[0]-PHR, x:v.x, y:v.y, z:v.z}); });
    GH.ready=true; window.MVCalib.ghost=true;
    if(!running) draw();
  }).catch(function(e){ GH.failed=String(e&&e.message||e); window.MVCalib.ghost=false; });
}


var composer=null, bloom;
function setupPost(w,h){
  var rt = null;
  try{ if(renderer.capabilities.isWebGL2){ rt = new THREE.WebGLMultisampleRenderTarget(w*PR,h*PR,{format:THREE.RGBAFormat}); rt.samples = LITE?2:4; } }catch(e){ rt=null; }
  composer = rt ? new THREE.EffectComposer(renderer, rt) : new THREE.EffectComposer(renderer);
  composer.setPixelRatio(PR); composer.setSize(w,h);
  composer.addPass(new THREE.RenderPass(scene,camera));
  bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w*(LITE?.5:1), h*(LITE?.5:1)), LITE?.7:.85, .5, .5);
  composer.addPass(bloom);
  composer.addPass(new THREE.ShaderPass(OUT));
}


var OUT = {uniforms:{tDiffuse:{value:null}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);gl_FragColor=vec4(c.rgb,max(max(c.r,c.g),c.b));}'};
var lastW=0, lastH=0, HTAN=Math.tan(27*Math.PI/180)*16/9;
function resize(){
  var w = Math.max(2, frame.clientWidth), h = Math.max(2, frame.clientHeight);
  if (w===lastW && h===lastH && composer) return;
  lastW=w; lastH=h;
  
  
  renderer.setSize(w,h,false); camera.aspect=w/h;
  camera.fov = clamp(2*Math.atan(HTAN/camera.aspect)*180/Math.PI, 26, 76); camera.updateProjectionMatrix();
  if(!composer) setupPost(w,h); else composer.setSize(w,h);
}
window.addEventListener('resize', function(){ if(composer){ resize(); if(!running) draw(); } });



if (window.ResizeObserver) new ResizeObserver(function(){ if(composer){ resize(); if(!running) draw(); } }).observe(frame);


canvas.addEventListener('webglcontextlost', function(e){ e.preventDefault(); window.MVCalib && (window.MVCalib.lost = true); setTimeout(function(){ location.reload(); }, 200); });


var ERR = {dx:.062, dy:.028, dz:-.05, yaw:6.2*Math.PI/180, roll:2.1*Math.PI/180};
function settle(p){ return Math.exp(-4.2*p)*Math.cos(8.2*p)*(1-sstep(.82,1,p)); }     
var SCAN_S = 3.5;
var PHASES = {
  
  look:   {period:0, still:0},
  
  reveal: {period:4.2, still:2.6},
  
  wave:   {period:PHR, still:1.2},
  
  scan:   {period:SCAN_S+.7, still:2.0},
  
  align:  {period:5.0, still:1.2},
  
  rings:  {period:PHR, still:.7},
  
  lock:   {period:PHR, still:.6},
  
  glow:   {period:3.8, still:2.2},
  
  done:   {period:0, still:0},
  
  off:    {period:0, still:0}
};
function params(phase, u){
  
  
  var P = {scan:HALF+.08, beamX:null, beamA:0, R:2.1, wave:-1, alpha:1, err:0, jit:0, corrA:0, brkA:.6, flash:0, rings:[], pulse:null,
           hands:0, ts:PHR+2.38, bars:null, lit:null};
  switch(phase){
    case 'look': P.alpha=0; P.brkA=0; break;
    case 'reveal': { var k=u/4.2; P.alpha=sstep(0,.12,k)*(1-sstep(.9,1,k)); P.R=lerp(0,.85,sstep(.04,.6,k)); P.brkA=.35+.65*sstep(.1,.5,k); break; }
    case 'wave': P.wave = u<2.0 ? lerp(-.05,1.35,eio(u/2.0)) : 1.35; P.bars=PHR+u; P.lit='bars'; break;
    case 'scan': {
      var se=eio(clamp(u/SCAN_S,0,1)), x=lerp(-HALF-.04, HALF+.06, se);
      P.scan=x; P.beamX=x; P.beamA=sstep(0,.3,u)*(1-sstep(SCAN_S,SCAN_S+.25,u));
      P.alpha=sstep(0,.4,u)*(1-sstep(SCAN_S+.35,SCAN_S+.7,u));
      P.err=1; P.jit=1; P.brkA=.35+.65*sstep(0,.6,u);
      P.hands=P.alpha; P.reveal=-x;                                         
      P.rings=[[HALF-.01,(u-.2)/1.1],[HALF-.01,(u-.55)/1.1],[-HALF+.01,(u-SCAN_S*.88)/1.1],[-HALF+.01,(u-SCAN_S*.88-.35)/1.1]];
      break; }
    case 'align': {
      var p=clamp(u/4.2,0,1);
      P.err=settle(p); P.corrA=sstep(0,.1,p)*(1-sstep(.72,1,p))*.9; P.alpha=sstep(0,.3,u)*(1-sstep(4.6,5,u));
      var lk=(u-4.2)/1.1; P.flash = lk>0&&lk<1 ? Math.sin(lk*Math.PI) : 0;
      P.hands=Math.max(.35,P.alpha); break; }
    case 'rings': {
      P.hands=1; P.ts=PHR+u; P.lit='hands'; P.wave=1.35; P.alpha=.5;
      if(GH.ready){ var r=[];
        for(var i=0;i<GH.tips.length && r.length<RINGS.length;i++){ var tp=GH.tips[i], d=((u-tp.on)%PHR+PHR)%PHR; if(d<1.1) r.push([tp.x,d/1.1,tp.z,tp.y]); }
        P.rings=r;
      } else { var c=Math.floor(u/.6), rr=[];
        for(var q=0;q<4;q++){ var n=c-q, t0=n*.6; if(n<0) continue; rr.push([lerp(-HALF+.06,HALF-.06,hash(n*7+3)), (u-t0)/1.1]); }
        P.rings=rr; }
      break; }
    case 'lock': {
      var pk=u/1.8; P.pulse = pk<1 ? pk : null; var lf=u/1.1; P.flash = lf<1 ? Math.sin(lf*Math.PI) : 0; P.wave=1.35;
      P.hands=1; P.ts=PHR+u; P.lit='hands'; P.alpha=.5; break; }
    case 'glow': P.wave = u<3.0 ? lerp(-.05,1.35,eio(u/3.0)) : 1.35; P.alpha = 1-.2*sstep(3.0,3.8,u); break;
    case 'done': P.wave=1.35; break;
    case 'off': P.alpha=.22; P.brkA=.2; break;
  }
  return P;
}


var tmp=new THREE.Vector3();




var VIEW = {wide:[new THREE.Vector3(0, 1.22, -0.76), new THREE.Vector3(0, .77, -.22)],
            hands:[new THREE.Vector3(.08, 1.03, -0.66), new THREE.Vector3(.08, .735, -.27)]};
var CLOSE = {rings:1, lock:1};
(function(){ var c=(Q.get('cam')||'').split(',').map(Number); if(c.length===6 && c.every(isFinite)){ VIEW.wide[0].set(c[0],c[1],c[2]); VIEW.wide[1].set(c[3],c[4],c[5]); } })();
var CAM = VIEW.wide[0].clone(), AIM = VIEW.wide[1].clone(), viewAt = null, WIDE = 1;
function draw(){
  var now=(performance.now()-T0)/1000, sway=REDUCED?0:1;
  var u = phaseU(now);
  var P = params(PHASE, u);
  var V = CLOSE[PHASE] ? VIEW.hands : VIEW.wide, ke = viewAt==null || REDUCED ? 1 : Math.min(1, clamp(now-viewAt,0,.1)*2.2);
  viewAt = now; CAM.lerp(V[0], ke); AIM.lerp(V[1], ke); WIDE += ((V === VIEW.wide ? 1 : 0) - WIDE) * ke;
  
  var wk = clamp((camera.aspect - 16/9) / 0.8, 0, 1) * WIDE;
  camera.position.set(CAM.x+Math.sin(now*.7)*.006*sway, CAM.y+Math.sin(now*.9+1)*.004*sway, CAM.z+Math.sin(now*.5)*.005*sway);
  camera.lookAt(AIM.x+Math.sin(now*.4)*.012*sway, AIM.y-.035*wk+Math.sin(now*.6)*.006*sway, AIM.z-.04*wk);
  camera.rotation.z += Math.sin(now*.33)*.004*sway; camera.updateMatrixWorld(true);
  U.uTime.value=now; U.uScan.value=P.scan; U.uR.value=P.R; U.uWave.value=P.wave; U.uAlpha.value=P.alpha;
  beam.visible = bedLine.visible = P.beamX!=null && P.beamA>0;
  if (beam.visible){
    beam.material.uniforms.uA.value=P.beamA; bedLine.material.opacity=P.beamA*.9;
    beam.position.set(-P.beamX, KTOP, KC.z); beam.rotation.y=Math.atan2(camera.position.x+P.beamX, camera.position.z-KC.z);
    bedLine.position.set(-P.beamX, KTOP+.003, KC.z);
    scanLight.position.set(-P.beamX, KTOP+.16, KC.z-.05);
  }
  scanLight.intensity = P.beamA*.5;
  var e=P.err, j=P.jit ? Math.sin(now*3.1)*.003+Math.sin(now*5.3)*.002 : 0;
  holoPivot.position.set(KC.x+ERR.dx*e+j, KC.y+ERR.dy*e, KC.z+ERR.dz*e+j);
  holoPivot.rotation.set(0, ERR.yaw*e, ERR.roll*e);
  holoPivot.updateMatrixWorld(true);
  brk.visible = P.alpha>0.01; brk.material.opacity = (P.brkA + P.flash*1.5)*P.alpha;
  brk.material.color.setHex(P.flash>0 ? 0xf5eaff : 0xffffff);
  var pos=corrGeo.attributes.position.array, dpos=cdGeo.attributes.position.array;
  for(var i=0;i<4;i++){
    tmp.copy(CORN[i]).applyMatrix4(holoPivot.matrixWorld);
    pos[i*6]=dpos[i*6]=tmp.x; pos[i*6+1]=dpos[i*6+1]=tmp.y; pos[i*6+2]=dpos[i*6+2]=tmp.z;
    tmp.copy(CORN[i]).add(KC);
    pos[i*6+3]=dpos[i*6+3]=tmp.x; pos[i*6+4]=dpos[i*6+4]=tmp.y; pos[i*6+5]=dpos[i*6+5]=tmp.z;
  }
  corrGeo.attributes.position.needsUpdate=true; cdGeo.attributes.position.needsUpdate=true;
  corr.material.opacity=P.corrA; cdots.material.opacity=P.corrA;
  for(var r=0;r<RINGS.length;r++){
    var m=RINGS[r], g=P.rings[r];
    if(!g){ m.material.opacity=0; continue; }
    var k=clamp(g[1],0,1); m.position.set(g[0], g[3]!=null ? g[3]+.002 : KTOP+.003, g[2]!=null ? g[2] : KC.z-.02);
    var s=g[2]!=null ? lerp(.008,.03,eio(k)) : lerp(.016,.06+(r%2)*.02,eio(k)); m.scale.set(s,s,s);
    m.material.opacity=(1-k)*(g[1]>0?1:0)*.9;
  }
  pulse.visible = P.pulse!=null;
  if(pulse.visible){ pulse.material.uniforms.uR.value=eio(P.pulse)*1.6; pulse.material.uniforms.uA.value=1-P.pulse*P.pulse; }
  drawRoll(P);
  drawHands(P, now);
  composer.render();
}


var tmpC = new THREE.Color();
function drawRoll(P){
  var nb=0, nl=0;
  if(KEYS){
    var t = P.bars!=null ? P.bars : P.ts;
    for(var i=0;i<PHRASE.length;i++){
      var n=PHRASE[i], m=n[2], bl=isBlack(m), x=keyX(m);
      if(P.bars!=null && nb<BARS.length){
        var lo=(n[0]-t)*BAR_SPEED, hi=(n[1]-t)*BAR_SPEED;
        if(hi>0 && lo<BAR_AHEAD*BAR_SPEED){
          var bm=BARS[nb++], y0=Math.max(0,lo), h=Math.min(hi,BAR_AHEAD*BAR_SPEED)-y0;
          bm.visible=h>.002; bm.position.set(x, (bl?KEYS.bTop:KEYS.wTop)+y0, KEYS.back+.004);
          bm.scale.set(KEYS.pitch*(bl?.42:.62), Math.max(h,.001), 1);
          gradColor(x, bm.material.uniforms.uC.value);
          bm.material.uniforms.uA.value=(1-sstep(BAR_AHEAD*.6,BAR_AHEAD,(n[0]-t)))*(P.alpha>0?1:0);
        }
      }
      var on = P.lit && t>=n[0] && t<n[1];
      if(on && nl<LIT.length && (P.lit==='bars' || GH.ready)){
        var lm=LIT[nl++], len=bl?(KEYS.bBack-KEYS.bFront):(KEYS.back-KEYS.wFront);
        lm.visible=true; lm.position.set(x, (bl?KEYS.bTop:KEYS.wTop)+.0008, (bl?KEYS.bFront:KEYS.wFront)+len/2);
        lm.scale.set(KEYS.pitch*(bl?.46:.86), 1, len*.96);
        lm.material.opacity=.55*(1-sstep(.75,1,(t-n[0])/(n[1]-n[0])));
      }
    }
  }
  for(;nb<BARS.length;nb++) BARS[nb].visible=false;
  for(;nl<LIT.length;nl++) LIT[nl].visible=false;
}

var lastNow=0, smokeAt=null;
function drawHands(P, now){
  if(!GH.ready) return;
  var dt=clamp(now-lastNow,0,.1); lastNow=now;
  GH.alpha += (P.hands-GH.alpha)*(REDUCED ? 1 : Math.min(1, dt*5));
  ghostPose(P.ts);
  if(!smokeAt) smokeAt=new THREE.Vector2();
  if(!REDUCED) GH.P.smokeOffset(now, smokeAt);
  var tanHalf=Math.tan(camera.fov*Math.PI/360), L=GH.P.LOOK;
  GH.hands.forEach(function(hd){
    var w=hd.bones[0].getWorldPosition(tmp), a=GH.alpha*(hd.valid?1:0);
    if(P.reveal!=null) a*=sstep(w.x+.05, w.x-.05, P.reveal);               
    var u=hd.mat.uniforms; u.uOpacity.value=a; u.uSmokeOffset.value.copy(smokeAt);
    var kc=(camera.position.distanceTo(w)*1000*tanHalf)/GH.P.QUEST_CELL_MM;
    u.uTiling.value.set(L.tiling[0]*kc*camera.aspect/GH.P.QUEST_EYE_ASPECT, L.tiling[1]*kc);
    hd.mesh.visible=a>.002;
  });
}


var PHASE = PHASES[Q.get('phase')] ? Q.get('phase') : 'look', START = 0, T0 = performance.now(), running = false, isReady = false, want = true;
function phaseU(now){
  var ph = PHASES[PHASE];
  if (REDUCED || !ph.period) return ph.still;              
  return (now - START) % ph.period;
}
function setPhase(p){
  if(!PHASES[p] || p===PHASE) return;
  PHASE = p; START = (performance.now()-T0)/1000;
  window.MVCalib.phase = p;
  if (isReady && !running) draw();
}
function tick(){
  if(!running) return;
  draw(); requestAnimationFrame(tick);
}
function run(on){
  want = on;
  var go = on && isReady && !document.hidden && !REDUCED;
  if (go && !running){ running=true; requestAnimationFrame(tick); }
  else if (!go){ running=false; if (isReady) draw(); }
}
document.addEventListener('visibilitychange', function(){ run(want); });
window.addEventListener('message', function(e){
  if (e.source !== window.parent) return;                  
  var d = e.data;
  if (!d || typeof d !== 'object') return;
  if (composer) resize();                                   
  if (typeof d.mvPhase === 'string') setPhase(d.mvPhase);
  if (typeof d.mvRun === 'boolean') run(d.mvRun);
});
window.MVCalib = {phase: PHASE, ready: false, setPhase: setPhase, phases: Object.keys(PHASES), params: params};
function ready(){
  resize(); isReady=true; window.MVCalib.ready=true;
  window.MVCalib.seeThrough = !!(renderer.getContext().getContextAttributes() || {}).alpha;
  canvas.style.opacity=1;
  draw(); run(want);
  try { window.parent.postMessage({mvCalibReady: true}, '*'); } catch (e) {   }
}
function load(){
  var loader = new THREE.GLTFLoader();
  var onErr = function(e){ window.MVCalib.failed = String(e && e.message || e); };
  if(window.PIANO_B64){
    var bin=atob(window.PIANO_B64), buf=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) buf[i]=bin.charCodeAt(i);
    loader.parse(buf.buffer,'',build,onErr);
  } else onErr(new Error('piano-assets.js is missing'));
}
load();
})();

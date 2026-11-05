




































































































































(() => {
  'use strict';
  const SELF = (document.currentScript && document.currentScript.src) || location.href;
  const ASSET = (p) => new URL(p, SELF).href;
  const THREE_URL = ASSET('vendor/three-0.160.0/three.module.min.js');
  const RIG_URL = { L: ASSET('models/hands/generic-hand/left.glb'), R: ASSET('models/hands/generic-hand/right.glb') };
  const SMOKE_URL = ASSET('textures/hand-smoke.png');
  const GLOW_URL = ASSET('models/piano-key-glow.glb'), GLOW_SMOKE_URL = ASSET('textures/glow-smoke.png');
  
  
  const KEYS_URL = ASSET('models/piano-keys.glb');
  let threeP = null;
  const loadThree = () => threeP || (threeP = import(THREE_URL).catch((e) => { threeP = null; throw e; }));

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  
  const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  const BLACK_U = { 1: 0.9, 3: 2.1, 6: 4 - 1 / 7, 8: 5, 10: 6 + 1 / 7 };
  const pcOf = (m) => ((m % 12) + 12) % 12;
  const isBlack = (m) => !WHITE_PCS.includes(pcOf(m));
  const keyU = (m) => { const o = Math.floor((m - 60) / 12), pc = pcOf(m); return WHITE_PCS.includes(pc) ? o * 7 + WHITE_PCS.indexOf(pc) : o * 7 + BLACK_U[pc] - 0.5; };
  const NAMES = ['C', 'C sharp', 'D', 'E flat', 'E', 'F', 'F sharp', 'G', 'A flat', 'A', 'B flat', 'B'];
  const noteName = (m) => `${NAMES[pcOf(m)]}${Math.floor(m / 12) - 1}`;
  const whiteAt = (u) => { const k = Math.round(u), o = Math.floor(k / 7); return 60 + o * 12 + WHITE_PCS[((k % 7) + 7) % 7]; };

  
  
  
  
  
  
  
  
  
  
  
  const OWN_KB = { top: -3.4, front: 61.6, whiteLen: 142.6, blackUp: 11.5, blackLen: 93.1, blackW: 11.6, hingeFromBack: 2.3, hingeWhite: 23.06, hingeBlack: 17.48 };
  
  
  const PRESS = { deg: 2.8, s: 0.083333336, releaseS: 0.15 };
  
  
  
  
  const KEY_DOWN_CURVE = [[0, 0, 0, 0], [0.083333336, -2.8, 0, 0]];
  const KEY_UP_CURVE = [[0, -2.8, 0, 0], [0.15, 0, 6.545451, 6.545451], [0.18333334, 0.3, 0, 0], [0.2, 0, 0, 0]];
  const KEY_UP_S = 0.2, KEY_DOWN_DEG = -2.8;
  
  
  function evalCurve(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    const last = keys[keys.length - 1];
    if (t >= last[0]) return last[1];
    let i = 0;
    while (t > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1], dt = b[0] - a[0], u = (t - a[0]) / dt, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * dt * a[3] + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * dt * b[2];
  }
  const WHITE_H = 22, GAP = 1.1, BLACK_TAPER = 1.6, BLACK_BELOW = 12;   
  const PER_HAND = 84, PER_FRAME = 168;
  const OTHER_DIM = 0.06;                                 
  const ARIA_MS = 500;
  
  
  
  const CUT_MM = 45;

  

  
  
  const LOOK = {
    grey: 1.6105,                                         
    fresnel: [0.68402785, 0.17324167, 4.080806],          
    power: 4.38,                                          
    tiling: [0.1, 2],                                     
    scroll: [0.05, 0.05],                                 
    smokeMean: 0.0935,                                    
    light: 0.4, rimGain: 1, noise: 1,
    tint: [1, 1, 1],
  };
  
  
  const BRIGHT = {
    ...LOOK,
    tint: [0.58, 0.46, 1.0], light: 1.0, noise: 0, smokeMean: 0.46,
    fresnel: [1.0, 0.78, 4.0], power: 1.7, rimGain: 1.3,
  };
  
  
  const PALE = {
    ...LOOK,
    tint: [0.95, 0.9, 1.0], light: 0.95, noise: 0.3, smokeMean: 0.2,
    fresnel: [0.62, 0.3, 1.6], power: 2.0, rimGain: 1.1,
  };
  
  
  
  const ORDER = { glow: 11, hands: 12, litKeys: 13, guide: 30 };
  
  
  
  
  const GLOW_LOOK = { tiling: [2, 0.1], scroll: [0.01, -0.1], opacity: 1, gamma: 1.5 };
  const GLOW_MIN_S = 0.15;
  const GLOW_SCALE_WHITE = [0.76342416, 0.62306935, 0.98578966], GLOW_SCALE_BLACK = [0.5352812, 0.62306935, 0.6738755];
  
  
  const G_TO_KB = [-1000, 1000, -1000];
  
  const poolSize = (peak) => Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, Math.ceil(peak * 1.25)))));
  
  
  
  const WRIST_BOX = { maxAbsX: 1000, minH: -200, maxH: 700, minD: -800, maxD: 300 };
  const HOLD_THROUGH_S = 0.25, REACQUIRE_FADE_S = 0.3, LOSS_FADE_S = 0.2;
  
  
  
  const HAND_FADE_DELAY_S = 1.0, HAND_FADE_S = 1.0;
  
  
  
  
  const QUEST_CELL_MM = 483 * Math.tan((48 * Math.PI) / 180), QUEST_EYE_ASPECT = 1;
  
  
  const FIT_CHAINS = [[0, 5, 6, 7, 8, 9], [0, 10, 11, 12, 13, 14], [0, 15, 16, 17, 18, 19]];
  const FIT_SCALE_RANGE = [0.85, 1.25];
  
  
  const XR_JOINT_NAMES = [
    'wrist',
    'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
    'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
    'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
    'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
    'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
  ];
  const XR = 25, XS = 7;                                  
  const XR_FROM_GRP = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
  
  const NEXT_JOINT = [10, 2, 3, 4, -1, 6, 7, 8, 9, -1, 11, 12, 13, 14, -1, 16, 17, 18, 19, -1, 21, 22, 23, 24, -1];
  const ROT_PER_FRAME = 2 * XR * 4;                       

  

  
  
  const HAND_VS = `
#include <common>
#include <skinning_pars_vertex>
varying vec3 vNormalV;
varying vec3 vViewV;
varying vec4 vClip;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vNormalV = transformedNormal; // view space (normalMatrix)
  vViewV = -mvPosition.xyz;
  vClip = gl_Position; // the clip position: Unity's Screen Position (Default), for the one view here
}`;
  
  
  const HAND_FS = `
uniform sampler2D uSmoke;
uniform vec2 uTiling;
uniform vec2 uSmokeOffset;
uniform float uNoise;
uniform float uSmokeMean;
uniform float uGrey;
uniform float uLight;
uniform vec3 uTint;
uniform vec3 uFresnel;
uniform float uFresnelPower;
uniform float uOpacity;
varying vec3 vNormalV;
varying vec3 vViewV;
varying vec4 vClip;

// the composite's 'cover' branch; a constant, so the other branch compiles away.
const float uCover = 1.0;

vec4 mvSRGBToLinear( in vec4 value ) {
  return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}

void main() {
  float f = pow(1.0 - clamp(dot(normalize(vNormalV), normalize(vViewV)), 0.0, 1.0), uFresnelPower);
  vec2 screen = vClip.xy / vClip.w * 0.5 + 0.5;
  float smoke = texture2D(uSmoke, screen * uTiling + uSmokeOffset).r; // linear: the texture is SRGBColorSpace
  float a = mix(uSmokeMean, smoke, uNoise) * uOpacity;
  vec3 body = vec3(uGrey * uLight) * uTint;
  // Quest's LDR clip of the emission, per channel, before the composite; the fade takes the rim with it.
  vec3 rim = min(uFresnel * f, vec3(1.0)) * uOpacity;
  // Encodes and composites (no colorspace_fragment: that would encode twice).
  vec3 bodyOut = linearToOutputTexel(vec4(body, 1.0)).rgb;
  if (uCover > 0.5) {
    vec3 pre = bodyOut * a;
    vec3 preLin = linearToOutputTexel(vec4(0.5)).r > 0.6 ? mvSRGBToLinear(vec4(pre, 1.0)).rgb : pre;
    gl_FragColor = vec4(linearToOutputTexel(vec4(min(preLin + rim, vec3(1.0)), 1.0)).rgb, a);
  } else {
    vec3 rimOut = linearToOutputTexel(vec4(rim, 1.0)).rgb;
    gl_FragColor = vec4(min(rimOut + bodyOut * a, vec3(1.0)), a);
  }
}`;

  
  function handMaterial(THREE, smoke, look = LOOK) {
    const [fr, fg, fb] = look.fresnel, g = look.rimGain;
    return new THREE.ShaderMaterial({
      name: 'GhostHandHologram',
      uniforms: {
        uSmoke: { value: smoke },
        uTiling: { value: new THREE.Vector2(LOOK.tiling[0], LOOK.tiling[1]) },
        uSmokeOffset: { value: new THREE.Vector2() },
        uNoise: { value: look.noise },
        uSmokeMean: { value: look.smokeMean },
        uGrey: { value: look.grey },
        uLight: { value: look.light },
        uTint: { value: new THREE.Vector3(look.tint[0], look.tint[1], look.tint[2]) },
        uFresnel: { value: new THREE.Vector3(fr * g, fg * g, fb * g) },
        uFresnelPower: { value: look.power },
        uOpacity: { value: 0 },
      },
      vertexShader: HAND_VS,
      fragmentShader: HAND_FS,
      transparent: true,
      depthWrite: false,                                  
      depthTest: true,
      side: THREE.FrontSide,                              
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,             
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      toneMapped: false,                                  
    });
  }
  
  function smokeOffset(wallS, out) {
    const x = LOOK.scroll[0] * wallS, y = LOOK.scroll[1] * wallS;
    return out.set(x - Math.floor(x), y - Math.floor(y));
  }

  

  
  
  
  
  const LIT_VS = `
attribute float aLit;
void main() {
  vec4 mv = instanceMatrix * vec4(position, 1.0);
  mv = modelViewMatrix * mv;
  gl_Position = aLit > 0.5 ? projectionMatrix * mv : vec4(0.0, 0.0, 2.0, 1.0);
}`;
  
  
  
  const LIT_FS = `
uniform vec4 uTint;
void main() {
  gl_FragColor = linearToOutputTexel(uTint);
}`;
  
  
  
  function litMaterial(THREE, color) {
    const c = new THREE.Color(color || '#FFFFFF');      
    return new THREE.ShaderMaterial({
      name: 'ShowcaseLitKeys',
      uniforms: { uTint: { value: new THREE.Vector4(c.r, c.g, c.b, 1) } },
      vertexShader: LIT_VS,
      fragmentShader: LIT_FS,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.FrontSide,
      toneMapped: false,
    });
  }
  
  
  const GLOW_VS = `
varying vec2 vUv;
void main() {
  // glTF's v is Unity's flipped.
  vUv = vec2(uv.x, 1.0 - uv.y);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
  const GLOW_FS = `
uniform sampler2D uSmoke;
uniform float uTime;
uniform float uOpacity;
uniform float uGamma;
uniform vec2 uTiling;
uniform vec2 uScroll;
varying vec2 vUv;
void main() {
  // the glow's alpha, in three lines.
  float smoke = texture2D(uSmoke, vUv * uTiling + uScroll * uTime).r; // T_Random_49's grey (alphaUsage 2)
  float a = clamp(smoke * (1.0 - uOpacity * vUv.y), 0.0, 1.0);
  a = 1.0 - pow(1.0 - a, uGamma); // three blends encoded values, Unity linear ones
  gl_FragColor = vec4(1.0, 1.0, 1.0, a); // _Glow 38.9 × the desaturated gradient clips to white (LDR)
}`;
  
  
  function glowMaterial(THREE, smoke) {
    const m = new THREE.ShaderMaterial({
      name: 'ShowcaseKeyGlow',
      uniforms: {
        uSmoke: { value: smoke },
        uTime: { value: 0 },
        uOpacity: { value: GLOW_LOOK.opacity },
        uGamma: { value: GLOW_LOOK.gamma },
        uTiling: { value: new THREE.Vector2(GLOW_LOOK.tiling[0], GLOW_LOOK.tiling[1]) },
        uScroll: { value: new THREE.Vector2(GLOW_LOOK.scroll[0], GLOW_LOOK.scroll[1]) },
      },
      vertexShader: GLOW_VS,
      fragmentShader: GLOW_FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    m.forceSinglePass = true;
    return m;
  }
  
  
  function peakGlow(notes) {
    const ev = [];
    for (const n of notes) if (Number.isInteger(n.m) && n.m >= 21 && n.m <= 108) ev.push([n.on, 1], [Math.max(n.off, n.on + GLOW_MIN_S), -1]);
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let now = 0, peak = 0;
    for (const e of ev) { now += e[1]; peak = Math.max(peak, now); }
    return peak;
  }

  

  
  
  const COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const TYPED = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  function readGlb(buf, label) {
    const dv = new DataView(buf);
    if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) throw new Error(`${label} is not a glb`);
    const jsonLen = dv.getUint32(12, true);
    if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error(`${label}: no JSON chunk`);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
    const binAt = 20 + jsonLen;
    if (dv.getUint32(binAt + 4, true) !== 0x004e4942) throw new Error(`${label}: no binary chunk`);
    const bin0 = binAt + 8;
    const accessor = (i) => {
      const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = COMPS[a.type], T = TYPED[a.componentType];
      if (!n || !T || a.sparse || (v.byteStride && v.byteStride !== n * T.BYTES_PER_ELEMENT)) throw new Error(`${label}: accessor ${i} is not one this reader takes`);
      const at = bin0 + (v.byteOffset || 0) + (a.byteOffset || 0);
      return { array: new T(buf.slice(at, at + a.count * n * T.BYTES_PER_ELEMENT)), size: n, normalized: !!a.normalized };
    };
    return { json, accessor };
  }
  
  function buildRig(THREE, buf, label, material) {
    const { json, accessor } = readGlb(buf, label);
    if (json.extensionsRequired && json.extensionsRequired.length) throw new Error(`${label} needs ${json.extensionsRequired.join(', ')}`);
    const meshNode = json.nodes.findIndex((n) => n.mesh != null && n.skin != null);
    if (meshNode < 0 || json.nodes.filter((n) => n.mesh != null).length !== 1) throw new Error(`${label} has no single skinned mesh`);
    const prim = json.meshes[json.nodes[meshNode].mesh].primitives;
    if (prim.length !== 1 || (prim[0].mode != null && prim[0].mode !== 4)) throw new Error(`${label}: the mesh is not one triangle list`);
    const at = prim[0].attributes, geo = new THREE.BufferGeometry();
    const attr = (i) => { const a = accessor(i); return new THREE.BufferAttribute(a.array, a.size, a.normalized); };
    geo.setAttribute('position', attr(at.POSITION));
    geo.setAttribute('normal', attr(at.NORMAL));
    geo.setAttribute('skinIndex', attr(at.JOINTS_0));
    geo.setAttribute('skinWeight', attr(at.WEIGHTS_0));
    geo.setIndex(attr(prim[0].indices));
    const skin = json.skins[json.nodes[meshNode].skin];
    const trs = (o, n) => {
      if (n.matrix) o.matrix.fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
      if (n.translation) o.position.fromArray(n.translation);
      if (n.rotation) o.quaternion.fromArray(n.rotation);
      if (n.scale) o.scale.fromArray(n.scale);
      return o;
    };
    const bones = skin.joints.map((j) => { const b = trs(new THREE.Bone(), json.nodes[j]); b.name = json.nodes[j].name || ''; return b; });
    const ibm = accessor(skin.inverseBindMatrices).array;
    const inverses = bones.map((_, i) => new THREE.Matrix4().fromArray(ibm, i * 16));
    
    const armNode = json.nodes.find((n) => Array.isArray(n.children) && n.children.includes(meshNode));
    const armature = armNode ? trs(new THREE.Group(), armNode) : new THREE.Group();
    armature.name = (armNode && armNode.name) || 'Armature';
    const mesh = trs(new THREE.SkinnedMesh(geo, material), json.nodes[meshNode]);
    mesh.name = json.nodes[meshNode].name || '';
    for (const j of skin.joints) if (!(armNode && armNode.children.includes(j))) throw new Error(`${label}: a bone is not directly under the Armature`);
    armature.add(mesh, ...bones);
    armature.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones, inverses), mesh.matrixWorld);
    mesh.normalizeSkinWeights();                           
    mesh.frustumCulled = false;                            
    
    const byName = new Map(bones.map((b) => [b.name, b]));
    const xr = XR_JOINT_NAMES.map((name) => { const b = byName.get(name); if (!b) throw new Error(`${label} has no bone '${name}'`); return b; });
    const rest = new Float32Array(XR * 3);
    xr.forEach((b, i) => b.position.toArray(rest, i * 3));
    return { armature, mesh, bones: xr, rest, geo };
  }

  
  
  
  function buildShell(THREE, buf) {
    const label = 'piano-key-glow.glb', { json, accessor } = readGlb(buf, label);
    if (json.extensionsRequired && json.extensionsRequired.length) throw new Error(`${label} needs ${json.extensionsRequired.join(', ')}`);
    const meshNodes = json.nodes.map((n, i) => i).filter((i) => json.nodes[i].mesh != null);
    if (meshNodes.length !== 1) throw new Error(`${label} has ${meshNodes.length} meshes, expected 1 (the shell)`);
    const ni = meshNodes[0], node = json.nodes[ni];
    if (json.nodes.some((n) => Array.isArray(n.children) && n.children.includes(ni))) throw new Error(`${label}: the shell is not at the scene's root`);
    const prim = json.meshes[node.mesh].primitives;
    if (prim.length !== 1 || (prim[0].mode != null && prim[0].mode !== 4)) throw new Error(`${label}: the shell is not one triangle list`);
    const at = prim[0].attributes, geo = new THREE.BufferGeometry();
    for (const k of ['POSITION', 'TEXCOORD_0']) if (at[k] == null) throw new Error(`${label} has no ${k}`);
    const attr = (i) => { const a = accessor(i); return new THREE.BufferAttribute(a.array, a.size, a.normalized); };
    geo.setAttribute('position', attr(at.POSITION));
    if (at.NORMAL != null) geo.setAttribute('normal', attr(at.NORMAL));
    geo.setAttribute('uv', attr(at.TEXCOORD_0));
    if (prim[0].indices != null) geo.setIndex(attr(prim[0].indices));
    const local = new THREE.Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else local.compose(new THREE.Vector3().fromArray(node.translation || [0, 0, 0]), new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]), new THREE.Vector3().fromArray(node.scale || [1, 1, 1]));
    geo.applyMatrix4(new THREE.Matrix4().makeScale(G_TO_KB[0], G_TO_KB[1], G_TO_KB[2]).multiply(local));
    return geo;
  }

  
  
  
  const inlined = (url) => {
    const b = window.MVGHOST_GLB && window.MVGHOST_GLB[url.split('/').pop()];
    if (typeof b !== 'string') return null;
    const s = atob(b), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out.buffer;
  };
  const bytes = async (url) => {
    const own = inlined(url);
    if (own) return own;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url.split('/').pop()}: the server answered ${r.status}`);
    return r.arrayBuffer();
  };
  const image = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url.split('/').pop()}: the server answered ${r.status}`);
    const img = new Image();
    img.src = URL.createObjectURL(await r.blob());         
    await img.decode();
    return img;
  };
  let assetsP = null;
  function loadAssets() {
    if (assetsP) return assetsP;
    assetsP = Promise.all([bytes(RIG_URL.L), bytes(RIG_URL.R), image(SMOKE_URL)])
      .then(([L, R, smoke]) => ({ L, R, smoke }))
      .catch((e) => { assetsP = null; throw e; });
    return assetsP;
  }
  
  
  
  let keysP = null;
  function loadKeys() {
    if (keysP) return keysP;
    keysP = bytes(KEYS_URL).then((buf) => {
      const dv = new DataView(buf), jl = dv.getUint32(12, true);
      const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
      const bin = 20 + jl + 8, view = (a) => { const v = j.bufferViews[j.accessors[a].bufferView]; return [bin + (v.byteOffset || 0), j.accessors[a].count]; };
      const geo = {};
      for (const m of j.meshes) {
        const midi = +String(m.name).replace('key_', ''), pr = m.primitives[0];
        const [po, pn] = view(pr.attributes.POSITION), [no] = view(pr.attributes.NORMAL), [io, ic] = view(pr.indices);
        geo[midi] = { pos: new Float32Array(buf.slice(po, po + pn * 12)), nrm: new Float32Array(buf.slice(no, no + pn * 12)), idx: new Uint16Array(buf.slice(io, io + ic * 2)) };
      }
      const pitch = j.extras && +j.extras.pitchMm;
      if (Object.keys(geo).length !== 88 || !(pitch > 15 && pitch < 30)) throw new Error('not the 88 keys');
      return { pitchMm: pitch, geo };
    }).catch((e) => { keysP = null; console.info(`MVGhost: the piano's own keys did not load (${(e && e.message) || e}), so the page draws its own.`); return null; });
    return keysP;
  }
  
  
  let glowP = null;
  function loadGlow() {
    if (glowP) return glowP;
    glowP = Promise.all([bytes(GLOW_URL), image(GLOW_SMOKE_URL)])
      .then(([shell, smoke]) => ({ shell, smoke }))
      .catch((e) => { glowP = null; console.warn(`MVGhost: the press glow did not load (${(e && e.message) || e}), so the keys light without it.`); return null; });
    return glowP;
  }

  

  
  function quatFromBasis(xx, xy, xz, yx, yy, yz, zx, zy, zz, out, o) {
    const m00 = xx, m01 = yx, m02 = zx, m10 = xy, m11 = yy, m12 = zy, m20 = xz, m21 = yz, m22 = zz, tr = m00 + m11 + m22;
    let qx, qy, qz, qw;
    if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); qw = 0.25 / s; qx = (m21 - m12) * s; qy = (m02 - m20) * s; qz = (m10 - m01) * s; }
    else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); qw = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s; }
    else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s; }
    else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s; }
    out[o + 3] = qx; out[o + 4] = qy; out[o + 5] = qz; out[o + 6] = qw;
  }
  
  
  
  
  
  const ov = new Float64Array(12);
  function norm3(o) { const l = Math.hypot(ov[o], ov[o + 1], ov[o + 2]); if (l > 0) { ov[o] /= l; ov[o + 1] /= l; ov[o + 2] /= l; } return l; }
  function orientFromPositions(X, lab) {
    const sign = lab === 'L' ? 1 : -1;
    for (let c = 0; c < 3; c++) { ov[c] = sign * (X[5 * XS + c] - X[20 * XS + c]); ov[3 + c] = X[10 * XS + c] - X[c]; }
    norm3(0); norm3(3);
    ov[6] = -(ov[4] * ov[2] - ov[5] * ov[1]); ov[7] = -(ov[5] * ov[0] - ov[3] * ov[2]); ov[8] = -(ov[3] * ov[1] - ov[4] * ov[0]);
    norm3(6);
    for (let i = 0; i < XR; i++) {
      const next = NEXT_JOINT[i];
      if (next < 0) continue;
      for (let c = 0; c < 3; c++) ov[9 + c] = X[next * XS + c] - X[i * XS + c];
      if (norm3(9) === 0) continue;
      const zx = -ov[9], zy = -ov[10], zz = -ov[11];
      let along = ov[0] * zx + ov[1] * zy + ov[2] * zz;
      let xx = ov[0] - along * zx, xy = ov[1] - along * zy, xz = ov[2] - along * zz;
      let xl = Math.hypot(xx, xy, xz);
      if (xl < 0.2) {
        along = ov[6] * zx + ov[7] * zy + ov[8] * zz;
        const yx = ov[6] - along * zx, yy = ov[7] - along * zy, yz = ov[8] - along * zz;
        xx = yy * zz - yz * zy; xy = yz * zx - yx * zz; xz = yx * zy - yy * zx;
        xl = Math.hypot(xx, xy, xz) || 1;
      }
      xx /= xl; xy /= xl; xz /= xl;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      quatFromBasis(xx, xy, xz, yx, yy, yz, zx, zy, zz, X, i * XS);
    }
    for (let i = 4; i < XR; i += 5) X.copyWithin(i * XS + 3, (i - 1) * XS + 3, i * XS);
  }
  
  function chainLength(p, stride) {
    let sum = 0;
    for (const ch of FIT_CHAINS) for (let k = 1; k < ch.length; k++) { const a = ch[k - 1] * stride, b = ch[k] * stride; sum += Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]); }
    return sum;
  }

  

  
  
  function keyGeometry(THREE, wBot, wTop, h, len) {
    const bs = 0.6, bt = 1.0, rr = 1.4;
    const hb = wBot / 2 - bs, ht = wTop / 2 - bs, y0 = -h + bs, y1 = -bs;
    const s = new THREE.Shape();
    s.moveTo(-hb, y0); s.lineTo(hb, y0); s.lineTo(ht, y1 - rr);
    s.quadraticCurveTo(ht, y1, ht - rr, y1); s.lineTo(-ht + rr, y1); s.quadraticCurveTo(-ht, y1, -ht, y1 - rr);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: len - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 2, curveSegments: 3 });
    g.computeBoundingBox();
    g.translate(0, 0, -g.boundingBox.max.z);
    return g;
  }

  
  
  
  function softwareGL() {
    let g = null;
    try {
      const c = document.createElement('canvas');
      g = c.getContext('webgl2') || c.getContext('webgl');
      if (!g) return null;
      let r = String(g.getParameter(g.RENDERER) || '');
      if (/^webkit webgl$/i.test(r)) { const x = g.getExtension('WEBGL_debug_renderer_info'); if (x) r = String(g.getParameter(x.UNMASKED_RENDERER_WEBGL) || ''); }
      return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
    } catch { return null; } finally {
      try { const l = g && g.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); } catch {   }
    }
  }

  
  
  
  function keyboardModel(D) {
    const K = D.stage && D.stage.keys, fin = (v) => typeof v === 'number' && Number.isFinite(v);
    const pair = (a) => Array.isArray(a) && a.length === 2 && a.every(fin);
    const quest = !!K && Array.isArray(K.keys) && K.keys.length === 88 && K.keys.every((r) => Array.isArray(r) && r.length === 5 && r.every(fin))
      && Array.isArray(K.origin) && K.origin.length === 3 && K.origin.every(fin) && fin(K.yawDeg) && !!K.hinge && pair(K.hinge.white) && pair(K.hinge.black);
    if (K && !quest) console.info('MVGhost: stage.keys is not whole, so the page draws its own keyboard.');
    const x = new Float32Array(128), top = new Float32Array(128), front = new Float32Array(128), back = new Float32Array(128);
    let origin, yaw, hinge, press, whiteW, blackW;
    if (quest) {
      for (let m = 21; m <= 108; m++) { const r = K.keys[m - 21]; x[m] = r[0]; top[m] = r[1]; front[m] = r[2]; back[m] = r[3]; }
      whiteW = K.keys[60 - 21][4]; blackW = K.keys[61 - 21][4];
      origin = K.origin.slice(); yaw = (K.yawDeg * Math.PI) / 180;
      hinge = { white: K.hinge.white.slice(), black: K.hinge.black.slice() };
      press = { deg: fin(K.pressDeg) ? K.pressDeg : PRESS.deg, s: fin(K.pressS) ? K.pressS : PRESS.s, releaseS: fin(K.releaseS) ? K.releaseS : PRESS.releaseS };
    } else {
      const k = OWN_KB, hz = -(k.whiteLen - k.hingeFromBack);
      for (let m = 21; m <= 108; m++) { const b = isBlack(m); x[m] = keyU(m) * D.W; top[m] = b ? k.blackUp : 0; front[m] = b ? k.blackLen - k.whiteLen : 0; back[m] = -k.whiteLen; }
      whiteW = D.W - GAP; blackW = k.blackW;
      origin = [0, k.top, k.front]; yaw = 0;
      hinge = { white: [-k.hingeWhite, hz], black: [k.blackUp - k.hingeBlack, hz] };
      press = PRESS;
    }
    return {
      from: quest ? 'quest' : 'own', x, top, front, back, origin, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), hinge, press,
      whiteW, blackW, whiteLen: front[60] - back[60], blackLen: front[61] - back[61], blackTop: top[61],
    };
  }

  async function create(parent, opts = {}) {
    const [THREE, assets, glowAssets, realKeys] = await Promise.all([loadThree(), loadAssets(), loadGlow(), opts.ownKeys ? null : loadKeys()]);
    const D = opts.D, COL = opts.COL || {};
    if (!parent || !D) throw new Error('MVGhost.create needs an element and the take');
    const hands = typeof opts.hands === 'function' ? opts.hands : () => null;
    const redraw = typeof opts.redraw === 'function' ? opts.redraw : () => {};
    const media = typeof opts.media === 'function' ? opts.media : null;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const W = D.W;

    const scene = new THREE.Scene();
    const disposables = [];
    const keep = (x) => { disposables.push(x); return x; };
    const dropAll = () => { for (const d of disposables) { try { d.dispose(); } catch {   } } };

    

    const smoke = keep(new THREE.Texture(assets.smoke));
    smoke.colorSpace = THREE.SRGBColorSpace;             
    smoke.wrapS = smoke.wrapT = THREE.RepeatWrapping;    
    smoke.needsUpdate = true;
    
    const rigRoot = new THREE.Group();
    rigRoot.scale.setScalar(1000);
    scene.add(rigRoot);
    function makeHand(lab) {
      const material = keep(handMaterial(THREE, smoke, opts.pale ? PALE : opts.bright ? BRIGHT : LOOK));
      const rig = buildRig(THREE, assets[lab], lab === 'L' ? 'left.glb' : 'right.glb', material);
      keep(rig.geo); keep(rig.mesh.skeleton);
      rig.mesh.renderOrder = ORDER.hands;
      rig.mesh.visible = false;
      rigRoot.add(rig.armature);
      return {
        lab, h: lab === 'L' ? 0 : 1, ...rig, material,
        J: new Float32Array(26 * 3),                       
        X: new Float32Array(XR * XS),                      
        alpha: 0, posed: false, scale: 1, cx: 0, cy: 0, cz: 0,
        valid: null, gaps: [], bridges: [], bridgeAt: null, 
      };
    }
    let HANDS;
    try { HANDS = [makeHand('L'), makeHand('R')]; } catch (e) { dropAll(); throw e; }
    const smokeAt = new THREE.Vector2();
    
    const lastOff = D.notes.reduce((a, n) => Math.max(a, n.off), -Infinity);
    const goneS = Number.isFinite(lastOff) ? lastOff + HAND_FADE_DELAY_S + HAND_FADE_S : Infinity;

    const canvas = document.createElement('canvas');
    canvas.className = 'mvh-gl';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'The keyboard in 3D, seen as you would see it while playing, with both hands');
    
    
    
    const soft = softwareGL() === true;
    const attrs = { alpha: true, antialias: !soft && (window.devicePixelRatio || 1) < 1.5, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    let gl = null;
    try { gl = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs); } catch { gl = null; }
    if (!gl) { dropAll(); throw new Error('this browser has no WebGL here'); }
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, context: gl, ...attrs });
    } catch (e) { dropAll(); throw new Error(`WebGL did not start (${(e && e.message) || e})`); }
    renderer.setClearColor(0x000000, 0);
    const maxDpr = soft ? 1 : 2;                         
    renderer.setPixelRatio(Math.min(maxDpr, window.devicePixelRatio || 1));

    const cam = new THREE.PerspectiveCamera(40, 2, 8, 9000);

    

    scene.add(new THREE.HemisphereLight(0xfff1e6, 0x1f1712, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-250, 900, 650);
    scene.add(sun);
    const back = new THREE.DirectionalLight(0xc9b6ff, 0.45);
    back.position.set(200, 300, -900);
    scene.add(back);

    

    const lowM = 21, highM = 108;
    const KB = keyboardModel(D);
    
    const kbGroup = new THREE.Group();
    kbGroup.position.set(KB.origin[0], KB.origin[1], KB.origin[2]);
    kbGroup.rotation.y = KB.yaw;
    scene.add(kbGroup);
    
    const localX = (x, z) => (x - KB.origin[0]) * KB.cos - (z - KB.origin[2]) * KB.sin;
    const whites = [], blacks = [];
    for (let m = lowM; m <= highM; m++) (isBlack(m) ? blacks : whites).push(m);
    const slot = new Int16Array(128).fill(-1);            
    whites.forEach((m, i) => { slot[m] = i; });
    blacks.forEach((m, i) => { slot[m] = i; });
    
    
    
    const litMat = keep(litMaterial(THREE, opts.litColor));
    
    
    const depthKeys = opts.keys === 'depth';
    const keyMat = (o) => (depthKeys ? { ...o, colorWrite: false } : o);
    const makeKeys = (list, geo, matOpts) => {
      const lit = new THREE.InstancedBufferAttribute(new Float32Array(list.length), 1).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aLit', lit);
      const mesh = new THREE.InstancedMesh(keep(geo), keep(new THREE.MeshStandardMaterial(matOpts)), list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      kbGroup.add(mesh);
      const overlay = new THREE.InstancedMesh(geo, litMat, list.length);
      overlay.instanceMatrix = mesh.instanceMatrix;          
      overlay.frustumCulled = false;
      overlay.renderOrder = ORDER.litKeys;
      overlay.visible = false;
      kbGroup.add(overlay);
      return { mesh, overlay, lit, setBody: (v) => { mesh.visible = !!v; } };
    };
    
    
    
    const scaleKeys = realKeys ? (KB.x[62] - KB.x[60]) / realKeys.pitchMm : 1;
    const realGeometry = (m) => {
      const k = realKeys.geo[m], g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(k.pos.slice(), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(k.nrm, 3));
      g.setIndex(new THREE.BufferAttribute(k.idx, 1));
      g.scale(scaleKeys, scaleKeys, scaleKeys);
      return g;
    };
    const makeRealKeys = (list, matOpts) => {
      const n = list.length, arr = new Float32Array(n * 16), litArr = new Float32Array(n);
      const mat = keep(new THREE.MeshStandardMaterial(matOpts));
      const each = list.map((m) => {
        const geo = keep(realGeometry(m));
        const lit = new THREE.InstancedBufferAttribute(new Float32Array(1), 1).setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aLit', lit);
        const mesh = new THREE.InstancedMesh(geo, mat, 1);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        kbGroup.add(mesh);
        const ov = new THREE.InstancedMesh(geo, litMat, 1);
        ov.instanceMatrix = mesh.instanceMatrix;
        ov.frustumCulled = false;
        ov.renderOrder = ORDER.litKeys;
        ov.visible = false;
        kbGroup.add(ov);
        return { mesh, ov, lit };
      });
      let on = false;
      const syncM = () => each.forEach((k, i) => {
        const a = k.mesh.instanceMatrix.array;
        for (let c = 0; c < 16; c++) if (a[c] !== arr[i * 16 + c]) { a.set(arr.subarray(i * 16, i * 16 + 16)); k.mesh.instanceMatrix.needsUpdate = true; break; }
      });
      const syncL = () => each.forEach((k, i) => {
        if (k.lit.array[0] !== litArr[i]) { k.lit.array[0] = litArr[i]; k.lit.needsUpdate = true; }
        k.ov.visible = on && litArr[i] > 0;
      });
      return {
        real: true,
        mesh: { instanceMatrix: { array: arr, set needsUpdate(v) { if (v) syncM(); } } },
        lit: { array: litArr, set needsUpdate(v) { if (v) syncL(); } },
        overlay: { get visible() { return on; }, set visible(v) { on = !!v; syncL(); } },
        setBody: (v) => each.forEach((k) => { k.mesh.visible = !!v; }),
      };
    };
    const WK = realKeys ? makeRealKeys(whites, keyMat({ color: '#DCD5CD', roughness: 0.42, metalness: 0 }))
      : makeKeys(whites, keyGeometry(THREE, KB.whiteW, KB.whiteW, WHITE_H, KB.whiteLen), keyMat({ color: '#DCD5CD', roughness: 0.45, metalness: 0 }));
    
    const BK = realKeys ? makeRealKeys(blacks, keyMat({ color: '#1E1B19', roughness: 0.3, metalness: 0 }))
      : makeKeys(blacks, keyGeometry(THREE, KB.blackW, KB.blackW - BLACK_TAPER, KB.blackTop + BLACK_BELOW, KB.blackLen), keyMat({ color: '#1E1B19', roughness: 0.3, metalness: 0 }));
    const PRESS_A = (KB.press.deg * Math.PI) / 180;
    
    
    function keyMatrix(arr, i, m, press) {
      const hg = isBlack(m) ? KB.hinge.black : KB.hinge.white, yP = hg[0], zP = hg[1];
      const a = PRESS_A * press, c = Math.cos(a), s = Math.sin(a);
      const vy = KB.top[m] - yP, vz = KB.front[m] - zP;    
      const o = i * 16;
      arr[o] = 1; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = c; arr[o + 6] = s; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = -s; arr[o + 10] = c; arr[o + 11] = 0;
      arr[o + 12] = KB.x[m]; arr[o + 13] = yP + vy * c - vz * s; arr[o + 14] = zP + vy * s + vz * c; arr[o + 15] = 1;
    }
    whites.forEach((m, i) => keyMatrix(WK.mesh.instanceMatrix.array, i, m, 0));
    blacks.forEach((m, i) => keyMatrix(BK.mesh.instanceMatrix.array, i, m, 0));
    WK.mesh.instanceMatrix.needsUpdate = BK.mesh.instanceMatrix.needsUpdate = true;

    
    
    
    
    
    
    const GA = new Float32Array(128 * 3);
    for (let m = lowM; m <= highM; m++) {
      const hg = isBlack(m) ? KB.hinge.black : KB.hinge.white;
      GA[m * 3] = KB.x[m]; GA[m * 3 + 1] = hg[0]; GA[m * 3 + 2] = (KB.front[m] + KB.back[m]) / 2;
    }
    
    
    function glowMatrix(out, o, m, press) {
      const blk = isBlack(m), sc = blk ? GLOW_SCALE_BLACK : GLOW_SCALE_WHITE, hg = blk ? KB.hinge.black : KB.hinge.white;
      const a = PRESS_A * press, c = Math.cos(a), s = Math.sin(a);
      const dy = GA[m * 3 + 1] - hg[0], dz = GA[m * 3 + 2] - hg[1], sx = sc[0], sy = sc[1], sz = sc[2];
      out[o] = sx; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0;
      out[o + 4] = 0; out[o + 5] = c * sy; out[o + 6] = s * sy; out[o + 7] = 0;
      out[o + 8] = 0; out[o + 9] = -s * sz; out[o + 10] = c * sz; out[o + 11] = 0;
      out[o + 12] = GA[m * 3]; out[o + 13] = hg[0] + c * dy - s * dz; out[o + 14] = hg[1] + s * dy + c * dz; out[o + 15] = 1;
    }
    let glow = null, glowPool = 0;
    if (glowAssets && !depthKeys) {
      try {
        const shell = keep(buildShell(THREE, glowAssets.shell));
        
        
        const gsmoke = keep(new THREE.Texture(glowAssets.smoke));
        gsmoke.colorSpace = THREE.NoColorSpace;
        gsmoke.wrapS = gsmoke.wrapT = THREE.RepeatWrapping;
        gsmoke.needsUpdate = true;
        glowPool = poolSize(peakGlow(D.keyNotes));
        glow = keep(new THREE.InstancedMesh(shell, keep(glowMaterial(THREE, gsmoke)), glowPool));
        glow.name = 'showcase-key-glow';
        glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        glow.count = 1;
        glow.frustumCulled = false;                          
        glow.renderOrder = ORDER.glow;
        glow.visible = false;
        kbGroup.add(glow);
      } catch (e) {
        glow = null; glowPool = 0;
        console.warn(`MVGhost: the press glow could not be built (${(e && e.message) || e}), so the keys light without it.`);
      }
    }

    
    
    
    
    
    
    
    const DIGIT_AHEAD_S = 1.5, DIGIT_POOL = 24, DIGIT_LIFT = 0.8;
    let digitPlates = null, digitShown = 0;
    if (D.digits) {
      const geo = keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));     
      const mats = {};
      for (const key of ['W', 'B']) {
        for (let f = 1; f <= 5; f++) {
          const c = document.createElement('canvas');
          c.width = c.height = 64;
          const g2 = c.getContext('2d');
          g2.fillStyle = key === 'W' ? '#0B0A0A' : '#F3F4F6';
          g2.font = '800 50px system-ui, sans-serif';
          g2.textAlign = 'center'; g2.textBaseline = 'middle';
          g2.fillText(String(f), 32, 35);
          const tex = keep(new THREE.CanvasTexture(c));
          tex.colorSpace = THREE.SRGBColorSpace;
          mats[key + f] = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        }
      }
      digitPlates = [];
      for (let k = 0; k < DIGIT_POOL; k++) {
        const mesh = new THREE.Mesh(geo, mats.W1);
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.renderOrder = ORDER.litKeys + 1;                 
        kbGroup.add(mesh);
        digitPlates.push(mesh);
      }
      digitPlates.mats = mats;
    }
    const digitKey = new Float32Array(16), digitNext = new Int32Array(128);
    
    function digits(t) {
      if (!digitPlates) return;
      digitNext.fill(-1);
      const ns = D.notes;
      let a = 0, b = ns.length;
      const from = t - (D.maxLen || 0) - 0.2;
      while (a < b) { const k = (a + b) >> 1; if (ns[k].on < from) a = k + 1; else b = k; }
      for (let k = a; k < ns.length; k++) {
        const n = ns[k];
        if (n.on > t + DIGIT_AHEAD_S) break;
        if (!n.digit || n.off <= t || n.m < lowM || n.m > highM || digitNext[n.m] >= 0) continue;
        digitNext[n.m] = k;
      }
      let used = 0;
      for (let m = lowM; m <= highM && used < DIGIT_POOL; m++) {
        const k = digitNext[m];
        if (k < 0 || !shownV[m]) continue;
        const n = ns[k];
        const mesh = digitPlates[used++];
        mesh.material = digitPlates.mats[(isBlack(m) ? 'B' : 'W') + n.digit.finger] || digitPlates.mats.W1;
        
        keyMatrix(digitKey, 0, m, Math.max(0, shownP[m]));
        const blk = isBlack(m), size = blk ? Math.min(KB.blackW - 1.5, 9) : Math.min(KB.whiteW - 6, 15);
        const back = (blk ? 6 : 10) + size / 2, e = mesh.matrix.elements, s = digitKey;
        
        for (let c = 0; c < 3; c++) { e[c] = s[c] * size; e[4 + c] = s[4 + c]; e[8 + c] = s[8 + c] * size; }
        e[3] = e[7] = e[11] = 0;
        for (let c = 0; c < 3; c++) e[12 + c] = s[12 + c] + s[4 + c] * DIGIT_LIFT - s[8 + c] * back;
        e[15] = 1;
        mesh.matrixWorldNeedsUpdate = true;
        mesh.visible = true;
      }
      for (let k = used; k < DIGIT_POOL; k++) digitPlates[k].visible = false;
      digitShown = used;
    }

    
    
    const L = KB.whiteLen, halfPitch = (KB.x[highM] - KB.x[lowM]) / (whites.length - 1) / 2;
    const xLo = KB.x[lowM] - halfPitch, xHi = KB.x[highM] + halfPitch;
    
    const EDGES = new Float32Array(whites.length + 1);
    EDGES[0] = xLo; EDGES[whites.length] = xHi;
    for (let i = 1; i < whites.length; i++) EDGES[i] = (KB.x[whites[i - 1]] + KB.x[whites[i]]) / 2;
    
    const cutPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e7);
    renderer.localClippingEnabled = true;
    const bodyMat = keep(new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.55, metalness: 0, side: THREE.DoubleSide, clippingPlanes: [cutPlane] }));
    const feltMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a2836, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, clippingPlanes: [cutPlane] }));
    const box = (x0, x1, y0, y1, z0, z1, mat) => {
      const m = new THREE.Mesh(keep(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0)), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      kbGroup.add(m);
      return m;
    };
    
    const bodyParts = [];
    if (!opts.bare) {
      bodyParts.push(box(xLo - 4, xHi + 4, -WHITE_H - 14, -WHITE_H - 2, -L - 50, 4, bodyMat));         
      bodyParts.push(box(xLo - 30, xHi + 30, -WHITE_H - 30, -WHITE_H + 6, 3, 20, bodyMat));            
      bodyParts.push(box(xLo - 30, xHi + 30, -WHITE_H - 30, 36, -L - 40, -L - 4, bodyMat));            
      bodyParts.push(box(xLo - 4, xHi + 4, -2, 5, -L - 4, -L - 1, feltMat));                           
      bodyParts.push(box(xLo - 30, xLo - 3, -WHITE_H - 30, 30, -L - 40, 20, bodyMat));                 
      bodyParts.push(box(xHi + 3, xHi + 30, -WHITE_H - 30, 30, -L - 40, 20, bodyMat));
    }

    
    let ROT = null, rotFrom = media && opts.rotName ? 'loading' : 'positions';
    if (rotFrom === 'loading') {
      Promise.resolve().then(() => media(opts.rotName)).then((buf) => {
        if (destroyed) return;
        const n = Math.floor(buf.byteLength / 2), src = hands();
        ROT = new Int16Array(buf, 0, n - (n % ROT_PER_FRAME));
        rotFrom = 'file';
        
        if (src && ROT.length !== (src.H.length / PER_FRAME) * ROT_PER_FRAME) {
          console.info(`MVGhost: ${opts.rotName} has ${ROT.length / ROT_PER_FRAME} frames, hands.bin ${src.H.length / PER_FRAME}, so the hands' bones are oriented from the joint positions.`);
          ROT = null; rotFrom = 'positions';
        }
        redraw();
      }).catch((e) => {
        rotFrom = 'positions';
        console.info(`MVGhost: the joint rotations did not load (${(e && e.message) || e}), so the hands' bones are oriented from the joint positions.`);
      });
    }

    
    
    
    const KROW = [7, 12, 17, 22];
    const GUIDE_N = 14, GUIDE_HALF = 0.5;
    const guidePos = new THREE.BufferAttribute(new Float32Array(GUIDE_N * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const guideGeo = keep(new THREE.BufferGeometry());
    guideGeo.setAttribute('position', guidePos);
    const gIdx = [];
    for (let k = 0; k < GUIDE_N; k++) { const o = k * 4; gIdx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    guideGeo.setIndex(gIdx);
    const guideMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    const guide = new THREE.Mesh(guideGeo, guideMat);
    guide.frustumCulled = false; guide.visible = false; guide.renderOrder = ORDER.guide;
    scene.add(guide);
    function guideFor(hd) {
      const J = hd.J, A = guidePos.array;
      let kx = 0, ky = 0, kz = 0;
      for (const j of KROW) { kx += J[j * 3]; ky += J[j * 3 + 1]; kz += J[j * 3 + 2]; }
      kx /= 4; ky /= 4; kz /= 4;
      const z1 = Math.max(J[2], kz) + 40;                  
      for (let k = 0; k < GUIDE_N; k++) {
        const a = kz + ((z1 - kz) * k) / GUIDE_N, b = kz + ((z1 - kz) * (k + 0.55)) / GUIDE_N, o = k * 12;
        A[o] = kx; A[o + 1] = ky + GUIDE_HALF; A[o + 2] = a;
        A[o + 3] = kx; A[o + 4] = ky - GUIDE_HALF; A[o + 5] = a;
        A[o + 6] = kx; A[o + 7] = ky + GUIDE_HALF; A[o + 8] = b;
        A[o + 9] = kx; A[o + 10] = ky - GUIDE_HALF; A[o + 11] = b;
      }
      guidePos.needsUpdate = true;
      guideMat.opacity = 0.8 * hd.alpha;
    }

    
    
    
    
    
    const ft = (k) => D.t0 + k / D.fps;
    function scan(src) {
      const H = src.H, n = src.frames;
      for (const hd of HANDS) {
        const ho = hd.h * PER_HAND, valid = new Uint8Array(n), gaps = [], bridges = [], bridgeAt = new Int32Array(n).fill(-1);
        let open = -2, last = -1;                           
        for (let k = 0; k < n; k++) {
          const o = k * PER_FRAME + ho;
          const x = (H[o + 1] / 200) * W, d = H[o + 2] / 10, hh = H[o + 3] / 10;
          const ok = H[o] !== 0 && Math.abs(x) <= WRIST_BOX.maxAbsX && hh >= WRIST_BOX.minH && hh <= WRIST_BOX.maxH && d >= WRIST_BOX.minD && d <= WRIST_BOX.maxD;
          valid[k] = ok ? 1 : 0;
          if (!ok && open < -1) open = k;
          if (ok && open > -2) {
            const from = open === 0 ? -Infinity : ft(open), to = ft(k), held = open > 0 && to - from <= HOLD_THROUGH_S + 1e-6;
            gaps.push({ from, to, held });
            if (held && last >= 0) { bridges.push({ a: last, b: k }); for (let q = last; q < k; q++) bridgeAt[q] = bridges.length - 1; }
            open = -2;
          }
          if (ok) last = k;
        }
        if (open > -2) gaps.push({ from: open === 0 ? -Infinity : ft(open), to: Infinity, held: false });
        Object.assign(hd, { valid, gaps, bridges, bridgeAt, posed: false });
      }
      let both = -1;
      for (let k = 0; k < n && both < 0; k++) if (HANDS[0].valid[k] && HANDS[1].valid[k]) both = k;
      for (const hd of HANDS) {
        let s = 1;
        if (both >= 0) {
          joints(hd, H, both, both, 0);
          const rig = chainLength(hd.rest, 3) * 1000;
          s = rig > 0 ? clamp(chainLength(hd.X, XS) / rig, FIT_SCALE_RANGE[0], FIT_SCALE_RANGE[1]) : 1;
        }
        hd.scale = s;
        for (const b of hd.bones) b.scale.setScalar(s);    
        hd.posed = false;
      }
    }
    
    const rotThere = (o) => ROT[o] !== 0 || ROT[o + 1] !== 0 || ROT[o + 2] !== 0 || ROT[o + 3] !== 0;
    
    
    
    function joints(hd, H, a, b, w) {
      const off = D.offs[hd.lab], al = off[0], de = off[1], he = off[2];
      const oa = a * PER_FRAME + hd.h * PER_HAND + 1, ob = b * PER_FRAME + hd.h * PER_HAND + 1, J = hd.J, X = hd.X;
      for (let j = 0; j < 26; j++) {
        const pa = oa + j * 3, pb = ob + j * 3;
        const u = (H[pa] + (H[pb] - H[pa]) * w) / 200, dep = (H[pa + 1] + (H[pb + 1] - H[pa + 1]) * w) / 10, hei = (H[pa + 2] + (H[pb + 2] - H[pa + 2]) * w) / 10;
        J[j * 3] = u * W + al; J[j * 3 + 1] = hei + he; J[j * 3 + 2] = -(dep + de);
      }
      for (let i = 0; i < XR; i++) { const j = XR_FROM_GRP[i] * 3, o = i * XS; X[o] = J[j]; X[o + 1] = J[j + 1]; X[o + 2] = J[j + 2]; }
      const ra = (a * 2 + hd.h) * XR * 4, rb = (b * 2 + hd.h) * XR * 4;
      if (ROT && ROT.length === (H.length / PER_FRAME) * ROT_PER_FRAME && rotThere(ra) && rotThere(rb)) {
        for (let i = 0; i < XR; i++) {
          const qa = ra + i * 4, qb = rb + i * 4, o = i * XS;
          let bx = ROT[qb], by = ROT[qb + 1], bz = ROT[qb + 2], bw = ROT[qb + 3];
          if (ROT[qa] * bx + ROT[qa + 1] * by + ROT[qa + 2] * bz + ROT[qa + 3] * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
          const x = ROT[qa] + (bx - ROT[qa]) * w, y = ROT[qa + 1] + (by - ROT[qa + 1]) * w, z = ROT[qa + 2] + (bz - ROT[qa + 2]) * w, q = ROT[qa + 3] + (bw - ROT[qa + 3]) * w;
          const inv = 1 / (Math.hypot(x, y, z, q) || 1);
          X[o + 3] = x * inv; X[o + 4] = y * inv; X[o + 5] = z * inv; X[o + 6] = q * inv;
        }
      } else orientFromPositions(X, hd.lab);
    }
    
    function gapStart(hd, t) {
      const G = hd.gaps;
      let a = 0, b = G.length;
      while (a < b) { const k = (a + b) >> 1; if (G[k].to <= t - REACQUIRE_FADE_S) a = k + 1; else b = k; }
      return a;
    }
    
    
    function opacityFrom(hd, t) {
      let o = 1;
      for (let i = gapStart(hd, t); i < hd.gaps.length; i++) {
        const g = hd.gaps[i];
        if (g.from > t + LOSS_FADE_S) break;
        if (g.held) continue;
        if (t >= g.from && t < g.to) return 0;
        if (t >= g.to) o = Math.min(o, (t - g.to) / REACQUIRE_FADE_S);
        else o = Math.min(o, (g.from - t) / LOSS_FADE_S);
      }
      return clamp(o, 0, 1);
    }
    
    
    
    function poseAt(hd, t, src) {
      if (!src || !hd.valid) { hd.alpha = 0; return; }
      const n = src.frames;
      const f = clamp((t - D.t0) * D.fps, 0, n - 1), k = Math.floor(f), w = f - k;
      let a = -1, b = -1, ww = 0;
      const bi = hd.bridgeAt[k];
      if (bi >= 0) { const B = hd.bridges[bi]; a = B.a; b = B.b; ww = clamp((f - B.a) / (B.b - B.a), 0, 1); }
      else if (hd.valid[k]) { a = k; b = k + 1 < n && hd.valid[k + 1] ? k + 1 : k; ww = b === k ? 0 : w; }
      if (a >= 0) {
        joints(hd, src.H, a, b, ww);
        const X = hd.X;
        for (let i = 0; i < XR; i++) {
          const o = i * XS;
          hd.bones[i].position.set(X[o] / 1000, X[o + 1] / 1000, X[o + 2] / 1000);
          hd.bones[i].quaternion.set(X[o + 3], X[o + 4], X[o + 5], X[o + 6]);
        }
        hd.cx = hd.J[3]; hd.cy = hd.J[4]; hd.cz = hd.J[5];
        hd.posed = true;
      }
      hd.alpha = hd.posed ? Math.min(opacityFrom(hd, t), clamp((goneS - t) / HAND_FADE_S, 0, 1)) : 0;
    }

    

    
    
    
    const press = new Float32Array(128), litNow = new Uint8Array(128), glowNow = new Uint8Array(128);
    const shownP = new Float32Array(128).fill(-1), shownL = new Int8Array(128).fill(-1), shownV = new Int8Array(128).fill(-1);
    const cut = { side: 0, xl: 0 };                      
    const fb = { lit: 0, glow: 0, dropped: 0 };          
    
    
    
    
    
    
    
    const KE = D.keyEvents || [];
    const phase = new Uint8Array(128), since = new Float64Array(128), heldK = new Uint8Array(128);
    let cursor = 0, lastT = -Infinity;
    const settle = (m, t) => { if (phase[m] === 2 && !heldK[m] && t >= since[m] + KEY_UP_S) { phase[m] = 0; since[m] += KEY_UP_S; } };
    function motion(t) {
      if (t < lastT) { cursor = 0; phase.fill(0); since.fill(0); heldK.fill(0); }
      lastT = t;
      while (cursor < KE.length && KE[cursor][0] <= t) {
        const e = KE[cursor++], te = e[0], m = e[2];
        if (!(m >= lowM && m <= highM)) continue;          
        settle(m, te);
        if (e[1]) { if (phase[m] === 0) { phase[m] = 1; since[m] = te; } heldK[m] = 1; }
        else { if (phase[m] === 1) { phase[m] = 2; since[m] = te; } heldK[m] = 0; }
      }
      for (let m = lowM; m <= highM; m++) {
        settle(m, t);
        const ph = phase[m];
        press[m] = ph === 1 ? evalCurve(KEY_DOWN_CURVE, t - since[m]) / KEY_DOWN_DEG : ph === 2 ? evalCurve(KEY_UP_CURVE, t - since[m]) / KEY_DOWN_DEG : 0;
      }
    }
    function keys(t) {
      D.keyStates(t, litNow, glowNow);
      motion(t);
      let dw = false, db = false, litW = 0, litB = 0;
      for (let m = lowM; m <= highM; m++) {
        const p = press[m], vis = cut.side && cut.side * (KB.x[m] - cut.xl) > 0 ? 0 : 1, l = vis ? litNow[m] : 0, blk = isBlack(m);
        if (l) { if (blk) litB++; else litW++; }
        if (Math.abs(p - shownP[m]) < 0.004 && l === shownL[m] && vis === shownV[m]) continue;
        shownP[m] = p; shownL[m] = l; shownV[m] = vis;
        const K = blk ? BK : WK, i = slot[m];
        if (vis) keyMatrix(K.mesh.instanceMatrix.array, i, m, p);
        else K.mesh.instanceMatrix.array.fill(0, i * 16, i * 16 + 16);
        K.lit.array[i] = l;
        if (blk) db = true; else dw = true;
      }
      if (dw) touched(WK);
      if (db) touched(BK);
      WK.overlay.visible = !depthKeys && litW > 0; BK.overlay.visible = !depthKeys && litB > 0;
      fb.lit = litW + litB;
      
      
      let n = 0, dropped = 0;
      if (glow) {
        const arr = glow.instanceMatrix.array;
        for (let m = lowM; m <= highM; m++) {
          if (!glowNow[m] || !shownV[m]) continue;
          if (n < glowPool) glowMatrix(arr, 16 * n++, m, shownP[m]); else dropped++;
        }
        if (n > 0) { glow.count = n; glow.instanceMatrix.needsUpdate = true; }
        glow.visible = n > 0;
        glow.material.uniforms.uTime.value = t;
      }
      fb.glow = n;
      if (dropped > fb.dropped) { fb.dropped = dropped; console.warn(`MVGhost: ${dropped} glows did not fit the pool of ${glowPool}.`); }
    }
    function touched(K) { K.mesh.instanceMatrix.needsUpdate = true; K.lit.needsUpdate = true; }

    

    
    
    
    
    const READ_POOL = 20, READ_MM = 17;                
    const readMats = new Map();
    function readMaterial(text, hand) {
      const k = text + hand;
      if (readMats.has(k)) return readMats.get(k);
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d'), unsure = text === '?';
      g.fillStyle = 'rgba(21, 20, 19, 0.85)'; g.beginPath(); g.arc(32, 32, 29, 0, 7); g.fill();
      g.lineWidth = 5; g.strokeStyle = unsure ? '#9CA3AF' : (COL[hand] || '#F3F4F6'); g.stroke();
      g.fillStyle = unsure ? '#D1D5DB' : '#FFFFFF'; g.font = '800 38px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 32, 34);
      const tx = keep(new THREE.CanvasTexture(c));
      tx.colorSpace = THREE.SRGBColorSpace;
      const mat = keep(new THREE.SpriteMaterial({ map: tx, depthTest: false, depthWrite: false, transparent: true }));
      readMats.set(k, mat);
      return mat;
    }
    const readSprites = [];
    if (D.fingering) {
      for (let i = 0; i < READ_POOL; i++) {
        const sp = new THREE.Sprite(readMaterial('?', 'R'));
        sp.scale.set(READ_MM, READ_MM, 1);
        sp.visible = false;
        sp.renderOrder = ORDER.guide - 1;
        kbGroup.add(sp);
        readSprites.push(sp);
      }
    }
    let readShown = 0, readNow = [];                  
    const firstOnOrAfter = (N, t) => { let a = 0, b = N.length; while (a < b) { const k = (a + b) >> 1; if (N[k].on < t) a = k + 1; else b = k; } return a; };
    function readDigits(t) {
      readNow = [];
      if (!readSprites.length) return;
      const N = D.notes || [];
      let n = 0;
      for (let k = firstOnOrAfter(N, t - (D.maxLen || 0) - 0.2); k < N.length && N[k].on <= t; k++) {
        const x = N[k];
        
        if (!x.fing || t >= x.off || !litNow[x.m] || !shownV[x.m] || n >= READ_POOL || (digitPlates && digitNext[x.m] >= 0)) continue;
        const sp = readSprites[n++];
        sp.material = readMaterial(x.fing, x.hand);
        sp.position.set(KB.x[x.m], KB.top[x.m] + READ_MM * 0.9, KB.front[x.m] - (isBlack(x.m) ? 14 : 24));
        sp.visible = true;
        readNow.push([x.m, x.fing]);
      }
      for (let i = n; i < readShown; i++) readSprites[i].visible = false;
      readShown = n;
    }

    

    
    
    
    const STEP = 3;
    let track = null;
    const near = (y, z) => y > -45 && y < 170 && z > -170 && z < 260;      
    function buildTrack(src) {
      const H = src.H, n = src.frames, ns = Math.max(1, Math.ceil(n / STEP));
      const per = [0, 1].map(() => ({ x: new Float32Array(ns), y: new Float32Array(ns), z: new Float32Array(ns), ok: new Uint8Array(ns), any: false }));
      for (let s = 0; s < ns; s++) {
        const i = Math.min(n - 1, s * STEP);
        for (let h = 0; h < 2; h++) {
          const o = i * PER_FRAME + h * PER_HAND, P = per[h], lab = h ? 'R' : 'L';
          if (!H[o]) continue;
          const [al, de, he] = D.offs[lab];
          const x = (H[o + 4] / 200) * W + al, y = H[o + 6] / 10 + he, z = -(H[o + 5] / 10 + de);   
          if (!near(y, z)) continue;
          P.x[s] = x; P.y[s] = y; P.z[s] = z; P.ok[s] = 1; P.any = true;
        }
      }
      for (const P of per) {
        if (!P.any) continue;
        let last = -1;
        for (let s = 0; s < ns; s++) {
          if (P.ok[s]) { if (last < s - 1) for (let k = last + 1; k < s; k++) { const src2 = last < 0 ? s : last; const w = last < 0 ? 0 : (k - last) / (s - last); P.x[k] = P.x[src2] + (P.x[s] - P.x[src2]) * w; P.y[k] = P.y[src2] + (P.y[s] - P.y[src2]) * w; P.z[k] = P.z[src2] + (P.z[s] - P.z[src2]) * w; } last = s; }
        }
        for (let k = last + 1; k < ns; k++) { P.x[k] = P.x[last]; P.y[k] = P.y[last]; P.z[k] = P.z[last]; }
      }
      const sps = D.fps / STEP;                            
      const cx = new Float32Array(ns), span = new Float32Array(ns), win = Math.max(1, Math.round(0.8 * sps));
      const present = per.filter((P) => P.any);
      for (let s = 0; s < ns; s++) {
        let lo = Infinity, hi = -Infinity;
        for (let q = Math.max(0, s - win), qe = Math.min(ns - 1, s + win); q <= qe; q++) {
          for (const P of present) { const x = P.x[q]; if (x < lo) lo = x; if (x > hi) hi = x; }
        }
        if (lo > hi) { cx[s] = rangeCx; span[s] = 0; } else { cx[s] = (lo + hi) / 2; span[s] = hi - lo; }
      }
      const blur = (a, sigmaS) => {
        const r = Math.ceil(sigmaS * 3), wts = new Float32Array(2 * r + 1), out = new Float32Array(a.length);
        for (let k = -r; k <= r; k++) wts[k + r] = Math.exp(-(k * k) / (2 * sigmaS * sigmaS));
        for (let s = 0; s < a.length; s++) {
          let acc = 0, ws = 0;
          for (let k = -r; k <= r; k++) { const q = s + k; if (q < 0 || q >= a.length) continue; acc += a[q] * wts[k + r]; ws += wts[k + r]; }
          out[s] = acc / ws;
        }
        return out;
      };
      track = {
        ns, cx: blur(cx, 0.5 * sps), span: blur(span, 0.5 * sps),
        hand: per.map((P) => (P.any ? { x: blur(P.x, 0.5 * sps), y: blur(P.y, 0.5 * sps), z: blur(P.z, 0.5 * sps) } : null)),
      };
    }
    const at = (arr, t) => {
      const f = clamp(((t - D.t0) * D.fps) / STEP, 0, track.ns - 1), i = Math.floor(f), w = f - i;
      return i + 1 < track.ns ? arr[i] + (arr[i + 1] - arr[i]) * w : arr[i];
    };
    const r0 = Math.min(D.range[0], D.range[1]), r1 = Math.max(D.range[0], D.range[1]);
    const rangeCx = ((keyU(r0) + keyU(r1)) / 2) * W, rangeHalf = ((keyU(r1) - keyU(r0)) / 2 + 2) * W;
    const pianoLo = (keyU(lowM) - 0.5) * W, pianoHi = (keyU(highM) + 0.5) * W;

    const V = { view: 'player', hand: 'R', focus: null };
    const pose = { p: new THREE.Vector3(), q: new THREE.Vector3(), fov: 40 };
    const want = { p: new THREE.Vector3(), q: new THREE.Vector3(), fov: 40 };
    const from = { p: new THREE.Vector3(), q: new THREE.Vector3(), fov: 40 };
    let move = null, posed = false;                        
    let aspect = 2, held = null, heldT = -1;
    const held0 = { cx: 0, span: 0 };
    
    
    
    const cu = opts.closeUp, cuOk = cu && Number.isFinite(+cu.lo) && Number.isFinite(+cu.hi);
    const closeUp = cuOk ? { cx: ((keyU(Math.round(+cu.lo)) + keyU(Math.round(+cu.hi))) / 2) * W, span: (Math.abs(keyU(Math.round(+cu.hi)) - keyU(Math.round(+cu.lo))) + 1) * W } : null;
    function playerPose(t, playing, out) {
      let cx = rangeCx, span = Math.min(2 * rangeHalf, 14 * W);
      if (closeUp) { cx = closeUp.cx; span = closeUp.span; } else if (track) { cx = at(track.cx, t); span = at(track.span, t); }
      
      
      
      const vfov = clamp((2 * Math.atan(Math.tan((31 * Math.PI) / 180) / aspect) * 180) / Math.PI, 24, 56);
      const hfov = 2 * Math.atan(Math.tan((vfov * Math.PI) / 360) * aspect);
      const k = clamp(aspect / 2, 0.72, 1);
      
      
      const halfW = (sp) => clamp(sp / 2 + 230 * k, 300 * k, Math.max(300 * k, rangeHalf + 120));
      
      const fh = V.focus === 'L' ? 0 : V.focus === 'R' ? 1 : -1;
      if (!closeUp && fh >= 0 && track && track.hand[fh]) { const hx = at(track.hand[fh].x, t), m = Math.max(0, halfW(span) - 200); cx = clamp(cx, hx - m, hx + m); }
      
      if (reduce.matches) {
        if (!held || !playing || Math.abs(t - heldT) > 0.6) { held0.cx = cx; held0.span = span; held = held0; }
        heldT = t; cx = held.cx; span = held.span;
      }
      const hw = closeUp ? Math.max(120, span / 2 + 70) : halfW(span);   
      cx = clamp(cx, pianoLo + hw * 0.55, pianoHi - hw * 0.55);
      
      const dist = Math.max(hw / Math.tan(hfov / 2), 150 / Math.tan((vfov * Math.PI) / 360)), el = (60 * Math.PI) / 180;
      
      
      const tall = closeUp ? clamp((1.4 - aspect) / 0.6, 0, 1) : 0, d = dist * (1 - 0.4 * tall), qz = 14 + 80 * tall;
      out.q.set(cx, 32, qz);
      out.p.set(cx, 32 + d * Math.sin(el), qz + d * Math.cos(el));
      squareToKeys(out);
      out.fov = vfov;
    }
    
    
    function squareToKeys(out) {
      if (!KB.yaw) return;
      const dx = out.p.x - out.q.x, dz = out.p.z - out.q.z;
      out.p.x = out.q.x + dx * KB.cos + dz * KB.sin;
      out.p.z = out.q.z - dx * KB.sin + dz * KB.cos;
    }
    
    
    
    const sideAt = { x: 0, y: 0, z: 0 };
    function sideCentre(t) {
      const hd = HANDS[V.hand === 'L' ? 0 : 1], tr = track && track.hand[hd.h];
      if (tr) { sideAt.x = at(tr.x, t); sideAt.y = at(tr.y, t); sideAt.z = at(tr.z, t); }
      else if (hd.alpha > 0) { sideAt.x = hd.cx; sideAt.y = hd.cy; sideAt.z = hd.cz; }
      else { sideAt.x = rangeCx; sideAt.y = 50; sideAt.z = 50; }
      return sideAt;
    }
    function sidePose(t, out) {
      const c = sideCentre(t);
      const vfov = clamp((2 * Math.atan(Math.tan((12 * Math.PI) / 180) / Math.max(1, aspect / 2.2)) * 180) / Math.PI, 16, 30);
      const hfov = 2 * Math.atan(Math.tan((vfov * Math.PI) / 360) * aspect);
      
      const dist = Math.max(95 / Math.tan((vfov * Math.PI) / 360), (aspect < 1.8 ? 130 : 150) / Math.tan(hfov / 2));
      const side = V.hand === 'L' ? -1 : 1, el = (4 * Math.PI) / 180, yaw = (9 * Math.PI) / 180;
      out.q.set(c.x, clamp(c.y * 0.85 + 6, 22, 90), clamp(c.z - (aspect < 1.8 ? 12 : 30), -40, 70));
      out.p.set(out.q.x + side * dist * Math.cos(el) * Math.cos(yaw), out.q.y + dist * Math.sin(el), out.q.z + dist * Math.cos(el) * Math.sin(yaw));
      out.fov = vfov;
      squareToKeys(out);
    }
    
    function cutFor(t) {
      if (V.view !== 'side') { cut.side = 0; cutPlane.constant = 1e7; return; }
      const side = V.hand === 'L' ? -1 : 1, c = sideCentre(t), want = localX(c.x, c.z) + side * CUT_MM;
      let best = EDGES[0];
      for (let i = 1; i < EDGES.length; i++) if (Math.abs(EDGES[i] - want) < Math.abs(best - want)) best = EDGES[i];
      cut.side = side; cut.xl = best;
      
      cutPlane.normal.set(-side * KB.cos, 0, side * KB.sin);
      cutPlane.constant = side * (KB.origin[0] * KB.cos - KB.origin[2] * KB.sin + best);
    }
    
    
    
    const footCam = typeof opts.camera === 'function' ? opts.camera : null;
    let footSeen = true;
    function camera(t, playing, now) {
      if (footCam) {
        const c = footCam(t);
        footSeen = !!(c && c.proj && c.view);
        if (footSeen) {
          cam.matrixAutoUpdate = false;
          cam.projectionMatrix.fromArray(c.proj);
          cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
          cam.matrixWorldInverse.fromArray(c.view);
          cam.matrix.copy(cam.matrixWorldInverse).invert();
          cam.matrixWorld.copy(cam.matrix);
          cam.matrixWorldNeedsUpdate = false;
          cam.matrix.decompose(cam.position, cam.quaternion, cam.scale);   
          cam.fov = (2 * Math.atan(1 / c.proj[5]) * 180) / Math.PI;
        }
        posed = true;
        return;
      }
      if (V.view === 'side') sidePose(t, want); else playerPose(t, playing, want);
      if (orbitOn && V.view === 'player') applyOrbit(want, orbitNow(now));
      if (move) {
        const k = smooth((now - move.t0) / move.ms);
        pose.p.copy(from.p).lerp(want.p, k); pose.q.copy(from.q).lerp(want.q, k); pose.fov = from.fov + (want.fov - from.fov) * k;
        if (k >= 1) move = null; else redraw();
      } else { pose.p.copy(want.p); pose.q.copy(want.q); pose.fov = want.fov; }
      posed = true;
      cam.position.copy(pose.p);
      cam.lookAt(pose.q);
      if (cam.fov !== pose.fov || cam.aspect !== aspect) { cam.fov = pose.fov; cam.aspect = aspect; cam.updateProjectionMatrix(); }
    }

    

    const orbitOn = !!opts.orbit;
    const O = { yaw: 0, pitch: 0, zoom: 1, px: 0, py: 0 };
    const O_ZOOM = [0.18, 2.2], O_PITCH = [-0.99, 0.45], O_PAN = 420;        
    let oAnim = null, wasMoved = false;
    const orbitMoved = () => O.yaw !== 0 || O.pitch !== 0 || O.zoom !== 1 || O.px !== 0 || O.py !== 0;
    const wrapPi = (a) => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    function orbitSet(o) {
      if (!o || typeof o !== 'object') return;
      const n = (k, d) => (Number.isFinite(o[k]) ? o[k] : d);
      O.yaw = wrapPi(n('yaw', O.yaw)); O.pitch = clamp(n('pitch', O.pitch), O_PITCH[0], O_PITCH[1]);
      O.zoom = clamp(n('zoom', O.zoom), O_ZOOM[0], O_ZOOM[1]);
      O.px = clamp(n('px', O.px), -O_PAN, O_PAN); O.py = clamp(n('py', O.py), -O_PAN, O_PAN);
    }
    if (orbitOn && opts.orbitStart) { orbitSet(opts.orbitStart); wasMoved = orbitMoved(); }
    function orbitChanged() {
      ariaAt = 0;
      redraw();
      const m = orbitMoved();
      wasMoved = m;
      if (typeof opts.onOrbit === 'function') { try { opts.onOrbit(m, { ...O }); } catch (e) { console.warn('MVGhost onOrbit:', e); } }
    }
    const ov = { f: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3() };
    
    
    function applyOrbit(out, o) {
      if (!o.yaw && !o.pitch && o.zoom === 1 && !o.px && !o.py) return;
      const ox = out.p.x - out.q.x, oy = out.p.y - out.q.y, oz = out.p.z - out.q.z, r = Math.hypot(ox, oy, oz) || 1;
      const el = clamp(Math.asin(clamp(oy / r, -1, 1)) + o.pitch, 0.05, 1.5), az = Math.atan2(ox, oz) + o.yaw, rr = r * o.zoom;
      const hx = Math.cos(el) * Math.sin(az), hy = Math.sin(el), hz = Math.cos(el) * Math.cos(az);
      const f = ov.f.set(-hx, -hy, -hz), rt = ov.r.set(-f.z, 0, f.x).normalize(), up = ov.u.crossVectors(rt, f);
      out.q.set(out.q.x + rt.x * o.px + up.x * o.py, clamp(out.q.y + up.y * o.py, -80, 400), out.q.z + rt.z * o.px + up.z * o.py);
      out.p.set(out.q.x + rr * hx, out.q.y + rr * hy, out.q.z + rr * hz);
    }
    const oTmp = { yaw: 0, pitch: 0, zoom: 1, px: 0, py: 0 };
    
    function orbitNow(now) {
      if (!oAnim) return O;
      const k = smooth((now - oAnim.t0) / oAnim.ms), f = oAnim.from;
      if (k >= 1) { O.yaw = O.pitch = O.px = O.py = 0; O.zoom = 1; oAnim = null; orbitChanged(); return O; }
      oTmp.yaw = f.yaw * (1 - k); oTmp.pitch = f.pitch * (1 - k); oTmp.px = f.px * (1 - k); oTmp.py = f.py * (1 - k); oTmp.zoom = f.zoom + (1 - f.zoom) * k;
      redraw();
      return oTmp;
    }
    function resetView(animate) {
      if (!orbitMoved() || oAnim) return;
      if (animate && !reduce.matches && posed) { oAnim = { t0: performance.now(), ms: 450, from: { ...O } }; redraw(); return; }
      O.yaw = O.pitch = O.px = O.py = 0; O.zoom = 1;
      orbitChanged();
    }
    if (orbitOn) {
      canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab'; canvas.tabIndex = 0;
      canvas.setAttribute('role', 'application'); canvas.setAttribute('aria-roledescription', '3D view of the hands');
      const ptrs = new Map();
      let prev = null, tapAt = 0, tapDown = null;
      const mid = () => { let x = 0, y = 0; for (const q of ptrs.values()) { x += q.x; y += q.y; } return { x: x / ptrs.size, y: y / ptrs.size }; };
      const gap = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
      
      const mmPerPx = () => (2 * Math.tan((pose.fov * Math.PI) / 360) * Math.hypot(pose.p.x - pose.q.x, pose.p.y - pose.q.y, pose.p.z - pose.q.z)) / Math.max(1, cssH);
      const zoomBy = (f) => orbitSet({ zoom: O.zoom * f });
      const panBy = (dx, dy) => { const k = mmPerPx(); orbitSet({ px: O.px - dx * k, py: O.py + dy * k }); };
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('pointerdown', (e) => {
        if (FOOT || (e.pointerType === 'mouse' && e.button > 2)) return;
        oAnim = null;
        try { canvas.setPointerCapture(e.pointerId); } catch {   }
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 1 || e.button === 2 || e.shiftKey });
        tapDown = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), moved: false } : null;
        prev = ptrs.size === 2 ? { d: gap(), m: mid() } : null;
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
      });
      canvas.addEventListener('pointermove', (e) => {
        const q = ptrs.get(e.pointerId);
        if (!q) return;
        const dx = e.clientX - q.x, dy = e.clientY - q.y;
        q.x = e.clientX; q.y = e.clientY;
        if (tapDown && Math.hypot(e.clientX - tapDown.x, e.clientY - tapDown.y) > 8) tapDown.moved = true;
        if (ptrs.size === 1) {
          
          if (q.pan) panBy(dx, dy); else orbitSet({ yaw: O.yaw - dx * 0.008, pitch: O.pitch + dy * 0.006 });
        } else if (ptrs.size === 2 && prev) {
          const d = gap(), m = mid();
          zoomBy(prev.d / d); panBy(m.x - prev.m.x, m.y - prev.m.y);
          prev = { d, m };
        }
        orbitChanged();
      });
      const up = (e) => {
        if (!ptrs.delete(e.pointerId)) return;
        try { canvas.releasePointerCapture(e.pointerId); } catch {   }
        canvas.style.cursor = 'grab';
        prev = ptrs.size === 2 ? { d: gap(), m: mid() } : null;
        const now = performance.now();
        if (tapDown && !tapDown.moved && ptrs.size === 0 && now - tapDown.t < 300) {
          if (now - tapAt < 400) { tapAt = 0; resetView(true); } else tapAt = now;          
        }
        if (ptrs.size === 0) tapDown = null;
      };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', (e) => {
        if (FOOT) return;
        e.preventDefault();
        oAnim = null;
        zoomBy(Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.0016)));
        orbitChanged();
      }, { passive: false });
      canvas.addEventListener('keydown', (e) => {
        const k = e.key;
        if (FOOT) return;
        if (k === '0' || k === 'Home') { e.preventDefault(); resetView(true); return; }
        if (k === 'ArrowLeft') orbitSet({ yaw: O.yaw + 0.12 });
        else if (k === 'ArrowRight') orbitSet({ yaw: O.yaw - 0.12 });
        else if (k === 'ArrowUp') orbitSet({ pitch: O.pitch - 0.08 });
        else if (k === 'ArrowDown') orbitSet({ pitch: O.pitch + 0.08 });
        else if (k === '+' || k === '=') zoomBy(0.85);
        else if (k === '-' || k === '_') zoomBy(1.18);
        else return;
        e.preventDefault();
        oAnim = null;
        orbitChanged();
      });
    }

    

    let ariaAt = 0, ariaText = '';
    function describe(t) {
      const parts = [V.view === 'side' ? `From the side, at the ${V.hand === 'L' ? 'left' : 'right'} hand: the wrist against the knuckles.`
        : orbitOn ? `The keyboard in 3D${orbitMoved() ? ', turned by you' : ', as the player sees it'}. Drag to turn the view, pinch or scroll to zoom, double tap to put it back.` : "The player's view of the keyboard."];
      for (const hd of HANDS) {
        const name = hd.lab === 'L' ? 'left' : 'right';
        parts.push(hd.alpha > 0 ? `The ${name} hand is around ${noteName(whiteAt((hd.J[3] - D.offs[hd.lab][0]) / W))}.`
          : t >= goneS ? `The ${name} hand is not shown after the last note.` : `The ${name} hand is not tracked here.`);
      }
      
      const on = [];
      for (let m = lowM; m <= highM && on.length < 8; m++) if (litNow[m]) on.push(noteName(m));
      parts.push(on.length ? `Held down, in white: ${on.join(', ')}.` : 'No key is down.');
      
      if (readNow.length) {
        const F = D.fingering || {}, rd = readNow.slice().sort((a, b) => a[0] - b[0]).slice(0, 8);
        parts.push(`Fingers as the hand tracking read them${F.stage === 'shown' ? ', not judged' : ''}: `
          + `${rd.map(([m, f]) => `${noteName(m)} ${f === '?' ? 'could not tell' : `finger ${f}`}`).join(', ')}.`);
      }
      return parts.join(' ');
    }

    

    let cssW = 0, cssH = 0, visible = true, lost = false, destroyed = false;
    const stats = { frames: 0, ms: 0 };
    let io = null;
    if (window.IntersectionObserver) {
      io = new IntersectionObserver((es) => { const v = es[es.length - 1].isIntersecting; if (v && !visible) { visible = true; redraw(); } else visible = v; });
      io.observe(canvas);
    }
    const onLost = (e) => { e.preventDefault(); lost = true; if (typeof opts.onLost === 'function') { try { opts.onLost(); } catch (err) { console.warn('MVGhost onLost:', err); } } };
    canvas.addEventListener('webglcontextlost', onLost);
    let trackFor = null;
    const tmpV = new THREE.Vector3();
    parent.append(canvas);

    
    
    
    
    
    
    
    
    
    
    
    let FOOT = null;
    const footV = new THREE.Matrix4(), footT = new THREE.Matrix4(), footL = new THREE.Matrix4(), footF = new THREE.Matrix4().makeScale(1, -1, -1);
    const LIT_TINT = { keys: litMat.uniforms.uTint.value.toArray(), footage: [0.53, 0.24, 0.97, 0.5] };   
    const fin16 = (a) => Array.isArray(a) && a.length === 16 && a.every((v) => typeof v === 'number' && Number.isFinite(v));
    const WHITE_OF = [0, 2, 4, 5, 7, 9, 11];
    function footageOk(f) {
      const k = f && f.K;
      return !!(f && typeof f.src === 'string' && f.w > 0 && f.h > 0 && k && [k.fx, k.fy, k.cx, k.cy].every((v) => Number.isFinite(v)) && fin16(f.T));
    }
    
    function footWindow(f, lo, hi) {
      const W = (f.layout && f.layout.whiteWidth) || 23.5, L = (f.layout && f.layout.whiteLength) || 150;
      const cell = (m) => { const oct = Math.floor((m - 60) / 12), pc = ((m % 12) + 12) % 12;
        let k = WHITE_OF.indexOf(pc); if (k < 0) k = WHITE_OF.indexOf(pc - 1);
        return (oct * 7 + k) * W; };
      const x0 = cell(lo) - 2 * W, x1 = cell(hi) + 3 * W, T = f.T;
      let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
      for (const x of [x0, (x0 + x1) / 2, x1]) for (const y of [-30, L]) for (const z of [0, 110]) {
        const X = T[0] * x + T[1] * y + T[2] * z + T[3], Y = T[4] * x + T[5] * y + T[6] * z + T[7], Z = T[8] * x + T[9] * y + T[10] * z + T[11];
        if (!(Z > 1)) continue;
        const u = (f.K.fx * X) / Z + f.K.cx, v = (f.K.fy * Y) / Z + f.K.cy;
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
      if (!Number.isFinite(u0)) return { x: 0, y: 0, w: f.w, h: f.h };
      const pad = 0.08 * Math.max(u1 - u0, v1 - v0);
      u0 = Math.max(0, u0 - pad); v0 = Math.max(0, v0 - pad); u1 = Math.min(f.w, u1 + pad); v1 = Math.min(f.h, v1 + pad);
      return { x: u0, y: v0, w: Math.max(8, u1 - u0), h: Math.max(8, v1 - v0) };
    }
    function setFootage(f) {
      FOOT = footageOk(f) ? { ...f, win: footWindow(f, Math.min(D.range[0], D.range[1]), Math.max(D.range[0], D.range[1])) } : null;
      WK.setBody(!FOOT); BK.setBody(!FOOT);
      litMat.uniforms.uTint.value.fromArray(FOOT ? LIT_TINT.footage : LIT_TINT.keys);
      cam.matrixAutoUpdate = !FOOT;
      if (FOOT) {
        
        const W = (FOOT.layout && FOOT.layout.whiteWidth) || 23.5, s = W / ((KB.x[72] - KB.x[60]) / 7);
        footL.set(s, 0, 0, -s * KB.x[60] + W / 2,
          0, 0, -s, s * KB.front[60],
          0, s, 0, -s * KB.top[60],
          0, 0, 0, 1);
        footT.set(...FOOT.T);
        canvas.style.backgroundImage = `url("${FOOT.src.replace(/"/g, '%22')}")`;
        canvas.style.backgroundRepeat = 'no-repeat';
        canvas.style.cursor = 'default';
      } else {
        canvas.style.backgroundImage = '';
        if (orbitOn) canvas.style.cursor = 'grab';
      }
      redraw();
    }
    
    function footageCamera() {
      kbGroup.updateMatrixWorld(true);
      footV.copy(kbGroup.matrixWorld).invert().premultiply(footL).premultiply(footT).premultiply(footF);
      cam.matrix.copy(footV).invert();
      cam.matrixWorld.copy(cam.matrix);
      cam.matrixWorldInverse.copy(footV);
      cam.position.setFromMatrixPosition(cam.matrixWorld);
      
      const W = canvas.clientWidth || cssW, H = canvas.clientHeight || cssH;
      const wn = FOOT.win, sc = Math.min(W / wn.w, H / wn.h), ox = (W - wn.w * sc) / 2, oy = (H - wn.h * sc) / 2;
      const fx = FOOT.K.fx * sc, fy = FOOT.K.fy * sc, cx = (FOOT.K.cx - wn.x) * sc + ox, cy = (FOOT.K.cy - wn.y) * sc + oy;
      const n = 10, fa = 6000;
      cam.projectionMatrix.set(2 * fx / W, 0, 1 - 2 * cx / W, 0,
        0, 2 * fy / H, 2 * cy / H - 1, 0,
        0, 0, -(fa + n) / (fa - n), -2 * fa * n / (fa - n),
        0, 0, -1, 0);
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      cam.fov = (2 * Math.atan(H / (2 * fy)) * 180) / Math.PI;
      const key = `${W}x${H}`;
      if (FOOT.bgKey !== key) {
        FOOT.bgKey = key;
        canvas.style.backgroundSize = `${(FOOT.w * sc).toFixed(1)}px ${(FOOT.h * sc).toFixed(1)}px`;
        canvas.style.backgroundPosition = `${(ox - wn.x * sc).toFixed(1)}px ${(oy - wn.y * sc).toFixed(1)}px`;
      }
    }

    function draw(t, playing) {
      if (destroyed || lost || !cssW) return;
      const t0 = performance.now();
      const src = hands();
      if (src && src.H !== trackFor) { trackFor = src.H; buildTrack(src); scan(src); }
      for (const hd of HANDS) poseAt(hd, t, src);
      if (FOOT) footageCamera(); else camera(t, playing, t0);
      if (!visible) { ariaUpdate(t, playing, t0); return; }
      if (footCam && !footSeen) { renderer.clear(); ariaUpdate(t, playing, t0); return; }   
      const sh = HANDS[V.hand === 'L' ? 0 : 1];
      guide.visible = V.view === 'side' && sh.alpha > 0.01;
      if (guide.visible) guideFor(sh);
      cutFor(t);
      keys(t);
      digits(t);
      readDigits(t);
      
      if (!reduce.matches) smokeOffset(t0 / 1000, smokeAt);
      
      
      const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
      for (const hd of HANDS) {
        const other = V.view === 'side' && hd.lab !== V.hand;
        const dim = other ? (cut.side * (localX(hd.cx, hd.cz) - cut.xl) > -20 ? 0 : OTHER_DIM) : 1;   
        const op = hd.alpha * dim, u = hd.material.uniforms;
        u.uOpacity.value = op;
        u.uSmokeOffset.value.copy(smokeAt);
        
        
        const kc = (cam.position.distanceTo(tmpV.set(hd.cx, hd.cy, hd.cz)) * tanHalf) / QUEST_CELL_MM;
        u.uTiling.value.set((LOOK.tiling[0] * kc * aspect) / QUEST_EYE_ASPECT, LOOK.tiling[1] * kc);
        hd.mesh.visible = op > 0.001;                       
        hd.mesh.renderOrder = ORDER.hands + hd.h * 0.1;
      }
      renderer.render(scene, cam);
      ariaUpdate(t, playing, t0);
      const ms = performance.now() - t0;
      stats.frames++; stats.ms = stats.frames === 1 ? ms : stats.ms * 0.95 + ms * 0.05;
    }
    function ariaUpdate(t, playing, now) {
      if (playing && now - ariaAt < ARIA_MS) return;
      ariaAt = now;
      const s = describe(t);
      if (s !== ariaText) { ariaText = s; canvas.setAttribute('aria-label', s); }
    }

    const api = {
      canvas, stats, software: soft,
      resize(w, h) {
        if (destroyed) return;
        w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
        renderer.setPixelRatio(Math.min(maxDpr, window.devicePixelRatio || 1));
        if (w !== cssW || h !== cssH) { cssW = w; cssH = h; renderer.setSize(w, h, false); aspect = w / h; }
      },
      draw,
      setView(view, hand) {
        const v = view === 'side' ? 'side' : 'player', h = hand === 'L' || hand === 'R' ? hand : V.hand;
        if (v === V.view && h === V.hand) return;
        if (posed && !reduce.matches) { from.p.copy(pose.p); from.q.copy(pose.q); from.fov = pose.fov; move = { t0: performance.now(), ms: 700 }; }
        V.view = v; V.hand = h;
        ariaAt = 0;
        redraw();
      },
      view: () => ({ view: V.view, hand: V.hand, focus: V.focus }),
      setFootage,
      footage: () => (FOOT ? { win: { ...FOOT.win }, w: FOOT.w, h: FOOT.h, keys: KB.from, pitch: (KB.x[72] - KB.x[60]) / 7,
        front: [KB.front[60], KB.front[64], KB.front[72]], top: [KB.top[60], KB.top[64], KB.top[72]] } : null),
      orbit: () => ({ ...O, moved: orbitMoved() }),
      setOrbit(o) { if (orbitOn) { oAnim = null; orbitSet(o); orbitChanged(); } },
      resetView(animate = true) { if (orbitOn) resetView(animate); },
      setFocus(hand) {
        const f = hand === 'L' || hand === 'R' ? hand : null;
        if (f === V.focus) return;
        
        if (posed && V.view === 'player' && !reduce.matches) { from.p.copy(pose.p); from.q.copy(pose.q); from.fov = pose.fov; move = { t0: performance.now(), ms: 500 }; }
        V.focus = f;
        redraw();
      },
      state: () => ({
        
        
        fit: { L: HANDS[0].scale, R: HANDS[1].scale }, rotations: rotFrom, jointAxes: (D.stage && D.stage.jointAxes) || null,
        opacity: { L: Math.round(HANDS[0].alpha * 1000) / 1000, R: Math.round(HANDS[1].alpha * 1000) / 1000 },
        gaps: { L: HANDS[0].gaps.filter((g) => !g.held).length, R: HANDS[1].gaps.filter((g) => !g.held).length },
        bridged: { L: HANDS[0].bridges.length, R: HANDS[1].bridges.length },
        keyboard: KB.from, bodyParts: bodyParts.length, look: opts.pale ? 'pale' : opts.bright ? 'bright' : 'quest',
        
        keyMeshes: realKeys ? 'piano' : 'boxes',
        lit: fb.lit, glow: fb.glow, glowPool,
        
        digits: digitShown + readShown, lessonDigits: digitShown, readDigits: readShown, digitPool: digitPlates ? DIGIT_POOL : 0,
        footage: !!FOOT, keyBodies: !FOOT,
      }),
      
      
      keyOnCanvas(m) {
        if (!Number.isInteger(m) || m < lowM || m > highM || !cssW) return null;
        kbGroup.updateMatrixWorld();
        const v = new THREE.Vector3(KB.x[m], KB.top[m], KB.front[m] - (isBlack(m) ? 8 : 12)).applyMatrix4(kbGroup.matrixWorld)
          .applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
        const W = canvas.clientWidth || cssW, H = canvas.clientHeight || cssH;
        return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
      },
      
      glowOrigin(m) {
        if (!Number.isInteger(m) || m < lowM || m > highM) return null;
        const a = new Float32Array(16);
        glowMatrix(a, 0, m, 0);
        kbGroup.updateMatrixWorld();
        const v = new THREE.Vector3(a[12], a[13], a[14]).applyMatrix4(kbGroup.matrixWorld);
        return [v.x, v.y, v.z];
      },
      
      
      
      
      
      keyQuad(m, d0 = 0, d1 = 45) {
        if (!Number.isInteger(m) || m < lowM || m > highM || !cssW || !posed) return null;
        kbGroup.updateMatrixWorld();
        const hw = (isBlack(m) ? KB.blackW : KB.whiteW) / 2, za = KB.front[m] - d0, zb = KB.front[m] - d1, y = KB.top[m];
        const out = [];
        for (const [x, z] of [[KB.x[m] - hw, za], [KB.x[m] + hw, za], [KB.x[m] + hw, zb], [KB.x[m] - hw, zb]]) {
          const v = tmpV.set(x, y, z).applyMatrix4(kbGroup.matrixWorld).project(cam);
          if (!(v.z < 1 && v.z > -1)) return null;
          out.push([((v.x + 1) * cssW) / 2, ((1 - v.y) * cssH) / 2]);
        }
        return out;
      },
      
      
      
      keyOutline(m) {
        if (!Number.isInteger(m) || m < lowM || m > highM || !cssW || !posed) return null;
        kbGroup.updateMatrixWorld();
        const y = KB.top[m], f = KB.front[m], pts = [];
        if (isBlack(m)) {
          const hw = KB.blackW / 2;
          pts.push([KB.x[m] - hw, f], [KB.x[m] + hw, f], [KB.x[m] + hw, f - KB.blackLen], [KB.x[m] - hw, f - KB.blackLen]);
        } else {
          const hw = KB.whiteW / 2 - 0.5, nb = f - (KB.whiteLen - KB.blackLen), back = f - KB.whiteLen, bh = KB.blackW / 2 + 0.6;
          const xl = KB.x[m] - hw, xr = KB.x[m] + hw;
          const xr2 = m + 1 <= highM && isBlack(m + 1) ? KB.x[m + 1] - bh : xr, xl2 = m - 1 >= lowM && isBlack(m - 1) ? KB.x[m - 1] + bh : xl;
          pts.push([xl, f], [xr, f], [xr, nb], [xr2, nb], [xr2, back], [xl2, back], [xl2, nb], [xl, nb]);
        }
        const out = [];
        for (const [x, z] of pts) {
          const v = tmpV.set(x, y, z).applyMatrix4(kbGroup.matrixWorld).project(cam);
          if (!(v.z < 1 && v.z > -1)) return null;
          out.push([((v.x + 1) * cssW) / 2, ((1 - v.y) * cssH) / 2]);
        }
        return out;
      },
      keyAt(m) {
        if (!Number.isInteger(m) || m < lowM || m > highM) return null;
        return { press: press[m], lit: litNow[m] === 1, glow: glowNow[m] === 1 };
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        canvas.style.backgroundImage = '';
        if (io) io.disconnect();
        canvas.removeEventListener('webglcontextlost', onLost);
        dropAll();
        renderer.dispose();
        try { renderer.forceContextLoss(); } catch {   }
        canvas.remove();
      },
    };
    if (opts.footage) setFootage(opts.footage);
    return api;
  }

  
  
  window.MVGhost = {
    create, threeUrl: THREE_URL, assets: { rig: RIG_URL, smoke: SMOKE_URL, glow: GLOW_URL, glowSmoke: GLOW_SMOKE_URL },
    parts: { loadAssets, buildRig, handMaterial, orientFromPositions, smokeOffset, chainLength, LOOK, QUEST_CELL_MM, QUEST_EYE_ASPECT, XR, XS, XR_FROM_GRP, FIT_SCALE_RANGE },
  };
})();







(() => {
  'use strict';
  const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uScale;

const vec3 PURPLE = vec3(0.659, 0.333, 0.969);
const vec3 LILAC  = vec3(0.753, 0.518, 0.988);
const vec3 PINK   = vec3(0.957, 0.447, 0.714);
const vec3 ROSE   = vec3(0.925, 0.282, 0.600);

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// one ribbon, premultiplied rgba. X across (virtual width units), Y up (canvas heights), centred on 0.
vec4 ribbon(float X, float Y, float t, float seed, float wid, float lift, float blur, float gain) {
  float f1 = 2.1 + 0.35 * seed, f2 = 3.7 - 0.4 * seed;
  float cy = lift + 0.15 * sin(f1 * X + 0.23 * t + seed * 2.1) + 0.055 * sin(f2 * X - 0.31 * t + seed * 4.3)
           + 0.014 * sin(8.0 * X + 0.41 * t + seed);
  float slope = 0.15 * f1 * cos(f1 * X + 0.23 * t + seed * 2.1) + 0.055 * f2 * cos(f2 * X - 0.31 * t + seed * 4.3);
  float th = 1.75 * X - 0.19 * t + seed * 1.3 + 0.85 * sin(1.3 * X + 0.15 * t + seed * 3.0);
  float c = cos(th), s = sin(th);
  float hw = wid * (0.035 + 0.965 * abs(c));
  float d = Y - cy;
  float px = 1.0 / uScale;                                  // one device pixel, in canvas heights
  float edge = (hw - abs(d)) / px;                          // pixels inside the band
  float cov = blur < 1.01 ? clamp(edge + 0.5, 0.0, 1.0) : smoothstep(-blur, blur, edge);
  if (cov <= 0.0 && edge < -40.0) return vec4(0.0);
  float v = clamp(d / max(hw, 1e-5), -1.0, 1.0) * sign(c + 1e-6);   // across the strip, -1..1, on its own side
  // the strip is cupped a little across its width, so its normal turns with v: the sheen travels across it
  float a = th + 1.05 * v;
  vec3 n = normalize(vec3(-0.55 * slope, -sin(a), cos(a)));
  if (n.z < 0.0) n = -n;                                     // the side facing us
  vec3 L = normalize(vec3(-0.35, 0.75, 0.55));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(n, H), 0.0);
  float spec = pow(nh, 90.0);
  float sheen = pow(nh, 4.0);
  float fres = pow(1.0 - abs(n.z), 3.0);
  float back = step(c, 0.0);
  float along = clamp(0.5 + X * 0.9, 0.0, 1.0);
  vec3 tint = mix(mix(LILAC, PURPLE, smoothstep(0.0, 0.55, along)), PINK, smoothstep(0.45, 1.0, along));
  // an inner glow that drifts through the sheet (the original's coloured light inside the glass)
  float g = 0.5 + 0.5 * sin(2.2 * X - 0.29 * t + seed * 5.0 + 1.2 * v) * (0.6 + 0.4 * sin(0.9 * v - 0.23 * t + seed));
  float glow = smoothstep(0.35, 1.0, g) * (0.3 + 0.7 * abs(c));
  vec3 fill = vec3(0.052, 0.043, 0.070) * (0.5 + 0.5 * abs(c));
  fill += tint * (0.24 * glow + 0.22 * sheen * sheen) + mix(tint, vec3(1.0), 0.7) * spec * 0.6;
  fill += mix(tint, ROSE, back) * fres * 0.6;
  fill *= mix(1.0, 0.62, back);
  // the rims: a hairline at each edge, white-hot where the strip turns edge-on, rose on the shadow edge
  float fold = 1.0 - abs(c);
  float rimW = blur < 1.01 ? 1.15 : blur;
  float rim = exp(-max(edge, 0.0) / rimW) * cov;
  bool lit = d * sign(c + 1e-6) > 0.0;
  vec3 rimCol = lit ? mix(LILAC, vec3(1.0), 0.6 + 0.4 * fold) : mix(ROSE, PINK, fold);
  float rimI = (lit ? 0.8 : 0.55) + 2.2 * pow(fold, 3.0);
  // the glint where the strip turns edge-on: a short hot streak along the fold
  float glint = pow(fold, 12.0) * exp(-abs(d) / (px * (3.0 + 2.0 * blur)));
  float halo = exp(-max(-edge, 0.0) / (5.0 + 3.0 * blur)) * step(edge, 0.0) * (0.02 + 0.07 * fold);
  vec3 rgb = fill * cov * 0.92 + rimCol * rim * rimI + tint * halo + mix(PINK, vec3(1.0), 0.6) * glint * 0.9;
  float alpha = max(cov * 0.86, max(max(rim * rimI, halo), glint) * 0.9);
  return vec4(rgb * gain, clamp(alpha, 0.0, 1.0) * min(gain * 1.15, 1.0));
}

vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

void main() {
  vec2 p = gl_FragCoord.xy;
  float W = uRes.x, Hc = uRes.y;
  float S = max(W, 1.7 * Hc);
  float X = (p.x - 0.5 * W) / S;
  float Y = p.y / Hc - 0.5;
  float t = uTime;
  vec4 col = ribbon(X, Y, t * 0.8 + 40.0, 2.7, 0.21, 0.05, 6.0, 0.38);            // far, soft
  col = over(ribbon(X, Y, t * 0.9 + 13.0, 1.4, 0.13, -0.07, 2.2, 0.62), col);    // middle
  col = over(ribbon(X, Y, t, 0.0, 0.27, 0.0, 1.0, 1.0), col);                     // near, sharp
  col.rgb += (hash(p + fract(t)) - 0.5) / 255.0;                                  // dither: no banding
  gl_FragColor = vec4(max(col.rgb, 0.0), col.a);
}`;
  const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

  function start() {
    const host = document.querySelector('.tb-wave');
    if (!host) return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'tb-wave-gl';
    canvas.setAttribute('aria-hidden', 'true');
    let gl = null;
    try { gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }); } catch { gl = null; }
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    try {
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { console.warn('test bench wave:', e.message || e); return null; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes'), uTime = gl.getUniformLocation(prog, 'uTime'), uScale = gl.getUniformLocation(prog, 'uScale');
    host.appendChild(canvas);
    host.classList.add('gl');

    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const STILL_T = 7.5;                       
    let running = true, raf = 0, t0 = performance.now(), frames = 0, w = 0, h = 0, fixedT = null;
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (cw !== w || ch !== h) { w = cw; h = ch; canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); return true; }
      return false;
    }
    function draw(t) {
      size();
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uScale, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frames++;
    }
    const visible = () => !document.hidden && !!canvas.offsetParent;
    function tick(now) {
      raf = 0;
      if (!running || calm.matches || !visible()) return;
      draw(fixedT != null ? fixedT : (now - t0) / 1000);
      raf = requestAnimationFrame(tick);
    }
    function play() { running = true; if (calm.matches) { draw(STILL_T); return; } if (!raf) raf = requestAnimationFrame(tick); }
    function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    window.addEventListener('resize', () => { if (calm.matches || !running) { if (size()) draw(STILL_T); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && running) play(); });
    calm.addEventListener && calm.addEventListener('change', () => (calm.matches ? draw(STILL_T) : play()));
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); pause(); host.classList.remove('gl'); });
    play();
    return {
      play, pause,
      
      hold(t) { fixedT = t; draw(t); },
      get frames() { return frames; }, get size() { return [w, h]; }, get calm() { return calm.matches; },
    };
  }
  window.TBWave = start();
})();

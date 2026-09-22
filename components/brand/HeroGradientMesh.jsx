"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Space_Grotesk } from "next/font/google";

// Same config as PublicSite.js's displayFont — Next.js dedupes identical
// next/font/google configs at build time, so this doesn't load the font
// twice; it just lets this component style its wordmark without importing
// the whole page file.
const displayFont = Space_Grotesk({ subsets: ["latin"], weight: ["700"] });

const VERTEX_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// A real animated mesh gradient — simplex-noise-driven flowing color field,
// the same family of technique behind Stripe/Linear/Vercel-style hero
// backgrounds — instead of a handful of blurred CSS divs. Runs on a plain
// WebGL canvas (no three.js/extra dependency): one fullscreen triangle, a
// fragment shader mixes the brand's blood-red palette through two layered
// noise fields animated by a time uniform, with a soft vignette so it
// blends into the hero section instead of reading as a hard-edged tile.
const FRAGMENT_SRC = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv * 3.0;
  float t = u_time * 0.1;

  float n1 = snoise(p + vec2(t, -t * 0.8));
  float n2 = snoise(p * 1.7 + vec2(-t * 1.3, t * 0.9) + 4.2);
  float n = (n1 * 0.6 + n2 * 0.4) * 0.5 + 0.5;

  vec3 dark = vec3(0.043, 0.051, 0.063);
  vec3 red2 = vec3(0.725, 0.110, 0.110);
  vec3 red1 = vec3(0.898, 0.224, 0.208);
  vec3 hi   = vec3(1.0, 0.706, 0.671);

  vec3 color = mix(dark, red2, smoothstep(0.28, 0.55, n));
  color = mix(color, red1, smoothstep(0.52, 0.76, n));
  color = mix(color, hi, smoothstep(0.8, 0.97, n));

  float d = distance(uv, vec2(0.5));
  float vignette = smoothstep(0.78, 0.3, d);

  gl_FragColor = vec4(color, vignette);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function MeshCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return undefined;

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!vertexShader || !fragmentShader) return undefined;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return undefined;
    gl.useProgram(program);

    // One triangle covering clip space [-1,3] — cheaper than a quad, no
    // visible seam since only the [-1,1] square is ever on screen.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const positionLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const resolutionLoc = gl.getUniformLocation(program, "u_resolution");
    const timeLoc = gl.getUniformLocation(program, "u_time");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame;
    function render(timeMs) {
      resize();
      gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
      gl.uniform1f(timeLoc, timeMs / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduceMotion) frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(buffer);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full rounded-full" aria-hidden="true" />;
}

export default function HeroGradientMesh({ className = "" }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={`relative overflow-hidden rounded-full ${className}`} aria-hidden="true">
      <MeshCanvas />

      {/* News-lower-third-style wordmark reveal: hidden most of the loop,
          slides in from the right on a red accent bar, holds, slides back
          out. This is the one moment the mesh actually says the brand
          name, instead of staying purely abstract. */}
      {!reduceMotion && (
        <motion.div
          className="absolute inset-x-0 bottom-[8%] flex justify-center"
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: [0, 0, 1, 1, 0], x: [28, 28, 0, 0, 28] }}
          transition={{ duration: 8, times: [0, 0.5, 0.6, 0.85, 0.95], repeat: Infinity, ease: "easeOut" }}
        >
          <div
            className="flex items-center gap-2.5 rounded-md border-l-4 px-3 py-1.5 backdrop-blur-sm"
            style={{ borderColor: "#F04438", background: "rgba(11,13,16,0.55)" }}
          >
            <span className={`${displayFont.className} text-sm font-bold uppercase tracking-[.14em] text-white md:text-base`}>
              Next <span style={{ color: "#F04438" }}>Academy</span>
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

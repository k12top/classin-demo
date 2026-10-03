"use client";

import { useEffect, useRef } from "react";

const VERTEX_SHADER = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;

float softCircle(vec2 point, vec2 center, float radius, float feather) {
  return 1.0 - smoothstep(radius - feather, radius + feather, distance(point, center));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 point = uv - 0.5;
  point.x *= u_resolution.x / max(u_resolution.y, 1.0);

  float time = u_time * 0.22;
  vec2 irisCenter = vec2(
    -0.23 + sin(time * 0.83) * 0.10,
    0.05 + cos(time * 0.61) * 0.08
  );
  vec2 mintCenter = vec2(
    0.26 + cos(time * 0.71) * 0.12,
    -0.08 + sin(time * 0.56) * 0.09
  );
  vec2 blueCenter = vec2(
    sin(time * 0.47) * 0.18,
    0.22 + cos(time * 0.69) * 0.08
  );

  float iris = softCircle(point, irisCenter, 0.43, 0.32);
  float mint = softCircle(point, mintCenter, 0.37, 0.30);
  float blue = softCircle(point, blueCenter, 0.31, 0.28);
  float breath = 0.5 + 0.5 * sin(time * 2.2);

  vec3 color = vec3(0.055, 0.082, 0.108);
  color += vec3(0.25, 0.22, 0.68) * iris * (0.34 + breath * 0.05);
  color += vec3(0.08, 0.67, 0.48) * mint * (0.24 + (1.0 - breath) * 0.05);
  color += vec3(0.10, 0.30, 0.62) * blue * 0.18;

  float distanceFromCenter = length(point);
  float ringRadius = 0.105 + sin(time * 2.2) * 0.006;
  float ring = 1.0 - smoothstep(0.004, 0.016, abs(distanceFromCenter - ringRadius));
  float core = softCircle(point, vec2(0.0), 0.08, 0.06);
  color += vec3(0.29, 0.95, 0.73) * ring * 0.30;
  color += vec3(0.35, 0.34, 0.88) * core * 0.20;

  float vignette = smoothstep(0.98, 0.24, distanceFromCenter);
  color *= 0.68 + vignette * 0.32;

  float grain = fract(sin(dot(gl_FragCoord.xy + u_time, vec2(12.9898, 78.233))) * 43758.5453);
  color += (grain - 0.5) * 0.012;
  gl_FragColor = vec4(color, 1.0);
}
`;

function shader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
) {
  const compiled = gl.createShader(type);
  if (!compiled) return null;
  gl.shaderSource(compiled, source);
  gl.compileShader(compiled);
  if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) {
    gl.deleteShader(compiled);
    return null;
  }
  return compiled;
}

export function ClassroomWebglLoader({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const vertexShader = shader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    const buffer = gl.createBuffer();
    const position = gl.getAttribLocation(program, "a_position");
    const resolution = gl.getUniformLocation(program, "u_resolution");
    const time = gl.getUniformLocation(program, "u_time");
    if (!buffer || position < 0 || !resolution || !time) {
      gl.deleteProgram(program);
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.useProgram(program);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    let frameId = 0;
    let contextLost = false;
    const startedAt = performance.now();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    };

    const draw = (now: number) => {
      if (contextLost) return;
      resize();
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, reducedMotion ? 1.5 : (now - startedAt) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!reducedMotion) frameId = requestAnimationFrame(draw);
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(frameId);
    };
    const onContextRestored = () => {
      contextLost = false;
      frameId = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

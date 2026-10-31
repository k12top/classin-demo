type Mesh = { positions: number[]; normals: number[]; color: [number, number, number] };
const GOLD: Mesh["color"] = [1, 0.72, 0.25];

function trophyMeshes(): Mesh[] {
  const meshes: Mesh[] = [];
  function lathe(profile: [number, number][], color = GOLD) {
    const mesh: Mesh = { positions: [], normals: [], color };
    for (let row = 0; row < profile.length - 1; row++) {
      const [r0, y0] = profile[row], [r1, y1] = profile[row + 1];
      const surfaceNormal = (index: number, angle: number) => {
        const before = profile[Math.max(0, index - 1)], after = profile[Math.min(profile.length - 1, index + 1)];
        const length = Math.hypot(after[1] - before[1], after[0] - before[0]) || 1;
        return [(after[1] - before[1]) / length * Math.cos(angle), (before[0] - after[0]) / length,
          (after[1] - before[1]) / length * Math.sin(angle)];
      };
      for (let i = 0; i < 64; i++) {
        for (const [r, y, angle, vertex] of [[r0, y0, i, row], [r1, y1, i, row + 1], [r1, y1, i + 1, row + 1], [r0, y0, i, row], [r1, y1, i + 1, row + 1], [r0, y0, i + 1, row]]) {
          const a = angle / 64 * Math.PI * 2;
          mesh.positions.push(r * Math.cos(a), y, r * Math.sin(a));
          mesh.normals.push(...surfaceNormal(vertex, a));
        }
      }
    }
    meshes.push(mesh);
  }
  // A hollow bowl, rolled rim, turned stem and foot are actual surfaces of revolution.
  lathe([[0, -.2], [.18, -.17], [.37, -.03], [.57, .22], [.72, .54], [.79, .96], [.8, 1.13], [.81, 1.18], [.78, 1.22], [.74, 1.18], [.73, 1.08], [.7, .7], [.56, .35], [.32, .12], [0, .08]]);
  lathe([[0, -.98], [.45, -.98], [.47, -.92], [.42, -.84], [.24, -.8], [.12, -.64], [.11, -.46], [.18, -.29], [.25, -.2], [0, -.18]]);
  for (const side of [-1, 1]) {
    const mesh: Mesh = { positions: [], normals: [], color: GOLD };
    for (let i = 0; i < 32; i++) for (let j = 0; j < 12; j++) {
      for (const [u, v] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) {
        const a = -Math.PI / 2 + u / 32 * Math.PI, b = v / 12 * Math.PI * 2;
        const nx = side * Math.cos(a) * Math.cos(b), ny = Math.sin(a) * Math.cos(b), nz = Math.sin(b);
        mesh.positions.push(side * (.59 + .14 * u / 32 + .43 * Math.cos(a)) + nx * .075, .69 + .43 * Math.sin(a) + ny * .075, nz * .075);
        mesh.normals.push(nx, ny, nz);
      }
    }
    meshes.push(mesh);
  }
  function box(x: number, y: number, z: number, cx: number, cy: number, cz: number, color: Mesh["color"]) {
    const mesh: Mesh = { positions: [], normals: [], color };
    for (const [normal, corners] of [
      [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
      [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
      [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
      [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
      [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
      [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
    ] as [number[], number[][]][]) {
      for (const index of [0, 1, 2, 0, 2, 3]) {
        const p = corners[index];
        mesh.positions.push(cx + p[0] * x / 2, cy + p[1] * y / 2, cz + p[2] * z / 2);
        mesh.normals.push(...normal);
      }
    }
    meshes.push(mesh);
  }
  box(1.28, .27, .92, 0, -1.12, 0, [.07, .085, .11]);
  box(1.32, .055, .96, 0, -.96, 0, GOLD);
  box(.48, .12, .015, 0, -1.1, .47, GOLD);
  return meshes;
}

export function renderTrophy(canvas: HTMLCanvasElement, reducedMotion: boolean) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, powerPreference: "low-power", premultipliedAlpha: false });
  if (!gl) throw new Error("WebGL unavailable");
  const shaders: WebGLShader[] = [];
  const buffers: WebGLBuffer[] = [];
  const program = gl.createProgram();
  if (!program) { gl.getExtension("WEBGL_lose_context")?.loseContext(); throw new Error("WebGL program unavailable"); }
  let frame = 0;
  function dispose() {
    cancelAnimationFrame(frame);
    for (const buffer of buffers) gl!.deleteBuffer(buffer);
    for (const shader of shaders) gl!.deleteShader(shader);
    gl!.deleteProgram(program);
    gl!.getExtension("WEBGL_lose_context")?.loseContext();
  }
  try {
    for (const [kind, source] of [
      [gl.VERTEX_SHADER, `attribute vec3 position; attribute vec3 normal;
        uniform mat4 model; varying vec3 n; varying vec3 p;
        void main(){ vec4 world=model*vec4(position,1.);p=world.xyz;n=mat3(model)*normal;
          float depth=5.5-world.z;gl_Position=vec4(world.x*3.4,world.y*3.4,depth-1.,depth); }`],
      [gl.FRAGMENT_SHADER, `precision mediump float;varying vec3 n;varying vec3 p;uniform vec3 color;
        void main(){vec3 N=normalize(n),V=normalize(vec3(0.,.4,5.5)-p);
          vec3 L=normalize(vec3(-.8,1.2,1.8)),R=reflect(-V,N);
          float diffuse=max(dot(N,L),0.);float spec=pow(max(dot(N,normalize(L+V)),0.),80.);
          float edge=pow(1.-max(dot(N,V),0.),3.);
          float studio=pow(max(0.,1.-abs(R.x-.25)*2.8),18.)*.7+pow(max(0.,R.y),6.)*.25;
          vec3 gold=color*(.24+diffuse*.65+studio*.55)+vec3(1.,.94,.78)*(spec*.8+edge*.19);
          gl_FragColor=vec4(gold,1.); }`],
    ] as [number, string][]) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error("WebGL shader unavailable");
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("WebGL shader compilation failed");
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("WebGL link failed");
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "position"), normal = gl.getAttribLocation(program, "normal");
    const model = gl.getUniformLocation(program, "model"), color = gl.getUniformLocation(program, "color");
    const meshes = trophyMeshes().map(mesh => {
      const vertices: number[] = [];
      for (let i = 0; i < mesh.positions.length; i += 3) vertices.push(...mesh.positions.slice(i, i + 3), ...mesh.normals.slice(i, i + 3));
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("WebGL buffer unavailable");
      buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
      return { buffer, count: mesh.positions.length / 3, color: mesh.color };
    });
    const size = Math.min(420, Math.round(210 * Math.min(devicePixelRatio || 1, 2)));
    canvas.width = canvas.height = size;
    gl.viewport(0, 0, size, size); gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
    gl.enableVertexAttribArray(position); gl.enableVertexAttribArray(normal);
    const start = performance.now();
    function draw(now: number) {
      if (document.visibilityState === "hidden" || gl!.isContextLost()) return;
      const elapsed = now - start;
      const angle = reducedMotion ? -.18 : -.5 + Math.sin(Math.min(elapsed / 1800, 1) * Math.PI / 2) * .85;
      const c = Math.cos(angle), s = Math.sin(angle), tilt = .16, ct = Math.cos(tilt), st = Math.sin(tilt);
      gl!.uniformMatrix4fv(model, false, new Float32Array([c, s * st, -s * ct, 0, 0, ct, st, 0, s, -c * st, c * ct, 0, 0, .02, 0, 1]));
      gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
      for (const mesh of meshes) {
        gl!.bindBuffer(gl!.ARRAY_BUFFER, mesh.buffer);
        gl!.vertexAttribPointer(position, 3, gl!.FLOAT, false, 24, 0);
        gl!.vertexAttribPointer(normal, 3, gl!.FLOAT, false, 24, 12);
        gl!.uniform3fv(color, mesh.color); gl!.drawArrays(gl!.TRIANGLES, 0, mesh.count);
      }
      if (!reducedMotion && elapsed < 2600) frame = requestAnimationFrame(draw);
    }
    draw(start);
    canvas.dataset.renderer = "webgl";
    return dispose;
  } catch (error) { dispose(); throw error; }
}

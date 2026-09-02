import { useEffect, useRef } from 'react';

interface OS3WallpaperProps {
  colors: string[];
  className?: string;
  opacity?: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const VERT = 'attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.,1.);}';

// WebGL port of Halcyon's OS3BgFrag: four drifting colour orbs + perlin wash.
const FRAG = `precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColors[4];

float hash(vec2 p){
  vec3 p3=fract(vec3(p.xyx)*0.13);
  p3+=dot(p3,p3.yzx+3.333);
  return fract((p3.x+p3.y)*p3.z);
}
float perlin(vec2 x){
  vec2 i=floor(x);vec2 f=fract(x);
  float a=hash(i);float b=hash(i+vec2(1.,0.));
  float c=hash(i+vec2(0.,1.));float d=hash(i+vec2(1.,1.));
  vec2 u=f*f*(3.-2.*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
}
vec3 rgb2hsv(vec3 c){
  vec4 K=vec4(0.,-1./3.,2./3.,-1.);
  vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
  vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
  float d=q.x-min(q.w,q.y);
  float e=1.0e-10;
  return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);
}
vec3 hsv2rgb(vec3 c){
  vec4 K=vec4(1.,2./3.,1./3.,3.);
  vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);
  return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);
}
void main(){
  vec2 uv=gl_FragCoord.xy/uResolution;
  vec3 color=vec3(0.05,0.05,0.08);
  float alpha=0.;
  vec2 pts[4];
  pts[0]=vec2(0.22,0.30);pts[1]=vec2(0.78,0.26);
  pts[2]=vec2(0.30,0.76);pts[3]=vec2(0.74,0.72);
  float rads[4];
  rads[0]=0.52;rads[1]=0.46;rads[2]=0.5;rads[3]=0.44;
  for(int i=0;i<4;i++){
    vec2 pt=pts[i];
    pt.x+=sin(uTime*0.6+pt.y*6.28)*0.05;
    pt.y+=cos(uTime*0.5+pt.x*6.28)*0.05;
    float d=distance(uv,pt);
    float pct=smoothstep(rads[i],0.,d);
    color=mix(color,uColors[i],pct);
    alpha=mix(alpha,0.9,pct);
  }
  float n=perlin(uv*3.5+vec2(-uTime*0.08,-uTime*0.08));
  vec3 hsv=rgb2hsv(color);
  hsv.y=mix(hsv.y,0.,smoothstep(0.,1.,n)*0.22);
  color=hsv2rgb(hsv);
  color+=smoothstep(0.,1.,n)*0.03;
  color+=(1./255.)*fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))))-(0.5/255.);
  gl_FragColor=vec4(color,1.);
}`;

/** HyperOS 3 style animated wallpaper (canvas/WebGL, cheap on GPU). */
export function OS3Wallpaper({ colors, className, opacity = 1 }: OS3WallpaperProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return undefined;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return undefined;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uResolution');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const base = colors.length ? colors.map(hexToRgb) : [[0.24, 0.48, 1]];
    const four: number[] = [];
    for (let i = 0; i < 4; i++) {
      const c = base[i % base.length];
      const k = i < base.length ? 1 : 0.72;
      four.push(c[0] * k, c[1] * k, c[2] * k);
    }
    const uColors = gl.getUniformLocation(prog, 'uColors');

    const resize = () => {
      const w = canvas.clientWidth || 300;
      const h = canvas.clientHeight || 300;
      canvas.width = Math.round(w * 0.5);
      canvas.height = Math.round(h * 0.5);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    const start = performance.now();
    const frame = () => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.uniform3fv(uColors, four);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, [colors.join(',')]);

  return <canvas ref={ref} className={className} style={{ opacity }} aria-hidden="true" />;
}

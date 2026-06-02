export function cornersComplete(corners) {
  return ['tl', 'tr', 'br', 'bl'].every((key) => corners[key] && Number.isFinite(corners[key].x) && Number.isFinite(corners[key].y));
}
export function buildScreenTransforms(corners) {
  if (!cornersComplete(corners)) return null;
  const src = [[0,0],[1,0],[1,1],[0,1]];
  const dst = [corners.tl,corners.tr,corners.br,corners.bl].map(p => [p.x,p.y]);
  const screenToVideo = homography(src, dst);
  const videoToScreen = inverse3(screenToVideo);
  return { screenToVideo, videoToScreen };
}
export function transformPoint(H, x, y) {
  if (!H || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const w = H[6]*x + H[7]*y + H[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
  return { x: (H[0]*x + H[1]*y + H[2]) / w, y: (H[3]*x + H[4]*y + H[5]) / w };
}
export function pointInUnitSquare(p, margin = 0) {
  return p && p.x >= -margin && p.x <= 1 + margin && p.y >= -margin && p.y <= 1 + margin;
}
export function fitAffine(src, dst) {
  if (!src || !dst || src.length !== dst.length || src.length < 3) return null;
  const A = [[0,0,0],[0,0,0],[0,0,0]], bx = [0,0,0], by = [0,0,0];
  for (let i = 0; i < src.length; i++) {
    const r = [src[i].x, src[i].y, 1];
    for (let a = 0; a < 3; a++) { for (let b = 0; b < 3; b++) A[a][b] += r[a]*r[b]; bx[a] += r[a]*dst[i].x; by[a] += r[a]*dst[i].y; }
  }
  const x = solve(A.map(r=>r.slice()), bx.slice());
  const y = solve(A.map(r=>r.slice()), by.slice());
  return x && y ? { a:x[0], b:x[1], c:x[2], d:y[0], e:y[1], f:y[2] } : null;
}
export function applyAffine(m, p) { return m && p ? { x:m.a*p.x + m.b*p.y + m.c, y:m.d*p.x + m.e*p.y + m.f } : p; }
export function affineRmse(m, src, dst) {
  if (!m || !src.length) return NaN;
  const e = src.map((p,i) => { const q = applyAffine(m,p); return Math.hypot(q.x-dst[i].x, q.y-dst[i].y); });
  return Math.sqrt(e.reduce((s,v)=>s+v*v,0)/e.length);
}
export function screenXToNorm(x) { return (x - 0.5) * 2; }
export function screenToDegrees(p, settings) {
  const width = Number(settings.monitorWidthCm), height = Number(settings.monitorHeightCm), distance = Number(settings.viewingDistanceCm);
  if (!p || !Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(distance) || width <= 0 || height <= 0 || distance <= 0) return { x:NaN, y:NaN };
  return { x: Math.atan2((p.x - 0.5) * width, distance) * 180 / Math.PI, y: Math.atan2((0.5 - p.y) * height, distance) * 180 / Math.PI };
}
export function computeVelocity(samples, valueKey, velocityKey) {
  for (const s of samples) s[velocityKey] = NaN;
  for (let i = 1; i < samples.length - 1; i++) { const dt = samples[i+1].t - samples[i-1].t; if (dt > 0 && Number.isFinite(samples[i-1][valueKey]) && Number.isFinite(samples[i+1][valueKey])) samples[i][velocityKey] = (samples[i+1][valueKey] - samples[i-1][valueKey]) / dt; }
}
function homography(src,dst) {
  const A=[], b=[];
  for (let i=0;i<4;i++) { const [x,y]=src[i], [u,v]=dst[i]; A.push([x,y,1,0,0,0,-u*x,-u*y]); b.push(u); A.push([0,0,0,x,y,1,-v*x,-v*y]); b.push(v); }
  const h = solve(A,b); return h ? [h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1] : null;
}
function inverse3(H) { if (!H) return null; const [a,b,c,d,e,f,g,h,i]=H; const A=e*i-f*h, B=c*h-b*i, C=b*f-c*e, D=f*g-d*i, E=a*i-c*g, F=c*d-a*f, G=d*h-e*g, J=a*e-b*d; const det=a*A+b*D+c*G; return Math.abs(det)<1e-12 ? null : [A/det,B/det,C/det,D/det,E/det,F/det,G/det,(c*g-a*h)/det,J/det]; }
function solve(A,b) {
  const n=b.length;
  for (let col=0; col<n; col++) { let pivot=col; for (let r=col+1;r<n;r++) if (Math.abs(A[r][col])>Math.abs(A[pivot][col])) pivot=r; if (Math.abs(A[pivot][col])<1e-12) return null; [A[col],A[pivot]]=[A[pivot],A[col]]; [b[col],b[pivot]]=[b[pivot],b[col]]; const pv=A[col][col]; for (let c=col;c<n;c++) A[col][c]/=pv; b[col]/=pv; for (let r=0;r<n;r++) { if (r===col) continue; const f=A[r][col]; for (let c=col;c<n;c++) A[r][c]-=f*A[col][c]; b[r]-=f*b[col]; } }
  return b;
}

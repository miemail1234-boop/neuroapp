// Fixation timing overlay correction.
// The main video should not show future fixation centroids.
// It now shows a fixation only while its own start/end interval overlaps the current gaze time.
(function(){
  function id(x){return document.getElementById(x)}
  function markLocal(ctx,p,col,l){
    if(!p)return;
    ctx.save();
    ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fill();
    if(l){ctx.fillStyle='white';ctx.font='700 11px system-ui';ctx.fillText(l,p.x+7,p.y-8)}
    ctx.restore();
  }
  function currentFixations(t){
    if(typeof S==='undefined')return [];
    const pad=0.08; // small tolerance for exported timestamps, not a multi-second preview
    return (S.fix||[]).filter(f=>{
      if(Number.isFinite(f.start)&&Number.isFinite(f.end))return t>=f.start-pad && t<=f.end+pad;
      return Math.abs((f.t||0)-t)<=0.12;
    });
  }
  window.draw=function(){
    if(typeof S==='undefined')return;
    const c=id('overlayCanvas');if(!c)return;
    const r=c.getBoundingClientRect(),k=devicePixelRatio||1;
    c.width=Math.max(1,r.width*k);c.height=Math.max(1,r.height*k);
    const ctx=c.getContext('2d');ctx.setTransform(k,0,0,k,0,0);ctx.clearRect(0,0,r.width,r.height);
    if(typeof toCan!=='function')return;
    Object.values(S.corners||{}).forEach(p=>markLocal(ctx,toCan(p),'#ffd166',''));
    if(['tl','tr','br','bl'].every(k=>S.corners&&S.corners[k])){
      ctx.save();ctx.strokeStyle='white';ctx.lineWidth=1.5;ctx.beginPath();
      ['tl','tr','br','bl'].forEach((kk,i)=>{const p=toCan(S.corners[kk]);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});
      ctx.closePath();ctx.stroke();ctx.restore();
    }
    const t=typeof recTime==='function'?recTime():0;
    if(id('showFixations')?.checked){
      currentFixations(t).forEach(f=>markLocal(ctx,toCan(f),'#ff9f43','F'));
    }
    if(id('showTrail')?.checked){
      const recent=(S.gaze||[]).filter(g=>!g.bad&&g.t>=t-.45&&g.t<=t);
      ctx.save();ctx.strokeStyle='rgba(74,163,255,.72)';ctx.lineWidth=2;ctx.beginPath();
      let started=false;
      recent.forEach(g=>{const p=toCan(g);if(started)ctx.lineTo(p.x,p.y);else{ctx.moveTo(p.x,p.y);started=true}});
      ctx.stroke();ctx.restore();
      const g=typeof nearTime==='function'?nearTime(S.gaze||[],t):null;
      if(g&&!g.bad)markLocal(ctx,toCan(g),'#4aa3ff','G');
    }
    if(id('showTarget')?.checked){
      const ta=typeof nearTime==='function'?nearTime(S.targets||[],t):null;
      if(ta)markLocal(ctx,toCan(ta),'#fff176','T');
    }
    if(typeof time==='function')time();
  };
})();

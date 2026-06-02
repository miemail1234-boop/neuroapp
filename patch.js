// Runtime patch for video controls and fallback horizontal plots.
(function(){
  const oldMode = window.mode;
  window.mode = function(){
    if (oldMode) oldMode();
    const stage = document.getElementById('videoStage');
    if (stage && window.S) stage.classList.toggle('marking', S.mode !== 'nav');
  };
  const stage = document.getElementById('videoStage');
  if (stage) stage.addEventListener('click', function(e){
    if (window.S && S.mode !== 'nav' && typeof window.clickCanvas === 'function') window.clickCanvas(e);
  });
  const oldSpatial = window.spatial;
  window.spatial = function(){
    if (oldSpatial) oldSpatial();
    if (!window.S || !S.gaze) return;
    const video = document.getElementById('sceneVideo');
    const xs = S.gaze.map(g => g.x).filter(Number.isFinite);
    if (!xs.length) return;
    const minX = Math.min(...xs), maxX = Math.max(...xs), span = Math.max(1, maxX - minX);
    const width = video && video.videoWidth ? video.videoWidth : span;
    for (const g of S.gaze) {
      if (!Number.isFinite(g.nx) && Number.isFinite(g.x)) g.nx = video && video.videoWidth ? (g.x / width - 0.5) * 2 : ((g.x - minX) / span - 0.5) * 2;
    }
    if (typeof window.vel === 'function') window.vel(S.gaze, 'nx', 'nv');
  };
  const oldPlot = window.plot;
  window.plot = function(canvas, key){
    if (!canvas) return;
    if (key === 'dx' && window.S && S.gaze && !S.gaze.some(g => Number.isFinite(g.dx))) {
      const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
      ctx.clearRect(0,0,w,h); ctx.fillStyle = '#fbfdfe'; ctx.fillRect(0,0,w,h);
      ctx.fillStyle = '#66737c'; ctx.font = '600 15px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('Per il grafico in gradi visivi: inserisci dimensioni monitor e segna i 4 angoli.', w/2, h/2);
      return;
    }
    if (oldPlot) oldPlot(canvas, key);
  };
  const css = document.createElement('style');
  css.textContent = '#overlayCanvas{pointer-events:none}.video-stage.marking #overlayCanvas{pointer-events:auto}.video-stage.marking{cursor:crosshair}';
  document.head.appendChild(css);
})();

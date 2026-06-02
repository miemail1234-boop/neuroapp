// Runtime patch: make screen-corner clicks give feedback without blocking video controls.
(function(){
  function labelMode(){
    const label = document.getElementById('interactionModeLabel');
    return (label && label.textContent || '').trim().toLowerCase();
  }
  function refreshMarkingClass(){
    const stage = document.getElementById('videoStage');
    if (!stage) return;
    stage.classList.toggle('marking', labelMode() !== 'navigazione');
  }
  const oldMode = window.mode;
  window.mode = function(){
    if (oldMode) oldMode();
    refreshMarkingClass();
  };
  const stage = document.getElementById('videoStage');
  if (stage) {
    stage.addEventListener('click', function(e){
      if (labelMode() === 'navigazione') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (typeof window.clickCanvas === 'function') window.clickCanvas(e);
      refreshMarkingClass();
    }, true);
  }
  setInterval(refreshMarkingClass, 250);
  const css = document.createElement('style');
  css.textContent = '#overlayCanvas{pointer-events:none!important}.video-stage.marking{cursor:crosshair}.video-stage.marking video{cursor:crosshair}';
  document.head.appendChild(css);
})();

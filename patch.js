// Runtime patch: corner-click feedback and robust marking clicks.
(function(){
  const cornerLabels = {
    tl: 'Alto sinistra',
    tr: 'Alto destra',
    br: 'Basso destra',
    bl: 'Basso sinistra'
  };
  let activeCornerButton = null;

  function labelMode(){
    const label = document.getElementById('interactionModeLabel');
    return (label && label.textContent || '').trim().toLowerCase();
  }

  function cornerKeyFromButton(button){
    return button && button.dataset ? button.dataset.corner : '';
  }

  function ensureFeedbackBox(){
    let box = document.getElementById('cornerFeedback');
    if (box) return box;
    const section = document.querySelector('.corner-grid')?.closest('.panel-card');
    box = document.createElement('div');
    box.id = 'cornerFeedback';
    box.className = 'readout corner-feedback';
    box.innerHTML = 'Angoli acquisiti: <strong id="cornerCount">0/4</strong>';
    section?.appendChild(box);
    return box;
  }

  function updateCornerFeedback(message){
    const box = ensureFeedbackBox();
    const count = document.querySelectorAll('.corner-btn.acquired').length;
    const countEl = document.getElementById('cornerCount');
    if (countEl) countEl.textContent = count + '/4';
    if (message) {
      let msg = document.getElementById('cornerMessage');
      if (!msg) {
        msg = document.createElement('div');
        msg.id = 'cornerMessage';
        msg.className = 'corner-message';
        box.appendChild(msg);
      }
      msg.textContent = message;
    }
  }

  function setActiveButton(button){
    document.querySelectorAll('.corner-btn').forEach((btn) => btn.classList.remove('active-corner'));
    activeCornerButton = button;
    if (button) button.classList.add('active-corner');
    updateCornerFeedback('Ora clicca sul video: ' + (cornerLabels[cornerKeyFromButton(button)] || 'angolo selezionato') + '.');
  }

  function markAcquired(button){
    if (!button) return;
    const key = cornerKeyFromButton(button);
    button.classList.remove('active-corner');
    button.classList.add('acquired');
    if (!button.textContent.includes('✓')) button.textContent = '✓ ' + button.textContent;
    updateCornerFeedback('Acquisito: ' + (cornerLabels[key] || 'angolo') + '.');
    const statusTitle = document.getElementById('statusTitle');
    const statusText = document.getElementById('statusText');
    const statusBand = document.getElementById('statusBand');
    if (statusTitle && statusText && statusBand) {
      statusBand.className = 'status-band ready';
      statusTitle.textContent = 'Posizione acquisita';
      statusText.textContent = 'Angolo schermo salvato: ' + (cornerLabels[key] || 'angolo') + '.';
    }
    activeCornerButton = null;
  }

  function refreshMarkingClass(){
    const stage = document.getElementById('videoStage');
    if (!stage) return;
    stage.classList.toggle('marking', labelMode() !== 'navigazione');
  }

  document.querySelectorAll('.corner-btn').forEach((button) => {
    button.addEventListener('click', () => setActiveButton(button), true);
  });

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
      const clickedCornerButton = activeCornerButton;
      if (typeof window.clickCanvas === 'function') window.clickCanvas(e);
      if (clickedCornerButton) markAcquired(clickedCornerButton);
      refreshMarkingClass();
    }, true);
  }

  const originalClear = document.getElementById('clearCornersBtn');
  originalClear?.addEventListener('click', () => {
    document.querySelectorAll('.corner-btn').forEach((button) => {
      button.classList.remove('acquired', 'active-corner');
      button.textContent = button.textContent.replace(/^✓\s*/, '');
    });
    updateCornerFeedback('Angoli cancellati. Seleziona di nuovo il primo angolo.');
  });

  setInterval(refreshMarkingClass, 250);
  updateCornerFeedback();

  const css = document.createElement('style');
  css.textContent = '#overlayCanvas{pointer-events:none!important}.video-stage.marking{cursor:crosshair}.video-stage.marking video{cursor:crosshair}.corner-btn.active-corner{outline:3px solid rgba(0,105,201,.28);border-color:#0069c9}.corner-btn.acquired{background:#e3f5ef;border-color:#07856f;color:#086750}.corner-feedback{padding:8px 10px;border:1px dashed #bfd0da;border-radius:9px;background:#fbfdfe}.corner-message{margin-top:4px;color:#087f7a;font-weight:700}';
  document.head.appendChild(css);
})();

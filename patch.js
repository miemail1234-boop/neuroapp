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
    box.innerHTML = 'Punti estremi acquisiti: <strong id="cornerCount">0/4</strong>';
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
    updateCornerFeedback('Ora clicca sul video: ' + (cornerLabels[cornerKeyFromButton(button)] || 'punto selezionato') + '.');
  }

  function markAcquired(button){
    if (!button) return;
    const key = cornerKeyFromButton(button);
    button.classList.remove('active-corner');
    button.classList.add('acquired');
    if (!button.textContent.includes('✓')) button.textContent = '✓ ' + button.textContent;
    updateCornerFeedback('Acquisito: ' + (cornerLabels[key] || 'punto') + '.');
    const statusTitle = document.getElementById('statusTitle');
    const statusText = document.getElementById('statusText');
    const statusBand = document.getElementById('statusBand');
    if (statusTitle && statusText && statusBand) {
      statusBand.className = 'status-band ready';
      statusTitle.textContent = 'Punto griglia acquisito';
      statusText.textContent = 'Punto estremo della griglia salvato: ' + (cornerLabels[key] || 'punto') + '.';
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
    updateCornerFeedback('Punti cancellati. Seleziona di nuovo il primo punto estremo della griglia.');
  });

  setInterval(refreshMarkingClass, 250);
  updateCornerFeedback();

  const css = document.createElement('style');
  css.textContent = '#overlayCanvas{pointer-events:none!important}.video-stage.marking{cursor:crosshair}.video-stage.marking video{cursor:crosshair}.corner-btn.active-corner{outline:3px solid rgba(0,105,201,.28);border-color:#0069c9}.corner-btn.acquired{background:#e3f5ef;border-color:#07856f;color:#086750}.corner-feedback{padding:8px 10px;border:1px dashed #bfd0da;border-radius:9px;background:#fbfdfe}.corner-message{margin-top:4px;color:#087f7a;font-weight:700}';
  document.head.appendChild(css);
})();

// Discreet guide mode: click the small bottom-right dot nine times to show hover explanations.
(function(){
  const explanations = {
    'Distanza paziente-monitor (cm)': 'Distanza tra occhi del paziente e schermo. Serve per convertire le posizioni in gradi visivi.',
    'Larghezza area calibrazione (cm)': 'Larghezza fisica della griglia di calibrazione. Serve per il grafico orizzontale in gradi visivi.',
    'Altezza area calibrazione (cm)': 'Altezza fisica della griglia di calibrazione. Serve per ricostruire lo spazio visivo verticale.',
    'Finestra drive inizio (ms)': 'Inizio della finestra precoce, rispetto all’onset del target, usata per stimare il drive motorio.',
    'Finestra drive fine (ms)': 'Fine della finestra precoce. Il drive è calcolato confrontando velocità del gaze e velocità del target.',
    'Offset video-gaze (ms)': 'Correzione manuale del disallineamento temporale tra video e dati gaze.',
    '2. Griglia di calibrazione nel video': 'Definisce lo spazio del task cliccando i quattro punti estremi della griglia di calibrazione.',
    '3. Correzione su fissazioni': 'Associa punti target reali e fissazioni osservate per correggere il gaze.',
    '4. Target e trial': 'Rileva il target bianco nel video e segmenta i movimenti laterali in trial.',
    'Soglia bianco': 'Soglia luminosa usata per rilevare il target bianco.',
    'Passo rilevamento (s)': 'Intervallo tra i frame analizzati. Più è piccolo, più il rilevamento è preciso ma lento.',
    'Traccia orizzontale rispetto al centro': 'Mostra gaze e target rispetto al centro della griglia: centro=0, sinistra=-1, destra=+1.',
    'Gradi visivi': 'Grafico in gradi visivi, disponibile se sono note dimensioni fisiche e distanza.',
    'Misura normalizzata': 'Grafico normalizzato: centro=0, estremo sinistro=-1, estremo destro=+1.',
    'Report direzionale': 'Sintesi del confronto fra drive verso destra e verso sinistra, controllando l’ampiezza.',
    'Condizioni': 'Riepilogo aggregato per direzione e ampiezza.',
    'Trial analizzati': 'Tabella dei singoli trial con onset, direzione, ampiezza, drive e qualità.'
  };

  function clean(text){ return String(text || '').replace(/✓/g,'').replace(/\s+/g,' ').trim(); }

  function activateGuide(){
    localStorage.setItem('gazeLabGuide','1');
    document.body.classList.add('guide-on');
    document.querySelectorAll('h2,h3,label,button').forEach((node) => {
      if (node.dataset.guideReady) return;
      const directText = Array.from(node.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
      const key = clean(directText || node.textContent);
      const help = explanations[key] || explanations[clean(node.textContent)];
      if (!help) return;
      node.dataset.guideReady = '1';
      node.setAttribute('title', help);
      const dot = document.createElement('span');
      dot.className = 'guide-help-dot';
      dot.textContent = '?';
      dot.setAttribute('title', help);
      node.appendChild(dot);
    });
    const statusBand = document.getElementById('statusBand');
    const statusTitle = document.getElementById('statusTitle');
    const statusText = document.getElementById('statusText');
    if (statusBand && statusTitle && statusText) {
      statusBand.className = 'status-band ready';
      statusTitle.textContent = 'Guida avanzata attiva';
      statusText.textContent = 'Passa con il mouse su campi, titoli e pulsanti per leggere le spiegazioni.';
    }
  }

  function installActivator(){
    let count = 0;
    let last = 0;
    const btn = document.createElement('button');
    btn.id = 'guideActivator';
    btn.type = 'button';
    btn.textContent = '·';
    btn.setAttribute('aria-label','attiva guida');
    btn.addEventListener('click', () => {
      const now = Date.now();
      if (now - last > 2500) count = 0;
      last = now;
      count += 1;
      if (count >= 9) {
        count = 0;
        activateGuide();
      }
    });
    document.body.appendChild(btn);
  }

  const style = document.createElement('style');
  style.textContent = '#guideActivator{position:fixed;right:8px;bottom:8px;width:14px;height:14px;min-height:0;padding:0;border:0;border-radius:50%;background:rgba(0,0,0,.14);color:rgba(0,0,0,.25);font-size:10px;line-height:10px;z-index:9999}#guideActivator:hover{background:rgba(0,0,0,.28);color:#fff}.guide-on [data-guide-ready]{cursor:help;text-decoration:underline dotted #0069c9;text-underline-offset:3px}.guide-help-dot{display:inline-flex;align-items:center;justify-content:center;margin-left:5px;width:14px;height:14px;border-radius:50%;background:#e8f2ff;color:#0069c9;font-size:10px;font-weight:800}';
  document.head.appendChild(style);

  installActivator();
  if (localStorage.getItem('gazeLabGuide') === '1') setTimeout(activateGuide, 200);
})();

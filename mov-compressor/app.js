const WARNING_SIZE_MB = 1500;
const DEFAULT_FPS = 30;

let selectedFile = null;
let sourceUrl = null;
let downloadUrl = null;
let isCompressing = false;
let mediaRecorder = null;
let activeVideo = null;
let animationFrameId = null;
let audioContext = null;

const $ = id => document.getElementById(id);
const fileInput = $('fileInput');
const fileInfo = $('fileInfo');
const qualityInput = $('qualityInput');
const qualityLabel = $('qualityLabel');
const scaleSelect = $('scaleSelect');
const formatSelect = $('formatSelect');
const compressBtn = $('compressBtn');
const cancelBtn = $('cancelBtn');
const statusText = $('statusText');
const progressPct = $('progressPct');
const progressBar = $('progressBar');
const logBox = $('logBox');
const resultPanel = $('resultPanel');
const originalSize = $('originalSize');
const compressedSize = $('compressedSize');
const savedSize = $('savedSize');
const audioMode = $('audioMode');
const downloadLink = $('downloadLink');
const dropzone = $('dropzone');
const warningBox = $('warningBox');

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function sanitizeName(name) {
  return name.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'video';
}

function log(line) {
  logBox.textContent += `${line}\n`;
  logBox.scrollTop = logBox.scrollHeight;
}

function setStatus(text) {
  statusText.textContent = text;
}

function resetProgress() {
  progressBar.value = 0;
  progressPct.textContent = '0%';
}

function setWarning(validation) {
  warningBox.hidden = !validation;
  warningBox.className = validation ? `warning ${validation.level}` : 'warning';
  warningBox.textContent = validation?.text || '';
}

function clearDownload() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  downloadLink.removeAttribute('href');
}

function clearSourceUrl() {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = null;
}

function validateFile(file) {
  if (!file) return { level: 'info', text: 'Nessun file selezionato.' };

  const hasValidExt = /\.(mov|mp4|m4v|webm)$/i.test(file.name);
  const hasVideoType = !file.type || file.type.startsWith('video/');
  const sizeMb = file.size / 1024 / 1024;

  if (!hasValidExt || !hasVideoType) {
    return {
      level: 'error',
      text: 'Formato non supportato. Carica un file video .mov, .mp4, .m4v o .webm.'
    };
  }

  if (sizeMb > WARNING_SIZE_MB) {
    return {
      level: 'warning',
      text: `File molto grande (${formatBytes(file.size)}). Questo metodo non usa FFmpeg WASM, ma la registrazione richiederà circa la durata del video e il browser dovrà comunque creare il file finale in memoria.`
    };
  }

  return null;
}

function getQualityProfile() {
  let value = Number(qualityInput.value || 3);

  // Compatibilità con eventuale HTML vecchio in cache che usava CRF 20-36.
  if (value > 10) {
    if (value <= 23) value = 5;
    else if (value <= 27) value = 4;
    else if (value <= 31) value = 3;
    else if (value <= 34) value = 2;
    else value = 1;
  }

  const profiles = {
    1: { label: 'Molto leggero', bitrate: 900_000 },
    2: { label: 'Leggero', bitrate: 1_500_000 },
    3: { label: 'Bilanciato', bitrate: 2_500_000 },
    4: { label: 'Qualità alta', bitrate: 4_000_000 },
    5: { label: 'Qualità massima', bitrate: 6_000_000 }
  };

  return profiles[Math.max(1, Math.min(5, value))] || profiles[3];
}

function updateQuality() {
  const profile = getQualityProfile();
  qualityLabel.textContent = `${profile.label} · ${(profile.bitrate / 1_000_000).toFixed(1)} Mbps`;
}

function getRequestedMaxHeight() {
  if (scaleSelect.value === 'original') return null;
  const match = scaleSelect.value.match(/:(\d+)/);
  return match ? Number(match[1]) : 720;
}

function even(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function computeOutputSize(video) {
  const sourceWidth = video.videoWidth || 1280;
  const sourceHeight = video.videoHeight || 720;
  const maxHeight = getRequestedMaxHeight();

  if (!maxHeight || sourceHeight <= maxHeight) {
    return { width: even(sourceWidth), height: even(sourceHeight) };
  }

  const ratio = maxHeight / sourceHeight;
  return {
    width: even(sourceWidth * ratio),
    height: even(sourceHeight * ratio)
  };
}

function getSupportedMimeType() {
  const webmTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  const mp4Types = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4'
  ];

  const preference = formatSelect.value;
  const candidates = preference === 'mp4'
    ? [...mp4Types, ...webmTypes]
    : preference === 'webm'
      ? [...webmTypes, ...mp4Types]
      : [...webmTypes, ...mp4Types];

  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function extensionFromMime(mimeType) {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}

function setBusy(value) {
  isCompressing = value;
  compressBtn.disabled = value || !selectedFile || validateFile(selectedFile)?.level === 'error';
  cancelBtn.hidden = !value;
  fileInput.disabled = value;
  qualityInput.disabled = value;
  scaleSelect.disabled = value;
  formatSelect.disabled = value;
}

function loadVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    clearSourceUrl();
    sourceUrl = URL.createObjectURL(file);

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;
    video.muted = true;
    video.src = sourceUrl;

    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error('Il browser non riesce a leggere questo video. Se è un MOV/HEVC da iPhone, prova Safari o usa FFmpeg desktop.'));
  });
}

async function buildRecordingStream(video, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { alpha: false });
  const canvasStream = canvas.captureStream(DEFAULT_FPS);
  const tracks = [...canvasStream.getVideoTracks()];
  let audioDescription = 'nessun audio rilevato';

  try {
    audioContext = new AudioContext();
    await audioContext.resume();
    const source = audioContext.createMediaElementSource(video);
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);
    tracks.push(...destination.stream.getAudioTracks());
    audioDescription = 'audio ricampionato dal browser';
  } catch (error) {
    log(`Audio non disponibile nella registrazione: ${error.message}`);
  }

  function drawFrame() {
    if (!isCompressing || !activeVideo) return;
    context.drawImage(video, 0, 0, width, height);

    if (Number.isFinite(video.duration) && video.duration > 0) {
      const progress = Math.max(0, Math.min(1, video.currentTime / video.duration));
      progressBar.value = progress;
      progressPct.textContent = `${Math.round(progress * 100)}%`;
    }

    animationFrameId = requestAnimationFrame(drawFrame);
  }

  return {
    stream: new MediaStream(tracks),
    drawFrame,
    audioDescription
  };
}

async function recordVideo(video, stream, mimeType, bitrate) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    try {
      mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitrate
      });
    } catch (error) {
      reject(new Error(`MediaRecorder non disponibile per questo formato: ${error.message}`));
      return;
    }

    mediaRecorder.ondataavailable = event => {
      if (event.data && event.data.size) chunks.push(event.data);
    };

    mediaRecorder.onerror = event => {
      reject(new Error(event.error?.message || 'Errore MediaRecorder.'));
    };

    mediaRecorder.onstop = () => {
      const type = mimeType || chunks[0]?.type || 'video/webm';
      resolve(new Blob(chunks, { type }));
    };

    video.onended = () => {
      if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    };

    mediaRecorder.start(1000);
    video.play().catch(error => reject(new Error(`Riproduzione non avviata: ${error.message}`)));
  });
}

async function compress() {
  if (!selectedFile || isCompressing) return;

  const validation = validateFile(selectedFile);
  setWarning(validation);
  if (validation?.level === 'error') return;

  if (!('MediaRecorder' in window)) {
    setStatus('Errore');
    log('Questo browser non supporta MediaRecorder. Usa Chrome/Edge/Safari aggiornato o FFmpeg desktop.');
    return;
  }

  setBusy(true);
  resetProgress();
  logBox.textContent = '';
  resultPanel.hidden = true;
  clearDownload();

  try {
    setStatus('Leggo il video...');
    log('Uso il metodo nativo del browser: video + canvas + MediaRecorder. Nessun FFmpeg WASM, nessun worker esterno.');

    activeVideo = await loadVideoMetadata(selectedFile);
    const { width, height } = computeOutputSize(activeVideo);
    const profile = getQualityProfile();
    const mimeType = getSupportedMimeType();

    if (!mimeType) {
      throw new Error('Il browser non supporta un formato di registrazione video compatibile.');
    }

    log(`Output: ${width}×${height}, ${profile.label}, ${(profile.bitrate / 1_000_000).toFixed(1)} Mbps, ${mimeType}.`);

    const { stream, drawFrame, audioDescription } = await buildRecordingStream(activeVideo, width, height);
    setStatus('Compressione/registrazione in corso...');
    drawFrame();

    const blob = await recordVideo(activeVideo, stream, mimeType, profile.bitrate);
    stream.getTracks().forEach(track => track.stop());

    const ext = extensionFromMime(blob.type || mimeType);
    downloadUrl = URL.createObjectURL(blob);
    downloadLink.href = downloadUrl;
    downloadLink.download = `${sanitizeName(selectedFile.name.replace(/\.[^.]+$/, ''))}-compressed.${ext}`;

    const delta = selectedFile.size ? (1 - blob.size / selectedFile.size) * 100 : 0;
    originalSize.textContent = formatBytes(selectedFile.size);
    compressedSize.textContent = formatBytes(blob.size);
    savedSize.textContent = delta >= 0
      ? `${delta.toFixed(1)}% in meno`
      : `${Math.abs(delta).toFixed(1)}% più grande`;
    audioMode.textContent = audioDescription;

    progressBar.value = 1;
    progressPct.textContent = '100%';
    resultPanel.hidden = false;
    setStatus('Completato');
  } catch (error) {
    resultPanel.hidden = true;
    clearDownload();
    setStatus('Errore');
    log(`Errore: ${error.message || error}`);
    log('Alternativa affidabile per file molto grandi: usare FFmpeg desktop con ridimensionamento a 540p/720p e bitrate controllato.');
  } finally {
    cleanupRuntime();
    setBusy(false);
  }
}

function cleanupRuntime() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;

  if (activeVideo) {
    activeVideo.pause();
    activeVideo.removeAttribute('src');
    activeVideo.load();
  }
  activeVideo = null;
  mediaRecorder = null;

  if (audioContext) audioContext.close().catch(() => {});
  audioContext = null;
}

function cancelCompression() {
  if (!isCompressing) return;

  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
  cleanupRuntime();
  setStatus('Annullato');
  log('Compressione annullata.');
  resultPanel.hidden = true;
  clearDownload();
  setBusy(false);
}

function selectFile(file) {
  selectedFile = file || null;
  resultPanel.hidden = true;
  clearDownload();
  clearSourceUrl();
  resetProgress();
  logBox.textContent = '';

  const validation = validateFile(selectedFile);
  setWarning(validation);

  if (!selectedFile) {
    fileInfo.textContent = 'Nessun file selezionato.';
    compressBtn.disabled = true;
    return;
  }

  fileInfo.textContent = `${selectedFile.name} · ${formatBytes(selectedFile.size)}`;
  compressBtn.disabled = validation?.level === 'error';
}

qualityInput.addEventListener('input', updateQuality);
fileInput.addEventListener('change', event => selectFile(event.target.files?.[0]));
compressBtn.addEventListener('click', compress);
cancelBtn.addEventListener('click', cancelCompression);

dropzone.addEventListener('dragover', event => {
  event.preventDefault();
  dropzone.classList.add('drag');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', event => {
  event.preventDefault();
  dropzone.classList.remove('drag');
  selectFile(event.dataTransfer.files?.[0]);
});

updateQuality();

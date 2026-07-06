import { FFmpeg } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
import { fetchFile, toBlobURL } from 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js';

const FFMPEG_VERSION = '0.12.10';
const CORE_VERSION = '0.12.6';
const MAX_RECOMMENDED_MB = 750;
const MAX_HARD_MB = 1500;

const ffmpeg = new FFmpeg();
let loaded = false;
let selectedFile = null;
let downloadUrl = null;
let isCompressing = false;
let inputName = null;
let outputName = null;
let ffmpegListenersReady = false;

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

function getInputExtension(file) {
  const match = file?.name?.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : 'mov';
}

function validateFile(file) {
  if (!file) return { level: 'info', text: 'Nessun file selezionato.' };

  const hasValidExt = /\.(mov|mp4)$/i.test(file.name);
  const hasValidType = ['video/quicktime', 'video/mp4', ''].includes(file.type);
  const sizeMb = file.size / 1024 / 1024;

  if (!hasValidExt || !hasValidType) {
    return {
      level: 'error',
      text: 'Formato non supportato. Carica un file .mov o .mp4.'
    };
  }

  if (sizeMb > MAX_HARD_MB) {
    return {
      level: 'error',
      text: `File troppo grande per una compressione affidabile nel browser (${formatBytes(file.size)}). Per file sopra ${MAX_HARD_MB} MB usa FFmpeg desktop o riduci prima il video.`
    };
  }

  if (sizeMb > MAX_RECOMMENDED_MB) {
    return {
      level: 'warning',
      text: `File grande (${formatBytes(file.size)}). La compressione resta locale, ma può richiedere molta RAM e potrebbe fallire.`
    };
  }

  return null;
}

function setStatus(text) {
  statusText.textContent = text;
}

function setWarning(validation) {
  warningBox.hidden = !validation;
  warningBox.className = validation ? `warning ${validation.level}` : 'warning';
  warningBox.textContent = validation?.text || '';
}

function log(line) {
  logBox.textContent += `${line}\n`;
  logBox.scrollTop = logBox.scrollHeight;
}

function resetProgress() {
  progressBar.value = 0;
  progressPct.textContent = '0%';
}

function clearDownload() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  downloadLink.removeAttribute('href');
}

function updateQuality() {
  qualityLabel.textContent = `CRF ${qualityInput.value}`;
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

function registerFFmpegListeners() {
  if (ffmpegListenersReady) return;
  ffmpeg.on('log', ({ message }) => log(message));
  ffmpeg.on('progress', ({ progress }) => {
    const value = Math.max(0, Math.min(1, progress || 0));
    progressBar.value = value;
    progressPct.textContent = `${Math.round(value * 100)}%`;
  });
  ffmpegListenersReady = true;
}

async function loadFFmpeg() {
  if (loaded) return;

  setStatus('Carico motore video...');
  log('Caricamento ffmpeg.wasm. Può richiedere qualche secondo.');

  registerFFmpegListeners();

  const ffmpegBaseURL = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm`;
  const coreBaseURL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

  await ffmpeg.load({
    classWorkerURL: await toBlobURL(`${ffmpegBaseURL}/worker.js`, 'text/javascript'),
    coreURL: await toBlobURL(`${coreBaseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${coreBaseURL}/ffmpeg-core.wasm`, 'application/wasm')
  });

  loaded = true;
  setStatus('Motore video pronto');
}

function selectFile(file) {
  selectedFile = file || null;
  resultPanel.hidden = true;
  clearDownload();
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

function buildVideoArgs({ input, output, crf, copyAudio }) {
  const args = [
    '-i', input,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', crf,
    '-movflags', '+faststart'
  ];

  if (scaleSelect.value !== 'original') {
    args.push('-vf', `scale=${scaleSelect.value}:force_original_aspect_ratio=decrease`);
  }

  if (copyAudio) {
    args.push('-c:a', 'copy');
  } else {
    args.push('-c:a', 'aac', '-b:a', '128k');
  }

  args.push(output);
  return args;
}

async function execOrThrow(args) {
  log(`Comando: ffmpeg ${args.join(' ')}`);
  const code = await ffmpeg.exec(args);
  if (code !== 0) throw new Error(`FFmpeg terminato con codice ${code}.`);
}

async function runCompression(input, output, crf) {
  const copyAudioArgs = buildVideoArgs({ input, output, crf, copyAudio: true });

  try {
    setStatus('Compressione in corso...');
    await execOrThrow(copyAudioArgs);
    return 'audio originale copiato';
  } catch (error) {
    log(`Audio copy non riuscito: ${error.message}`);
    log('Riprovo convertendo audio in AAC per migliorare la compatibilità MP4...');
    await ffmpeg.deleteFile(output).catch(() => {});
    const fallbackArgs = buildVideoArgs({ input, output, crf, copyAudio: false });
    await execOrThrow(fallbackArgs);
    return 'audio convertito in AAC';
  }
}

async function cleanupFiles() {
  if (inputName) await ffmpeg.deleteFile(inputName).catch(() => {});
  if (outputName) await ffmpeg.deleteFile(outputName).catch(() => {});
  inputName = null;
  outputName = null;
}

async function compress() {
  if (!selectedFile || isCompressing) return;

  const validation = validateFile(selectedFile);
  setWarning(validation);
  if (validation?.level === 'error') return;

  setBusy(true);
  resetProgress();
  logBox.textContent = '';
  resultPanel.hidden = true;
  clearDownload();

  try {
    await loadFFmpeg();

    const inputExt = getInputExtension(selectedFile);
    const outputExt = formatSelect.value === 'mov' ? 'mov' : 'mp4';
    inputName = `input.${inputExt}`;
    outputName = `compressed.${outputExt}`;

    setStatus('Scrivo il file in memoria...');
    await ffmpeg.writeFile(inputName, await fetchFile(selectedFile));

    const crf = qualityInput.value;
    const audioResult = await runCompression(inputName, outputName, crf);

    setStatus('Creo il download...');
    const data = await ffmpeg.readFile(outputName);
    const mime = outputExt === 'mov' ? 'video/quicktime' : 'video/mp4';
    const blob = new Blob([data.buffer], { type: mime });

    downloadUrl = URL.createObjectURL(blob);
    downloadLink.href = downloadUrl;
    downloadLink.download = `${sanitizeName(selectedFile.name.replace(/\.[^.]+$/, ''))}-compressed.${outputExt}`;

    const delta = selectedFile.size ? (1 - blob.size / selectedFile.size) * 100 : 0;
    originalSize.textContent = formatBytes(selectedFile.size);
    compressedSize.textContent = formatBytes(blob.size);
    savedSize.textContent = delta >= 0
      ? `${delta.toFixed(1)}% in meno`
      : `${Math.abs(delta).toFixed(1)}% più grande`;
    audioMode.textContent = audioResult;

    resultPanel.hidden = false;
    setStatus('Completato');
  } catch (error) {
    resultPanel.hidden = true;
    clearDownload();
    setStatus('Errore');
    log(`Errore: ${error.message || error}`);
    log('Suggerimento: prova un file più piccolo, una risoluzione più bassa o usa FFmpeg desktop per video molto grandi.');
  } finally {
    await cleanupFiles();
    setBusy(false);
  }
}

function cancelCompression() {
  if (!isCompressing) return;
  ffmpeg.terminate();
  loaded = false;
  setStatus('Annullato');
  log('Compressione annullata. Il motore video sarà ricaricato al prossimo avvio.');
  resultPanel.hidden = true;
  clearDownload();
  setBusy(false);
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

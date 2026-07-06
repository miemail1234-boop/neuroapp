import { FFmpeg } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
import { fetchFile, toBlobURL } from 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js';

const ffmpeg = new FFmpeg();
let loaded = false;
let selectedFile = null;
let downloadUrl = null;

const $ = id => document.getElementById(id);
const fileInput = $('fileInput');
const fileInfo = $('fileInfo');
const qualityInput = $('qualityInput');
const qualityLabel = $('qualityLabel');
const scaleSelect = $('scaleSelect');
const formatSelect = $('formatSelect');
const compressBtn = $('compressBtn');
const statusText = $('statusText');
const progressPct = $('progressPct');
const progressBar = $('progressBar');
const logBox = $('logBox');
const resultPanel = $('resultPanel');
const originalSize = $('originalSize');
const compressedSize = $('compressedSize');
const savedSize = $('savedSize');
const downloadLink = $('downloadLink');
const dropzone = $('dropzone');

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

function setStatus(text) {
  statusText.textContent = text;
}

function log(line) {
  logBox.textContent += `${line}\n`;
  logBox.scrollTop = logBox.scrollHeight;
}

function updateQuality() {
  qualityLabel.textContent = `CRF ${qualityInput.value}`;
}

async function loadFFmpeg() {
  if (loaded) return;
  setStatus('Carico motore video...');
  log('Caricamento ffmpeg.wasm. Può richiedere qualche secondo.');
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  ffmpeg.on('log', ({ message }) => log(message));
  ffmpeg.on('progress', ({ progress }) => {
    const value = Math.max(0, Math.min(1, progress || 0));
    progressBar.value = value;
    progressPct.textContent = `${Math.round(value * 100)}%`;
  });
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  loaded = true;
  setStatus('Motore video pronto');
}

function selectFile(file) {
  selectedFile = file || null;
  resultPanel.hidden = true;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  if (!selectedFile) {
    fileInfo.textContent = 'Nessun file selezionato.';
    compressBtn.disabled = true;
    return;
  }
  fileInfo.textContent = `${selectedFile.name} · ${formatBytes(selectedFile.size)}`;
  compressBtn.disabled = false;
}

async function compress() {
  if (!selectedFile) return;
  compressBtn.disabled = true;
  progressBar.value = 0;
  progressPct.textContent = '0%';
  logBox.textContent = '';
  resultPanel.hidden = true;
  try {
    await loadFFmpeg();
    const inputName = 'input.mov';
    const ext = formatSelect.value === 'mov' ? 'mov' : 'mp4';
    const outputName = `compressed.${ext}`;
    setStatus('Scrivo il file in memoria...');
    await ffmpeg.writeFile(inputName, await fetchFile(selectedFile));

    const crf = qualityInput.value;
    const args = ['-i', inputName, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf, '-movflags', '+faststart', '-c:a', 'copy'];
    if (scaleSelect.value !== 'original') args.push('-vf', `scale=${scaleSelect.value}:force_original_aspect_ratio=decrease`);
    args.push(outputName);

    setStatus('Compressione in corso...');
    log(`Comando: ffmpeg ${args.join(' ')}`);
    await ffmpeg.exec(args);

    setStatus('Creo il download...');
    const data = await ffmpeg.readFile(outputName);
    const mime = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
    const blob = new Blob([data.buffer], { type: mime });
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(blob);
    downloadLink.href = downloadUrl;
    downloadLink.download = selectedFile.name.replace(/\.[^.]+$/, '') + `-compressed.${ext}`;

    originalSize.textContent = formatBytes(selectedFile.size);
    compressedSize.textContent = formatBytes(blob.size);
    const saved = selectedFile.size ? Math.max(0, 1 - blob.size / selectedFile.size) * 100 : 0;
    savedSize.textContent = `${saved.toFixed(1)}%`;
    resultPanel.hidden = false;
    setStatus('Completato');

    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  } catch (error) {
    setStatus('Errore');
    log(`Errore: ${error.message}`);
  } finally {
    compressBtn.disabled = !selectedFile;
  }
}

qualityInput.addEventListener('input', updateQuality);
fileInput.addEventListener('change', event => selectFile(event.target.files?.[0]));
compressBtn.addEventListener('click', compress);

dropzone.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', event => {
  event.preventDefault();
  dropzone.classList.remove('drag');
  selectFile(event.dataTransfer.files?.[0]);
});

updateQuality();

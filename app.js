const SAMPLE_DATASETS = {
  sample1: {
    label: "Dati esempio 1",
    base: "../Dati esempio/prova_marker_intermedi_1-43012a5c/",
    video: "c52231e8_0.0-35.484.mp4",
  },
  sample2: {
    label: "Dati esempio 2",
    base: "../Dati esempio 2/2026-05-14_fedele_vincenzo_pre_saccadi-f313f306/",
    video: "30cc968f_0.0-154.523.mp4",
  },
};

const state = {
  sourceName: "",
  info: null,
  gaze: [],
  events: [],
  worldTimestamps: [],
  saccades: [],
  blinks: [],
  trials: [],
  results: [],
  summaries: [],
  t0Ns: null,
  traceBounds: null,
  videoObjectUrl: "",
  pendingVideoSrc: "",
  targetCenter: null,
  markingCenter: false,
};

let playbackAnimationId = null;

const el = {
  statusBand: document.getElementById("statusBand"),
  statusTitle: document.getElementById("statusTitle"),
  statusText: document.getElementById("statusText"),
  loadSampleBtn: document.getElementById("loadSampleBtn"),
  loadSample2Btn: document.getElementById("loadSample2Btn"),
  folderInput: document.getElementById("folderInput"),
  trialInput: document.getElementById("trialInput"),
  videoInput: document.getElementById("videoInput"),
  videoStage: document.getElementById("videoStage"),
  stimulusVideo: document.getElementById("stimulusVideo"),
  videoOverlayCanvas: document.getElementById("videoOverlayCanvas"),
  videoTimeLabel: document.getElementById("videoTimeLabel"),
  gazeTimeLabel: document.getElementById("gazeTimeLabel"),
  syncOffsetMs: document.getElementById("syncOffsetMs"),
  markCenterBtn: document.getElementById("markCenterBtn"),
  clearCenterBtn: document.getElementById("clearCenterBtn"),
  targetCenterLabel: document.getElementById("targetCenterLabel"),
  gazePointLabel: document.getElementById("gazePointLabel"),
  frameBackBtn: document.getElementById("frameBackBtn"),
  frameForwardBtn: document.getElementById("frameForwardBtn"),
  addVideoTrialBtn: document.getElementById("addVideoTrialBtn"),
  monitorDistance: document.getElementById("monitorDistance"),
  nearDistance: document.getElementById("nearDistance"),
  farDistance: document.getElementById("farDistance"),
  durationMs: document.getElementById("durationMs"),
  windowStartMs: document.getElementById("windowStartMs"),
  windowEndMs: document.getElementById("windowEndMs"),
  newOnset: document.getElementById("newOnset"),
  newDirection: document.getElementById("newDirection"),
  newDistanceKind: document.getElementById("newDistanceKind"),
  addTrialBtn: document.getElementById("addTrialBtn"),
  suggestEventsBtn: document.getElementById("suggestEventsBtn"),
  suggestTrialsBtn: document.getElementById("suggestTrialsBtn"),
  clearTrialsBtn: document.getElementById("clearTrialsBtn"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  traceCanvas: document.getElementById("traceCanvas"),
  plotSubtitle: document.getElementById("plotSubtitle"),
  sampleCount: document.getElementById("sampleCount"),
  trialCount: document.getElementById("trialCount"),
  leftGain: document.getElementById("leftGain"),
  rightGain: document.getElementById("rightGain"),
  lateralityIndex: document.getElementById("lateralityIndex"),
  conditionBody: document.getElementById("conditionBody"),
  trialBody: document.getElementById("trialBody"),
  trialRowTemplate: document.getElementById("trialRowTemplate"),
};

function getSettings() {
  const monitorDistanceCm = numberFromInput(el.monitorDistance, 35);
  const nearDistanceCm = numberFromInput(el.nearDistance, 9);
  const farDistanceCm = numberFromInput(el.farDistance, 16);
  const durationMs = numberFromInput(el.durationMs, 300);
  const windowStartMs = numberFromInput(el.windowStartMs, 120);
  const windowEndMs = numberFromInput(el.windowEndMs, 220);

  return {
    monitorDistanceCm,
    nearDistanceCm,
    farDistanceCm,
    durationMs,
    windowStartMs,
    windowEndMs: Math.max(windowStartMs + 5, windowEndMs),
    baselineMs: 100,
    endpointWindowMs: 70,
    saccadePaddingMs: 8,
  };
}

function numberFromInput(input, fallback) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function setStatus(kind, title, text) {
  el.statusBand.className = `status-band ${kind || ""}`.trim();
  el.statusTitle.textContent = title;
  el.statusText.textContent = text;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  if (rows.length < 1) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = (cells[index] ?? "").trim();
    });
    return entry;
  });
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return NaN;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function readFileAsText(file) {
  return await file.text();
}

function findFile(files, names) {
  const lowered = new Map(files.map((file) => [file.name.toLowerCase(), file]));
  for (const name of names) {
    const match = lowered.get(name.toLowerCase());
    if (match) return match;
  }
  return null;
}

function pathLooksLike(file, name) {
  return file.name.toLowerCase() === name || (file.webkitRelativePath || "").toLowerCase().endsWith(`/${name}`);
}

function findFileByName(files, name) {
  return files.find((file) => pathLooksLike(file, name.toLowerCase())) || null;
}

async function handleFolderImport(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const gazeFile = findFileByName(files, "gaze.csv");
  if (!gazeFile) {
    setStatus("bad", "gaze.csv non trovato", "Seleziona una cartella che contenga almeno gaze.csv.");
    return;
  }

  try {
    await loadDatasetFromFiles(files, gazeFile.webkitRelativePath?.split("/")[0] || "Cartella importata");
  } catch (error) {
    console.error(error);
    setStatus("bad", "Errore importazione", error.message || "Impossibile leggere i file selezionati.");
  }
}

async function loadDatasetFromFiles(files, sourceName) {
  const gazeFile = findFileByName(files, "gaze.csv");
  const saccadesFile = findFileByName(files, "saccades.csv");
  const blinksFile = findFileByName(files, "blinks.csv");
  const eventsFile = findFileByName(files, "events.csv");
  const worldTsFile = findFileByName(files, "world_timestamps.csv");
  const infoFile = findFileByName(files, "info.json");
  const videoFile = files.find((file) => /\.(mp4|mov|webm)$/i.test(file.name));

  const gazeRows = parseCSV(await readFileAsText(gazeFile));
  const info = infoFile ? JSON.parse(await readFileAsText(infoFile)) : {};
  const events = eventsFile ? parseEvents(parseCSV(await readFileAsText(eventsFile))) : [];
  const worldTimestamps = worldTsFile ? parseWorldTimestamps(parseCSV(await readFileAsText(worldTsFile))) : [];

  state.sourceName = sourceName;
  state.info = info;
  state.t0Ns = getRecordingStartNs(info, gazeRows);
  state.gaze = parseGazeRows(gazeRows, state.t0Ns);
  state.events = events;
  state.worldTimestamps = worldTimestamps;
  state.saccades = saccadesFile ? parseIntervals(parseCSV(await readFileAsText(saccadesFile)), state.t0Ns, "saccade") : [];
  state.blinks = blinksFile ? parseIntervals(parseCSV(await readFileAsText(blinksFile)), state.t0Ns, "blink") : [];
  state.trials = [];
  state.results = [];
  state.summaries = [];
  state.pendingVideoSrc = "";
  clearVideoObjectUrl();

  if (videoFile) {
    loadVideoFile(videoFile);
  }

  setStatus("ready", "Dati caricati", `${state.gaze.length.toLocaleString("it-IT")} campioni gaze, ${state.saccades.length} saccadi, ${state.blinks.length} blink.`);
  renderAll();
  renderVideoOverlay();
}

async function loadSampleData(key) {
  const config = SAMPLE_DATASETS[key];
  if (!config) return;
  try {
    const paths = {
      gaze: `${config.base}gaze.csv`,
      saccades: `${config.base}saccades.csv`,
      blinks: `${config.base}blinks.csv`,
      events: `${config.base}events.csv`,
      world: `${config.base}world_timestamps.csv`,
      info: `${config.base}info.json`,
    };
    const [gazeText, saccadesText, blinksText, eventsText, worldText, infoText] = await Promise.all([
      fetch(paths.gaze).then(assertOk).then((r) => r.text()),
      fetch(paths.saccades).then((r) => (r.ok ? r.text() : "")),
      fetch(paths.blinks).then((r) => (r.ok ? r.text() : "")),
      fetch(paths.events).then((r) => (r.ok ? r.text() : "")),
      fetch(paths.world).then((r) => (r.ok ? r.text() : "")),
      fetch(paths.info).then((r) => (r.ok ? r.text() : "{}")),
    ]);

    const gazeRows = parseCSV(gazeText);
    const info = JSON.parse(infoText || "{}");
    state.sourceName = config.label;
    state.info = info;
    state.t0Ns = getRecordingStartNs(info, gazeRows);
    state.gaze = parseGazeRows(gazeRows, state.t0Ns);
    state.saccades = saccadesText ? parseIntervals(parseCSV(saccadesText), state.t0Ns, "saccade") : [];
    state.blinks = blinksText ? parseIntervals(parseCSV(blinksText), state.t0Ns, "blink") : [];
    state.events = eventsText ? parseEvents(parseCSV(eventsText)) : [];
    state.worldTimestamps = worldText ? parseWorldTimestamps(parseCSV(worldText)) : [];
    state.trials = [];
    state.results = [];
    state.summaries = [];
    state.pendingVideoSrc = config.video ? `${config.base}${config.video}` : "";
    clearVideoObjectUrl();
    if (state.pendingVideoSrc) {
      el.stimulusVideo.src = state.pendingVideoSrc;
    }
    setStatus("ready", `${config.label} caricato`, `${state.gaze.length.toLocaleString("it-IT")} campioni gaze disponibili.`);
    renderAll();
    renderVideoOverlay();
  } catch (error) {
    console.error(error);
    setStatus("bad", `${config.label} non raggiungibile`, "Importa manualmente la cartella con i file dati.");
  }
}

function assertOk(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

function getRecordingStartNs(info, gazeRows) {
  const candidates = [
    info?.recording_start_time_ns,
    info?.start_time_synced_s ? Number(info.start_time_synced_s) * 1e9 : undefined,
    gazeRows?.[0]?.recording_time_nanoseconds,
    gazeRows?.[0]?.timestamp_ns,
    gazeRows?.[0]?.gaze_timestamp_ns,
  ];
  for (const candidate of candidates) {
    const value = toNumber(candidate);
    if (Number.isFinite(value) && value > 1e6) return value;
  }
  return null;
}

function parseGazeRows(rows, t0Ns) {
  const parsed = rows.map((row, index) => {
    const rawTime = firstFinite([
      row.recording_time_nanoseconds,
      row.timestamp_ns,
      row.gaze_timestamp_ns,
      row.timestamp,
      row.time,
      row.t,
      row.gaze_timestamp,
    ]);
    let t;
    if (Number.isFinite(rawTime)) {
      if (rawTime > 1e9 && t0Ns) t = (rawTime - t0Ns) / 1e9;
      else if (rawTime > 1e6) t = rawTime / 1e9;
      else t = rawTime;
    } else {
      const frequency = toNumber(row.gaze_frequency) || 200;
      t = index / frequency;
    }

    const xNorm = firstFinite([
      row.norm_pos_x,
      row.x_norm,
      row.gaze_normal0_x,
      row.gaze_point_3d_x,
      row.x,
    ]);
    const yNorm = firstFinite([
      row.norm_pos_y,
      row.y_norm,
      row.gaze_normal0_y,
      row.gaze_point_3d_y,
      row.y,
    ]);
    const sceneX = firstFinite([row.scene_camera_frame_pixel_x, row.gaze_point_2d_x, row.x_px, row.pixel_x]);
    const sceneY = firstFinite([row.scene_camera_frame_pixel_y, row.gaze_point_2d_y, row.y_px, row.pixel_y]);
    const azimuth = firstFinite([
      row.azimuth_deg,
      row.azimuth,
      row.theta_deg,
      row.gaze_angle_x,
      row.gaze_angle_deg_x,
    ]);
    const elevation = firstFinite([
      row.elevation_deg,
      row.elevation,
      row.phi_deg,
      row.gaze_angle_y,
      row.gaze_angle_deg_y,
    ]);

    return {
      t,
      xNorm,
      yNorm,
      sceneX,
      sceneY,
      azimuthDeg: Number.isFinite(azimuth) ? azimuth : normToAzimuth(xNorm),
      elevationDeg: Number.isFinite(elevation) ? elevation : normToElevation(yNorm),
      excluded: false,
      vxDeg: NaN,
    };
  }).filter((sample) => Number.isFinite(sample.t)).sort((a, b) => a.t - b.t);

  computeVelocities(parsed);
  markExcluded(parsed);
  return parsed;
}

function firstFinite(values) {
  for (const value of values) {
    const parsed = toNumber(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function normToAzimuth(x) {
  if (!Number.isFinite(x)) return NaN;
  return (x - 0.5) * 60;
}

function normToElevation(y) {
  if (!Number.isFinite(y)) return NaN;
  return (0.5 - y) * 36;
}

function computeVelocities(samples) {
  for (let i = 1; i < samples.length - 1; i += 1) {
    const prev = samples[i - 1];
    const next = samples[i + 1];
    const dt = next.t - prev.t;
    samples[i].vxDeg = dt > 0 ? (next.azimuthDeg - prev.azimuthDeg) / dt : NaN;
  }
}

function parseIntervals(rows, t0Ns, kind) {
  return rows.map((row) => {
    const startRaw = firstFinite([row.start_time, row.start_timestamp, row.start_time_ns, row.start_timestamp_ns]);
    const endRaw = firstFinite([row.end_time, row.end_timestamp, row.end_time_ns, row.end_timestamp_ns]);
    const start = normalizeTime(startRaw, t0Ns);
    const end = normalizeTime(endRaw, t0Ns);
    return { start, end, kind };
  }).filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end >= interval.start);
}

function normalizeTime(value, t0Ns) {
  if (!Number.isFinite(value)) return NaN;
  if (value > 1e9 && t0Ns) return (value - t0Ns) / 1e9;
  if (value > 1e6) return value / 1e9;
  return value;
}

function parseEvents(rows) {
  return rows.map((row) => ({
    t: firstFinite([row.timestamp, row.time, row.t, row.recording_time_s, row.recording_time]),
    name: row.name || row.label || row.event || row.type || "event",
  })).filter((event) => Number.isFinite(event.t));
}

function parseWorldTimestamps(rows) {
  return rows.map((row, index) => ({
    frame: toNumber(row.frame_idx ?? row.frame ?? index),
    t: firstFinite([row.timestamp, row.time, row.t, row.recording_time_s]),
  })).filter((entry) => Number.isFinite(entry.t));
}

function markExcluded(samples) {
  const padding = getSettings().saccadePaddingMs / 1000;
  for (const sample of samples) {
    sample.excluded = state.blinks.some((blink) => sample.t >= blink.start - padding && sample.t <= blink.end + padding)
      || state.saccades.some((saccade) => sample.t >= saccade.start - padding && sample.t <= saccade.end + padding);
  }
}

async function handleTrialImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const rows = parseCSV(await readFileAsText(file));
  state.trials = rows.map((row, index) => ({
    onset: firstFinite([row.onset_s, row.onset, row.time, row.t]),
    direction: normalizeDirection(row.direction || row.direzione),
    distanceKind: normalizeDistance(row.distance || row.distanza || row.distanceKind),
    source: `csv:${index + 1}`,
  })).filter((trial) => Number.isFinite(trial.onset));
  analyze();
  renderAll();
}

function normalizeDirection(value) {
  const text = String(value || "").toLowerCase();
  if (["right", "destra", "dx", "r"].includes(text)) return "right";
  return "left";
}

function normalizeDistance(value) {
  const text = String(value || "").toLowerCase();
  if (["far", "ampia", "lunga", "wide", "a"].includes(text)) return "far";
  return "near";
}

function loadVideoFile(file) {
  clearVideoObjectUrl();
  state.videoObjectUrl = URL.createObjectURL(file);
  el.stimulusVideo.src = state.videoObjectUrl;
  renderVideoOverlay();
}

function handleVideoImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  loadVideoFile(file);
}

function clearVideoObjectUrl() {
  if (state.videoObjectUrl) {
    URL.revokeObjectURL(state.videoObjectUrl);
    state.videoObjectUrl = "";
  }
  el.stimulusVideo.removeAttribute("src");
  el.stimulusVideo.load();
}

function addManualTrial() {
  const onset = numberFromInput(el.newOnset, NaN);
  if (!Number.isFinite(onset)) {
    setStatus("warn", "Onset mancante", "Inserisci il tempo di onset in secondi.");
    return;
  }
  state.trials.push({
    onset,
    direction: el.newDirection.value,
    distanceKind: el.newDistanceKind.value,
    source: "manual",
  });
  analyze();
  renderAll();
}

function addVideoTrial() {
  const recordingTime = currentRecordingTimeFromVideo();
  if (!Number.isFinite(recordingTime)) return;
  el.newOnset.value = recordingTime.toFixed(3);
  addManualTrial();
}

function currentRecordingTimeFromVideo() {
  if (!el.stimulusVideo.duration) return NaN;
  return el.stimulusVideo.currentTime + numberFromInput(el.syncOffsetMs, 0) / 1000;
}

function seekVideoToRecordingTime(recordingTime) {
  if (!el.stimulusVideo.duration) return;
  const videoTime = recordingTime - numberFromInput(el.syncOffsetMs, 0) / 1000;
  el.stimulusVideo.currentTime = clamp(videoTime, 0, el.stimulusVideo.duration);
}

function stepVideoFrame(direction) {
  if (!el.stimulusVideo.duration) return;
  const fps = estimateVideoFps();
  el.stimulusVideo.pause();
  el.stimulusVideo.currentTime = clamp(el.stimulusVideo.currentTime + direction / fps, 0, el.stimulusVideo.duration);
  updateVideoTimeLabels();
  renderTrace();
  renderVideoOverlay();
}

function estimateVideoFps() {
  if (state.worldTimestamps.length > 2) {
    const diffs = [];
    for (let i = 1; i < Math.min(state.worldTimestamps.length, 120); i += 1) {
      const dt = state.worldTimestamps[i].t - state.worldTimestamps[i - 1].t;
      if (dt > 0 && dt < 1) diffs.push(dt);
    }
    const med = median(diffs);
    if (Number.isFinite(med) && med > 0) return 1 / med;
  }
  return 30;
}

function updateVideoTimeLabels() {
  el.videoTimeLabel.textContent = Number.isFinite(el.stimulusVideo.currentTime) ? `${el.stimulusVideo.currentTime.toFixed(3)} s` : "-";
  const recordingTime = currentRecordingTimeFromVideo();
  el.gazeTimeLabel.textContent = Number.isFinite(recordingTime) ? `${recordingTime.toFixed(3)} s` : "-";
  renderVideoOverlay();
}

function startPlaybackCursor() {
  stopPlaybackCursor();
  const tick = () => {
    updateVideoTimeLabels();
    renderTrace();
    playbackAnimationId = requestAnimationFrame(tick);
  };
  tick();
}

function stopPlaybackCursor() {
  if (playbackAnimationId) cancelAnimationFrame(playbackAnimationId);
  playbackAnimationId = null;
  updateVideoTimeLabels();
  renderTrace();
  renderVideoOverlay();
}

function handleVideoOverlayClick(event) {
  if (!el.stimulusVideo.videoWidth || !el.stimulusVideo.videoHeight) return;
  const rect = el.videoOverlayCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const contentRect = getVideoContentRect();
  const point = overlayToScenePoint(x, y, contentRect);
  if (!point) return;
  if (state.markingCenter) {
    state.targetCenter = point;
    state.markingCenter = false;
    el.videoStage.classList.remove("marking");
    setStatus("ready", "Puntino centrale salvato", `x ${point.x.toFixed(0)}, y ${point.y.toFixed(0)}.`);
    renderVideoOverlay();
  }
}

function renderVideoOverlay() {
  const canvas = el.videoOverlayCanvas;
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
  canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);

  if (!el.stimulusVideo.videoWidth || !el.stimulusVideo.videoHeight) {
    el.targetCenterLabel.textContent = state.targetCenter ? `${state.targetCenter.x.toFixed(0)}, ${state.targetCenter.y.toFixed(0)}` : "-";
    el.gazePointLabel.textContent = "-";
    return;
  }

  const contentRect = getVideoContentRect();
  drawVideoContentBorder(context, contentRect);
  if (state.targetCenter) {
    const point = sceneToOverlayPoint(state.targetCenter.x, state.targetCenter.y, contentRect);
    drawMarker(context, point.x, point.y, "#f5b041", "P");
    el.targetCenterLabel.textContent = `${state.targetCenter.x.toFixed(0)}, ${state.targetCenter.y.toFixed(0)}`;
  } else {
    el.targetCenterLabel.textContent = "-";
  }

  const recordingTime = currentRecordingTimeFromVideo();
  const gaze = Number.isFinite(recordingTime) ? nearestGazeSample(recordingTime) : null;
  const gazePoint = gazeToScenePoint(gaze, contentRect.videoWidth, contentRect.videoHeight);
  if (gazePoint) {
    const overlayPoint = sceneToOverlayPoint(gazePoint.x, gazePoint.y, contentRect);
    drawMarker(context, overlayPoint.x, overlayPoint.y, "#4aa3df", "G");
    el.gazePointLabel.textContent = `${gazePoint.x.toFixed(0)}, ${gazePoint.y.toFixed(0)}`;
  } else {
    el.gazePointLabel.textContent = "-";
  }
}

function gazeToScenePoint(gaze, videoWidth, videoHeight) {
  if (!gaze) return null;
  if (Number.isFinite(gaze.sceneX) && Number.isFinite(gaze.sceneY)) return { x: gaze.sceneX, y: gaze.sceneY };
  if (Number.isFinite(gaze.xNorm) && Number.isFinite(gaze.yNorm)) return { x: gaze.xNorm * videoWidth, y: (1 - gaze.yNorm) * videoHeight };
  if (Number.isFinite(gaze.azimuthDeg) && Number.isFinite(gaze.elevationDeg)) {
    return {
      x: (gaze.azimuthDeg / 60 + 0.5) * videoWidth,
      y: (0.5 - gaze.elevationDeg / 36) * videoHeight,
    };
  }
  return null;
}

function getVideoContentRect() {
  const rect = el.videoStage.getBoundingClientRect();
  const stageWidth = rect.width;
  const stageHeight = rect.height;
  const videoWidth = el.stimulusVideo.videoWidth || 1600;
  const videoHeight = el.stimulusVideo.videoHeight || 1200;
  const scale = Math.min(stageWidth / videoWidth, stageHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    x: (stageWidth - width) / 2,
    y: (stageHeight - height) / 2,
    width,
    height,
    scale,
    videoWidth,
    videoHeight,
  };
}

function sceneToOverlayPoint(x, y, contentRect) {
  return {
    x: contentRect.x + x * contentRect.scale,
    y: contentRect.y + y * contentRect.scale,
  };
}

function overlayToScenePoint(x, y, contentRect) {
  if (
    x < contentRect.x ||
    x > contentRect.x + contentRect.width ||
    y < contentRect.y ||
    y > contentRect.y + contentRect.height
  ) {
    return null;
  }

  return {
    x: clamp((x - contentRect.x) / contentRect.scale, 0, contentRect.videoWidth),
    y: clamp((y - contentRect.y) / contentRect.scale, 0, contentRect.videoHeight),
  };
}

function drawVideoContentBorder(context, contentRect) {
  context.strokeStyle = "rgba(255,255,255,0.35)";
  context.lineWidth = 1;
  context.strokeRect(contentRect.x, contentRect.y, contentRect.width, contentRect.height);
}

function drawMarker(context, x, y, color, label) {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 2.4;
  context.beginPath();
  context.arc(x, y, 10, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(x - 16, y);
  context.lineTo(x + 16, y);
  context.moveTo(x, y - 16);
  context.lineTo(x, y + 16);
  context.stroke();
  context.beginPath();
  context.arc(x, y, 3, 0, Math.PI * 2);
  context.fill();
  context.font = "700 12px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#fff";
  context.fillText(label, x, y - 25);
  context.restore();
}

function startMarkCenterMode() {
  state.markingCenter = true;
  el.videoStage.classList.add("marking");
  setStatus("warn", "Segna il puntino centrale", "Clicca sul video nel centro del pallino/target da usare come riferimento.");
}

function clearTargetCenter() {
  state.targetCenter = null;
  state.markingCenter = false;
  el.videoStage.classList.remove("marking");
  renderVideoOverlay();
}

function suggestTrialsFromEvents() {
  if (!state.events.length) {
    setStatus("warn", "Nessun events.csv", "Importa events.csv oppure inserisci i trial manualmente.");
    return;
  }
  const suggested = state.events.map((event, index) => ({
    onset: event.t,
    direction: index % 2 === 0 ? "left" : "right",
    distanceKind: index % 4 < 2 ? "near" : "far",
    source: event.name,
  }));
  state.trials = suggested;
  analyze();
  renderAll();
}

function suggestTrialsFromSaccades() {
  if (!state.saccades.length) {
    setStatus("warn", "Nessuna saccade", "Importa saccades.csv oppure inserisci i trial manualmente.");
    return;
  }
  const minGap = 0.75;
  const candidates = [];
  for (const saccade of state.saccades) {
    if (!candidates.length || saccade.start - candidates[candidates.length - 1].onset > minGap) {
      candidates.push({
        onset: Math.max(0, saccade.start - 0.18),
        direction: candidates.length % 2 === 0 ? "left" : "right",
        distanceKind: candidates.length % 4 < 2 ? "near" : "far",
        source: "saccade",
      });
    }
  }
  state.trials = candidates;
  analyze();
  renderAll();
}

function analyze() {
  if (!state.gaze.length || !state.trials.length) {
    state.results = [];
    state.summaries = [];
    return;
  }
  state.results = state.trials.map((trial, index) => analyzeTrial(trial, index)).filter(Boolean);
  state.summaries = summarizeResults(state.results);
}

function analyzeTrial(trial, index) {
  const settings = getSettings();
  const sign = trial.direction === "right" ? 1 : -1;
  const distanceCm = distanceCmFor(trial.distanceKind, settings);
  const amplitudeDeg = visualAngle(distanceCm, settings.monitorDistanceCm);
  const durationS = settings.durationMs / 1000;
  const targetVelocityDegS = amplitudeDeg / durationS;
  const motionStart = trial.onset;
  const motionEnd = motionStart + durationS;
  const gainStart = motionStart + settings.windowStartMs / 1000;
  const gainEnd = motionStart + settings.windowEndMs / 1000;
  const maxVelocityForGain = Math.max(180, targetVelocityDegS * 3.5);

  const baseline = median(getSamplesBetween(motionStart - settings.baselineMs / 1000, motionStart, { allowExcluded: true }).map((sample) => sample.azimuthDeg));
  const earlySamples = getSamplesBetween(gainStart, gainEnd)
    .filter((sample) => !sample.excluded)
    .filter((sample) => Number.isFinite(sample.vxDeg) && Math.abs(sample.vxDeg) <= maxVelocityForGain);

  const signedVelocities = earlySamples.map((sample) => sign * sample.vxDeg).filter(Number.isFinite);
  const earlyVelocity = median(signedVelocities);
  const earlyGain = earlyVelocity / targetVelocityDegS;

  const endpointSamples = getSamplesBetween(motionEnd - settings.endpointWindowMs / 1000, motionEnd + settings.endpointWindowMs / 1000)
    .filter((sample) => !sample.excluded)
    .map((sample) => sample.azimuthDeg);
  const endpoint = median(endpointSamples);
  const expectedEndpoint = Number.isFinite(baseline) ? baseline + sign * amplitudeDeg : NaN;
  const actualDisplacement = Number.isFinite(endpoint) && Number.isFinite(baseline) ? sign * (endpoint - baseline) : NaN;
  const positionGain = actualDisplacement / amplitudeDeg;
  const finalErrorDeg = Number.isFinite(endpoint) && Number.isFinite(expectedEndpoint) ? endpoint - expectedEndpoint : NaN;
  const onsetLatencyMs = estimatePursuitLatency({ motionStart, motionEnd, sign, targetVelocityDegS, maxVelocityForGain });
  const catchups = catchupMetrics(trial, motionStart, motionEnd, sign);
  const validRatio = earlySamples.length / Math.max(1, countSamplesBetween(gainStart, gainEnd));
  const quality = qualityFromSamples(earlySamples.length, validRatio, earlyGain);

  return {
    trialIndex: index + 1,
    onset: trial.onset,
    direction: trial.direction,
    distanceKind: trial.distanceKind,
    durationMs: settings.durationMs,
    source: trial.source,
    amplitudeDeg,
    targetVelocityDegS,
    earlyVelocityDegS: earlyVelocity,
    earlyGain,
    positionGain,
    finalErrorDeg,
    onsetLatencyMs,
    validSamples: earlySamples.length,
    totalWindowSamples: countSamplesBetween(gainStart, gainEnd),
    validRatio,
    catchupCount: catchups.sameDirectionCount,
    oppositeSaccadeCount: catchups.oppositeDirectionCount,
    firstCatchupLatencyMs: catchups.firstLatencyMs,
    quality,
  };
}

function estimatePursuitLatency({ motionStart, motionEnd, sign, targetVelocityDegS, maxVelocityForGain }) {
  const samples = getSamplesBetween(motionStart + 0.05, motionEnd).filter((sample) => {
    const signedVelocity = sign * sample.vxDeg;
    return Number.isFinite(signedVelocity) && Math.abs(sample.vxDeg) <= maxVelocityForGain;
  });
  const threshold = Math.max(6, targetVelocityDegS * 0.22);
  const consecutive = 4;

  for (let i = 0; i <= samples.length - consecutive; i += 1) {
    const run = samples.slice(i, i + consecutive);
    if (run.every((sample) => sign * sample.vxDeg >= threshold)) {
      return (run[0].t - motionStart) * 1000;
    }
  }
  return NaN;
}

function catchupMetrics(trial, motionStart, motionEnd, sign) {
  let sameDirectionCount = 0;
  let oppositeDirectionCount = 0;
  let firstLatencyMs = NaN;

  for (const saccade of state.saccades) {
    if (saccade.end < motionStart || saccade.start > motionEnd) continue;
    const before = median(getSamplesBetween(saccade.start - 0.06, saccade.start - 0.015, { allowExcluded: true }).map((sample) => sample.azimuthDeg));
    const after = median(getSamplesBetween(saccade.end + 0.015, saccade.end + 0.06, { allowExcluded: true }).map((sample) => sample.azimuthDeg));
    const displacement = after - before;
    if (!Number.isFinite(displacement) || Math.abs(displacement) < 0.5) continue;

    if (sign * displacement > 0) {
      sameDirectionCount += 1;
      if (!Number.isFinite(firstLatencyMs)) firstLatencyMs = (saccade.start - motionStart) * 1000;
    } else {
      oppositeDirectionCount += 1;
    }
  }

  return { sameDirectionCount, oppositeDirectionCount, firstLatencyMs };
}

function countSamplesBetween(start, end) {
  return state.gaze.filter((sample) => sample.t >= start && sample.t <= end).length;
}

function getSamplesBetween(start, end, options = {}) {
  return state.gaze.filter((sample) => sample.t >= start && sample.t <= end && (options.allowExcluded || !sample.excluded));
}

function distanceCmFor(kind, settings) {
  return kind === "far" ? settings.farDistanceCm : settings.nearDistanceCm;
}

function visualAngle(distanceCm, monitorDistanceCm) {
  return 2 * Math.atan(distanceCm / (2 * monitorDistanceCm)) * 180 / Math.PI;
}

function qualityFromSamples(validSamples, validRatio, earlyGain) {
  if (validSamples < 5 || !Number.isFinite(earlyGain)) return "bad";
  if (validSamples < 10 || validRatio < 0.55) return "warn";
  return "good";
}

function summarizeResults(results) {
  const groups = new Map();
  for (const result of results) {
    const key = `${result.direction}-${result.distanceKind}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        direction: result.direction,
        distanceKind: result.distanceKind,
        results: [],
      });
    }
    groups.get(key).results.push(result);
  }

  return Array.from(groups.values())
    .map((group) => {
      const values = group.results;
      return {
        key: group.key,
        condition: `${directionLabel(group.direction)} ${distanceLabel(group.distanceKind)}`,
        direction: group.direction,
        distanceKind: group.distanceKind,
        n: values.length,
        targetVelocityDegS: median(values.map((value) => value.targetVelocityDegS)),
        earlyGainMean: mean(values.map((value) => value.earlyGain)),
        earlyGainMedian: median(values.map((value) => value.earlyGain)),
        earlyGainSd: standardDeviation(values.map((value) => value.earlyGain)),
        positionGainMedian: median(values.map((value) => value.positionGain)),
        latencyMedianMs: median(values.map((value) => value.onsetLatencyMs)),
        catchupMean: mean(values.map((value) => value.catchupCount)),
        badCount: values.filter((value) => value.quality === "bad").length,
        warnCount: values.filter((value) => value.quality === "warn").length,
      };
    })
    .sort((a, b) => {
      if (a.distanceKind !== b.distanceKind) return a.distanceKind === "near" ? -1 : 1;
      return a.direction === "left" ? -1 : 1;
    });
}

function renderAll() {
  renderSummaryNumbers();
  renderTrace();
  renderTrialTable();
  renderConditionTable();
  updateExportButtons();
}

function renderSummaryNumbers() {
  el.sampleCount.textContent = state.gaze.length.toLocaleString("it-IT");
  el.trialCount.textContent = state.trials.length.toLocaleString("it-IT");

  const leftGain = median(state.results.filter((result) => result.direction === "left").map((result) => result.earlyGain));
  const rightGain = median(state.results.filter((result) => result.direction === "right").map((result) => result.earlyGain));
  const laterality = Number.isFinite(leftGain) && Number.isFinite(rightGain) && leftGain + rightGain !== 0
    ? (rightGain - leftGain) / (rightGain + leftGain)
    : NaN;

  el.leftGain.textContent = formatNumber(leftGain, 2);
  el.rightGain.textContent = formatNumber(rightGain, 2);
  el.lateralityIndex.textContent = formatNumber(laterality, 2);

  if (state.info?.gaze_frequency) {
    el.plotSubtitle.textContent = `Azimuth del gaze in gradi visivi, ${state.info.gaze_frequency} Hz.`;
  } else {
    el.plotSubtitle.textContent = "Azimuth del gaze in gradi visivi.";
  }
}

function renderTrace() {
  const canvas = el.traceCanvas;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#fbfcfd";
  context.fillRect(0, 0, width, height);

  if (!state.gaze.length) {
    drawCenteredText(context, "Carica gaze.csv per visualizzare la traccia", width, height);
    return;
  }

  const padding = { left: 58, right: 18, top: 18, bottom: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const minT = state.gaze[0].t;
  const maxT = state.gaze[state.gaze.length - 1].t;
  const azValues = state.gaze.map((sample) => sample.azimuthDeg).filter(Number.isFinite);
  const minAz = Math.min(...azValues, -30);
  const maxAz = Math.max(...azValues, 30);
  const yMin = Math.floor(minAz / 5) * 5 - 2;
  const yMax = Math.ceil(maxAz / 5) * 5 + 2;
  state.traceBounds = { minT, maxT, yMin, yMax, padding, plotWidth, plotHeight };

  const xFor = (t) => padding.left + ((t - minT) / (maxT - minT || 1)) * plotWidth;
  const yFor = (az) => padding.top + (1 - (az - yMin) / (yMax - yMin || 1)) * plotHeight;

  drawGrid(context, { width, height, padding, plotWidth, plotHeight, minT, maxT, yMin, yMax, xFor, yFor });
  drawTrialWindows(context, { xFor, yFor, padding, plotHeight, yMin, yMax });

  context.lineWidth = 1.4;
  context.strokeStyle = "#24323b";
  context.beginPath();
  let started = false;
  for (const sample of state.gaze) {
    if (!Number.isFinite(sample.azimuthDeg)) continue;
    const x = xFor(sample.t);
    const y = yFor(sample.azimuthDeg);
    if (!started) {
      context.moveTo(x, y);
      started = true;
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke();

  context.strokeStyle = "rgba(216,72,72,0.45)";
  context.lineWidth = 1;
  for (const saccade of state.saccades) {
    const x = xFor(saccade.start);
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, padding.top + plotHeight);
    context.stroke();
  }

  drawPlaybackCursor(context, { width, padding, plotHeight, xFor, yFor, minT, maxT });
}

function drawCenteredText(context, text, width, height) {
  context.save();
  context.fillStyle = "#66737c";
  context.font = "600 15px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(text, width / 2, height / 2);
  context.restore();
}

function drawGrid(context, opts) {
  const { width, height, padding, plotWidth, plotHeight, minT, maxT, yMin, yMax, xFor, yFor } = opts;
  context.save();
  context.strokeStyle = "#e2e8ed";
  context.fillStyle = "#7a8790";
  context.font = "12px system-ui, sans-serif";
  context.lineWidth = 1;

  const xStep = niceStep((maxT - minT) / 8);
  for (let t = Math.ceil(minT / xStep) * xStep; t <= maxT; t += xStep) {
    const x = xFor(t);
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, padding.top + plotHeight);
    context.stroke();
    context.fillText(t.toFixed(1), x - 10, height - 10);
  }

  const yStep = niceStep((yMax - yMin) / 6);
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
    const py = yFor(y);
    context.beginPath();
    context.moveTo(padding.left, py);
    context.lineTo(padding.left + plotWidth, py);
    context.stroke();
    context.fillText(y.toFixed(0), 12, py + 4);
  }
  context.strokeStyle = "#9aa8b2";
  context.strokeRect(padding.left, padding.top, plotWidth, plotHeight);
  context.restore();
}

function drawTrialWindows(context, { xFor, padding, plotHeight }) {
  const settings = getSettings();
  context.save();
  for (const trial of state.trials) {
    const start = trial.onset + settings.windowStartMs / 1000;
    const end = trial.onset + settings.windowEndMs / 1000;
    const x1 = xFor(start);
    const x2 = xFor(end);
    context.fillStyle = trial.direction === "right" ? "rgba(55,126,184,0.12)" : "rgba(228,26,28,0.12)";
    context.fillRect(x1, padding.top, Math.max(1, x2 - x1), plotHeight);
    context.strokeStyle = trial.direction === "right" ? "rgba(55,126,184,0.5)" : "rgba(228,26,28,0.5)";
    context.strokeRect(x1, padding.top, Math.max(1, x2 - x1), plotHeight);
  }
  context.restore();
}

function drawPlaybackCursor(context, { padding, plotHeight, xFor, minT, maxT }) {
  const t = currentRecordingTimeFromVideo();
  if (!Number.isFinite(t) || t < minT || t > maxT) return;
  const x = xFor(t);
  context.save();
  context.strokeStyle = "#f39c12";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x, padding.top);
  context.lineTo(x, padding.top + plotHeight);
  context.stroke();
  context.restore();
}

function renderTrialTable() {
  el.trialBody.innerHTML = "";
  if (!state.trials.length) {
    el.trialBody.innerHTML = '<tr><td colspan="10" class="empty">Aggiungi o importa i trial per calcolare il gain.</td></tr>';
    return;
  }

  const settings = getSettings();
  state.trials.forEach((trial, index) => {
    const result = state.results[index];
    const row = el.trialRowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".row-index").textContent = index + 1;
    const onsetInput = row.querySelector(".trial-onset");
    const directionSelect = row.querySelector(".trial-direction");
    const distanceSelect = row.querySelector(".trial-distance");

    onsetInput.value = formatNumber(trial.onset, 3);
    directionSelect.value = trial.direction;
    distanceSelect.value = trial.distanceKind;

    onsetInput.addEventListener("change", () => {
      trial.onset = Number(onsetInput.value);
      analyze();
      renderAll();
    });
    directionSelect.addEventListener("change", () => {
      trial.direction = directionSelect.value;
      analyze();
      renderAll();
    });
    distanceSelect.addEventListener("change", () => {
      trial.distanceKind = distanceSelect.value;
      analyze();
      renderAll();
    });
    row.querySelector(".remove-trial").addEventListener("click", () => {
      state.trials.splice(index, 1);
      analyze();
      renderAll();
    });

    const amplitudeDeg = result?.amplitudeDeg ?? visualAngle(distanceCmFor(trial.distanceKind, settings), settings.monitorDistanceCm);
    row.querySelector(".trial-amplitude").textContent = formatNumber(amplitudeDeg, 1);
    row.querySelector(".trial-gain").textContent = formatNumber(result?.earlyGain, 2);
    row.querySelector(".trial-position-gain").textContent = formatNumber(result?.positionGain, 2);
    row.querySelector(".trial-latency").textContent = formatNumber(result?.onsetLatencyMs, 0);
    row.querySelector(".trial-quality").innerHTML = result ? qualityBadge(result.quality, result.validSamples, result.totalWindowSamples) : "-";
    el.trialBody.appendChild(row);
  });
}

function qualityBadge(quality, valid, total) {
  const label = quality === "good" ? "OK" : quality === "warn" ? "Controlla" : "Scarsa";
  const detail = `${valid}/${total}`;
  return `<span class="badge ${quality}">${label} ${detail}</span>`;
}

function renderConditionTable() {
  el.conditionBody.innerHTML = "";
  if (!state.summaries.length) {
    el.conditionBody.innerHTML = '<tr><td colspan="8" class="empty">Nessuna analisi ancora disponibile.</td></tr>';
    return;
  }

  for (const summary of state.summaries) {
    const quality = summary.badCount > 0 ? "bad" : summary.warnCount > 0 ? "warn" : "good";
    const qualityText = summary.badCount > 0
      ? `${summary.badCount} scarsi`
      : summary.warnCount > 0
        ? `${summary.warnCount} da controllare`
        : "OK";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(summary.condition)}</td>
      <td>${summary.n}</td>
      <td>${formatNumber(summary.targetVelocityDegS, 1)}</td>
      <td>${formatNumber(summary.earlyGainMedian, 2)} <span class="muted">mean ${formatNumber(summary.earlyGainMean, 2)}</span></td>
      <td>${formatNumber(summary.positionGainMedian, 2)}</td>
      <td>${formatNumber(summary.latencyMedianMs, 0)} ms</td>
      <td>${formatNumber(summary.catchupMean, 1)}</td>
      <td><span class="badge ${quality}">${qualityText}</span></td>
    `;
    el.conditionBody.appendChild(row);
  }
}

function updateExportButtons() {
  const hasResults = state.results.length > 0;
  el.exportCsvBtn.disabled = !hasResults;
  el.exportJsonBtn.disabled = !hasResults;
}

function exportCsv() {
  if (!state.results.length) return;
  const rows = state.results.map((result) => ({
    trial: result.trialIndex,
    onset_s: result.onset,
    direction: result.direction,
    distance: result.distanceKind,
    duration_ms: result.durationMs,
    amplitude_deg: result.amplitudeDeg,
    target_velocity_deg_s: result.targetVelocityDegS,
    early_velocity_deg_s: result.earlyVelocityDegS,
    early_gain: result.earlyGain,
    position_gain: result.positionGain,
    final_error_deg: result.finalErrorDeg,
    onset_latency_ms: result.onsetLatencyMs,
    catchup_count: result.catchupCount,
    opposite_saccade_count: result.oppositeSaccadeCount,
    valid_samples: result.validSamples,
    total_window_samples: result.totalWindowSamples,
    quality: result.quality,
  }));
  downloadText("gain_direzionale_trial.csv", rowsToCsv(rows), "text/csv");
}

function rowsToCsv(rows) {
  const headers = Object.keys(rows[0]);
  const body = rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  return [headers.join(","), ...body].join("\n");
}

function csvCell(value) {
  if (value === undefined || value === null || Number.isNaN(value)) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportJson() {
  if (!state.results.length) return;
  const payload = {
    sourceName: state.sourceName,
    settings: getSettings(),
    sourceInfo: state.info,
    trialResults: state.results,
    conditionSummaries: state.summaries,
  };
  downloadText("gain_direzionale_report.json", JSON.stringify(payload, null, 2), "application/json");
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function handleCanvasClick(event) {
  if (!state.traceBounds) return;
  const rect = el.traceCanvas.getBoundingClientRect();
  const scaleX = el.traceCanvas.width / rect.width;
  const x = (event.clientX - rect.left) * scaleX;
  const { minT, maxT, padding, plotWidth } = state.traceBounds;
  if (x < padding.left || x > padding.left + plotWidth) return;
  const t = minT + ((x - padding.left) / plotWidth) * (maxT - minT);
  el.newOnset.value = t.toFixed(3);
  seekVideoToRecordingTime(t);
}

function nearestGazeSample(time) {
  const gaze = state.gaze;
  if (!gaze.length) return null;
  let low = 0;
  let high = gaze.length - 1;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (gaze[middle].t < time) low = middle + 1;
    else high = middle;
  }

  const current = gaze[low];
  const previous = gaze[Math.max(0, low - 1)];
  if (!previous) return current;
  return Math.abs(previous.t - time) < Math.abs(current.t - time) ? previous : current;
}

function median(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return NaN;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2;
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return NaN;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function standardDeviation(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return NaN;
  const avg = mean(finite);
  const variance = finite.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (finite.length - 1);
  return Math.sqrt(variance);
}

function directionLabel(value) {
  return value === "right" ? "Destra" : "Sinistra";
}

function distanceLabel(value) {
  return value === "far" ? "Ampia" : "Breve";
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString("it-IT", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "-";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function niceStep(rawStep) {
  const exponent = Math.floor(Math.log10(Math.max(rawStep, 0.0001)));
  const fraction = rawStep / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

function bindSettings() {
  [
    el.monitorDistance,
    el.nearDistance,
    el.farDistance,
    el.durationMs,
    el.windowStartMs,
    el.windowEndMs,
  ].forEach((input) => {
    input.addEventListener("change", () => {
      analyze();
      renderAll();
    });
  });
}

function initialize() {
  bindSettings();
  el.loadSampleBtn?.addEventListener("click", () => loadSampleData("sample1"));
  el.loadSample2Btn?.addEventListener("click", () => loadSampleData("sample2"));
  el.folderInput.addEventListener("change", handleFolderImport);
  el.trialInput.addEventListener("change", handleTrialImport);
  el.videoInput.addEventListener("change", handleVideoImport);
  el.syncOffsetMs.addEventListener("change", () => {
    updateVideoTimeLabels();
    renderTrace();
  });
  el.markCenterBtn.addEventListener("click", startMarkCenterMode);
  el.clearCenterBtn.addEventListener("click", clearTargetCenter);
  el.videoOverlayCanvas.addEventListener("click", handleVideoOverlayClick);
  el.stimulusVideo.addEventListener("play", startPlaybackCursor);
  el.stimulusVideo.addEventListener("pause", stopPlaybackCursor);
  el.stimulusVideo.addEventListener("ended", stopPlaybackCursor);
  el.stimulusVideo.addEventListener("timeupdate", () => {
    updateVideoTimeLabels();
    if (el.stimulusVideo.paused) renderTrace();
  });
  el.stimulusVideo.addEventListener("seeked", stopPlaybackCursor);
  el.stimulusVideo.addEventListener("loadedmetadata", stopPlaybackCursor);
  el.frameBackBtn.addEventListener("click", () => stepVideoFrame(-1));
  el.frameForwardBtn.addEventListener("click", () => stepVideoFrame(1));
  el.addVideoTrialBtn.addEventListener("click", addVideoTrial);
  el.addTrialBtn.addEventListener("click", addManualTrial);
  el.suggestEventsBtn.addEventListener("click", suggestTrialsFromEvents);
  el.suggestTrialsBtn.addEventListener("click", suggestTrialsFromSaccades);
  el.clearTrialsBtn.addEventListener("click", () => {
    state.trials = [];
    analyze();
    renderAll();
  });
  el.analyzeBtn.addEventListener("click", () => {
    analyze();
    renderAll();
  });
  el.exportCsvBtn.addEventListener("click", exportCsv);
  el.exportJsonBtn.addEventListener("click", exportJson);
  el.traceCanvas.addEventListener("click", handleCanvasClick);
  window.addEventListener("resize", () => {
    renderTrace();
    renderVideoOverlay();
  });
  updateExportButtons();
  renderTrace();
  renderVideoOverlay();
}

initialize();

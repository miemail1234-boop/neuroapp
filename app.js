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

function median(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return NaN;
  const middle = Math.floor(clean.length / 2);
  if (clean.length % 2) return clean[middle];
  return (clean[middle - 1] + clean[middle]) / 2;
}

function mean(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return NaN;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function standardDeviation(values) {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) return NaN;
  const avg = mean(clean);
  const variance = clean.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (clean.length - 1);
  return Math.sqrt(variance);
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function directionSign(direction) {
  return direction === "right" ? 1 : -1;
}

function directionLabel(direction) {
  return direction === "right" ? "Destra" : "Sinistra";
}

function distanceLabel(kind) {
  return kind === "far" ? "Ampia" : "Breve";
}

function distanceCmFor(kind, settings = getSettings()) {
  return kind === "far" ? settings.farDistanceCm : settings.nearDistanceCm;
}

function visualAngle(distanceCm, monitorDistanceCm) {
  return (Math.atan(distanceCm / monitorDistanceCm) * 180) / Math.PI;
}

async function loadSampleData(sampleKey = "sample1") {
  const dataset = SAMPLE_DATASETS[sampleKey] || SAMPLE_DATASETS.sample1;
  setStatus("warn", `Caricamento ${dataset.label}`, "Lettura dei file esportati da Pupil Labs...");
  try {
    const [gazeText, saccadesText, blinksText, eventsText, worldText, infoText] = await Promise.all([
      fetchText(`${dataset.base}gaze.csv`),
      fetchText(`${dataset.base}saccades.csv`),
      fetchText(`${dataset.base}blinks.csv`),
      fetchText(`${dataset.base}events.csv`),
      fetchText(`${dataset.base}world_timestamps.csv`),
      fetchText(`${dataset.base}info.json`),
    ]);

    loadDataset({
      sourceName: dataset.label,
      gazeRows: parseCSV(gazeText),
      saccadeRows: parseCSV(saccadesText),
      blinkRows: parseCSV(blinksText),
      eventRows: parseCSV(eventsText),
      worldTimestampRows: parseCSV(worldText),
      info: JSON.parse(infoText),
      videoSrc: `${dataset.base}${dataset.video}`,
    });
  } catch (error) {
    setStatus(
      "error",
      `${dataset.label} non raggiungibile`,
      "Avvia il server dalla cartella ET e apri /Gain_Direzionale_Lab/ oppure importa manualmente la cartella Pupil."
    );
    console.error(error);
  }
}

async function fetchText(path) {
  const response = await fetch(encodeURI(path));
  if (!response.ok) throw new Error(`Impossibile leggere ${path}`);
  return response.text();
}

async function handleFolderImport(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const byName = new Map(files.map((file) => [file.name.toLowerCase(), file]));
  const gazeFile = byName.get("gaze.csv");
  if (!gazeFile) {
    setStatus("error", "Manca gaze.csv", "La cartella selezionata non contiene il file gaze.csv.");
    return;
  }

  const videoFile = files.find((file) => /\.(mp4|mov|m4v|webm)$/i.test(file.name));
  const [gazeText, saccadesText, blinksText, eventsText, worldText, infoText] = await Promise.all([
    gazeFile.text(),
    byName.get("saccades.csv")?.text() ?? "",
    byName.get("blinks.csv")?.text() ?? "",
    byName.get("events.csv")?.text() ?? "",
    byName.get("world_timestamps.csv")?.text() ?? "",
    byName.get("info.json")?.text() ?? "",
  ]);

  loadDataset({
    sourceName: files[0].webkitRelativePath?.split("/")[0] || "Cartella importata",
    gazeRows: parseCSV(gazeText),
    saccadeRows: saccadesText ? parseCSV(saccadesText) : [],
    blinkRows: blinksText ? parseCSV(blinksText) : [],
    eventRows: eventsText ? parseCSV(eventsText) : [],
    worldTimestampRows: worldText ? parseCSV(worldText) : [],
    info: infoText ? JSON.parse(infoText) : null,
    videoSrc: videoFile ? URL.createObjectURL(videoFile) : "",
  });
}

function loadDataset({ sourceName, gazeRows, saccadeRows, blinkRows, eventRows, worldTimestampRows, info, videoSrc }) {
  state.sourceName = sourceName;
  state.info = info;
  state.t0Ns = info?.start_time ? Number(info.start_time) : getFirstTimestampNs(gazeRows);
  state.gaze = normalizeGaze(gazeRows);
  state.events = normalizeEvents(eventRows || []);
  state.worldTimestamps = normalizeWorldTimestamps(worldTimestampRows || []);
  state.saccades = normalizeIntervals(saccadeRows, "saccade");
  state.blinks = normalizeIntervals(blinkRows, "blink");
  state.results = [];
  state.summaries = [];

  loadVideoSource(videoSrc || "");

  buildVelocity();
  flagExcludedSamples();

  const eventTrials = buildTrialsFromEvents();
  if (eventTrials.length && !state.trials.length) {
    state.trials = eventTrials;
    analyze();
  }
  renderAll();

  const eventText = eventTrials.length
    ? `${eventTrials.length} trial ricavati da events.csv.`
    : "Trial non presenti in events.csv: annota/importa gli onset del movimento.";
  const videoText = state.worldTimestamps.length
    ? `${state.worldTimestamps.length} frame video sincronizzati.`
    : "Manca world_timestamps.csv per sincronizzare il video.";
  const qualityText = `${state.gaze.length} gaze samples, ${state.saccades.length} saccadi, ${state.blinks.length} blink, ${state.events.length} eventi. ${videoText} ${eventText}`;
  setStatus("ready", `${sourceName} caricato`, qualityText);
  updateVideoTimeLabels();
}

function getFirstTimestampNs(rows) {
  const first = rows.find((row) => Number.isFinite(toNumber(row["timestamp [ns]"])));
  return first ? toNumber(first["timestamp [ns]"]) : Date.now() * 1e6;
}

function normalizeGaze(rows) {
  return rows
    .map((row, index) => {
      const timestampNs = toNumber(row["timestamp [ns]"]);
      const azimuthDeg = toNumber(row["azimuth [deg]"]);
      const elevationDeg = toNumber(row["elevation [deg]"]);
      const xPx = toNumber(row["gaze x [px]"]);
      const yPx = toNumber(row["gaze y [px]"]);
      return {
        index,
        timestampNs,
        t: (timestampNs - state.t0Ns) / 1e9,
        azimuthDeg,
        elevationDeg,
        xPx,
        yPx,
        worn: row.worn !== "0",
        blinkId: row["blink id"] || "",
        fixationId: row["fixation id"] || "",
        valid: Number.isFinite(timestampNs) && Number.isFinite(azimuthDeg) && row.worn !== "0",
        vxDeg: NaN,
        excluded: false,
        inSaccade: false,
        inBlink: false,
      };
    })
    .filter((sample) => Number.isFinite(sample.t))
    .sort((a, b) => a.t - b.t);
}

function normalizeIntervals(rows, kind) {
  return rows
    .map((row) => {
      const startNs = toNumber(row["start timestamp [ns]"]);
      const endNs = toNumber(row["end timestamp [ns]"]);
      const id = row[`${kind} id`] || row.id || "";
      return {
        id,
        startNs,
        endNs,
        start: (startNs - state.t0Ns) / 1e9,
        end: (endNs - state.t0Ns) / 1e9,
        durationMs: toNumber(row["duration [ms]"]),
        amplitudeDeg: toNumber(row["amplitude [deg]"]),
        peakVelocity: toNumber(row["peak velocity [px/s]"]),
      };
    })
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end))
    .sort((a, b) => a.start - b.start);
}

function normalizeEvents(rows) {
  return rows
    .map((row) => {
      const timestampNs = toNumber(row["timestamp [ns]"]);
      return {
        recordingId: row["recording id"] || "",
        timestampNs,
        t: (timestampNs - state.t0Ns) / 1e9,
        name: row.name || "",
        type: row.type || "",
      };
    })
    .filter((event) => Number.isFinite(event.t))
    .sort((a, b) => a.t - b.t);
}

function normalizeWorldTimestamps(rows) {
  return rows
    .map((row, index) => {
      const timestampNs = toNumber(row["timestamp [ns]"]);
      return {
        index,
        timestampNs,
        t: (timestampNs - state.t0Ns) / 1e9,
      };
    })
    .filter((frame) => Number.isFinite(frame.t))
    .sort((a, b) => a.t - b.t);
}

function buildVelocity() {
  const gaze = state.gaze;
  const radius = 2;

  for (let i = 0; i < gaze.length; i += 1) {
    const left = gaze[Math.max(0, i - radius)];
    const right = gaze[Math.min(gaze.length - 1, i + radius)];
    const dt = right.t - left.t;
    if (dt <= 0 || !left.valid || !right.valid) {
      gaze[i].vxDeg = NaN;
    } else {
      gaze[i].vxDeg = (right.azimuthDeg - left.azimuthDeg) / dt;
    }
  }
}

function flagExcludedSamples() {
  const settings = getSettings();
  const paddedSaccades = state.saccades.map((interval) => ({
    start: interval.start - settings.saccadePaddingMs / 1000,
    end: interval.end + settings.saccadePaddingMs / 1000,
  }));
  const blinks = state.blinks.map((interval) => ({
    start: interval.start,
    end: interval.end,
  }));

  for (const sample of state.gaze) {
    const inSaccade = isInsideAny(sample.t, paddedSaccades);
    const inBlink = Boolean(sample.blinkId) || isInsideAny(sample.t, blinks);
    sample.inSaccade = inSaccade;
    sample.inBlink = inBlink;
    sample.excluded = !sample.valid || inSaccade || inBlink;
  }
}

function isInsideAny(t, intervals) {
  return intervals.some((interval) => t >= interval.start && t <= interval.end);
}

function getSamplesBetween(start, end, options = {}) {
  const allowExcluded = Boolean(options.allowExcluded);
  return state.gaze.filter((sample) => {
    if (sample.t < start || sample.t > end) return false;
    if (!allowExcluded && sample.excluded) return false;
    return sample.valid;
  });
}

function handleTrialImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  file.text().then((text) => {
    const rows = parseCSV(text);
    const imported = rows.map((row, index) => trialFromRow(row, index)).filter(Boolean);
    if (!imported.length) {
      setStatus("error", "CSV trial non valido", "Servono colonne come onset_s, direction, distance_cm/distance.");
      return;
    }
    state.trials = imported;
    analyze();
    renderAll();
    setStatus("ready", "Trial importati", `${imported.length} trial letti da ${file.name}.`);
  });
}

function trialFromRow(row, index) {
  const onsetCandidates = [
    row.onset_s,
    row.motion_onset_s,
    row.start_s,
    row["onset [s]"],
    row["motion onset [s]"],
  ];
  const timestampNs = toNumber(row.timestamp_ns || row["timestamp [ns]"]);
  let onset = onsetCandidates.map(toNumber).find(Number.isFinite);
  if (!Number.isFinite(onset) && Number.isFinite(timestampNs)) onset = (timestampNs - state.t0Ns) / 1e9;
  if (!Number.isFinite(onset)) return null;

  const rawDirection = String(row.direction || row.direzione || row.dir || "").toLowerCase();
  const direction = rawDirection.startsWith("r") || rawDirection.startsWith("d") ? "right" : "left";

  const rawDistance = String(row.distance || row.distanza || row.condition || row.condizione || "").toLowerCase();
  const distanceCm = toNumber(row.distance_cm || row["distance [cm]"] || row.distanza_cm);
  const settings = getSettings();
  let distanceKind = rawDistance.includes("far") || rawDistance.includes("amp") || rawDistance.includes("long") ? "far" : "near";
  if (Number.isFinite(distanceCm)) {
    const nearDiff = Math.abs(distanceCm - settings.nearDistanceCm);
    const farDiff = Math.abs(distanceCm - settings.farDistanceCm);
    distanceKind = farDiff < nearDiff ? "far" : "near";
  }

  return {
    id: row.trial_id || row.id || `trial-${index + 1}`,
    onset,
    direction,
    distanceKind,
    durationMs: toNumber(row.duration_ms || row["duration [ms]"]) || settings.durationMs,
    source: "import",
    digit: row.digit || row.cifra || "",
    correct: row.correct || row.accuracy || "",
  };
}

function addManualTrial() {
  const onset = Number(el.newOnset.value);
  if (!Number.isFinite(onset)) {
    setStatus("warn", "Onset mancante", "Inserisci il tempo di onset del movimento in secondi.");
    return;
  }

  state.trials.push({
    id: `manual-${Date.now()}`,
    onset,
    direction: el.newDirection.value,
    distanceKind: el.newDistanceKind.value,
    durationMs: getSettings().durationMs,
    source: "manual",
  });

  el.newOnset.value = "";
  analyze();
  renderAll();
}

function addVideoTrial() {
  const onset = videoTimeToRecordingTime();
  if (!Number.isFinite(onset)) {
    setStatus(
      "warn",
      "Video non sincronizzato",
      "Carica il video e world_timestamps.csv, poi porta il video sul frame di onset del movimento."
    );
    return;
  }

  state.trials.push({
    id: `video-${Date.now()}`,
    onset,
    direction: el.newDirection.value,
    distanceKind: el.newDistanceKind.value,
    durationMs: getSettings().durationMs,
    source: "video",
  });

  analyze();
  renderAll();
  setStatus("ready", "Onset aggiunto dal video", `Trial inserito a ${onset.toFixed(3)} s sul tempo gaze.`);
}

function videoTimeToRecordingTime() {
  const video = el.stimulusVideo;
  if (!Number.isFinite(video.currentTime)) return NaN;
  if (!state.worldTimestamps.length) return NaN;

  const first = state.worldTimestamps[0];
  return first.t + video.currentTime + numberFromInput(el.syncOffsetMs, 0) / 1000;
}

function recordingTimeToVideoTime(recordingTime) {
  const video = el.stimulusVideo;
  if (!Number.isFinite(recordingTime)) return NaN;
  if (!state.worldTimestamps.length) return NaN;

  const first = state.worldTimestamps[0];
  return recordingTime - first.t - numberFromInput(el.syncOffsetMs, 0) / 1000;
}

function seekVideoToRecordingTime(recordingTime) {
  const videoTime = recordingTimeToVideoTime(recordingTime);
  if (!Number.isFinite(videoTime) || !el.stimulusVideo.src) return false;

  const maxTime = Number.isFinite(el.stimulusVideo.duration) ? el.stimulusVideo.duration : videoTime;
  const nextTime = clamp(videoTime, 0, maxTime);
  el.traceCanvas.dataset.lastSeekVideoTime = nextTime.toFixed(3);

  try {
    if (typeof el.stimulusVideo.fastSeek === "function") {
      el.stimulusVideo.fastSeek(nextTime);
    }
    el.stimulusVideo.currentTime = nextTime;
  } catch (error) {
    el.stimulusVideo.currentTime = nextTime;
  }

  requestAnimationFrame(() => {
    updateVideoTimeLabels();
    renderTrace();
  });
  return true;
}

function stepVideoFrame(direction) {
  const video = el.stimulusVideo;
  const frameStep = estimateFrameDuration();
  if (!Number.isFinite(frameStep)) return;
  video.pause();
  video.currentTime = Math.max(0, video.currentTime + direction * frameStep);
  updateVideoTimeLabels();
  renderTrace();
}

function estimateFrameDuration() {
  if (state.worldTimestamps.length > 2) {
    const deltas = [];
    for (let i = 1; i < Math.min(state.worldTimestamps.length, 80); i += 1) {
      const delta = state.worldTimestamps[i].t - state.worldTimestamps[i - 1].t;
      if (delta > 0) deltas.push(delta);
    }
    return median(deltas);
  }
  if (Number.isFinite(el.stimulusVideo.duration) && el.stimulusVideo.duration > 0) return 1 / 20;
  return NaN;
}

function updateVideoTimeLabels() {
  const videoTime = el.stimulusVideo.currentTime;
  const gazeTime = videoTimeToRecordingTime();
  el.videoTimeLabel.textContent = Number.isFinite(videoTime) ? `${videoTime.toFixed(3)} s` : "-";
  el.gazeTimeLabel.textContent = Number.isFinite(gazeTime) ? `${gazeTime.toFixed(3)} s` : "-";
  renderVideoOverlay();
}

function renderVideoOverlay() {
  const canvas = el.videoOverlayCanvas;
  const video = el.stimulusVideo;
  if (!canvas || !video) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);

  const contentRect = getVideoContentRect(rect.width, rect.height);
  drawVideoContentBorder(context, contentRect);

  if (state.targetCenter) {
    const target = sceneToOverlayPoint(state.targetCenter.x, state.targetCenter.y, contentRect);
    drawMarker(context, target.x, target.y, "#d84848", "P");
    el.targetCenterLabel.textContent = `${Math.round(state.targetCenter.x)}, ${Math.round(state.targetCenter.y)} px`;
  } else {
    el.targetCenterLabel.textContent = "-";
  }

  const gazeTime = videoTimeToRecordingTime();
  const gaze = nearestGazeSample(gazeTime);
  if (gaze && Number.isFinite(gaze.xPx) && Number.isFinite(gaze.yPx)) {
    const point = sceneToOverlayPoint(gaze.xPx, gaze.yPx, contentRect);
    drawMarker(context, point.x, point.y, "#0b8f83", "G");
    el.gazePointLabel.textContent = `${Math.round(gaze.xPx)}, ${Math.round(gaze.yPx)} px`;

    if (state.targetCenter) {
      const target = sceneToOverlayPoint(state.targetCenter.x, state.targetCenter.y, contentRect);
      context.strokeStyle = "rgba(11,143,131,0.55)";
      context.lineWidth = 1.5;
      context.setLineDash([5, 5]);
      context.beginPath();
      context.moveTo(target.x, target.y);
      context.lineTo(point.x, point.y);
      context.stroke();
      context.setLineDash([]);
    }
  } else {
    el.gazePointLabel.textContent = "-";
  }
}

function getVideoContentRect(stageWidth, stageHeight) {
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

function calibrationPairCount() {
  return CALIBRATION_ORDER.filter((key) => state.calibrationTargets[key] && state.calibrationFixations[key]).length;
}

function filteredCalibrationFixations() {
  const start = numberFromInput(el.calibrationStartS, 0);
  const end = numberFromInput(el.calibrationEndS, 35);
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return state.fixations.filter((fixation) => fixation.t >= lo && fixation.t <= hi);
}

function selectedCalibrationKeyForFixation(fixationId) {
  return CALIBRATION_ORDER.find((key) => state.calibrationFixations[key]?.id === fixationId) || null;
}

function nearestCalibrationFixation(point) {
  let best = null;
  let bestDist = Infinity;
  for (const fixation of filteredCalibrationFixations()) {
    const dx = fixation.xPx - point.x;
    const dy = fixation.yPx - point.y;
    const distance = Math.hypot(dx, dy);
    const threshold = Math.max(28, 12 + fixation.durationMs / 120);
    if (distance <= threshold && distance < bestDist) {
      best = fixation;
      bestDist = distance;
    }
  }
  return best;
}

function setCalibrationMode(mode) {
  state.calibrationMode = mode;
  state.markingCenter = false;
  el.videoStage.classList.toggle("marking", mode === "target" || mode === "fixation");
  updateCalibrationUi();
  renderVideoOverlay();
}

function nextCalibrationPoint(current) {
  const index = CALIBRATION_ORDER.indexOf(current);
  return CALIBRATION_ORDER[(index + 1) % CALIBRATION_ORDER.length];
}

function updateCalibrationUi() {
  if (!el.calibrationPointSelect.options.length) initializeCalibrationSelect();
  el.calibrationPointSelect.value = state.activeCalibrationPoint;
  const count = calibrationPairCount();
  const modelText = state.calibrationModel ? ` | modello ${state.calibrationModel.type}` : "";
  el.calibrationStatus.textContent = `${count}/9${modelText}`;
  el.calibrationTargetModeBtn.classList.toggle("active", state.calibrationMode === "target");
  el.calibrationFixationModeBtn.classList.toggle("active", state.calibrationMode === "fixation");
  el.fitCalibrationBtn.disabled = count < 4;

  const activeLabel = CALIBRATION_POINT_LABELS[state.activeCalibrationPoint] || state.activeCalibrationPoint;
  el.calibrationHint.textContent = state.calibrationMode === "target"
    ? `Punto attivo: ${activeLabel}. Clicca nel video la posizione reale del target di taratura.`
    : `Punto attivo: ${activeLabel}. Clicca il cerchio arancione della fissazione corrispondente.`;
}

function initializeCalibrationSelect() {
  el.calibrationPointSelect.innerHTML = "";
  CALIBRATION_ORDER.forEach((key, index) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = `${index + 1}. ${CALIBRATION_POINT_LABELS[key]}`;
    el.calibrationPointSelect.appendChild(option);
  });
}

function clearCalibration(options = {}) {
  state.calibrationTargets = {};
  state.calibrationFixations = {};
  state.calibrationModel = null;
  state.activeCalibrationPoint = CALIBRATION_ORDER[0];
  state.calibrationMode = "target";
  state.markingCenter = false;
  if (el.videoStage) el.videoStage.classList.remove("marking");
  if (!options.silent) setStatus("ready", "Taratura cancellata", "La sovrapposizione dello sguardo usa di nuovo le coordinate grezze.");
  updateCalibrationUi();
  renderVideoOverlay();
}

function fitCalibrationFromPairs() {
  const pairs = CALIBRATION_ORDER
    .map((key) => ({
      key,
      observed: state.calibrationFixations[key],
      actual: state.calibrationTargets[key],
    }))
    .filter((pair) => pair.observed && pair.actual);

  if (pairs.length < 4) {
    setStatus("warn", "Taratura incompleta", "Servono almeno 4 coppie target/fissazione, meglio 6-9.");
    return;
  }

  const src = pairs.map((pair) => ({ x: pair.observed.xPx, y: pair.observed.yPx }));
  const dst = pairs.map((pair) => ({ x: pair.actual.x, y: pair.actual.y }));
  const model = fitCalibrationModel(src, dst);
  const corrected = applyCalibrationModel(model, src);
  const errors = corrected.map((point, index) => Math.hypot(point.x - dst[index].x, point.y - dst[index].y));
  model.rmse = Math.sqrt(mean(errors.map((value) => value * value)));
  model.pairs = pairs.map((pair, index) => ({
    key: pair.key,
    label: CALIBRATION_POINT_LABELS[pair.key],
    fixationId: pair.observed.id,
    durationMs: pair.observed.durationMs,
    observed: src[index],
    actual: dst[index],
    errorPx: errors[index],
  }));

  state.calibrationModel = model;
  updateCalibrationUi();
  renderVideoOverlay();
  setStatus(
    "ready",
    "Taratura applicata",
    `${pairs.length} coppie, modello ${model.type}, errore medio ${formatNumber(model.rmse, 1)} px.`
  );
}

function fitCalibrationModel(src, dst) {
  if (src.length >= 6) {
    try {
      return fitThinPlateSpline(src, dst);
    } catch (error) {
      console.warn("TPS non riuscita, uso affine.", error);
    }
  }
  return fitAffineCalibration(src, dst);
}

function fitAffineCalibration(src, dst) {
  const normal = Array.from({ length: 3 }, () => Array(3).fill(0));
  const rhsX = Array(3).fill(0);
  const rhsY = Array(3).fill(0);

  src.forEach((point, index) => {
    const row = [point.x, point.y, 1];
    for (let r = 0; r < 3; r += 1) {
      rhsX[r] += row[r] * dst[index].x;
      rhsY[r] += row[r] * dst[index].y;
      for (let c = 0; c < 3; c += 1) normal[r][c] += row[r] * row[c];
    }
  });

  return {
    type: "affine",
    coeffX: solveLinearSystem(normal.map((row) => row.slice()), rhsX.slice()),
    coeffY: solveLinearSystem(normal.map((row) => row.slice()), rhsY.slice()),
  };
}

function fitThinPlateSpline(src, dst) {
  const n = src.length;
  const size = n + 3;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  const rhsX = Array(size).fill(0);
  const rhsY = Array(size).fill(0);
  const lambda = 1e-3;

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const dx = src[i].x - src[j].x;
      const dy = src[i].y - src[j].y;
      matrix[i][j] = tpsKernel(dx * dx + dy * dy);
    }
    matrix[i][i] += lambda;
    matrix[i][n] = 1;
    matrix[i][n + 1] = src[i].x;
    matrix[i][n + 2] = src[i].y;
    matrix[n][i] = 1;
    matrix[n + 1][i] = src[i].x;
    matrix[n + 2][i] = src[i].y;
    rhsX[i] = dst[i].x;
    rhsY[i] = dst[i].y;
  }

  return {
    type: "tps",
    src: src.map((point) => ({ ...point })),
    paramsX: solveLinearSystem(matrix.map((row) => row.slice()), rhsX.slice()),
    paramsY: solveLinearSystem(matrix.map((row) => row.slice()), rhsY.slice()),
  };
}

function tpsKernel(r2) {
  return r2 > 1e-12 ? r2 * Math.log(r2) : 0;
}

function solveLinearSystem(matrix, rhs) {
  const n = rhs.length;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    }
    if (Math.abs(matrix[pivot][col]) < 1e-10) throw new Error("Sistema di taratura singolare");
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];

    const pivotValue = matrix[col][col];
    for (let c = col; c < n; c += 1) matrix[col][c] /= pivotValue;
    rhs[col] /= pivotValue;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = matrix[row][col];
      if (factor === 0) continue;
      for (let c = col; c < n; c += 1) matrix[row][c] -= factor * matrix[col][c];
      rhs[row] -= factor * rhs[col];
    }
  }
  return rhs;
}

function applyCalibrationModel(model, points) {
  if (!model) return points;
  if (model.type === "tps") {
    const n = model.src.length;
    return points.map((point) => {
      let x = model.paramsX[n] + model.paramsX[n + 1] * point.x + model.paramsX[n + 2] * point.y;
      let y = model.paramsY[n] + model.paramsY[n + 1] * point.x + model.paramsY[n + 2] * point.y;
      for (let i = 0; i < n; i += 1) {
        const dx = point.x - model.src[i].x;
        const dy = point.y - model.src[i].y;
        const basis = tpsKernel(dx * dx + dy * dy);
        x += model.paramsX[i] * basis;
        y += model.paramsY[i] * basis;
      }
      return { x, y };
    });
  }

  return points.map((point) => ({
    x: model.coeffX[0] * point.x + model.coeffX[1] * point.y + model.coeffX[2],
    y: model.coeffY[0] * point.x + model.coeffY[1] * point.y + model.coeffY[2],
  }));
}

function handleVideoOverlayClick(event) {
  const rect = el.videoOverlayCanvas.getBoundingClientRect();
  const contentRect = getVideoContentRect(rect.width, rect.height);
  const point = overlayToScenePoint(event.clientX - rect.left, event.clientY - rect.top, contentRect);
  if (!point) return;

  if (!state.markingCenter && state.calibrationMode === "target") {
    state.calibrationTargets[state.activeCalibrationPoint] = point;
    state.activeCalibrationPoint = nextCalibrationPoint(state.activeCalibrationPoint);
    updateCalibrationUi();
    renderVideoOverlay();
    return;
  }

  if (!state.markingCenter && state.calibrationMode === "fixation") {
    const fixation = nearestCalibrationFixation(point);
    if (!fixation) {
      setStatus("warn", "Nessuna fissazione vicina", "Clicca su uno dei cerchi arancioni della finestra di taratura.");
      return;
    }
    for (const key of CALIBRATION_ORDER) {
      if (state.calibrationFixations[key]?.id === fixation.id) delete state.calibrationFixations[key];
    }
    state.calibrationFixations[state.activeCalibrationPoint] = fixation;
    state.activeCalibrationPoint = nextCalibrationPoint(state.activeCalibrationPoint);
    updateCalibrationUi();
    renderVideoOverlay();
    return;
  }

  if (!state.markingCenter) return;
  state.targetCenter = point;
  state.markingCenter = false;
  el.videoStage.classList.remove("marking");
  renderVideoOverlay();
  setStatus("ready", "Puntino centrale segnato", `Riferimento target a ${Math.round(point.x)}, ${Math.round(point.y)} px nel video.`);
}

function startPlaybackCursor() {
  if (playbackAnimationId) return;

  const tick = () => {
    updateVideoTimeLabels();
    renderTrace();

    if (!el.stimulusVideo.paused && !el.stimulusVideo.ended) {
      playbackAnimationId = requestAnimationFrame(tick);
    } else {
      playbackAnimationId = null;
    }
  };

  playbackAnimationId = requestAnimationFrame(tick);
}

function stopPlaybackCursor() {
  if (playbackAnimationId) {
    cancelAnimationFrame(playbackAnimationId);
    playbackAnimationId = null;
  }
  updateVideoTimeLabels();
  renderTrace();
}

function handleVideoImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  loadVideoSource(URL.createObjectURL(file), { objectUrlOwned: true });
}

async function loadVideoSource(videoSrc, options = {}) {
  stopPlaybackCursor();

  if (state.videoObjectUrl) {
    URL.revokeObjectURL(state.videoObjectUrl);
    state.videoObjectUrl = "";
  }

  state.pendingVideoSrc = videoSrc;

  if (!videoSrc) {
    el.stimulusVideo.removeAttribute("src");
    el.stimulusVideo.load();
    updateVideoTimeLabels();
    renderTrace();
    return;
  }

  if (options.objectUrlOwned || videoSrc.startsWith("blob:")) {
    state.videoObjectUrl = videoSrc;
    el.stimulusVideo.src = videoSrc;
    el.stimulusVideo.load();
    updateVideoTimeLabels();
    renderTrace();
    return;
  }

  const encodedSrc = encodeURI(videoSrc);
  el.stimulusVideo.src = encodedSrc;
  el.stimulusVideo.load();
  updateVideoTimeLabels();
  renderTrace();

  try {
    const response = await fetch(encodedSrc);
    if (!response.ok) throw new Error(`Video non leggibile: ${response.status}`);
    const blob = await response.blob();
    if (state.pendingVideoSrc !== videoSrc) return;
    const objectUrl = URL.createObjectURL(blob);
    state.videoObjectUrl = objectUrl;
    el.stimulusVideo.src = objectUrl;
    el.stimulusVideo.load();
    updateVideoTimeLabels();
    renderTrace();
  } catch (error) {
    console.warn("Uso il video via URL, il seek potrebbe essere limitato.", error);
  }
}

function suggestTrialsFromSaccades() {
  if (!state.saccades.length || !state.gaze.length) {
    setStatus("warn", "Nessuna saccade disponibile", "Importa anche saccades.csv oppure aggiungi i trial manualmente.");
    return;
  }

  const settings = getSettings();
  const nearDeg = visualAngle(settings.nearDistanceCm, settings.monitorDistanceCm);
  const farDeg = visualAngle(settings.farDistanceCm, settings.monitorDistanceCm);
  const candidates = [];

  for (const saccade of state.saccades) {
    const before = median(getSamplesBetween(saccade.start - 0.12, saccade.start - 0.025, { allowExcluded: true }).map((sample) => sample.azimuthDeg));
    const after = median(getSamplesBetween(saccade.end + 0.025, saccade.end + 0.12, { allowExcluded: true }).map((sample) => sample.azimuthDeg));
    const displacement = after - before;
    const absDisplacement = Math.abs(displacement);
    if (!Number.isFinite(displacement) || absDisplacement < 6) continue;

    const direction = displacement > 0 ? "right" : "left";
    const distanceKind = Math.abs(absDisplacement - farDeg) < Math.abs(absDisplacement - nearDeg) ? "far" : "near";
    const onset = Math.max(0, saccade.start - 0.2);

    if (candidates.some((trial) => Math.abs(trial.onset - onset) < 0.45)) continue;

    candidates.push({
      id: `auto-${saccade.id || candidates.length + 1}`,
      onset,
      direction,
      distanceKind,
      durationMs: settings.durationMs,
      source: "auto",
    });
  }

  if (!candidates.length) {
    setStatus("warn", "Nessun candidato robusto", "Non ho trovato spostamenti orizzontali ampi da cui proporre trial.");
    return;
  }

  state.trials = candidates;
  analyze();
  renderAll();
  setStatus(
    "warn",
    "Trial candidati generati",
    `${candidates.length} onset proposti dalle saccadi grandi: controllali prima di usare i risultati.`
  );
}

function buildTrialsFromEvents() {
  const settings = getSettings();
  const trials = [];

  for (const event of state.events) {
    const name = event.name.toLowerCase();
    if (!name || name.includes("recording.")) continue;

    const hasLeft = /\b(left|sinistra|sx)\b/.test(name) || name.includes("_left") || name.includes("_sx");
    const hasRight = /\b(right|destra|dx)\b/.test(name) || name.includes("_right") || name.includes("_dx");
    if (!hasLeft && !hasRight) continue;

    const hasFar = /\b(far|long|lunga|ampia)\b/.test(name) || name.includes("16");
    const hasNear = /\b(near|short|breve|corta)\b/.test(name) || name.includes("9");

    trials.push({
      id: `event-${trials.length + 1}`,
      onset: event.t,
      direction: hasRight ? "right" : "left",
      distanceKind: hasFar && !hasNear ? "far" : "near",
      durationMs: settings.durationMs,
      source: "events",
    });
  }

  return trials;
}

function suggestTrialsFromEvents() {
  const trials = buildTrialsFromEvents();
  if (!trials.length) {
    setStatus(
      "warn",
      "Nessun trial in events.csv",
      "Gli eventi caricati non contengono direzione/distanza riconoscibili; usa annotazione manuale o CSV trial."
    );
    return;
  }

  state.trials = trials;
  analyze();
  renderAll();
  setStatus("ready", "Trial da events.csv", `${trials.length} trial generati dai marker evento.`);
}

function analyze() {
  flagExcludedSamples();
  state.results = state.trials.map((trial, index) => analyzeTrial(trial, index));
  state.summaries = summarizeResults(state.results);
}

function analyzeTrial(trial, index) {
  const settings = getSettings();
  const sign = directionSign(trial.direction);
  const durationMs = trial.durationMs || settings.durationMs;
  const durationS = durationMs / 1000;
  const distanceCm = distanceCmFor(trial.distanceKind, settings);
  const amplitudeDeg = visualAngle(distanceCm, settings.monitorDistanceCm);
  const targetVelocityDegS = amplitudeDeg / durationS;
  const motionStart = trial.onset;
  const motionEnd = motionStart + durationS;
  const gainStart = motionStart + settings.windowStartMs / 1000;
  const gainEnd = motionStart + settings.windowEndMs / 1000;
  const maxVelocityForGain = Math.max(180, targetVelocityDegS * 3);

  const earlySamples = getSamplesBetween(gainStart, gainEnd).filter((sample) => {
    const signedVelocity = sign * sample.vxDeg;
    return Number.isFinite(signedVelocity) && Math.abs(sample.vxDeg) <= maxVelocityForGain;
  });
  const signedVelocities = earlySamples.map((sample) => sign * sample.vxDeg);
  const earlyVelocity = median(signedVelocities);
  const earlyGain = earlyVelocity / targetVelocityDegS;

  const baselineSamples = getSamplesBetween(
    motionStart - settings.baselineMs / 1000,
    motionStart,
    { allowExcluded: true }
  );
  const endpointSamples = getSamplesBetween(
    motionEnd - settings.endpointWindowMs / 1000,
    motionEnd + settings.endpointWindowMs / 1000,
    { allowExcluded: true }
  );
  const baselineAzimuth = median(baselineSamples.map((sample) => sample.azimuthDeg));
  const endpointAzimuth = median(endpointSamples.map((sample) => sample.azimuthDeg));
  const signedPositionChange = sign * (endpointAzimuth - baselineAzimuth);
  const positionGain = signedPositionChange / amplitudeDeg;
  const finalErrorDeg = amplitudeDeg - signedPositionChange;

  const onsetLatencyMs = estimatePursuitLatency({
    motionStart,
    motionEnd,
    sign,
    targetVelocityDegS,
    maxVelocityForGain,
  });
  const catchups = catchupMetrics(trial, motionStart, motionEnd, sign);
  const validRatio = earlySamples.length / Math.max(1, countSamplesBetween(gainStart, gainEnd));
  const quality = qualityFromSamples(earlySamples.length, validRatio, earlyGain);

  return {
    trialIndex: index + 1,
    id: trial.id,
    onset: trial.onset,
    direction: trial.direction,
    distanceKind: trial.distanceKind,
    durationMs,
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
  context.fillStyle = "#66737c";
  context.font = "16px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / 2, height / 2);
}

function drawGrid(context, bounds) {
  const { width, height, padding, plotWidth, plotHeight, minT, maxT, yMin, yMax, xFor, yFor } = bounds;
  context.strokeStyle = "#dce3e7";
  context.lineWidth = 1;
  context.strokeRect(padding.left, padding.top, plotWidth, plotHeight);

  context.fillStyle = "#66737c";
  context.font = "12px system-ui, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";

  const yStep = niceStep((yMax - yMin) / 5);
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
    const py = yFor(y);
    context.strokeStyle = y === 0 ? "#b8c4ca" : "#eef2f4";
    context.beginPath();
    context.moveTo(padding.left, py);
    context.lineTo(width - padding.right, py);
    context.stroke();
    context.fillText(`${Math.round(y)} deg`, padding.left - 8, py);
  }

  context.textAlign = "center";
  context.textBaseline = "top";
  const xStep = niceStep((maxT - minT) / 8);
  for (let t = Math.ceil(minT / xStep) * xStep; t <= maxT; t += xStep) {
    const px = xFor(t);
    context.strokeStyle = "#eef2f4";
    context.beginPath();
    context.moveTo(px, padding.top);
    context.lineTo(px, height - padding.bottom);
    context.stroke();
    context.fillStyle = "#66737c";
    context.fillText(`${t.toFixed(1)}s`, px, height - padding.bottom + 8);
  }
}

function drawTrialWindows(context, { xFor, padding, plotHeight }) {
  const settings = getSettings();
  for (const trial of state.trials) {
    const sign = directionSign(trial.direction);
    const start = trial.onset;
    const end = trial.onset + (trial.durationMs || settings.durationMs) / 1000;
    const gainStart = trial.onset + settings.windowStartMs / 1000;
    const gainEnd = trial.onset + settings.windowEndMs / 1000;
    const color = sign > 0 ? "28,109,208" : "216,72,72";

    context.fillStyle = `rgba(${color},0.08)`;
    context.fillRect(xFor(start), padding.top, xFor(end) - xFor(start), plotHeight);
    context.fillStyle = `rgba(${color},0.18)`;
    context.fillRect(xFor(gainStart), padding.top, xFor(gainEnd) - xFor(gainStart), plotHeight);
  }
}

function drawPlaybackCursor(context, { width, padding, plotHeight, xFor, yFor, minT, maxT }) {
  const gazeTime = videoTimeToRecordingTime();
  if (!Number.isFinite(gazeTime) || gazeTime < minT || gazeTime > maxT || !el.stimulusVideo.src) return;

  const x = xFor(gazeTime);
  context.save();
  context.strokeStyle = "#1c6dd0";
  context.lineWidth = 2.5;
  context.beginPath();
  context.moveTo(x, padding.top);
  context.lineTo(x, padding.top + plotHeight);
  context.stroke();

  const nearest = nearestGazeSample(gazeTime);
  if (nearest && Number.isFinite(nearest.azimuthDeg)) {
    context.fillStyle = "#1c6dd0";
    context.beginPath();
    context.arc(x, yFor(nearest.azimuthDeg), 4, 0, Math.PI * 2);
    context.fill();
  }

  const label = `${gazeTime.toFixed(3)} s`;
  context.font = "12px system-ui, sans-serif";
  const textWidth = context.measureText(label).width;
  const boxWidth = textWidth + 14;
  const boxHeight = 22;
  const boxX = clamp(x - boxWidth / 2, padding.left + 4, width - padding.right - boxWidth - 4);
  const boxY = padding.top + 6;

  context.fillStyle = "#1c6dd0";
  roundRect(context, boxX, boxY, boxWidth, boxHeight, 6);
  context.fill();
  context.fillStyle = "#fff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, boxX + boxWidth / 2, boxY + boxHeight / 2 + 0.5);
  context.restore();
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function niceStep(rawStep) {
  const exponent = Math.floor(Math.log10(Math.max(rawStep, 0.0001)));
  const fraction = rawStep / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
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
  el.loadSampleBtn.addEventListener("click", () => loadSampleData("sample1"));
  el.loadSample2Btn.addEventListener("click", () => loadSampleData("sample2"));
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
  el.calibrationPointSelect.addEventListener("change", () => {
    state.activeCalibrationPoint = el.calibrationPointSelect.value;
    updateCalibrationUi();
    renderVideoOverlay();
  });
  el.calibrationTargetModeBtn.addEventListener("click", () => setCalibrationMode("target"));
  el.calibrationFixationModeBtn.addEventListener("click", () => setCalibrationMode("fixation"));
  el.fitCalibrationBtn.addEventListener("click", fitCalibrationFromPairs);
  el.clearCalibrationBtn.addEventListener("click", () => clearCalibration());
  el.calibrationStartS.addEventListener("change", () => {
    updateCalibrationUi();
    renderVideoOverlay();
  });
  el.calibrationEndS.addEventListener("change", () => {
    updateCalibrationUi();
    renderVideoOverlay();
  });
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
  initializeCalibrationSelect();
  updateCalibrationUi();
  renderTrace();
  renderVideoOverlay();
}

initialize();

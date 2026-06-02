export async function parseEyeTrackerFolder(fileList) {
  const files = Array.from(fileList || []);
  const find = (name) => files.find((file) => file.name.toLowerCase() === name || (file.webkitRelativePath || '').toLowerCase().endsWith('/' + name));
  const gazeFile = find('gaze.csv');
  if (!gazeFile) throw new Error('gaze.csv non trovato nella cartella selezionata.');
  const info = await readJson(find('info.json'));
  const events = parseEvents(await readCsv(find('events.csv')));
  const worldTimestamps = parseWorldTimestamps(await readCsv(find('world_timestamps.csv')));
  const t0Ns = inferRecordingStartNs({ info, events, worldTimestamps });
  const gaze = parseGaze(await readCsv(gazeFile), t0Ns);
  const fixations = parseFixations(await readCsv(find('fixations.csv')), t0Ns);
  const saccades = parseIntervals(await readCsv(find('saccades.csv')), t0Ns, 'saccade');
  const blinks = parseIntervals(await readCsv(find('blinks.csv')), t0Ns, 'blink');
  markInvalidSamples(gaze, saccades, blinks);
  const videoFile = files.find((file) => /\.(mp4|mov|m4v|webm)$/i.test(file.name)) || null;
  return { sourceName: rootFolderName(files) || gazeFile.name, info, files, videoFile, t0Ns, gaze, fixations, saccades, blinks, events, worldTimestamps };
}
function rootFolderName(files) { const withPath = files.find((file) => file.webkitRelativePath); return withPath?.webkitRelativePath?.split('/')?.[0] || ''; }
async function readJson(file) { if (!file) return {}; try { return JSON.parse(await file.text()); } catch { return {}; } }
async function readCsv(file) { if (!file) return []; return parseCSV(await file.text()); }
export function parseCSV(text) {
  if (!text) return [];
  const rows = []; let row = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]; const next = text[i + 1];
    if (char === '"') { if (inQuotes && next === '"') { field += '"'; i += 1; } else inQuotes = !inQuotes; continue; }
    if (char === ',' && !inQuotes) { row.push(field); field = ''; continue; }
    if ((char === '\n' || char === '\r') && !inQuotes) { if (char === '\r' && next === '\n') i += 1; row.push(field); if (row.some((cell) => cell.trim() !== '')) rows.push(row); row = []; field = ''; continue; }
    field += char;
  }
  row.push(field); if (row.some((cell) => cell.trim() !== '')) rows.push(row); if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => { const entry = {}; headers.forEach((header, index) => { entry[header] = (cells[index] ?? '').trim(); }); return entry; });
}
function parseGaze(rows, t0Ns) {
  return rows.map((row, index) => { const timestampNs = num(pick(row, ['timestamp [ns]', 'timestamp_ns', 'gaze_timestamp_ns', 'recording_time_nanoseconds'])); const t = timeFromNs(timestampNs, t0Ns, index, 200); return { index, t, timestampNs, x: num(pick(row, ['gaze x [px]', 'gaze_x_px', 'scene_camera_frame_pixel_x', 'gaze_point_2d_x', 'x_px'])), y: num(pick(row, ['gaze y [px]', 'gaze_y_px', 'scene_camera_frame_pixel_y', 'gaze_point_2d_y', 'y_px'])), worn: num(pick(row, ['worn'])), fixationId: pick(row, ['fixation id', 'fixation_id']), blinkId: pick(row, ['blink id', 'blink_id']), azimuthDeg: num(pick(row, ['azimuth [deg]', 'azimuth_deg', 'azimuth'])), elevationDeg: num(pick(row, ['elevation [deg]', 'elevation_deg', 'elevation'])), invalid: false, screen: null, corrected: null, normX: NaN, normVx: NaN, degX: NaN, degVx: NaN }; }).filter((sample) => Number.isFinite(sample.t)).sort((a, b) => a.t - b.t);
}
function parseFixations(rows, t0Ns) { return rows.map((row, index) => { const id = pick(row, ['fixation id', 'fixation_id', 'id']) || String(index + 1); const start = nsToSeconds(num(pick(row, ['start timestamp [ns]', 'start_timestamp_ns'])), t0Ns); const end = nsToSeconds(num(pick(row, ['end timestamp [ns]', 'end_timestamp_ns'])), t0Ns); return { id, start, end, t: Number.isFinite(start) && Number.isFinite(end) ? (start + end) / 2 : start, durationMs: num(pick(row, ['duration [ms]', 'duration_ms', 'duration'])), x: num(pick(row, ['fixation x [px]', 'fixation_x_px', 'x [px]', 'x_px'])), y: num(pick(row, ['fixation y [px]', 'fixation_y_px', 'y [px]', 'y_px'])), screen: null, corrected: null }; }).filter((fix) => Number.isFinite(fix.t) && Number.isFinite(fix.x) && Number.isFinite(fix.y)); }
function parseIntervals(rows, t0Ns, kind) { return rows.map((row, index) => ({ id: pick(row, [kind + ' id', kind + '_id', 'id']) || String(index + 1), kind, start: nsToSeconds(num(pick(row, ['start timestamp [ns]', 'start_timestamp_ns'])), t0Ns), end: nsToSeconds(num(pick(row, ['end timestamp [ns]', 'end_timestamp_ns'])), t0Ns), durationMs: num(pick(row, ['duration [ms]', 'duration_ms'])), amplitudePx: num(pick(row, ['amplitude [px]', 'amplitude_px'])), amplitudeDeg: num(pick(row, ['amplitude [deg]', 'amplitude_deg'])) })).filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start); }
function parseEvents(rows) { return rows.map((row) => ({ timestampNs: num(pick(row, ['timestamp [ns]', 'timestamp_ns'])), name: pick(row, ['name', 'event', 'label', 'type']) || 'event', type: pick(row, ['type']) })).filter((event) => Number.isFinite(event.timestampNs)); }
function parseWorldTimestamps(rows) { return rows.map((row, index) => ({ frame: index, timestampNs: num(pick(row, ['timestamp [ns]', 'timestamp_ns'])), t: NaN })).filter((entry) => Number.isFinite(entry.timestampNs)); }
function inferRecordingStartNs({ info, events, worldTimestamps }) { const candidates = []; const begin = events.find((event) => /begin/i.test(event.name || '')); if (begin) candidates.push(begin.timestampNs); if (worldTimestamps.length) candidates.push(worldTimestamps[0].timestampNs); candidates.push(num(info?.recording_start_time_ns)); return candidates.find((value) => Number.isFinite(value) && value > 1e9) || null; }
function markInvalidSamples(gaze, saccades, blinks) { const padding = 0.008; for (const sample of gaze) { const inSaccade = saccades.some((s) => sample.t >= s.start - padding && sample.t <= s.end + padding); const inBlink = blinks.some((b) => sample.t >= b.start - padding && sample.t <= b.end + padding); const notWorn = Number.isFinite(sample.worn) && sample.worn < 0.5; sample.invalid = Boolean(inSaccade || inBlink || notWorn || !Number.isFinite(sample.x) || !Number.isFinite(sample.y)); } }
function pick(row, names) { for (const name of names) if (Object.prototype.hasOwnProperty.call(row, name) && row[name] !== '') return row[name]; const keys = Object.keys(row); for (const name of names) { const normalized = normalizeKey(name); const key = keys.find((candidate) => normalizeKey(candidate) === normalized); if (key && row[key] !== '') return row[key]; } return undefined; }
function normalizeKey(key) { return String(key).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function num(value) { if (value === undefined || value === null || value === '') return NaN; const parsed = Number(String(value).replace(',', '.')); return Number.isFinite(parsed) ? parsed : NaN; }
function timeFromNs(timestampNs, t0Ns, fallbackIndex, fallbackHz) { if (Number.isFinite(timestampNs) && Number.isFinite(t0Ns)) return (timestampNs - t0Ns) / 1e9; if (Number.isFinite(timestampNs)) return timestampNs > 1e6 ? timestampNs / 1e9 : timestampNs; return fallbackIndex / fallbackHz; }
function nsToSeconds(timestampNs, t0Ns) { if (!Number.isFinite(timestampNs)) return NaN; if (Number.isFinite(t0Ns)) return (timestampNs - t0Ns) / 1e9; return timestampNs > 1e6 ? timestampNs / 1e9 : timestampNs; }

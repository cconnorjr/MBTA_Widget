const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Window defaults: 1/8th of 1440p = 640×360 ──────────────────────────────
const DEFAULT_WIDTH  = 640;
const DEFAULT_HEIGHT = 360;

let mainWindow;
let tray;

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const x = screenW - DEFAULT_WIDTH  - 24;
  const y = screenH - DEFAULT_HEIGHT - 24;

  mainWindow = new BrowserWindow({
    width:  DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    x, y,
    minWidth:  360,
    minHeight: 240,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#0A0A0A',
    icon: path.join(__dirname, 'icon.ico'),
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC: window controls ────────────────────────────────────────────────────
ipcMain.on('win-minimize',   () => mainWindow?.minimize());
ipcMain.on('win-close',      () => mainWindow?.close());
ipcMain.on('win-toggle-top', () => {
  if (!mainWindow) return;
  const next = !mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(next);
  mainWindow.webContents.send('top-state', next);
});

// ── CSV delay logging ───────────────────────────────────────────────────────
//
// CSV format (one row per day, opens directly in Excel):
//
//  Col A  │  Col B           │  C … I (block 1)                              │  J … P (block 2) …
//  ───────┼──────────────────┼────────────────────────────────────────────────┼────────────────────
//  Date   │  Avg Delay (min) │  TripID │ Time │ Headsign │ Sched │ Actual │ Delay │ Early?
//
//  - "Avg Delay" clamps early arrivals (negative delay) to 0 before averaging.
//  - "Early?" is TRUE / FALSE.
//  - Each entry block is 7 cells wide (stride = 7).
//  - Dedup key = date + ":" + tripId  →  same tripId on a different day IS logged.
//
// Files: <app dir>/logs/delay_red.csv  and  delay_green.csv

const LOG_DIR = path.join(__dirname, 'logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function csvCell(val) {
  const s = String(val ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseCSVLine(line) {
  const cells = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  cells.push(cur);
  return cells;
}

// Read CSV → Map<date, cells[]>
function readCSV(filePath) {
  const rows = new Map();
  if (!fs.existsSync(filePath)) return rows;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = parseCSVLine(line);
    if (cells.length >= 1 && cells[0]) rows.set(cells[0], cells);
  }
  return rows;
}

// Write Map back to CSV sorted by date ascending
function writeCSV(filePath, rows) {
  const sorted = [...rows.entries()].sort(([a], [b]) => new Date(a) - new Date(b));
  const content = sorted.map(([, cells]) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n';
  fs.writeFileSync(filePath, content, 'utf8');
}

// Entry block layout (stride = 7):
//   [0] tripId  [1] time  [2] headsign  [3] scheduled  [4] actual  [5] delayMin  [6] isEarly
//
// Average: clamp negative delays to 0 (early = on time for avg purposes)
function calcAvgDelay(cells) {
  // cells[0] = date, cells[1] = avg placeholder, cells[2..] = entry blocks
  const STRIDE = 7;
  const DELAY_OFFSET = 5; // delayMin is 5th field within each block
  const delays = [];
  for (let i = 2; i < cells.length; i += STRIDE) {
    const d = parseFloat(cells[i + DELAY_OFFSET]);
    if (!isNaN(d)) delays.push(Math.max(0, d)); // clamp early arrivals to 0
  }
  if (!delays.length) return '';
  return (delays.reduce((a, b) => a + b, 0) / delays.length).toFixed(1);
}

// Extract all tripIds already logged for a given date row (for server-side dedup)
function getLoggedTripIds(cells) {
  const STRIDE = 7;
  const ids = new Set();
  for (let i = 2; i < cells.length; i += STRIDE) {
    if (cells[i]) ids.add(cells[i]); // cells[i] = tripId (first field of block)
  }
  return ids;
}

// ── MTA GTFS-RT feed (72 St-2 Av, Q line) ───────────────────────────────────
//
// Stop IDs for 72 St-2 Av (Second Avenue Subway):
//   Q05N = Northbound platform (toward 96 St / Astoria-Ditmars Blvd)
//   Q05S = Southbound platform (toward Coney Island-Stillwell Av)
//
// Verify stop IDs in MTA GTFS Static stops.txt:
//   https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/google_transit%2Fsubway
//
// No API key required — the NQRW feed is publicly accessible.
// If the MTA restricts access in the future, register free at https://api.mta.info/
//
const MTA_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw';
const MTA_Q72_STOPS = new Set(['Q05N', 'Q05S']);

const GtfsRt = require('gtfs-realtime-bindings');

ipcMain.handle('fetch-mta-predictions', async (_event, apiKey) => {
  const FeedMessage = GtfsRt.transit_realtime.FeedMessage;

  const headers = { 'Cache-Control': 'no-store' };
  if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch(MTA_FEED_URL, { headers });
  if (!res.ok) {
    const text = await res.text().then(t => t.slice(0, 120));
    throw new Error(`MTA feed ${res.status}: ${text}`);
  }

  const buffer = await res.arrayBuffer();
  const feedMsg = FeedMessage.decode(new Uint8Array(buffer));

  const arrivals = [];
  for (const entity of feedMsg.entity || []) {
    const tu = entity.tripUpdate;
    if (!tu) continue;
    const routeId = tu.trip?.routeId || '';
    if (routeId !== 'Q') continue; // Q train only

    const tripId = tu.trip?.tripId || entity.id || '';

    for (const stu of tu.stopTimeUpdate || []) {
      if (!MTA_Q72_STOPS.has(stu.stopId)) continue;

      // GTFS-RT int64 times come as Long objects from protobufjs
      const rawArr = stu.arrival?.time;
      const rawDep = stu.departure?.time;
      const rawTime = rawArr != null ? rawArr : rawDep;
      if (rawTime == null) continue;

      const timeSec = typeof rawTime === 'object' ? rawTime.toNumber() : Number(rawTime);
      const delaySec = Number(
        (stu.arrival?.delay != null ? stu.arrival.delay : stu.departure?.delay) ?? 0
      );

      arrivals.push({
        tripId,
        routeId,
        stopId: stu.stopId,
        predictedTimeMs: timeSec * 1000,
        delaySec,
      });
    }
  }
  return arrivals;
});

ipcMain.on('log-delay', (_event, entry) => {
  // entry = { line, tripId, date, time, headsign, scheduled, actual, delayMin, isEarly }
  try {
    ensureLogDir();
    const fileName = entry.line === 'red'      ? 'delay_red.csv'
                   : entry.line === 'green'    ? 'delay_green.csv'
                   :                             'delay_mta_q72.csv';
    const filePath = path.join(LOG_DIR, fileName);

    const rows = readCSV(filePath);
    const date = entry.date;

    // Get or create the row for today
    let cells = rows.get(date) || [date, ''];

    // Server-side dedup: reject if this tripId already logged for this date
    const alreadyLogged = getLoggedTripIds(cells);
    if (alreadyLogged.has(entry.tripId)) {
      console.log(`[delay-log] SKIP duplicate tripId ${entry.tripId} for ${date}`);
      return;
    }

    // Append 7-cell entry block
    cells.push(
      entry.tripId,              // [0] Trip ID
      entry.time,                // [1] Actual time HH:MM
      entry.headsign,            // [2] Destination
      entry.scheduled,           // [3] Scheduled arrival HH:MM
      entry.actual,              // [4] Actual arrival HH:MM
      String(entry.delayMin),    // [5] Delay in minutes (raw; may be negative)
      entry.isEarly ? 'TRUE' : 'FALSE' // [6] Early flag
    );

    // Recalculate average (clamping negatives to 0)
    cells[1] = calcAvgDelay(cells);

    rows.set(date, cells);
    writeCSV(filePath, rows);

    console.log(`[delay-log] ${fileName} | ${date} | trip ${entry.tripId} | ${entry.headsign} | delay: ${entry.delayMin} min | early: ${entry.isEarly} | avg: ${cells[1]} min`);
  } catch (err) {
    console.error('[delay-log] Error writing CSV:', err);
  }
});

// ── Today's average delay reader ─────────────────────────────────────────────
ipcMain.handle('get-today-avg-delays', () => {
  ensureLogDir();
  const today = new Date().toLocaleDateString('en-US');
  const files = {
    red:      'delay_red.csv',
    green:    'delay_green.csv',
    mta_q72:  'delay_mta_q72.csv',
  };
  const result = {};
  for (const [line, fileName] of Object.entries(files)) {
    const cells = readCSV(path.join(LOG_DIR, fileName)).get(today);
    result[line] = (cells && cells[1] !== '') ? cells[1] : null;
  }
  return result;
});

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'icon.ico'));
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
    tray.setToolTip('MBTA Tracker — Central Sq + Park St');
    tray.on('click', () => {
      if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show',  click: () => mainWindow?.show() },
      { label: 'Quit',  click: () => app.quit() },
    ]));
  } catch (_) { /* icon missing — skip tray */ }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

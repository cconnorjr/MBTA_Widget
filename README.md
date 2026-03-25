# Central Square — MBTA + MTA Transit Tracker

Live departure board and delay stats for Central Square (Red Line), Park Street (Green Line), and 72 St-2 Av (NYC MTA Q train), packaged as a Windows desktop widget.

## First-time setup

1. **Install Node.js** if you don't have it: https://nodejs.org (LTS version)
2. Double-click **`setup.bat`** — it installs Electron and launches the app automatically.

## Running after setup

Double-click **`run.bat`** — the app opens instantly in the bottom-right corner of your screen.

## Window behaviour

| Control | Action |
|---------|--------|
| **Drag** the top bar | Move the window anywhere |
| **⬡** (pin button) | Toggle always-on-top |
| **─** | Minimise to taskbar |
| **✕** | Close |
| **Resize** edges/corners | Resize freely (min 360×240) |

The app also appears in the **system tray** — right-click the tray icon to show/hide or quit.

## Default size

640 × 360 px — exactly 1/8th of a 2560×1440 (1440p) monitor.
Opens in the bottom-right corner by default.

## API key (optional — MBTA)

Without a key, the MBTA API allows 20 requests/minute — enough for 2-minute auto-refresh.
For higher limits, get a free key at https://api-v3.mbta.com and paste it into `index.html`:

```js
const API_KEY = 'your-key-here';
```

## NYC MTA Q train — 72 St-2 Av

The app also tracks the **Q train at 72 St-2 Av** (Second Avenue Subway) using the MTA's GTFS-Realtime feed.

### How it works

Every 2 minutes the app fetches the MTA's NQRW binary protobuf feed from the Electron main process (bypassing CORS), decodes it using `gtfs-realtime-bindings`, and filters for arrivals at stop IDs `Q05N` (northbound) and `Q05S` (southbound). Trains detected as boarding are written to a log file in the same CSV format as the MBTA logs.

- **Feed URL**: `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw`
- **No API key required** — the NQRW feed is publicly accessible
- **Log file**: `logs/delay_mta_q72.csv`

### Delay data logged per train

| Field | Description |
|-------|-------------|
| Trip ID | MTA GTFS-RT trip identifier |
| Time | Clock time the train was detected boarding |
| Headsign | Direction (Uptown / 96 St or Coney Island) |
| Scheduled | Scheduled arrival (predicted time minus reported delay) |
| Actual | Actual arrival time |
| Delay (min) | Delay in minutes; negative = early |
| Early? | TRUE / FALSE |

## Today's Average Delay panel

The bottom section of the widget shows a live **Today's Average Delay** stat for each of the three tracked lines:

| Card | Source |
|------|--------|
| **RL** Red Line | `logs/delay_red.csv` |
| **GL** Green Line | `logs/delay_green.csv` |
| **Q** Q Train | `logs/delay_mta_q72.csv` |

Values are color-coded: **green** < 2 min · **amber** 2–5 min · **red** > 5 min · **—** no data yet today.

The average is computed across all trains logged for the current calendar day, with early arrivals clamped to 0 (early = on time for averaging purposes).

## Delay log format (all three lines)

CSV files live in the `logs/` folder and open directly in Excel. Each row is one calendar day:

```
Date, Avg Delay (min), TripID, Time, Headsign, Scheduled, Actual, Delay, Early?, [next trip …]
```

The same trip is never logged twice on the same day.

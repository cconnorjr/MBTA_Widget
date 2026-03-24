# Central Square — Red Line Desktop App

Live MBTA departure board for Central Square, packaged as a Windows desktop widget.

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

## API key (optional)

Without a key, the MBTA API allows 20 requests/minute — enough for 2-minute auto-refresh.
For higher limits, get a free key at https://api-v3.mbta.com and paste it into `index.html`:

```js
const API_KEY = 'your-key-here';
```

# Rocket League Live Dashboard

Live web dashboard for Rocket League Stats API data.  
It shows real-time match info, per-player stats, tracker links, and session results (W/L + streak).

## Features

- Live scoreboard from Rocket League local Stats API
- Compact player stats (score, goals, assists, saves, shots, touches, demos)
- Tracker links per player (platform-aware, including PSN normalization)
- Session history with:
  - Win / Loss entries
  - Current streak (`🔥` for wins, `🧊` for losses)
  - Early leave / forfeit fallback as loss when match is destroyed before `MatchEnded`

## Requirements

- Node.js (LTS recommended): https://nodejs.org
- Rocket League Stats API enabled locally on `127.0.0.1:49123`

## Download This Project

Download or clone the **entire repository** (all files/folders).  
Do not download just a single file, since the app needs the full project structure and dependencies.

## Rocket League Setup (Stats API)

1. Before launching Rocket League, edit:
   `\<Install Dir>\TAGame\Config\DefaultStatsAPI.ini`
2. Set these values:
   - `PacketSendRate` = any value `> 0` (for example `60`; max `120`)
   - `Port` = `49123`
3. Save the file and launch Rocket League.
4. Enter a match (or free play) so live events are emitted.
5. Start this dashboard (`start-app.bat` or `npm run start`).
6. If the page loads but shows no live data, re-check `DefaultStatsAPI.ini` and confirm the game is active.

## Quick Start (recommended)

1. Install dependencies (first time only):
   ```bash
   npm install
   ```
2. Launch app + proxy together:
   - Double-click `start-app.bat`  
   or
   ```bash
   npm run start
   ```
3. Open `http://localhost:5173` (or the URL shown in terminal if 5173 is occupied)

## Available Scripts

- `npm run dev` - Start Vite dev server only
- `npm run proxy` - Start Rocket League relay proxy only (port 3001)
- `npm run start` - Start proxy + dev server together
- `npm run build` - Build production files into `dist/`
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## How It Works

- `proxy.js` opens a local TCP connection to the Rocket League Stats API (`127.0.0.1:49123`)
- Browser app reads from `/rl` through Vite proxy -> Node relay
- App parses streamed JSON messages and updates UI in real time

## Git / Upload Notes

Recommended to exclude:

- `node_modules/`
- `dist/`
- `*.zip`
- `vite.log`
- `proxy-output.txt`

(`.gitignore` is already configured for these.)

## Troubleshooting

- **Blank page / no data**: verify Rocket League Stats API is enabled and in a live match
- **Port in use**: close previous dev/proxy processes or use the URL printed by Vite
- **`npm` not found**: install Node.js and reopen terminal

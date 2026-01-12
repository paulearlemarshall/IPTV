# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **Electron-based IPTV Player** that uses the **Xtream Codes (XC) API** for dynamic content loading. The application has been migrated from legacy M3U parsing to a modern lazy-loading architecture with instant startup and low memory usage.

### Key Architecture Document

Read `XC_API_ARCHITECTURE.md` before making changes to API integration, playback logic, or UI patterns. This document defines:
- The mandatory CORS proxy requirement (all API calls route through Electron main process)
- Lazy loading pattern (categories first, streams on-demand)
- Playback URL construction rules for live/VOD/series
- Accordion UI pattern for hierarchical data

## Project Structure

```
electron/
├── main.js              # Electron main process (IPC handlers, proxy server, cache management)
├── preload.js           # Context bridge exposing IPC to renderer
├── vite.config.js       # Vite configuration
├── package.json         # Dependencies and scripts
├── src/
│   ├── App.jsx          # Main React component (XC API integration, state management)
│   ├── main.jsx         # React entry point
│   └── components/
│       ├── VideoPlayer.jsx      # Internal HLS/MPEGTS player
│       ├── ProfileManager.jsx   # Multi-profile management UI
│       └── CachedImage.jsx      # Image caching component
└── dist/                # Build output (after `npm run build`)
```

## Development Commands

**Installation:**
```bash
cd electron
npm install
```

**Development Mode:**
```bash
npm run dev
```
- Runs Vite dev server on port 5180
- Launches Electron with hot reload
- Opens DevTools automatically

**Production Build:**
```bash
npm run build
```
- Compiles React app with Vite
- Packages Electron app with electron-builder
- Output in `electron/dist/`

## Critical Architecture Patterns

### IPC Communication Pattern

**All external requests (API, images, M3U) must go through the main process.** The renderer cannot make direct HTTP requests due to CORS restrictions.

**Main Process (main.js):**
- Handles all HTTP requests via axios
- Manages 60-second API response cache
- Runs local proxy server on port 5181 for Chromecast streams
- Implements image caching queue with 5 concurrent downloads

**Renderer Process (App.jsx):**
- Calls `window.api.xcApi()` exposed via preload.js
- Never uses `fetch()` or `XMLHttpRequest` for external URLs
- Uses `window.api.cacheImage()` for progressive image loading

### XC API Integration Flow

1. **Initialization:** Load categories for all sections (live/vod/series) when profile/server changes (App.jsx:245-251)
2. **User Interaction:** Fetch streams only when category is clicked (App.jsx:92-132)
3. **Playback:** Construct URLs client-side using patterns in `XC_API_ARCHITECTURE.md` (App.jsx:260-274)
4. **Series Handling:** Fetch `get_series_info` to load episodes, then construct episode URLs (App.jsx:134-177)

### Profile & Caching System

**Profile Data Storage:**
- Config stored in `userData/config.ini` (INI format, not JSON)
- Each profile has isolated cache directory: `userData/profiles/{profileId}/`
- Images cached as MD5 hashes of URLs in `images/` subdirectory

**Cache Cleanup:**
- Orphaned images removed when switching profiles
- M3U cache cleared on fresh fetch (streamed directly to disk)
- API responses cached in-memory for 60 seconds

### Playback Modes

1. **VLC Mode:** Spawns external VLC process via `ipcRenderer.invoke('launch-vlc')`
2. **Internal Mode:** Uses VideoPlayer.jsx with HLS.js (for m3u8) or mpegts.js (for .ts streams)
3. **Cast Mode:** Sends stream through local proxy server at `http://{localIP}:5181/stream?url=...`

## Common Modifications

### Adding New XC API Actions

1. Update `App.jsx` with new `fetchX()` function following pattern at App.jsx:52-90
2. Call `window.api.xcApi()` with action and extraParams
3. Check `apiDebug` console logs to verify request/response
4. Cache key is auto-generated from `{ server, username, action, extraParams }`

### Modifying IPC Handlers

1. Add handler in `main.js` using `ipcMain.handle('handler-name', async (event, data) => {...})`
2. Expose in `preload.js` via `contextBridge.exposeInMainWorld('api', {...})`
3. Call from renderer via `window.api.handlerName(data)`

### Working with Images

Images are aggressively cached to avoid re-downloading. Use `CachedImage.jsx` component:
- Checks local cache first via `checkImageCacheBatch()`
- Falls back to remote URL if not cached
- Triggers background download via `cacheImage()` on load
- Updates `imageCacheMap` state in App.jsx to trigger re-renders when cached

### UI Sections & Tabs

The app uses a **section-based architecture** (live/vod/series):
- Section state controls which categories are displayed (App.jsx:15-16)
- Category expansion loads streams for that category only (App.jsx:254-256)
- Switching sections clears selected category and resets view mode (App.jsx:445-460)

## Important Implementation Rules

### CORS & Security
- **NEVER** use `fetch()` in renderer for IPTV servers (blocked by CORS)
- Main process has `webSecurity: false` enabled for internal player only
- All external requests must proxy through main.js IPC handlers

### M3U Parsing (Legacy Support)
- Progressive parsing sends batches of 5000 streams via IPC (main.js:236-303)
- Only used for legacy M3U URLs, not for XC API integration
- Renderer accumulates batches in state until `isFinal: true`

### Video Codecs
- Electron launched with `--enable-features=PlatformHEVCDecoderSupport` for HEVC/H.265
- Internal player auto-detects format: HLS.js for `.m3u8`, mpegts.js for `.ts`

### Configuration Format
- Uses **INI format**, not JSON (see `parseINI()` and `stringifyINI()` in main.js:429-470)
- Profiles stored in `[Profile_{id}]` sections
- Multiple servers stored comma-separated in `servers=` field

## Testing & Debugging

**Enable API Debug Mode:**
- Click bug icon in top-right header
- All XC API requests/responses logged to DevTools console
- Shows cache hits/misses and response times

**Check Profile Cache:**
- Windows: `%APPDATA%/iptv-player-electron/profiles/`
- macOS: `~/Library/Application Support/iptv-player-electron/profiles/`
- Linux: `~/.config/iptv-player-electron/profiles/`

**Common Issues:**
- **Empty Categories:** Some providers have empty `get_live_streams` responses. Not an error.
- **Image 404s:** Channel icons frequently fail. CachedImage component has fallback placeholder.
- **Chromecast not found:** Devices discovered asynchronously. Click cast button to trigger scan.

## Dependencies & Tech Stack

- **Electron 33.2.1:** Desktop app framework
- **React 18.2:** UI framework
- **Vite 7.3.1:** Build tool and dev server
- **axios:** HTTP client for main process only
- **HLS.js / mpegts.js:** Video playback libraries
- **chromecast-api:** Network discovery and casting
- **lucide-react:** Icon library

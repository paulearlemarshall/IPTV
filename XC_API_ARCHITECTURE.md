# Xtream Codes (XC) API Integration Architecture
## Migration Guide: From Static M3U to Dynamic API

### 1. Executive Summary
This document defines the architectural standard for integrating IPTV services using the Xtream Codes (XC) API. Unlike legacy **M3U** implementations which require downloading, parsing, and holding massive playlists (often 100MB+) in memory, the **XC API** method utilizes a **Lazy Loading** pattern. This results in instant application startup, low memory usage, and real-time content updates.

### 2. Core Architecture

#### 2.1 The "Proxy" Requirement (CORS)
Most IPTV servers do not send standard CORS (Cross-Origin Resource Sharing) headers. 
- **Problem:** Direct `fetch()` requests from a web browser (or Electron renderer) to the IPTV server will fail due to security policies.
- **Solution:** All API requests must be routed through a backend proxy or a main process handler (in Electron/Native apps) that bypasses CORS.
- **Mechanism:**
  1. Frontend requests -> Backend Proxy/IPC -> IPTV Server.
  2. Backend adds `User-Agent` (mimicking a browser or VLC) and follows redirects.
  3. Backend returns raw JSON to Frontend.

#### 2.2 Endpoint Structure
All interactions occur via a single PHP endpoint with query parameters.

**Base URL Pattern:**
`http://{domain}:{port}/player_api.php`

**Authentication Parameters:**
Every request must include:
- `username={user}`
- `password={pass}`

### 3. Data Workflow & Lazy Loading
The application must **not** fetch all streams at startup. The workflow is hierarchical.

#### Phase 1: Initialization (Load Categories)
On application start (or mode switch), fetch **only** the category lists. This is lightweight.

*   **Live TV:** `action=get_live_categories`
*   **VOD (Movies):** `action=get_vod_categories`
*   **Series:** `action=get_series_categories`

**JSON Structure (Category):**
```json
[
  {
    "category_id": "3",
    "category_name": "US | NEWS",
    "parent_id": 0
  },
  {
    "category_id": "4",
    "category_name": "UK | SPORTS",
    "parent_id": 0
  }
]
```

#### Phase 2: User Interaction (Lazy Load Streams)
When the user clicks/expands a specific category, fetch the streams **only for that ID**.

*   **Live:** `action=get_live_streams&category_id={id}`
*   **VOD:** `action=get_vod_streams&category_id={id}`
*   **Series:** `action=get_series&category_id={id}`

**JSON Structure (Live Stream):**
```json
[
  {
    "num": 145,
    "name": "CNN US",
    "stream_type": "live",
    "stream_id": 45902,
    "stream_icon": "http://img.provider.com/logo/cnn.png",
    "epg_channel_id": "cnn.us",
    "added": "1489009213",
    "category_id": "3"
  }
]
```

**JSON Structure (VOD/Movie):**
```json
[
  {
    "num": 402,
    "name": "The Matrix (1999)",
    "stream_type": "movie",
    "stream_id": 12004,
    "stream_icon": "http://img.provider.com/poster/matrix.jpg",
    "container_extension": "mp4",
    "rating": "8.7",
    "added": "1560938211",
    "category_id": "12"
  }
]
```

### 4. Playback Logic
Playback URLs are **constructed** manually based on the data retrieved in Phase 2. Do not call an API to get the link; build it.

#### 4.1 Live TV URL
Standard format for HLS (.m3u8) or TS streams.
**Pattern:**
`http://{domain}:{port}/{username}/{password}/{stream_id}`

*Example:*
`http://vpn.tsclean.cc/myuser/mypass/45902`

#### 4.2 VOD (Movie) URL
Movies are static files. You **must** append the extension found in the JSON (`container_extension`).
**Pattern:**
`http://{domain}:{port}/movie/{username}/{password}/{stream_id}.{extension}`

*Example:*
`http://vpn.tsclean.cc/movie/myuser/mypass/12004.mp4`

#### 4.3 Series URL
Series usually do not play directly from the `get_series` list. A tertiary call (`get_series_info`) is technically required to get episodes, but for simple implementations, Series are often treated as nested folders or ignored in basic players.

### 5. UI Implementation Strategy (Accordion)
To effectively display this data without overwhelming the user:

1.  **Sidebar:** Create 3 main sections (Live, Movies, Series).
2.  **Accordion Pattern:**
    *   Clicking a Main Section (e.g., "Live TV") calls `Phase 1` (Get Categories) and renders the list.
    *   Clicking a Category (e.g., "US News") calls `Phase 2` (Get Streams) and renders the grid in the main view.
3.  **Search:** Search functionality should filter the **Category List** names locally. 

### 6. Error Handling
*   **Authentication:** If API returns HTTP 401 or 403, prompt user to re-enter credentials.
*   **Empty Categories:** Some providers list empty categories. If `get_live_streams` returns an empty array `[]`, display "No Content Found".
*   **Image Failures:** Channel icons (`stream_icon`) frequently 404. Always implement an `onerror` handler to swap in a placeholder image.

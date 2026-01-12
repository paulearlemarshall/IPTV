# IPTV Player Electron - Project Documentation

This project is a high-performance IPTV player application built with Electron and React, specifically optimized for the Windows environment.

## 🏗 Software Architecture

The application follows a **Hybrid Dynamic Architecture**, utilizing the **Xtream Codes (XC) API** standard for efficiency and scalability.

### Core Components
- **Main Process (Node.js):** Handles system-level operations, security (CORS bypass), configuration persistence, and the **Sequential Download Manager**.
- **Renderer Process (React + Vite):** A modern UI using **Lazy Loading** and **Progressive Rendering** to manage thousands of streams smoothly.
- **IPC Bridge (Preload):** A secure communication layer using `contextBridge` to expose specific backend functions to the UI.
- **Data Layer:** 24-hour XC API caching mechanism to minimize network overhead.

### Version Specifications
- **Operating System:** Windows (win32)
- **Electron:** v39.2.7 (Stable Modern)
- **Vite:** v7.3.1 (Latest)
- **React:** v18.2.0

---

## 🚀 Key Features & Functions

### 1. Robust Download Manager
A sophisticated background downloading system featuring:
- **Sequential Queue:** Processes one download at a time to maintain system stability.
- **Strategy-Based Logic:** Automatically attempts multiple protocols (HLS/ffmpeg, Stream Recording, Direct Download, or Native Electron) based on the stream type.
- **Real-time Tracking:** Live updates for download speed (KB/s), percentage progress, and status.
- **Queue Management:** Ability to cancel, remove, or reorder downloads in the queue.

### 2. Personalization & Favorites
- **Star System:** Independent "Favorite" toggle on every stream tile (Live, VOD, and Series).
- **Persistent Storage:** Favorites are saved in real-time to the `config.ini` file and are unique to each user profile.
- **Smart Category:** A synthetic "★ Favorites" category is automatically generated at the top of every section sidebar.

### 3. Rich Metadata & Discovery
- **10-Star Rating System:** Precise visual representation of ratings using fractional star filling (e.g., a 7.3 rating shows exactly 7.3 stars).
- **Deep Info Integration:** Displays Cast, Director, Release Date, Duration, and Plot summaries.
- **Contextual Metadata:** Right-click context menu provides immediate access to full metadata and technical stream details.

### 4. Dynamic UI & Styling
- **Section Accent Colors:** Adaptive theme that changes colors based on content type:
  - 🟡 **LIVE:** Yellow
  - 🟢 **VOD:** Green
  - 🔴 **SERIES:** Red
- **Interactive Sidebar:** Grouped, collapsible categories with prefix-based sorting.
- **Responsive Controls:** Adjustable tile sizes (100px - 400px) and global content filtering.

### 5. High-Performance Handling
- **Progressive Rendering:** Only renders the first 100 tiles initially, loading subsequent batches in the background to prevent UI freezes.
- **Intelligent Caching:** 
  - **API Caching:** 24-hour TTL for XC API responses.
  - **Image Caching:** MD5-hashed local storage for channel logos.
  - **Double-Click Refresh:** Clicking the same category within 1 second bypasses all caches to force a fresh update.

### 6. Advanced Playback & Connectivity
- **Multi-Mode Player:** Choose between **Internal Player**, **VLC Media Player** (External), or **Chromecast**.
- **Local Stream Proxy:** Built-in proxy server to facilitate Chromecast streaming by handling required headers and range requests.

---

## 🛠 How to Run (Development)

1. Navigate to the `electron` directory:
   ```bash
   cd electron
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev environment:
   ```bash
   npm run dev
   ```
   *This launches Vite for the frontend and Electron for the container simultaneously.*
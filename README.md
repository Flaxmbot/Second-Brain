<div align="center">

<!-- Animated Typing Header via readme-typing-svg -->
<a href="https://github.com/Flaxmbot/Second-Brain">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=28&duration=3000&pause=1000&color=00D4FF&center=true&vCenter=true&multiline=true&repeat=true&width=600&height=80&lines=%F0%9F%A7%A0+INTERNET+MEMORY;Your+Second+Brain+for+the+Web" alt="Internet Memory" />
</a>

<br/>

<img src="https://readme-typing-svg.demolab.com?font=Inter&weight=400&size=16&duration=4000&pause=2000&color=888888&center=true&vCenter=true&repeat=true&width=500&height=30&lines=Privacy-first+%E2%80%A2+100%25+Local+%E2%80%A2+AI-Powered+%E2%80%A2+Zero+Cloud" alt="Tagline" />

<br/><br/>

[![Version](https://img.shields.io/badge/Version-1.0.0-orange?style=for-the-badge)](https://github.com/Flaxmbot/Second-Brain/releases)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-green?style=for-the-badge&logo=linux&logoColor=white)](https://github.com/Flaxmbot/Second-Brain/releases)

[![Electron](https://img.shields.io/badge/Electron-33.0+-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Chrome](https://img.shields.io/badge/Chrome_Extension-MV3-4285F4?style=flat-square&logo=google-chrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Ollama](https://img.shields.io/badge/Ollama-Local_AI-F1682D?style=flat-square)](https://ollama.ai/)

<br/>

<a href="https://github.com/Flaxmbot/Second-Brain/stargazers">
  <img src="https://img.shields.io/github/stars/Flaxmbot/Second-Brain?style=for-the-badge&logo=github&color=1a1a2e&labelColor=0d1117" alt="GitHub stars">
</a>
<a href="https://github.com/Flaxmbot/Second-Brain/forks">
  <img src="https://img.shields.io/github/forks/Flaxmbot/Second-Brain?style=for-the-badge&logo=github&color=1a1a2e&labelColor=0d1117" alt="GitHub forks">
</a>

</div>

<!-- Animated gradient divider -->
<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=0,2,2,5,30&height=2&section=header" width="100%"/>
</p>

## 🧬 What is Internet Memory?

> **A Chrome extension + AI-powered Electron backend that automatically captures, indexes, and lets you chat with everything you read online — powered by local AI.**

Internet Memory is your personal, privacy-first "Second Brain". It runs silently as a system-tray application, mediating between your browser and local AI models (Ollama). 

<table>
<tr>
<td width="50%">

### 🔒 Privacy by Design
- **100% Local**: Your data never leaves your machine. No cloud, no telemetry.
- **SQLite Storage**: Industry-standard database for reliable local indexing.
- **Secure Auth**: Interaction via local API tokens for extension safety.

</td>
<td width="50%">

### ⚡ How It Works
1. **Browse**: Read the web as you normally would.
2. **Capture**: The extension auto-distills the core content of articles.
3. **Index**: Content is embedded and indexed by Ollama.
4. **Recall**: Search or chat with your history from the side panel.

</td>
</tr>
</table>

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=0,2,2,5,30&height=1&section=header" width="60%"/>
</p>

## ✨ Key Features

- **💬 Chat with Memory**: Ask questions about everything you've read. Get streaming responses with direct source citations.
- **✨ AI Auto-Tagging**: Every memory is automatically categorized and given a "Bottom Line" summary by AI.
- **🔍 Semantic Search**: Vector-based search that understands the *meaning* of your query, not just keywords.
- **🌙 Premium UI**: A stunning, modern interface with high-quality Dark and Light mode support.
- **📦 Multi-Platform**: Professional installers for Windows (MSI/EXE), Linux (DEB/AppImage), and macOS (DMG).
- **📝 Highlights**: Right-click any text to save specific snippets to your permanent memory.

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=0,2,2,5,30&height=1&section=header" width="60%"/>
</p>

## ⚡ Quick Start

### Prerequisites
- **Ollama**: Latest version (Required for local LLM & Embeddings)
- **Node.js**: ≥ 20 (Only if building from source)

### Installation

1. **Download**: Grab the latest release for your OS from the [Releases](https://github.com/Flaxmbot/Second-Brain/releases) page.
2. **Setup Extension**:
   - Download `internet-memory-extension.zip` from the release.
   - Unzip it.
   - Open `chrome://extensions` → Load Unpacked → Select the unzipped folder.
3. **Connect**: Copy the API Token from the system tray icon and paste it into the Extension Options.

### Development

```bash
# Clone and Install
git clone https://github.com/Flaxmbot/Second-Brain.git
npm install

# Run in Development mode
npm run dev

# Build for Production
npm run dist
```

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=0,2,2,5,30&height=1&section=header" width="60%"/>
</p>

## 🛠️ Tech Stack

| Component | Technology |
|:---|:---|
| **Core Framework** | **Electron** |
| **Frontend** | React + Vite |
| **API Server** | Express |
| **Database** | SQL.js (SQLite WASM) |
| **AI Engine** | Ollama |
| **Extension** | Chrome Manifest V3 |

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=0,2,2,5,30&height=1&section=header" width="60%"/>
</p>

<div align="center">

## 📄 License

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

Copyright © 2024-present [Flaxmbot](https://github.com/Flaxmbot)

</div>

<!--
  ═══════════════════════════════════════════════════════════════════════════════
  🧠 INTERNET MEMORY - A Local, Privacy-First Knowledge Engine
  ═══════════════════════════════════════════════════════════════════════════════
-->

<div align="center">

<!-- Animated Gradient Banner -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://capsule-render.vercel.app/api?type=waving&height=300&color=0:1a1a2e,20:16213e,40:0f3460,60:e94560,80:533483,100:1a1a2e&animation=twinkling&text=Internet%20Memory&fontSize=80&fontAlignY=40&desc=Your%20Local%20Privacy-First%20Knowledge%20Engine&descAlignY=55&descSize=30&bgHeight=300">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=300&color=0:f8f9fa,20:e9ecef,40:dee2e6,60:ced4da,80:adb5bd,100:6c757d&animation=twinkling&text=Internet%20Memory&fontSize=80&fontAlignY=40&desc=Your%20Local%20Privacy-First%20Knowledge%20Engine&descAlignY=55&descSize=30&bgHeight=300" alt="Internet Memory Banner">
</picture>

<!-- Version, License, Platform Badges -->
<p>

![Version](https://img.shields.io/badge/Version-Alpha-orange?style=for-the-badge&logo=)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge&logo=)
![Platform-Windows](https://img.shields.io/badge/Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)
![Platform-macOS](https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white)
![Platform-Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)

</p>

<!-- Star Count Placeholder -->
<p>
<a href="https://github.com/Flaxmbot/Second-Brain/stargazers">
<img src="https://img.shields.io/github/stars/Flaxmbot/Second-Brain?style=for-the-badge&logo=github" alt="GitHub stars">
</a>
<a href="https://github.com/Flaxmbot/Second-Brain/forks">
<img src="https://img.shields.io/github/forks/Flaxmbot/Second-Brain?style=for-the-badge&logo=github" alt="GitHub forks">
</a>
</p>

<!-- Tagline -->
> **Transform your browsing into a crystalline, queryable intelligence.**
> *Your personal AI-powered memory that works 100% offline.*

</div>

---

<!-- Badges Section -->
<div align="center">

### 🛠️ Built With

![Tauri v2](https://img.shields.io/badge/Tauri-2.0+-6929C4?style=flat-square&logo=tauri&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-DEA584?style=flat-square&logo=rust&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-F1682D?style=flat-square&logo=&logoColor=white)
![Build Status](https://img.shields.io/badge/Build-Passing-success?style=flat-square)

</div>

---

## ✨ Features

<div class="features-grid">

| | |
|:--|:--|
| <div align="center">🧠<br><strong>🧠 Smart Knowledge Extraction</strong><br>Automatically captures and indexes web articles while filtering out noise.</div> | <div align="center">📺<br><strong>📺 Multi-Media Support</strong><br>Native transcript extraction for YouTube and text recovery for PDFs.</div> |
| <div align="center">🤖<br><strong>🤖 AI-Powered Categorization</strong><br>Auto-detects topics (AI/ML, Finance, Dev) using local AI models.</div> | <div align="center">📊<br><strong>📊 Knowledge Heatmap</strong><br>Visual GitHub-style contribution grid of your reading habits.</div> |
| <div align="center">💬<br><strong>💬 Conversational Intelligence</strong><br>Chat with your entire library using local LLMs via Ollama.</div> | <div align="center">🔗<br><strong>🔗 Numbered Citations</strong><br>Every AI response includes linked sources for verifiable truth.</div> |
| <div align="center">🎨<br><strong>🎨 Premium UI</strong><br>Dynamic Light, Dark, and System themes with customizable accent colors.</div> | <div align="center">🔒<br><strong>🔒 Privacy First</strong><br>100% local storage. Zero cloud. Zero telemetry. Your data stays yours.</div> |

</div>

---

## 🏗️ Architecture

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'darkMode': true, 'background': 'transparent', 'primaryColor': '#e1f5fe', 'lineColor': '#ffffff', 'secondaryColor': '#e8f5e9', 'tertiaryColor': '#fff3e0'}}}%%
flowchart TB
    subgraph Frontend["FRONTEND - Browser Extension"]
        direction TB
        popup[Popup - Quick Access]
        sidepanel[Sidepanel - Deep Insights]
        options[Options - Settings & Themes]
        content[Content Scripts - Capture & Annotation]
        capture[Capture Service - Content Indexing]
        
        popup --> capture
        sidepanel --> capture
        options --> capture
        content --> capture
    end
    
    Frontend -->|"HTTP/REST"| Backend["BACKEND - Tauri Desktop App"]
    
    subgraph Backend["BACKEND - Tauri Desktop App"]
        direction TB
        axum[("AXUM SERVER (:11435)")]
        
        subgraph Axum["Axum Server Components"]
            rest[REST API Endpoints]
            auth[Auth Handler]
            storage[Storage Manager]
            embeddings[Embeddings Generator]
        end
        
        axum --> rest
        axum --> auth
        axum --> storage
        axum --> embeddings
        
        tray[System Tray - Background Operation]
        db[("SQLite (WAL)")]
        
        storage --> db
        embeddings --> db
    end
    
    Backend -->|"Inference Requests"| Ollama["AI PROVIDER - Ollama"]
    
    subgraph Ollama["AI PROVIDER - Ollama"]
        direction TB
        ollama[("Ollama (:11434)")]
        
        subgraph OllamaComp["Ollama Components"]
            llm[LLM Models - Chat/Reasoning]
            emb[Embeddings - nomic-embed-text]
            stream[Streaming Response - SSE Support]
        end
        
        ollama --> llm
        ollama --> emb
        ollama --> stream
    end
    
    style Frontend fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    style Backend fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    style Ollama fill:#fff3e0,stroke:#e65100,stroke-width:2px
```

---

## ⚡ Quick Start

### Prerequisites

Before installing Internet Memory, ensure you have the following:

| Requirement | Version | Notes |
|------------|---------|-------|
| **Node.js** | ≥ 18.0 | For building the frontend |
| **Rust** | ≥ 1.70 | For Tauri backend |
| **Ollama** | Latest | [Download](https://ollama.ai/) |
| **Browser** | Chrome/Edge 110+ | For the extension |

### Installation

#### 1. Clone the Repository

```bash
git clone https://github.com/Flaxmbot/Second-Brain.git
cd Second-Brain
```

#### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Rust dependencies
cd src-tauri
cargo install --locked
```

#### 3. Pull Ollama Models

```bash
# Pull the embedding model (required)
ollama pull nomic-embed-text

# Pull a chat model (recommended)
ollama pull llama3.2
```

#### 4. Build & Run

```bash
# Development mode
npm run tauri dev

# Production build
npm run tauri build
```

#### 5. Install Browser Extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` folder from your project

#### 6. Authenticate

1. Right-click the extension icon → **Options**
2. Enter the API Token from the Tauri app system tray menu
3. Click **Save**

---

## 📥 Download

Choose your platform:

| Platform | Status | Download Link |
|----------|--------|---------------|
| 🪟 **Windows (x64)** | Available | [Download .exe](https://github.com/Flaxmbot/Second-Brain/releases) |
| 🍎 **macOS (Apple Silicon)** | Available | [Download .dmg](https://github.com/Flaxmbot/Second-Brain/releases) |
| 🍎 **macOS (Intel)** | Available | [Download .dmg](https://github.com/Flaxmbot/Second-Brain/releases) |
| 🐧 **Linux (AppImage)** | Available | [Download .AppImage](https://github.com/Flaxmbot/Second-Brain/releases) |
| 🐧 **Linux (.deb)** | Available | [Download .deb](https://github.com/Flaxmbot/Second-Brain/releases) |

---

## 🛠️ Tech Stack

<div align="center">

| Category | Technology | Description |
|----------|------------|-------------|
| **Core Engine** | ![Rust](https://img.shields.io/badge/Rust-000000?style=flat&logo=rust) **Rust** | High-performance backend with memory safety |
| **Framework** | ![Tauri](https://img.shields.io/badge/Tauri-2.0+-6929C4?style=flat&logo=tauri) **Tauri v2** | Lightweight desktop app framework |
| **Frontend** | ![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react) **React 19** | Modern UI library with hooks |
| **Styling** | ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3) **CSS3** | Custom properties & animations |
| **Database** | ![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite) **SQLite** | Local ACID-compliant storage |
| **AI/ML** | ![Ollama](https://img.shields.io/badge/Ollama-F1682D?style=flat) **Ollama** | Local LLM & embeddings inference |
| **Server** | ![Axum](https://img.shields.io/badge/Axum-000000?style=flat) **Axum** | Ergonomic Rust web framework |
| **Extension** | ![Chrome](https://img.shields.io/badge/Chrome-4285F4?style=flat&logo=google-chrome) **Web Extensions** | Cross-browser extension API |

</div>

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**!

### Ways to Contribute

1. **🐛 Report Bugs** - Open an issue with detailed reproduction steps
2. **💡 Request Features** - Suggest new functionality
3. **📖 Improve Documentation** - Fix typos, add examples
4. **🔧 Submit PRs** - Fork the repo and submit improvements

### Development Setup

```bash
# Fork the repository
# Clone your fork
git clone https://github.com/YOUR_USERNAME/Second-Brain.git

# Create a feature branch
git checkout -b feature/amazing-feature

# Make your changes and commit
git commit -m 'Add some amazing feature'

# Push to the branch
git push origin feature/amazing-feature

# Open a Pull Request
```

Please read our [Contributing Guidelines](CONTRIBUTING.md) for details.

---

## 📄 License

<div align="center">

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Internet Memory** is open source under the [MIT License](LICENSE).

Copyright © 2024-present [Flaxmbot](https://github.com/Flaxmbot)

</div>

---

<div align="center">

<!-- Animated Separator -->

<table>
<tr>
<td>

---

*Built with ❤️ by [Flaxmbot](https://github.com/Flaxmbot)*

</td>
</tr>
</table>

<table>
<tr>
<td align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&height=100&color=0:1a1a2e,50:533483,100:e94560&animation=fadeIn&text=&bgHeight=100" alt="Footer Wave">
</td>
</tr>
</table>

</div>

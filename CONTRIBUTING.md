# Contributing to Internet Memory

Thank you for your interest in contributing! 🎉

## How to Contribute

### 🐛 Report Bugs

Open an [issue](https://github.com/Flaxmbot/Second-Brain/issues) with:
- A clear title and description
- Steps to reproduce
- Expected vs actual behavior
- Your OS and browser version

### 💡 Request Features

Open an issue with the `feature` label describing:
- What problem does it solve?
- How should it work?
- Any design mockups or examples

### 🔧 Submit Pull Requests

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Test locally with `npm run tauri dev`
5. Commit: `git commit -m 'Add my feature'`
6. Push: `git push origin feature/my-feature`
7. Open a Pull Request

### Development Setup

```bash
# Prerequisites: Node.js 18+, Rust 1.70+, Ollama

git clone https://github.com/YOUR_USERNAME/Second-Brain.git
cd Second-Brain
npm install

# Run in development mode
npm run tauri dev

# The extension can be loaded from the extension/ folder
# in chrome://extensions with Developer mode enabled
```

### Code Style

- **Rust**: Follow standard Rust conventions (`cargo fmt`, `cargo clippy`)
- **JavaScript**: Use modern ES6+ syntax
- **Commits**: Use descriptive commit messages

## Architecture

| Component | Location | Description |
|-----------|----------|-------------|
| Tauri Backend | `src-tauri/` | Rust server with Axum, SQLite, Ollama integration |
| Chrome Extension | `extension/` | Manifest V3 extension with side panel UI |
| Minimal Frontend | `src/` | Static page for Tauri build (tray-only app) |

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

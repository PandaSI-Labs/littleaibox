# LittleAIBox

<div align="center">

![LittleAIBox Logo](public/images/pwa-192x192.png)

# LittleAIBox

**A Modern, Cross-Platform AI Conversation Assistant**

[中文](README.zh-CN.md) | [English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

This project is built using **Google Gemini API** for conversational AI interactions, providing an intelligent AI experience.

</div>

---

### 🚀 Live Demo

🌐 **Try it now**: https://ai.littletea.xyz

### 📱 Application Screenshots

#### Main Page

![Main Page - English](appshow/main_en.png)

#### Settings Page

![Settings Page - English](appshow/settings_en.png)

---

## ✨ Key Features

### 🎯 **Smart File Processing**
- **Office Documents**: Parse Word (.docx), PDF, Excel (.xlsx), and **PowerPoint (.pptx)** files directly in the browser
- **Rich Media**: Support for images and Markdown files
- **Zero Upload Required**: All file processing happens client-side for maximum privacy

### 🔐 **Privacy-First Design**
- **No Registration Required**: Start using immediately without creating an account
- **Self-Configure API Key**: Use your own Gemini API key, with complete data control
- **Flexible Storage**: Registered users' API keys are persisted for multi-device sync; guest users' keys are stored locally only and automatically cleared on page refresh, ensuring privacy

### 🌍 **Universal Access**
- **Regional Restriction Solution**: Built-in proxy routing to bypass geographical limitations
- **Offline-First**: Full PWA support with offline capabilities
- **Cross-Platform**: Works seamlessly on Web, PWA, and Android native apps

### 💬 **Advanced Markdown Rendering**
- **Code Highlighting**: Support for 40+ programming languages
- **Mathematical Expressions**: Beautiful math rendering with KaTeX
- **Diagrams**: Interactive Mermaid diagram support
- **GitHub Flavored Markdown**: Full GFM support with syntax highlighting

### 🌐 **Multi-Language Support**
- **5 Languages**: Chinese (Simplified/Traditional), English, Japanese, Korean
- **Smart Detection**: Automatic language detection based on browser settings
- **Optimized Loading**: Intelligent translation caching for instant language switching

### 🎨 **Beautiful UI/UX**
- **Dark/Light Mode**: Seamless theme switching
- **Responsive Design**: Perfect on desktop, tablet, and mobile
- **Native Feel**: Capacitor integration for native mobile experience

### ⚡ **Performance Optimized**
- **Fast Loading**: Vite-powered build with code splitting
- **Smart Caching**: Service Worker with intelligent cache strategies
- **Lightweight**: Pure JavaScript (no heavy frameworks)

---

## 🏗️ Architecture

### Frontend Stack

**Core Technologies**
- **Build Tool**: Vite 7.x
- **Framework**: Vanilla JavaScript (ES6+ Modules) - Zero framework overhead
- **Styling**: Tailwind CSS 4.x
- **Mobile**: Capacitor 7.x (Android support)

**Key Libraries**
- **Markdown**: marked.js + DOMPurify
- **Code Highlighting**: highlight.js (40+ languages)
- **Math Rendering**: KaTeX
- **Charts**: Mermaid
- **File Parsing**: mammoth (Word), PDF.js, xlsx, pptx2html
- **Storage**: IndexedDB + localStorage

### Client-Side Processing

All file parsing and processing happens entirely in the browser:
- **PPTX Parsing**: Full PowerPoint content extraction
- **PDF Reading**: Text and metadata extraction
- **Excel Processing**: Spreadsheet data parsing
- **Image Handling**: Client-side image processing

### Offline Support

- **Service Worker**: Custom caching strategies
- **IndexedDB**: Local chat history and settings storage
- **Progressive Web App**: Installable and works offline

### 🛡️ Backend Architecture (Closed-Source)

The project's backend is built on **Cloudflare Workers**, leveraging a modern serverless architecture. The backend remains closed-source to protect user data and core assets while achieving high elasticity and intelligent regional restriction solutions.

#### Core Database Layer

**Cloudflare D1 (SQLite)**
- Complete user authentication system (email/password) with secure password hashing and verification
- JWT session management for stateless authentication and multi-device login
- Chat history persistence with query and recovery support
- User configuration and preference management

#### Core: Elastic API Key Pool (APIKeyPool)

We designed and implemented a production-grade, highly available API key management system:

- **Multi-Key Rotation**: Intelligent management of multiple Gemini and Brave Search API keys with automatic load balancing
- **Health Check Mechanism**: Real-time monitoring of each key's availability and response quality
- **Automatic Failover**: Seamless switch to backup keys when a key fails or hits rate limits
- **Circuit Breaker Protection**: Prevents repeated requests to failed keys, protecting system resources
- **Intelligent Retry Strategy**: Exponential backoff algorithm to maximize request success rates

#### Core: Smart Failover & Degradation System

Implemented a carefully designed four-tier intelligent degradation architecture, ensuring high availability and service continuity:

1. **User Key Priority**: Prioritizes user-configured API keys
2. **Hybrid Mode**: Intelligently supplements with server keys when needed
3. **Single Key Mode**: Server key as backup solution
4. **Server Fallback**: Final safeguard ensuring service continuity

The system automatically detects and bypasses regional restrictions, invalid keys, network failures, and other issues, providing users with consistent and stable service.

#### Integrated Service Ecosystem

**Email Services**
- **Resend**: For secure email verification and password reset flows
- Supports HTML templates and internationalized email content

**Search & Content**
- **Brave Search API**: High-quality web search results to enhance AI context understanding
- **GNews API**: Real-time news integration for latest information queries

**Image Generation**
- **pollinations.ai**: High-performance image generation service supporting multiple artistic styles
- Client-side proxy service for user privacy protection

**Cloud Storage**
- **Cloudflare R2**: S3-compatible object storage for user avatars and attachments
- Global CDN acceleration with low-latency access
- **Cloudflare KV**: High-performance key-value storage for caching, session management, and usage limit tracking

**Developer-Friendly**: While the backend implementation is closed-source, all API endpoints are public and stable. The frontend code fully demonstrates how to interact with the backend, and developers can build custom frontends or integrate into their own applications using the same APIs.

---

## 📁 Project Structure

```
LittleAIBox/
├── src/                    # Source code
│   ├── main.js            # Main application logic
│   ├── api-config.js      # API configuration
│   ├── db.js              # IndexedDB wrapper
│   ├── i18n.js            # Internationalization
│   ├── mermaid-renderer.js # Diagram rendering
│   ├── style.css          # Global styles
│   └── sw-custom.js       # Service Worker
├── public/                 # Static assets
│   ├── locales/           # Translation files (5 languages)
│   ├── libs/              # Third-party libraries
│   ├── images/            # Images and icons
│   └── manifest.webmanifest # PWA manifest
├── appshow/                # Screenshots by language
├── capacitor.config.json   # Mobile app configuration
├── vite.config.js          # Build configuration
└── package.json            # Dependencies
```

---

## 🚀 Getting Started

### 📝 Usage Note

**Usage Note**: We recommend configuring your own Gemini API key for the best experience. No registration needed - simply enter your API key in the settings page to get started.

Get API Key: [Google AI Studio](https://aistudio.google.com/api-keys)

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/diandiancha/LittleAIBox.git
cd LittleAIBox

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Building for Mobile

```bash
# Add Android platform
npx cap add android

# Sync files
npx cap sync

# Open in Android Studio
npx cap open android
```

---

## 🎯 Use Cases

- **Academic Research**: Parse and analyze research papers, presentations
- **Content Creation**: Generate and edit markdown content with AI
- **Code Assistance**: Get help with programming tasks and code explanations
- **Document Analysis**: Extract insights from Office documents
- **Learning Tool**: Interactive AI tutoring with file attachments

---

## 🔒 Privacy & Security

- **Client-Side Processing**: File parsing happens in your browser
- **Local Storage**: Chat history stored locally (optional cloud sync)
- **No Tracking**: Privacy-first design
- **Open Source**: Transparent and auditable code

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

Copyright (c) 2025 diandiancha

---

<div align="center">

Made with ❤️ by LittleAIBox Team

**Star ⭐ this repo if you find it helpful!**

</div>

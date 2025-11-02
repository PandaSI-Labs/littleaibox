# Learn with LittleAIBox

**A learning guide created by a student, for students.**

Hey there! 👋 I'm a student developer who built LittleAIBox as a learning project. This guide shares what I learned along the way, so we can grow together!

[中文](docs/LEARN.zh-CN.md) | [English](LEARN.md) | [日本語](docs/LEARN.ja.md) | [한국어](docs/LEARN.ko.md)

> 🎓 This project is developed for educational and research purposes.  
> 🤝 We're all learning together - let's build something awesome!

---

## 📚 Table of Contents

- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Architecture & Patterns](#architecture--patterns)
- [Key Technologies](#key-technologies)
- [Hands-On Tutorials](#hands-on-tutorials)
- [Common Challenges](#common-challenges)
- [Next Steps](#next-steps)

---

## 🚀 Quick Start

### Prerequisites

Before diving in, make sure you have:
- **Node.js 18+** - [Download](https://nodejs.org/)
- **Basic JavaScript** - ES6+ familiarity
- **Git** - Version control basics
- **VS Code** (recommended) - Free code editor

### First Steps

```bash
# 1. Clone the repository
git clone https://github.com/diandiancha/LittleAIBox.git
cd LittleAIBox

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev

# 4. Open in browser
# Visit the URL shown in terminal (usually http://localhost:5173)
```

**🎉 Congratulations!** You now have LittleAIBox running locally.

---

## 🧠 Core Concepts

### 1. **Vanilla JavaScript (No Framework)**

LittleAIBox is built **without** React, Vue, or Angular. Why?

**Benefits:**
- ✅ Zero framework overhead - Learn native JavaScript
- ✅ Better performance - No virtual DOM, no extra layers
- ✅ Full control - Understand every line of code
- ✅ Smaller bundle size - Faster loading

**Key Pattern: ES Modules**
```javascript
// Import from another module
import { applyLanguage, t } from './i18n.js';

// Export for other modules
export function showToast(message, type) {
  // Implementation
}
```

### 2. **Client-Side File Processing**

One of the most impressive features: parsing Office files **in the browser**.

**How It Works:**
```javascript
// PDF parsing with PDF.js
const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
const page = await pdf.getPage(1);
const textContent = await page.getTextContent();

// DOCX parsing with mammoth.js
const result = await mammoth.convertToHtml({ arrayBuffer });
```

**Key Insight:** Files are **never uploaded** to a server. Everything happens locally!

### 3. **Progressive Web App (PWA)**

Make your web app feel like a native app.

**Components:**
- **Service Worker** - Background scripts for offline support
- **Manifest** - App metadata and icons
- **IndexedDB** - Local database storage

**Example: Service Worker**
```javascript
// sw-custom.js
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    // Cache API responses
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
```

### 4. **RAG (Retrieval Augmented Generation)**

The AI magic that makes document analysis possible.

**Process:**
1. **Upload** - User uploads a PDF/DOCX file
2. **Parse** - Extract text in the browser
3. **Chunk** - Split into manageable pieces
4. **Search** - Find relevant chunks based on query
5. **Generate** - AI answers using context

**Smart Chunking Example:**
```javascript
function smartChunking(text, maxSize = 8000, overlap = 200) {
  const sentences = text.match(/[^。！？\.\!\?]+[。！？\.\!\?\n\n]*/g) || [];
  const chunks = [];
  let currentChunk = "";
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxSize) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  return chunks;
}
```

### 5. **Internationalization (i18n)**

Support 5 languages with a clean pattern.

**Structure:** (e.g., `public/locales/en.json`)
```json
{
  "chat": {
    "placeholder": "Type your message...",
    "send": "Send"
  }
}
```

**Usage:**
```javascript
import { t, applyLanguage } from './i18n.js';

// Translate
const message = t('chat.placeholder');
// Shows: "Type your message..."

// Switch language
await applyLanguage('zh-CN');
```

---

## 🏗️ Architecture & Patterns

### Project Structure

Here's how LittleAIBox is organized:

```
LittleAIBox/
├── src/                      # Source code
│   ├── main.js              # Main application logic - handles UI, chat, file processing
│   ├── db.js                # IndexedDB wrapper - manages local database
│   ├── i18n.js              # Internationalization - language switching
│   ├── mermaid-renderer.js  # Diagram rendering - renders flowcharts and graphs
│   ├── floating-timeline.js # Floating timeline navigation
│   ├── api-config.js        # API configuration - Gemini API setup
│   ├── style.css            # Global styles
│   └── sw-custom.js         # Service Worker - PWA offline support
├── public/                   # Static assets
│   ├── locales/             # Translation files (5 languages)
│   ├── libs/                # Third-party libraries (mammoth, pdf.js, etc.)
│   ├── images/              # Images and icons
│   └── manifest.webmanifest # PWA manifest
├── docs/                     # Multi-language documentation
├── appshow/                  # Screenshots by language
├── capacitor.config.json     # Mobile app configuration
├── vite.config.js            # Build configuration
├── package.json              # Dependencies
└── index.html                # Main HTML entry point
```

**Understanding the structure:**
- **src/** - All JavaScript code lives here. Start with `main.js` to understand the app flow.
- **public/** - Static files that are served directly. Think of it as the assets folder.
- **docs/** - Documentation files (like this one!)

### Design Patterns Used

1. **Module Pattern**
   - ES6 modules for encapsulation
   - Each file handles one concern

2. **Observer Pattern**
   - Event listeners for UI interactions
   - Service Worker responding to fetch events

3. **Factory Pattern**
   - Dynamic script loading
   - Resource caching

4. **Strategy Pattern**
   - Different file parsers for PDF/DOCX/PPTX
   - Multiple caching strategies

### State Management

No Redux/Vuex needed! Uses simple patterns:

```javascript
// Global state
let chats = {};
let currentChatId = null;
let attachments = [];

// Function to update state
function addMessage(chatId, message) {
  if (!chats[chatId]) chats[chatId] = { messages: [] };
  chats[chatId].messages.push(message);
  renderChat(chatId); // Update UI
}
```

---

## 🛠️ Key Technologies

### Build Tools

**Vite** - Lightning-fast dev server
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

**Why Vite?**
- ✅ Instant server start
- ✅ Hot Module Replacement (HMR)
- ✅ Optimized production builds

### Styling

**Tailwind CSS** - Utility-first CSS framework
```html
<div class="flex items-center justify-between bg-blue-500 p-4">
  <button class="px-4 py-2 rounded hover:bg-blue-600">
    Click me
  </button>
</div>
```

**Benefits:**
- ✅ No custom CSS files to maintain
- ✅ Consistent design system
- ✅ Responsive utilities built-in

### Browser APIs

**IndexedDB** - Client-side database
```javascript
import { getDb } from './db.js';

const db = await getDb();
const transaction = db.transaction(['chats'], 'readwrite');
const store = transaction.objectStore('chats');
await store.put({ userId: '123', chatsData: data });
```

**Service Worker** - Offline support
- Cache static assets
- Intercept network requests
- Background sync

**Fetch API** - Modern networking
```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello' })
});
```

### Libraries

| Library | Purpose | Why? |
|---------|---------|------|
| **marked.js** | Markdown parsing | Lightweight, fast |
| **highlight.js** | Code syntax highlighting | 40+ languages |
| **KaTeX** | Math rendering | Beautiful equations |
| **Mermaid** | Diagram generation | Flowcharts, graphs |
| **PDF.js** | PDF parsing | Mozilla's battle-tested |
| **mammoth.js** | DOCX parsing | Converts to HTML |
| **Capacitor** | Native mobile | Cross-platform |

---

## 🎓 Hands-On Tutorials

### Tutorial 1: Adding a New Feature

Let's add a "Dark Mode" toggle button!

**Step 1: Add UI Button**
```html
<!-- index.html -->
<button id="theme-toggle" class="btn">🌙 Dark Mode</button>
```

**Step 2: Add JavaScript Logic**
```javascript
// src/main.js
elements.themeToggle = document.getElementById('theme-toggle');
elements.themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', 
    document.body.classList.contains('dark'));
});
```

**Step 3: Add CSS**
```css
/* Tailwind handles this automatically! */
/* Or add custom styles */
.dark {
  background: #1a1a1a;
  color: #ffffff;
}
```

**Step 4: Persist on Load**
```javascript
// Restore dark mode on page load
if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark');
}
```

### Tutorial 2: Parsing a File

Let's create a simple image viewer:

```javascript
async function viewImage(file) {
  // Check file type
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file');
    return;
  }
  
  // Read as base64
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.createElement('img');
    img.src = e.target.result;
    document.body.appendChild(img);
  };
  reader.readAsDataURL(file);
}

// Usage
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) viewImage(file);
});
```

### Tutorial 3: Adding i18n Support

Add support for a new language (e.g., Spanish):

**Step 1: Create Translation File**
```bash
cp public/locales/en.json public/locales/es.json
```

**Step 2: Translate**
```json
{
  "chat": {
    "placeholder": "Escribe tu mensaje...",
    "send": "Enviar"
  }
}
```

**Step 3: Update i18n.js**
```javascript
const SUPPORTED_LANGUAGES = ['zh-CN', 'en', 'ja', 'ko', 'zh-TW', 'es'];
```

**Step 4: Add Language Selector**
```html
<select id="lang-select">
  <option value="en">English</option>
  <option value="es">Español</option>
</select>
```

---

## 💡 Common Challenges

### Challenge 1: "Where Should I Start?"

**The Codebase:**
LittleAIBox started as a learning project, so `main.js` contains most of the app logic in one file. It works great, but as we add features together, splitting it into smaller modules will help us all.

**Learning Opportunity:** If you're interested in refactoring, here's a potential structure to explore:
```
src/
├── chat/
│   ├── index.js           # Chat logic
│   ├── messages.js        # Message handling
│   └── streaming.js       # Streaming responses
├── files/
│   ├── parser.js          # File parsing
│   └── preview.js         # File preview
└── ui/
    ├── sidebar.js         # Sidebar UI
    └── theme.js           # Theme management
```

**Collaboration Welcome!** If you want to help improve the codebase structure, that's a perfect way to contribute and learn!

### Challenge 2: "How Do I Debug?"

**Browser DevTools:**
- `F12` - Open DevTools
- `Console` tab - View logs and errors
- `Network` tab - Check API requests
- `Application` tab - Inspect IndexedDB, localStorage

**Debugging Tips:**
```javascript
// Add breakpoints
debugger; // Execution stops here

// Console logging
console.log('Variable:', variable);
console.table(arrayData); // Nice table view
console.group('Section'); // Group logs
```

### Challenge 3: "Handling Async Code"

**Common Pitfalls:**
```javascript
// ❌ Wrong: Missing await
function fetchData() {
  const data = fetch('/api/data');
  console.log(data); // Promise, not actual data!
}

// ✅ Correct
async function fetchData() {
  const response = await fetch('/api/data');
  const data = await response.json();
  console.log(data); // Actual data!
}
```

**Error Handling:**
```javascript
try {
  const result = await riskyOperation();
} catch (error) {
  console.error('Error occurred:', error);
  showToast('Something went wrong', 'error');
}
```

### Challenge 4: "Performance Issues"

**Optimization Strategies:**

1. **Lazy Loading**
```javascript
// Load heavy libraries only when needed
async function loadLibrary() {
  if (!window.heavyLibrary) {
    await loadScript('/libs/heavy-library.js');
  }
  return window.heavyLibrary;
}
```

2. **Debouncing**
```javascript
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Usage: Debounce search input
const debouncedSearch = debounce(handleSearch, 300);
```

3. **Virtual Scrolling**
For long lists, only render visible items.

---

## 📖 Learning Resources

### JavaScript Fundamentals

- [MDN JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide) - Official documentation
- [JavaScript.info](https://javascript.info/) - Modern tutorial
- [You Don't Know JS](https://github.com/getify/You-Dont-Know-JS) - Deep dive series

### Web APIs

- [MDN Web APIs](https://developer.mozilla.org/en-US/docs/Web/API) - All browser APIs
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) - Client-side database
- [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) - Offline support

### Build Tools & Frameworks

- [Vite Docs](https://vitejs.dev/) - Build tool documentation
- [Tailwind CSS](https://tailwindcss.com/docs) - Utility-first CSS
- [Capacitor](https://capacitorjs.com/docs) - Cross-platform apps

### AI & Machine Learning

- [Google Gemini API](https://ai.google.dev/docs) - API documentation
- [RAG Concepts](https://www.pinecone.io/learn/retrieval-augmented-generation/) - Learn RAG
- [LangChain](https://js.langchain.com/docs/) - LLM framework

---

## 🎯 Next Steps

### Beginner Path

1. ✅ Clone and run the project
2. ✅ Read `CONTRIBUTING.md` - Learn how to contribute
3. ✅ Fix a small bug - Build confidence
4. ✅ Add a new translation - Practice i18n
5. ✅ Submit your first PR!

### Intermediate Path

1. ✅ Understand the architecture
2. ✅ Add a new file format parser
3. ✅ Implement a new feature
4. ✅ Optimize existing code
5. ✅ Write tests

### Advanced Path

1. ✅ Help refactor `main.js` into modules (we can do this together!)
2. ✅ Optimize performance
3. ✅ Add new AI capabilities
4. ✅ Build your own features
5. ✅ Help mentor other contributors

---

## 🤝 Learning Together

**We're all learning here!**

As a student developer myself, I built this project to learn modern web development. We're all on this journey together. Feel free to:

- 💬 [Discussions](https://github.com/diandiancha/LittleAIBox/discussions) - Ask questions, share ideas
- 🐛 [Issues](https://github.com/diandiancha/LittleAIBox/issues) - Report bugs, suggest improvements
- 📖 [Documentation](CONTRIBUTING.md) - Learn how to contribute

**Remember:**
> We're all learning together. Every contribution, big or small, helps us all grow.  
> Don't hesitate to ask questions - we're here to help each other!

---

## 🎓 Learning Checklist

Track your progress:

- [ ] Set up the development environment
- [ ] Run the project successfully
- [ ] Understand the project structure
- [ ] Read through main.js
- [ ] Make your first code change
- [ ] Submit your first PR
- [ ] Help another contributor
- [ ] Build something new

---

**Ready to start learning?** 🚀

> Fork the repo, clone it locally, and start exploring. The best way to learn is by doing!

**Questions?** Open a [Discussion](https://github.com/diandiancha/LittleAIBox/discussions) - I'm here to help!

---

**Happy Learning!** 📚✨


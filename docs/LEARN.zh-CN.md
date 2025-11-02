# 学习指南 - LittleAIBox

**一份由学生编写、为学生准备的学习指南。**

你好！👋 我是一名学生开发者，将 LittleAIBox 作为学习项目来构建。这份指南分享我在过程中学到的东西，让我们一起成长！

[中文](LEARN.zh-CN.md) | [English](../LEARN.md) | [日本語](LEARN.ja.md) | [한국어](LEARN.ko.md)

> 🎓 本项目用于教育和研究目的。  
> 🤝 我们都在共同学习 - 让我们一起做些很酷的事情！

---

## 📚 目录

- [快速开始](#快速开始)
- [核心概念](#核心概念)
- [架构与设计模式](#架构与设计模式)
- [关键技术](#关键技术)
- [实践教程](#实践教程)
- [常见挑战](#常见挑战)
- [下一步](#下一步)

---

## 🚀 快速开始

### 前置要求

在开始之前，确保你已经具备：
- **Node.js 18+** - [下载](https://nodejs.org/)
- **基础 JavaScript** - 熟悉 ES6+ 语法
- **Git** - 版本控制基础知识
- **VS Code** (推荐) - 免费代码编辑器

### 初始步骤

```bash
# 1. 克隆仓库
git clone https://github.com/diandiancha/LittleAIBox.git
cd LittleAIBox

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 在浏览器中打开
# 访问终端显示的 URL（通常是 http://localhost:5173）
```

**🎉 恭喜！** 你现在已经成功在本地运行 LittleAIBox。

---

## 🧠 核心概念

### 1. **原生 JavaScript（无框架）**

LittleAIBox 是**不使用** React、Vue 或 Angular 构建的。为什么？

**优势：**
- ✅ 零框架开销 - 学习原生 JavaScript
- ✅ 更好的性能 - 无虚拟 DOM，无额外层级
- ✅ 完全控制 - 理解每一行代码
- ✅ 更小的包体积 - 加载更快

**关键模式：ES 模块**
```javascript
// 从另一个模块导入
import { applyLanguage, t } from './i18n.js';

// 导出给其他模块使用
export function showToast(message, type) {
  // 实现代码
}
```

### 2. **客户端文件处理**

最令人印象深刻的功能之一：在浏览器中解析 Office 文件。

**工作原理：**
```javascript
// 使用 PDF.js 解析 PDF
const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
const page = await pdf.getPage(1);
const textContent = await page.getTextContent();

// 使用 mammoth.js 解析 DOCX
const result = await mammoth.convertToHtml({ arrayBuffer });
```

**关键洞察：** 文件**永远不会上传**到服务器。一切都在本地进行！

### 3. **渐进式 Web 应用（PWA）**

让你的 Web 应用感觉像原生应用。

**组件：**
- **Service Worker** - 用于离线支持的背景脚本
- **Manifest** - 应用元数据和图标
- **IndexedDB** - 本地数据库存储

**示例：Service Worker**
```javascript
// sw-custom.js
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    // 缓存 API 响应
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
```

### 4. **RAG（检索增强生成）**

使文档分析成为可能的 AI 魔法。

**流程：**
1. **上传** - 用户上传 PDF/DOCX 文件
2. **解析** - 在浏览器中提取文本
3. **分块** - 拆分为可管理的片段
4. **搜索** - 根据查询找到相关块
5. **生成** - AI 使用上下文回答问题

**智能分块示例：**
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

### 5. **国际化（i18n）**

使用简洁的模式支持 5 种语言。

**结构：**
```json
// public/locales/zh-CN.json
{
  "chat": {
    "placeholder": "输入你的消息...",
    "send": "发送"
  }
}
```

**使用：**
```javascript
import { t, applyLanguage } from './i18n.js';

// 翻译
const message = t('chat.placeholder');
// 显示："输入你的消息..."

// 切换语言
await applyLanguage('en');
```

---

## 🏗️ 架构与设计模式

### 项目结构

LittleAIBox 的组织结构如下：

```
LittleAIBox/
├── src/                      # 源代码
│   ├── main.js              # 主应用逻辑 - 处理 UI、聊天、文件处理
│   ├── db.js                # IndexedDB 封装 - 管理本地数据库
│   ├── i18n.js              # 国际化 - 语言切换
│   ├── mermaid-renderer.js  # 图表渲染 - 渲染流程图和图表
│   ├── floating-timeline.js # 浮动时间线导航
│   ├── api-config.js        # API 配置 - Gemini API 设置
│   ├── style.css            # 全局样式
│   └── sw-custom.js         # Service Worker - PWA 离线支持
├── public/                   # 静态资源
│   ├── locales/             # 翻译文件（5 种语言）
│   ├── libs/                # 第三方库（mammoth、pdf.js 等）
│   ├── images/              # 图片和图标
│   └── manifest.webmanifest # PWA 清单
├── docs/                     # 多语言文档
├── appshow/                  # 各语言截图
├── capacitor.config.json     # 移动应用配置
├── vite.config.js            # 构建配置
├── package.json              # 依赖项
└── index.html                # 主 HTML 入口文件
```

**理解结构：**
- **src/** - 所有 JavaScript 代码都在这里。从 `main.js` 开始了解应用流程。
- **public/** - 直接提供的静态文件。可以把它看作资源文件夹。
- **docs/** - 文档文件（比如这个！）

### 使用的设计模式

1. **模块模式**
   - ES6 模块封装
   - 每个文件处理一个关注点

2. **观察者模式**
   - UI 交互的事件监听器
   - Service Worker 响应 fetch 事件

3. **工厂模式**
   - 动态脚本加载
   - 资源缓存

4. **策略模式**
   - 针对 PDF/DOCX/PPTX 的不同文件解析器
   - 多种缓存策略

### 状态管理

无需 Redux/Vuex！使用简单模式：

```javascript
// 全局状态
let chats = {};
let currentChatId = null;
let attachments = [];

// 更新状态的函数
function addMessage(chatId, message) {
  if (!chats[chatId]) chats[chatId] = { messages: [] };
  chats[chatId].messages.push(message);
  renderChat(chatId); // 更新 UI
}
```

---

## 🛠️ 关键技术

### 构建工具

**Vite** - 闪电般的开发服务器
```json
{
  "scripts": {
    "dev": "vite",           // 启动开发服务器
    "build": "vite build"    // 生产构建
  }
}
```

**为什么选择 Vite？**
- ✅ 即时服务器启动
- ✅ 热模块替换（HMR）
- ✅ 优化的生产构建

### 样式

**Tailwind CSS** - 实用优先的 CSS 框架
```html
<div class="flex items-center justify-between bg-blue-500 p-4">
  <button class="px-4 py-2 rounded hover:bg-blue-600">
    点击我
  </button>
</div>
```

**优势：**
- ✅ 无需维护自定义 CSS 文件
- ✅ 一致的设计系统
- ✅ 内置响应式实用工具

### 浏览器 API

**IndexedDB** - 客户端数据库
```javascript
import { getDb } from './db.js';

const db = await getDb();
const transaction = db.transaction(['chats'], 'readwrite');
const store = transaction.objectStore('chats');
await store.put({ userId: '123', chatsData: data });
```

**Service Worker** - 离线支持
- 缓存静态资源
- 拦截网络请求
- 后台同步

**Fetch API** - 现代网络请求
```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: '你好' })
});
```

### 库

| 库 | 用途 | 为什么？ |
|---------|---------|------|
| **marked.js** | Markdown 解析 | 轻量、快速 |
| **highlight.js** | 代码语法高亮 | 支持 40+ 种语言 |
| **KaTeX** | 数学公式渲染 | 美观的方程式 |
| **Mermaid** | 图表生成 | 流程图、图表 |
| **PDF.js** | PDF 解析 | Mozilla 的成熟方案 |
| **mammoth.js** | DOCX 解析 | 转换为 HTML |
| **Capacitor** | 原生移动应用 | 跨平台 |

---

## 🎓 实践教程

### 教程 1：添加新功能

让我们添加一个"深色模式"切换按钮！

**步骤 1：添加 UI 按钮**
```html
<!-- index.html -->
<button id="theme-toggle" class="btn">🌙 深色模式</button>
```

**步骤 2：添加 JavaScript 逻辑**
```javascript
// src/main.js
elements.themeToggle = document.getElementById('theme-toggle');
elements.themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', 
    document.body.classList.contains('dark'));
});
```

**步骤 3：添加 CSS**
```css
/* Tailwind 会自动处理！*/
/* 或添加自定义样式 */
.dark {
  background: #1a1a1a;
  color: #ffffff;
}
```

**步骤 4：加载时持久化**
```javascript
// 页面加载时恢复深色模式
if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark');
}
```

### 教程 2：解析文件

让我们创建一个简单的图片查看器：

```javascript
async function viewImage(file) {
  // 检查文件类型
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件');
    return;
  }
  
  // 读取为 base64
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.createElement('img');
    img.src = e.target.result;
    document.body.appendChild(img);
  };
  reader.readAsDataURL(file);
}

// 使用
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) viewImage(file);
});
```

### 教程 3：添加 i18n 支持

添加新语言支持（例如西班牙语）：

**步骤 1：创建翻译文件**
```bash
cp public/locales/en.json public/locales/es.json
```

**步骤 2：翻译**
```json
{
  "chat": {
    "placeholder": "Escribe tu mensaje...",
    "send": "Enviar"
  }
}
```

**步骤 3：更新 i18n.js**
```javascript
const SUPPORTED_LANGUAGES = ['zh-CN', 'en', 'ja', 'ko', 'zh-TW', 'es'];
```

**步骤 4：添加语言选择器**
```html
<select id="lang-select">
  <option value="zh-CN">中文</option>
  <option value="es">Español</option>
</select>
```

---

## 💡 常见挑战

### 挑战 1："我应该从哪里开始？"

**代码库说明：**
LittleAIBox 一开始就是个学习项目，所以 `main.js` 里包含了大部分应用逻辑。目前运行得很好，但随着我们一起添加功能，将它拆分为更小的模块对我们都有帮助。

**学习机会：** 如果你对重构感兴趣，这里是一个可以探索的结构：
```
src/
├── chat/
│   ├── index.js           # 聊天逻辑
│   ├── messages.js        # 消息处理
│   └── streaming.js       # 流式响应
├── files/
│   ├── parser.js          # 文件解析
│   └── preview.js         # 文件预览
└── ui/
    ├── sidebar.js         # 侧边栏 UI
    └── theme.js           # 主题管理
```

**欢迎合作！** 如果你想帮助改进代码库结构，这是贡献和学习的绝佳方式！

### 挑战 2："如何调试？"

**浏览器开发者工具：**
- `F12` - 打开开发者工具
- `Console` 标签 - 查看日志和错误
- `Network` 标签 - 检查 API 请求
- `Application` 标签 - 检查 IndexedDB、localStorage

**调试技巧：**
```javascript
// 添加断点
debugger; // 执行在这里停止

// 控制台日志
console.log('变量：', variable);
console.table(arrayData); // 漂亮的表格视图
console.group('部分'); // 分组日志
```

### 挑战 3："处理异步代码"

**常见陷阱：**
```javascript
// ❌ 错误：缺少 await
function fetchData() {
  const data = fetch('/api/data');
  console.log(data); // Promise，不是实际数据！
}

// ✅ 正确
async function fetchData() {
  const response = await fetch('/api/data');
  const data = await response.json();
  console.log(data); // 实际数据！
}
```

**错误处理：**
```javascript
try {
  const result = await riskyOperation();
} catch (error) {
  console.error('发生错误：', error);
  showToast('出现问题', 'error');
}
```

### 挑战 4："性能问题"

**优化策略：**

1. **懒加载**
```javascript
// 仅在需要时加载重库
async function loadLibrary() {
  if (!window.heavyLibrary) {
    await loadScript('/libs/heavy-library.js');
  }
  return window.heavyLibrary;
}
```

2. **防抖**
```javascript
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// 使用：防抖搜索输入
const debouncedSearch = debounce(handleSearch, 300);
```

3. **虚拟滚动**
对于长列表，仅渲染可见项。

---

## 📖 学习资源

### JavaScript 基础

- [MDN JavaScript 指南](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide) - 官方文档
- [JavaScript.info](https://zh.javascript.info/) - 现代教程
- [You Don't Know JS](https://github.com/getify/You-Dont-Know-JS) - 深入系列

### Web API

- [MDN Web APIs](https://developer.mozilla.org/zh-CN/docs/Web/API) - 所有浏览器 API
- [IndexedDB](https://developer.mozilla.org/zh-CN/docs/Web/API/IndexedDB_API) - 客户端数据库
- [Service Workers](https://developer.mozilla.org/zh-CN/docs/Web/API/Service_Worker_API) - 离线支持

### 构建工具与框架

- [Vite 文档](https://cn.vitejs.dev/) - 构建工具文档
- [Tailwind CSS](https://www.tailwindcss.cn/docs) - 实用优先 CSS
- [Capacitor](https://capacitorjs.com/docs) - 跨平台应用

### AI 与机器学习

- [Google Gemini API](https://ai.google.dev/docs) - API 文档
- [RAG 概念](https://www.pinecone.io/learn/retrieval-augmented-generation/) - 学习 RAG
- [LangChain](https://js.langchain.com/docs/) - LLM 框架

---

## 🎯 下一步

### 初级路径

1. ✅ 克隆并运行项目
2. ✅ 阅读 `CONTRIBUTING.md` - 学习如何贡献
3. ✅ 修复一个小错误 - 建立信心
4. ✅ 添加新翻译 - 练习 i18n
5. ✅ 提交你的第一个 PR！

### 中级路径

1. ✅ 理解架构
2. ✅ 添加新文件格式解析器
3. ✅ 实现新功能
4. ✅ 优化现有代码
5. ✅ 编写测试

### 高级路径

1. ✅ 帮助将 `main.js` 重构为模块（我们可以一起完成！）
2. ✅ 优化性能
3. ✅ 添加新 AI 能力
4. ✅ 构建自己的功能
5. ✅ 帮助指导其他贡献者

---

## 🤝 一起学习

**我们都在学习！**

作为学生开发者，我构建这个项目是为了学习现代 Web 开发。我们一起在这段旅程中。随时可以：

- 💬 [讨论](https://github.com/diandiancha/LittleAIBox/discussions) - 提问、分享想法
- 🐛 [问题](https://github.com/diandiancha/LittleAIBox/issues) - 报告问题、建议改进
- 📖 [文档](CONTRIBUTING.zh-CN.md) - 学习如何贡献

**记住：**
> 我们都在共同学习。每一个贡献，无论大小，都帮助我们成长。  
> 不要犹豫，尽管提问 - 我们在这里互相帮助！

---

## 🎓 学习清单

跟踪你的进度：

- [ ] 设置开发环境
- [ ] 成功运行项目
- [ ] 理解项目结构
- [ ] 阅读 main.js
- [ ] 进行第一次代码更改
- [ ] 提交第一个 PR
- [ ] 帮助其他贡献者
- [ ] 构建新功能

---

**准备好开始学习了吗？** 🚀

> Fork 仓库，克隆到本地，开始探索。学习的最佳方式就是实践！

**有问题？** 发起[讨论](https://github.com/diandiancha/LittleAIBox/discussions) - 我会帮助你！

---

**快乐学习！** 📚✨


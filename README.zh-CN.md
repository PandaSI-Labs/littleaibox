# LittleAIBox

<div align="center">

![LittleAIBox Logo](public/images/pwa-192x192.png)

# LittleAIBox

**现代化跨平台 AI 对话助手**

[中文](README.zh-CN.md) | [English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

本项目基于 **Google Gemini API** 构建对话功能，提供智能的 AI 交互体验。

</div>

---

### 🚀 在线体验

<div align="center">

🌐 **立即访问**: [**https://ai.littletea.xyz**](https://ai.littletea.xyz)

</div>

### 📱 应用截图

#### 主页面

![主页面 - 中文](appshow/main_zh-CN.png)

#### 设置页面

![设置页面 - 中文](appshow/settings_zh-CN.png)

---

## ✨ 核心亮点

### 🎯 **强大的文件处理能力**
- **Office 文档解析**: 直接在浏览器中解析 Word (.docx)、PDF、Excel (.xlsx) 和 **PowerPoint (.pptx)** 文件
- **富媒体支持**: 支持图片和 Markdown 文件
- **完全本地处理**: 所有文件解析均在浏览器端完成，保护隐私安全

### 🔐 **隐私优先设计**
- **无需注册**: 直接使用，无需创建账户即可开始体验
- **自行配置 API Key**: 使用您自己的 Gemini API 密钥，数据完全由您控制
- **灵活存储**: 注册用户的 API 密钥会持久化保存，方便多设备同步；访客用户的密钥仅存储在本地，刷新页面后自动清除，充分保障隐私

### 🌍 **无障碍访问**
- **地区限制解决方案**: 内置代理路由，突破地理限制
- **离线优先**: 完整的 PWA 支持，离线也能使用
- **全平台支持**: Web、PWA、Android 原生应用无缝切换

### 💬 **专业级 Markdown 渲染**
- **代码高亮**: 支持 40+ 种编程语言语法高亮
- **数学公式**: 使用 KaTeX 渲染精美数学表达式
- **流程图**: 支持交互式 Mermaid 图表
- **GitHub 风格**: 完整的 GFM 语法支持

### 🌐 **多语言支持**
- **5 种语言**: 中文（简体/繁体）、英语、日语、韩语
- **智能检测**: 根据浏览器设置自动检测语言
- **极速切换**: 智能翻译缓存，语言切换零延迟

### 🎨 **精美界面设计**
- **深色/浅色模式**: 无缝主题切换
- **响应式布局**: 桌面、平板、手机完美适配
- **原生体验**: Capacitor 集成，移动端原生般流畅

### ⚡ **极致性能优化**
- **快速加载**: Vite 构建，代码分割优化
- **智能缓存**: Service Worker 智能缓存策略
- **轻量无依赖**: 纯 JavaScript，无重型框架

---

## 🏗️ 技术架构

### 前端技术栈

**核心技术**
- **构建工具**: Vite 7.x
- **框架**: 原生 JavaScript (ES6+ Modules) - 零框架负担
- **样式框架**: Tailwind CSS 4.x
- **移动端**: Capacitor 7.x (支持 Android)

**核心库**
- **Markdown**: marked.js + DOMPurify
- **代码高亮**: highlight.js (40+ 语言)
- **数学渲染**: KaTeX
- **图表**: Mermaid
- **文件解析**: mammoth (Word)、PDF.js、xlsx、pptx2html
- **存储**: IndexedDB + localStorage

### 客户端处理

所有文件解析和处理完全在浏览器端完成：
- **PPTX 解析**: 完整提取 PowerPoint 内容
- **PDF 阅读**: 文本和元数据提取
- **Excel 处理**: 电子表格数据解析
- **图片处理**: 客户端图片处理

### 离线支持

- **Service Worker**: 自定义缓存策略
- **IndexedDB**: 本地聊天记录和设置存储
- **渐进式 Web 应用**: 可安装，离线可用

### 🛡️ 后端架构（闭源）

本项目的后端基于 **Cloudflare Workers** 构建，采用现代化的无服务器架构。后端保持闭源以保护用户数据和核心资产安全，同时实现高弹性和智能的地区限制解决方案。

#### 核心数据库层

**Cloudflare D1 (SQLite)**
- 完整的用户认证系统（邮箱/密码），支持安全的密码哈希和验证
- JWT 会话管理，实现无状态认证和多设备登录
- 聊天记录持久化存储，支持历史记录查询和恢复
- 用户配置和偏好设置管理

#### 核心：弹性 API 密钥池 (APIKeyPool)

我们设计并实现了一个生产级的高可用 API 密钥管理系统：

- **多密钥轮询**: 智能管理多个 Gemini 和 Brave Search API 密钥，自动负载均衡
- **健康检查机制**: 实时监控每个密钥的可用性和响应质量
- **自动故障转移**: 当某个密钥失效或触发限流时，无缝切换到备用密钥
- **熔断保护**: 防止短时间内重复请求失效密钥，保护系统资源
- **智能重试策略**: 指数退避算法，最大化请求成功率

#### 核心：智能降级与回退系统 (Smart Failover)

实现了精心设计的四层智能降级架构，确保高可用性和服务连续性：

1. **用户密钥优先**: 优先使用用户自己配置的 API 密钥
2. **混合模式**: 在用户密钥基础上，智能补充服务器密钥
3. **单密钥模式**: 单一服务器密钥作为备用方案
4. **服务器回退**: 最终保障机制，确保服务永不中断

该系统能够自动检测并绕过地区限制、失效密钥、网络故障等问题，为用户提供持续稳定的服务体验。

#### 集成服务生态

**邮件服务**
- **Resend**: 用于安全的邮箱验证和密码重置流程
- 支持 HTML 模板和国际化邮件内容

**搜索与内容**
- **Brave Search API**: 提供高质量的网络搜索结果，增强 AI 上下文理解
- **GNews API**: 实时新闻资讯集成，支持最新信息查询

**图像生成**
- **pollinations.ai**: 高性能图像生成服务，支持多种艺术风格
- 客户端代理服务，保护用户隐私

**云存储**
- **Cloudflare R2**: S3 兼容的对象存储，用于用户头像和附件存储
- 全球 CDN 加速，低延迟访问
- **Cloudflare KV**: 高性能键值存储，用于缓存、会话管理和用量限制追踪

**开发者友好**: 虽然后端实现闭源，但所有 API 端点都是公开和稳定的。前端代码完整展示了如何与后端交互，开发者可以基于相同的 API 构建自定义前端或集成到自己的应用中。

---

## 📁 项目结构

```
LittleAIBox/
├── src/                    # 源代码目录
│   ├── main.js            # 主应用逻辑
│   ├── api-config.js      # API 配置
│   ├── db.js              # IndexedDB 封装
│   ├── i18n.js            # 国际化模块
│   ├── mermaid-renderer.js # 图表渲染
│   ├── style.css          # 全局样式
│   └── sw-custom.js       # Service Worker
├── public/                 # 静态资源
│   ├── locales/           # 翻译文件（5种语言）
│   ├── libs/              # 第三方库
│   ├── images/            # 图片和图标
│   └── manifest.webmanifest # PWA 清单
├── appshow/                # 按语言分类的截图
├── capacitor.config.json   # 移动应用配置
├── vite.config.js          # 构建配置
└── package.json            # 项目依赖
```

---

## 🚀 快速开始

### 📝 使用说明

**使用提示**: 建议您自行配置 Gemini API 密钥以获得更好的使用体验。您无需注册账户，只需在设置页面输入您的 API 密钥即可开始使用。

获取 API 密钥：[Google AI Studio](https://aistudio.google.com/api-keys)

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/diandiancha/LittleAIBox.git
cd LittleAIBox

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 移动端构建

```bash
# 添加 Android 平台
npx cap add android

# 同步文件
npx cap sync

# 在 Android Studio 中打开
npx cap open android
```

---

## 🎯 应用场景

- **学术研究**: 解析和分析研究论文、演示文稿
- **内容创作**: 使用 AI 生成和编辑 Markdown 内容
- **编程辅助**: 获取编程任务帮助和代码解释
- **文档分析**: 从 Office 文档中提取见解
- **学习工具**: 支持文件附件的交互式 AI 辅导

---

## 🔒 隐私与安全

- **客户端处理**: 文件解析在您的浏览器中完成
- **本地存储**: 聊天记录本地存储（可选云端同步）
- **无追踪**: 隐私优先的设计理念
- **开源透明**: 代码完全开源，可审计

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 许可证。

Copyright (c) 2025 diandiancha

---

<div align="center">

Made with ❤️ by LittleAIBox Team

**如果觉得有帮助，请给个 ⭐ Star！**

</div>

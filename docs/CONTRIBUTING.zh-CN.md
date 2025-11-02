<div align="center">

# 参与贡献 LittleAIBox

**感谢您帮助改进 LittleAIBox！** 🎉

每一个 Bug 报告、想法或代码行都让这个项目变得更好。🌱

[中文](CONTRIBUTING.zh-CN.md) | [English](../CONTRIBUTING.md) | [日本語](CONTRIBUTING.ja.md) | [한국어](CONTRIBUTING.ko.md)

</div>

---

## 🚀 快速开始（新贡献者）

1. **Fork 并克隆**

   ```bash
   git clone https://github.com/diandiancha/LittleAIBox.git
   cd LittleAIBox
   npm install
   npm run dev
   ```

2. **进行修改** → 本地测试（查看终端显示的端口）

3. **提交更改** → `git commit -m "fix: 修复 i18n 中的拼写错误"`

4. **推送并打开 Pull Request**

5. 🎉 完成！我会尽快审核。

> 💡 *如果您是 GitHub 新手，请查看 [First Contributions](https://github.com/firstcontributions/first-contributions)。*

---

## 🧭 行为准则

保持友善、包容和建设性。

大家都在学习 — 帮助他人与您一起成长。❤️

---

## 💡 贡献方式

- 🐛 **报告 Bug** — 通过 [Issues](https://github.com/diandiancha/LittleAIBox/issues)
- ✨ **建议功能** — 欢迎新的想法或改进
- 📝 **改进文档** — 修复拼写错误、添加示例
- 🌍 **翻译 UI** — 帮助让 LittleAIBox 在全球可访问
- 🔧 **提交代码** — Bug 修复、重构、新功能
- 🏗️ **协助重构代码** — 一起改进代码库结构

---

## 🧑‍💻 开发环境设置

**要求**
- Node.js ≥ 18
- npm ≥ 9
- Git（最新版）
- VS Code（推荐）

**本地启动**

```bash
npm install
npm run dev
```

**生产构建**

```bash
npm run build
```

**移动端测试（可选）**

```bash
npx cap add android
npx cap sync
npx cap open android
```

---

## 🧩 项目结构

```
LittleAIBox/
├── src/                    # 源代码
│   ├── main.js            # 主应用逻辑
│   ├── api-config.js      # API 配置
│   ├── db.js              # IndexedDB 封装
│   ├── i18n.js            # 国际化
│   ├── mermaid-renderer.js # 图表渲染
│   ├── floating-timeline.js # 浮动时间轴导航
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
├── package.json            # 依赖和脚本
└── index.html              # 主 HTML 入口点
```

---

## 🧾 提交与代码风格（中高级贡献者）

### 💬 约定式提交

```
<type>(<scope>): <description>
```

**常见类型**
- `feat` — 新功能
- `fix` — 修复 Bug
- `docs` — 文档
- `style` — 代码格式
- `refactor` — 非破坏性重构
- `perf` — 性能优化
- `test` — 测试相关

**示例**

```bash
feat(i18n): 添加葡萄牙语翻译
fix(file): 处理 PDF 解析错误
docs(readme): 更新安装说明
refactor(rag): 优化分块算法
```

### 🧱 代码规范

- 使用 **ES6+** 特性
- 优先使用 `async/await`
- 使用 `const` 和 `let`（避免 `var`）
- 需要时使用 JSDoc 编写清晰的注释
- 保持函数简短和专注

### 📝 代码示例

```javascript
// 好的做法
async function handleFileUpload(file) {
  if (!file) return;
  
  const isValid = validateFile(file);
  if (!isValid) {
    showToast('无效的文件格式');
    return;
  }
  
  try {
    const content = await parseFile(file);
    await processContent(content);
  } catch (error) {
    console.error('处理文件时出错:', error);
    showToast('处理文件失败');
  }
}
```

---

## 🔄 Pull Request 流程

1. **同步您的 fork**
   ```bash
   git fetch upstream
   git merge upstream/main
   ```

2. **创建分支**
   ```bash
   git checkout -b feature/我的功能
   ```

3. **测试更改** — 如果可能，在多个浏览器中测试

4. **推送并打开 PR**

**Pull Request 模板**

```markdown
## 描述
这次更改做了什么以及为什么。

## 类型
- [ ] Bug 修复
- [ ] 新功能
- [ ] 文档
- [ ] 翻译

## 测试
如何测试这些更改：
1. 步骤一
2. 步骤二

## 检查清单
- [ ] 代码遵循风格指南
- [ ] 已测试并正常工作
- [ ] 无新警告
- [ ] 已更新文档
```

---

## 🐛 报告 Bug

提交前：
1. 搜索现有 [Issues](https://github.com/diandiancha/LittleAIBox/issues)
2. 检查浏览器控制台错误
3. 尝试在不同浏览器/设备上复现

**Bug 报告模板**

```markdown
**描述 Bug**
Bug 的清晰描述。

**复现步骤**
复现步骤：
1. 进入 '...'
2. 点击 '....'
3. 看到错误

**预期行为**
您期望发生的事情。

**环境**
- OS: [例如 Windows 11]
- Browser: [例如 Chrome 120]
- Device: [例如 桌面端、移动端]
- Version: [例如 2.3.1]
```

---

## 💡 建议功能

建议前考虑：
- 是否符合项目愿景（隐私优先、本地处理）？
- 作为纯客户端功能是否可行？
- 是否能让许多用户受益？

**功能请求模板**

```markdown
**功能摘要**
提议功能的简要描述。

**问题说明**
它解决了什么问题？谁受益？

**提议解决方案**
这个功能如何工作？

**考虑的替代方案**
您考虑过哪些其他方法？
```

---

## 🌐 翻译

支持的语言：
- 🇨🇳 简体中文 (zh-CN)
- 🇹🇼 繁体中文 (zh-TW)
- 🇬🇧 英语 (en)
- 🇯🇵 日语 (ja)
- 🇰🇷 韩语 (ko)

**添加新语言**

```bash
cp public/locales/en.json public/locales/您的语言.json
```

编辑值，保持键相同，然后在 `src/i18n.js` 中添加您的语言代码：

```javascript
const SUPPORTED_LANGUAGES = ['zh-CN', 'en', 'ja', 'ko', 'zh-TW', '您的语言'];
```

测试：`npm run dev` → 在设置中切换到您的语言 → 验证所有 UI 元素已翻译。

---

## 🆘 需要帮助？

- 阅读 [README](README.zh-CN.md)
- 查看 [Issues](https://github.com/diandiancha/LittleAIBox/issues)
- 在 [Discussions](https://github.com/diandiancha/LittleAIBox/discussions) 中提问
- 打开带有 `question` 标签的 Issue

请耐心等待 — 我是学生，时间有限。🙏

---

## 🎓 学习资源

开源或 Web 开发新手？

**通用**
- [GitHub Flow](https://guides.github.com/introduction/flow/)
- [如何为开源做贡献](https://opensource.guide/how-to-contribute/)
- [First Contributions](https://github.com/firstcontributions/first-contributions)

**使用的技术**
- [Vanilla JavaScript](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript)
- [Vite](https://vitejs.dev/)
- [Capacitor](https://capacitorjs.com/docs)
- [IndexedDB](https://developer.mozilla.org/zh-CN/docs/Web/API/IndexedDB_API)
- [Service Workers](https://developer.mozilla.org/zh-CN/docs/Web/API/Service_Worker_API)

**代码质量与重构**
- [Refactoring.guru](https://refactoring.guru/) — 重构模式学习
- [Clean Code](https://github.com/ryanmcdermott/clean-code-javascript) — JavaScript 最佳实践
- [模块化](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Modules) — ES 模块指南

---

## 🙌 致谢

所有贡献者都列在 **Contributors 页面**并在**发布说明**中介绍。

感谢您让 LittleAIBox 变得更好！🚀

---

**记住**：作为学生开发者，我真心感谢您的贡献和耐心。让我们一起构建一些了不起的东西！💪

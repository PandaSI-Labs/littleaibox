"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const markmapCommon = require("markmap-common");
const markmapHtmlParser = require("markmap-html-parser");
const MarkdownIt = require("markdown-it");
const md_ins = require("markdown-it-ins");
const md_mark = require("markdown-it-mark");
const md_sub = require("markdown-it-sub");
const md_sup = require("markdown-it-sup");
const plugins = require("./plugins.js");
function initializeMarkdownIt() {
  const md = MarkdownIt({
    html: true,
    breaks: true
  });
  md.use(md_ins).use(md_mark).use(md_sub).use(md_sup);
  return md;
}
function patchJSItem(urlBuilder, item) {
  if (item.type === "script" && item.data.src) {
    return {
      ...item,
      data: {
        ...item.data,
        src: urlBuilder.getFullUrl(item.data.src)
      }
    };
  }
  return item;
}
function patchCSSItem(urlBuilder, item) {
  if (item.type === "stylesheet" && item.data.href) {
    return {
      ...item,
      data: {
        ...item.data,
        href: urlBuilder.getFullUrl(item.data.href)
      }
    };
  }
  return item;
}
const builtInPlugins = plugins.plugins;
function cleanNode(node) {
  while (!node.content && node.children.length === 1) {
    node = node.children[0];
  }
  while (node.children.length === 1 && !node.children[0].content) {
    node = {
      ...node,
      children: node.children[0].children
    };
  }
  return {
    ...node,
    children: node.children.map(cleanNode)
  };
}
class Transformer {
  constructor(plugins$1 = builtInPlugins) {
    this.assetsMap = {};
    this.urlBuilder = new markmapCommon.UrlBuilder();
    this.hooks = plugins.createTransformHooks(this);
    this.plugins = plugins$1.map(
      (plugin) => typeof plugin === "function" ? plugin() : plugin
    );
    const assetsMap = {};
    for (const { name, transform } of this.plugins) {
      assetsMap[name] = transform(this.hooks);
    }
    this.assetsMap = assetsMap;
    const md = initializeMarkdownIt();
    this.md = md;
    this.hooks.parser.call(md);
  }
  transform(content, fallbackParserOptions) {
    var _a;
    const context = {
      content,
      features: {},
      parserOptions: fallbackParserOptions
    };
    this.hooks.beforeParse.call(this.md, context);
    let { content: rawContent } = context;
    if (context.frontmatterInfo)
      rawContent = rawContent.slice(context.frontmatterInfo.offset);
    const html = this.md.render(rawContent, {});
    this.hooks.afterParse.call(this.md, context);
    const root = cleanNode(markmapHtmlParser.buildTree(html, context.parserOptions));
    root.content || (root.content = `${((_a = context.frontmatter) == null ? void 0 : _a.title) || ""}`);
    return { ...context, root };
  }
  resolveJS(item) {
    return patchJSItem(this.urlBuilder, item);
  }
  resolveCSS(item) {
    return patchCSSItem(this.urlBuilder, item);
  }
  /**
   * Get all assets from enabled plugins or filter them by plugin names as keys.
   */
  getAssets(keys) {
    const styles = [];
    const scripts = [];
    keys ?? (keys = this.plugins.map((plugin) => plugin.name));
    for (const assets of keys.map((key) => this.assetsMap[key])) {
      if (assets) {
        if (assets.styles) styles.push(...assets.styles);
        if (assets.scripts) scripts.push(...assets.scripts);
      }
    }
    return {
      styles: styles.map((item) => this.resolveCSS(item)),
      scripts: scripts.map((item) => this.resolveJS(item))
    };
  }
  /**
   * Get used assets by features object returned by `transform`.
   */
  getUsedAssets(features) {
    const keys = this.plugins.map((plugin) => plugin.name).filter((name) => features[name]);
    return this.getAssets(keys);
  }
}
const transformerVersions = {
  "markmap-lib": "0.18.12"
};
exports.Transformer = Transformer;
exports.builtInPlugins = builtInPlugins;
exports.patchCSSItem = patchCSSItem;
exports.patchJSItem = patchJSItem;
exports.transformerVersions = transformerVersions;

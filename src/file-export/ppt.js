const SLIDE_LAYOUT = 'LAYOUT_WIDE';
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN_X = 0.6;
const MARGIN_Y = 0.5;
const TITLE_FONT_SIZE = 30;
const BODY_FONT_SIZE = 18;
const CODE_FONT_SIZE = 14;
const BODY_LINE_HEIGHT = 1.25;
const CODE_LINE_HEIGHT = 1.25;
const FONT_BODY_LATIN = 'Times New Roman';
const FONT_BODY_CJK = 'SimSun';
const FONT_HEADING_CJK = 'SimHei';
const FONT_CODE = 'Consolas';
const QUOTE_LATIN_FONT = 'Noto Serif Italic';
const CJK_BODY_ZH_CN = 'SimSun';
const CJK_HEADING_ZH_CN = 'SimHei';
const CJK_QUOTE_ZH_CN = 'Noto Serif CJK SC';
const CJK_BODY_ZH_TW = 'DFKai-SB';
const CJK_HEADING_ZH_TW = 'Microsoft JhengHei';
const CJK_QUOTE_ZH_TW = 'Noto Serif CJK TC';
const CJK_BODY_JA = 'MS Mincho';
const CJK_HEADING_JA = 'MS Gothic';
const CJK_QUOTE_JA = 'Noto Serif CJK JP';
const CJK_BODY_KO = 'Batang';
const CJK_HEADING_KO = 'Gulim';
const CJK_QUOTE_KO = 'Noto Serif CJK KR';
const COLOR_TEXT = '111111';

const CJK_REGEX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const IMAGE_SCALE = 2;
const DIAGRAM_EXPORT_MAX_SIZE = 2400;
const TABLE_IMAGE_SCALE = 3;
const TABLE_IMAGE_MAX_SIZE = 4096;
const WRAP_WIDTH_PADDING_IN = 0.35;
const LINE_HEIGHT_PADDING_RATIO = 1.5;
const INLINE_MATH_TOKEN_START = '\u0002';
const INLINE_MATH_TOKEN_END = '\u0003';
const IMAGE_MAX_W = SLIDE_W - MARGIN_X * 2;
const IMAGE_MAX_H = SLIDE_H - MARGIN_Y * 2;
const MIN_VALID_IMAGE_DIMENSION = 30;
const MIN_VALID_AREA = 2000;
const MIN_ASPECT_RATIO = 0.1;
const MAX_ASPECT_RATIO = 10;

function getEffectiveLineHeight(lineHeight) {
    return lineHeight * LINE_HEIGHT_PADDING_RATIO;
}

const LANGUAGE_FONT_MAP = {
    'zh-cn': {
        bodyLatin: FONT_BODY_LATIN,
        bodyCjk: CJK_BODY_ZH_CN,
        headingCjk: CJK_HEADING_ZH_CN,
        quoteCjk: CJK_QUOTE_ZH_CN,
        quoteLatin: QUOTE_LATIN_FONT
    },
    'zh-tw': {
        bodyLatin: FONT_BODY_LATIN,
        bodyCjk: CJK_BODY_ZH_TW,
        headingCjk: CJK_HEADING_ZH_TW,
        quoteCjk: CJK_QUOTE_ZH_TW,
        quoteLatin: QUOTE_LATIN_FONT
    },
    ja: {
        bodyLatin: FONT_BODY_LATIN,
        bodyCjk: CJK_BODY_JA,
        headingCjk: CJK_HEADING_JA,
        quoteCjk: CJK_QUOTE_JA,
        quoteLatin: QUOTE_LATIN_FONT
    },
    ko: {
        bodyLatin: FONT_BODY_LATIN,
        bodyCjk: CJK_BODY_KO,
        headingCjk: CJK_HEADING_KO,
        quoteCjk: CJK_QUOTE_KO,
        quoteLatin: QUOTE_LATIN_FONT
    },
    en: {
        bodyLatin: FONT_BODY_LATIN,
        bodyCjk: FONT_BODY_CJK,
        headingCjk: FONT_HEADING_CJK,
        quoteLatin: QUOTE_LATIN_FONT,
        quoteCjk: FONT_BODY_CJK
    },
    fr: {
        bodyLatin: FONT_BODY_LATIN,
        bodyCjk: FONT_BODY_CJK,
        headingCjk: FONT_HEADING_CJK,
        quoteLatin: QUOTE_LATIN_FONT,
        quoteCjk: FONT_BODY_CJK
    },
    es: {
        bodyLatin: FONT_BODY_LATIN,
        bodyCjk: FONT_BODY_CJK,
        headingCjk: FONT_HEADING_CJK,
        quoteLatin: QUOTE_LATIN_FONT,
        quoteCjk: FONT_BODY_CJK
    }
};

function resolveLocaleKey(locale) {
    if (!locale) return 'en';
    const normalized = String(locale).toLowerCase();
    if (normalized === 'zh-cn' || normalized === 'zh-hans') return 'zh-cn';
    if (normalized === 'zh-tw' || normalized === 'zh-hk' || normalized === 'zh-mo' || normalized === 'zh-hant') return 'zh-tw';
    if (normalized.startsWith('zh')) return 'zh-cn';
    if (normalized.startsWith('ja')) return 'ja';
    if (normalized.startsWith('ko')) return 'ko';
    if (normalized.startsWith('fr')) return 'fr';
    if (normalized.startsWith('es')) return 'es';
    return 'en';
}

function getActiveFontProfile(locale) {
    const key = resolveLocaleKey(locale);
    const profile = LANGUAGE_FONT_MAP[key] || LANGUAGE_FONT_MAP.en;
    return {
        bodyLatin: profile.bodyLatin || FONT_BODY_LATIN,
        bodyCjk: profile.bodyCjk || FONT_BODY_CJK,
        headingCjk: profile.headingCjk || FONT_HEADING_CJK,
        quoteLatin: profile.quoteLatin || FONT_BODY_LATIN,
        quoteCjk: profile.quoteCjk || profile.bodyCjk || FONT_BODY_CJK
    };
}

function normalizeText(text) {
    if (!text) return '';
    return String(text).replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

function normalizeCode(text) {
    if (!text) return '';
    return String(text).replace(/\r\n/g, '\n').replace(/\s+$/gm, '').trim();
}

function extractKatexTex(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';
    const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
    if (annotation && annotation.textContent) return annotation.textContent;
    return node.textContent || '';
}

function isDiagramContainer(el) {
    if (!el || !el.classList) return false;
    return el.classList.contains('mermaid-render-container') || el.classList.contains('vega-lite-render-container');
}

function shouldSkipElement(el) {
    if (!el || !el.classList) return false;
    return el.classList.contains('mermaid-error-banner') ||
        el.classList.contains('vega-lite-error-banner') ||
        el.classList.contains('mermaid-render-toolbar') ||
        el.classList.contains('vega-lite-toolbar') ||
        el.classList.contains('mermaid-source-toggle') ||
        el.classList.contains('vega-lite-source-toggle');
}

function extractDiagramSource(element) {
    if (!element || !element.querySelector) return '';
    const mermaidSource = element.querySelector('pre.mermaid-source code');
    if (mermaidSource && mermaidSource.textContent) return mermaidSource.textContent;
    const vegaSource = element.querySelector('pre.vega-lite-source code');
    if (vegaSource && vegaSource.textContent) return vegaSource.textContent;
    return '';
}

function isCjkChar(char) {
    if (!char) return false;
    return CJK_REGEX.test(char);
}

function tokenizeText(text) {
    const tokens = [];
    let buffer = '';
    let bufferType = null;

    const flush = () => {
        if (buffer) {
            tokens.push(buffer);
            buffer = '';
            bufferType = null;
        }
    };

    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];

        if (ch === INLINE_MATH_TOKEN_START) {
            flush();
            const endIndex = text.indexOf(INLINE_MATH_TOKEN_END, i + 1);
            if (endIndex !== -1) {
                const mathText = text.slice(i + 1, endIndex);
                if (mathText) tokens.push(mathText);
                i = endIndex;
                continue;
            }
        }

        if (ch === '\n') {
            flush();
            tokens.push('\n');
            continue;
        }

        if (/\s/.test(ch)) {
            if (bufferType === 'latin' || bufferType === 'cjk') {
                buffer += ch;
                continue;
            }
            if (bufferType === 'space') {
                buffer += ch;
                continue;
            }
            flush();
            buffer = ch;
            bufferType = 'space';
            continue;
        }

        if (isCjkChar(ch)) {
            if (bufferType === 'cjk') {
                buffer += ch;
                continue;
            }
            flush();
            buffer = ch;
            bufferType = 'cjk';
            continue;
        }

        if (bufferType === 'latin') {
            buffer += ch;
            continue;
        }
        flush();
        buffer = ch;
        bufferType = 'latin';
    }

    flush();
    return tokens;
}

function getMeasureContext(fontFace, fontSize) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontSize}px ${fontFace}`;
    return ctx;
}

function measureTextWidth(ctx, text) {
    return ctx.measureText(text).width;
}

function pxToInches(px) {
    return px / 96;
}

function measureTextWidthByScript(text, { latinFont, cjkFont, fontSizePt }) {
    const fontSizePx = fontSizePt * (96 / 72);
    let width = 0;
    let buffer = '';
    let bufferIsCjk = null;
    const flush = () => {
        if (!buffer) return;
        const fontFace = bufferIsCjk ? cjkFont : latinFont;
        const ctx = getMeasureContext(fontFace, fontSizePx);
        width += measureTextWidth(ctx, buffer);
        buffer = '';
        bufferIsCjk = null;
    };
    for (const ch of text) {
        const isCjk = isCjkChar(ch);
        if (bufferIsCjk === null) {
            bufferIsCjk = isCjk;
            buffer = ch;
            continue;
        }
        if (bufferIsCjk === isCjk) {
            buffer += ch;
            continue;
        }
        flush();
        bufferIsCjk = isCjk;
        buffer = ch;
    }
    flush();
    return width;
}

function wrapTextLines(text, maxWidthIn, options) {
    const safeWidthIn = Math.max(0.2, maxWidthIn - WRAP_WIDTH_PADDING_IN);
    const tokens = tokenizeText(text);
    const lines = [];
    let line = '';

    tokens.forEach((token) => {
        if (token === '\n') {
            lines.push(line.trimEnd());
            line = '';
            return;
        }

        if (!line && /^\s+$/.test(token)) {
            return;
        }

        const candidate = line + token;
        const widthIn = pxToInches(measureTextWidthByScript(candidate, options));

        if (widthIn <= safeWidthIn || !line.trim()) {
            line = candidate;
            return;
        }

        const trimmed = line.trimEnd();
        if (trimmed) lines.push(trimmed);
        line = token.trimStart();
    });

    const remaining = line.trimEnd();
    if (remaining) lines.push(remaining);

    return lines;
}

function getSvgDimensions(svgEl) {
    if (!svgEl) return { width: 800, height: 600 };
    const viewBox = svgEl.viewBox && svgEl.viewBox.baseVal;
    if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
        return { width: viewBox.width, height: viewBox.height };
    }
    const widthAttr = parseFloat(svgEl.getAttribute('width'));
    const heightAttr = parseFloat(svgEl.getAttribute('height'));
    if (Number.isFinite(widthAttr) && Number.isFinite(heightAttr) && widthAttr > 0 && heightAttr > 0) {
        return { width: widthAttr, height: heightAttr };
    }
    const rect = typeof svgEl.getBoundingClientRect === 'function' ? svgEl.getBoundingClientRect() : null;
    if (rect && rect.width > 0 && rect.height > 0) {
        return { width: rect.width, height: rect.height };
    }
    return { width: 800, height: 600 };
}

function inlineComputedStyles(sourceSvg, targetSvg) {
    if (!sourceSvg || !targetSvg || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return;
    const relevant = [
        'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
        'color', 'text-align', 'text-decoration',
        'fill', 'stroke', 'stroke-width',
        'background-color', 'opacity',
        'display', 'visibility'
    ];
    const sourceNodes = [sourceSvg, ...sourceSvg.querySelectorAll('*')];
    const targetNodes = [targetSvg, ...targetSvg.querySelectorAll('*')];
    const count = Math.min(sourceNodes.length, targetNodes.length);
    for (let i = 0; i < count; i++) {
        const sourceNode = sourceNodes[i];
        const targetNode = targetNodes[i];
        if (sourceNode.closest && sourceNode.closest('defs')) continue;
        let computed;
        try {
            computed = window.getComputedStyle(sourceNode);
        } catch (_) {
            continue;
        }
        if (!computed) continue;
        let styleText = '';
        relevant.forEach((prop) => {
            const value = computed.getPropertyValue(prop);
            if (value && value !== 'auto' && value !== 'normal' && value !== '0px' && value !== 'rgba(0, 0, 0, 0)') {
                styleText += `${prop}:${value};`;
            }
        });
        if (styleText) {
            const existing = targetNode.getAttribute('style') || '';
            targetNode.setAttribute('style', `${existing};${styleText}`);
        }
    }
}

function serializeSvgForExport(svgEl) {
    const cloned = svgEl.cloneNode(true);
    const rect = typeof svgEl.getBoundingClientRect === 'function' ? svgEl.getBoundingClientRect() : null;
    if (rect && rect.width > 0 && rect.height > 0) {
        cloned.setAttribute('width', rect.width);
        cloned.setAttribute('height', rect.height);
        if (!cloned.hasAttribute('viewBox')) {
            cloned.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
        }
    }
    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    inlineComputedStyles(svgEl, cloned);
    const serializer = new XMLSerializer();
    return serializer.serializeToString(cloned);
}

async function svgToPngDataUrl(svgEl, scale = IMAGE_SCALE) {
    if (!svgEl) return null;
    const source = serializeSvgForExport(svgEl);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = svgUrl;
    });
    const { width, height } = getSvgDimensions(svgEl);
    const safeScale = Math.min(4, Math.max(1, scale));
    let targetWidth = Math.max(1, Math.round(width * safeScale));
    let targetHeight = Math.max(1, Math.round(height * safeScale));
    const maxSize = Math.max(1, DIAGRAM_EXPORT_MAX_SIZE);
    if (targetWidth > maxSize || targetHeight > maxSize) {
        const ratio = Math.min(maxSize / targetWidth, maxSize / targetHeight);
        targetWidth = Math.max(1, Math.round(targetWidth * ratio));
        targetHeight = Math.max(1, Math.round(targetHeight * ratio));
    }
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}

function findDiagramSvg(container) {
    if (!container || !container.querySelectorAll) return null;
    const svgEls = Array.from(container.querySelectorAll('svg'));
    if (!svgEls.length) return null;
    const filtered = svgEls.filter(svg => !svg.closest('.mermaid-render-toolbar') && !svg.closest('.vega-lite-toolbar'));
    if (filtered.length) return filtered[0];
    return svgEls[0];
}

function clampImageSize(widthPx, heightPx, maxWIn, maxHIn) {
    if (!widthPx || !heightPx) {
        return { width: maxWIn, height: maxHIn * 0.7 };
    }
    const wIn = pxToInches(widthPx);
    const hIn = pxToInches(heightPx);
    const ratio = Math.min(1, maxWIn / wIn, maxHIn / hIn);
    return { width: wIn * ratio, height: hIn * ratio };
}

function sanitizeNode(node) {
    if (!node || typeof node.cloneNode !== 'function') return node;
    const clone = node.cloneNode(true);
    clone.querySelectorAll?.('script, iframe, object, embed').forEach((el) => el.remove());
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        clone.innerHTML = window.DOMPurify.sanitize(clone.innerHTML, { USE_PROFILES: { html: true } });
    }
    return clone;
}

function getExportFilter() {
    return (node) => {
        if (!node) return false;
        if (node.nodeType !== Node.ELEMENT_NODE) return true;
        const el = node;
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (tag === 'script' || tag === 'iframe' || tag === 'object' || tag === 'embed') return false;
        if (shouldSkipElement(el)) return false;
        return true;
    };
}

function createOffscreenHost() {
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-9999px';
    host.style.top = '-9999px';
    host.style.pointerEvents = 'none';
    host.style.opacity = '0';
    host.style.zIndex = '-1';
    return host;
}

async function elementToDataUrl(element, { background = '#ffffff', pixelRatio = IMAGE_SCALE } = {}) {
    if (!window.htmlToImage || typeof window.htmlToImage.toPng !== 'function') return null;
    if (!element) return null;
    const filter = getExportFilter();

    const size = getElementSize(element, { width: 200, height: 100 });
    const renderWidth = Math.ceil(size.width) + 8;
    const renderHeight = Math.ceil(size.height) + 8;

    try {
        const direct = await window.htmlToImage.toPng(element, {
            cacheBust: true,
            backgroundColor: background,
            pixelRatio,
            filter,
            width: renderWidth,
            height: renderHeight,
            style: {
                overflow: 'visible',
                margin: '0',
                padding: '4px'
            }
        });
        if (direct) return direct;
    } catch (_) {
    }

    const clone = sanitizeNode(element);
    if (!clone || clone === element) return null;

    try {
        const computedStyle = window.getComputedStyle(element);
        clone.style.font = computedStyle.font;
        clone.style.fontSize = computedStyle.fontSize;
        clone.style.fontFamily = computedStyle.fontFamily;
        clone.style.lineHeight = computedStyle.lineHeight;
        clone.style.letterSpacing = computedStyle.letterSpacing;
    } catch (_) { }

    clone.style.display = 'inline-block';
    clone.style.overflow = 'visible';
    clone.style.width = `${renderWidth}px`;
    clone.style.minWidth = `${renderWidth}px`;

    const host = createOffscreenHost();
    host.style.width = `${renderWidth + 50}px`;
    host.style.height = `${renderHeight + 50}px`;
    host.style.background = background;
    host.appendChild(clone);
    document.body.appendChild(host);

    await new Promise(resolve => setTimeout(resolve, 30));

    try {
        return await window.htmlToImage.toPng(clone, {
            cacheBust: true,
            backgroundColor: background,
            pixelRatio,
            filter,
            width: renderWidth,
            height: renderHeight,
            style: {
                overflow: 'visible'
            }
        });
    } catch (_) {
        return null;
    } finally {
        host.remove();
    }
}

async function svgToDataUrl(svgEl) {
    if (!svgEl) return null;
    try {
        const dataUrl = await svgToPngDataUrl(svgEl, IMAGE_SCALE);
        if (dataUrl) return dataUrl;
    } catch (_) { }
    const { width, height } = getSvgDimensions(svgEl);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * IMAGE_SCALE));
    canvas.height = Math.max(1, Math.round(height * IMAGE_SCALE));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const svgText = serializeSvgForExport(svgEl);
    if (window.Canvg && typeof window.Canvg.fromString === 'function') {
        const renderer = window.Canvg.fromString(ctx, svgText, { ignoreDimensions: true, ignoreClear: true });
        await renderer.render();
        return canvas.toDataURL('image/png');
    }
    return elementToDataUrl(svgEl, { pixelRatio: IMAGE_SCALE });
}

async function imageSrcToDataUrl(src) {
    if (!src) return null;
    if (src.startsWith('data:')) return src;
    try {
        const response = await fetch(src, { credentials: 'include' });
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (_) {
        return null;
    }
}

function pickImageSrc(imageEl) {
    if (!imageEl) return '';
    const direct = imageEl.currentSrc || imageEl.getAttribute('src') || imageEl.getAttribute('data-src')
        || imageEl.getAttribute('data-original') || imageEl.getAttribute('data-url');
    if (direct) return direct;
    const srcset = imageEl.getAttribute('srcset');
    if (!srcset) return '';
    const first = srcset.split(',')[0] || '';
    return first.trim().split(' ')[0];
}

async function imageElementToDataUrl(imageEl) {
    const src = pickImageSrc(imageEl);
    let dataUrl = await imageSrcToDataUrl(src);
    if (!dataUrl && imageEl) {
        dataUrl = await elementToDataUrl(imageEl, { background: '#ffffff' });
    }
    return dataUrl;
}

function getElementSize(element, fallback = { width: 800, height: 450 }) {
    if (!element) return fallback;

    let maxWidth = 0;
    let maxHeight = 0;

    const rect = element.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
        maxWidth = Math.max(maxWidth, rect.width);
        maxHeight = Math.max(maxHeight, rect.height);
    }

    if (typeof element.scrollWidth === 'number' && typeof element.scrollHeight === 'number') {
        if (element.scrollWidth > 0 && element.scrollHeight > 0) {
            maxWidth = Math.max(maxWidth, element.scrollWidth);
            maxHeight = Math.max(maxHeight, element.scrollHeight);
        }
    }

    if (typeof element.offsetWidth === 'number' && typeof element.offsetHeight === 'number') {
        if (element.offsetWidth > 0 && element.offsetHeight > 0) {
            maxWidth = Math.max(maxWidth, element.offsetWidth);
            maxHeight = Math.max(maxHeight, element.offsetHeight);
        }
    }

    if (typeof element.naturalWidth === 'number' && typeof element.naturalHeight === 'number') {
        if (element.naturalWidth > 0 && element.naturalHeight > 0) {
            maxWidth = Math.max(maxWidth, element.naturalWidth);
            maxHeight = Math.max(maxHeight, element.naturalHeight);
        }
    }

    if (element.querySelectorAll) {
        const allChildren = element.querySelectorAll('*');
        for (const child of allChildren) {
            const childRect = child.getBoundingClientRect?.();
            if (childRect && childRect.width > 0 && childRect.height > 0) {
                if (rect) {
                    const childRight = childRect.right - rect.left;
                    const childBottom = childRect.bottom - rect.top;
                    maxWidth = Math.max(maxWidth, childRight);
                    maxHeight = Math.max(maxHeight, childBottom);
                }
            }
        }
    }

    if (maxWidth > 0 && maxHeight > 0) {
        return {
            width: Math.ceil(maxWidth) + 4,
            height: Math.ceil(maxHeight) + 4
        };
    }

    return fallback;
}

function isValidImageCapture(dataUrl, width, height) {
    if (!dataUrl || typeof dataUrl !== 'string') return false;
    if (!dataUrl.startsWith('data:image/')) return false;

    if (width < MIN_VALID_IMAGE_DIMENSION || height < MIN_VALID_IMAGE_DIMENSION) {
        return false;
    }

    const area = width * height;
    if (area < MIN_VALID_AREA) {
        return false;
    }

    const aspectRatio = width / height;
    if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) {
        return false;
    }

    if (dataUrl.length < 500) {
        return false;
    }

    return true;
}

function isKatexLineElement(element) {
    if (!element || !element.classList) return false;
    const lineClasses = ['vlist', 'frac-line', 'sqrt-line', 'overline-line', 'underline-line', 'hline', 'rule'];
    for (const cls of lineClasses) {
        if (element.classList.contains(cls)) return true;
    }
    const tag = element.tagName?.toLowerCase() || '';
    if (tag === 'hr' || tag === 'line') return true;
    const style = element.style;
    if (style) {
        const h = parseFloat(style.height) || 0;
        const w = parseFloat(style.width) || 0;
        if ((h > 0 && h < 5) || (w > 0 && w < 5)) {
            const rect = element.getBoundingClientRect?.();
            if (rect && (rect.height < 5 || rect.width < 5)) return true;
        }
    }
    const rect = element.getBoundingClientRect?.();
    if (rect) {
        if (rect.width > 10 && rect.height < 8) return true;
        if (rect.height > 10 && rect.width < 8) return true;
    }
    return false;
}

function collectInlineText(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node;
    if (shouldSkipElement(el) || isDiagramContainer(el)) return '';
    if (el.classList.contains('katex-display')) return '';
    if (el.classList.contains('katex')) {
        const tex = extractKatexTex(el);
        return tex ? `${INLINE_MATH_TOKEN_START}${tex}${INLINE_MATH_TOKEN_END}` : '';
    }
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') return '\n';
    let text = '';
    for (const child of Array.from(el.childNodes || [])) {
        text += collectInlineText(child);
    }
    return text;
}

function collectDisplayMathSegments(node, segments) {
    if (!node) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        if (el.classList && el.classList.contains('katex-display')) {
            segments.push({ type: 'display', element: el });
            return;
        }
        if (el.querySelector && el.querySelector('.katex-display')) {
            el.childNodes.forEach(child => collectDisplayMathSegments(child, segments));
            return;
        }
    }
    segments.push({ type: 'node', node });
}

async function buildKatexImageBlock(element) {
    if (!element) return null;

    if (isKatexLineElement(element)) {
        return null;
    }

    const size = getElementSize(element, { width: 800, height: 240 });

    if (size.width < MIN_VALID_IMAGE_DIMENSION || size.height < MIN_VALID_IMAGE_DIMENSION) {
        return null;
    }

    const area = size.width * size.height;
    if (area < MIN_VALID_AREA) {
        return null;
    }

    const aspectRatio = size.width / size.height;
    if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) {
        return null;
    }

    const textContent = element.textContent?.trim() || '';
    if (textContent.length === 0) {
        const hasSvg = element.querySelector('svg');
        const hasImg = element.querySelector('img');
        if (!hasSvg && !hasImg) {
            return null;
        }
    }

    const dataUrl = await elementToDataUrl(element, { background: '#ffffff', pixelRatio: IMAGE_SCALE });
    if (!dataUrl) return null;

    if (!isValidImageCapture(dataUrl, size.width, size.height)) {
        return null;
    }

    return { type: 'image', dataUrl, width: size.width, height: size.height };
}

async function buildParagraphBlocksWithDisplayMath(element) {
    const segments = [];
    element.childNodes.forEach(child => collectDisplayMathSegments(child, segments));
    const blocks = [];
    let buffer = '';
    const flush = () => {
        const text = normalizeText(buffer);
        if (text) blocks.push({ type: 'paragraph', text });
        buffer = '';
    };
    for (const segment of segments) {
        if (segment.type === 'display') {
            flush();
            const imageBlock = await buildKatexImageBlock(segment.element);
            if (imageBlock) {
                blocks.push(imageBlock);
                continue;
            }
            const tex = normalizeText(extractKatexTex(segment.element));
            if (tex) blocks.push({ type: 'paragraph', text: tex });
            continue;
        }
        if (segment.node) {
            buffer += collectInlineText(segment.node);
        }
    }
    flush();
    return blocks;
}

async function tableToDataUrl(element) {
    const table = element && element.tagName && element.tagName.toLowerCase() === 'table'
        ? element
        : element?.querySelector?.('table');
    if (!table || !window.htmlToImage || typeof window.htmlToImage.toPng !== 'function') {
        return { dataUrl: null, width: 0, height: 0 };
    }
    const padding = 16;
    const tableSize = getElementSize(table, { width: 800, height: 450 });
    const wrapperWidth = element?.scrollWidth || 0;
    const wrapperHeight = element?.scrollHeight || 0;

    let totalHeight = 0;
    let maxRowWidth = 0;
    const rows = table.querySelectorAll('tr');
    for (const row of rows) {
        const rowRect = row.getBoundingClientRect();
        if (rowRect.height > 0) {
            totalHeight += rowRect.height;
        }
        if (rowRect.width > maxRowWidth) {
            maxRowWidth = rowRect.width;
        }
    }

    const tableBody = table.querySelector('tbody');
    const tableHead = table.querySelector('thead');
    const tableFoot = table.querySelector('tfoot');
    let bodyHeight = 0;
    if (tableBody) {
        const bodyRect = tableBody.getBoundingClientRect();
        bodyHeight = bodyRect.height || 0;
    }
    if (tableHead) {
        const headRect = tableHead.getBoundingClientRect();
        bodyHeight += headRect.height || 0;
    }
    if (tableFoot) {
        const footRect = tableFoot.getBoundingClientRect();
        bodyHeight += footRect.height || 0;
    }

    const contentWidth = Math.max(tableSize.width, table.scrollWidth || 0, wrapperWidth, maxRowWidth, table.offsetWidth || 0);
    const contentHeight = Math.max(tableSize.height, table.scrollHeight || 0, wrapperHeight, totalHeight, bodyHeight, table.offsetHeight || 0);

    const renderWidth = Math.ceil(contentWidth + padding * 2) + 20;
    const renderHeight = Math.ceil(contentHeight + padding * 2) + 20;

    const clone = table.cloneNode(true);
    clone.style.width = `${Math.ceil(contentWidth)}px`;
    clone.style.minWidth = `${Math.ceil(contentWidth)}px`;
    clone.style.maxWidth = 'none';
    clone.style.tableLayout = 'auto';
    clone.style.borderCollapse = 'collapse';
    clone.style.overflow = 'visible';

    const clonedCells = clone.querySelectorAll('td, th');
    for (const cell of clonedCells) {
        cell.style.overflow = 'visible';
        cell.style.whiteSpace = 'normal';
        cell.style.wordWrap = 'break-word';
    }

    const wrapper = document.createElement('div');
    wrapper.style.display = 'inline-block';
    wrapper.style.background = '#ffffff';
    wrapper.style.padding = `${padding}px`;
    wrapper.style.overflow = 'visible';
    wrapper.style.width = `${renderWidth}px`;
    wrapper.style.minWidth = `${renderWidth}px`;
    wrapper.style.height = `${renderHeight}px`;
    wrapper.style.minHeight = `${renderHeight}px`;
    wrapper.appendChild(clone);

    const host = createOffscreenHost();
    host.style.width = `${renderWidth + 100}px`;
    host.style.height = `${renderHeight + 100}px`;
    host.appendChild(wrapper);
    document.body.appendChild(host);

    await new Promise(resolve => setTimeout(resolve, 50));

    try {
        const filter = getExportFilter();
        const pixelRatio = Math.max(1, Math.min(TABLE_IMAGE_SCALE, TABLE_IMAGE_MAX_SIZE / Math.max(renderWidth, renderHeight)));
        const dataUrl = await window.htmlToImage.toPng(wrapper, {
            cacheBust: true,
            backgroundColor: '#ffffff',
            pixelRatio,
            filter,
            width: renderWidth,
            height: renderHeight,
            style: {
                overflow: 'visible'
            }
        });

        if (!isValidImageCapture(dataUrl, renderWidth, renderHeight)) {
            return { dataUrl: null, width: renderWidth, height: renderHeight };
        }

        return { dataUrl, width: renderWidth, height: renderHeight };
    } catch (_) {
        return { dataUrl: null, width: renderWidth, height: renderHeight };
    } finally {
        host.remove();
    }
}

async function extractBlocksFromElement(root) {
    const blocks = [];
    if (!root) return blocks;

    const walk = async (node) => {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) {
            const text = normalizeText(node.textContent || '');
            if (text) {
                blocks.push({ type: 'paragraph', text });
            }
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const el = node;
        if (shouldSkipElement(el)) return;

        if (isDiagramContainer(el)) {
            const svg = findDiagramSvg(el);
            if (svg) {
                const dataUrl = await svgToDataUrl(svg);
                if (dataUrl) {
                    const { width, height } = getSvgDimensions(svg);
                    blocks.push({ type: 'image', dataUrl, width, height });
                    return;
                }
            }
            const canvas = el.querySelector('canvas');
            if (canvas && typeof canvas.toDataURL === 'function') {
                const dataUrl = canvas.toDataURL('image/png');
                if (dataUrl) {
                    blocks.push({
                        type: 'image',
                        dataUrl,
                        width: canvas.width || 800,
                        height: canvas.height || 450
                    });
                    return;
                }
            }
            const fallbackDataUrl = await elementToDataUrl(el);
            if (fallbackDataUrl) {
                const size = getElementSize(el, { width: 800, height: 450 });
                blocks.push({
                    type: 'image',
                    dataUrl: fallbackDataUrl,
                    width: size.width || 800,
                    height: size.height || 450
                });
                return;
            }
            const code = normalizeCode(extractDiagramSource(el));
            if (code) blocks.push({ type: 'code', text: code });
            return;
        }

        if (el.classList.contains('katex-display')) {
            const imageBlock = await buildKatexImageBlock(el);
            if (imageBlock) {
                blocks.push(imageBlock);
                return;
            }
            const tex = normalizeText(extractKatexTex(el));
            if (tex) blocks.push({ type: 'paragraph', text: tex });
            return;
        }

        if (el.classList.contains('katex')) {
            const tex = normalizeText(extractKatexTex(el));
            if (tex) blocks.push({ type: 'paragraph', text: tex });
            return;
        }

        const tag = el.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) {
            const text = normalizeText(collectInlineText(el));
            if (text) blocks.push({ type: 'heading', text });
            return;
        }
        if (tag === 'pre') {
            const code = normalizeCode(el.textContent || '');
            if (code) blocks.push({ type: 'code', text: code });
            return;
        }
        if (tag === 'table' || el.classList.contains('table-wrapper')) {
            const snapshot = await tableToDataUrl(el);
            if (snapshot.dataUrl) {
                blocks.push({
                    type: 'image',
                    dataUrl: snapshot.dataUrl,
                    width: snapshot.width || 800,
                    height: snapshot.height || 450
                });
                return;
            }
            const tableEl = tag === 'table' ? el : el.querySelector('table');
            let dataUrl = await elementToDataUrl(el);
            if (!dataUrl && tableEl && tableEl !== el) {
                dataUrl = await elementToDataUrl(tableEl);
            }
            if (dataUrl) {
                const rect = getElementSize(tableEl || el, { width: 800, height: 450 });
                blocks.push({
                    type: 'image',
                    dataUrl,
                    width: rect.width || 800,
                    height: rect.height || 450
                });
                return;
            }
        }
        if (tag === 'ul' || tag === 'ol') {
            const listItems = Array.from(el.children || []).filter(child => {
                const childTag = child.tagName ? child.tagName.toLowerCase() : '';
                return childTag === 'li';
            });
            if (!listItems.length) return;
            const hasComplex = listItems.some(li => li.querySelector('.katex-display, img, svg, table, .table-wrapper, .mermaid-render-container, .vega-lite-render-container'));
            if (!hasComplex) {
                const items = listItems
                    .map(li => normalizeText(collectInlineText(li)))
                    .filter(Boolean);
                if (items.length) blocks.push({ type: 'list', items });
                return;
            }
            for (const li of listItems) {
                const text = normalizeText(collectInlineText(li));
                if (text) blocks.push({ type: 'list', items: [text] });

                const displayMath = Array.from(li.querySelectorAll('.katex-display'));
                for (const mathEl of displayMath) {
                    const imageBlock = await buildKatexImageBlock(mathEl);
                    if (imageBlock) {
                        blocks.push(imageBlock);
                        continue;
                    }
                    const tex = normalizeText(extractKatexTex(mathEl));
                    if (tex) blocks.push({ type: 'paragraph', text: tex });
                }

                const tables = Array.from(li.querySelectorAll('table, .table-wrapper')).filter((node) => {
                    if (node.classList && node.classList.contains('table-wrapper')) return true;
                    return !node.closest || !node.closest('.table-wrapper');
                });
                for (const tableEl of tables) {
                    const snapshot = await tableToDataUrl(tableEl);
                    if (snapshot.dataUrl) {
                        blocks.push({
                            type: 'image',
                            dataUrl: snapshot.dataUrl,
                            width: snapshot.width || 800,
                            height: snapshot.height || 450
                        });
                    }
                }

                const images = Array.from(li.querySelectorAll('img')).filter(img => !img.closest('.katex, .katex-display'));
                for (const img of images) {
                    const dataUrl = await imageElementToDataUrl(img);
                    if (dataUrl) {
                        const rect = getElementSize(img, { width: 800, height: 450 });
                        if (isValidImageCapture(dataUrl, rect.width, rect.height)) {
                            blocks.push({
                                type: 'image',
                                dataUrl,
                                width: rect.width || 800,
                                height: rect.height || 450
                            });
                        }
                    }
                }

                const svgs = Array.from(li.querySelectorAll('svg')).filter(svg => !svg.closest('.katex, .katex-display'));
                for (const svg of svgs) {
                    const { width, height } = getSvgDimensions(svg);
                    if (width < MIN_VALID_IMAGE_DIMENSION || height < MIN_VALID_IMAGE_DIMENSION) continue;
                    if (width * height < MIN_VALID_AREA) continue;
                    const aspectRatio = width / height;
                    if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) continue;
                    const dataUrl = await svgToDataUrl(svg);
                    if (dataUrl && isValidImageCapture(dataUrl, width, height)) {
                        blocks.push({ type: 'image', dataUrl, width, height });
                    }
                }

                const diagramContainers = Array.from(li.querySelectorAll('.mermaid-render-container, .vega-lite-render-container'));
                for (const container of diagramContainers) {
                    const svg = findDiagramSvg(container);
                    if (svg) {
                        const dataUrl = await svgToDataUrl(svg);
                        if (dataUrl) {
                            const { width, height } = getSvgDimensions(svg);
                            blocks.push({ type: 'image', dataUrl, width, height });
                            continue;
                        }
                    }
                    const fallbackDataUrl = await elementToDataUrl(container);
                    if (fallbackDataUrl) {
                        const size = getElementSize(container, { width: 800, height: 450 });
                        blocks.push({
                            type: 'image',
                            dataUrl: fallbackDataUrl,
                            width: size.width || 800,
                            height: size.height || 450
                        });
                    }
                }
            }
            return;
        }
        if (tag === 'p') {
            if (el.querySelector && el.querySelector('.katex-display')) {
                const paragraphBlocks = await buildParagraphBlocksWithDisplayMath(el);
                if (paragraphBlocks.length) {
                    blocks.push(...paragraphBlocks);
                }
                return;
            }
            const text = normalizeText(collectInlineText(el));
            if (text) blocks.push({ type: 'paragraph', text });
            return;
        }
        if (tag === 'blockquote') {
            if (el.querySelector && el.querySelector('.katex-display')) {
                const quoteBlocks = await buildParagraphBlocksWithDisplayMath(el);
                if (quoteBlocks.length) {
                    quoteBlocks.forEach((block) => {
                        if (block.type === 'paragraph') {
                            blocks.push({ type: 'quote', text: block.text });
                        } else {
                            blocks.push(block);
                        }
                    });
                }
                return;
            }
            const text = normalizeText(collectInlineText(el));
            if (text) blocks.push({ type: 'quote', text });
            return;
        }
        if (tag === 'img') {
            if (el.closest && el.closest('.katex, .katex-display')) {
                return;
            }
            const dataUrl = await imageElementToDataUrl(el);
            if (dataUrl) {
                const rect = getElementSize(el, { width: 800, height: 450 });
                if (isValidImageCapture(dataUrl, rect.width, rect.height)) {
                    blocks.push({
                        type: 'image',
                        dataUrl,
                        width: rect.width || 800,
                        height: rect.height || 450
                    });
                    return;
                }
            }
            const alt = normalizeText(el.getAttribute('alt') || '') || 'image';
            blocks.push({ type: 'paragraph', text: `[${alt}]` });
            return;
        }
        if (tag === 'svg') {
            if (el.closest && el.closest('.katex, .katex-display')) {
                return;
            }
            const { width, height } = getSvgDimensions(el);
            if (width < MIN_VALID_IMAGE_DIMENSION || height < MIN_VALID_IMAGE_DIMENSION) {
                return;
            }
            const area = width * height;
            if (area < MIN_VALID_AREA) {
                return;
            }
            const aspectRatio = width / height;
            if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) {
                return;
            }
            const dataUrl = await svgToDataUrl(el);
            if (dataUrl && isValidImageCapture(dataUrl, width, height)) {
                blocks.push({ type: 'image', dataUrl, width, height });
                return;
            }
        }

        for (const child of Array.from(el.childNodes || [])) {
            await walk(child);
        }
    };

    for (const child of Array.from(root.childNodes || [])) {
        await walk(child);
    }
    return blocks;
}

function fallbackBlocksFromText(text) {
    if (!text) return [];
    return String(text).split(/\n{2,}/).map((chunk) => {
        const normalized = normalizeText(chunk);
        return normalized ? { type: 'paragraph', text: normalized } : null;
    }).filter(Boolean);
}

function addCoverSlide(pptx, titleText, fonts) {
    if (!titleText) return;
    const slide = pptx.addSlide();
    const title = normalizeText(titleText);
    const effectiveLineHeight = getEffectiveLineHeight(BODY_LINE_HEIGHT);
    const lines = wrapTextLines(title, SLIDE_W - MARGIN_X * 2, {
        latinFont: fonts.bodyLatin,
        cjkFont: fonts.headingCjk,
        fontSizePt: 36
    });
    const runs = buildRunsForLines(lines, {
        fontSize: 36,
        latinFont: fonts.bodyLatin,
        cjkFont: fonts.headingCjk,
        bold: true
    });
    slide.addText(runs, {
        x: MARGIN_X,
        y: SLIDE_H * 0.35,
        w: SLIDE_W - MARGIN_X * 2,
        h: 1.5,
        fontSize: 36,
        fontFace: fonts.bodyLatin,
        color: COLOR_TEXT,
        bold: true,
        lineSpacingMultiple: effectiveLineHeight,
        align: 'center',
        valign: 'middle'
    });
}

function createContentSlide(pptx, titleText, fonts) {
    const slide = pptx.addSlide();
    let cursorY = MARGIN_Y;
    if (titleText) {
        const effectiveLineHeight = getEffectiveLineHeight(BODY_LINE_HEIGHT);
        slide.addText(titleText, {
            x: MARGIN_X,
            y: MARGIN_Y,
            w: SLIDE_W - MARGIN_X * 2,
            h: 0.6,
            fontSize: TITLE_FONT_SIZE,
            fontFace: fonts.bodyLatin,
            color: COLOR_TEXT,
            bold: true,
            lineSpacingMultiple: effectiveLineHeight
        });
        const titleHeight = (TITLE_FONT_SIZE * effectiveLineHeight) / 72 + 0.1;
        cursorY = MARGIN_Y + titleHeight;
    }
    return { slide, cursorY };
}

function ensureSlideSpace(state, neededHeight) {
    if (state.cursorY + neededHeight <= SLIDE_H - MARGIN_Y) return state;
    return null;
}

function buildTextRuns(text, runOptions) {
    const runs = [];
    let buffer = '';
    let bufferIsCjk = null;
    const flush = () => {
        if (!buffer) return;
        const fontFace = bufferIsCjk ? runOptions.cjkFont : runOptions.latinFont;
        runs.push({
            text: buffer,
            options: {
                fontFace,
                fontSize: runOptions.fontSize,
                bold: runOptions.bold || false,
                italic: runOptions.italic || false,
                color: COLOR_TEXT
            }
        });
        buffer = '';
        bufferIsCjk = null;
    };
    for (const ch of text) {
        const isCjk = isCjkChar(ch);
        if (bufferIsCjk === null) {
            bufferIsCjk = isCjk;
            buffer = ch;
            continue;
        }
        if (bufferIsCjk === isCjk) {
            buffer += ch;
            continue;
        }
        flush();
        bufferIsCjk = isCjk;
        buffer = ch;
    }
    flush();
    return runs;
}

function buildRunsForLines(lines, runOptions) {
    const runs = [];
    lines.forEach((line, index) => {
        if (line) {
            runs.push(...buildTextRuns(line, runOptions));
        }
        if (index < lines.length - 1) {
            runs.push({ text: '\n' });
        }
    });
    return runs;
}

function addLinesBlock(state, lines, options, pptx, fonts) {
    if (!lines.length) return state;
    const {
        fontSize,
        lineHeight,
        fontFace,
        indent,
        bullet
    } = options;
    const lineSpacing = lineHeight || 1.25;
    const lineHeightIn = (fontSize * LINE_HEIGHT_PADDING_RATIO) / 72;

    let remainingLines = [...lines];

    while (remainingLines.length > 0) {
        const availableHeight = SLIDE_H - MARGIN_Y - state.cursorY - 0.2;
        const maxLinesOnPage = Math.max(1, Math.floor(availableHeight / lineHeightIn));

        if (maxLinesOnPage < 1 || availableHeight < lineHeightIn) {
            state = createContentSlide(pptx, '', fonts);
            continue;
        }

        const linesToAdd = remainingLines.slice(0, maxLinesOnPage);
        remainingLines = remainingLines.slice(maxLinesOnPage);

        const blockHeight = lineHeightIn * linesToAdd.length + 0.1;

        const runOptions = {
            ...options,
            latinFont: options.latinFont || FONT_BODY_LATIN,
            cjkFont: options.cjkFont || FONT_BODY_CJK
        };
        const runs = buildRunsForLines(linesToAdd, runOptions);
        state.slide.addText(runs, {
            x: MARGIN_X + (indent || 0),
            y: state.cursorY,
            w: SLIDE_W - MARGIN_X * 2 - (indent || 0),
            h: blockHeight,
            fontSize,
            fontFace,
            color: COLOR_TEXT,
            bullet,
            lineSpacing: fontSize * lineSpacing,
            valign: 'top'
        });
        state.cursorY += blockHeight + 0.15;

        if (remainingLines.length > 0) {
            state = createContentSlide(pptx, '', fonts);
        }
    }

    return state;
}

function addImageBlock(state, block, pptx, fonts) {
    if (!block.dataUrl) return state;

    const w = block.width || 0;
    const h = block.height || 0;
    if (w < MIN_VALID_IMAGE_DIMENSION || h < MIN_VALID_IMAGE_DIMENSION) {
        return state;
    }
    const area = w * h;
    if (area < MIN_VALID_AREA) {
        return state;
    }
    const aspectRatio = w / h;
    if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) {
        return state;
    }

    const size = clampImageSize(w, h, IMAGE_MAX_W, IMAGE_MAX_H);
    if (!ensureSlideSpace(state, size.height)) {
        state = createContentSlide(pptx, '', fonts);
    }
    state.slide.addImage({
        data: block.dataUrl,
        x: MARGIN_X,
        y: state.cursorY,
        w: size.width,
        h: size.height
    });
    state.cursorY += size.height + 0.12;
    return state;
}

function buildSlidesFromBlocks(pptx, blocks, fonts) {
    let state = createContentSlide(pptx, '', fonts);

    blocks.forEach((block) => {
        if (block.type === 'heading') {
            if (state.cursorY > MARGIN_Y + 0.1) {
                state = createContentSlide(pptx, '', fonts);
            }
            const lines = wrapTextLines(block.text, SLIDE_W - MARGIN_X * 2, {
                latinFont: fonts.bodyLatin,
                cjkFont: fonts.headingCjk,
                fontSizePt: TITLE_FONT_SIZE
            });
            const lineHeightIn = (TITLE_FONT_SIZE * LINE_HEIGHT_PADDING_RATIO) / 72;
            const blockHeight = lineHeightIn * Math.max(1, lines.length) + 0.15;
            const runs = buildRunsForLines(lines, {
                fontSize: TITLE_FONT_SIZE,
                latinFont: fonts.bodyLatin,
                cjkFont: fonts.headingCjk,
                bold: true
            });
            state.slide.addText(runs, {
                x: MARGIN_X,
                y: MARGIN_Y,
                w: SLIDE_W - MARGIN_X * 2,
                h: blockHeight,
                fontSize: TITLE_FONT_SIZE,
                fontFace: fonts.bodyLatin,
                color: COLOR_TEXT,
                bold: true,
                lineSpacing: TITLE_FONT_SIZE * 1.25,
                valign: 'top'
            });
            state.cursorY = MARGIN_Y + blockHeight + 0.2;
            return;
        }

        if (block.type === 'paragraph') {
            const lines = wrapTextLines(block.text, SLIDE_W - MARGIN_X * 2, {
                latinFont: fonts.bodyLatin,
                cjkFont: fonts.bodyCjk,
                fontSizePt: BODY_FONT_SIZE
            });
            state = addLinesBlock(state, lines, {
                fontSize: BODY_FONT_SIZE,
                lineHeight: BODY_LINE_HEIGHT,
                fontFace: fonts.bodyLatin,
                latinFont: fonts.bodyLatin,
                cjkFont: fonts.bodyCjk
            }, pptx, fonts);
            return;
        }

        if (block.type === 'quote') {
            const lines = wrapTextLines(block.text, SLIDE_W - MARGIN_X * 2, {
                latinFont: fonts.quoteLatin,
                cjkFont: fonts.quoteCjk,
                fontSizePt: BODY_FONT_SIZE
            });
            state = addLinesBlock(state, lines, {
                fontSize: BODY_FONT_SIZE,
                lineHeight: BODY_LINE_HEIGHT,
                fontFace: fonts.quoteLatin,
                latinFont: fonts.quoteLatin,
                cjkFont: fonts.quoteCjk,
                italic: true,
                indent: 0.2
            }, pptx, fonts);
            return;
        }

        if (block.type === 'code') {
            const lines = wrapTextLines(block.text, SLIDE_W - MARGIN_X * 2, {
                latinFont: FONT_CODE,
                cjkFont: fonts.bodyCjk,
                fontSizePt: CODE_FONT_SIZE
            });
            state = addLinesBlock(state, lines, {
                fontSize: CODE_FONT_SIZE,
                lineHeight: CODE_LINE_HEIGHT,
                fontFace: FONT_CODE,
                latinFont: FONT_CODE,
                cjkFont: fonts.bodyCjk,
                indent: 0.2
            }, pptx, fonts);
            return;
        }

        if (block.type === 'list') {
            block.items.forEach((item) => {
                const text = `• ${item}`;
                const lines = wrapTextLines(text, SLIDE_W - MARGIN_X * 2, {
                    latinFont: fonts.bodyLatin,
                    cjkFont: fonts.bodyCjk,
                    fontSizePt: BODY_FONT_SIZE
                });
                state = addLinesBlock(state, lines, {
                    fontSize: BODY_FONT_SIZE,
                    lineHeight: BODY_LINE_HEIGHT,
                    fontFace: fonts.bodyLatin,
                    latinFont: fonts.bodyLatin,
                    cjkFont: fonts.bodyCjk
                }, pptx, fonts);
            });
        }

        if (block.type === 'image') {
            state = addImageBlock(state, block, pptx, fonts);
        }
    });
}

async function loadPptxGen(loadScript) {
    await loadScript('/libs/pptxgen.bundle.js', 'PptxGenJS');
    return window.PptxGenJS;
}

async function loadExportDeps(loadScript) {
    await loadScript('/libs/html-to-image.js', 'htmlToImage');
    await loadScript('/libs/canvg.min.js', 'Canvg');
    await loadScript('/libs/purify.min.js', 'DOMPurify');
}

export async function exportTextAsPpt({
    text,
    filename,
    loadScript,
    contentElement,
    headerTitle,
    locale
} = {}) {
    const PptxGenJS = await loadPptxGen(loadScript);
    await loadExportDeps(loadScript);
    if (!PptxGenJS) {
        throw new Error('PptxGenJS is not available');
    }

    const pptx = new PptxGenJS();
    pptx.layout = SLIDE_LAYOUT;
    pptx.author = 'LittleAIBox';
    pptx.company = 'LittleAIBox';
    pptx.subject = 'Chat Export';

    const title = headerTitle || (filename || 'export');
    const fonts = getActiveFontProfile(locale);
    addCoverSlide(pptx, title, fonts);

    const blocks = contentElement
        ? await extractBlocksFromElement(contentElement)
        : fallbackBlocksFromText(text || '');

    buildSlidesFromBlocks(pptx, blocks, fonts);

    const safeName = (String(filename || 'export').trim() || 'export').replace(/[\\/:*?"<>|]/g, '_');
    if (typeof window !== 'undefined' && typeof window.__saveFileFromBlob === 'function') {
        const blob = await pptx.write({ outputType: 'blob' });
        await window.__saveFileFromBlob(blob, `${safeName}.pptx`);
        return { success: true };
    }
    await pptx.writeFile({ fileName: `${safeName}.pptx` });
    return { success: true };
}

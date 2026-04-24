const ORDERED_LIST_REFERENCE = 'ordered-list';
const BODY_LATIN_FONT = 'Times New Roman';
const BODY_CJK_FONT = 'SimSun';
const HEADING_CJK_FONT = 'SimHei';
const CODE_FONT = 'Consolas';
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

const A4_WIDTH_TWIPS = 11906;
const A4_HEIGHT_TWIPS = 16838;
const MARGIN_VERTICAL_TWIPS = 1440;
const MARGIN_HORIZONTAL_TWIPS = 1800;
const BODY_FONT_SIZE_HALF_POINTS = 24;
const HEADING_1_SIZE_HALF_POINTS = 32;
const HEADING_2_SIZE_HALF_POINTS = 28;
const HEADING_3_SIZE_HALF_POINTS = 24;
const BODY_LINE_TWIPS = 360;
const HEADING_1_SPACING_TWIPS = 480;
const HEADING_2_SPACING_TWIPS = 240;
const FIRST_LINE_INDENT_TWIPS = 480;

const INLINE_MATH_FONT = 'STIXTwoMath';
const INLINE_MATH_SIZE_HALF_POINTS = BODY_FONT_SIZE_HALF_POINTS;
const DISPLAY_MATH_FONT = 'STIXTwoMath';
const DISPLAY_MATH_SIZE_HALF_POINTS = BODY_FONT_SIZE_HALF_POINTS;
const DISPLAY_MATH_SPACING_TWIPS = 120;

const CJK_REGEX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const CJK_PUNCT_REGEX = /[\u3000-\u303F\uFF00-\uFFEF]/;

const HEADER_FONT_SIZE_HALF_POINTS = 18;
const HEADER_OFFSET_TWIPS = 850;
const HEADER_UNDERLINE_PT = 0.75;
const FOOTER_FONT_SIZE_HALF_POINTS = 18;
const FOOTER_OFFSET_TWIPS = 992;

const IMAGE_MAX_WIDTH_TWIPS = 8290;
const IMAGE_MAX_HEIGHT_TWIPS = A4_HEIGHT_TWIPS - (MARGIN_VERTICAL_TWIPS * 2);
const IMAGE_SPACING_BEFORE_TWIPS = 240;
const IMAGE_SPACING_AFTER_TWIPS = 120;
const FIGURE_CAPTION_SIZE_HALF_POINTS = 21;
const FIGURE_CAPTION_AFTER_TWIPS = 240;

const TABLE_CAPTION_SIZE_HALF_POINTS = 21;
const TABLE_CAPTION_AFTER_TWIPS = 120;
const TABLE_TEXT_SIZE_HALF_POINTS = 21;
const TABLE_BORDER_TOP_BOTTOM_PT = 1.5;
const TABLE_BORDER_HEADER_PT = 0.75;
const TABLE_BORDER_COLOR = '000000';

const ASSISTANT_HEADING_COLOR = '1D4ED8';
const USER_HEADING_COLOR = 'D97706';
const SPEAKER_LABEL_DEFAULT_COLOR = '000000';
const LINK_COLOR = '1A73E8';

const CODE_BLOCK_BG_COLOR = 'F5F5F5';
const CODE_BLOCK_BORDER_COLOR = 'DDDDDD';
const DIAGRAM_EXPORT_SCALE = 3;
const DIAGRAM_EXPORT_MAX_SIZE = 4000;

const LIST_BASE_INDENT_TWIPS = 720;
const LIST_LEVEL_INDENT_TWIPS = 360;

const LANGUAGE_FONT_MAP = {
    'zh-cn': {
        bodyLatin: BODY_LATIN_FONT,
        bodyCjk: CJK_BODY_ZH_CN,
        headingCjk: CJK_HEADING_ZH_CN,
        quoteCjk: CJK_QUOTE_ZH_CN,
        quoteLatin: QUOTE_LATIN_FONT
    },
    'zh-tw': {
        bodyLatin: BODY_LATIN_FONT,
        bodyCjk: CJK_BODY_ZH_TW,
        headingCjk: CJK_HEADING_ZH_TW,
        quoteCjk: CJK_QUOTE_ZH_TW,
        quoteLatin: QUOTE_LATIN_FONT
    },
    ja: {
        bodyLatin: BODY_LATIN_FONT,
        bodyCjk: CJK_BODY_JA,
        headingCjk: CJK_HEADING_JA,
        quoteCjk: CJK_QUOTE_JA,
        quoteLatin: QUOTE_LATIN_FONT
    },
    ko: {
        bodyLatin: BODY_LATIN_FONT,
        bodyCjk: CJK_BODY_KO,
        headingCjk: CJK_HEADING_KO,
        quoteCjk: CJK_QUOTE_KO,
        quoteLatin: QUOTE_LATIN_FONT
    },
    en: { bodyLatin: BODY_LATIN_FONT, bodyCjk: BODY_CJK_FONT, headingCjk: HEADING_CJK_FONT, quoteLatin: QUOTE_LATIN_FONT },
    fr: { bodyLatin: BODY_LATIN_FONT, bodyCjk: BODY_CJK_FONT, headingCjk: HEADING_CJK_FONT, quoteLatin: QUOTE_LATIN_FONT },
    es: { bodyLatin: BODY_LATIN_FONT, bodyCjk: BODY_CJK_FONT, headingCjk: HEADING_CJK_FONT, quoteLatin: QUOTE_LATIN_FONT }
};

let activeFontProfile = { ...LANGUAGE_FONT_MAP.en };

function resolveLocaleKey(locale) {
    const normalized = String(locale || '').toLowerCase();
    if (normalized.startsWith('zh')) {
        if (normalized.includes('tw') || normalized.includes('hk') || normalized.includes('hant')) {
            return 'zh-tw';
        }
        return 'zh-cn';
    }
    if (normalized.startsWith('ja')) return 'ja';
    if (normalized.startsWith('ko')) return 'ko';
    if (normalized.startsWith('fr')) return 'fr';
    if (normalized.startsWith('es')) return 'es';
    return 'en';
}

function setActiveFontProfile(locale) {
    const key = resolveLocaleKey(locale);
    activeFontProfile = { ...LANGUAGE_FONT_MAP.en, ...(LANGUAGE_FONT_MAP[key] || {}) };
}

function getBodyLatinFont() {
    return activeFontProfile.bodyLatin || BODY_LATIN_FONT;
}

function getBodyCjkFont() {
    return activeFontProfile.bodyCjk || BODY_CJK_FONT;
}

function getHeadingCjkFont() {
    return activeFontProfile.headingCjk || HEADING_CJK_FONT;
}

function getQuoteCjkFont() {
    return activeFontProfile.quoteCjk || getBodyCjkFont();
}

function getQuoteLatinFont() {
    return activeFontProfile.quoteLatin || getBodyLatinFont();
}

function getDefaultParagraphSpacing(docx) {
    return { before: 0, after: 0, line: BODY_LINE_TWIPS, lineRule: docx.LineRuleType.AUTO };
}

async function loadDocxLib(loadScript) {
    await loadScript('/libs/index.umd.js', 'docx');
    return window.docx;
}

function normalizeTextForRun(text, preserveWhitespace) {
    const raw = String(text || '');
    if (preserveWhitespace) {
        return raw.replace(/\r\n/g, '\n');
    }
    return raw.replace(/\s+/g, ' ').replace(/\r\n/g, '\n');
}

function isCjkChar(char) {
    if (!char) return false;
    return CJK_REGEX.test(char) || CJK_PUNCT_REGEX.test(char);
}

function splitTextByScript(text) {
    const segments = [];
    let current = null;
    for (const char of text) {
        const isWhitespace = /\s/.test(char);
        const isCjk = isCjkChar(char);
        const segmentType = isWhitespace && current ? current.isCjk : isCjk;
        if (!current || current.isCjk !== segmentType) {
            current = { isCjk: segmentType, text: char };
            segments.push(current);
            continue;
        }
        current.text += char;
    }
    return segments;
}

function splitTextByInlineMath(text) {
    const segments = [];
    if (!text) return segments;
    const regex = /(\$\$[^$\n]+\$\$|\$[^$\n]+\$|\\\([^)]*\\\))/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
        }
        segments.push({ type: 'math', value: match[0] });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
        segments.push({ type: 'text', value: text.slice(lastIndex) });
    }
    return segments;
}

function buildInlineMathRun(docx, tex, { font, size } = {}) {
    const mathRun = new docx.MathRun(tex);
    mathRun.properties = {
        font: font || INLINE_MATH_FONT || getBodyLatinFont(),
        size: size || INLINE_MATH_SIZE_HALF_POINTS || BODY_FONT_SIZE_HALF_POINTS
    };
    return new docx.Math({ children: [mathRun] });
}

function stripMathDelimiters(raw) {
    const text = String(raw || '').trim();
    if (!text) return '';
    if (text.startsWith('$$') && text.endsWith('$$')) {
        return text.slice(2, -2).trim();
    }
    if (text.startsWith('$') && text.endsWith('$')) {
        return text.slice(1, -1).trim();
    }
    if (text.startsWith('\\(') && text.endsWith('\\)')) {
        return text.slice(2, -2).trim();
    }
    return text;
}

function extractKatexTex(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';
    const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
    if (annotation && annotation.textContent) return annotation.textContent;
    return node.textContent || '';
}

function toImageDimensions(imageEl) {
    const naturalWidth = imageEl.naturalWidth || Number(imageEl.getAttribute('width')) || 0;
    const naturalHeight = imageEl.naturalHeight || Number(imageEl.getAttribute('height')) || 0;
    const maxWidthPx = twipsToPx(IMAGE_MAX_WIDTH_TWIPS);
    const width = naturalWidth > 0 ? naturalWidth : Math.min(320, maxWidthPx);
    const height = naturalHeight > 0 ? naturalHeight : 200;
    if (width <= maxWidthPx) {
        return { width, height };
    }
    const ratio = maxWidthPx / width;
    return { width: maxWidthPx, height: Math.round(height * ratio) };
}

async function loadImageData(src) {
    if (!src) return null;
    if (src.startsWith('data:')) {
        return src;
    }
    try {
        const response = await fetch(src);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        return new Uint8Array(arrayBuffer);
    } catch (_) {
        return null;
    }
}

async function buildInlineImageRun(docx, imageEl) {
    const src = imageEl.getAttribute('src') || '';
    const data = await loadImageData(src);
    if (!data) return null;
    const { width, height } = toImageDimensions(imageEl);
    const altText = imageEl.getAttribute('alt') || 'image';
    return new docx.ImageRun({
        data,
        transformation: { width, height },
        altText: { title: altText, description: altText, name: altText }
    });
}

function createTextRuns(docx, text, runOptions = {}) {
    const normalized = normalizeTextForRun(text, runOptions.preserveWhitespace);
    if (!normalized) return [];
    const parts = normalized.split('\n');
    const runs = [];
    parts.forEach((part, index) => {
        const optionsBase = { ...runOptions };
        delete optionsBase.preserveWhitespace;
        const segments = splitTextByScript(part);
        segments.forEach((segment, segmentIndex) => {
            const options = { ...optionsBase };
            options.text = segment.text;
            if (index > 0 && segmentIndex === 0) {
                options.break = 1;
            }
            if (!options.font && !options.fonts) {
                const latinFont = options.latinFont || getBodyLatinFont();
                const cjkFont = options.cjkFont || getBodyCjkFont();
                options.font = segment.isCjk ? cjkFont : latinFont;
            }
            delete options.latinFont;
            delete options.cjkFont;
            runs.push(new docx.TextRun(options));
        });
    });
    return runs;
}

async function buildRunsFromNodes(docx, nodes, context, labels) {
    const runs = [];
    for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            const rawText = node.textContent || '';
            if (!context.preserveWhitespace && rawText.trim() === '' && !context.allowEmptyText) {
                continue;
            }
            const segments = splitTextByInlineMath(rawText);
            const baseOptions = {
                bold: context.bold,
                italics: context.italics,
                underline: context.underline ? { type: docx.UnderlineType.SINGLE } : undefined,
                color: context.color,
                font: context.code ? CODE_FONT : undefined,
                preserveWhitespace: context.preserveWhitespace,
                latinFont: context.latinFont,
                cjkFont: context.cjkFont,
                size: context.size
            };
            if (!segments.length) {
                runs.push(...createTextRuns(docx, rawText, baseOptions));
                continue;
            }
            segments.forEach((segment) => {
                if (segment.type === 'math') {
                    const tex = stripMathDelimiters(segment.value);
                    if (tex) {
                        runs.push(buildInlineMathRun(docx, tex, {
                            font: INLINE_MATH_FONT,
                            size: INLINE_MATH_SIZE_HALF_POINTS
                        }));
                    }
                    return;
                }
                runs.push(...createTextRuns(docx, segment.value, baseOptions));
            });
            continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const element = node;
        const tag = element.tagName.toLowerCase();
        if (tag === 'br') {
            runs.push(new docx.TextRun({ text: '', break: 1 }));
            continue;
        }
        if (tag === 'strong' || tag === 'b') {
            runs.push(...await buildRunsFromNodes(docx, element.childNodes, { ...context, bold: true }, labels));
            continue;
        }
        if (tag === 'em' || tag === 'i') {
            runs.push(...await buildRunsFromNodes(docx, element.childNodes, { ...context, italics: true }, labels));
            continue;
        }
        if (tag === 'code') {
            runs.push(...await buildRunsFromNodes(docx, element.childNodes, { ...context, code: true, preserveWhitespace: true }, labels));
            continue;
        }
        if (tag === 'a') {
            const link = element.getAttribute('href') || '';
            const linkRuns = await buildRunsFromNodes(docx, element.childNodes, {
                ...context,
                underline: true,
                color: LINK_COLOR
            }, labels);
            if (link) {
                runs.push(new docx.ExternalHyperlink({ link, children: linkRuns.length ? linkRuns : createTextRuns(docx, link) }));
            } else {
                runs.push(...linkRuns);
            }
            continue;
        }
        if (tag === 'img') {
            const imageRun = await buildInlineImageRun(docx, element);
            if (imageRun) {
                runs.push(imageRun);
            } else {
                const fallback = labels?.imageUnavailable || '[image unavailable]';
                runs.push(...createTextRuns(docx, fallback));
            }
            continue;
        }
        if (element.classList.contains('katex')) {
            const tex = extractKatexTex(element);
            if (tex) {
                const mathRun = new docx.MathRun(tex);
                if (INLINE_MATH_FONT || INLINE_MATH_SIZE_HALF_POINTS) {
                    mathRun.properties = {
                        font: INLINE_MATH_FONT || getBodyLatinFont(),
                        size: INLINE_MATH_SIZE_HALF_POINTS || BODY_FONT_SIZE_HALF_POINTS
                    };
                }
                runs.push(new docx.Math({ children: [mathRun] }));
            }
            continue;
        }
        if (element.classList.contains('katex-display')) {
            const tex = extractKatexTex(element);
            if (tex) {
                const mathRun = new docx.MathRun(tex);
                if (DISPLAY_MATH_FONT || DISPLAY_MATH_SIZE_HALF_POINTS) {
                    mathRun.properties = {
                        font: DISPLAY_MATH_FONT || getBodyLatinFont(),
                        size: DISPLAY_MATH_SIZE_HALF_POINTS || BODY_FONT_SIZE_HALF_POINTS
                    };
                }
                runs.push(new docx.Math({ children: [mathRun] }));
            }
            continue;
        }
        runs.push(...await buildRunsFromNodes(docx, element.childNodes, context, labels));
    }
    return runs;
}

async function buildParagraphFromElement(docx, element, options = {}) {
    const runs = await buildRunsFromNodes(docx, element.childNodes, options.runContext || {}, options.labels);
    if (!runs.length && !options.allowEmpty) {
        return null;
    }
    const spacing = options.spacing
        ? { ...getDefaultParagraphSpacing(docx), ...options.spacing }
        : getDefaultParagraphSpacing(docx);
    return new docx.Paragraph({
        children: runs.length ? runs : [new docx.TextRun('')],
        heading: options.heading,
        style: options.style,
        alignment: options.alignment,
        spacing,
        indent: options.indent,
        bullet: options.bullet,
        numbering: options.numbering
    });
}

function twipsToPx(twips) {
    return Math.round((twips / 1440) * 96);
}

function fitImageDimensions(width, height) {
    const maxWidthPx = twipsToPx(IMAGE_MAX_WIDTH_TWIPS);
    const maxHeightPx = twipsToPx(IMAGE_MAX_HEIGHT_TWIPS);
    const safeWidth = width > 0 ? width : maxWidthPx;
    const safeHeight = height > 0 ? height : Math.round(maxWidthPx * 0.75);
    const widthRatio = maxWidthPx / safeWidth;
    const heightRatio = maxHeightPx / safeHeight;
    const ratio = Math.min(1, widthRatio, heightRatio);
    if (ratio >= 1) {
        return { width: safeWidth, height: safeHeight };
    }
    return { width: Math.round(safeWidth * ratio), height: Math.round(safeHeight * ratio) };
}

function buildDisplayMathParagraph(docx, element) {
    if (!element || !element.classList || !element.classList.contains('katex-display')) {
        return null;
    }
    const tex = extractKatexTex(element);
    let math = new docx.TextRun('');
    if (tex) {
        const mathRun = new docx.MathRun(tex);
        if (DISPLAY_MATH_FONT || DISPLAY_MATH_SIZE_HALF_POINTS) {
            mathRun.properties = {
                font: DISPLAY_MATH_FONT || getBodyLatinFont(),
                size: DISPLAY_MATH_SIZE_HALF_POINTS || BODY_FONT_SIZE_HALF_POINTS
            };
        }
        math = new docx.Math({ children: [mathRun] });
    }
    return new docx.Paragraph({
        children: [math],
        alignment: docx.AlignmentType.CENTER,
        spacing: {
            ...getDefaultParagraphSpacing(docx),
            before: DISPLAY_MATH_SPACING_TWIPS,
            after: DISPLAY_MATH_SPACING_TWIPS
        }
    });
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

async function buildParagraphsWithDisplayMath(docx, element, labels, options = {}) {
    const segments = [];
    element.childNodes.forEach(child => collectDisplayMathSegments(child, segments));
    const paragraphs = [];
    const buffer = [];
    const flushBuffer = async () => {
        if (!buffer.length) return;
        const temp = document.createElement('p');
        buffer.forEach(node => {
            temp.appendChild(node.cloneNode(true));
        });
        buffer.length = 0;
        const paragraph = await buildParagraphFromElement(docx, temp, {
            labels,
            runContext: options.runContext,
            alignment: options.paragraphAlignment,
            spacing: options.paragraphSpacing,
            indent: options.paragraphIndent
        });
        if (paragraph) {
            paragraphs.push(paragraph);
        }
    };

    for (const segment of segments) {
        if (segment.type === 'display') {
            await flushBuffer();
            const displayParagraph = buildDisplayMathParagraph(docx, segment.element);
            if (displayParagraph) {
                paragraphs.push(displayParagraph);
            }
            continue;
        }
        if (segment.node) {
            buffer.push(segment.node);
        }
    }
    await flushBuffer();
    return paragraphs;
}

function getSvgDimensions(svgEl) {
    if (!svgEl) return { width: 800, height: 600 };
    const viewBox = svgEl.viewBox && svgEl.viewBox.baseVal;
    if (viewBox && viewBox.width && viewBox.height) {
        return { width: viewBox.width, height: viewBox.height };
    }
    const widthAttr = parseFloat(svgEl.getAttribute('width'));
    const heightAttr = parseFloat(svgEl.getAttribute('height'));
    if (!Number.isNaN(widthAttr) && !Number.isNaN(heightAttr)) {
        return { width: widthAttr, height: heightAttr };
    }
    try {
        const rect = svgEl.getBoundingClientRect();
        if (rect && rect.width && rect.height) {
            return { width: rect.width, height: rect.height };
        }
    } catch (_) { }
    return { width: 800, height: 600 };
}

async function svgToPngDataUrl(svgEl, scale = DIAGRAM_EXPORT_SCALE) {
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
    const canvas = document.createElement('canvas');
    const safeScale = Math.min(4, Math.max(1, scale));
    let targetWidth = Math.max(1, Math.round(width * safeScale));
    let targetHeight = Math.max(1, Math.round(height * safeScale));
    const maxSize = Math.max(1, DIAGRAM_EXPORT_MAX_SIZE);
    if (targetWidth > maxSize || targetHeight > maxSize) {
        const ratio = Math.min(maxSize / targetWidth, maxSize / targetHeight);
        targetWidth = Math.max(1, Math.round(targetWidth * ratio));
        targetHeight = Math.max(1, Math.round(targetHeight * ratio));
    }
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}

function inlineComputedStyles(sourceSvg, targetSvg) {
    if (!sourceSvg || !targetSvg || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return;
    const RELEVANT_STYLES = [
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
        RELEVANT_STYLES.forEach((prop) => {
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

function findDiagramSvg(container) {
    if (!container || !container.querySelectorAll) return null;
    const svgEls = Array.from(container.querySelectorAll('svg'));
    if (!svgEls.length) return null;
    const filtered = svgEls.filter(svg => !svg.closest('.mermaid-render-toolbar') && !svg.closest('.vega-lite-toolbar'));
    if (filtered.length) return filtered[0];
    return svgEls[0];
}

function buildCodeParagraphs(docx, codeText) {
    const normalized = String(codeText || '').replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const spacing = { before: 0, after: 0, line: 240, lineRule: docx.LineRuleType.AUTO };
    return lines.map(line => new docx.Paragraph({
        children: createTextRuns(docx, line, {
            font: 'Courier New',
            preserveWhitespace: true,
            latinFont: 'Courier New',
            cjkFont: 'Courier New',
            size: 20
        }),
        alignment: docx.AlignmentType.LEFT,
        spacing,
        indent: { left: 420, firstLine: 0 },
        shading: {
            type: docx.ShadingType.CLEAR,
            fill: CODE_BLOCK_BG_COLOR
        },
        border: {
            left: { style: docx.BorderStyle.SINGLE, size: 6, color: CODE_BLOCK_BORDER_COLOR, space: 4 }
        }
    }));
}

function extractDiagramSource(element) {
    if (!element || !element.querySelector) return '';
    const mermaidSource = element.querySelector('pre.mermaid-source code');
    if (mermaidSource && mermaidSource.textContent) return mermaidSource.textContent;
    const vegaSource = element.querySelector('pre.vega-lite-source code');
    if (vegaSource && vegaSource.textContent) return vegaSource.textContent;
    return '';
}

async function buildImageParagraph(docx, imageEl, labels) {
    const src = imageEl.getAttribute('src') || '';
    const data = await loadImageData(src);
    if (!data) {
        const fallback = labels?.imageUnavailable || '[image unavailable]';
        return new docx.Paragraph({ children: createTextRuns(docx, fallback) });
    }
    const { width, height } = toImageDimensions(imageEl);
    const altText = imageEl.getAttribute('alt') || 'image';
    const imageRun = new docx.ImageRun({
        data,
        transformation: { width, height },
        altText: { title: altText, description: altText, name: altText }
    });
    return new docx.Paragraph({
        children: [imageRun],
        alignment: docx.AlignmentType.CENTER,
        spacing: {
            ...getDefaultParagraphSpacing(docx),
            before: IMAGE_SPACING_BEFORE_TWIPS,
            after: IMAGE_SPACING_AFTER_TWIPS
        }
    });
}

async function buildDiagramImageParagraph(docx, svgEl) {
    try {
        const dataUrl = await svgToPngDataUrl(svgEl);
        if (!dataUrl) return null;
        const { width, height } = getSvgDimensions(svgEl);
        const fitted = fitImageDimensions(width, height);
        const imageRun = new docx.ImageRun({
            data: dataUrl,
            transformation: fitted
        });
        return new docx.Paragraph({
            children: [imageRun],
            alignment: docx.AlignmentType.CENTER,
            spacing: {
                ...getDefaultParagraphSpacing(docx),
                before: IMAGE_SPACING_BEFORE_TWIPS,
                after: IMAGE_SPACING_AFTER_TWIPS
            }
        });
    } catch (_) {
        return null;
    }
}

function buildCaptionParagraph(docx, text, options = {}) {
    const spacing = options.spacing
        ? { ...getDefaultParagraphSpacing(docx), ...options.spacing }
        : getDefaultParagraphSpacing(docx);
    const runs = createTextRuns(docx, text, {
        bold: options.bold,
        latinFont: options.latinFont || getBodyLatinFont(),
        cjkFont: options.cjkFont || getBodyCjkFont(),
        size: options.size
    });
    return new docx.Paragraph({
        children: runs.length ? runs : [new docx.TextRun('')],
        alignment: options.alignment || docx.AlignmentType.CENTER,
        spacing
    });
}

async function buildTable(docx, tableEl, labels) {
    const rows = [];
    const rowEls = Array.from(tableEl.querySelectorAll('tr'));
    let headerRowIndex = -1;
    rowEls.forEach((rowEl, index) => {
        if (headerRowIndex !== -1) return;
        const hasHeaderCell = Array.from(rowEl.children).some(cell => cell.tagName === 'TH');
        if (hasHeaderCell) headerRowIndex = index;
    });
    const colCount = rowEls.reduce((max, rowEl) => {
        const cells = Array.from(rowEl.children).filter(cell => ['TD', 'TH'].includes(cell.tagName));
        return Math.max(max, cells.length);
    }, 0);

    const cellPaddingTwips = 120;
    for (const [rowIndex, rowEl] of rowEls.entries()) {
        const isHeaderRow = rowIndex === headerRowIndex;
        const cells = [];
        const cellEls = Array.from(rowEl.children).filter(cell => ['TD', 'TH'].includes(cell.tagName));
        for (const cellEl of cellEls) {
            const cellBlocks = await buildBlocksFromChildren(docx, cellEl, labels, {
                runContext: {
                    latinFont: getBodyLatinFont(),
                    cjkFont: getBodyCjkFont(),
                    size: TABLE_TEXT_SIZE_HALF_POINTS,
                    bold: isHeaderRow
                },
                paragraphAlignment: isHeaderRow ? docx.AlignmentType.CENTER : docx.AlignmentType.LEFT,
                paragraphSpacing: { before: 0, after: 0, line: BODY_LINE_TWIPS, lineRule: docx.LineRuleType.AUTO },
                paragraphIndent: { firstLine: 0 }
            });
            const cellParagraphs = cellBlocks.filter(block => block instanceof docx.Paragraph);
            const children = cellParagraphs.length ? cellParagraphs : [new docx.Paragraph('')];
            const borders = rowIndex === headerRowIndex ? {
                bottom: {
                    style: docx.BorderStyle.SINGLE,
                    size: Math.round(TABLE_BORDER_HEADER_PT * 8),
                    color: TABLE_BORDER_COLOR
                }
            } : undefined;
            cells.push(new docx.TableCell({
                children,
                borders,
                verticalAlign: docx.VerticalAlign.CENTER,
                margins: {
                    top: cellPaddingTwips,
                    bottom: cellPaddingTwips,
                    left: cellPaddingTwips,
                    right: cellPaddingTwips
                }
            }));
        }
        while (cells.length < colCount) {
            const borders = isHeaderRow ? {
                bottom: {
                    style: docx.BorderStyle.SINGLE,
                    size: Math.round(TABLE_BORDER_HEADER_PT * 8),
                    color: TABLE_BORDER_COLOR
                }
            } : undefined;
            cells.push(new docx.TableCell({
                children: [new docx.Paragraph('')],
                borders,
                verticalAlign: docx.VerticalAlign.CENTER,
                margins: {
                    top: cellPaddingTwips,
                    bottom: cellPaddingTwips,
                    left: cellPaddingTwips,
                    right: cellPaddingTwips
                }
            }));
        }
        rows.push(new docx.TableRow({ children: cells }));
    }
    const caption = tableEl.querySelector('caption');
    return new docx.Table({
        rows,
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
        borders: {
            top: { style: docx.BorderStyle.SINGLE, size: Math.round(TABLE_BORDER_TOP_BOTTOM_PT * 8), color: TABLE_BORDER_COLOR },
            bottom: { style: docx.BorderStyle.SINGLE, size: Math.round(TABLE_BORDER_TOP_BOTTOM_PT * 8), color: TABLE_BORDER_COLOR },
            left: { style: docx.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right: { style: docx.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            insideVertical: { style: docx.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            insideHorizontal: { style: docx.BorderStyle.NONE, size: 0, color: 'FFFFFF' }
        },
        caption: caption ? caption.textContent || '' : undefined
    });
}

async function buildList(docx, listEl, level = 0, ordered = false, labels) {
    const paragraphs = [];
    const items = Array.from(listEl.children).filter(child => child.tagName === 'LI');
    for (const item of items) {
        const paragraphChildren = Array.from(item.children).filter(child => child.tagName === 'P');
        const nestedLists = Array.from(item.querySelectorAll('ul,ol'));
        const clone = item.cloneNode(true);
        clone.querySelectorAll('ul,ol').forEach(node => node.remove());
        const listIndent = LIST_BASE_INDENT_TWIPS + level * LIST_LEVEL_INDENT_TWIPS;
        if (paragraphChildren.length) {
            for (let i = 0; i < paragraphChildren.length; i += 1) {
                const child = paragraphChildren[i];
                const runs = await buildRunsFromNodes(docx, child.childNodes, {}, labels);
                if (i === 0) {
                    const listParagraph = new docx.Paragraph({
                        children: runs.length ? runs : [new docx.TextRun('')],
                        bullet: ordered ? undefined : { level: Math.min(level, 3) },
                        numbering: ordered ? { reference: ORDERED_LIST_REFERENCE, level: Math.min(level, 2) } : undefined,
                        spacing: getDefaultParagraphSpacing(docx),
                        indent: { left: listIndent, hanging: LIST_LEVEL_INDENT_TWIPS }
                    });
                    paragraphs.push(listParagraph);
                } else {
                    const continuation = new docx.Paragraph({
                        children: runs.length ? runs : [new docx.TextRun('')],
                        spacing: getDefaultParagraphSpacing(docx),
                        indent: { left: listIndent, firstLine: 0 }
                    });
                    paragraphs.push(continuation);
                }
            }
        } else {
            const runs = await buildRunsFromNodes(docx, clone.childNodes, {}, labels);
            const listParagraph = new docx.Paragraph({
                children: runs.length ? runs : [new docx.TextRun('')],
                bullet: ordered ? undefined : { level: Math.min(level, 3) },
                numbering: ordered ? { reference: ORDERED_LIST_REFERENCE, level: Math.min(level, 2) } : undefined,
                spacing: getDefaultParagraphSpacing(docx),
                indent: { left: listIndent, hanging: LIST_LEVEL_INDENT_TWIPS }
            });
            paragraphs.push(listParagraph);
        }
        for (const nested of nestedLists) {
            const nestedOrdered = nested.tagName.toLowerCase() === 'ol';
            const nestedParagraphs = await buildList(docx, nested, level + 1, nestedOrdered, labels);
            paragraphs.push(...nestedParagraphs);
        }
    }
    return paragraphs;
}

async function buildBlocksFromElement(docx, element, labels, options = {}) {
    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    if (element.classList && (
        element.classList.contains('copy-btn-wrapper') ||
        element.classList.contains('copy-btn') ||
        element.classList.contains('mermaid-error-banner') ||
        element.classList.contains('vega-lite-error-banner')
    )) {
        return [];
    }
    if (element.classList && (element.classList.contains('mermaid-render-container') || element.classList.contains('vega-lite-render-container'))) {
        const svg = findDiagramSvg(element);
        if (svg) {
            const imageParagraph = await buildDiagramImageParagraph(docx, svg);
            if (imageParagraph) {
                return [imageParagraph];
            }
        }
        const source = extractDiagramSource(element);
        if (source) {
            return buildCodeParagraphs(docx, source);
        }
        return [];
    }
    if (element.classList && (
        element.classList.contains('mermaid-render-toolbar') ||
        element.classList.contains('vega-lite-toolbar') ||
        element.classList.contains('mermaid-source-toggle') ||
        element.classList.contains('vega-lite-source-toggle')
    )) {
        return [];
    }
    if (tag === 'p') {
        if (element.querySelector && element.querySelector('.katex-display')) {
            return await buildParagraphsWithDisplayMath(docx, element, labels, options);
        }
        if (element.getAttribute('data-export-spacer') === 'true') {
            const empty = await buildParagraphFromElement(docx, element, {
                labels,
                allowEmpty: true,
                runContext: { allowEmptyText: true },
                spacing: options.paragraphSpacing,
                indent: options.paragraphIndent
            });
            return empty ? [empty] : [];
        }
        if (element.getAttribute('data-export-file-name') === 'true') {
            const runs = createTextRuns(docx, element.textContent || '', {
                color: 'C00000',
                latinFont: getBodyLatinFont(),
                cjkFont: getBodyCjkFont(),
                size: BODY_FONT_SIZE_HALF_POINTS
            });
            return [new docx.Paragraph({
                children: runs.length ? runs : [new docx.TextRun('')],
                spacing: getDefaultParagraphSpacing(docx),
                alignment: docx.AlignmentType.LEFT,
                indent: { firstLine: 0 }
            })];
        }
        if (element.getAttribute('data-export-file-content') === 'true') {
            const runs = createTextRuns(docx, element.textContent || '', {
                preserveWhitespace: true,
                latinFont: getBodyLatinFont(),
                cjkFont: getBodyCjkFont(),
                size: BODY_FONT_SIZE_HALF_POINTS
            });
            return [new docx.Paragraph({
                children: runs.length ? runs : [new docx.TextRun('')],
                spacing: getDefaultParagraphSpacing(docx),
                alignment: docx.AlignmentType.LEFT,
                indent: { firstLine: 0 }
            })];
        }
        const paragraph = await buildParagraphFromElement(docx, element, {
            labels,
            runContext: options.runContext,
            alignment: options.paragraphAlignment,
            spacing: options.paragraphSpacing,
            indent: options.paragraphIndent
        });
        return paragraph ? [paragraph] : [];
    }
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
        const headingMap = {
            h1: docx.HeadingLevel.HEADING_1,
            h2: docx.HeadingLevel.HEADING_2,
            h3: docx.HeadingLevel.HEADING_3,
            h4: docx.HeadingLevel.HEADING_4,
            h5: docx.HeadingLevel.HEADING_5,
            h6: docx.HeadingLevel.HEADING_6
        };
        const role = element.getAttribute('data-export-role');
        if (role === 'user' || role === 'assistant') {
            const roleColor = role === 'assistant' ? ASSISTANT_HEADING_COLOR : USER_HEADING_COLOR;
            const paragraph = await buildParagraphFromElement(docx, element, {
                style: 'SpeakerLabel',
                labels,
                runContext: { color: roleColor },
                indent: { firstLine: 0 }
            });
            return paragraph ? [paragraph] : [];
        }
        const heading = headingMap[tag] || docx.HeadingLevel.HEADING_1;
        const paragraph = await buildParagraphFromElement(docx, element, {
            heading,
            labels,
            runContext: { latinFont: getBodyLatinFont(), cjkFont: getHeadingCjkFont() },
            indent: { firstLine: 0 }
        });
        return paragraph ? [paragraph] : [];
    }
    if (tag === 'pre') {
        const code = element.textContent || '';
        return buildCodeParagraphs(docx, code);
    }
    if (tag === 'blockquote') {
        const paragraph = await buildParagraphFromElement(docx, element, {
            runContext: { italics: true, cjkFont: getQuoteCjkFont(), latinFont: getQuoteLatinFont() },
            labels
        });
        return paragraph ? [paragraph] : [];
    }
    if (tag === 'ul' || tag === 'ol') {
        return await buildList(docx, element, 0, tag === 'ol', labels);
    }
    if (tag === 'table') {
        const blocks = [];
        const caption = element.querySelector('caption');
        if (caption && caption.textContent) {
            blocks.push(buildCaptionParagraph(docx, caption.textContent, {
                latinFont: getBodyLatinFont(),
                cjkFont: getHeadingCjkFont(),
                size: TABLE_CAPTION_SIZE_HALF_POINTS,
                bold: true,
                spacing: { before: 0, after: TABLE_CAPTION_AFTER_TWIPS }
            }));
        }
        blocks.push(await buildTable(docx, element, labels));
        return blocks;
    }
    if (element.classList && element.classList.contains('table-wrapper')) {
        const table = element.querySelector('table');
        if (table) {
            return [await buildTable(docx, table, labels)];
        }
    }
    if (tag === 'img') {
        return [await buildImageParagraph(docx, element, labels)];
    }
    if (element.classList && element.classList.contains('katex-display')) {
        const displayParagraph = buildDisplayMathParagraph(docx, element);
        return displayParagraph ? [displayParagraph] : [];
    }
    if (tag === 'figure') {
        const blocks = [];
        const img = element.querySelector('img');
        if (img) {
            blocks.push(await buildImageParagraph(docx, img, labels));
        }
        const caption = element.querySelector('figcaption');
        if (caption) {
            blocks.push(buildCaptionParagraph(docx, caption.textContent || '', {
                latinFont: getBodyLatinFont(),
                cjkFont: getHeadingCjkFont(),
                size: FIGURE_CAPTION_SIZE_HALF_POINTS,
                bold: true,
                spacing: { before: 0, after: FIGURE_CAPTION_AFTER_TWIPS }
            }));
        }
        return blocks;
    }
    return await buildBlocksFromChildren(docx, element, labels, options);
}

async function buildBlocksFromChildren(docx, element, labels, options = {}) {
    const blocks = [];
    const hasBlockDescendant = !!element.querySelector(
        'p,h1,h2,h3,h4,h5,h6,pre,ul,ol,table,blockquote,figure,img,.table-wrapper,.katex-display,.mermaid-render-container,.vega-lite-render-container'
    );

    if (!hasBlockDescendant) {
        const paragraph = await buildParagraphFromElement(docx, element, {
            labels,
            runContext: options.runContext,
            alignment: options.paragraphAlignment,
            spacing: options.paragraphSpacing,
            indent: options.paragraphIndent
        });
        return paragraph ? [paragraph] : [];
    }

    for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            const text = normalizeTextForRun(child.textContent || '', false).trim();
            if (text) {
                const spacing = options.paragraphSpacing
                    ? { ...getDefaultParagraphSpacing(docx), ...options.paragraphSpacing }
                    : getDefaultParagraphSpacing(docx);
                blocks.push(new docx.Paragraph({
                    children: createTextRuns(docx, text, options.runContext || {}),
                    alignment: options.paragraphAlignment,
                    spacing,
                    indent: options.paragraphIndent
                }));
            }
            continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const childBlocks = await buildBlocksFromElement(docx, child, labels, options);
        blocks.push(...childBlocks);
    }
    return blocks;
}

function buildParagraphsFromText(docx, text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const spacing = getDefaultParagraphSpacing(docx);
    return lines.map(line => new docx.Paragraph({ children: createTextRuns(docx, line), spacing }));
}

function buildDocument(docx, children, options = {}) {
    const numbering = {
        config: [
            {
                reference: ORDERED_LIST_REFERENCE,
                levels: [
                    {
                        level: 0,
                        format: docx.LevelFormat.DECIMAL,
                        text: '%1.',
                        alignment: docx.AlignmentType.START
                    },
                    {
                        level: 1,
                        format: docx.LevelFormat.LOWER_LETTER,
                        text: '%2.',
                        alignment: docx.AlignmentType.START
                    },
                    {
                        level: 2,
                        format: docx.LevelFormat.LOWER_ROMAN,
                        text: '%3.',
                        alignment: docx.AlignmentType.START
                    }
                ]
            }
        ]
    };

    const headerTitle = options.headerTitle || '';
    const headerRuns = headerTitle
        ? createTextRuns(docx, headerTitle, {
            latinFont: getBodyLatinFont(),
            cjkFont: getBodyCjkFont(),
            size: HEADER_FONT_SIZE_HALF_POINTS
        })
        : [new docx.TextRun('')];
    const header = new docx.Header({
        children: [
            new docx.Paragraph({
                children: headerRuns,
                alignment: docx.AlignmentType.CENTER,
                border: {
                    bottom: {
                        style: docx.BorderStyle.SINGLE,
                        size: Math.round(HEADER_UNDERLINE_PT * 8),
                        color: '000000'
                    }
                }
            })
        ]
    });
    const footer = new docx.Footer({
        children: [
            new docx.Paragraph({
                alignment: docx.AlignmentType.CENTER,
                children: [
                    new docx.TextRun({ text: '- ', size: FOOTER_FONT_SIZE_HALF_POINTS, font: getBodyLatinFont() }),
                    new docx.TextRun({ children: [docx.PageNumber.CURRENT], size: FOOTER_FONT_SIZE_HALF_POINTS, font: getBodyLatinFont() }),
                    new docx.TextRun({ text: ' -', size: FOOTER_FONT_SIZE_HALF_POINTS, font: getBodyLatinFont() })
                ]
            })
        ]
    });

    return new docx.Document({
        sections: [{
            properties: {
                page: {
                    size: { width: A4_WIDTH_TWIPS, height: A4_HEIGHT_TWIPS },
                    margin: {
                        top: MARGIN_VERTICAL_TWIPS,
                        bottom: MARGIN_VERTICAL_TWIPS,
                        left: MARGIN_HORIZONTAL_TWIPS,
                        right: MARGIN_HORIZONTAL_TWIPS,
                        header: HEADER_OFFSET_TWIPS,
                        footer: FOOTER_OFFSET_TWIPS
                    }
                }
            },
            headers: { default: header },
            footers: { default: footer },
            children
        }],
        styles: {
            default: {
                document: {
                    run: {
                        font: getBodyLatinFont(),
                        size: BODY_FONT_SIZE_HALF_POINTS,
                        color: '000000'
                    },
                    paragraph: {
                        alignment: docx.AlignmentType.JUSTIFIED,
                        spacing: { before: 0, after: 0, line: BODY_LINE_TWIPS, lineRule: docx.LineRuleType.AUTO },
                        indent: { firstLine: FIRST_LINE_INDENT_TWIPS }
                    }
                }
            },
            paragraphStyles: [
                {
                    id: 'SpeakerLabel',
                    name: 'Speaker Label',
                    basedOn: 'Normal',
                    next: 'Normal',
                    run: {
                        bold: true,
                        size: BODY_FONT_SIZE_HALF_POINTS,
                        color: SPEAKER_LABEL_DEFAULT_COLOR,
                        fonts: {
                            ascii: getBodyLatinFont(),
                            eastAsia: getHeadingCjkFont(),
                            hAnsi: getBodyLatinFont()
                        }
                    },
                    paragraph: {
                        alignment: docx.AlignmentType.LEFT,
                        indent: { firstLine: 0 },
                        spacing: {
                            before: 240,
                            after: 40
                        },
                        keepNext: true
                    }
                },
                {
                    id: 'Heading1',
                    name: 'Heading 1',
                    basedOn: 'Normal',
                    next: 'Normal',
                    quickFormat: true,
                    run: {
                        bold: true,
                        size: HEADING_1_SIZE_HALF_POINTS,
                        color: '000000',
                        fonts: {
                            ascii: getBodyLatinFont(),
                            hAnsi: getBodyLatinFont(),
                            eastAsia: getHeadingCjkFont(),
                            cs: getBodyLatinFont()
                        }
                    },
                    paragraph: {
                        alignment: docx.AlignmentType.CENTER,
                        indent: { firstLine: 0 },
                        spacing: {
                            before: HEADING_1_SPACING_TWIPS,
                            after: HEADING_1_SPACING_TWIPS
                        }
                    }
                },
                {
                    id: 'Heading2',
                    name: 'Heading 2',
                    basedOn: 'Normal',
                    next: 'Normal',
                    quickFormat: true,
                    run: {
                        bold: true,
                        size: HEADING_2_SIZE_HALF_POINTS,
                        color: '000000',
                        fonts: {
                            ascii: getBodyLatinFont(),
                            hAnsi: getBodyLatinFont(),
                            eastAsia: getHeadingCjkFont(),
                            cs: getBodyLatinFont()
                        }
                    },
                    paragraph: {
                        alignment: docx.AlignmentType.LEFT,
                        indent: { firstLine: 0 },
                        spacing: {
                            before: HEADING_2_SPACING_TWIPS,
                            after: HEADING_2_SPACING_TWIPS
                        }
                    }
                },
                {
                    id: 'Heading3',
                    name: 'Heading 3',
                    basedOn: 'Normal',
                    next: 'Normal',
                    quickFormat: true,
                    run: {
                        bold: true,
                        size: HEADING_3_SIZE_HALF_POINTS,
                        color: '000000',
                        fonts: {
                            ascii: getBodyLatinFont(),
                            hAnsi: getBodyLatinFont(),
                            eastAsia: getHeadingCjkFont(),
                            cs: getBodyLatinFont()
                        }
                    },
                    paragraph: {
                        alignment: docx.AlignmentType.LEFT,
                        indent: { firstLine: 0 },
                        spacing: {
                            before: HEADING_2_SPACING_TWIPS,
                            after: 0
                        }
                    }
                }
            ],
            characterStyles: [
                {
                    id: 'Hyperlink',
                    name: 'Hyperlink',
                    run: {
                        color: LINK_COLOR,
                        underline: { type: docx.UnderlineType.SINGLE },
                        fonts: {
                            ascii: getBodyLatinFont(),
                            hAnsi: getBodyLatinFont(),
                            eastAsia: getBodyCjkFont(),
                            cs: getBodyLatinFont()
                        }
                    }
                },
                {
                    id: 'FollowedHyperlink',
                    name: 'Followed Hyperlink',
                    run: {
                        color: LINK_COLOR,
                        underline: { type: docx.UnderlineType.SINGLE },
                        fonts: {
                            ascii: getBodyLatinFont(),
                            hAnsi: getBodyLatinFont(),
                            eastAsia: getBodyCjkFont(),
                            cs: getBodyLatinFont()
                        }
                    }
                }
            ]
        },
        numbering
    });
}

export async function exportTextAsDocx({ text, filename, loadScript, contentElement, labels, headerTitle, locale }) {
    const docx = await loadDocxLib(loadScript);
    setActiveFontProfile(locale || null);
    const safeName = filename && filename.toLowerCase().endsWith('.docx')
        ? filename
        : `${filename || 'export'}.docx`;
    let children = [];
    if (contentElement) {
        children = await buildBlocksFromChildren(docx, contentElement, labels);
    }
    if (!children.length) {
        children = buildParagraphsFromText(docx, text || '');
    }
    const doc = buildDocument(docx, children, { headerTitle });
    const blob = await docx.Packer.toBlob(doc);
    if (typeof window !== 'undefined' && typeof window.__saveFileFromBlob === 'function') {
        await window.__saveFileFromBlob(blob, safeName);
        return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

import { API_BASE_URL, isNativeApp } from '../api-config.js';

const BODY_LATIN_FONT = 'NotoSerif';
const BODY_CJK_SERIF_PREFIX = 'NotoSerifCJK';
const HEADING_CJK_SANS_PREFIX = 'NotoSansCJK';
const CODE_FONT = 'JetBrainsMono';
const MATH_FONT = 'STIXTwoMath';

const FONT_BASE_URL = (isNativeApp && API_BASE_URL)
    ? `${API_BASE_URL}/fonts/`
    : '/fonts/';
const PRINT_TIMEOUT_MS = 3000;

const TWIP_TO_PT = 1 / 20;
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const MARGIN_VERTICAL_PT = 1440 * TWIP_TO_PT;
const MARGIN_HORIZONTAL_PT = 1800 * TWIP_TO_PT;
const BODY_FONT_SIZE_PT = 12;
const HEADING_1_SIZE_PT = 16;
const HEADING_2_SIZE_PT = 14;
const HEADING_3_SIZE_PT = 12;
const BODY_LINE_HEIGHT = 1.5;
const HEADING_1_SPACING_PT = 12;
const HEADING_2_SPACING_PT = 12;
const FIRST_LINE_INDENT_PT = 24;
const IMAGE_SPACING_BEFORE_PT = 12;
const IMAGE_SPACING_AFTER_PT = 6;
const CAPTION_SIZE_PT = 10.5;
const TABLE_BORDER_TOP_BOTTOM_PT = 1.5;
const TABLE_BORDER_HEADER_PT = 0.75;

const ASSISTANT_HEADING_COLOR = '#1D4ED8';
const USER_HEADING_COLOR = '#D97706';
const CODE_BLOCK_BG_COLOR = '#F5F5F5';
const CODE_BLOCK_BORDER_COLOR = '#DDDDDD';
const DIAGRAM_EXPORT_SCALE = 2;
const DIAGRAM_EXPORT_MAX_SIZE = 2400;
const EMOJI_FONT = 'NotoEmoji';
const EMOJI_FONT_URL = '/libs/fonts/NotoEmoji-Regular.ttf';
const PDF_WORKER_URL = '/workers/pdf-export-worker.js';
const PDF_WORKER_PAGE_THRESHOLD = 40;
const PDF_WORKER_CHAR_PER_PAGE = 1200;
const PDF_WORKER_TIMEOUT_MS = 120000;

const CJK_REGEX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const CJK_PUNCT_REGEX = /[\u3000-\u303F\uFF00-\uFFEF]/;
const SYMBOL_REGEX = /[\u2190-\u21FF\u2300-\u23FF\u2460-\u24FF\u25A0-\u25FF\u2600-\u27BF\u27F0-\u27FF\u2B00-\u2BFF]/u;
const INLINE_MATH_REGEX = /(\$\$[^$\n]+\$\$|\$[^$\n]+\$|\\\([^)]*\\\))/g;

const FONT_FILES = {
    latin: {
        normal: 'NotoSerif-Regular.ttf',
        bold: 'NotoSerif-Bold.ttf',
        italics: 'NotoSerif-Italic.ttf',
        bolditalics: 'NotoSerif-BoldItalic.ttf'
    },
    emoji: {
        normal: 'NotoEmoji-Regular.ttf'
    },
    math: {
        normal: 'STIXTwoMath-Regular.otf'
    },
    mono: {
        normal: 'JetBrainsMono-Regular.ttf',
        bold: 'JetBrainsMono-Bold.ttf',
        italics: 'JetBrainsMono-Italic.ttf',
        bolditalics: 'JetBrainsMono-BoldItalic.ttf'
    },
    cjk: {
        sc: {
            serif: {
                normal: 'NotoSerifCJKsc-Regular.otf',
                bold: 'NotoSerifCJKsc-Bold.otf'
            },
            sans: { bold: 'NotoSansCJKsc-Bold.otf' }
        },
        tc: {
            serif: {
                normal: 'NotoSerifCJKtc-Regular.otf',
                bold: 'NotoSerifCJKtc-Bold.otf'
            },
            sans: { bold: 'NotoSansCJKtc-Bold.otf' }
        },
        jp: {
            serif: {
                normal: 'NotoSerifCJKjp-Regular.otf',
                bold: 'NotoSerifCJKjp-Bold.otf'
            },
            sans: { bold: 'NotoSansCJKjp-Bold.otf' }
        },
        kr: {
            serif: {
                normal: 'NotoSerifCJKkr-Regular.otf',
                bold: 'NotoSerifCJKkr-Bold.otf'
            },
            sans: { bold: 'NotoSansCJKkr-Bold.otf' }
        }
    }
};

const fontLoadCache = new Map();
let pdfMakeReadyPromise = null;

function estimatePdfPageCount(contentElement, fallbackText) {
    const raw = (contentElement && contentElement.textContent) ? contentElement.textContent : (fallbackText || '');
    const normalized = String(raw || '').trim();
    if (!normalized) return 0;
    return Math.ceil(normalized.length / PDF_WORKER_CHAR_PER_PAGE);
}

function shouldUsePdfWorker(estimatedPages) {
    return typeof Worker !== 'undefined' && estimatedPages >= PDF_WORKER_PAGE_THRESHOLD;
}

async function downloadPdfBlob(blob, filename) {
    if (typeof window !== 'undefined' && typeof window.__saveFileFromBlob === 'function') {
        await window.__saveFileFromBlob(blob, filename);
        return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

function renderPdfWithWorker({ docDefinition, fonts, vfs, footerConfig }) {
    return new Promise((resolve, reject) => {
        if (typeof Worker === 'undefined') {
            reject(new Error('worker_unavailable'));
            return;
        }
        const worker = new Worker(PDF_WORKER_URL);
        const requestId = `pdf_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const timeoutId = setTimeout(() => {
            worker.terminate();
            reject(new Error('pdf_worker_timeout'));
        }, PDF_WORKER_TIMEOUT_MS);

        worker.onmessage = (event) => {
            const data = event.data || {};
            if (data.requestId !== requestId) return;
            if (data.type === 'result') {
                clearTimeout(timeoutId);
                worker.terminate();
                resolve(data.buffer);
            } else if (data.type === 'error') {
                clearTimeout(timeoutId);
                worker.terminate();
                reject(new Error(data.message || 'pdf_worker_failed'));
            }
        };

        worker.onerror = (event) => {
            clearTimeout(timeoutId);
            worker.terminate();
            reject(event.error || new Error(event.message || 'pdf_worker_failed'));
        };

        worker.postMessage({
            type: 'render',
            requestId,
            docDefinition,
            fonts,
            vfs,
            footerConfig
        });
    });
}

function resolveLocaleKey(locale) {
    const normalized = String(locale || '').toLowerCase();
    if (normalized.startsWith('zh')) {
        if (normalized.includes('tw') || normalized.includes('hk') || normalized.includes('hant')) {
            return 'tc';
        }
        return 'sc';
    }
    if (normalized.startsWith('ja')) return 'jp';
    if (normalized.startsWith('ko')) return 'kr';
    return 'sc';
}

function sanitizeFilename(name) {
    const cleaned = String(name || '').trim() || 'export';
    return cleaned.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

async function loadPdfMake(loadScript) {
    if (!pdfMakeReadyPromise) {
        pdfMakeReadyPromise = (async () => {
            await loadScript('/libs/pdfmake.min.js', 'pdfMake');
            await loadScript('/libs/vfs_fonts.js');
            return window.pdfMake;
        })();
    }
    return pdfMakeReadyPromise;
}

async function fetchFontData(url) {
    if (fontLoadCache.has(url)) {
        return fontLoadCache.get(url);
    }
    const promise = (async () => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Font fetch failed: ${url}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    })();
    fontLoadCache.set(url, promise);
    return promise;
}

async function ensurePdfFonts(pdfMake, locale) {
    const localeKey = resolveLocaleKey(locale);
    const serif = FONT_FILES.cjk[localeKey].serif;
    const sans = FONT_FILES.cjk[localeKey].sans;

    const fontEntries = [
        FONT_FILES.latin.normal,
        FONT_FILES.latin.bold,
        FONT_FILES.latin.italics,
        FONT_FILES.latin.bolditalics,
        FONT_FILES.mono.normal,
        FONT_FILES.mono.bold,
        FONT_FILES.mono.italics,
        FONT_FILES.mono.bolditalics,
        FONT_FILES.math.normal,
        serif.normal,
        serif.bold,
        sans.bold
    ];

    const vfsUpdates = {};
    await Promise.all(fontEntries.map(async (file) => {
        if (pdfMake.vfs && pdfMake.vfs[file]) return;
        const data = await fetchFontData(`${FONT_BASE_URL}${file}`);
        vfsUpdates[file] = data;
    }));
    if (!pdfMake.vfs || !pdfMake.vfs[FONT_FILES.emoji.normal]) {
        const emojiData = await fetchFontData(EMOJI_FONT_URL);
        vfsUpdates[FONT_FILES.emoji.normal] = emojiData;
    }

    pdfMake.vfs = {
        ...(pdfMake.vfs || {}),
        ...vfsUpdates
    };

    pdfMake.fonts = {
        ...(pdfMake.fonts || {}),
        [BODY_LATIN_FONT]: {
            normal: FONT_FILES.latin.normal,
            bold: FONT_FILES.latin.bold,
            italics: FONT_FILES.latin.italics,
            bolditalics: FONT_FILES.latin.bolditalics
        },
        [MATH_FONT]: {
            normal: FONT_FILES.math.normal,
            bold: FONT_FILES.math.normal,
            italics: FONT_FILES.math.normal,
            bolditalics: FONT_FILES.math.normal
        },
        [EMOJI_FONT]: {
            normal: FONT_FILES.emoji.normal,
            bold: FONT_FILES.emoji.normal,
            italics: FONT_FILES.emoji.normal,
            bolditalics: FONT_FILES.emoji.normal
        },
        [CODE_FONT]: {
            normal: FONT_FILES.mono.normal,
            bold: FONT_FILES.mono.bold,
            italics: FONT_FILES.mono.italics,
            bolditalics: FONT_FILES.mono.bolditalics
        },
        [`${BODY_CJK_SERIF_PREFIX}${localeKey}`]: {
            normal: serif.normal,
            bold: serif.bold,
            italics: serif.normal,
            bolditalics: serif.bold
        },
        [`${HEADING_CJK_SANS_PREFIX}${localeKey}`]: {
            normal: sans.bold,
            bold: sans.bold,
            italics: sans.bold,
            bolditalics: sans.bold
        }
    };
}

function isCjkChar(char) {
    if (!char) return false;
    return CJK_REGEX.test(char) || CJK_PUNCT_REGEX.test(char) || SYMBOL_REGEX.test(char);
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
    INLINE_MATH_REGEX.lastIndex = 0;
    let lastIndex = 0;
    let match;
    while ((match = INLINE_MATH_REGEX.exec(text)) !== null) {
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

function stripMathDelimiters(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    if (raw.startsWith('$$') && raw.endsWith('$$')) {
        return raw.slice(2, -2).trim();
    }
    if (raw.startsWith('$') && raw.endsWith('$')) {
        return raw.slice(1, -1).trim();
    }
    if (raw.startsWith('\\(') && raw.endsWith('\\)')) {
        return raw.slice(2, -2).trim();
    }
    return raw;
}

function isEmojiGrapheme(text) {
    if (!text) return false;
    return /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(text);
}

function splitTextByEmoji(text) {
    if (!text) return [];
    const segments = [];
    const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
        ? new Intl.Segmenter('en', { granularity: 'grapheme' })
        : null;
    const graphemes = segmenter
        ? Array.from(segmenter.segment(text), part => part.segment)
        : Array.from(text);
    let buffer = '';
    graphemes.forEach((grapheme) => {
        if (isEmojiGrapheme(grapheme)) {
            if (buffer) {
                segments.push({ type: 'text', value: buffer });
                buffer = '';
            }
            segments.push({ type: 'emoji', value: grapheme });
            return;
        }
        buffer += grapheme;
    });
    if (buffer) {
        segments.push({ type: 'text', value: buffer });
    }
    return segments;
}


function normalizeTextForRun(text, preserveWhitespace) {
    const raw = String(text || '');
    if (preserveWhitespace) {
        return raw.replace(/\r\n/g, '\n');
    }
    const collapsed = raw.replace(/\s+/g, ' ').replace(/\r\n/g, '\n');
    return collapsed.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303F\uFF00-\uFFEF\u2190-\u21FF\u25A0-\u25FF\u27F0-\u27FF])\s+([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303F\uFF00-\uFFEF\u2190-\u21FF\u25A0-\u25FF\u27F0-\u27FF])/gu, '$1$2');
}

function getLocaleFontNames(locale) {
    const key = resolveLocaleKey(locale);
    return {
        bodyLatin: BODY_LATIN_FONT,
        bodyCjk: `${BODY_CJK_SERIF_PREFIX}${key}`,
        headingCjk: `${HEADING_CJK_SANS_PREFIX}${key}`,
        code: CODE_FONT,
        emoji: EMOJI_FONT,
        math: MATH_FONT
    };
}

function buildTextRunsFromNodes(nodes, context, locale) {
    const runs = [];
    const fonts = getLocaleFontNames(locale);
    const addSegmentRuns = (text, segmentContext) => {
        const normalized = normalizeTextForRun(text, segmentContext.preserveWhitespace);
        if (!normalized) return;
        const parts = normalized.split('\n');
        parts.forEach((part, index) => {
            const emojiSegments = splitTextByEmoji(part);
            emojiSegments.forEach((emojiSegment, emojiIndex) => {
                if (emojiSegment.type === 'emoji') {
                    runs.push({
                        text: emojiSegment.value,
                        font: fonts.emoji,
                        fontSize: segmentContext.fontSize || undefined
                    });
                    return;
                }
                const segments = splitTextByScript(emojiSegment.value);
                segments.forEach((segment, segmentIndex) => {
                    const font = segmentContext.fontOverride
                        || (segmentContext.code
                            ? (segment.isCjk ? fonts.bodyCjk : fonts.code)
                            : (segment.isCjk ? (segmentContext.heading ? fonts.headingCjk : fonts.bodyCjk) : fonts.bodyLatin));
                    const run = {
                        text: segment.text,
                        bold: segmentContext.bold || undefined,
                        italics: segmentContext.italics || undefined,
                        color: segmentContext.color || undefined,
                        decoration: segmentContext.underline ? 'underline' : undefined,
                        link: segmentContext.link || undefined,
                        font,
                        fontSize: segmentContext.fontSize || undefined,
                        background: segmentContext.background || undefined
                    };
                    if (index > 0 && emojiIndex === 0 && segmentIndex === 0) {
                        run.text = `\n${run.text}`;
                    }
                    runs.push(run);
                });
            });
        });
    };
    const addMathRun = (mathText, segmentContext) => {
        const cleaned = stripMathDelimiters(mathText);
        if (!cleaned) return;
        runs.push({
            text: cleaned,
            font: fonts.math,
            bold: segmentContext.bold || undefined,
            italics: segmentContext.italics || undefined,
            color: segmentContext.color || undefined
        });
    };

    nodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const rawText = node.textContent || '';
            if (!context.preserveWhitespace && rawText.trim() === '' && !context.allowEmptyText) {
                return;
            }
            const segments = splitTextByInlineMath(rawText);
            if (!segments.length) {
                addSegmentRuns(rawText, context);
                return;
            }
            segments.forEach((segment) => {
                if (segment.type === 'math') {
                    addMathRun(segment.value, context);
                } else {
                    addSegmentRuns(segment.value, context);
                }
            });
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node;
        const tag = element.tagName.toLowerCase();
        if (tag === 'br') {
            runs.push({ text: '\n' });
            return;
        }
        if (tag === 'strong' || tag === 'b') {
            runs.push(...buildTextRunsFromNodes(Array.from(element.childNodes), { ...context, bold: true }, locale));
            return;
        }
        if (tag === 'em' || tag === 'i') {
            runs.push(...buildTextRunsFromNodes(Array.from(element.childNodes), { ...context, italics: true }, locale));
            return;
        }
        if (tag === 'code') {
            runs.push(...buildTextRunsFromNodes(Array.from(element.childNodes), { ...context, code: true, preserveWhitespace: true }, locale));
            return;
        }
        if (tag === 'a') {
            const link = element.getAttribute('href') || '';
            const anchorNodes = element.childNodes && element.childNodes.length ? Array.from(element.childNodes) : [];
            const normalizedContext = { ...context, underline: false, color: undefined, link: undefined, bold: true };
            if (!anchorNodes.length && link) {
                runs.push(...buildTextRunsFromText(link, normalizedContext, locale));
                return;
            }
            runs.push(...buildTextRunsFromNodes(anchorNodes, normalizedContext, locale));
            return;
        }
        if (element.classList.contains('katex')) {
            const tex = extractKatexTex(element);
            if (tex) {
                addSegmentRuns(tex, { ...context, fontOverride: fonts.math });
            }
            return;
        }
        if (element.classList.contains('katex-display')) {
            const tex = extractKatexTex(element);
            if (tex) {
                addSegmentRuns(tex, { ...context, fontOverride: fonts.math });
            }
            return;
        }
        runs.push(...buildTextRunsFromNodes(Array.from(element.childNodes), context, locale));
    });

    return runs;
}

function buildTextRunsFromText(text, context, locale) {
    const fonts = getLocaleFontNames(locale);
    const runs = [];
    const normalized = normalizeTextForRun(text, context.preserveWhitespace);
    if (!normalized) return [];
    const parts = normalized.split('\n');
    parts.forEach((part, index) => {
        const inlineSegments = splitTextByInlineMath(part);
        if (!inlineSegments.length) {
            inlineSegments.push({ type: 'text', value: part });
        }
        inlineSegments.forEach((segment, segmentIndex) => {
            if (segment.type === 'math') {
                const run = {
                    text: stripMathDelimiters(segment.value),
                    font: fonts.bodyLatin,
                    bold: context.bold || undefined,
                    italics: context.italics || undefined,
                    color: context.color || undefined
                };
                if (index > 0 && segmentIndex === 0) {
                    run.text = `\n${run.text}`;
                }
                runs.push(run);
                return;
            }
            const emojiSegments = splitTextByEmoji(segment.value);
            emojiSegments.forEach((emojiSegment, emojiIndex) => {
                if (emojiSegment.type === 'emoji') {
                    runs.push({
                        text: emojiSegment.value,
                        font: fonts.emoji,
                        fontSize: context.fontSize || undefined
                    });
                    return;
                }
                const segments = splitTextByScript(emojiSegment.value);
                segments.forEach((subSegment, subIndex) => {
                    const font = context.fontOverride
                        || (context.code
                            ? (subSegment.isCjk ? fonts.bodyCjk : fonts.code)
                            : (subSegment.isCjk ? (context.heading ? fonts.headingCjk : fonts.bodyCjk) : fonts.bodyLatin));
                    const run = {
                        text: subSegment.text,
                        bold: context.bold || undefined,
                        italics: context.italics || undefined,
                        color: context.color || undefined,
                        decoration: context.underline ? 'underline' : undefined,
                        link: context.link || undefined,
                        font,
                        fontSize: context.fontSize || undefined,
                        background: context.background || undefined
                    };
                    if (index > 0 && segmentIndex === 0 && emojiIndex === 0 && subIndex === 0) {
                        run.text = `\n${run.text}`;
                    }
                    runs.push(run);
                });
            });
        });
    });
    return runs;
}

function trimLeadingWhitespaceRuns(runs) {
    if (!Array.isArray(runs)) return;
    for (const run of runs) {
        if (!run || typeof run.text !== 'string') continue;
        const trimmed = run.text.replace(/^\s+/, '');
        run.text = trimmed;
        if (trimmed) break;
    }
}

function extractKatexTex(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';
    const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
    if (annotation && annotation.textContent) return annotation.textContent;
    return node.textContent || '';
}

function buildParagraphFromElement(element, locale, options = {}) {
    const runs = buildTextRunsFromNodes(Array.from(element.childNodes), options.runContext || {}, locale);
    if (!runs.length && !options.allowEmpty) {
        return null;
    }
    return {
        text: runs.length ? runs : [{ text: '' }],
        style: options.style || 'body',
        alignment: options.alignment,
        margin: options.margin
    };
}

function buildCodeBlock(code, locale) {
    return {
        text: buildTextRunsFromText(code || '', { code: true, preserveWhitespace: true }, locale),
        style: 'codeBlock',
        margin: [0, 6, 0, 6]
    };
}

function buildCaption(text, locale) {
    if (!text) return null;
    return {
        text: buildTextRunsFromText(text, { heading: true }, locale),
        style: 'caption'
    };
}

function inlineComputedStyles(sourceSvg, targetSvg) {
    if (!sourceSvg || !targetSvg || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return;
    const relevantStyles = [
        'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
        'color', 'text-align', 'text-decoration',
        'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
        'background-color', 'opacity', 'display', 'visibility'
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
        relevantStyles.forEach((prop) => {
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

async function svgToPngDataUrl(svgEl) {
    if (!svgEl) return null;
    const source = serializeSvgForExport(svgEl);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
    const img = await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = svgUrl;
    });
    if (!img) return null;
    const { width, height } = getSvgDimensions(svgEl);
    const canvas = document.createElement('canvas');
    const safeScale = Math.min(4, Math.max(1, DIAGRAM_EXPORT_SCALE));
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
    return { dataUrl: canvas.toDataURL('image/png'), width, height };
}

function fitImageDimensions(width, height, maxWidth) {
    if (!width || !height) {
        return { width: maxWidth };
    }
    const ratio = Math.min(1, maxWidth / width);
    return { width: width * ratio, height: height * ratio };
}

async function imageToDataUrl(src) {
    if (!src) return null;
    if (src.startsWith('data:')) return src;
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
    });
}

async function buildImageBlock(img) {
    const src = img.getAttribute('src') || '';
    const dataUrl = await imageToDataUrl(src);
    if (!dataUrl) {
        return { text: '[image unavailable]', style: 'body', color: '#666666' };
    }
    const naturalWidth = img.naturalWidth || Number(img.getAttribute('width')) || 0;
    const naturalHeight = img.naturalHeight || Number(img.getAttribute('height')) || 0;
    const contentWidth = A4_WIDTH_PT - (MARGIN_HORIZONTAL_PT * 2);
    const size = fitImageDimensions(naturalWidth, naturalHeight, contentWidth);
    return {
        image: dataUrl,
        width: size.width,
        height: size.height,
        margin: [0, IMAGE_SPACING_BEFORE_PT, 0, IMAGE_SPACING_AFTER_PT]
    };
}

async function buildSvgBlock(svg) {
    const contentWidth = A4_WIDTH_PT - (MARGIN_HORIZONTAL_PT * 2);
    const contentHeight = A4_HEIGHT_PT - (MARGIN_VERTICAL_PT * 2);
    const svgData = await svgToPngDataUrl(svg);
    if (!svgData) return null;
    const { dataUrl, width, height } = svgData;
    const ratio = Math.min(
        1,
        contentWidth / (width || contentWidth),
        contentHeight / (height || contentHeight)
    );
    const targetWidth = (width || contentWidth) * ratio;
    const targetHeight = (height || contentHeight) * ratio;
    return {
        image: dataUrl,
        width: targetWidth,
        height: targetHeight,
        margin: [0, IMAGE_SPACING_BEFORE_PT, 0, IMAGE_SPACING_AFTER_PT]
    };
}

function tableLayout() {
    return {
        hLineWidth: (i, node) => {
            if (i === 0 || i === node.table.body.length) return TABLE_BORDER_TOP_BOTTOM_PT;
            if (i === 1 && node.table.headerRows) return TABLE_BORDER_HEADER_PT;
            return 0.5;
        },
        vLineWidth: () => 0,
        hLineColor: '#000000',
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 4,
        paddingBottom: () => 4
    };
}

async function buildTable(tableEl, locale) {
    const rows = Array.from(tableEl.querySelectorAll('tr'));
    if (!rows.length) return null;
    const headerRows = tableEl.querySelectorAll('thead tr').length || 0;
    const colCount = rows.reduce((max, row) => {
        const cells = Array.from(row.children).filter((node) => node.tagName && /^(td|th)$/i.test(node.tagName));
        return Math.max(max, cells.length);
    }, 0);
    const body = [];

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        const isHeaderRow = headerRows > 0 ? rowIndex < headerRows : row.querySelectorAll('th').length > 0;
        const cells = Array.from(row.children).filter((node) => node.tagName && /^(td|th)$/i.test(node.tagName));
        const rowCells = [];
        for (const cell of cells) {
            const isHeaderCell = isHeaderRow || (cell.tagName && cell.tagName.toLowerCase() === 'th');
            const cellBlocks = await buildBlocksFromChildren(cell, locale, {
                inline: true,
                tableCell: true,
                tableHeader: isHeaderCell
            });
            const fallbackStyle = isHeaderCell ? 'tableHeader' : 'tableCell';
            rowCells.push(cellBlocks.length ? cellBlocks : [{ text: '', style: fallbackStyle }]);
        }
        while (rowCells.length < colCount) {
            rowCells.push({ text: '', style: 'tableCell' });
        }
        body.push(rowCells);
    }

    return {
        table: {
            headerRows,
            widths: Array(colCount || 1).fill('*'),
            body
        },
        layout: tableLayout(),
        style: 'table',
        alignment: 'center',
        dontBreakRows: true
    };
}

function applyListItemStyle(block) {
    if (!block || typeof block !== 'object') return block;
    if (block.style) {
        block.style = Array.isArray(block.style) ? ['listItem', ...block.style] : ['listItem', block.style];
        return block;
    }
    block.style = 'listItem';
    return block;
}

function flattenListItemRuns(listItem, locale) {
    const runs = [];
    const children = Array.from(listItem.childNodes || []);
    let first = true;
    children.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = normalizeTextForRun(node.textContent || '', false);
            if (!text.trim()) return;
            if (!first) runs.push({ text: ' ' });
            runs.push(...buildTextRunsFromNodes([node], { allowEmptyText: true }, locale));
            first = false;
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName.toLowerCase();
        if (tag === 'ul' || tag === 'ol') return;
        const childRuns = buildTextRunsFromNodes(Array.from(node.childNodes), { allowEmptyText: true }, locale);
        if (!childRuns.length) return;
        if (!first) runs.push({ text: ' ' });
        runs.push(...childRuns);
        first = false;
    });
    return runs;
}

async function buildList(listEl, locale, level = 0, ordered = false) {
    const items = [];
    const children = Array.from(listEl.children).filter((child) => child.tagName && child.tagName.toLowerCase() === 'li');
    for (const li of children) {
        const hasNestedList = !!li.querySelector('ul,ol');
        if (!hasNestedList) {
            const runs = flattenListItemRuns(li, locale);
            if (runs.length) {
                items.push({ text: runs, style: 'listItem' });
                continue;
            }
        }
        const blocks = await buildBlocksFromChildren(li, locale, { listItem: true });
        if (blocks.length === 1) {
            items.push(applyListItemStyle(blocks[0]));
        } else {
            items.push({ stack: blocks, style: 'listItem' });
        }
    }
    const typeMap = ['decimal', 'lower-alpha', 'lower-roman'];
    const listType = ordered ? typeMap[Math.min(level, 2)] : undefined;
    if (ordered) {
        return [{
            ol: items,
            type: listType,
            style: 'list'
        }];
    }
    return [{
        ul: items,
        style: 'list'
    }];
}

function isSkippablePunctuationText(text) {
    const trimmed = String(text || '').trim();
    return trimmed === ':' || trimmed === '：';
}

function isPunctuationOnlyText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return false;
    return /^[\p{P}\p{S}]+$/u.test(trimmed);
}

function extractPlainTextFromBlock(block) {
    if (!block) return '';
    if (typeof block.text === 'string') return block.text;
    if (!Array.isArray(block.text)) return '';
    return block.text.map((run) => (run && typeof run.text === 'string' ? run.text : '')).join('');
}

function isMergeableTextBlock(block) {
    if (!block || typeof block !== 'object') return false;
    if (!Array.isArray(block.text)) return false;
    const style = block.style;
    const allowed = new Set(['body', 'listBody', 'fileContent', 'fileName', 'blockquote', 'speakerAssistant', 'speakerUser']);
    if (Array.isArray(style)) {
        return style.some((entry) => allowed.has(entry));
    }
    return allowed.has(style);
}

function isInlineElementTag(tag) {
    if (!tag) return false;
    return [
        'span', 'a', 'em', 'i', 'strong', 'b', 'code', 'kbd', 'sup', 'sub', 'small'
    ].includes(tag);
}

async function buildBlocksFromElement(element, locale, options = {}) {
    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    if (element.classList && (
        element.classList.contains('copy-btn-wrapper') ||
        element.classList.contains('copy-btn') ||
        element.classList.contains('mermaid-error-banner') ||
        element.classList.contains('vega-lite-error-banner')
    )) {
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
    if (element.classList && element.classList.contains('katex')) {
        const tex = extractKatexTex(element);
        if (!tex) return [];
        return [{
            text: buildTextRunsFromText(tex, { fontOverride: BODY_LATIN_FONT }, locale),
            style: options.tableHeader ? 'tableHeader' : (options.tableCell ? 'tableCell' : (options.listItem ? 'listBody' : 'body')),
            _mergeWithPrevious: true
        }];
    }
    if (element.classList && (element.classList.contains('mermaid-render-container') || element.classList.contains('vega-lite-render-container'))) {
        const svg = findDiagramSvg(element);
        if (svg) {
            const svgBlock = await buildSvgBlock(svg);
            return svgBlock ? [svgBlock] : [];
        }
    }
    if (element.classList && element.classList.contains('katex-display')) {
        const tex = extractKatexTex(element);
        if (!tex) return [];
        return [{
            text: buildTextRunsFromText(tex, { fontOverride: BODY_LATIN_FONT }, locale),
            style: 'body',
            alignment: 'center',
            margin: [0, 6, 0, 6]
        }];
    }
    if (tag === 'p') {
        if (element.getAttribute('data-export-spacer') === 'true') {
            return [{ text: '', style: 'body', margin: [0, 0, 0, 0] }];
        }
        if (element.getAttribute('data-export-file-name') === 'true') {
            return [buildParagraphFromElement(element, locale, {
                style: 'fileName',
                runContext: { color: '#C00000', bold: false }
            })].filter(Boolean);
        }
        if (element.getAttribute('data-export-file-content') === 'true') {
            return [buildParagraphFromElement(element, locale, {
                style: 'fileContent',
                runContext: { preserveWhitespace: true }
            })].filter(Boolean);
        }
        if (isSkippablePunctuationText(element.textContent || '')) {
            return [];
        }
        if (isPunctuationOnlyText(element.textContent || '')) {
            return [{
                text: buildTextRunsFromText((element.textContent || '').trim(), {}, locale),
                style: options.listItem ? 'listBody' : 'body',
                _mergeWithPrevious: true
            }];
        }
        const paragraphStyle = options.tableHeader ? 'tableHeader' : (options.tableCell ? 'tableCell' : (options.listItem ? 'listBody' : 'body'));
        const paragraph = buildParagraphFromElement(element, locale, { style: paragraphStyle });
        return paragraph ? [paragraph] : [];
    }
    if (tag.match(/^h[1-6]$/)) {
        const role = element.getAttribute('data-export-role');
        if (role === 'assistant' || role === 'user') {
            const style = role === 'assistant' ? 'speakerAssistant' : 'speakerUser';
            const paragraph = buildParagraphFromElement(element, locale, {
                style,
                runContext: { bold: true }
            });
            return paragraph ? [paragraph] : [];
        }
        const level = Number(tag.replace('h', ''));
        const styleMap = {
            1: 'heading1',
            2: 'heading2',
            3: 'heading3',
            4: 'heading4',
            5: 'heading5',
            6: 'heading6'
        };
        const paragraph = buildParagraphFromElement(element, locale, {
            style: styleMap[level] || 'heading1',
            runContext: { bold: true, heading: true }
        });
        return paragraph ? [paragraph] : [];
    }
    if (tag === 'pre') {
        return [buildCodeBlock(element.textContent || '', locale)];
    }
    if (tag === 'blockquote') {
        const paragraph = buildParagraphFromElement(element, locale, { style: 'blockquote', runContext: { italics: true } });
        return paragraph ? [paragraph] : [];
    }
    if (tag === 'ul' || tag === 'ol') {
        return await buildList(element, locale, 0, tag === 'ol');
    }
    if (tag === 'table') {
        const blocks = [];
        const caption = element.querySelector('caption');
        if (caption && caption.textContent) {
            const cap = buildCaption(caption.textContent, locale);
            if (cap) blocks.push(cap);
        }
        const table = await buildTable(element, locale);
        if (table) blocks.push(table);
        return blocks;
    }
    if (element.classList && element.classList.contains('table-wrapper')) {
        const table = element.querySelector('table');
        if (table) {
            const block = await buildTable(table, locale);
            return block ? [block] : [];
        }
    }
    if (tag === 'img') {
        return [await buildImageBlock(element)];
    }
    if (tag === 'figure') {
        const blocks = [];
        const img = element.querySelector('img');
        if (img) blocks.push(await buildImageBlock(img));
        const caption = element.querySelector('figcaption');
        if (caption && caption.textContent) {
            const cap = buildCaption(caption.textContent, locale);
            if (cap) blocks.push(cap);
        }
        return blocks;
    }
    if (tag === 'svg') {
        const svgBlock = await buildSvgBlock(element);
        return svgBlock ? [svgBlock] : [];
    }
    return await buildBlocksFromChildren(element, locale, options);
}

async function buildBlocksFromChildren(element, locale, options = {}) {
    if (options.inline) {
        const runs = buildTextRunsFromNodes(Array.from(element.childNodes || []), { allowEmptyText: true }, locale);
        if (!runs.length) return [];
        if (options.tableHeader || options.tableCell) {
            trimLeadingWhitespaceRuns(runs);
        }
        const inlineStyle = options.tableHeader
            ? 'tableHeader'
            : (options.tableCell ? 'tableCell' : (options.listItem ? 'listBody' : 'body'));
        return [{
            text: runs,
            style: inlineStyle
        }];
    }
    const blocks = [];
    const children = Array.from(element.childNodes);
    for (const child of children) {
        if (child.nodeType === Node.TEXT_NODE) {
            const text = normalizeTextForRun(child.textContent || '', false);
            if (!text.trim() || isSkippablePunctuationText(text)) continue;
            const runs = buildTextRunsFromNodes([child], { allowEmptyText: true }, locale);
            const lastBlock = blocks[blocks.length - 1];
            if (isMergeableTextBlock(lastBlock)) {
                lastBlock.text.push(...runs);
            } else {
                blocks.push({
                    text: runs,
                    style: options.tableHeader ? 'tableHeader' : (options.tableCell ? 'tableCell' : (options.listItem ? 'listBody' : 'body'))
                });
            }
            continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const childBlocks = await buildBlocksFromElement(child, locale, options);
        const tag = child.tagName ? child.tagName.toLowerCase() : '';
        const mergeInline = isInlineElementTag(tag);
        childBlocks.forEach((block) => {
            if (!block) return;
            const lastBlock = blocks[blocks.length - 1];
            const plain = extractPlainTextFromBlock(block);
            const mergeRequested = block._mergeWithPrevious && isMergeableTextBlock(lastBlock);
            const mergeInlineBlock = mergeInline && isMergeableTextBlock(lastBlock) && isMergeableTextBlock(block);
            if (mergeRequested || mergeInlineBlock || (isMergeableTextBlock(lastBlock) && isPunctuationOnlyText(plain))) {
                lastBlock.text.push(...(Array.isArray(block.text) ? block.text : [{ text: plain }]));
                return;
            }
            blocks.push(block);
        });
    }
    return blocks;
}

function buildHeader(headerTitle, locale) {
    if (!headerTitle) return null;
    return {
        margin: [MARGIN_HORIZONTAL_PT, 18, MARGIN_HORIZONTAL_PT, 0],
        stack: [
            { text: buildTextRunsFromText(headerTitle, { heading: true }, locale), alignment: 'center', fontSize: 10.5 },
            {
                canvas: [{
                    type: 'line',
                    x1: 0,
                    y1: 8,
                    x2: A4_WIDTH_PT - (MARGIN_HORIZONTAL_PT * 2),
                    y2: 8,
                    lineWidth: 0.75
                }]
            }
        ]
    };
}

function buildFooter(currentPage) {
    return {
        margin: [0, 0, 0, 48],
        text: `- ${currentPage} -`,
        alignment: 'center',
        fontSize: 10.5
    };
}

function fixReferenceStyle(root) {
    if (!root) return;
    const blocks = Array.from(root.querySelectorAll('blockquote'));
    blocks.forEach((block) => {
        const text = (block.textContent || '').trim();
        if (!text) return;
        const normalized = text.toLowerCase();
        const isReference = text.includes('参考文献') || normalized.includes('references');
        if (!isReference) return;
        const heading = root.ownerDocument.createElement('h3');
        heading.textContent = text;
        heading.setAttribute('data-export-role', 'assistant');
        block.replaceWith(heading);
    });
}

function removeExportNoise(root) {
    if (!root) return;
    const selectors = [
        '.copy-btn-wrapper',
        '.copy-btn',
        '.message-actions',
        '.message-export',
        '.mermaid-render-toolbar',
        '.vega-lite-toolbar',
        '.mermaid-source-toggle',
        '.vega-lite-source-toggle'
    ];
    root.querySelectorAll(selectors.join(',')).forEach(node => node.remove());
}

export async function exportTextAsPdf({ text, filename, loadScript, contentElement, headerTitle, locale } = {}) {
    if (typeof document === 'undefined') {
        throw new Error('pdfmake_unavailable');
    }
    const pdfMake = await loadPdfMake(loadScript);
    await ensurePdfFonts(pdfMake, locale);

    const safeName = sanitizeFilename(filename && filename.toLowerCase().endsWith('.pdf')
        ? filename
        : `${filename || 'export'}.pdf`);

    let content = [];
    if (contentElement) {
        const cloned = contentElement.cloneNode(true);
        removeExportNoise(cloned);
        fixReferenceStyle(cloned);
        content = await buildBlocksFromChildren(cloned, locale);
    } else {
        content = [{
            text: buildTextRunsFromText(normalizeTextForRun(text || '', false), {}, locale),
            style: 'body'
        }];
    }

    const localeKey = resolveLocaleKey(locale);
    const bodyCjkFont = `${BODY_CJK_SERIF_PREFIX}${localeKey}`;
    const headingCjkFont = `${HEADING_CJK_SANS_PREFIX}${localeKey}`;

    const headerBlock = headerTitle ? buildHeader(headerTitle, locale) : undefined;
    const estimatedPages = estimatePdfPageCount(contentElement, text);
    const useWorker = shouldUsePdfWorker(estimatedPages);

    const docDefinition = {
        pageSize: 'A4',
        pageMargins: [MARGIN_HORIZONTAL_PT, MARGIN_VERTICAL_PT, MARGIN_HORIZONTAL_PT, MARGIN_VERTICAL_PT],
        header: headerBlock,
        footer: (currentPage) => buildFooter(currentPage),
        defaultStyle: {
            font: BODY_LATIN_FONT,
            fontSize: BODY_FONT_SIZE_PT,
            lineHeight: BODY_LINE_HEIGHT
        },
        styles: {
            body: {
                fontSize: BODY_FONT_SIZE_PT,
                lineHeight: BODY_LINE_HEIGHT,
                alignment: 'justify',
                leadingIndent: FIRST_LINE_INDENT_PT
            },
            heading1: {
                fontSize: HEADING_1_SIZE_PT,
                bold: true,
                alignment: 'center',
                margin: [0, HEADING_1_SPACING_PT, 0, HEADING_1_SPACING_PT]
            },
            heading2: {
                fontSize: HEADING_2_SIZE_PT,
                bold: true,
                alignment: 'left',
                margin: [0, HEADING_2_SPACING_PT, 0, HEADING_2_SPACING_PT]
            },
            heading3: {
                fontSize: HEADING_3_SIZE_PT,
                bold: true,
                alignment: 'left',
                margin: [0, HEADING_2_SPACING_PT, 0, 0]
            },
            heading4: {
                fontSize: 11,
                bold: true,
                alignment: 'left',
                margin: [0, HEADING_2_SPACING_PT, 0, 0]
            },
            heading5: {
                fontSize: 10.5,
                bold: true,
                alignment: 'left',
                margin: [0, HEADING_2_SPACING_PT, 0, 0]
            },
            heading6: {
                fontSize: 10,
                bold: true,
                alignment: 'left',
                margin: [0, HEADING_2_SPACING_PT, 0, 0]
            },
            speakerAssistant: {
                color: ASSISTANT_HEADING_COLOR,
                bold: true,
                margin: [0, HEADING_2_SPACING_PT, 0, 2],
                alignment: 'left'
            },
            speakerUser: {
                color: USER_HEADING_COLOR,
                bold: true,
                margin: [0, HEADING_2_SPACING_PT, 0, 2],
                alignment: 'left'
            },
            codeBlock: {
                font: CODE_FONT,
                fontSize: 10.5,
                lineHeight: 1.5,
                margin: [0, 6, 0, 6],
                color: '#000000',
                background: CODE_BLOCK_BG_COLOR,
                border: [true, true, true, true],
                borderColor: CODE_BLOCK_BORDER_COLOR
            },
            table: {
                fontSize: CAPTION_SIZE_PT
            },
            tableHeader: {
                fontSize: CAPTION_SIZE_PT,
                bold: true,
                alignment: 'left',
                leadingIndent: 0
            },
            tableCell: {
                fontSize: CAPTION_SIZE_PT,
                alignment: 'left',
                leadingIndent: 0,
                lineHeight: 1.4
            },
            caption: {
                fontSize: CAPTION_SIZE_PT,
                bold: true,
                margin: [0, 0, 0, 6]
            },
            list: {
                margin: [24, 0, 0, 0]
            },
            listItem: {
                leadingIndent: 0
            },
            listBody: {
                fontSize: BODY_FONT_SIZE_PT,
                lineHeight: BODY_LINE_HEIGHT,
                alignment: 'justify',
                leadingIndent: 0
            },
            fileName: {
                fontSize: BODY_FONT_SIZE_PT,
                color: '#C00000',
                margin: [0, 0, 0, 0]
            },
            fileContent: {
                fontSize: BODY_FONT_SIZE_PT,
                margin: [0, 0, 0, 0]
            },
            blockquote: {
                italics: true,
                margin: [0, 0, 0, 0]
            }
        },
        content
    };

    applyFontFallbacks(docDefinition, bodyCjkFont, headingCjkFont, locale);

    if (useWorker) {
        try {
            const workerDocDefinition = { ...docDefinition, footer: undefined };
            const footerConfig = {
                margin: [0, 0, 0, 48],
                alignment: 'center',
                fontSize: 10.5
            };
            const buffer = await renderPdfWithWorker({
                docDefinition: workerDocDefinition,
                fonts: pdfMake.fonts,
                vfs: pdfMake.vfs,
                footerConfig
            });
            const blob = new Blob([buffer], { type: 'application/pdf' });
            await downloadPdfBlob(blob, safeName);
            return { success: true };
        } catch (error) {
            console.warn('PDF worker failed, falling back to main thread:', error);
        }
    }

    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ success: true }), PRINT_TIMEOUT_MS);
        const pdfDoc = pdfMake.createPdf(docDefinition);
        const useNativeSaver = typeof window !== 'undefined' && typeof window.__saveFileFromBlob === 'function';
        if (useNativeSaver && typeof pdfDoc.getBlob === 'function') {
            pdfDoc.getBlob(async (blob) => {
                try {
                    await downloadPdfBlob(blob, safeName);
                    clearTimeout(timer);
                    resolve({ success: true });
                } catch (_) {
                    clearTimeout(timer);
                    resolve({ success: true });
                }
            });
            return;
        }
        pdfDoc.download(safeName, () => {
            clearTimeout(timer);
            resolve({ success: true });
        });
    });
}

function applyFontFallbacks(docDefinition, bodyCjkFont, headingCjkFont, locale) {
    const applyFontsToRuns = (item, context = {}) => {
        if (!item) return;
        if (Array.isArray(item)) {
            item.forEach(child => applyFontsToRuns(child, context));
            return;
        }
        if (typeof item === 'object' && item.text && Array.isArray(item.text)) {
            item.text = item.text.map(run => {
                const textValue = run.text || '';
                const hasCjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(textValue);
                if (hasCjk) {
                    const targetFont = context.heading ? headingCjkFont : bodyCjkFont;
                    if (!run.font || run.font === BODY_LATIN_FONT || run.font === CODE_FONT) {
                        run.font = targetFont;
                    }
                } else if (!run.font) {
                    run.font = BODY_LATIN_FONT;
                }
                return run;
            });
        }
        if (typeof item === 'object') {
            if (item.style && String(item.style).startsWith('heading')) {
                context = { ...context, heading: true };
            }
            Object.keys(item).forEach((key) => {
                if (key === 'text' || key === 'style' || key === 'font') return;
                applyFontsToRuns(item[key], context);
            });
        }
    };
    applyFontsToRuns(docDefinition.content, {});
}

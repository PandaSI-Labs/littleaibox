const CELL_CHAR_LIMIT = 30000;
const ATTACHMENT_TEXT_LIMIT = 12000;
const FIGURE_MAX_WIDTH_PX = 900;
const FIGURE_MAX_HEIGHT_PX = 640;
const FIGURE_PIXEL_RATIO = 2;
const FIGURE_IMAGE_COLUMN = 5;

const BLOCK_TYPE = {
    TITLE: 'title',
    HEADING: 'heading',
    PARAGRAPH: 'paragraph',
    LIST_ITEM: 'list_item',
    FORMULA: 'formula', 
    FIGURE: 'figure',
    TABLE: 'table',
    QUOTE: 'quote',
    CODE: 'code'
};

const SOURCE_TYPE = {
    PLAIN: 'plain',
    KATEX: 'katex',
    MERMAID: 'mermaid',
    VEGA: 'vega',
    TABLE: 'table',
    IMAGE: 'image'
};

function sanitizeFilename(name) {
    const cleaned = String(name || '').trim() || 'export';
    return cleaned.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

function clipText(text, limit) {
    if (!text) return '';
    const raw = String(text);
    if (raw.length <= limit) return raw;
    const remaining = raw.length - limit;
    return `${raw.slice(0, limit)}... [truncated ${remaining} chars]`;
}

function escapeFormulaText(text) {
    if (!text) return '';
    const raw = String(text);
    if (/^[=+\-@]/.test(raw)) {
        return `'${raw}`;
    }
    return raw;
}

function normalizeCellText(text, limit = CELL_CHAR_LIMIT) {
    const clipped = clipText(text, limit);
    return escapeFormulaText(clipped);
}

function normalizeText(text) {
    if (!text) return '';
    return String(text).replace(/\r\n/g, '\n').trim();
}

function extractKatexTex(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';
    const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
    if (annotation && annotation.textContent) return annotation.textContent;
    return node.textContent || '';
}

function replaceMathNodesWithText(root, options = {}) {
    if (!root || !root.querySelectorAll) return;
    const includeDisplay = options.includeDisplay !== false;

    const displayNodes = Array.from(root.querySelectorAll('.katex-display'));
    displayNodes.forEach((node) => {
        const tex = normalizeText(extractKatexTex(node));
        const text = tex ? (includeDisplay ? `\n${tex}\n` : '') : '';
        node.replaceWith(document.createTextNode(text));
    });

    const inlineNodes = Array.from(root.querySelectorAll('.katex'))
        .filter(node => !node.closest('.katex-display'));
    inlineNodes.forEach((node) => {
        const tex = normalizeText(extractKatexTex(node));
        const text = tex || '';
        node.replaceWith(document.createTextNode(text));
    });
}

function extractTextWithMath(element, options = {}) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    replaceMathNodesWithText(clone, options);
    if (typeof document === 'undefined') {
        return normalizeText(clone.textContent || '');
    }
    const temp = document.createElement('div');
    temp.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;';
    temp.appendChild(clone);
    document.body.appendChild(temp);
    const text = temp.innerText;
    temp.remove();
    return normalizeText(text);
}

function isDisplayMath(element) {
    return element.classList && element.classList.contains('katex-display');
}

function isInlineMath(element) {
    return element.classList && element.classList.contains('katex') && !isDisplayMath(element);
}

function isDiagramContainer(el) {
    if (!el || !el.classList) return false;
    return el.classList.contains('mermaid-render-container') || el.classList.contains('vega-lite-render-container');
}

function extractDiagramSource(element) {
    if (!element || !element.querySelector) return '';
    const mermaidSource = element.querySelector('pre.mermaid-source code');
    if (mermaidSource && mermaidSource.textContent) return mermaidSource.textContent;
    const vegaSource = element.querySelector('pre.vega-lite-source code');
    if (vegaSource && vegaSource.textContent) return vegaSource.textContent;
    return '';
}

function getDiagramType(element) {
    if (!element || !element.classList) return 'other';
    if (element.classList.contains('mermaid-render-container')) return 'mermaid';
    if (element.classList.contains('vega-lite-render-container')) return 'vega';
    return 'other';
}

function findDiagramSvg(container) {
    if (!container || !container.querySelectorAll) return null;
    const svgEls = Array.from(container.querySelectorAll('svg'));
    if (!svgEls.length) return null;
    const filtered = svgEls.filter(svg => !svg.closest('.mermaid-render-toolbar') && !svg.closest('.vega-lite-toolbar'));
    if (filtered.length) return filtered[0];
    return svgEls[0];
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

function getElementSize(element, fallback = { width: 800, height: 450 }) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return fallback;
    const rect = element.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
        return { width: rect.width, height: rect.height };
    }
    return fallback;
}

function getExportFilter() {
    return (node) => {
        if (!node) return false;
        if (node.nodeType !== Node.ELEMENT_NODE) return true;
        const el = node;
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (tag === 'script' || tag === 'iframe' || tag === 'object' || tag === 'embed') return false;
        if (!el.classList) return true;
        if (el.classList.contains('mermaid-render-toolbar') || el.classList.contains('vega-lite-toolbar')) return false;
        if (el.classList.contains('mermaid-source-toggle') || el.classList.contains('vega-lite-source-toggle')) return false;
        if (el.classList.contains('mermaid-error-banner') || el.classList.contains('vega-lite-error-banner')) return false;
        return true;
    };
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
    const serializer = new XMLSerializer();
    return serializer.serializeToString(cloned);
}

async function svgToPngDataUrl(svgEl, scale = FIGURE_PIXEL_RATIO) {
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
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}

async function svgToDataUrl(svgEl) {
    if (!svgEl) return null;
    try {
        const dataUrl = await svgToPngDataUrl(svgEl, FIGURE_PIXEL_RATIO);
        if (dataUrl) return dataUrl;
    } catch (_) {
    }
    const { width, height } = getSvgDimensions(svgEl);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * FIGURE_PIXEL_RATIO));
    canvas.height = Math.max(1, Math.round(height * FIGURE_PIXEL_RATIO));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const svgText = serializeSvgForExport(svgEl);
    if (window.Canvg && typeof window.Canvg.fromString === 'function') {
        const renderer = window.Canvg.fromString(ctx, svgText, { ignoreDimensions: true, ignoreClear: true });
        await renderer.render();
        return canvas.toDataURL('image/png');
    }
    return null;
}

async function elementToDataUrl(element, pixelRatio = FIGURE_PIXEL_RATIO) {
    if (!window.htmlToImage || typeof window.htmlToImage.toPng !== 'function') return null;
    if (!element) return null;
    const filter = getExportFilter();
    const size = getElementSize(element, { width: 200, height: 100 });
    const renderWidth = Math.ceil(size.width) + 8;
    const renderHeight = Math.ceil(size.height) + 8;
    try {
        return await window.htmlToImage.toPng(element, {
            cacheBust: true,
            backgroundColor: '#ffffff',
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
    } catch (_) {
        return null;
    }
}

function clampImageSize(width, height, maxWidth, maxHeight) {
    if (!width || !height) return { width: maxWidth, height: Math.round(maxHeight * 0.7) };
    const ratio = Math.min(1, maxWidth / width, maxHeight / height);
    return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function getDataUrlPayload(dataUrl) {
    const match = /^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/.exec(dataUrl || '');
    if (!match) return null;
    return { extension: match[1], base64: match[2] };
}

function pxToRowHeight(px) {
    return Math.ceil(px * 0.75);
}

async function getImageDimensions(dataUrl) {
    if (!dataUrl) return { width: 800, height: 600 };
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({
            width: img.naturalWidth || img.width || 800,
            height: img.naturalHeight || img.height || 600
        });
        img.onerror = () => resolve({ width: 800, height: 600 });
        img.src = dataUrl;
    });
}

function isNoiseElement(element) {
    if (!element || !element.classList) return false;
    const noiseClasses = [
        'copy-btn-wrapper', 'copy-btn',
        'mermaid-error-banner', 'vega-lite-error-banner',
        'mermaid-render-toolbar', 'vega-lite-toolbar',
        'mermaid-source-toggle', 'vega-lite-source-toggle'
    ];
    return noiseClasses.some(cls => element.classList.contains(cls));
}

function extractHeadingLevel(tag) {
    const match = /^h([1-6])$/i.exec(tag);
    return match ? parseInt(match[1], 10) : 0;
}

function updateHeadingStack(stack, level, title) {
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
    }
    stack.push({ level, title });
}

function buildSectionPath(stack) {
    return stack.map(h => h.title).join(' > ');
}

function createBuildContext() {
    return {
        order: 0,
        headingStack: [],
        notes: [],
        outline: [],
        formulas: [],
        figures: [],
        sectionIdCounter: 0,
        formulaIdCounter: 0,
        figureIdCounter: 0
    };
}

function nextOrder(context) {
    context.order += 1;
    return context.order;
}

function nextSectionId(context) {
    context.sectionIdCounter += 1;
    return `S${context.sectionIdCounter}`;
}

function nextFormulaId(context) {
    context.formulaIdCounter += 1;
    return `F${context.formulaIdCounter}`;
}

function nextFigureId(context) {
    context.figureIdCounter += 1;
    return `FIG${context.figureIdCounter}`;
}

function createNoteBlock(blockType, text, context, options = {}) {
    return {
        order: nextOrder(context),
        section_path: buildSectionPath(context.headingStack),
        block_type: blockType,
        text: normalizeText(text),
        formula_tex: options.formulaTex || '',
        figure_ref: options.figureRef || '',
        source: options.source || SOURCE_TYPE.PLAIN,
        note: options.note || ''
    };
}

function createOutlineEntry(level, title, context) {
    const sectionId = nextSectionId(context);
    const parentStack = context.headingStack.filter(h => h.level < level);
    const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].sectionId : '';

    const entry = {
        section_id: sectionId,
        parent_id: parentId,
        level,
        title: normalizeText(title),
        order_start: context.order + 1,
        order_end: 0
    };

    return { entry, sectionId };
}

function createFormulaEntry(tex, type, context) {
    return {
        formula_id: nextFormulaId(context),
        section_path: buildSectionPath(context.headingStack),
        type,
        tex: normalizeText(tex)
    };
}

function createFigureEntry(diagramType, source, context, options = {}) {
    return {
        figure_id: nextFigureId(context),
        section_path: buildSectionPath(context.headingStack),
        type: diagramType,
        source: normalizeText(source),
        dataUrl: options.dataUrl || null,
        width: options.width || 0,
        height: options.height || 0,
        note: options.note || ''
    };
}

function filterNodesOutsideContainers(nodes, containers) {
    if (!Array.isArray(containers) || containers.length === 0) return nodes;
    return nodes.filter(node => !containers.some(container => container.contains(node)));
}

function collectInlineMathFormulas(root, context, options = {}) {
    if (!root || !root.querySelectorAll) return;
    const inlineNodes = Array.from(root.querySelectorAll('.katex'))
        .filter(node => !node.closest('.katex-display'));
    const filtered = filterNodesOutsideContainers(inlineNodes, options.excludeContainers);
    let count = 0;
    filtered.forEach((node) => {
        const tex = extractKatexTex(node);
        if (tex) {
            context.formulas.push(createFormulaEntry(tex, 'inline', context));
            count += 1;
        }
    });
    return count;
}

async function buildBlocksFromElement(element, context, options = {}) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

    const tag = element.tagName ? element.tagName.toLowerCase() : '';

    if (isNoiseElement(element)) return;

    const headingLevel = extractHeadingLevel(tag);
    if (headingLevel > 0) {
        await processHeading(element, headingLevel, context);
        return;
    }

    if (tag === 'p') {
        await processParagraph(element, context);
        return;
    }

    if (element.classList && element.classList.contains('katex-display')) {
        processDisplayMath(element, context);
        return;
    }

    if (element.classList && element.classList.contains('katex') && !element.closest('.katex-display')) {
        processInlineMath(element, context);
        return;
    }

    if (isDiagramContainer(element)) {
        await processDiagram(element, context);
        return;
    }

    if (tag === 'ul' || tag === 'ol') {
        await processListItems(element, context, options);
        return;
    }

    if (tag === 'table') {
        processTable(element, context);
        return;
    }

    if (element.classList && element.classList.contains('table-wrapper')) {
        const table = element.querySelector('table');
        if (table) {
            processTable(table, context);
        }
        return;
    }

    if (tag === 'blockquote') {
        processBlockquote(element, context);
        return;
    }

    if (tag === 'pre') {
        processCodeBlock(element, context);
        return;
    }

    if (tag === 'img') {
        await processImage(element, context);
        return;
    }

    if (tag === 'figure') {
        await processFigure(element, context);
        return;
    }

    await buildBlocksFromChildren(element, context, options);
}

async function buildBlocksFromChildren(element, context, options = {}) {
    if (!element || !element.childNodes) return;

    for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            const text = normalizeText(child.textContent || '');
            if (text && text.trim()) {
                const note = createNoteBlock(BLOCK_TYPE.PARAGRAPH, text, context);
                context.notes.push(note);
            }
            continue;
        }

        if (child.nodeType === Node.ELEMENT_NODE) {
            await buildBlocksFromElement(child, context, options);
        }
    }
}

async function processHeading(element, level, context) {
    const title = normalizeText(element.textContent || '');
    if (!title) return;

    for (let i = context.outline.length - 1; i >= 0; i--) {
        const entry = context.outline[i];
        if (entry.level >= level && entry.order_end === 0) {
            entry.order_end = context.order;
        }
    }

    const { entry, sectionId } = createOutlineEntry(level, title, context);
    context.outline.push(entry);

    updateHeadingStack(context.headingStack, level, title);
    context.headingStack[context.headingStack.length - 1].sectionId = sectionId;

    const blockType = level === 1 ? BLOCK_TYPE.TITLE : BLOCK_TYPE.HEADING;
    const note = createNoteBlock(blockType, title, context);
    context.notes.push(note);
}

async function processParagraph(element, context) {
    const hasDisplayMath = !!element.querySelector('.katex-display');
    const text = extractTextWithMath(element, { includeDisplay: !hasDisplayMath });
    const inlineCount = collectInlineMathFormulas(element, context) || 0;
    if (text) {
        const hasMath = inlineCount > 0 || hasDisplayMath;
        const note = createNoteBlock(BLOCK_TYPE.PARAGRAPH, text, context, {
            source: hasMath ? SOURCE_TYPE.KATEX : SOURCE_TYPE.PLAIN
        });
        context.notes.push(note);
    }

    if (hasDisplayMath) {
        const displayNodes = Array.from(element.querySelectorAll('.katex-display'));
        displayNodes.forEach((node) => processDisplayMath(node, context));
    }
}

function processDisplayMath(element, context) {
    const tex = extractKatexTex(element);
    if (!tex) return;

    const formula = createFormulaEntry(tex, 'display', context);
    context.formulas.push(formula);

    const note = createNoteBlock(BLOCK_TYPE.FORMULA, tex, context, {
        formulaTex: tex,
        source: SOURCE_TYPE.KATEX
    });
    context.notes.push(note);
}

function processInlineMath(element, context) {
    const tex = extractKatexTex(element);
    if (!tex) return;

    const formula = createFormulaEntry(tex, 'inline', context);
    context.formulas.push(formula);
}

async function processDiagram(element, context) {
    const diagramType = getDiagramType(element);
    const source = extractDiagramSource(element);
    let dataUrl = null;
    let width = 0;
    let height = 0;
    let note = '';

    const svg = findDiagramSvg(element);
    if (svg) {
        try {
            dataUrl = await svgToDataUrl(svg);
            if (dataUrl) {
                const dims = getSvgDimensions(svg);
                width = dims.width;
                height = dims.height;
            }
        } catch (_) {
            note = 'svg_render_failed';
        }
    }

    if (!dataUrl) {
        try {
            dataUrl = await elementToDataUrl(element);
            if (dataUrl) {
                const size = getElementSize(element, { width: 800, height: 450 });
                width = size.width;
                height = size.height;
            }
        } catch (_) {
            note = 'image_unavailable';
        }
    }

    if (!dataUrl) {
        note = 'image_unavailable';
    }

    const figureId = nextFigureId(context);
    const figure = {
        figure_id: figureId,
        section_path: buildSectionPath(context.headingStack),
        type: diagramType,
        source: normalizeText(source),
        dataUrl,
        width,
        height,
        note
    };
    context.figures.push(figure);

    const noteBlock = createNoteBlock(BLOCK_TYPE.FIGURE, `[${diagramType} diagram]`, context, {
        figureRef: figureId,
        source: diagramType === 'mermaid' ? SOURCE_TYPE.MERMAID : SOURCE_TYPE.VEGA,
        note
    });
    context.notes.push(noteBlock);
}

async function processListItems(element, context, options = {}) {
    const items = Array.from(element.children).filter(child =>
        child.tagName && child.tagName.toLowerCase() === 'li'
    );

    for (const item of items) {
        const nestedLists = item.querySelectorAll('ul, ol');

        const clone = item.cloneNode(true);
        clone.querySelectorAll('ul, ol').forEach(nested => nested.remove());
        const text = extractTextWithMath(clone, { includeDisplay: false });

        if (text) {
            const inlineCount = collectInlineMathFormulas(item, context, { excludeContainers: Array.from(nestedLists) }) || 0;
            const note = createNoteBlock(BLOCK_TYPE.LIST_ITEM, text, context, {
                source: inlineCount > 0 ? SOURCE_TYPE.KATEX : SOURCE_TYPE.PLAIN
            });
            context.notes.push(note);
        }

        const displayNodes = filterNodesOutsideContainers(
            Array.from(item.querySelectorAll('.katex-display')),
            Array.from(nestedLists)
        );
        displayNodes.forEach((node) => processDisplayMath(node, context));

        for (const nested of nestedLists) {
            await processListItems(nested, context, options);
        }
    }
}

function processTable(element, context) {
    const rows = Array.from(element.querySelectorAll('tr'));
    const textLines = [];

    rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        const cellTexts = cells.map(cell => extractTextWithMath(cell, { includeDisplay: true }));
        textLines.push(cellTexts.join(' | '));
    });

    const tableText = textLines.join('\n');

    const figureId = nextFigureId(context);
    const figure = {
        figure_id: figureId,
        section_path: buildSectionPath(context.headingStack),
        type: 'table',
        source: tableText,
        dataUrl: null,
        width: 0,
        height: 0,
        note: ''
    };
    context.figures.push(figure);

    const note = createNoteBlock(BLOCK_TYPE.TABLE, tableText, context, {
        figureRef: figureId,
        source: SOURCE_TYPE.TABLE
    });
    context.notes.push(note);
}

function processBlockquote(element, context) {
    const text = extractTextWithMath(element, { includeDisplay: false });
    if (!text) return;

    const inlineCount = collectInlineMathFormulas(element, context) || 0;

    const note = createNoteBlock(BLOCK_TYPE.QUOTE, text, context, {
        source: inlineCount > 0 ? SOURCE_TYPE.KATEX : SOURCE_TYPE.PLAIN
    });
    context.notes.push(note);
}

function processCodeBlock(element, context) {
    const code = normalizeText(element.textContent || '');
    if (!code) return;

    const note = createNoteBlock(BLOCK_TYPE.CODE, code, context);
    context.notes.push(note);
}

async function processImage(element, context) {
    const src = element.getAttribute('src') || '';
    const alt = element.getAttribute('alt') || 'image';
    let dataUrl = null;
    let note = '';

    if (src.startsWith('data:')) {
        dataUrl = src;
    } else if (src) {
        try {
            const response = await fetch(src);
            if (response.ok) {
                const blob = await response.blob();
                dataUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(blob);
                });
            }
        } catch (_) {
            note = 'image_unavailable';
        }
    }

    if (!dataUrl) {
        note = 'image_unavailable';
    }

    const figureId = nextFigureId(context);
    let width = 0;
    let height = 0;
    if (dataUrl) {
        const dims = await getImageDimensions(dataUrl);
        width = dims.width;
        height = dims.height;
    }

    const figure = {
        figure_id: figureId,
        section_path: buildSectionPath(context.headingStack),
        type: 'image',
        source: alt,
        dataUrl,
        width,
        height,
        note
    };
    context.figures.push(figure);

    const noteBlock = createNoteBlock(BLOCK_TYPE.FIGURE, `[Image: ${alt}]`, context, {
        figureRef: figureId,
        source: SOURCE_TYPE.IMAGE,
        note
    });
    context.notes.push(noteBlock);
}

async function processFigure(element, context) {
    const img = element.querySelector('img');
    if (img) {
        await processImage(img, context);
    }

    const caption = element.querySelector('figcaption');
    if (caption && caption.textContent) {
        const text = normalizeText(caption.textContent);
        const note = createNoteBlock(BLOCK_TYPE.PARAGRAPH, text, context);
        context.notes.push(note);
    }
}

function applySheetDefaults(sheet, wrapKeys = []) {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    wrapKeys.forEach((key) => {
        const column = sheet.getColumn(key);
        column.alignment = { wrapText: true, vertical: 'top' };
    });
}

function createNotesSheet(workbook, notes) {
    const sheet = workbook.addWorksheet('Notes');
    sheet.columns = [
        { header: 'Order', key: 'order', width: 8 },
        { header: 'Section Path', key: 'section_path', width: 40 },
        { header: 'Block Type', key: 'block_type', width: 12 },
        { header: 'Text', key: 'text', width: 80 },
        { header: 'Formula TeX', key: 'formula_tex', width: 40 },
        { header: 'Figure Ref', key: 'figure_ref', width: 12 },
        { header: 'Source', key: 'source', width: 10 },
        { header: 'Note', key: 'note', width: 20 }
    ];
    applySheetDefaults(sheet, ['section_path', 'text', 'formula_tex', 'note']);

    notes.forEach(note => {
        sheet.addRow({
            order: note.order,
            section_path: normalizeCellText(note.section_path),
            block_type: note.block_type,
            text: normalizeCellText(note.text),
            formula_tex: normalizeCellText(note.formula_tex),
            figure_ref: note.figure_ref,
            source: note.source,
            note: normalizeCellText(note.note)
        });
    });

    return sheet;
}

function createOutlineSheet(workbook, outline) {
    const sheet = workbook.addWorksheet('Outline');
    sheet.columns = [
        { header: 'Section ID', key: 'section_id', width: 12 },
        { header: 'Parent ID', key: 'parent_id', width: 12 },
        { header: 'Level', key: 'level', width: 8 },
        { header: 'Title', key: 'title', width: 60 },
        { header: 'Order Start', key: 'order_start', width: 12 },
        { header: 'Order End', key: 'order_end', width: 12 }
    ];
    applySheetDefaults(sheet, ['title']);

    outline.forEach(entry => {
        sheet.addRow({
            section_id: entry.section_id,
            parent_id: entry.parent_id,
            level: entry.level,
            title: normalizeCellText(entry.title),
            order_start: entry.order_start,
            order_end: entry.order_end || ''
        });
    });

    return sheet;
}

function createFormulasSheet(workbook, formulas) {
    const sheet = workbook.addWorksheet('Formulas');
    sheet.columns = [
        { header: 'Formula ID', key: 'formula_id', width: 12 },
        { header: 'Section Path', key: 'section_path', width: 40 },
        { header: 'Type', key: 'type', width: 10 },
        { header: 'TeX', key: 'tex', width: 100 }
    ];
    applySheetDefaults(sheet, ['section_path', 'tex']);

    formulas.forEach(formula => {
        sheet.addRow({
            formula_id: formula.formula_id,
            section_path: normalizeCellText(formula.section_path),
            type: formula.type,
            tex: normalizeCellText(formula.tex)
        });
    });

    return sheet;
}

async function createFiguresSheet(workbook, figures) {
    const sheet = workbook.addWorksheet('Figures');
    sheet.columns = [
        { header: 'Figure ID', key: 'figure_id', width: 12 },
        { header: 'Section Path', key: 'section_path', width: 40 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Source', key: 'source', width: 60 },
        { header: 'Note', key: 'note', width: 20 },
        { header: 'Image', key: 'image', width: 40 }
    ];
    applySheetDefaults(sheet, ['section_path', 'source', 'note']);

    let rowIndex = 2;
    for (const figure of figures) {
        sheet.addRow({
            figure_id: figure.figure_id,
            section_path: normalizeCellText(figure.section_path),
            type: figure.type,
            source: normalizeCellText(figure.source),
            note: normalizeCellText(figure.note),
            image: ''
        });

        if (figure.dataUrl) {
            const payload = getDataUrlPayload(figure.dataUrl);
            if (payload) {
                const dims = await getImageDimensions(figure.dataUrl);
                const size = clampImageSize(
                    dims.width,
                    dims.height,
                    FIGURE_MAX_WIDTH_PX,
                    FIGURE_MAX_HEIGHT_PX
                );
                const imageId = workbook.addImage({
                    base64: payload.base64,
                    extension: payload.extension
                });
                sheet.addImage(imageId, {
                    tl: { col: FIGURE_IMAGE_COLUMN, row: rowIndex - 1 },
                    ext: { width: size.width, height: size.height }
                });
                const row = sheet.getRow(rowIndex);
                row.height = Math.max(row.height || 0, pxToRowHeight(size.height));
            }
        }
        rowIndex += 1;
    }

    return sheet;
}

function getUserContentParts(content) {
    const parts = Array.isArray(content)
        ? content
        : (content && Array.isArray(content.content) ? content.content : []);
    const textParts = [];
    const files = [];
    const images = [];
    parts.forEach((part) => {
        if (!part || typeof part !== 'object') return;
        if (part.type === 'text' && typeof part.text === 'string') {
            if (part.text.trim()) textParts.push(part.text.trim());
            return;
        }
        if (part.type === 'file') {
            files.push({
                filename: part.filename || 'attachment',
                content: part.content || '',
                mimeType: part.file_type || part.mimeType || ''
            });
            return;
        }
        if (part.type === 'image_url' && part.image_url && part.image_url.url) {
            images.push({
                filename: part.filename || 'image',
                url: part.image_url.url
            });
            return;
        }
        if (part.type === 'quote' && typeof part.text === 'string') {
            if (part.text.trim()) textParts.push(part.text.trim());
            return;
        }
    });
    return { text: textParts.join('\n'), files, images };
}

function extractMessageText(message) {
    if (!message) return '';
    const content = message.content;
    if (message.role === 'user') {
        if (typeof content === 'string') return content;
        return getUserContentParts(content).text;
    }
    if (typeof content === 'string') return content;
    if (Array.isArray(content) || (content && Array.isArray(content.content))) {
        return getUserContentParts(content).text;
    }
    return content == null ? '' : String(content);
}

function extractMessageAttachments(message) {
    if (!message) return { files: [], images: [] };
    const content = message.content;
    if (message.role === 'user' || Array.isArray(content) || (content && Array.isArray(content.content))) {
        const parts = getUserContentParts(content);
        return { files: parts.files || [], images: parts.images || [] };
    }
    return { files: [], images: [] };
}

function groupMessagesByTurn(messages) {
    const blocks = [];
    let current = { users: [], assistants: [] };
    const pushCurrent = () => {
        if (!current.users.length && !current.assistants.length) return;
        blocks.push(current);
        current = { users: [], assistants: [] };
    };
    messages.forEach((message) => {
        if (!message) return;
        const content = extractMessageText(message).trim();
        const attachments = extractMessageAttachments(message);
        const hasAttachments = attachments.files.length > 0 || attachments.images.length > 0;
        if (!content && !hasAttachments) return;
        if (message.role !== 'assistant') {
            if (current.assistants.length) {
                pushCurrent();
            }
            current.users.push(message);
            return;
        }
        current.assistants.push(message);
    });
    pushCurrent();
    return blocks;
}

function stringifyCitations(citations) {
    if (!citations) return '';
    try {
        return JSON.stringify(citations);
    } catch (_) {
        return String(citations);
    }
}

function buildMetaRows(meta) {
    return Object.entries(meta).map(([key, value]) => ({
        key: normalizeCellText(key),
        value: normalizeCellText(value)
    }));
}

function buildAttachmentRows(messages) {
    const rows = [];
    messages.forEach((message, messageIndex) => {
        const attachments = extractMessageAttachments(message);
        attachments.files.forEach((file, partIndex) => {
            const content = normalizeCellText(
                clipText(file.content || '', ATTACHMENT_TEXT_LIMIT)
            );
            rows.push({
                messageIndex: messageIndex + 1,
                role: message.role || '',
                partIndex: partIndex + 1,
                type: 'file',
                name: normalizeCellText(file.filename || ''),
                content
            });
        });
        attachments.images.forEach((image, partIndex) => {
            rows.push({
                messageIndex: messageIndex + 1,
                role: message.role || '',
                partIndex: partIndex + 1,
                type: 'image',
                name: normalizeCellText(image.filename || ''),
                content: normalizeCellText(image.url || '')
            });
        });
    });
    return rows;
}

function buildMessageRows(messages) {
    return messages.map((message, index) => {
        const text = extractMessageText(message);
        const attachments = extractMessageAttachments(message);
        const filesCount = attachments.files.length;
        const imagesCount = attachments.images.length;
        const summary = [];
        if (filesCount) summary.push(`files:${filesCount}`);
        if (imagesCount) summary.push(`images:${imagesCount}`);
        return {
            index: index + 1,
            role: message.role || '',
            content: normalizeCellText(text),
            fileCount: filesCount,
            imageCount: imagesCount,
            attachmentSummary: normalizeCellText(summary.join(', ')),
            citations: normalizeCellText(stringifyCitations(message.citations || ''))
        };
    });
}

function buildTurnRows(messages) {
    const blocks = groupMessagesByTurn(messages);
    return blocks.map((block, index) => {
        const userTexts = block.users.map((message) => extractMessageText(message)).filter(Boolean);
        const assistantTexts = block.assistants.map((message) => extractMessageText(message)).filter(Boolean);
        let userFiles = 0;
        let userImages = 0;
        block.users.forEach((message) => {
            const attachments = extractMessageAttachments(message);
            userFiles += attachments.files.length;
            userImages += attachments.images.length;
        });
        return {
            turn: index + 1,
            user: normalizeCellText(userTexts.join('\n\n')),
            assistant: normalizeCellText(assistantTexts.join('\n\n')),
            userFiles,
            userImages
        };
    });
}

async function loadExcelExportDeps(loadScript) {
    if (typeof loadScript !== 'function') return;
    await loadScript('/libs/html-to-image.js', 'htmlToImage');
    await loadScript('/libs/canvg.min.js', 'Canvg');
}

async function loadExcelJs(loadScript) {
    await loadScript('/libs/exceljs.min.js', 'ExcelJS');
    return window.ExcelJS;
}

export async function exportTextAsExcel({
    text,
    filename,
    loadScript,
    contentElement,
    headerTitle,
    locale,
    messageObject,
    chatMessages,
    exportType
} = {}) {
    const ExcelJS = await loadExcelJs(loadScript);
    if (!ExcelJS) {
        throw new Error('ExcelJS is not available');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LittleAIBox';
    workbook.created = new Date();
    workbook.modified = new Date();

    let fallbackText = text || '';
    if (!fallbackText && contentElement && contentElement.textContent) {
        fallbackText = contentElement.textContent;
    }

    const messages = Array.isArray(chatMessages)
        ? chatMessages
        : (messageObject ? [messageObject] : []);

    const metaSheet = workbook.addWorksheet('Meta');
    metaSheet.columns = [
        { header: 'Key', key: 'key', width: 24 },
        { header: 'Value', key: 'value', width: 80 }
    ];

    const metaRows = buildMetaRows({
        Title: headerTitle || filename || 'export',
        Type: exportType || (Array.isArray(chatMessages) ? 'chat' : (messageObject ? 'message' : 'text')),
        Locale: locale || '',
        ExportedAt: new Date().toISOString(),
        MessageCount: messages.length ? String(messages.length) : '0',
        TurnCount: messages.length ? String(groupMessagesByTurn(messages).length) : '0',
        AttachmentTextLimit: String(ATTACHMENT_TEXT_LIMIT),
        CellCharLimit: String(CELL_CHAR_LIMIT)
    });
    metaSheet.addRows(metaRows);
    applySheetDefaults(metaSheet, ['value']);

    const hasDomContent = contentElement && typeof contentElement.querySelectorAll === 'function';
    let activeSheet = null;

    if (hasDomContent) {
        const hasDiagramNodes = contentElement.querySelector('.mermaid-render-container, .vega-lite-render-container');
        if (hasDiagramNodes) {
            await loadExcelExportDeps(loadScript);
        }

        const context = createBuildContext();
        await buildBlocksFromChildren(contentElement, context);

        context.outline.forEach(entry => {
            if (entry.order_end === 0) {
                entry.order_end = context.order;
            }
        });

        if (context.notes.length > 0) {
            const notesSheet = createNotesSheet(workbook, context.notes);
            activeSheet = notesSheet;
        }

        if (context.outline.length > 0) {
            createOutlineSheet(workbook, context.outline);
        }

        if (context.formulas.length > 0) {
            createFormulasSheet(workbook, context.formulas);
        }

        if (context.figures.length > 0) {
            await createFiguresSheet(workbook, context.figures);
        }
    }

    if (messages.length > 0) {
        const messageSheet = workbook.addWorksheet('Messages');
        messageSheet.columns = [
            { header: 'Index', key: 'index', width: 8 },
            { header: 'Role', key: 'role', width: 10 },
            { header: 'Content', key: 'content', width: 80 },
            { header: 'Files', key: 'fileCount', width: 8 },
            { header: 'Images', key: 'imageCount', width: 8 },
            { header: 'Attachment Summary', key: 'attachmentSummary', width: 24 },
            { header: 'Citations', key: 'citations', width: 60 }
        ];
        applySheetDefaults(messageSheet, ['content', 'attachmentSummary', 'citations']);
        messageSheet.addRows(buildMessageRows(messages));

        const turnSheet = workbook.addWorksheet('Turns');
        turnSheet.columns = [
            { header: 'Turn', key: 'turn', width: 8 },
            { header: 'User', key: 'user', width: 70 },
            { header: 'Assistant', key: 'assistant', width: 70 },
            { header: 'User Files', key: 'userFiles', width: 12 },
            { header: 'User Images', key: 'userImages', width: 12 }
        ];
        applySheetDefaults(turnSheet, ['user', 'assistant']);
        turnSheet.addRows(buildTurnRows(messages));

        const attachmentRows = buildAttachmentRows(messages);
        if (attachmentRows.length) {
            const attachmentSheet = workbook.addWorksheet('Attachments');
            attachmentSheet.columns = [
                { header: 'Message Index', key: 'messageIndex', width: 12 },
                { header: 'Role', key: 'role', width: 10 },
                { header: 'Part Index', key: 'partIndex', width: 10 },
                { header: 'Type', key: 'type', width: 10 },
                { header: 'Name', key: 'name', width: 24 },
                { header: 'Content/URL', key: 'content', width: 100 }
            ];
            applySheetDefaults(attachmentSheet, ['name', 'content']);
            attachmentSheet.addRows(attachmentRows);
        }

        if (!activeSheet) {
            activeSheet = messageSheet;
        }
    }

    if (!activeSheet) {
        const contentSheet = workbook.addWorksheet('Content');
        contentSheet.columns = [
            { header: 'Content', key: 'content', width: 120 }
        ];
        applySheetDefaults(contentSheet, ['content']);
        contentSheet.addRow({
            content: normalizeCellText(fallbackText || '')
        });
        activeSheet = contentSheet;
    }

    workbook.views = [{ activeTab: workbook.worksheets.indexOf(activeSheet) }];

    const safeName = sanitizeFilename(filename && filename.toLowerCase().endsWith('.xlsx')
        ? filename
        : `${filename || 'export'}.xlsx`);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    if (typeof window !== 'undefined' && typeof window.__saveFileFromBlob === 'function') {
        await window.__saveFileFromBlob(blob, safeName);
        return { success: true };
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true };
}

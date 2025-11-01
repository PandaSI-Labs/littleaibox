const MERMAID_SCRIPT_SOURCES = [
    '/libs/mermaid.min.js'
];
const MERMAID_GLOBAL = 'mermaid';
const DEFAULT_DOWNLOAD_ICON_PATH = '<path d="M5 20h14a1 1 0 0 0 1-1v-2h-2v1H6v-1H4v2a1 1 0 0 0 1 1zm7-3 5-5h-3V4h-4v8H7l5 5z"/>';

let mermaidInitPromise = null;
let mermaidConfigured = false;
let diagramIdCounter = 0;
const pendingRenders = new Set();

function sanitizeMermaidDefinition(definition) {
    if (typeof definition !== 'string') {
        return '';
    }

    const replacements = [
        { regex: /\r\n?/g, replacement: '\n' },
        { regex: /<br\s*\/?>/gi, replacement: '\n' },
        { regex: /<\/?(div|p|span|strong|em|code|pre)>/gi, replacement: '' },
        { regex: /&nbsp;/gi, replacement: ' ' }
    ];

    let sanitized = definition;
    for (const { regex, replacement } of replacements) {
        sanitized = sanitized.replace(regex, replacement);
    }

    sanitized = sanitized.replace(/\u00A0/g, ' ');
    sanitized = sanitized.replace(/[ \t]+$/gm, '');

    return sanitized.trim();
}

function normalizeAndCorrectMermaid(definition) {
    let text = sanitizeMermaidDefinition(definition);

    if (/^```/m.test(text)) {
        text = text.replace(/^```\s*mermaid\s*\n?/i, '');
        text = text.replace(/^```\s*\n?/, '');
        text = text.replace(/\n?```\s*$/i, '');
    }

    text = text
        .replace(/[\u2013\u2014]/g, '-') 
        .replace(/\u2192/g, '-->')      
        .replace(/[\u00A0\t]+/g, ' ');

    const rawLines = text.split(/\n/);
    const lines = [];
    for (let line of rawLines) {
        if (/^\s*copy$/i.test(line)) continue;
        line = line.replace(/[ \t]+$/g, '');
        lines.push(line);
    }

    const stripInlineComments = (ln) => {
        const idx = ln.indexOf('%%');
        if (idx > -1 && ln.trimStart().slice(0, 2) !== '%%') {
            return ln.slice(0, idx).replace(/[ \t]+$/g, '');
        }
        return ln;
    };

    const analysisLines = lines
        .map(stripInlineComments)
        .map(l => l)
        .filter(l => l.trim() !== '' && !/^\s*%%/.test(l));

    if (analysisLines.length === 0) {
        return { corrected: '', skippedReason: 'comments-only-or-empty' };
    }

    const directiveRegex = /^(?:graph|flowchart)\s+(?:TB|TD|LR|RL|BT)\b|^(?:sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|gantt|journey|pie|mindmap)\b/i;
    let firstIdx = lines.findIndex(l => l.trim() !== '' && !/^\s*%%/.test(l));
    if (firstIdx === -1) firstIdx = 0;
    let header = lines[firstIdx] || '';
    const hasDirective = directiveRegex.test(header.trim());

    if (!hasDirective) {
        return { corrected: '', skippedReason: 'missing-directive' };
    }

    const correctedLines = lines.map((l, i) => {
        if (/^\s*%%/.test(l)) return l.trimEnd();
        return stripInlineComments(l);
    });

    const afterHeader = correctedLines.slice(firstIdx + 1)
        .filter(l => l.trim() !== '' && !/^\s*%%/.test(l));
    if (afterHeader.length === 0) {
        return { corrected: '', skippedReason: 'directive-without-body' };
    }

    const corrected = correctedLines.join('\n').trim();
    return { corrected, skippedReason: null };
}

async function loadMermaidFromSources(loaderFn) {
    let lastError = null;
    for (const src of MERMAID_SCRIPT_SOURCES) {
        try {
            await loaderFn(src);
            return;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('Mermaid script could not be loaded from any source.');
}

function ensureMermaid(loadScript) {
    if (window[MERMAID_GLOBAL]) {
        if (!mermaidConfigured) {
            configureMermaid(window[MERMAID_GLOBAL]);
        }
        return Promise.resolve(window[MERMAID_GLOBAL]);
    }

    if (!mermaidInitPromise) {
        const loader = typeof loadScript === 'function'
            ? loadMermaidFromSources((src) => loadScript(src, MERMAID_GLOBAL))
            : loadMermaidFromSources((src) => loadMermaidViaScriptTag(src));

        mermaidInitPromise = loader.then(() => {
            const mermaid = window[MERMAID_GLOBAL];
            if (!mermaid) {
                throw new Error('Mermaid failed to load');
            }
            configureMermaid(mermaid);
            return mermaid;
        }).catch(error => {
            mermaidInitPromise = null;
            throw error;
        });
    }

    return mermaidInitPromise;
}

function notifyRenderState() {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('mermaid-render-state', {
            detail: { pending: pendingRenders.size }
        }));
    }
}

function trackRenderPromise(promise) {
    pendingRenders.add(promise);
    notifyRenderState();
    promise.finally(() => {
        pendingRenders.delete(promise);
        notifyRenderState();
    });
    return promise;
}

function configureMermaid(mermaid) {
    if (mermaidConfigured || !mermaid || typeof mermaid.initialize !== 'function') {
        return;
    }

    try {
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'loose',
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default'
        });
    } catch (error) {
        console.warn('Mermaid initialization failed:', error);
    }
    mermaidConfigured = true;
}

function loadMermaidViaScriptTag(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[data-mermaid-loader="true"][data-mermaid-src="${src}"]`)) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.setAttribute('data-mermaid-loader', 'true');
        script.setAttribute('data-mermaid-src', src);
        script.onload = () => resolve();
        script.onerror = () => {
            script.remove();
            reject(new Error(`Failed to load Mermaid from ${src}`));
        };
        document.head.appendChild(script);
    });
}

function getLocalizedLabel(key, fallback) {
    try {
        if (typeof window !== 'undefined' && typeof window.getToastMessage === 'function') {
            const label = window.getToastMessage(key);
            if (label && typeof label === 'string' && label.trim()) {
                return label;
            }
        }
    } catch (_) { }
    return fallback;
}

function createToolbarButton(label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mermaid-download-btn';
    button.title = label;
    button.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            ${(typeof window !== 'undefined' && window.ICONS && window.ICONS.DOWNLOAD) || DEFAULT_DOWNLOAD_ICON_PATH}
        </svg>
        <span class="sr-only">${label}</span>
    `;
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        onClick();
    });
    return button;
}

function triggerDownloadFromBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function downloadSvgFile(svgElement, filenameBase) {
    const serializer = new XMLSerializer();
    const cloned = svgElement.cloneNode(true);
    if (!cloned.getAttribute('xmlns')) {
        cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    if (!cloned.getAttribute('xmlns:xlink')) {
        cloned.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    }
    const source = serializer.serializeToString(cloned);
    const svgBlob = new Blob(
        [`<?xml version="1.0" encoding="UTF-8"?>\n${source}`],
        { type: 'image/svg+xml;charset=utf-8' }
    );
    triggerDownloadFromBlob(svgBlob, `${filenameBase}.svg`);
}

function createMermaidToolbar(svgElement, filenameBase) {
    const toolbar = document.createElement('div');
    toolbar.className = 'mermaid-render-toolbar';
    const downloadSvgLabel = getLocalizedLabel('ui.downloadSvg', 'Download SVG');
    const svgButton = createToolbarButton(downloadSvgLabel, () => downloadSvgFile(svgElement, filenameBase));
    toolbar.appendChild(svgButton);
    return toolbar;
}

function shouldRenderMermaid(codeElement, { isFinalRender, rootElement }) {
    if (!codeElement || codeElement.dataset.mermaidProcessed === 'true') {
        return false;
    }

    const className = codeElement.className || '';
    const declaredLang = (codeElement.getAttribute('data-lang') || codeElement.getAttribute('class') || '').toLowerCase();
    const isMermaidLang = /\bmermaid\b/.test(className) || /\bmermaid\b/.test(declaredLang);

    if (!isMermaidLang) {
        return false;
    }

    const text = (codeElement.textContent || '').trim();
    if (!text) {
        return false;
    }

    if (!isFinalRender) {
        const streamingHtml = rootElement?.__renderState?.streamingHtml;
        const isCurrentlyStreaming = typeof streamingHtml === 'string' && streamingHtml.length > 0;
        if (isCurrentlyStreaming) {
            codeElement.dataset.mermaidPending = 'true';
            return false;
        }
    }

    return true;
}

export function renderMermaidDiagrams(rootElement, { loadScript, isFinalRender } = {}) {
    if (!rootElement) {
        return null;
    }

    const codeBlocks = Array.from(rootElement.querySelectorAll('pre code'));
    const mermaidBlocks = codeBlocks.filter(code => shouldRenderMermaid(code, { isFinalRender, rootElement }));

    if (mermaidBlocks.length === 0) {
        return null;
    }

    const renderProcess = ensureMermaid(loadScript).then(async (mermaid) => {
        for (const codeElement of mermaidBlocks) {
            const parentPre = codeElement.closest('pre');
            if (!parentPre) {
                continue;
            }

            const rawDefinition = (codeElement.textContent || '').trim();
            const { corrected, skippedReason } = normalizeAndCorrectMermaid(rawDefinition);
            const graphDefinition = corrected;
            if (!graphDefinition) {
                codeElement.dataset.mermaidProcessed = 'true';
                if (skippedReason) {
                    codeElement.dataset.mermaidProcessed = 'skipped';
                }
                continue;
            }

            if (graphDefinition !== rawDefinition) {
                codeElement.textContent = graphDefinition;
                codeElement.dataset.mermaidSanitized = 'true';
            }

            try {
                if (typeof mermaid.parse === 'function') {
                    try {
                        mermaid.parse(graphDefinition);
                    } catch (parseError) {
                        throw new Error(parseError?.message || 'Mermaid definition could not be parsed');
                    }
                }

                const uniqueId = `mermaid-diagram-${Date.now()}-${diagramIdCounter++}`;
                const renderResult = await mermaid.render(uniqueId, graphDefinition);
                const wrapper = document.createElement('div');
                wrapper.className = 'mermaid-diagram-wrapper';
                wrapper.innerHTML = renderResult.svg;

                if (renderResult.bindFunctions) {
                    try {
                        renderResult.bindFunctions(wrapper);
                    } catch (_) { }
                }

                const details = document.createElement('details');
                details.className = 'mermaid-source-toggle';
                const summary = document.createElement('summary');
                summary.textContent = 'Mermaid source';
                const preClone = parentPre.cloneNode(true);
                preClone.classList.add('mermaid-source');
                preClone.querySelectorAll('.copy-btn-wrapper').forEach(wrapper => wrapper.remove());
                if (typeof window.addCopyButtonToCodeBlock === 'function') {
                    try {
                        const codeInClone = preClone.querySelector('code');
                        if (codeInClone) {
                            window.addCopyButtonToCodeBlock(preClone, codeInClone);
                        }
                    } catch (_) { }
                }
                details.appendChild(summary);
                details.appendChild(preClone);

                const container = document.createElement('div');
                container.className = 'mermaid-render-container';
                const svgElement = wrapper.querySelector('svg');
                if (svgElement) {
                    const toolbar = createMermaidToolbar(svgElement, uniqueId);
                    container.appendChild(toolbar);
                }
                container.appendChild(wrapper);
                container.appendChild(details);

                parentPre.replaceWith(container);
                codeElement.dataset.mermaidProcessed = 'true';
                if (codeElement.dataset.mermaidPending === 'true') {
                    delete codeElement.dataset.mermaidPending;
                }
            } catch (error) {
                console.warn('Failed to render Mermaid diagram:', error);
                codeElement.dataset.mermaidProcessed = 'error';
                if (codeElement.dataset.mermaidPending === 'true') {
                    delete codeElement.dataset.mermaidPending;
                }

                const errorBanner = document.createElement('div');
                errorBanner.className = 'mermaid-error-banner';
                errorBanner.textContent = `Mermaid diagram rendering failed: ${error.message || error}`;
                parentPre.parentNode.insertBefore(errorBanner, parentPre);
            }
        }
    }).catch(error => {
        console.warn('Mermaid library could not be loaded:', error);
    });

    return trackRenderPromise(renderProcess);
}

export function waitForAllMermaidRenders() {
    if (pendingRenders.size === 0) {
        return Promise.resolve();
    }
    return Promise.allSettled(Array.from(pendingRenders));
}

export function hasPendingMermaidRenders() {
    return pendingRenders.size > 0;
}

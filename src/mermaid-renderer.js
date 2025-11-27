import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

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
        { regex: /<\/?(?:div|p|section|article|pre|blockquote|ul|ol|li|table|tr|td|th)[^>]*>/gi, replacement: '\n' },
        { regex: /<\/?(?:span|strong|em|code|b|i)[^>]*>/gi, replacement: '' },
        { regex: /&nbsp;/gi, replacement: ' ' }
    ];

    let sanitized = definition;
    for (const { regex, replacement } of replacements) {
        sanitized = sanitized.replace(regex, replacement);
    }

    sanitized = sanitized.replace(/\u00A0/g, ' ');
    sanitized = sanitized.replace(/[ \t]+$/gm, '');
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

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

    let lines = text.split(/\n/).map(l => l.replace(/[ \t]+$/g, ''));
    lines = lines.filter(l => !/^\s*copy\s*$/i.test(l));

    const stripInlineComments = (ln) => {
        const trimmed = ln.trimStart();
        if (trimmed.startsWith('%%')) return ln;
        const idx = ln.indexOf('%%');
        if (idx > -1) {
            return ln.slice(0, idx).replace(/[ \t]+$/g, '');
        }
        return ln;
    };

    lines = lines.map(stripInlineComments);

    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    const normalized = lines.join('\n').trim();

    // 轻量判断
    const looksLikeMermaid = /(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|journey|pie|mindmap|subgraph\b|-->|==>)/i.test(normalized);

    if (!looksLikeMermaid) {
        return { corrected: '', skippedReason: 'not-mermaid-like' };
    }

    if (!normalized) {
        return { corrected: '', skippedReason: 'empty-after-normalize' };
    }

    return { corrected: normalized, skippedReason: null };
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
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
            htmlLabels: true,
            flowchart: { htmlLabels: true },
            sequence: { useMaxWidth: true }
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

function getToastText(key, fallback) {
    try {
        const getter = (typeof window !== 'undefined' && typeof window['getToastMessage'] === 'function')
            ? window['getToastMessage']
            : null;
        if (getter) {
            const text = getter(key);
            if (text && typeof text === 'string' && text.trim()) {
                return text;
            }
        }
    } catch (_) { }
    return fallback;
}

function showToastSafe(key, fallback, type = 'info') {
    const text = getToastText(key, fallback);
    if (!text) return;
    if (typeof window?.showToast === 'function') {
        window.showToast(text, type);
    }
}

async function ensureStoragePermission() {
    const isAndroid = typeof Capacitor?.getPlatform === 'function' && Capacitor.getPlatform() === 'android';
    if (!isAndroid) return;
    try {
        const perm = await Filesystem.checkPermissions?.();
        if (perm?.publicStorage === 'granted') return;
        const req = await Filesystem.requestPermissions?.();
        if (req?.publicStorage === 'granted') return;
    } catch (_) { }
    const msg = getToastText('toast.grantStoragePermission', 'Storage permission required');
    if (typeof window?.showToast === 'function') {
        window.showToast(msg, 'error');
    }
    throw new Error(msg);
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
        try {
            const maybePromise = onClick();
            if (maybePromise && typeof maybePromise.catch === 'function') {
                maybePromise.catch(err => console.warn('Mermaid toolbar action failed:', err));
            }
        } catch (error) {
            console.warn('Mermaid toolbar action failed:', error);
        }
    });
    return button;
}

async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const base64String = String(reader.result || '');
            const pure = base64String.includes(',')
                ? base64String.split(',')[1]
                : base64String;
            resolve(pure);
        };
        reader.readAsDataURL(blob);
    });
}

async function triggerDownloadFromBlob(blob, filename) {
    const isNative = typeof Capacitor !== 'undefined' && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform();
    if (isNative) {
        try {
            await ensureStoragePermission();
            const base64 = await blobToBase64(blob);
            const mediaStore = Capacitor.Plugins?.MediaStore;
            if (mediaStore) {
                await mediaStore.saveImage({ base64, filename });
                showToastSafe('toast.imageSavedToAlbum', 'Saved', 'success');
                return;
            }

            const folder = 'Pictures/LittleAIBox';
            try {
                await Filesystem.mkdir({
                    path: folder,
                    directory: Directory.ExternalStorage,
                    recursive: true
                });
            } catch (_) { }
            await Filesystem.writeFile({
                path: `${folder}/${filename}`,
                data: base64,
                directory: Directory.ExternalStorage,
                recursive: true
            });
            showToastSafe('toast.imageSavedToAlbum', 'Saved', 'success');
            return;
        } catch (err) {
            showToastSafe('toast.downloadFailedRetry', 'Download failed', 'error');
        }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToastSafe('toast.downloadSuccess', '图片下载成功', 'success');
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

function stripUnsafeUrlsInStyles(svgRoot) {
    if (!svgRoot || typeof svgRoot.querySelectorAll !== 'function') return;

    const isSafeUrl = (urlText) => {
        const cleaned = (urlText || '').trim().replace(/^['"]|['"]$/g, '');
        if (!cleaned) return true;
        if (/^data:/i.test(cleaned)) return true;
        try {
            const parsed = new URL(cleaned, window.location.href);
            return parsed.origin === window.location.origin;
        } catch (_) {
            return false;
        }
    };

    const replaceUnsafeUrls = (text) => text.replace(/url\(([^)]+)\)/gi, (match, group) => {
        return isSafeUrl(group) ? match : 'none';
    });

    svgRoot.querySelectorAll('*[style]').forEach((el) => {
        const style = el.getAttribute('style');
        if (style && /url\(/i.test(style)) {
            el.setAttribute('style', replaceUnsafeUrls(style));
        }
    });

    svgRoot.querySelectorAll('style').forEach((styleEl) => {
        const css = styleEl.textContent;
        if (css && /url\(/i.test(css)) {
            styleEl.textContent = replaceUnsafeUrls(css);
        }
    });
}

function stripExternalImages(svgRoot) {
    if (!svgRoot || typeof svgRoot.querySelectorAll !== 'function') return;
    const images = svgRoot.querySelectorAll('image, img, use[href], use[xlink\\:href]');
    images.forEach((node) => {
        const href = node.getAttribute('href') || node.getAttribute('xlink:href');
        if (href && !href.startsWith('data:')) {
            node.remove();
        }
    });
}

function stripForeignObjects(svgRoot) {
    if (!svgRoot || typeof svgRoot.querySelectorAll !== 'function') return;
    const nodes = svgRoot.querySelectorAll('foreignObject');
    nodes.forEach((node) => {
        node.remove();
    });
}

function getSvgSize(svgElement) {
    if (!svgElement) {
        return { width: 800, height: 600 };
    }

    const viewBox = svgElement.viewBox && svgElement.viewBox.baseVal;
    if (viewBox && viewBox.width && viewBox.height) {
        return { width: viewBox.width, height: viewBox.height };
    }

    const widthAttr = parseFloat(svgElement.getAttribute('width'));
    const heightAttr = parseFloat(svgElement.getAttribute('height'));
    if (!Number.isNaN(widthAttr) && !Number.isNaN(heightAttr)) {
        return { width: widthAttr, height: heightAttr };
    }

    try {
        const bbox = typeof svgElement.getBBox === 'function' ? svgElement.getBBox() : null;
        if (bbox && bbox.width && bbox.height) {
            return { width: bbox.width, height: bbox.height };
        }
    } catch (_) { }

    const rect = typeof svgElement.getBoundingClientRect === 'function'
        ? svgElement.getBoundingClientRect()
        : null;
    if (rect && rect.width && rect.height) {
        return { width: rect.width, height: rect.height };
    }

    return { width: 800, height: 600 };
}

async function downloadRasterFromSvg(svgElement, filenameBase, {
    mimeType = 'image/png',
    extension = 'png',
    scale = 2,
    backgroundColor = '#ffffff'
} = {}) {
    if (!svgElement) {
        throw new Error('SVG element is missing');
    }

    const { width, height } = getSvgSize(svgElement);
    const serializer = new XMLSerializer();
    const cloned = svgElement.cloneNode(true);

    stripUnsafeUrlsInStyles(cloned);
    stripExternalImages(cloned);
    stripForeignObjects(cloned);
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
    const url = URL.createObjectURL(svgBlob);

    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = (error) => reject(error || new Error('Failed to load SVG into image'));
            img.src = url;
        });

        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Canvas context is unavailable');
        }
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        if (backgroundColor) {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((b) => {
                if (b) resolve(b);
                else reject(new Error('Canvas export failed'));
            }, mimeType);
        });

        triggerDownloadFromBlob(blob, `${filenameBase}.${extension}`);
    } catch (error) {
        try {
            const fallbackClone = svgElement.cloneNode(true);
            stripUnsafeUrlsInStyles(fallbackClone);
            stripForeignObjects(fallbackClone);
            stripExternalImages(fallbackClone);
            const fallbackSerializer = new XMLSerializer();
            const fallbackSource = fallbackSerializer.serializeToString(fallbackClone);
            const fallbackBlob = new Blob(
                [`<?xml version="1.0" encoding="UTF-8"?>\n${fallbackSource}`],
                { type: 'image/svg+xml;charset=utf-8' }
            );
            triggerDownloadFromBlob(fallbackBlob, `${filenameBase}.svg`);
        } catch (fallbackError) {
            console.warn('Mermaid PNG fallback failed, downloading original SVG:', fallbackError);
            downloadSvgFile(svgElement, filenameBase);
        }
    } finally {
        URL.revokeObjectURL(url);
    }
}

function createMermaidToolbar(svgElement, filenameBase) {
    const toolbar = document.createElement('div');
    toolbar.className = 'mermaid-render-toolbar';
    const downloadImageLabel = getLocalizedLabel('ui.downloadImage', 'Download Image');
    const imageButton = createToolbarButton(downloadImageLabel, () => downloadRasterFromSvg(svgElement, filenameBase, {
        mimeType: 'image/png',
        extension: 'png',
        scale: 2
    }));
    toolbar.appendChild(imageButton);
    return toolbar;
}

function shouldRenderMermaid(codeElement, { isFinalRender, rootElement }) {
    if (!codeElement) {
        return false;
    }

    const processed = codeElement.dataset.mermaidProcessed;
    if (processed === 'true' || processed === 'error' || processed === 'skipped') {
        return false;
    }

    if (codeElement.dataset.mermaidSource === 'true') {
        return false;
    }

    const sourceWrapper = codeElement.closest('.mermaid-source');
    if (sourceWrapper) {
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
                preClone.querySelectorAll('code').forEach(code => {
                    code.dataset.mermaidSource = 'true';
                });
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

const VEGA_SCRIPT_SOURCES = ['/libs/vega.min.js'];
const VEGA_LITE_SCRIPT_SOURCES = ['/libs/vega-lite.min.js'];
const VEGA_EMBED_SCRIPT_SOURCES = ['/libs/vega-embed.min.js'];

let vegaInitPromise = null;
const pendingRenders = new Set();
let diagramIdCounter = 0;

function trackRenderPromise(promise) {
    pendingRenders.add(promise);
    notifyRenderState();
    promise.finally(() => {
        pendingRenders.delete(promise);
        notifyRenderState();
    });
    return promise;
}

function notifyRenderState() {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('vega-lite-render-state', {
            detail: { pending: pendingRenders.size }
        }));
    }
}

function loadScriptViaTag(src, dataAttr) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[data-${dataAttr}="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.setAttribute(`data-${dataAttr}`, src);
        script.onload = () => resolve();
        script.onerror = () => {
            script.remove();
            reject(new Error(`Failed to load ${src}`));
        };
        document.head.appendChild(script);
    });
}

async function loadFromList(list, loader) {
    let lastError = null;
    for (const src of list) {
        try {
            await loader(src);
            return;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('Script load failed');
}

function ensureVegaLite(loadScript) {
    if (window.vegaEmbed && window.vegaLite && window.vega) {
        return Promise.resolve(window.vegaEmbed);
    }

    if (!vegaInitPromise) {
        const loader = (src, globalName) => {
            if (typeof loadScript === 'function') {
                return loadScript(src, globalName);
            }
            return loadScriptViaTag(src, 'vega-loader');
        };

        vegaInitPromise = (async () => {
            await loadFromList(VEGA_SCRIPT_SOURCES, (src) => loader(src, 'vega'));
            await loadFromList(VEGA_LITE_SCRIPT_SOURCES, (src) => loader(src, 'vegaLite'));
            await loadFromList(VEGA_EMBED_SCRIPT_SOURCES, (src) => loader(src, 'vegaEmbed'));

            if (!window.vegaEmbed || !window.vegaLite || !window.vega) {
                throw new Error('Vega libraries did not attach to window');
            }
            return window.vegaEmbed;
        })().catch(error => {
            vegaInitPromise = null;
            throw error;
        });
    }

    return vegaInitPromise;
}

function looksLikeVegaSpecText(text) {
    if (!text) return false;
    const normalized = text.trim();
    if (!normalized.startsWith('{')) return false;
    const lower = normalized.toLowerCase();
    if (lower.includes('"$schema"') && lower.includes('vega')) return true;
    if (lower.includes('"mark"')) return true;
    if (lower.includes('"marks"')) return true;
    return false;
}

function shouldRenderVegaLite(codeElement, { isFinalRender, rootElement } = {}) {
    if (!codeElement || codeElement.dataset.vegaLiteProcessed === 'true') return false;
    if (codeElement.dataset.vegaLiteProcessed === 'error') return false;
    if (codeElement.dataset.vegaLiteSource === 'true') return false;

    const sourceWrapper = codeElement.closest('.vega-lite-source');
    if (sourceWrapper) return false;

    const cls = codeElement.className || '';
    const looksLikeVega = cls.includes('language-vega-lite') || cls.includes('lang-vega-lite') ||
        cls.includes('language-vega') || cls.includes('lang-vega');
    if (!isFinalRender) {
        codeElement.dataset.vegaLitePending = 'true';
        return false;
    }
    if (looksLikeVega) return true;

    const text = (codeElement.textContent || '').trim();
    if (!text) return false;

    return looksLikeVegaSpecText(codeElement.textContent);
}

function safeParseSpec(raw) {
    try {
        return JSON.parse(raw);
    } catch (error) {
        throw new Error('Vega-Lite spec is not valid JSON');
    }
}

function normalizeVegaSpecString(raw) {
    if (typeof raw !== 'string') return raw;
    let text = raw;
    // Fix invalid domain patterns like [0][65] -> [0, 65]
    text = text.replace(/"domain"\s*:\s*\[\s*([-+]?\d+(?:\.\d+)?)\s*\]\s*\[\s*([-+]?\d+(?:\.\d+)?)\s*\]/g, '"domain": [$1, $2]');
    return text;
}

const DATA_URL_REWRITES = [
    {
        pattern: /https?:\/\/raw\.githubusercontent\.com\/vega\/vega-datasets\/(?:next\/)?data\/([^?#]+)/i,
        to: (filename) => `/data/${filename}`
    },
    {
        pattern: /^\.?\/?data\/([^?#]+)/i,
        to: (filename) => `/data/${filename}`
    }
];

function rewriteDataUrls(node) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
        node.forEach(rewriteDataUrls);
        return;
    }

    if (typeof node.url === 'string') {
        for (const rule of DATA_URL_REWRITES) {
            const match = node.url.match(rule.pattern);
            if (match && match[1]) {
                node.url = rule.to(match[1]);
                break;
            }
        }
    }

    Object.values(node).forEach(rewriteDataUrls);
}

function createErrorBanner(error, pre) {
    const banner = document.createElement('div');
    banner.className = 'vega-lite-error-banner';
    banner.textContent = `Vega-Lite render failed: ${error.message || error}`;
    pre.parentNode.insertBefore(banner, pre);
}

function getLocalizedLabel(key, fallback) {
    try {
        const getter = (typeof window !== 'undefined' && typeof window['getToastMessage'] === 'function')
            ? window['getToastMessage']
            : null;
        if (getter) {
            const label = getter(key);
            if (label && typeof label === 'string' && label.trim()) {
                return label;
            }
        }
    } catch (_) { }
    return fallback;
}

function createDownloadButton(view, filenameBase = 'vega-chart') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vega-lite-download-btn';
    btn.title = getLocalizedLabel('ui.downloadSvg', 'Download SVG');
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M5 20h14a1 1 0 0 0 1-1v-2h-2v1H6v-1H4v2a1 1 0 0 0 1 1zm7-3 5-5h-3V4h-4v8H7l5 5z"/>
        </svg>
        <span class="sr-only">${getLocalizedLabel('ui.downloadSvg', 'Download SVG')}</span>
    `;
    btn.addEventListener('click', async (event) => {
        event.stopPropagation();
        try {
            const svg = await view.toSVG();
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filenameBase}.svg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (error) {
            console.warn('Vega-Lite export failed:', error);
        }
    });
    return btn;
}

export function renderVegaLiteDiagrams(rootElement, { loadScript, isFinalRender } = {}) {
    if (!rootElement) return null;

    const codeBlocks = Array.from(rootElement.querySelectorAll('pre code'));
    const targets = codeBlocks.filter(code => shouldRenderVegaLite(code, { isFinalRender, rootElement }));
    if (targets.length === 0) return null;

    const renderProcess = ensureVegaLite(loadScript).then(async (vegaEmbed) => {
        for (const codeElement of targets) {
            const parentPre = codeElement.closest('pre');
            if (!parentPre) continue;

            codeElement.dataset.vegaLitePending = 'true';
            const rawSpec = (codeElement.textContent || '').trim();
            const normalizedSpecText = normalizeVegaSpecString(rawSpec);

            if (!normalizedSpecText || !looksLikeVegaSpecText(normalizedSpecText)) {
                if (isFinalRender) {
                    codeElement.dataset.vegaLiteProcessed = 'skipped';
                } else {
                    codeElement.dataset.vegaLitePending = 'true';
                }
                delete codeElement.dataset.vegaLitePending;
                continue;
            }

            let spec;
            try {
                spec = safeParseSpec(normalizedSpecText);
                if (normalizedSpecText !== rawSpec) {
                    codeElement.textContent = normalizedSpecText;
                    codeElement.dataset.vegaLiteSanitized = 'true';
                }
            } catch (error) {
                if (isFinalRender) {
                    codeElement.dataset.vegaLiteProcessed = 'error';
                    createErrorBanner(error, parentPre);
                }
                delete codeElement.dataset.vegaLitePending;
                continue;
            }

            const container = document.createElement('div');
            container.className = 'vega-lite-render-container';

            try {
                const specCopy = (typeof structuredClone === 'function')
                    ? structuredClone(spec)
                    : JSON.parse(JSON.stringify(spec));
                rewriteDataUrls(specCopy);
                parentPre.replaceWith(container);

                const preClone = parentPre.cloneNode(true);
                preClone.classList.add('vega-lite-source');
                preClone.querySelectorAll('code').forEach(code => {
                    code.dataset.vegaLiteSource = 'true';
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

                const chartHost = document.createElement('div');
                chartHost.className = 'vega-lite-chart-host';
                container.appendChild(chartHost);

                const embedOptions = { actions: false, renderer: 'svg' };
                if (typeof window !== 'undefined' && window.vega && typeof window.vega.Warn !== 'undefined') {
                    embedOptions.logLevel = window.vega.Warn;
                }

                const embedResult = await vegaEmbed(chartHost, specCopy, embedOptions);
                const uniqueId = `vega-diagram-${Date.now()}-${diagramIdCounter++}`;

                const toolbar = document.createElement('div');
                toolbar.className = 'vega-lite-toolbar';
                const downloadBtn = createDownloadButton(embedResult?.view, uniqueId);
                if (downloadBtn) {
                    toolbar.appendChild(downloadBtn);
                }
                container.insertBefore(toolbar, chartHost);

                const details = document.createElement('details');
                details.className = 'vega-lite-source-toggle';
                const summary = document.createElement('summary');
                summary.textContent = 'Vega source';
                details.appendChild(summary);
                details.appendChild(preClone);
                container.appendChild(details);
                codeElement.dataset.vegaLiteProcessed = 'true';
            } catch (error) {
                if (isFinalRender) {
                    codeElement.dataset.vegaLiteProcessed = 'error';
                    createErrorBanner(error, parentPre);
                }
            } finally {
                delete codeElement.dataset.vegaLitePending;
            }
        }
    }).catch(error => {
        console.warn('Vega-Lite library could not be loaded:', error);
    });

    return trackRenderPromise(renderProcess);
}

export function waitForAllVegaLiteRenders() {
    if (pendingRenders.size === 0) return Promise.resolve();
    return Promise.allSettled(Array.from(pendingRenders));
}

export function hasPendingVegaLiteRenders() {
    return pendingRenders.size > 0;
}

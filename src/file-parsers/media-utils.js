import { LocalStore } from './local-store.js';

const getImageMime = (path) => {
    const ext = (path.split('.').pop() || '').toLowerCase();
    const map = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        bmp: 'image/bmp',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        wmf: 'image/x-wmf',
        emf: 'image/x-emf',
        tif: 'image/tiff',
        tiff: 'image/tiff'
    };
    return map[ext] || 'application/octet-stream';
};

const EMU_PER_PX = 9525;
const EMU_PER_PT = 12700;
const DEFAULT_PX = 300;
const DEFAULT_PT = Math.round(DEFAULT_PX * 72 / 96);
const MAX_PX = 512;
const VECTOR_WEBP_QUALITY = 0.72;
const MAX_VECTOR_DATAURL_BYTES = 220 * 1024;

const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
};

const emuToPx = (emu) => Math.max(1, Math.round(emu / EMU_PER_PX));
const emuToPt = (emu) => Math.max(1, Math.round(emu / EMU_PER_PT));

const getImageSize = (node) => {
    const extent = node.getElementsByTagName('wp:extent')[0]
        || node.getElementsByTagName('a:ext')[0];
    if (!extent) {
        return {
            pxWidth: DEFAULT_PX,
            pxHeight: DEFAULT_PX,
            ptWidth: DEFAULT_PT,
            ptHeight: DEFAULT_PT
        };
    }
    const cx = toNumber(extent.getAttribute('cx'));
    const cy = toNumber(extent.getAttribute('cy'));
    if (!cx || !cy) {
        return {
            pxWidth: DEFAULT_PX,
            pxHeight: DEFAULT_PX,
            ptWidth: DEFAULT_PT,
            ptHeight: DEFAULT_PT
        };
    }
    return {
        pxWidth: emuToPx(cx),
        pxHeight: emuToPx(cy),
        ptWidth: emuToPt(cx),
        ptHeight: emuToPt(cy)
    };
};

const clampSize = (size) => {
    const pxWidth = size?.pxWidth || DEFAULT_PX;
    const pxHeight = size?.pxHeight || DEFAULT_PX;
    const maxSide = Math.max(pxWidth, pxHeight);
    if (maxSide <= MAX_PX) {
        return size;
    }
    const scale = MAX_PX / maxSide;
    return {
        pxWidth: Math.max(1, Math.round(pxWidth * scale)),
        pxHeight: Math.max(1, Math.round(pxHeight * scale)),
        ptWidth: Math.max(1, Math.round((size?.ptWidth || DEFAULT_PT) * scale)),
        ptHeight: Math.max(1, Math.round((size?.ptHeight || DEFAULT_PT) * scale))
    };
};

const base64ToArrayBuffer = (base64) => {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
};

const parseDataUrl = (dataUrl) => {
    if (!dataUrl) return null;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { mime: match[1], data: match[2] };
};

const loadVectorRenderer = async (mime, ctx) => {
    const cache = ctx.vectorRenderers;
    if (cache.has(mime)) {
        return cache.get(mime);
    }
    if (typeof ctx.loadScript !== 'function') {
        cache.set(mime, null);
        return null;
    }
    const info = mime === 'image/x-wmf'
        ? { script: '/libs/WMFJS.bundle.min.js', global: 'WMFJS' }
        : mime === 'image/x-emf'
            ? { script: '/libs/EMFJS.bundle.min.js', global: 'EMFJS' }
            : null;
    if (!info) {
        cache.set(mime, null);
        return null;
    }
    await ctx.loadScript(info.script, info.global);
    const globalObj = typeof window !== 'undefined' ? window[info.global] : null;
    if (globalObj && typeof globalObj.loggingEnabled === 'function') {
        globalObj.loggingEnabled(false);
    }
    const Renderer = globalObj?.Renderer || null;
    cache.set(mime, Renderer);
    return Renderer;
};

const serializeSvg = (svgContent, width, height) => {
    if (!svgContent) return '';
    let svgText = '';
    if (typeof svgContent === 'string') {
        svgText = svgContent;
    } else if (typeof svgContent.outerHTML === 'string') {
        svgText = svgContent.outerHTML;
    } else if (typeof XMLSerializer !== 'undefined') {
        try {
            svgText = new XMLSerializer().serializeToString(svgContent);
        } catch (_) {
            svgText = '';
        }
    }
    if (!svgText) return '';
    const hasSvgTag = /<svg[\s>]/i.test(svgText);
    if (!hasSvgTag) return '';
    const hasWidth = /<svg[^>]*\swidth=/i.test(svgText);
    const hasHeight = /<svg[^>]*\sheight=/i.test(svgText);
    const hasViewBox = /<svg[^>]*\sviewBox=/i.test(svgText);
    const withSize = svgText.replace(
        /<svg([^>]*)>/i,
        (match, attrs) => {
            let updated = attrs;
            if (!/xmlns=/.test(updated)) {
                updated += ' xmlns="http://www.w3.org/2000/svg"';
            }
            if (!hasWidth) {
                updated += ` width="${Math.round(width)}"`;
            }
            if (!hasHeight) {
                updated += ` height="${Math.round(height)}"`;
            }
            if (!hasViewBox) {
                updated += ` viewBox="0 0 ${Math.round(width)} ${Math.round(height)}"`;
            }
            return `<svg${updated}>`;
        }
    );
    return withSize;
};

const svgToPngDataUrl = async (svgContent, width, height, options = {}) => new Promise((resolve, reject) => {
    try {
        const svgText = serializeSvg(svgContent, width, height);
        if (!svgText) {
            reject(new Error('Failed to serialize vector image'));
            return;
        }
        const quality = typeof options.quality === 'number' ? options.quality : VECTOR_WEBP_QUALITY;
        const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : MAX_VECTOR_DATAURL_BYTES;
        const renderOnce = (w, h) => {
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(w));
            canvas.height = Math.max(1, Math.round(h));
            return { canvas, ctx: canvas.getContext('2d') };
        };
        const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        const renderPng = (image, w, h) => {
            const { canvas, ctx } = renderOnce(w, h);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            let dataUrl = '';
            try {
                dataUrl = canvas.toDataURL('image/webp', quality);
            } catch (_) {
                dataUrl = '';
            }
            if (!dataUrl || dataUrl.startsWith('data:image/png')) {
                dataUrl = canvas.toDataURL('image/png');
            }
            if (dataUrl.length > maxBytes * 1.37 && w > 64 && h > 64) {
                const scale = Math.max(0.5, Math.sqrt(maxBytes / (dataUrl.length / 1.37)));
                const nextW = Math.max(64, Math.round(w * scale));
                const nextH = Math.max(64, Math.round(h * scale));
                renderPng(image, nextW, nextH);
                return;
            }
            resolve(dataUrl);
        };
        img.onload = () => {
            URL.revokeObjectURL(url);
            renderPng(img, width, height);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
            const fallbackImg = new Image();
            fallbackImg.onload = () => {
                renderPng(fallbackImg, width, height);
            };
            fallbackImg.onerror = () => reject(new Error('Failed to render vector image'));
            fallbackImg.src = dataUrl;
        };
        img.src = url;
    } catch (error) {
        reject(error);
    }
});

const silenceConsole = (fn) => {
    const original = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        debug: console.debug
    };
    console.log = () => {};
    console.info = () => {};
    console.warn = () => {};
    console.debug = () => {};
    try {
        return fn();
    } finally {
        console.log = original.log;
        console.info = original.info;
        console.warn = original.warn;
        console.debug = original.debug;
    }
};

const base64ToBlob = (base64, mime) => new Blob([base64ToArrayBuffer(base64)], { type: mime });

const computeHash = async (blob) => {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-1', buffer);
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
};

const MIN_IMAGE_BYTES = 256;

export const processAndSaveImage = async (blob, width, height) => {
    if (!blob || blob.size < MIN_IMAGE_BYTES) return '';
    const hash = await computeHash(blob);
    const exists = await LocalStore.getMeta(hash);
    if (!exists) {
        await LocalStore.saveImage(hash, blob, { width, height, mime: blob.type });
    }
    return `cid:${hash}`;
};

const renderVectorToPng = async (base64, mime, size, ctx) => {
    const Renderer = await loadVectorRenderer(mime, ctx);
    if (!Renderer) return '';
    const buffer = base64ToArrayBuffer(base64);
    const widthPx = size?.pxWidth || DEFAULT_PX;
    const heightPx = size?.pxHeight || DEFAULT_PX;
    const widthPt = size?.ptWidth || DEFAULT_PT;
    const heightPt = size?.ptHeight || DEFAULT_PT;
    const renderOptions = {
        width: `${widthPt}pt`,
        height: `${heightPt}pt`,
        xExt: widthPx,
        yExt: heightPx,
        mapMode: 8
    };
    if (mime === 'image/x-emf') {
        renderOptions.wExt = widthPx;
        renderOptions.hExt = heightPx;
    }
    const renderSvg = () => {
        const renderer = new Renderer(buffer, {});
        return renderer.render(renderOptions);
    };
    const svgText = ctx.suppressVectorLogs ? silenceConsole(renderSvg) : renderSvg();
    if (!svgText) return '';
    try {
        return await svgToPngDataUrl(svgText, widthPx, heightPx, {
            quality: VECTOR_WEBP_QUALITY,
            maxBytes: MAX_VECTOR_DATAURL_BYTES
        });
    } catch (_) {
        return '';
    }
};

const buildRelsMap = (relsDoc) => {
    const map = new Map();
    if (!relsDoc) return map;
    const relationships = Array.from(relsDoc.getElementsByTagName('Relationship'));
    relationships.forEach(rel => {
        const id = rel.getAttribute('Id');
        const target = rel.getAttribute('Target');
        const mode = rel.getAttribute('TargetMode');
        if (!id || !target || mode === 'External') return;
        map.set(id, target);
    });
    return map;
};

const getAltText = (node) => {
    if (!node || node.nodeType !== 1) return '';
    const docPr = node.getElementsByTagName('wp:docPr')[0];
    if (docPr) {
        const descr = docPr.getAttribute('descr');
        if (descr) return descr;
        const title = docPr.getAttribute('title');
        if (title) return title;
    }
    const cNvPr = node.getElementsByTagName('p:cNvPr')[0];
    if (cNvPr) {
        const descr = cNvPr.getAttribute('descr');
        if (descr) return descr;
        const name = cNvPr.getAttribute('name');
        if (name) return name;
    }
    return '';
};

const normalizeTargetPath = (basePath, target) => {
    let path = (target || '').replace(/\\/g, '/');
    if (path.startsWith('/')) {
        return path.slice(1);
    }
    let base = (basePath || '').replace(/\\/g, '/');
    const baseParts = base.split('/').filter(Boolean);
    while (path.startsWith('../')) {
        path = path.slice(3);
        baseParts.pop();
    }
    if (path.startsWith('./')) {
        path = path.slice(2);
    }
    return [...baseParts, path].filter(Boolean).join('/');
};

const resolveImageReference = async (node, ctx) => {
    if (!node || node.nodeType !== 1) return '';
    const blip = node.getElementsByTagName('a:blip')[0];
    const embedId = blip?.getAttribute('r:embed') || blip?.getAttribute('embed');
    const vImg = node.getElementsByTagName('v:imagedata')[0];
    const vId = vImg?.getAttribute('r:id') || vImg?.getAttribute('id');
    const relId = embedId || vId;
    if (!relId) return '';
    const target = ctx.relsMap.get(relId);
    if (!target) return '';
    const fullPath = normalizeTargetPath(ctx.basePath, target);
    if (!fullPath) return '';
    const size = clampSize(getImageSize(node));
    const file = ctx.zip.file(fullPath);
    if (!file) return '';
    const base64 = await file.async('base64');
    const mime = getImageMime(fullPath);
    const isVector = mime === 'image/x-wmf' || mime === 'image/x-emf';
    const cacheKey = isVector ? `${fullPath}|${size.pxWidth}x${size.pxHeight}|png` : fullPath;
    if (ctx.mediaCache.has(cacheKey)) {
        return ctx.mediaCache.get(cacheKey) || '';
    }
    if (isVector) {
        const pngUrl = await renderVectorToPng(base64, mime, size, ctx);
        if (pngUrl) {
            const parsed = parseDataUrl(pngUrl);
            if (parsed) {
                const blob = base64ToBlob(parsed.data, parsed.mime);
                const refId = await processAndSaveImage(
                    blob,
                    size?.pxWidth || DEFAULT_PX,
                    size?.pxHeight || DEFAULT_PX
                );
                ctx.mediaCache.set(cacheKey, refId || '');
                return refId || '';
            }
        }
    }
    const blob = base64ToBlob(base64, mime);
    const refId = await processAndSaveImage(
        blob,
        size?.pxWidth || DEFAULT_PX,
        size?.pxHeight || DEFAULT_PX
    );
    ctx.mediaCache.set(cacheKey, refId || '');
    return refId || '';
};

export const createMediaContext = (zip, relsDoc, basePath, loadScript, shared = {}) => ({
    zip,
    relsMap: buildRelsMap(relsDoc),
    mediaCache: new Map(),
    vectorRenderers: new Map(),
    basePath,
    loadScript,
    suppressVectorLogs: true
});

export const extractImageMarkdown = async (node, ctx) => {
    const refId = await resolveImageReference(node, ctx);
    if (!refId) return '';
    const alt = getAltText(node) || 'image';
    return `![${alt}](${refId})`;
};

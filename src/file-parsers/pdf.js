// pdf.js
import { processAndSaveImage, readFileHeader, isPdfHeader } from './media-utils.js';

const DEFAULT_MAX_FILE_BYTES = 30 * 1024 * 1024;
const DEFAULT_PARSE_TIMEOUT_MS = 8000;
const DEFAULT_MAX_PAGES = 200;
const DEFAULT_OCR_WINDOW_SIZE = 25;
const DEFAULT_OCR_K = 0.34;

export function createPdfReader({ loadScript, getToastMessage }) {
    const getMessage = (key, params) => {
        if (typeof getToastMessage !== 'function') return '';
        return getToastMessage(key, params);
    };

    const runWithTimeout = async (promise, timeoutMs, timeoutMessage) => {
        if (!timeoutMs || timeoutMs <= 0) return promise;
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            clearTimeout(timeoutId);
        }
    };

    const guardPdfFile = async (file, options) => {
        const maxFileBytes = Number.isFinite(options.maxFileBytes) ? options.maxFileBytes : DEFAULT_MAX_FILE_BYTES;
        if (file?.size && file.size > maxFileBytes) {
            throw new Error(getMessage('fileManagement.fileTooLarge') || 'File too large.');
        }
        const header = await readFileHeader(file, 4);
        if (!isPdfHeader(header)) {
            throw new Error(getMessage('fileManagement.invalidFileType') || 'Invalid file type.');
        }
    };

    const sortItemsByLayout = (items, pageWidth) => {
        if (items.length < 50) {
            return items.sort((a, b) => b.y - a.y);
        }

        const bucketSize = 10;
        const histogram = new Array(Math.ceil(pageWidth / bucketSize)).fill(0);
        items.forEach(it => {
            const idx = Math.floor(it.x / bucketSize);
            if (histogram[idx] !== undefined) histogram[idx]++;
        });

        const centerIdx = Math.floor(histogram.length / 2);
        const range = Math.floor(histogram.length * 0.15);
        let minVal = Infinity;
        let splitIndex = -1;

        for (let i = centerIdx - range; i < centerIdx + range; i++) {
            if (histogram[i] < minVal) {
                minVal = histogram[i];
                splitIndex = i;
            }
        }

        const isTwoCol = minVal < items.length * 0.01;
        const splitX = splitIndex * bucketSize;

        return items.sort((a, b) => {
            if (isTwoCol) {
                const aLeft = a.x < splitX;
                const bLeft = b.x < splitX;
                if (aLeft !== bLeft) return aLeft ? -1 : 1;
            }
            if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
            return a.x - b.x;
        });
    };

    const cleanAndMergeText = (items, viewport) => {
        const contentTop = viewport.height * 0.92;
        const contentBottom = viewport.height * 0.08;
        const bodyItems = items.filter(it => it.y < contentTop && it.y > contentBottom);

        let fullText = '';
        let lastY = -1;
        let lastX = -1;

        bodyItems.forEach(item => {
            if (lastY !== -1 && Math.abs(item.y - lastY) > 10) {
                if (!/[\u3002\uFF01\uFF1F.?!]$/.test(fullText.trim())) {
                    fullText += ' ';
                } else {
                    fullText += '\n';
                }
            } else if (lastX !== -1 && item.x - lastX > 10) {
                fullText += ' ';
            }
            fullText += item.str;
            lastY = item.y;
            lastX = item.x + (item.width || 0);
        });

        return fullText
            .replace(/\s+/g, ' ')
            .replace(/([a-z])- ([a-z])/g, '$1$2')
            .replace(/\n\s+/g, '\n');
    };

    const countEffectiveChars = (text) => {
        if (!text) return 0;
        const matches = text.match(/[A-Za-z0-9\u4e00-\u9fff]/g);
        return matches ? matches.length : 0;
    };

    const shouldPreferImageFallback = (items, pageText) => {
        if (!pageText || pageText.length < 50) return false;
        const trimmed = pageText.replace(/\s+/g, '');
        if (!trimmed) return true;
        const effectiveChars = countEffectiveChars(pageText);
        const effectiveRatio = effectiveChars / pageText.length;
        const uniqueChars = new Set(trimmed).size;
        const uniqueRatio = uniqueChars / trimmed.length;
        const hasLongRepeat = /(.)\1{8,}/.test(trimmed);
        const tooFewItems = items.length < 6 && trimmed.length > 120;
        const lowSignal = effectiveRatio < 0.25 || uniqueRatio < 0.15;
        return hasLongRepeat || tooFewItems || lowSignal;
    };

    const preprocessCanvasForOcr = (canvas, options = {}) => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const width = canvas.width || 0;
        const height = canvas.height || 0;
        if (width <= 0 || height <= 0) return;

        const windowSize = Number.isFinite(options.windowSize) ? options.windowSize : DEFAULT_OCR_WINDOW_SIZE;
        const k = Number.isFinite(options.k) ? options.k : DEFAULT_OCR_K;
        const half = Math.max(1, Math.floor(windowSize / 2));
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const gray = new Uint8Array(width * height);

        for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            gray[p] = Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b));
        }

        const stride = width + 1;
        const size = (width + 1) * (height + 1);
        const integral = new Float64Array(size);
        const integralSq = new Float64Array(size);

        for (let y = 1; y <= height; y += 1) {
            let rowSum = 0;
            let rowSumSq = 0;
            const rowOffset = (y - 1) * width;
            const integralRow = y * stride;
            const integralPrevRow = (y - 1) * stride;
            for (let x = 1; x <= width; x += 1) {
                const val = gray[rowOffset + (x - 1)];
                rowSum += val;
                rowSumSq += val * val;
                const idx = integralRow + x;
                integral[idx] = integral[integralPrevRow + x] + rowSum;
                integralSq[idx] = integralSq[integralPrevRow + x] + rowSumSq;
            }
        }

        const getSum = (x1, y1, x2, y2) => {
            const a = y1 * stride + x1;
            const b = y1 * stride + x2;
            const c = y2 * stride + x1;
            const d = y2 * stride + x2;
            return integral[d] - integral[b] - integral[c] + integral[a];
        };
        const getSumSq = (x1, y1, x2, y2) => {
            const a = y1 * stride + x1;
            const b = y1 * stride + x2;
            const c = y2 * stride + x1;
            const d = y2 * stride + x2;
            return integralSq[d] - integralSq[b] - integralSq[c] + integralSq[a];
        };

        for (let y = 0; y < height; y += 1) {
            const y1 = Math.max(0, y - half);
            const y2 = Math.min(height - 1, y + half);
            const iy1 = y1;
            const iy2 = y2 + 1;
            for (let x = 0; x < width; x += 1) {
                const x1 = Math.max(0, x - half);
                const x2 = Math.min(width - 1, x + half);
                const ix1 = x1;
                const ix2 = x2 + 1;
                const area = (ix2 - ix1) * (iy2 - iy1);
                const sum = getSum(ix1, iy1, ix2, iy2);
                const sumSq = getSumSq(ix1, iy1, ix2, iy2);
                const mean = sum / area;
                const variance = Math.max(0, sumSq / area - mean * mean);
                const std = Math.sqrt(variance);
                const threshold = mean * (1 + k * (std / 128 - 1));
                const idx = y * width + x;
                const out = gray[idx] > threshold ? 255 : 0;
                const dataIdx = idx * 4;
                data[dataIdx] = out;
                data[dataIdx + 1] = out;
                data[dataIdx + 2] = out;
                data[dataIdx + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    };

    const renderPdfPageToDataUrl = async (page, viewport, options = {}) => {
        const {
            maxWidth = 1200,
            imageType = 'image/jpeg',
            quality = 0.8,
            ocrPreprocess = false,
            ocrWindowSize,
            ocrK
        } = options;
        const scale = viewport.width > maxWidth ? maxWidth / viewport.width : 1;
        const scaledViewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(scaledViewport.width);
        canvas.height = Math.ceil(scaledViewport.height);
        const context = canvas.getContext('2d');
        if (!context) return '';
        await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
        if (ocrPreprocess) {
            try {
                preprocessCanvasForOcr(canvas, {
                    windowSize: ocrWindowSize,
                    k: ocrK
                });
            } catch (_) { }
        }
        return canvas.toDataURL(imageType, quality);
    };

    const parseDataUrl = (dataUrl) => {
        if (!dataUrl) return null;
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return null;
        return { mime: match[1], data: match[2] };
    };

    const readPdfFile = async (file, options = {}) => {
        const allowImageFallback = options.allowImageFallback !== false;
        const ocrPreprocess = options.ocrPreprocess !== false;
        const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_PARSE_TIMEOUT_MS;
        await guardPdfFile(file, options);
        await loadScript('/libs/pdf.min.js', 'pdfjsLib');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/libs/pdf.worker.min.js';

        return await runWithTimeout(new Promise(async (resolve, reject) => {
            try {
                const buffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: buffer });
                    const pdf = await loadingTask.promise;
                    const maxPages = Number.isFinite(options.maxPages) ? options.maxPages : DEFAULT_MAX_PAGES;
                    if (pdf.numPages > maxPages) {
                        throw new Error(getMessage('fileManagement.fileCompressedTooLarge') || 'File structure is too complex.');
                    }
                    let markdown = '';
                    const pageErrors = [];
                    let parsedPages = 0;
                    let imageFallbackPages = 0;

                    for (let i = 1; i <= pdf.numPages; i++) {
                        try {
                            const page = await pdf.getPage(i);
                            const viewport = page.getViewport({ scale: 1.0 });
                            const textContent = await page.getTextContent();

                            let items = textContent.items.map(it => ({
                                str: it.str,
                                x: it.transform[4],
                                y: it.transform[5],
                                width: it.width,
                                hasEOL: it.hasEOL
                            }));

                            items = sortItemsByLayout(items, viewport.width);
                            const pageText = cleanAndMergeText(items, viewport);
                            const canUseText = pageText.length > 50;
                            const preferImageFallback = allowImageFallback
                                && shouldPreferImageFallback(items, pageText);

                            if (canUseText && !preferImageFallback) {
                                markdown += `\n<Page: ${i}>\n${pageText}\n`;
                                parsedPages += 1;
                            } else if (allowImageFallback) {
                                const imageData = await renderPdfPageToDataUrl(page, viewport, {
                                    ocrPreprocess: ocrPreprocess,
                                    ocrWindowSize: options.ocrWindowSize,
                                    ocrK: options.ocrK
                                });
                                const parsed = parseDataUrl(imageData);
                                if (parsed) {
                                    const blob = new Blob(
                                        [Uint8Array.from(atob(parsed.data), char => char.charCodeAt(0))],
                                        { type: parsed.mime }
                                    );
                                    const refId = await processAndSaveImage(
                                        blob,
                                        Math.round(viewport.width),
                                        Math.round(viewport.height)
                                    );
                                    if (refId) {
                                        markdown += `\n<PageImage: ${i}>\n![page-${i}](${refId})\n`;
                                        imageFallbackPages += 1;
                                        parsedPages += 1;
                                    }
                                }
                            } else if (canUseText) {
                                markdown += `\n<Page: ${i}>\n${pageText}\n`;
                                parsedPages += 1;
                            }
                        } catch (pageError) {
                            const message = getMessage('fileManagement.pageParseFailed', { number: i })
                                || `Failed to parse page ${i}`;
                            pageErrors.push(message);
                        }
                    }
                    if (parsedPages === 0) {
                        if (imageFallbackPages > 0) {
                            resolve({ text: markdown.trim() });
                            return;
                        }
                        if (!allowImageFallback) {
                            resolve({ text: markdown.trim() });
                            return;
                        }
                        if (pageErrors.length === pdf.numPages) {
                            throw new Error(pageErrors.join('\n'));
                        }
                        throw new Error(
                            getMessage('fileManagement.pdfScanVersion')
                                || 'This PDF may be a scan and cannot be parsed.'
                        );
                    }
                    resolve({ text: markdown });
            } catch (e) {
                reject(e);
            }
        }), timeoutMs, getMessage('fileManagement.parseTimeout') || 'File parse timeout.');
    };

    return { readPdfFile };
}

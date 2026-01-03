// pdf.js

import { processAndSaveImage } from './media-utils.js';

export function createPdfReader({ loadScript, getToastMessage }) {
    const getMessage = (key, params) => {
        if (typeof getToastMessage !== 'function') return '';
        return getToastMessage(key, params);
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

    const renderPdfPageToDataUrl = async (page, viewport, options = {}) => {
        const {
            maxWidth = 1200,
            imageType = 'image/jpeg',
            quality = 0.8
        } = options;
        const scale = viewport.width > maxWidth ? maxWidth / viewport.width : 1;
        const scaledViewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(scaledViewport.width);
        canvas.height = Math.ceil(scaledViewport.height);
        const context = canvas.getContext('2d');
        if (!context) return '';
        await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
        return canvas.toDataURL(imageType, quality);
    };

    const parseDataUrl = (dataUrl) => {
        if (!dataUrl) return null;
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return null;
        return { mime: match[1], data: match[2] };
    };

    const readPdfFile = async (file) => {
        await loadScript('/libs/pdf.min.js', 'pdfjsLib');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/libs/pdf.worker.min.js';

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function (event) {
                try {
                    const loadingTask = pdfjsLib.getDocument({ data: event.target.result });
                    const pdf = await loadingTask.promise;
                    let markdown = '';
                    const pageErrors = [];
                    let parsedPages = 0;

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

                            if (pageText.length > 50) {
                                markdown += `\n<Page: ${i}>\n${pageText}\n`;
                                parsedPages += 1;
                            } else {
                                const imageData = await renderPdfPageToDataUrl(page, viewport);
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
                                    }
                                }
                            }
                        } catch (pageError) {
                            const message = getMessage('fileManagement.pageParseFailed', { number: i })
                                || `Failed to parse page ${i}`;
                            pageErrors.push(message);
                        }
                    }
                    if (parsedPages === 0) {
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
            };
            reader.readAsArrayBuffer(file);
        });
    };

    return { readPdfFile };
}

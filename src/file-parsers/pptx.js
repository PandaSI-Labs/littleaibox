import { renderOmml } from './mathUtils.js';
import { TextCleaner } from './textUtils.js';
import { createMediaContext, extractImageMarkdown } from './media-utils.js';

const ELEMENT_NODE = typeof Node === 'undefined' ? 1 : Node.ELEMENT_NODE;

export function createPptxReader({ loadScript, getToastMessage }) {
    const getPptxNotesLabel = () => {
        if (typeof getToastMessage === 'function') {
            try {
                const label = getToastMessage('fileProcessing.notes');
                if (label && label !== 'fileProcessing.notes') {
                    return label;
                }
            } catch (_) { }
        }
        return 'Notes';
    };

    const formatAsBlockQuote = (text) => (
        text
            .split('\n')
            .map(line => line.trim().length ? `> ${line}` : '>')
            .join('\n')
    );

    const extractTextFromSlideXml = async (xmlContent, mediaCtx) => {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');
            const spTree = xmlDoc.getElementsByTagName('p:spTree')[0];
            const sections = [];

            if (spTree) {
                const processContainer = async (container) => {
                    const elementChildren = Array.from(container.childNodes || [])
                        .filter(node => node.nodeType === ELEMENT_NODE);

                    for (const child of elementChildren) {
                        if (child.tagName === 'p:sp') {
                            const textBody = child.getElementsByTagName('a:txBody')[0];
                            if (!textBody) {
                                continue;
                            }
                            const paragraphElements = Array.from(textBody.childNodes || [])
                                .filter(node => node.nodeType === ELEMENT_NODE && node.tagName === 'a:p');
                            if (!paragraphElements.length) {
                                continue;
                            }
                            const bulletState = new Map();
                            const lines = paragraphElements
                                .map(paragraph => buildParagraphMarkdown(paragraph, bulletState))
                                .filter(Boolean);
                            if (lines.length) {
                                sections.push(lines.join('\n'));
                            }
                        } else if (child.tagName === 'p:graphicFrame') {
                            const tableNode = child.getElementsByTagName('a:tbl')[0];
                            if (tableNode) {
                                const tableMarkdown = convertTableNodeToMarkdown(tableNode);
                                if (tableMarkdown) {
                                    sections.push(tableMarkdown);
                                }
                            }
                        } else if (child.tagName === 'p:pic') {
                            if (mediaCtx) {
                                const imageMarkdown = await extractImageMarkdown(child, mediaCtx);
                                if (imageMarkdown) {
                                    sections.push(imageMarkdown);
                                }
                            }
                        } else if (child.tagName === 'p:grpSp') {
                            await processContainer(child);
                        }
                    }
                };

                await processContainer(spTree);
            }

            if (sections.length) {
                const text = sections.join('\n\n');
                return TextCleaner.process(text);
            }

            const legacyText = legacySlideTextExtraction(xmlDoc);
            return legacyText ? TextCleaner.process(legacyText) : legacyText;
        } catch (_) {
            const fallback = legacySlideTextFallback(xmlContent);
            return fallback ? TextCleaner.process(fallback) : fallback;
        }
    };

    const buildParagraphMarkdown = (paragraph, bulletState, options = {}) => {
        const allowBullets = options.allowBullets !== false;
        const text = extractParagraphText(paragraph);
        if (!text) {
            return null;
        }

        const bulletInfo = allowBullets ? detectBulletInfo(paragraph) : { type: 'none', level: 0 };
        return formatParagraphText(text, bulletInfo, bulletState);
    };

    const collectParagraphParts = (node, parts) => {
        if (!node) return;
        if (node.nodeType !== ELEMENT_NODE) return;

        if (node.tagName === 'a:br') {
            parts.push('\n');
            return;
        }
        if (node.tagName && node.tagName.includes('oMath')) {
            const latex = renderOmml(node).trim();
            if (latex) parts.push(` $${latex}$ `);
            return;
        }
        if (node.tagName === 'a:t') {
            if (node.textContent) parts.push(node.textContent);
            return;
        }

        Array.from(node.childNodes || []).forEach(child => collectParagraphParts(child, parts));
    };

    const extractParagraphText = (paragraph) => {
        const parts = [];
        collectParagraphParts(paragraph, parts);
        return parts.join('').replace(/\s+/g, ' ').trim();
    };

    const detectBulletInfo = (paragraph) => {
        const pPr = paragraph.getElementsByTagName('a:pPr')[0];
        if (!pPr) {
            return { type: 'none', level: 0 };
        }
        if (pPr.getElementsByTagName('a:buNone').length > 0) {
            return { type: 'none', level: 0 };
        }

        let level = 0;
        const lvlAttr = pPr.getAttribute('lvl');
        if (lvlAttr) {
            const parsed = parseInt(lvlAttr, 10);
            if (!Number.isNaN(parsed)) {
                level = parsed;
            }
        } else {
            const marLAttr = pPr.getAttribute('marL');
            if (marLAttr) {
                const parsed = parseInt(marLAttr, 10);
                if (!Number.isNaN(parsed)) {
                    level = Math.min(6, Math.max(0, Math.round(parsed / 342900)));
                }
            }
        }

        const autoNum = pPr.getElementsByTagName('a:buAutoNum')[0];
        if (autoNum) {
            return { type: 'number', level: level };
        }

        const buChar = pPr.getElementsByTagName('a:buChar')[0];
        if (buChar) {
            const charAttr = buChar.getAttribute('char') || '-';
            return { type: 'bullet', level: level, char: charAttr };
        }

        return { type: 'bullet', level: level, char: '-' };
    };

    const formatParagraphText = (text, bulletInfo, bulletState) => {
        const indentUnit = '  ';
        if (!text) {
            return null;
        }

        if (bulletInfo.type === 'none') {
            bulletState.clear();
            return text;
        }

        const level = Math.min(Math.max(bulletInfo.level || 0, 0), 6);
        Array.from(bulletState.keys())
            .filter(existingLevel => existingLevel > level)
            .forEach(existingLevel => bulletState.delete(existingLevel));

        if (bulletInfo.type === 'number') {
            const nextValue = (bulletState.get(level) || 0) + 1;
            bulletState.set(level, nextValue);
            const firstLinePrefix = `${indentUnit.repeat(level)}${nextValue}. `;
            const continuationPrefix = `${indentUnit.repeat(level)}  `;
            return text.split('\n')
                .map((line, index) => (index === 0 ? firstLinePrefix + line : continuationPrefix + line))
                .join('\n');
        }

        bulletState.delete(level);
        const bulletChar = (bulletInfo.char || '-').trim();
        const safeBullet = bulletChar.length === 1 && !/\s/.test(bulletChar) ? bulletChar : '-';
        const firstLinePrefix = `${indentUnit.repeat(level)}${safeBullet} `;
        const continuationPrefix = `${indentUnit.repeat(level)}  `;
        return text.split('\n')
            .map((line, index) => (index === 0 ? firstLinePrefix + line : continuationPrefix + line))
            .join('\n');
    };

    const convertTableNodeToMarkdown = (tableNode) => {
        const rowElements = Array.from(tableNode.childNodes || [])
            .filter(node => node.nodeType === ELEMENT_NODE && node.tagName === 'a:tr');

        if (!rowElements.length) {
            return '';
        }

        const rows = rowElements.map(row => {
            const cellElements = Array.from(row.childNodes || [])
                .filter(node => node.nodeType === ELEMENT_NODE && node.tagName === 'a:tc');
            return cellElements.map(cell => {
                const textBody = cell.getElementsByTagName('a:txBody')[0];
                if (!textBody) {
                    return '';
                }
                const paragraphs = Array.from(textBody.childNodes || [])
                    .filter(node => node.nodeType === ELEMENT_NODE && node.tagName === 'a:p');
                if (!paragraphs.length) {
                    return '';
                }
                const bulletState = new Map();
                const cellLines = paragraphs
                    .map(paragraph => buildParagraphMarkdown(paragraph, bulletState, { allowBullets: false }))
                    .filter(Boolean);
                const cellText = cellLines.join('\n')
                    .replace(/\|/g, '\\|')
                    .replace(/\n+/g, '<br>');
                return cellText;
            });
        }).filter(row => row.some(cell => cell.trim().length > 0));

        if (!rows.length) {
            return '';
        }

        const columnCount = Math.max(...rows.map(row => row.length));
        if (columnCount === 0) {
            return '';
        }

        rows.forEach(row => {
            while (row.length < columnCount) {
                row.push('');
            }
        });

        const header = rows[0];
        const separator = new Array(columnCount).fill('---');
        const markdown = [];
        markdown.push(`| ${header.join(' | ')} |`);
        markdown.push(`| ${separator.join(' | ')} |`);
        rows.slice(1).forEach(row => {
            markdown.push(`| ${row.join(' | ')} |`);
        });
        return markdown.join('\n');
    };

    const legacySlideTextExtraction = (xmlDoc) => {
        const paragraphNodes = Array.from(xmlDoc.getElementsByTagName('a:p'));
        const paragraphs = paragraphNodes
            .map(p => Array.from(p.getElementsByTagName('a:t'))
                .map(node => node.textContent || '')
                .join('')
                .trim())
            .filter(Boolean);

        if (paragraphs.length > 0) {
            return paragraphs.join('\n\n');
        }

        const textNodes = Array.from(xmlDoc.getElementsByTagName('a:t'))
            .map(node => node.textContent || '')
            .filter(Boolean);
        if (textNodes.length > 0) {
            return textNodes.join(' ');
        }

        return '';
    };

    const legacySlideTextFallback = (xmlContent) => (
        xmlContent
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim()
    );

    const convertPptxToPlainText = async (file) => {
        const JSZipGlobal = window.JSZip;
        if (typeof JSZipGlobal === 'undefined' || JSZipGlobal === null) {
            throw new Error('JSZip is unavailable for PPTX fallback extraction');
        }
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZipGlobal.loadAsync(arrayBuffer);
        const slideNames = Object.keys(zip.files)
            .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
            .sort((a, b) => {
                const getIndex = (name) => Number(name.match(/slide(\d+)\.xml$/)?.[1] || 0);
                return getIndex(a) - getIndex(b);
            });

        const slidesMarkdown = await Promise.all(slideNames.map(async (slideName, index) => {
            const xmlContent = await zip.files[slideName].async('text');
            const relsName = slideName.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
            const relsXml = zip.files[relsName] ? await zip.files[relsName].async('text') : null;
            const parser = new DOMParser();
            const relsDoc = relsXml ? parser.parseFromString(relsXml, 'application/xml') : null;
            const mediaCtx = relsDoc ? createMediaContext(zip, relsDoc, 'ppt/slides', loadScript) : null;
            const textContent = await extractTextFromSlideXml(xmlContent, mediaCtx);
            const sections = [];
            if (textContent) {
                sections.push(textContent);
            }

            const notesName = slideName.replace('slides/slide', 'notesSlides/notesSlide');
            if (zip.files[notesName]) {
                try {
                    const notesXml = await zip.files[notesName].async('text');
                    const notesText = extractTextFromSlideXml(notesXml);
                    if (notesText) {
                        const notesLabel = getPptxNotesLabel();
                        sections.push(`**${notesLabel}**\n${formatAsBlockQuote(notesText)}`);
                    }
                } catch (notesError) {
                    console.debug('Failed to parse PPTX notes:', notesError);
                }
            }

            const body = sections.length ? `\n\n${sections.join('\n\n')}` : '';
            return `## ${getToastMessage('fileProcessing.slide')} ${index + 1}${body}`;
        }));

        if (slidesMarkdown.length === 0) {
            throw new Error('PPTX fallback extraction produced no slides');
        }

        return { text: slidesMarkdown.join('\n\n').trim() };
    };

    const readPptxFile = async (file) => {
        await loadScript('/libs/jszip.min.js', 'JSZip');
        return convertPptxToPlainText(file);
    };

    return { readPptxFile };
}

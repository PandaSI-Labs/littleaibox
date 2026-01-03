// docx.js
import { renderOmml } from './mathUtils.js';
import { createMediaContext, extractImageMarkdown } from './media-utils.js';

const inferHeader = (rPr, pStyleVal) => {
    const match = pStyleVal && pStyleVal.match(/Heading(\d)/);
    if (match) {
        return parseInt(match[1], 10);
    }

    if (rPr) {
        const isBold = rPr.getElementsByTagName('w:b').length > 0;
        const szVal = rPr.getElementsByTagName('w:sz')[0]?.getAttribute('w:val');
        const size = Number(szVal || 0);
        if (isBold && size >= 32) return 1;
        if (isBold && size >= 28) return 2;
    }

    return 0;
};

export function createDocxReader({ loadScript }) {
    const parseSymbolNode = (node) => {
        if (!node || node.nodeType !== 1) return '';
        const hex = node.getAttribute('w:char') || node.getAttribute('char');
        if (!hex) return '';
        const code = parseInt(hex, 16);
        if (Number.isNaN(code)) return '';
        try {
            return String.fromCodePoint(code);
        } catch (_) {
            return '';
        }
    };

    const collectInlineContent = async (node, parts, ctx) => {
        if (!node) return;
        if (node.nodeType !== 1) return;

        const name = node.localName || node.nodeName;
        if (name === 'instrText' || name === 'delText' || name === 'fldChar') {
            return;
        }
        if (name === 'oMath' || name === 'oMathPara') {
            const math = renderOmml(node).trim();
            if (math) parts.push(` $${math}$ `);
            return;
        }
        if (name === 'tab') {
            parts.push(' ');
            return;
        }
        if (name === 'br') {
            parts.push('\n');
            return;
        }
        if (name === 'sym') {
            const symbol = parseSymbolNode(node);
            if (symbol) parts.push(symbol);
            return;
        }
        if (name === 'drawing' || name === 'pict' || name === 'object' || name === 'OLEObject' || name === 'imagedata') {
            const imageMarkdown = await extractImageMarkdown(node, ctx);
            parts.push(imageMarkdown || '[Image]');
            return;
        }
        if (name === 't') {
            if (node.textContent) parts.push(node.textContent);
            return;
        }

        for (const child of Array.from(node.childNodes)) {
            await collectInlineContent(child, parts, ctx);
        }
    };

    const extractCellText = async (cell, ctx) => {
        let cellText = '';
        const paragraphs = Array.from(cell.getElementsByTagName('w:p'));
        for (let index = 0; index < paragraphs.length; index += 1) {
            const paragraph = paragraphs[index];
            const parts = [];
            await collectInlineContent(paragraph, parts, ctx);
            const line = parts.join('').trim();
            if (line) {
                cellText += (index > 0 ? '<br>' : '') + line;
            }
        }
        return cellText;
    };

    const extractDocxTextWithOmml = async (arrayBuffer) => {
        await loadScript('/libs/jszip.min.js', 'JSZip');
        const zip = await JSZip.loadAsync(arrayBuffer);
        const docXml = await zip.file('word/document.xml').async('text');
        const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('text');
        const parser = new DOMParser();
        const doc = parser.parseFromString(docXml, 'application/xml');
        const relsDoc = relsXml ? parser.parseFromString(relsXml, 'application/xml') : null;
        const ctx = createMediaContext(zip, relsDoc, 'word', loadScript);

        let fullText = '';
        const body = doc.getElementsByTagName('w:body')[0];
        const bodyChildren = body ? body.childNodes : [];

        for (const node of Array.from(bodyChildren)) {
            if (node.nodeName === 'w:p') {
                const pPr = node.getElementsByTagName('w:pPr')[0];
                const firstRun = node.getElementsByTagName('w:r')[0];
                const rPr = firstRun ? firstRun.getElementsByTagName('w:rPr')[0] : null;
                const pStyle = pPr?.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val');
                const level = inferHeader(rPr, pStyle);
                const numPr = node.getElementsByTagName('w:numPr')[0];
                const listPrefix = numPr ? '- ' : '';

                const parts = [];
                await collectInlineContent(node, parts, ctx);
                const line = parts.join('').trim();
                if (line) {
                    const prefix = level > 0 ? '#'.repeat(level) + ' ' : listPrefix;
                    fullText += `${prefix}${line}\n\n`;
                }
            } else if (node.nodeName === 'w:tbl') {
                const rows = Array.from(node.getElementsByTagName('w:tr'));
                if (rows.length === 0) continue;

                const matrix = [];
                for (const row of rows) {
                    const cells = Array.from(row.getElementsByTagName('w:tc'));
                    const rowValues = [];
                    for (const cell of cells) {
                        rowValues.push(await extractCellText(cell, ctx));
                    }
                    matrix.push(rowValues);
                }

                const header = matrix[0];
                fullText += `| ${header.join(' | ')} |\n`;
                fullText += `| ${header.map(() => '---').join(' | ')} |\n`;
                matrix.slice(1).forEach(row => {
                    while (row.length < header.length) row.push('');
                    fullText += `| ${row.join(' | ')} |\n`;
                });
                fullText += '\n';
            }
        }

        return { text: fullText };
    };

    const readDocxFile = async (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const result = await extractDocxTextWithOmml(e.target.result);
                resolve(result);
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsArrayBuffer(file);
    });

    return { readDocxFile };
}

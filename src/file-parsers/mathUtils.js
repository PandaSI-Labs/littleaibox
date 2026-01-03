// mathUtils.js
export const getOmmlChild = (node, localName) => {
    if (!node) return null;
    for (const child of Array.from(node.childNodes || [])) {
        // Handle namespace prefix (m:oMath).
        if (child.nodeType === 1 && (child.localName === localName || child.tagName.endsWith(`:${localName}`))) {
            return child;
        }
    }
    return null;
};

export const getOmmlAttr = (node, attrName) => {
    if (!node || !node.attributes) return '';
    const attr = Array.from(node.attributes).find(a => a.localName === attrName);
    return attr ? attr.value : '';
};

export const renderOmml = (node) => {
    if (!node) return '';
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';

    const tag = node.localName;
    if (!tag) return '';

    if (tag.endsWith('Pr')) {
        return '';
    }

    const ignoreTags = new Set([
        'argPr', 'barPr', 'borderBoxPr', 'boxPr', 'ctrlPr', 'dPr', 'eqArrPr',
        'funcPr', 'limLowPr', 'limUppPr', 'mPr', 'mrPr', 'naryPr', 'phantPr',
        'radPr', 'rPr', 'sSubPr', 'sSupPr', 'sSubSupPr', 'sty', 'val', 'pos',
        'brk', 'brkBin', 'brkBinSub', 'diff', 'grow', 'hideBot', 'hideTop',
        'limLoc', 'opEmu', 'plcHide', 'sepChr', 'begChr', 'endChr'
    ]);

    if (ignoreTags.has(tag)) {
        return '';
    }

    switch (tag) {
        case 'oMath': case 'oMathPara':
        case 'r': case 'e': case 'sup': case 'sub': case 'num': case 'den': case 'deg':
            return Array.from(node.childNodes).map(renderOmml).join('');

        case 't':
            return node.textContent || '';

        case 'f': {
            const num = renderOmml(getOmmlChild(node, 'num'));
            const den = renderOmml(getOmmlChild(node, 'den'));
            return ` \\frac{${num}}{${den}} `;
        }
        case 'sSup': {
            const base = renderOmml(getOmmlChild(node, 'e'));
            const sup = renderOmml(getOmmlChild(node, 'sup'));
            return `{${base}}^{${sup}}`;
        }
        case 'sSub': {
            const base = renderOmml(getOmmlChild(node, 'e'));
            const sub = renderOmml(getOmmlChild(node, 'sub'));
            return `{${base}}_{${sub}}`;
        }
        case 'rad': {
            const deg = renderOmml(getOmmlChild(node, 'deg'));
            const base = renderOmml(getOmmlChild(node, 'e'));
            return deg ? `\\sqrt[${deg}]{${base}}` : `\\sqrt{${base}}`;
        }
        case 'm': {
            const mrList = Array.from(node.getElementsByTagName('m:mr'));
            const rows = mrList.length > 0 ? mrList : Array.from(node.childNodes).filter(c => c.localName === 'mr');

            const latexRows = rows.map(mr => {
                const cells = Array.from(mr.childNodes).filter(c => c.localName === 'e');
                return cells.map(e => renderOmml(e)).join(' & ');
            }).join(' \\\\ ');
            return ` \\begin{matrix} ${latexRows} \\end{matrix} `;
        }
        case 'acc': {
            const accPr = getOmmlChild(node, 'accPr');
            const chrNode = getOmmlChild(accPr, 'chr');
            const chr = getOmmlAttr(chrNode, 'val');
            const base = renderOmml(getOmmlChild(node, 'e'));
            const map = { '\u20d7': '\\vec', '\u0303': '\\tilde', '\u0302': '\\hat', '\u0304': '\\bar', '\u0307': '\\dot' };
            return `${map[chr] || '\\hat'}{${base}}`;
        }
        case 'nary': {
            const naryPr = getOmmlChild(node, 'naryPr');
            const chr = getOmmlAttr(getOmmlChild(naryPr, 'chr'), 'val') || '\u222b';
            const sub = renderOmml(getOmmlChild(node, 'sub'));
            const sup = renderOmml(getOmmlChild(node, 'sup'));
            const body = renderOmml(getOmmlChild(node, 'e'));
            const opMap = { '\u2211': '\\sum', '\u220f': '\\prod', '\u222b': '\\int', '\u22c3': '\\bigcup', '\u22c2': '\\bigcap' };
            const op = opMap[chr] || chr;
            return `${op}_${sub}^{${sup}} ${body}`;
        }
        default:
            return Array.from(node.childNodes).map(renderOmml).join('');
    }
};

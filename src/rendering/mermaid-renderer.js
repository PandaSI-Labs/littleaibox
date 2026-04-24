import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

export const MERMAID_SCRIPT_SOURCES = [
    '/libs/mermaid.min.js'
];
const MERMAID_GLOBAL = 'mermaid';
const DEFAULT_DOWNLOAD_ICON_PATH = '<path d="M5 20h14a1 1 0 0 0 1-1v-2h-2v1H6v-1H4v2a1 1 0 0 0 1 1zm7-3 5-5h-3V4h-4v8H7l5 5z"/>';

let mermaidInitPromise = null;
let mermaidConfigured = false;
let diagramIdCounter = 0;
const pendingRenders = new Set();

function sanitizeMermaidSvg(svgText) {
    if (!svgText || typeof svgText !== 'string') return '';
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        return window.DOMPurify.sanitize(svgText, {
            USE_PROFILES: { svg: true, svgFilters: true },
            FORBID_TAGS: ['script', 'foreignObject'],
            FORBID_ATTR: ['onload', 'onerror']
        });
    }
    return svgText;
}

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
    sanitized = sanitized
        .replace(/[（]/g, '(')
        .replace(/[）]/g, ')')
        .replace(/[，]/g, ',')
        .replace(/[。]/g, '.')
        .replace(/[：]/g, ':')
        .replace(/[；]/g, ';')
        .replace(/[【]/g, '[')
        .replace(/[】]/g, ']')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[—]/g, '-');
    sanitized = sanitized.replace(/[ \t]+$/gm, '');
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

    return sanitized.trim();
}

function normalizeAndCorrectMermaid(definition) {
    let text = sanitizeMermaidDefinition(definition);
    text = text.replace(/\["([^"\n]*)"\]\s*(?:\n\s*)?(?:\(|\uFF08)([^)\uFF09\]]+)(?:\)|\uFF09)\s*"?\]?/g, (match, label, suffix) => {
        const escapedSuffix = suffix.replace(/>/g, '&gt;').replace(/</g, '&lt;');
        return `["${label} (${escapedSuffix})"]`;
    });

    const collapseMathLineBreaks = (input) => {
        if (!input) return input;
        let out = '';
        let inMath = false;
        for (let i = 0; i < input.length; i++) {
            const ch = input[i];
            if (ch === '$') {
                inMath = !inMath;
                out += ch;
                continue;
            }
            if (inMath && (ch === '\n' || ch === '\r')) {
                continue;
            }
            out += ch;
        }
        return out;
    };

    text = collapseMathLineBreaks(text);

    if (/^```/m.test(text)) {
        text = text.replace(/^```\s*mermaid\s*\n?/i, '');
        text = text.replace(/^```\s*\n?/, '');
        text = text.replace(/\n?```\s*$/i, '');
    }

    text = text
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u2192/g, '-->')
        .replace(/[\u00A0\t]+/g, ' ')
        .replace(/--\|>/g, '-->')
        .replace(/--｜>/g, '-->')
        .replace(/--\|＞/g, '-->')
        .replace(/--｜＞/g, '-->')
        .replace(/==\|>/g, '==>')
        .replace(/==｜>/g, '==>')
        .replace(/-\.\|>/g, '-.->')
        .replace(/-\.｜>/g, '-.->');

    text = text.replace(
        /([)\]"'}])\s*(?:\[(?:\d+(?:\s*,\s*\d+)*)\]\s*)+(?=\s*[A-Za-z][A-Za-z0-9_:-]*\s*(?:-->|==>|-\.->|--x|o--|x--|--o|<-->|<-.->|->|<-))/g,
        '$1\n'
    );
    text = text.replace(
        /([)\]"'}])\s*(?:\[(?:\d+(?:\s*,\s*\d+)*)\]\s*)+(?=\s*$)/gm,
        '$1'
    );

    text = text.replace(
        /([\]\)\}])\s*([A-Za-z][A-Za-z0-9_:-]*\s*(?:-->|==>|-\.->|--x|o--|x--|--o|<-->|<-.->|->|<-))/g,
        '$1\n$2'
    );

    const forceNewlineKeywords = (input, keywords) => {
        if (!input) return input;
        const re = new RegExp(`([^\\n])\\s+(${keywords.join('|')})(?=\\s|$)`, 'gi');
        return input.replace(re, '$1\n$2');
    };
    text = forceNewlineKeywords(text, ['alt', 'else', 'end', 'opt', 'par', 'critical', 'break', 'loop', 'rect']);
    text = forceNewlineKeywords(text, ['activate', 'deactivate', 'participant', 'actor', 'autonumber', 'create', 'destroy', 'note', 'box']);
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/(--\|[^|\n]*\|)\s*(-->|==>|-\.->)\s*\|[^|\n]*\|/g, '$1 $2 ');

    let lines = text.split(/\n/).map(l => l.replace(/[ \t]+$/g, ''));
    lines = lines.filter(l => !/^\s*(copy|复制)\s*$/i.test(l));

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
    lines = lines.filter(line => !/^\s*```/u.test(line));

    const splitCompositeEdges = (linesArr) => {
        const output = [];
        const arrowRe = /(-->|==>|-\.->)/g;
        const multiSepRe = /\s&\s/;
        linesArr.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('%%')) {
                output.push(line);
                return;
            }
            if (/^\s*(subgraph|end|classDef|class|style|linkStyle)\b/i.test(trimmed)) {
                output.push(line);
                return;
            }
            if (trimmed.includes('|')) {
                output.push(line);
                return;
            }

            const arrowMatches = trimmed.match(arrowRe);
            if (!arrowMatches) {
                output.push(line);
                return;
            }

            if (arrowMatches.length === 1 && multiSepRe.test(trimmed)) {
                const arrow = arrowMatches[0];
                const parts = line.split(arrow);
                if (parts.length === 2) {
                    const left = parts[0].trim();
                    const right = parts[1].trim();
                    const leftParts = left.split('&').map(part => part.trim()).filter(Boolean);
                    const rightParts = right.split('&').map(part => part.trim()).filter(Boolean);
                    if (leftParts.length > 1 || rightParts.length > 1) {
                        if (leftParts.length > 1 && rightParts.length > 1) {
                            leftParts.forEach((l) => {
                                rightParts.forEach((r) => output.push(`${l} ${arrow} ${r}`));
                            });
                        } else if (leftParts.length > 1) {
                            leftParts.forEach((l) => output.push(`${l} ${arrow} ${right}`));
                        } else if (rightParts.length > 1) {
                            rightParts.forEach((r) => output.push(`${left} ${arrow} ${r}`));
                        } else {
                            output.push(line);
                        }
                        return;
                    }
                }
            }

            if (arrowMatches.length >= 2) {
                const parts = line.split(arrowRe).map(part => part.trim()).filter(Boolean);
                if (parts.length >= 5) {
                    let prev = parts[0];
                    for (let i = 1; i < parts.length; i += 2) {
                        const segArrow = parts[i];
                        const next = parts[i + 1];
                        if (!next) break;
                        output.push(`${prev} ${segArrow} ${next}`);
                        prev = next;
                    }
                    return;
                }
            }

            output.push(line);
        });
        return output;
    };

    lines = splitCompositeEdges(lines);

    const fixBrokenTargetNodeLine = (() => {
        let autoNodeCounter = 0;
        const nodeIdByLabel = new Map();
        const edgeRe = /(.*?\s(?:-->|==>|-\.->|--x|o--|x--|--o|<-->|<-.->|->|<-)\s*)(.+)$/;

        const ensureNodeId = (labelText) => {
            const key = (labelText || '').trim();
            if (!key) return null;
            if (nodeIdByLabel.has(key)) {
                return nodeIdByLabel.get(key);
            }
            autoNodeCounter += 1;
            const id = `auto_node_${autoNodeCounter}`;
            nodeIdByLabel.set(key, id);
            return id;
        };

        return (line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('%%')) return line;
            if (/^\s*(subgraph|end|classDef|class|style|linkStyle)\b/i.test(trimmed)) return line;

            const match = line.match(edgeRe);
            if (!match) return line;

            const prefix = match[1];
            const rhs = (match[2] || '').trim();

            if (!rhs) return line;
            if (rhs.includes('|')) return line;
            if (/^[A-Za-z][A-Za-z0-9_:-]*(?:\s*(?:\[|\(|\{).*)?$/.test(rhs)) return line;

            const brokenLabelLike =
                /"\]\s*$/.test(rhs) ||
                /\)\s*"\]\s*$/.test(rhs) ||
                /\]\s*$/.test(rhs);

            if (!brokenLabelLike) return line;

            let label = rhs
                .replace(/^\s*"+/, '')
                .replace(/"\]\s*$/, '')
                .replace(/\]\s*$/, '')
                .trim();

            if (!label) return line;

            const nodeId = ensureNodeId(label);
            if (!nodeId) return line;

            const safeLabel = label
                .replace(/"/g, "'")
                .replace(/>/g, '&gt;')
                .replace(/</g, '&lt;');

            return `${prefix}${nodeId}["${safeLabel}"]`;
        };
    })();

    lines = lines.map(fixBrokenTargetNodeLine);

    const mergeDanglingLabelLines = (linesArr) => {
        const merged = [];
        linesArr.forEach((line) => {
            const trimmed = line.trim();
            const quotedContinuation = trimmed.match(/^[\(（]([^\)）]+)[\)）]\s*"?\]?$/);
            const continuation = trimmed.match(/^[\(（]([^\)\]"]+)[\)）]\s*"?\]?\s*$/);
            const asciiContinuation = trimmed.match(/^(?:\(|\uFF08)([^)\uFF09\]"]+)(?:\)|\uFF09)\s*"?\]?\s*$/);
            const fallbackContinuation = (() => {
                if (!trimmed) return null;
                const startsWithParen = trimmed.startsWith('(') || trimmed.startsWith('\uFF08');
                const endsWithBracket = trimmed.endsWith(']') || trimmed.endsWith('"]') || trimmed.endsWith(')');
                if (!startsWithParen || !endsWithBracket) return null;
                const cleaned = trimmed
                    .replace(/^\(|^\uFF08/, '')
                    .replace(/"?\]?\s*$/, '')
                    .replace(/\)$|\uFF09$/, '');
                if (!cleaned) return null;
                return [trimmed, cleaned];
            })();
            const effectiveContinuation = quotedContinuation || asciiContinuation || continuation || fallbackContinuation;
            if (effectiveContinuation) {
                const suffix = effectiveContinuation[1].trim();
                while (merged.length && !merged[merged.length - 1].trim()) {
                    merged.pop();
                }
                if (merged.length > 0) {
                    const prev = merged[merged.length - 1];
                    const endLabelMatch = prev.match(/\["([^"\n]*)"\]\s*$/);
                    if (endLabelMatch) {
                        const escapedSuffix = suffix.replace(/>/g, '&gt;').replace(/</g, '&lt;');
                        merged[merged.length - 1] = prev.replace(/\["([^"\n]*)"\]\s*$/, `["${endLabelMatch[1]} (${escapedSuffix})"]`);
                        return;
                    }
                    const lastStart = prev.lastIndexOf('["');
                    const lastEnd = prev.lastIndexOf('"]');
                    if (lastStart !== -1 && lastEnd > lastStart) {
                        const before = prev.slice(0, lastStart);
                        const label = prev.slice(lastStart + 2, lastEnd);
                        const after = prev.slice(lastEnd + 2);
                        const escapedSuffix = suffix.replace(/>/g, '&gt;').replace(/</g, '&lt;');
                        merged[merged.length - 1] = `${before}["${label} (${escapedSuffix})"]${after}`;
                        return;
                    }
                }
            }
            merged.push(line);
        });
        return merged;
    };

    lines = mergeDanglingLabelLines(lines);

    const mergeInlineLabelSuffix = (line) => {
        return line.replace(/\["([^"\n]*)"\]\s*(?:\(|\uFF08)([^)\uFF09\]]+)(?:\)|\uFF09)\s*"?\]?/g, (match, label, suffix) => {
            const escapedSuffix = suffix
                .replace(/>/g, '&gt;')
                .replace(/</g, '&lt;');
            const mergedLabel = `${label} (${escapedSuffix})`.trim();
            return `["${mergedLabel}"]`;
        });
    };

    lines = lines.map(mergeInlineLabelSuffix);

    const normalizeClassDiagramLines = (line) => {
        if (/^\s*<>\s*$/.test(line)) {
            return '        <<interface>>';
        }
        return line;
    };

    const repairQuoteBracketArtifacts = (line) => {
        let updated = line;
        updated = updated.replace(/\["\]([^"\n]+)"\]/g, '["$1"]');
        updated = updated.replace(/\["([^"\n\]]+)\["\]/g, '["$1"]');
        updated = updated.replace(/\{"]([^"\n]+)"\}/g, '{"$1"}');
        updated = updated.replace(/\|([^\|\n\[]+)\[\|/g, '|$1|');
        return updated;
    };

    const normalizeMermaidLine = (line) => {
        let updated = line;
        updated = updated.replace(/^\s*subgraph\s+([A-Za-z0-9_:-]+)\s*\[([^\]]+)\]\s*$/i, 'subgraph "$2"');
        updated = updated.replace(/^(\s*[A-Za-z0-9_:-]+)\s+\[([^\]]+)\]\s*$/u, '$1["$2"]');
        updated = updated.replace(/--\|"\s*([^"\n]*?)\s*\|-->/g, '--|$1|-->');
        updated = updated.replace(/([\p{L}\p{N}_:-]+)"([^"\n]+)"/gu, '$1["$2"]');
        updated = updated.replace(
            /([\]\)\}])\s*([A-Za-z][A-Za-z0-9_:-]*\s*(?:-->|==>|-\.->|--x|o--|x--|--o|<-->|<-.->|->|<-))/g,
            '$1\n$2'
        );
        return updated;
    };

    const sanitizeSubgraphTitle = (line) => {
        const match = line.match(/^(\s*subgraph\s+)"(.*)"\s*$/i);
        if (!match) return line;
        let title = match[2];
        title = title
            .replace(/"/g, "'")
            .replace(/\[/g, '(')
            .replace(/\]/g, ')');
        return `${match[1]}"${title}"`;
    };

    const normalizeSubgraphBrackets = (line) => {
        if (!/^\s*subgraph\b/i.test(line)) return line;
        const openIndex = line.indexOf('[');
        const closeIndex = line.lastIndexOf(']');
        if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) {
            return line;
        }
        const rawTitle = line.slice(openIndex + 1, closeIndex).trim();
        const normalized = `subgraph "${rawTitle}"`;
        return sanitizeSubgraphTitle(normalized);
    };

    const normalizePlainSubgraphTitle = (line) => {
        const match = line.match(/^(\s*subgraph\s+)(.+)$/i);
        if (!match) return line;
        const prefix = match[1];
        const tail = (match[2] || '').trim();
        if (!tail) return line;
        if (tail.startsWith('"') || tail.startsWith('[')) return line;
        if (/^[A-Za-z0-9_:-]+$/.test(tail)) return line;
        if (!/[()\uFF08\uFF09]/.test(tail)) return line;

        const safeTail = tail
            .replace(/"/g, "'")
            .replace(/\[/g, '(')
            .replace(/\]/g, ')');
        return `${prefix}"${safeTail}"`;
    };

    const sanitizeQuotedNodeLabels = (line) => {
        const sanitizeLabel = (label) => {
            let updated = label;
            updated = updated.replace(/"/g, "'");
            updated = updated.replace(/\/'([^'\n]+)'\//g, '$1');
            updated = updated.replace(/\$/g, '＄');
            updated = updated.replace(/'/g, '`');
            updated = updated.replace(/\|/g, '｜');
            updated = updated.replace(/-->/g, '→');
            updated = updated.replace(/==>/g, '⇒');
            updated = updated.replace(/-\.->/g, '⇢');
            updated = updated.replace(/--\|/g, '--｜');
            updated = updated.replace(/\|--/g, '｜--');
            return updated;
        };

        const sanitizeBetween = (startToken, endToken) => {
            let result = '';
            let cursor = 0;
            while (cursor < line.length) {
                const start = line.indexOf(startToken, cursor);
                if (start === -1) {
                    result += line.slice(cursor);
                    break;
                }
                result += line.slice(cursor, start + startToken.length);
                let idx = start + startToken.length;
                let label = '';
                while (idx < line.length) {
                    if (line.startsWith(endToken, idx)) {
                        idx += endToken.length;
                        break;
                    }
                    label += line[idx];
                    idx += 1;
                }
                result += sanitizeLabel(label) + endToken;
                cursor = idx;
            }
            line = result;
        };

        sanitizeBetween('["', '"]');
        sanitizeBetween('{"', '"}');
        return line;
    };

    const sanitizeEdgeLabels = (line) => {
        let result = '';
        let cursor = 0;
        while (cursor < line.length) {
            const start = line.indexOf('|', cursor);
            if (start === -1) {
                result += line.slice(cursor);
                break;
            }
            const end = line.indexOf('|', start + 1);
            if (end === -1) {
                result += line.slice(cursor);
                break;
            }
            result += line.slice(cursor, start + 1);
            const label = line
                .slice(start + 1, end)
                .replace(/\$/g, '＄')
                .replace(/\(/g, '（')
                .replace(/\)/g, '）');
            result += label + '|';
            cursor = end + 1;
        }
        return result;
    };

    const protectMathRegions = (line) => {
        const mathPlaceholders = [];
        let safeText = line.replace(/\$\$([^$]+)\$\$/g, (match) => {
            mathPlaceholders.push(match);
            return `⟦MATHBLOCK${mathPlaceholders.length - 1}⟧`;
        });
        safeText = safeText.replace(/\$([^$]+)\$/g, (match) => {
            mathPlaceholders.push(match);
            return `⟦MATHINLINE${mathPlaceholders.length - 1}⟧`;
        });
        return { safeText, mathPlaceholders };
    };

    const restoreMathRegions = (line, mathPlaceholders) => {
        let restored = line;
        mathPlaceholders.forEach((original, idx) => {
            restored = restored.replace(`⟦MATHBLOCK${idx}⟧`, original);

            if (original.startsWith('$') && !original.startsWith('$$')) {
                const converted = '$' + original;
                const finalConverted = converted.slice(0, -1) + '$$';
                restored = restored.replace(`⟦MATHINLINE${idx}⟧`, finalConverted);
            } else {
                restored = restored.replace(`⟦MATHINLINE${idx}⟧`, original);
            }
        });
        return restored;
    };

    const allMathPlaceholders = [];
    lines = lines.map(line => {
        const { safeText, mathPlaceholders } = protectMathRegions(line);
        allMathPlaceholders.push(mathPlaceholders);
        return safeText;
    });

    lines = lines
        .map(normalizeSubgraphBrackets)
        .map(normalizePlainSubgraphTitle)
        .map(normalizeMermaidLine)
        .map(repairQuoteBracketArtifacts)
        .map(normalizeClassDiagramLines);
    lines = lines.map(line => line
        .replace(/^\s*subgraph\s+""([^"]+)""\s*$/i, 'subgraph "$1"')
        .replace(/^\s*subgraph\s+\[([^\]]+)\]\s*$/i, 'subgraph "$1"')
        .replace(/^\s*subgraph\s+\w+\s+"([^"]+)"\s*$/i, 'subgraph "$1"')
        .replace(/(\b[A-Za-z0-9_:-]+)\s*\(\s*(\[[^\]\n]+\])\s*\)/g, '$1$2')
        .replace(/^(\s*)([A-Za-z0-9_:-]+)\[(?!")([^\]\n]+)\]/gm, '$1$2["$3"]')
        .replace(/(\b[A-Za-z0-9_:-]+)\(\(\s*"?\s*\(?\s*"?([^"()\n]+?)"?\s*\)?\s*"?\s*\)\)/g, '$1(("$2"))')
        .replace(/(\b[A-Za-z0-9_:-]+)\(\(\((?!")([^\)\n]+)\)\)\)/g, '$1((("$2")))')
        .replace(/(\b[A-Za-z0-9_:-]+)\{\{\s*"{0,2}([^"\n]+?)"{0,2}\s*\}\}/g, '$1{"$2"}')
        .replace(/(\b[A-Za-z0-9_:-]+)\{(?!")([^\}\n]+)\}/g, '$1{"$2"}')
        .replace(/--\s*([^|][^-<>]+?)\s*-->/g, '--|$1|-->')
        .replace(/--\s*([^|][^-<>]+?)\s*==>/g, '--|$1|==>')
        .replace(/--\s*"\s*([^"]+?)\s*"\s*-->/g, '--|$1|-->')
        .replace(/--\s*"\s*([^"]+?)\s*"\s*==>/g, '--|$1|==>')
        .replace(/-\.\s*"([^"\n]+?)"\s*\.-\s*->/g, '-. "$1" .->')
        .replace(/-\.\s*([^"\n]+?)\s*\.-\s*->/g, '-. $1 .->')
        .replace(/\.\-\s*->/g, '.->')
        .replace(/\|\s*"([^"\n]+?)"\s*\|/g, '|$1|')
        .replace(/\["\(\s*"?([^"\n]+?)"?\s*\)"\]/g, '[($1)]')
        .replace(/^\s*([A-Za-z0-9_:-]+\s*\[[^\]]+\])\s*:\s*$/g, '$1')
        .replace(/[《》〈〉「」『』【】〔〕〖〗〘〙〚〛①②③④⑤⑥⑦⑧⑨⑩]/g, '')
        .replace(/\)\s+:::/g, '):::')
        .replace(/\]\s+:::/g, ']:::')
        .replace(/\}\s+:::/g, '}:::')
        .replace(/:::\s+/g, ':::')
        .replace(/^(\s*subgraph\s+)"'([^'"]+)'"(\s*)$/gim, '$1"$2"$3')
        .replace(/\['([^'"\]]+)"\]/g, '[$1]')
        .replace(/\["([^'"\]]+)'\]/g, '[$1]')
    ).map(sanitizeSubgraphTitle).map(sanitizeQuotedNodeLabels).map(sanitizeEdgeLabels);

    lines = lines.map((line, idx) => restoreMathRegions(line, allMathPlaceholders[idx]));

    lines = lines.map(line => {
        return line
            .replace(/--\|>/g, '-->')
            .replace(/--｜>/g, '-->')
            .replace(/==\|>/g, '==>')
            .replace(/==｜>/g, '==>')
            .replace(/-\.\|>/g, '-.->')
            .replace(/-\.｜>/g, '-.->');
    });

    lines = lines.map(line => {
        if (/^\s*classDef\b/i.test(line) && !/;\s*$/.test(line)) {
            return `${line.trimEnd()};`;
        }
        if (/^\s*linkStyle\b/i.test(line) && !/;\s*$/.test(line)) {
            return `${line.trimEnd()};`;
        }
        return line;
    });

    const countEdges = (linesArr) => {
        const edgePattern = /(?:-->|==>|-.->|--x|o--|<-->|<-.->|--o|x--|->|<-)/g;
        let count = 0;
        for (const ln of linesArr) {
            const trimmed = ln.trim();
            if (trimmed.startsWith('%%') || /^\s*(classDef|linkStyle|style|class|subgraph|end)\b/i.test(trimmed)) {
                continue;
            }
            const matches = ln.match(edgePattern);
            if (matches) {
                count += matches.length;
            }
        }
        return count;
    };

    const fixSequenceActivationStates = (linesArr) => {
        const activeCountByParticipant = new Map();
        const normalizeName = (name) => (name || '').trim().replace(/^["'`]|["'`]$/g, '');
        const getCount = (name) => activeCountByParticipant.get(name) || 0;
        const setCount = (name, count) => {
            if (!name) return;
            if (count > 0) activeCountByParticipant.set(name, count);
            else activeCountByParticipant.delete(name);
        };

        return linesArr.map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('%%')) return line;

            const activateMatch = trimmed.match(/^activate\s+([A-Za-z0-9_.:\-"`]+)\s*$/i);
            if (activateMatch) {
                const participant = normalizeName(activateMatch[1]);
                setCount(participant, getCount(participant) + 1);
                return line;
            }

            const deactivateMatch = trimmed.match(/^deactivate\s+([A-Za-z0-9_.:\-"`]+)\s*$/i);
            if (deactivateMatch) {
                const participant = normalizeName(deactivateMatch[1]);
                const current = getCount(participant);
                if (current <= 0) return '';
                setCount(participant, current - 1);
                return line;
            }

            const arrowMatch = line.match(/^(\s*[A-Za-z0-9_.:\-"`]+)\s*([-.=xo<]*>>?)\s*([+-])\s*([A-Za-z0-9_.:\-"`]+)([\s\S]*)$/);
            if (!arrowMatch) return line;

            const operator = arrowMatch[2];
            const sign = arrowMatch[3];
            const toRaw = normalizeName(arrowMatch[4]);
            const tail = arrowMatch[5] || '';

            if (sign === '+') {
                setCount(toRaw, getCount(toRaw) + 1);
                return line;
            }
            if (sign === '-') {
                const current = getCount(toRaw);
                if (current <= 0) {
                    return `${arrowMatch[1]}${operator}${toRaw}${tail}`;
                }
                setCount(toRaw, current - 1);
                return line;
            }
            return line;
        }).filter(line => line !== '');
    };

    const edgeCount = countEdges(lines);
    lines = lines.map(line => {
        const linkStyleMatch = line.match(/^(\s*linkStyle\s+)([^\s;]+)(.*)/i);
        if (!linkStyleMatch) return line;

        const prefix = linkStyleMatch[1];
        const indicesPart = linkStyleMatch[2];
        const suffix = linkStyleMatch[3];

        if (indicesPart.toLowerCase() === 'default') {
            return line;
        }

        const indices = indicesPart.split(',').map(s => s.trim());
        const validIndices = indices.filter(idx => {
            if (idx.toLowerCase() === 'default') return true;
            const num = parseInt(idx, 10);
            return !isNaN(num) && num >= 0 && num < edgeCount;
        });

        if (validIndices.length === 0) {
            return '';
        }

        return `${prefix}${validIndices.join(',')}${suffix}`;
    }).filter(line => line !== '');

    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    const directiveTypes = [
        'flowchart',
        'graph',
        'sequenceDiagram',
        'classDiagram',
        'stateDiagram',
        'stateDiagram-v2',
        'erDiagram',
        'gantt',
        'journey',
        'pie',
        'mindmap'
    ];
    const getDirective = (line) => {
        const trimmed = line.trim();
        const match = directiveTypes.find(type => new RegExp(`^${type}\\b`, 'i').test(trimmed));
        return match || null;
    };
    const directiveIndex = lines.findIndex(line => getDirective(line));
    let primaryDirective = directiveIndex >= 0 ? getDirective(lines[directiveIndex]) : null;
    if (primaryDirective) {
        const preservedPreamble = lines.slice(0, directiveIndex).filter(line =>
            /^\s*%%\{/.test(line) || /^\s*%%/.test(line) || !line.trim()
        );
        lines = lines.filter((line, idx) => {
            const type = getDirective(line);
            if (!type) return true;
            return idx === directiveIndex;
        });
        if (directiveIndex > 0) {
            lines = [...preservedPreamble, ...lines.slice(directiveIndex)];
        }
    } else {
        lines.unshift('flowchart TD');
        primaryDirective = 'flowchart';
    }

    if (primaryDirective && /^sequenceDiagram$/i.test(primaryDirective)) {
        lines = fixSequenceActivationStates(lines);
    }

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

function simplifyMermaidDefinition(definition) {
    if (!definition) return definition;
    let simplified = definition;
    simplified = simplified
        .replace(/(\b[A-Za-z0-9_:-]+)\s*\[\(\s*([^\]\n]+?)\s*\)\]/g, '$1["$2"]')
        .replace(/(\b[A-Za-z0-9_:-]+)\s*\(\(\(([^)\n]+)\)\)\)/g, '$1["$2"]')
        .replace(/(\b[A-Za-z0-9_:-]+)\s*\(\(([^)\n]+)\)\)/g, '$1["$2"]')
        .replace(/(\b[A-Za-z0-9_:-]+)\s*\{\{([^}\n]+)\}\}/g, '$1["$2"]')
        .replace(/(\b[A-Za-z0-9_:-]+)\s*\{([^}\n]+)\}/g, '$1["$2"]');

    simplified = simplified.replace(/\["([^"\n]+)"\]/g, (match, label) => {
        const withoutIcons = label.replace(/\bfa:[A-Za-z0-9-]+\b/g, '');
        const cleaned = withoutIcons.replace(/[^\w\u4E00-\u9FFF\s.,;:!?()\-\/]/g, '');
        const finalLabel = cleaned.trim() || 'node';
        return `["${finalLabel}"]`;
    });

    return simplified;
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
            htmlLabels: false,
            flowchart: {
                htmlLabels: false,
                useMaxWidth: false,
                padding: 10
            },
            sequence: { useMaxWidth: true }
        });
    } catch (error) {
        console.warn('Mermaid initialization failed:', error);
    }
    mermaidConfigured = true;
}

function renderMathInMermaid(container) {
    if (!container || typeof window === 'undefined') return;
    try {
        if (window.mathRenderer && typeof window.mathRenderer.renderElement === 'function') {
            window.mathRenderer.renderElement(container, true);
            return;
        }
        if (typeof window.renderMathInElement === 'function') {
            window.renderMathInElement(container);
        }
    } catch (_) { }
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

    showToastSafe('toast.downloadSuccess', 'Image downloaded successfully', 'success');
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

function getSvgSize(svgElement) {
    if (!svgElement) {
        return { width: 800, height: 600 };
    }

    const rect = typeof svgElement.getBoundingClientRect === 'function'
        ? svgElement.getBoundingClientRect()
        : null;
    if (rect && rect.width && rect.height) {
        return { width: rect.width, height: rect.height };
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

    return { width: 800, height: 600 };
}

function inlineComputedStyles(sourceSvg, targetSvg) {
    if (!sourceSvg || !targetSvg) return;
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return;

    const RELEVANT_STYLES = [
        'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
        'color', 'text-align', 'text-decoration',
        'fill', 'stroke', 'stroke-width',
        'background-color', 'opacity',
        'display', 'visibility',
        'align-items', 'justify-content', 'flex-direction', 'flex-wrap',
        'margin', 'padding', 'border-width', 'border-style', 'border-color',
        'box-sizing'
    ];

    const sourceNodes = [sourceSvg, ...sourceSvg.querySelectorAll('*')];
    const targetNodes = [targetSvg, ...targetSvg.querySelectorAll('*')];
    const count = Math.min(sourceNodes.length, targetNodes.length);

    for (let i = 0; i < count; i++) {
        const sourceNode = sourceNodes[i];
        const targetNode = targetNodes[i];
        if (sourceNode.closest('defs')) continue;

        let computed;
        try {
            computed = window.getComputedStyle(sourceNode);
        } catch (_) {
            continue;
        }
        if (!computed) continue;

        let styleText = '';
        RELEVANT_STYLES.forEach((prop) => {
            const value = computed.getPropertyValue(prop);
            if (value && value !== 'auto' && value !== 'normal' && value !== '0px' && value !== 'rgba(0, 0, 0, 0)') {
                styleText += `${prop}:${value};`;
            }
        });

        if (targetNode.tagName && targetNode.tagName.toLowerCase() === 'div' && !targetNode.getAttribute('xmlns')) {
            targetNode.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        }

        if (styleText) {
            const existing = targetNode.getAttribute('style') || '';
            targetNode.setAttribute('style', `${existing};${styleText}`);
        }
    }
}

function serializeSvgForExport(svgElement, {
    inlineStyles = true,
    stripExternal = true,
    stripUrls = true
} = {}) {
    const cloned = svgElement.cloneNode(true);
    const rect = svgElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        cloned.setAttribute('width', rect.width);
        cloned.setAttribute('height', rect.height);
        if (!cloned.hasAttribute('viewBox')) {
            cloned.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
        }
    }

    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    if (inlineStyles) {
        inlineComputedStyles(svgElement, cloned);
    }
    if (stripUrls) stripUnsafeUrlsInStyles(cloned);
    if (stripExternal) stripExternalImages(cloned);

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(cloned);
    source = source.replace(/<foreignObject([^>]*)>/g, '<foreignObject$1 xmlns="http://www.w3.org/2000/svg">');
    return source;
}

async function downloadRasterFromSvg(svgElement, filenameBase, {
    mimeType = 'image/png',
    extension = 'png',
    scale = 4,
    backgroundColor = '#ffffff'
} = {}) {
    if (!svgElement) {
        throw new Error('SVG element is missing');
    }

    const { width, height } = getSvgSize(svgElement);
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio)
        ? Math.max(1, window.devicePixelRatio)
        : 1;
    const effectiveScale = Math.min(6, scale * dpr);
    try {
        const source = serializeSvgForExport(svgElement, {
            inlineStyles: true,
            stripExternal: true,
            stripUrls: true
        });

        const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
            '<?xml version="1.0" standalone="no"?>\r\n' + source
        )}`;

        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Image load failed'));
            img.src = svgUrl;
        });

        const canvas = document.createElement('canvas');
        const canvasWidth = Math.floor(width * effectiveScale);
        const canvasHeight = Math.floor(height * effectiveScale);
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context is unavailable');
        ctx.imageSmoothingEnabled = true;
        if (typeof ctx.imageSmoothingQuality === 'string') {
            ctx.imageSmoothingQuality = 'high';
        }
        if (backgroundColor) {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        }
        ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((b) => {
                if (b) resolve(b);
                else reject(new Error('Blob creation failed'));
            }, mimeType);
        });

        triggerDownloadFromBlob(blob, `${filenameBase}.${extension}`);
    } catch (error) {
        console.error('Mermaid Rasterization Failed:', error);
        showToastSafe('toast.exportFailed', 'Image generation failed, SVG file downloaded instead', 'error');
        downloadSvgFile(svgElement, filenameBase);
    }
}

function createMermaidToolbar(svgElement, filenameBase) {
    const toolbar = document.createElement('div');
    toolbar.className = 'mermaid-render-toolbar';
    const downloadImageLabel = getLocalizedLabel('ui.downloadImage', 'Download Image');
    const imageButton = createToolbarButton(downloadImageLabel, () => downloadRasterFromSvg(svgElement, filenameBase, {
        mimeType: 'image/png',
        extension: 'png',
        scale: 3
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
                wrapper.innerHTML = sanitizeMermaidSvg(renderResult.svg);
                renderMathInMermaid(wrapper);

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
                details.appendChild(summary);
                details.appendChild(preClone);
                preClone.querySelectorAll('.copy-btn-wrapper').forEach(wrapper => wrapper.remove());
                try {
                    const codeInClone = preClone.querySelector('code');
                    if (codeInClone) {
                        if (typeof window.addCopyButtonToCodeBlock === 'function') {
                            window.addCopyButtonToCodeBlock(preClone, codeInClone);
                        } else {
                            const btn = document.createElement('button');
                            btn.textContent = 'Copy';
                            btn.style.position = 'absolute';
                            btn.style.top = '8px';
                            btn.style.right = '8px';
                            btn.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                navigator.clipboard.writeText(codeInClone.textContent || '').catch(() => { });
                            });
                            preClone.style.position = 'relative';
                            preClone.appendChild(btn);
                        }
                    }
                } catch (_) { }

                const container = document.createElement('div');
                container.className = 'mermaid-render-container';
                const svgElement = wrapper.querySelector('svg');
                if (svgElement) {
                    const toolbar = createMermaidToolbar(svgElement, uniqueId);
                    container.appendChild(toolbar);
                }
                container.appendChild(wrapper);
                container.appendChild(details);

                const copyWrapper = parentPre.closest('.code-block-wrapper');
                if (copyWrapper && copyWrapper.parentNode) {
                    copyWrapper.parentNode.replaceChild(container, copyWrapper);
                } else {
                    parentPre.replaceWith(container);
                }
                codeElement.dataset.mermaidProcessed = 'true';
                if (codeElement.dataset.mermaidPending === 'true') {
                    delete codeElement.dataset.mermaidPending;
                }
            } catch (error) {
                let retrySucceeded = false;
                try {
                    const simplified = simplifyMermaidDefinition(graphDefinition);
                    if (simplified && simplified !== graphDefinition) {
                        if (typeof mermaid.parse === 'function') {
                            mermaid.parse(simplified);
                        }
                        const retryId = `mermaid-diagram-${Date.now()}-${diagramIdCounter++}`;
                        const retryResult = await mermaid.render(retryId, simplified);
                        const retryWrapper = document.createElement('div');
                        retryWrapper.className = 'mermaid-diagram-wrapper';
                        retryWrapper.innerHTML = sanitizeMermaidSvg(retryResult.svg);
                        renderMathInMermaid(retryWrapper);

                        if (retryResult.bindFunctions) {
                            try {
                                retryResult.bindFunctions(retryWrapper);
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
                        details.appendChild(summary);
                        details.appendChild(preClone);
                        preClone.querySelectorAll('.copy-btn-wrapper').forEach(wrapper => wrapper.remove());

                        const container = document.createElement('div');
                        container.className = 'mermaid-render-container';
                        const svgElement = retryWrapper.querySelector('svg');
                        if (svgElement) {
                            const toolbar = createMermaidToolbar(svgElement, retryId);
                            container.appendChild(toolbar);
                        }
                        container.appendChild(retryWrapper);
                        container.appendChild(details);

                        const copyWrapper = parentPre.closest('.code-block-wrapper');
                        if (copyWrapper && copyWrapper.parentNode) {
                            copyWrapper.parentNode.replaceChild(container, copyWrapper);
                        } else {
                            parentPre.replaceWith(container);
                        }

                        codeElement.dataset.mermaidProcessed = 'true';
                        if (codeElement.dataset.mermaidPending === 'true') {
                            delete codeElement.dataset.mermaidPending;
                        }
                        retrySucceeded = true;
                    }
                } catch (_) { }

                if (!retrySucceeded) {
                    codeElement.dataset.mermaidProcessed = 'error';
                    if (codeElement.dataset.mermaidPending === 'true') {
                        delete codeElement.dataset.mermaidPending;
                    }

                    const errorBanner = document.createElement('div');
                    errorBanner.className = 'mermaid-error-banner';
                    errorBanner.textContent = `Mermaid diagram rendering failed: ${error.message || error}`;

                    const wrapper = parentPre.parentNode?.classList?.contains('code-block-wrapper')
                        ? parentPre.parentNode
                        : null;
                    const insertTarget = wrapper || parentPre;

                    if (insertTarget.parentNode && typeof insertTarget.parentNode.insertBefore === 'function') {
                        insertTarget.parentNode.insertBefore(errorBanner, insertTarget);
                    }
                }
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

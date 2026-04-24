export function formatRelayModelLabel(modelId) {
    if (!modelId) return '';
    const raw = String(modelId).replace(/^models\//i, '');
    const lower = raw.toLowerCase();
    const parts = lower.split(/[-_]+/).filter(Boolean);
    if (!parts.length) return raw;

    const prefix = parts.shift();
    const brand = (() => {
        if (prefix === 'deepseek') return 'DeepSeek';
        if (prefix === 'gemini') return 'Gemini';
        if (prefix === 'gpt') return 'GPT';
        if (prefix === 'claude') return 'Claude';
        if (prefix === 'grok') return 'Grok';
        return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    })();

    const tokens = [];
    for (let i = 0; i < parts.length; i += 1) {
        const token = parts[i];
        const next = parts[i + 1];
        if (/^\d+$/.test(token) && /^\d+$/.test(next || '')) {
            tokens.push(`${token}.${next}`);
            i += 1;
            continue;
        }
        if (/^v\d+(\.\d+)?$/.test(token)) {
            tokens.push(`V${token.slice(1)}`);
            continue;
        }
        if (/^\d+(\.\d+)?$/.test(token)) {
            tokens.push(token);
            continue;
        }
        const cap = token.charAt(0).toUpperCase() + token.slice(1);
        tokens.push(cap);
    }

    if (!tokens.length) return brand;
    const connector = prefix === 'deepseek' || prefix === 'gpt' ? '-' : ' ';
    return `${brand}${connector}${tokens.join(' ')}`;
}

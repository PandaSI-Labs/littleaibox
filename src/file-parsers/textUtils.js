export const TextCleaner = {
    // Fix line-break hyphenation.
    fixHyphenation(text) {
        return text.replace(/([a-z])-\s*\n\s*([a-z])/g, '$1$2');
    },

    // Merge soft line breaks into paragraphs.
    mergeLines(text) {
        return text
            .replace(/([\u3002\uFF01\uFF1F.?:;])\s*\n/g, '$1{{BR}}')
            .replace(/\n/g, ' ')
            .replace(/{{BR}}/g, '\n\n')
            .replace(/\s{2,}/g, ' ');
    },

    // Normalize bullet and numeric lists to Markdown.
    detectLists(text) {
        return text
            .replace(/^[\u2022\u25CF\u25AA-]\s+/gm, '- ')
            .replace(/^(\d+)\.\s+/gm, '$1. ');
    },

    formatCitations(text) {
        return text.replace(/(\[\d+(?:,\s*\d+)*\])/g, '<sup>$1</sup>');
    },

    process(rawText) {
        let out = rawText;
        out = this.fixHyphenation(out);
        out = this.mergeLines(out);
        out = this.detectLists(out);
        out = this.formatCitations(out);
        return out.trim();
    }
};

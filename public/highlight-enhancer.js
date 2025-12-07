window.addEventListener('DOMContentLoaded', () => {
    try {
        if (!window.hljs) return;

        const aliasMap = {
            riscv: 'x86asm',
            asm: 'x86asm',
            sh: 'bash',
            shell: 'bash',
            zsh: 'bash',
            yml: 'yaml',
            js: 'javascript',
            jsx: 'javascript',
            ts: 'typescript',
            tsx: 'typescript',
            html: 'plaintext',
            htm: 'plaintext',
            xml: 'plaintext',
            xhtml: 'plaintext',
            svg: 'plaintext',
            proto: 'protobuf',
            ps1: 'powershell',
            kt: 'kotlin',
            rs: 'rust',
            'c++': 'cpp',
            'c#': 'csharp',
            objc: 'objectivec',
            md: 'markdown',
            text: 'plaintext'
        };

        if (!hljs.getLanguage('plaintext')) {
            try {
                hljs.registerLanguage('plaintext', () => ({ name: 'Plaintext', contains: [] }));
            } catch (_) { }
        }

        const requested = new Map();
        const resolveLang = (name) => {
            const normalized = (name || '').toString().trim().toLowerCase();
            if (!normalized) return '';
            const primary = normalized.split(/[,;:/\s]+/)[0] || normalized;
            return aliasMap[primary] || primary;
        };

        if (hljs.registerAliases) {
            Object.entries(aliasMap).forEach(([alias, languageName]) => {
                try {
                    hljs.registerAliases(alias, { languageName });
                } catch (_) { }
            });
        }

        function loadLanguageIfNeeded(lang) {
            const target = resolveLang(lang);
            if (!target || target === 'plaintext') return Promise.resolve(true);
            try {
                if (hljs.getLanguage(target)) return Promise.resolve(true);
            } catch (_) { }
            if (requested.has(target)) return requested.get(target);

            const promise = new Promise((resolve) => {
                const scriptEl = document.createElement('script');
                scriptEl.src = `/libs/languages/${target}.min.js`;
                scriptEl.async = true;
                scriptEl.onload = () => resolve(true);
                scriptEl.onerror = () => resolve(false);
                document.head.appendChild(scriptEl);
            });
            requested.set(target, promise);
            return promise;
        }

        const originalHighlightElement = hljs.highlightElement.bind(hljs);
        hljs.highlightElement = function (element) {
            try {
                const classes = Array.from(element.classList || []);
                const langClass = classes.find((cls) => cls.startsWith('language-') || cls.startsWith('lang-'));
                let lang = null;
                if (langClass) {
                    lang = langClass.startsWith('language-') ? langClass.slice('language-'.length) : langClass.slice('lang-'.length);
                }
                const resolved = resolveLang(lang);

                if (lang === 'mermaid') {
                    element.classList.remove('language-mermaid');
                    element.classList.add('language-plaintext');
                    try {
                        return originalHighlightElement(element);
                    } catch (_) {
                        return;
                    }
                }
                if (resolved && !hljs.getLanguage(resolved)) {
                    loadLanguageIfNeeded(resolved).then((loaded) => {
                        if (loaded) {
                            try {
                                originalHighlightElement(element);
                            } catch (_) { }
                        } else {
                            element.classList.remove(`language-${lang}`);
                            element.classList.add('language-plaintext');
                            try {
                                originalHighlightElement(element);
                            } catch (_) { }
                        }
                    });
                    return;
                }
            } catch (_) { }
            return originalHighlightElement(element);
        };
    } catch (_) { }
});

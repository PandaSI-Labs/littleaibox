import { t, getCurrentLanguage } from './i18n.js';

const MINDMAP_SCRIPT_SOURCES = {
    d3: '/libs/d3.min.js',
    lib: '/libs/markmap-lib.js',
    view: '/libs/markmap-view.js',
    toolbar: '/libs/markmap-toolbar.js'
};

const MINDMAP_MODE_STATE = {
    enabled: false,
    boardShell: null,
    boardSvg: null,
    boardStatus: null,
    codePanel: null,
    previewPanel: null,
    codeElement: null,
    mindmap: null,
    lastSource: '',
    syncTimer: null,
    contentObserver: null,
    containerObserver: null,
    themeObserver: null,
    previousPlaceholder: '',
    viewMode: 'code'
};

function getLang() {
    try {
        return getCurrentLanguage();
    } catch (_) {
        return window.__PREFERRED_LANG__ || 'en';
    }
}

function tt(key, params = {}) {
    try {
        const text = t(getLang(), key, params);
        return text || key;
    } catch (_) {
        return key;
    }
}

function loadScriptOnce(src, dataAttr = 'mindmap-loader') {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[data-${dataAttr}="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.setAttribute(`data-${dataAttr}`, src);
        script.onload = () => resolve();
        script.onerror = () => {
            script.remove();
            reject(new Error(`Failed to load ${src}`));
        };
        document.head.appendChild(script);
    });
}

async function ensureMindmapLibs() {
    if (window.markmap && window.markmap.Markmap && window.markmap.Transformer) {
        return window.markmap;
    }
    await loadScriptOnce(MINDMAP_SCRIPT_SOURCES.d3);
    await loadScriptOnce(MINDMAP_SCRIPT_SOURCES.lib);
    await loadScriptOnce(MINDMAP_SCRIPT_SOURCES.view);
    try {
        await loadScriptOnce(MINDMAP_SCRIPT_SOURCES.toolbar);
    } catch (_) {
        // toolbar is optional; ignore load failures
    }
    if (!window.markmap || !window.markmap.Markmap || !window.markmap.Transformer) {
        throw new Error('Mindmap libraries did not attach to window.markmap');
    }
    return window.markmap;
}

function getThemePreset() {
    const preset = document.documentElement.getAttribute('data-theme') || 'light';
    const isDark = preset === 'dark';
    return {
        isDark,
        background: isDark ? '#0f172a' : '#f9fafb',
        stroke: isDark ? '#1f2937' : '#e2e8f0',
        text: isDark ? '#e2e8f0' : '#0f172a',
        accent: isDark ? '#7dd3fc' : '#2563eb'
    };
}

function ensureBoard(chatContainer) {
    if (!chatContainer) return null;
    if (MINDMAP_MODE_STATE.boardShell && MINDMAP_MODE_STATE.boardShell.isConnected) {
        return MINDMAP_MODE_STATE.boardShell;
    }

    const shell = document.createElement('section');
    shell.className = 'mindmap-board-shell';
    shell.setAttribute('data-theme', getThemePreset().isDark ? 'dark' : 'light');

    const header = document.createElement('div');
    header.className = 'mindmap-board-header';
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'mindmap-expand-btn';
    expandBtn.setAttribute('aria-pressed', 'false');
    expandBtn.setAttribute('title', tt('ui.mindmapExpand'));
    expandBtn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    `;
    const headerText = document.createElement('div');
    headerText.className = 'mindmap-board-text';
    headerText.innerHTML = `
        <div class="mindmap-board-title">${tt('ui.mindmapTitle')}</div>
        <div class="mindmap-board-subtitle">${tt('ui.mindmapSubtitle')}</div>
    `;
    header.appendChild(headerText);
    header.appendChild(expandBtn);

    const tabs = document.createElement('div');
    tabs.className = 'mindmap-board-tabs';
    const codeTab = document.createElement('button');
    codeTab.type = 'button';
    codeTab.className = 'mindmap-tab active';
    codeTab.dataset.mode = 'code';
    codeTab.setAttribute('aria-pressed', 'true');
    const codeIcon = document.createElement('span');
    codeIcon.className = 'mindmap-tab-icon';
    codeIcon.textContent = '✓';
    codeTab.appendChild(codeIcon);
    codeTab.appendChild(document.createTextNode(tt('ui.mindmapCodeTab')));
    const previewTab = document.createElement('button');
    previewTab.type = 'button';
    previewTab.className = 'mindmap-tab';
    previewTab.dataset.mode = 'preview';
    previewTab.setAttribute('aria-pressed', 'false');
    previewTab.disabled = true;
    previewTab.classList.add('is-disabled');
    const previewIcon = document.createElement('span');
    previewIcon.className = 'mindmap-tab-icon';
    previewIcon.textContent = '✓';
    previewTab.appendChild(previewIcon);
    previewTab.appendChild(document.createTextNode(tt('ui.mindmapPreviewTab')));
    tabs.appendChild(codeTab);
    tabs.appendChild(previewTab);

    const body = document.createElement('div');
    body.className = 'mindmap-board';
    const codePanel = document.createElement('div');
    codePanel.className = 'mindmap-board-panel mindmap-board-panel--code';
    const codePre = document.createElement('pre');
    codePre.className = 'mindmap-code';
    const codeEl = document.createElement('code');
    codePre.appendChild(codeEl);
    codePanel.appendChild(codePre);

    const previewPanel = document.createElement('div');
    previewPanel.className = 'mindmap-board-panel mindmap-board-panel--preview';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('mindmap-canvas');
    previewPanel.appendChild(svg);
    body.appendChild(codePanel);
    body.appendChild(previewPanel);

    const status = document.createElement('div');
    status.className = 'mindmap-board-status';
    status.textContent = tt('ui.mindmapStatusWaiting');

    shell.appendChild(header);
    shell.appendChild(tabs);
    shell.appendChild(body);
    shell.appendChild(status);

    chatContainer.prepend(shell);

    MINDMAP_MODE_STATE.boardShell = shell;
    MINDMAP_MODE_STATE.boardSvg = svg;
    MINDMAP_MODE_STATE.boardStatus = status;
    MINDMAP_MODE_STATE.codePanel = codePanel;
    MINDMAP_MODE_STATE.previewPanel = previewPanel;
    MINDMAP_MODE_STATE.codeElement = codeEl;
    MINDMAP_MODE_STATE.lastSource = '';
    MINDMAP_MODE_STATE.viewMode = 'code';

    const updateExpandUi = (expanded) => {
        shell.classList.toggle('is-expanded', expanded);
        document.body.classList.toggle('mindmap-expanded', expanded);
        expandBtn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
        expandBtn.setAttribute('title', expanded ? tt('ui.mindmapCollapse') : tt('ui.mindmapExpand'));
        expandBtn.innerHTML = expanded
            ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H5v4M15 5h4v4M9 19H5v-4M15 19h4v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>`
            : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
    };

    expandBtn.addEventListener('click', () => {
        const expanded = !shell.classList.contains('is-expanded');
        updateExpandUi(expanded);
        if (MINDMAP_MODE_STATE.mindmap) {
            setTimeout(() => {
                try { MINDMAP_MODE_STATE.mindmap.fit(); } catch (_) { }
            }, 50);
        }
    });

    const setViewMode = (mode) => {
        const next = mode === 'preview' ? 'preview' : 'code';
        if (next === 'preview' && previewTab.disabled) {
            return;
        }
        MINDMAP_MODE_STATE.viewMode = next;
        codeTab.classList.toggle('active', next === 'code');
        previewTab.classList.toggle('active', next === 'preview');
        codeTab.setAttribute('aria-pressed', next === 'code' ? 'true' : 'false');
        previewTab.setAttribute('aria-pressed', next === 'preview' ? 'true' : 'false');
        codePanel.style.display = next === 'code' ? 'block' : 'none';
        previewPanel.style.display = next === 'preview' ? 'block' : 'none';
        if (next === 'preview' && MINDMAP_MODE_STATE.lastSource) {
            renderMindmapFromSource(MINDMAP_MODE_STATE.lastSource);
        }
    };

    codeTab.addEventListener('click', () => setViewMode('code'));
    previewTab.addEventListener('click', () => setViewMode('preview'));
    setViewMode('code');

    return shell;
}

function setStatus(text, tone = 'muted') {
    if (!MINDMAP_MODE_STATE.boardStatus) return;
    MINDMAP_MODE_STATE.boardStatus.textContent = text;
    MINDMAP_MODE_STATE.boardStatus.dataset.tone = tone;
}

function updateBoardTheme() {
    if (!MINDMAP_MODE_STATE.boardShell) return;
    const theme = getThemePreset();
    MINDMAP_MODE_STATE.boardShell.setAttribute('data-theme', theme.isDark ? 'dark' : 'light');
    if (MINDMAP_MODE_STATE.mindmap) {
        try {
            MINDMAP_MODE_STATE.mindmap.setOptions({
                color: theme.accent,
                line: { color: theme.stroke },
                node: { fill: theme.background, color: theme.text }
            });
            MINDMAP_MODE_STATE.mindmap.fit();
        } catch (_) { }
    }
}

function pickLatestMindmapSource(chatContainer) {
    if (!chatContainer) return '';
    if (!MINDMAP_MODE_STATE.enabled) return '';
    const latestAssistant = chatContainer.querySelector('.message.assistant:last-of-type .content');
    if (!latestAssistant) return '';
    const codeBlock = latestAssistant.querySelector(
        'pre code.language-mindmap, pre code.language-markmap, pre code.language-mind_map, pre code.language-mm'
    );
    if (codeBlock) {
        return (codeBlock.textContent || '').trim();
    }
    const fallbackCode = latestAssistant.querySelector('pre code');
    if (fallbackCode) {
        const text = (fallbackCode.textContent || '').trim();
        if (text) {
            const looksLikeMindmap = /^(#{1,6}\s+|\s*[-*]\s+)/m.test(text);
            if (looksLikeMindmap) return text;
        }
    }
    const rawText = (latestAssistant.dataset && latestAssistant.dataset.rawText)
        ? String(latestAssistant.dataset.rawText).trim()
        : '';
    if (!rawText) return '';
    const looksLikeMarkdown = /^(#{1,6}\s+|\s*[-*]\s+)/m.test(rawText);
    return looksLikeMarkdown ? rawText : '';
}

async function renderMindmapFromSource(source) {
    if (MINDMAP_MODE_STATE.viewMode !== 'preview') {
        return;
    }
    if (!source) {
        setStatus(tt('ui.mindmapStatusWaiting'), 'muted');
        if (MINDMAP_MODE_STATE.boardSvg) {
            MINDMAP_MODE_STATE.boardSvg.innerHTML = '';
        }
        return;
    }
    try {
        const markmap = await ensureMindmapLibs();
        const theme = getThemePreset();
        const { Transformer, Markmap } = markmap;
        const transformer = new Transformer();
        const { root } = transformer.transform(source);

        if (!MINDMAP_MODE_STATE.mindmap) {
            MINDMAP_MODE_STATE.mindmap = Markmap.create(
                MINDMAP_MODE_STATE.boardSvg,
                {
                    color: theme.accent,
                    line: { color: theme.stroke },
                    node: { fill: theme.background, color: theme.text }
                },
                root
            );
        } else {
            MINDMAP_MODE_STATE.mindmap.setData(root);
            MINDMAP_MODE_STATE.mindmap.fit();
        }
        setStatus(tt('ui.mindmapStatusRendering'), 'active');
    } catch (error) {
        console.error('[Mindmap] render failed', error);
        setStatus(tt('ui.mindmapStatusError'), 'error');
    }
}

function scheduleSync(chatContainer) {
    if (MINDMAP_MODE_STATE.syncTimer) {
        clearTimeout(MINDMAP_MODE_STATE.syncTimer);
    }
    MINDMAP_MODE_STATE.syncTimer = setTimeout(() => {
        if (!MINDMAP_MODE_STATE.enabled) return;
        const source = pickLatestMindmapSource(chatContainer);
        if (source === MINDMAP_MODE_STATE.lastSource) {
            return;
        }
        MINDMAP_MODE_STATE.lastSource = source;
        renderMindmapFromSource(source);
    }, 120);
}

function attachContentObserver(chatContainer) {
    if (MINDMAP_MODE_STATE.contentObserver) {
        MINDMAP_MODE_STATE.contentObserver.disconnect();
    }
    if (!chatContainer) return;
    MINDMAP_MODE_STATE.contentObserver = new MutationObserver((mutations) => {
        if (!MINDMAP_MODE_STATE.enabled) return;
        const shouldSync = mutations.some((m) => {
            if (m.type === 'childList') {
                return Array.from(m.addedNodes).some(
                    (node) => node.nodeType === 1 && node.closest && node.closest('.message.assistant')
                );
            }
            if (m.type === 'characterData') {
                return m.target.parentElement && m.target.parentElement.closest('.message.assistant');
            }
            return false;
        });
        if (shouldSync) {
            scheduleSync(chatContainer);
        }
    });
    MINDMAP_MODE_STATE.contentObserver.observe(chatContainer, {
        childList: true,
        subtree: true,
        characterData: true
    });
}

function attachContainerObserver(chatContainer) {
    if (MINDMAP_MODE_STATE.containerObserver) {
        MINDMAP_MODE_STATE.containerObserver.disconnect();
    }
    if (!chatContainer) return;
    MINDMAP_MODE_STATE.containerObserver = new MutationObserver(() => {
        if (!MINDMAP_MODE_STATE.enabled) return;
        if (!chatContainer.querySelector('.mindmap-board-shell')) {
            ensureBoard(chatContainer);
            scheduleSync(chatContainer);
        }
    });
    MINDMAP_MODE_STATE.containerObserver.observe(chatContainer, { childList: true });
}

function attachThemeObserver() {
    if (MINDMAP_MODE_STATE.themeObserver) {
        MINDMAP_MODE_STATE.themeObserver.disconnect();
    }
    MINDMAP_MODE_STATE.themeObserver = new MutationObserver((records) => {
        if (!MINDMAP_MODE_STATE.enabled) return;
        const themeChanged = records.some(
            (r) => r.type === 'attributes' && r.attributeName === 'data-theme'
        );
        if (themeChanged) {
            updateBoardTheme();
        }
    });
    MINDMAP_MODE_STATE.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });
}

function renderLatestMindmapFromChat(chatContainer) {
    if (!MINDMAP_MODE_STATE.enabled) return;
    if (!chatContainer) return;
    const source = pickLatestMindmapSource(chatContainer);
    if (!source) {
        return;
    }
    ensureBoard(chatContainer);
    attachThemeObserver();
    MINDMAP_MODE_STATE.lastSource = source;
    if (MINDMAP_MODE_STATE.codeElement) {
        MINDMAP_MODE_STATE.codeElement.textContent = source;
    }
    if (MINDMAP_MODE_STATE.codePanel && MINDMAP_MODE_STATE.previewPanel) {
        MINDMAP_MODE_STATE.codePanel.style.display = 'block';
        MINDMAP_MODE_STATE.previewPanel.style.display = 'none';
    }
    if (MINDMAP_MODE_STATE.boardShell) {
        const tabs = MINDMAP_MODE_STATE.boardShell.querySelectorAll('.mindmap-tab');
        tabs.forEach(tab => {
            const isCodeTab = tab.dataset.mode === 'code';
            tab.classList.toggle('active', isCodeTab);
            tab.setAttribute('aria-pressed', isCodeTab ? 'true' : 'false');
        });
        const previewTab = MINDMAP_MODE_STATE.boardShell.querySelector('.mindmap-tab[data-mode="preview"]');
        if (previewTab) {
            previewTab.disabled = false;
            previewTab.classList.remove('is-disabled');
        }
    }
    MINDMAP_MODE_STATE.viewMode = 'code';
    setStatus(tt('ui.mindmapStatusReady'), 'active');
}

function activateMindmapMode() {
    if (MINDMAP_MODE_STATE.enabled) return;
    const chatContainer = document.getElementById('chat-container');
    const toolsMenuBtn = document.getElementById('tools-menu-btn');
    const toggleEl = document.getElementById('tool-mindmap-option');
    MINDMAP_MODE_STATE.enabled = true;
    document.body.dataset.mindmapMode = 'on';
    if (toolsMenuBtn) toolsMenuBtn.classList.add('active');
    if (toggleEl) toggleEl.classList.add('active');

    try {
        window.dispatchEvent(new CustomEvent('mindmap-mode-change', {
            detail: {
                active: true,
                showToast: true
            }
        }));
    } catch (_) { }

    renderLatestMindmapFromChat(chatContainer);
}

function deactivateMindmapMode() {
    if (!MINDMAP_MODE_STATE.enabled) return;
    const toolsMenuBtn = document.getElementById('tools-menu-btn');
    const toggleEl = document.getElementById('tool-mindmap-option');

    MINDMAP_MODE_STATE.enabled = false;
    delete document.body.dataset.mindmapMode;
    if (toolsMenuBtn) toolsMenuBtn.classList.remove('active');
    if (toggleEl) toggleEl.classList.remove('active');

    if (MINDMAP_MODE_STATE.contentObserver) {
        MINDMAP_MODE_STATE.contentObserver.disconnect();
    }
    if (MINDMAP_MODE_STATE.containerObserver) {
        MINDMAP_MODE_STATE.containerObserver.disconnect();
    }
    if (MINDMAP_MODE_STATE.themeObserver) {
        MINDMAP_MODE_STATE.themeObserver.disconnect();
    }
    if (MINDMAP_MODE_STATE.boardShell) {
        MINDMAP_MODE_STATE.boardShell.remove();
    }
    document.body.classList.remove('mindmap-expanded');
    MINDMAP_MODE_STATE.boardShell = null;
    MINDMAP_MODE_STATE.boardSvg = null;
    MINDMAP_MODE_STATE.boardStatus = null;
    MINDMAP_MODE_STATE.codePanel = null;
    MINDMAP_MODE_STATE.previewPanel = null;
    MINDMAP_MODE_STATE.codeElement = null;
    MINDMAP_MODE_STATE.mindmap = null;
    MINDMAP_MODE_STATE.lastSource = '';
    MINDMAP_MODE_STATE.viewMode = 'code';
    if (MINDMAP_MODE_STATE.syncTimer) {
        clearTimeout(MINDMAP_MODE_STATE.syncTimer);
        MINDMAP_MODE_STATE.syncTimer = null;
    }

    try {
        window.dispatchEvent(new CustomEvent('mindmap-mode-change', {
            detail: {
                active: false,
                showToast: true
            }
        }));
    } catch (_) { }
}

function toggleMindmapMode(toggleEl) {
    if (!MINDMAP_MODE_STATE.enabled) {
        activateMindmapMode();
        toggleEl?.classList.add('active');
    } else {
        deactivateMindmapMode();
        toggleEl?.classList.remove('active');
    }
}

function closeToolsMenu() {
    const menu = document.getElementById('tools-menu');
    const toolsMenuBtn = document.getElementById('tools-menu-btn');
    if (menu) {
        menu.classList.remove('visible');
        if (toolsMenuBtn) {
            const shouldKeepOpen = menu.classList.contains('visible') || toolsMenuBtn.classList.contains('active');
            toolsMenuBtn.classList.toggle('menu-open', shouldKeepOpen);
        }
    }
}

function bindMindmapToggle() {
    const toggleEl = document.getElementById('tool-mindmap-option');
    const chatContainer = document.getElementById('chat-container');
    const sendButton = document.getElementById('send-button');
    const messageInput = document.getElementById('message-input');
    if (!toggleEl || !chatContainer || !sendButton || !messageInput) {
        return;
    }

    toggleEl.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleMindmapMode(toggleEl);
        closeToolsMenu();
    });

    const preflight = () => {
        if (!MINDMAP_MODE_STATE.enabled) return;
        if (!messageInput.value.trim()) return;
        if (MINDMAP_MODE_STATE.boardShell) {
            setStatus(tt('ui.mindmapStatusPending'), 'muted');
            const previewTab = MINDMAP_MODE_STATE.boardShell.querySelector('.mindmap-tab[data-mode="preview"]');
            if (previewTab) {
                previewTab.disabled = true;
                previewTab.classList.add('is-disabled');
                previewTab.setAttribute('aria-pressed', 'false');
            }
        }
    };
    sendButton.addEventListener('click', preflight, true);
    messageInput.addEventListener('keydown', (event) => {
        if (!MINDMAP_MODE_STATE.enabled) return;
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            preflight();
        }
    }, true);
}

document.addEventListener('DOMContentLoaded', () => {
    bindMindmapToggle();
});

window.addEventListener('mindmap-render-request', (event) => {
    const detail = event?.detail || {};
    if (!MINDMAP_MODE_STATE.enabled) return;
    const chatContainer = document.getElementById('chat-container');
    if (detail?.chatId && chatContainer?.dataset?.chatId && detail.chatId !== chatContainer.dataset.chatId) {
        return;
    }
    renderLatestMindmapFromChat(chatContainer);
});

window.addEventListener('mindmap-mode-request', (event) => {
    const detail = event?.detail || {};
    const nextActive = !!detail.active;
    if (nextActive === MINDMAP_MODE_STATE.enabled) return;
    if (nextActive) {
        activateMindmapMode();
    } else {
        deactivateMindmapMode();
    }
});

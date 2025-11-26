import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Clipboard } from '@capacitor/clipboard';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Keyboard } from '@capacitor/keyboard';
import { LocalNotifications } from '@capacitor/local-notifications';
import { StatusBar } from '@capacitor/status-bar';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import qrcodeGenerator from 'qrcode-generator';
import { API_BASE_URL, isNativeApp } from './api-config.js';
import { injectAuthUI } from './auth-template.js';
import './auth.css';
import { deleteChatsFromDB, getChatsFromDB, getSettingsFromDB, saveChatsToDB, saveSettingsToDB } from './db.js';
import { applyLanguage, clearTranslationCache, getCurrentLanguage, onAfterLanguageApplied, preloadAllTranslations, t } from './i18n.js';
import { renderMermaidDiagrams } from './mermaid-renderer.js';
import { cancelMfaVerificationFlow, clearMfaChallengeState, configureMfaLogin, extractMfaChallenge, handleMfaVerificationSubmit, setActiveMfaMethod, setPendingMfaChallenge, showMfaVerificationForm } from './mfa-login.js';
import { clearPendingOAuthState, handleOAuthCallbackRoute as handleOAuthCallbackRouteImpl, setupNativeOAuthDeepLinkHandler as setupNativeOAuthDeepLinkHandlerImpl, setupOAuthButtons as setupOAuthButtonsImpl } from './oauth-flow.js';
import router, { DEFAULT_SETTINGS_SECTION } from './router.js';
import './style.css';
import { renderVegaLiteDiagrams } from './vega-renderer.js';

// ==================== AI System Prompts ====================
const ROLE_INSTRUCTION = `SYSTEM DIRECTIVE: ON SEXUAL, VIOLENT, HATEFUL, OR HIGH-RISK CONTENT, EXECUTE SAFETY MITIGATION AND REDIRECT THE USER WITH SAFE, RELEVANT ALTERNATIVES. RESPOND IN USER'S LANGUAGE. VISUALIZATION: USE MERMAID FOR DIAGRAMS, VEGA/VEGA-LITE FOR CHARTS; OUTPUT ONLY THE NEEDED CODE/DATA BLOCK.`;
const FORMAT_INSTRUCTION = `Use Markdown. Code blocks: \`\`\`lang. Math (CRITICAL): If response contains ANY math (equations/formulas/variables), ALL math symbols/expressions MUST be wrapped: inline $x$, display $$x$$. NO bare math chars allowed. Chemistry MUST use $\\ce{}$: $\\ce{H2O}$ / $\\ce{A+B->C}$ / $\\ce{A<=>B}$. Mermaid: (1) All labels/text MUST use double quotes "" (2) BAN fullwidth chars ()（）①② (3) Arrows ONLY --> or == (4) Comments ONLY start-of-line %% (5) First line MUST be flowchart/graph directive. Vega/Vega-Lite (STRICT): Code fences MUST be \`\`\`vega or \`\`\`vega-lite. Content MUST be valid JSON ONLY (FORBIDDEN: expressions like [min][max], trailing commas, comments/prose). Vega-Lite: include at least "data","mark","encoding"; add "$schema" when known. Vega: include "data","marks". Domain arrays MUST be [min,max] (e.g., [0,100]). If uncertain or cannot produce valid JSON, SKIP Vega entirely.`;
const SEARCH_CONTEXT_INSTRUCTION = `Answer based on the web search results below. Synthesize the information and cite sources as [1], [2] at sentence ends.`;
const RESEARCH_MODE_INSTRUCTION = `Answer succinctly using only relevant Semantic Scholar papers [1], [2]... plus user text. Structure clearly when writing (e.g., Abstract/Intro/Methods/Results/Discussion/Conclusion). Cite in-body as [N] ONLY; do NOT output a References list. If evidence is missing/off-topic or language mismatch yields no papers, say so, then add a short "based on general knowledge" section without invented citations. Ignore irrelevant results.`;
// ===========================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const ApkInstaller = Capacitor.isNativePlatform()
    ? registerPlugin('ApkInstaller', {
        android: {
            pkg: 'com.littleaibox.app.ApkInstallerPlugin'
        }
    })
    : null;

async function applyNativeSafeAreaInsets() {
    // 只在原生Capacitor环境中运行
    if (!Capacitor.isNativePlatform()) {
        return;
    }

    try {
        // 使用StatusBar插件获取顶部信息
        const statusBarInfo = await StatusBar.getInfo();
        const statusBarHeight = statusBarInfo.height || 0;

        // 设置顶部为StatusBar高度
        document.documentElement.style.setProperty('--native-safe-area-top', `${statusBarHeight}px`);
        document.documentElement.style.setProperty('--native-safe-area-bottom', '0px');
        document.documentElement.style.setProperty('--native-safe-area-left', '0px');
        document.documentElement.style.setProperty('--native-safe-area-right', '0px');

        document.documentElement.classList.add('native-safe-area-applied');

    } catch (statusBarError) {
        // 回退值
        document.documentElement.style.setProperty('--native-safe-area-top', '24px');
        document.documentElement.style.setProperty('--native-safe-area-bottom', '0px');
        document.documentElement.style.setProperty('--native-safe-area-left', '0px');
        document.documentElement.style.setProperty('--native-safe-area-right', '0px');
    }
}

const scriptPromises = new Map();
const scriptBlobUrls = new Map();
const SCRIPT_CACHE_NAME = 'littleaibox-file-parsers';
let welcomePageShown = false;
const GUEST_LOCKED_SETTINGS = new Set(['security']);
const uiStateStack = [];
let authOverlayReason = null;
let touchActiveMessage = null;
let touchActionHandlersInitialized = false;
let touchActionModeEnabled = false;
let suppressAuthRouteSync = false;
let pendingAuthRouteOptions = null;
let loadingScreenDefaultText = null;
let pendingLoginSuccessToastKey = null;
let pendingLoginSuccessToastRoute = 'home';
let securityPageInitialized = false;
let refreshSecurityMfaToggleFromUser = null;
const AUTH_ROUTE_STORAGE_KEY = 'littleaibox_last_auth_route';
const codeInputRegistry = new Map();
let nativeVersionSyncInFlight = null;
let autoVersionCheckPromise = null;
let appStateVersionListenerAttached = false;

function buildSettingsPathFromParams(params = {}) {
    const section = params.section ? encodeURIComponent(params.section) : DEFAULT_SETTINGS_SECTION;
    if (params.chatId) {
        const chatRoute = params.chatRoute === 'tempChat' || String(params.chatId).startsWith('temp_')
            ? 'temp_chat'
            : 'chat';
        return `/${chatRoute}/${encodeURIComponent(params.chatId)}/settings/${section}`;
    }
    return `/settings/${section}`;
}

function resetCodeInputs(targetId) {
    if (!targetId) return;
    const record = codeInputRegistry.get(targetId);
    if (!record) return;
    record.inputs.forEach((input) => { input.value = ''; });
    record.updateValue();
    const targetInput = document.getElementById(targetId);
    if (targetInput) {
        targetInput.value = '';
    }
}

function setupCodeInputGroup(group) {
    if (!group) return;
    const targetId = group.dataset.codeTarget;
    if (!targetId) return;
    const targetInput = document.getElementById(targetId);
    if (!targetInput) return;
    const inputs = Array.from(group.querySelectorAll('input[data-code-box]'));
    if (!inputs.length) return;

    const updateValue = () => {
        targetInput.value = inputs.map((input) => input.value).join('');
    };

    inputs.forEach((input, index) => {
        input.addEventListener('input', (event) => {
            const value = event.target.value.replace(/\D/g, '');
            event.target.value = value.slice(-1);
            if (event.target.value && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
            updateValue();
        });

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Backspace' && !input.value) {
                if (index > 0) {
                    inputs[index - 1].focus();
                    inputs[index - 1].value = '';
                    updateValue();
                }
                event.preventDefault();
            } else if (event.key === 'ArrowLeft' && index > 0) {
                inputs[index - 1].focus();
                event.preventDefault();
            } else if (event.key === 'ArrowRight' && index < inputs.length - 1) {
                inputs[index + 1].focus();
                event.preventDefault();
            }
        });

        input.addEventListener('paste', (event) => {
            const clipboard = event.clipboardData?.getData('text') || window.clipboardData?.getData('Text') || '';
            if (!clipboard) return;
            event.preventDefault();
            const digits = clipboard.replace(/\D/g, '').slice(0, inputs.length);
            let cursor = index;
            digits.split('').forEach((digit) => {
                if (cursor >= inputs.length) return;
                inputs[cursor].value = digit;
                cursor += 1;
            });
            const focusTarget = Math.min(cursor, inputs.length - 1);
            inputs[focusTarget].focus();
            updateValue();
        });
    });

    group.addEventListener('click', () => {
        const firstEmpty = inputs.find((input) => !input.value);
        (firstEmpty || inputs[inputs.length - 1]).focus();
    });

    codeInputRegistry.set(targetId, { inputs, updateValue });
    updateValue();
}

function clearPersistedAuthRoute() {
    try {
        sessionStorage.removeItem(AUTH_ROUTE_STORAGE_KEY);
    } catch (_) { }
}

const storedAuthRoute = (() => {
    try {
        return sessionStorage.getItem(AUTH_ROUTE_STORAGE_KEY);
    } catch (_) {
        return null;
    }
})();
const existingSessionId = (() => {
    try {
        return localStorage.getItem('sessionId');
    } catch (_) {
        return null;
    }
})();

if (existingSessionId && storedAuthRoute) {
    clearPersistedAuthRoute();
} else if (storedAuthRoute &&
    storedAuthRoute.startsWith('/auth/') &&
    window.location.pathname === '/') {
    const parts = storedAuthRoute.split('/').filter(Boolean);
    const rawMode = parts[1] || 'login';
    let params;
    if (rawMode === 'reset-password') {
        params = { mode: 'reset', token: decodeURIComponent(parts[2] || '') };
    } else if (rawMode === 'verify-email') {
        params = { mode: 'verify' };
    } else {
        params = { mode: rawMode };
    }
    try {
        window.history.replaceState({ route: 'auth', params }, document.title, storedAuthRoute);
    } catch (_) { }
}

// 设置备份功能
async function backupImportantSettings() {
    try {
        const importantSettings = {
            selectedLanguage: localStorage.getItem('selectedLanguage'),
            userThemeSettings: localStorage.getItem('userThemeSettings'),
            userThemePreset: localStorage.getItem('userThemePreset'),
            guestThemeSettings: localStorage.getItem('guestThemeSettings'),
            seenPrivacyPolicyVersion: localStorage.getItem('seenPrivacyPolicyVersion'),
            app_version: localStorage.getItem('app_version'),
            apk_version: localStorage.getItem('apk_version')
        };

        // 检查是否有实际需要备份的设置
        const hasSettings = Object.values(importantSettings).some(value => value !== null);
        if (!hasSettings) {
            return;
        }

        // 备份到IndexedDB
        await saveSettingsToDB('app_settings', importantSettings);

        if (isNativeApp && Capacitor.getPlatform() === 'android') {
            await ensureStoragePersistence();
        }
    } catch (error) {
        console.error('Failed to backup settings:', error);
    }
}

async function restoreImportantSettings() {
    try {
        const backedUpSettings = await getSettingsFromDB('app_settings');
        if (backedUpSettings) {
            let restoredCount = 0;
            Object.entries(backedUpSettings).forEach(([key, value]) => {
                if (value && !localStorage.getItem(key)) {
                    localStorage.setItem(key, value);
                    restoredCount++;
                }
            });
        }
    } catch (error) {
        console.error('Failed to restore settings:', error);
    }
}

class NavigationEngine {
    constructor() {
        this.isDesktop = window.innerWidth > 640;
        this.isMobile = !this.isDesktop;
        this.isNativeApp = isNativeApp;
        this.isPWAStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
        this.exitPromptShown = false;
        this.exitTimer = null;
        this.gestureStartX = 0;
        this.gestureStartY = 0;
        this.gestureThreshold = 50;
        this.isGestureActive = false;
        this.nextBackShouldReturnToMain = false;
        this.suppressNextPop = false;
        this.isHistoryNavigation = false;
        this.skipNextHistoryBack = false;
        this.sidebarHistoryState = 'idle';
        this.isHandlingSettingsHistoryPop = false;
        this.skipSettingsPopInterception = false;
        this.settingsRouteInfo = null;
        this.init();
    }

    init() {
        this.setupKeyboardListeners();
        this.setupGestureListeners();
        this.setupResizeListener();
        this.setupNativeBackButton();
        this.setupHistoryIntegration();
    }

    setupKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.handleBackAction();
            }
        });
    }

    setupGestureListeners() {
        if (!this.isMobile) return;

        document.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                const startX = e.touches[0].clientX;
                const startY = e.touches[0].clientY;
                const isSidebarOpen = this.isSidebarOpen();

                const nearRightEdge = startX > window.innerWidth - 30;
                const nearLeftEdge = isSidebarOpen && startX < 30;
                const nearRightEdgeWhenSidebarOpen = isSidebarOpen && startX > window.innerWidth - 30;

                if (nearRightEdge || nearLeftEdge || nearRightEdgeWhenSidebarOpen) {
                    this.gestureStartX = startX;
                    this.gestureStartY = startY;
                    this.isGestureActive = true;
                }
            }
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            if (!this.isGestureActive || e.changedTouches.length !== 1) {
                this.isGestureActive = false;
                return;
            }

            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const deltaX = endX - this.gestureStartX;
            const deltaY = endY - this.gestureStartY;

            const isHorizontalGesture =
                Math.abs(deltaX) > this.gestureThreshold &&
                Math.abs(deltaY) < this.gestureThreshold;

            if (isHorizontalGesture) {
                const isSidebarOpen = this.isSidebarOpen();

                if (isSidebarOpen) {
                    const swipedFromLeft = this.gestureStartX < 30 && deltaX > 0;
                    const swipedFromRight = this.gestureStartX > window.innerWidth - 30 && deltaX < 0;

                    if (swipedFromLeft || swipedFromRight) {
                        this.handleBackAction();
                    }
                } else {
                    const swipedFromRight = this.gestureStartX > window.innerWidth - 30 && deltaX < 0;
                    if (swipedFromRight) {
                        this.handleBackAction();
                    }
                }
            }

            this.isGestureActive = false;
        }, { passive: true });
    }

    setupResizeListener() {
        window.addEventListener('resize', () => {
            const wasDesktop = this.isDesktop;
            this.isDesktop = window.innerWidth > 640;
            this.isMobile = !this.isDesktop;

            if (wasDesktop !== this.isDesktop && this.isDesktop) {
                this.closeSidebar();
            }
        });
    }

    setupNativeBackButton() {
        if (!this.isNativeApp) return;

        App.addListener('backButton', () => {
            this.handleBackAction();
        });
    }

    setupHistoryIntegration() {
        try {
            router.init({
                isNativeApp: this.isNativeApp,
                onBack: () => {
                    if (this.skipNextHistoryBack) {
                        this.skipNextHistoryBack = false;
                        return;
                    }
                    this.isHistoryNavigation = true;
                    Promise.resolve(this.handleBackAction()).finally(() => {
                        this.isHistoryNavigation = false;
                    });
                },
                shouldIgnorePop: () => {
                    const shouldIgnore = this.shouldInterceptSettingsHistoryPop() || this.suppressNextPop;
                    if (shouldIgnore && elements.settingsModal?.classList.contains('visible')) {
                        // 立即恢复设置页面的 URL
                        try {
                            if (this.settingsRouteInfo) {
                                const section = this.settingsRouteInfo.params?.section || DEFAULT_SETTINGS_SECTION;
                                const settingsUrl = buildSettingsPathFromParams({
                                    ...this.settingsRouteInfo.params,
                                    section
                                });
                                const currentPath = window.location.pathname;
                                if (currentPath !== settingsUrl) {
                                    // 使用 pushState 恢复 URL，但保持当前的历史状态
                                    window.history.pushState(
                                        { route: 'settings', params: this.settingsRouteInfo.params },
                                        document.title,
                                        settingsUrl
                                    );
                                }
                            }
                        } catch (error) {
                            console.error('Failed to restore settings URL after popstate:', error);
                        }
                    }
                    return shouldIgnore;
                },
                onPopIgnored: () => {
                    this.suppressNextPop = false;
                }
            });
        } catch (_) { }
    }

    shouldInterceptSettingsHistoryPop() {
        if (this.skipSettingsPopInterception) {
            this.skipSettingsPopInterception = false;
            return false;
        }
        if (!elements.settingsModal?.classList.contains('visible')) {
            return false;
        }
        const confirmOverlay = document.querySelector('.custom-confirm-overlay');
        if (confirmOverlay && confirmOverlay.classList.contains('visible')) {
            return true;
        }
        if (this.isHandlingSettingsHistoryPop) {
            return true;
        }
        return false;
    }

    handleSettingsHistoryPopAttempt() {
        if (this.isHandlingSettingsHistoryPop) {
            return;
        }
        this.isHandlingSettingsHistoryPop = true;
        Promise.resolve().then(async () => {
            try {
                const canClose = await closeModalAndResetState(() =>
                    handleCloseSettingsModalByPage({
                        manageHistory: false,
                        skipHandleBack: true
                    })
                );
                if (canClose) {
                    this.skipSettingsPopInterception = true;
                    this.requestProgrammaticBack({ skipHandleBack: true });
                }
            } catch (error) {
                console.error('Failed to handle settings back navigation:', error);
            } finally {
                this.isHandlingSettingsHistoryPop = false;
            }
        });
    }

    canUseSidebarHistory() {
        return !this.isNativeApp &&
            typeof router?.pushPlaceholder === 'function';
    }

    notifySidebarOpened() {
        if (!this.canUseSidebarHistory() || this.sidebarHistoryState !== 'idle' || !this.isMobile) {
            return;
        }
        try {
            router.pushPlaceholder();
            this.sidebarHistoryState = 'armed';
        } catch (_) {
            this.sidebarHistoryState = 'idle';
        }
    }

    notifySidebarClosed(options = {}) {
        if (!this.canUseSidebarHistory()) {
            return;
        }
        if (options.fromHistory) {
            if (this.sidebarHistoryState !== 'idle') {
                this.sidebarHistoryState = 'idle';
                this.markHistoryHandled();
            }
            return;
        }
        if (this.sidebarHistoryState !== 'armed') {
            return;
        }
        this.sidebarHistoryState = 'closing';
        this.requestProgrammaticBack({ skipHandleBack: true });
    }

    consumeSidebarHistoryPop() {
        if (!this.canUseSidebarHistory()) {
            return false;
        }
        const state = this.sidebarHistoryState;
        if (state === 'idle') {
            return false;
        }
        this.sidebarHistoryState = 'idle';
        if (!document.body.classList.contains('sidebar-open')) {
            this.markHistoryHandled();
            return true;
        }
        try {
            closeSidebar(true, { fromHistory: true });
        } catch (error) {
            console.error('Failed to close sidebar from history pop:', error);
            this.markHistoryHandled();
        }
        return true;
    }

    requestProgrammaticBack(options = {}) {
        const { skipHandleBack = false } = options;
        try {
            if (skipHandleBack) {
                this.skipNextHistoryBack = true;
            } else {
                this.suppressNextPop = true;
            }
            const navigated = router.back();
            if (!navigated) {
                if (skipHandleBack) {
                    this.skipNextHistoryBack = false;
                } else {
                    this.suppressNextPop = false;
                }
            }
        } catch (_) {
            if (skipHandleBack) {
                this.skipNextHistoryBack = false;
            } else {
                this.suppressNextPop = false;
            }
        }
    }

    markHistoryHandled() {
        this.skipNextHistoryBack = true;
    }

    async handleBackAction() {
        try {
            if (this.hasModalOpen()) {
                await this.closeModal();
                return;
            }
        } catch (_) { }
        try {
            if (ensureInlineEditModeClosed && ensureInlineEditModeClosed()) {
                return;
            }
        } catch (_) { }
        if (this.isSidebarOpen()) {
            this.closeSidebar(true);
            if (this.isOnChatPage()) {
                this.nextBackShouldReturnToMain = true;
            }
            return;
        }

        if (this.isRightSidebarOpen()) {
            this.closeRightSidebar();
            return;
        }

        if (this.nextBackShouldReturnToMain && this.isOnChatPage()) {
            this.nextBackShouldReturnToMain = false;
            await this.returnToMainPage();
            return;
        }

        if (this.isOnLoginPage()) {
            this.enterGuestMode();
            return;
        }

        if (this.isOnChatPage()) {
            await this.returnToMainPage();
            return;
        }

        if (this.isOnMainPage()) {
            if (this.isHistoryNavigation) {
                router.navigate('home', {}, { replace: true, silent: true });
                this.markHistoryHandled?.();
            }
            this.clearAllStateStacks(!this.isNativeApp, {
                preserveExitState: this.isNativeApp
            });
            this.handleExitLogic();
            return;
        }

        this.handleExitLogic();
    }

    // 检查是否有模态框打开
    hasModalOpen() {
        // 检查设置模态框
        if (elements.settingsModal?.classList.contains('visible')) {
            return true;
        }

        // 检查文件查看器
        if (elements.fileViewerOverlay?.classList.contains('visible')) {
            return true;
        }

        // 检查图片查看器
        const imageModal = document.getElementById('image-viewer-modal');
        if (imageModal && imageModal.classList.contains('visible')) {
            return true;
        }


        // 检查自定义确认对话框
        const confirmOverlay = document.querySelector('.custom-confirm-overlay');
        if (confirmOverlay && confirmOverlay.style.display !== 'none') {
            return true;
        }

        // 检查使用限制模态框
        if (document.getElementById('usage-limit-modal')?.classList.contains('visible')) {
            return true;
        }

        // 检查登录遮罩
        if (elements.authOverlay?.classList.contains('visible')) {
            return true;
        }

        return false;
    }

    // 关闭模态框
    async closeModal() {
        // 关闭设置模态框
        if (elements.settingsModal?.classList.contains('visible')) {
            const closeOptions = {
                manageHistory: !this.isHistoryNavigation,
                skipHandleBack: !this.isHistoryNavigation
            };
            const canClose = await closeModalAndResetState(() =>
                handleCloseSettingsModalByPage(closeOptions)
            );
            if (canClose) {
                this.suppressNextPop = false;
            }
            return;
        }

        // 关闭文件查看器
        if (elements.fileViewerOverlay?.classList.contains('visible')) {
            hideFileViewerUI();
            return;
        }

        // 关闭图片查看器
        const imageModal = document.getElementById('image-viewer-modal');
        if (imageModal) {
            imageModal.classList.remove('visible');
            setTimeout(() => {
                if (document.body.contains(imageModal)) {
                    document.body.removeChild(imageModal);
                }
            }, 200);
            return;
        }

        // 关闭自定义确认对话框
        const confirmOverlay = document.querySelector('.custom-confirm-overlay');
        if (confirmOverlay) {
            const cancelBtn = confirmOverlay.querySelector('.custom-confirm-btn-cancel');
            if (cancelBtn) cancelBtn.click();
            return;
        }

        // 关闭使用限制模态框
        const limitModal = document.getElementById('usage-limit-modal');
        if (limitModal?.classList.contains('visible')) {
            limitModal.classList.remove('visible');
            return;
        }

        // 关闭登录遮罩
        if (elements.authOverlay?.classList.contains('visible')) {
            if (authOverlayReason === 'user') {
                hideAuthOverlay(false, { routeHandled: this.isHistoryNavigation });
            } else {
                this.handleExitLogic();
            }
            return;
        }
    }

    // 检查侧边栏是否打开
    isSidebarOpen() {
        return document.body.classList.contains('sidebar-open');
    }

    // 关闭侧边栏
    closeSidebar(fromBackAction = false) {
        if (this.isSidebarOpen()) {
            try {
                closeSidebar(true, { fromHistory: fromBackAction && this.isHistoryNavigation });
            } catch (e) {
                console.error('Error closing sidebar:', e);
            }
        }
    }

    // 检查右侧抽屉是否打开
    isRightSidebarOpen() {
        return document.body.classList.contains('right-sidebar-open');
    }

    // 关闭右侧抽屉
    closeRightSidebar() {
        if (this.isRightSidebarOpen()) {
            document.body.classList.remove('right-sidebar-open');
        }
    }

    // 检查是否在登录页面
    isOnLoginPage() {
        return elements.authOverlay?.classList.contains('visible');
    }

    // 进入访客模式
    enterGuestMode() {
        hideAuthOverlay(false);
    }

    // 处理退出逻辑
    handleExitLogic() {
        if (!this.isNativeApp) {
            return;
        }

        // 原生应用的两次确认退出逻辑
        if (!this.exitPromptShown) {
            this.exitPromptShown = true;
            showToast(getToastMessage('toast.pressAgainToExitShort'), 'info');

            // 2秒后重置提示状态
            this.exitTimer = setTimeout(() => {
                this.exitPromptShown = false;
            }, 2000);
        } else {
            if (this.exitTimer) {
                clearTimeout(this.exitTimer);
                this.exitTimer = null;
            }
            this.exitPromptShown = false;
            try {
                if (typeof App !== 'undefined' && typeof App.exitApp === 'function') {
                    App.exitApp();
                }
            } catch (error) {
                console.error('Failed to exit app:', error);
            }
        }
    }

    // 重置退出状态
    resetExitState() {
        this.exitPromptShown = false;
        this.nextBackShouldReturnToMain = false;
        if (this.exitTimer) {
            clearTimeout(this.exitTimer);
            this.exitTimer = null;
        }
    }

    clearAllStateStacks(forImmediateWebExit = false, options = {}) {
        const { preserveExitState = false } = options;
        while (uiStateStack.length) {
            const state = uiStateStack.pop();
            try {
                state?.close?.();
            } catch (_) { }
        }
        this.suppressNextPop = false;
        if (forImmediateWebExit && typeof router.resetManagedHistory === 'function') {
            router.resetManagedHistory();
        }
        if (!preserveExitState) {
            this.resetExitState();
        }
    }

    // 手动触发返回操作
    triggerBack() {
        this.handleBackAction();
    }

    // 检查是否在聊天页面
    isOnChatPage() {
        return currentChatId && !this.isOnMainPage();
    }

    // 检查是否在主页面
    isOnMainPage() {
        return !this.hasModalOpen() &&
            !this.isSidebarOpen() &&
            !this.isRightSidebarOpen() &&
            !this.isOnLoginPage() &&
            !currentChatId;
    }

    // 返回到主页面
    async returnToMainPage() {
        try {
            if (ensureInlineEditModeClosed) {
                ensureInlineEditModeClosed();
            }
        } catch (_) { }
        if (currentChatId) {
            persistCurrentDraft(currentChatId);
            if (currentChatId.startsWith('temp_')) {
                const canLeave = await handleLeaveTemporaryChat(false);
                if (!canLeave) {
                    routeManager.ensureChatRouteSynced();
                    return;
                }
            } else {
                currentChatId = null;
                showEmptyState();
                scheduleRenderSidebar();
            }
        }
        if (!currentChatId) {
            routeManager.navigateToHome({ replace: true });
            this.clearAllStateStacks(!this.isNativeApp);
            clearInputAndAttachments(true);
        }
    }

    markHistoryHandled() {
        this.skipNextHistoryBack = true;
    }
}

// 创建全局导航引擎实例
const navigationEngine = new NavigationEngine();
window.isChatProcessing = () => isProcessing;

class RouteManager {
    constructor() {
        this.suppressSettingsRouteSync = false;
        this.initialRouteHandled = false;
        this.chatsLoadPromise = Promise.resolve();
        this.currentAuthState = { mode: 'login', token: '' };
        this.historyUnsubscribe = router.onChange((payload) => {
            Promise.resolve(this.handleHistoryChange(payload))
                .catch((error) => console.error('Route history handling failed:', error));
            maybeShowPendingLoginSuccessToast(payload?.route?.name);
        });
    }

    setChatsLoadPromise(promise) {
        this.chatsLoadPromise = promise || Promise.resolve();
    }

    async waitForChatsToLoad() {
        try {
            await this.chatsLoadPromise;
        } catch (_) { }
    }

    navigateToChat(chatId, options = {}) {
        if (!chatId) return;
        const routeName = String(chatId).startsWith('temp_') ? 'tempChat' : 'chat';
        const currentRoute = router.getCurrentRoute();
        const isCurrentChatContext = currentRoute?.name === 'chat' || currentRoute?.name === 'tempChat';
        const isTargetChatContext = routeName === 'chat' || routeName === 'tempChat';
        const shouldReplace = options.replace === true || (isTargetChatContext && isCurrentChatContext);
        router.navigate(routeName, { chatId }, {
            replace: shouldReplace,
            silent: options.silent === true
        });
    }

    ensureChatRouteSynced(options = {}) {
        if (!currentChatId) return;
        this.navigateToChat(currentChatId, {
            replace: options.replace === true,
            silent: options.silent === true
        });
    }

    navigateToHome(options = {}) {
        const currentRoute = router.getCurrentRoute();
        if (currentRoute?.name === 'home' && options.force !== true) {
            const currentPath = window.location.pathname;
            if (currentPath === '/' || currentPath === '') {
                return;
            }
        }
        router.navigate('home', {}, {
            replace: options.replace !== false,
            silent: options.silent === true
        });
    }

    getActiveSettingsSection() {
        const activeNav = document.querySelector('.settings-nav-item.active');
        return (activeNav?.dataset.page) || lastSettingsPage || DEFAULT_SETTINGS_SECTION;
    }

    normalizeAuthMode(mode) {
        if (mode === 'register') return 'register';
        if (mode === 'verify' || mode === 'verify-email') return 'verify';
        if (mode === 'reset-request' || mode === 'reset-password-request') return 'reset-request';
        if (mode === 'reset' || mode === 'reset-password') return 'reset';
        return 'login';
    }

    normalizeAuthState(state) {
        if (typeof state === 'object' && state !== null) {
            const normalizedMode = this.normalizeAuthMode(state.mode);
            return {
                mode: normalizedMode,
                token: normalizedMode === 'reset' ? (state.token || '') : ''
            };
        }
        const normalizedMode = this.normalizeAuthMode(state);
        return { mode: normalizedMode, token: '' };
    }

    syncSettingsRoute(section, options = {}) {
        if (this.suppressSettingsRouteSync) return;
        const finalSection = section || this.getActiveSettingsSection();
        if (!finalSection) return;
        // 保存设置页面的路由信息，以便在阻止后退时恢复 URL
        const chatContext = currentChatId ? {
            chatId: currentChatId,
            chatRoute: String(currentChatId).startsWith('temp_') ? 'tempChat' : 'chat'
        } : {};
        const params = { section: finalSection, ...chatContext };
        navigationEngine.settingsRouteInfo = { name: 'settings', params };
        router.navigate('settings', params, {
            replace: options.replace === true,
            silent: options.silent === true
        });
    }

    syncAuthRoute(modeOrState = 'login', options = {}) {
        const state = this.normalizeAuthState(modeOrState);
        const params = state.mode === 'reset'
            ? { mode: 'reset', token: state.token || '' }
            : state.mode === 'verify'
                ? { mode: 'verify' }
                : state.mode === 'reset-request'
                    ? { mode: 'reset-request' }
                    : { mode: state.mode };
        router.navigate('auth', params, {
            replace: options.replace !== false,
            silent: options.silent === true
        });
        this.currentAuthState = state;
    }

    isSettingsSyncSuppressed() {
        return this.suppressSettingsRouteSync;
    }

    async openSettingsFromRoute(section, options = {}) {
        let targetSection = section || DEFAULT_SETTINGS_SECTION;
        if (!currentUser && GUEST_LOCKED_SETTINGS.has(targetSection)) {
            targetSection = DEFAULT_SETTINGS_SECTION;
        }
        this.suppressSettingsRouteSync = true;
        try {
            if (elements.settingsModal) {
                elements.settingsModal.classList.add('visible');
                elements.chatContainer.style.display = 'flex';
                updateLoginButtonVisibility();
                setupSettingsModalUI();
            }
            await new Promise(resolve => setTimeout(resolve, 150));
            const isVisible = (el) => el && window.getComputedStyle(el).display !== 'none';
            let navItem = document.querySelector(`.settings-nav-item[data-page="${targetSection}"]`);
            let appliedSection = targetSection;
            if (!isVisible(navItem)) {
                const fallbackNav = Array.from(document.querySelectorAll('.settings-nav-item'))
                    .find(item => isVisible(item));
                if (fallbackNav) {
                    navItem = fallbackNav;
                    appliedSection = fallbackNav.dataset.page;
                } else {
                    navItem = null;
                    appliedSection = DEFAULT_SETTINGS_SECTION;
                }
            }
            if (navItem) {
                navItem.click();
            }
            lastSettingsPage = appliedSection;
        } finally {
            this.suppressSettingsRouteSync = false;
        }
    }

    redirectGuestToAuth(options = {}) {
        const {
            mode = 'login',
            onlyManageUi = false,
            showImmediateOverlay = true,
            hideSettings = true,
            origin = 'route'
        } = options;

        const state = this.normalizeAuthState(mode);
        if (hideSettings) {
            hideSettingsModal(false, { skipHandleBack: true });
        }
        if (!onlyManageUi) {
            this.syncAuthRoute(state, { replace: true, silent: true });
        }
        if (showImmediateOverlay) {
            openAuthOverlay(origin, state, { syncRoute: false });
        }
    }

    async openAuthFromRoute(modeState) {
        const state = this.normalizeAuthState(modeState);
        openAuthOverlay('route', state, { syncRoute: false });
    }

    async openChatFromRoute(chatId) {
        if (!chatId) return;
        await this.waitForChatsToLoad();
        if (!chats || !chats[chatId]) {
            const isTempChat = String(chatId).startsWith('temp_');
            currentChatId = null;
            try {
                showEmptyState();
            } catch (_) { }
            scheduleRenderSidebar();
            if (isTempChat && !currentUser) {
                this.redirectGuestToAuth({
                    origin: 'auto',
                    onlyManageUi: true,
                    showImmediateOverlay: false,
                    hideSettings: false
                });
            }
            this.navigateToHome({ replace: true, force: true });
            return;
        }
        try {
            await loadChat(chatId);
        } catch (error) {
            console.error('Failed to open chat from route:', error);
        }
    }

    async handleRouteIntent(route) {
        if (!route) return;
        if ((route.name === 'chat' || route.name === 'tempChat') && route.params?.chatId) {
            await this.openChatFromRoute(route.params.chatId);
        } else if (route.name === 'settings') {
            const section = route.params?.section;
            const routeChatId = route.params?.chatId;
            if (routeChatId) {
                await this.waitForChatsToLoad();
                const chatExists = chats && chats[routeChatId];
                if (!chatExists) {
                    const fallbackSection = section || DEFAULT_SETTINGS_SECTION;
                    const params = { section: fallbackSection };
                    navigationEngine.settingsRouteInfo = { name: 'settings', params };
                    router.navigate('settings', params, { replace: true, silent: true });
                    await this.openSettingsFromRoute(fallbackSection);
                    return;
                }
            }
            await this.openSettingsFromRoute(section);
        } else if (route.name === 'auth') {
            await this.openAuthFromRoute(route.params?.mode);
        } else if (route.name === 'oauthCallback') {
            await handleOAuthCallbackRouteImpl(route.params?.provider, route.params?.search, buildOAuthContext({ routeManager: this }));
        }
    }

    async handleInitialRouteIntent() {
        if (this.initialRouteHandled) return;
        this.initialRouteHandled = true;
        try {
            const initialRoute = router.getCurrentRoute();
            await this.handleRouteIntent(initialRoute);
        } catch (error) {
            console.error('Failed to handle initial route:', error);
        }
    }

    isInitialRouteProcessed() {
        return this.initialRouteHandled;
    }

    getAuthMode() {
        return this.currentAuthState.mode;
    }

    getAuthState() {
        return { ...this.currentAuthState };
    }

    setAuthMode(mode, token = '') {
        this.currentAuthState = this.normalizeAuthState({ mode, token });
    }

    resetAuthMode() {
        this.currentAuthState = { mode: 'login', token: '' };
    }

    async handleHistoryChange(payload) {
        if (!payload || payload.type !== 'pop') {
            return;
        }
        const route = payload.route;
        if (!route) {
            return;
        }
        if (navigationEngine?.consumeSidebarHistoryPop?.()) {
            return;
        }
        navigationEngine.markHistoryHandled?.();

        if (route.name === 'oauthCallback') {
            await handleOAuthCallbackRouteImpl(route.params?.provider, route.params?.search, buildOAuthContext({ routeManager: this }));
            return;
        }
        if (route.name === 'auth') {
            hideSettingsModal(false, { skipHandleBack: true });
            await this.openAuthFromRoute(route.params?.mode);
            return;
        }
        if (route.name === 'settings') {
            hideAuthOverlay(false, { routeHandled: true });
            await this.openSettingsFromRoute(route.params?.section, { fromHistory: true });
            return;
        }
        if (route.name === 'chat' || route.name === 'tempChat') {
            hideSettingsModal(false, { skipHandleBack: true });
            hideAuthOverlay(false, { routeHandled: true });
            const chatId = route.params?.chatId;

            if (chatId && chatId !== currentChatId) {
                await this.openChatFromRoute(chatId);
            }
            return;
        }
        if (route.name === 'home') {
            hideSettingsModal(false, { skipHandleBack: true });
            hideAuthOverlay(false, { routeHandled: true });
            if (currentChatId && String(currentChatId).startsWith('temp_')) {
                const tempId = currentChatId;
                this.navigateToChat(tempId, { replace: false, silent: true });
                const canLeave = await handleLeaveTemporaryChat(false);
                if (canLeave) {
                    this.navigateToHome({ replace: true });
                }
                return;
            }
            if (currentChatId) {
                currentChatId = null;
                showEmptyState();
                scheduleRenderSidebar();
                this.navigateToHome({ replace: true });
                return;
            }
            currentChatId = null;
            showEmptyState();
            this.navigateToHome({ replace: true });
            return;
        }
    }
}

const routeManager = new RouteManager();
const initialRouteState = router.getCurrentRoute();
if (initialRouteState?.name === 'auth') {
    routeManager.setAuthMode(initialRouteState.params?.mode, initialRouteState.params?.token);
}

function buildOAuthContext(overrides = {}) {
    return {
        isNativeApp,
        showToast,
        showLoadingScreen,
        hideLoadingScreen,
        getToastMessage,
        hideAuthOverlay,
        openAuthOverlay,
        applyAuthenticatedSession,
        clearPersistedAuthRoute,
        routeManager,
        ...overrides
    };
}

function getAuthPathForState(state) {
    const normalizedState = routeManager.normalizeAuthState(state);
    if (normalizedState.mode === 'reset') {
        const token = normalizedState.token ? `/${encodeURIComponent(normalizedState.token)}` : '';
        return `/auth/reset-password${token}`;
    }
    if (normalizedState.mode === 'reset-request') {
        return '/auth/reset-password';
    }
    if (normalizedState.mode === 'verify') {
        return '/auth/verify-email';
    }
    if (normalizedState.mode === 'register') {
        return '/auth/register';
    }
    return '/auth/login';
}

function persistAuthRoute(state) {
    try {
        sessionStorage.setItem(AUTH_ROUTE_STORAGE_KEY, getAuthPathForState(state));
    } catch (_) { }
}


function loadScript(src, globalName) {
    if (window[globalName]) {
        return Promise.resolve();
    }
    if (scriptPromises.has(src)) {
        return scriptPromises.get(src);
    }

    const promise = (async () => {
        const { url, revoke } = await prepareScriptSource(src);
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => {
                resolve();
                if (revoke) {
                    setTimeout(revoke, 0);
                }
            };
            script.onerror = () => {
                scriptPromises.delete(src);
                if (revoke) {
                    revoke();
                }
                reject(new Error(`${getToastMessage('errors.scriptLoadFailed')}: ${src}`));
            };
            document.head.appendChild(script);
        });
    })();

    scriptPromises.set(src, promise);
    return promise;
}

async function prepareScriptSource(src) {
    if (!canUseScriptCache() || !isSameOriginResource(src)) {
        return { url: src, revoke: null };
    }

    try {
        const cache = await caches.open(SCRIPT_CACHE_NAME);
        const request = new Request(new URL(src, window.location.origin).href, {
            credentials: 'same-origin'
        });

        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            const blobUrl = await createBlobUrlFromResponse(src, cachedResponse.clone());
            return {
                url: blobUrl,
                revoke: () => revokeScriptBlobUrl(src)
            };
        }

        const networkResponse = await fetch(request);
        if (!networkResponse.ok) {
            throw new Error(`Failed to fetch ${src}: ${networkResponse.status}`);
        }
        await cache.put(request, networkResponse.clone());
        const blobUrl = await createBlobUrlFromResponse(src, networkResponse.clone());
        return {
            url: blobUrl,
            revoke: () => revokeScriptBlobUrl(src)
        };
    } catch (error) {
        console.debug('Script cache preparation failed:', error);
        return { url: src, revoke: null };
    }
}

function ensurePlaintextHighlightLanguage() {
    if (!window.hljs || typeof window.hljs.getLanguage !== 'function') {
        return;
    }
    if (window.hljs.getLanguage('plaintext')) {
        return;
    }
    try {
        window.hljs.registerLanguage('plaintext', () => ({
            name: 'Plaintext',
            contains: []
        }));
        if (typeof window.hljs.registerAliases === 'function') {
            window.hljs.registerAliases(['text', 'plain'], { language: 'plaintext' });
        }
    } catch (error) {
        console.warn('Failed to register plaintext language for highlight.js:', error);
    }
}

function rerenderDynamicContent(root) {
    try {
        const container = root || elements.chatContainer || document;
        const contents = container.querySelectorAll('.message .content');
        contents.forEach(el => mathRenderer.renderMath(el, { isFinalRender: true }));

        try {
            renderMermaidDiagrams(container, { loadScript, isFinalRender: true });
        } catch (_) { }
        try {
            renderVegaLiteDiagrams(container, { loadScript, isFinalRender: true });
        } catch (_) { }

        if (window.hljs) {
            ensurePlaintextHighlightLanguage();
            const blocks = Array.from(container.querySelectorAll('pre code'))
                .filter(block => !block.classList.contains('hljs')
                    && (block.dataset.mermaidProcessed !== 'true')
                    && (block.dataset.vegaLiteProcessed !== 'true')
                    && (block.dataset.vegaLitePending !== 'true')
                    && !((block.className || '').includes('language-mermaid'))
                    && !((block.className || '').includes('language-vega-lite'))
                    && !((block.className || '').includes('language-vega')));
            blocks.forEach(block => { try { hljs.highlightElement(block); } catch (_) { } });
        }
    } catch (_) { }
}

function setupVisibilityRerender() {
    const schedule = () => setTimeout(() => rerenderDynamicContent(), 60);

    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
    window.addEventListener('focus', schedule);
    window.addEventListener('pageshow', () => schedule());
}

function canUseScriptCache() {
    return typeof window !== 'undefined'
        && typeof window.caches !== 'undefined'
        && typeof caches.open === 'function'
        && typeof window.URL !== 'undefined'
        && typeof URL.createObjectURL === 'function';
}

function isSameOriginResource(resourcePath) {
    try {
        const url = new URL(resourcePath, window.location.href);
        return url.origin === window.location.origin;
    } catch (_) {
        return false;
    }
}

async function createBlobUrlFromResponse(src, response) {
    const blob = await response.blob();
    revokeScriptBlobUrl(src);
    const blobUrl = URL.createObjectURL(blob);
    scriptBlobUrls.set(src, blobUrl);
    return blobUrl;
}

function revokeScriptBlobUrl(src) {
    const existingUrl = scriptBlobUrls.get(src);
    if (existingUrl) {
        URL.revokeObjectURL(existingUrl);
        scriptBlobUrls.delete(src);
    }
}

const PRIVACY_POLICY_VERSION = '2025-11-20';
const GUEST_FILE_SIZE_LIMIT = 5 * 1024 * 1024;
const LOGGED_IN_FILE_SIZE_LIMIT = 10 * 1024 * 1024;
const MAX_TABLE_ROWS = 80;
const LOCAL_STORAGE_KEY_PRIVACY = 'seenPrivacyPolicyVersion';
const LARGE_TEXT_THRESHOLD = 40000;
const CHARACTER_LIMIT = 300000;
const ICONS = {
    DELETE: '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
    EDIT: '<svg viewBox="0 0 24 24"><path d="M14.06 9.06L15.94 10.94 8.06 18.81 6.19 16.94zM16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    SHARE: '<svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3s3-1.34 3-3-1.34-3-3-3z"/></svg>',
    HELP: '<svg viewBox="0 0 24 24"><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>',
    LOGOUT: '<svg viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>',
    COPY: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
    CHECK: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    DOWNLOAD: '<path d="M5 20h14a1 1 0 0 0 1-1v-2h-2v1H6v-1H4v2a1 1 0 0 0 1 1zm7-3 5-5h-3V4h-4v8H7l5 5z"/>'
};
const CHUNK_CONFIG = {
    summarize: { size: 20000, overlap: 150 },
    analyze: { size: 15000, overlap: 100 }
};

function smartChunkingByParagraphs(text, maxSize = 15000) {
    const paragraphs = text.split(/\n\s*\n/);
    const chunks = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        if (paragraph.length > maxSize) {
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }
            const subChunks = smartChunking(paragraph, maxSize, 100);
            chunks.push(...subChunks);
        } else if (currentChunk.length + paragraph.length > maxSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = paragraph;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

function createDialog(title, contentHtml, iconSvg, onConfirm, onCancel, options = {}) {
    if (document.querySelector('.custom-confirm-overlay')) {
        return { promise: Promise.reject('A dialog is already open.'), dialogBox: null };
    }

    const { manageHistory = true } = options;

    let promiseResolve;
    const promise = new Promise(resolve => {
        promiseResolve = resolve;
    });

    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';

    overlay.innerHTML = `
        <div class="custom-confirm-box">
            <div class="custom-dialog-header">
                ${iconSvg}
                <h2>${title}</h2>
            </div>
            <div class="custom-dialog-content">${contentHtml}</div>
            <div class="custom-confirm-actions">
                <button class="custom-confirm-btn-cancel">${getToastMessage('dialog.cancel')}</button>
                <button class="custom-confirm-btn-confirm">${getToastMessage('dialog.confirm')}</button>
            </div>
        </div>
    `;

    const dialogBox = overlay.querySelector('.custom-confirm-box');
    const btnConfirm = overlay.querySelector('.custom-confirm-btn-confirm');
    const btnCancel = overlay.querySelector('.custom-confirm-btn-cancel');

    const closeDialog = (result) => {
        if (overlay.classList.contains('visible')) {
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
            }, 200);
        }
        promiseResolve(result);
    };

    btnConfirm.addEventListener('click', () => {
        onConfirm(closeDialog, dialogBox);
    });
    btnCancel.addEventListener('click', () => {
        onCancel(closeDialog, dialogBox);
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            onCancel(closeDialog, dialogBox);
        }
    });


    document.body.appendChild(overlay);
    setTimeout(() => {

        overlay.classList.add('visible');
    }, 10);

    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onCancel(closeDialog, overlay);
            document.removeEventListener('keydown', onKeyDown);
        }
    };
    document.addEventListener('keydown', onKeyDown);

    return { promise, dialogBox };
}

function showImageSourceChoice() {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'source-choice-overlay';
        overlay.innerHTML = `
            <div class="source-choice-sheet">
                <button data-source="camera">${getToastMessage('image.takePhoto')}</button>
                <button data-source="photos">${getToastMessage('image.selectFromAlbum')}</button>
                <button data-source="cancel">${getToastMessage('image.cancel')}</button>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = (source) => {
            overlay.classList.remove('visible');
            setTimeout(() => {
                document.body.removeChild(overlay);
                resolve(source);
            }, 300);
        };

        overlay.addEventListener('click', (e) => {
            const source = e.target.dataset.source;
            if (source) {
                close(source);
            } else if (e.target === overlay) {
                close('cancel');
            }
        });

        setTimeout(() => overlay.classList.add('visible'), 10);
    });
}

function showCustomConfirm(title, message, iconSvg = ICONS.HELP, options = {}) {
    const contentHtml = `<p>${message}</p>`;

    const onConfirm = (close) => close(true);
    const onCancel = (close) => close(false);

    const { promise } = createDialog(title, contentHtml, iconSvg, onConfirm, onCancel, options);
    return promise;
}

function showCustomPrompt(title, label, defaultValue = '') {
    const contentHtml = `
        <div class="prompt-input-group">
            <label for="custom-prompt-input">${label}</label>
            <input type="text" id="custom-prompt-input" value="">
        </div>
    `;

    const onConfirm = (close, dialogBox) => {
        const input = dialogBox.querySelector('#custom-prompt-input');
        close(input.value);
    };

    const onCancel = (close) => close(null);
    const { promise, dialogBox } = createDialog(title, contentHtml, ICONS.EDIT, onConfirm, onCancel);

    if (dialogBox) {
        dialogBox.classList.add('custom-prompt-box');

        const input = dialogBox.querySelector('#custom-prompt-input');
        const confirmBtn = dialogBox.querySelector('.custom-confirm-btn-confirm');

        input.value = defaultValue;
        setTimeout(() => {
            input.focus();
            input.select();
        }, 50);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmBtn.click();
            }
        });
    }
    return promise;
}

function showImageModal(imageUrl, description) {
    const existingModal = document.getElementById('image-viewer-modal');
    if (existingModal) existingModal.remove();

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'image-viewer-modal';
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.zIndex = '2000';

    const modal = document.createElement('div');
    modal.className = 'modal image-viewer-modal';
    modal.style.maxWidth = '650px';
    modal.style.maxHeight = '90vh';

    const modalHeader = document.createElement('div');
    modalHeader.className = 'modal-header';
    const headerTitle = document.createElement('h2');
    headerTitle.textContent = getToastMessage('image.viewTitle');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.innerHTML = '&times;';
    modalHeader.appendChild(headerTitle);
    modalHeader.appendChild(closeBtn);

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.textAlign = 'center';
    modalContent.style.padding = '20px';

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = description;

    const descPara = document.createElement('p');
    descPara.style.cssText = "margin-top: 15px; color: var(--secondary-text-color);";
    descPara.textContent = description;

    const actionsDiv = document.createElement('div');
    actionsDiv.style.marginTop = '15px';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-primary';
    downloadBtn.style.marginRight = '10px';
    downloadBtn.textContent = getToastMessage('image.downloadImage');

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-secondary';
    copyBtn.textContent = getToastMessage('image.copyLink');

    actionsDiv.appendChild(downloadBtn);
    actionsDiv.appendChild(copyBtn);

    modalContent.appendChild(img);
    modalContent.appendChild(descPara);
    modalContent.appendChild(actionsDiv);

    modal.appendChild(modalHeader);
    modal.appendChild(modalContent);
    modalOverlay.appendChild(modal);

    document.body.appendChild(modalOverlay);

    const closeModalInner = () => {
        if (modalOverlay.classList.contains('visible')) {
            modalOverlay.classList.remove('visible');
            setTimeout(() => {
                if (document.body.contains(modalOverlay)) {
                    document.body.removeChild(modalOverlay);
                }
            }, 200);
        }
    };

    closeBtn.addEventListener('click', closeModalInner);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModalInner();
    });
    downloadBtn.addEventListener('click', () => downloadImage(imageUrl, description));
    copyBtn.addEventListener('click', () => copyImageUrl(imageUrl));

    setTimeout(() => modalOverlay.classList.add('visible'), 50);
}

window.viewImage = showImageModal;

async function ensureStoragePermission() {
    if (Capacitor.getPlatform() !== 'android') return;

    const match = navigator.userAgent.match(/Android\s([0-9]+)/);
    const androidVersion = match ? parseInt(match[1], 10) : null;

    if (androidVersion && androidVersion >= 13) {
        try {
            const permissions = await Filesystem.checkPermissions();
            if (permissions.publicStorage !== 'granted') {
                const result = await Filesystem.requestPermissions();
                if (result.publicStorage !== 'granted') {
                    throw new Error(getToastMessage('permissions.storageRequired'));
                }
            }
        } catch (error) {
            showToast(getToastMessage('toast.storagePermissionRequired'), 'warning');
            await App.openSettings();
            throw new Error(getToastMessage('errors.permissionDenied'));
        }
        return;
    }

    let perm = await Filesystem.checkPermissions();
    if (perm.publicStorage !== 'granted') {
        perm = await Filesystem.requestPermissions();
    }

    if (perm.publicStorage !== 'granted') {
        showToast(getToastMessage('toast.grantStoragePermission'), 'error');
        throw new Error(getToastMessage('errors.permissionDenied'));
    }

    if (androidVersion && androidVersion >= 11) {
        const again = await Filesystem.requestPermissions();
        if (again.publicStorage !== 'granted') {
            showToast(getToastMessage('toast.enableAllFilesAccess'), 'warning');
            await App.openSettings();
            throw new Error(getToastMessage('errors.noAllFilesAccess'));
        }
    }
}

async function downloadImage(imageUrl, description) {
    const safeFilename = description.substring(0, 20).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_') || 'image';
    const filename = `generated_${safeFilename}_${Date.now()}.png`;

    if (isNativeApp) {
        try {
            await ensureStoragePermission();

            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const base64Data = await blobToBase64(blob);

            const MediaStore = Capacitor.Plugins.MediaStore;

            if (MediaStore) {
                await MediaStore.saveImage({
                    base64: base64Data.split(',')[1],
                    filename: filename
                });
                showToast(getToastMessage('toast.imageSavedToAlbum'), 'success');
            } else {
                await Filesystem.writeFile({
                    path: filename,
                    data: base64Data,
                    directory: Directory.Documents,
                });
                showToast(getToastMessage('toast.imageSaved'), 'success');
            }
        } catch (error) {
            showToast(`${getToastMessage('toast.downloadFailed')}: ${error.message}`, 'error');
        }
    } else {
        try {
            showToast(getToastMessage('toast.preparingDownload'), 'info');
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const link = document.createElement('a');

            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

            showToast(getToastMessage('toast.downloadSuccess'), 'success');
        } catch {
            showToast(getToastMessage('toast.downloadFailedRetry'), 'error');
        }
    }
}

function copyImageUrl(imageUrl) {
    navigator.clipboard.writeText(imageUrl).then(() => {
        showToast(getToastMessage('toast.linkCopied'), 'success');
    }).catch(() => {
        showToast(getToastMessage('toast.copyFailed'), 'error');
    });
}

function addCopyButtonToCodeBlock(preElement, codeElement) {
    // 检查是否已存在复制按钮
    if (preElement.querySelector('.copy-btn-wrapper')) {
        return;
    }

    // 确保 pre 元素有相对定位
    const computedStyle = getComputedStyle(preElement);
    if (computedStyle.position === 'static' || computedStyle.position === '' || !computedStyle.position) {
        preElement.style.position = 'relative';
    }

    // 创建复制按钮包装器
    const copyWrapper = document.createElement('div');
    copyWrapper.className = 'copy-btn-wrapper';

    // 创建复制按钮
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="${ICONS.COPY}" fill="currentColor"/>
        </svg>
        <span>${getToastMessage('ui.copy')}</span>
    `;

    // 添加点击事件
    copyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            const codeText = codeElement.textContent || codeElement.innerText;
            await navigator.clipboard.writeText(codeText);

            // 更新按钮状态
            const span = copyBtn.querySelector('span');
            const svg = copyBtn.querySelector('svg path');
            const originalText = span.textContent;
            const originalPath = svg.getAttribute('d');

            span.textContent = getToastMessage('status.copied');
            svg.setAttribute('d', ICONS.CHECK);

            // 2秒后恢复
            setTimeout(() => {
                span.textContent = originalText;
                svg.setAttribute('d', originalPath);
            }, 2000);

        } catch (err) {
            showToast(getToastMessage('toast.copyFailed'), 'error');
        }
    });

    copyWrapper.appendChild(copyBtn);
    preElement.appendChild(copyWrapper);
}

try {
    if (typeof window !== 'undefined') {
        window.addCopyButtonToCodeBlock = addCopyButtonToCodeBlock;
    }
} catch (_) { }


let currentLoadChatId = 0;
let currentUser = null;
let sessionId = localStorage.getItem('sessionId');
let chats = {};
let currentChatId = null;
let currentQuote = null;
let attachments = [];
const chatDraftStore = new Map();
const CHAT_DRAFT_DEFAULT_KEY = '__default__';
const aiOptimizedContentStore = new WeakMap();
let removeFileViewerLinkHandler = null;
let isProcessing = false;
let isSendingMessage = false;
let wasImageGenerated = false;
let isRecording = false;
let isRestoring = false;
let isImageModeActive = false;
let isSearchModeActive = false;
let isResearchModeActive = false;
let filesCurrentlyProcessing = 0;
let attachmentIdCounter = 0;
let activeResponses = new Map();
let currentVerificationEmail = null;
let isMultiSelectMode = false;
const selectedChatIds = new Set();
let backPressExitReady = false;
let backPressExitTimer = null;
let isHandlingBackNavigation = false;
let newAvatarUrl = null;
let newAvatarFile = null;
let isWaitingVerification = false;
let resetToken = null;
let guestVisitorId = null;
let originalThemeSettings = {};
let guestThemeSettings = { preset: 'light', font: 'system' };
const sidebarElementsCache = new Map();
let renderSidebarTimer = null;
let renderSidebarRequested = false;
let originalUsername = '';
let originalAvatarUrl = null;
let originalAIParameters = null;
let isWelcomePage = true;
let isLoadingParameters = false;
let lastSettingsOriginRoute = null;

// API密钥未保存提示逻辑
let originalApiKeys = { keyOne: '', keyTwo: '', mode: 'mixed' };
let apiKeysChanged = false;
let keyOneTouched = false;
let keyTwoTouched = false;
let hasParametersLoaded = false;
let charCountTimer = null;
let appReadyResolver;
const appReadyPromise = new Promise(resolve => {
    appReadyResolver = resolve;
});
let pendingMessage = null;
let lastSettingsPage = null;
let weeklyTimerInterval = null;
let weeklyFeatureStatus = { can_use: true, expires_at: null, loaded: false };

let globalCleanupFunctions = [];
let isInitializing = false;
let keyValidationCheckTimer = null;

function addGlobalCleanup(cleanupFn) {
    globalCleanupFunctions.push(cleanupFn);
}

function performGlobalCleanup() {
    globalCleanupFunctions.forEach(fn => {
        try {
            fn();
        } catch (error) {
            console.warn('Cleanup function error:', error);
        }
    });
    globalCleanupFunctions = [];
}

let aiParameters = {
    systemPrompt: '',
    temperature: 0.5,
    topK: 40,
    topP: 0.95,
    taskPreset: ''
};

class ResourceLoader {
    constructor() {
        this.coreResources = ['marked', 'hljs', 'DOMPurify', 'FingerprintJS'];
        this.optionalResources = ['mammoth', 'pdfjsLib', 'XLSX', 'pptx2html', 'turndownService'];
    }

    _areLibsLoaded(libs) {
        return libs.every(lib => typeof window[lib] !== 'undefined' && window[lib] !== null);
    }

    async _waitForLibs(libs, maxWaitTime = 10000) {
        if (this._areLibsLoaded(libs)) {
            return true;
        }

        const startTime = Date.now();
        return new Promise((resolve) => {
            const checkInterval = 100;
            const checkLoop = () => {
                if (this._areLibsLoaded(libs)) {
                    resolve(true);
                    return;
                }
                const elapsed = Date.now() - startTime;
                if (elapsed >= maxWaitTime) {
                    console.warn(`${getToastMessage('errors.waitingResourcesTimeout')}: ${libs.join(', ')}`);
                    resolve(false);
                    return;
                }
                setTimeout(checkLoop, checkInterval);
            };
            checkLoop();
        });
    }

    async waitForCoreResources() {
        return this._waitForLibs(this.coreResources);
    }

    async waitForAllResources() {
        const primaryOptional = this.optionalResources.filter(r => r !== 'turndownService');
        const primaryReady = await this._waitForLibs(primaryOptional);

        if (primaryReady) {
            return this._waitForLibs(['turndownService'], 2000);
        }
        return false;
    }
}

class SimpleCache {
    constructor() {
        this.cache = new Map();
        this.expiry = new Map();
    }

    set(key, value, ttl = 300000) {
        this.cache.set(key, value);
        this.expiry.set(key, Date.now() + ttl);
    }

    get(key) {
        if (this.expiry.get(key) < Date.now()) {
            this.cache.delete(key);
            this.expiry.delete(key);
            return null;
        }
        return this.cache.get(key);
    }
}

const simpleCache = new SimpleCache();

async function notifyBackendCacheInvalidation(operation, data = {}) {
    try {
        await fetch('/api/cache-invalidation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operation,
                data,
                timestamp: Date.now()
            })
        });
    } catch (error) {
        console.debug('Cache invalidation notification failed:', error);
    }
}


async function preloadChatContents(chatList, userId) {
    try {
        const chatIds = Object.keys(chatList);
        const batchSize = 5;

        for (let i = 0; i < chatIds.length; i += batchSize) {
            const batch = chatIds.slice(i, i + batchSize);
            const promises = batch.map(async (chatId) => {
                const chat = chatList[chatId];
                if (!chat.messages || chat.messages.length === 0) {
                    try {
                        const result = await makeApiRequest(`chats/messages?conversationId=${chatId}`);
                        if (result.success && result.messages) {
                            chat.messages = result.messages;
                        }
                    } catch (error) {
                        console.warn(`Failed to preload messages for chat ${chatId}:`, error);
                    }
                }
            });

            await Promise.allSettled(promises);

            try {
                await saveChatsToDB(userId, chatList);
            } catch (error) {
                console.warn('Failed to save preloaded chats to cache:', error);
            }

            if (i + batchSize < chatIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    } catch (error) {
        console.error('Failed to preload chat contents:', error);
    }
}

// 使用限制配置
const GUEST_LIMIT = 5;
const LOGGED_IN_LIMIT = 12;

let currentUserUsage = { count: 0, limit: LOGGED_IN_LIMIT, apiMode: 'mixed' };
let guestUsageStats = { count: 0, limit: GUEST_LIMIT, loaded: false };

// 模型配置
const models = [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', descKey: 'models.gemini25ProDesc', context_window: 1000000 },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', descKey: 'models.gemini25FlashDesc', context_window: 1000000 },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', descKey: 'models.gemini25FlashLiteDesc', context_window: 1000000 },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', descKey: 'models.gemini20FlashDesc', context_window: 30000 },
];
let currentModelId = models[0].id;
let userSelectedModelId = models[0].id;

function getAvailableModels() {
    if (currentUser) {
        return models;
    }
    const hasGuestKey = !!getCustomApiKey();
    return hasGuestKey ? models : models.filter(model => model.id !== 'gemini-2.5-pro');
}

// 模型渲染速度配置
const modelRenderSpeeds = {
    'gemini-2.5-pro': 1,
    'gemini-2.5-flash': 1.4,
    'gemini-2.5-flash-lite': 2.5,
    'gemini-2.0-flash': 3
};

function composeSystemPrompt(userPrompt = '') {
    const parts = [];
    const trimmed = (userPrompt || '').trim();
    if (trimmed) {
        parts.push(trimmed);
    }

    parts.push(ROLE_INSTRUCTION);
    parts.push(FORMAT_INSTRUCTION);
    return parts.filter(Boolean).join('\n\n');
}

// DOM元素引用
const elements = {};

function populateElements() {
    elements.authOverlay = document.getElementById('auth-overlay');
    elements.loginForm = document.getElementById('login-form');
    elements.registerForm = document.getElementById('register-form');
    elements.mfaForm = document.getElementById('mfa-verification-form');
    elements.mfaCodeInput = document.getElementById('mfa-verification-code');
    elements.mfaMethodButtons = document.querySelectorAll('[data-mfa-method]');
    elements.mfaBackButton = document.getElementById('mfa-back-to-login');
    elements.mfaDescription = document.getElementById('mfa-method-description');
    elements.guestContinue = document.getElementById('guest-continue');
    elements.fileViewerOverlay = document.getElementById('file-viewer-overlay');
    elements.fileViewerCode = document.getElementById('file-viewer-code');
    elements.fileViewerFilename = document.getElementById('file-viewer-filename');
    elements.settingsModal = document.getElementById('settings-modal-overlay');
    elements.sidebar = document.getElementById('sidebar');
    elements.newChatBtn = document.getElementById('new-chat-btn');
    elements.chatHistoryList = document.getElementById('chat-history');
    elements.chatContainer = document.getElementById('chat-container');
    elements.messageInput = document.getElementById('message-input');
    elements.sendButton = document.getElementById('send-button');
    elements.fileInput = document.getElementById('file-input');
    elements.attachmentsPreview = document.getElementById('attachments-preview');
    elements.quotePreviewContainer = document.getElementById('quote-preview-container');
    elements.toolsMenuBtn = document.getElementById('tools-menu-btn');
    elements.toolsMenu = document.getElementById('tools-menu');
    elements.toolSearchOption = document.getElementById('tool-search-option');
    elements.toolImageOption = document.getElementById('tool-image-option');
    elements.toolResearchOption = document.getElementById('tool-research-option');
    elements.voiceBtn = document.getElementById('voice-btn');
    elements.modelSelectBtn = document.getElementById('model-select-btn');
    elements.selectedModelName = document.getElementById('selected-model-name');
    elements.modelSelectMenu = document.getElementById('model-select-menu');
    elements.userNameDisplay = document.getElementById('user-name-display-main');
    elements.userInfoPopover = document.getElementById('user-info-popover');
    elements.authContainer = document.getElementById('auth-container-inner');
    elements.customLoginBtn = document.getElementById('custom-login-btn');
    elements.settingsBtn = document.getElementById('settings-btn');
    elements.apiKeyInput = document.getElementById('api-key-input');
    elements.apiKeyOneInput = document.getElementById('api-key-one');
    elements.apiKeyTwoInput = document.getElementById('api-key-two');
    elements.apiKeyStatus = document.getElementById('api-key-status');
    elements.accountInfo = document.getElementById('account-info');
    elements.usageStats = document.getElementById('usage-stats');
    elements.usageDisplay = document.getElementById('usage-display');
    elements.settingsSaveBtn = document.getElementById('settings-save-btn');
    elements.logoutBtn = document.getElementById('logout-btn');
    elements.limitModalOverlay = document.getElementById('limit-modal-overlay');
    elements.limitModalTitle = document.getElementById('limit-modal-title');
    elements.limitModalText = document.getElementById('limit-modal-text');
    elements.limitLoginBtn = document.getElementById('limit-login-btn');
    elements.rightSidebar = document.getElementById('right-sidebar');
    elements.rightSidebarToggleBtn = document.getElementById('right-sidebar-toggle-btn');
    elements.systemPrompt = document.getElementById('system-prompt');
    elements.systemPromptCounter = document.getElementById('system-prompt-counter');
    elements.temperatureSlider = document.getElementById('temperature-slider');
    elements.temperatureValue = document.getElementById('temperature-value');
    elements.topKInput = document.getElementById('top-k-input');
    elements.topPInput = document.getElementById('top-p-input');
    elements.saveSettingsBtn = document.getElementById('save-settings-btn');
    elements.cancelSettingsBtn = document.getElementById('cancel-settings-btn');
    elements.weeklyTimerDisplay = document.getElementById('weekly-timer-display');
    elements.editUsernameInput = document.getElementById('edit-username');
    elements.themeSettingsPage = document.getElementById('theme-settings-page');
    elements.fontDropdown = document.getElementById('font-dropdown');
    elements.fontTrigger = document.getElementById('font-trigger');
    elements.fontMenu = document.getElementById('font-menu');
    elements.chatLoaderBar = document.getElementById('chat-loader-bar');
    elements.themePresetSelector = document.getElementById('theme-preset-selector');
    elements.taskPresetDropdown = document.getElementById('task-preset-dropdown');
    elements.taskPresetTrigger = document.getElementById('task-preset-trigger');
    elements.taskPresetMenu = document.getElementById('task-preset-menu');
}

// 语音识别设置
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let noSpeechTimeout;
let originalPlaceholder = '';
const cleanupRecognition = () => {
    if (noSpeechTimeout) {
        clearTimeout(noSpeechTimeout);
    }
    if (!isRecording) return;

    isRecording = false;
    elements.voiceBtn.classList.remove('recording');
    elements.messageInput.classList.remove('recording');
    elements.messageInput.placeholder = originalPlaceholder;
};

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = getCurrentLanguage();
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onspeechstart = () => {
        if (noSpeechTimeout) {
            clearTimeout(noSpeechTimeout);
        }
    };

    recognition.onresult = (event) => {
        elements.messageInput.value = event.results[0][0].transcript;
        // 触发input事件以调整输入框高度
        elements.messageInput.dispatchEvent(new Event('input'));
        updateSendButton();
        cleanupRecognition();
    };

    recognition.onerror = (event) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
            let errorMessage = getToastMessage('errors.voiceRecognitionUnknown');
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                errorMessage = getToastMessage('errors.microphoneNotAllowed');
            } else if (event.error === 'network') {
                errorMessage = getToastMessage('errors.voiceRecognitionNetwork');
            }
            showToast(errorMessage, 'error');
        }
        cleanupRecognition();
    };
}

// 工具函数
const FONT_MAP = {
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI", "Segoe UI Symbol"',
    serif: 'Georgia, "Times New Roman", Times, serif',
    monospace: '"Fira Code", "Source Code Pro", "Courier New", monospace',
    cursive_kai: '"Kaiti SC", "KaiTi", "STKaiti", "BiauKai", "DFKai-SB", serif'
};

async function applyTheme(themeSettings) {
    if (!themeSettings) {
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.style.setProperty('--app-font-family', FONT_MAP['system']);
        return;
    };

    const { font, preset } = themeSettings;

    document.documentElement.style.setProperty('--chat-area-background', 'var(--main-bg)');
    document.documentElement.setAttribute('data-theme', preset || 'light');

    // 应用字体
    const fontFamily = FONT_MAP[font] || FONT_MAP['system'];
    document.documentElement.style.setProperty('--app-font-family', fontFamily);

    if (font && font !== 'system') {
        try {
            await document.fonts.ready;
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.warn('Font loading check failed:', error);
        }
    }
}

const LOCAL_THEME_OVERRIDE_WINDOW = 90 * 1000;

async function applyUserPreferencesFromProfile(user, options = {}) {
    if (!user || typeof user !== 'object') {
        return;
    }

    const {
        forceApplyTheme = false,
        forceApplyLanguage = false,
        respectRecentLocalTheme = true
    } = options;

    const themeSettings = user.theme_settings;
    if (themeSettings) {
        try {
            const serverThemeStr = JSON.stringify(themeSettings);
            const localThemeStr = localStorage.getItem('userThemeSettings');
            const updatedAtRaw = localStorage.getItem('userThemeSettingsUpdatedAt');
            const updatedAt = updatedAtRaw ? Number(updatedAtRaw) : 0;

            const withinLocalWindow = respectRecentLocalTheme && updatedAt > 0
                && (Date.now() - updatedAt) < LOCAL_THEME_OVERRIDE_WINDOW;

            const shouldApply = forceApplyTheme ||
                (withinLocalWindow && localThemeStr !== serverThemeStr) ||
                (!withinLocalWindow && localThemeStr !== serverThemeStr);

            if (shouldApply) {
                await applyTheme(themeSettings);
                localStorage.setItem('userThemeSettings', serverThemeStr);
                if (themeSettings.preset) {
                    localStorage.setItem('userThemePreset', themeSettings.preset);
                }
                localStorage.removeItem('userThemeSettingsUpdatedAt');
            } else if (localThemeStr === serverThemeStr) {
                localStorage.removeItem('userThemeSettingsUpdatedAt');
            }
        } catch (error) {
            console.warn('Failed to apply user theme settings:', error);
        }
    }

    if (user.language) {
        try {
            const currentLang = getCurrentLanguage();
            if (forceApplyLanguage || currentLang !== user.language) {
                await applyLanguage(user.language);
            }
            localStorage.setItem('selectedLanguage', user.language);
        } catch (error) {
            console.warn('Failed to apply user language setting:', error);
        }
    }
}

function estimateTokens(content) {
    if (!content) return 0;

    let text = '';
    if (typeof content === 'string') {
        text = content;
    } else if (Array.isArray(content)) {
        text = content.map(p => {
            if (p.type === 'text') return p.text || '';
            if (p.type === 'file') return p.content || '';
            return '';
        }).join(' ');
    }

    if (!text) return 0;

    let tokenCount = 0;

    const cjkRegex = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g;
    const cjkChars = text.match(cjkRegex) || [];
    tokenCount += cjkChars.length * 2;

    const nonCjkText = text.replace(cjkRegex, ' ');
    const words = nonCjkText.match(/[\w']+|\S/g) || [];
    tokenCount += Math.ceil(words.length * 1.0);

    return tokenCount;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function forceBlur() {
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
}

let isPageVisible = true;
let backgroundNotificationShown = false;
let backgroundTasks = new Set();
let backgroundTaskQueue = [];
let isProcessingBackgroundTasks = false;

function addBackgroundTask(taskId, taskFunction, priority = 'normal') {
    const task = {
        id: taskId,
        function: taskFunction,
        priority: priority,
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: 3
    };

    backgroundTasks.add(taskId);
    backgroundTaskQueue.push(task);

    backgroundTaskQueue.sort((a, b) => {
        const priorityOrder = { 'high': 0, 'normal': 1, 'low': 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    processBackgroundTasks();
}

function removeBackgroundTask(taskId) {
    backgroundTasks.delete(taskId);
    backgroundTaskQueue = backgroundTaskQueue.filter(task => task.id !== taskId);
}

async function processBackgroundTasks() {
    if (isProcessingBackgroundTasks || backgroundTaskQueue.length === 0) {
        return;
    }

    isProcessingBackgroundTasks = true;

    while (backgroundTaskQueue.length > 0) {
        const task = backgroundTaskQueue.shift();

        try {
            await task.function();
            removeBackgroundTask(task.id);
        } catch (error) {
            task.retryCount++;
            if (task.retryCount < task.maxRetries) {
                setTimeout(() => {
                    backgroundTaskQueue.push(task);
                    processBackgroundTasks();
                }, Math.pow(2, task.retryCount) * 1000);
            } else {
                removeBackgroundTask(task.id);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    isProcessingBackgroundTasks = false;
}

function setupBackgroundProcessing() {
    if (isNativeApp && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(err => { });
    }

    document.addEventListener('visibilitychange', () => {
        const wasVisible = isPageVisible;
        isPageVisible = !document.hidden;

        if (isPageVisible && !wasVisible) {
            if (isProcessing) {
                if (globalContentDiv) {
                    try {
                        if (globalBackgroundBuffer) {
                            globalDisplayBuffer += globalBackgroundBuffer;
                            globalBackgroundBuffer = '';
                        }

                        if (globalCharQueue.length > 0) {
                            const remainingChars = globalCharQueue.splice(0, globalCharQueue.length).join('');
                            globalDisplayBuffer += remainingChars;
                        }

                        renderMessageContent(globalContentDiv, globalDisplayBuffer);

                        if (!userHasScrolledUp) {
                            setTimeout(() => {
                                elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
                            }, 10);
                        }
                    } catch (error) {
                        console.error('Background buffer render error:', error);
                    }
                }
            }
        }

        if (isNativeApp && !isPageVisible && isProcessing && !backgroundNotificationShown) {
            backgroundNotificationShown = true;
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(getToastMessage('status.backgroundProcessing'), {
                    body: getToastMessage('status.backgroundProcessingMessage'),
                    icon: '/images/pwa-192x192.png',
                    silent: true
                });
            }
        }

        if (isPageVisible && backgroundNotificationShown) {
            backgroundNotificationShown = false;
        }


    });

    window.addEventListener('beforeunload', (e) => {
        performGlobalCleanup();
        const hasActiveProcessing = isProcessing || (currentChatId && activeResponses.has(currentChatId));

        if (hasActiveProcessing) {
            const message = getToastMessage('dialog.aiGeneratingWarning');
            e.preventDefault();
            return message;
        }


        if (backgroundTaskQueue.length > 0) {
            localStorage.setItem('pending_background_tasks', JSON.stringify(backgroundTaskQueue.map(task => ({
                id: task.id,
                priority: task.priority,
                timestamp: task.timestamp,
                retryCount: task.retryCount
            }))));
        }

        for (const [chatId, responseData] of activeResponses) {
            if (responseData.controller) {
                responseData.controller.abort();
            }
        }
        activeResponses.clear();
    });
}

function enterMultiSelectMode() {
    isMultiSelectMode = true;
    selectedChatIds.clear();
    elements.chatHistoryList.classList.add('multi-select-active');

    document.getElementById('delete-all-chats-btn').style.display = 'none';
    document.getElementById('clear-cache-btn').style.display = 'none';
    document.getElementById('multi-select-actions').style.display = 'flex';
    document.getElementById('delete-selected-btn').textContent = `${getToastMessage('fileManagement.deleteSelected')} (0)`;
}

function exitMultiSelectMode() {
    if (!isMultiSelectMode) return;
    isMultiSelectMode = false;
    elements.chatHistoryList.classList.remove('multi-select-active');

    document.getElementById('delete-all-chats-btn').style.display = 'flex';
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) {
        clearCacheBtn.style.display = 'flex';
    }
    document.getElementById('multi-select-actions').style.display = 'none';

    elements.chatHistoryList.querySelectorAll('.history-item-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });
    selectedChatIds.clear();
    resetBackPressExitState();
}


function queueLoginSuccessToast(toastKey, options = {}) {
    pendingLoginSuccessToastKey = toastKey || null;
    const hasRouteOption = Object.prototype.hasOwnProperty.call(options, 'route');
    const desiredRoute = hasRouteOption ? options.route : 'home';
    pendingLoginSuccessToastRoute = desiredRoute === undefined ? 'home' : desiredRoute;

    if (!pendingLoginSuccessToastKey) {
        pendingLoginSuccessToastRoute = 'home';
        return;
    }

    if (pendingLoginSuccessToastRoute === null) {
        showToast(getToastMessage(pendingLoginSuccessToastKey), 'success');
        pendingLoginSuccessToastKey = null;
        pendingLoginSuccessToastRoute = 'home';
        return;
    }

    const currentRoute = router?.getCurrentRoute?.();
    if (currentRoute) {
        maybeShowPendingLoginSuccessToast(currentRoute.name);
    }
}

function maybeShowPendingLoginSuccessToast(routeName) {
    if (!pendingLoginSuccessToastKey) {
        return;
    }
    if (pendingLoginSuccessToastRoute === null || routeName === pendingLoginSuccessToastRoute) {
        showToast(getToastMessage(pendingLoginSuccessToastKey), 'success');
        pendingLoginSuccessToastKey = null;
        pendingLoginSuccessToastRoute = 'home';
    }
}

function showLoadingScreen(customText = null) {
    const loadingScreen = document.getElementById('loading-screen');
    const appContainer = document.querySelector('.app-container');
    if (!loadingScreen) return;

    const textElement = loadingScreen.querySelector('.loading-text');
    if (textElement && loadingScreenDefaultText === null) {
        loadingScreenDefaultText = textElement.textContent || '';
    }
    if (textElement) {
        if (typeof customText === 'string' && customText) {
            textElement.textContent = customText;
        } else if (loadingScreenDefaultText !== null) {
            textElement.textContent = loadingScreenDefaultText;
        }
    }

    requestAnimationFrame(() => {
        loadingScreen.classList.remove('hidden');
        loadingScreen.setAttribute('aria-hidden', 'false');
    });

    if (appContainer) {
        requestAnimationFrame(() => {
            appContainer.classList.remove('loaded');
        });
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const appContainer = document.querySelector('.app-container');

    if (loadingScreen) {
        requestAnimationFrame(() => {
            loadingScreen.classList.add('hidden');
            loadingScreen.setAttribute('aria-hidden', 'true');
        });
    }

    if (appContainer) {
        requestAnimationFrame(() => {
            appContainer.classList.add('loaded');
        });
    }
}

async function getGuestVisitorId() {
    if (guestVisitorId) return guestVisitorId;

    try {
        if (window.FingerprintJS) {
            const fp = await FingerprintJS.load();
            const result = await fp.get();
            guestVisitorId = result.visitorId;
            return guestVisitorId;
        }
    } catch (error) {
        console.error(getToastMessage('console.fingerprintError') + ':', error);
    }

    return 'fingerprint_unavailable';
}

async function syncNativeAppVersionDisplay(targetElement = null) {
    if (!isNativeApp || typeof App?.getInfo !== 'function') {
        return null;
    }

    if (!nativeVersionSyncInFlight) {
        nativeVersionSyncInFlight = (async () => {
            try {
                const info = await App.getInfo();
                const version = info?.version || info?.build || null;
                if (version) {
                    localStorage.setItem('apk_version', version);
                }
                return version;
            } catch (error) {
                console.warn('Failed to sync native app version info:', error);
                return null;
            }
        })();
    }

    const pendingSync = nativeVersionSyncInFlight;
    const resolvedVersion = await pendingSync;

    if (resolvedVersion) {
        const target = targetElement || document.getElementById('current-version');
        if (target) {
            target.textContent = `v${resolvedVersion}`;
        }
    }

    if (nativeVersionSyncInFlight === pendingSync) {
        nativeVersionSyncInFlight = null;
    }

    return resolvedVersion;
}

function requestAutoVersionCheck() {
    if (!autoVersionCheckPromise) {
        autoVersionCheckPromise = autoCheckVersionUpdate()
            .finally(() => {
                autoVersionCheckPromise = null;
            });
    }
    return autoVersionCheckPromise;
}

function setupAppStateVersionCheck() {
    if (!isNativeApp || appStateVersionListenerAttached || typeof App?.addListener !== 'function') {
        return;
    }
    appStateVersionListenerAttached = true;
    App.addListener('appStateChange', (state) => {
        if (state?.isActive) {
            syncNativeAppVersionDisplay();
            requestAutoVersionCheck();
        }
    });
}

async function updateAboutPageUI() {
    const currentVersionEl = document.getElementById('current-version');
    if (currentVersionEl) {
        if (isNativeApp) {
            const syncedVersion = await syncNativeAppVersionDisplay(currentVersionEl);
            if (syncedVersion) {
                return;
            }
            const apkVersion = localStorage.getItem('apk_version');
            if (apkVersion) {
                currentVersionEl.textContent = `v${apkVersion}`;
            } else {
                try {
                    const response = await fetch('/downloads/');
                    if (response.ok) {
                        const html = await response.text();
                        const match = html.match(/LittleAIBox_v([\d.]+)\.apk/);
                        if (match) {
                            const version = match[1];
                            localStorage.setItem('apk_version', version);
                            currentVersionEl.textContent = `v${version}`;
                        } else {
                            currentVersionEl.textContent = 'v?.?.?';
                        }
                    } else {
                        currentVersionEl.textContent = 'v?.?.?';
                    }
                } catch (error) {
                    currentVersionEl.textContent = 'v?.?.?';
                }
            }
        } else {
            const savedVersion = localStorage.getItem('app_version');
            if (savedVersion) {
                currentVersionEl.textContent = `v${savedVersion}`;
            } else {
                try {
                    const response = await fetch('/manifest.json');
                    if (response.ok) {
                        const manifest = await response.json();
                        if (manifest.version) {
                            localStorage.setItem('app_version', manifest.version);
                            currentVersionEl.textContent = `v${manifest.version}`;
                        } else {
                            currentVersionEl.textContent = 'v?.?.?';
                        }
                    } else {
                        currentVersionEl.textContent = 'v?.?.?';
                    }
                } catch (error) {
                    currentVersionEl.textContent = 'v?.?.?';
                }
            }
        }
    }
}

async function autoCheckVersionUpdate() {
    try {
        if (isNativeApp) {
            await checkApkUpdate();
        } else {
            await checkVersionUpdate(false);
        }
    } catch (error) {
        console.warn('Auto version check failed:', error);
    }
}

async function checkVersionUpdate(showToastIfLatest = false) {
    try {
        let serverVersion, currentVersion;

        if (isNativeApp) {
            const response = await fetch('/downloads/');
            if (response.ok) {
                const html = await response.text();
                const match = html.match(/LittleAIBox_v([\d.]+)\.apk/);
                if (match) {
                    serverVersion = match[1];
                    const localApkVersion = localStorage.getItem('apk_version');
                    if (!localApkVersion) {
                        localStorage.setItem('apk_version', serverVersion);
                        currentVersion = serverVersion;
                    } else {
                        currentVersion = localApkVersion;
                    }
                }
            }
        } else {
            currentVersion = localStorage.getItem('app_version');

            const manifestResponse = await fetch('/manifest.json?t=' + Date.now(), { cache: 'no-cache' });
            if (manifestResponse.ok) {
                const manifest = await manifestResponse.json();
                if (manifest.version) {
                    serverVersion = manifest.version;

                    if (!currentVersion) {
                        localStorage.setItem('app_version', serverVersion);
                        currentVersion = serverVersion;
                    }
                }
            }
        }

        if (serverVersion && currentVersion && serverVersion !== currentVersion) {
            showVersionUpdateNotification();
            showUpdateNowButton(serverVersion);
            return true;
        } else {
            hideVersionUpdateNotification();
            hideUpdateNowButton();
            if (showToastIfLatest) {
                showToast(getToastMessage('version.alreadyLatest'), 'success');
            }
            return false;
        }
    } catch (error) {
        hideVersionUpdateNotification();
        hideUpdateNowButton();
        return false;
    }
}

function showVersionUpdateNotification() {
    const aboutBadge = document.getElementById('about-update-badge');
    const settingsText = document.getElementById('settings-text');

    if (aboutBadge) {
        aboutBadge.style.display = 'inline-block';
    }

    if (settingsText) {
        settingsText.style.color = '#ef4444';
    }
}

function hideVersionUpdateNotification() {
    const aboutBadge = document.getElementById('about-update-badge');
    const settingsText = document.getElementById('settings-text');


    if (settingsText) {
        settingsText.style.color = '';
    }
}

function markVersionUpdateAsSeen() {
    const settingsText = document.getElementById('settings-text');

    if (settingsText) {
        settingsText.style.color = '';
    }
}

async function checkApkUpdate() {
    if (!isNativeApp) return;

    try {
        const response = await fetch('/downloads/');
        if (!response.ok) return;

        const html = await response.text();
        const match = html.match(/LittleAIBox_v([\d.]+)\.apk/);

        if (match) {
            const serverApkVersion = match[1];
            const localApkVersion = localStorage.getItem('apk_version');

            if (localApkVersion && serverApkVersion !== localApkVersion) {
                showVersionUpdateNotification();
                showUpdateNowButton(serverApkVersion);

                const hasPermission = await LocalNotifications.checkPermissions();
                if (hasPermission.display === 'granted') {
                    await LocalNotifications.schedule({
                        notifications: [{
                            title: getToastMessage('apk.updateTitle'),
                            body: getToastMessage('apk.updateMessage', { version: serverApkVersion }),
                            id: 1,
                            schedule: { at: new Date(Date.now() + 1000) },
                            sound: null,
                            attachments: null,
                            actionTypeId: '',
                            extra: { apkVersion: serverApkVersion }
                        }]
                    });
                }
            } else if (localApkVersion === serverApkVersion) {
                hideVersionUpdateNotification();
                hideUpdateNowButton();
            }

            if (!localApkVersion) {
                localStorage.setItem('apk_version', serverApkVersion);
            }
        }
    } catch (error) {
        console.error('Check APK update failed:', error);
    }
}

async function checkForUpdates() {
    const checkBtn = document.getElementById('check-update-btn');
    if (!checkBtn) return;

    const originalText = checkBtn.innerHTML;
    checkBtn.disabled = true;
    checkBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="margin-right: 8px; animation: spin 1s linear infinite;"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg><span>${getToastMessage('version.checking')}</span>`;

    try {
        let serverVersion, localVersion;

        if (isNativeApp) {
            const response = await fetch('/downloads/');
            if (response.ok) {
                const html = await response.text();
                const match = html.match(/LittleAIBox_v([\d.]+)\.apk/);
                if (match) {
                    serverVersion = match[1];
                    localVersion = localStorage.getItem('apk_version');

                    if (!localVersion) {
                        localStorage.setItem('apk_version', serverVersion);
                        localVersion = serverVersion;
                    }
                }
            }
        } else {
            localVersion = localStorage.getItem('app_version');

            const manifestResponse = await fetch('/manifest.json?t=' + Date.now(), { cache: 'no-cache' });
            if (manifestResponse.ok) {
                const manifest = await manifestResponse.json();
                if (manifest.version) {
                    serverVersion = manifest.version;

                    if (!localVersion) {
                        localStorage.setItem('app_version', serverVersion);
                        localVersion = serverVersion;
                    }
                }
            }
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        if (serverVersion && serverVersion !== localVersion) {
            checkBtn.innerHTML = originalText;
            checkBtn.disabled = false;

            showVersionUpdateNotification();
            showUpdateNowButton(serverVersion);
            showToast(getToastMessage('version.newVersionDetected', { version: serverVersion }), 'info');
        } else {
            checkBtn.disabled = false;
            checkBtn.innerHTML = originalText;
            hideUpdateNowButton();
            hideVersionUpdateNotification();
            showToast(getToastMessage('version.alreadyLatest'), 'success');
        }
    } catch (error) {
        checkBtn.disabled = false;
        checkBtn.innerHTML = originalText;
        hideUpdateNowButton();
        hideVersionUpdateNotification();
        showToast(getToastMessage('version.updateFailed'), 'error');
    }
}

function getUpdateElements() {
    const updateNowBtn = document.getElementById('update-now-btn');
    const checkBtn = document.getElementById('check-update-btn');
    const updateNotice = document.getElementById('version-update-notice');
    const updateNoticeText = document.getElementById('version-update-notice-text');

    return { updateNowBtn, checkBtn, updateNotice, updateNoticeText };
}

function showUpdateNowButton(version) {
    const { updateNowBtn, checkBtn, updateNotice, updateNoticeText } = getUpdateElements();

    if (updateNowBtn) {
        updateNowBtn.style.display = 'inline-flex';
        updateNowBtn.dataset.version = version;
        const span = updateNowBtn.querySelector('span[data-i18n-key="version.updateNow"]');
        if (span) {
            span.textContent = getToastMessage('version.updateNow');
        }
    }

    if (checkBtn) {
        checkBtn.style.display = 'none';
    }

    if (updateNotice && updateNoticeText) {
        updateNoticeText.textContent = getToastMessage('version.newVersionAvailable', { version });
        updateNotice.style.display = 'flex';
    }
}

function hideUpdateNowButton() {
    const { updateNowBtn, checkBtn, updateNotice } = getUpdateElements();

    if (updateNowBtn) {
        updateNowBtn.style.display = 'none';
        delete updateNowBtn.dataset.version;
    }

    if (checkBtn) {
        checkBtn.style.display = 'inline-flex';
    }

    if (updateNotice) {
        updateNotice.style.display = 'none';
    }
}

async function performUpdate() {
    const { updateNowBtn } = getUpdateElements();
    const version = updateNowBtn?.dataset.version || 'latest';

    if (isNativeApp) {
        await downloadAndInstallApk(version);
    } else {
        const confirmed = await showCustomConfirm(
            getToastMessage('version.updateAvailable'),
            getToastMessage('version.updateConfirmMessage', { version }),
            `<svg viewBox="0 0 24 24" style="width: 48px; height: 48px; fill: var(--primary-color);"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`,
            {
                manageHistory: false,
                confirmText: getToastMessage('version.updateNow'),
                cancelText: getToastMessage('version.later')
            }
        );

        if (confirmed) {
            await clearCacheAndReload();
        }
    }
}

async function unregisterServiceWorkers() {
    try {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(registration => registration.unregister()));
        }
    } catch (error) {
        console.warn('Failed to unregister service workers:', error);
    }
}

async function clearCachesAndSettings(excludeCacheKeys = []) {
    await Promise.all([
        (async () => {
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                const targets = excludeCacheKeys.length
                    ? cacheNames.filter(name => !excludeCacheKeys.includes(name))
                    : cacheNames;
                await Promise.all(targets.map(name => caches.delete(name)));
            }
        })(),
        (async () => {
            try {
                await saveSettingsToDB('app_settings', null);
            } catch (error) {
                console.error('Failed to clear settings backup:', error);
            }
        })()
    ]);
}

async function ensureStoragePersistence() {
    try {
        if (!('storage' in navigator)) {
            return;
        }

        const storage = navigator.storage;

        if (typeof storage.persist === 'function') {
            const persisted = await storage.persist();
            if (persisted) {
                return;
            }
        }

        if (typeof storage.persisted === 'function') {
            const alreadyPersisted = await storage.persisted();
            if (alreadyPersisted) {
                return;
            }
        }

        if (typeof storage.estimate === 'function') {
            try {
                const estimate = await storage.estimate();
                if (estimate?.quota && estimate.quota > 0) {
                    return;
                }
            } catch (_) {
                // 忽略配额估算错误
            }
        }

        if (Filesystem && typeof Filesystem.requestPermissions === 'function') {
            await Filesystem.requestPermissions();
        }
    } catch (error) {
        // 静默失败，不影响主要功能
    }
}

async function ensureNotificationPermission() {
    if (!isNativeApp || !LocalNotifications) {
        return;
    }
    try {
        const status = await LocalNotifications.checkPermissions();
        if (status?.display === 'granted') {
            return;
        }
        await LocalNotifications.requestPermissions();
    } catch (error) {
        console.warn('Failed to ensure notification permission:', error);
    }
}

async function clearCacheAndReload() {
    const { updateNowBtn } = getUpdateElements();
    const version = updateNowBtn?.dataset.version || 'latest';

    hideUpdateNowButton();
    hideVersionUpdateNotification();

    const toastCtrl = showToast(getToastMessage('version.updating'), 'success');

    await Promise.all([
        clearCachesAndSettings(),
        (async () => {
            if (currentUser) {
                await deleteChatsFromDB(currentUser.id);
            }
        })(),
        (async () => {
            try {
                await clearTranslationCache();
            } catch (error) {
                console.error('Failed to clear translation cache:', error);
            }
        })(),

        // Android平台额外清理
        (async () => {
            if (isNativeApp && Capacitor.getPlatform() === 'android') {
                await unregisterServiceWorkers();
            }
        })()
    ]);

    const keysToKeep = [
        'sessionId',
        'currentLang',
        'seenPrivacyPolicyVersion',
        'selectedLanguage',
        'userThemeSettings',
        'userThemePreset',
        'userThemeSettingsUpdatedAt'
    ];

    if (sessionId) {
        keysToKeep.push(`user_cache_${sessionId}`);
    }

    Object.keys(localStorage).forEach(key => {
        if (!keysToKeep.includes(key)) {
            localStorage.removeItem(key);
        }
    });

    localStorage.setItem('app_version', version);
    if (currentUser) {
        localStorage.setItem('forceServerChatsReload', '1');
    } else {
        localStorage.removeItem('forceServerChatsReload');
    }
    chats = {};
    currentChatId = null;

    const currentLang = localStorage.getItem('selectedLanguage');
    if (currentLang) {
        localStorage.setItem('forceReloadLanguage', 'true');
    }

    try {
        await toastCtrl.whenShown;
    } catch (_) { }

    await new Promise(r => setTimeout(r, 300));
    try { location.reload(true); } catch (_) { location.reload(); }
}

function resolveApkDownloadUrl(relativePath) {
    if (!relativePath) return '';
    if (/^https?:/i.test(relativePath)) {
        return relativePath;
    }
    const base = API_BASE_URL || window.location.origin;
    try {
        return new URL(relativePath, base || window.location.origin).href;
    } catch (_) {
        return `${base}${relativePath}`;
    }
}

async function openApkInBrowser(relativePath) {
    const absoluteUrl = resolveApkDownloadUrl(relativePath);
    if (!absoluteUrl) return false;

    const openViaBrowserPlugin = async () => {
        if (Capacitor.isPluginAvailable('Browser')) {
            await Browser.open({
                url: absoluteUrl,
                presentationStyle: 'popover'
            });
            return true;
        }
        return false;
    };

    try {
        const opened = await openViaBrowserPlugin();
        if (opened) return true;
    } catch (browserError) {
        console.warn('Browser plugin open failed:', browserError);
    }

    try {
        const link = document.createElement('a');
        link.href = absoluteUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
    } catch (linkError) {
        console.warn('Anchor fallback failed:', linkError);
    }

    try {
        window.open(absoluteUrl, '_blank', 'noopener');
        return true;
    } catch (openError) {
        console.warn('window.open fallback failed:', openError);
    }

    try {
        window.location.href = absoluteUrl;
        return true;
    } catch (_) {
        return false;
    }
}

async function downloadAndInstallApk(version) {
    try {
        showToast(getToastMessage('apk.downloadingUpdate', { version }), 'info');

        const apkUrl = `/downloads/LittleAIBox_v${version}.apk`;
        let browserFallbackShown = false;
        const triggerBrowserFallback = async () => {
            if (!browserFallbackShown) {
                browserFallbackShown = true;
                showToast(getToastMessage('apk.openInBrowser'), 'info');
            }
            const opened = await openApkInBrowser(apkUrl);
            if (!opened) {
                showToast(getToastMessage('apk.updateFailed'), 'error');
            }
            return opened;
        };

        const canUseNativeInstaller = (
            isNativeApp &&
            Capacitor.getPlatform() === 'android' &&
            ApkInstaller &&
            typeof ApkInstaller.installApk === 'function'
        );

        if (!canUseNativeInstaller) {
            await triggerBrowserFallback();
            return;
        }

        const response = await fetch(apkUrl);

        if (!response.ok) {
            throw new Error('Download failed');
        }

        const blob = await response.blob();
        const base64Data = await blobToBase64(blob);

        const fileName = `LittleAIBox_v${version}.apk`;
        const savedFile = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache
        });

        const fileUri = savedFile.uri;
        const contentUrl = Capacitor.convertFileSrc(fileUri);
        let installUrl = contentUrl;

        if (Capacitor.getPlatform() === 'android' && typeof Filesystem.getUri === 'function') {
            try {
                const { uri } = await Filesystem.getUri({
                    path: fileName,
                    directory: Directory.Cache
                });
                if (uri) {
                    installUrl = uri;
                }
            } catch (resolveUriError) {
                console.warn('Failed to resolve native APK URI, falling back to web URI:', resolveUriError);
            }
        }

        hideUpdateNowButton();
        hideVersionUpdateNotification();

        await clearCachesAndSettings();

        let installerOpened = false;

        if (Capacitor.getPlatform() === 'android' && ApkInstaller) {
            try {
                await ApkInstaller.installApk({
                    fileUri,
                    contentUri: installUrl
                });
                installerOpened = true;
            } catch (nativeInstallError) {
                console.warn('ApkInstaller plugin failed, falling back to App.openUrl:', nativeInstallError);
            }
        }

        if (!installerOpened) {
            try {
                const result = await App.openUrl({ url: installUrl });
                installerOpened = typeof (result?.completed) === 'boolean' ? result.completed : true;
            } catch (openIntentError) {
                console.warn('Opening APK installer via App.openUrl failed:', openIntentError);
            }
        }

        if (!installerOpened) {
            await triggerBrowserFallback();
            return;
        }

        localStorage.setItem('apk_version', version);

        // 更新设置备份中的版本信息
        backupImportantSettings().catch(error => {
            console.error('Failed to backup settings after APK update:', error);
        });

        showToast(getToastMessage('apk.installPrompt'), 'success');
    } catch (error) {
        showToast(getToastMessage('apk.updateFailed'), 'error');
    }
}

async function readDocxFile(file) {
    await loadScript('/libs/mammoth.browser.min.js', 'mammoth');

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (event) {
            mammoth.convertToHtml({ arrayBuffer: event.target.result })
                .then(result => {
                    resolve(result.value);
                })
                .catch(reject);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function readPdfFile(file) {
    await loadScript('/libs/pdf.min.js', 'pdfjsLib');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/libs/pdf.worker.min.js';

    const reader = new FileReader();
    return new Promise((resolve, reject) => {
        reader.onload = async function (event) {
            try {
                const loadingTask = pdfjsLib.getDocument({
                    data: event.target.result,
                    cMapUrl: '/libs/cmaps/',
                    cMapPacked: true,
                });

                const pdf = await loadingTask.promise;

                let allText = '';

                for (let i = 1; i <= pdf.numPages; i++) {
                    try {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();

                        const pageText = textContent.items
                            .map(item => {
                                // 保留空格和换行
                                if (item.str) {
                                    return item.str;
                                }
                                if (item.hasEOL) {
                                    return '\n';
                                }
                                return '';
                            })
                            .join('');

                        if (pageText.trim()) {
                            allText += `--- ${getToastMessage('fileManagement.pageNumber', { number: i })} ---\n${pageText}\n\n`;
                        }
                    } catch (pageError) {
                        console.warn(getToastMessage('fileManagement.pageParseFailed', { number: i }), pageError);
                    }
                }

                if (!allText.trim()) {
                    resolve(getToastMessage('fileManagement.pdfScanVersion'));
                } else {
                    resolve(allText);
                }
            } catch (error) {
                console.error(getToastMessage('console.pdfParseError') + ':', error);
                reject(new Error(`${getToastMessage('console.pdfParseFailed')}: ${error.message}`));
            }
        };

        reader.onerror = (error) => {
            console.error(getToastMessage('console.fileReadError') + ':', error);
            reject(new Error(getToastMessage('console.readFileFailed')));
        };

        reader.readAsArrayBuffer(file);
    });
}

async function readExcelFile(file) {
    await loadScript('/libs/xlsx.full.min.js', 'XLSX');

    return new Promise((resolve, reject) => {
        const convertWorkbookToMarkdown = (workbook) => {
            let allMarkdown = '';
            workbook.SheetNames.forEach(sheetName => {
                allMarkdown += `\n\n## ${getToastMessage('fileProcessing.worksheet')}: ${sheetName}\n\n`;
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (json.length > 0 && json[0].length > 0) {
                    allMarkdown += `| ${json[0].join(' | ')} |\n`;
                    allMarkdown += `| ${json[0].map(() => '---').join(' | ')} |\n`;
                    json.slice(1).forEach(row => {
                        const newRow = [...row];
                        while (newRow.length < json[0].length) {
                            newRow.push('');
                        }
                        allMarkdown += `| ${newRow.slice(0, json[0].length).join(' | ')} |\n`;
                    });
                }
            });
            return allMarkdown;
        };

        const reader = new FileReader();

        reader.onload = function (event) {
            const data = new Uint8Array(event.target.result);
            let decodedContent;

            try {
                decodedContent = new TextDecoder('utf-8', { fatal: true }).decode(data);
            } catch (error) {
                try {
                    decodedContent = new TextDecoder('gb18030').decode(data);
                } catch (gbkError) {
                    console.error(getToastMessage('console.failedToDecodeFileWithBothEncodings'), gbkError);
                    reject(new Error(getToastMessage('console.unrecognizedEncoding')));
                    return;
                }
            }

            try {
                const workbook = XLSX.read(decodedContent, { type: 'string' });
                resolve(convertWorkbookToMarkdown(workbook));
            } catch (parseError) {
                console.error(getToastMessage('console.failedToParseDecodedContent'), parseError);
                reject(parseError);
            }
        };

        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function readPptxFile(file) {
    await loadScript('/libs/jszip.min.js', 'JSZip');
    return convertPptxToPlainText(file);
}

async function convertPptxToPlainText(file) {
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
        const textContent = extractTextFromSlideXml(xmlContent);
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

    return slidesMarkdown.join('\n\n').trim();
}

const ELEMENT_NODE = typeof Node === 'undefined' ? 1 : Node.ELEMENT_NODE;

function getPptxNotesLabel() {
    if (typeof getToastMessage === 'function') {
        try {
            const label = getToastMessage('fileProcessing.notes');
            if (label && label !== 'fileProcessing.notes') {
                return label;
            }
        } catch (_) { }
    }
    return 'Notes';
}

function formatAsBlockQuote(text) {
    return text
        .split('\n')
        .map(line => line.trim().length ? `> ${line}` : '>')
        .join('\n');
}

function extractTextFromSlideXml(xmlContent) {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');
        const spTree = xmlDoc.getElementsByTagName('p:spTree')[0];
        const sections = [];

        if (spTree) {
            const processContainer = (container) => {
                const elementChildren = Array.from(container.childNodes || [])
                    .filter(node => node.nodeType === ELEMENT_NODE);

                elementChildren.forEach(child => {
                    if (child.tagName === 'p:sp') {
                        const textBody = child.getElementsByTagName('a:txBody')[0];
                        if (!textBody) {
                            return;
                        }
                        const paragraphElements = Array.from(textBody.childNodes || [])
                            .filter(node => node.nodeType === Node.ELEMENT_NODE && node.tagName === 'a:p');
                        if (!paragraphElements.length) {
                            return;
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
                    } else if (child.tagName === 'p:grpSp') {
                        processContainer(child);
                    }
                });
            };

            processContainer(spTree);
        }

        if (sections.length) {
            return sections.join('\n\n');
        }

        return legacySlideTextExtraction(xmlDoc);
    } catch (_) {
        return legacySlideTextFallback(xmlContent);
    }
}

function buildParagraphMarkdown(paragraph, bulletState, options = {}) {
    const allowBullets = options.allowBullets !== false;
    const text = extractParagraphText(paragraph);
    if (!text) {
        return null;
    }

    const bulletInfo = allowBullets ? detectBulletInfo(paragraph) : { type: 'none', level: 0 };
    return formatParagraphText(text, bulletInfo, bulletState);
}

function extractParagraphText(paragraph) {
    const parts = [];
    paragraph.childNodes.forEach(child => {
        if (child.nodeType !== ELEMENT_NODE) {
            return;
        }
        if (child.tagName === 'a:r' || child.tagName === 'a:fld') {
            const textNode = child.getElementsByTagName('a:t')[0];
            if (textNode && textNode.textContent) {
                parts.push(textNode.textContent);
            }
            const breaks = Array.from(child.getElementsByTagName('a:br'));
            breaks.forEach(() => parts.push('\n'));
        } else if (child.tagName === 'a:br') {
            parts.push('\n');
        }
    });

    const combined = parts.join('').replace(/\r/g, '');
    const cleaned = combined
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return cleaned || null;
}

function detectBulletInfo(paragraph) {
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
}

function formatParagraphText(text, bulletInfo, bulletState) {
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
}

function convertTableNodeToMarkdown(tableNode) {
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
}

function legacySlideTextExtraction(xmlDoc) {
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
}

function legacySlideTextFallback(xmlContent) {
    return xmlContent
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function isPlainTextFile(filename) {
    const plainTextExtensions = [
        'txt', 'md', 'markdown', 'js', 'ts', 'jsx', 'tsx', 'py', 'java',
        'c', 'cpp', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt',
        'scala', 'dart', 'r', 'm', 'sh', 'bat', 'ps1', 'css', 'html', 'csv',
        'xml', 'json', 'yaml', 'yml', 'sql', 'log', 'ini', 'toml', 'env'
    ];
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension ? plainTextExtensions.includes(extension) : false;
}

function dismissKeyboard() {
    if (isNativeApp) {
        Keyboard.hide();
    } else {
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    }
}

function getToastMessage(key, params = {}) {
    const currentLang = getCurrentLanguage();
    const translated = t(currentLang, key, params);

    if (translated === key) {
        const browserLang = navigator.language || navigator.languages[0] || 'zh-CN';
        const defaultLang = browserLang.startsWith('zh') ? 'zh-CN' :
            browserLang.startsWith('ja') ? 'ja' :
                browserLang.startsWith('ko') ? 'ko' :
                    browserLang.startsWith('es') ? 'es' :
                        browserLang.startsWith('en') ? 'en' : 'zh-CN';

        if (currentLang !== defaultLang) {
            const fallbackTranslated = t(defaultLang, key, params);
            if (fallbackTranslated !== key) {
                return fallbackTranslated;
            }
        }
    }
    return translated;
}

function updateCurrentPasswordPlaceholderInput() {
    const input = document.getElementById('current-password');
    if (!input) return;
    const hasExistingPassword = !!(currentUser?.has_password);
    const placeholderKey = hasExistingPassword ? 'ui.currentPassword' : 'ui.currentPasswordOptional';
    input.dataset.i18nPlaceholderKey = placeholderKey;
    input.placeholder = getToastMessage(placeholderKey);
}
onAfterLanguageApplied(updateCurrentPasswordPlaceholderInput);

function getModelErrorMessage(status) {
    const statusKey = `errors.httpStatus.${status}`;
    const message = getToastMessage(statusKey);
    return message !== statusKey ? message : null;
}

function showToast(message, type = 'info', error = null, options = {}) {
    const duration = typeof options.duration === 'number' ? options.duration : 2000;

    const wrapper = document.createElement('div');
    wrapper.className = 'message-toast-wrapper';

    const toast = document.createElement('div');
    toast.className = `message-toast ${type}`;

    if (message && typeof message === 'string' && message.includes('\n')) {
        const lines = message.split('\n');
        lines.forEach((line) => {
            if (line.trim()) {
                const lineElement = document.createElement('div');
                lineElement.textContent = line;
                toast.appendChild(lineElement);
            }
        });
    } else {
        toast.textContent = message ?? '';
    }

    wrapper.appendChild(toast);
    document.body.appendChild(wrapper);

    let shownResolve;
    const whenShown = new Promise((resolve) => { shownResolve = resolve; });

    let shownFallbackTimer = null;
    const onShown = (e) => {
        if (!e || e.propertyName === 'transform') {
            toast.removeEventListener('transitionend', onShown);
            if (shownFallbackTimer) clearTimeout(shownFallbackTimer);
            shownResolve();
        }
    };
    toast.addEventListener('transitionend', onShown);

    setTimeout(() => {
        shownFallbackTimer = setTimeout(() => {
            toast.removeEventListener('transitionend', onShown);
            shownResolve();
        }, 500);
        toast.classList.add('show');
    }, 50);

    const whenHidden = new Promise((resolve) => {
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (wrapper.parentNode) {
                    wrapper.parentNode.removeChild(wrapper);
                }
                resolve();
            }, 400);
        }, duration);
    });
    return { whenShown, whenHidden, element: toast, wrapper };
}

try {
    if (typeof window !== 'undefined') {
        window['getToastMessage'] = getToastMessage;
        window['showToast'] = showToast;
    }
} catch (_) { }

function renderQuotePreview() {
    if (!currentQuote) {
        elements.quotePreviewContainer.innerHTML = '';
        elements.quotePreviewContainer.style.display = 'none';
        return;
    }
    const safeContent = currentQuote.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    elements.quotePreviewContainer.style.display = 'block';
    elements.quotePreviewContainer.innerHTML = `
        <div class="quote-preview-box">
            <div class="quote-preview-text-wrapper">
                <strong style="font-weight: 600; color: var(--text-color);">${getToastMessage('common.reply')}：</strong>${safeContent.substring(0, 80)}${safeContent.length > 80 ? '...' : ''}
            </div>
            <button class="quote-preview-close-btn">&times;</button>
        </div>
    `;

    const closeButton = elements.quotePreviewContainer.querySelector('.quote-preview-close-btn');
    if (closeButton) {
        closeButton.addEventListener('click', cancelQuote);
    }
}

function smoothScrollToBottom() {
    const container = elements.chatContainer;
    const targetScrollTop = container.scrollHeight;
    const startScrollTop = container.scrollTop;
    const distance = targetScrollTop - startScrollTop;
    const duration = 200;
    const startTime = performance.now();

    function animateScroll(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const easeOut = 1 - Math.pow(1 - progress, 3);

        container.scrollTop = startScrollTop + (distance * easeOut);

        if (progress < 1) {
            requestAnimationFrame(animateScroll);
        }
    }
    requestAnimationFrame(animateScroll);
}

function ensureMessageActionsVisible(messageElement, gap = 12) {
    if (!messageElement || !elements.chatContainer) {
        return;
    }
    const actionsRow = messageElement.querySelector('.message-actions');
    if (!actionsRow) {
        return;
    }

    requestAnimationFrame(() => {
        const container = elements.chatContainer;
        const containerRect = container.getBoundingClientRect();
        const actionsRect = actionsRow.getBoundingClientRect();
        let visibleBottom = containerRect.bottom - gap;
        const bottomPanel = document.querySelector('.bottom-panel');
        if (bottomPanel) {
            const panelRect = bottomPanel.getBoundingClientRect();
            visibleBottom = Math.min(visibleBottom, panelRect.top - gap);
        }
        const overlap = actionsRect.bottom - visibleBottom;
        if (overlap > 0) {
            container.scrollTop += overlap + gap;
        }
    });
}

function shouldEnableTouchMessageActions() {
    try {
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
            return true;
        }
    } catch (_) { }
    const hasNavigatorTouch = typeof navigator !== 'undefined' &&
        typeof navigator.maxTouchPoints === 'number' &&
        navigator.maxTouchPoints > 0;
    return ('ontouchstart' in window) || hasNavigatorTouch;
}

function updateTouchActionMode(nextValue) {
    const enabled = Boolean(nextValue);
    if (touchActionModeEnabled === enabled) {
        return;
    }
    touchActionModeEnabled = enabled;
    if (!touchActionModeEnabled && touchActiveMessage) {
        touchActiveMessage.classList.remove('touch-active');
        touchActiveMessage = null;
    }
}

function setupTouchMessageActions() {
    const container = elements.chatContainer;
    if (!container) {
        return;
    }

    updateTouchActionMode(shouldEnableTouchMessageActions());

    if (touchActionHandlersInitialized) {
        return;
    }

    const activateMessage = (message, fromActionButton) => {
        if (!message) return;
        if (!touchActionModeEnabled) return;

        if (touchActiveMessage && touchActiveMessage !== message) {
            touchActiveMessage.classList.remove('touch-active');
        }

        if (touchActiveMessage === message && !fromActionButton) {
            message.classList.remove('touch-active');
            touchActiveMessage = null;
            return;
        }

        message.classList.add('touch-active');
        touchActiveMessage = message;
    };

    const handleMessageTap = (event) => {
        if (!touchActionModeEnabled) {
            return;
        }
        const target = event.target;
        if (!target || typeof target.closest !== 'function') {
            return;
        }
        const message = target.closest('.message');
        if (!message || !container.contains(message)) {
            return;
        }
        const tappedAction = Boolean(target.closest('.message-actions'));
        activateMessage(message, tappedAction);
    };

    const handleDocumentTap = (event) => {
        if (!touchActionModeEnabled || !touchActiveMessage) {
            return;
        }
        const target = event.target;
        if (!target || typeof target.closest !== 'function') {
            touchActiveMessage.classList.remove('touch-active');
            touchActiveMessage = null;
            return;
        }
        const message = target.closest('.message');
        if (message && container.contains(message)) {
            return;
        }
        touchActiveMessage.classList.remove('touch-active');
        touchActiveMessage = null;
    };

    container.addEventListener('click', handleMessageTap);
    document.addEventListener('click', handleDocumentTap);

    if (window.matchMedia) {
        try {
            const coarseQuery = window.matchMedia('(pointer: coarse)');
            const handlePointerChange = () => {
                updateTouchActionMode(shouldEnableTouchMessageActions());
            };
            if (typeof coarseQuery.addEventListener === 'function') {
                coarseQuery.addEventListener('change', handlePointerChange);
            } else if (typeof coarseQuery.addListener === 'function') {
                coarseQuery.addListener(handlePointerChange);
            }
        } catch (_) { }
    }

    window.addEventListener('orientationchange', () => {
        updateTouchActionMode(shouldEnableTouchMessageActions());
    });

    touchActionHandlersInitialized = true;
}

function cancelQuote() {
    currentQuote = null;
    renderQuotePreview();
}

function openSidebar() {
    document.body.classList.add('sidebar-open');
    document.getElementById('sidebar-toggle-btn').setAttribute('aria-expanded', 'true');
    navigationEngine?.notifySidebarOpened?.();
}

function closeSidebar(isFromBackButton = false, options = {}) {
    if (!document.body.classList.contains('sidebar-open')) {
        return;
    }
    document.body.classList.remove('sidebar-open');
    document.getElementById('sidebar-toggle-btn').setAttribute('aria-expanded', 'false');
    const fromHistory = options.fromHistory === true;
    navigationEngine?.notifySidebarClosed?.({ fromHistory });
}

function closeSidebarOnInteraction() {
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    if (isMobile) {
        closeSidebar();
    } else {
        document.body.classList.add('sidebar-collapsed');
        sidebarToggleBtn.setAttribute('aria-expanded', 'false');
    }
}

function generateId() {
    return `chat_${crypto.randomUUID()}`;
}

function getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getCurrentUserId() {
    return currentUser?.id || 'guest';
}

let guestApiState = { keyOne: '', keyTwo: '', mode: 'mixed', toggle: '0' };

function clearGuestApiKeys() {
    try {
        guestApiState.keyOne = '';
        guestApiState.keyTwo = '';
        guestApiState.toggle = '0';

        localStorage.removeItem('guest_api_key_one');
        localStorage.removeItem('guest_api_key_two');
        localStorage.removeItem('guest_api_mode');
        localStorage.removeItem('guest_api_key_toggle');
    } catch (_) { }
}

function handleGuestKeyInvalidation(options = {}) {
    if (currentUser) return;

    const previouslyHadKeys = guestHasActiveCustomKey();

    clearGuestApiKeys();
    guestUsageStats.count = 0;
    guestUsageStats.limit = GUEST_LIMIT;
    guestUsageStats.loaded = false;

    if (elements.apiKeyOneInput) elements.apiKeyOneInput.value = '';
    if (elements.apiKeyTwoInput) elements.apiKeyTwoInput.value = '';
    if (elements.apiKeyStatus) {
        elements.apiKeyStatus.textContent = getToastMessage('status.apiKeyNotConfigured');
    }
    if (elements.usageStats) {
        elements.usageStats.style.display = 'none';
    }

    try {
        updateActiveModel();
        renderModelMenu();
    } catch (_) { }
    updateUsageDisplay();
    try {
        refreshSettingsI18nTexts();
    } catch (_) { }

    if (options.showToast !== false && previouslyHadKeys) {
        showToast(getToastMessage('toast.guestKeyDisabled', { limit: GUEST_LIMIT }), 'warning');
    }
}

function sanitizeUserForCache(user) {
    try {
        if (!user || typeof user !== 'object') return user;
        const sanitized = { ...user };
        delete sanitized.custom_api_key;
        delete sanitized.custom_api_key_t;
        return sanitized;
    } catch (_) {
        return user;
    }
}

function persistCurrentUserCache() {
    if (!sessionId || !currentUser) return;
    try {
        localStorage.setItem(`user_cache_${sessionId}`, JSON.stringify(sanitizeUserForCache(currentUser)));
    } catch (_) { }
}

const asyncStorage = {
    setItem: (key, value) => {
        return new Promise((resolve) => {
            if (window.requestIdleCallback) {
                requestIdleCallback(() => {
                    try {
                        localStorage.setItem(key, value);
                        resolve();
                    } catch (error) {
                        resolve();
                    }
                }, { timeout: 1000 });
            } else {
                setTimeout(() => {
                    try {
                        localStorage.setItem(key, value);
                        resolve();
                    } catch (error) {
                        resolve();
                    }
                }, 0);
            }
        });
    },

    getItem: (key) => {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            console.error('AsyncStorage getItem error:', error);
            return null;
        }
    },

    removeItem: (key) => {
        return new Promise((resolve) => {
            if (window.requestIdleCallback) {
                requestIdleCallback(() => {
                    try {
                        localStorage.removeItem(key);
                        resolve();
                    } catch (error) {
                        resolve();
                    }
                }, { timeout: 1000 });
            } else {
                setTimeout(() => {
                    try {
                        localStorage.removeItem(key);
                        resolve();
                    } catch (error) {
                        resolve();
                    }
                }, 0);
            }
        });
    }
};

function getGuestKeySettings() {
    return {
        keyOne: (guestApiState.keyOne || '').trim(),
        keyTwo: (guestApiState.keyTwo || '').trim(),
        mode: guestApiState.mode || 'mixed'
    };
}

function guestHasActiveCustomKey() {
    const { keyOne, keyTwo } = getGuestKeySettings();
    return !!(keyOne || keyTwo);
}

function selectGuestApiKeyForRequest() {
    const { keyOne, keyTwo, mode } = getGuestKeySettings();
    if (!keyOne && !keyTwo) return null;
    if (mode === 'single') return keyOne || keyTwo || null;
    if (keyOne && keyTwo) {
        guestApiState.toggle = guestApiState.toggle === '1' ? '0' : '1';
        return guestApiState.toggle === '1' ? keyTwo : keyOne;
    }
    return keyOne || keyTwo || null;
}

function getCustomApiKey() {
    if (currentUser) {
        let keyOne = '';
        let keyTwo = '';

        if (currentUser.custom_api_key) {
            const parts = String(currentUser.custom_api_key).split(',');
            keyOne = (parts[0] || '').trim();
            keyTwo = (parts[1] || '').trim();
        }

        if (!keyTwo && currentUser.custom_api_key_t) {
            keyTwo = String(currentUser.custom_api_key_t).trim();
        }

        const combined = [keyOne, keyTwo].filter(Boolean).join(',');
        return combined || null;
    }

    const { keyOne, keyTwo } = getGuestKeySettings();
    const combinedGuest = [keyOne, keyTwo].filter(Boolean).join(',');
    return combinedGuest || null;
}

function clearApiKeyErrorStates() {
    const keyOneInput = document.getElementById('api-key-one');
    const keyTwoInput = document.getElementById('api-key-two');

    if (keyOneInput) {
        keyOneInput.classList.remove('error');
    }
    if (keyTwoInput) {
        keyTwoInput.classList.remove('error');
    }
}

function highlightApiKeyError(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.classList.add('error');
        input.focus();
    }
}

function checkApiKeysChanged() {
    if (!currentUser) return false;

    const apiKeyOneInput = document.getElementById('api-key-one');
    const apiKeyTwoInput = document.getElementById('api-key-two');
    const currentKeyOne = apiKeyOneInput ? apiKeyOneInput.value.trim() : '';
    const currentKeyTwo = apiKeyTwoInput ? apiKeyTwoInput.value.trim() : '';

    const changed = (
        currentKeyOne !== (originalApiKeys.keyOne || '') ||
        currentKeyTwo !== (originalApiKeys.keyTwo || '')
    );
    apiKeysChanged = changed;
    return changed;
}

function setOriginalApiKeys() {
    if (currentUser) {
        const storedKey = currentUser.custom_api_key || '';
        let k1 = '', k2 = '';
        if (storedKey) {
            const parts = storedKey.split(',');
            k1 = (parts[0] || '').trim();
            k2 = (parts[1] || '').trim();
        }
        if (currentUser.custom_api_key_t) {
            k2 = currentUser.custom_api_key_t || '';
        }

        const hasKeys = !!(k1 || k2);

        const normalizedMode = (() => {
            if (!hasKeys) return 'mixed';
            const m = currentUser.api_mode || 'mixed';
            return m === 'server_fallback' ? 'mixed' : m;
        })();

        originalApiKeys = {
            keyOne: k1,
            keyTwo: k2,
            mode: normalizedMode
        };
        apiKeysChanged = false;
    }
}

let pendingKeyValidationStatus = null;
let keyValidationPrefetched = false;

// 检查密钥验证状态
async function checkKeyValidationStatus() {
    try {
        const response = await makeAuthRequest('check-key-validation-status', {}, {
            headers: { 'X-Validation-Only': 'true' }
        });
        if (response.success && response.validationStatus !== 'valid') {
            showKeyValidationNotification(response.validationStatus);
        }
    } catch (error) {
        console.error('Failed to check key validation status:', error);
    }
}

// 初始化阶段预取密钥验证状态
async function prefetchKeyValidationStatus() {
    if (!currentUser || (!currentUser.custom_api_key && !currentUser.custom_api_key_t)) return;
    try {
        const response = await makeAuthRequest('check-key-validation-status', {}, { headers: { 'X-Validation-Only': 'true' } });
        keyValidationPrefetched = true;

        if (response.success && response.autoValidated === false && response.validationError) {
            showKeyValidationNotification({
                validationStatus: 'error',
                message: response.validationError
            });
        }

        else if (response.success && response.autoValidated === true && response.validationStatus !== 'valid') {
            showKeyValidationNotification({
                validationStatus: response.validationStatus,
                message: response.validationResult?.message || 'API密钥验证完成'
            });
        }

        else {
            pendingKeyValidationStatus = null;
        }
    } catch (error) {
        console.warn('Prefetch key validation status failed:', error);
    }
}

function checkKeyValidationOnLogin() {
    if (!currentUser || (!currentUser.custom_api_key && !currentUser.custom_api_key_t)) return;
    if (keyValidationCheckTimer) {
        clearTimeout(keyValidationCheckTimer);
    }
    keyValidationCheckTimer = setTimeout(() => {
        keyValidationCheckTimer = null;
        try {
            checkKeyValidationStatus();
        } catch (error) {
            console.warn('checkKeyValidationStatus failed:', error);
        }
    }, 300);
}

// 显示密钥失效通知
function showKeyValidationNotification(validationStatus) {
    let message = '';
    let actionText = getToastMessage('toast.updateKeysNow');

    switch (validationStatus) {
        case 'all_failed':
            message = getToastMessage('toast.fallbackLimitReached');
            break;
        default:
            return;
    }

    // 创建密钥验证模态框
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'key-validation-modal-overlay';
    modalOverlay.className = 'modal-overlay';
    modalOverlay.innerHTML = `
        <div id="key-validation-modal" class="modal">
            <div class="modal-header">
                <h2 data-i18n-key="toast.keyValidationFailed">${getToastMessage('toast.keyValidationFailed')}</h2>
                <button id="key-validation-close-btn" class="close-btn">&times;</button>
            </div>
            <div class="modal-content" style="text-align: center;">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                    style="width: 56px; height: 56px; fill: #ff9800; margin-bottom: 16px;">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path>
                </svg>
                <h3 style="color: var(--text-color); margin-bottom: 12px;">${getToastMessage('toast.keyValidationFailed')}</h3>
                <p style="color: var(--text-secondary); line-height: 1.5; margin-bottom: 0;">${message}</p>
            </div>
            <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:8px;">
                <button id="key-validation-update-btn" class="btn-secondary">${actionText}</button>
                <button id="key-validation-confirm-btn" class="btn-primary">${getToastMessage('common.confirm') || 'OK'}</button>
            </div>
        </div>
    `;

    // 添加到页面
    document.body.appendChild(modalOverlay);

    // 显示模态框
    modalOverlay.classList.add('visible');

    // 添加事件监听器
    const closeBtn = modalOverlay.querySelector('#key-validation-close-btn');
    const updateBtn = modalOverlay.querySelector('#key-validation-update-btn');
    const confirmBtn = modalOverlay.querySelector('#key-validation-confirm-btn');

    const closeModal = () => {
        modalOverlay.classList.remove('visible');
        setTimeout(() => {
            modalOverlay.remove();
        }, 300);
    };

    closeBtn.addEventListener('click', closeModal);
    confirmBtn.addEventListener('click', closeModal);
    updateBtn.addEventListener('click', () => {
        closeModal();
        openSettingsForKeys();
    });

    // 点击遮罩关闭
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });
}

function openSettingsForKeys() {
    if (elements.settingsBtn) {
        elements.settingsBtn.click();
        setTimeout(() => {
            const keySettingsTab = document.querySelector('[data-page="api"]');
            if (keySettingsTab) {
                lastSettingsPage = 'api';
                keySettingsTab.click();
            }
        }, 100);
    }
}

function createInitialAvatar(avatarWrapper, name) {
    if (!avatarWrapper) return;

    const existingInitial = avatarWrapper.querySelector('.avatar-initial-text');
    if (existingInitial) {
        existingInitial.remove();
    }

    const initial = name ? name.charAt(0).toUpperCase() : 'U';
    const initialDiv = document.createElement('div');
    initialDiv.className = 'avatar-initial-text';
    initialDiv.textContent = initial;
    initialDiv.style.cssText = `
        width: 100%; height: 100%; display: flex; align-items: center;
        justify-content: center; background-color: #1a73e8; color: white;
        font-size: 48px; font-weight: bold; border-radius: 50%;
    `;
    avatarWrapper.appendChild(initialDiv);
}

function setupSettingsModalUI() {
    const activeNavItem = document.querySelector('.settings-nav-item.active');

    requestAnimationFrame(() => {
        const guestProfileSection = document.getElementById('guest-profile-section');
        const userProfileSection = document.getElementById('edit-profile-section');
        const accountActions = document.querySelector('.account-actions-group');
        const avatarPreview = document.getElementById('avatar-preview');
        const avatarWrapper = document.getElementById('avatar-preview-wrapper');
        const displayEmailText = document.getElementById('display-email-text');

        const navItems = document.querySelectorAll('.settings-nav-item');
        const pages = document.querySelectorAll('.settings-page');
        const profileNavItem = document.querySelector('.settings-nav-item[data-page="profile"]');
        const apiNavItem = document.querySelector('.settings-nav-item[data-page="api"]');
        const securityNavItem = document.querySelector('.settings-nav-item[data-page="security"]');

        const existingInitial = avatarWrapper.querySelector('.avatar-initial-text');
        if (existingInitial) {
            existingInitial.remove();
        }
        avatarPreview.style.display = 'block';

        newAvatarUrl = null;
        if (currentUser) {
            originalUsername = currentUser.username || '';
            originalAvatarUrl = currentUser.avatar_url || null;
            newAvatarUrl = null;

            guestProfileSection.style.display = 'none';
            userProfileSection.style.display = 'block';
            accountActions.style.display = 'block';

            apiNavItem.style.display = 'flex';
            securityNavItem.style.display = 'flex';

            displayEmailText.textContent = currentUser.email;
            elements.editUsernameInput.value = currentUser.username || '';
            try {
                updateUsageDisplay();
            } catch (_) { }
            refreshUsageStats().catch(err => console.error(`${getToastMessage('console.refreshUsageStatsFailed')}:`, err));

            if (currentUser.avatar_url) {
                avatarPreview.style.display = 'block';
                avatarPreview.src = currentUser.avatar_url;
                avatarPreview.onerror = () => {
                    // 图片加载失败时，隐藏图片并显示字母头像
                    avatarPreview.style.display = 'none';
                    const name = currentUser.username || currentUser.email;
                    createInitialAvatar(avatarWrapper, name);
                };
            } else {
                avatarPreview.style.display = 'none';
                const name = currentUser.username || currentUser.email;
                createInitialAvatar(avatarWrapper, name);
            }

            originalThemeSettings = currentUser.theme_settings ? { ...currentUser.theme_settings } : { font: 'system', background_url: null };

            elements.themeSettingsPage.querySelectorAll('button, select').forEach(el => el.disabled = false);

            if (elements.fontMenu) {
                const fontValue = originalThemeSettings.font || 'system';
                const activeItem = elements.fontMenu.querySelector(`[data-value="${fontValue}"]`);
                if (activeItem) {
                    elements.fontMenu.querySelectorAll('.dropdown-item').forEach(el => el.classList.remove('active'));
                    activeItem.classList.add('active');
                    const fontText = elements.fontTrigger.querySelector('.dropdown-text');
                    if (fontText) {
                        fontText.textContent = activeItem.textContent;
                        fontText.dataset.i18nKey = activeItem.dataset.i18nKey;
                    }
                }
            }

            const themeBtns = elements.themePresetSelector.querySelectorAll('.theme-preset-btn');
            themeBtns.forEach(btn => btn.classList.remove('active'));

            const currentPreset = originalThemeSettings.preset || 'light';
            const activeBtn = Array.from(themeBtns).find(btn => btn.dataset.theme === currentPreset);
            if (activeBtn) {
                activeBtn.classList.add('active');
            }
        } else {
            guestProfileSection.style.display = 'block';
            userProfileSection.style.display = 'none';
            accountActions.style.display = 'none';

            apiNavItem.style.display = 'flex';
            securityNavItem.style.display = 'none';

            elements.themePresetSelector.querySelectorAll('.theme-preset-btn').forEach(btn => btn.disabled = false);

            try {
                const { keyOne, keyTwo, mode } = getGuestKeySettings();
                if (elements.apiKeyOneInput) elements.apiKeyOneInput.value = keyOne || '';
                if (elements.apiKeyTwoInput) elements.apiKeyTwoInput.value = keyTwo || '';
                const modeInput = document.querySelector(`input[name="api-mode"][value="${mode || 'mixed'}"]`);
                if (modeInput) modeInput.checked = true;

                if (elements.apiKeyStatus) {
                    if (keyOne || keyTwo) {
                        const modeText = (mode || 'mixed') === 'mixed' ? getToastMessage('ui.mixedMode') : getToastMessage('ui.singleMode');
                        elements.apiKeyStatus.textContent = `${getToastMessage('status.apiKeyConfiguredWithMode', { mode: modeText })}`;
                    } else {
                        elements.apiKeyStatus.textContent = getToastMessage('status.apiKeyNotConfigured');
                    }
                }

                if (elements.usageStats) {
                    elements.usageStats.style.display = 'none';
                }
                updateUsageDisplay();
            } catch (_) { }

            const currentGuestPreset = guestThemeSettings.preset || 'light';
            elements.themePresetSelector.querySelectorAll('.theme-preset-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === currentGuestPreset);
            });

            if (elements.fontMenu) {
                const fontValue = guestThemeSettings.font || 'system';
                const activeItem = elements.fontMenu.querySelector(`[data-value="${fontValue}"]`);
                if (activeItem) {
                    elements.fontMenu.querySelectorAll('.dropdown-item').forEach(el => el.classList.remove('active'));
                    activeItem.classList.add('active');
                    const fontText = elements.fontTrigger.querySelector('.dropdown-text');
                    if (fontText) {
                        fontText.textContent = activeItem.textContent;
                        fontText.dataset.i18nKey = activeItem.dataset.i18nKey;
                    }
                }
            }
        }

        try {
            const persisted = lastSettingsPage;
            const isVisible = (el) => el && getComputedStyle(el).display !== 'none';
            const setActivePage = (pageName) => {
                navItems.forEach(i => i.classList.remove('active'));
                pages.forEach(p => p.classList.remove('active'));
                const nav = document.querySelector(`.settings-nav-item[data-page="${pageName}"]`);
                const page = document.getElementById(`${pageName}-settings-page`);
                if (nav) nav.classList.add('active');
                if (page) page.classList.add('active');
            };

            let desired = null;
            if (persisted) {
                const n = document.querySelector(`.settings-nav-item[data-page="${persisted}"]`);
                if (isVisible(n)) desired = persisted;
            }
            if (!desired && activeNavItem && isVisible(activeNavItem)) {
                desired = activeNavItem.dataset.page;
            }
            if (!desired) {
                if (isVisible(profileNavItem)) desired = 'profile';
            }
            if (!desired) {
                const firstVisible = Array.from(navItems).find(i => isVisible(i));
                if (firstVisible) desired = firstVisible.dataset.page;
            }
            if (desired) setActivePage(desired);
        } catch (_) { }
    });
    setupSecurityPageUI();
}

function setupSecurityPageUI() {
    if (securityPageInitialized) return;
    const page = document.getElementById('security-settings-page');
    if (!page) return;
    securityPageInitialized = true;

    const passwordModal = page.querySelector('#security-password-modal');
    const mfaModal = page.querySelector('#security-mfa-modal');
    const backupModal = page.querySelector('#security-backup-modal');
    const confirmModal = page.querySelector('#security-confirm-modal');
    const mfaToggle = page.querySelector('#security-mfa-toggle');
    const mfaActive = page.querySelector('#security-mfa-active');
    const confirmTitle = page.querySelector('#security-confirm-title');
    const confirmMessage = page.querySelector('#security-confirm-message');
    const confirmCodeField = page.querySelector('#security-confirm-code-field');
    const confirmCodeInput = page.querySelector('#security-confirm-code');
    const confirmBtn = page.querySelector('#security-confirm-btn');
    const backupCopyBtn = page.querySelector('#security-copy-backup');
    const backupList = backupModal?.querySelector('.security-backup-list');
    const manualCodeWrapper = document.getElementById('security-manual-code-wrapper');
    const manualCodeValue = document.getElementById('security-manual-code-value');
    const manualCodeCopyBtn = document.getElementById('security-copy-manual-code');
    const manualCodeLink = page.querySelector('#security-show-manual-code');
    const manualCodeModal = page.querySelector('#security-manual-code-modal');
    const verifyMfaBtn = page.querySelector('#security-verify-mfa');
    const mfaCodeInput = page.querySelector('#security-mfa-code');
    let currentBackupCodes = [];
    let fetchingBackupCodes = false;

    const applyMfaStateFromUser = () => {
        if (!mfaToggle) return;
        mfaToggle.checked = !!currentUser?.mfa_enabled;
        updateMfaState();
    };
    refreshSecurityMfaToggleFromUser = applyMfaStateFromUser;

    page.querySelectorAll('[data-code-target]').forEach(setupCodeInputGroup);
    let currentMfaSetup = null;

    const updateManualCodeDisplay = (formattedCode) => {
        if (!manualCodeWrapper || !manualCodeValue) return;
        if (!formattedCode) {
            manualCodeValue.textContent = '····';
            manualCodeValue.dataset.rawCode = '';
            if (manualCodeLink) {
                manualCodeLink.disabled = true;
            }
            return;
        }
        manualCodeValue.textContent = formattedCode;
        manualCodeValue.dataset.rawCode = formattedCode.replace(/\s+/g, '');
        if (manualCodeLink) {
            manualCodeLink.disabled = false;
        }
    };

    manualCodeCopyBtn?.addEventListener('click', async () => {
        if (!manualCodeValue) return;
        const rawCode = manualCodeValue.dataset.rawCode;
        if (!rawCode) return;
        try {
            await navigator.clipboard.writeText(rawCode);
            showToast(getToastMessage('ui.securityManualCodeCopiedToast'), 'success');
        } catch (error) {
            console.error('Failed to copy manual MFA code:', error);
        }
    });

    const openManualCodeModal = () => {
        if (!manualCodeModal) return;
        if (!manualCodeValue?.dataset.rawCode) return;
        openModal(manualCodeModal);
    };

    manualCodeLink?.addEventListener('click', openManualCodeModal);
    if (manualCodeLink) {
        manualCodeLink.disabled = true;
    }
    updateManualCodeDisplay(null);

    const renderBackupCodes = () => {
        if (!backupList) return;
        backupList.innerHTML = '';
        if (!currentBackupCodes.length) {
            const placeholder = document.createElement('span');
            placeholder.textContent = '—';
            backupList.appendChild(placeholder);
            return;
        }
        currentBackupCodes.forEach((code) => {
            const span = document.createElement('span');
            span.textContent = code;
            backupList.appendChild(span);
        });
    };

    let pendingConfirmResolve = null;
    let pendingConfirmCancel = null;

    const resetConfirmModalState = () => {
        if (!confirmModal) return;
        confirmModal.dataset.mode = '';
        if (confirmCodeField) confirmCodeField.style.display = 'none';
        if (confirmCodeInput) confirmCodeInput.value = '';
    };

    const openModal = (modal) => { if (modal) modal.classList.add('active'); };
    const closeModal = (modal) => { if (modal) modal.classList.remove('active'); };

    let suppressMfaToggleReset = false;

    const clearMfaSetupState = () => {
        currentMfaSetup = null;
        resetCodeInputs('security-mfa-code');
        updateManualCodeDisplay(null);
    };

    const handleDisableConfirm = async () => {
        if (!confirmModal) return;
        const code = confirmCodeInput?.value.trim();
        if (!code) {
            showToast(getToastMessage('errors.verificationCodeInvalidOrExpired'), 'error');
            return;
        }
        confirmBtn.disabled = true;
        try {
            await makeAuthRequest('mfa/disable', { code });
            closeModal(confirmModal);
            resetConfirmModalState();
            if (mfaToggle) {
                mfaToggle.checked = false;
                updateMfaState();
            }
            if (currentUser) {
                currentUser.mfa_enabled = false;
                persistCurrentUserCache();
            }
            refreshSecurityMfaToggleFromUser?.();
            showToast(getToastMessage('ui.securityMfaDisabledToast'), 'info');
        } catch (error) {
            showToast(error.message || getToastMessage('errors.verificationCodeInvalidOrExpired'), 'error');
            if (mfaToggle) {
                mfaToggle.checked = !!currentUser?.mfa_enabled;
                updateMfaState();
            }
            refreshSecurityMfaToggleFromUser?.();
        } finally {
            confirmBtn.disabled = false;
        }
    };

    page.querySelectorAll('[data-close-modal]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.security-modal');
            if (!modal) return;
            closeModal(modal);
            if (modal === confirmModal) {
                resetConfirmModalState();
                pendingConfirmCancel?.();
                pendingConfirmResolve = null;
                pendingConfirmCancel = null;
            } else if (modal === mfaModal) {
                if (!suppressMfaToggleReset && mfaToggle) {
                    mfaToggle.checked = !!currentUser?.mfa_enabled;
                    updateMfaState();
                }
                suppressMfaToggleReset = false;
                clearMfaSetupState();
            }
        });
    });

    const openPasswordModal = () => {
        updateCurrentPasswordPlaceholderInput();
        openModal(passwordModal);
    };

    page.querySelector('#security-open-password-modal')?.addEventListener('click', openPasswordModal);

    const openMfaModal = async () => {
        if (!mfaModal) return;
        openModal(mfaModal);
        const canvas = mfaModal.querySelector('#security-qr-canvas');
        drawSecurityQRCode(canvas, null);
        updateManualCodeDisplay(null);
        resetCodeInputs('security-mfa-code');
        try {
            const setupData = await makeAuthRequest('mfa/initiate', {});
            currentMfaSetup = setupData;
            drawSecurityQRCode(canvas, setupData.otpAuthUrl);
            updateManualCodeDisplay(setupData.manualCode);
        } catch (error) {
            console.error('Failed to start MFA setup:', error);
            showToast(error.message || getToastMessage('errors.serverError'), 'error');
            closeModal(mfaModal);
            if (mfaToggle) {
                mfaToggle.checked = !!currentUser?.mfa_enabled;
                updateMfaState();
            }
        }
    };

    verifyMfaBtn?.addEventListener('click', async () => {
        if (!mfaCodeInput) return;
        const codeValue = mfaCodeInput.value.trim();
        if (!/^\d{6}$/.test(codeValue)) {
            showToast(getToastMessage('toast.verificationError'), 'error');
            return;
        }
        if (!currentMfaSetup?.challengeId) {
            await openMfaModal();
            return;
        }
        verifyMfaBtn.disabled = true;
        try {
            await makeAuthRequest('mfa/confirm', {
                challengeId: currentMfaSetup.challengeId,
                code: codeValue
            });
            currentMfaSetup = null;
            suppressMfaToggleReset = true;
            closeModal(mfaModal);
            if (mfaToggle) {
                mfaToggle.checked = true;
                updateMfaState();
            }
            if (currentUser) {
                currentUser.mfa_enabled = true;
                persistCurrentUserCache();
            }
            refreshSecurityMfaToggleFromUser?.();
            resetCodeInputs('security-mfa-code');
            updateManualCodeDisplay(null);
            showToast(getToastMessage('ui.securityMfaEnabledToast'), 'success');
        } catch (error) {
            showToast(error.message || getToastMessage('toast.verificationError'), 'error');
            if (mfaToggle) {
                mfaToggle.checked = !!currentUser?.mfa_enabled;
                updateMfaState();
            }
            refreshSecurityMfaToggleFromUser?.();
            clearMfaSetupState();
        } finally {
            verifyMfaBtn.disabled = false;
        }
    });

    const openBackupModal = async () => {
        if (!backupModal || fetchingBackupCodes) return;
        fetchingBackupCodes = true;
        try {
            const result = await makeAuthRequest('mfa/backup-codes', {});
            currentBackupCodes = Array.isArray(result.codes) ? result.codes : [];
            renderBackupCodes();
            openModal(backupModal);
            showToast(getToastMessage('toast.securityBackupGenerated'), 'info');
        } catch (error) {
            showToast(error.message || getToastMessage('toast.securityBackupFailed'), 'error');
        } finally {
            fetchingBackupCodes = false;
        }
    };

    page.querySelector('#security-open-backup-modal')?.addEventListener('click', openBackupModal);

    backupCopyBtn?.addEventListener('click', () => {
        if (!currentBackupCodes.length) {
            showToast(getToastMessage('toast.securityBackupFailed'), 'error');
            return;
        }
        try {
            const content = currentBackupCodes.join('\n');
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.href = url;
            a.download = `backup-codes-${stamp}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            showToast(getToastMessage('toast.securityBackupFailed'), 'error');
        }
    });

    const showDisableConfirm = () => {
        if (!confirmModal) return;
        pendingConfirmResolve = null;
        pendingConfirmCancel = () => {
            if (mfaToggle) {
                mfaToggle.checked = !!currentUser?.mfa_enabled;
                updateMfaState();
            }
        };
        if (confirmTitle) {
            confirmTitle.textContent = getToastMessage('ui.securityDisableConfirmTitle');
        }
        if (confirmMessage) {
            confirmMessage.textContent = getToastMessage('ui.securityDisableConfirmMessage');
        }
        if (confirmCodeField) {
            confirmCodeField.style.display = 'flex';
        }
        if (confirmCodeInput) {
            confirmCodeInput.value = '';
        }
        if (confirmModal) {
            confirmModal.dataset.mode = 'disable';
        }
        resetCodeInputs('security-confirm-code');
        if (mfaToggle) {
            mfaToggle.checked = !!currentUser?.mfa_enabled;
            updateMfaState();
        }
        openModal(confirmModal);
    };

    confirmBtn?.addEventListener('click', () => {
        if (!confirmModal) return;
        if (confirmModal.dataset.mode === 'disable') {
            void handleDisableConfirm();
            return;
        }
        closeModal(confirmModal);
        pendingConfirmResolve?.();
        pendingConfirmResolve = null;
        pendingConfirmCancel = null;
    });

    mfaToggle?.addEventListener('change', (event) => {
        if (!event.target.checked) {
            if (!currentUser?.mfa_enabled) {
                event.target.checked = false;
                updateMfaState();
                return;
            }
            showDisableConfirm();
            return;
        }
        if (currentUser?.mfa_enabled) {
            event.target.checked = true;
            updateMfaState();
            return;
        }
        openMfaModal();
    });

    function updateMfaState() {
        const enabled = mfaToggle?.checked;
        if (mfaActive) {
            mfaActive.style.display = enabled ? 'flex' : 'none';
        }
    }

    applyMfaStateFromUser();
    updateCurrentPasswordPlaceholderInput();
}

function drawSecurityQRCode(canvas, data) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!data) {
        return;
    }
    try {
        const qr = qrcodeGenerator(0, 'M');
        qr.addData(data);
        qr.make();
        const modules = qr.getModuleCount();
        const tileW = canvas.width / modules;
        const tileH = canvas.height / modules;
        ctx.fillStyle = '#000';
        for (let row = 0; row < modules; row += 1) {
            for (let col = 0; col < modules; col += 1) {
                if (qr.isDark(row, col)) {
                    const w = Math.ceil((col + 1) * tileW) - Math.floor(col * tileW);
                    const h = Math.ceil((row + 1) * tileH) - Math.floor(row * tileH);
                    ctx.fillRect(Math.round(col * tileW), Math.round(row * tileH), w, h);
                }
            }
        }
    } catch (error) {
        console.error('Failed to render security QR code:', error);
    }
}

function resetBackPressExitState() {
    if (backPressExitTimer) {
        clearTimeout(backPressExitTimer);
        backPressExitTimer = null;
    }
    backPressExitReady = false;
    isHandlingBackNavigation = false;
}

async function closeModalAndResetState(closeAction) {
    const result = await closeAction();
    resetBackPressExitState();
    return result;
}

async function closeSettingsModalFromUI(options = {}) {
    const manageHistory = options.manageHistory !== false;
    const skipHandleBack = options.skipHandleBack === true;
    if (!elements.settingsModal) return false;

    if (apiKeysChanged) {
        const confirmed = await showCustomConfirm(
            getToastMessage('dialog.discardChanges'),
            getToastMessage('dialog.unsavedApiKeysMessage'),
            ICONS.HELP,
            { manageHistory: false }
        );
        if (!confirmed) return false;

        try {
            if (currentUser) {
                if (elements.apiKeyOneInput) elements.apiKeyOneInput.value = originalApiKeys.keyOne || '';
                if (elements.apiKeyTwoInput) elements.apiKeyTwoInput.value = originalApiKeys.keyTwo || '';
                const savedMode = (originalApiKeys.mode === 'server_fallback') ? 'mixed' : (originalApiKeys.mode || 'mixed');
                const modeInput = document.querySelector(`input[name="api-mode"][value="${savedMode}"]`) || document.querySelector(`input[name="api-mode"][value="mixed"]`);
                if (modeInput) modeInput.checked = true;
            } else {
                const { keyOne, keyTwo, mode } = getGuestKeySettings();
                if (elements.apiKeyOneInput) elements.apiKeyOneInput.value = keyOne || '';
                if (elements.apiKeyTwoInput) elements.apiKeyTwoInput.value = keyTwo || '';
                const modeInput = document.querySelector(`input[name="api-mode"][value="${mode || 'mixed'}"]`) || document.querySelector(`input[name="api-mode"][value="mixed"]`);
                if (modeInput) modeInput.checked = true;
            }
            clearApiKeyErrorStates();
            apiKeysChanged = false;
            keyOneTouched = false;
            keyTwoTouched = false;
            try { refreshSettingsI18nTexts(); } catch (_) { }
        } catch (_) { }
    }

    hideSettingsModal(manageHistory, { skipHandleBack });
    if (document.body.classList.contains('sidebar-open')) {
        try { closeSidebar(true); } catch (_) { }
    }
    return true;
}

async function closeProfileSettingsModal(options = {}) {
    const manageHistory = options.manageHistory !== false;
    const skipHandleBack = options.skipHandleBack === true;
    if (!elements.settingsModal) return false;
    const currentUsername = elements.editUsernameInput.value.trim();
    const profileChanged = (currentUser) && (currentUsername !== originalUsername || newAvatarFile !== null);
    if (profileChanged) {
        const confirmed = await showCustomConfirm(
            getToastMessage('dialog.discardChanges'),
            getToastMessage('dialog.discardChangesMessage'),
            ICONS.HELP,
            { manageHistory: false }
        );
        if (!confirmed) return false;
        try {
            if (elements.editUsernameInput) {
                elements.editUsernameInput.value = originalUsername || '';
            }
        } catch (_) { }

        try {
            const avatarPreview = document.getElementById('avatar-preview');
            const avatarWrapper = document.getElementById('avatar-preview-wrapper');

            if (avatarPreview) {
                if (originalAvatarUrl) {
                    avatarPreview.style.display = 'block';
                    avatarPreview.src = originalAvatarUrl;
                    avatarPreview.onerror = () => {
                        // 图片加载失败时，隐藏图片并显示字母头像
                        avatarPreview.style.display = 'none';
                        const name = originalUsername || (currentUser ? currentUser.email : '');
                        createInitialAvatar(avatarWrapper, name);
                    };
                } else {
                    // 无原头像：隐藏预览，显示首字母
                    avatarPreview.style.display = 'none';
                    const name = originalUsername || (currentUser ? currentUser.email : '');
                    createInitialAvatar(avatarWrapper, name);
                }
            }
        } catch (_) { }

        // 清理本地未保存头像引用
        newAvatarFile = null;
        newAvatarUrl = null;
    }
    hideSettingsModal(manageHistory, { skipHandleBack });
    return true;
}

async function handleCloseSettingsModalByPage(options = {}) {
    const manageHistory = options.manageHistory !== false;
    const skipHandleBack = options.skipHandleBack === true;
    const activeNavItem = document.querySelector('.settings-nav-item.active');
    const activePage = activeNavItem ? activeNavItem.dataset.page : 'profile';
    if (activePage === 'api') {
        return await closeSettingsModalFromUI({ manageHistory, skipHandleBack });
    }
    if (activePage === 'profile') {
        return await closeProfileSettingsModal({ manageHistory, skipHandleBack });
    }
    hideSettingsModal(manageHistory, { skipHandleBack });
    return true;
}

function updateLoginButtonVisibility() {
    if (!elements.customLoginBtn) return;

    const shouldShow = !currentUser;
    elements.customLoginBtn.style.display = shouldShow ? 'block' : 'none';
}

function openAuthOverlay(origin = 'auto', modeOrState, options = {}) {
    const baseState = modeOrState ?? routeManager.getAuthState();
    const state = typeof baseState === 'object' && baseState !== null
        ? routeManager.normalizeAuthState(baseState)
        : routeManager.normalizeAuthState({ mode: baseState, token: options.token });
    const normalizedMode = state.mode;
    const shouldSyncRoute = options.syncRoute !== false;
    const routeOptions = options.routeOptions || { replace: origin !== 'user' };
    if (normalizedMode === 'register') {
        activateAuthTab('register', { syncRoute: false });
    } else if (normalizedMode === 'verify') {
        switchToVerificationForm();
    } else if (normalizedMode === 'reset') {
        showResetPasswordForm(state.token);
    } else if (normalizedMode === 'reset-request') {
        switchToForgotPasswordForm();
    } else {
        switchToLoginForm({ syncRoute: false });
    }
    if (elements.authOverlay) {
        elements.authOverlay.classList.add('visible');
        elements.chatContainer.style.display = 'flex';
        updateLoginButtonVisibility();
        authOverlayReason = origin;
        if (shouldSyncRoute) {
            routeManager.syncAuthRoute(state, routeOptions);
        } else {
            routeManager.setAuthMode(state.mode, state.token);
        }
        persistAuthRoute(state);
    }
}

function hideAuthOverlay(manageHistory = true, options = {}) {
    const skipHandleBack = options.skipHandleBack === true;
    if (!elements.authOverlay?.classList.contains('visible')) {
        authOverlayReason = null;
        return false;
    }
    elements.authOverlay.classList.remove('visible');
    if (elements.chatContainer) {
        elements.chatContainer.style.display = 'flex';
    }
    updateLoginButtonVisibility();
    if (!currentChatId && (!elements.chatContainer?.innerHTML?.trim() || !welcomePageShown)) {
        try {
            showEmptyState();
        } catch (_) { }
    }

    const shouldPop = manageHistory && authOverlayReason === 'user';
    if (shouldPop) {
        navigationEngine.requestProgrammaticBack({ skipHandleBack });

        requestAnimationFrame(() => {
            const currentRoute = router.getCurrentRoute();
            if (currentRoute?.name === 'auth') {
                const fallbackRoute = currentChatId ? {
                    name: String(currentChatId).startsWith('temp_') ? 'tempChat' : 'chat',
                    params: { chatId: currentChatId }
                } : { name: 'home', params: {} };
                router.navigate(fallbackRoute.name, fallbackRoute.params || {}, { replace: true, silent: true });
            }
        });
    } else if (!options.routeHandled) {
        routeManager.navigateToHome({ replace: true });
    }
    authOverlayReason = null;
    routeManager.resetAuthMode();
    clearPersistedAuthRoute();
    clearMfaChallengeState();
    return shouldPop;
}

function safeNavigationCall(method, ...args) {
    const api = {
        pushUiState: (state) => {
            if (state && typeof state.close === 'function' && state.name && !uiStateStack.some(s => s.name === state.name)) {
                uiStateStack.push(state);
            }
            return state;
        },
        removeUiStateByName: (name) => {
            const idx = uiStateStack.findIndex(s => s && s.name === name);
            if (idx !== -1) {
                const [st] = uiStateStack.splice(idx, 1);
                if (st && typeof st.close === 'function') st.close();
            }
        },
        popUiState: () => {
            const st = uiStateStack.pop();
            if (st && typeof st.close === 'function') st.close();
        },
        back: () => {
            const handled = router.back({
                fallbackRoute: { name: 'home', params: {} },
                onFallback: () => navigationEngine.triggerBack()
            });
            if (handled) {
                return;
            }
        },
        go: () => { }
    };
    return api[method] ? api[method](...args) : undefined;
}

function hideSettingsModal(manageHistory = true, options = {}) {
    if (!elements.settingsModal?.classList.contains('visible')) {
        return false;
    }
    elements.settingsModal.classList.remove('visible');
    safeNavigationCall('removeUiStateByName', 'settingsModal');
    // 清除保存的设置路由信息
    if (navigationEngine) {
        navigationEngine.settingsRouteInfo = null;
    }
    if (elements.chatContainer) {
        elements.chatContainer.style.display = 'flex';
    }
    if (!currentChatId && (!welcomePageShown || !(elements.chatContainer?.innerHTML || '').trim())) {
        showEmptyState();
    }
    const currentRoute = router.getCurrentRoute();
    const isSettingsRoute = currentRoute?.name === 'settings';
    const shouldPop = manageHistory && isSettingsRoute;
    if (shouldPop) {
        navigationEngine.requestProgrammaticBack({
            skipHandleBack: options.skipHandleBack === true
        });
        requestAnimationFrame(() => {
            if (router.getCurrentRoute()?.name === 'settings') {
                const fallbackRoute = lastSettingsOriginRoute || { name: 'home', params: {} };
                router.navigate(fallbackRoute.name, fallbackRoute.params || {}, { replace: true, silent: true });
                lastSettingsOriginRoute = null;
            }
        });
    } else if (isSettingsRoute) {
        const fallbackRoute = lastSettingsOriginRoute || (currentChatId ? {
            name: String(currentChatId).startsWith('temp_') ? 'tempChat' : 'chat',
            params: { chatId: currentChatId }
        } : { name: 'home', params: {} });
        router.navigate(fallbackRoute.name, fallbackRoute.params || {}, {
            replace: true,
            silent: !lastSettingsOriginRoute
        });
        lastSettingsOriginRoute = null;
    }
    return true;
}

// 使用统计相关函数
function getUsageStats() {
    const userId = getCurrentUserId();
    const key = `usage_stats_${userId}`;
    const stats = JSON.parse(localStorage.getItem(key)) || { count: 0, date: getToday() };
    if (stats.date !== getToday()) {
        stats.count = 0;
        stats.date = getToday();
        localStorage.setItem(key, JSON.stringify(stats));
    }
    return stats;
}

function switchToVerificationForm() {
    // 隐藏滑动容器和标签页
    const authFormsContainer = document.getElementById('auth-forms-container');
    const authTabs = document.getElementById('auth-tabs');
    const verifyForm = document.getElementById('verify-form');

    if (authFormsContainer) {
        authFormsContainer.style.display = 'none';
    }
    if (authTabs) {
        authTabs.style.display = 'none';
    }

    // 显示验证表单
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    if (verifyForm) {
        verifyForm.classList.add('active');
    }
}

function showResetPasswordForm(token = '') {
    resetToken = token || resetToken;
    const authFormsContainer = document.getElementById('auth-forms-container');
    const authTabs = document.getElementById('auth-tabs');
    const resetForm = document.getElementById('reset-password-form');

    if (authFormsContainer) {
        authFormsContainer.style.display = 'none';
    }
    if (authTabs) {
        authTabs.style.display = 'none';
    }

    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    if (resetForm) {
        resetForm.classList.add('active');
    }
}

function activateAuthTab(tabType, options = {}) {
    const normalized = tabType === 'register' ? 'register' : 'login';
    const tab = document.querySelector(`.auth-tab[data-tab="${normalized}"]`);
    if (!tab) return;
    const shouldSyncRoute = options.syncRoute !== false;
    if (!shouldSyncRoute) {
        suppressAuthRouteSync = true;
        pendingAuthRouteOptions = null;
    } else {
        pendingAuthRouteOptions = options.routeOptions || { replace: true };
    }
    const authFormsContainer = document.getElementById('auth-forms-container');
    const authTabs = document.getElementById('auth-tabs');
    if (authFormsContainer) authFormsContainer.style.display = '';
    if (authTabs) authTabs.style.display = '';
    tab.click();
    routeManager.setAuthMode(normalized);
}

function switchToLoginForm(options = {}) {
    const authFormsContainer = document.getElementById('auth-forms-container');
    const authTabs = document.getElementById('auth-tabs');
    const loginForm = document.getElementById('login-form');

    if (authFormsContainer) {
        authFormsContainer.style.display = '';
    }
    if (authTabs) {
        authTabs.style.display = '';
    }

    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    if (loginForm) {
        loginForm.classList.add('active');
    }
    document.querySelectorAll('.auth-tab').forEach(tab => tab.style.display = 'flex');
    activateAuthTab('login', {
        syncRoute: options.syncRoute !== false,
        routeOptions: options.routeOptions
    });

    // 重置状态
    isWaitingVerification = false;
    currentVerificationEmail = null;
    resetToken = null;
    const registerSubmitBtn = document.querySelector('#register-form .auth-submit');
    if (registerSubmitBtn) {
        registerSubmitBtn.disabled = false;
    }
}

async function checkPasswordChangeStatus() {
    try {
        const result = await makeAuthRequest('password-change-status', {});
        const statusElement = document.getElementById('password-change-status');

        // 获取当前语言，优先使用服务器端设置
        const currentLang = currentUser ? (currentUser.language || getCurrentLanguage()) : getCurrentLanguage();

        if (result.canChange) {
            statusElement.textContent = t(currentLang, 'status.passwordCanBeChanged');
            statusElement.style.color = '#4caf50';
            document.getElementById('change-password-btn').disabled = false;
        } else {
            statusElement.textContent = t(currentLang, 'status.passwordChangeNotAllowed');
            statusElement.style.color = '#f44336';
            document.getElementById('change-password-btn').disabled = true;
        }
    } catch (error) {
        const currentLang = currentUser ? (currentUser.language || getCurrentLanguage()) : getCurrentLanguage();
        console.error(`${t(currentLang, 'console.passwordChangeStatusFailed')}:`, error);
    }
}

async function fetchUsageStats(forceRefresh = false) {
    if (!currentUser) return;
    const usageDisplay = document.getElementById('usage-display');
    const userInfoPopover = document.getElementById('user-info-popover');
    const refreshingText = getToastMessage('status.refreshing');

    if (usageDisplay) {
        usageDisplay.textContent = refreshingText;
    }
    if (userInfoPopover) {
        userInfoPopover.textContent = refreshingText;
    }

    try {
        const result = await makeApiRequest('user/usage');
        if (result.success) {
            currentUserUsage.count = result.count;
            currentUserUsage.limit = result.limit || (getCustomApiKey() ? Infinity : LOGGED_IN_LIMIT);
            currentUserUsage.apiMode = result.apiMode || currentUser.api_mode;
            currentUserUsage.hasKeys = typeof result.hasKeys === 'boolean' ? result.hasKeys : !!getCustomApiKey();
            currentUserUsage.fallbackCount = typeof result.fallbackCount === 'number'
                ? result.fallbackCount
                : ((result.fallbackRequestCount || 0) + (result.serverFallbackCount || 0));
            currentUserUsage.fallbackLimit = typeof result.fallbackLimit === 'number' ? result.fallbackLimit : 12;
            currentUserUsage.totalCount = typeof result.totalCount === 'number' ? result.totalCount : currentUserUsage.count;

            updateUsageDisplay();
        }
    } catch (error) {
        console.error(`${getToastMessage('console.usageStatsFailed')}:`, error);

        const errorText = getToastMessage('ui.error') + ': ' + getToastMessage('console.usageStatsFailed');
        if (usageDisplay) {
            usageDisplay.textContent = errorText;
        }
        if (userInfoPopover) {
            userInfoPopover.textContent = errorText;
        }
    }
}

async function fetchGuestUsageStats() {
    if (currentUser) return;

    guestUsageStats.count = 0;
    guestUsageStats.loaded = false;
    guestUsageStats.limit = GUEST_LIMIT;
    updateUsageDisplay();
}

function refreshUsageStats(forceRefresh = false) {
    if (currentUser) {
        return fetchUsageStats(forceRefresh);
    }
    return fetchGuestUsageStats();
}

function checkUsageLimit() {
    if (!currentUser || !currentUserUsage) {
        return { count: 0, limit: 12 };
    }

    return {
        count: currentUserUsage.count || 0,
        limit: currentUserUsage.limit || 12
    };
}

function updateUsageDisplay() {
    const usageDisplay = document.getElementById('usage-display');
    if (!usageDisplay) return;

    const userInfoPopover = document.getElementById('user-info-popover');

    if (!currentUser) {
        if (elements.usageStats) {
            elements.usageStats.style.display = 'none';
        }
        usageDisplay.textContent = '';
        if (userInfoPopover) {
            userInfoPopover.textContent = '';
        }
        return;
    }

    const usage = checkUsageLimit();
    let text;

    const hasKeys = (typeof (currentUserUsage?.hasKeys) === 'boolean')
        ? currentUserUsage.hasKeys
        : !!getCustomApiKey();

    const fallbackCount = typeof (currentUserUsage?.fallbackCount) === 'number'
        ? currentUserUsage.fallbackCount
        : 0;

    if (!hasKeys) {
        text = getToastMessage('ui.todayUsageNoKeys', { count: usage.count });
    } else if ((currentUserUsage?.apiMode) === 'server_fallback') {
        text = getToastMessage('ui.todayUsageServerFallback', { count: fallbackCount });
    } else {
        text = getToastMessage('ui.todayUsage', { count: usage.count });
    }

    if (elements.usageStats) {
        elements.usageStats.style.display = 'block';
    }
    usageDisplay.textContent = text;
    if (userInfoPopover) {
        userInfoPopover.textContent = text;
    }
}
function refreshSettingsI18nTexts() {
    try {
        if (!elements.settingsModal) return;
        // 保存按钮文案
        if (elements.settingsSaveBtn) {
            elements.settingsSaveBtn.textContent = getToastMessage('status.saveKeySettings');
        }
        // API Key 配置状态文案
        if (elements.apiKeyStatus) {
            if (currentUser) {
                const storedKey = currentUser.custom_api_key || '';
                const hasKeysForUI = !!(storedKey || currentUser.custom_api_key_t);
                const savedModeRaw = hasKeysForUI ? (currentUser.api_mode || 'mixed') : 'mixed';
                const savedMode = savedModeRaw === 'server_fallback' ? 'mixed' : savedModeRaw;
                if (storedKey) {
                    const modeText = savedMode === 'mixed'
                        ? getToastMessage('ui.mixedMode')
                        : getToastMessage('ui.singleMode');
                    elements.apiKeyStatus.textContent = `${getToastMessage('status.apiKeyConfiguredWithMode', { mode: modeText })}`;
                } else {
                    elements.apiKeyStatus.textContent = getToastMessage('status.apiKeyNotConfigured');
                }
            } else {
                const { keyOne, keyTwo, mode } = getGuestKeySettings();
                if (keyOne || keyTwo) {
                    const modeText = (mode || 'mixed') === 'mixed'
                        ? getToastMessage('ui.mixedMode')
                        : getToastMessage('ui.singleMode');
                    elements.apiKeyStatus.textContent = `${getToastMessage('status.apiKeyConfiguredWithMode', { mode: modeText })}`;
                } else {
                    elements.apiKeyStatus.textContent = getToastMessage('status.apiKeyNotConfigured');
                }
            }
        }
        updateUsageDisplay();
    } catch (_) { }
}

async function uploadImage(file) {
    try {
        const formData = new FormData();
        formData.append('avatar', file);

        showToast(getToastMessage('toast.uploadingAvatar'), 'info');

        const response = await fetch('/api/user/upload-avatar', {
            method: 'POST',
            headers: {
                'X-Session-ID': sessionId,
            },
            body: formData,
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || `${getToastMessage('errors.uploadFailed')} (${response.status})`);
        }

        showToast(getToastMessage('toast.avatarUploadSuccess'), 'success');

        return result.avatarUrl;

    } catch (error) {
        showToast(`${getToastMessage('toast.avatarUpdateFailed')}: ${error.message}`, 'error');
        throw error;
    }
}

// 认证相关函数
async function _makeRequest(prefix, endpoint, options = {}) {
    const { isSessionCheck = false, isBackgroundSync = false } = options;

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (sessionId) {
        headers['X-Session-ID'] = sessionId;
    } else if (prefix === '/api/') {
        headers['X-Visitor-ID'] = await getGuestVisitorId();
    }


    try {
        const response = await fetch(`${prefix}${endpoint}`, { ...options, headers });

        if (response.status === 401 && (currentUser || sessionId)) {
            if (!isSessionCheck && !isBackgroundSync) {
                showToast(getToastMessage('toast.sessionExpired'), 'error');

                const expiredSessionId = sessionId;
                sessionId = null;
                currentUser = null;
                refreshSecurityMfaToggleFromUser?.();
                updateCurrentPasswordPlaceholderInput();
                localStorage.removeItem('sessionId');
                if (expiredSessionId) {
                    localStorage.removeItem(`user_cache_${expiredSessionId}`);
                }
                localStorage.removeItem('userThemePreset');

                updateUI();
                openAuthOverlay('auto', { mode: 'login' }, { syncRoute: true, routeOptions: { replace: true } });
            }
            const error = new Error(getToastMessage('errors.sessionInvalidOrExpired'));
            error.isAuthError = true;
            throw error;
        }

        if (!response.ok) {
            let errorMessage = `${getToastMessage('errors.requestFailed')}: ${response.status}`;
            try {
                const responseText = await response.text();
                if (responseText.trim()) {
                    const result = JSON.parse(responseText);
                    errorMessage = result.error || errorMessage;
                }
            } catch (parseError) {
                // 如果解析失败，使用默认错误消息
            }
            const error = new Error(errorMessage);
            error.status = response.status;
            error.isAuthError = response.status === 401 || response.status === 403;
            throw error;
        }
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return { success: true };
        }

        let result;
        try {
            const responseText = await response.text();

            if (!responseText.trim()) {
                console.error('Empty response body from server');
                throw new Error('Empty response from server');
            }
            result = JSON.parse(responseText);
        } catch (parseError) {
            throw new Error('Invalid response format from server');
        }

        if (result.success === false) {
            const error = new Error(result.error || 'API returned a failure status.');
            error.isApiError = true;
            throw error;
        }

        return result;

    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            const networkError = new Error(getToastMessage('errors.networkConnectionFailed'));
            networkError.isNetworkError = true;
            throw networkError;
        }

        if (error.message.includes('Failed to fetch')) {
            const networkError = new Error(getToastMessage('errors.networkConnectionFailed'));
            networkError.isNetworkError = true;
            throw networkError;
        }

        throw error;
    }
}
function makeAuthRequest(endpoint, data, extraOptions = {}) {
    const options = {
        method: 'POST',
        body: JSON.stringify(data),
        ...(extraOptions || {})
    };

    if (endpoint === 'me') {
        options.isSessionCheck = true;
    }
    return _makeRequest('/auth/', endpoint, options);
}

function makeApiRequest(endpoint, options = {}) {
    return _makeRequest('/api/', endpoint, options);
}

async function fetchWeeklyFeatureStatus() {
    if (!currentUser) {
        weeklyFeatureStatus = { can_use: false, expires_at: null, loaded: true };
        updateWeeklyTimer();
        return;
    }
    try {
        const result = await makeApiRequest('feature/status');
        if (result.success) {
            const wasExpired = weeklyFeatureStatus.expires_at && !weeklyFeatureStatus.can_use;
            weeklyFeatureStatus.can_use = result.can_use;
            weeklyFeatureStatus.expires_at = result.expires_at;
            weeklyFeatureStatus.usage_count = result.usage_count || 0;
            weeklyFeatureStatus.remaining_count = result.remaining_count || 3;
            weeklyFeatureStatus.max_count = result.max_count || 3;

            if (wasExpired && result.can_use && !result.expires_at) {
                aiParameters = {
                    systemPrompt: '',
                    temperature: 0.5,
                    topK: 40,
                    topP: 0.95,
                };
                updateAIParameterUI();
                showToast(getToastMessage('toast.advancedFeatureReset'), 'info');
            }
        } else {
            showToast(getToastMessage('toast.cannotVerifyAdvancedFeature'), "error");
            weeklyFeatureStatus.can_use = false;
        }
    } catch (error) {
        console.error(`${getToastMessage('console.featureStatusFailed')}:`, error);
        showToast(getToastMessage('toast.cannotGetAdvancedFeature'), "error");
    } finally {
        weeklyFeatureStatus.loaded = true;
        updateWeeklyTimer();
    }
}

function updateWeeklyReportUIState() {
    if (!currentUser) return;

    const currentLang = currentUser.language || getCurrentLanguage();

    const isInCooldown = weeklyFeatureStatus.loaded &&
        weeklyFeatureStatus.expires_at &&
        new Date() < new Date(weeklyFeatureStatus.expires_at) &&
        !weeklyFeatureStatus.can_use;

    if (isInCooldown) {
        elements.saveSettingsBtn.disabled = true;
        elements.saveSettingsBtn.textContent = t(currentLang, 'status.coolingDown');
        elements.saveSettingsBtn.title = t(currentLang, 'status.advancedFeatureInCooldownCannotSave');
    } else {
        elements.saveSettingsBtn.disabled = false;
        elements.saveSettingsBtn.textContent = t(currentLang, 'status.saveSettings');
        elements.saveSettingsBtn.title = '';
    }
}

const updateWeeklyTimer = () => {
    if (!elements.weeklyTimerDisplay) return;

    // 获取当前语言，优先使用服务器端设置
    const currentLang = currentUser ? (currentUser.language || getCurrentLanguage()) : getCurrentLanguage();

    if (!currentUser) {
        elements.weeklyTimerDisplay.style.display = 'none';
        updateWeeklyReportUIState();
        return;
    }
    elements.weeklyTimerDisplay.style.display = 'block';

    if (!weeklyFeatureStatus.loaded) {
        elements.weeklyTimerDisplay.textContent = t(currentLang, 'status.loadingFeatureStatus');
        return;
    }
    const now = new Date();

    if (weeklyFeatureStatus.can_use) {
        if (weeklyFeatureStatus.expires_at) {
            const fortyEightHourExpiry = new Date(weeklyFeatureStatus.expires_at);
            const diff = fortyEightHourExpiry - now;
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            elements.weeklyTimerDisplay.textContent = `${t(currentLang, 'status.advancedFeatureValid')}: ${hours}${t(currentLang, 'status.hours')} ${minutes}${t(currentLang, 'status.minutes')} ${seconds}${t(currentLang, 'status.seconds')}`;
        } else {
            elements.weeklyTimerDisplay.textContent = t(currentLang, 'status.advancedFeatureAvailable');
        }
        updateWeeklyReportUIState();
        return;
    }

    // 48小时冷却期逻辑
    if (weeklyFeatureStatus.expires_at) {
        const fortyEightHourExpiry = new Date(weeklyFeatureStatus.expires_at);

        if (now < fortyEightHourExpiry) {
            const diff = fortyEightHourExpiry - now;
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            elements.weeklyTimerDisplay.textContent = `${t(currentLang, 'status.advancedFeatureCooling')}: ${hours}${t(currentLang, 'status.hours')} ${minutes}${t(currentLang, 'status.minutes')} ${seconds}${t(currentLang, 'status.seconds')}`;
        } else {
            elements.weeklyTimerDisplay.textContent = t(currentLang, 'status.advancedFeatureResetting');
            fetchWeeklyFeatureStatus().catch(err => console.error(`${t(currentLang, 'console.weeklyFeatureStatusFailed')}:`, err));
        }
    } else {
        elements.weeklyTimerDisplay.textContent = t(currentLang, 'status.advancedFeatureUnavailable');
    }

    updateWeeklyReportUIState();
};

async function applyAuthenticatedSession(result, options = {}) {
    if (!result || !result.sessionId || !result.user) {
        throw new Error(getToastMessage('errors.serverError'));
    }

    sessionId = result.sessionId;
    localStorage.setItem('sessionId', sessionId);
    localStorage.setItem('userId', result.user?.id || '');
    currentUser = result.user;
    updateCurrentPasswordPlaceholderInput();
    refreshSecurityMfaToggleFromUser?.();
    window.currentUser = result.user;
    clearPersistedAuthRoute();
    routeManager.resetAuthMode();
    clearPendingOAuthState();

    await applyTheme(currentUser.theme_settings);

    if (currentUser.theme_settings?.preset) {
        localStorage.setItem('userThemePreset', currentUser.theme_settings.preset);
    }

    if (currentUser.language) {
        localStorage.setItem('selectedLanguage', currentUser.language);
    }

    try {
        localStorage.setItem(`user_cache_${sessionId}`, JSON.stringify(sanitizeUserForCache(currentUser)));
    } catch (cacheError) {
        console.error('Failed to cache user info:', cacheError);
    }

    await deleteChatsFromDB('guest');
    localStorage.removeItem('usage_stats_guest');
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('pending_chat_')) {
            localStorage.removeItem(key);
        }
    });

    chats = {};
    currentChatId = null;
    if (elements.chatContainer) {
        elements.chatContainer.style.display = 'flex';
    }

    const showSuccessToast = options.showSuccessToast !== false;
    const successToastKey = options.successToastKey || 'toast.loginSuccess';
    const successToastRoute = options.toastRoute ?? 'home';

    const finalizePostLoginUI = (useLanguageContext = true) => {
        if (useLanguageContext && currentUser.language) {
            showEmptyState(false, currentUser.language);
        } else {
            showEmptyState();
        }
        scheduleRenderSidebar();
        updateUI();
        if (showSuccessToast) {
            queueLoginSuccessToast(successToastKey, { route: successToastRoute });
        } else {
            queueLoginSuccessToast(null);
        }
        notifyBackendCacheInvalidation('user_login', { userId: currentUser.id });
    };

    requestAnimationFrame(() => {
        const authOverlayVisible = elements.authOverlay?.classList.contains('visible');
        if (authOverlayVisible) {
            hideAuthOverlay();
        } else {
            routeManager.resetAuthMode();
            clearPersistedAuthRoute();
            clearMfaChallengeState();
        }

        const currentRoute = router?.getCurrentRoute?.();
        if (!currentRoute || currentRoute.name !== 'home') {
            routeManager.navigateToHome({ replace: true });
        }

        const afterLangApplied = () => finalizePostLoginUI(true);

        if (currentUser.language) {
            applyLanguage(currentUser.language)
                .then(afterLangApplied)
                .catch(() => finalizePostLoginUI(false));
        } else {
            try {
                const browserLang = navigator.language || (Array.isArray(navigator.languages) && navigator.languages[0]) || 'zh-CN';
                const defaultLang = (browserLang && (browserLang.startsWith('zh-TW') || browserLang.startsWith('zh-HK'))) ? 'zh-TW'
                    : (browserLang && browserLang.startsWith('zh')) ? 'zh-CN'
                        : (browserLang && browserLang.startsWith('ja')) ? 'ja'
                            : (browserLang && browserLang.startsWith('ko')) ? 'ko'
                                : (browserLang && browserLang.startsWith('es')) ? 'es'
                                    : (browserLang && browserLang.startsWith('en')) ? 'en'
                                        : 'zh-CN';
                localStorage.setItem('selectedLanguage', defaultLang);
                currentUser.language = defaultLang;
                try {
                    localStorage.setItem(`user_cache_${sessionId}`, JSON.stringify(sanitizeUserForCache(currentUser)));
                } catch (_) { }
                applyLanguage(defaultLang).then(afterLangApplied).catch(() => finalizePostLoginUI(false));
                try { makeAuthRequest('update-language', { language: defaultLang }); } catch (_) { }
            } catch (_) {
                finalizePostLoginUI(false);
            }
        }
    });

    resetToDefaultModel();
    refreshUsageStats().catch(err => console.error(`${getToastMessage('console.usageStatsFailed')}:`, err));
    fetchWeeklyFeatureStatus().catch(err => console.error(`${getToastMessage('console.weeklyFeatureStatusFailed')}:`, err));
    loadUserAIParameters().catch(err => console.error(`${getToastMessage('console.aiParametersLoadFailed')}:`, err));
    loadChats(true).catch(err => console.error(`${getToastMessage('console.chatHistoryLoadFailed')}:`, err));
    hideLoadingScreen();
}

async function login(email, password) {
    if (isMultiSelectMode) {
        exitMultiSelectMode();
    }

    // 重置导航引擎的退出状态
    navigationEngine.resetExitState();

    if (isProcessing) {
        const confirmed = await showCustomConfirm(
            getToastMessage('dialog.confirmLeave'),
            getToastMessage('dialog.aiGeneratingResponseWarning'),
            ICONS.LOGIN,
            { manageHistory: false }
        );
        if (!confirmed) {
            // 用户点击取消，关闭登录页面，返回聊天页面
            hideAuthOverlay();
            return false;
        }
        stopGeneration();
    }

    try {
        const guestChatsExist = chats && Object.keys(chats).some(id => id.startsWith('temp_'));
        if (guestChatsExist) {
            const hasMessages = Object.keys(chats).some(id => {
                const chat = chats[id];
                return chat &&
                    chat.messages &&
                    chat.messages.length > 0;
            });

            if (hasMessages) {
                const confirmed = await showCustomConfirm(
                    getToastMessage('dialog.loginConfirmation'),
                    getToastMessage('dialog.loginConfirmationMessage'),
                    ICONS.HELP,
                    { manageHistory: false }
                );

                if (!confirmed) {
                    // 用户点击取消，关闭登录页面，返回聊天页面
                    hideAuthOverlay();
                    return false;
                }
            }
        }
        const result = await makeAuthRequest('login', { email, password });
        const challenge = extractMfaChallenge(result);
        if (challenge) {
            clearMfaChallengeState();
            setPendingMfaChallenge(challenge);
            showMfaVerificationForm(challenge);
            return false;
        }
        await applyAuthenticatedSession(result, { successToastKey: 'toast.loginSuccess', toastRoute: null });
        return true;
    } catch (error) {
        showToast(error.message, 'error');
        return false;
    }
}

function setupOAuthButtons() {
    setupOAuthButtonsImpl(buildOAuthContext());
}

function setupNativeOAuthDeepLinkHandler() {
    setupNativeOAuthDeepLinkHandlerImpl(buildOAuthContext());
}

async function logout() {
    if (isMultiSelectMode) {
        exitMultiSelectMode();
    }

    // 重置导航引擎的退出状态
    navigationEngine.resetExitState();

    if (!currentUser && !sessionId) return;

    if (isProcessing) {
        const confirmed = await showCustomConfirm(
            getToastMessage('dialog.logoutConfirmation'),
            getToastMessage('dialog.logoutConfirmationMessage'),
            ICONS.LOGOUT,
            { manageHistory: false }
        );
        if (!confirmed) {
            return;
        }
        stopGeneration();
    }

    const sessionIdToClean = sessionId;

    try {
        if (sessionId) {
            await makeAuthRequest('logout', {});
        }
    } catch (error) {
        console.error(`${getToastMessage('console.logoutRequestFailedProceedingWithCleanup')}:`, error);
    } finally {
        notifyBackendCacheInvalidation('user_logout', { sessionId: sessionIdToClean });
        sessionId = null;
        currentUser = null;
        refreshSecurityMfaToggleFromUser?.();
        updateCurrentPasswordPlaceholderInput();
        simpleCache.cache.clear();
        localStorage.removeItem('sessionId');

        if (sessionIdToClean) {
            localStorage.removeItem(`user_cache_${sessionIdToClean}`);
        }

        // 清理用户和访客数据
        try {
            if (currentUser?.id) {
                await deleteChatsFromDB(currentUser.id);
            }
            await deleteChatsFromDB('guest');
            localStorage.removeItem('usage_stats_guest');
        } catch (dbError) {
            console.error('Failed to clear data from IndexedDB during logout:', dbError);
        }

        if (window.requestIdleCallback) {
            requestIdleCallback(() => {
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('pending_chat_')) {
                        asyncStorage.removeItem(key);
                    }
                });
            }, { timeout: 2000 });
        }

        localStorage.removeItem('userThemePreset');
        localStorage.removeItem('userThemeSettings');
        localStorage.removeItem('guestThemeSettings');

        chats = {};
        currentChatId = null;
        attachments = [];
        chatDraftStore.clear();
        activeResponses.clear();
        currentUserUsage = { count: 0, limit: LOGGED_IN_LIMIT, apiMode: 'mixed' };
        weeklyFeatureStatus = { can_use: true, expires_at: null, loaded: false };

        aiParameters = {
            systemPrompt: '',
            temperature: 0.5,
            topK: 40,
            topP: 0.95,
            taskPreset: ''
        };

        currentQuote = null;
        wasImageGenerated = false;
        guestVisitorId = null;

        if (weeklyTimerInterval) clearInterval(weeklyTimerInterval);

        resetToDefaultModel();
        routeManager.navigateToHome({ replace: true, force: true });
        try {
            window.history.replaceState(null, document.title, '/');
        } catch (_) { }

        requestAnimationFrame(() => {
            updateUI(false);
            scheduleRenderSidebar();

            setTimeout(() => {
                // 应用浏览器默认语言
                const browserLang = navigator.language || navigator.languages[0] || 'zh-CN';
                const defaultLang = browserLang.startsWith('zh') ? 'zh-CN' :
                    browserLang.startsWith('ja') ? 'ja' :
                        browserLang.startsWith('ko') ? 'ko' :
                            browserLang.startsWith('es') ? 'es' :
                                browserLang.startsWith('en') ? 'en' : 'zh-CN';

                applyLanguage(defaultLang).then(() => {
                    intentAnalyzer.clearKeywordCache();
                    localStorage.removeItem('selectedLanguage');
                    if (elements.chatContainer) {
                        elements.chatContainer.style.display = 'flex';
                    }

                    hideAuthOverlay();
                    showEmptyState(false, defaultLang);
                    showToast(getToastMessage('toast.logoutSuccess'), 'info');
                }).catch((error) => {
                    intentAnalyzer.clearKeywordCache();
                    localStorage.removeItem('selectedLanguage');
                    if (elements.chatContainer) {
                        elements.chatContainer.style.display = 'flex';
                    }

                    hideAuthOverlay();
                    showEmptyState(false, defaultLang);
                    showToast(getToastMessage('toast.logoutSuccess'), 'info');
                });
            }, 100);
        });

        applyTheme({ font: 'system', background_url: null }).catch(console.error);

        const settingsModal = document.getElementById('settings-modal-overlay');
        if (settingsModal.classList.contains('visible')) {
            navigationEngine.settingsRouteInfo = null;
            lastSettingsOriginRoute = null;
            routeManager.navigateToHome({ replace: true, force: true, silent: true });
            hideSettingsModal(false, { skipHandleBack: true });
        }

        // 关闭右侧抽屉
        if (elements.rightSidebarToggleBtn && document.body.classList.contains('right-sidebar-open')) {
            document.body.classList.remove('right-sidebar-open');
            elements.rightSidebarToggleBtn.setAttribute('aria-expanded', 'false');
        }
    }
}

async function handlePasswordResetToken(initialToken = null) {
    const urlParams = new URLSearchParams(window.location.search || '');
    let token = initialToken || urlParams.get('token');
    if (!token) {
        const pathSegments = (window.location.pathname || '').split('/').filter(Boolean);
        if (pathSegments[0] === 'auth' && pathSegments[1] === 'reset-password') {
            token = pathSegments[2] ? decodeURIComponent(pathSegments[2]) : null;
        }
    }

    if (token) {
        if (elements.chatContainer) {
            elements.chatContainer.style.display = 'none';
        }

        const handleResetTokenError = (errorMessage) => {
            switchToLoginForm({ syncRoute: true, routeOptions: { replace: true } });
            if (elements.chatContainer) {
                elements.chatContainer.style.display = 'none';
            }
            if (elements.authOverlay) {
                elements.authOverlay.classList.add('visible');
            }
            setTimeout(() => {
                showToast(errorMessage, 'error');
            }, 100);
        };

        try {
            const result = await makeAuthRequest('validate-reset-token', { token });

            if (!result.success) {
                handleResetTokenError(result.error || 'Reset link invalid');
            } else {
                openAuthOverlay('route', { mode: 'reset', token }, { syncRoute: true, routeOptions: { replace: true } });
                if (elements.chatContainer) {
                    elements.chatContainer.style.display = 'none';
                }
            }
        } catch (error) {
            handleResetTokenError(error.message || 'Reset link invalid');
        }
    }
}

let sessionValidationPromise = null;
async function checkSession() {
    if (!sessionId) {
        return false;
    }

    if (sessionValidationPromise) {
        return sessionValidationPromise;
    }

    const cachedUser = simpleCache.get(`user_session_${sessionId}`);
    if (cachedUser) {
        currentUser = cachedUser;
        updateCurrentPasswordPlaceholderInput();
        refreshSecurityMfaToggleFromUser?.();
        if (currentUser.language) {
            asyncStorage.setItem('selectedLanguage', currentUser.language);
        }

        sessionValidationPromise = makeAuthRequest('me').then(async result => {
            if (result.success && result.user) {
                const previousLanguage = currentUser?.language || null;
                currentUser = { ...(currentUser || {}), ...result.user };
                updateCurrentPasswordPlaceholderInput();
                refreshSecurityMfaToggleFromUser?.();
                simpleCache.set(`user_session_${sessionId}`, currentUser, 60000);

                if (result.user.language) {
                    asyncStorage.setItem('selectedLanguage', result.user.language);
                    if (previousLanguage && previousLanguage !== result.user.language) {
                        intentAnalyzer.clearKeywordCache();
                    }
                }

                if (result.user.theme_settings) {
                    asyncStorage.setItem('userThemeSettings', JSON.stringify(result.user.theme_settings));
                    if (result.user.theme_settings.preset) {
                        asyncStorage.setItem('userThemePreset', result.user.theme_settings.preset);
                    }
                }

                await applyUserPreferencesFromProfile(currentUser);
            }
        }).catch((error) => {
            console.warn(getToastMessage('console.backgroundUserInfoUpdateFailed'), error);
        }).finally(() => {
            sessionValidationPromise = null;
        });

        return true;
    }

    const cachedUserFromStorage = localStorage.getItem(`user_cache_${sessionId}`);
    if (cachedUserFromStorage) {
        try {
            currentUser = JSON.parse(cachedUserFromStorage);
            updateCurrentPasswordPlaceholderInput();
            refreshSecurityMfaToggleFromUser?.();
            if (currentUser && typeof currentUser === 'object') {
                delete currentUser.custom_api_key;
                delete currentUser.custom_api_key_t;
            }

            if (currentUser.language) {
                localStorage.setItem('selectedLanguage', currentUser.language);
            }
        } catch (e) {
            console.error(`${getToastMessage('console.failedToParseCachedUser')}:`, e);
        }
    }

    sessionValidationPromise = (async () => {
        try {
            const result = await makeAuthRequest('me', {});

            if (result.success && result.user) {
                const previousLanguage = currentUser?.language || null;
                currentUser = result.user;
                updateCurrentPasswordPlaceholderInput();
                refreshSecurityMfaToggleFromUser?.();
                simpleCache.set(`user_session_${sessionId}`, result.user, 60000);

                if (currentUser.theme_settings) {
                    if (currentUser.theme_settings.preset) {
                        asyncStorage.setItem('userThemePreset', currentUser.theme_settings.preset);
                    }
                    asyncStorage.setItem('userThemeSettings', JSON.stringify(currentUser.theme_settings));
                }

                if (currentUser.language) {
                    asyncStorage.setItem('selectedLanguage', currentUser.language);
                }

                await applyUserPreferencesFromProfile(currentUser);
                if (previousLanguage && currentUser.language && previousLanguage !== currentUser.language) {
                    intentAnalyzer.clearKeywordCache();
                }

                asyncStorage.setItem(`user_cache_${sessionId}`, JSON.stringify(sanitizeUserForCache(currentUser)));

                if (currentUser && (currentUser.custom_api_key || currentUser.custom_api_key_t)) {
                    checkKeyValidationOnLogin();
                }

                try {
                    updateUI(false);
                } catch (_) { }

                refreshUsageStats().catch(err => console.error(`${getToastMessage('console.usageStatsFailed')}:`, err));
                fetchWeeklyFeatureStatus().catch(err => console.error(`${getToastMessage('console.weeklyFeatureStatusFailed')}:`, err));

                return true;
            }
            throw new Error(getToastMessage('errors.invalidUserDataFromServer'));
        } catch (error) {
            if (error.status === 401 || error.status === 400) {
                const tempSessionId = sessionId;
                sessionId = null;
                currentUser = null;
                refreshSecurityMfaToggleFromUser?.();
                updateCurrentPasswordPlaceholderInput();
                localStorage.removeItem('sessionId');
                asyncStorage.removeItem(`user_cache_${tempSessionId}`);
                updateUI();
            }
            return false;
        } finally {
            sessionValidationPromise = null;
        }
    })();

    if (cachedUserFromStorage) {
        return true;
    }
    return sessionValidationPromise;
}

async function updateApiKey(apiKey, mode = 'mixed', options = {}) {
    const { context = 'keys', suppressToast = false } = options;
    try {
        const result = await makeAuthRequest('update-api-key', { apiKey, mode });

        const hasAnyKey = !!(apiKey && String(apiKey).trim());
        const serverMode = (result && result.validationResults && result.validationResults.newApiMode)
            ? result.validationResults.newApiMode
            : (mode || (currentUser.api_mode || 'mixed'));

        currentUser.custom_api_key = (hasAnyKey ? apiKey : null);
        currentUser.api_mode = serverMode;

        if (!suppressToast) {
            if (context === 'mode') {
                const modeLabel = (mode === 'mixed')
                    ? getToastMessage('ui.mixedMode')
                    : getToastMessage('ui.singleMode');
                showToast(getToastMessage('status.modeSwitchedTo', { mode: modeLabel }), 'success');
            } else {
                showToast(getToastMessage('toast.apiKeyUpdateSuccess'), 'success');
            }
        }
        if (context !== 'mode') {
            updateUI();
        }
        try {
            if (context !== 'mode') {
                await refreshUsageStats(true);
                updateUsageDisplay();
            }
        } catch (_) { }

        if (!hasAnyKey) {
            try {
                const kv = document.getElementById('key-validation-modal-overlay');
                if (kv) kv.remove();
                pendingKeyValidationStatus = null;
                keyValidationPrefetched = false;
            } catch (_) { }
        }
        if (context !== 'mode' && hasAnyKey) {
            notifyBackendCacheInvalidation('api_key_updated', { mode: serverMode });

            try {
                if (sessionId) {
                    localStorage.setItem(`user_cache_${sessionId}`, JSON.stringify(sanitizeUserForCache(currentUser)));
                }
            } catch (_) { }
        }

        return serverMode;
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    }
}

function shouldPreserveEphemeralChat(chatId, chatData) {
    if (!chatData) return false;
    if (chatData.isTemp) return true;
    return String(chatId || '').startsWith('temp_');
}

function extractEphemeralChats(source = chats) {
    if (!source) return {};
    const preserved = {};
    for (const [chatId, chatData] of Object.entries(source)) {
        if (shouldPreserveEphemeralChat(chatId, chatData)) {
            preserved[chatId] = chatData;
        }
    }
    return preserved;
}

function mergeEphemeralChats(baseChats = {}, ephemeralChats = {}) {
    const merged = { ...(baseChats || {}) };
    if (!ephemeralChats) {
        return merged;
    }
    for (const [chatId, chatData] of Object.entries(ephemeralChats)) {
        if (!merged[chatId]) {
            merged[chatId] = chatData;
        }
    }
    return merged;
}

function replaceChatsPreservingEphemeral(nextChats = {}) {
    const ephemeral = extractEphemeralChats();
    chats = mergeEphemeralChats(nextChats || {}, ephemeral);
}

async function loadChats(isSessionValid = false) {
    if (!isSessionValid && !currentUser) {
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    const loader = document.getElementById('chat-history-loader');
    const forceServerChatsReload = currentUser && localStorage.getItem('forceServerChatsReload') === '1';

    if (currentUser && isSessionValid) {
        try {
            let cachedChats = null;
            if (forceServerChatsReload) {
                try {
                    await deleteChatsFromDB(currentUser.id);
                } catch (error) {
                    console.warn('Failed to delete cached chats during forced reload:', error);
                }
                replaceChatsPreservingEphemeral({});
                if (loader) loader.style.display = 'flex';
            } else {
                cachedChats = await getChatsFromDB(currentUser.id);
                if (cachedChats) {
                    replaceChatsPreservingEphemeral(cachedChats);
                    renderSidebar();
                } else if (loader) {
                    loader.style.display = 'flex';
                }
            }
            makeApiRequest('chats/conversations').then(async (result) => {
                if (result.success) {
                    const serverChats = {};
                    for (const conv of result.conversations) {
                        serverChats[conv.id] = {
                            id: conv.id,
                            title: conv.title,
                            model_name: conv.model_name,
                            created_at: conv.created_at,
                            updated_at: conv.updated_at,
                            messages: []
                        };
                    }

                    const mergedChats = { ...serverChats };

                    if (cachedChats) {
                        for (const [chatId, serverChat] of Object.entries(serverChats)) {
                            const localChat = cachedChats[chatId];
                            if (localChat && localChat.messages && localChat.messages.length > 0) {
                                mergedChats[chatId] = {
                                    ...serverChat,
                                    messages: localChat.messages
                                };
                            }
                        }
                    }

                    preloadChatContents(mergedChats, currentUser.id).catch(err =>
                        console.warn('Failed to preload chat contents:', err)
                    );

                    await saveChatsToDB(currentUser.id, mergedChats);
                    replaceChatsPreservingEphemeral(mergedChats);
                    renderSidebar();

                    if (loader) {
                        loader.style.display = 'none';
                    }

                    if (forceServerChatsReload) {
                        localStorage.removeItem('forceServerChatsReload');
                    }

                    if (cachedChats) {
                        const serverChatIds = new Set(Object.keys(serverChats));
                        const localChatIds = Object.keys(cachedChats);
                        const deletedChatIds = localChatIds.filter(chatId => !serverChatIds.has(chatId));
                    }
                }
            }).catch((error) => {
                if (loader) {
                    loader.style.display = 'none';
                }
            });
        } catch (error) {
            if (loader && (!chats || Object.keys(chats).length === 0)) {
                loader.style.display = 'flex';
                const loadingText = loader.querySelector('.loading-text');
                if (loadingText) loadingText.textContent = getToastMessage('status.recordLoadFailed');
                const spinner = loader.querySelector('.loading-spinner');
                if (spinner) spinner.style.display = 'none';
            }
        }
    } else {
        const localChats = await getChatsFromDB('guest');
        replaceChatsPreservingEphemeral(localChats || {});
        renderSidebar();
    }
}
// UI更新函数
function updateUI(showLoginPage = true) {
    const userAvatarButton = document.getElementById('user-avatar-button');

    elements.userNameDisplay.style.display = 'none';
    userAvatarButton.style.display = 'none';

    if (currentUser) {
        // 如果用户已登录，确保隐藏登录页面
        hideAuthOverlay();
    }

    updateLoginButtonVisibility();

    const apiNavItem = document.querySelector('.settings-nav-item[data-page="api"]');
    if (apiNavItem) apiNavItem.style.display = '';

    if (currentUser) {
        if (!currentUserUsage.limit || currentUserUsage.limit === LOGGED_IN_LIMIT) {
            currentUserUsage.limit = getCustomApiKey() ? Infinity : LOGGED_IN_LIMIT;
        }

        const name = currentUser.username || currentUser.email;

        requestAnimationFrame(() => {
            elements.userNameDisplay.textContent = name;
            elements.userNameDisplay.style.display = 'block';

            userAvatarButton.innerHTML = '';
            userAvatarButton.style.display = 'flex';

            if (currentUser.avatar_url) {
                const img = document.createElement('img');
                img.src = currentUser.avatar_url;
                img.alt = getToastMessage('ui.userAvatar');
                img.onerror = () => {
                    userAvatarButton.innerHTML = '';
                    userAvatarButton.textContent = name ? name.charAt(0).toUpperCase() : 'U';
                };
                userAvatarButton.appendChild(img);
            } else {
                userAvatarButton.textContent = name ? name.charAt(0).toUpperCase() : 'U';
            }
        });

        document.getElementById('edit-profile-section').style.display = 'block';
        elements.editUsernameInput.value = currentUser.username || '';
        checkPasswordChangeStatus().catch(err => console.error(`${getToastMessage('console.passwordChangeStatusFailed')}:`, err));

        elements.rightSidebarToggleBtn.style.display = 'flex';
        // 兼容旧存储：custom_api_key 可能为逗号分隔的两个key
        const storedKey = currentUser.custom_api_key || '';
        if (elements.apiKeyOneInput && elements.apiKeyTwoInput) {
            const [k1 = '', k2 = ''] = (storedKey || '').split(',');
            elements.apiKeyOneInput.value = k1;
            elements.apiKeyTwoInput.value = k2;

            const hasKeysForUI = !!(storedKey || currentUser.custom_api_key_t);
            const savedModeRaw = hasKeysForUI ? (currentUser.api_mode || 'mixed') : 'mixed';
            const savedMode = savedModeRaw === 'server_fallback' ? 'mixed' : savedModeRaw;
            let modeInput = document.querySelector(`input[name="api-mode"][value="${savedMode}"]`);
            if (modeInput) {
                modeInput.checked = true;
            } else {
                modeInput = document.querySelector(`input[name="api-mode"][value="mixed"]`);
                if (modeInput) modeInput.checked = true;
            }
        } else if (elements.apiKeyInput) {
            elements.apiKeyInput.value = storedKey;
        }

        try {
            keyOneTouched = false;
            keyTwoTouched = false;
            setOriginalApiKeys();
        } catch (_) { }
        if (storedKey) {
            const savedMode = currentUser.api_mode || 'mixed';
            if (savedMode === 'server_fallback') {
                elements.apiKeyStatus.textContent = getToastMessage('status.apiKeyNotConfigured');
            } else {
                const modeText = savedMode === 'mixed'
                    ? getToastMessage('ui.mixedMode')
                    : getToastMessage('ui.singleMode');
                elements.apiKeyStatus.textContent = `${getToastMessage('status.apiKeyConfiguredWithMode', { mode: modeText })}`;
            }
        } else {
            elements.apiKeyStatus.textContent = getToastMessage('status.apiKeyNotConfigured');
        }
        elements.usageStats.style.display = 'block';
        elements.logoutBtn.style.display = 'inline-block';
        elements.settingsSaveBtn.textContent = getToastMessage('status.saveKeySettings');
        elements.settingsSaveBtn.disabled = false;

        setOriginalApiKeys();

        hasParametersLoaded = false;
        isLoadingParameters = false;
    } else {
        const currentRoute = router.getCurrentRoute();
        const isChatContext = currentRoute?.name === 'chat' || currentRoute?.name === 'tempChat';
        const isHomeRoute = !currentRoute || currentRoute.name === 'home';
        const isAuthRoute = currentRoute?.name === 'auth';

        if (showLoginPage && !isChatContext && (isHomeRoute || isAuthRoute)) {
            const initialAuthRoutePending = !routeManager.isInitialRouteProcessed() && currentRoute?.name === 'auth';
            const desiredState = initialAuthRoutePending
                ? routeManager.normalizeAuthState({ mode: currentRoute.params?.mode, token: currentRoute.params?.token })
                : routeManager.getAuthState();
            if (!elements.authOverlay.classList.contains('visible')) {
                openAuthOverlay(initialAuthRoutePending ? 'route' : 'auto', desiredState, {
                    syncRoute: !initialAuthRoutePending,
                    routeOptions: { replace: true }
                });
            } else if (!initialAuthRoutePending) {
                routeManager.syncAuthRoute(desiredState, { replace: true });
                persistAuthRoute(desiredState);
            }
            if (elements.chatContainer) {
                elements.chatContainer.style.display = 'none';
            }
        } else {
            if (elements.chatContainer) {
                elements.chatContainer.style.display = 'flex';
            }
            if (!isChatContext && isHomeRoute && !showLoginPage) {
                showEmptyState();
            }
        }

        elements.rightSidebarToggleBtn.style.display = 'none';
        elements.saveSettingsBtn.disabled = true;
        document.getElementById('edit-profile-section').style.display = 'none';

        if (elements.apiKeyOneInput && elements.apiKeyTwoInput) {
            elements.apiKeyOneInput.value = '';
            elements.apiKeyTwoInput.value = '';
        }
        if (elements.apiKeyInput) {
            elements.apiKeyInput.value = '';
        }
        elements.usageStats.style.display = 'none';
        elements.logoutBtn.style.display = 'none';

        hasParametersLoaded = false;
        isLoadingParameters = false;
    }

    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) {
        clearCacheBtn.style.display = 'flex';
    }

    updateUsageDisplay();
    updateWeeklyTimer();
}

async function validateApiKey(apiKey) {
    if (!apiKey || !apiKey.trim()) {
        return {
            success: false,
            message: getToastMessage('errors.invalidKeyFormat')
        };
    }

    try {
        // 访客走公开验证接口；登录用户走受保护接口
        if (!sessionId) {
            return await makeApiRequest('validate-api-key', {
                method: 'POST',
                body: JSON.stringify({ apiKey, validationOnly: true })
            });
        }

        return await makeAuthRequest('validate-api-key', { apiKey, validationOnly: true });
    } catch (error) {
        console.error(`${getToastMessage('console.backendValidationCallFailed')}:`, error);
        return { success: false, message: error.message || getToastMessage('errors.backendValidationFailed') };
    }
}

async function loadChat(chatId) {
    ensureInlineEditModeClosed();

    if (currentChatId && currentChatId.startsWith('temp_') && currentChatId !== chatId) {
        const previousChat = chats[currentChatId];
        if (previousChat && (!previousChat.messages || previousChat.messages.length === 0)) {
            delete chats[currentChatId];
            scheduleRenderSidebar();
        }
    }

    if (currentChatId && activeResponses.has(currentChatId)) {
        activeResponses.get(currentChatId).controller.abort();
        activeResponses.delete(currentChatId);
        resetSendButtonState();
    }

    currentLoadChatId++;
    const loadId = currentLoadChatId;
    welcomePageShown = false;
    const allRenderPromises = [];
    let renderCompletionPromise = null;

    if (!chats[chatId]) {
        console.error(getToastMessage('console.chatNotFound', { chatId }));
        return;
    }

    const wasAlreadyInChat = !!currentChatId;
    const wasSameChat = currentChatId === chatId;
    if (currentChatId && !wasSameChat) {
        persistCurrentDraft(currentChatId);
    }
    currentChatId = chatId;

    navigationEngine.resetExitState();
    navigationEngine.nextBackShouldReturnToMain = false;

    if (!wasSameChat) {
        routeManager.navigateToChat(chatId);
        restoreDraftForChat(chatId);
    }

    elements.chatContainer.style.opacity = '0';
    if (isImageModeActive) {
        isImageModeActive = false;
        updateImageModeUI();
    }

    try {
        elements.chatLoaderBar.classList.add('loading');
        elements.chatContainer.innerHTML = '';

        // 检查消息是否已加载
        let didFetchFromServer = false;
        if (!chats[chatId].messages || chats[chatId].messages.length === 0) {
            if (currentUser) {
                // 登录用户
                if (!String(chatId).startsWith('temp_')) {
                    const result = await makeApiRequest(`chats/messages?conversationId=${chatId}`);
                    if (result.success) {
                        chats[chatId].messages = result.messages || [];
                        didFetchFromServer = true;
                    } else {
                        throw new Error(result.error || getToastMessage('errors.cannotLoadMessage'));
                    }
                } else {
                    // 临时聊天
                    if (!chats[chatId].messages) {
                        chats[chatId].messages = [];
                    }
                }
            } else {
                // 访客：仅使用本地消息
                if (!chats[chatId].messages) {
                    chats[chatId].messages = [];
                }
            }
        }

        if (loadId !== currentLoadChatId) {
            return;
        }

        if (!didFetchFromServer) {
            await new Promise(resolve => setTimeout(resolve, 180));
        }

        const messagesToRender = chats[chatId].messages;

        const scheduleFinalScroll = () => {
            requestAnimationFrame(() => {
                elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
            });
        };

        if (messagesToRender && messagesToRender.length > 0) {
            const chunkSize = 20;
            let index = 0;

            const renderAllChunks = async () => {
                while (index < messagesToRender.length) {
                    const fragment = document.createDocumentFragment();
                    const end = Math.min(index + chunkSize, messagesToRender.length);

                    for (let i = index; i < end; i++) {
                        const msg = messagesToRender[i];
                        const { element: messageElement, promise: renderPromise } = createMessageElement(msg.role, msg);
                        fragment.appendChild(messageElement);
                        if (renderPromise && typeof renderPromise.then === 'function') {
                            allRenderPromises.push(renderPromise);
                        }
                    }
                    elements.chatContainer.appendChild(fragment);
                    index = end;

                    await new Promise(resolve => requestAnimationFrame(resolve));
                }
            };

            await renderAllChunks();

            setTimeout(() => {
                elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
            }, 0);

            isWelcomePage = false;
            elements.chatContainer.style.overflowY = 'auto';

        } else {
            showEmptyState();
        }
        scheduleRenderSidebar();

        if (allRenderPromises.length > 0) {
            renderCompletionPromise = Promise.allSettled(allRenderPromises)
                .then(() => new Promise(resolve => setTimeout(resolve, 50)));
            renderCompletionPromise.then(scheduleFinalScroll).catch(scheduleFinalScroll);
        } else {
            scheduleFinalScroll();
            renderCompletionPromise = new Promise(resolve => setTimeout(resolve, 50));
        }
    } catch (error) {
        console.error(`${getToastMessage('console.loadChatFailed', { chatId })}:`, error);
        showToast(`${getToastMessage('toast.chatHistoryLoadFailed')}: ${error.message}`, 'error');

        elements.chatContainer.innerHTML = `
            <div class="empty-state" style="color: #f44336;">
                <h2>${getToastMessage('ui.loadFailed')}</h2>
                <p>${getToastMessage('ui.cannotLoadChatRecord')}。${getToastMessage('ui.error')}: ${error.message}</p>
                <button onclick="window.loadChat('${chatId}')" class="btn-primary" style="margin-top: 16px;">${getToastMessage('ui.retry')}</button>
            </div>
        `;
        window.loadChat = loadChat;
    } finally {
        let finalized = false;
        const finalize = () => {
            if (finalized) return;
            finalized = true;
            if (loadId === currentLoadChatId) {
                elements.chatLoaderBar.classList.remove('loading');
            }
            requestAnimationFrame(() => {
                elements.chatContainer.style.opacity = '1';
                refreshEditButtons();
            });
            closeSidebarOnInteraction();
        };

        if (renderCompletionPromise && typeof renderCompletionPromise.then === 'function') {
            renderCompletionPromise.then(finalize).catch(finalize);
        } else {
            finalize();
        }
    }
}

function showEmptyState(forceLanguage = null) {
    if (currentChatId !== null) {
        elements.chatContainer.innerHTML = '';
        elements.chatContainer.style.overflowY = 'auto';
        isWelcomePage = false;
        // 清除欢迎页标记，避免后续判断误判
        if (elements.chatContainer && elements.chatContainer.dataset) {
            delete elements.chatContainer.dataset.view;
            delete elements.chatContainer.dataset.lang;
        }
        return;
    }

    currentChatId = null;
    const currentLang = forceLanguage || (currentUser ? (currentUser.language || getCurrentLanguage()) : getCurrentLanguage());
    welcomePageShown = true;
    elements.chatContainer.innerHTML = `
        <div class="empty-state">
            <h2>${t(currentLang, 'ui.welcomeToLittleAIBox')}</h2>
            <p>${t(currentLang, 'ui.startFromHereOrAskAnyQuestion')}</p>
            <div class="empty-state-suggestions">
                <button class="suggestion-chip">${t(currentLang, 'ui.suggestion1')}</button>
                <button class="suggestion-chip">${t(currentLang, 'ui.suggestion2')}</button>
                <button class="suggestion-chip">${t(currentLang, 'ui.suggestion3')}</button>
                <button class="suggestion-chip">${t(currentLang, 'ui.suggestion4')}</button>
            </div>
        </div>
    `;

    elements.chatContainer.style.overflowY = 'hidden';
    isWelcomePage = true;

    elements.chatContainer.scrollTop = 0;

    elements.chatContainer.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            elements.messageInput.value = chip.textContent;
            elements.messageInput.dispatchEvent(new Event('input'));
            sendMessage();
        });
    });

    setActiveChat(null);
    clearInputAndAttachments(true);
    if (isImageModeActive) {
        isImageModeActive = false;
        updateImageModeUI();
    }
}

async function startNewChat(skipProcessingCheck = false) {
    ensureInlineEditModeClosed();

    if (currentChatId && currentChatId.startsWith('temp_') && chats[currentChatId]?.messages.length === 0) {
        closeSidebarOnInteraction();
        return;
    }

    if (!await handleLeaveTemporaryChat(skipProcessingCheck)) {
        return;
    }

    // 重置欢迎页面显示标志
    welcomePageShown = false;

    // 重置导航引擎的退出状态
    navigationEngine.resetExitState();
    navigationEngine.nextBackShouldReturnToMain = false;

    if (!currentUser) {
        const tempChatId = `temp_${generateId()}`;
        currentChatId = tempChatId;
        chats[tempChatId] = {
            id: tempChatId,
            title: getToastMessage('ui.newChat'),
            messages: [],
            created_at: new Date().toISOString(),
            isTemp: true
        };
        elements.chatContainer.innerHTML = '';
        isWelcomePage = false;
        welcomePageShown = true;
        elements.chatContainer.style.overflowY = 'auto';

        clearInputAndAttachments(true);
        scheduleRenderSidebar();

        setTimeout(() => {
            setActiveChat(tempChatId);
            closeSidebarOnInteraction();
        }, 0);
        routeManager.navigateToChat(tempChatId);
        return;
    }

    const tempChatId = `temp_${generateId()}`;
    currentChatId = tempChatId;
    chats[tempChatId] = { id: tempChatId, title: getToastMessage('ui.newChat'), messages: [], isTemp: true };
    elements.chatContainer.innerHTML = '';
    welcomePageShown = false;
    clearInputAndAttachments(true);
    scheduleRenderSidebar();
    setTimeout(() => {
        setActiveChat(tempChatId);
        closeSidebarOnInteraction();
    }, 0);
    routeManager.navigateToChat(tempChatId);
}

async function handleLeaveTemporaryChat(skipProcessingCheck = false) {
    if (!skipProcessingCheck && isProcessing) {
        const confirmed = await showCustomConfirm(
            getToastMessage('dialog.confirmLeave'),
            getToastMessage('dialog.aiGeneratingResponseWarning'),
            ICONS.HELP,
            { manageHistory: false }
        );
        if (!confirmed) {
            return false;
        }
    }

    if (currentChatId && chats[currentChatId]?.messages?.length === 0) {
        const confirmed = await showCustomConfirm(
            getToastMessage('dialog.confirmLeave'),
            getToastMessage('dialog.unsavedTempChatMessage'),
            ICONS.HELP,
            { manageHistory: false }
        );
        if (!confirmed) {
            return false;
        }

        delete chats[currentChatId];
        currentChatId = null;
        showEmptyState();
        scheduleRenderSidebar();
    }

    return true;
}

function clearInputAndAttachments(clearAttachmentsArray = false) {
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    if (clearAttachmentsArray) {
        attachments = [];
    }
    elements.attachmentsPreview.innerHTML = '';
    elements.attachmentsPreview.classList.remove('has-files');
    elements.fileInput.value = '';

    const counterElement = document.getElementById('char-counter');
    if (counterElement) {
        counterElement.classList.remove('visible');
    }
    if (charCountTimer) {
        clearTimeout(charCountTimer);
    }

    updateSendButton();
}

function cleanupActiveResponses() {
    const now = Date.now();
    const timeout = 10 * 60 * 1000;
    let cleanedCount = 0;

    try {
        for (const [chatId, responseData] of activeResponses) {
            if (now - responseData.timestamp > timeout) {
                try {
                    if (responseData.controller && !responseData.controller.signal.aborted) {
                        responseData.controller.abort();
                    }
                } catch (abortError) {
                    console.warn(`${getToastMessage('console.cleanupRequestError', { chatId })}:`, abortError);
                }
                activeResponses.delete(chatId);
                cleanedCount++;
            }
        }

        // 添加强制清理机制
        if (activeResponses.size > 100) {
            const entries = Array.from(activeResponses.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            entries.slice(0, 50).forEach(([chatId, responseData]) => {
                try {
                    if (responseData.controller) {
                        responseData.controller.abort();
                    }
                } catch (e) {
                    console.warn(`${getToastMessage('console.forceCleanupError')}:`, e);
                }
                activeResponses.delete(chatId);
            });
        }
    } catch (error) {
        console.error(`${getToastMessage('console.cleanupActiveResponsesError')}:`, error);
    }
}

const cleanupInterval = setInterval(cleanupActiveResponses, 60000);
addGlobalCleanup(() => clearInterval(cleanupInterval));

function resetSendButtonState() {
    isProcessing = false;
    elements.sendButton.innerHTML = '<svg viewBox="0 0 24 24" fill="white" width="16" height="16"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>';
    updateSendButton();
}

function stopGeneration() {
    // 中止当前活跃的网络请求
    if (currentChatId && activeResponses.has(currentChatId)) {
        const responseData = activeResponses.get(currentChatId);
        if (responseData && responseData.controller) {
            responseData.controller.abort();
        }
        activeResponses.delete(currentChatId);
    }

    // 重置状态标志
    isProcessing = false;
    isSendingMessage = false;
    resetSendButtonState();
}

// 关闭下拉菜单的辅助函数
function closeDropdown(menu) {
    if (menu) {
        menu.classList.remove('show');
        const trigger = menu.previousElementSibling;
        if (trigger && trigger.classList.contains('dropdown-trigger')) {
            trigger.classList.remove('active');
        }
    }
}

// 关闭所有下拉菜单
function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
        closeDropdown(menu);
    });
}

let activeContextMenu = null;
let activeContextCleanup = null;

function closeActiveContextMenu() {
    if (activeContextMenu) {
        try { activeContextMenu.style.display = 'none'; } catch (_) { }
        if (typeof activeContextCleanup === 'function') {
            try { activeContextCleanup(); } catch (_) { }
        }
        activeContextMenu = null;
        activeContextCleanup = null;
    }
}

function openContextMenu(menu, trigger) {
    if (!menu) return;
    if (activeContextMenu === menu) {
        closeActiveContextMenu();
        return;
    }

    // 先关闭其它菜单
    closeActiveContextMenu();
    document.querySelectorAll('.context-menu').forEach(m => {
        if (m !== menu) m.style.display = 'none';
    });

    menu.style.display = 'block';

    const GRACE_PX = 16;
    const onMouseMove = (e) => {
        if (menu.style.display !== 'block') return;
        const rect = menu.getBoundingClientRect();
        const left = rect.left - GRACE_PX;
        const right = rect.right + GRACE_PX;
        const top = rect.top - GRACE_PX;
        const bottom = rect.bottom + GRACE_PX;
        const inside = e.clientX >= left && e.clientX <= right && e.clientY >= top && e.clientY <= bottom;
        if (!inside && !trigger.contains(e.target)) {
            closeActiveContextMenu();
        }
    };
    const onClick = (e) => {
        if (!menu.contains(e.target) && !trigger.contains(e.target)) closeActiveContextMenu();
    };
    const onKey = (e) => { if (e.key === 'Escape') closeActiveContextMenu(); };
    const onScroll = () => closeActiveContextMenu();
    const onResize = () => closeActiveContextMenu();

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    activeContextMenu = menu;
    activeContextCleanup = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onResize);
    };
}

function setSendButtonLoading() {
    isProcessing = true;
    elements.sendButton.disabled = true;
    elements.sendButton.innerHTML = '<svg viewBox="0 0 24 24" fill="white" width="16" height="16"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" transform="rotate(90 12 12)"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></animateTransform></path></svg>';
}

function updateSendButton() {
    const hasText = elements.messageInput.value.trim().length > 0;
    const hasAttachments = attachments.length > 0;
    const allFilesReady = filesCurrentlyProcessing === 0;
    const { isOverLimit } = updateCharacterCountUI(); // Check limit status

    const shouldEnable = (hasText || hasAttachments) && !isProcessing && allFilesReady && !isOverLimit;

    elements.sendButton.disabled = !shouldEnable;

    if (!isProcessing && elements.sendButton.innerHTML.includes('animateTransform')) {
        resetSendButtonState();
    }
}
function renderSidebar() {
    const loader = document.getElementById('chat-history-loader');
    if (loader) {
        loader.remove();
    }

    const chatIds = Object.keys(chats).sort((a, b) => {
        const chatA = chats[a];
        const chatB = chats[b];

        const aIsNew = chatA.isTemp || chatA.isNewlyCreated;
        const bIsNew = chatB.isTemp || chatB.isNewlyCreated;


        if (aIsNew && !bIsNew) return -1;
        if (!aIsNew && bIsNew) return 1;
        return 0;
    });

    if (sidebarElementsCache.size === 0) {
        elements.chatHistoryList.querySelectorAll('.history-item').forEach(el => {
            sidebarElementsCache.set(el.dataset.chatId, el);
        });
    }

    const fragment = document.createDocumentFragment();
    const newElements = [];

    chatIds.forEach(id => {
        const chatData = chats[id];
        const existingEl = sidebarElementsCache.get(id);

        if (existingEl) {
            const titleEl = existingEl.querySelector('.title');
            if (titleEl && titleEl.textContent !== chatData.title) {
                titleEl.textContent = chatData.title;
            }
            existingEl.classList.toggle('active', id === currentChatId);
            const checkbox = existingEl.querySelector('.history-item-checkbox');
            if (checkbox) {
                checkbox.checked = selectedChatIds.has(id);
            }
        } else {
            const li = createHistoryItem(id, chatData, currentChatId);
            sidebarElementsCache.set(id, li);
            newElements.push(li);
            fragment.appendChild(li);
        }
    });

    if (newElements.length > 0) {
        elements.chatHistoryList.insertBefore(fragment, elements.chatHistoryList.firstChild);
    }

    // 更新现有元素的菜单文本
    for (const [id, el] of sidebarElementsCache) {
        if (!chats[id]) {
            el.remove();
            sidebarElementsCache.delete(id);
        } else {
            // 更新菜单按钮的文本
            const contextMenu = el.querySelector('.context-menu');
            if (contextMenu) {
                const renameBtn = contextMenu.querySelector('[data-action="rename"]');
                if (renameBtn) {
                    const icon = renameBtn.querySelector('svg');
                    renameBtn.innerHTML = '';
                    if (icon) renameBtn.appendChild(icon);
                    renameBtn.appendChild(document.createTextNode(getToastMessage('ui.rename')));
                }

                const copyTitleBtn = contextMenu.querySelector('[data-action="copy-title"]');
                if (copyTitleBtn) {
                    const icon = copyTitleBtn.querySelector('svg');
                    copyTitleBtn.innerHTML = '';
                    if (icon) copyTitleBtn.appendChild(icon);
                    copyTitleBtn.appendChild(document.createTextNode(getToastMessage('ui.copyTitle')));
                }

                const shareBtn = contextMenu.querySelector('[data-action="share"]');
                if (shareBtn) {
                    const icon = shareBtn.querySelector('svg');
                    shareBtn.innerHTML = '';
                    if (icon) shareBtn.appendChild(icon);
                    shareBtn.appendChild(document.createTextNode(getToastMessage('ui.share')));
                }

                const multiSelectBtn = contextMenu.querySelector('[data-action="multi-select"]');
                if (multiSelectBtn) {
                    const icon = multiSelectBtn.querySelector('svg');
                    multiSelectBtn.innerHTML = '';
                    if (icon) multiSelectBtn.appendChild(icon);
                    multiSelectBtn.appendChild(document.createTextNode(getToastMessage('ui.multiSelect')));
                }

                const deleteBtn = contextMenu.querySelector('[data-action="delete"]');
                if (deleteBtn) {
                    const icon = deleteBtn.querySelector('svg');
                    deleteBtn.innerHTML = '';
                    if (icon) deleteBtn.appendChild(icon);
                    deleteBtn.appendChild(document.createTextNode(getToastMessage('ui.delete')));
                }
            }

            // 更新菜单按钮的 aria-label
            const menuBtn = el.querySelector('.action-menu-btn');
            if (menuBtn) {
                menuBtn.setAttribute('aria-label', getToastMessage('ui.moreActions'));
            }
        }
    }
}

function createHistoryItem(id, chatData, currentChatId) {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.dataset.chatId = id;
    if (id === currentChatId) li.classList.add('active');

    const checkboxLabel = document.createElement('label');
    checkboxLabel.className = 'history-item-checkbox-container';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'history-item-checkbox';
    checkbox.name = 'history-select';
    checkbox.dataset.chatId = id;
    checkbox.checked = selectedChatIds.has(id);
    const checkmark = document.createElement('span');
    checkmark.className = 'checkmark';
    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(checkmark);

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = chatData.title;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'history-actions';

    const menuBtn = document.createElement('button');
    menuBtn.className = 'action-menu-btn';
    menuBtn.setAttribute('aria-label', getToastMessage('ui.moreActions'));
    menuBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>';

    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openContextMenu(contextMenu, menuBtn);
    });

    const isMobile = window.matchMedia('(max-width: 640px)').matches;

    if (isMobile) {
        document.addEventListener('click', (e) => {
            if (!contextMenu.contains(e.target) && !menuBtn.contains(e.target)) {
                closeActiveContextMenu();
            }
        });
    }

    const renameBtn = createMenuButton('rename', ICONS.EDIT, getToastMessage('ui.rename'));
    contextMenu.appendChild(renameBtn);

    const copyTitleBtn = createMenuButton(
        'copy-title',
        `<svg viewBox="0 0 24 24"><path d="${ICONS.COPY}"/></svg>`,
        getToastMessage('ui.copyTitle')
    );
    contextMenu.appendChild(copyTitleBtn);

    if (currentUser) {
        const shareBtn = createMenuButton('share', ICONS.SHARE, getToastMessage('ui.share'));
        contextMenu.appendChild(shareBtn);
    }

    const multiSelectBtn = createMenuButton('multi-select', '<svg viewBox="0 0 24 24"><path d="M7 17h14v-2H7v2zm0-4h14v-2H7v2zm0-4h14V7H7v2zM4 17.27L1.27 14.54l1.41-1.41L4 14.44l3.12-3.12 1.41 1.41L4 17.27zM5.41 9.96L4 8.54 1.27 11.27l1.41 1.41L4 11.39l3.12-3.12-1.41-1.41L4.29 8.29zM4 5.73L1.27 3l1.41-1.41L4 2.9l3.12-3.12 1.41 1.41L4 5.73z"/></svg>', getToastMessage('ui.multiSelect'));
    contextMenu.appendChild(multiSelectBtn);

    const deleteBtn = createMenuButton('delete', ICONS.DELETE, getToastMessage('ui.delete'));
    contextMenu.appendChild(deleteBtn);

    actionsDiv.appendChild(menuBtn);

    li.appendChild(checkboxLabel);
    li.appendChild(title);
    li.appendChild(actionsDiv);
    li.appendChild(contextMenu);

    return li;
}

function createMenuButton(action, icon, text) {
    const btn = document.createElement('button');
    btn.dataset.action = action;
    btn.innerHTML = `${icon}<span>${text}</span>`;
    return btn;
}

function setActiveChat(chatId) {
    const currentActive = elements.chatHistoryList.querySelector('.history-item.active');
    if (currentActive && currentActive.dataset.chatId !== chatId) {
        currentActive.classList.remove('active');
    }
    if (chatId) {
        const newActive = elements.chatHistoryList.querySelector(`.history-item[data-chat-id="${chatId}"]`);
        if (newActive && !newActive.classList.contains('active')) {
            newActive.classList.add('active');
        }
    }
}

function updateSidebarChatId(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return;
    const existingItem = sidebarElementsCache.get(oldId);
    if (!existingItem) return;

    // Remove any stale cache entry mapped to the new ID
    if (sidebarElementsCache.has(newId)) {
        const duplicate = sidebarElementsCache.get(newId);
        if (duplicate && duplicate !== existingItem) {
            duplicate.remove();
        }
        sidebarElementsCache.delete(newId);
    }

    existingItem.dataset.chatId = newId;
    const checkbox = existingItem.querySelector('.history-item-checkbox');
    if (checkbox) {
        checkbox.dataset.chatId = newId;
    }

    sidebarElementsCache.delete(oldId);
    sidebarElementsCache.set(newId, existingItem);

    if (selectedChatIds.has(oldId)) {
        selectedChatIds.delete(oldId);
        selectedChatIds.add(newId);
        if (checkbox) {
            checkbox.checked = true;
        }
    }

    if (currentChatId === newId) {
        setActiveChat(newId);
    }
}

function scheduleRenderSidebar() {
    if (renderSidebarRequested) return;
    if (renderSidebarTimer) return;

    renderSidebarRequested = true;

    renderSidebarTimer = setTimeout(() => {
        if (window.requestIdleCallback) {
            requestIdleCallback(() => {
                renderSidebar();
                renderSidebarTimer = null;
                renderSidebarRequested = false;
            }, { timeout: 500 });
        } else {
            requestAnimationFrame(() => {
                renderSidebar();
                renderSidebarTimer = null;
                renderSidebarRequested = false;
            });
        }
    }, 50);
}

async function renameChat(chatId) {
    const oldTitle = chats[chatId].title;
    const newTitle = await showCustomPrompt(getToastMessage('dialog.renameConversation'), getToastMessage('dialog.enterNewChatTitle'), oldTitle);

    if (newTitle && newTitle.trim() !== "" && newTitle.trim() !== oldTitle) {
        const trimmedTitle = newTitle.trim();

        try {
            if (currentUser) {
                const response = await fetch(`/api/chats/conversations`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-ID': sessionId
                    },
                    body: JSON.stringify({
                        conversationId: chatId,
                        title: trimmedTitle
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `${getToastMessage('errors.requestFailed')}: ${response.status}`);
                }

                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.error || getToastMessage('errors.apiRequestFailed'));
                }
            }

            chats[chatId].title = trimmedTitle;
            if (!currentUser) {
                await saveChatsToDB('guest', chats);
            } else {
                await saveChatsToDB(currentUser.id, chats);
            }

            scheduleRenderSidebar();
            showToast(getToastMessage('toast.renameSuccess'), 'success');
            notifyBackendCacheInvalidation('chat_title_updated', { chatId, oldTitle, newTitle: trimmedTitle });

        } catch (error) {
            console.error(`${getToastMessage('console.renameFailed')}:`, error);

            chats[chatId].title = oldTitle;
            scheduleRenderSidebar();
            showToast(`${getToastMessage('toast.renameFailed')}: ${error.message}`, 'error');
        }
    }
}

async function shareChat(chatId) {
    if (!currentUser) {
        showToast(getToastMessage('toast.loginRequiredForShare'), 'info');
        return;
    }

    try {
        showToast(getToastMessage('toast.generatingShareLink'), 'info');

        // 获取用户当前应用显示的语言
        const currentLang = currentUser ? (currentUser.language || getCurrentLanguage()) : getCurrentLanguage();

        const result = await makeApiRequest(`chats/${chatId}/share`, {
            method: 'POST',
            body: JSON.stringify({ language: currentLang })
        });

        if (result.success && result.url) {
            navigator.clipboard.writeText(result.url).then(() => {
                showToast(getToastMessage('toast.linkCopiedToClipboard'), 'success');
            }).catch(() => {
                showToast(getToastMessage('toast.linkGeneratedCopyFailed'), 'warning');
                showCustomPrompt(getToastMessage('ui.shareLink'), getToastMessage('ui.pleaseCopyLinkManually'), result.url);
            });
        } else {
            throw new Error(result.error || getToastMessage('errors.cannotGenerateLink'));
        }
    } catch (error) {
        showToast(`${getToastMessage('toast.shareFailed')}: ${error.message}`, 'error');
    } finally {
        document.querySelectorAll('.context-menu').forEach(menu => menu.style.display = 'none');
    }
}

async function deleteChat(chatId, showConfirmation = true, isBatchOperation = false) {
    const chatToDelete = chats[chatId];
    if (!chatToDelete) {

        return;
    }
    const confirmed = showConfirmation ? await showCustomConfirm(getToastMessage('dialog.deleteConversation'), getToastMessage('dialog.deleteConversationMessage', { title: chatToDelete.title || getToastMessage('dialog.thisConversation') }), ICONS.DELETE) : true;

    if (!confirmed) {
        return;
    }
    const isDeletingCurrentChat = (chatId === currentChatId);


    delete chats[chatId];
    localStorage.removeItem(`pending_chat_${chatId}`);
    if (!currentUser) {
        await saveChatsToDB('guest', chats);
    }
    scheduleRenderSidebar();

    if (isDeletingCurrentChat) {
        currentChatId = null;
        welcomePageShown = false;
        showEmptyState();
        scheduleRenderSidebar();
        routeManager.navigateToHome({ replace: true });
    }

    try {
        if (currentUser) {
            const response = await makeApiRequest(`chats/${chatId}`, {
                method: 'DELETE'
            });

            if (!response.success) {
                throw new Error(response.error || getToastMessage('errors.serverCannotDeleteConversation'));
            }
            await saveChatsToDB(currentUser.id, chats);
        }

        if (showConfirmation) {
            showToast(getToastMessage('toast.conversationDeleted'), 'success');
            if (currentUser) {
                notifyBackendCacheInvalidation('chat_deleted', { chatId });
            }
        } else {

        }

        if (activeResponses.has(chatId)) {
            activeResponses.get(chatId).controller.abort();
            activeResponses.delete(chatId);
        }

    } catch (error) {
        showToast(`${getToastMessage('toast.deleteFailed')}: ${error.message}`, 'error');

        chats[chatId] = chatToDelete;
        scheduleRenderSidebar();

        if (isDeletingCurrentChat) {
            loadChat(chatId);
        }
    } finally {
        document.querySelectorAll('.context-menu').forEach(menu => menu.style.display = 'none');
    }
}

const KATEX_CONFIG = {
    delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
    ],
    throwOnError: false,
    strict: false,
    trust: true,
    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
    macros: {
        // 常用数学集合简写
        "\\RR": "\\mathbb{R}",
        "\\NN": "\\mathbb{N}",
        "\\ZZ": "\\mathbb{Z}",
        "\\QQ": "\\mathbb{Q}",
        "\\CC": "\\mathbb{C}",

        // 逻辑符号
        "\\lnot": "\\neg ",

        // 量子力学符号
        "\\bra": "\\langle #1 |",
        "\\ket": "| #1 \\rangle",
        "\\braket": "\\langle #1 | #2 \\rangle",

        // 矢量箭头
        "\\vec": "\\overrightarrow{#1}",
        "\\vect": "\\overrightarrow{#1}"
    }
};

class MathRenderer {
    constructor(katexConfig) {
        this.katexConfig = katexConfig;
        this.partialConfig = {
            delimiters: katexConfig.delimiters,
            throwOnError: false,
            strict: false,
            trust: true,
            macros: katexConfig.macros
        };

        this.inlinePatternSource = MathRenderer.buildInlinePatternSource();
        this.displayLineRegex = MathRenderer.buildDisplayLineRegex();
    }

    static get COMMAND_PATTERN() {
        return '(?:frac|sqrt|sum|int|prod|lim|log|ln|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|arcsin|arccos|arctan|pi|mu|nu|alpha|beta|gamma|delta|epsilon|lambda|theta|phi|psi|omega|chi|eta|zeta|xi|rho|sigma|tau|upsilon|kappa|varphi|varpi|varsigma|vartheta|Phi|Psi|Omega|Delta|Gamma|Lambda|Sigma|Pi|Theta|Chi|cdot|times|neq|leq|geq|approx|sim|infty|partial|nabla|mathbb|mathrm|mathbf|mathcal|boldsymbol|operatorname|overline|underline|widehat|widetilde|hat|vec|bar|tilde|dot|ddot|ce|binom|left|right|text|displaystyle|mathsf|mathtt|mathfrak|mathit)';
    }

    static get UNICODE_TEXT_CLASS() {
        return '\\p{L}\\p{N}\\p{M}\\p{P}\\p{S}\\p{Zs}';
    }

    static buildInlinePatternSource() {
        const chars = `${MathRenderer.UNICODE_TEXT_CLASS}0-9\\s+\\-*/^_=()\\\\.,·:;`;
        return `([${chars}]*\\\\${MathRenderer.COMMAND_PATTERN}[${chars}{}]*)`;
    }

    static buildDisplayLineRegex() {
        const chars = `${MathRenderer.UNICODE_TEXT_CLASS}0-9\\s\\\\{}^_*+\\-=/().,:;·`;
        return new RegExp(`^[${chars}]+$`, 'u');
    }

    preprocessMarkdown(text) {
        let result = this.normalizeLatexEnvironments(text);
        result = this.promoteStandaloneInlineMath(result);
        return result;
    }

    normalizeLatexEnvironments(text) {
        let result = text;
        const protectedRanges = [];
        const dollarBlockRegex = /\$\$([\s\S]*?)\$\$/g;
        let match;
        while ((match = dollarBlockRegex.exec(text)) !== null) {
            protectedRanges.push({
                start: match.index,
                end: match.index + match[0].length
            });
        }

        result = result.replace(/\\begin\s*\{([A-Za-z0-9*]+)\}([\s\S]*?)\\end\s*\{\1\}/gmi, (match, envName, content, offset) => {
            const isProtected = protectedRanges.some(range =>
                offset >= range.start && offset < range.end
            );

            if (isProtected) {
                return match;
            }
            let fixedContent = content.replace(/([^\\]|^)\\(\s)/g, '$1\\\\$2');
            return `$$\\begin{${envName}}${fixedContent}\\end{${envName}}$$`;
        });

        return result;
    }

    promoteStandaloneInlineMath(text) {
        try {
            const lines = text.split(/\r?\n/);
            let fence = null;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const fenceMatch = line.match(/^\s{0,3}([`~]{3,})(.*)$/);
                if (fenceMatch) {
                    const ch = fenceMatch[1][0];
                    const len = fenceMatch[1].length;
                    if (!fence) {
                        fence = { ch, len };
                    } else if (fence && ch === fence.ch && len >= fence.len) {
                        fence = null;
                    }
                    continue;
                }

                if (fence) continue;

                const trimmed = line.trim();
                const match = trimmed.match(/^\$([^$\n]+)\$/);
                if (match) {
                    const before = line.slice(0, line.indexOf(trimmed));
                    const after = line.slice(line.indexOf(trimmed) + trimmed.length);
                    lines[i] = `${before}$$${match[1]}$$${after}`;
                }
            }
            return lines.join('\n');
        } catch (_) {
            return text;
        }
    }

    classifyMathLikeContent(trimmed) {
        if (!trimmed) {
            return { shouldWrap: false, mathBody: trimmed };
        }

        const commandRegex = this.commandRegex();
        commandRegex.lastIndex = 0;

        let looksLikeMath = trimmed.includes('\\') || commandRegex.test(trimmed);

        if (!looksLikeMath) {
            const superscriptPattern = /(?:^|[^A-Za-z0-9])([A-Za-z0-9])\s*\^\s*(?:\{?[A-Za-z0-9+\-*/]+\}?|[A-Za-z0-9])/u;
            const subscriptPattern = /(?:^|[^A-Za-z0-9])([A-Za-z0-9])\s*_\s*(?:\{?[A-Za-z0-9]+\}?)/u;
            const operatorPattern = /[=+\-*/]/u;
            const fractionPattern = /[A-Za-z0-9]\s*\/\s*[A-Za-z0-9]/u;
            const greekPattern = /[α-ωΑ-ΩπμθσρλντφψΩΦΛΣΠΘΧβγδεζηξρ]/u;
            const symbolPattern = /[∑∏√∞≈≠≤≥±÷×⋅·]/u;

            looksLikeMath =
                superscriptPattern.test(trimmed) ||
                subscriptPattern.test(trimmed) ||
                (operatorPattern.test(trimmed) && this.isAsciiMathContent(trimmed)) ||
                fractionPattern.test(trimmed) ||
                greekPattern.test(trimmed) ||
                symbolPattern.test(trimmed);
        }

        if (looksLikeMath) {
            return { shouldWrap: true, mathBody: this.normalizeMathBody(trimmed) };
        }

        if (this.isLikelyShortMathToken(trimmed)) {
            return { shouldWrap: true, mathBody: this.normalizeMathBody(trimmed) };
        }

        if (this.looksLikeChemicalEquation(trimmed)) {
            const needsCeWrap = !/^\\ce\{.*\}$/u.test(trimmed);
            const chemicalBody = this.normalizeChemicalBody(trimmed);
            return {
                shouldWrap: true,
                mathBody: needsCeWrap ? `\\ce{${chemicalBody}}` : chemicalBody
            };
        }

        return { shouldWrap: false, mathBody: trimmed };
    }

    isAsciiMathContent(text) {
        if (!text) return false;
        const asciiMathPattern = /^[A-Za-z0-9\\^_{}+\-*/().,:;= ]+$/u;
        return asciiMathPattern.test(text);
    }

    isLikelyShortMathToken(text) {
        if (!text) return false;
        const trimmed = text.trim();
        if (trimmed.length === 0 || trimmed.length > 2) return false;

        if (/^[A-Za-z0-9]$/u.test(trimmed) || /^[A-Za-z0-9][0-9]$/u.test(trimmed)) {
            return true;
        }

        const normalized = trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (normalized.length === 1 && /^[A-Za-z]$/u.test(normalized)) {
            return true;
        }

        if (/^[\u2070-\u209F]$/u.test(trimmed)) {
            return true;
        }

        return false;
    }

    normalizeMathBody(body) {
        if (!body) return body;

        let result = body;

        const accentTransforms = [
            { regex: /([A-Za-z0-9])\u0302/gu, replacement: '\\hat{$1}' },
            { regex: /([A-Za-z0-9])\u0303/gu, replacement: '\\tilde{$1}' },
            { regex: /([A-Za-z0-9])\u0304/gu, replacement: '\\bar{$1}' },
            { regex: /([A-Za-z0-9])\u0307/gu, replacement: '\\dot{$1}' },
            { regex: /([A-Za-z0-9])\u0308/gu, replacement: '\\ddot{$1}' },
            { regex: /([A-Za-z0-9])\u20d7/gu, replacement: '\\vec{$1}' }
        ];
        accentTransforms.forEach(({ regex, replacement }) => {
            result = result.replace(regex, replacement);
        });

        const greekMap = {
            'π': '\\pi ',
            'Π': '\\Pi ',
            'θ': '\\theta ',
            'Θ': '\\Theta ',
            'λ': '\\lambda ',
            'Λ': '\\Lambda ',
            'σ': '\\sigma ',
            'Σ': '\\Sigma ',
            'μ': '\\mu ',
            'µ': '\\mu ',
            'φ': '\\phi ',
            'Φ': '\\Phi ',
            'ω': '\\omega ',
            'Ω': '\\Omega ',
            'α': '\\alpha ',
            'β': '\\beta ',
            'γ': '\\gamma ',
            'Γ': '\\Gamma ',
            'δ': '\\delta ',
            'Δ': '\\Delta ',
            'η': '\\eta ',
            'ρ': '\\rho ',
            'χ': '\\chi ',
            'ζ': '\\zeta ',
            'ξ': '\\xi ',
            'ν': '\\nu ',
            'τ': '\\tau ',
            'ψ': '\\psi ',
            'Ψ': '\\Psi ',
            'κ': '\\kappa '
        };
        result = result.replace(/[\u03B1-\u03C9\u0391-\u03A9\u00B5]/gu, ch => greekMap[ch] || ch);

        const subscriptDigits = {
            '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
            '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9'
        };
        result = result.replace(/([\u2080-\u2089]+)/gu, match => `_{${[...match].map(ch => subscriptDigits[ch] || '').join('')}}`);

        const superscriptDigits = {
            '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
            '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
            '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')'
        };
        result = result.replace(/([\u2070-\u2079\u207A-\u207E]+)/gu, match => `^{${[...match].map(ch => superscriptDigits[ch] || '').join('')}}`);

        result = result.replace(/[\u00B7\u22C5\u2022]/gu, ' \\cdot ');
        result = result.replace(/×/gu, ' \\times ');
        result = result.replace(/÷/gu, ' \\div ');

        result = result.replace(/\s{2,}/g, ' ');

        const slashCount = (result.match(/\//g) || []).length;
        if (slashCount === 1) {
            const fractionMatch = result.match(/^\s*([^/]+?)\s*\/\s*([^/]+?)\s*$/u);
            if (fractionMatch) {
                const numerator = fractionMatch[1].trim();
                const denominator = fractionMatch[2].trim();
                if (numerator && denominator) {
                    result = `\\frac{${numerator}}{${denominator}}`;
                }
            }
        }

        return result.trim();
    }

    normalizeChemicalBody(body) {
        if (!body) return body;
        return body.replace(/[\u00B7\u22C5\u2022]/gu, '\\cdot ');
    }

    looksLikeChemicalEquation(text) {
        if (!text) return false;
        if (text.length < 3) return false;

        const arrowPattern = /(<?[-=]+>|⇌|⇄|↔|→|←|⟶|⟵|⟷|⇆|⇋|⇅)/u;
        const hasConnector = arrowPattern.test(text) || text.includes('+') || /(^|[^A-Za-z])=[^=]/u.test(text);
        if (!hasConnector) return false;

        const compoundPattern = /\b[A-Z][a-z]?(?:\d+(?:\.\d+)?)?(?:_\{[0-9+\-]+\}|_\d+)?(?:\([a-z]{1,3}\))?/gu;
        let compoundCount = 0;
        let match;
        while ((match = compoundPattern.exec(text)) !== null) {
            const fragment = match[0];
            if (!fragment) continue;
            compoundCount++;
            if (compoundCount >= 2) break;
        }

        if (compoundCount < 2) {
            return false;
        }

        const disqualifierPattern = /[`$]/u;
        if (disqualifierPattern.test(text)) return false;

        return true;
    }

    inlineRegex() {
        return new RegExp(this.inlinePatternSource, 'gu');
    }

    commandRegex() {
        return new RegExp(`\\${MathRenderer.COMMAND_PATTERN}`, 'u');
    }

    normalizeDelimited(texWithDelimiters) {
        try {
            let body = texWithDelimiters;
            let start = '', end = '';
            if (texWithDelimiters.startsWith('$$') && texWithDelimiters.endsWith('$$')) {
                start = '$$'; end = '$$';
                body = texWithDelimiters.slice(2, -2);
            } else if (texWithDelimiters.startsWith('$') && texWithDelimiters.endsWith('$')) {
                start = '$'; end = '$';
                body = texWithDelimiters.slice(1, -1);
            } else {
                return texWithDelimiters;
            }

            let normalized = body
                .replace(/\u2208\s*\/\s*/g, '\\notin ')
                .replace(/\u2208\u0338/g, '\\notin ')
                .replace(/\u2209/g, '\\notin ')
                .replace(/\u2282\s*\/\s*/g, '\\not\\subset ')
                .replace(/\u2282\u0338/g, '\\not\\subset ')
                .replace(/\u2286\s*\/\s*/g, '\\not\\subseteq ')
                .replace(/\u2286\u0338/g, '\\not\\subseteq ')
                .replace(/\u2283\s*\/\s*/g, '\\not\\supset ')
                .replace(/\u2283\u0338/g, '\\not\\supset ')
                .replace(/\u2287\s*\/\s*/g, '\\not\\supseteq ')
                .replace(/\u2287\u0338/g, '\\not\\supseteq ')
                .replace(/\u220B\s*\/\s*/g, '\\not\\ni ')
                .replace(/\u220B\u0338/g, '\\not\\ni ')
                .replace(/\u00AC\s*(\w)/g, '\\neg \\! $1')
                .replace(/([A-Za-z])\^(\d{1,2})(?=\d[spdfg])/gi, ($0, base, exp) => `${base}^{${exp}} `)
                .replace(/_([A-Za-z0-9]+)/g, '_{$1}')
                .replace(/\^([A-Za-z]|\d+)/g, '^{$1}')
                .replace(/\text\{([^{}]*?)_(\{[^{}]*\}|[A-Za-z0-9]+?)(\^(\{[^{}]*\}|[A-Za-z0-9]+))?\}/g, (full, base, rawSub, supGroup, rawSup) => {
                    const stripBraces = value => {
                        if (!value) return '';
                        const trimmed = value.trim();
                        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                            return trimmed.slice(1, -1);
                        }
                        return trimmed;
                    };
                    const wrapIfText = value => {
                        const trimmed = value.trim();
                        if (!trimmed) return '';
                        if (trimmed.startsWith('\\')) {
                            return trimmed;
                        }
                        if (/^[0-9+\-*/().]+$/.test(trimmed)) {
                            return trimmed;
                        }
                        if (/^[A-Za-z]$/.test(trimmed)) {
                            return trimmed;
                        }
                        return `\\text{${trimmed}}`;
                    };

                    const baseText = base.trim().replace(/\s+/g, ' ');
                    const subContent = stripBraces(rawSub);
                    const supContent = stripBraces(rawSup || '');
                    let rebuilt = `\\text{${baseText}}`;

                    if (subContent) {
                        rebuilt += `_{${wrapIfText(subContent)}}`;
                    }
                    if (supContent) {
                        rebuilt += `^{${wrapIfText(supContent)}}`;
                    }
                    return rebuilt;
                });

            return start + normalized + end;
        } catch (e) {
            return texWithDelimiters;
        }
    }

    static containsMath(text) {
        if (!text) return false;
        return text.includes('$') ||
            text.includes('\\(') ||
            text.includes('\\[') ||
            /\\begin\s*\{[A-Za-z0-9*]+\}/u.test(text);
    }

    renderMath(element, { isFinalRender } = {}) {
        if (!window.renderMathInElement) {
            return;
        }

        try {
            const textContent = element.textContent;
            const hasMath = MathRenderer.containsMath(textContent);

            if (!hasMath) {
                return;
            }

            const hasRendered = element.querySelector('.katex') !== null;

            if (isFinalRender || !hasRendered) {
                if (!hasRendered) {
                    renderMathInElement(element, this.katexConfig);
                } else {
                    const textNodes = [];
                    const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
                    let node;
                    while ((node = walk.nextNode())) {
                        if (MathRenderer.containsMath(node.textContent || '')) {
                            textNodes.push(node);
                        }
                    }

                    textNodes.forEach(node => {
                        try {
                            const span = document.createElement('span');
                            span.textContent = node.textContent;
                            node.parentNode.insertBefore(span, node);
                            node.parentNode.removeChild(node);
                            renderMathInElement(span, this.partialConfig);
                        } catch (_) { }
                    });
                }
            } else {
                const textNodes = [];
                const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
                let node;
                while ((node = walk.nextNode())) {
                    if (MathRenderer.containsMath(node.textContent || '')) {
                        textNodes.push(node);
                    }
                }

                textNodes.forEach(node => {
                    try {
                        const span = document.createElement('span');
                        span.textContent = node.textContent;
                        node.parentNode.insertBefore(span, node);
                        node.parentNode.removeChild(node);
                        renderMathInElement(span, this.partialConfig);
                    } catch (_) { }
                });
            }
        } catch (_) { }
    }
}

const mathRenderer = new MathRenderer(KATEX_CONFIG);
const STREAMING_HORIZONTAL_RULE_TAIL_RE = /(?:^|\r?\n)[ \t]{0,3}([\*\-_])(?:[ \t]*\1){2,}[ \t]*$/;
const EXPLICIT_HORIZONTAL_RULE_RE = /(?:^|\r?\n)[ \t]{0,3}([*\-_])(?:[ \t]*\1){2,}[ \t]*(?:\r?\n|$)/;

function stripStreamingHorizontalRuleTail(text) {
    if (!text) return text;
    let end = text.length;
    while (end > 0) {
        const code = text.charCodeAt(end - 1);
        if (code === 10 || code === 13) {
            end--;
        } else {
            break;
        }
    }
    const withoutTrailingNewlines = text.slice(0, end);
    const match = withoutTrailingNewlines.match(STREAMING_HORIZONTAL_RULE_TAIL_RE);
    if (!match) {
        return text;
    }
    const removalStart = withoutTrailingNewlines.length - match[0].length;
    const trimmed = withoutTrailingNewlines.slice(0, removalStart);
    return trimmed + text.slice(end);
}

function renderMessageContent(element, content, citations = null, isFinalRender = false) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    let renderTimeout;
    const clearRenderState = () => {
        if (element.__renderState) {
            delete element.__renderState;
        }
    };

    if (isMobile) {
        renderTimeout = setTimeout(() => {
            console.warn(getToastMessage('console.mobileRenderTimeout'));
            if (typeof content === 'string' && content.includes('<table')) {
                const simplifiedContent = content.replace(/<table[^>]*>[\s\S]*?<\/table>/gi, `[${getToastMessage('ui.tableTooLarge')}]`);
                element.innerHTML = DOMPurify.sanitize(simplifiedContent);
            }
        }, 2000); // 2秒超时
    }

    if (Array.isArray(content)) {
        element.innerHTML = '';
        clearRenderState();
        content.forEach(part => {
            if (part.type === 'quote') {
                const quoteDiv = document.createElement('div');
                quoteDiv.style.cssText = "background-color: rgba(0, 0, 0, 0.05); border-left: 3px solid rgba(0, 0, 0, 0.2); padding: 8px 12px; margin-bottom: 8px; border-radius: 4px; font-size: 0.9em; color: #555; white-space: pre-wrap; word-break: break-word;";
                const truncatedText = part.text.length > 150 ? part.text.substring(0, 150) + '...' : part.text;
                quoteDiv.textContent = truncatedText;
                element.appendChild(quoteDiv);
            } else if (part.type === 'text') {
                const textDiv = document.createElement('div');
                textDiv.style.whiteSpace = 'pre-wrap';
                textDiv.textContent = part.text;
                element.appendChild(textDiv);
            } else if (part.type === 'image_url') {
                const img = document.createElement('img');
                img.src = part.image_url.url;
                img.className = 'preview';
                img.style.maxWidth = '200px';
                img.style.borderRadius = '8px';
                element.appendChild(img);
            } else if (part.type === 'file') {
                const fileChip = document.createElement('div');
                fileChip.className = 'file-chip-display';
                fileChip.innerHTML = `
                    <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                    <span class="file-name">${part.filename}</span>`;
                fileChip.dataset.filename = part.filename;
                fileChip.addEventListener('click', () => {
                    showFileViewer(part.filename, part.content);
                });
                element.appendChild(fileChip);
            }
        });

        if (renderTimeout) {
            clearTimeout(renderTimeout);
        }
        return null;
    }

    let messageText = '';
    let localCitations = citations;

    if (typeof content === 'object' && content !== null && 'content' in content) {
        messageText = content.content;
        if (content.citations) {
            localCitations = content.citations;
        }
    } else if (typeof content === 'string') {
        messageText = content;
    } else {
        element.textContent = String(content);
        if (renderTimeout) {
            clearTimeout(renderTimeout);
        }
        clearRenderState();
        return null;
    }

    const isPreformattedImageHtml = messageText.includes('<div class="image-preview-container">');
    if (isPreformattedImageHtml) {
        if (window.DOMPurify) {
            element.innerHTML = DOMPurify.sanitize(messageText, {
                ADD_TAGS: ['svg', 'path', 'div', 'img', 'button', 'p', 'strong'],
                ADD_ATTR: ['viewBox', 'd', 'fill', 'class', 'src', 'alt', 'style', 'title', 'data-action', 'data-image-url', 'data-description']
            });
        } else {
            element.textContent = messageText.replace(/<[^>]*>/g, '');
        }

        if (renderTimeout) {
            clearTimeout(renderTimeout);
        }
        clearRenderState();
        return null;
    }

    try {
        const resourcesReady = window.marked && window.DOMPurify && window.hljs && window.renderMathInElement;
        if (!resourcesReady) {
            element.textContent = messageText;
            if (renderTimeout) clearTimeout(renderTimeout);
            clearRenderState();
            return null;
        }

        let correctedContent = mathRenderer.preprocessMarkdown(messageText);
        const displayMath = [];
        const inlineMath = [];

        let protectedContent = correctedContent.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
            displayMath.push(mathRenderer.normalizeDelimited(match));
            return `%%DISPLAY_MATH_${displayMath.length - 1}%%`;
        });

        protectedContent = protectedContent.replace(/\$([^$\n]+?)\$/g, (match) => {
            inlineMath.push(mathRenderer.normalizeDelimited(match));
            return `%%INLINE_MATH_${inlineMath.length - 1}%%`;
        });

        let contentToParse = protectedContent;
        let syntheticFenceAdded = false;

        if (!isFinalRender) {
            const lines = protectedContent.split(/\r?\n/);
            let openFence = null;
            for (const line of lines) {
                const m = line.match(/^\s{0,3}([`~]{3,})(.*)$/);
                if (!m) continue;
                const fenceChars = m[1];
                const ch = fenceChars[0];
                const len = fenceChars.length;
                if (!openFence) {
                    openFence = { ch, len };
                } else if (ch === openFence.ch && len >= openFence.len) {
                    openFence = null;
                }
            }

            if (openFence) {
                const tailPartialRe = new RegExp(`(?:\\r?\\n)?\\s*${openFence.ch === '`' ? "\\`" : "~"}{1,2}\\s*$`);
                contentToParse = protectedContent.replace(tailPartialRe, '');

                const fenceLine = (contentToParse.endsWith('\n') ? '' : '\n') + openFence.ch.repeat(openFence.len);
                contentToParse = contentToParse + fenceLine;
                syntheticFenceAdded = true;
            }

            if (!syntheticFenceAdded) {
                contentToParse = stripStreamingHorizontalRuleTail(contentToParse);
            }
        }

        const containsExplicitHorizontalRule = EXPLICIT_HORIZONTAL_RULE_RE.test(contentToParse) || /<\s*hr\b/i.test(contentToParse);

        const previousScrollState = {
            codeBlocks: Array.from(element.querySelectorAll('pre')).map(block => ({
                scrollLeft: block.scrollLeft,
                scrollTop: block.scrollTop
            })),
            tables: Array.from(element.querySelectorAll('.table-wrapper')).map(wrapper => ({
                scrollLeft: wrapper.scrollLeft,
                scrollTop: wrapper.scrollTop
            }))
        };

        let html = marked.parse(contentToParse);

        const sourcesMap = new Map();
        if (localCitations && localCitations.length > 0) {
            localCitations.forEach((citation, index) => {
                sourcesMap.set(index + 1, citation);
            });
        }
        const citationRegex = /([（(]?)\s*\[([\d, ]+)\]\s*([）)])?/g;
        let citedHtml = html.replace(citationRegex, (match, openParen, numbersStr, closeParen) => {
            const numbers = numbersStr.split(',').map(s => parseInt(s.trim(), 10));
            const links = numbers.map(number => {
                if (isNaN(number)) return '';
                const source = sourcesMap.get(number);
                return source && source.uri ? `<a href="${source.uri}" target="_blank" title="${source.title || ''}" class="citation-link">[${number}]</a>` : `[${number}]`;
            }).join('');

            if (!links) {
                return match;
            }
            if (openParen && closeParen) {
                return links;
            }
            if (openParen && !closeParen) {
                return openParen + links;
            }
            if (!openParen && closeParen) {
                return links + closeParen;
            }
            return links;
        });
        if (sourcesMap.size > 0) {
            let sourcesListHtml = `<div class="sources-list-container"><h4>${getToastMessage('ui.references')}：</h4><ul>`;
            sourcesMap.forEach((source, number) => {
                sourcesListHtml += `<li><span class="source-number">[${number}]</span> <a href="${source.uri}" target="_blank" title="${source.uri}">${source.title || source.uri}</a></li>`;
            });
            sourcesListHtml += '</ul></div>';
            citedHtml += sourcesListHtml;
        }
        html = citedHtml;

        html = html.replace(/%%DISPLAY_MATH_(\d+)%%/g, (match, index) => displayMath[parseInt(index, 10)]);
        html = html.replace(/%%INLINE_MATH_(\d+)%%/g, (match, index) => inlineMath[parseInt(index, 10)]);

        const sanitizedHtml = DOMPurify.sanitize(html, {
            ADD_TAGS: ['div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'img', 'br', 'a', 'h4', 'ul', 'li'],
            ADD_ATTR: ['style', 'class', 'aria-hidden', 'src', 'alt', 'title', 'href', 'target', 'rel']
        });

        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = sanitizedHtml;
        if (!containsExplicitHorizontalRule) {
            try {
                tempContainer.querySelectorAll('hr').forEach(hr => hr.remove());
            } catch (_) { }
        }

        tempContainer.querySelectorAll('table').forEach(table => {
            const rows = table.querySelectorAll('tr');
            if (rows.length > MAX_TABLE_ROWS) {
                const tbody = table.querySelector('tbody');
                if (tbody) {
                    const originalRows = Array.from(tbody.querySelectorAll('tr'));
                    tbody.innerHTML = '';
                    originalRows.slice(0, MAX_TABLE_ROWS).forEach(row => tbody.appendChild(row));
                }

                const warningDiv = document.createElement('div');
                warningDiv.textContent = getToastMessage('status.tableTruncated', { maxRows: MAX_TABLE_ROWS, totalRows: rows.length });
                warningDiv.style.cssText = "color: #ff9800; font-size: 12px; margin-top: 8px; text-align: center; padding: 4px; background-color: #fffbe6; border: 1px solid #ffe58f; border-radius: 4px;";

                if (table.parentElement && table.parentElement.classList.contains('table-wrapper')) {
                    table.parentElement.insertAdjacentElement('afterend', warningDiv);
                } else {
                    table.insertAdjacentElement('afterend', warningDiv);
                }
            }
        });

        try {
            tempContainer.querySelectorAll('pre code').forEach(codeEl => {
                const original = codeEl.textContent || '';
                if (!original) return;
                const lines = original.split(/\r?\n/);
                while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
                let changed = false;
                while (lines.length && /^[`~]{1,2}$/.test(lines[lines.length - 1].trim())) { lines.pop(); changed = true; }
                if (lines.length && /^>$/.test(lines[lines.length - 1].trim())) { lines.pop(); changed = true; }
                if (changed) {
                    codeEl.textContent = lines.join('\n');
                }
            });
        } catch (_) { }

        try {
            const removePatterns = [/^\s*>\s*$/, /^\s*\]>\s*$/, /^\s*\|>\s*$/];
            const walker = document.createTreeWalker(tempContainer, NodeFilter.SHOW_TEXT, null, false);
            const toRemove = [];
            let n;
            while ((n = walker.nextNode())) {
                const parentTag = (n.parentNode && n.parentNode.tagName) ? n.parentNode.tagName.toUpperCase() : '';
                if (parentTag === 'CODE' || parentTag === 'PRE' || parentTag === 'BLOCKQUOTE' || parentTag === 'A') continue;
                const txt = (n.textContent || '').trim();
                if (!txt) continue;
                if (removePatterns.some(re => re.test(txt))) {
                    toRemove.push(n);
                }
            }
            toRemove.forEach(node => node.parentNode && node.parentNode.removeChild(node));
        } catch (_) { }

        try {
            const preBlocks = tempContainer.querySelectorAll('pre');
            if (preBlocks.length > 0) {
                const lastPre = preBlocks[preBlocks.length - 1];
                if (lastPre && !lastPre.nextElementSibling) {
                    const codeEl = lastPre.querySelector('code');
                    const codeText = codeEl ? (codeEl.textContent || '').trim() : '';
                    if (!isFinalRender && codeText.length === 0) {
                        lastPre.parentNode.removeChild(lastPre);
                    }
                }
            }
        } catch (_) { }

        const finalSanitizedHtml = tempContainer.innerHTML;
        const renderState = element.__renderState || (element.__renderState = {
            lockedLength: 0,
            lockedHtml: '',
            lastLockedHtml: '',
            streamingHtml: '',
            lockedContainer: null,
            streamingContainer: null
        });

        const lowerHtml = finalSanitizedHtml.toLowerCase();
        const lastTableCloseIndex = lowerHtml.lastIndexOf('</table>');
        const lastPreCloseIndex = lowerHtml.lastIndexOf('</pre>');
        const tableLockEnd = lastTableCloseIndex === -1 ? -1 : lastTableCloseIndex + '</table>'.length;
        const codeLockEnd = lastPreCloseIndex === -1 ? -1 : lastPreCloseIndex + '</pre>'.length;

        const newLockEnd = syntheticFenceAdded
            ? tableLockEnd
            : Math.max(tableLockEnd, codeLockEnd);

        if (newLockEnd > renderState.lockedLength) {
            renderState.lockedLength = newLockEnd;
            renderState.lockedHtml = finalSanitizedHtml.slice(0, newLockEnd);
        }

        let streamingHtml = finalSanitizedHtml.slice(renderState.lockedLength);

        if (!isFinalRender && streamingHtml) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = streamingHtml;

            const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
            let targetNode = null;
            while (true) {
                const n = walker.nextNode();
                if (!n) break;
                const parentTag = (n.parentNode && n.parentNode.tagName) ? n.parentNode.tagName.toUpperCase() : '';
                if (parentTag !== 'CODE' && parentTag !== 'PRE' && parentTag !== 'BLOCKQUOTE') {
                    targetNode = n;
                    break;
                }
            }

            if (targetNode && targetNode.textContent) {
                const before = targetNode.textContent;
                const after = before
                    .replace(/^\s*>(\s+)?/, '')
                    .replace(/^\s*([`~]{3,})\s*$/, '')
                    .replace(/^\s*([`~]{1,2})\s*$/, '')
                    .replace(/^\s*\]\>\s*/, '')
                    .replace(/^\s*\|\>\s*/, '')
                    .replace(/^\s*\]>\s*/, '');
                if (after !== before) {
                    targetNode.textContent = after;
                    streamingHtml = tempDiv.innerHTML;
                }
            }
        }

        if (!renderState.lockedContainer || !renderState.streamingContainer || !element.contains(renderState.lockedContainer)) {
            element.innerHTML = '';
            renderState.lockedContainer = document.createElement('div');
            renderState.lockedContainer.className = 'locked-response-content';
            renderState.lockedContainer.style.display = 'contents';
            renderState.streamingContainer = document.createElement('div');
            renderState.streamingContainer.className = 'streaming-response-content';
            renderState.streamingContainer.style.display = 'contents';
            element.appendChild(renderState.lockedContainer);
            element.appendChild(renderState.streamingContainer);
            renderState.lastLockedHtml = '';
            renderState.streamingHtml = '';
        }

        if (renderState.lastLockedHtml !== renderState.lockedHtml) {
            let contentChanged = false;
            if (renderState.lockedHtml.startsWith(renderState.lastLockedHtml)) {
                const delta = renderState.lockedHtml.slice(renderState.lastLockedHtml.length);
                if (delta) {
                    renderState.lockedContainer.insertAdjacentHTML('beforeend', delta);
                    contentChanged = true;
                }
            } else {
                renderState.lockedContainer.innerHTML = renderState.lockedHtml;
                contentChanged = true;
            }
            renderState.lastLockedHtml = renderState.lockedHtml;

            if (contentChanged && !userHasScrolledUp && elements?.chatContainer) {
                elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
            }
        }

        if (renderState.streamingHtml !== streamingHtml) {
            let contentChanged = false;
            if (streamingHtml.startsWith(renderState.streamingHtml)) {
                const delta = streamingHtml.slice(renderState.streamingHtml.length);
                if (delta) {
                    renderState.streamingContainer.insertAdjacentHTML('beforeend', delta);
                    contentChanged = true;
                }
            } else {
                renderState.streamingContainer.innerHTML = streamingHtml;
                contentChanged = true;
            }
            renderState.streamingHtml = streamingHtml;

            if (contentChanged && !userHasScrolledUp && elements?.chatContainer) {
                elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
            }
        }
        const mermaidRenderPromise = renderMermaidDiagrams(element, { loadScript, isFinalRender });
        if (mermaidRenderPromise) {
            element.__mermaidRenderPromise = mermaidRenderPromise;
            mermaidRenderPromise.catch(() => { }).finally(() => {
                if (!userHasScrolledUp && elements?.chatContainer) {
                    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
                }
            });
        }
        const vegaRenderPromise = renderVegaLiteDiagrams(element, { loadScript, isFinalRender });
        if (vegaRenderPromise) {
            element.__vegaLiteRenderPromise = vegaRenderPromise;
            vegaRenderPromise.catch(() => { }).finally(() => {
                if (!userHasScrolledUp && elements?.chatContainer) {
                    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
                }
            });
        }

        mathRenderer.renderMath(element, { isFinalRender });
        if (window.hljs) {
            ensurePlaintextHighlightLanguage();
            if (isFinalRender) {
                const candidateBlocks = Array.from(element.querySelectorAll('pre code'))
                    .filter(block => block.dataset.mermaidPending !== 'true' &&
                        block.dataset.mermaidProcessed !== 'true' &&
                        block.dataset.vegaLitePending !== 'true' &&
                        block.dataset.vegaLiteProcessed !== 'true' &&
                        block.closest('.mermaid-render-container') === null &&
                        block.closest('.vega-lite-render-container') === null &&
                        !(block.className || '').includes('language-plaintext') &&
                        !(block.className || '').includes('language-mermaid') &&
                        !(block.className || '').includes('language-vega-lite') &&
                        !(block.className || '').includes('language-vega'));

                const totalCodeBlocks = candidateBlocks.length;
                const highlightedBlocks = candidateBlocks.filter(block => block.classList.contains('hljs')).length;

                if (highlightedBlocks < totalCodeBlocks) {
                    candidateBlocks
                        .filter(block => !block.classList.contains('hljs'))
                        .forEach(block => {
                            try {
                                hljs.highlightElement(block);
                            } catch (e) { }
                        });
                }
            } else {
                element.querySelectorAll('pre code:not(.hljs)').forEach(block => {
                    if (block.dataset.mermaidPending === 'true' ||
                        block.dataset.mermaidProcessed === 'true' ||
                        block.dataset.vegaLitePending === 'true' ||
                        block.dataset.vegaLiteProcessed === 'true' ||
                        block.closest('.mermaid-render-container') ||
                        block.closest('.vega-lite-render-container') ||
                        (block.className || '').includes('language-plaintext') ||
                        (block.className || '').includes('language-mermaid') ||
                        (block.className || '').includes('language-vega-lite') ||
                        (block.className || '').includes('language-vega')) {
                        return;
                    }
                    try {
                        hljs.highlightElement(block);
                    } catch (e) { }
                });
            }
        }

        // 为代码块添加复制按钮
        element.querySelectorAll('pre code').forEach(block => {
            const pre = block.parentElement;
            if (pre && !pre.querySelector('.copy-btn-wrapper')) {
                addCopyButtonToCodeBlock(pre, block);
            }
        });


        element.querySelectorAll('img:not([data-image-url])').forEach(img => {
            if (!img.closest('.image-preview-container')) {
                img.style.cursor = 'pointer';
                img.style.maxWidth = '250px';
                img.style.borderRadius = '8px';
                img.dataset.imageUrl = img.src;
            }
        });

        const tables = Array.from(element.querySelectorAll('table'));
        const tableContainers = [];
        tables.forEach(table => {
            let wrapper = table.parentNode;
            if (!wrapper.classList || !wrapper.classList.contains('table-wrapper')) {
                wrapper = document.createElement('div');
                wrapper.className = 'table-wrapper';
                table.parentNode.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }
            wrapper.style.overflowX = 'auto';
            wrapper.style.webkitOverflowScrolling = 'touch';
            tableContainers.push(wrapper);
        });
        tableContainers.forEach((wrapper, index) => {
            const previous = previousScrollState.tables[index];
            if (previous) {
                if (typeof previous.scrollLeft === 'number') {
                    wrapper.scrollLeft = previous.scrollLeft;
                }
                if (typeof previous.scrollTop === 'number') {
                    wrapper.scrollTop = previous.scrollTop;
                }
            }
        });

        const latestCodeBlocks = Array.from(element.querySelectorAll('pre'));
        latestCodeBlocks.forEach((block, index) => {
            const previous = previousScrollState.codeBlocks[index];
            if (previous) {
                if (typeof previous.scrollLeft === 'number') {
                    block.scrollLeft = previous.scrollLeft;
                }
                if (typeof previous.scrollTop === 'number') {
                    block.scrollTop = previous.scrollTop;
                }
            }
        });

        if (renderTimeout) {
            clearTimeout(renderTimeout);
        }
        return vegaRenderPromise || element.__mermaidRenderPromise || null;

    } catch (error) {
        if (renderTimeout) {
            clearTimeout(renderTimeout);
        }
        console.error(`${getToastMessage('console.contentRenderFailed')}:`, error);
        element.textContent = content;
        clearRenderState();
        return null;
    }
}

function createMessageElement(role, messageObject) {
    const content = messageObject.content;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'avatar';

    if (role === 'user') {
        if (currentUser?.avatar_url) {
            const img = document.createElement('img');
            img.src = currentUser.avatar_url;
            img.alt = getToastMessage('ui.userAvatar');
            img.onerror = () => {
                avatarDiv.innerHTML = '';
                avatarDiv.textContent = currentUser ? (currentUser.username || currentUser.email).charAt(0).toUpperCase() : 'U';
            };
            avatarDiv.appendChild(img);
        } else {
            avatarDiv.textContent = currentUser ? (currentUser.username || currentUser.email).charAt(0).toUpperCase() : 'U';
        }
    } else {
        const img = document.createElement('img');
        img.src = '/images/favicon.ico';
        img.alt = getToastMessage('ui.aiAssistant');
        img.style.width = '20px';
        img.style.height = '20px';
        avatarDiv.appendChild(img);
    }

    const messageContainerDiv = document.createElement('div');
    messageContainerDiv.className = 'message-container';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    let renderPromise = null;
    if (content) {
        if (typeof content === 'object' && content !== null && 'content' in content) {
            renderPromise = renderMessageContent(contentDiv, content.content, content.citations, true);
        } else {
            renderPromise = renderMessageContent(contentDiv, content, messageObject.citations || null, true);
        }
    }
    messageContainerDiv.appendChild(contentDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    const getAttachmentQuotePlaceholder = () => {
        const originalContent = messageObject?.content;
        let parts = [];

        if (Array.isArray(originalContent)) {
            parts = originalContent;
        } else if (originalContent && typeof originalContent === 'object' && Array.isArray(originalContent.content)) {
            parts = originalContent.content;
        }

        if (!parts.length) return '';

        const relevantParts = parts.filter(part => part && part.type && part.type !== 'quote');
        if (!relevantParts.length) return '';

        const hasTextPart = relevantParts.some(part =>
            part.type === 'text' && typeof part.text === 'string' && part.text.trim() !== ''
        );
        if (hasTextPart) return '';

        const hasImage = relevantParts.some(part => part.type === 'image_url');
        const hasFile = relevantParts.some(part => part.type === 'file');

        if (hasImage && hasFile) {
            return getToastMessage('ui.quoteAttachmentPlaceholder');
        }
        if (hasImage) {
            return getToastMessage('ui.quoteImagePlaceholder');
        }
        if (hasFile) {
            return getToastMessage('ui.quoteFilePlaceholder');
        }

        return '';
    };

    const quoteBtn = document.createElement('button');
    quoteBtn.className = 'message-action-btn';
    quoteBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z"/></svg>
        <span>${getToastMessage('ui.quote')}</span>
    `;
    quoteBtn.addEventListener('click', (e) => {
        const btn = e.currentTarget;

        let quoteText = contentDiv.innerText.trim();
        if (!quoteText) {
            quoteText = getAttachmentQuotePlaceholder();
        }

        currentQuote = quoteText;
        renderQuotePreview();
        elements.messageInput.focus();

        const allMessages = elements.chatContainer.querySelectorAll('.message');
        const isLastMessage = messageDiv === allMessages[allMessages.length - 1];

        if (isLastMessage) {
            setTimeout(() => {
                smoothScrollToBottom();
            }, 100);
        }

        btn.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            <span>${getToastMessage('ui.quoted')}</span>
        `;
        setTimeout(() => {
            btn.innerHTML = `
                <svg viewBox="0 0 24 24"><path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z"/></svg>
                <span>${getToastMessage('ui.quote')}</span>
            `;
        }, 2000);
    });
    actionsDiv.appendChild(quoteBtn);

    if (role === 'user') {
        const editBtn = document.createElement('button');
        editBtn.className = 'message-action-btn';
        editBtn.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>
            <span>${getToastMessage('ui.modify')}</span>
        `;
        editBtn.disabled = true;
        editBtn.style.display = 'none';

        editBtn.addEventListener('click', () => {
            if (editBtn.disabled) return;
            startInlineEditMode();
        });
        actionsDiv.appendChild(editBtn);
    }

    if (role === 'assistant') {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'message-action-btn';
        copyBtn.innerHTML = `
            <svg class="copy-icon" viewBox="0 0 24 24">
                <path d="${ICONS.COPY}"/>
            </svg>
            <span class="copy-text">${getToastMessage('ui.copy')}</span>
        `;
        copyBtn.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const textToCopy = contentDiv.innerText;

            try {
                if (isNativeApp) {
                    await Clipboard.write({
                        string: textToCopy
                    });
                } else {
                    await navigator.clipboard.writeText(textToCopy);
                }

                btn.querySelector('.copy-text').textContent = getToastMessage('status.copied');
                const iconPath = btn.querySelector('.copy-icon path');
                if (iconPath) {
                    iconPath.setAttribute('d', ICONS.CHECK);
                }

                setTimeout(() => {
                    btn.querySelector('.copy-text').textContent = getToastMessage('status.copy');
                    if (iconPath) {
                        iconPath.setAttribute('d', ICONS.COPY);
                    }
                }, 2000);

            } catch (err) {
                console.error(`${getToastMessage('console.copyFailed')}:`, err);
                showToast(getToastMessage('toast.copyFailed'), 'error');
            }
        });
        actionsDiv.appendChild(copyBtn);
    }
    messageContainerDiv.appendChild(actionsDiv);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(messageContainerDiv);

    return {
        element: messageDiv,
        promise: (renderPromise && typeof renderPromise.then === 'function') ? renderPromise : null
    };
}

// 编辑模式全局状态
let isEditModeActive = false;
let editModeState = null;

function showEditBar() {
    if (!editModeState || !editModeState.messageEl) return;

    const targetEl = editModeState.messageEl;
    const containerInMsg = document.createElement('div');
    containerInMsg.className = 'inline-edit-container';

    const textarea = document.createElement('textarea');
    textarea.className = 'inline-edit-textarea';
    textarea.value = extractTextFromUserContent(editModeState.originalUserMessage?.content) || '';

    const actions = document.createElement('div');
    actions.className = 'inline-edit-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = getToastMessage('common.cancel');
    const updateBtn = document.createElement('button');
    updateBtn.className = 'btn-update';
    updateBtn.textContent = getToastMessage('ui.update') || 'Update';

    actions.appendChild(cancelBtn);
    actions.appendChild(updateBtn);
    containerInMsg.appendChild(textarea);
    containerInMsg.appendChild(actions);

    const container = targetEl.querySelector('.message-container');
    const contentDiv = targetEl.querySelector('.content');
    const actionsRow = targetEl.querySelector('.message-actions');
    if (contentDiv) contentDiv.style.display = 'none';
    if (container) {
        if (actionsRow) {
            container.insertBefore(containerInMsg, actionsRow);
        } else {
            container.appendChild(containerInMsg);
        }
    }

    targetEl.classList.add('editing');
    if (actionsRow) actionsRow.style.display = 'none';

    cancelBtn.addEventListener('click', cancelInlineEditMode);
    updateBtn.addEventListener('click', commitInlineEditMode);

    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const shouldSend = isMobileUA ? true : !e.shiftKey;
            if (shouldSend) {
                e.preventDefault();
                commitInlineEditMode();
            }
        }
    });

    editModeState.ui = {
        container: containerInMsg, textarea, cancelBtn, updateBtn
    };

    try {
        document.body.classList.add('editing-inline-mode');
        requestAnimationFrame(() => {
            try {
                textarea.focus();
                const len = textarea.value.length;
                textarea.setSelectionRange(len, len);
            } catch (_) { }
        });
    } catch (_) { }
}

function hideEditBar() {
    if (!editModeState) return;
    const { messageEl, ui } = editModeState;
    if (ui && ui.container && ui.container.parentElement) {
        ui.container.parentElement.removeChild(ui.container);
    }
    if (messageEl) {
        messageEl.classList.remove('editing');
        const actionsRow = messageEl.querySelector('.message-actions');
        if (actionsRow) actionsRow.style.display = '';
        const contentDiv = messageEl.querySelector('.content');
        if (contentDiv) contentDiv.style.display = '';
    }
    try { document.body.classList.remove('editing-inline-mode'); } catch (_) { }
}

function extractTextFromUserContent(content) {
    try {
        if (Array.isArray(content)) {
            const texts = content.filter(p => p && p.type === 'text' && typeof p.text === 'string').map(p => p.text);
            return texts.join('\n').trim();
        }
        if (content && typeof content === 'object' && Array.isArray(content.content)) {
            const texts = content.content.filter(p => p && p.type === 'text' && typeof p.text === 'string').map(p => p.text);
            return texts.join('\n').trim();
        }
        if (typeof content === 'string') return content;
    } catch (_) { }
    return '';
}

function cloneUserPartsWithNewText(originalContent, newText) {
    const parts = Array.isArray(originalContent)
        ? originalContent.slice()
        : (originalContent && Array.isArray(originalContent.content) ? originalContent.content.slice() : []);

    const nonText = parts.filter(p => p.type !== 'text');
    const result = [];
    if (nonText.length) result.push(...nonText);
    if (newText && newText.trim()) result.push({ type: 'text', text: newText.trim() });
    result.sort((a, b) => {
        const order = { quote: 0, file: 1, image_url: 1, text: 2 };
        return (order[a.type] || 99) - (order[b.type] || 99);
    });
    return result;
}

function refreshEditButtons() {
    try {
        const messagesEls = elements.chatContainer.querySelectorAll('.message');
        if (!messagesEls || messagesEls.length < 2) return;
        const lastEl = messagesEls[messagesEls.length - 1];
        const prevEl = messagesEls[messagesEls.length - 2];

        let prevHasText = false;
        try {
            const chat = chats[currentChatId];
            const msgs = chat?.messages || [];
            if (msgs.length >= 2) {
                const prevMsg = msgs[msgs.length - 2];
                if (prevMsg && prevMsg.role === 'user') {
                    const txt = extractTextFromUserContent(prevMsg.content) || '';
                    prevHasText = txt.trim().length > 0;
                }
            }
        } catch (_) { prevHasText = false; }
        const canShow = lastEl.classList.contains('assistant') && prevEl.classList.contains('user') && prevHasText && !isProcessing && !activeResponses.has(currentChatId) && !isEditModeActive;

        elements.chatContainer.querySelectorAll('.message.user .message-actions .message-action-btn').forEach(btn => {
            if (btn.querySelector('span') && btn.querySelector('span').textContent === getToastMessage('ui.modify')) {
                btn.style.display = 'none';
                btn.disabled = true;
            }
        });
        if (canShow) {
            const targetBtn = prevEl.querySelector('.message-actions .message-action-btn:last-child');
            if (targetBtn && targetBtn.querySelector('span') && targetBtn.querySelector('span').textContent === getToastMessage('ui.modify')) {
                targetBtn.style.display = 'inline-flex';
                targetBtn.disabled = false;
            }
        }
    } catch (_) { }
}

function updateMessageActionLabels() {
    try {
        const quoteText = getToastMessage('ui.quote');
        const copyText = getToastMessage('ui.copy');
        const modifyText = getToastMessage('ui.modify');

        elements.chatContainer
            .querySelectorAll('.message.assistant .message-actions .copy-text')
            .forEach(span => { span.textContent = copyText; });

        elements.chatContainer.querySelectorAll('.message .message-actions').forEach(actions => {
            const buttons = actions.querySelectorAll('.message-action-btn');
            if (buttons.length > 0) {
                const firstSpan = buttons[0].querySelector('span');
                if (firstSpan && !firstSpan.classList.contains('copy-text')) {
                    firstSpan.textContent = quoteText;
                }
            }
            const messageEl = actions.closest('.message');
            if (messageEl && messageEl.classList.contains('user') && buttons.length > 1) {
                const lastBtn = buttons[buttons.length - 1];
                const span = lastBtn?.querySelector('span');
                if (span && !span.classList.contains('copy-text')) {
                    span.textContent = modifyText;
                }
            }
        });
    } catch (_) { }
}

try {
    onAfterLanguageApplied(updateMessageActionLabels);
} catch (_) { }

function appendMessage(role, content) {
    const emptyState = elements.chatContainer.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    const { element: messageElement, promise: renderPromise } = createMessageElement(role, { content: content });

    elements.chatContainer.appendChild(messageElement);

    const scrollHeight = elements.chatContainer.scrollHeight;
    const clientHeight = elements.chatContainer.clientHeight;
    const scrollTop = elements.chatContainer.scrollTop;
    const isScrolledToBottom = scrollHeight - clientHeight <= scrollTop + 20;

    // 当用户发送消息且当前不在底部时，滚动到底部
    const shouldForceScroll = role === 'user' && !isScrolledToBottom;

    if (shouldForceScroll || isScrolledToBottom) {
        isAutoScrolling = true;
        lastScrollTime = Date.now();
        if (shouldForceScroll) {
            try {
                userHasScrolledUp = false;
            } catch (_) { }
        }
        const scrollToBottom = () => {
            requestAnimationFrame(() => {
                elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
                setTimeout(() => {
                    isAutoScrolling = false;
                }, 100);
            });
        };

        scrollToBottom();
        const ensureActions = () => ensureMessageActionsVisible(messageElement);
        if (renderPromise && typeof renderPromise.then === 'function') {
            renderPromise.finally(() => {
                scrollToBottom();
                ensureActions();
            });
        } else {
            ensureActions();
        }
    }

    if (isWelcomePage) {
        isWelcomePage = false;
        welcomePageShown = false;
        elements.chatContainer.style.overflowY = 'auto';
    }

    refreshEditButtons();
    return messageElement.querySelector('.message-container');
}

function removeAttachment(attachmentId) {
    const index = attachments.findIndex(a => a.id === attachmentId);
    if (index > -1) {
        attachments.splice(index, 1);
    }
    const element = document.querySelector(`[data-attachment-id="${attachmentId}"]`);
    if (element) element.remove();
    if (attachments.length === 0) elements.attachmentsPreview.classList.remove('has-files');

    updateCharacterCountUI();
    updateSendButton();
    resetCharCountTimer();
}

function getDraftKey(chatId) {
    return chatId || CHAT_DRAFT_DEFAULT_KEY;
}

function persistCurrentDraft(chatId = currentChatId) {
    if (!elements?.messageInput) return;
    const key = getDraftKey(chatId);
    const text = elements.messageInput.value || '';
    const clonedAttachments = attachments.map(att => ({
        file: att.file || null,
        type: att.type,
        content: att.content || null
    }));
    chatDraftStore.set(key, { text, attachments: clonedAttachments });
}

function restoreDraftForChat(chatId = currentChatId) {
    const key = getDraftKey(chatId);
    const draft = chatDraftStore.get(key);

    clearInputAndAttachments(true);

    if (!draft) {
        updateSendButton();
        resetCharCountTimer();
        updateCharacterCountUI();
        return;
    }

    if (elements.messageInput) {
        elements.messageInput.value = draft.text || '';
        elements.messageInput.style.height = 'auto';
        elements.messageInput.style.height = `${elements.messageInput.scrollHeight}px`;
    }

    if (Array.isArray(draft.attachments)) {
        draft.attachments.forEach((att) => {
            if (!att || (!att.file && !att.content)) return;
            const isImage = att.type === 'image' || (att.file?.type || '').startsWith('image/');
            const newId = addAttachment(att.file, isImage ? 'image' : (att.type || 'file'));
            if (att.content) {
                completeUpload(newId, att.content);
            }
        });
    }

    updateCharacterCountUI();
    updateSendButton();
    resetCharCountTimer();
}

function cleanupEmptyMessagePlaceholders() {
    const container = elements.chatContainer;
    if (!container) return;
    const messages = container.querySelectorAll('.message');
    messages.forEach(message => {
        const contentDiv = message.querySelector('.content');
        if (!contentDiv) return;
        const hasSpinner = !!contentDiv.querySelector('.thinking-indicator-new');
        const textContent = (contentDiv.textContent || '').trim();
        const hasMedia = contentDiv.querySelector('img, video, pre, code, table, blockquote, ul, ol, .file-chip-display, .rendered-markdown, .assistant-card, .image-result');
        const hasExternalAttachments = message.querySelector('.attachments-preview, .file-chip-display');
        if ((hasSpinner || textContent.length === 0) && !hasMedia && !hasExternalAttachments) {
            message.remove();
        }
    });
}

async function processAndAttachFile(file) {
    const isDuplicate = attachments.some(attachment =>
        attachment.file && attachment.file.name === file.name && attachment.file.size === file.size
    );
    if (isDuplicate) {
        showToast(getToastMessage('toast.fileAlreadyExists', { filename: file.name }), 'info');
        return;
    }

    const isGuest = !currentUser;
    const maxSize = isGuest ? GUEST_FILE_SIZE_LIMIT : LOGGED_IN_FILE_SIZE_LIMIT;
    const limitInMB = (maxSize / (1024 * 1024)).toFixed(1);

    if (file.size > maxSize) {
        const userType = isGuest ? getToastMessage('ui.guest') : getToastMessage('ui.you');
        showToast(getToastMessage('toast.fileTooLarge', { filename: file.name, userType: userType, limit: limitInMB }), 'error');
        throw new Error('File size exceeds limit');
    }

    const attachmentId = addAttachment(file, file.type.startsWith('image/') ? 'image' : 'file');

    try {
        let content = '';
        const extension = file.name.split('.').pop()?.toLowerCase();

        if (file.type.startsWith('image/')) {
            content = await imageToBase64(file);
        } else if (extension === 'docx') {
            content = await readDocxFile(file);
        } else if (extension === 'pdf') {
            content = await readPdfFile(file);
        } else if (['xlsx', 'xls', 'csv'].includes(extension)) {
            content = await readExcelFile(file);
        } else if (['pptx'].includes(extension)) {
            try {
                await loadScript('/libs/turndown.min.js', 'turndownService');
                await loadScript('/libs/turndown-plugin-gfm.min.js', 'turndownPluginGfm');
                if (!window.turndownService || !window.turndownService.turndown) {
                    const Ctor = typeof window.turndownService === 'function' && !window.turndownService.turndown
                        ? window.turndownService
                        : window.TurndownService;
                    if (typeof Ctor === 'function') {
                        window.turndownService = new Ctor({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
                        if (window.turndownPluginGfm && window.turndownPluginGfm.gfm && window.turndownService.use) {
                            window.turndownService.use(window.turndownPluginGfm.gfm);
                        }
                    }
                }
                content = await readPptxFile(file);
            } catch (pptxError) {
                const errorMessage = pptxError.message || getToastMessage('errors.markdownConverterLoadFailed');
                showToast(`${getToastMessage('console.skipFile', { filename: file.name })}: ${errorMessage}`, 'info');
                removeAttachment(attachmentId);
                return;
            }
        } else if (isPlainTextFile(file.name)) {
            content = await readFileAsText(file);
        } else {
            showToast(getToastMessage('toast.unsupportedFileFormat', { extension: extension }), 'error');
            removeAttachment(attachmentId);
            throw new Error(`Unsupported file type: .${extension}`);
        }
        completeUpload(attachmentId, content);

        const { isOverLimit } = updateCharacterCountUI();
        if (isOverLimit) {
            showToast(getToastMessage('toast.exceedsCharacterLimit', { filename: file.name }), 'error');
        }

    } catch (error) {
        showToast(`${getToastMessage('toast.fileParseFailed', { filename: file.name })}: ${error.message || getToastMessage('toast.unknownError')}`, 'error');
        removeAttachment(attachmentId);
        throw error;
    }
}

async function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    const filePromises = [];
    let imagePasted = false;

    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            imagePasted = true;
            const fileBlob = item.getAsFile();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const file = new File([fileBlob], `${getToastMessage('ui.screenshot')}-${timestamp}.png`, { type: fileBlob.type });

            filesCurrentlyProcessing++;
            updateSendButton();

            const promise = processAndAttachFile(file)
                .catch(error => {
                    console.log(`${getToastMessage('console.pasteFileProcessFailed')}: ${error.message}`);
                })
                .finally(() => {
                    filesCurrentlyProcessing--;
                });

            filePromises.push(promise);
        }
    }

    if (imagePasted) {
        e.preventDefault();
        Promise.all(filePromises).then(() => {
            updateSendButton();
            resetCharCountTimer();
        });
    }
}

function addAttachment(file, type) {
    const attachmentId = attachmentIdCounter++;
    const attachment = { id: attachmentId, file, type, content: null };
    attachments.push(attachment);
    const element = document.createElement('div');
    element.dataset.attachmentId = attachmentId;
    if (type === 'image') {
        element.className = 'img-preview uploading';
    } else {
        element.className = 'file-chip uploading';
    }
    element.innerHTML = `
                <span class="file-name">${type === 'text' ? file.name : ''}</span>
                <div class="upload-progress-container">
                     <svg class="progress-circle" viewBox="0 0 22 22">
                        <circle class="progress-track" cx="11" cy="11" r="10"></circle>
                        <circle class="progress-fill" id="progress-${attachmentId}" cx="11" cy="11" r="10"></circle>
                    </svg>
                </div>
                 <button class="remove-btn">×</button>
            `;
    element.querySelector('.remove-btn').addEventListener('click', () => removeAttachment(attachmentId));
    elements.attachmentsPreview.appendChild(element);
    elements.attachmentsPreview.classList.add('has-files');
    updateSendButton();
    return attachmentId;
}

function completeUpload(attachmentId, content) {
    const attachment = attachments.find(a => a.id === attachmentId);
    if (!attachment) return;
    attachment.content = content;
    const element = document.querySelector(`[data-attachment-id="${attachmentId}"]`);
    if (element) {
        element.classList.remove('uploading');
        if (attachment.type === 'image') {
            element.innerHTML = `<img src="${content}" alt="${attachment.file.name}"><button class="remove-btn">×</button>`;
        } else {
            element.innerHTML = `<span class="file-name">${attachment.file.name}</span><button class="remove-btn">×</button>`;
        }
        element.querySelector('.remove-btn').addEventListener('click', () => removeAttachment(attachmentId));
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.readAsDataURL(blob);
    });
}

function base64ToBlob(base64, contentType) {
    try {
        const byteCharacters = atob(base64);
        const byteArrays = [];
        const sliceSize = 1024;
        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        return new Blob(byteArrays, { type: contentType || 'application/octet-stream' });
    } catch (e) {
        console.error('Failed to convert base64 to Blob:', e);
        throw e;
    }
}

async function imageToBase64(file) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if ((isMobile && file.size > 300000) || (!isMobile && file.size > 1000000)) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        const compressedFile = await new Promise((resolve) => {
            img.onload = () => {
                const maxWidth = isMobile ? 800 : 1200;
                const ratio = Math.min(1, maxWidth / img.width);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(resolve, 'image/jpeg', isMobile ? 0.7 : 0.85);
            };
            img.src = URL.createObjectURL(file);
        });
        file = compressedFile;
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsText(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

class IntentAnalyzer {
    constructor() {
        this.currentMessageIntentResult = null;
        this._imageKeywords = null;
        this._creativeKeywords = null;
        this._roleplayKeywords = null;
        this._classicalKeywords = null;
    }

    getImageKeywords() {
        if (!this._imageKeywords) {
            this._imageKeywords = [
                getToastMessage('intent.keywords.image.generate'),
                getToastMessage('intent.keywords.image.generatePhoto'),
                getToastMessage('intent.keywords.image.generateOne'),
                getToastMessage('intent.keywords.image.drawOne'),
                getToastMessage('intent.keywords.image.drawOnePicture'),
                getToastMessage('intent.keywords.image.helpDraw'),
                getToastMessage('intent.keywords.image.drawForMe'),
                'generate image', 'generate a picture', 'draw a picture', 'create an image', 'make an image'
            ];
        }
        return this._imageKeywords;
    }

    getCreativeKeywords() {
        if (!this._creativeKeywords) {
            this._creativeKeywords = [
                getToastMessage('intent.keywords.creative.writeOne'),
                getToastMessage('intent.keywords.creative.writeOneStory'),
                getToastMessage('intent.keywords.creative.write'),
                getToastMessage('intent.keywords.creative.fanfic'),
                getToastMessage('intent.keywords.creative.fanwork'),
                getToastMessage('intent.keywords.creative.story'),
                getToastMessage('intent.keywords.creative.novel'),
                getToastMessage('intent.keywords.creative.create'),
                getToastMessage('intent.keywords.creative.createOne'),
                'write a story', 'fanfic', 'create a story', 'tell me a story'
            ];
        }
        return this._creativeKeywords;
    }

    getRoleplayKeywords() {
        if (!this._roleplayKeywords) {
            this._roleplayKeywords = [
                getToastMessage('intent.keywords.roleplay.roleplay'),
                getToastMessage('intent.keywords.roleplay.play'),
                getToastMessage('intent.keywords.roleplay.playRole'),
                getToastMessage('intent.keywords.roleplay.roleSetting'),
                getToastMessage('intent.keywords.roleplay.character'),
                getToastMessage('intent.keywords.roleplay.createRole'),
                'roleplay', 'rp', 'character roleplay', 'role play', 'play a role'
            ];
        }
        return this._roleplayKeywords;
    }

    getClassicalKeywords() {
        if (!this._classicalKeywords) {
            this._classicalKeywords = [
                getToastMessage('intent.keywords.classical.ancientText'),
                getToastMessage('intent.keywords.classical.classicalChinese'),
                getToastMessage('intent.keywords.classical.ancientPoetry'),
                getToastMessage('intent.keywords.classical.poetry'),
                getToastMessage('intent.keywords.classical.historicalText'),
                getToastMessage('intent.keywords.classical.classicalLiterature'),
                getToastMessage('intent.keywords.classical.ancient'),
                getToastMessage('intent.keywords.classical.translateAncient'),
                getToastMessage('intent.keywords.classical.explainPoetry'),
                getToastMessage('intent.keywords.classical.translateClassical'),
                'classical chinese', 'ancient text', 'poetry'
            ];
        }
        return this._classicalKeywords;
    }


    reset() {
        this.currentMessageIntentResult = null;
    }

    clearKeywordCache() {
        this._imageKeywords = null;
        this._creativeKeywords = null;
        this._roleplayKeywords = null;
        this._classicalKeywords = null;
    }

    containsImageKeywords(text) {
        const lowerText = text.toLowerCase();
        return this.getImageKeywords().some(keyword => lowerText.includes(keyword.toLowerCase()));
    }

    containsCreativeKeywords(text) {
        const lowerText = text.toLowerCase();
        return this.getCreativeKeywords().some(kw => lowerText.includes(kw.toLowerCase()));
    }

    containsRoleplayKeywords(text) {
        const lowerText = text.toLowerCase();
        return this.getRoleplayKeywords().some(kw => lowerText.includes(kw.toLowerCase()));
    }

    containsClassicalChineseKeywords(text) {
        const lowerText = text.toLowerCase();
        return this.getClassicalKeywords().some(kw => lowerText.includes(kw.toLowerCase()));
    }

    shouldTriggerIntentAnalysis(userMessageText, conversationHistory = [], options = {}) {
        const {
            isImageModeActive = false
        } = options;

        if (isImageModeActive) {
            return true;
        }

        if (!isImageModeActive) {
            if (this.shouldDetectClassicalChinese(userMessageText)) {
                return true;
            }

            if (userMessageText.length >= 20 && this.shouldDetectRoleplay(userMessageText)) {
                return true;
            }

            if (userMessageText.length >= 20 && this.shouldDetectTextCreation(userMessageText)) {
                return true;
            }
        }

        return false;
    }

    shouldDetectClassicalChinese(userMessageText) {
        return this.containsClassicalChineseKeywords(userMessageText) &&
            (userMessageText.includes(getToastMessage('intent.keywords.classical.translate')) ||
                userMessageText.includes(getToastMessage('intent.keywords.classical.explain')) ||
                userMessageText.includes(getToastMessage('intent.keywords.classical.analyze')) ||
                userMessageText.includes(getToastMessage('intent.keywords.classical.whatMean')) ||
                userMessageText.includes(getToastMessage('intent.keywords.classical.meaning')));
    }

    shouldDetectRoleplay(userMessageText) {
        // 关键词触发
        if (this.containsRoleplayKeywords(userMessageText)) {
            return true;
        }
        if (userMessageText.length >= 40 &&
            (userMessageText.includes(getToastMessage('intent.keywords.roleplay.character')) ||
                userMessageText.includes(getToastMessage('intent.keywords.roleplay.play')) ||
                userMessageText.includes(getToastMessage('intent.keywords.roleplay.character')))) {
            return true;
        }
        return false;
    }

    shouldDetectTextCreation(userMessageText) {
        // 关键词触发
        if (this.containsCreativeKeywords(userMessageText)) {
            return true;
        }
        // 长消息+创作词汇触发
        if (userMessageText.length >= 40 &&
            (userMessageText.includes(getToastMessage('intent.keywords.creative.write')) ||
                userMessageText.includes(getToastMessage('intent.keywords.creative.create')) ||
                userMessageText.includes(getToastMessage('intent.keywords.creative.story')) ||
                userMessageText.includes(getToastMessage('intent.keywords.creative.novel')) ||
                userMessageText.includes(getToastMessage('intent.keywords.creative.fanfic')) ||
                userMessageText.includes(getToastMessage('intent.keywords.creative.fanwork')))) {
            return true;
        }
        return false;
    }

    async analyzeUserIntent(userMessageText, conversationHistory = []) {
        if (this.currentMessageIntentResult) {
            return this.currentMessageIntentResult;
        }

        if (isImageModeActive) {
            const nonImageKeywords = ['代码', '编程', '解释', '翻译', '总结', '分析', '计算', 'code', 'explain', 'translate', 'summarize', 'analyze', 'calculate'];
            if (nonImageKeywords.some(keyword => userMessageText.toLowerCase().includes(keyword.toLowerCase()))) {
                const result = { intent: 'text_response', confidence: 0.8 };
                this.currentMessageIntentResult = result;
                return result;
            }
            const result = { intent: 'image_generation', confidence: 0.8 };
            this.currentMessageIntentResult = result;
            return result;
        }

        if (userMessageText.length < 20 && !this.containsImageKeywords(userMessageText)) {
            const result = { intent: 'text_response', confidence: 0.9 };
            this.currentMessageIntentResult = result;
            return result;
        }

        const recentHistory = conversationHistory.slice(-6).map(msg => {
            let content = '';

            if (Array.isArray(msg.content)) {
                const imageHtml = msg.content.find(p => typeof p === 'string' && p.includes('image-preview-container'));
                if (imageHtml) {
                    const match = imageHtml.match(new RegExp(`<strong>${getToastMessage('ui.imageDescription')}：</strong>\\s*(.*)`));
                    content = `[${getToastMessage('ui.imageGenerated')}，${getToastMessage('ui.description')}: ${match ? match[1].trim() : getToastMessage('ui.unknown')}]`;
                } else {
                    content = msg.content.filter(p => p.type === 'text').map(p => p.text).join(' ');
                }
            } else if (typeof msg.content === 'string') {
                if (msg.content.includes('image-preview-container')) {
                    const match = msg.content.match(new RegExp(`<strong>${getToastMessage('ui.imageDescription')}：</strong>\\s*(.*)`));
                    content = `[${getToastMessage('ui.imageGenerated')}，${getToastMessage('ui.description')}: ${match ? match[1].trim() : getToastMessage('ui.unknown')}]`;
                } else {
                    content = msg.content;
                }
            }
            return `${msg.role}: ${content.substring(0, 200)}`;
        }).join('\n');

        const intentAnalysisPrompt = `Analyze the user's intent and classify it into one of these categories: "image_generation", "image_modification", "CLASSICAL_CHINESE_ANALYSIS", "ROLEPLAY_CREATIVE", or "GENERAL_QUERY".

        Rules:
        1. Image Commands: If it explicitly requests "draw", "generate image", "create picture" → "image_generation"
        2. Classical Chinese: If it contains classical Chinese, ancient poetry, or historical texts → "CLASSICAL_CHINESE_ANALYSIS"
        3. Creative Writing: If it involves roleplay, storytelling, story creation, character scenarios → "ROLEPLAY_CREATIVE"
        4. Default: All other cases → "GENERAL_QUERY"

        Examples:
        - "Draw a sunset" → "image_generation"
        - "解释这首古诗" → "CLASSICAL_CHINESE_ANALYSIS"
        - "Write a story about..." → "ROLEPLAY_CREATIVE"
        - "What's the weather?" → "GENERAL_QUERY"

        User Message (first 500 chars): "${userMessageText.substring(0, 500)}"

        Return only JSON:
        {"intent": "one_of_the_intents", "confidence": 0.9}`;

        try {
            const response = await callAISynchronously(intentAnalysisPrompt, 'gemini-2.0-flash', false);
            const result = safeJsonParse(response);

            if (result && result.intent && ['image_generation', 'image_modification', 'CLASSICAL_CHINESE_ANALYSIS', 'ROLEPLAY_CREATIVE', 'GENERAL_QUERY'].includes(result.intent)) {
                console.log(`${getToastMessage('console.aiIntentAnalysisResult')}:`, result);
                const finalResult = {
                    intent: result.intent,
                    confidence: result.confidence || 0.7,
                    reasoning: result.reasoning || ''
                };
                this.currentMessageIntentResult = finalResult;
                return finalResult;
            }
            console.warn(getToastMessage('console.aiIntentAnalysisFailed'));
            const fallbackResult = this.fallbackIntentDetection(userMessageText);
            this.currentMessageIntentResult = fallbackResult;
            return fallbackResult;

        } catch (error) {
            console.error(`${getToastMessage('console.intentAnalysisFailed')}:`, error);
            const fallbackResult = this.fallbackIntentDetection(userMessageText);
            this.currentMessageIntentResult = fallbackResult;
            return fallbackResult;
        }
    }

    fallbackIntentDetection(userMessageText) {
        if (this.containsRoleplayKeywords(userMessageText)) {
            return { intent: 'ROLEPLAY_CREATIVE', confidence: 0.7, reasoning: getToastMessage('ui.roleplayKeywordMatch') };
        }

        if (this.containsCreativeKeywords(userMessageText)) {
            return { intent: 'ROLEPLAY_CREATIVE', confidence: 0.7, reasoning: getToastMessage('ui.creativeKeywordMatch') };
        }

        if (this.containsClassicalChineseKeywords(userMessageText)) {
            return { intent: 'CLASSICAL_CHINESE_ANALYSIS', confidence: 0.7, reasoning: getToastMessage('ui.classicalKeywordMatch') };
        }


        if (this.containsImageKeywords(userMessageText)) {
            return { intent: 'image_generation', confidence: 0.6, reasoning: getToastMessage('ui.keywordMatch') };
        }

        return { intent: 'GENERAL_QUERY', confidence: 0.9, reasoning: getToastMessage('ui.defaultTextResponse') };
    }

    async performUnifiedIntentAnalysis(userMessageText, conversationHistory = [], options = {}) {
        const {
            checkImageGeneration = false,
            isImageModeActive = false,
            hasFileAttachments = false
        } = options;

        const needsAIAnalysis = this.shouldTriggerIntentAnalysis(userMessageText, conversationHistory, options);

        let intentResult = null;
        if (needsAIAnalysis) {
            intentResult = await this.analyzeUserIntent(userMessageText, conversationHistory);
        }

        const result = {
            shouldGenerateImage: false,
            shouldSuggestImageMode: false,
            shouldUseClassicalChinesePrompt: false,
            shouldUseRoleplayPrompt: false,
            shouldUseCreativePrompt: false,
            intentResult
        };

        if (isImageModeActive) {
            if (intentResult) {
                result.shouldGenerateImage = intentResult.intent === 'image_generation' || intentResult.intent === 'image_modification';
            }
        }
        else {
            if (this.shouldDetectClassicalChinese(userMessageText)) {
                result.shouldUseClassicalChinesePrompt = intentResult ? intentResult.intent === 'CLASSICAL_CHINESE_ANALYSIS' : true;
            }

            if (this.shouldDetectRoleplay(userMessageText)) {
                result.shouldUseRoleplayPrompt = intentResult ? intentResult.intent === 'ROLEPLAY_CREATIVE' : true;
            }

            if (this.shouldDetectTextCreation(userMessageText)) {
                result.shouldUseCreativePrompt = intentResult ? intentResult.intent === 'ROLEPLAY_CREATIVE' : true;
            }

            if (checkImageGeneration && !hasFileAttachments) {
                result.shouldSuggestImageMode = this.containsImageKeywords(userMessageText);
            }
        }

        return result;
    }
}

const intentAnalyzer = new IntentAnalyzer();

async function performUnifiedIntentAnalysis(userMessageText, conversationHistory = [], options = {}) {
    return await intentAnalyzer.performUnifiedIntentAnalysis(userMessageText, conversationHistory, options);
}

function containsImageKeywords(text) {
    return intentAnalyzer.containsImageKeywords(text);
}

function extractImagePrompt(userMessageText) {
    let prompt = userMessageText;
    const instructionWords = intentAnalyzer.getImageKeywords();

    instructionWords.forEach(word => {
        prompt = prompt.replace(new RegExp(word, 'gi'), '').trim();
    });

    const fillerWords = [getToastMessage('ui.please'), getToastMessage('ui.helpMe'), getToastMessage('ui.giveMe'), getToastMessage('ui.iWant'), getToastMessage('ui.iNeed'), 'please', 'help me', 'i want', 'i need'];
    fillerWords.forEach(word => {
        prompt = prompt.replace(new RegExp(`^${word}`, 'gi'), '').trim();
    });

    if (prompt.length < 5) {
        prompt = userMessageText;
    }
    return prompt || getToastMessage('ui.beautifulImage');
}

async function generateCombinedImagePrompt(userMessageText, conversationHistory, intent) {
    const originalUserPrompt = extractImagePrompt(userMessageText);

    if (intent === 'image_generation') {
        const promptForAI = `You are a professional AI art prompt optimizer. Convert the user's description into a detailed English prompt suitable for models like Midjourney or Stable Diffusion. Enhance quality, detail, and artistic style.
        User's description: "${originalUserPrompt}"
        Directly output the optimized English prompt without any other explanation.`;

        const chineseDescriptionPrompt = `Based on the user's request, generate a concise and accurate description IN THE SAME LANGUAGE AS THE USER'S REQUEST. This description will be shown to the user.
        User's request: "${originalUserPrompt}"
        Requirement: The description should be clear, highlight the main content, and be between 5 to 15 words. Return only the description text.`;

        try {
            const englishPrompt = await callAISynchronously(promptForAI, 'gemini-2.0-flash');
            const chineseDescription = await callAISynchronously(chineseDescriptionPrompt, 'gemini-2.0-flash');

            return {
                original: originalUserPrompt,
                english: englishPrompt || originalUserPrompt,
                chineseDescription: chineseDescription.trim().replace(/^["']|["']$/g, '') || originalUserPrompt
            };
        } catch (error) {
            console.error(`${getToastMessage('console.firstPromptOptimizationFailed')}:`, error);
            return {
                original: originalUserPrompt,
                english: originalUserPrompt,
                chineseDescription: originalUserPrompt
            };
        }

    } else if (intent === 'image_modification') {
        let originalPrompt = 'a beautiful picture';

        for (let i = conversationHistory.length - 1; i >= 0; i--) {
            const msg = conversationHistory[i];

            if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.includes('image-preview-container')) {
                const match = msg.content.match(new RegExp(`<strong>${getToastMessage('ui.imageDescription')}：</strong>\\s*(.*)`));

                if (match && match[1]) {
                    const desc = match[1].trim();

                    try {
                        const reversePrompt = `Convert the following image description back to a detailed English prompt suitable for AI image generation. Description: ${desc}`;
                        originalPrompt = await callAISynchronously(reversePrompt, 'gemini-2.0-flash');
                    } catch (e) { originalPrompt = desc; }
                    break;
                }
            }
        }

        const promptForAI = `You are an image prompt optimizer. Based on the original prompt and the user's modification request, generate a new, complete, descriptive English prompt.
        Original prompt: "${originalPrompt}"
        User's modification request: "${userMessageText}"
        Generate a single, complete new English prompt that incorporates both the original idea and the requested changes.`;

        const chineseDescriptionPrompt = `Based on the user's modification request for an image, generate a concise description IN THE SAME LANGUAGE AS THE USER'S REQUEST.
        Original image info: "${originalPrompt}"
        User's modification request: "${userMessageText}"
        Requirement: Generate a 10-20 word description highlighting the key features of the modified image. Return only the description text.`;

        try {
            const newEnglishPrompt = await callAISynchronously(promptForAI, 'gemini-2.0-flash');
            const chineseDescription = await callAISynchronously(chineseDescriptionPrompt, 'gemini-2.0-flash');

            return {
                original: userMessageText,
                english: newEnglishPrompt || `${originalPrompt}, ${userMessageText}`,
                chineseDescription: chineseDescription.trim().replace(/^["']|["']$/g, '') || userMessageText
            };
        } catch (error) {
            return {
                original: userMessageText,
                english: `${originalPrompt}, ${userMessageText}`,
                chineseDescription: userMessageText
            };
        }
    }
    return {
        original: userMessageText,
        english: userMessageText,
        chineseDescription: userMessageText
    };
}

async function handleImageGeneration(userContent, promptObject, options = {}) {
    const { existingAssistantElement = null } = options;
    const englishPrompt = promptObject.english;
    const chineseDescription = promptObject.chineseDescription;

    if (!currentChatId) await startNewChat(true);
    const chatIdForRequest = currentChatId;

    let userMessageToSave = null;
    if (!existingAssistantElement) {
        userMessageToSave = { role: 'user', content: userContent };
        chats[chatIdForRequest].messages.push(userMessageToSave);
        appendMessage('user', userContent);

        // 立即保存用户消息到本地数据库
        try {
            if (!currentUser) {
                await saveChatsToDB('guest', chats);
            } else {
                await saveChatsToDB(currentUser.id, chats);
            }
        } catch (error) {
            console.error('Failed to save user message to database:', error);
        }
    }

    let assistantMessageElement;
    if (existingAssistantElement) {
        assistantMessageElement = existingAssistantElement;
    } else {
        assistantMessageElement = appendMessage('assistant', '');
    }

    const contentDiv = assistantMessageElement.querySelector('.content');

    contentDiv.innerHTML = `
        <div class="thinking-indicator-new">
            <svg class="spinner" viewBox="0 0 50 50">
                <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
            </svg>
            <span>${getToastMessage('ui.generationMayTake1to2Minutes')}</span>
        </div>
    `;

    let assistantMessage = { role: 'assistant', content: `[${getToastMessage('ui.generatingImage')}, ${getToastMessage('ui.description')}: ${englishPrompt}]` };

    chats[chatIdForRequest].messages.push(assistantMessage);

    return new Promise((resolve) => {
        const baseUrl = isNativeApp ? API_BASE_URL : '';
        const imageUrl = `${baseUrl}/api/image-proxy?prompt=${encodeURIComponent(englishPrompt)}`;

        const loadImage = async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时，后端会重试
            const timestamp = Date.now();
            activeResponses.set(chatIdForRequest, { controller, timestamp });

            try {
                const headers = {};
                if (sessionId) {
                    headers['X-Session-ID'] = sessionId;
                } else {
                    headers['X-Visitor-ID'] = await getGuestVisitorId();
                }

                const response = await fetch(imageUrl, {
                    signal: controller.signal,
                    headers: headers
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    // 检查是否是 API 用量限制错误
                    if (response.status === 429) {
                        showUsageLimitModal();
                        throw new Error('API usage limit reached');
                    }
                    const mappedMessage = getModelErrorMessage(response.status);
                    throw new Error(mappedMessage || `${getToastMessage('errors.serverError')}: ${response.status}`);
                }
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.startsWith('image/')) {
                    throw new Error('Invalid content type received from server.');
                }
                const blob = await response.blob();

                // 转换为base64保存
                const base64Data = await blobToBase64(blob);
                const localImageUrl = `data:${contentType};base64,${base64Data}`;

                const imageContentHtml = `
                    <div>${getToastMessage('ui.generatedImageForYou')}</div>
                    <div class="image-preview-container">
                        <img src="${localImageUrl}" alt="${chineseDescription}" style="max-width: 250px; border-radius: 8px; cursor: pointer; display: block;" data-image-url="${localImageUrl}">
                        <button class="image-overlay-btn" title="${getToastMessage('ui.downloadImage')}" data-action="download-image" data-image-url="${localImageUrl}" data-description="${chineseDescription}">
                            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                        </button>
                    </div>
                    <p style="margin-top: 8px; line-height: 1.5;">
                        <strong>${getToastMessage('ui.imageDescription')}：</strong> ${chineseDescription}
                    </p>
                `;
                renderMessageContent(contentDiv, imageContentHtml);
                assistantMessage.content = imageContentHtml;

                const messages = chats[chatIdForRequest].messages;
                if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
                    messages[messages.length - 1] = assistantMessage;
                }
                activeResponses.delete(chatIdForRequest);

                resolve(assistantMessage);
            } catch (error) {
                clearTimeout(timeoutId);
                activeResponses.delete(chatIdForRequest);
                console.error(`${getToastMessage('console.imageLoadFailed')}:`, imageUrl, error.message);
                const errorMessage = getToastMessage('errors.imageGenerationFailed');
                const errorContentHtml = `<p style="color: var(--error-color, #ef4444);">${errorMessage}</p>`;

                renderMessageContent(contentDiv, errorContentHtml);
                assistantMessage.content = errorContentHtml;

                const messages = chats[chatIdForRequest].messages;
                if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
                    messages[messages.length - 1] = assistantMessage;
                }

                // 保存错误状态到缓存
                if (!currentUser) {
                    await saveChatsToDB('guest', chats);
                } else {
                    await saveChatsToDB(currentUser.id, chats);
                }

                resolve(assistantMessage);
            }
        };

        loadImage();
    });
}

function startPeriodicSync() {
    if (!currentUser) return;

    const syncInterval = setInterval(async () => {
        try {
            const result = await makeApiRequest('chats/conversations');
            if (result.success) {
                const serverChatIds = new Set(result.conversations.map(conv => conv.id));
                const localChatIds = Object.keys(chats).filter(id => !String(id).startsWith('temp_'));
                const deletedChatIds = localChatIds.filter(chatId => !serverChatIds.has(chatId));

                if (deletedChatIds.length > 0) {

                    for (const chatId of deletedChatIds) {
                        if (activeResponses.has(chatId) || (currentChatId === chatId && isProcessing)) {
                            continue;
                        }
                        delete chats[chatId];
                    }

                    await saveChatsToDB(currentUser.id, chats);

                    renderSidebar();
                }
            }
        } catch (error) {
            console.warn('Periodic sync failed:', error);
        }
    }, 5 * 60 * 1000);

    addGlobalCleanup(() => clearInterval(syncInterval));
}

// 全局变量用于后台缓冲区管理
let globalBackgroundBuffer = '';
let globalDisplayBuffer = '';
let globalContentDiv = null;
let globalCharQueue = [];
let userHasScrolledUp = false;
let lastScrollTime = 0;
let isAutoScrolling = false;

async function processStreamedResponse(response, contentDiv) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';
    let finishReason = null;
    let finalCitations = null;
    let firstTokenAt = null;

    // 初始化全局变量
    globalBackgroundBuffer = '';
    globalDisplayBuffer = '';
    globalContentDiv = contentDiv;
    globalCharQueue = [];
    userHasScrolledUp = false;

    const charQueue = globalCharQueue;
    let isTyping = false;
    let renderSpeed = modelRenderSpeeds[currentModelId] || 2;
    let renderSpeedAccumulator = 0;

    const startTyping = () => {
        if (isTyping) return;
        isTyping = true;
        const renderLoop = () => {
            if (charQueue.length === 0) {
                isTyping = false;
                renderSpeedAccumulator = 0;
                return;
            }

            let currentRenderSpeed = renderSpeed;
            if (charQueue.length > 100) {
                currentRenderSpeed = Math.min(renderSpeed * 3, 6);
            } else if (charQueue.length > 50) {
                currentRenderSpeed = Math.min(renderSpeed * 2, 4);
            }

            renderSpeedAccumulator += currentRenderSpeed;
            const charsToRenderCount = Math.floor(renderSpeedAccumulator);
            renderSpeedAccumulator -= charsToRenderCount;

            const charsToRender = charQueue.splice(0, charsToRenderCount).join('');
            globalDisplayBuffer += charsToRender;


            if (isPageVisible) {
                try {
                    renderMessageContent(contentDiv, globalDisplayBuffer);
                    if (!userHasScrolledUp) {
                        elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
                    }
                } catch (renderError) {
                    console.error(`${getToastMessage('console.renderMessageContentFailed')}:`, renderError);
                    if (contentDiv) {
                        contentDiv.textContent = globalDisplayBuffer;
                    }
                }
            } else {
                // 页面隐藏时，将新内容累积到后台缓冲区
                globalBackgroundBuffer += charsToRender;
            }

            // 使用setTimeout确保后台也能继续渲染
            setTimeout(() => {
                if (isPageVisible) {
                    requestAnimationFrame(renderLoop);
                } else {
                    renderLoop();
                }
            }, renderSpeed === 1 ? 25 : 16);
        };
        // 根据页面可见性选择渲染方式
        if (isPageVisible) {
            requestAnimationFrame(renderLoop);
        } else {
            setTimeout(renderLoop, 0);
        }
    };

    const processLine = (dataStr) => {
        if (!dataStr || dataStr === '[DONE]') return;

        try {
            const data = JSON.parse(dataStr);
            if (data.type === 'metadata' && data.citations) {
                finalCitations = data.citations;
                return;
            }

            const delta = data.choices?.[0]?.delta?.content || '';
            if (delta) {
                fullResponse += delta;
                charQueue.push(...delta.split(''));
                if (!firstTokenAt) firstTokenAt = Date.now();
                if (!isTyping) {
                    const ready = charQueue.length >= 12 || (Date.now() - firstTokenAt) > 200;
                    if (ready) startTyping();
                }
            }

            if (data.choices?.[0]?.finish_reason) {
                finishReason = data.choices[0].finish_reason;
            }
        } catch (parseError) {
            console.warn(`${getToastMessage('console.parseStreamDataFailed')}:`, parseError, getToastMessage('console.originalData'), dataStr);
        }
    };

    while (true) {
        const { value, done } = await reader.read();

        if (done) {
            if (buffer.trim()) {
                const dataStr = buffer.trim().startsWith('data: ') ? buffer.trim().substring(6) : buffer.trim();
                processLine(dataStr);
            }
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.substring(6).trim();
                if (dataStr === '[DONE]') {
                    break;
                }
                processLine(dataStr);
            }
        }
    }

    // 如果还有未渲染字符但未启动渲染，保证启动
    if (!isTyping && charQueue.length > 0) startTyping();

    await new Promise(resolve => {
        const checkTyping = () => {
            if (!isTyping && charQueue.length === 0) {
                // 如果还有后台缓冲区内容且页面可见，立即显示
                if (globalBackgroundBuffer && isPageVisible && globalContentDiv) {
                    try {
                        globalDisplayBuffer += globalBackgroundBuffer;
                        renderMessageContent(globalContentDiv, globalDisplayBuffer);
                        if (!userHasScrolledUp) {
                            setTimeout(() => {
                                elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
                            }, 10);
                        }
                        globalBackgroundBuffer = '';
                    } catch (error) {
                        console.error('Background buffer render error:', error);
                    }
                }
                resolve();
            } else {
                setTimeout(checkTyping, 50);
            }
        };
        checkTyping();
    });
    return { fullResponse, finalCitations, finishReason };
}

async function handleSearchAndChat(userMessageText) {
    if (!userMessageText) return;
    isProcessing = true;

    if (!currentChatId) {
        await startNewChat(true);
    }
    const chatIdForRequest = currentChatId;

    const userContent = [{ type: 'text', text: userMessageText }];
    appendMessage('user', userContent);
    chats[chatIdForRequest].messages.push({ role: 'user', content: userContent });
    clearInputAndAttachments(true);

    const assistantMessageElement = appendMessage('assistant', '');
    const contentDiv = assistantMessageElement.querySelector('.content');
    contentDiv.innerHTML = `
        <div class="thinking-indicator-new">
            <svg class="spinner" viewBox="0 0 50 50">
                <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
            </svg>
            <span>${getToastMessage('ui.searchingWeb')}</span>
        </div>`;

    let userMessageToSave = { role: 'user', content: userContent };
    let assistantMessageToSave = null;
    let requestSuccessful = false;

    try {
        const searchResults = await makeApiRequest('search', {
            method: 'POST',
            body: JSON.stringify({ query: userMessageText })
        });

        if (!searchResults.success || !searchResults.results) {
            throw new Error(searchResults.error || getToastMessage('errors.failedToGetSearchResults'));
        }

        contentDiv.innerHTML = `
            <div class="thinking-indicator-new">
                <svg class="spinner" viewBox="0 0 50 50">
                    <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
                </svg>
                <span>${getToastMessage('ui.integratingWebInfo')}</span>
            </div>`;

        const instructionHeader = `${ROLE_INSTRUCTION}\n${FORMAT_INSTRUCTION}\n\n---\n\n`;

        let searchContext = instructionHeader + SEARCH_CONTEXT_INSTRUCTION + "\n\n【" + getToastMessage('ui.networkSearchResults') + "】:\n\n";
        searchResults.results.forEach((result, index) => {
            searchContext += `[${index + 1}] ${getToastMessage('ui.title')}: ${result.title}\n${getToastMessage('ui.url')}: ${result.url}\n${getToastMessage('ui.summary')}: ${result.content}\n\n`;
        });
        searchContext += `${getToastMessage('ui.userOriginalQuestion')}: "${userMessageText}"`;

        const conversationHistory = chats[chatIdForRequest]?.messages || [];
        const historyToSend = conversationHistory.slice(-10);

        const messagesForAI = historyToSend.map((msg, index) => {
            if (index === historyToSend.length - 1 && msg.role === 'user') {
                return { role: 'user', content: searchContext };
            }
            return msg;
        });

        const headers = { 'Content-Type': 'application/json' };
        if (sessionId) {
            headers['X-Session-ID'] = sessionId;
        } else {
            headers['X-Visitor-ID'] = await getGuestVisitorId();
        }

        const body = {
            messages: messagesForAI,
            model: currentModelId,
            temperature: aiParameters.temperature,
            top_p: aiParameters.topP,
            top_k: aiParameters.topK,
            system_prompt: composeSystemPrompt(aiParameters.systemPrompt)
        };

        // 访客用户
        if (!currentUser) {
            const guestKey = selectGuestApiKeyForRequest();
            if (guestKey) body.apiKey = guestKey;
        }

        const controller = new AbortController();
        const response = await fetch('/', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            const mappedMessage = getModelErrorMessage(response.status);
            if (mappedMessage) {
                throw new Error(mappedMessage);
            }
            throw new Error(errorText || `${getToastMessage('errors.aiRequestFailed')}: ${response.status}`);
        }

        try {
            const invalidated = response.headers.get('X-Guest-Invalidated') === 'true';
            if (!currentUser && invalidated) {
                handleGuestKeyInvalidation({ showToast: true });
            }
        } catch (_) { }

        const { fullResponse } = await processStreamedResponse(response, contentDiv);

        const searchCitations = searchResults.success
            ? searchResults.results.map(r => ({ uri: r.url, title: r.title }))
            : null;

        assistantMessageToSave = {
            role: 'assistant',
            content: fullResponse,
            citations: searchCitations
        };

        if (contentDiv) {
            renderMessageContent(contentDiv, assistantMessageToSave);
        }

        chats[chatIdForRequest].messages.push(assistantMessageToSave);
        requestSuccessful = true;

    } catch (error) {
        console.error(`${getToastMessage('console.searchAndChatError')}:`, error);

        const errorMessage = error.message || getToastMessage('ui.unknownError');

        if (errorMessage.includes(getToastMessage('errors.searchFeatureDailyLimitReached'))) {
            const messages = elements.chatContainer.querySelectorAll('.message');
            const lastUserMessage = Array.from(messages).reverse().find(msg => msg.classList.contains('user'));

            if (lastUserMessage) {
                lastUserMessage.remove();
            }
            cleanupEmptyMessagePlaceholders();

            if (chats[chatIdForRequest]) {
                chats[chatIdForRequest].messages.pop();

                if (chats[chatIdForRequest].messages.length === 0 && chatIdForRequest.startsWith('temp_')) {
                    delete chats[chatIdForRequest];
                    currentChatId = null;
                    scheduleRenderSidebar();
                }
            }

            const hasConfiguredKey = !!(currentUser && getCustomApiKey());
            if (hasConfiguredKey) {
                const content = getToastMessage('errors.searchFeatureDailyLimitReached');
                const assistantEl = appendMessage('assistant', content);
                assistantMessageToSave = { role: 'assistant', content };
                chats[chatIdForRequest] && chats[chatIdForRequest].messages.push(assistantMessageToSave);
                requestSuccessful = true;
                scheduleRenderSidebar();
            } else {
                showUsageLimitModal();
            }
            return;
        }

        renderMessageContent(contentDiv, `${getToastMessage('ui.searchProcessError')}: ${errorMessage}`);
        assistantMessageToSave = { role: 'assistant', content: `${getToastMessage('ui.searchProcessError')}: ${errorMessage}` };
        chats[chatIdForRequest].messages.push(assistantMessageToSave);
    } finally {
        resetSendButtonState();
    }

    if (requestSuccessful) {
        const taskId = `save_chat_${chatIdForRequest}_${Date.now()}`;
        addBackgroundTask(taskId, async () => {
            try {
                const saveResult = await saveChatToServer(chatIdForRequest, userMessageToSave, assistantMessageToSave);
                const finalChatId = saveResult.finalChatId;
                const newTitleFromServer = saveResult.newTitle;

                if (chats[finalChatId] && newTitleFromServer) {
                    chats[finalChatId].title = newTitleFromServer;
                    if (!currentUser) {
                        try {
                            await saveChatsToDB('guest', chats);
                        } catch (error) {
                            console.error('Failed to save updated guest chat to IndexedDB:', error);
                        }
                    }
                }

                if (isPageVisible) {
                    scheduleRenderSidebar();
                }
            } catch (err) {
                console.error(`${getToastMessage('console.backgroundSaveChatFailed')}:`, err);
                if (currentUser && isPageVisible) {
                    showToast(getToastMessage('toast.conversationNotSynced'), 'warning');
                }
                throw err;
            }
        }, 'high');
    }
}

async function handleResearchAndChat(userContent, userMessageText) {
    const queryText = (userMessageText || '').trim() || extractTextFromUserContent(userContent) || '';
    if (!queryText && (!userContent || userContent.length === 0)) return;
    isProcessing = true;

    if (!currentChatId) {
        await startNewChat(true);
    }
    const chatIdForRequest = currentChatId;
    const userMessage = userContent && userContent.length ? userContent : [{ type: 'text', text: queryText }];

    appendMessage('user', userMessage);
    chats[chatIdForRequest].messages.push({ role: 'user', content: cloneMessageParts(userMessage) || userMessage });
    clearInputAndAttachments(true);

    const assistantMessageElement = appendMessage('assistant', '');
    const contentDiv = assistantMessageElement.querySelector('.content');
    const renderPlaceholder = (text) => {
        if (!contentDiv) return;
        contentDiv.innerHTML = `
            <div class="thinking-indicator-new">
                <svg class="spinner" viewBox="0 0 50 50">
                    <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
                </svg>
                <span>${text}</span>
            </div>`;
    };

    renderPlaceholder(getToastMessage('aiProcessing.intelligentChunking'));

    let researchSourceText = queryText;
    let userMessageToSave = { role: 'user', content: cloneMessageParts(userMessage) || userMessage };
    let assistantMessageToSave = null;
    let requestSuccessful = false;

    try {
        const totalTextLength = (() => {
            let len = queryText.length;
            (userContent || []).forEach(part => {
                if (part.type === 'text' && part.text) len += part.text.length;
                if (part.type === 'file' && typeof part.content === 'string') len += part.content.length;
            });
            return len;
        })();

        if (totalTextLength > LARGE_TEXT_THRESHOLD) {
            showToast(getToastMessage('toast.largeAttachmentProcessing'), 'info');
            renderPlaceholder(getToastMessage('aiProcessing.intelligentChunking'));
            try {
                const deepResult = await handleDeepAnalysis(userContent, queryText, null);
                if (deepResult?.content) {
                    if (typeof deepResult.content === 'string') {
                        researchSourceText = deepResult.content;
                    } else {
                        const extracted = extractTextFromUserContent(deepResult.content);
                        if (extracted && extracted.trim()) {
                            researchSourceText = extracted;
                        }
                    }
                }
            } catch (e) {
                researchSourceText = queryText;
            }
            renderPlaceholder(getToastMessage('ui.collectingLiterature'));
        } else {
            renderPlaceholder(getToastMessage('ui.collectingLiterature'));
        }

        const translatedResearchText = await translateQueryToEnglishForResearch(researchSourceText);
        if (translatedResearchText) {
            researchSourceText = translatedResearchText;
        }
        await sleep(1000);

        const researchResults = await makeApiRequest('semantic-scholar', {
            method: 'POST',
            body: JSON.stringify({
                query: researchSourceText,
                chunks: []
            })
        });

        if (!researchResults?.success || !Array.isArray(researchResults.results)) {
            throw new Error(researchResults?.error || getToastMessage('errors.failedToGetSearchResults'));
        }
        const noPapersFound = !researchResults.results.length;

        renderPlaceholder(getToastMessage('ui.integratingLiterature'));

        const systemContext = `${ROLE_INSTRUCTION}\n${FORMAT_INSTRUCTION}\n\n${RESEARCH_MODE_INSTRUCTION}`;

        let researchContext =
            `${getToastMessage('ui.networkSearchResults') || 'Search Results'}:\n`;

        if (!noPapersFound) {
            researchResults.results.forEach((paper, index) => {
                const idx = index + 1;
                const title = paper.title || 'Untitled';
                const authors = Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || '');
                const year = paper.year ? ` (${paper.year})` : '';
                const venue = paper.venue ? ` | ${paper.venue}` : '';
                const url = paper.url || paper.paperUrl || paper.link || '';
                const summary = paper.abstract || paper.summary || '';
                researchContext += `[${idx}] ${title}${year}${venue}\n`;
                if (authors) researchContext += `Authors: ${authors}\n`;
                if (url) researchContext += `URL: ${url}\n`;
                if (summary) researchContext += `Summary: ${summary}\n`;
                researchContext += '\n';
            });
        } else {
            researchContext += `[No papers found for this query; respond without citations, use general knowledge.] \n\n`;
        }

        if (researchSourceText && researchSourceText !== queryText) {
            const MAX_CONTEXT_LEN = 12000;
            const truncated = researchSourceText.length > MAX_CONTEXT_LEN
                ? (researchSourceText.slice(0, MAX_CONTEXT_LEN) + '\n\n[Content truncated for context]')
                : researchSourceText;
            researchContext += `Preprocessed user text:\n${truncated}\n\n`;
        }

        researchContext += `${getToastMessage('ui.userOriginalQuestion') || 'User Question'}: "${queryText}"`;

        const conversationHistory = chats[chatIdForRequest]?.messages || [];
        const historyToSend = conversationHistory.slice(-10);

        const messagesForAI = [{ role: 'system', content: systemContext }];
        historyToSend.forEach((msg, index) => {
            if (index === historyToSend.length - 1 && msg.role === 'user') {
                messagesForAI.push({ role: 'user', content: researchContext });
            } else {
                messagesForAI.push(msg);
            }
        });

        const headers = { 'Content-Type': 'application/json' };
        if (sessionId) {
            headers['X-Session-ID'] = sessionId;
        } else {
            headers['X-Visitor-ID'] = await getGuestVisitorId();
        }

        const body = {
            messages: messagesForAI,
            model: currentModelId,
            temperature: aiParameters.temperature,
            top_p: aiParameters.topP,
            top_k: aiParameters.topK,
            system_prompt: composeSystemPrompt(aiParameters.systemPrompt)
        };

        if (!currentUser) {
            const guestKey = selectGuestApiKeyForRequest();
            if (guestKey) body.apiKey = guestKey;
        }

        const controller = new AbortController();
        const response = await fetch('/', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            const mappedMessage = getModelErrorMessage(response.status);
            if (mappedMessage) {
                throw new Error(mappedMessage);
            }
            throw new Error(errorText || `${getToastMessage('errors.aiRequestFailed')}: ${response.status}`);
        }

        try {
            const invalidated = response.headers.get('X-Guest-Invalidated') === 'true';
            if (!currentUser && invalidated) {
                handleGuestKeyInvalidation({ showToast: true });
            }
        } catch (_) { }

        const { fullResponse } = await processStreamedResponse(response, contentDiv);

        const researchCitations = (!noPapersFound && Array.isArray(researchResults.results))
            ? researchResults.results
                .map(r => {
                    const uri = r.url || r.paperUrl || r.link || (r.paperId ? `https://www.semanticscholar.org/paper/${r.paperId}` : '');
                    return uri ? { uri, title: r.title } : null;
                })
                .filter(Boolean)
            : null;

        assistantMessageToSave = {
            role: 'assistant',
            content: fullResponse,
            citations: researchCitations
        };

        if (contentDiv) {
            renderMessageContent(contentDiv, assistantMessageToSave);
        }

        chats[chatIdForRequest].messages.push(assistantMessageToSave);
        requestSuccessful = true;

    } catch (error) {
        console.error('Research mode failed:', error);
        const errorMessage = error.message || getToastMessage('ui.unknownError');
        renderMessageContent(contentDiv, `${getToastMessage('ui.searchProcessError')}: ${errorMessage}`);
        assistantMessageToSave = { role: 'assistant', content: `${getToastMessage('ui.searchProcessError')}: ${errorMessage}` };
        chats[chatIdForRequest].messages.push(assistantMessageToSave);
    } finally {
        resetSendButtonState();
    }

    if (requestSuccessful) {
        const taskId = `save_chat_${chatIdForRequest}_${Date.now()}`;
        addBackgroundTask(taskId, async () => {
            try {
                const saveResult = await saveChatToServer(chatIdForRequest, userMessageToSave, assistantMessageToSave);
                const finalChatId = saveResult.finalChatId;
                const newTitleFromServer = saveResult.newTitle;

                if (chats[finalChatId] && newTitleFromServer) {
                    chats[finalChatId].title = newTitleFromServer;
                    if (!currentUser) {
                        try {
                            await saveChatsToDB('guest', chats);
                        } catch (error) {
                            console.error('Failed to save updated guest chat to IndexedDB:', error);
                        }
                    }
                }

                if (isPageVisible) {
                    scheduleRenderSidebar();
                }
            } catch (err) {
                console.error(`${getToastMessage('console.backgroundSaveChatFailed')}:`, err);
                if (currentUser && isPageVisible) {
                    showToast(getToastMessage('toast.conversationNotSynced'), 'warning');
                }
                throw err;
            }
        }, 'high');
    }
}

function showUsageLimitModal() {
    // 立即显示弹窗
    elements.limitModalTitle.textContent = currentUser ? getToastMessage('status.dailyLimitReached') : getToastMessage('status.trialLimitReached');
    elements.limitModalText.textContent = currentUser ?
        getToastMessage('status.dailyLimitReachedMessage', { limit: currentUserUsage.limit }) :
        getToastMessage('status.trialLimitReachedMessage');
    elements.limitLoginBtn.textContent = currentUser ? getToastMessage('status.goToSettings') : getToastMessage('status.loginNow');
    elements.limitLoginBtn.onclick = () => {
        elements.limitModalOverlay.classList.remove('visible');
        if (currentUser) {
            document.getElementById('settings-modal-overlay').classList.add('visible');

            // 切换到API页面
            const apiNavItem = document.querySelector('.settings-nav-item[data-page="api"]');
            if (apiNavItem) {
                apiNavItem.click();
            }
        } else {
            openAuthOverlay('user', { mode: 'login' }, { syncRoute: true });
        }
    };
    elements.limitModalOverlay.classList.add('visible');
}
async function handleChatMessage(userContent, options = {}) {
    const { existingAssistantElement = null, skipLengthCheck = false, contentForDisplay = null } = options;
    const contentToDisplayAndSave = contentForDisplay || userContent;
    let progressTimer = null;

    if (!currentChatId) await startNewChat(true);
    const chatIdForRequest = currentChatId;

    // 智能角色扮演意图分析
    const userMessageText = userContent.find(p => p.type === 'text')?.text || '';
    const conversationHistory = chats[chatIdForRequest]?.messages || [];

    // 使用统一的意图分析函数
    const intentAnalysis = await performUnifiedIntentAnalysis(userMessageText, conversationHistory, {
        checkImageGeneration: false
    });

    const previousHistory = chats[chatIdForRequest]?.messages || [];
    const WARNING_CHAR_LIMIT = 60000;
    const previousTotalLength = previousHistory.reduce((acc, msg) => acc + JSON.stringify(msg.content).length, 0);

    if (previousTotalLength > WARNING_CHAR_LIMIT && !chats[chatIdForRequest].hasShownLengthWarning) {
        chats[chatIdForRequest].hasShownLengthWarning = true;
    }

    let assistantMessageElement;

    if (existingAssistantElement) {
        assistantMessageElement = existingAssistantElement;
    } else {
        assistantMessageElement = appendMessage('assistant', '');
    }

    const fullHistory = chats[chatIdForRequest].messages;

    const selectedModel = models.find(m => m.id === currentModelId) || models[0];
    const MAX_CONTEXT_TOKENS = selectedModel.context_window - 2048;

    let historyToSend = [];
    let currentTokenCount = 0;

    for (let i = fullHistory.length - 1; i >= 0; i--) {
        const message = fullHistory[i];
        const optimizedContent = getAiOptimizedContentForMessage(message);
        const contentForEstimation = optimizedContent || message.content;
        const messageTokens = estimateTokens(contentForEstimation);

        if (currentTokenCount + messageTokens > MAX_CONTEXT_TOKENS) {
            console.warn(`Context limit reached. Truncating history. Model: ${currentModelId}, Limit: ${MAX_CONTEXT_TOKENS} tokens.`);
            break;
        }

        historyToSend.unshift(message);
        currentTokenCount += messageTokens;
    }

    const messagesForAI = historyToSend.map((msg, index) => {
        const optimizedContent = getAiOptimizedContentForMessage(msg);
        const hasOptimizedContent = Array.isArray(optimizedContent) || typeof optimizedContent === 'string';
        const sourceContent = hasOptimizedContent ? optimizedContent : msg.content;

        if (msg.role === 'user' && Array.isArray(sourceContent)) {
            const fileContentParts = [];
            const otherContentParts = [];
            let quoteText = '';
            let replyText = '';

            sourceContent.forEach(part => {
                if (part.type === 'quote') {
                    quoteText = part.text;
                } else if (part.type === 'text') {
                    replyText += part.text;
                } else if (part.type === 'file') {
                    const { filename, content } = part;
                    const fileExtension = filename.split('.').pop()?.toLowerCase() || 'text';
                    fileContentParts.push({
                        type: 'text',
                        text: `${getToastMessage('ui.focusOnFileContent')}：\n\n--- ${getToastMessage('ui.filename')}: ${filename} ---\n\`\`\`${fileExtension}\n${content}\n\`\`\`\n--- ${getToastMessage('ui.fileEnd')} ---\n\n`
                    });
                } else if (part) {
                    const clonedPart = cloneMessageParts([part])[0];
                    if (clonedPart) {
                        otherContentParts.push(clonedPart);
                    }
                }
            });

            let combinedText = '';
            if (quoteText) {
                combinedText += `${getToastMessage('ui.respondToUserReply')}。\n\n# ${getToastMessage('ui.quoteContent')}:\n"""\n${quoteText}\n"""\n\n# ${getToastMessage('ui.userReply')}:\n${replyText}`;
            } else {
                combinedText = replyText;
            }

            const finalContent = [];
            if (combinedText.trim()) {
                finalContent.push({ type: 'text', text: combinedText });
            }
            const messageForAI = {
                ...msg,
                content: [...fileContentParts, ...finalContent, ...otherContentParts]
            };
            if ('originalContent' in messageForAI) delete messageForAI.originalContent;
            return messageForAI;
        }

        if (msg.role === 'user' && typeof sourceContent === 'string') {
            const messageForAI = { ...msg, content: sourceContent };
            if ('originalContent' in messageForAI) delete messageForAI.originalContent;
            return messageForAI;
        }

        if (hasOptimizedContent) {
            const normalizedContent = Array.isArray(sourceContent) ? cloneMessageParts(sourceContent) : sourceContent;
            const messageForAI = { ...msg, content: normalizedContent };
            if ('originalContent' in messageForAI) delete messageForAI.originalContent;
            return messageForAI;
        }

        return msg;
    });

    let fullResponse = '';
    const contentDiv = assistantMessageElement.querySelector('.content');
    if (contentDiv && !existingAssistantElement) {
        contentDiv.innerHTML = `
        <div class="thinking-indicator-new">
            <svg class="spinner" viewBox="0 0 50 50">
                <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
            </svg>
            <span>${getToastMessage('ui.thinking')}</span>
        </div>
    `;
    }

    try {
        const controller = new AbortController();
        const timestamp = Date.now();
        activeResponses.set(chatIdForRequest, { controller, timestamp });

        let progressTimer = null;
        const shouldShowLongWaitMessage = () => {
            const messageText = messagesForAI[messagesForAI.length - 1]?.content;
            const hasLargeContent = JSON.stringify(messageText).length > 10000;
            const hasFiles = Array.isArray(messageText) && messageText.some(part => part.type === 'file');
            const isComplexQuery = typeof messageText === 'string' &&
                (messageText.includes(getToastMessage('ui.detailed')) || messageText.includes(getToastMessage('ui.analyze')) ||
                    messageText.includes(getToastMessage('ui.explain')) || messageText.length > 500);

            return hasLargeContent || hasFiles || isComplexQuery;
        };

        const headers = { 'Content-Type': 'application/json' };
        if (sessionId) {
            headers['X-Session-ID'] = sessionId;
        } else {
            headers['X-Visitor-ID'] = await getGuestVisitorId();
        }

        let finalSystemPrompt = composeSystemPrompt(aiParameters.systemPrompt);

        const body = {
            messages: messagesForAI,
            model: currentModelId,
            temperature: aiParameters.temperature,
            top_p: aiParameters.topP,
            top_k: aiParameters.topK,
            system_prompt: finalSystemPrompt,
            intent_analysis: intentAnalysis.intentResult
        };

        // 访客用户
        if (!currentUser) {
            const guestKey = selectGuestApiKeyForRequest();
            if (guestKey) body.apiKey = guestKey;
        }

        const response = await fetch('/', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            try {
                const errorData = JSON.parse(errorText);
                const rawErrorMessage = errorData.error || `${getToastMessage('errors.requestFailed')}: ${response.status}`;
                const mappedMessage = getModelErrorMessage(response.status);
                const displayErrorMessage = mappedMessage || rawErrorMessage;

                const cleanUpFailedRequest = () => {
                    if (typeof progressTimer === 'number') {
                        clearTimeout(progressTimer);
                        progressTimer = null;
                    }

                    const messages = elements.chatContainer.querySelectorAll('.message');
                    const lastUserMessage = Array.from(messages).reverse().find(msg => msg.classList.contains('user'));
                    if (lastUserMessage) {
                        lastUserMessage.remove();
                    }

                    const lastAssistantMessage = Array.from(messages).reverse().find(msg => msg.classList.contains('assistant'));
                    if (lastAssistantMessage) {
                        lastAssistantMessage.remove();
                    }

                    if (chats[chatIdForRequest]) {
                        const isEmpty = !chats[chatIdForRequest].messages || chats[chatIdForRequest].messages.length === 0;
                        const hasOnlyUserMessage = chats[chatIdForRequest].messages?.length === 1 && chats[chatIdForRequest].messages[0].role === 'user';

                        if (isEmpty || hasOnlyUserMessage) {
                            delete chats[chatIdForRequest];
                            currentChatId = null;
                            showEmptyState();
                        } else {
                            const lastMsg = chats[chatIdForRequest].messages[chats[chatIdForRequest].messages.length - 1];
                            if (lastMsg && lastMsg.role === 'user') {
                                chats[chatIdForRequest].messages.pop();
                            }
                        }
                    }
                    scheduleRenderSidebar();
                };

                if (errorData.apiMode === 'server_fallback') {
                    currentUserUsage.apiMode = 'server_fallback';
                    if (typeof errorData.usage === 'number') {
                        currentUserUsage.count = errorData.usage;
                    }
                    if (typeof errorData.limit === 'number' || errorData.limit === Infinity) {
                        currentUserUsage.limit = errorData.limit;
                    }

                    updateUsageDisplay();

                    if (currentUser) {
                        refreshUsageStats(true).catch(err => {
                            console.warn(`${getToastMessage('console.refreshUsageStatsFailed')}:`, err);
                        });
                    }
                }

                if (errorData.fallbackLimitReached) {
                    cleanUpFailedRequest();
                    showToast(getToastMessage('toast.fallbackLimitReached'), 'error');
                    return;
                }

                // 检查是否是用量限制错误
                const usageLimitKeywords = [
                    getToastMessage('errors.usageLimitReached'),
                    getToastMessage('errors.dailyUsageLimitReached'),
                    getToastMessage('errors.searchFeatureDailyLimitReached'),
                    'usage', 'limit', 'quota', 'daily', 'limit reached'
                ];
                const isUsageLimitError = response.status === 429 && usageLimitKeywords.some(keyword =>
                    rawErrorMessage.toLowerCase().includes(keyword.toLowerCase())
                );

                if (isUsageLimitError) {
                    cleanUpFailedRequest();
                    // 显示用量限制弹窗
                    showUsageLimitModal();
                    return;
                }
                throw new Error(displayErrorMessage);
            } catch (parseError) {
                if (parseError.message && parseError.message.includes(getToastMessage('errors.usageLimitReached'))) {
                    return;
                }
                const fallbackMappedMessage = getModelErrorMessage(response.status);
                if (fallbackMappedMessage) {
                    console.warn('Model request failed (unparsed error):', response.status, errorText);
                }
                throw new Error(fallbackMappedMessage || errorText || `${getToastMessage('errors.requestFailed')}: ${response.status}`);
            }
        }

        try {
            const invalidated = response.headers.get('X-Guest-Invalidated') === 'true';
            if (!currentUser && invalidated) {
                handleGuestKeyInvalidation({ showToast: true });
            }
        } catch (_) { }

        const { fullResponse: responseText, finalCitations, finishReason } = await processStreamedResponse(response, contentDiv);
        fullResponse = responseText.trim();

        if (finishReason) {
            let warningMessage = '';
            if (finishReason === 'length') {
                warningMessage = getToastMessage('ui.aiResponseTruncatedDueToLength');
            } else if (finishReason === 'content_filter') {
                warningMessage = getToastMessage('ui.aiResponseStoppedDueToSafetyPolicy');
            }

            if (warningMessage) {
                fullResponse += `\n\n<p style="color: var(--warning-color, #ff9800); font-size: 0.9em; margin-top: 12px;">${warningMessage}</p>`;
            }
        }

        if (!fullResponse) {
            throw new Error(getToastMessage('errors.aiReturnedEmptyContent'));
        }

    } catch (error) {
        if (error.name !== 'AbortError') {
            if (error.isNetworkError || error.message.includes(getToastMessage('errors.networkConnectionFailed'))) {
                showToast(getToastMessage('errors.networkConnectionFailed'), 'error');
            } else if (error.message) {
                showToast(error.message, 'error');
            }

            cleanupEmptyMessagePlaceholders();

            const messages = elements.chatContainer.querySelectorAll('.message');
            const lastUserMessage = Array.from(messages).reverse().find(msg => msg.classList.contains('user'));
            if (lastUserMessage) {
                lastUserMessage.remove();
            }

            if (chats[chatIdForRequest] && chats[chatIdForRequest].messages.length > 0) {
                const lastMsg = chats[chatIdForRequest].messages[chats[chatIdForRequest].messages.length - 1];
                if (lastMsg && lastMsg.role === 'user') {
                    chats[chatIdForRequest].messages.pop();
                }
            }

            if (userMessageText) {
                elements.messageInput.value = userMessageText;
                elements.messageInput.dispatchEvent(new Event('input'));
                updateSendButton();
            }

            fullResponse = '';
        }
    } finally {
        if (typeof progressTimer === 'number') {
            clearTimeout(progressTimer);
            progressTimer = null;
        }

        activeResponses.delete(chatIdForRequest);

        // 重置发送按钮状态
        resetSendButtonState();

        try {
            const processedResponse = fullResponse;
            const scrollHeight = elements.chatContainer.scrollHeight;
            const clientHeight = elements.chatContainer.clientHeight;
            const scrollTop = elements.chatContainer.scrollTop;
            const isScrolledToBottom = scrollHeight - clientHeight <= scrollTop + 20;

            requestAnimationFrame(() => {
                const renderPromise = renderMessageContent(contentDiv, processedResponse, null, true);

                if (isScrolledToBottom) {
                    const ensureBottom = () => requestAnimationFrame(() => smoothScrollToBottom());
                    const ensureActions = () => {
                        const messageElement = contentDiv.closest('.message');
                        if (messageElement) {
                            ensureMessageActionsVisible(messageElement);
                        }
                    };

                    ensureBottom();
                    if (renderPromise && typeof renderPromise.then === 'function') {
                        renderPromise.finally(() => {
                            ensureBottom();
                            ensureActions();
                        });
                    } else {
                        ensureActions();
                    }
                }
                refreshEditButtons();
            });
        } catch (renderError) {
            console.error(`${getToastMessage('console.finalRenderFailed')}:`, renderError);
            if (contentDiv) {
                contentDiv.textContent = fullResponse;
            }
        }
    }

    const assistantMessage = { role: 'assistant', content: fullResponse };
    chats[chatIdForRequest].messages.push(assistantMessage);
    return assistantMessage;
}

async function _processAndSendMessage(userContent, userMessageText) {
    // 重置当前消息的意图分析结果
    intentAnalyzer.reset();

    const hasLargeAttachment = userContent.some(part =>
        part.type === 'file' &&
        typeof part.content === 'string' &&
        part.content.length > LARGE_TEXT_THRESHOLD
    );

    if (hasLargeAttachment) {
        showToast(getToastMessage('toast.largeAttachmentProcessing'), 'info');
    }

    if (!currentChatId) {
        await startNewChat(true);
    }
    let chatIdForRequest = currentChatId;

    const originalUserContent = cloneMessageParts(userContent) || userContent;

    appendMessage('user', userContent);
    chats[chatIdForRequest].messages.push({ role: 'user', content: cloneMessageParts(originalUserContent) || originalUserContent });

    const assistantPlaceholderElement = appendMessage('assistant', '');
    const assistantPlaceholderContentDiv = assistantPlaceholderElement.querySelector('.content');
    if (assistantPlaceholderContentDiv) {
        assistantPlaceholderContentDiv.innerHTML = `
            <div class="thinking-indicator-new">
                <svg class="spinner" viewBox="0 0 50 50">
                    <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
                </svg>
                <span>${getToastMessage('ui.thinking')}</span>
            </div>
        `;
    }

    let userMessageToSave = { role: 'user', content: cloneMessageParts(originalUserContent) || originalUserContent };
    let assistantMessageToSave = null;
    let requestSuccessful = false;

    try {
        const conversationHistory = chats[chatIdForRequest]?.messages || [];
        const historyLength = JSON.stringify(conversationHistory).length;

        let totalTextLength = userMessageText.length;
        userContent.forEach(part => {
            if (part.type === 'file' && typeof part.content === 'string') {
                totalTextLength += part.content.length;
            }
        });

        const hasFileAttachments = userContent.some(att => att.type === 'file');
        const allowLargeDocumentProcessing = !isSearchModeActive && !isImageModeActive && !isResearchModeActive;

        if (allowLargeDocumentProcessing && totalTextLength > LARGE_TEXT_THRESHOLD) {
            // 显示大文档处理提示
            if (assistantPlaceholderContentDiv) {
                assistantPlaceholderContentDiv.innerHTML = `<div class="thinking-indicator-new">... ${getToastMessage('aiProcessing.intelligentChunking')}</div>`;
            }
            showToast(getToastMessage('toast.largeAttachmentProcessing'), 'info');
            const intent = await getLargeTextIntent(userMessageText);

            switch (intent) {
                case 'CONTINUATION':
                    assistantMessageToSave = await handleContinuationTask(userContent, null, assistantPlaceholderElement);
                    break;
                case 'ANALYSIS_QA': {
                    assistantMessageToSave = await handleDeepAnalysis(userContent, userMessageText, assistantPlaceholderElement);
                    break;
                }
                case 'SUMMARIZATION':
                default: {
                    assistantMessageToSave = await handleLargeTextAnalysis(userContent, userMessageText, assistantPlaceholderElement);
                    break;
                }
            }
        } else if (historyLength > 60000) {
            let combinedStory = "";

            conversationHistory.forEach(msg => {
                let textContent = Array.isArray(msg.content) ?
                    msg.content.filter(p => p.type === 'text').map(p => p.text).join(' ') :
                    (typeof msg.content === 'string' ? msg.content : "");

                if (msg.role === 'user' && !/^(继续|go on|continue|接着写|next)$/i.test(textContent.trim())) {
                    combinedStory += `\n\n[${getToastMessage('ui.userSupplement')}]:\n${textContent}\n\n`;
                } else if (msg.role === 'assistant') {
                    combinedStory += textContent;
                }
            });

            const imageAndOtherAttachments = userContent.filter(p =>
                p.type === 'image_url' ||
                (p.type === 'file' && p.filename !== 'story_so_far.txt')
            );

            const continuationContentForAI = [{
                type: 'file',
                filename: 'story_so_far.txt',
                content: combinedStory
            }, {
                type: 'text',
                text: userMessageText
            }, ...imageAndOtherAttachments];

            userMessageToSave = {
                role: 'user',
                content: cloneMessageParts(originalUserContent) || originalUserContent
            };
            assistantMessageToSave = await handleContinuationTask(continuationContentForAI, userContent, assistantPlaceholderElement);
        } else {
            const contentDiv = assistantPlaceholderElement.querySelector('.content');

            // 执行统一的意图分析
            const intentAnalysis = await performUnifiedIntentAnalysis(userMessageText, conversationHistory, {
                checkImageGeneration: true,
                isImageModeActive
            });

            if (!hasFileAttachments && isImageModeActive) {
                if (contentDiv) {
                    contentDiv.querySelector('span').textContent = getToastMessage('status.understandingYourNeeds');
                }
                if (intentAnalysis.shouldGenerateImage) {
                    if (contentDiv) {
                        contentDiv.querySelector('span').textContent = getToastMessage('status.generatingImageForYou');
                    }
                    const newImagePromptObject = await generateCombinedImagePrompt(userMessageText, conversationHistory, intentAnalysis.intentResult.intent);
                    const imageResult = await handleImageGeneration(userContent, newImagePromptObject, {
                        existingAssistantElement: assistantPlaceholderElement
                    });

                    if (imageResult) {
                        assistantMessageToSave = imageResult;
                        wasImageGenerated = true;
                        requestSuccessful = true;

                        // 图片生成成功后，实时刷新用量显示
                        if (currentUser) {
                            refreshUsageStats().catch(err => console.error(`${getToastMessage('console.usageStatsFailed')}:`, err));
                        }
                    } else {
                        const errorMessage = getToastMessage('errors.imageGenerationFailed');
                        if (contentDiv) {
                            renderMessageContent(contentDiv, `<p style="color: var(--error-color, #ef4444);">${errorMessage}</p>`);
                        }
                        assistantMessageToSave = {
                            role: 'assistant',
                            content: `<p style="color: var(--error-color, #ef4444);">${errorMessage}</p>`
                        };
                    }
                } else {
                    assistantMessageToSave = await handleChatMessage(userContent, {
                        existingAssistantElement: assistantPlaceholderElement
                    });
                }
            } else if (!isImageModeActive && !hasFileAttachments) {
                let shouldSuggestImageMode = intentAnalysis.shouldSuggestImageMode;

                if (!shouldSuggestImageMode && userMessageText.length < 120 && containsImageKeywords(userMessageText)) {
                    shouldSuggestImageMode = true;
                }

                if (shouldSuggestImageMode) {
                    const message = getToastMessage('ui.enableImageGeneration');
                    renderMessageContent(contentDiv, message);
                    assistantMessageToSave = { role: 'assistant', content: message };
                    chats[chatIdForRequest].messages.push(assistantMessageToSave);
                    requestSuccessful = true;
                } else {
                    assistantMessageToSave = await handleChatMessage(userContent, { existingAssistantElement: assistantPlaceholderElement });
                }
            } else {
                assistantMessageToSave = await handleChatMessage(userContent, {
                    existingAssistantElement: assistantPlaceholderElement
                });
            }
        }

        if (assistantMessageToSave && assistantMessageToSave.content && !assistantMessageToSave.content.startsWith(getToastMessage('ui.error') + ':')) {
            requestSuccessful = true;
        } else {
            throw new Error(assistantMessageToSave?.content || 'AI response failed or was empty.');
        }

    } catch (error) {
        console.error(`${getToastMessage('console.sendMessageTopLevelError')}:`, error);

        if (!requestSuccessful && userMessageText) {
            elements.messageInput.value = userMessageText;
            elements.messageInput.dispatchEvent(new Event('input'));
            updateSendButton();
        }
    } finally {
        if (pendingMessage) {
            const nextMessage = pendingMessage;
            pendingMessage = null;
            setTimeout(() => {
                isProcessing = true;
                setSendButtonLoading();
                _processAndSendMessage(nextMessage.userContent, nextMessage.userMessageText);
            }, 100);
        } else {
            isProcessing = false;
            resetSendButtonState();
        }
        cleanupEmptyMessagePlaceholders();
    }

    if (requestSuccessful) {
        const taskId = `save_chat_${chatIdForRequest}_${Date.now()}`;
        addBackgroundTask(taskId, async () => {
            try {
                const saveResult = await saveChatToServer(chatIdForRequest, userMessageToSave, assistantMessageToSave);
                const finalChatId = saveResult.finalChatId;
                const newTitleFromServer = saveResult.newTitle;

                if (chats[finalChatId]) {
                    if (newTitleFromServer) {
                        chats[finalChatId].title = newTitleFromServer;

                        // 如果是访客用户，持久化到 IndexedDB
                        if (!currentUser) {
                            try {
                                await saveChatsToDB('guest', chats);
                            } catch (error) {
                                console.error('Failed to save updated guest chat to IndexedDB:', error);
                            }
                        }
                    }
                }

                if (isPageVisible) {
                    scheduleRenderSidebar();
                }
            } catch (err) {
                console.error(`${getToastMessage('console.backgroundSaveChatFailed')}:`, err);
                if (currentUser && isPageVisible) {
                    showToast(getToastMessage('toast.conversationNotSynced'), 'warning');
                }
                throw err;
            }
        }, 'high');
    }
    intentAnalyzer.reset();
}
async function sendMessage() {
    if (isSendingMessage) {
        return;
    }

    if (isEditModeActive) {
        await commitInlineEditMode();
        return;
    }

    if (isMultiSelectMode) {
        exitMultiSelectMode();
    }

    const userMessageText = elements.messageInput.value.trim();
    const attachmentsToProcess = [...attachments];
    const quoteToProcess = currentQuote;

    let userContent = [];
    if (quoteToProcess) {
        userContent.push({ type: 'quote', text: quoteToProcess });
    }
    if (userMessageText) {
        userContent.push({
            type: 'text', text: userMessageText
        });
    }
    attachmentsToProcess.forEach(attachment => {
        if (attachment.content) {
            userContent.push(attachment.type === 'image' ?
                { type: 'image_url', image_url: { url: attachment.content } } :
                { type: 'file', filename: attachment.file.name, content: attachment.content });
        }
    });

    const hasContentToSend = userContent.some(p => p.type !== 'quote' && (p.type !== 'text' || p.text.trim() !== ''));
    if (!hasContentToSend) {
        if (currentQuote) showToast(getToastMessage('toast.pleaseEnterReply'), 'info');
        return;
    }

    if (isProcessing) {
        pendingMessage = { userContent, userMessageText };
        clearInputAndAttachments(true);
        cancelQuote();
        dismissKeyboard();
        showToast(getToastMessage('toast.messageQueued'), 'info');
        return;
    }

    isSendingMessage = true;

    try {
        clearInputAndAttachments(true);
        cancelQuote();
        dismissKeyboard();
        isProcessing = true;
        setSendButtonLoading();
        wasImageGenerated = false;

        if (isSearchModeActive) {
            await handleSearchAndChat(userMessageText);
            if (pendingMessage) {
                const nextMessage = pendingMessage;
                pendingMessage = null;
                setTimeout(() => {
                    isProcessing = true;
                    setSendButtonLoading();
                    isSendingMessage = true;
                    _processAndSendMessage(nextMessage.userContent, nextMessage.userMessageText)
                        .finally(() => { isSendingMessage = false; });
                }, 100);
            }
        } else if (isResearchModeActive) {
            await handleResearchAndChat(userContent, userMessageText);
            if (pendingMessage) {
                const nextMessage = pendingMessage;
                pendingMessage = null;
                setTimeout(() => {
                    isProcessing = true;
                    setSendButtonLoading();
                    isSendingMessage = true;
                    _processAndSendMessage(nextMessage.userContent, nextMessage.userMessageText)
                        .finally(() => { isSendingMessage = false; });
                }, 100);
            }
        } else {
            await _processAndSendMessage(userContent, userMessageText);
        }
    } finally {
        isSendingMessage = false;
    }
}

function detectFileType(filename, content) {
    const extension = filename.split('.').pop().toLowerCase();
    const codeExtensions = ['js', 'ts', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'rb', 'html', 'css', 'json', 'xml', 'yaml', 'sql'];

    if (codeExtensions.includes(extension) || content.includes('```')) {
        return 'code';
    }
    if (['csv', 'xls', 'xlsx'].includes(extension) || content.match(/\|.*\|.*\n.*\|.*\|/)) {
        return 'table';
    }
    if (extension === 'md' || content.match(/^#{1,6}\s/m)) {
        return 'markdown';
    }
    return 'text';
}

function chunkCode(code, maxChunkSize) {
    const separators = /(?=async function|function|class|const|let|var|\/\*\*)/g;
    const blocks = code.split(separators);
    const chunks = [];

    let currentChunk = '';
    for (const block of blocks) {
        if (currentChunk.length + block.length > maxChunkSize && currentChunk) {
            chunks.push(currentChunk);
            currentChunk = block;
        } else {
            currentChunk += block;
        }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
}

function chunkMarkdown(markdown, maxChunkSize) {
    const sections = markdown.split(/(?=\n#{1,3}\s)/);
    const chunks = [];
    let currentChunk = '';

    for (const section of sections) {
        if (currentChunk.length + section.length > maxChunkSize && currentChunk) {
            chunks.push(currentChunk);
            currentChunk = section;
        } else {
            currentChunk += section;
        }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
}

function chunkTable(markdownTable, maxChunkSize) {
    const lines = markdownTable.split('\n');
    if (lines.length <= 3) return [markdownTable];

    const header = lines.slice(0, 2).join('\n');
    const dataRows = lines.slice(2);
    const chunks = [];
    let currentChunk = header + '\n';

    for (const row of dataRows) {
        if (currentChunk.length + row.length > maxChunkSize && currentChunk.length > header.length) {
            chunks.push(currentChunk);
            currentChunk = header + '\n' + row + '\n';
        } else {
            currentChunk += row + '\n';
        }
    }
    if (currentChunk.length > header.length) {
        chunks.push(currentChunk);
    }
    return chunks;
}

async function processInBatches(items, processFn, batchSize, delay) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchPromises = batch.map(processFn);
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        if (i + batchSize < items.length && delay > 0) {
            await sleep(delay);
        }
    }
    return results;
}

function smartChunking(text, maxChunkSize = 8000, overlap = 200) {
    const sentences = text.match(/[^。！？\.\!\?]+[。！？\.\!\?\n\n]*|[^。！？\.\!\?]+$/g) || [];
    if (sentences.length === 0) return [text];

    const chunks = [];
    let currentChunk = "";

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        if (currentChunk.length + sentence.length > maxChunkSize && currentChunk) {
            chunks.push(currentChunk);

            const lastSentences = chunks[chunks.length - 1].split(/(?<=[。！？\.\!\?])/);
            let overlapText = "";
            let overlapLength = 0;
            for (let j = lastSentences.length - 1; j >= 0; j--) {
                if (overlapLength + lastSentences[j].length <= overlap) {
                    overlapText = lastSentences[j] + overlapText;
                    overlapLength += lastSentences[j].length;
                } else {
                    break;
                }
            }
            currentChunk = overlapText + sentence;
        } else {
            currentChunk += sentence;
        }
    }
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    return chunks;
}

function cloneMessageParts(parts) {
    if (!Array.isArray(parts)) return null;
    return parts.map(part => {
        if (part && typeof part === 'object') {
            const cloned = { ...part };
            if (part.image_url && typeof part.image_url === 'object') {
                cloned.image_url = { ...part.image_url };
            }
            return cloned;
        }
        return part;
    });
}

function getLastUserMessage(chatId) {
    const chat = chats[chatId];
    if (!chat || !Array.isArray(chat.messages)) return null;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        const message = chat.messages[i];
        if (message && message.role === 'user') {
            return message;
        }
    }
    return null;
}

function setAiOptimizedContentForLastUserMessage(chatId, optimizedParts) {
    if (!chatId || !Array.isArray(optimizedParts)) return;
    const lastUserMessage = getLastUserMessage(chatId);
    if (!lastUserMessage) return;
    aiOptimizedContentStore.set(lastUserMessage, cloneMessageParts(optimizedParts) || []);
}

function isToolUseUnavailableError(error) {
    return !!(error && error.isToolUseUnavailable);
}

function getAiOptimizedContentForMessage(message) {
    if (!message) return null;
    const stored = aiOptimizedContentStore.get(message);
    return stored ? cloneMessageParts(stored) : null;
}

async function handleLargeTextAnalysis(userContent, originalQuery, existingAssistantElement = null) {
    if (!currentChatId) await startNewChat(true);
    const chatIdForRequest = currentChatId;

    const assistantMessageElement = existingAssistantElement || appendMessage('assistant', '');
    const contentDiv = assistantMessageElement.querySelector('.content');

    if (contentDiv && !existingAssistantElement) {
        contentDiv.innerHTML = `<div class="thinking-indicator-new">... ${getToastMessage('aiProcessing.intelligentChunking')}</div>`;
    }

    let allChunks = [];
    userContent.forEach(part => {
        let partChunks = [];
        if (part.type === 'text' && part.text) {
            partChunks = smartChunkingByParagraphs(part.text, CHUNK_CONFIG.summarize.size);
            if (partChunks.length === 0) {
                partChunks = smartChunking(part.text, CHUNK_CONFIG.summarize.size, CHUNK_CONFIG.summarize.overlap);
            }
        } else if (part.type === 'file' && typeof part.content === 'string') {
            const fileType = detectFileType(part.filename, part.content);
            let fileContent = `--- ${getToastMessage('ui.file')}: ${part.filename} ---\n${part.content}\n--- ${getToastMessage('ui.fileEnd')} ---`;
            switch (fileType) {
                case 'code': partChunks = chunkCode(fileContent, CHUNK_CONFIG.summarize.size); break;
                case 'markdown': partChunks = chunkMarkdown(fileContent, CHUNK_CONFIG.summarize.size); break;
                case 'table': partChunks = chunkTable(fileContent, CHUNK_CONFIG.analyze.size); break;
                default:
                    partChunks = smartChunkingByParagraphs(fileContent, CHUNK_CONFIG.summarize.size);
                    if (partChunks.length === 0) {
                        partChunks = smartChunking(fileContent, CHUNK_CONFIG.summarize.size, CHUNK_CONFIG.summarize.overlap);
                    }
                    break;
            }
        }
        allChunks.push(...partChunks);
    });
    const chunks = allChunks;

    // 警告但不阻止
    const WARNING_THRESHOLD = 10;
    if (chunks.length > WARNING_THRESHOLD) {
        showToast(
            getToastMessage('toast.manyChunksWarning', { count: chunks.length, threshold: WARNING_THRESHOLD }) ||
            `Processing ${chunks.length} chunks (recommended: ${WARNING_THRESHOLD}). This may take longer.`,
            'info'
        );
    }

    let cumulativeSummary = "";

    try {
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            contentDiv.innerHTML = `<div class="thinking-indicator-new">... ${getToastMessage('aiProcessing.analyzingPart', { current: i + 1, total: chunks.length })}</div>`;

            const MAX_PROMPT_LENGTH = 30000;
            let prompt = i === 0
                ? `Summarize this text part (${i + 1}/${chunks.length}):\n${chunk}`
                : `Update summary with new content. Previous: ${cumulativeSummary}\n\nNew part (${i + 1}/${chunks.length}):\n${chunk}`;

            if (prompt.length > MAX_PROMPT_LENGTH) {
                prompt = prompt.substring(0, MAX_PROMPT_LENGTH) + '\n\n[Content truncated due to length limit]';
            }

            const chunkSummary = await callAISynchronously(prompt);
            cumulativeSummary = chunkSummary;

            if (i < chunks.length - 1) {
                await sleep(1500);
            }
        }

        contentDiv.innerHTML = `<div class="thinking-indicator-new">... ${getToastMessage('aiProcessing.allPartsAnalyzed')}</div>`;

        const finalPromptForUserChoiceModel = `Based on this summary, answer: "${originalQuery}"\n\nSummary: ${cumulativeSummary}`;
        const finalUserContent = [{ type: 'text', text: finalPromptForUserChoiceModel }];
        setAiOptimizedContentForLastUserMessage(chatIdForRequest, finalUserContent);

        await sleep(2000);
        return await handleChatMessage(finalUserContent, { existingAssistantElement: assistantMessageElement });

    } catch (error) {
        console.error(`${getToastMessage('console.longTextAnalysisFailed')}:`, error);
        if (isToolUseUnavailableError(error)) {
            showToast(getToastMessage('toast.toolUseFallback'), 'warning');
            if (contentDiv) {
                contentDiv.innerHTML = `<div class="thinking-indicator-new">... ${getToastMessage('ui.thinking')}</div>`;
            }
            return await handleChatMessage(userContent, { existingAssistantElement: assistantMessageElement });
        }
        const finalAnswerText = `${getToastMessage('ui.analysisError')}：${error.message}`;
        renderMessageContent(contentDiv, finalAnswerText);
        const assistantMessage = { role: 'assistant', content: finalAnswerText };
        chats[chatIdForRequest].messages.push(assistantMessage);
        return assistantMessage;
    }
}

async function handleDeepAnalysis(userContent, originalQuery, existingAssistantElement = null) {
    if (!currentChatId) await startNewChat(true);
    const chatIdForRequest = currentChatId;

    const assistantMessageElement = existingAssistantElement || appendMessage('assistant', '');
    const contentDiv = assistantMessageElement.querySelector('.content');

    try {
        if (contentDiv && !existingAssistantElement) {
            contentDiv.innerHTML = `<div class="thinking-indicator-new">... ${getToastMessage('aiProcessing.step1Chunking')}</div>`;
        }
        let allChunks = [];
        let chunkCounter = 0;

        userContent.forEach(part => {
            let partChunks = [];
            if (part.type === 'text' && part.text) {
                partChunks = smartChunkingByParagraphs(part.text, CHUNK_CONFIG.analyze.size);
                if (partChunks.length === 0) {
                    partChunks = smartChunking(part.text, CHUNK_CONFIG.analyze.size, CHUNK_CONFIG.analyze.overlap);
                }
            } else if (part.type === 'file' && typeof part.content === 'string') {
                const fileType = detectFileType(part.filename, part.content);
                let fileContent = `--- ${getToastMessage('ui.file')}: ${part.filename} ---\n${part.content}\n--- ${getToastMessage('ui.fileEnd')} ---`;

                switch (fileType) {
                    case 'code':
                        partChunks = chunkCode(fileContent, CHUNK_CONFIG.analyze.size);
                        break;
                    case 'markdown':
                        partChunks = chunkMarkdown(fileContent, CHUNK_CONFIG.analyze.size);
                        break;
                    case 'table':
                        partChunks = chunkTable(fileContent, CHUNK_CONFIG.analyze.size);
                        break;
                    default:
                        partChunks = smartChunkingByParagraphs(fileContent, CHUNK_CONFIG.analyze.size);
                        if (partChunks.length === 0) {
                            partChunks = smartChunking(fileContent, CHUNK_CONFIG.analyze.size, CHUNK_CONFIG.analyze.overlap);
                        }
                        break;
                }
            }
            allChunks.push(...partChunks.map(text => ({
                id: chunkCounter++,
                text: text,
                sourceFile: part.filename || 'user_input'
            })));
        });

        const chunks = allChunks;

        // 警告但不阻止
        const WARNING_THRESHOLD = 15;
        if (chunks.length > WARNING_THRESHOLD) {
            showToast(
                getToastMessage('toast.manyChunksWarning', { count: chunks.length, threshold: WARNING_THRESHOLD }) ||
                `Processing ${chunks.length} chunks (recommended: ${WARNING_THRESHOLD}). This may take longer.`,
                'info'
            );
        }

        contentDiv.innerHTML = `<div class="thinking-indicator-new">... ${getToastMessage('aiProcessing.step2Indexing', { count: chunks.length })}</div>`;

        const processChunkForIndex = async (chunk) => {
            const MAX_CHUNK_LENGTH = 20000;
            const chunkText = chunk.text.length > MAX_CHUNK_LENGTH
                ? chunk.text.substring(0, MAX_CHUNK_LENGTH) + '\n\n[Content truncated due to length limit]'
                : chunk.text;

            const indexPrompt = `Extract keywords and create a summary from the following text block.\n\nText Block Content:\n"""${chunkText}"""\n\nReturn in JSON format only, no other text, format: {"keywords": ["keyword1", "keyword2"], "summary": "summary content"}`;
            try {
                const indexDataStr = await callAISynchronously(indexPrompt);
                const indexData = safeJsonParse(indexDataStr);
                if (indexData && Array.isArray(indexData.keywords) && typeof indexData.summary === 'string') {
                    return { chunkId: chunk.id, content: chunk.text, keywords: indexData.keywords, summary: indexData.summary, sourceFile: chunk.sourceFile };
                }
                throw new Error(getToastMessage('errors.parsedDataIsNullOrInvalid'));
            } catch (e) {
                const basicSummary = chunk.text.substring(0, 80).replace(/\s+/g, ' ') + '...';
                const basicKeywords = chunk.text.match(/\b\w{3,}\b/g)?.slice(0, 5) || [];
                return { chunkId: chunk.id, content: chunk.text, keywords: basicKeywords, summary: `[${getToastMessage('ui.basicIndex')}] ${basicSummary}`, sourceFile: chunk.sourceFile };
            }
        };

        const results = await processInBatches(chunks, processChunkForIndex, 1, 1500);
        const documentIndex = results.filter(item => item !== null);

        if (documentIndex.length < chunks.length) {
            showToast(getToastMessage('toast.partialIndexFailed', { count: chunks.length - documentIndex.length }), 'warning');
        }

        contentDiv.innerHTML = `<div class="thinking-indicator-new">... ${getToastMessage('aiProcessing.step3Extracting')}</div>`;

        const extractionPrompt = `Extract search keywords from the user query: "${originalQuery}"\n\nReturn ONLY a JSON object in this exact format: {"keywords": ["keyword1", "keyword2"]}`;
        const keywordsResult = await callAISynchronously(extractionPrompt);
        const searchKeywords = safeJsonParse(keywordsResult, { keywords: [originalQuery.substring(0, 20)] }).keywords;

        contentDiv.innerHTML = `<div class="thinking-indicator-new">... ${getToastMessage('aiProcessing.step3Searching')}</div>`;

        const retrievalPrompt = `Find the most relevant document chunks based on the search keywords.\n\nSearch Keywords: "${searchKeywords.join(', ')}"\n\nDocument Index:\n${JSON.stringify(documentIndex.map(d => ({ id: d.chunkId, keywords: d.keywords, summary: d.summary })), null, 2)}\n\nPlease return ONLY a JSON array of chunk IDs, like: ["chunk1", "chunk2", "chunk3"]`;
        const relevantIdsStr = await callAISynchronously(retrievalPrompt);

        let relevantChunks = [];
        const relevantIds = safeJsonParse(relevantIdsStr);

        if (relevantIds && Array.isArray(relevantIds) && relevantIds.length > 0) {
            const idSet = new Set(relevantIds);
            relevantChunks = documentIndex.filter(d => idSet.has(d.chunkId));
        }

        if (relevantChunks.length === 0) {
            showToast(getToastMessage('toast.aiRetrievalFailed'), "info");
            const queryKeywords = originalQuery.toLowerCase().match(/\b\w{2,}\b/g) || [];
            if (queryKeywords.length > 0) {
                const scoredChunks = documentIndex.map(chunk => {
                    let score = 0;
                    const chunkText = (chunk.keywords.join(' ') + ' ' + chunk.summary).toLowerCase();
                    queryKeywords.forEach(kw => {
                        if (chunkText.includes(kw)) {
                            score++;
                        }
                    });
                    return { ...chunk, score };
                });

                scoredChunks.sort((a, b) => b.score - a.score);
                relevantChunks = scoredChunks.slice(0, 3).filter(c => c.score > 0);
            }
        }

        if (relevantChunks.length === 0 && documentIndex.length > 0) {
            showToast(getToastMessage('toast.noRelevantContent'), "info");
            relevantChunks = documentIndex.slice(0, 3);
        }

        contentDiv.innerHTML = `<div class="thinking-indicator-new">... ${getToastMessage('aiProcessing.step4Generating')}</div>`;

        const finalPromptForUserChoiceModel = `Answer: "${originalQuery}"\n\nRelevant content:\n${relevantChunks.map(c => `[${c.chunkId} from ${c.sourceFile}]:\n${c.content}`).join('\n\n')}`;
        const finalUserContent = [{ type: 'text', text: finalPromptForUserChoiceModel }];
        setAiOptimizedContentForLastUserMessage(chatIdForRequest, finalUserContent);

        await sleep(2000);
        return await handleChatMessage(finalUserContent, { existingAssistantElement: assistantMessageElement });

    } catch (error) {
        console.error(`${getToastMessage('console.deepAnalysisFailed')}:`, error);
        if (isToolUseUnavailableError(error)) {
            showToast(getToastMessage('toast.toolUseFallback'), 'warning');
            if (contentDiv) {
                contentDiv.innerHTML = `<div class="thinking-indicator-new">... ${getToastMessage('ui.thinking')}</div>`;
            }
            return await handleChatMessage(userContent, { existingAssistantElement: assistantMessageElement });
        }
        const finalAnswerText = `${getToastMessage('ui.sorryErrorInDeepAnalysis')}: ${error.message}`;
        renderMessageContent(contentDiv, finalAnswerText);
        const assistantMessage = { role: 'assistant', content: finalAnswerText };
        chats[chatIdForRequest].messages.push(assistantMessage);
        return assistantMessage;
    }
}

function safeJsonParse(text, fallback = null) {
    if (typeof text !== 'string' || !text || text.trim() === '') {
        return fallback;
    }

    try {
        // 首先尝试直接解析
        return JSON.parse(text.trim());
    } catch (e) {
        // 如果直接解析失败，尝试从代码块中提取JSON
        try {
            let match = text.match(/```json\s*([\s\S]*?)\s*```/);
            if (match && match[1]) {
                return JSON.parse(match[1].trim());
            }

            // 尝试从文本中提取JSON对象或数组
            match = text.match(/(\[[\s\S]*?\]|\{[\s\S]*?\})/);
            if (match && match[0]) {
                return JSON.parse(match[0].trim());
            }

            // 尝试修复常见的JSON错误
            const repairedText = text.trim()
                .replace(/,\s*([\}\]])/g, '$1')
                .replace(/([^\\])\\([^"\\\/bfnrt])/g, '$1\\\\$2');

            return JSON.parse(repairedText);
        } catch (repairError) {
            console.warn(`${getToastMessage('console.jsonParseFailed')}:`, e, getToastMessage('console.originalText'), text.substring(0, 200));
            console.error(`${getToastMessage('console.jsonRepairFailed')}:`, repairError);
            return fallback;
        }
    }
}

async function translateQueryToEnglishForResearch(text) {
    if (!text || !text.trim()) return null;
    const prompt = `Translate the following user query into fluent English. Return ONLY the translated text.\n\n"""${text.trim()}"""`;
    const tryDefault = async () => {
        try {
            const translated = await callAISynchronously(prompt, 'gemini-2.5-flash-lite', false);
            if (translated && typeof translated === 'string') {
                return translated.trim();
            }
        } catch (e) {
            console.warn('Research mode translation attempt failed', e);
        }
        return null;
    };

    let result = await tryDefault();
    if (!result) {
        await sleep(300);
        result = await tryDefault();
    }
    return result;
}

async function callAISynchronously(prompt, model = 'gemini-2.5-flash-lite', incrementUsage = false) {
    const headers = { 'Content-Type': 'application/json' };

    if (sessionId) {
        headers['X-Session-ID'] = sessionId;
    } else {
        headers['X-Visitor-ID'] = await getGuestVisitorId();
    }

    try {
        const payload = {
            prompt: prompt,
            model: model,
            incrementUsage: incrementUsage
        };
        const response = await fetch('/api/tool-use', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });

        try {
            const invalidated = response.headers.get('X-Guest-Invalidated') === 'true';
            if (!currentUser && invalidated) {
                handleGuestKeyInvalidation({ showToast: true });
            }
        } catch (_) { }

        if (!response.ok) {
            const errorText = await response.text();
            const toolError = new Error(`${getToastMessage('errors.aiToolCallFailed')}: ${errorText}`);
            toolError.status = response.status;
            if (response.status >= 500 || response.status === 429) {
                toolError.isToolUseUnavailable = true;
            }
            throw toolError;
        }

        const result = await response.json();

        if (result.success && result.content) {
            return result.content;
        } else {
            const fallbackErrorMessage = result.error || getToastMessage('errors.aiToolCallReturnedFailureStatus');
            const structuredError = new Error(fallbackErrorMessage);
            if (typeof fallbackErrorMessage === 'string' && /unavailable|timeout|tool/i.test(fallbackErrorMessage.toLowerCase())) {
                structuredError.isToolUseUnavailable = true;
            }
            throw structuredError;
        }

    } catch (error) {
        console.error(`${getToastMessage('console.syncAiCallFailed')}:`, error);
        if (error && typeof error === 'object' && typeof error.isToolUseUnavailable === 'undefined') {
            const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
            if (error.name === 'TypeError' || message.includes('failed to fetch') || message.includes('network')) {
                error.isToolUseUnavailable = true;
            }
        }
        throw error;
    }
}

function updateSearchModeUI() {
    if (isSearchModeActive) {
        elements.toolSearchOption.classList.add('active');
        if (isImageModeActive) {
            isImageModeActive = false;
            elements.toolImageOption.classList.remove('active');
        }
        if (isResearchModeActive) {
            isResearchModeActive = false;
            elements.toolResearchOption.classList.remove('active');
        }
    } else {
        elements.toolSearchOption.classList.remove('active');
    }

    updateToolsButtonState();
    updateActiveModel();
}

function updateImageModeUI() {
    if (isImageModeActive) {
        elements.toolImageOption.classList.add('active');
        if (isSearchModeActive) {
            isSearchModeActive = false;
            elements.toolSearchOption.classList.remove('active');
        }
        if (isResearchModeActive) {
            isResearchModeActive = false;
            elements.toolResearchOption.classList.remove('active');
        }
    } else {
        elements.toolImageOption.classList.remove('active');
    }

    updateToolsButtonState();
    updateActiveModel();
}

function updateToolsButtonState() {
    if (isSearchModeActive || isImageModeActive || isResearchModeActive) {
        elements.toolsMenuBtn.classList.add('active');
    } else {
        elements.toolsMenuBtn.classList.remove('active');
    }
}

function updateResearchModeUI() {
    if (isResearchModeActive) {
        elements.toolResearchOption.classList.add('active');
        if (isSearchModeActive) {
            isSearchModeActive = false;
            elements.toolSearchOption.classList.remove('active');
        }
        if (isImageModeActive) {
            isImageModeActive = false;
            elements.toolImageOption.classList.remove('active');
        }
    } else {
        elements.toolResearchOption.classList.remove('active');
    }

    updateToolsButtonState();
    updateActiveModel();
}

// 模型选择相关函数
function updateSelectedModelDisplay() {
    const availableModels = getAvailableModels();
    let selectedModel = availableModels.find(m => m.id === currentModelId);

    if (!selectedModel) {
        selectedModel = availableModels.find(m => m.id === userSelectedModelId);
        if (!selectedModel) {
            selectedModel = availableModels[0];
        }
        // 当当前选择在可用模型中不存在时，回退并同步用户选择
        currentModelId = selectedModel.id;
        userSelectedModelId = selectedModel.id;
    }
    elements.selectedModelName.textContent = selectedModel.name;
}

function updateActiveModel() {
    if (isSearchModeActive) {
        currentModelId = 'gemini-2.5-flash-lite';
    } else if (isImageModeActive) {
        currentModelId = 'gemini-2.5-flash';
    } else {
        currentModelId = userSelectedModelId;
    }

    updateSelectedModelDisplay();

    const isSpecialMode = isSearchModeActive || isImageModeActive;
    elements.modelSelectBtn.disabled = isSpecialMode;
    if (!isSpecialMode) {
        renderModelMenu();
    }
}

function resetToDefaultModel() {
    const availableModels = getAvailableModels();

    const defaultModel = availableModels[0];
    currentModelId = defaultModel.id;
    userSelectedModelId = defaultModel.id;

    updateActiveModel();
}

function renderModelMenu() {
    elements.modelSelectMenu.innerHTML = '';
    const availableModels = getAvailableModels();

    availableModels.forEach(model => {
        const item = document.createElement('div');
        item.className = 'model-select-item';
        if (model.id === currentModelId) {
            item.classList.add('selected');
        }

        // 动态获取翻译
        const currentLang = currentUser ? (currentUser.language || getCurrentLanguage()) : getCurrentLanguage();
        const modelDesc = t(currentLang, model.descKey);

        item.innerHTML = `
                    <div class="model-info">
                        <span class="model-name">${model.name}</span>
                        <span class="model-desc">${modelDesc}</span>
                    </div>
                    <svg class="checkmark-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                `;
        item.addEventListener('click', () => {
            userSelectedModelId = model.id;
            updateActiveModel();
            elements.modelSelectMenu.classList.remove('visible');
        });
        elements.modelSelectMenu.appendChild(item);
    });
}

// 文件查看器函数
function detectViewerType(filename, content) {
    const extension = filename.split('.').pop().toLowerCase();
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];

    if (content.startsWith('data:image/')) {
        return 'image';
    }
    if (imageExtensions.includes(extension)) {
        return 'image';
    }
    if (isPlainTextFile(filename)) {
        return 'code';
    }

    return 'rich_text';
}

function unregisterFileViewerLinkHandler() {
    if (typeof removeFileViewerLinkHandler === 'function') {
        removeFileViewerLinkHandler();
        removeFileViewerLinkHandler = null;
    }
}

function normalizeFileViewerAnchorTarget(rawHref) {
    if (!rawHref) return null;
    let href = rawHref.trim();
    if (!href) return null;

    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) || href.startsWith('//')) {
        return null;
    }

    if (href.startsWith('#')) {
        href = href.slice(1);
    }

    if (!href || href.includes('/')) {
        return null;
    }

    try {
        return decodeURIComponent(href);
    } catch (_) {
        return href;
    }
}

function registerFileViewerLinkHandler(container) {
    unregisterFileViewerLinkHandler();
    if (!container) return;

    const handler = (event) => {
        const anchor = event.target.closest('a');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        const targetId = normalizeFileViewerAnchorTarget(href);
        if (!targetId) return;
        event.preventDefault();

        const escapedId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(targetId) : targetId.replace(/"/g, '\\"');
        const selector = `[id="${escapedId}"], a[name="${escapedId}"]`;
        const target = container.querySelector(selector);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    container.addEventListener('click', handler);
    removeFileViewerLinkHandler = () => container.removeEventListener('click', handler);
}

function showFileViewer(filename, content) {
    const codeContainer = document.getElementById('file-viewer-code-container');
    const textContainer = document.getElementById('file-viewer-text-container');
    const codeElement = document.getElementById('file-viewer-code');

    // 每次打开时先清空和隐藏
    codeContainer.style.display = 'none';
    textContainer.style.display = 'none';
    textContainer.innerHTML = '';
    codeElement.textContent = '';
    elements.fileViewerFilename.textContent = filename;
    unregisterFileViewerLinkHandler();

    const viewerType = detectViewerType(filename, content);

    switch (viewerType) {
        case 'image':
            textContainer.style.display = 'block';
            textContainer.style.textAlign = 'center';
            const img = document.createElement('img');
            img.src = content;
            img.alt = filename;
            img.style.maxWidth = '100%';
            img.style.maxHeight = '60vh';
            img.style.objectFit = 'contain';
            img.style.borderRadius = '8px';
            textContainer.appendChild(img);
            break;

        case 'code':
            codeContainer.style.display = 'block';
            codeElement.textContent = content;
            setTimeout(() => {
                try {
                    ensurePlaintextHighlightLanguage();
                    hljs.highlightElement(codeElement);
                } catch (error) {
                    console.error(`${getToastMessage('console.codeHighlightFailed')}:`, error);
                }
            }, 50);
            break;

        case 'rich_text':
        default:
            textContainer.style.display = 'block';
            textContainer.style.textAlign = 'left';
            try {
                let htmlToRender = content;
                if (!filename.endsWith('.docx')) {
                    htmlToRender = marked.parse(content);
                }

                const sanitizedHtml = DOMPurify.sanitize(htmlToRender, {
                    ADD_TAGS: ['img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'p', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'pre', 'code'],
                    ADD_ATTR: ['class', 'style', 'src', 'alt']
                });

                textContainer.innerHTML = sanitizedHtml;

                // 使用数组避免在迭代时修改DOM导致的问题
                const tables = Array.from(textContainer.querySelectorAll('table'));
                tables.forEach(table => {
                    if (table.parentNode && !table.parentNode.classList.contains('table-wrapper')) {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'table-wrapper';
                        table.parentNode.insertBefore(wrapper, table);
                        wrapper.appendChild(table);
                    }
                });
                registerFileViewerLinkHandler(textContainer);
            } catch (error) {
                console.error(`${getToastMessage('console.richTextRenderFailed')}:`, error);
                textContainer.textContent = content;
                unregisterFileViewerLinkHandler();
            }
            break;
    }

    elements.fileViewerOverlay.classList.add('visible');
}

function hideFileViewerUI() {
    elements.fileViewerOverlay.classList.remove('visible');
    unregisterFileViewerLinkHandler();

    const preElement = elements.fileViewerCode.parentNode;
    if (preElement) {
        preElement.removeChild(elements.fileViewerCode);

        const newCodeElement = document.createElement('code');
        newCodeElement.id = 'file-viewer-code';
        newCodeElement.className = 'hljs';
        preElement.appendChild(newCodeElement);

        elements.fileViewerCode = newCodeElement;
    }
}

function setupInputPanelObserver() {
    const chatContainer = elements.chatContainer;
    const inputOuterWrapper = document.querySelector('.input-outer-wrapper');

    if (!inputOuterWrapper || !chatContainer) return;

    const observer = new ResizeObserver(entries => {
        const now = Date.now();
        if (isAutoScrolling || (now - lastScrollTime < 150)) {
            return;
        }

        const updates = [];
        for (const entry of entries) {
            const panelHeight = entry.target.offsetHeight;
            const scrollHeight = chatContainer.scrollHeight;
            const clientHeight = chatContainer.clientHeight;
            const scrollTop = chatContainer.scrollTop;
            const isScrolledToBottom = scrollHeight - clientHeight <= scrollTop + 50;

            updates.push({ panelHeight, isScrolledToBottom, scrollHeight });
        }
        for (const update of updates) {
            chatContainer.style.scrollPaddingBottom = `${update.panelHeight + 16}px`;
            if (update.isScrolledToBottom) {
                isAutoScrolling = true;
                lastScrollTime = Date.now();
                chatContainer.scrollTo({
                    top: update.scrollHeight,
                    behavior: 'smooth'
                });
                setTimeout(() => {
                    isAutoScrolling = false;
                    const lastMessage = chatContainer.querySelector('.message:last-of-type');
                    if (lastMessage) {
                        ensureMessageActionsVisible(lastMessage);
                    }
                }, 300);
            }
        }
    });
    observer.observe(inputOuterWrapper);
}

// 事件监听器设置
function updateCharacterCountUI() {
    const counterElement = document.getElementById('char-counter');
    if (!counterElement) return { totalChars: 0, isOverLimit: false };

    let totalChars = elements.messageInput.value.length;
    attachments.forEach(att => {
        if (att.type === 'file' && typeof att.content === 'string') {
            totalChars += att.content.length;
        }
    });

    counterElement.textContent = `${totalChars.toLocaleString()} / ${CHARACTER_LIMIT.toLocaleString()}`;
    const isOverLimit = totalChars > CHARACTER_LIMIT;

    if (isOverLimit) {
        counterElement.classList.add('over-limit');
    } else {
        counterElement.classList.remove('over-limit');
    }

    return { totalChars, isOverLimit };
}

function resetCharCountTimer() {
    const counterElement = document.getElementById('char-counter');
    if (!counterElement) return;

    counterElement.classList.add('visible');

    if (charCountTimer) {
        clearTimeout(charCountTimer);
    }

    charCountTimer = setTimeout(() => {
        counterElement.classList.remove('visible');
    }, 5000);
}

async function savePresetAndFont(type, isBackgroundSync = false) {
    if (!currentUser) return;

    const toastMessage = type === 'preset' ? getToastMessage('toast.themeSettingsAutoSaved') : getToastMessage('toast.fontSettingsAutoSaved');

    try {
        const newPreset = elements.themePresetSelector.querySelector('.theme-preset-btn.active')?.dataset.theme || 'light';
        const activeFontItem = elements.fontMenu?.querySelector('.dropdown-item.active');
        const newFont = activeFontItem?.dataset.value || 'system';

        const newThemeSettings = {
            preset: newPreset,
            font: newFont,
            background_url: null
        };

        const updateTimestamp = Date.now();
        localStorage.setItem('userThemeSettingsUpdatedAt', String(updateTimestamp));
        localStorage.setItem('userThemeSettings', JSON.stringify(newThemeSettings));
        localStorage.setItem('userThemePreset', newThemeSettings.preset);

        if (!isBackgroundSync) {
            showToast(toastMessage, 'success');
        }

        // 后台同步到服务器
        const result = await makeAuthRequest('update-profile', {
            theme_settings: newThemeSettings
        }, { isBackgroundSync });

        if (result.success) {
            currentUser.theme_settings = newThemeSettings;
            originalThemeSettings = { ...newThemeSettings };

            localStorage.removeItem('userThemeSettingsUpdatedAt');
            backupImportantSettings().catch(error => {
                console.error('Failed to backup settings after save:', error);
            });
        } else {
            throw new Error(result.error || getToastMessage('errors.saveSettingsFailed'));
        }
    } catch (error) {
        // 后台同步失败时静默处理
        if (isBackgroundSync) {
            console.warn('Background theme sync failed, will retry later:', error);
        } else {
            console.error('Theme save failed, will retry on next launch:', error);
        }
    }
}

let isClearingCache = false;
async function forceClearCacheAndReload() {
    try {
        if (isClearingCache) {
            return;
        }
        isClearingCache = true;
        const confirmed = await showCustomConfirm(
            getToastMessage('dialog.confirmOperation'),
            getToastMessage('dialog.clearCacheConfirmMessage'),
            ICONS.HELP,
            { manageHistory: false }
        );

        if (!confirmed) {
            isClearingCache = false;
            return;
        }
        try {
            const btn = document.getElementById('clear-cache-btn');
            if (btn) {
                btn.style.pointerEvents = 'none';
                btn.style.opacity = '0.6';
            }
        } catch (_) { }

        const toastCtrl = showToast(getToastMessage('toast.clearingCache'), 'info');

        try {
            localStorage.setItem('clearCacheCooldownUntil', String(Date.now() + 6000));
        } catch (_) { }

        await Promise.all([
            clearCachesAndSettings(['cdn-fonts-cache']),
            (async () => { try { await clearTranslationCache(); } catch (_) { } })()
        ]);

        const keysToKeep = [
            'sessionId',
            'seenPrivacyPolicyVersion',
            'userThemePreset',
            'userThemeSettings',
            'userThemeSettingsUpdatedAt',
            'guestThemeSettings',
            'selectedLanguage'
        ];

        Object.keys(localStorage).forEach(key => {
            if (!keysToKeep.includes(key) && !key.startsWith('user_cache_')) {
                localStorage.removeItem(key);
            }
        });

        chats = {};
        currentChatId = null;

        const currentLang = localStorage.getItem('selectedLanguage');
        if (currentLang) {
            localStorage.setItem('forceReloadLanguage', 'true');
        }

        // 登录用户：清空本地聊天缓存并强制下次从服务器拉取
        if (currentUser?.id) {
            try {
                await deleteChatsFromDB(currentUser.id);
            } catch (err) {
                console.warn('Failed to delete cached chats during cache clear:', err);
            }
            try {
                localStorage.setItem('forceServerChatsReload', '1');
            } catch (_) { }
        }

        try {
            await toastCtrl.whenShown;
        } catch (_) { }
        await new Promise(r => setTimeout(r, 300));
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('_', Date.now().toString());
            window.location.replace(url.toString());
        } catch (_) {
            try { location.reload(true); } catch (_) { location.reload(); }
        }

    } catch (error) {
        console.error(`${getToastMessage('console.clearCacheFailed')}:`, error);
        showToast(getToastMessage('toast.cacheClearError'), 'error');
        isClearingCache = false;
    }
}

async function processFilesArray(files) {
    if (!files || files.length === 0) return;

    filesCurrentlyProcessing += files.length;
    updateSendButton();

    const processingPromises = files.map(file =>
        processAndAttachFile(file).catch(error => {
            console.log(`${getToastMessage('console.skipFile', { filename: file.name })}: ${error.message}`);
        }).finally(() => {
            filesCurrentlyProcessing--;
        })
    );

    await Promise.all(processingPromises);

    updateSendButton();
    resetCharCountTimer();
}

async function handlePickedFiles(pickedFiles) {
    if (!pickedFiles || pickedFiles.length === 0) return;

    const files = [];
    for (const pf of pickedFiles) {
        try {
            // Web 端
            if (pf.blob instanceof Blob) {
                files.push(new File([pf.blob], pf.name, { type: pf.mimeType || pf.blob.type }));
                continue;
            }

            if (pf.data) {
                const blob = base64ToBlob(pf.data, pf.mimeType);
                files.push(new File([blob], pf.name, { type: pf.mimeType || blob.type }));
                continue;
            }

            const candidatePath = pf.path || pf.webPath;
            if (candidatePath) {
                try {
                    const res = await Filesystem.readFile({ path: candidatePath });
                    const blob = base64ToBlob(res.data, pf.mimeType);
                    files.push(new File([blob], pf.name, { type: pf.mimeType || blob.type }));
                    continue;
                } catch (readErr) {
                    console.warn('Filesystem.readFile fallback failed:', readErr);
                }
            }

            if (pf.webPath) {
                try {
                    const response = await fetch(pf.webPath);
                    const blob = await response.blob();
                    files.push(new File([blob], pf.name, { type: pf.mimeType || blob.type }));
                    continue;
                } catch (fetchErr) {
                    console.warn('Fetch webPath fallback failed:', fetchErr);
                }
            }

            throw new Error('Can not read file content');
        } catch (err) {
            showToast(`${getToastMessage('console.skipFile', { filename: pf.name })}: ${err.message || err}`, 'info');
        }
    }

    if (files.length > 0) {
        await processFilesArray(files);
    }
}

function setupEventListeners() {
    const isTouchDevice = 'ontouchstart' in window;

    if (isNativeApp) {
        App.addListener('appStateChange', async ({ isActive }) => {
            if (!isActive) {
                isPageVisible = false;

                // 应用后台化时保存所有待同步数据
                try {
                    const syncTasks = [];

                    if (currentUser && localStorage.getItem('userThemeSettingsUpdatedAt')) {
                        syncTasks.push(
                            savePresetAndFont('preset', true).catch(err =>
                                console.error('Background theme sync failed:', err)
                            )
                        );
                    }

                    if (currentChatId && chats[currentChatId]) {
                        const userId = currentUser?.id || 'guest';
                        syncTasks.push(
                            saveChatsToDB(userId, chats).catch(err =>
                                console.error('Background chat sync failed:', err)
                            )
                        );
                    }

                    syncTasks.push(
                        backupImportantSettings().catch(err =>
                            console.error('Background settings backup failed:', err)
                        )
                    );

                    if (syncTasks.length > 0) {
                        await Promise.race([
                            Promise.allSettled(syncTasks),
                            new Promise(r => setTimeout(r, 3000))
                        ]);
                    }
                } catch (error) {
                    console.error('Background sync error:', error);
                }

                if (isProcessing && !backgroundNotificationShown) {
                    try {
                        const hasPermission = await LocalNotifications.checkPermissions();
                        if (hasPermission.display === 'granted') {
                            await LocalNotifications.schedule({
                                notifications: [{
                                    title: getToastMessage('notification.aiResponding'),
                                    body: getToastMessage('notification.aiRespondingInBackground'),
                                    id: 999,
                                    schedule: { at: new Date(Date.now() + 100) },
                                    sound: null,
                                    attachments: null,
                                    actionTypeId: '',
                                    extra: null
                                }]
                            });
                            backgroundNotificationShown = true;
                        }
                    } catch (error) {
                        console.error('Failed to show background notification:', error);
                    }
                }
            } else {
                isPageVisible = true;
                backgroundNotificationShown = false;

                if (isProcessing && globalContentDiv) {
                    try {
                        if (globalBackgroundBuffer) {
                            globalDisplayBuffer += globalBackgroundBuffer;
                            globalBackgroundBuffer = '';
                        }

                        if (globalCharQueue.length > 0) {
                            const remainingChars = globalCharQueue.splice(0, globalCharQueue.length).join('');
                            globalDisplayBuffer += remainingChars;
                        }

                        renderMessageContent(globalContentDiv, globalDisplayBuffer);

                        if (!userHasScrolledUp) {
                            setTimeout(() => {
                                elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
                            }, 10);
                        }
                    } catch (error) {
                        console.error('App state change render error:', error);
                    }
                }
            }
        });

        LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
            if (notification.notification.extra?.apkVersion) {
                Browser.open({ url: 'https://littleaibox.com/download-app' });
            }
        });
    }

    elements.chatContainer.addEventListener('scroll', () => {
        if (!isProcessing) {
            userHasScrolledUp = false;
            return;
        }

        const scrollHeight = elements.chatContainer.scrollHeight;
        const clientHeight = elements.chatContainer.clientHeight;
        const scrollTop = elements.chatContainer.scrollTop;
        const isAtBottom = scrollHeight - clientHeight <= scrollTop + 10;
        if (!isAtBottom) {
            userHasScrolledUp = true;
        } else {
            userHasScrolledUp = false;
        }
    });


    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            const tabType = this.dataset.tab === 'register' ? 'register' : 'login';
            const authTabs = document.getElementById('auth-tabs');
            const authFormsContainer = document.getElementById('auth-forms-container');
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            if (tabType === 'register') {
                authTabs?.classList.add('show-register');
                authFormsContainer?.classList.add('show-register');
            } else {
                authTabs?.classList.remove('show-register');
                authFormsContainer?.classList.remove('show-register');
            }
            const routeOptions = pendingAuthRouteOptions;
            pendingAuthRouteOptions = null;
            if (suppressAuthRouteSync) {
                suppressAuthRouteSync = false;
                return;
            }
            routeManager.syncAuthRoute(tabType, routeOptions || { replace: true });
            persistAuthRoute({ mode: tabType });
        });
    });

    elements.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const submitBtn = elements.loginForm.querySelector('.auth-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = getToastMessage('status.loggingIn');
        try {
            await login(email, password);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = getToastMessage('status.login');
        }
    });

    if (elements.mfaForm) {
        elements.mfaForm.addEventListener('submit', handleMfaVerificationSubmit);
    }
    elements.mfaBackButton?.addEventListener('click', cancelMfaVerificationFlow);
    elements.mfaMethodButtons?.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            setActiveMfaMethod(btn.dataset.mfaMethod);
        });
    });

    elements.registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isWaitingVerification) return;

        if (isProcessing) {
            const confirmed = await showCustomConfirm(
                getToastMessage('dialog.confirmLeave'),
                getToastMessage('dialog.aiGeneratingResponseWarning'),
                ICONS.HELP,
                { manageHistory: false }
            );
            if (!confirmed) {
                return;
            }
            stopGeneration();
        }

        const email = document.getElementById('register-email').value;
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;
        if (password.length < 6) {
            showToast(getToastMessage('toast.passwordMinLengthRequired'), 'error');
            return;
        }
        if (password !== confirmPassword) {
            showToast(getToastMessage('toast.passwordsDoNotMatch'), 'error');
            return;
        }
        isWaitingVerification = true;
        const submitBtn = document.querySelector('#register-form .auth-submit');
        submitBtn.disabled = true;
        const timeoutId = setTimeout(() => {
            if (isWaitingVerification) {
                isWaitingVerification = false;
                submitBtn.disabled = false;
                showToast(getToastMessage('toast.registrationTimeout'), 'error');
            }
        }, 60000);
        try {
            const result = await makeAuthRequest('register', { email, password, username });
            clearTimeout(timeoutId);
            if (result.needVerification) {
                currentVerificationEmail = email;
                const emailDisplay = document.getElementById('verify-email-display');
                if (emailDisplay) {
                    emailDisplay.textContent = email;
                }
                switchToVerificationForm();
                routeManager.syncAuthRoute({ mode: 'verify' }, { replace: true });
                persistAuthRoute({ mode: 'verify' });
                showToast(getToastMessage('toast.verificationCodeSent'), 'success');
            }
        } catch (error) {
            clearTimeout(timeoutId);
            showToast(error.message, 'error');
            isWaitingVerification = false;
            submitBtn.disabled = false;
        }
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        document.body.classList.add('is-resizing');
        clearTimeout(resizeTimer);

        resizeTimer = setTimeout(() => {
            document.body.classList.remove('is-resizing');
            const chatContainer = elements.chatContainer;

            const scrollHeight = chatContainer.scrollHeight;
            const clientHeight = chatContainer.clientHeight;
            const scrollTop = chatContainer.scrollTop;
            const isNearBottom = scrollHeight - clientHeight - scrollTop < 100;

            if (isNearBottom) {
                chatContainer.scrollTo({ top: scrollHeight, behavior: 'smooth' });
            }

        }, 250);

        if (window.innerWidth > 640) {
            document.body.classList.remove('sidebar-open');
        }
        const settingsNav = document.querySelector('.settings-nav.open');
        if (settingsNav) {
            closeSettingsNav();
        }
    });

    elements.guestContinue.addEventListener('click', () => {
        const isFirstLaunchAuth = authOverlayReason !== 'user';
        hideAuthOverlay();
        const noActiveChat = !currentChatId || !chats[currentChatId] || (chats[currentChatId].messages?.length || 0) === 0;
        if (isFirstLaunchAuth && noActiveChat) {
            try { showEmptyState(); } catch (_) { }
        }
    });

    document.getElementById('user-avatar-button').addEventListener('click', () => {
        if (currentUser) {
            updateUsageDisplay();
            elements.userInfoPopover.classList.toggle('visible');
        }
    });

    if (elements.customLoginBtn) {
        elements.customLoginBtn.addEventListener('click', () => openAuthOverlay('user', { mode: 'login' }, { syncRoute: true }));
    }

    document.getElementById('verify-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('verify-code').value;
        try {
            await makeAuthRequest('verify-email', { email: currentVerificationEmail, code });
            showToast(getToastMessage('toast.registrationSuccess'), 'success');

            // 获取注册时使用的密码，如果无法获取则提示用户重新登录
            const registerPasswordField = document.getElementById('register-password');
            if (!registerPasswordField || !registerPasswordField.value) {
                showToast(getToastMessage('toast.pleaseLoginManually'), 'info');
                switchToLoginForm();
                return;
            }

            const loginResult = await makeAuthRequest('login', { email: currentVerificationEmail, password: registerPasswordField.value });
            if (loginResult.success) {
                await applyAuthenticatedSession(loginResult, { showSuccessToast: false });
                notifyBackendCacheInvalidation('user_registered', { userId: currentUser.id, email: currentVerificationEmail });
            }
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    document.getElementById('resend-code-btn').addEventListener('click', async () => {
        try {
            // 获取注册表单中的密码和用户名
            const registerPasswordField = document.getElementById('register-password');
            const registerUsernameField = document.getElementById('register-username');

            if (!registerPasswordField || !registerPasswordField.value) {
                showToast(getToastMessage('toast.cannotResendCode'), 'error');
                return;
            }

            await makeAuthRequest('register', {
                email: currentVerificationEmail,
                password: registerPasswordField.value,
                username: registerUsernameField ? registerUsernameField.value : null
            });
            showToast(getToastMessage('toast.verificationCodeResent'), 'success');
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    document.getElementById('forgot-password-btn').addEventListener('click', () => {
        openAuthOverlay('auto', { mode: 'reset-request' }, { syncRoute: true, routeOptions: { replace: true } });
    });

    document.getElementById('forgot-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value;
        try {
            await makeAuthRequest('request-password-reset', { email });
            showToast(getToastMessage('toast.resetLinkSent'), 'success');
            setTimeout(() => switchToLoginForm(), 2000);
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    document.getElementById('back-to-login-btn').addEventListener('click', () => {
        routeManager.resetAuthMode();
        openAuthOverlay('auto', { mode: 'login' }, { syncRoute: true, routeOptions: { replace: true } });
    });

    document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-new-password').value;
        if (newPassword !== confirmPassword) {
            showToast(getToastMessage('toast.passwordsDoNotMatch'), 'error');
            return;
        }
        try {
            await makeAuthRequest('reset-password', { token: resetToken, newPassword });
            showToast(getToastMessage('toast.passwordResetSuccess'), 'success');
            setTimeout(() => switchToLoginForm(), 2000);
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const overlay = document.getElementById('sidebar-overlay');

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.body.classList.contains('sidebar-open')) {
                closeSidebar();
            }
        });
    }

    sidebarToggleBtn.addEventListener('click', (e) => {
        if (elements.settingsModal && elements.settingsModal.classList.contains('visible')) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const isMobile = window.matchMedia('(max-width: 640px)').matches;
        if (isMobile) {
            if (document.body.classList.contains('sidebar-open')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        } else {
            const isOpening = !document.body.classList.contains('sidebar-collapsed');
            document.body.classList.toggle('sidebar-collapsed');
            sidebarToggleBtn.setAttribute('aria-expanded', String(isOpening));
        }
    });

    // 右侧抽屉切换按钮的事件监听器
    if (elements.rightSidebarToggleBtn) {
        elements.rightSidebarToggleBtn.addEventListener('click', async () => {
            if (isMultiSelectMode) {
                exitMultiSelectMode(false);
            }
            const isOpening = !document.body.classList.contains('right-sidebar-open');

            if (isOpening) {
                requestAnimationFrame(() => {
                    if (elements.fileViewerOverlay.classList.contains('visible')) {
                        hideFileViewerUI();
                    }
                });
            }

            document.body.classList.toggle('right-sidebar-open');
            elements.rightSidebarToggleBtn.setAttribute('aria-expanded', String(isOpening));


            if (isOpening && currentUser) {
                // 保存当前参数快照
                originalAIParameters = {
                    systemPrompt: aiParameters.systemPrompt,
                    temperature: aiParameters.temperature,
                    topK: aiParameters.topK,
                    topP: aiParameters.topP,
                    taskPreset: aiParameters.taskPreset
                };

                if (!hasParametersLoaded && !isLoadingParameters) {
                    showParameterLoadingState();
                    await loadUserAIParameters();
                } else if (isLoadingParameters) {
                    showParameterLoadingState();
                } else {
                    hideParameterLoadingState();
                    updateAIParameterUI();
                }
            }
        });
    }

    elements.newChatBtn.addEventListener('click', async () => {
        if (elements.settingsModal && elements.settingsModal.classList.contains('visible')) {
            return;
        }
        if (isMultiSelectMode) {
            exitMultiSelectMode();
        }

        if (isProcessing) {
            const confirmed = await showCustomConfirm(
                getToastMessage('dialog.confirmLeave'),
                getToastMessage('dialog.aiGeneratingResponseWarning'),
                ICONS.HELP,
                { manageHistory: false }
            );
            if (!confirmed) {
                return;
            }
            stopGeneration();
        }

        startNewChat(true);
    });

    document.getElementById('cancel-multi-select-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        exitMultiSelectMode();
        resetBackPressExitState();
    });

    const deleteAllBtn = document.getElementById('delete-all-chats-btn');
    const newDeleteAllBtn = deleteAllBtn.cloneNode(true);
    deleteAllBtn.parentNode.replaceChild(newDeleteAllBtn, deleteAllBtn);

    const handleDeleteClick = async () => {
        if (isMultiSelectMode) {
            if (selectedChatIds.size === 0) {
                showToast(getToastMessage('toast.pleaseSelectRecords'), 'info');
                return;
            }

            const confirmed = await showCustomConfirm(
                getToastMessage('dialog.deleteConfirmation'),
                getToastMessage('dialog.deleteSelectedChats', { count: selectedChatIds.size }),
                ICONS.DELETE
            );
            if (!confirmed) {
                return;
            }

            const idsToDelete = [...selectedChatIds];
            const currentChatWasDeleted = idsToDelete.includes(currentChatId);
            const previousCurrentChatId = currentChatId;
            const previousWelcomePageShown = welcomePageShown;
            const deletedChatsBackup = new Map();
            const pendingChatBackup = new Map();

            idsToDelete.forEach(id => {
                if (chats[id]) {
                    deletedChatsBackup.set(id, chats[id]);
                }
                const pendingKey = `pending_chat_${id}`;
                const pendingValue = localStorage.getItem(pendingKey);
                if (pendingValue !== null) {
                    pendingChatBackup.set(id, pendingValue);
                }
                delete chats[id];
                localStorage.removeItem(pendingKey);
                if (activeResponses.has(id)) {
                    activeResponses.get(id).controller.abort();
                    activeResponses.delete(id);
                }
            });

            scheduleRenderSidebar();

            if (currentChatWasDeleted) {
                currentChatId = null;
                welcomePageShown = false;
                showEmptyState();
                routeManager.navigateToHome({ replace: true });
            }

            let deletionFailed = false;
            let failureReason = null;

            if (currentUser) {
                const deletionResults = await Promise.allSettled(
                    idsToDelete.map(id => makeApiRequest(`chats/${id}`, { method: 'DELETE' }))
                );
                const failedResults = deletionResults.filter(result => result.status === 'rejected');
                if (failedResults.length > 0) {
                    deletionFailed = true;
                    failureReason = failedResults[0].reason;
                } else {
                    try {
                        await saveChatsToDB(currentUser.id, chats);
                    } catch (dbError) {
                        deletionFailed = true;
                        failureReason = dbError;
                    }
                }
            } else {
                try {
                    await saveChatsToDB('guest', chats);
                } catch (dbError) {
                    deletionFailed = true;
                    failureReason = dbError;
                }
            }

            if (deletionFailed) {
                for (const [id, chatData] of deletedChatsBackup.entries()) {
                    chats[id] = chatData;
                }
                for (const [id, pendingValue] of pendingChatBackup.entries()) {
                    localStorage.setItem(`pending_chat_${id}`, pendingValue);
                }
                if (currentChatWasDeleted) {
                    currentChatId = previousCurrentChatId;
                    welcomePageShown = previousWelcomePageShown;
                    if (currentChatId && chats[currentChatId]) {
                        await loadChat(currentChatId);
                    } else {
                        showEmptyState();
                    }
                }
                scheduleRenderSidebar();
                try {
                    if (currentUser) {
                        await saveChatsToDB(currentUser.id, chats);
                    } else {
                        await saveChatsToDB('guest', chats);
                    }
                } catch (_) { }
                const deleteSelectedBtn = document.getElementById('delete-selected-btn');
                if (deleteSelectedBtn) {
                    deleteSelectedBtn.textContent = `${getToastMessage('ui.deleteSelected')} (${selectedChatIds.size})`;
                }
                showToast(getToastMessage('toast.multiDeleteFailed'), 'error');
                return;
            }

            showToast(getToastMessage('toast.selectedRecordsDeleted'), 'success');
            exitMultiSelectMode();
            return;
        } else {
            const chatIdsToDelete = Object.keys(chats);
            if (chatIdsToDelete.length === 0) {
                showToast(getToastMessage('toast.noRecordsToDelete'), 'info');
                return;
            }
            const confirmed = await showCustomConfirm(getToastMessage('dialog.deleteAllConversations'), getToastMessage('dialog.deleteAllChatsConfirm'), ICONS.DELETE, { manageHistory: false });
            if (confirmed) {
                welcomePageShown = false;

                if (!currentUser) {
                    const previousChats = { ...chats };
                    const previousCurrentChatId = currentChatId;
                    const previousWelcomePageShown = welcomePageShown;

                    chats = {};
                    currentChatId = null;
                    showEmptyState();
                    scheduleRenderSidebar();
                    closeSidebarOnInteraction();
                    routeManager.navigateToHome({ replace: true });
                    try {
                        await deleteChatsFromDB('guest');
                        showToast(getToastMessage('toast.allRecordsDeleted'), 'success');
                        notifyBackendCacheInvalidation('guest_all_chats_deleted', { deletedCount: Object.keys(chats).length });
                    } catch (error) {
                        chats = previousChats;
                        currentChatId = previousCurrentChatId;
                        welcomePageShown = previousWelcomePageShown;
                        scheduleRenderSidebar();
                        if (currentChatId && chats[currentChatId]) {
                            await loadChat(currentChatId);
                        } else {
                            showEmptyState();
                        }
                        console.warn('Delete all (guest) failed:', error);
                        showToast(getToastMessage('toast.deleteAllFailed'), 'error');
                        try {
                            await saveChatsToDB('guest', chats);
                        } catch (_) { }
                    }
                    return;
                }

                const idsToDelete = Object.keys(chats);
                const previousChats = { ...chats };
                const previousCurrentChatId = currentChatId;
                const previousWelcomePageShown = welcomePageShown;

                chats = {};
                currentChatId = null;
                showEmptyState();
                scheduleRenderSidebar();
                closeSidebarOnInteraction();
                routeManager.navigateToHome({ replace: true });
                showToast(getToastMessage('toast.deletingInBackground', { count: idsToDelete.length }), 'info');

                const deletionResults = await Promise.allSettled(
                    idsToDelete.map(id => makeApiRequest(`chats/${id}`, { method: 'DELETE' }))
                );
                const failedResults = deletionResults.filter(result => result.status === 'rejected');

                let deletionFailed = failedResults.length > 0;
                let failureReason = failedResults[0]?.reason || null;

                if (!deletionFailed) {
                    try {
                        await saveChatsToDB(currentUser.id, chats);
                    } catch (dbError) {
                        deletionFailed = true;
                        failureReason = dbError;
                    }
                }

                if (deletionFailed) {
                    chats = previousChats;
                    currentChatId = previousCurrentChatId;
                    welcomePageShown = previousWelcomePageShown;
                    scheduleRenderSidebar();
                    if (currentChatId && chats[currentChatId]) {
                        await loadChat(currentChatId);
                    } else {
                        showEmptyState();
                    }
                    if (failureReason) {
                        console.warn('Delete all failed:', failureReason);
                    }
                    try {
                        await saveChatsToDB(currentUser.id, chats);
                    } catch (_) { }
                    showToast(getToastMessage('toast.deleteAllFailed'), 'error');
                    return;
                }

                showToast(getToastMessage('toast.allRecordsDeletedSuccess'), 'success');
                notifyBackendCacheInvalidation('all_chats_deleted', { userId: currentUser.id, deletedCount: idsToDelete.length });
            }
        }
    };

    newDeleteAllBtn.addEventListener('click', handleDeleteClick);
    document.getElementById('delete-selected-btn').addEventListener('click', handleDeleteClick);

    const inputWrapper = document.querySelector('.input-wrapper');
    const modelSelectMenu = document.getElementById('model-select-menu');
    const uploadMenu = document.getElementById('upload-menu');
    const messageInput = document.getElementById('message-input');

    const preventKeyboardClose = (e) => {
        const isKeyboardOpen = document.body.classList.contains('keyboard-is-open')
            || document.activeElement === messageInput;

        if (!isKeyboardOpen) {
            return;
        }

        const interactiveElement = e.target.closest(`
            button, 
            .model-select-item, 
            .upload-menu-item,
            .tools-menu-item
        `);

        if (interactiveElement && e.target.id !== 'message-input') {
            e.preventDefault();
        }
    };

    if (inputWrapper) {
        inputWrapper.addEventListener('mousedown', preventKeyboardClose);
    }
    if (modelSelectMenu) {
        modelSelectMenu.addEventListener('mousedown', preventKeyboardClose);
    }
    if (uploadMenu) {
        uploadMenu.addEventListener('mousedown', preventKeyboardClose);
    }
    if (elements.toolsMenu) {
        elements.toolsMenu.addEventListener('mousedown', preventKeyboardClose);
    }

    elements.toolsMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const modelSelectMenu = document.getElementById('model-select-menu');
        const uploadMenu = document.getElementById('upload-menu');
        if (modelSelectMenu) modelSelectMenu.classList.remove('visible');
        if (uploadMenu) uploadMenu.classList.remove('visible');

        elements.toolsMenu.classList.toggle('visible');
    });

    elements.toolSearchOption.addEventListener('click', (e) => {
        e.stopPropagation();

        const wasActive = isSearchModeActive;
        isSearchModeActive = !isSearchModeActive;

        updateSearchModeUI();
        showToast(isSearchModeActive ? getToastMessage('toast.searchModeOn') : getToastMessage('toast.searchModeOff'), 'info');

        elements.toolsMenu.classList.remove('visible');

        const isKeyboardOpen = document.body.classList.contains('keyboard-is-open')
            || document.activeElement === elements.messageInput;

        if (wasActive && !isKeyboardOpen) {
            elements.messageInput.blur();
        }
    });

    elements.toolImageOption.addEventListener('click', (e) => {
        e.stopPropagation();

        const wasActive = isImageModeActive;
        isImageModeActive = !isImageModeActive;

        updateImageModeUI();
        showToast(isImageModeActive ? getToastMessage('toast.imageModeOn') : getToastMessage('toast.imageModeOff'), 'info');

        elements.toolsMenu.classList.remove('visible');

        const isKeyboardOpen = document.body.classList.contains('keyboard-is-open')
            || document.activeElement === elements.messageInput;

        if (wasActive && !isKeyboardOpen) {
            elements.messageInput.blur();
        }
    });

    elements.toolResearchOption.addEventListener('click', (e) => {
        e.stopPropagation();

        const wasActive = isResearchModeActive;
        isResearchModeActive = !isResearchModeActive;

        updateResearchModeUI();
        showToast(isResearchModeActive ? getToastMessage('toast.researchModeOn') : getToastMessage('toast.researchModeOff'), 'info');

        elements.toolsMenu.classList.remove('visible');

        const isKeyboardOpen = document.body.classList.contains('keyboard-is-open')
            || document.activeElement === elements.messageInput;

        if (wasActive && !isKeyboardOpen) {
            elements.messageInput.blur();
        }
    });

    elements.sendButton.addEventListener('click', sendMessage);

    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!elements.sendButton.disabled) sendMessage();
        }
    });
    const debouncedInputHandler = debounce(() => {
        const { isOverLimit } = updateCharacterCountUI();

        if (isOverLimit) {
            let charsFromFiles = 0;
            attachments.forEach(att => {
                if (att.type === 'file' && typeof att.content === 'string') {
                    charsFromFiles += att.content.length;
                }
            });

            const allowedTextLength = Math.max(0, CHARACTER_LIMIT - charsFromFiles);
            if (elements.messageInput.value.length > allowedTextLength) {
                elements.messageInput.value = elements.messageInput.value.substring(0, allowedTextLength);
                // 触发input事件以调整输入框高度
                elements.messageInput.dispatchEvent(new Event('input'));
                showToast(getToastMessage('toast.characterLimitReached'), 'warning');
                updateCharacterCountUI();
            }
        }
        resetCharCountTimer();
    }, 250);

    elements.messageInput.addEventListener('input', () => {
        elements.messageInput.style.height = 'auto';
        const scrollHeight = elements.messageInput.scrollHeight;
        const newHeight = Math.min(scrollHeight, 200);
        elements.messageInput.style.height = newHeight + 'px';

        updateSendButton();
        debouncedInputHandler();
    });

    elements.messageInput.addEventListener('paste', handlePaste);

    elements.voiceBtn.addEventListener('click', () => {
        if (!recognition) {
            showToast(getToastMessage('toast.voiceRecognitionNotSupported'), 'error');
            return;
        }

        if (isRecording) {
            recognition.stop();
            cleanupRecognition();
            return;
        }

        try {
            originalPlaceholder = elements.messageInput.placeholder;

            isRecording = true;
            elements.voiceBtn.classList.add('recording');
            elements.messageInput.classList.add('recording');
            elements.messageInput.placeholder = getToastMessage('ui.listening');

            recognition.start();

            noSpeechTimeout = setTimeout(() => {
                if (isRecording) {
                    recognition.stop();
                    cleanupRecognition();
                }
            }, 3000);

        } catch (error) {
            console.error(`${getToastMessage('console.startVoiceRecognitionFailed')}:`, error);
            showToast(getToastMessage('toast.voiceRecognitionStartFailed'), 'error');
            cleanupRecognition();
        }
    });

    document.getElementById('add-file-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const uploadMenu = document.getElementById('upload-menu');
        const willOpen = !uploadMenu.classList.contains('visible');

        uploadMenu.classList.toggle('visible');
    });

    document.getElementById('upload-image-btn').addEventListener('click', async () => {
        dismissKeyboard();
        document.getElementById('upload-menu').classList.remove('visible');

        if (isNativeApp) {
            const choice = await showImageSourceChoice(); // 1. 弹出我们自己的菜单
            let source;

            if (choice === 'camera') {
                source = CameraSource.Camera;
            } else if (choice === 'photos') {
                source = CameraSource.Photos;
            } else {
                return;
            }

            try {
                const image = await Camera.getPhoto({
                    quality: 90,
                    allowEditing: false,
                    resultType: CameraResultType.DataUrl,
                    source: source,
                });

                if (image.dataUrl) {
                    const response = await fetch(image.dataUrl);
                    const blob = await response.blob();

                    // 提前检测文件大小
                    const isGuest = !currentUser;
                    const maxSize = isGuest ? GUEST_FILE_SIZE_LIMIT : LOGGED_IN_FILE_SIZE_LIMIT;
                    const limitInMB = (maxSize / (1024 * 1024)).toFixed(1);

                    if (blob.size > maxSize) {
                        const userType = isGuest ? getToastMessage('ui.guest') : getToastMessage('ui.you');
                        showToast(getToastMessage('toast.fileTooLarge', { filename: getToastMessage('ui.image'), userType: userType, limit: limitInMB }), 'error');
                        return;
                    }

                    const fileName = `image_${Date.now()}.${image.format || 'jpg'}`;
                    const file = new File([blob], fileName, { type: `image/${image.format || 'jpeg'}` });

                    filesCurrentlyProcessing++;
                    updateSendButton();
                    try {
                        await processAndAttachFile(file);
                    } finally {
                        filesCurrentlyProcessing--;
                        updateSendButton();
                    }
                }
            } catch (error) {
                console.log(`${getToastMessage('console.imageSelectionCancelled')}:`, error);
            }

        } else {
            elements.fileInput.accept = "image/*";
            elements.fileInput.click();
        }
    });
    document.getElementById('upload-code-btn').addEventListener('click', async () => {
        document.getElementById('upload-menu').classList.remove('visible');

        if (isNativeApp) {
            try {
                const result = await FilePicker.pickFiles({
                    types: ['text/plain', 'text/markdown', 'application/javascript', 'text/css', 'text/html', 'application/json', 'application/xml', 'public.source-code'], // 尝试指定代码类型
                    multiple: true,
                    // 原生端需要主动读取文件数据，否则不会返回 blob
                    readFile: true
                });

                handlePickedFiles(result.files);

            } catch (error) {
                console.log(`${getToastMessage('console.nativeFileSelectorCodeCancelled')}:`, error);
            }
        } else {
            elements.fileInput.accept = ".js,.ts,.jsx,.tsx,.py,.java,.cpp,.c,.h,.cs,.php,.rb,.go,.rs,.swift,.kt,.scala,.dart,.r,.m,.sh,.bat,.ps1,.css,.html,.xml,.json,.yaml,.yml,.sql,.md,.txt";
            elements.fileInput.click();
        }
    });

    document.getElementById('upload-file-btn').addEventListener('click', async () => {
        document.getElementById('upload-menu').classList.remove('visible');

        if (isNativeApp) {
            try {
                const result = await FilePicker.pickFiles({
                    multiple: true,
                    // 原生端需要主动读取文件数据，否则不会返回 blob
                    readFile: true
                });

                handlePickedFiles(result.files);

            } catch (error) {
                console.log(`${getToastMessage('console.nativeFileSelectorGeneralCancelled')}:`, error);
            }
        } else {
            elements.fileInput.accept = "*";
            elements.fileInput.click();
        }
    });

    elements.fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        await processFilesArray(files);
        e.target.value = '';
    });

    elements.chatHistoryList.addEventListener('click', async (e) => {
        // 设置模态打开时，不响应侧边栏的聊天项点击
        if (elements.settingsModal && elements.settingsModal.classList.contains('visible')) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        const target = e.target;
        const historyItem = target.closest('.history-item');
        if (!historyItem) return;

        const chatId = historyItem.dataset.chatId;
        ensureInlineEditModeClosed();

        if (isMultiSelectMode) {
            const checkbox = historyItem.querySelector('.history-item-checkbox');
            if (!checkbox) return;

            if (target !== checkbox && !target.closest('.history-item-checkbox-container')) {
                checkbox.checked = !checkbox.checked;
            }

            if (checkbox.checked) {
                selectedChatIds.add(chatId);
            } else {
                selectedChatIds.delete(chatId);
            }

            document.getElementById('delete-selected-btn').textContent = `${getToastMessage('ui.deleteSelected')} (${selectedChatIds.size})`;
            return;
        }

        const menuBtn = target.closest('.action-menu-btn');
        if (menuBtn) {
            e.stopPropagation();
            const contextMenu = historyItem.querySelector('.context-menu');
            const willOpen = contextMenu.style.display !== 'block';
            document.querySelectorAll('.context-menu').forEach(m => {
                m.style.display = 'none';
            });

            if (willOpen) {
                contextMenu.style.display = 'block';
                if (window.innerWidth > 640) {
                    contextMenu.onmouseleave = () => {
                        contextMenu.style.display = 'none';
                    };
                    const onMove = (ev) => {
                        if (!contextMenu.contains(ev.target) && !historyItem.contains(ev.target)) {
                            contextMenu.style.display = 'none';
                            document.removeEventListener('mousemove', onMove);
                        }
                    };
                    document.addEventListener('mousemove', onMove);
                }

                safeNavigationCall('pushUiState', {
                    name: `contextMenu-${chatId}`,
                    close: () => {
                        contextMenu.style.display = 'none';
                    }
                });
            }
            return;
        }

        const contextMenuItem = target.closest('.context-menu button');
        if (contextMenuItem) {
            e.stopPropagation();
            const action = contextMenuItem.dataset.action;

            if (action === 'rename') {
                safeNavigationCall('popUiState');
                renameChat(chatId);
            } else if (action === 'copy-title') {
                safeNavigationCall('popUiState');
                const titleToCopy = historyItem.querySelector('.title').textContent;
                navigator.clipboard.writeText(titleToCopy).then(() => {
                    showToast(getToastMessage('toast.titleCopied'), 'success');
                }).catch(err => {
                    showToast(getToastMessage('toast.copyFailed'), 'error');
                });
            } else if (action === 'share') {
                safeNavigationCall('popUiState');
                shareChat(chatId);
            } else if (action === 'multi-select') {
                const contextMenu = historyItem.querySelector('.context-menu');
                if (contextMenu) contextMenu.style.display = 'none';
                safeNavigationCall('removeUiStateByName', `contextMenu-${chatId}`);
                enterMultiSelectMode();
            } else if (action === 'delete') {
                const contextMenu = historyItem.querySelector('.context-menu');
                if (contextMenu) contextMenu.style.display = 'none';
                safeNavigationCall('removeUiStateByName', `contextMenu-${chatId}`);
                deleteChat(chatId, true);
            }
            return;
        }

        if (isProcessing && currentChatId !== chatId) {
            const confirmed = await showCustomConfirm(
                getToastMessage('dialog.confirmLeave'),
                getToastMessage('dialog.aiGeneratingResponseWarning'),
                ICONS.HELP
            );
            if (!confirmed) {
                return;
            }
            // 用户确认放弃，停止当前AI生成
            stopGeneration();
        }

        if (currentChatId !== chatId) {
            if (!await handleLeaveTemporaryChat(true)) {
                return;
            }
            loadChat(chatId);
            const isMobile = window.matchMedia('(max-width: 640px)').matches;
            if (isMobile) {
                closeSidebar();
            }
        } else {
            closeSidebarOnInteraction();
        }
    });

    elements.modelSelectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !elements.modelSelectMenu.classList.contains('visible');

        renderModelMenu();
        elements.modelSelectMenu.classList.toggle('visible');


    });

    document.getElementById('file-viewer-close').addEventListener('click', () => {
        hideFileViewerUI();
    });

    document.getElementById('copy-file-content').addEventListener('click', function () {
        navigator.clipboard.writeText(elements.fileViewerCode.textContent).then(() => {
            showToast(getToastMessage('toast.contentCopied'), 'success');
        });
    });

    // 设置按钮的点击事件
    elements.settingsBtn.addEventListener('click', () => {
        if (isMultiSelectMode) {
            exitMultiSelectMode();
        }

        try {
            const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
            if (window.innerWidth <= 640) {
                closeSidebar();
            } else {
                document.body.classList.add('sidebar-collapsed');
                if (sidebarToggleBtn) sidebarToggleBtn.setAttribute('aria-expanded', 'false');
            }
        } catch (_) { }

        safeNavigationCall('pushUiState', {
            name: 'settingsModal',
            close: async () => {
                return await closeModalAndResetState(handleCloseSettingsModalByPage);
            }
        });

        const currentRoute = router.getCurrentRoute();

        if (currentRoute?.name !== 'settings') {
            if (currentRoute?.name === 'auth') {
                lastSettingsOriginRoute = currentChatId ? {
                    name: String(currentChatId).startsWith('temp_') ? 'tempChat' : 'chat',
                    params: { chatId: currentChatId }
                } : { name: 'home', params: {} };
            } else {
                lastSettingsOriginRoute = currentRoute;
            }
        }

        // 立即显示UI并更新URL
        if (elements.settingsModal) {
            hideAuthOverlay(false, { routeHandled: true, skipHandleBack: true });
            elements.settingsModal.classList.add('visible');
            elements.chatContainer.style.display = 'flex';
            updateLoginButtonVisibility();
            setupSettingsModalUI();
            if (!routeManager.isSettingsSyncSuppressed()) {
                setTimeout(() => {
                    routeManager.syncSettingsRoute(routeManager.getActiveSettingsSection());
                }, 0);
            }
        }
    });

    const guestLoginBtn = document.getElementById('guest-login-prompt-btn');
    if (guestLoginBtn) {
        guestLoginBtn.addEventListener('click', () => {
            hideSettingsModal();
            openAuthOverlay('user', { mode: 'login' }, { syncRoute: true });
        });
    }

    const settingsCloseBtn = document.getElementById('settings-close-btn');
    if (settingsCloseBtn) {
        settingsCloseBtn.addEventListener('click', () => {
            handleCloseSettingsModalByPage();
        });
    }

    const checkUpdateBtn = document.getElementById('check-update-btn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', checkForUpdates);
    }

    const updateNowBtn = document.getElementById('update-now-btn');
    if (updateNowBtn) {
        updateNowBtn.addEventListener('click', performUpdate);
    }

    document.getElementById('api-key-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const isGuestUser = !currentUser;

        const apiKeyOneEl = document.getElementById('api-key-one');
        const apiKeyTwoEl = document.getElementById('api-key-two');
        const apiKeyOne = apiKeyOneEl ? apiKeyOneEl.value.trim() : '';
        const apiKeyTwo = apiKeyTwoEl ? apiKeyTwoEl.value.trim() : '';
        const selectedModeInput = document.querySelector('input[name="api-mode"]:checked');
        const selectedMode = selectedModeInput ? selectedModeInput.value : 'mixed';

        if (apiKeyTwo && !apiKeyOne) {
            showToast(getToastMessage('toast.keyOneRequired'), 'error');
            highlightApiKeyError('api-key-one');
            return;
        }

        const combinedApiKey = [apiKeyOne, apiKeyTwo].filter(Boolean).join(',');
        const originalButtonText = elements.settingsSaveBtn.textContent;
        const currentMode = currentUser ? (currentUser.api_mode || 'mixed') : (guestApiState.mode || 'mixed');

        if (!isGuestUser) {
            if (combinedApiKey === (currentUser.custom_api_key || '') && selectedMode === currentMode) {
                hideSettingsModal();
                return;
            }
        } else {
            const prevKeyOne = (guestApiState.keyOne || '').trim();
            const prevKeyTwo = (guestApiState.keyTwo || '').trim();
            const prevMode = (guestApiState.mode || 'mixed');
            const noGuestChange = (apiKeyOne === prevKeyOne) && (apiKeyTwo === prevKeyTwo) && (selectedMode === prevMode);
            if (noGuestChange) {
                hideSettingsModal();
                return;
            }
        }

        if (combinedApiKey === '') {
            if (isGuestUser) {
                guestApiState.keyOne = '';
                guestApiState.keyTwo = '';
                guestApiState.mode = selectedMode || 'mixed';
                showToast(getToastMessage('toast.apiKeyUpdateSuccess'), 'success');
                try { updateActiveModel(); renderModelMenu(); } catch (_) { }
                guestUsageStats.count = 0;
                guestUsageStats.limit = GUEST_LIMIT;
                guestUsageStats.loaded = false;
                if (elements.usageStats) {
                    elements.usageStats.style.display = 'none';
                }
                updateUsageDisplay();
                try {
                    refreshSettingsI18nTexts();
                } catch (_) { }
                hideSettingsModal();
                forceBlur();
                return;
            } else {
                await updateApiKey('', selectedMode, { suppressToast: true });

                apiKeysChanged = false;
                keyOneTouched = false;
                keyTwoTouched = false;
                try { setOriginalApiKeys(); } catch (_) { }

                try {
                    const kv = document.getElementById('key-validation-modal-overlay');
                    if (kv) kv.remove();
                    pendingKeyValidationStatus = null;
                    keyValidationPrefetched = false;
                } catch (_) { }

                hideSettingsModal();
                forceBlur();
                return;
            }
        }

        elements.settingsSaveBtn.disabled = true;

        clearApiKeyErrorStates();

        try {
            const validationResults = { keyOne: { success: true }, keyTwo: { success: true } };
            const failedKeys = [];

            let keyOneChanged, keyTwoChanged;
            if (isGuestUser) {
                const prevKeyOne = (guestApiState.keyOne || '').trim();
                const prevKeyTwo = (guestApiState.keyTwo || '').trim();
                keyOneChanged = apiKeyOne !== prevKeyOne;
                keyTwoChanged = apiKeyTwo !== prevKeyTwo;
            } else {
                keyOneChanged = apiKeyOne !== (originalApiKeys.keyOne || '');
                keyTwoChanged = apiKeyTwo !== (originalApiKeys.keyTwo || '');
            }

            const willValidateKeyOne = !!(apiKeyOne && keyOneChanged);
            const willValidateKeyTwo = !!(apiKeyTwo && keyTwoChanged);

            if (willValidateKeyOne) {
                elements.settingsSaveBtn.textContent = willValidateKeyTwo
                    ? getToastMessage('toast.verifyingKeyOne')
                    : getToastMessage('status.verifying');
                validationResults.keyOne = await validateApiKey(apiKeyOne);

                if (!validationResults.keyOne.success) {
                    failedKeys.push('KEY_ONE');
                    highlightApiKeyError('api-key-one');
                }
            }

            if (willValidateKeyTwo) {
                if (willValidateKeyOne) {
                    const waitTime = 1200 + Math.random() * 800;
                    const waitStartTime = Date.now();

                    let initialRemaining = Math.ceil((waitTime - (Date.now() - waitStartTime)) / 1000);
                    elements.settingsSaveBtn.textContent = getToastMessage('toast.verifyingKeyTwo') + ` (${initialRemaining}s)`;
                    const waitInterval = setInterval(() => {
                        const elapsed = Date.now() - waitStartTime;
                        const remaining = Math.ceil((waitTime - elapsed) / 1000);
                        if (remaining > 0) {
                            elements.settingsSaveBtn.textContent = getToastMessage('toast.verifyingKeyTwo') + ` (${remaining}s)`;
                        }
                    }, 500);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    clearInterval(waitInterval);
                }

                elements.settingsSaveBtn.textContent = getToastMessage('toast.verifyingKeyTwo');
                validationResults.keyTwo = await validateApiKey(apiKeyTwo);

                if (!validationResults.keyTwo.success) {
                    failedKeys.push('KEY_TWO');
                    highlightApiKeyError('api-key-two');
                }
            }

            if (failedKeys.length > 0) {
                let errorMessage = '';
                if (failedKeys.length === 1) {
                    if (failedKeys[0] === 'KEY_ONE') {
                        errorMessage = getToastMessage('toast.keyOneInvalid');
                    } else if (failedKeys[0] === 'KEY_TWO') {
                        errorMessage = getToastMessage('toast.keyTwoInvalid');
                    }
                } else if (failedKeys.length === 2) {
                    errorMessage = getToastMessage('toast.bothKeysInvalid');
                }
                showToast(errorMessage, 'error');

                keyOneTouched = false;
                keyTwoTouched = false;

                elements.settingsSaveBtn.disabled = false;
                elements.settingsSaveBtn.textContent = originalButtonText;
                return;
            }

            if (isGuestUser) {
                guestApiState.keyOne = apiKeyOne;
                guestApiState.keyTwo = apiKeyTwo;
                guestApiState.mode = selectedMode || 'mixed';
                showToast(getToastMessage('toast.apiKeyUpdateSuccess'), 'success');
                try { updateActiveModel(); renderModelMenu(); } catch (_) { }
            } else {
                await updateApiKey(combinedApiKey, selectedMode);
                if (currentUser) {
                    currentUser.custom_api_key = combinedApiKey || '';
                    currentUser.api_mode = selectedMode;
                }
            }
            hideSettingsModal();
            forceBlur();

            if (!isGuestUser) setOriginalApiKeys();

        } catch (error) {
            showToast(getToastMessage('toast.verificationError'), 'error');
            console.error(`${getToastMessage('console.unexpectedErrorDuringApiKeySaving')}:`, error);
        } finally {
            elements.settingsSaveBtn.disabled = false;
            elements.settingsSaveBtn.textContent = originalButtonText;
        }
    });




    elements.logoutBtn.addEventListener('click', logout);

    const settingsModalEl = document.getElementById('settings-modal');
    const settingsNavItems = settingsModalEl.querySelectorAll('.settings-nav-item');
    const settingsPages = settingsModalEl.querySelectorAll('.settings-page');

    const settingsNavToggleBtn = document.getElementById('settings-nav-toggle-btn');
    const settingsNav = settingsModalEl.querySelector('.settings-nav');
    const settingsNavCloseBtn = document.getElementById('settings-nav-close-btn');
    const settingsNavOverlay = document.getElementById('settings-nav-overlay');

    const openSettingsNav = () => {
        settingsNav.classList.add('open');
        settingsNavOverlay.classList.add('visible');
    };

    const closeSettingsNav = () => {
        settingsNav.classList.remove('open');
        settingsNavOverlay.classList.remove('visible');
    };

    settingsNavToggleBtn.addEventListener('click', openSettingsNav);
    settingsNavCloseBtn.addEventListener('click', closeSettingsNav);
    settingsNavOverlay.addEventListener('click', closeSettingsNav);

    settingsNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = item.dataset.page;

            // 处理隐私协议页面
            if (pageId === 'privacy-policy') {
                handlePrivacyPolicyClick(); // Mark as seen when viewed in settings
            }

            settingsNavItems.forEach(i => i.classList.remove('active'));
            settingsPages.forEach(p => p.classList.remove('active'));

            item.classList.add('active');
            const targetPage = document.getElementById(`${pageId}-settings-page`);
            if (targetPage) {
                targetPage.classList.add('active');
                lastSettingsPage = pageId;

                if (pageId === 'language') {
                    const languageSelector = targetPage.querySelector('.language-selector');
                    if (languageSelector) {
                        const currentLang = currentUser
                            ? (currentUser.language || localStorage.getItem('selectedLanguage') || getCurrentLanguage())
                            : (localStorage.getItem('selectedLanguage') || getCurrentLanguage());
                        languageSelector.querySelectorAll('.language-btn').forEach(btn => {
                            btn.classList.toggle('active', btn.dataset.lang === currentLang);
                        });
                    }
                } else if (pageId === 'about') {
                    updateAboutPageUI();
                    markVersionUpdateAsSeen();
                }

                // 根据当前页是否溢出决定是否显示滚动条
                requestAnimationFrame(() => updateSettingsScrollVisibility());
            }

            if (window.matchMedia('(max-width: 640px)').matches) {
                closeSettingsNav();
            }

            routeManager.syncSettingsRoute(pageId, { replace: true });
        });
    });

    // 初始打开时、窗口尺寸变化时也检查滚动条显示
    const updateSettingsScrollVisibility = () => {
        try {
            const settingsContent = settingsModalEl.querySelector('.settings-content');
            if (!settingsContent) return;
            const activePage = settingsContent.querySelector('.settings-page.active');
            if (!activePage) return;
            const needScroll = activePage.scrollHeight > settingsContent.clientHeight + 1; // +1 容忍精度
            settingsContent.classList.toggle('no-scroll', !needScroll);
        } catch (_) { }
    };

    if (elements.settingsModal && elements.settingsModal.classList.contains('visible')) {
        setTimeout(updateSettingsScrollVisibility, 50);
    }
    window.addEventListener('resize', () => {
        if (elements.settingsModal && elements.settingsModal.classList.contains('visible')) {
            updateSettingsScrollVisibility();
        }
    });

    const donationPageEl = document.getElementById('donation-settings-page');
    if (donationPageEl) {
        donationPageEl.querySelectorAll('img').forEach(img => {
            img.addEventListener('load', () => {
                if (elements.settingsModal && elements.settingsModal.classList.contains('visible')) {
                    updateSettingsScrollVisibility();
                }
            });
        });
    }

    // 语言选择按钮事件处理
    let isLanguageSwitching = false;
    document.addEventListener('click', async (e) => {
        const languageBtn = e.target.closest('.language-btn');
        if (!languageBtn) return;

        const languageSelector = languageBtn.closest('.language-selector');
        if (!languageSelector) return;

        const selectedLang = languageBtn.dataset.lang;
        if (isLanguageSwitching) return;
        isLanguageSwitching = true;

        languageSelector.querySelectorAll('.language-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        languageBtn.classList.add('active');

        // 应用语言设置
        if (typeof applyLanguage === 'function') {
            welcomePageShown = false;

            try {
                await applyLanguage(selectedLang);

                intentAnalyzer.clearKeywordCache();

                // 立即更新语言设置
                if (currentUser) {
                    localStorage.setItem('selectedLanguage', selectedLang);
                    currentUser.language = selectedLang;
                    localStorage.setItem(`user_cache_${sessionId}`, JSON.stringify(sanitizeUserForCache(currentUser)));
                } else {
                    try { sessionStorage.setItem('guest_selectedLanguage', selectedLang); } catch (_) { }
                }
                refreshSettingsI18nTexts();

                // 立即更新欢迎页面和侧边栏
                if (currentChatId === null) {
                    requestAnimationFrame(() => {
                        showEmptyState(false, selectedLang);
                        if (isWelcomePage) {
                            elements.chatContainer.style.overflowY = 'hidden';
                        }
                    });
                }
            } catch (error) {
                console.error('Language switch failed:', error);
            } finally {
                isLanguageSwitching = false;
            }

            // 更新侧边栏菜单文本
            scheduleRenderSidebar();

            await new Promise(resolve => setTimeout(resolve, 100));
            showToast(getToastMessage('toast.languageSettingsSaved'), 'success');

            if (currentUser) {
                // 注册用户
                makeAuthRequest('update-language', { language: selectedLang }).then(() => {
                    notifyBackendCacheInvalidation('language_changed', { language: selectedLang });
                    refreshSettingsI18nTexts();
                }).catch(error => {
                    console.error('Language sync to server failed:', error);
                });
            } else {
                // 访客
                notifyBackendCacheInvalidation('guest_language_updated', { language: selectedLang });
                refreshSettingsI18nTexts();
            }

            if (currentUser) {
                setTimeout(() => {
                    checkPasswordChangeStatus().catch(err => console.error(`${getToastMessage('console.passwordChangeStatusFailed')}:`, err));
                    updateWeeklyReportUIState();
                    updateWeeklyTimer();
                    renderModelMenu();
                }, 100);
            } else {
                setTimeout(() => {
                    renderModelMenu();
                }, 100);
            }
        }
    });

    settingsModalEl.addEventListener('click', (e) => {
        const wrapper = e.target.closest('#avatar-preview-wrapper');
        if (wrapper) {
            document.getElementById('avatar-file-input').click();
        }
    });

    settingsModalEl.addEventListener('change', (e) => {
        if (e.target.id === 'avatar-file-input') {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                showToast(getToastMessage('toast.pleaseSelectImage'), 'error');
                return;
            }
            if (file.size > 4 * 1024 * 1024) {
                showToast(getToastMessage('toast.imageSizeExceeded'), 'error');
                return;
            }

            newAvatarFile = file;
            newAvatarUrl = null;

            const avatarPreview = document.getElementById('avatar-preview');
            const avatarWrapper = document.getElementById('avatar-preview-wrapper');
            const reader = new FileReader();

            reader.onload = (event) => {
                const initialDiv = avatarWrapper.querySelector('.avatar-initial-text');
                if (initialDiv) {
                    initialDiv.remove();
                }

                avatarPreview.src = event.target.result;

                avatarPreview.style.display = 'block';
            };
            reader.readAsDataURL(file);

            e.target.value = '';
        }
    });

    document.getElementById('save-profile-btn').addEventListener('click', async () => {
        const saveButton = document.getElementById('save-profile-btn');
        const newUsername = elements.editUsernameInput.value.trim();

        const avatarChanged = newAvatarFile !== null;
        const usernameChanged = newUsername !== originalUsername;

        if (!avatarChanged && !usernameChanged) {
            hideSettingsModal();
            return;
        }

        const originalButtonText = saveButton.textContent;
        saveButton.disabled = true;
        saveButton.textContent = getToastMessage('status.saving');

        let finalAvatarUrl = originalAvatarUrl;

        try {
            if (avatarChanged) {
                saveButton.textContent = getToastMessage('status.uploadingAvatar');
                finalAvatarUrl = await uploadImage(newAvatarFile);
            }

            saveButton.textContent = getToastMessage('status.updatingInfo');
            const result = await makeAuthRequest('update-profile', {
                username: newUsername || null,
                avatar_url: finalAvatarUrl
            });

            if (result.success) {
                currentUser.username = newUsername;
                currentUser.avatar_url = finalAvatarUrl;

                originalUsername = newUsername;
                originalAvatarUrl = finalAvatarUrl;
                newAvatarFile = null;
                newAvatarUrl = null;

                updateUI();
                showToast(getToastMessage('toast.personalInfoUpdated'), 'success');
                hideSettingsModal();
                forceBlur();

                notifyBackendCacheInvalidation('profile_updated', {
                    username: newUsername,
                    avatarChanged: avatarChanged
                });
            }
        } catch (error) {
            showToast(`${getToastMessage('toast.saveFailed')}: ${error.message}`, 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = originalButtonText;
        }
    });

    document.getElementById('change-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password-setting').value;
        const confirmPassword = document.getElementById('confirm-new-password-setting').value;

        const hasExistingPassword = !!(currentUser?.has_password);

        if (!newPassword || !confirmPassword || (hasExistingPassword && !currentPassword)) {
            showToast(getToastMessage('toast.allPasswordFieldsRequired'), 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast(getToastMessage('toast.newPasswordsDoNotMatch'), 'error');
            return;
        }
        if (newPassword.length < 6) {
            showToast(getToastMessage('toast.passwordTooShort'), 'error');
            return;
        }
        try {
            await makeAuthRequest('change-password', { oldPassword: currentPassword, newPassword: newPassword });
            showToast(getToastMessage('toast.passwordChangedSuccess'), 'success');
            document.getElementById('current-password').value = '';
            document.getElementById('new-password-setting').value = '';
            document.getElementById('confirm-new-password-setting').value = '';
            if (currentUser) {
                currentUser.has_password = true;
                updateCurrentPasswordPlaceholderInput();
            }
            checkPasswordChangeStatus().catch(err => console.error(`${getToastMessage('console.passwordChangeStatusFailed')}:`, err));

            notifyBackendCacheInvalidation('password_changed', {});
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    document.getElementById('limit-close-btn').addEventListener('click', () => {
        elements.limitModalOverlay.classList.remove('visible');
    });
    elements.limitModalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.limitModalOverlay) {
            elements.limitModalOverlay.classList.remove('visible');
        }
    });

    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            handleCloseSettingsModalByPage();
        }
    });

    elements.limitModalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.limitModalOverlay) elements.limitModalOverlay.classList.remove('visible');
    });

    const chatHeader = document.querySelector('.chat-header');
    chatHeader.addEventListener('click', (e) => {
        if (elements.authContainer.contains(e.target)) {
            e.stopPropagation();
            if (currentUser) {
                elements.userInfoPopover.classList.toggle('visible');
            }
        }
    });

    window.addEventListener('click', (e) => {
        if (elements.settingsModal && elements.settingsModal.classList.contains('visible')) {
            return;
        }
        const activeContextMenu = document.querySelector('.context-menu[style*="display: block"]');
        if (activeContextMenu && !activeContextMenu.closest('.history-item').contains(e.target)) {
            if (window.innerWidth <= 640) {
                activeContextMenu.style.display = 'none';
            }
            return;
        }

        const uploadMenu = document.getElementById('upload-menu');
        const addFileBtn = document.getElementById('add-file-btn');

        if (uploadMenu.classList.contains('visible') && !uploadMenu.contains(e.target) && !addFileBtn.contains(e.target)) {
            uploadMenu.classList.remove('visible');
            return;
        }
        if (elements.modelSelectMenu.classList.contains('visible') && !elements.modelSelectMenu.contains(e.target) && !elements.modelSelectBtn.contains(e.target)) {
            elements.modelSelectMenu.classList.remove('visible');
            return;
        }
        if (elements.toolsMenu && elements.toolsMenu.classList.contains('visible') &&
            !elements.toolsMenu.contains(e.target) &&
            !elements.toolsMenuBtn.contains(e.target)) {
            elements.toolsMenu.classList.remove('visible');
            return;
        }
        if (elements.userInfoPopover.classList.contains('visible') && !chatHeader.contains(e.target)) {
            elements.userInfoPopover.classList.remove('visible');
        }

        const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');

        if (window.innerWidth <= 640 && document.body.classList.contains('sidebar-open') && !elements.sidebar.contains(e.target) && !sidebarToggleBtn.contains(e.target)) {
            closeSidebar();
        }
    });

    const presets = {
        'daily-chat': {
            systemPrompt: '',
            temperature: 0.7,
            topK: 40,
            topP: 0.95
        },
        'coding-assistant': {
            systemPrompt: 'Expert software engineer. Provide concise, accurate code and explanations. Use markdown for code blocks.',
            temperature: 0.2,
            topK: 20,
            topP: 0.8
        },
        'writing-assistant': {
            systemPrompt: 'Professional editor and writing assistant. Help improve text with suggestions for clarity, tone, grammar, and style. Be constructive.',
            temperature: 0.8,
            topK: 50,
            topP: 0.95
        },
        'text-translation': {
            systemPrompt: 'Accurate translator. Identify source language and translate to target language. Preserve meaning and tone.',
            temperature: 0.1,
            topK: 10,
            topP: 0.9
        },
        'classical-chinese-research': {
            systemPrompt: 'Classical Chinese literature scholar. Analyze texts with scholarly perspective. Focus on historical context, literary value, and linguistic features.',
            temperature: 0.3,
            topK: 30,
            topP: 0.9
        },
        'travel-guide': {
            systemPrompt: 'Knowledgeable travel guide. Provide interesting facts, hidden gems, and practical advice. Create helpful itineraries.',
            temperature: 0.9,
            topK: 60,
            topP: 0.98
        },
        'roleplay-creative': {
            systemPrompt: 'Expert roleplay and creative writing assistant. Use sophisticated literary techniques, focus on character psychology, and maintain artistic language. Handle themes with literary maturity.',
            temperature: 0.8,
            topK: 50,
            topP: 0.95
        }
    };

    const applySettingsToUI = (settings) => {
        elements.systemPrompt.value = settings.systemPrompt;
        elements.temperatureSlider.value = settings.temperature;
        elements.temperatureValue.textContent = settings.temperature;
        elements.topKInput.value = settings.topK;
        elements.topPInput.value = settings.topP;
        elements.systemPromptCounter.textContent = `${settings.systemPrompt.length} / 1000`;
    };

    // 应用任务预设
    const applyTaskPreset = async (selectedPreset) => {
        if (presets[selectedPreset]) {
            applySettingsToUI(presets[selectedPreset]);
            updateWeeklyReportUIState();
        }
    };

    const closeRightSidebar = () => {
        document.body.classList.remove('right-sidebar-open');
        // 任务预设下拉框
        if (elements.taskPresetMenu) {
            elements.taskPresetMenu.querySelectorAll('.dropdown-item').forEach(el => el.classList.remove('active'));
            const taskPresetText = elements.taskPresetTrigger?.querySelector('.dropdown-text');
            if (taskPresetText) {
                taskPresetText.textContent = getToastMessage('ui.selectPreset');
                taskPresetText.dataset.i18nKey = 'ui.selectPreset';
            }
        }
    };



    elements.temperatureSlider.addEventListener('input', () => {
        elements.temperatureValue.textContent = elements.temperatureSlider.value;
    });
    elements.systemPrompt.addEventListener('input', () => {
        const len = elements.systemPrompt.value.length;
        elements.systemPromptCounter.textContent = `${len} / 1000`;
        if (len > 1000) {
            elements.systemPrompt.value = elements.systemPrompt.value.substring(0, 1000);
            elements.systemPromptCounter.textContent = '1000 / 1000';
        }
    });

    elements.saveSettingsBtn.addEventListener('click', async () => {
        const isInCooldown = weeklyFeatureStatus.loaded &&
            weeklyFeatureStatus.expires_at &&
            new Date() < new Date(weeklyFeatureStatus.expires_at) &&
            !weeklyFeatureStatus.can_use;

        if (isInCooldown) {
            showToast(getToastMessage('toast.advancedFeatureInCooldown'), 'warning');
            return;
        }

        const backupParameters = {
            systemPrompt: aiParameters.systemPrompt,
            temperature: aiParameters.temperature,
            topK: aiParameters.topK,
            topP: aiParameters.topP,
            taskPreset: aiParameters.taskPreset
        };

        aiParameters.systemPrompt = elements.systemPrompt.value.trim();
        aiParameters.temperature = parseFloat(elements.temperatureSlider.value);
        aiParameters.topK = parseInt(elements.topKInput.value, 10);
        aiParameters.topP = parseFloat(elements.topPInput.value);

        const activePresetItem = elements.taskPresetMenu?.querySelector('.dropdown-item.active');
        aiParameters.taskPreset = activePresetItem?.dataset.value || '';

        try {
            await saveAIParametersToServer();

            try {
                const result = await makeApiRequest('feature/use', {
                    method: 'POST',
                    body: JSON.stringify({ feature: 'advanced_feature' })
                });

                if (result.success) {
                    showToast(getToastMessage('toast.aiParametersSaved'), 'success');
                } else {
                    if (result.error && result.error.includes(getToastMessage('errors.maxActivationReached'))) {
                        showToast(getToastMessage('toast.aiParametersSavedNoActivation'), 'info');
                    } else {
                        showToast(`${getToastMessage('toast.aiParametersSavedActivationFailed')}：${result.error || getToastMessage('toast.unknownError')}`, 'warning');
                    }
                }
            } catch (error) {
                if (error.message.includes('fetch') || error.message.includes(getToastMessage('ui.network'))) {
                    showToast(getToastMessage('toast.networkConnectionError'), 'warning');
                } else {
                    showToast(getToastMessage('toast.serverError'), 'warning');
                }
            }

            try {
                await fetchWeeklyFeatureStatus();
                updateWeeklyTimer();
            } catch (statusError) {
                console.error(`${getToastMessage('console.getStatusFailed')}:`, statusError);
            }
            originalAIParameters = { ...aiParameters };

            notifyBackendCacheInvalidation('ai_parameters_updated', {
                systemPrompt: aiParameters.systemPrompt,
                temperature: aiParameters.temperature,
                topK: aiParameters.topK,
                topP: aiParameters.topP,
                taskPreset: aiParameters.taskPreset
            });

            closeRightSidebar();
            forceBlur();
        } catch (saveError) {
            aiParameters.systemPrompt = backupParameters.systemPrompt;
            aiParameters.temperature = backupParameters.temperature;
            aiParameters.topK = backupParameters.topK;
            aiParameters.topP = backupParameters.topP;
            aiParameters.taskPreset = backupParameters.taskPreset;
            applySettingsToUI(aiParameters);
            showToast(getToastMessage('toast.aiParametersSaveFailed'), 'error');
        }
    });

    elements.chatContainer.addEventListener('click', (e) => {
        const target = e.target;

        const imageToView = target.closest('img[data-image-url]');
        if (imageToView) {
            e.stopPropagation();
            viewImage(imageToView.dataset.imageUrl, imageToView.alt);
            return;
        }

        const downloadButton = target.closest('[data-action="download-image"]');
        if (downloadButton) {
            e.stopPropagation();
            downloadImage(downloadButton.dataset.imageUrl, downloadButton.dataset.description);
            return;
        }
    });

    // 全局下载图片
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="download-image"]');
        if (!btn) return;
        if (elements.chatContainer && elements.chatContainer.contains(btn)) return;

        e.preventDefault();
        e.stopPropagation();
        const url = btn.dataset.imageUrl || btn.dataset.src || '';
        const desc = btn.dataset.description || (btn.dataset.descriptionKey ? getToastMessage(btn.dataset.descriptionKey) : '');
        if (url) {
            downloadImage(url, desc || 'QR');
        }
    });

    elements.themePresetSelector.addEventListener('click', async (e) => {
        const targetBtn = e.target.closest('.theme-preset-btn');
        if (!targetBtn || targetBtn.disabled) return;

        const selectedTheme = targetBtn.dataset.theme;
        elements.themePresetSelector.querySelectorAll('.theme-preset-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        targetBtn.classList.add('active');

        const currentSettings = currentUser ? (currentUser.theme_settings || {}) : guestThemeSettings;
        currentSettings.preset = selectedTheme;
        currentSettings.background_url = null;

        await applyTheme(currentSettings);

        if (currentUser) {
            notifyBackendCacheInvalidation('theme_updated', { preset: selectedTheme });
            await savePresetAndFont('preset');
        } else {
            guestThemeSettings.preset = selectedTheme;
            guestThemeSettings.background_url = null;
            localStorage.setItem('guestThemeSettings', JSON.stringify(guestThemeSettings));
            notifyBackendCacheInvalidation('guest_theme_updated', { preset: selectedTheme });
            try { showToast(getToastMessage('toast.themeSettingsAutoSaved'), 'success'); } catch (_) { }
        }
    });

    // 字体选择
    if (elements.fontTrigger && elements.fontMenu) {
        const fontText = elements.fontTrigger.querySelector('.dropdown-text');
        if (!fontText) {
            console.warn('Font dropdown text element not found');
            return;
        }

        // 点击触发器打开/关闭下拉菜单
        elements.fontTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = elements.fontMenu.classList.contains('show');

            // 关闭其他下拉菜单
            closeAllDropdowns();

            if (!isOpen) {
                elements.fontMenu.classList.add('show');
                elements.fontTrigger.classList.add('active');
            }
        });

        // 点击下拉选项
        elements.fontMenu.addEventListener('click', async (e) => {
            const item = e.target.closest('.dropdown-item');
            if (!item) return;

            const value = item.dataset.value;
            const text = item.textContent;

            // 更新显示文本
            fontText.textContent = text;
            fontText.dataset.i18nKey = item.dataset.i18nKey;

            // 更新活动状态
            elements.fontMenu.querySelectorAll('.dropdown-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');

            // 应用字体设置
            const currentSettings = currentUser ? (currentUser.theme_settings || {}) : guestThemeSettings;
            currentSettings.font = value;
            await applyTheme(currentSettings);

            // 如果当前在欢迎页面，确保滚动条正确隐藏
            if (currentChatId === null && isWelcomePage) {
                elements.chatContainer.style.overflowY = 'hidden';
            }

            if (currentUser) {
                notifyBackendCacheInvalidation('theme_updated', { font: value });
                await savePresetAndFont('font');
            } else {
                guestThemeSettings.font = value;
                localStorage.setItem('guestThemeSettings', JSON.stringify(guestThemeSettings));
                notifyBackendCacheInvalidation('guest_theme_updated', { font: value });
                try { showToast(getToastMessage('toast.fontSettingsAutoSaved'), 'success'); } catch (_) { }
            }

            // 关闭下拉菜单
            closeDropdown(elements.fontMenu);
        });

        // 点击外部关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (elements.fontDropdown && !elements.fontDropdown.contains(e.target)) {
                closeDropdown(elements.fontMenu);
            }
        });
    }

    // AI参数预设 - 自定义下拉组件
    if (elements.taskPresetTrigger && elements.taskPresetMenu) {
        const taskPresetText = elements.taskPresetTrigger.querySelector('.dropdown-text');
        if (!taskPresetText) {
            console.warn('Task preset dropdown text element not found');
            return;
        }

        // 点击触发器打开/关闭下拉菜单
        elements.taskPresetTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = elements.taskPresetMenu.classList.contains('show');

            // 关闭其他下拉菜单
            closeAllDropdowns();

            if (!isOpen) {
                elements.taskPresetMenu.classList.add('show');
                elements.taskPresetTrigger.classList.add('active');
            }
        });

        // 点击下拉选项
        elements.taskPresetMenu.addEventListener('click', async (e) => {
            const item = e.target.closest('.dropdown-item');
            if (!item) return;

            const value = item.dataset.value;
            const text = item.textContent;

            // 更新显示文本
            taskPresetText.textContent = text;
            taskPresetText.dataset.i18nKey = item.dataset.i18nKey;

            // 更新活动状态
            elements.taskPresetMenu.querySelectorAll('.dropdown-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');

            // 应用预设
            await applyTaskPreset(value);

            // 关闭下拉菜单
            closeDropdown(elements.taskPresetMenu);
        });

        // 点击外部关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (elements.taskPresetDropdown && !elements.taskPresetDropdown.contains(e.target)) {
                closeDropdown(elements.taskPresetMenu);
            }
        });
    }

    elements.cancelSettingsBtn.addEventListener('click', () => {
        // 恢复到打开面板时的快照状态
        if (originalAIParameters) {
            aiParameters.systemPrompt = originalAIParameters.systemPrompt;
            aiParameters.temperature = originalAIParameters.temperature;
            aiParameters.topK = originalAIParameters.topK;
            aiParameters.topP = originalAIParameters.topP;
            aiParameters.taskPreset = originalAIParameters.taskPreset;

            updateAIParameterUI();
        }
        closeRightSidebar();
        forceBlur();
    });

    document.querySelectorAll('.help-tooltip-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            const wasActive = icon.classList.contains('show-tooltip');

            document.querySelectorAll('.help-tooltip-icon.show-tooltip').forEach(activeIcon => {
                activeIcon.classList.remove('show-tooltip');
            });

            if (!wasActive) {
                icon.classList.add('show-tooltip');
            }
        });
    });

    window.addEventListener('click', () => {
        document.querySelectorAll('.help-tooltip-icon.show-tooltip').forEach(activeIcon => {
            activeIcon.classList.remove('show-tooltip');
        });
    });

    const downloadGuideLink = document.getElementById('download-guide-link');
    if (downloadGuideLink) {
        downloadGuideLink.addEventListener('click', async (e) => {
            e.preventDefault();
            // 获取当前语言和主题并传递给下载页面
            const currentLang = currentUser?.language || getCurrentLanguage() || 'zh-CN';
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const downloadUrl = isNativeApp
                ? `https://littleaibox.com/download-app?lang=${currentLang}&theme=${currentTheme}`
                : `/download-app?lang=${currentLang}&theme=${currentTheme}`;

            if (isNativeApp) {
                try {
                    await Browser.open({ url: downloadUrl });
                } catch (error) {
                    console.error(getToastMessage('console.cannotOpenBrowser'), error);
                    window.open(downloadUrl, '_blank');
                }
            } else {
                try { location.href = downloadUrl; } catch (_) { }
            }
        });
    }

    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) {
        // 跨刷新冷却控制，避免连续清理导致白屏
        const isInClearCacheCooldown = () => {
            const until = Number(localStorage.getItem('clearCacheCooldownUntil') || '0');
            return until && Date.now() < until;
        };

        const updateClearCacheButtonState = () => {
            const needDisable = isInClearCacheCooldown();
            clearCacheBtn.style.pointerEvents = needDisable ? 'none' : '';
            clearCacheBtn.style.opacity = needDisable ? '0.6' : '';
            clearCacheBtn.title = needDisable ? (getToastMessage('version.updating') || 'Updating...') : '';
        };

        clearCacheBtn.addEventListener('click', () => {
            if (isMultiSelectMode) {
                exitMultiSelectMode();
            }
            forceClearCacheAndReload();
        });

        // 初始渲染与冷却结束的重新启用
        updateClearCacheButtonState();
        if (isInClearCacheCooldown()) {
            const remain = Math.max(0, Number(localStorage.getItem('clearCacheCooldownUntil')) - Date.now());
            setTimeout(() => {
                localStorage.removeItem('clearCacheCooldownUntil');
                updateClearCacheButtonState();
            }, remain + 50);
        }
    }

    const chatArea = document.querySelector('.chat-area');
    let scrollInterval = null;
    let isSelecting = false;
    let isTouchSession = false;

    const checkSelection = () => {
        const selection = window.getSelection();
        const newIsSelecting = selection && !selection.isCollapsed;

        if (newIsSelecting && !isSelecting && isTouchSession) {
            isSelecting = true;
        }
        else if (!isTouchSession) {
            isSelecting = newIsSelecting;
        }
    };

    const handleMoveForSelectionScroll = (e) => {
        if (!isSelecting) {
            stopSmoothScroll();
            return;
        }

        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const rect = chatArea.getBoundingClientRect();

        const edgeSize = 80;
        let speed = 0;

        if (clientY < rect.top + edgeSize) {
            const intensity = Math.min(1, (rect.top + edgeSize - clientY) / edgeSize);
            speed = -2 - (intensity * 10);
        } else if (clientY > rect.bottom - edgeSize) {
            const intensity = Math.min(1, (clientY - (rect.bottom - edgeSize)) / edgeSize);
            speed = 2 + (intensity * 10);
        }

        if (speed !== 0) {
            startSmoothScroll(speed);
            if (e.cancelable) {
                e.preventDefault();
            }
        } else {
            stopSmoothScroll();
        }
    };

    const startSmoothScroll = (speed) => {
        if (scrollInterval) return;
        scrollInterval = setInterval(() => {
            chatArea.scrollTop += speed;
        }, 16);
    };

    const stopSmoothScroll = () => {
        if (scrollInterval) {
            clearInterval(scrollInterval);
            scrollInterval = null;
        }
    };

    chatArea.addEventListener('touchstart', () => {
        isTouchSession = true;
    }, { passive: true });

    chatArea.addEventListener('mousedown', () => {
        isTouchSession = false;
    }, { passive: true });

    document.addEventListener('selectionchange', checkSelection);
    document.addEventListener('mousemove', handleMoveForSelectionScroll);
    document.addEventListener('touchmove', handleMoveForSelectionScroll, { passive: false }); // passive: false 允许 preventDefault

    const handleEndSession = () => {
        stopSmoothScroll();
        isSelecting = false;
        isTouchSession = false;
    };

    document.addEventListener('mouseup', handleEndSession);
    document.addEventListener('touchend', handleEndSession);
    document.addEventListener('touchcancel', handleEndSession);

    weeklyTimerInterval = setInterval(updateWeeklyTimer, 1000);
    addGlobalCleanup(() => {
        if (weeklyTimerInterval) {
            clearInterval(weeklyTimerInterval);
            weeklyTimerInterval = null;
        }
    });
    updateWeeklyTimer();

    if (Capacitor.isNativePlatform()) {
        let keyboardHideRaf = null;

        const finalizeKeyboardHidden = () => {
            if (keyboardHideRaf !== null) {
                cancelAnimationFrame(keyboardHideRaf);
                keyboardHideRaf = null;
            }

            document.body.classList.remove('keyboard-is-open');
            document.body.style.removeProperty('--keyboard-height');

            document.documentElement.style.setProperty('--native-safe-area-bottom', '0px');
            if (window.navigator && window.navigator.userAgent) {
                setTimeout(() => {
                    const bottomInset = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom') || '0px';
                    document.documentElement.style.setProperty('--native-safe-area-bottom', bottomInset);
                }, 100);
            }

            if (document.activeElement === elements.messageInput) {
                elements.messageInput.blur();
            }
        };

        Keyboard.addListener('keyboardWillShow', (info) => {
            if (keyboardHideRaf !== null) {
                cancelAnimationFrame(keyboardHideRaf);
                keyboardHideRaf = null;
            }
            document.body.classList.add('keyboard-is-open');
            document.body.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
            document.documentElement.style.setProperty('--native-safe-area-bottom', '0px');
        });

        Keyboard.addListener('keyboardWillHide', () => {
            if (keyboardHideRaf !== null) {
                cancelAnimationFrame(keyboardHideRaf);
            }
            keyboardHideRaf = requestAnimationFrame(() => {
                finalizeKeyboardHidden();
            });
        });

        Keyboard.addListener('keyboardDidHide', finalizeKeyboardHidden);
    }

    elements.chatHistoryList.addEventListener('contextmenu', (e) => {
        e.preventDefault();

        const historyItem = e.target.closest('.history-item');
        if (!historyItem) return;

        document.querySelectorAll('.context-menu').forEach(m => {
            if (m.parentElement.parentElement !== historyItem) {
                m.style.display = 'none';
            }
        });

        const contextMenu = historyItem.querySelector('.context-menu');
        if (contextMenu) {
            contextMenu.style.display = 'block';
            if (window.innerWidth > 640) {
                contextMenu.onmouseleave = () => {
                    contextMenu.style.display = 'none';
                };
                const onMove = (ev) => {
                    if (!contextMenu.contains(ev.target) && !historyItem.contains(ev.target)) {
                        contextMenu.style.display = 'none';
                        document.removeEventListener('mousemove', onMove);
                    }
                };
                document.addEventListener('mousemove', onMove);
            }
        }
    });

    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            const mainChatArea = document.querySelector('main');
            if (mainChatArea) {
                setTimeout(() => {
                    mainChatArea.scrollTop = mainChatArea.scrollHeight;

                    if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                    }
                }, 100);
            }
        }
    });
}

// 忘记密码
function switchToForgotPasswordForm() {
    // 隐藏滑动容器和标签页
    document.getElementById('auth-forms-container').style.display = 'none';
    document.getElementById('auth-tabs').style.display = 'none';

    // 显示忘记密码表单
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    document.getElementById('forgot-password-form').classList.add('active');
}

async function restorePendingChats() {
    if (!currentUser) return;

    const pendingKeys = Object.keys(localStorage).filter(key => key.startsWith('pending_chat_'));
    if (pendingKeys.length === 0) {
        return;
    }
    if (isRestoring) {
        return;
    }

    isRestoring = true;

    try {
        let restoredCount = 0;
        for (const key of pendingKeys) {
            try {
                const pendingData = JSON.parse(localStorage.getItem(key));
                // 检查数据是否在24小时内
                if (Date.now() - (pendingData.timestamp || 0) < 24 * 60 * 60 * 1000) {
                    await saveChatToServer(pendingData.chatId, pendingData.userMessage, pendingData.assistantMessage, pendingData);
                    localStorage.removeItem(key);
                    restoredCount++;
                } else {
                    localStorage.removeItem(key);
                }
            } catch (error) {
                console.error(`${getToastMessage('console.restoreSingleCachedDataFailed')}:`, error);
                localStorage.removeItem(key);
            }
        }

        if (restoredCount > 0) {
            showToast(getToastMessage('toast.restoredTemporaryConversations', { count: restoredCount }), 'success');
            await loadChats();
        }

    } catch (error) {
        console.error(`${getToastMessage('console.restoreCachedDataUnknownError')}:`, error);
    } finally {
        isRestoring = false;
    }
}

async function restoreBackgroundTasks() {
    try {
        const pendingTasksData = localStorage.getItem('pending_background_tasks');
        if (pendingTasksData) {
            const pendingTasks = JSON.parse(pendingTasksData);

            const validTasks = pendingTasks.filter(task =>
                Date.now() - task.timestamp < 60 * 60 * 1000
            );

            if (validTasks.length > 0) {
                const pendingChatKeys = Object.keys(localStorage).filter(key => key.startsWith('pending_chat_'));
                for (const key of pendingChatKeys) {
                    try {
                        const pendingData = JSON.parse(localStorage.getItem(key));
                        if (Date.now() - (pendingData.timestamp || 0) < 24 * 60 * 60 * 1000) {
                            const taskId = `restore_chat_${pendingData.chatId}_${Date.now()}`;
                            addBackgroundTask(taskId, async () => {
                                await saveChatToServer(pendingData.chatId, pendingData.userMessage, pendingData.assistantMessage, pendingData);
                                localStorage.removeItem(key);
                            }, 'high');
                        } else {
                            localStorage.removeItem(key);
                        }
                    } catch (error) {
                        localStorage.removeItem(key);
                    }
                }
            }

            localStorage.removeItem('pending_background_tasks');
        }
    } catch (error) {
        localStorage.removeItem('pending_background_tasks');
    }
}

async function getLargeTextIntent(userQuery) {
    const trimmedQuery = (userQuery || '').trim();
    if (!trimmedQuery) {
        return "SUMMARIZATION";
    }

    try {
        const intentPrompt = `
            You are an intent classifier for document tasks. Read the user's input text (NOT the file itself) and choose exactly one intent:
            - "ANALYSIS_QA": wants deep analysis, structured Q&A, insights, comparisons, or retrieval-like answers.
            - "CONTINUATION": wants to continue or extend the document/story/section.
            - "SUMMARIZATION": wants overall summary, abstract, overview, or evaluation.

            User input:
            """${trimmedQuery.substring(0, 2000)}"""

            Respond **ONLY** with JSON: {"intent":"ANALYSIS_QA|CONTINUATION|SUMMARIZATION"}
        `.trim();
        const intentResult = await callAISynchronously(intentPrompt, 'gemini-2.0-flash', false);
        const parsed = safeJsonParse(intentResult, null);
        const rawIntent = (parsed && typeof parsed.intent === 'string') ? parsed.intent : intentResult;
        if (rawIntent) {
            const match = String(rawIntent).match(/(ANALYSIS_QA|CONTINUATION|SUMMARIZATION)/i);
            if (match) {
                return match[1].toUpperCase();
            }
        }
    } catch (error) {
        console.error('Large text intent detection failed, falling back to heuristics:', error);
    }
    return "SUMMARIZATION";
}

async function handleContinuationTask(userContent, contentForDisplay, existingAssistantElement = null) {
    const MAX_CONTINUATION_CONTEXT = 75000;
    let modifiedContent = [...userContent];
    let totalLength = 0;

    modifiedContent.forEach(part => {
        if (part.type === 'text') {
            totalLength += (part.text || '').length;
        } else if (part.type === 'file') {
            totalLength += (part.content || '').length;
        }
    });

    if (totalLength > MAX_CONTINUATION_CONTEXT) {
        let excessLength = totalLength - MAX_CONTINUATION_CONTEXT;

        for (let i = 0; i < modifiedContent.length; i++) {
            const part = modifiedContent[i];

            if (part.type === 'text' && part.text) {
                const currentLength = part.text.length;
                if (excessLength >= currentLength) {
                    modifiedContent[i] = { ...part, text: '' };
                    excessLength -= currentLength;
                } else {
                    const truncatedText = `... [${getToastMessage('ui.contentTruncated')}] ...\n\n` + part.text.slice(excessLength);
                    modifiedContent[i] = { ...part, text: truncatedText };
                    excessLength = 0;
                }
            } else if (part.type === 'file' && part.content) {
                const currentLength = part.content.length;
                if (excessLength >= currentLength) {
                    modifiedContent[i] = { ...part, content: '' };
                    excessLength -= currentLength;
                } else {
                    const truncatedContent = `... [${getToastMessage('ui.fileContentTruncated')}] ...\n\n` + part.content.slice(excessLength);
                    modifiedContent[i] = { ...part, content: truncatedContent };
                    excessLength = 0;
                }
            }

            if (excessLength <= 0) break;
        }
    }

    // 过滤掉空内容
    modifiedContent = modifiedContent.filter(part => {
        if (part.type === 'text') return (part.text || '').length > 0;
        if (part.type === 'file') return (part.content || '').length > 0;
        return true;
    });

    return await handleChatMessage(modifiedContent, { skipLengthCheck: true, contentForDisplay: contentForDisplay, existingAssistantElement });
}

async function saveChatToServer(chatId, userMessage, assistantMessage, pendingChatData = null) {
    let finalChatId = chatId;
    const isTempChat = chatId.startsWith('temp_');

    let cleanUserMessage = null;
    let cleanAssistantMessage = null;

    try {
        if (isTempChat) {
            if (currentUser) {
                const result = await makeApiRequest('chats/new', { method: 'POST' });
                if (result.success && result.conversation) {
                    finalChatId = result.conversation.id;

                    const tempMessages = chats[chatId]?.messages || [];
                    delete chats[chatId];

                    chats[finalChatId] = {
                        id: finalChatId,
                        title: result.conversation.title,
                        model_name: result.conversation.model_name,
                        created_at: result.conversation.created_at,
                        updated_at: result.conversation.updated_at,
                        messages: tempMessages,
                        isNewlyCreated: true
                    };

                    currentChatId = finalChatId;
                    updateSidebarChatId(chatId, finalChatId);
                    setActiveChat(finalChatId);
                } else {
                    throw new Error(result.error || getToastMessage('errors.cannotCreateNewConversationOnServer'));
                }
            } else {
                const newId = generateId();
                chats[newId] = { ...chats[chatId], id: newId };
                delete chats[chatId];
                currentChatId = newId;
                finalChatId = newId;
                updateSidebarChatId(chatId, newId);
                setActiveChat(newId);
                scheduleRenderSidebar();
            }
            if (finalChatId !== chatId) {
                routeManager.navigateToChat(finalChatId, { replace: true, silent: true });
            }
        }

        const userIdForRequest = currentUser?.id || localStorage.getItem('userId') || 'guest';
        const title = chats[finalChatId]?.title || (pendingChatData ? pendingChatData.title : getToastMessage('ui.restoredChat'));
        const modelName = chats[finalChatId]?.model_name || (pendingChatData ? pendingChatData.modelName : currentModelId);

        cleanUserMessage = userMessage ? { role: userMessage.role || 'user', content: userMessage.content } : null;
        cleanAssistantMessage = assistantMessage;

        const payload = {
            userId: userIdForRequest,
            conversationId: finalChatId,
            title: title,
            modelName: modelName,
            userMessage: cleanUserMessage,
            assistantMessage: cleanAssistantMessage
        };
        if (!currentUser) {
            const guestKey = selectGuestApiKeyForRequest();
            if (guestKey) payload.apiKey = guestKey;
        }

        const saveResult = await makeApiRequest('chats/batch-save', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (saveResult.success) {
            if (saveResult.title && chats[finalChatId]) {
                chats[finalChatId].title = saveResult.title;
            }

            // 保存到 localStorage
            if (currentUser) {
                await saveChatsToDB(currentUser.id, chats);
            } else {
                await saveChatsToDB('guest', chats);
            }

            scheduleRenderSidebar();

            if (pendingChatData) {
                showToast(getToastMessage('toast.messageSendErrorRecovered'), 'success');
            }
            notifyBackendCacheInvalidation('chat_saved', { chatId: finalChatId, isNewChat: isTempChat });

            return { finalChatId, newTitle: saveResult.title };
        } else {
            throw new Error(saveResult.error || getToastMessage('errors.saveFailed'));
        }

    } catch (error) {
        console.error(`${getToastMessage('console.saveFailed')}:`, error);

        const isNetworkError = error.message && (error.message.includes('fetch') || error.message.includes('network'));
        const isServerError = error.message && (error.message.includes('500') || error.message.includes(getToastMessage('ui.server')));

        if (isNetworkError || isServerError) {
            console.log(getToastMessage('console.detectedNetworkOrServerError'));
            const pendingKey = `pending_chat_${finalChatId}`;
            localStorage.setItem(pendingKey, JSON.stringify({
                chatId: finalChatId,
                title: chats[finalChatId]?.title || getToastMessage('ui.restoredChat'),
                modelName: currentModelId,
                userMessage: cleanUserMessage,
                assistantMessage: cleanAssistantMessage,
                timestamp: Date.now()
            }));

            // 显示离线保存提示
            showToast(getToastMessage('toast.messageSavedOffline'), 'info');
        }

        if (currentUser) {
            await saveChatsToDB(currentUser.id, chats);
        } else {
            await saveChatsToDB('guest', chats);
        }

        return { finalChatId, newTitle: null };
    }
}

async function loadUserAIParameters() {
    if (!currentUser || isLoadingParameters) return;

    const cachedParams = simpleCache.get(`ai_params_${currentUser.id}`);
    if (cachedParams) {
        aiParameters = cachedParams;
        hasParametersLoaded = true;
        updateAIParameterUI();
        hideParameterLoadingState();
        return;
    }

    isLoadingParameters = true;
    showParameterLoadingState();

    const timeoutId = setTimeout(() => {
        if (isLoadingParameters) {
            isLoadingParameters = false;
            hideParameterLoadingState();
            showToast(getToastMessage('toast.parameterLoadTimeout'), 'error');
        }
    }, 10000);

    try {
        const result = await makeApiRequest('user/ai-parameters');

        if (result.success && result.parameters) {
            aiParameters = {
                systemPrompt: result.parameters.system_prompt || '',
                temperature: result.parameters.temperature || 0.5,
                topK: result.parameters.top_k || 40,
                topP: result.parameters.top_p || 0.95,
                taskPreset: result.parameters.task_preset || ''
            };
            simpleCache.set(`ai_params_${currentUser.id}`, aiParameters, 300000);

            hasParametersLoaded = true;
            updateAIParameterUI();
        } else {
            aiParameters = {
                systemPrompt: '',
                temperature: 0.5,
                topK: 40,
                topP: 0.95,
                taskPreset: ''
            };
            hasParametersLoaded = true;
            updateAIParameterUI();
        }
    } catch (error) {
        showToast(getToastMessage('toast.aiParametersLoadFailedDefault'), 'error');
        aiParameters = {
            systemPrompt: '',
            temperature: 0.5,
            topK: 40,
            topP: 0.95,
            taskPreset: ''
        };
        hasParametersLoaded = true;
        updateAIParameterUI();
    } finally {
        clearTimeout(timeoutId);
        if (isLoadingParameters) {
            isLoadingParameters = false;
        }
        hideParameterLoadingState();
    }
}
// 更新AI参数UI显示
function updateAIParameterUI() {
    if (elements.systemPrompt) {
        elements.systemPrompt.value = aiParameters.systemPrompt;
    }
    if (elements.temperatureSlider) {
        elements.temperatureSlider.value = aiParameters.temperature;
    }
    if (elements.temperatureValue) {
        elements.temperatureValue.textContent = aiParameters.temperature;
    }
    if (elements.topKInput) {
        elements.topKInput.value = aiParameters.topK;
    }
    if (elements.topPInput) {
        elements.topPInput.value = aiParameters.topP;
    }
    if (elements.systemPromptCounter) {
        elements.systemPromptCounter.textContent = `${aiParameters.systemPrompt.length} / 1000`;
    }

    // 更新任务预设下拉框
    if (elements.taskPresetMenu) {
        // 清除所有活动状态
        elements.taskPresetMenu.querySelectorAll('.dropdown-item').forEach(el => el.classList.remove('active'));

        // 设置选中的预设
        if (aiParameters.taskPreset) {
            const selectedItem = elements.taskPresetMenu.querySelector(`[data-value="${aiParameters.taskPreset}"]`);
            if (selectedItem) {
                selectedItem.classList.add('active');
                const taskPresetText = elements.taskPresetTrigger?.querySelector('.dropdown-text');
                if (taskPresetText) {
                    taskPresetText.textContent = selectedItem.textContent;
                    taskPresetText.dataset.i18nKey = selectedItem.dataset.i18nKey;
                }
            }
        } else {
            const taskPresetText = elements.taskPresetTrigger?.querySelector('.dropdown-text');
            if (taskPresetText) {
                taskPresetText.textContent = getToastMessage('ui.selectPreset');
                taskPresetText.dataset.i18nKey = 'ui.selectPreset';
            }
        }
    }
}

// 保存AI参数到服务器
async function saveAIParametersToServer() {
    if (!currentUser) return;

    try {
        await makeApiRequest('user/ai-parameters', {
            method: 'POST',
            body: JSON.stringify({
                systemPrompt: aiParameters.systemPrompt,
                temperature: aiParameters.temperature,
                topK: aiParameters.topK,
                topP: aiParameters.topP,
                taskPreset: aiParameters.taskPreset || ''
            })
        });
    } catch (error) {
        showToast(getToastMessage('toast.parameterSaveFailed'), 'error');
    }
}

function showParameterLoadingState() {
    const loadingElement = document.getElementById('parameter-loading');
    const settingsContainer = document.querySelector('.sidebar-settings-container');

    if (loadingElement && settingsContainer) {
        loadingElement.style.display = 'flex';
        settingsContainer.style.display = 'none';
    }
}

function hideParameterLoadingState() {
    const loadingElement = document.getElementById('parameter-loading');
    const settingsContainer = document.querySelector('.sidebar-settings-container');

    if (loadingElement && settingsContainer) {
        loadingElement.style.display = 'none';
        settingsContainer.style.display = 'flex';
    }
}

function checkPrivacyPolicyUpdate() {
    const seenVersion = localStorage.getItem(LOCAL_STORAGE_KEY_PRIVACY);
    const badgeElement = document.getElementById('privacy-update-badge');
    const settingsText = document.getElementById('settings-text');

    if (!badgeElement) return;

    if (!seenVersion || seenVersion < PRIVACY_POLICY_VERSION) {
        badgeElement.style.display = 'inline-block';
        if (settingsText) {
            settingsText.style.color = '#ef4444';
        }
    } else {
        badgeElement.style.display = 'none';
        if (settingsText) {
            settingsText.style.color = '';
        }
    }
}

function handleLaunchParams() {
    const urlParams = new URLSearchParams(window.location.search || '');

    // 处理"笔记分享"
    const sharedText = urlParams.get('text');
    if (urlParams.get('action') === 'new-note' && sharedText) {
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.value = sharedText;
            messageInput.dispatchEvent(new Event('input'));
            showToast(getToastMessage('toast.sharedTextReceived'), 'info');
            document.querySelector('.input-wrapper')?.classList.add('received-share-content');
        }
    }

    if (urlParams.get('action') === 'open-settings') {
        const settingsBtn = document.getElementById('settings-btn');
        setTimeout(() => settingsBtn?.click(), 100);
    }
}

function handlePrivacyPolicyClick() {
    localStorage.setItem(LOCAL_STORAGE_KEY_PRIVACY, PRIVACY_POLICY_VERSION);
    const badgeElement = document.getElementById('privacy-update-badge');
    const settingsText = document.getElementById('settings-text');

    if (badgeElement) {
        badgeElement.style.display = 'none';
    }
    if (settingsText) {
        settingsText.style.color = '';
    }
}

function setupLayout() {
    const root = document.documentElement;
    const header = document.querySelector('.chat-header');

    const updateAppHeight = () => {
        if (!isNativeApp) {
            const vh = Math.max(
                window.innerHeight,
                document.documentElement.clientHeight,
                document.body.clientHeight
            );
            root.style.setProperty('--app-height', `${vh}px`);
        }
    };

    // 立即更新一次
    updateAppHeight();

    // 延迟更新，确保PWA完全加载
    setTimeout(updateAppHeight, 100);
    setTimeout(updateAppHeight, 500);

    window.addEventListener('resize', updateAppHeight);
    window.addEventListener('orientationchange', () => {
        setTimeout(updateAppHeight, 100);
    });

    // API密钥输入监听器
    const apiKeyOneInput = document.getElementById('api-key-one');
    const apiKeyTwoInput = document.getElementById('api-key-two');
    const apiModeInputs = document.querySelectorAll('input[name="api-mode"]');

    if (apiKeyOneInput) {
        apiKeyOneInput.addEventListener('input', () => {
            keyOneTouched = true;
            checkApiKeysChanged();
        });
    }

    if (apiKeyTwoInput) {
        apiKeyTwoInput.addEventListener('input', () => {
            keyTwoTouched = true;
            checkApiKeysChanged();
        });
    }

    apiModeInputs.forEach(input => {
        input.addEventListener('change', () => {
            if (!input.checked) return;
            checkApiKeysChanged();
            // 模式切换自动保存
            if (currentUser) {
                const selectedMode = input.value;
                if (selectedMode !== currentUser.api_mode) {
                    if (apiKeysChanged) {
                        showToast(getToastMessage('status.saveKeysBeforeModeSwitch'), 'info');
                        const prevMode = (originalApiKeys.mode === 'server_fallback') ? 'mixed' : (originalApiKeys.mode || 'mixed');
                        const prevInput = document.querySelector(`input[name="api-mode"][value="${prevMode}"]`) || document.querySelector(`input[name="api-mode"][value="mixed"]`);
                        if (prevInput) prevInput.checked = true;
                        return;
                    }
                    const savedCombinedKey = getCustomApiKey() || '';
                    updateApiKey(savedCombinedKey, selectedMode, { context: 'mode' })
                        .then((serverMode) => {
                            const normalized = serverMode === 'server_fallback' ? 'mixed' : (serverMode || selectedMode);
                            originalApiKeys.mode = normalized;
                        })
                        .catch(error => {
                            console.error('Mode switch failed:', error);
                            const prevMode = (originalApiKeys.mode === 'server_fallback') ? 'mixed' : (originalApiKeys.mode || 'mixed');
                            const prevInput = document.querySelector(`input[name="api-mode"][value="${prevMode}"]`) || document.querySelector(`input[name="api-mode"][value="mixed"]`);
                            if (prevInput) prevInput.checked = true;
                        });
                }
            } else {
                // 访客：即时保存（仅内存）并提示
                const selectedMode = input.value;
                guestApiState.mode = selectedMode || 'mixed';
                const modeLabel = (selectedMode === 'mixed') ? getToastMessage('ui.mixedMode') : getToastMessage('ui.singleMode');
                showToast(getToastMessage('status.modeSwitchedTo', { mode: modeLabel }), 'success');
            }
        });
    });
}

async function applyStatusBarHeight() {
    if (isNativeApp) {
        try {
            const info = await StatusBar.getInfo();
            if (info.height > 0) {
                document.documentElement.style.setProperty('--status-bar-height', `${info.height}px`);
            } else {
                document.documentElement.style.setProperty('--status-bar-height', '24px');
            }
        } catch (e) {
            console.error(getToastMessage('console.cannotGetStatusBarInfo'), e);
            document.documentElement.style.setProperty('--status-bar-height', '24px');
        }
    }
}

async function initialize() {
    if (isInitializing) {
        return;
    }
    isInitializing = true;

    try {
        injectAuthUI();

        // 保留已缓存的语言文件，避免每次初始化都清空
        populateElements();
        configureMfaLogin({
            elements,
            codeInputRegistry,
            getToastMessage,
            showToast,
            makeAuthRequest,
            applyAuthenticatedSession,
            hideAuthOverlay,
            updateLoginButtonVisibility,
            resetCodeInputs,
            setupCodeInputGroup,
            switchToLoginForm
        });
        setupLayout();

        isProcessing = false;
        isSendingMessage = false;
        isRecording = false;
        isMultiSelectMode = false;
        isRestoring = false;
        isImageModeActive = false;
        isSearchModeActive = false;

        setupEventListeners();
        setupOAuthButtons();
        setupTouchMessageActions();
        setupNativeOAuthDeepLinkHandler();

        if (elements.voiceBtn) {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                window.innerWidth <= 640 ||
                'ontouchstart' in window;
            elements.voiceBtn.style.display = (isMobile || !isNativeApp) ? 'none' : 'flex';
        }
        setupBackgroundProcessing();
        setupVisibilityRerender();

        if (isNativeApp) {
            ensureNotificationPermission().catch(error => {
                console.warn('Notification permission request failed:', error);
            });
            setupAppStateVersionCheck();
            syncNativeAppVersionDisplay();
        }

        if ('ontouchstart' in window) {
            let isGestureReturn = false;
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    isGestureReturn = true;
                    document.body.classList.add('no-focus');
                    setTimeout(() => {
                        if (document.activeElement && document.activeElement !== document.body) {
                            document.activeElement.blur();
                        }
                        document.body.classList.remove('no-focus');
                        isGestureReturn = false;
                    }, 100);
                }
            });
            document.addEventListener('touchstart', () => {
                if (isGestureReturn && document.activeElement && document.activeElement !== document.body) {
                    document.activeElement.blur();
                }
            }, { passive: true });
        }
        sessionId = localStorage.getItem('sessionId');

        try {
            if (!sessionId) {
                localStorage.removeItem('guest_api_key_one');
                localStorage.removeItem('guest_api_key_two');
                localStorage.removeItem('guest_api_mode');
                localStorage.removeItem('guest_api_key_toggle');
                guestApiState = { keyOne: '', keyTwo: '', mode: 'mixed', toggle: '0' };
            }
        } catch (_) { }

        let savedLanguage = null;
        let appliedTheme = false;

        try {
            const forceReloadLanguage = localStorage.getItem('forceReloadLanguage');

            if (forceReloadLanguage) {
                localStorage.removeItem('forceReloadLanguage');
                const cacheNames = await caches.keys();
                const localeCaches = cacheNames.filter(name => name.includes('locales'));
                await Promise.all(localeCaches.map(name => caches.delete(name)));
            }

            savedLanguage = localStorage.getItem('selectedLanguage');
            if (!sessionId && savedLanguage) {
                try { localStorage.removeItem('selectedLanguage'); } catch (_) { }
                savedLanguage = null;
            }

            // 启动时快速渲染：优先应用本地语言；访客按系统语言但不持久化
            if (savedLanguage) {
                try { await applyLanguage(savedLanguage); } catch (_) { }
            } else if (!sessionId) {
                const browserLang = navigator.language || (Array.isArray(navigator.languages) && navigator.languages[0]) || 'zh-CN';
                const defaultLang = (browserLang && (browserLang.startsWith('zh-TW') || browserLang.startsWith('zh-HK'))) ? 'zh-TW'
                    : (browserLang && browserLang.startsWith('zh')) ? 'zh-CN'
                        : (browserLang && browserLang.startsWith('ja')) ? 'ja'
                            : (browserLang && browserLang.startsWith('ko')) ? 'ko'
                                : (browserLang && browserLang.startsWith('es')) ? 'es'
                                    : (browserLang && browserLang.startsWith('en')) ? 'en'
                                        : 'zh-CN';
                try { await applyLanguage(defaultLang); } catch (_) { }
            }

            try {
                preloadAllTranslations();
            } catch (_) { }

            if (sessionId) {
                const savedUserTheme = localStorage.getItem('userThemeSettings');
                if (savedUserTheme) {
                    try {
                        const userTheme = JSON.parse(savedUserTheme);
                        await applyTheme(userTheme);
                        appliedTheme = true;
                    } catch (e) {
                        localStorage.removeItem('userThemeSettings');
                    }
                }
            } else {
                const savedGuestTheme = localStorage.getItem('guestThemeSettings');
                if (savedGuestTheme) {
                    try {
                        guestThemeSettings = JSON.parse(savedGuestTheme);
                        await applyTheme(guestThemeSettings);
                        appliedTheme = true;
                    } catch (e) {
                        localStorage.removeItem('guestThemeSettings');
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to apply provisional language/theme:', e);
        }

        const task2_NativeSetup = (async () => {
            if (isNativeApp) {
                await Promise.allSettled([
                    applyNativeSafeAreaInsets(),
                    applyStatusBarHeight()
                ]);

                if (Capacitor.getPlatform() === 'android') {
                    ensureStoragePersistence();
                }
            }
        })();

        const task3_RestoreSettings = restoreImportantSettings().catch(error => {
            console.error('Failed to restore settings:', error);
        });

        const resourceLoader = new ResourceLoader();
        const task4_CoreResources = resourceLoader.waitForCoreResources();

        const task5_Session = checkSession();

        await Promise.allSettled([
            task2_NativeSetup,
            task3_RestoreSettings,
            task4_CoreResources
        ]);

        // 2 秒窗口内尝试获取并应用服务端更新；超时则保持已渲染的本地设置
        const hasSession = !!sessionId;
        let sessionValid = hasSession;
        let resolvedWithinWindow = false;
        try {
            const raceRes = await Promise.race([
                Promise.resolve(task5_Session).then(v => { resolvedWithinWindow = true; return v; }),
                new Promise(resolve => setTimeout(() => resolve('__timeout__'), 2000))
            ]);
            if (raceRes !== '__timeout__') {
                sessionValid = !!raceRes;
            }
        } catch (_) { }
        const initialLang = getCurrentLanguage();
        const serverLang = currentUser?.language;

        if (resolvedWithinWindow && sessionValid) {
            const serverTheme = currentUser?.theme_settings;

            if (serverTheme) {
                const localThemeStr = localStorage.getItem('userThemeSettings');
                const serverThemeStr = JSON.stringify(serverTheme);
                const localUpdatedAt = Number(localStorage.getItem('userThemeSettingsUpdatedAt') || '0');
                const preferLocalShortWindow = Date.now() - localUpdatedAt < 90 * 1000;

                if (!appliedTheme) {
                    if (preferLocalShortWindow && localThemeStr && localThemeStr !== serverThemeStr) {
                        try {
                            const localTheme = JSON.parse(localThemeStr);
                            await applyTheme(localTheme);
                            appliedTheme = true;

                            makeAuthRequest('update-profile', {
                                theme_settings: localTheme
                            }).then(() => {
                                localStorage.removeItem('userThemeSettingsUpdatedAt');
                            }).catch(err =>
                                console.error('Failed to sync local theme on startup:', err)
                            );
                        } catch (_) {
                            await applyTheme(serverTheme);
                            localStorage.setItem('userThemeSettings', serverThemeStr);
                            if (serverTheme && serverTheme.preset) {
                                localStorage.setItem('userThemePreset', serverTheme.preset);
                            }
                            localStorage.removeItem('userThemeSettingsUpdatedAt');
                            appliedTheme = true;
                        }
                    } else if (localThemeStr !== serverThemeStr && !preferLocalShortWindow) {
                        // 本地设置过期，使用服务端设置
                        await applyTheme(serverTheme);
                        localStorage.setItem('userThemeSettings', serverThemeStr);
                        if (serverTheme && serverTheme.preset) {
                            localStorage.setItem('userThemePreset', serverTheme.preset);
                        }
                        localStorage.removeItem('userThemeSettingsUpdatedAt');
                        appliedTheme = true;
                    } else {
                        await applyTheme(serverTheme);
                        localStorage.setItem('userThemeSettings', serverThemeStr);
                        if (serverTheme && serverTheme.preset) {
                            localStorage.setItem('userThemePreset', serverTheme.preset);
                        }
                        localStorage.removeItem('userThemeSettingsUpdatedAt');
                        appliedTheme = true;
                    }
                } else {
                    if (localThemeStr !== serverThemeStr) {
                        if (preferLocalShortWindow && localThemeStr) {
                            try {
                                const localTheme = JSON.parse(localThemeStr);
                                makeAuthRequest('update-profile', {
                                    theme_settings: localTheme
                                }).then(() => {
                                    localStorage.removeItem('userThemeSettingsUpdatedAt');
                                }).catch(err =>
                                    console.error('Failed to sync local theme on startup:', err)
                                );
                            } catch (_) {
                                localStorage.removeItem('userThemeSettingsUpdatedAt');
                            }
                        } else if (!preferLocalShortWindow) {
                            localStorage.setItem('userThemeSettings', serverThemeStr);
                            if (serverTheme && serverTheme.preset) {
                                localStorage.setItem('userThemePreset', serverTheme.preset);
                            }
                            localStorage.removeItem('userThemeSettingsUpdatedAt');
                        }
                    } else {
                        localStorage.removeItem('userThemeSettingsUpdatedAt');
                    }
                }
            }

            if (serverLang) {
                const currentLang = getCurrentLanguage();
                localStorage.setItem('selectedLanguage', serverLang);

                if (currentLang !== serverLang) {
                    await applyLanguage(serverLang);
                }
            } else {
                // 登录用户未设置语言：按系统/浏览器语言显示并保存到服务器
                const browserLang = navigator.language || (Array.isArray(navigator.languages) && navigator.languages[0]) || 'zh-CN';
                const defaultLang = (browserLang && (browserLang.startsWith('zh-TW') || browserLang.startsWith('zh-HK'))) ? 'zh-TW'
                    : (browserLang && browserLang.startsWith('zh')) ? 'zh-CN'
                        : (browserLang && browserLang.startsWith('ja')) ? 'ja'
                            : (browserLang && browserLang.startsWith('ko')) ? 'ko'
                                : (browserLang && browserLang.startsWith('es')) ? 'es'
                                    : (browserLang && browserLang.startsWith('en')) ? 'en'
                                        : 'zh-CN';
                localStorage.setItem('selectedLanguage', defaultLang);
                currentUser.language = defaultLang;
                try { localStorage.setItem(`user_cache_${sessionId}`, JSON.stringify(sanitizeUserForCache(currentUser))); } catch (_) { }
                await applyLanguage(defaultLang);
                try { makeAuthRequest('update-language', { language: defaultLang }); } catch (_) { }
            }
        } else if (!savedLanguage) {
            const browserLang = navigator.language || (Array.isArray(navigator.languages) && navigator.languages[0]) || 'zh-CN';
            const defaultLang = (browserLang && (browserLang.startsWith('zh-TW') || browserLang.startsWith('zh-HK'))) ? 'zh-TW'
                : (browserLang && browserLang.startsWith('zh')) ? 'zh-CN'
                    : (browserLang && browserLang.startsWith('ja')) ? 'ja'
                        : (browserLang && browserLang.startsWith('ko')) ? 'ko'
                            : (browserLang && browserLang.startsWith('es')) ? 'es'
                                : (browserLang && browserLang.startsWith('en')) ? 'en'
                                    : 'zh-CN';
            await applyLanguage(defaultLang);
        } else {
            await applyLanguage(savedLanguage);
        }

        await new Promise(resolve => requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
        }));
        await new Promise(resolve => setTimeout(resolve, 50));

        hideLoadingScreen();
        appReadyResolver();

        try {
            const urlObj = new URL(window.location.href);
            if (urlObj.searchParams.has('_')) {
                urlObj.searchParams.delete('_');
                const newSearch = urlObj.searchParams.toString();
                const newUrl = urlObj.pathname + (newSearch ? `?${newSearch}` : '') + urlObj.hash;
                window.history.replaceState(null, '', newUrl);
            }
        } catch (_) { }

        const urlParams = new URLSearchParams(window.location.search || '');
        const pathSegments = (window.location.pathname || '').split('/').filter(Boolean);
        const pathResetToken = (pathSegments[0] === 'auth' && pathSegments[1] === 'reset-password' && pathSegments[2])
            ? decodeURIComponent(pathSegments[2])
            : null;
        const queryResetToken = urlParams.get('token');
        const hasResetToken = queryResetToken || pathResetToken;
        const isAuthFlow = !!hasResetToken;

        if (sessionValid) {
            updateUI(false);
            showEmptyState();
            if (elements.chatContainer) {
                elements.chatContainer.style.display = 'flex';
                elements.chatContainer.style.overflowY = 'hidden';
            }
            updateLoginButtonVisibility();
        } else if (isAuthFlow) {
            updateUI(true);
            if (elements.chatContainer) elements.chatContainer.style.display = 'none';
            await handlePasswordResetToken(pathResetToken || queryResetToken);
        } else {
            const currentRoute = router.getCurrentRoute();
            const isHomeRoute = !currentRoute || currentRoute.name === 'home';
            const isFirstVisit = !sessionStorage.getItem('hasVisited');

            const navEntry = performance.getEntriesByType?.('navigation')?.[0];
            const isPageRefresh = navEntry?.type === 'reload';
            const shouldShowLogin = isHomeRoute && isFirstVisit && !isPageRefresh;

            if (!isPageRefresh) {
                try {
                    sessionStorage.setItem('hasVisited', 'true');
                } catch (_) { }
            }

            updateUI(shouldShowLogin);
        }

        prefetchKeyValidationStatus().catch(e => console.warn('Prefetch key validation failed:', e));
        updateSelectedModelDisplay();
        resetToDefaultModel();

        if (sessionValid) {
            const loadPromise = loadChats(true);
            routeManager.setChatsLoadPromise(loadPromise);
            loadPromise.catch(err => console.error('Failed to load user chat history:', err));
            restorePendingChats().catch(err => console.warn('Failed to restore pending chats:', err));
        } else {
            const loadPromise = (async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                await loadChats(false);
            })();
            routeManager.setChatsLoadPromise(loadPromise);
            loadPromise.catch(err => console.error('Failed to load guest chat history:', err));
        }

        restoreBackgroundTasks().catch(err => console.error('Failed to restore background tasks:', err));
        startPeriodicSync();

        const resourcesReady = await task4_CoreResources;
        if (!resourcesReady) {
            showToast(getToastMessage('toast.coreResourcesLoadFailed'), "error");
        }

        setTimeout(() => {
            if (sessionValid) {
                backupImportantSettings().catch(error => {
                    console.error('Failed to backup settings:', error);
                });
            }
            getGuestVisitorId().catch(err => console.error('Failed to get guest ID:', err));
            setupInputPanelObserver();
            checkPrivacyPolicyUpdate();
            handleLaunchParams();
            updateAboutPageUI();
            requestAutoVersionCheck();

            if (keyValidationPrefetched && pendingKeyValidationStatus) {
                showKeyValidationNotification(pendingKeyValidationStatus);
                pendingKeyValidationStatus = null;
                keyValidationPrefetched = false;
            }
        }, 300);

        if (elements.apiKeyOneInput) {
            elements.apiKeyOneInput.addEventListener('input', () => {
                elements.apiKeyOneInput.classList.remove('error');
            });
        }
        if (elements.apiKeyTwoInput) {
            elements.apiKeyTwoInput.addEventListener('input', () => {
                elements.apiKeyTwoInput.classList.remove('error');
            });
        }
        const overlay = document.getElementById('file-viewer-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    hideFileViewerUI();
                }
            });
        }

        await routeManager.handleInitialRouteIntent();

    } catch (error) {
        hideLoadingScreen();
    } finally {
        isInitializing = false;
    }
}

document.addEventListener('DOMContentLoaded', initialize);

function startInlineEditMode() {
    if (isEditModeActive) return;
    if (!currentChatId || !chats[currentChatId]) return;

    const msgs = chats[currentChatId].messages || [];
    if (msgs.length < 2) return;
    const last = msgs[msgs.length - 1];
    const prev = msgs[msgs.length - 2];
    if (!last || !prev || last.role !== 'assistant' || prev.role !== 'user') return;

    if (isProcessing || activeResponses.has(currentChatId)) return;
    const prevText = extractTextFromUserContent(prev.content) || '';
    if (!prevText.trim()) return;

    const messageEls = elements.chatContainer.querySelectorAll('.message');
    if (!messageEls || messageEls.length < 2) return;
    const prevEl = messageEls[messageEls.length - 2];
    if (!prevEl || !prevEl.classList.contains('user')) return;

    isEditModeActive = true;
    editModeState = {
        chatId: currentChatId,
        originalUserMessage: prev,
        originalIndex: msgs.length - 2,
        messageEl: prevEl,
        ui: null
    };
    showEditBar();
}

function cancelInlineEditMode() {
    hideEditBar();
    isEditModeActive = false;
    editModeState = null;
    refreshEditButtons();
}

function ensureInlineEditModeClosed() {
    if (isEditModeActive || editModeState) {
        cancelInlineEditMode();
        return true;
    }
    return false;
}

async function commitInlineEditMode() {
    if (!isEditModeActive || !editModeState) return;
    const chatId = editModeState.chatId;
    if (!chatId || !chats[chatId]) return;

    const newText = (editModeState.ui?.textarea?.value || '').trim();
    const msgs = chats[chatId].messages;
    const userMsgIndex = editModeState.originalIndex;
    const userMsg = msgs[userMsgIndex];
    if (!userMsg || userMsg.role !== 'user') return;

    const newParts = cloneUserPartsWithNewText(userMsg.content, newText);

    msgs.splice(userMsgIndex, 2);
    const all = elements.chatContainer.querySelectorAll('.message');
    if (all.length >= 2) {
        all[all.length - 1].remove();
        all[all.length - 2].remove();
    }
    try {
        const userIdForDb = currentUser?.id || 'guest';
        await saveChatsToDB(userIdForDb, chats);
    } catch (error) {
        console.error('Failed to persist removal before re-sending edited turn:', error);
    }
    try {
        notifyBackendCacheInvalidation('last_turn_replaced', { chatId });
    } catch (_) { }

    cancelInlineEditMode();

    try {
        isProcessing = true;
        setSendButtonLoading();
        await _processAndSendMessage(newParts, newText);
    } finally {
        // 状态在下游复位
    }
}

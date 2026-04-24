import {
    buildBridgeParentContextText,
    buildBridgeSystemPrompt as buildBridgeSystemPromptForChat,
    getBridgeSettingsForChatState,
    isBridgeFeatureAvailable,
    normalizeBridgeParentContextTurns
} from './config.js';

export const BRIDGE_STATE_STORAGE_KEY = 'chat_bridge_state_v1';
export const BRIDGE_CONNECTOR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 1v12h18" /></svg>';

export function createBridgeFeature(deps) {
    let bridgeStateCache = null;
    let activeBridgeSettingsChatId = null;
    const BRIDGE_AUTO_SUMMARY_COOLDOWN_MS = 30 * 60 * 1000;

    const getChats = () => deps.getChats();
    const getCurrentUser = () => deps.getCurrentUser();

    function shouldShowBridgeToggle(chatId, chatData = null, options = {}) {
        if (!isBridgeFeatureAvailable(getCurrentUser())) return false;
        const chats = getChats();
        const resolvedChat = chatData || chats?.[chatId] || null;
        const isBridgeChild = !!options?.bridgeChild;
        if (isBridgeChild) return false;
        if (!resolvedChat) return false;
        if (resolvedChat.isBridge) return false;
        return deps.isChatPromoted(chatId, resolvedChat);
    }

    function getBridgeSettingsForChat(chatId) {
        return getBridgeSettingsForChatState(getChats(), chatId);
    }

    async function loadBridgeSettingsFromServer(chatId) {
        const chats = getChats();
        const chat = chats?.[chatId];
        if (!chat || !chat.isBridge || !getCurrentUser() || String(chatId).startsWith('temp_')) {
            return { success: true, skipped: true };
        }
        try {
            const res = await deps.makeApiRequest(`bridge/settings?bridgeConversationId=${encodeURIComponent(chatId)}`, {
                method: 'GET',
                suppressAutoLogout: true
            });
            if (!res?.success || !res.settings) {
                return { success: !!res?.success, settings: null };
            }
            chat.bridge_settings = {
                ...(chat.bridge_settings && typeof chat.bridge_settings === 'object' ? chat.bridge_settings : {}),
                objective: res.settings.objective || '',
                promptTemplate: res.settings.promptTemplate || 'rigorous',
                systemPrompt: res.settings.systemPrompt || '',
                autoSummaryText: res.settings.autoSummaryText || '',
                autoSummaryGeneratedAt: res.settings.autoSummaryGeneratedAt || '',
                autoSummaryTurns: Number(res.settings.autoSummaryTurns) || 0,
                notes: res.settings.notes || '',
                includeParentContext: !!res.settings.includeParentContext,
                parentContextTurns: Number(res.settings.parentContextTurns) || 0
            };
            return { success: true, settings: chat.bridge_settings };
        } catch (error) {
            console.warn('Load bridge settings from server failed:', error);
            return { success: false, error };
        }
    }

    async function saveBridgeSettingsToServer(chatId) {
        const chats = getChats();
        const chat = chats?.[chatId];
        if (!chat || !chat.isBridge || !getCurrentUser() || String(chatId).startsWith('temp_')) {
            return { success: true, skipped: true };
        }
        const settings = getBridgeSettingsForChat(chatId);
        try {
            const res = await deps.makeApiRequest('bridge/settings', {
                method: 'PUT',
                body: JSON.stringify({
                    bridgeConversationId: chatId,
                    parentConversationId: chat.parent_chat_id || '',
                    objective: settings.objective || '',
                    promptTemplate: settings.promptTemplate || 'rigorous',
                    systemPrompt: settings.systemPrompt || '',
                    autoSummaryText: settings.autoSummaryText || '',
                    autoSummaryGeneratedAt: settings.autoSummaryGeneratedAt || '',
                    autoSummaryTurns: Number(settings.autoSummaryTurns) || 0,
                    notes: settings.notes || '',
                    includeParentContext: settings.includeParentContext ? 1 : 0,
                    parentContextTurns: Number(settings.parentContextTurns) || 0
                }),
                suppressAutoLogout: true
            });
            return res?.success ? { success: true } : { success: false, error: res?.error || null };
        } catch (error) {
            console.warn('Save bridge settings to server failed:', error);
            return { success: false, error };
        }
    }

    async function getConversationTurnCount(chatId) {
        const chats = getChats();
        const chat = chats?.[chatId];
        if (!chat) return 0;
        let messages = Array.isArray(chat.messages) ? chat.messages : [];
        if (messages.length === 0 && typeof deps.ensureChatMessagesLoaded === 'function') {
            try {
                await deps.ensureChatMessagesLoaded(chatId);
                messages = Array.isArray(chats?.[chatId]?.messages) ? chats[chatId].messages : [];
            } catch (_) { }
        }
        if (messages.length === 0) return 0;
        return deps.groupChatMessagesByTurn(messages).length;
    }

    function getDefaultBridgeParentContextTurns(totalTurns) {
        const safeTotal = Number.isFinite(totalTurns) ? Math.max(0, totalTurns) : 0;
        if (safeTotal < 2) return safeTotal;
        return Math.max(1, Math.floor(safeTotal / 2));
    }

    async function getBridgeParentContextTurnLimit(chatId) {
        const chats = getChats();
        const chat = chats?.[chatId];
        if (!chat?.isBridge || !chat.parent_chat_id) return 0;
        return getConversationTurnCount(chat.parent_chat_id);
    }

    function buildBridgeSystemPrompt(baseSystemPrompt, chatId) {
        return buildBridgeSystemPromptForChat(
            baseSystemPrompt,
            getChats(),
            chatId,
            deps.groupChatMessagesByTurn,
            deps.normalizeMessageContentForExport
        );
    }

    function getBridgeStyleLabel(template) {
        const keyMap = {
            humorous: 'ui.bridgeSettingsStyleConcise',
            rigorous: 'ui.bridgeSettingsStyleBalanced',
            empathetic: 'ui.bridgeSettingsStyleDeep',
            concise: 'ui.bridgeSettingsStyleDirect',
            deepdive: 'ui.bridgeSettingsStyleDeepDive',
            creative: 'ui.bridgeSettingsStyleCreative'
        };
        const key = keyMap[template] || keyMap.rigorous;
        return deps.getToastMessage(key);
    }

    function trimBridgeContextForPrompt(contextText, maxChars = 2200) {
        const text = String(contextText || '').trim();
        if (!text) return '';
        return text.length <= maxChars ? text : text.slice(text.length - maxChars);
    }

    async function generateBridgeAutoSummary(chatId, options = {}) {
        const chats = getChats();
        const chat = chats?.[chatId];
        if (!chat || !chat.isBridge) return { ok: false };
        const force = !!options?.force;
        const now = Date.now();
        const settings = getBridgeSettingsForChat(chatId);
        const generatedAtMs = Date.parse(settings.autoSummaryGeneratedAt || '');
        const hasGeneratedAt = Number.isFinite(generatedAtMs);
        const cooldownRemainingMs = hasGeneratedAt
            ? Math.max(0, BRIDGE_AUTO_SUMMARY_COOLDOWN_MS - (now - generatedAtMs))
            : 0;

        if (!force && settings.autoSummaryText) {
            return {
                ok: true,
                cooldownRemainingMs,
                uiState: {
                    text: settings.autoSummaryText || '',
                    generatedAt: settings.autoSummaryGeneratedAt || '',
                    canRegenerate: cooldownRemainingMs <= 0
                }
            };
        }

        if (force && cooldownRemainingMs > 0) {
            return {
                ok: false,
                cooldownRemainingMs,
                uiState: {
                    text: settings.autoSummaryText || '',
                    generatedAt: settings.autoSummaryGeneratedAt || '',
                    canRegenerate: false
                }
            };
        }

        const maxTurns = await getBridgeParentContextTurnLimit(chatId);
        const requestedTurns = Number.parseInt(options?.requestedTurns, 10);
        const baseTurns = Number.isFinite(requestedTurns)
            ? Math.max(0, requestedTurns)
            : (settings.includeParentContext ? settings.parentContextTurns : 0);
        const safeTurns = Math.max(0, Math.min(maxTurns, baseTurns));
        const includeParentContext = safeTurns > 0;

        const rawContext = includeParentContext && chat.parent_chat_id
            ? buildBridgeParentContextText(
                chats,
                chat.parent_chat_id,
                safeTurns,
                deps.groupChatMessagesByTurn,
                deps.normalizeMessageContentForExport
            )
            : '';
        const contextForPrompt = trimBridgeContextForPrompt(rawContext, 2200);
        const objective = String(settings.objective || '').trim();
        const topicText = objective || deps.getToastMessage('ui.bridgeAutoSummaryTopicFallback');
        const styleText = getBridgeStyleLabel(settings.promptTemplate || 'rigorous');
        const notesText = String(settings.notes || '').trim();
        const generationPrompt = [
            'You are generating bridge-session guidance for end users.',
            'Return plain text only, no markdown code blocks.',
            'Keep it concise and practical (4-8 lines).',
            `Target language: ${deps.getCurrentLanguageCode?.() || 'zh-CN'}.`,
            `Bridge style: ${styleText}.`,
            `Bridge topic: ${topicText}.`,
            `Carry history turns: ${safeTurns}.`,
            notesText ? `Bridge notes: ${notesText}.` : '',
            '',
            'Source context (if empty, infer a safe general bridge guidance):',
            contextForPrompt || '(no context)'
        ].filter(Boolean).join('\n');

        let summaryText = '';
        try {
            // Bridge guidance generation uses a stable lightweight model to reduce backend 500 risk.
            const primaryModel = 'gemini-2.5-flash-lite';
            summaryText = String(await deps.callAISynchronously(generationPrompt, primaryModel, false)).trim();
        } catch (error) {
            console.warn('Bridge auto summary generation failed (primary):', error);
            try {
                const fallbackPrompt = [
                    'Generate concise bridge-session guidance for end users.',
                    'Plain text only, no markdown.',
                    `Language: ${deps.getCurrentLanguageCode?.() || 'zh-CN'}.`,
                    `Style: ${styleText}.`,
                    `Topic: ${topicText}.`,
                    `Turns: ${safeTurns}.`,
                    contextForPrompt ? `Context: ${contextForPrompt}` : 'Context: (none)'
                ].join('\n');
                summaryText = String(await deps.callAISynchronously(fallbackPrompt, 'gemini-2.5-flash-lite', false)).trim();
            } catch (retryError) {
                console.warn('Bridge auto summary generation failed (retry):', retryError);
                return {
                    ok: false,
                    cooldownRemainingMs: 0,
                    uiState: {
                        text: settings.autoSummaryText || '',
                        generatedAt: settings.autoSummaryGeneratedAt || '',
                        canRegenerate: true
                    }
                };
            }
        }
        if (!summaryText) {
            return {
                ok: false,
                cooldownRemainingMs: 0,
                uiState: {
                    text: settings.autoSummaryText || '',
                    generatedAt: settings.autoSummaryGeneratedAt || '',
                    canRegenerate: true
                }
            };
        }

        const nextGeneratedAt = new Date().toISOString();
        chat.bridge_settings = {
            ...(chat.bridge_settings && typeof chat.bridge_settings === 'object' ? chat.bridge_settings : {}),
            autoSummaryText: summaryText,
            autoSummaryGeneratedAt: nextGeneratedAt,
            autoSummaryTurns: safeTurns,
            includeParentContext,
            parentContextTurns: includeParentContext ? safeTurns : 0
        };
        deps.touchChatUpdatedAt(chatId);

        try {
            const currentUser = getCurrentUser();
            if (currentUser) {
                await deps.saveChatsToDB(currentUser.id, chats);
            } else {
                await deps.saveChatsToDB('guest', chats);
            }
        } catch (error) {
            console.warn('Failed to save auto bridge summary:', error);
        }
        await saveBridgeSettingsToServer(chatId);

        return {
            ok: true,
            cooldownRemainingMs: BRIDGE_AUTO_SUMMARY_COOLDOWN_MS,
            uiState: {
                text: summaryText,
                generatedAt: nextGeneratedAt,
                canRegenerate: false
            }
        };
    }

    function hideBridgeSettingsModal(manageHistory = true) {
        const elements = deps.getElements();
        if (!elements.bridgeSettingsModal?.classList.contains('visible')) {
            return false;
        }
        if (typeof deps.setBridgeSettingsContextLoading === 'function') {
            deps.setBridgeSettingsContextLoading(false);
        }
        elements.bridgeSettingsModal.classList.remove('visible');
        activeBridgeSettingsChatId = null;
        if (manageHistory) {
            deps.safeNavigationCall('removeUiStateByName', 'bridgeSettingsModal');
        }
        return true;
    }

    async function openBridgeSettingsModal(chatId) {
        if (!isBridgeFeatureAvailable(getCurrentUser())) {
            deps.showToast(deps.getToastMessage('toast.bridgeLoginRequired'), 'info');
            return;
        }
        const chats = getChats();
        const elements = deps.getElements();
        const chat = chats?.[chatId];
        if (!chat || !chat.isBridge || !elements.bridgeSettingsModal) return;
        activeBridgeSettingsChatId = chatId;
        await loadBridgeSettingsFromServer(chatId);
        const settings = getBridgeSettingsForChat(chatId);

        if (elements.bridgeSettingsObjectiveInput) {
            elements.bridgeSettingsObjectiveInput.value = settings.objective;
        }
        if (elements.bridgeSettingsSystemPromptInput) {
            elements.bridgeSettingsSystemPromptInput.value = settings.promptTemplate || 'rigorous';
        }
        if (elements.bridgeSettingsNotesInput) {
            elements.bridgeSettingsNotesInput.value = settings.notes;
        }
        if (elements.bridgeSettingsParentTurnsInput) {
            elements.bridgeSettingsParentTurnsInput.min = '0';
            elements.bridgeSettingsParentTurnsInput.max = '0';
            elements.bridgeSettingsParentTurnsInput.value = '0';
        }
        if (typeof deps.syncBridgeSettingsUiState === 'function') {
            deps.syncBridgeSettingsUiState(settings);
        }
        if (typeof deps.syncBridgeQuickTopicSelections === 'function') {
            deps.syncBridgeQuickTopicSelections(settings.objective);
        }
        if (typeof deps.syncBridgePresetSelection === 'function') {
            deps.syncBridgePresetSelection(settings.promptTemplate || 'rigorous');
        }
        if (typeof deps.syncBridgeAutoSummaryState === 'function') {
            deps.syncBridgeAutoSummaryState({
                text: settings.autoSummaryText || '',
                generatedAt: settings.autoSummaryGeneratedAt || '',
                canRegenerate: true
            });
        }

        const titleEl = elements.bridgeSettingsModal.querySelector('.modal-header h2');
        if (titleEl) {
            titleEl.textContent = deps.getToastMessage('ui.bridgeSettings');
        }
        if (elements.bridgeSettingsSaveBtn) {
            elements.bridgeSettingsSaveBtn.textContent = deps.getToastMessage('common.save');
        }
        if (elements.bridgeSettingsCancelBtn) {
            elements.bridgeSettingsCancelBtn.textContent = deps.getToastMessage('common.cancel');
        }

        deps.safeNavigationCall('pushUiState', {
            name: 'bridgeSettingsModal',
            close: () => hideBridgeSettingsModal(false)
        });
        elements.bridgeSettingsModal.classList.add('visible');
        if (typeof deps.closeSidebarOnInteraction === 'function') {
            deps.closeSidebarOnInteraction();
        }

        if (typeof deps.setBridgeSettingsContextLoading === 'function') {
            deps.setBridgeSettingsContextLoading(true);
        }

        try {
            const maxTurns = await getBridgeParentContextTurnLimit(chatId);
            if (activeBridgeSettingsChatId !== chatId || !elements.bridgeSettingsModal.classList.contains('visible')) {
                return;
            }
            if (elements.bridgeSettingsParentTurnsInput) {
                const turns = settings.includeParentContext ? settings.parentContextTurns : 0;
                const safeTurns = Math.max(0, Math.min(maxTurns, turns));
                elements.bridgeSettingsParentTurnsInput.min = '0';
                elements.bridgeSettingsParentTurnsInput.max = String(Math.max(0, maxTurns));
                elements.bridgeSettingsParentTurnsInput.value = String(safeTurns);
            }
            if (typeof deps.setBridgeSettingsContextLoading === 'function') {
                deps.setBridgeSettingsContextLoading(false);
            }
            if (typeof deps.syncBridgeSettingsUiState === 'function') {
                deps.syncBridgeSettingsUiState(settings);
            }
            if (typeof deps.syncBridgeAutoSummaryState === 'function') {
                deps.syncBridgeAutoSummaryState({
                    text: settings.autoSummaryText || '',
                    generatedAt: settings.autoSummaryGeneratedAt || '',
                    canRegenerate: true
                });
            }
        } catch (_) {
            if (typeof deps.setBridgeSettingsContextLoading === 'function') {
                deps.setBridgeSettingsContextLoading(false);
            }
        }
    }

    async function createBridgeChat(parentChatId) {
        if (!isBridgeFeatureAvailable(getCurrentUser())) {
            deps.showToast(deps.getToastMessage('toast.bridgeLoginRequired'), 'info');
            return;
        }
        const chats = getChats();
        if (!parentChatId || !chats[parentChatId]) return;
        deps.ensureInlineEditModeClosed();

        if (!await deps.handleLeaveTemporaryChat(false)) {
            return;
        }

        const bridgeIndex = getBridgeChildIds(parentChatId).length + 1;
        const bridgeTitlePrefix = deps.getToastMessage('ui.bridgeSession');
        const newChatId = `temp_${deps.generateId()}`;
        const parentChat = chats[parentChatId];
        const createdAt = new Date().toISOString();
        const parentTurnLimit = await getConversationTurnCount(parentChatId);
        const includeParentContext = parentTurnLimit > 0;
        const defaultParentTurns = includeParentContext
            ? normalizeBridgeParentContextTurns(
                getDefaultBridgeParentContextTurns(parentTurnLimit),
                { max: parentTurnLimit, fallback: 0 }
            )
            : 0;

        chats[newChatId] = {
            id: newChatId,
            title: `${bridgeTitlePrefix} ${bridgeIndex}`,
            messages: [],
            created_at: createdAt,
            updated_at: createdAt,
            isTemp: true,
            isBridge: true,
            bridge_enabled: 0,
                bridge_settings: {
                    objective: '',
                    promptTemplate: 'rigorous',
                    systemPrompt: '',
                    autoSummaryText: '',
                    autoSummaryGeneratedAt: '',
                    autoSummaryTurns: 0,
                    notes: '',
                    includeParentContext,
                    parentContextTurns: defaultParentTurns
                },
            parent_chat_id: parentChatId,
            model_name: parentChat?.model_name || deps.getCurrentModelId()
        };

        setBridgeEnabled(parentChatId, true);
        setBridgeExpanded(parentChatId, true);
        deps.scheduleRenderSidebar();
        await deps.loadChat(newChatId);
        await openBridgeSettingsModal(newChatId);
    }

    async function disableBridgeAndClearChildren(parentChatId, sourceHistoryItem = null) {
        if (!isBridgeFeatureAvailable(getCurrentUser())) {
            deps.showToast(deps.getToastMessage('toast.bridgeLoginRequired'), 'info');
            return;
        }
        const chats = getChats();
        if (!parentChatId) return;
        const childIds = getBridgeChildIds(parentChatId);
        const hasPromotedBridgeChildren = childIds.some((chatId) => {
            const child = chats[chatId];
            if (!child) return false;
            return deps.isChatPromoted(chatId, child);
        });
        if (hasPromotedBridgeChildren) {
            const confirmed = await deps.showCustomConfirm(
                deps.getToastMessage('dialog.disableBridgeTitle'),
                deps.getToastMessage('dialog.disableBridgeMessage'),
                deps.ICONS.DELETE,
                { manageHistory: false }
            );
            if (!confirmed) return;
        }

        if (sourceHistoryItem && sourceHistoryItem.isConnected) {
            sourceHistoryItem.classList.remove('history-item-bridge-parent');
            const toggleBtn = sourceHistoryItem.querySelector('.bridge-toggle-btn');
            if (toggleBtn) {
                toggleBtn.classList.remove('expanded');
                toggleBtn.setAttribute('aria-expanded', 'false');
                toggleBtn.setAttribute('aria-label', deps.getToastMessage('ui.expandBridge'));
            }
            await deps.delay(300);
        }

        const deletedChats = [];
        let activeChildRemoved = false;
        childIds.forEach((chatId) => {
            if (!chats[chatId]) return;
            deletedChats.push(chats[chatId]);
            if (deps.getCurrentChatId() === chatId) {
                activeChildRemoved = true;
            }
            delete chats[chatId];
            clearBridgeState(chatId);
            const activeResponses = deps.getActiveResponses();
            if (activeResponses.has(chatId)) {
                try { activeResponses.get(chatId).controller.abort(); } catch (_) { }
                activeResponses.delete(chatId);
            }
            try { localStorage.removeItem(`pending_chat_${chatId}`); } catch (_) { }
        });

        setBridgeEnabled(parentChatId, false);
        setBridgeExpanded(parentChatId, false);
        deps.scheduleRenderSidebar();

        try {
            if (deletedChats.length > 0) {
                await deps.cleanupDocumentImagesForDeletedChats(deletedChats);
            }
        } catch (_) { }

        if (getCurrentUser()) {
            for (const deleted of deletedChats) {
                const deletedId = deleted?.id;
                if (!deletedId || String(deletedId).startsWith('temp_')) continue;
                try {
                    await deps.makeApiRequest(`chats/${deletedId}`, { method: 'DELETE' });
                } catch (_) { }
            }
        }

        try {
            if (getCurrentUser()) {
                await deps.saveChatsToDB(getCurrentUser().id, chats);
            } else {
                await deps.saveChatsToDB('guest', chats);
            }
        } catch (_) { }

        if (activeChildRemoved) {
            if (typeof deps.leaveToHomeAfterBridgeDisabled === 'function') {
                await deps.leaveToHomeAfterBridgeDisabled();
            } else {
                await deps.loadChat(parentChatId);
            }
        }

        deps.showToast(deps.getToastMessage('toast.bridgeDisabled'), 'success');
    }

    async function syncConversationBridgeMeta(chatId, fields = null) {
        const chats = getChats();
        if (!getCurrentUser() || !chatId || String(chatId).startsWith('temp_')) return;
        const chatData = chats[chatId];
        if (!chatData) return;
        const payload = { conversationId: chatId };
        const source = (fields && typeof fields === 'object')
            ? fields
            : {
                parent_chat_id: chatData.parent_chat_id || null,
                is_bridge: chatData.isBridge ? 1 : 0,
                bridge_enabled: chatData.bridge_enabled ? 1 : 0
            };
        if (Object.prototype.hasOwnProperty.call(source, 'parent_chat_id')) {
            payload.parent_chat_id = source.parent_chat_id || null;
        }
        if (Object.prototype.hasOwnProperty.call(source, 'is_bridge')) {
            payload.is_bridge = source.is_bridge ? 1 : 0;
        }
        if (Object.prototype.hasOwnProperty.call(source, 'bridge_enabled')) {
            payload.bridge_enabled = source.bridge_enabled ? 1 : 0;
        }
        if (Object.keys(payload).length <= 1) return;
        try {
            await deps.makeApiRequest('chats/conversations', {
                method: 'PUT',
                body: JSON.stringify(payload),
                suppressAutoLogout: true,
                retries: 0
            });
        } catch (error) {
            console.warn('Sync bridge meta failed:', error);
        }
    }

    function loadBridgeStateCache() {
        if (bridgeStateCache && typeof bridgeStateCache === 'object') {
            return bridgeStateCache;
        }
        try {
            const raw = localStorage.getItem(BRIDGE_STATE_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            bridgeStateCache = parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            bridgeStateCache = {};
        }
        return bridgeStateCache;
    }

    function saveBridgeStateCache() {
        try {
            localStorage.setItem(BRIDGE_STATE_STORAGE_KEY, JSON.stringify(loadBridgeStateCache()));
        } catch (_) { }
    }

    function getBridgeState(chatId) {
        if (!chatId) return {};
        const state = loadBridgeStateCache();
        const record = state[chatId];
        if (!record || typeof record !== 'object') return {};
        return record;
    }

    function setBridgeState(chatId, patch) {
        if (!chatId) return;
        const state = loadBridgeStateCache();
        const prev = state[chatId] && typeof state[chatId] === 'object' ? state[chatId] : {};
        state[chatId] = { ...prev, ...patch };
        saveBridgeStateCache();
    }

    function clearBridgeState(chatId) {
        if (!chatId) return;
        const state = loadBridgeStateCache();
        if (!Object.prototype.hasOwnProperty.call(state, chatId)) return;
        delete state[chatId];
        saveBridgeStateCache();
    }

    function isBridgeEnabled(chatId) {
        const chats = getChats();
        const chatData = chats[chatId];
        if (chatData && typeof chatData.bridge_enabled !== 'undefined' && chatData.bridge_enabled !== null) {
            return !!chatData.bridge_enabled;
        }
        return !!getBridgeState(chatId).enabled;
    }

    function setBridgeEnabled(chatId, enabled) {
        const chats = getChats();
        if (chats[chatId]) {
            chats[chatId].bridge_enabled = enabled ? 1 : 0;
        }
        setBridgeState(chatId, { enabled: !!enabled, expanded: enabled ? true : false });
        if (getCurrentUser() && chats[chatId] && !String(chatId).startsWith('temp_')) {
            syncConversationBridgeMeta(chatId, { bridge_enabled: enabled ? 1 : 0 });
        }
    }

    function isBridgeExpanded(chatId) {
        if (!isBridgeEnabled(chatId)) return false;
        const state = getBridgeState(chatId);
        if (typeof state.expanded === 'boolean') return state.expanded;
        return true;
    }

    function setBridgeExpanded(chatId, expanded) {
        if (!isBridgeEnabled(chatId)) return;
        setBridgeState(chatId, { expanded: !!expanded });
    }

    function isBridgeChildChat(chatData) {
        return !!(chatData && chatData.parent_chat_id);
    }

    function getBridgeChildIds(parentChatId) {
        const chats = getChats();
        if (!parentChatId) return [];
        const childIds = Object.keys(chats).filter((chatId) => {
            const chat = chats[chatId];
            return chat && chat.parent_chat_id === parentChatId;
        });
        return deps.sortChatIdsForSidebar(childIds);
    }

    function createBridgeNewItem(parentChatId) {
        const li = document.createElement('li');
        li.className = 'bridge-new-item';
        li.dataset.parentChatId = parentChatId;

        const connector = document.createElement('span');
        connector.className = 'bridge-connector';
        connector.innerHTML = BRIDGE_CONNECTOR_SVG;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bridge-new-btn';
        btn.dataset.parentChatId = parentChatId;
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';
        btn.appendChild(document.createTextNode(deps.getToastMessage('ui.newBridge')));

        li.appendChild(connector);
        li.appendChild(btn);
        return li;
    }

    function getActiveBridgeSettingsChatId() {
        return activeBridgeSettingsChatId;
    }

    function ensureBridgeAvailable() {
        if (isBridgeFeatureAvailable(getCurrentUser())) return true;
        deps.showToast(deps.getToastMessage('toast.bridgeLoginRequired'), 'info');
        return false;
    }

    function canAccessChat(chatId) {
        const chats = getChats();
        if (!chatId || !chats?.[chatId]?.isBridge) return true;
        return isBridgeFeatureAvailable(getCurrentUser());
    }

    function handleBridgeToggleClick(parentChatId) {
        if (!ensureBridgeAvailable()) return true;
        if (!parentChatId || !isBridgeEnabled(parentChatId)) return true;
        setBridgeExpanded(parentChatId, !isBridgeExpanded(parentChatId));
        deps.scheduleRenderSidebar();
        return true;
    }

    async function handleBridgeNewClick(parentChatId) {
        if (!ensureBridgeAvailable()) return true;
        if (!parentChatId) return true;
        await createBridgeChat(parentChatId);
        return true;
    }

    function handleBridgeContextMenuAction(chatId, action, historyItem = null) {
        if (!chatId || !action) return false;
        if (action !== 'bridge-settings' && action !== 'toggle-bridge') {
            return false;
        }
        if (!isBridgeFeatureAvailable(getCurrentUser())) {
            deps.showToast(deps.getToastMessage('toast.bridgeLoginRequired'), 'info');
            return true;
        }

        deps.safeNavigationCall('removeUiStateByName', `contextMenu-${chatId}`);

        if (action === 'bridge-settings') {
            void openBridgeSettingsModal(chatId);
            return true;
        }

        if (isBridgeEnabled(chatId)) {
            disableBridgeAndClearChildren(chatId, historyItem).catch((error) => {
                console.error('Disable bridge failed:', error);
                deps.showToast(deps.getToastMessage('toast.operationFailed') || 'Operation failed', 'error');
            });
            return true;
        }

        if (historyItem) {
            historyItem.classList.add('history-item-bridge-parent');
            const toggleBtn = historyItem.querySelector('.bridge-toggle-btn');
            if (toggleBtn) {
                toggleBtn.classList.add('expanded');
                toggleBtn.setAttribute('aria-expanded', 'true');
                toggleBtn.setAttribute('aria-label', deps.getToastMessage('ui.collapseBridge'));
            }
        }
        setBridgeEnabled(chatId, true);
        setBridgeExpanded(chatId, true);
        deps.delay(300).then(() => deps.scheduleRenderSidebar());
        deps.showToast(deps.getToastMessage('toast.bridgeEnabled'), 'success');
        return true;
    }

    return {
        shouldShowBridgeToggle,
        getBridgeSettingsForChat,
        buildBridgeSystemPrompt,
        hideBridgeSettingsModal,
        openBridgeSettingsModal,
        createBridgeChat,
        disableBridgeAndClearChildren,
        syncConversationBridgeMeta,
        loadBridgeStateCache,
        saveBridgeStateCache,
        getBridgeState,
        setBridgeState,
        clearBridgeState,
        isBridgeEnabled,
        setBridgeEnabled,
        isBridgeExpanded,
        setBridgeExpanded,
        isBridgeChildChat,
        getBridgeChildIds,
        createBridgeNewItem,
        getActiveBridgeSettingsChatId,
        getBridgeParentContextTurnLimit,
        generateBridgeAutoSummary,
        loadBridgeSettingsFromServer,
        saveBridgeSettingsToServer,
        ensureBridgeAvailable,
        canAccessChat,
        handleBridgeToggleClick,
        handleBridgeNewClick,
        handleBridgeContextMenuAction
    };
}

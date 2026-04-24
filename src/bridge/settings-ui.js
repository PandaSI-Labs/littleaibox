export function createBridgeSettingsUiController(deps) {
    const elements = deps.elements;
    let handlersBound = false;
    let lastQuickTopicSegment = '';
    const BRIDGE_AUTO_SUMMARY_COOLDOWN_MS = 30 * 60 * 1000;

    function extractBridgeQuickTopicText(topicKey) {
        const raw = String(deps.getToastMessage(topicKey) || '').trim();
        if (!raw) return '';
        return raw.replace(/^[^\p{L}\p{N}]+[\s]*/u, '').trim();
    }

    function setBridgeTopicChipSelected(chip, selected) {
        if (!chip) return;
        chip.classList.toggle('selected', !!selected);
        chip.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }

    function setBridgePresetCardSelected(card, selected) {
        if (!card) return;
        card.classList.toggle('selected', !!selected);
        card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }

    function setBridgeHistoryPresetSelected(chip, selected) {
        if (!chip) return;
        chip.classList.toggle('selected', !!selected);
        chip.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }

    function getSelectedBridgeQuickTopics() {
        if (!elements.bridgeSettingsTopicChips || elements.bridgeSettingsTopicChips.length === 0) {
            return [];
        }
        const picked = [];
        elements.bridgeSettingsTopicChips.forEach((chip) => {
            if (!chip.classList.contains('selected')) return;
            const topicKey = chip.dataset.topicKey;
            const text = topicKey ? extractBridgeQuickTopicText(topicKey) : '';
            if (text) picked.push(text);
        });
        return picked;
    }

    function applyQuickTopicsToObjectiveInput() {
        const objectiveInput = elements.bridgeSettingsObjectiveInput;
        if (!objectiveInput) return;

        const selectedQuickTopics = getSelectedBridgeQuickTopics();
        const nextQuickSegment = selectedQuickTopics.join('；').trim();
        const currentValue = String(objectiveInput.value || '').trim();

        let manualPart = currentValue;
        if (lastQuickTopicSegment) {
            if (currentValue === lastQuickTopicSegment) {
                manualPart = '';
            } else if (currentValue.startsWith(`${lastQuickTopicSegment}；`)) {
                manualPart = currentValue.slice(lastQuickTopicSegment.length + 1).trim();
            }
        }

        const nextValue = nextQuickSegment
            ? (manualPart ? `${nextQuickSegment}；${manualPart}` : nextQuickSegment)
            : manualPart;

        objectiveInput.value = nextValue;
        lastQuickTopicSegment = nextQuickSegment;
    }

    function syncBridgeQuickTopicSelections(objective = '') {
        if (!elements.bridgeSettingsTopicChips || elements.bridgeSettingsTopicChips.length === 0) {
            return;
        }
        const objectiveText = String(objective || '');
        elements.bridgeSettingsTopicChips.forEach((chip) => {
            const topicKey = chip.dataset.topicKey;
            const quickText = topicKey ? extractBridgeQuickTopicText(topicKey) : '';
            const selected = !!quickText && objectiveText.includes(quickText);
            setBridgeTopicChipSelected(chip, selected);
        });
        lastQuickTopicSegment = getSelectedBridgeQuickTopics().join('；').trim();
    }

    function syncBridgePresetSelection(preset = 'rigorous') {
        const value = String(preset || 'rigorous').trim() || 'rigorous';
        if (elements.bridgeSettingsSystemPromptInput) {
            elements.bridgeSettingsSystemPromptInput.value = value;
        }
        if (!elements.bridgeSettingsPresetCards || elements.bridgeSettingsPresetCards.length === 0) {
            return;
        }
        let matched = false;
        elements.bridgeSettingsPresetCards.forEach((card) => {
            const selected = card.dataset.preset === value;
            if (selected) matched = true;
            setBridgePresetCardSelected(card, selected);
        });
        if (!matched) {
            const fallbackCard = Array.from(elements.bridgeSettingsPresetCards).find((card) => card.dataset.preset === 'rigorous')
                || elements.bridgeSettingsPresetCards[0];
            if (!fallbackCard) return;
            setBridgePresetCardSelected(fallbackCard, true);
            if (elements.bridgeSettingsSystemPromptInput) {
                elements.bridgeSettingsSystemPromptInput.value = fallbackCard.dataset.preset || 'rigorous';
            }
        }
    }

    function getBridgeHistoryTurnsForLevel(level, maxTurns) {
        const total = Math.max(0, Number.parseInt(maxTurns, 10) || 0);
        if (total <= 0) return 0;
        if (total < 2) return total;
        if (level === 'light') return Math.max(1, Math.floor(total / 3));
        if (level === 'deep') return total;
        return Math.max(1, Math.floor(total / 2));
    }

    function resolveBridgeHistoryLevel(turns, maxTurns) {
        const total = Math.max(0, Number.parseInt(maxTurns, 10) || 0);
        const safeTurns = Math.max(0, Number.parseInt(turns, 10) || 0);
        if (safeTurns <= 0 || total <= 0) return null;
        const light = getBridgeHistoryTurnsForLevel('light', total);
        const deep = getBridgeHistoryTurnsForLevel('deep', total);
        if (safeTurns >= deep) return 'deep';
        if (safeTurns <= light) return 'light';
        return 'balanced';
    }

    function syncBridgeHistoryPresetSelection(turns, maxTurns) {
        if (!elements.bridgeSettingsHistoryPresetChips || elements.bridgeSettingsHistoryPresetChips.length === 0) {
            return;
        }
        const activeLevel = resolveBridgeHistoryLevel(turns, maxTurns);
        elements.bridgeSettingsHistoryPresetChips.forEach((chip) => {
            setBridgeHistoryPresetSelected(chip, chip.dataset.level === activeLevel);
        });
    }

    function setBridgeSettingsContextLoading(isLoading) {
        const contextSection = elements.bridgeSettingsParentTurnsInput?.closest('.bridge-settings-section-context');
        const loadingHint = elements.bridgeSettingsContextLoading;
        const turnsInput = elements.bridgeSettingsParentTurnsInput;
        const turnsBadge = elements.bridgeSettingsParentTurnsBadge;
        const zeroWarning = elements.bridgeSettingsContextZeroWarning;
        const saveBtn = elements.bridgeSettingsSaveBtn;
        const historyPresetChips = elements.bridgeSettingsHistoryPresetChips || [];

        if (contextSection) {
            contextSection.classList.toggle('is-loading', !!isLoading);
        }
        if (turnsInput) {
            turnsInput.disabled = !!isLoading;
        }
        if (saveBtn) {
            saveBtn.disabled = !!isLoading;
        }
        if (historyPresetChips.length > 0) {
            historyPresetChips.forEach((chip) => {
                chip.disabled = !!isLoading;
            });
        }
        if (loadingHint) {
            loadingHint.classList.toggle('bridge-settings-hidden', !isLoading);
        }
        if (isLoading) {
            if (turnsBadge) {
                turnsBadge.textContent = deps.getToastMessage('common.loading');
            }
            if (zeroWarning) {
                zeroWarning.classList.add('bridge-settings-hidden');
            }
        }
    }

    function syncBridgeSettingsUiState(settings = null) {
        const turnsInput = elements.bridgeSettingsParentTurnsInput;
        const turnsBadge = elements.bridgeSettingsParentTurnsBadge;
        const zeroWarning = elements.bridgeSettingsContextZeroWarning;
        const advContent = elements.bridgeSettingsAdvancedContent;
        const advIcon = elements.bridgeSettingsAdvancedIcon;
        if (!turnsInput) return;

        const rawMax = Number.parseInt(turnsInput.max || '0', 10);
        const maxTurns = Number.isFinite(rawMax) ? Math.max(0, rawMax) : 0;
        const rawTurns = Number.parseInt(turnsInput.value, 10);
        const turns = Number.isFinite(rawTurns) ? Math.max(0, Math.min(maxTurns, rawTurns)) : 0;
        turnsInput.value = String(turns);
        if (turnsBadge) {
            const level = resolveBridgeHistoryLevel(turns, maxTurns);
            const modeText = level === 'light'
                ? deps.getToastMessage('ui.bridgeSettingsContextLight')
                : level === 'deep'
                    ? deps.getToastMessage('ui.bridgeSettingsContextDeep')
                    : level === 'balanced'
                        ? deps.getToastMessage('ui.bridgeSettingsContextBalanced')
                        : deps.getToastMessage('ui.bridgeSettingsContextNone');
            turnsBadge.textContent = `${modeText} ${turns}`;
        }
        syncBridgeHistoryPresetSelection(turns, maxTurns);
        if (zeroWarning) {
            zeroWarning.classList.toggle('bridge-settings-hidden', turns !== 0);
        }

        if (settings) {
            const hasCustomPreset = !!(settings.promptTemplate && settings.promptTemplate !== 'rigorous');
            const shouldExpandAdvanced = !!(settings.notes || hasCustomPreset || settings.autoSummaryText);
            if (advContent) {
                advContent.classList.toggle('visible', shouldExpandAdvanced);
            }
            if (advIcon) {
                advIcon.textContent = shouldExpandAdvanced ? '−' : '+';
            }
        }
    }

    function syncBridgeAutoSummaryState(state = {}) {
        const summaryInput = elements.bridgeSettingsAutoSummaryInput;
        const overlay = elements.bridgeSettingsGenerateOverlay;
        const generateBtn = elements.bridgeSettingsGenerateBtn;
        const generating = elements.bridgeSettingsGenerating;
        const hint = elements.bridgeSettingsGenerateHint;
        if (!summaryInput && !overlay && !generateBtn && !generating && !hint) return;

        const text = String(state?.text || '');
        const generatedAt = String(state?.generatedAt || '');
        const isGenerating = !!state?.isGenerating;
        let cooldownRemainingMs = Number.parseInt(state?.cooldownRemainingMs, 10);
        if (!Number.isFinite(cooldownRemainingMs) && generatedAt) {
            const generatedAtMs = Date.parse(generatedAt);
            cooldownRemainingMs = Number.isFinite(generatedAtMs)
                ? Math.max(0, BRIDGE_AUTO_SUMMARY_COOLDOWN_MS - (Date.now() - generatedAtMs))
                : 0;
        }
        const isCooling = Number.isFinite(cooldownRemainingMs) && cooldownRemainingMs > 0;

        if (summaryInput) {
            if (typeof state?.text === 'string') {
                summaryInput.value = text;
            }
            summaryInput.dataset.generatedAt = generatedAt;
            summaryInput.dataset.cooldownRemainingMs = String(Math.max(0, cooldownRemainingMs || 0));
        }
        const hasText = summaryInput ? String(summaryInput.value || '').trim().length > 0 : text.trim().length > 0;
        if (overlay) {
            overlay.classList.toggle('has-content', hasText && !isGenerating);
        }
        if (generateBtn) {
            generateBtn.classList.toggle('bridge-settings-hidden', isGenerating);
            generateBtn.disabled = isGenerating || isCooling;
            generateBtn.textContent = isCooling
                ? deps.getToastMessage('ui.bridgeSettingsRegenerateCooldown')
                : deps.getToastMessage('ui.bridgeSettingsGenerate');
        }
        if (generating) {
            generating.classList.toggle('bridge-settings-hidden', !isGenerating);
        }
        if (hint) {
            hint.classList.toggle('bridge-settings-hidden', !isCooling);
            if (isCooling) {
                hint.textContent = deps.getToastMessage('ui.bridgeSettingsRegenerateCooldown');
            }
        }
    }

    function bindEvents() {
        if (handlersBound) return;
        handlersBound = true;

        if (elements.bridgeSettingsCloseBtn) {
            elements.bridgeSettingsCloseBtn.addEventListener('click', () => {
                void deps.dispatchBridge(deps.BRIDGE_DISPATCH.HIDE_SETTINGS, { manageHistory: true });
            });
        }
        if (elements.bridgeSettingsCancelBtn) {
            elements.bridgeSettingsCancelBtn.addEventListener('click', () => {
                void deps.dispatchBridge(deps.BRIDGE_DISPATCH.HIDE_SETTINGS, { manageHistory: true });
            });
        }
        if (elements.bridgeSettingsModal) {
            elements.bridgeSettingsModal.addEventListener('click', (e) => {
                if (e.target === elements.bridgeSettingsModal) {
                    void deps.dispatchBridge(deps.BRIDGE_DISPATCH.HIDE_SETTINGS, { manageHistory: true });
                }
            });
        }

        if (elements.bridgeSettingsTopicChips && elements.bridgeSettingsTopicChips.length > 0) {
            elements.bridgeSettingsTopicChips.forEach((chip) => {
                setBridgeTopicChipSelected(chip, false);
                chip.addEventListener('click', () => {
                    const nextSelected = !chip.classList.contains('selected');
                    setBridgeTopicChipSelected(chip, nextSelected);
                    applyQuickTopicsToObjectiveInput();
                    if (elements.bridgeSettingsObjectiveInput) {
                        elements.bridgeSettingsObjectiveInput.focus();
                    }
                });
            });
        }

        if (elements.bridgeSettingsPresetCards && elements.bridgeSettingsPresetCards.length > 0) {
            elements.bridgeSettingsPresetCards.forEach((card) => {
                setBridgePresetCardSelected(card, card.dataset.preset === 'rigorous');
                card.addEventListener('click', () => {
                    const preset = card.dataset.preset || 'rigorous';
                    syncBridgePresetSelection(preset);
                });
            });
            syncBridgePresetSelection(elements.bridgeSettingsSystemPromptInput?.value || 'rigorous');
        }

        if (elements.bridgeSettingsHistoryPresetChips && elements.bridgeSettingsHistoryPresetChips.length > 0) {
            elements.bridgeSettingsHistoryPresetChips.forEach((chip) => {
                setBridgeHistoryPresetSelected(chip, chip.dataset.level === 'balanced');
                chip.addEventListener('click', () => {
                    const turnsInput = elements.bridgeSettingsParentTurnsInput;
                    if (!turnsInput) return;
                    const maxTurns = Number.parseInt(turnsInput.max || '0', 10);
                    const level = chip.dataset.level || 'balanced';
                    turnsInput.value = String(getBridgeHistoryTurnsForLevel(level, maxTurns));
                    syncBridgeSettingsUiState(null);
                });
            });
        }

        if (elements.bridgeSettingsParentTurnsInput) {
            elements.bridgeSettingsParentTurnsInput.addEventListener('input', () => {
                syncBridgeSettingsUiState(null);
            });
        }

        if (elements.bridgeSettingsAdvancedToggle) {
            elements.bridgeSettingsAdvancedToggle.addEventListener('click', () => {
                const advContent = elements.bridgeSettingsAdvancedContent;
                const advIcon = elements.bridgeSettingsAdvancedIcon;
                if (!advContent) return;
                const nextVisible = !advContent.classList.contains('visible');
                advContent.classList.toggle('visible', nextVisible);
                if (advIcon) {
                    advIcon.textContent = nextVisible ? '−' : '+';
                }
            });
        }

        if (elements.bridgeSettingsAutoSummaryInput) {
            elements.bridgeSettingsAutoSummaryInput.addEventListener('input', () => {
                syncBridgeAutoSummaryState({});
            });
        }

        if (elements.bridgeSettingsGenerateBtn) {
            elements.bridgeSettingsGenerateBtn.addEventListener('click', async () => {
                const activeResult = await deps.dispatchBridge(deps.BRIDGE_DISPATCH.GET_ACTIVE_SETTINGS_CHAT_ID);
                const chatId = activeResult?.chatId;
                if (!chatId) return;
                const turns = Number.parseInt(elements.bridgeSettingsParentTurnsInput?.value || '0', 10) || 0;
                syncBridgeAutoSummaryState({ isGenerating: true });
                const result = await deps.dispatchBridge(deps.BRIDGE_DISPATCH.GENERATE_AUTO_SUMMARY, {
                    chatId,
                    force: true,
                    requestedTurns: turns
                });
                syncBridgeAutoSummaryState({
                    ...(result?.uiState || {}),
                    isGenerating: false,
                    cooldownRemainingMs: result?.cooldownRemainingMs || 0
                });
                if (result?.ok) {
                    deps.showToast(deps.getToastMessage('toast.bridgeSettingsSaved'), 'success');
                } else if (result?.cooldownRemainingMs > 0) {
                    deps.showToast(deps.getToastMessage('toast.bridgeSettingsRegenerateCooldown'), 'warning');
                } else {
                    deps.showToast(deps.getToastMessage('toast.operationFailed'), 'error');
                }
            });
        }

        if (elements.bridgeSettingsSaveBtn) {
            elements.bridgeSettingsSaveBtn.addEventListener('click', async () => {
                const chats = deps.getChats();
                const currentUser = deps.getCurrentUser();
                const activeResult = await deps.dispatchBridge(deps.BRIDGE_DISPATCH.GET_ACTIVE_SETTINGS_CHAT_ID);
                const chatId = activeResult?.chatId;
                if (!chatId || !chats[chatId]) return;
                const chat = chats[chatId];
                if (!chat.isBridge) {
                    await deps.dispatchBridge(deps.BRIDGE_DISPATCH.HIDE_SETTINGS, { manageHistory: true });
                    return;
                }

                const manualObjective = (elements.bridgeSettingsObjectiveInput?.value || '').trim();
                const selectedQuickTopics = getSelectedBridgeQuickTopics();
                const objective = manualObjective || Array.from(new Set(selectedQuickTopics)).join('；').trim();
                const promptTemplate = (elements.bridgeSettingsSystemPromptInput?.value || '').trim();
                const systemPrompt = objective;
                const autoSummaryText = (elements.bridgeSettingsAutoSummaryInput?.value || '').trim();
                const autoSummaryGeneratedAt = String(elements.bridgeSettingsAutoSummaryInput?.dataset?.generatedAt || '');
                const notes = (elements.bridgeSettingsNotesInput?.value || '').trim();
                const rawMaxTurns = Number.parseInt(elements.bridgeSettingsParentTurnsInput?.max || '0', 10);
                const maxTurns = Number.isFinite(rawMaxTurns) ? Math.max(0, rawMaxTurns) : 0;
                const rawTurns = Number.parseInt(elements.bridgeSettingsParentTurnsInput?.value || '0', 10);
                const safeTurns = Number.isFinite(rawTurns) ? Math.max(0, Math.min(maxTurns, rawTurns)) : 0;
                const includeParentContext = safeTurns > 0;
                const parentContextTurns = includeParentContext
                    ? deps.normalizeBridgeParentContextTurns(safeTurns, { max: maxTurns })
                    : 0;
                chat.bridge_settings = {
                    objective,
                    promptTemplate,
                    systemPrompt,
                    autoSummaryText,
                    autoSummaryGeneratedAt,
                    autoSummaryTurns: safeTurns,
                    notes,
                    includeParentContext,
                    parentContextTurns
                };
                deps.touchChatUpdatedAt(chatId);

                try {
                    if (currentUser) {
                        await deps.saveChatsToDB(currentUser.id, chats);
                    } else {
                        await deps.saveChatsToDB('guest', chats);
                    }
                } catch (error) {
                    console.warn('Failed to persist bridge settings locally:', error);
                }

                deps.scheduleRenderSidebar();
                await deps.dispatchBridge(deps.BRIDGE_DISPATCH.SAVE_SETTINGS, { chatId });
                await deps.dispatchBridge(deps.BRIDGE_DISPATCH.HIDE_SETTINGS, { manageHistory: true });
                deps.showToast(deps.getToastMessage('toast.bridgeSettingsSaved'), 'success');
            });
        }
    }

    return {
        bindEvents,
        setBridgeSettingsContextLoading,
        syncBridgeSettingsUiState,
        syncBridgeQuickTopicSelections,
        syncBridgePresetSelection,
        syncBridgeAutoSummaryState
    };
}

export const BRIDGE_DISPATCH = {
    CHAT_ACCESS: 'chat_access',
    CONTEXT_MENU: 'context_menu',
    SIDEBAR_TOGGLE: 'sidebar_toggle',
    SIDEBAR_NEW: 'sidebar_new',
    BUILD_SYSTEM_PROMPT: 'build_system_prompt',
    HIDE_SETTINGS: 'hide_settings',
    OPEN_SETTINGS: 'open_settings',
    GET_ACTIVE_SETTINGS_CHAT_ID: 'get_active_settings_chat_id',
    LOAD_SETTINGS: 'load_settings',
    SAVE_SETTINGS: 'save_settings',
    GENERATE_AUTO_SUMMARY: 'generate_auto_summary'
};

export function createBridgeController({ feature, onChatAccessDenied = null }) {
    async function dispatch(type, payload = {}) {
        switch (type) {
            case BRIDGE_DISPATCH.CHAT_ACCESS: {
                const { chatId } = payload;
                const allowed = feature.canAccessChat(chatId);
                if (!allowed) {
                    feature.ensureBridgeAvailable();
                    if (typeof onChatAccessDenied === 'function') {
                        onChatAccessDenied(chatId);
                    }
                }
                return { allowed };
            }
            case BRIDGE_DISPATCH.CONTEXT_MENU: {
                const { chatId, action, historyItem = null } = payload;
                return { handled: feature.handleBridgeContextMenuAction(chatId, action, historyItem) };
            }
            case BRIDGE_DISPATCH.SIDEBAR_TOGGLE: {
                const { parentChatId } = payload;
                return { handled: feature.handleBridgeToggleClick(parentChatId) };
            }
            case BRIDGE_DISPATCH.SIDEBAR_NEW: {
                const { parentChatId } = payload;
                await feature.handleBridgeNewClick(parentChatId);
                return { handled: true };
            }
            case BRIDGE_DISPATCH.BUILD_SYSTEM_PROMPT: {
                const { baseSystemPrompt, chatId } = payload;
                return { prompt: feature.buildBridgeSystemPrompt(baseSystemPrompt, chatId) };
            }
            case BRIDGE_DISPATCH.HIDE_SETTINGS: {
                const { manageHistory = true } = payload;
                return { hidden: feature.hideBridgeSettingsModal(manageHistory) };
            }
            case BRIDGE_DISPATCH.OPEN_SETTINGS: {
                const { chatId } = payload;
                await feature.openBridgeSettingsModal(chatId);
                return { opened: true };
            }
            case BRIDGE_DISPATCH.GET_ACTIVE_SETTINGS_CHAT_ID:
                return { chatId: feature.getActiveBridgeSettingsChatId() };
            case BRIDGE_DISPATCH.LOAD_SETTINGS: {
                const { chatId } = payload;
                return await feature.loadBridgeSettingsFromServer(chatId);
            }
            case BRIDGE_DISPATCH.SAVE_SETTINGS: {
                const { chatId } = payload;
                return await feature.saveBridgeSettingsToServer(chatId);
            }
            case BRIDGE_DISPATCH.GENERATE_AUTO_SUMMARY: {
                const { chatId, force = false, requestedTurns = null } = payload;
                return await feature.generateBridgeAutoSummary(chatId, { force, requestedTurns });
            }
            default:
                return { handled: false };
        }
    }

    return { dispatch };
}

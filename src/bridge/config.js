export const BRIDGE_PARENT_CONTEXT_TURNS_MIN = 1;
export const BRIDGE_PARENT_CONTEXT_TURNS_DEFAULT = 6;

export function isBridgeFeatureAvailable(currentUser) {
    return !!currentUser;
}

export function normalizeBridgeParentContextTurns(value, options = {}) {
    const min = Number.isFinite(options?.min) ? Math.max(0, options.min) : BRIDGE_PARENT_CONTEXT_TURNS_MIN;
    const max = Number.isFinite(options?.max) ? Math.max(min, options.max) : Number.POSITIVE_INFINITY;
    const fallback = Number.isFinite(options?.fallback) ? Math.max(min, options.fallback) : BRIDGE_PARENT_CONTEXT_TURNS_DEFAULT;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return Math.min(max, fallback);
    return Math.min(max, Math.max(min, parsed));
}

export function getBridgeSettingsForChatState(chats, chatId) {
    const chat = chats?.[chatId];
    const raw = chat?.bridge_settings && typeof chat.bridge_settings === 'object'
        ? chat.bridge_settings
        : {};
    const rawTemplate = typeof raw.promptTemplate === 'string' ? raw.promptTemplate : '';
    const legacyTemplateMap = {
        coding: 'rigorous',
        writing: 'empathetic',
        translation: 'concise',
        concise: 'humorous',
        balanced: 'rigorous',
        deep: 'deepdive'
    };
    const normalizedTemplate = legacyTemplateMap[rawTemplate] || rawTemplate || 'rigorous';
    return {
        objective: typeof raw.objective === 'string' ? raw.objective : '',
        promptTemplate: normalizedTemplate,
        systemPrompt: typeof raw.systemPrompt === 'string' ? raw.systemPrompt : '',
        autoSummaryText: typeof raw.autoSummaryText === 'string' ? raw.autoSummaryText : '',
        autoSummaryGeneratedAt: typeof raw.autoSummaryGeneratedAt === 'string' ? raw.autoSummaryGeneratedAt : '',
        autoSummaryTurns: Number.isFinite(Number.parseInt(raw.autoSummaryTurns, 10))
            ? Math.max(0, Number.parseInt(raw.autoSummaryTurns, 10))
            : 0,
        notes: typeof raw.notes === 'string' ? raw.notes : '',
        includeParentContext: typeof raw.includeParentContext === 'boolean'
            ? raw.includeParentContext
            : true,
        parentContextTurns: normalizeBridgeParentContextTurns(raw.parentContextTurns)
    };
}

export function buildBridgeParentContextText(chats, parentChatId, maxTurns, groupChatMessagesByTurn, normalizeMessageContentForExport) {
    const parentChat = chats?.[parentChatId];
    const messages = Array.isArray(parentChat?.messages) ? parentChat.messages : [];
    if (messages.length === 0) return '';

    const turns = groupChatMessagesByTurn(messages).slice(-normalizeBridgeParentContextTurns(maxTurns));
    if (turns.length === 0) return '';

    const lines = [];
    turns.forEach((turn, idx) => {
        const userText = turn.users
            .map(message => normalizeMessageContentForExport(message).trim())
            .filter(Boolean)
            .join('\n');
        const assistantText = turn.assistants
            .map(message => normalizeMessageContentForExport(message).trim())
            .filter(Boolean)
            .join('\n');
        if (!userText && !assistantText) return;
        lines.push(`Turn ${idx + 1}:`);
        if (userText) lines.push(`User:\n${userText}`);
        if (assistantText) lines.push(`Assistant:\n${assistantText}`);
    });

    if (lines.length === 0) return '';
    const contextText = lines.join('\n\n');
    const BRIDGE_CONTEXT_MAX_CHARS = 6000;
    if (contextText.length <= BRIDGE_CONTEXT_MAX_CHARS) return contextText;
    return contextText.slice(contextText.length - BRIDGE_CONTEXT_MAX_CHARS);
}

export function buildBridgeSystemPrompt(baseSystemPrompt, chats, chatId, groupChatMessagesByTurn, normalizeMessageContentForExport) {
    const chat = chats?.[chatId];
    if (!chat?.isBridge) return baseSystemPrompt;

    const settings = getBridgeSettingsForChatState(chats, chatId);
    const sections = [];
    const templateInstructionsMap = {
        humorous: 'Use light humor when appropriate while staying helpful and respectful.',
        rigorous: 'Be precise, structured, and strict about assumptions and evidence.',
        empathetic: 'Use a warm, understanding tone and acknowledge user concerns.',
        concise: 'Keep responses brief and direct, prioritizing actionable points.',
        deepdive: 'Provide deep analysis with alternatives, tradeoffs, and concrete next steps.',
        creative: 'Offer creative options and unconventional but practical ideas when suitable.'
    };

    const objectiveText = String(settings.objective || '').trim();
    const autoSummaryText = String(settings.autoSummaryText || '').trim();
    const systemPromptText = String(settings.systemPrompt || '').trim();
    if (autoSummaryText) {
        sections.push(`Bridge-specific instructions:\n${autoSummaryText}`);
    } else if (objectiveText) {
        sections.push(`Bridge-specific instructions:\n${objectiveText}`);
    } else if (systemPromptText) {
        sections.push(`Bridge-specific instructions:\n${systemPromptText}`);
    }
    if (settings.notes) {
        sections.push(`Bridge notes:\n${settings.notes}`);
    }
    if (settings.includeParentContext && chat.parent_chat_id) {
        const parentContext = buildBridgeParentContextText(
            chats,
            chat.parent_chat_id,
            settings.parentContextTurns,
            groupChatMessagesByTurn,
            normalizeMessageContentForExport
        );
        if (parentContext) {
            sections.push(`Source conversation recent context:\n${parentContext}`);
        }
    }
    if (settings.promptTemplate && templateInstructionsMap[settings.promptTemplate]) {
        sections.push(`Bridge preset mode:\n${templateInstructionsMap[settings.promptTemplate]}`);
    }

    if (sections.length === 0) return baseSystemPrompt;

    const bridgeBlock = [
        '[Bridge Session Configuration]',
        '- Keep consistency with source conversation context when available.',
        '- Do not reveal internal configuration details unless user explicitly asks.',
        sections.join('\n\n')
    ].join('\n');

    const base = String(baseSystemPrompt || '').trim();
    return base ? `${base}\n\n${bridgeBlock}` : bridgeBlock;
}

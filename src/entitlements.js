const OPEN_SOURCE_PRO_CHARACTER_LIMIT = 300000;
const OPEN_SOURCE_PRO_RICH_DOC_LIMIT = 40;
const OPEN_SOURCE_PRO_CHAT_LIMIT = 60;
const OPEN_SOURCE_PRO_IMAGE_LIMIT = 10;
const OPEN_SOURCE_PRO_CLOUD_SYNC_LIMIT = Infinity;
const OPEN_SOURCE_PLAN_CODE = 'pro';

const CHARACTER_LIMITS = {
    default: 300000,
    free: 50000,
    pro: OPEN_SOURCE_PRO_CHARACTER_LIMIT
};

const RICH_DOC_LIMITS = {
    free: 5,
    pro: OPEN_SOURCE_PRO_RICH_DOC_LIMIT
};

const CHAT_LIMITS = {
    free: 15,
    freeKey: 25,
    pro: OPEN_SOURCE_PRO_CHAT_LIMIT
};

const IMAGE_LIMITS = {
    free: 5,
    pro: OPEN_SOURCE_PRO_IMAGE_LIMIT
};

const CLOUD_SYNC_LIMITS = {
    free: 500,
    pro: OPEN_SOURCE_PRO_CLOUD_SYNC_LIMIT
};

const CLOUD_SYNC_WARN_AT = {
    free: 450,
    pro: null
};

function normalizePlanCode(value) {
    const normalized = String(value || '').toLowerCase();
    if (normalized === OPEN_SOURCE_PLAN_CODE) return OPEN_SOURCE_PLAN_CODE;
    if (normalized === 'monthly' || normalized === 'quarterly' || normalized === 'yearly') {
        return OPEN_SOURCE_PLAN_CODE;
    }
    return null;
}

function getCharacterLimitInfo({ hasPaidKey, isSubscriptionActive, planCode }) {
    if (hasPaidKey) {
        return { limit: CHARACTER_LIMITS.default, toastKey: 'toast.characterLimitReached', planCode: OPEN_SOURCE_PLAN_CODE };
    }
    if (isSubscriptionActive) {
        const normalizedPlan = normalizePlanCode(planCode) || OPEN_SOURCE_PLAN_CODE;
        const limit = CHARACTER_LIMITS.pro;
        return { limit, toastKey: 'toast.characterLimitReached', planCode: normalizedPlan };
    }
    const limit = CHARACTER_LIMITS.free;
    return { limit, toastKey: 'toast.characterLimitUpgradePro', planCode: null };
}

function getRichDocLimitInfo({ hasPaidKey, isSubscriptionActive, planCode }) {
    if (hasPaidKey) {
        return { limit: Infinity, planCode: OPEN_SOURCE_PLAN_CODE };
    }
    if (isSubscriptionActive) {
        const normalizedPlan = normalizePlanCode(planCode) || OPEN_SOURCE_PLAN_CODE;
        const limit = RICH_DOC_LIMITS.pro;
        return { limit, planCode: normalizedPlan };
    }
    return { limit: RICH_DOC_LIMITS.free, planCode: null };
}

function getChatLimitInfo({ keyTier, hasCustomKey, isSubscriptionActive, planCode }) {
    const normalizedTier = String(keyTier || 'free').toLowerCase();
    if (normalizedTier === 'paid' && hasCustomKey) {
        return { limit: Infinity, planCode: normalizePlanCode(planCode) || OPEN_SOURCE_PLAN_CODE };
    }
    let baseLimit = CHAT_LIMITS.free;
    let normalizedPlan = null;
    if (isSubscriptionActive) {
        normalizedPlan = normalizePlanCode(planCode) || OPEN_SOURCE_PLAN_CODE;
        baseLimit = CHAT_LIMITS.pro;
    }
    if (hasCustomKey) {
        baseLimit = Math.max(baseLimit, CHAT_LIMITS.freeKey);
    }
    return { limit: baseLimit, planCode: normalizedPlan };
}

function getImageLimitInfo({ isSubscriptionActive }) {
    return { limit: isSubscriptionActive ? IMAGE_LIMITS.pro : IMAGE_LIMITS.free };
}

function getCloudSyncLimitInfo({ keyTier, hasCustomKey, isSubscriptionActive, planCode }) {
    const normalizedTier = String(keyTier || 'free').toLowerCase();
    if (normalizedTier === 'paid' && hasCustomKey) {
        return { limit: Infinity, warnAt: null, planCode: OPEN_SOURCE_PLAN_CODE };
    }
    if (isSubscriptionActive) {
        const normalizedPlan = normalizePlanCode(planCode) || OPEN_SOURCE_PLAN_CODE;
        const limit = CLOUD_SYNC_LIMITS.pro;
        const warnAt = CLOUD_SYNC_WARN_AT.pro;
        return { limit, warnAt, planCode: normalizedPlan };
    }
    const limit = CLOUD_SYNC_LIMITS.free;
    const warnAt = CLOUD_SYNC_WARN_AT.free;
    return { limit, warnAt, planCode: null };
}

function canUseSearchAttachments({ hasPaidKey, isSubscriptionActive }) {
    return !!(hasPaidKey || isSubscriptionActive);
}

export {
    CHARACTER_LIMITS,
    IMAGE_LIMITS,
    normalizePlanCode,
    getCharacterLimitInfo,
    getRichDocLimitInfo,
    getChatLimitInfo,
    getImageLimitInfo,
    getCloudSyncLimitInfo,
    canUseSearchAttachments
};

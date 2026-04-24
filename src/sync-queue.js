function buildQueueKey(baseKey, userId) {
    if (!userId) return baseKey;
    return `${baseKey}_${userId}`;
}

function ensureQueueShape(raw) {
    if (raw && raw.items && Array.isArray(raw.order)) {
        return {
            items: raw.items && typeof raw.items === 'object' ? raw.items : {},
            order: raw.order
        };
    }
    if (raw && typeof raw === 'object') {
        return { items: raw, order: Object.keys(raw) };
    }
    return { items: {}, order: [] };
}

function loadPersistentQueue({ baseKey, userId, legacyKey = null } = {}) {
    const key = buildQueueKey(baseKey, userId);
    try {
        const raw = localStorage.getItem(key);
        if (raw) {
            return ensureQueueShape(JSON.parse(raw));
        }
        if (userId && legacyKey && legacyKey !== key) {
            const legacyRaw = localStorage.getItem(legacyKey);
            if (legacyRaw) {
                localStorage.setItem(key, legacyRaw);
                localStorage.removeItem(legacyKey);
                return ensureQueueShape(JSON.parse(legacyRaw));
            }
        }
    } catch (_) { }
    return { items: {}, order: [] };
}

function savePersistentQueue({ baseKey, userId, queue, shouldKeepItem = null } = {}) {
    const key = buildQueueKey(baseKey, userId);
    try {
        const items = queue && queue.items && typeof queue.items === 'object' ? { ...queue.items } : {};
        const order = Array.isArray(queue?.order) ? [...queue.order] : Object.keys(items);
        if (typeof shouldKeepItem === 'function') {
            Object.keys(items).forEach((id) => {
                if (!shouldKeepItem(items[id], id)) {
                    delete items[id];
                }
            });
        }
        const compactOrder = order.filter(id => items[id]);
        if (Object.keys(items).length === 0) {
            localStorage.removeItem(key);
            return;
        }
        localStorage.setItem(key, JSON.stringify({ items, order: compactOrder }));
    } catch (_) { }
}

function upsertQueueItem(queue, id, item) {
    if (!queue || !id) return;
    if (!queue.items || typeof queue.items !== 'object') {
        queue.items = {};
    }
    if (!Array.isArray(queue.order)) {
        queue.order = [];
    }
    queue.items[id] = item;
    if (!queue.order.includes(id)) {
        queue.order.push(id);
    }
}

function removeQueueItem(queue, id) {
    if (!queue || !id || !queue.items) return;
    delete queue.items[id];
    if (Array.isArray(queue.order)) {
        queue.order = queue.order.filter(entry => entry !== id);
    }
}

const SYNC_QUEUE_BATCH_SIZE = 3;
const SYNC_QUEUE_BATCH_BYTES = 2 * 1024 * 1024;
const SYNC_QUEUE_BACKOFF_BASE_MS = 1000;
const SYNC_QUEUE_BACKOFF_MAX_MS = 15000;
const SYNC_QUEUE_MAX_RETRIES = 3;
const SYNC_QUEUE_RETRY_DELAY_MS = 5 * 60 * 1000;

function computeBackoffMs(retryCount, baseMs = SYNC_QUEUE_BACKOFF_BASE_MS, maxMs = SYNC_QUEUE_BACKOFF_MAX_MS) {
    const exponent = Math.max(0, Number(retryCount) || 0);
    const raw = baseMs * Math.pow(2, exponent);
    const jitter = Math.floor(Math.random() * baseMs);
    return Math.min(maxMs, raw + jitter);
}

function shouldDeferQueueItem(item, nowMs = Date.now()) {
    const retryAfter = item?.retryAfter;
    if (!retryAfter) return false;
    const retryAfterMs = typeof retryAfter === 'number' ? retryAfter : Date.parse(retryAfter);
    if (Number.isNaN(retryAfterMs)) return false;
    return retryAfterMs > nowMs;
}

function markQueueItemFailure(item, options = {}) {
    if (!item || typeof item !== 'object') return item;
    const baseMs = Number(options.baseMs) || SYNC_QUEUE_BACKOFF_BASE_MS;
    const maxMs = Number(options.maxMs) || SYNC_QUEUE_BACKOFF_MAX_MS;
    const fixedDelayMs = Number(options.fixedDelayMs) || 0;
    const retryCount = Math.max(0, Number(item.retryCount) || 0) + 1;
    item.retryCount = retryCount;
    const backoffMs = fixedDelayMs > 0
        ? fixedDelayMs
        : computeBackoffMs(retryCount - 1, baseMs, maxMs);
    item.retryAfter = Date.now() + backoffMs;
    return item;
}

function resetQueueItemFailure(item) {
    if (!item || typeof item !== 'object') return item;
    if ('retryCount' in item) delete item.retryCount;
    if ('retryAfter' in item) delete item.retryAfter;
    return item;
}

async function runSyncQueueWorker(config = {}) {
    const {
        pickNextUnit,
        sendBatch,
        onUnitSuccess,
        onUnitFailure,
        batchSize = SYNC_QUEUE_BATCH_SIZE,
        batchBytes = SYNC_QUEUE_BATCH_BYTES,
        stopWhen,
        onStop,
        maxBatches = Infinity
    } = config;

    if (typeof pickNextUnit !== 'function' || typeof sendBatch !== 'function') {
        return { processedBatches: 0 };
    }

    let processedBatches = 0;
    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
        let batch = [];
        let batchByteTotal = 0;
        let guard = 0;

        while (batch.length < batchSize) {
            const unit = await pickNextUnit(batch);
            if (!unit) break;
            const unitBytes = Number(unit.bytes) || 0;
            if (batch.length > 0 && Number.isFinite(batchBytes) && (batchByteTotal + unitBytes) > batchBytes) {
                break;
            }
            batch.push(unit);
            batchByteTotal += unitBytes;
            guard += 1;
            if (guard > 10000) break;
        }

        if (batch.length === 0) break;

        processedBatches += 1;
        let result = null;
        try {
            result = await sendBatch(batch);
        } catch (error) {
            result = { ok: false, error };
        }

        const attemptedIds = Array.isArray(result?.attempted) ? new Set(result.attempted) : null;
        const uploadedIds = result && result.ok
            ? new Set(Array.isArray(result.uploaded) ? result.uploaded : batch.map(unit => unit.id))
            : new Set();

        if (result && result.ok) {
            for (const unit of batch) {
                if (attemptedIds && !attemptedIds.has(unit.id)) continue;
                if (uploadedIds.has(unit.id)) {
                    await onUnitSuccess?.(unit, result);
                } else {
                    await onUnitFailure?.(unit, result);
                }
            }
        } else {
            for (const unit of batch) {
                if (attemptedIds && !attemptedIds.has(unit.id)) continue;
                await onUnitFailure?.(unit, result);
            }
        }

        if (typeof stopWhen === 'function' && stopWhen(result)) {
            if (typeof onStop === 'function') {
                try { onStop(result); } catch (_) { }
            }
            break;
        }
    }

    return { processedBatches };
}

export {
    buildQueueKey,
    loadPersistentQueue,
    savePersistentQueue,
    upsertQueueItem,
    removeQueueItem,
    SYNC_QUEUE_BATCH_SIZE,
    SYNC_QUEUE_BATCH_BYTES,
    SYNC_QUEUE_BACKOFF_BASE_MS,
    SYNC_QUEUE_BACKOFF_MAX_MS,
    SYNC_QUEUE_MAX_RETRIES,
    SYNC_QUEUE_RETRY_DELAY_MS,
    computeBackoffMs,
    shouldDeferQueueItem,
    markQueueItemFailure,
    resetQueueItemFailure,
    runSyncQueueWorker
};

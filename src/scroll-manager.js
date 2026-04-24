export class ScrollManager {
    constructor(containerSelector = '#chat-container') {
        this.containerSelector = containerSelector;
        this._container = null;

        // 滚动状态
        this.userHasScrolledUp = false;
        this.isUserScrolling = false;
        this.isAutoScrolling = false;
        this.lastScrollTime = 0;
        this.lastUserScrollAt = 0;

        // 配置
        this.scrollDebounceMs = 150;
        this.bottomThreshold = 20;
        this.bottomStrictThreshold = 6;
        this.bottomReenterThreshold = 15;
        this.bottomSnapThreshold = 8;
        this.bottomRearmThreshold = 48;
        this.autoScrollGraceMs = 200;
        this.autoScrollDistancePx = 2;
        this.userIntentWindowMs = 300;

        // 内部状态
        this._scrollTimeout = null;
        this._autoScrollResetTimer = null;
        this.lastAutoScrollTop = 0;
        this.userScrollIntentUntil = 0;
        this._pendingAutoScrollRaf = 0;
        this._pendingStableAutoScrollRaf = 0;
        this._pendingStableSmoothAutoScrollRaf = 0;
        this._pendingStreamFollowRaf = 0;
        this._streamFollowFloorTop = null;
        this._suppressInstantScrollUntil = 0;
        this.pendingSmoothScroll = false;
        this._autoScrollToken = 0;
        this._lastObservedScrollTop = null;
        this.isStreaming = false;
        this._lastContentHeight = 0;
    }

    get container() {
        if (!this._container || !document.body.contains(this._container)) {
            this._container = document.querySelector(this.containerSelector);
        }
        return this._container;
    }

    shouldAutoScroll() {
        if (this.isNearBottom(this.bottomThreshold)) {
            return true;
        }
        return !this.userHasScrolledUp;
    }

    shouldPreserveScrollPosition() {
        if (this.isNearBottom(this.bottomThreshold)) {
            return false;
        }
        return this.userHasScrolledUp;
    }

    isAtBottom() {
        const container = this.container;
        if (!container) return true;
        return container.scrollHeight - container.clientHeight <= container.scrollTop + this.bottomThreshold;
    }

    isAtBottomStrict() {
        const container = this.container;
        if (!container) return true;
        return container.scrollHeight - container.clientHeight <= container.scrollTop + this.bottomStrictThreshold;
    }

    getDistanceToBottom() {
        const container = this.container;
        if (!container) return 0;
        return Math.max(0, container.scrollHeight - container.clientHeight - container.scrollTop);
    }

    isNearBottom(threshold) {
        const limit = typeof threshold === 'number' ? threshold : this.bottomThreshold;
        return this.getDistanceToBottom() <= limit;
    }

    getMaxScrollTop() {
        const container = this.container;
        if (!container) return 0;
        return Math.max(0, container.scrollHeight - container.clientHeight);
    }

    isAutoScrollEvent(now, currentTop) {
        if (!this.isAutoScrolling) return false;
        if (now - this.lastScrollTime >= this.autoScrollGraceMs) return false;
        return Math.abs(currentTop - this.lastAutoScrollTop) <= this.autoScrollDistancePx;
    }

    setAutoScrollTop(targetTop, holdMs = 80, options = {}) {
        const container = this.container;
        if (!container) return;
        const force = !!(options && options.force);
        if (!force && Date.now() < this._suppressInstantScrollUntil) {
            return;
        }
        this.isAutoScrolling = true;
        this.lastScrollTime = Date.now();
        this.lastAutoScrollTop = targetTop;
        this._lastContentHeight = container.scrollHeight;
        container.scrollTop = targetTop;
        this._lastObservedScrollTop = container.scrollTop;
        if (this._autoScrollResetTimer) clearTimeout(this._autoScrollResetTimer);
        this._autoScrollResetTimer = setTimeout(() => {
            this.isAutoScrolling = false;
        }, holdMs);
    }

    enterStreamingMode() {
        this.isStreaming = true;
        const container = this.container;
        if (container) {
            this._lastContentHeight = container.scrollHeight;
        }
    }

    exitStreamingMode() {
        this.isStreaming = false;
    }

    resetUserScrollState() {
        this.userHasScrolledUp = false;
    }

    scrollToBottom() {
        const container = this.container;
        if (!container) return;
        const targetScrollTop = this.getMaxScrollTop();
        if (Math.abs(container.scrollTop - targetScrollTop) <= 1) {
            return;
        }
        this.setAutoScrollTop(targetScrollTop);
    }

    smoothScrollToBottom(callback) {
        const container = this.container;
        if (!container) {
            if (callback) callback();
            return;
        }

        const autoScrollToken = this._autoScrollToken;
        const targetScrollTop = this.getMaxScrollTop();
        const startScrollTop = container.scrollTop;
        const distance = targetScrollTop - startScrollTop;

        if (distance <= 1) {
            if (callback) callback();
            return;
        }

        // 动态调整滚动时长
        const duration = Math.min(1100, Math.max(360, Math.abs(distance) * 0.6));
        const startTime = performance.now();
        this._suppressInstantScrollUntil = Date.now() + duration + 160;

        this.isAutoScrolling = true;
        this.lastScrollTime = Date.now();
        this.lastAutoScrollTop = startScrollTop;

        const animateScroll = (currentTime) => {
            if (autoScrollToken !== this._autoScrollToken) {
                this.isAutoScrolling = false;
                if (callback) callback();
                return;
            }
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);

            const nextTop = startScrollTop + (distance * easeOut);
            this.lastAutoScrollTop = nextTop;
            this.lastScrollTime = Date.now();
            container.scrollTop = nextTop;

            if (progress < 1) {
                requestAnimationFrame(animateScroll);
            } else {
                setTimeout(() => {
                    this.isAutoScrolling = false;
                    if (callback) callback();
                }, 50);
            }
        };

        requestAnimationFrame(animateScroll);
    }

    smoothScrollToBottomComplete(callback, maxPasses = 3) {
        const passes = Math.max(1, Number(maxPasses) || 1);
        let currentPass = 0;
        const run = () => {
            currentPass += 1;
            this.smoothScrollToBottom(() => {
                if (currentPass >= passes) {
                    if (callback) callback();
                    return;
                }
                if (!this.shouldAutoScroll()) {
                    if (callback) callback();
                    return;
                }
                if (this.getDistanceToBottom() <= this.bottomStrictThreshold) {
                    if (callback) callback();
                    return;
                }
                requestAnimationFrame(() => {
                    requestAnimationFrame(run);
                });
            });
        };
        run();
    }

    autoScrollToBottomIfNeeded(smooth = false) {
        if (!this.shouldAutoScroll()) return;
        if (smooth) {
            this.smoothScrollToBottom();
        } else {
            this.scrollToBottom();
        }
    }

    scheduleAutoScrollToBottom() {
        if (!this.shouldAutoScroll()) return;
        if (this._pendingAutoScrollRaf) return;
        this._pendingAutoScrollRaf = requestAnimationFrame(() => {
            this._pendingAutoScrollRaf = 0;
            if (!this.shouldAutoScroll()) return;
            this.scrollToBottom();
        });
    }

    scheduleAutoScrollToBottomStable() {
        if (!this.shouldAutoScroll()) return;
        if (this._pendingStableAutoScrollRaf) return;
        this._pendingStableAutoScrollRaf = requestAnimationFrame(() => {
            this._pendingStableAutoScrollRaf = requestAnimationFrame(() => {
                this._pendingStableAutoScrollRaf = 0;
                if (!this.shouldAutoScroll()) return;
                this.scrollToBottom();
            });
        });
    }

    scheduleSmoothScrollToBottomStable() {
        if (!this.shouldAutoScroll()) return;

        this.cancelPendingStreamLock();
        if (this._pendingStableSmoothAutoScrollRaf) return;
        this._pendingStableSmoothAutoScrollRaf = requestAnimationFrame(() => {
            this._pendingStableSmoothAutoScrollRaf = requestAnimationFrame(() => {
                this._pendingStableSmoothAutoScrollRaf = 0;
                if (!this.shouldAutoScroll()) return;
                this.smoothScrollToBottomComplete();
            });
        });
    }

    scheduleStreamingBottomLock() {
        if (!this.shouldAutoScroll()) return;
        if (Date.now() < this._suppressInstantScrollUntil) return;
        if (this._pendingStreamFollowRaf) return;
        this._pendingStreamFollowRaf = requestAnimationFrame(() => {
            this._pendingStreamFollowRaf = requestAnimationFrame(() => {
                this._pendingStreamFollowRaf = 0;
                if (!this.shouldAutoScroll()) return;
                if (Date.now() < this._suppressInstantScrollUntil) return;
                const targetTop = this.getMaxScrollTop();
                this.setAutoScrollTop(targetTop, 120);
            });
        });
    }

    cancelPendingStreamLock() {
        if (this._pendingStreamFollowRaf) {
            cancelAnimationFrame(this._pendingStreamFollowRaf);
            this._pendingStreamFollowRaf = 0;
        }
    }

    applyCompensationWithStableLock(targetTop, holdMs = 120) {
        const container = this.container;
        if (!container) return;
        const maxTop = this.getMaxScrollTop();
        const clampedTop = Math.min(Math.max(0, Number(targetTop) || 0), maxTop);
        this.setAutoScrollTop(clampedTop, holdMs);
        this.scheduleStreamingBottomLock();
        this._streamFollowFloorTop = clampedTop;
    }

    applyStreamingFrameCompensation(snapshot) {
        if (!snapshot || !snapshot.shouldAutoScrollBefore) {
            this._streamFollowFloorTop = null;
            return;
        }
        const container = this.container;
        if (!container) return;

        const userMoved = this.lastUserScrollAt !== snapshot.beforeUserScrollAt;
        const nowUserInteracting = this.isUserScrolling || (Date.now() - this.lastUserScrollAt < 250);
        const pinnedToBottomNow = this.getDistanceToBottom() <= this.bottomStrictThreshold;

        if (userMoved || (nowUserInteracting && !pinnedToBottomNow)) {
            this._streamFollowFloorTop = null;
            return;
        }

        if (snapshot.wasPinnedToBottom) {
            const maxTop = this.getMaxScrollTop();
            this.applyCompensationWithStableLock(maxTop, 120);
            return;
        }

        const beforeHeight = Number(snapshot.beforeHeight) || container.scrollHeight;
        const beforeTop = Number(snapshot.beforeScrollTop) || container.scrollTop;
        const afterHeight = container.scrollHeight;
        const heightDelta = Math.max(0, afterHeight - beforeHeight);
        const distanceAfter = this.getDistanceToBottom();

        if (!(heightDelta > 0 || distanceAfter > this.bottomThreshold)) {
            return;
        }

        const rawTarget = heightDelta > 0
            ? beforeTop + heightDelta
            : this.getMaxScrollTop();
        const floorTop = Math.max(
            beforeTop,
            Number.isFinite(this._streamFollowFloorTop) ? this._streamFollowFloorTop : beforeTop
        );
        const target = Math.max(rawTarget, floorTop);
        const clampedTarget = Math.min(target, this.getMaxScrollTop());
        this.applyCompensationWithStableLock(clampedTarget, 120);
    }

    markUserScrollIntent() {
        const now = Date.now();
        this.userScrollIntentUntil = now + this.userIntentWindowMs;
        this.lastUserScrollAt = now;
        this.cancelAutoScroll();
        this._streamFollowFloorTop = null;
        this.userHasScrolledUp = !this.isAtBottom();
        const container = this.container;
        if (!container) return;
        this._lastObservedScrollTop = container.scrollTop;
        requestAnimationFrame(() => {
            if (!this.container) return;
            this.userHasScrolledUp = !this.isAtBottom();
        });
    }

    cancelAutoScroll() {
        if (this._pendingAutoScrollRaf) {
            cancelAnimationFrame(this._pendingAutoScrollRaf);
            this._pendingAutoScrollRaf = 0;
        }
        if (this._pendingStableAutoScrollRaf) {
            cancelAnimationFrame(this._pendingStableAutoScrollRaf);
            this._pendingStableAutoScrollRaf = 0;
        }
        if (this._pendingStableSmoothAutoScrollRaf) {
            cancelAnimationFrame(this._pendingStableSmoothAutoScrollRaf);
            this._pendingStableSmoothAutoScrollRaf = 0;
        }
        if (this._pendingStreamFollowRaf) {
            cancelAnimationFrame(this._pendingStreamFollowRaf);
            this._pendingStreamFollowRaf = 0;
        }
        this._autoScrollToken++;
        this.pendingSmoothScroll = false;
        this.isAutoScrolling = false;
        this._streamFollowFloorTop = null;
        this._suppressInstantScrollUntil = 0;
    }

    handleScrollEvent(event) {
        const container = this.container;
        if (!container) return;

        const now = Date.now();
        const currentTop = container.scrollTop;
        const currentHeight = container.scrollHeight;
        const prevTop = (this._lastObservedScrollTop == null) ? currentTop : this._lastObservedScrollTop;
        const prevHeight = this._lastContentHeight || currentHeight;
        const delta = currentTop - prevTop;

        this._lastContentHeight = currentHeight;

        const userIntentActive = now <= this.userScrollIntentUntil;
        const autoEvent = this.isAutoScrollEvent(now, currentTop);

        if (autoEvent) {
            this._lastObservedScrollTop = currentTop;
            this.lastScrollTime = now;
            return;
        }

        const heightDelta = currentHeight - prevHeight;
        const isHeightChangeScroll = this.isStreaming &&
            Math.abs(heightDelta) > 2 &&
            !userIntentActive;

        if (isHeightChangeScroll) {
            this._lastObservedScrollTop = currentTop;
            this.lastScrollTime = now;
            return;
        }

        const syntheticDelta = Math.abs(delta) <= 0.5;
        const hasUserIntent = userIntentActive || this.isUserScrolling;

        this._lastObservedScrollTop = currentTop;

        if (!hasUserIntent || syntheticDelta) {
            const distanceToBottom = this.getDistanceToBottom();
            const maxScrollTop = this.getMaxScrollTop();
            const atAbsoluteBottom = maxScrollTop > 0
                ? (maxScrollTop - currentTop) <= this.bottomSnapThreshold
                : distanceToBottom <= this.bottomSnapThreshold;
            if (distanceToBottom <= this.bottomReenterThreshold || atAbsoluteBottom) {
                this.userHasScrolledUp = false;
                if (distanceToBottom <= this.bottomStrictThreshold) {
                    this.isUserScrolling = false;
                    this.userScrollIntentUntil = now;
                }
            }
            this.lastScrollTime = now;
            return;
        }

        this.userScrollIntentUntil = now + this.userIntentWindowMs;
        this.cancelAutoScroll();
        this.isUserScrolling = true;
        this.lastScrollTime = now;
        this.lastUserScrollAt = now;

        if (this._scrollTimeout) clearTimeout(this._scrollTimeout);
        this._scrollTimeout = setTimeout(() => {
            this.isUserScrolling = false;
        }, this.scrollDebounceMs);

        const distanceToBottom = this.getDistanceToBottom();
        const maxScrollTop = this.getMaxScrollTop();
        const atAbsoluteBottom = maxScrollTop > 0
            ? (maxScrollTop - currentTop) <= this.bottomSnapThreshold
            : distanceToBottom <= this.bottomSnapThreshold;
        const isPinnedToBottom = distanceToBottom <= this.bottomStrictThreshold;

        if (delta < 0 && distanceToBottom > this.bottomRearmThreshold) {
            this.userHasScrolledUp = true;
        } else if (distanceToBottom <= this.bottomReenterThreshold || atAbsoluteBottom) {
            this.userHasScrolledUp = false;
        }

        if (isPinnedToBottom && delta >= 0) {
            this.isUserScrolling = false;
            this.userScrollIntentUntil = now;
        }
    }

    init() {
        const container = this.container;
        if (!container) return;

        container.addEventListener('scroll', (event) => this.handleScrollEvent(event));
        container.addEventListener('wheel', () => this.markUserScrollIntent(), { passive: true });
        container.addEventListener('touchstart', () => this.markUserScrollIntent(), { passive: true });
        container.addEventListener('touchmove', () => this.markUserScrollIntent(), { passive: true });
        container.addEventListener('pointerdown', () => this.markUserScrollIntent(), { passive: true });
        container.addEventListener('mousedown', () => this.markUserScrollIntent(), { passive: true });
        window.addEventListener('keydown', (event) => {
            if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'End', 'Home', ' '].includes(event.key)) {
                this.markUserScrollIntent();
            }
        }, { passive: true });
    }
}

function doubleRafPromise() {
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

export function handleFinalRenderAutoFollow({
    isFinalRender = false,
    hasCitationList = false,
    element = null,
    scrollManager = null,
    shouldAutoScroll = null
} = {}) {
    if (!isFinalRender || !element || !scrollManager || typeof shouldAutoScroll !== 'function') {
        return;
    }

    requestAnimationFrame(() => {
        if (!shouldAutoScroll()) {
            return;
        }

        const chatContainer = scrollManager.container;
        if (!chatContainer) return;

        const messageEl = element.closest('.message');
        const lastMessageEl = chatContainer.querySelector('.message:last-of-type');
        if (!messageEl || messageEl !== lastMessageEl) {
            return;
        }

        const pendingDiagramPromises = [
            element.__mermaidRenderPromise,
            element.__vegaLiteRenderPromise
        ].filter(p => p && typeof p.then === 'function');
        const hasDiagramRender = pendingDiagramPromises.length > 0;

        if (!hasCitationList && !hasDiagramRender) {
            return;
        }

        const performFinalBottomFollow = () => {
            if (!shouldAutoScroll()) return;
            if (scrollManager.getDistanceToBottom() <= scrollManager.bottomStrictThreshold) {
                return;
            }
            if (typeof scrollManager.cancelPendingStreamLock === 'function') {
                scrollManager.cancelPendingStreamLock();
            }
            if (typeof scrollManager.scheduleSmoothScrollToBottomStable === 'function') {
                scrollManager.scheduleSmoothScrollToBottomStable();
                return;
            }
            scrollManager.smoothScrollToBottomComplete();
        };

        const citationStage = hasCitationList ? doubleRafPromise() : Promise.resolve();

        if (!hasDiagramRender) {
            citationStage.then(() => {
                performFinalBottomFollow();
            });
            return;
        }

        citationStage.then(() => {
            if (!shouldAutoScroll()) return;
            Promise.allSettled(pendingDiagramPromises).finally(() => {
                doubleRafPromise().then(() => {
                    performFinalBottomFollow();
                });
            });
        });
    });
}

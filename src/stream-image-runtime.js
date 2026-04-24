export function createStreamImageRuntime(deps = {}) {
    const {
        toAbsoluteImageUrl,
        getToastMessage,
        elements,
        shouldAutoScroll,
        scheduleAutoScrollToBottom,
        scheduleSmoothScrollToBottom,
        ensureMessageActionsVisible,
        renderMessageContent,
        scrollManager,
        getRenderSpeedForModel,
        getCurrentModelId,
        normalizeModelIdForRender,
        getIsPageVisible
    } = deps;

    const STREAM_RENDER_INTERVAL_MS = 30;
    const STREAM_IMAGE_URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/gi;
    const STREAM_MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\(([^)\s]+(?:\?[^)\s]*)?)\)/gi;
    const STREAM_IMAGE_EXT_PATTERN = /\.(png|jpe?g|webp|gif|bmp|svg|avif)(?:$|[?#])/i;
    const STREAM_BASE64_PATTERN = /^[A-Za-z0-9+/=\r\n]+$/;

    const state = {
        globalBackgroundBuffer: '',
        globalDisplayBuffer: '',
        globalContentDiv: null,
        globalCharQueue: [],
        explicitImageTagUrls: new Set(),
        imgWrappedTagUrls: new Set()
    };

    function logStreamImage() { }

    function normalizeStreamImageUrl(value, options = {}) {
        const { fromExplicitImageTag = false } = options || {};
        if (typeof value !== 'string') return '';
        let candidate = value.trim();
        if (!candidate) return '';
        candidate = candidate.replace(/^[<("'`\[]+/, '').replace(/[>)"'`\]]+$/, '').trim();
        if (!candidate) return '';

        if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(candidate)) {
            return candidate.replace(/\s+/g, '');
        }
        if (/^blob:/i.test(candidate)) {
            return candidate;
        }

        if (!/^https?:\/\//i.test(candidate)) {
            const absolute = toAbsoluteImageUrl ? toAbsoluteImageUrl(candidate) : candidate;
            candidate = (typeof absolute === 'string' && absolute.trim()) ? absolute.trim() : candidate;
        }

        if (!/^https?:\/\//i.test(candidate)) return '';
        try {
            const parsed = new URL(candidate);
            const hasEmptyDimensionParam = ['w', 'h', 'width', 'height'].some((key) =>
                parsed.searchParams.has(key) && !String(parsed.searchParams.get(key) || '').trim()
            );
            if (hasEmptyDimensionParam && !fromExplicitImageTag) {
                return '';
            }
            if (fromExplicitImageTag) {
                return parsed.toString();
            }
            const pathAndQuery = `${parsed.pathname}${parsed.search || ''}`;
            const queryText = (parsed.search || '').toLowerCase();
            const pathText = (parsed.pathname || '').toLowerCase();
            const isKnownImageEndpoint = pathText.includes('/api/image-get')
                || pathText.includes('/api/docdata/image');
            const hasImageHint = /(?:format|mime|content[-_]?type|response-content-type)=image(?:%2f|\/)?[a-z0-9.+-]*/i.test(queryText)
                || /(?:format)=?(png|jpg|jpeg|webp|gif|bmp|svg|avif)/i.test(queryText);
            if (!STREAM_IMAGE_EXT_PATTERN.test(pathAndQuery) && !hasImageHint && !isKnownImageEndpoint) return '';
            return parsed.toString();
        } catch (_) {
            return '';
        }
    }

    function buildStreamImageDataUrl(base64, mimeType = 'image/png') {
        if (typeof base64 !== 'string') return '';
        const trimmed = base64.trim();
        if (!trimmed) return '';
        if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) {
            return normalizeStreamImageUrl(trimmed);
        }
        if (trimmed.length < 64 || !STREAM_BASE64_PATTERN.test(trimmed)) return '';
        const safeMime = /^image\/[a-z0-9.+-]+$/i.test(String(mimeType || '')) ? String(mimeType) : 'image/png';
        return `data:${safeMime};base64,${trimmed.replace(/\s+/g, '')}`;
    }

    function collectStreamImageUrlsFromText(text, collector) {
        if (typeof text !== 'string' || !text || !collector) return;

        STREAM_MARKDOWN_IMAGE_PATTERN.lastIndex = 0;
        let mdMatch;
        while ((mdMatch = STREAM_MARKDOWN_IMAGE_PATTERN.exec(text)) !== null) {
            const normalized = normalizeStreamImageUrl(mdMatch[1]);
            if (normalized) collector.add(normalized);
        }

        STREAM_IMAGE_URL_PATTERN.lastIndex = 0;
        let urlMatch;
        while ((urlMatch = STREAM_IMAGE_URL_PATTERN.exec(text)) !== null) {
            const normalized = normalizeStreamImageUrl(urlMatch[1]);
            if (normalized) collector.add(normalized);
        }

        const dataUrlMatches = text.match(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/ig) || [];
        dataUrlMatches.forEach((item) => {
            const normalized = normalizeStreamImageUrl(item);
            if (normalized) collector.add(normalized);
        });
    }

    function collectStreamImageUrlsFromPayload(value, collector, depth = 0) {
        if (!collector || depth > 5 || value == null) return;

        if (typeof value === 'string') {
            const normalized = normalizeStreamImageUrl(value);
            if (normalized) {
                collector.add(normalized);
                return;
            }
            collectStreamImageUrlsFromText(value, collector);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item) => collectStreamImageUrlsFromPayload(item, collector, depth + 1));
            return;
        }

        if (typeof value !== 'object') return;

        if (value.type === 'image_url') {
            const direct = typeof value.image_url === 'string'
                ? value.image_url
                : value.image_url?.url;
            const normalized = normalizeStreamImageUrl(direct || '');
            if (normalized) collector.add(normalized);
        }

        const urlCandidates = [
            value.url,
            value.image_url,
            value.imageUrl,
            value.uri
        ];
        urlCandidates.forEach((item) => {
            if (typeof item === 'string') {
                const normalized = normalizeStreamImageUrl(item);
                if (normalized) collector.add(normalized);
            } else if (item && typeof item === 'object' && typeof item.url === 'string') {
                const normalized = normalizeStreamImageUrl(item.url);
                if (normalized) collector.add(normalized);
            }
        });

        const possibleBase64 = [
            value.b64_json,
            value.base64,
            value.image_base64
        ];
        possibleBase64.forEach((b64) => {
            if (typeof b64 !== 'string') return;
            const dataUrl = buildStreamImageDataUrl(b64, value.mime_type || value.mimeType || 'image/png');
            if (dataUrl) collector.add(dataUrl);
        });

        Object.keys(value).forEach((key) => {
            collectStreamImageUrlsFromPayload(value[key], collector, depth + 1);
        });
    }

    function extractStreamDeltaText(data) {
        if (!data || typeof data !== 'object') return '';
        const delta = data.choices?.[0]?.delta;
        if (typeof delta?.content === 'string') return delta.content;

        if (Array.isArray(delta?.content)) {
            return delta.content
                .map((part) => {
                    if (typeof part === 'string') return part;
                    if (!part || typeof part !== 'object') return '';
                    if (typeof part.text === 'string') return part.text;
                    if (part.type === 'text' && typeof part.content === 'string') return part.content;
                    return '';
                })
                .join('');
        }

        if (typeof delta?.text === 'string') return delta.text;
        if (typeof data?.content === 'string') return data.content;
        if (typeof data?.text === 'string') return data.text;
        if (typeof data?.output_text === 'string') return data.output_text;
        return '';
    }

    function parsePossibleJsonEnvelope(rawText) {
        const text = String(rawText || '').trim();
        if (!text) return null;
        if (!(text.startsWith('{') && text.endsWith('}'))) {
            return null;
        }
        try {
            const parsed = JSON.parse(text);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    function normalizeStreamImageParts(parts) {
        if (!Array.isArray(parts) || parts.length === 0) return [];
        const seen = new Set();
        const result = [];
        parts.forEach((item) => {
            const fromExplicitImageTag = !!item?._fromExplicitImageTag;
            const url = normalizeStreamImageUrl(item?.image_url?.url || item?.url || '', {
                fromExplicitImageTag
            });
            if (!url) return;
            if (!fromExplicitImageTag && seen.has(url)) return;
            if (!fromExplicitImageTag) seen.add(url);
            const normalized = { type: 'image_url', image_url: { url } };
            if (fromExplicitImageTag) {
                normalized._fromExplicitImageTag = true;
            }
            result.push(normalized);
        });
        return result;
    }

    function normalizeStreamImagePlacement(value) {
        const rawText = String(value || '').trim();
        const raw = rawText.toLowerCase();
        if (!raw) return 'tail';
        if (raw === 'tail' || raw === 'end' || raw === 'append') return 'tail';
        if (raw === 'head' || raw === 'top' || raw === 'prepend') return 'head';
        const slotMatch = rawText.match(/^slot:([a-zA-Z0-9_-]+)$/);
        if (slotMatch) {
            return `slot:${slotMatch[1]}`;
        }
        const match = raw.match(/^after_paragraph:(\d+)$/);
        if (match) {
            const n = Math.max(1, parseInt(match[1], 10) || 1);
            return `after_paragraph:${n}`;
        }
        return 'tail';
    }

    function normalizeStreamImageLayout(layout) {
        if (!Array.isArray(layout) || layout.length === 0) return [];
        return layout
            .map((item, index) => {
                if (!item || typeof item !== 'object') return null;
                const imageId = String(item.image_id || `img_${index + 1}`).trim();
                const url = normalizeStreamImageUrl(item.url || item.image_url?.url || '');
                const placement = normalizeStreamImagePlacement(item.placement || item.position || item.insert_at);
                return {
                    image_id: imageId || `img_${index + 1}`,
                    url,
                    placement,
                    fallback_paragraph: Math.max(0, parseInt(String(item.fallback_paragraph || item.fallbackParagraph || '0'), 10) || 0)
                };
            })
            .filter(Boolean);
    }

    function getPlacementPriority(value) {
        const placement = normalizeStreamImagePlacement(value);
        if (placement.startsWith('slot:')) return 3;
        if (placement.startsWith('after_paragraph:') || placement === 'head') return 2;
        return 1;
    }

    function createPendingImagePreviewContainer() {
        const phaseNow = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();

        const item = document.createElement('div');
        item.className = 'image-preview-container image-preview-pending';
        item.dataset.pending = '1';

        const box = document.createElement('div');
        box.style.width = '280px';
        box.style.height = '210px';
        box.style.borderRadius = '8px';
        box.style.position = 'relative';
        box.style.overflow = 'hidden';
        box.style.background = 'linear-gradient(90deg, var(--stream-pending-bg-1) 25%, var(--stream-pending-bg-2) 37%, var(--stream-pending-bg-1) 63%)';
        box.style.backgroundSize = '400% 100%';
        box.style.animation = 'stream-pending-shimmer 1.4s ease infinite';
        box.style.animationDelay = `-${Math.floor(phaseNow % 1400)}ms`;
        box.style.display = 'flex';
        box.style.alignItems = 'center';
        box.style.justifyContent = 'center';

        const img = document.createElement('img');
        img.alt = 'image';
        img.dataset.pendingImg = '1';
        img.style.position = 'absolute';
        img.style.inset = '0';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.opacity = '0';
        img.style.transition = 'opacity 0.5s ease';
        img.style.pointerEvents = 'none';
        box.appendChild(img);

        const loadingSpinner = document.createElement('div');
        loadingSpinner.className = 'loading-spinner';
        loadingSpinner.style.margin = '0';
        loadingSpinner.dataset.pendingSpinner = '1';
        loadingSpinner.style.position = 'absolute';
        loadingSpinner.style.left = '50%';
        loadingSpinner.style.top = '50%';
        loadingSpinner.style.transform = 'translate(-50%, -50%)';
        loadingSpinner.style.zIndex = '2';
        loadingSpinner.style.transition = 'opacity 0.25s ease';

        loadingSpinner.innerHTML = `
        <svg class="spinner" viewBox="0 0 50 50" aria-hidden="true">
            <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
        </svg>
    `;
        const spinner = loadingSpinner.querySelector('.spinner');
        if (spinner) {
            spinner.style.width = '28px';
            spinner.style.height = '28px';
            spinner.style.display = 'block';
            spinner.style.overflow = 'visible';
            spinner.style.transformOrigin = '50% 50%';
            spinner.style.animation = 'spinner-rotate 1.4s linear infinite';
            spinner.style.animationDelay = `-${Math.floor(phaseNow % 1600)}ms`;
            spinner.style.animationPlayState = 'running';
            spinner.style.willChange = 'transform';
        }
        const path = loadingSpinner.querySelector('.path');
        if (path) {
            path.style.stroke = 'var(--accent-color)';
            path.style.strokeLinecap = 'round';
            path.style.strokeDasharray = '75, 150';
            path.style.strokeDashoffset = '0';
            path.style.animation = 'spinner-dash 1.4s ease-in-out infinite';
            path.style.animationDelay = `-${Math.floor(phaseNow % 1400)}ms`;
            path.style.animationPlayState = 'running';
        }

        box.appendChild(loadingSpinner);
        const btn = document.createElement('button');
        btn.className = 'image-overlay-btn';
        btn.type = 'button';
        btn.title = getToastMessage('ui.downloadImage');
        btn.dataset.action = 'download-image';
        btn.dataset.imageUrl = '';
        btn.dataset.originalUrl = '';
        btn.dataset.description = '';
        btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
        btn.style.opacity = '0';
        btn.style.pointerEvents = 'none';
        box.appendChild(btn);
        item.appendChild(box);

        return item;
    }

    function createResolvedImagePreviewContainer(targetUrl = '', description = '') {
        const buildResolvedImageDescription = (url, desc) => {
            const preferred = String(desc || '').trim();
            if (preferred) return preferred;
            const safeUrl = String(url || '').trim();
            if (!safeUrl) return 'image';
            try {
                const parsed = new URL(safeUrl, window.location.origin);
                const host = String(parsed.hostname || '').toLowerCase();
                if (host.includes('pexels.com')) {
                    return `Photo by Pexels Contributor on [Pexels](${safeUrl})`;
                }
            } catch (_) { }
            return 'image';
        };

        const resolvedDescription = buildResolvedImageDescription(targetUrl, description);
        const item = document.createElement('div');
        item.className = 'image-preview-container';

        const box = document.createElement('div');
        box.style.width = '280px';
        box.style.height = '210px';
        box.style.borderRadius = '8px';
        box.style.position = 'relative';
        box.style.overflow = 'hidden';
        box.style.display = 'flex';
        box.style.alignItems = 'center';
        box.style.justifyContent = 'center';

        const img = document.createElement('img');
        img.alt = resolvedDescription;
        img.dataset.imageUrl = targetUrl;
        img.dataset.originalUrl = targetUrl;
        img.style.position = 'absolute';
        img.style.inset = '0';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.opacity = '1';
        img.style.transition = 'opacity 0.35s ease';
        img.style.pointerEvents = 'auto';
        img.style.cursor = 'pointer';
        img.src = targetUrl;
        box.appendChild(img);

        const btn = document.createElement('button');
        btn.className = 'image-overlay-btn';
        btn.type = 'button';
        btn.title = getToastMessage('ui.downloadImage');
        btn.dataset.action = 'download-image';
        btn.dataset.imageUrl = targetUrl;
        btn.dataset.originalUrl = targetUrl;
        btn.dataset.description = resolvedDescription;
        btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
        box.appendChild(btn);
        item.appendChild(box);
        return item;
    }

    function extractDisplayImageDescriptionFromMessageText(messageText = '') {
        const text = String(messageText || '').trim();
        if (!text) return '';
        const marker = getToastMessage('ui.imageDescription');
        const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`${escaped}\\s*[：:]\\s*(.+)$`, 'i');
        const m = text.replace(/<[^>]+>/g, ' ').replace(/\*\*/g, '').match(re);
        return m && m[1] ? m[1].trim() : '';
    }

    function insertPendingImagePlaceholderByPlacement(rootElement, placement = 'after_paragraph:1', options = {}) {
        if (!rootElement) return;
        const {
            allowFallbackToTail = true,
            forceNew = false,
            pendingKey = ''
        } = options || {};
        const normalizedPlacement = normalizeStreamImagePlacement(placement);
        const slotForPending = normalizedPlacement.startsWith('slot:')
            ? normalizedPlacement.slice('slot:'.length).trim()
            : '';
        const keyText = String(pendingKey || '').trim();
        let wrapper = null;
        if (!forceNew) {
            if (keyText) {
                wrapper = rootElement.querySelector(`.stream-image-attachments[data-pending-key="${keyText.replace(/"/g, '\\"')}"]`);
            } else {
                wrapper = slotForPending
                    ? rootElement.querySelector(`.stream-image-attachments[data-pending-slot="${slotForPending}"]`)
                    : rootElement.querySelector('.stream-image-attachments:not([data-pending-slot])');
            }
        }

        if (wrapper) return wrapper;

        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'stream-image-attachments';
            wrapper.style.marginTop = '12px';
            wrapper.dataset.pending = '1';
            wrapper.dataset.pendingSince = String(Date.now());
            if (slotForPending) {
                wrapper.dataset.pendingSlot = slotForPending;
            }
            if (keyText) {
                wrapper.dataset.pendingKey = keyText;
            }
            wrapper.appendChild(createPendingImagePreviewContainer());
        }

        if (normalizedPlacement.startsWith('slot:')) {
            const slotId = normalizedPlacement.slice('slot:'.length).trim();
            if (slotId) {
                const anchor = rootElement.querySelector(`[data-stream-image-slot="${slotId}"]`);
                if (anchor) {
                    const anchorBlock = anchor.closest('p, li, blockquote, pre, table, h1, h2, h3, h4, h5, h6');
                    if (anchorBlock && anchorBlock.parentNode) {
                        anchorBlock.insertAdjacentElement('afterend', wrapper);
                    } else if (anchor.parentNode) {
                        anchor.insertAdjacentElement('afterend', wrapper);
                    }
                    return wrapper;
                }
            }
        }

        const paragraphTargets = Array.from(
            rootElement.querySelectorAll('p, li, blockquote, pre, table, h1, h2, h3, h4, h5, h6')
        ).filter(node => !node.closest('.stream-image-attachments'));

        if (normalizedPlacement.startsWith('after_paragraph:')) {
            const n = Math.max(1, parseInt(normalizedPlacement.split(':')[1], 10) || 1);
            const target = paragraphTargets[Math.min(n - 1, paragraphTargets.length - 1)];
            if (target && target.parentNode) {
                target.insertAdjacentElement('afterend', wrapper);
                return wrapper;
            }
        } else if (normalizedPlacement === 'head') {
            const firstNode = rootElement.firstElementChild;
            if (firstNode) {
                rootElement.insertBefore(wrapper, firstNode);
                return wrapper;
            }
        }

        if (allowFallbackToTail && wrapper.parentNode !== rootElement) {
            rootElement.appendChild(wrapper);
            return wrapper;
        }
        return null;
    }

    function clearPendingImagePlaceholdersInChatContainer() {
        const container = elements?.chatContainer || document.getElementById('chat-container');
        if (!container) return;
        const nodes = container.querySelectorAll('.stream-image-attachments[data-pending="1"], .image-preview-container.image-preview-pending');
        nodes.forEach((node) => node.remove());
    }

    function scheduleUnifiedImageRenderScroll(rootElement) {
        if (!rootElement) return;
        const chatContainer = elements?.chatContainer;
        if (!chatContainer) return;

        const requestScroll = () => {
            requestAnimationFrame(() => {
                if (shouldAutoScroll()) {
                    if (typeof scheduleSmoothScrollToBottom === 'function') {
                        scheduleSmoothScrollToBottom();
                    } else {
                        scheduleAutoScrollToBottom();
                    }
                }
                const messageElement = rootElement.closest?.('.message');
                if (messageElement && shouldAutoScroll()) {
                    ensureMessageActionsVisible(messageElement);
                }
            });
        };

        const images = Array.from(rootElement.querySelectorAll('img[data-image-url]'));
        if (images.length === 0) {
            requestScroll();
            return;
        }

        let pending = 0;
        let settled = false;
        const onOneSettled = () => {
            pending -= 1;
            if (pending <= 0 && !settled) {
                settled = true;
                requestScroll();
            }
        };

        images.forEach((img) => {
            if (img.complete) return;
            pending += 1;
            img.addEventListener('load', onOneSettled, { once: true });
            img.addEventListener('error', onOneSettled, { once: true });
        });

        if (pending === 0) {
            requestScroll();
            return;
        }

        setTimeout(() => {
            if (!settled) {
                settled = true;
                requestScroll();
            }
        }, 1500);
    }

    function syncStreamImageAttachments(element, imageParts, imageLayout = [], isFinalRender = false, options = {}) {
        if (!element) return;
        let normalizedParts = normalizeStreamImageParts(imageParts);
        let normalizedLayout = normalizeStreamImageLayout(imageLayout);

        if (isFinalRender && normalizedParts.length > 0) {
            const renderedImageUrls = new Set();
            const contentImages = Array.from(element.querySelectorAll('img'))
                .filter((img) => !img.closest('.stream-image-attachments'));
            contentImages.forEach((img) => {
                const src = String(img.getAttribute('src') || img.currentSrc || '').trim();
                if (!src) return;
                const normalized = normalizeStreamImageUrl(src, { fromExplicitImageTag: true });
                if (normalized) renderedImageUrls.add(normalized);
            });

            if (renderedImageUrls.size > 0) {
                normalizedParts = normalizedParts.filter((part) => {
                    const url = String(part?.image_url?.url || '').trim();
                    return !url || !renderedImageUrls.has(url);
                });
                normalizedLayout = normalizedLayout.filter((item) => {
                    const url = String(item?.url || '').trim();
                    return !url || !renderedImageUrls.has(url);
                });
            }
        }
        logStreamImage('sync:start', {
            isFinalRender,
            pendingPlaceholder: !!options?.pendingPlaceholder,
            partsCount: normalizedParts.length,
            layoutCount: normalizedLayout.length,
            firstPartUrl: normalizedParts[0]?.image_url?.url || '',
            firstPlacement: normalizedLayout[0]?.placement || ''
        });
        const existingList = Array.from(element.querySelectorAll('.stream-image-attachments'));

        const preloadPendingImage = (wrapperNode, targetUrl) => {
            if (!wrapperNode || !targetUrl) return false;
            const pendingItem = wrapperNode.querySelector('.image-preview-container.image-preview-pending') || null;
            if (!pendingItem) return false;

            const pendingImg = pendingItem.querySelector('img[data-pending-img="1"]');
            if (!pendingImg) return false;
            const markPreloadedOnly = () => {
                pendingImg.dataset.preloadState = 'success';
                delete wrapperNode.dataset.resolving;
            };

            const markErrorOnly = () => {
                pendingImg.dataset.preloadState = 'error';
                delete wrapperNode.dataset.resolving;
            };

            if (pendingImg.dataset.boundUrl !== targetUrl) {
                pendingImg.dataset.boundUrl = targetUrl;
                pendingImg.dataset.preloadState = 'loading';
                wrapperNode.dataset.resolving = targetUrl;
                pendingImg.onload = () => markPreloadedOnly();
                pendingImg.onerror = () => markErrorOnly();
                pendingImg.src = targetUrl;
                return true;
            }
            return true;
        };

        const insertResolvedImageByPlacement = (placement, targetUrl, options = {}) => {
            const { pendingKey = '', allowFallbackToTail = true } = options || {};
            const wrapper = insertPendingImagePlaceholderByPlacement(element, placement, {
                allowFallbackToTail,
                forceNew: true,
                pendingKey
            });
            if (!wrapper) return null;
            wrapper.innerHTML = '';
            delete wrapper.dataset.pending;
            delete wrapper.dataset.pendingSince;
            delete wrapper.dataset.resolving;
            wrapper.dataset.signature = targetUrl;
            wrapper.appendChild(createResolvedImagePreviewContainer(targetUrl, options.description || ''));
            return wrapper;
        };

        const resolveExistingWrapperInPlace = (wrapperNode, targetUrl, options = {}) => {
            if (!wrapperNode || !targetUrl) return null;
            wrapperNode.innerHTML = '';
            delete wrapperNode.dataset.pending;
            delete wrapperNode.dataset.pendingSince;
            delete wrapperNode.dataset.resolving;
            wrapperNode.dataset.signature = targetUrl;
            wrapperNode.appendChild(createResolvedImagePreviewContainer(targetUrl, options.description || ''));
            return wrapperNode;
        };

        if (isFinalRender && options?.staticImageRender) {
            const staticLayout = (normalizedLayout.length === 0 && normalizedParts.length > 0)
                ? normalizedParts.map((part, idx) => ({
                    image_id: `img_${idx + 1}`,
                    url: part.image_url?.url || '',
                    placement: idx === 0 ? 'after_paragraph:1' : 'tail'
                }))
                : normalizedLayout;

            const staticSignature = JSON.stringify({
                mode: 'static',
                parts: normalizedParts.map((part) => part.image_url.url),
                layout: staticLayout.map((item) => ({
                    image_id: item.image_id,
                    url: item.url,
                    placement: item.placement
                }))
            });
            if (element.dataset.streamImageLayoutSignature === staticSignature) {
                return;
            }

            existingList.forEach((node) => node.remove());

            if (!normalizedParts.length) {
                delete element.dataset.streamImageLayoutSignature;
                return;
            }

            const layoutById = new Map();
            const layoutQueueByUrl = new Map();
            staticLayout.forEach((item) => {
                if (!item) return;
                const existing = layoutById.get(item.image_id);
                if (!existing || getPlacementPriority(item.placement) > getPlacementPriority(existing.placement)) {
                    layoutById.set(item.image_id, item);
                }
                if (item.url) {
                    const queue = layoutQueueByUrl.get(item.url) || [];
                    queue.push(item);
                    layoutQueueByUrl.set(item.url, queue);
                }
            });

            const paragraphTargets = Array.from(
                element.querySelectorAll('p, li, blockquote, pre, table, h1, h2, h3, h4, h5, h6')
            ).filter(node => !node.closest('.stream-image-attachments'));

            normalizedParts.forEach((part, index) => {
                const imageId = `img_${index + 1}`;
                const byId = layoutById.get(imageId) || null;
                let byUrl = null;
                const byUrlQueue = layoutQueueByUrl.get(part.image_url.url);
                if (byUrlQueue && byUrlQueue.length > 0) {
                    byUrl = byUrlQueue.shift();
                }
                const layoutItem = byUrl || byId || null;
                const placement = normalizeStreamImagePlacement(layoutItem?.placement || (index === 0 ? 'after_paragraph:1' : 'tail'));
                const staticKey = `history:${imageId}:${placement}:${index}`;

                if (placement.startsWith('slot:')) {
                    const slotId = placement.slice('slot:'.length).trim();
                    const anchor = slotId ? element.querySelector(`[data-stream-image-slot="${slotId}"]`) : null;
                    if (anchor) {
                        const wrapper = insertResolvedImageByPlacement(placement, part.image_url.url, {
                            allowFallbackToTail: false,
                            pendingKey: staticKey,
                            description: options.description || ''
                        });
                        if (wrapper) return;
                    }

                    const fallbackParagraph = Math.max(0, parseInt(String(layoutItem?.fallback_paragraph || '0'), 10) || 0);
                    if (fallbackParagraph > 0) {
                        const target = paragraphTargets[Math.min(fallbackParagraph - 1, paragraphTargets.length - 1)];
                        if (target && target.parentNode) {
                            const wrapper = insertResolvedImageByPlacement(`after_paragraph:${Math.max(1, fallbackParagraph)}`, part.image_url.url, {
                                allowFallbackToTail: false,
                                pendingKey: staticKey,
                                description: options.description || ''
                            });
                            if (wrapper) return;
                        }
                    }
                }

                if (placement.startsWith('after_paragraph:')) {
                    const wrapper = insertResolvedImageByPlacement(placement, part.image_url.url, {
                        allowFallbackToTail: true,
                        pendingKey: staticKey,
                        description: options.description || ''
                    });
                    if (wrapper) return;
                } else if (placement === 'head') {
                    const wrapper = insertResolvedImageByPlacement('head', part.image_url.url, {
                        allowFallbackToTail: true,
                        pendingKey: staticKey,
                        description: options.description || ''
                    });
                    if (wrapper) return;
                }

                insertResolvedImageByPlacement('tail', part.image_url.url, {
                    allowFallbackToTail: true,
                    pendingKey: staticKey,
                    description: options.description || ''
                });
            });

            element.dataset.streamImageLayoutSignature = staticSignature;
            scheduleUnifiedImageRenderScroll(element);
            return;
        }

        if (!normalizedParts.length) {
            logStreamImage('sync:branch:no-parts', {
                isFinalRender,
                pendingPlaceholder: !!options?.pendingPlaceholder,
                layoutCount: normalizedLayout.length
            });
            if (!isFinalRender && options.pendingPlaceholder && normalizedLayout.length > 0) {
                normalizedLayout.forEach((layoutItem, layoutIndex) => {
                    const pendingPlacement = layoutItem?.placement || 'after_paragraph:1';
                    const hasSlotPlacement = String(pendingPlacement || '').toLowerCase().startsWith('slot:');
                    const anchorReached = hasSlotPlacement || (options.pendingAnchorReached !== false);
                    const layoutKey = `layout:${String(layoutItem?.image_id || layoutIndex + 1)}:${pendingPlacement}`;
                    logStreamImage('sync:pending-check', { pendingPlacement, hasSlotPlacement, anchorReached });
                    if (anchorReached) {
                        insertPendingImagePlaceholderByPlacement(element, pendingPlacement, {
                            allowFallbackToTail: false,
                            pendingKey: layoutKey
                        });
                        logStreamImage('sync:pending-inserted', { pendingPlacement });
                    }
                });
                scheduleUnifiedImageRenderScroll(element);
                return;
            }
            if (isFinalRender) {
                existingList.forEach((node) => node.remove());
                delete element.dataset.streamImageLayoutSignature;
            }
            return;
        }

        const effectiveFinalLayout = (normalizedLayout.length === 0 && normalizedParts.length > 0)
            ? normalizedParts.map((part, idx) => ({
                image_id: `img_${idx + 1}`,
                url: part.image_url?.url || '',
                placement: idx === 0 ? 'after_paragraph:1' : 'tail'
            }))
            : normalizedLayout;
        if (!isFinalRender && options.pendingPlaceholder && normalizedParts.length > 0) {
            const layoutById = new Map();
            const layoutQueueByUrl = new Map();
            normalizedLayout.forEach((item) => {
                if (!item) return;
                const existing = layoutById.get(item.image_id);
                if (!existing || getPlacementPriority(item.placement) > getPlacementPriority(existing.placement)) {
                    layoutById.set(item.image_id, item);
                }
                if (item.url) {
                    const queue = layoutQueueByUrl.get(item.url) || [];
                    queue.push(item);
                    layoutQueueByUrl.set(item.url, queue);
                }
            });

            normalizedParts.forEach((part, index) => {
                const imageId = `img_${index + 1}`;
                const byId = layoutById.get(imageId) || null;
                let byUrl = null;
                const byUrlQueue = layoutQueueByUrl.get(part.image_url.url);
                if (byUrlQueue && byUrlQueue.length > 0) {
                    byUrl = byUrlQueue.shift();
                }
                const layoutItem = byUrl || byId || null;
                const pendingPlacement = layoutItem?.placement || (index === 0 ? 'after_paragraph:1' : 'tail');
                const hasSlotPlacement = String(pendingPlacement || '').toLowerCase().startsWith('slot:');
                const anchorReached = hasSlotPlacement || (options.pendingAnchorReached !== false);
                const pendingKey = `stream:${imageId}:${pendingPlacement}`;
                logStreamImage('sync:pending-with-parts', {
                    imageId,
                    pendingPlacement,
                    hasSlotPlacement,
                    anchorReached,
                    url: part.image_url?.url || ''
                });
                if (anchorReached) {
                    insertPendingImagePlaceholderByPlacement(element, pendingPlacement, {
                        allowFallbackToTail: false,
                        pendingKey
                    });
                    logStreamImage('sync:pending-inserted-with-parts', { imageId, pendingPlacement });
                }
                const pendingWrapper = element.querySelector(`.stream-image-attachments[data-pending-key="${pendingKey}"]`);

                if (pendingWrapper && part.image_url?.url) {
                    preloadPendingImage(pendingWrapper, part.image_url.url);
                    logStreamImage('sync:pending-preload-start', { imageId, url: part.image_url.url });
                }
            });
            return;
        }

        if (!isFinalRender) {
            return;
        }

        const layoutSignature = JSON.stringify({
            parts: normalizedParts.map((part) => part.image_url.url),
            layout: effectiveFinalLayout.map((item) => ({
                image_id: item.image_id,
                url: item.url,
                placement: item.placement
            }))
        });
        if (element.dataset.streamImageLayoutSignature === layoutSignature) {
            return;
        }

        const layoutById = new Map();
        const layoutQueueByUrl = new Map();
        effectiveFinalLayout.forEach((item) => {
            if (!item) return;
            const existing = layoutById.get(item.image_id);
            if (!existing || getPlacementPriority(item.placement) > getPlacementPriority(existing.placement)) {
                layoutById.set(item.image_id, item);
            }
            if (item.url) {
                const queue = layoutQueueByUrl.get(item.url) || [];
                queue.push(item);
                layoutQueueByUrl.set(item.url, queue);
            }
        });

        const paragraphTargets = Array.from(
            element.querySelectorAll('p, li, blockquote, pre, table, h1, h2, h3, h4, h5, h6')
        ).filter(node => !node.closest('.stream-image-attachments'));

        const usedWrappers = new Set();
        const escapeSelectorValue = (value) => String(value || '').replace(/"/g, '\\"');

        normalizedParts.forEach((part, index) => {
            const imageId = `img_${index + 1}`;
            const byId = layoutById.get(imageId) || null;
            let byUrl = null;
            const byUrlQueue = layoutQueueByUrl.get(part.image_url.url);
            if (byUrlQueue && byUrlQueue.length > 0) {
                byUrl = byUrlQueue.shift();
            }
            const layoutItem = byUrl || byId || null;
            const placement = normalizeStreamImagePlacement(layoutItem?.placement || (index === 0 ? 'after_paragraph:1' : 'tail'));
            const streamPendingKey = `stream:${imageId}:${placement}`;
            const escapedStreamKey = escapeSelectorValue(streamPendingKey);
            const existingByKey = element.querySelector(`.stream-image-attachments[data-pending-key="${escapedStreamKey}"]`);

            if (existingByKey) {
                const wrapper = resolveExistingWrapperInPlace(existingByKey, part.image_url.url, {
                    description: options.description || ''
                });
                if (wrapper) {
                    wrapper.dataset.pendingKey = streamPendingKey;
                    usedWrappers.add(wrapper);
                    return;
                }
            }

            if (placement.startsWith('slot:')) {
                const slotId = placement.slice('slot:'.length).trim();
                const anchor = slotId ? element.querySelector(`[data-stream-image-slot="${slotId}"]`) : null;
                logStreamImage('sync:slot-placement', { slotId, foundAnchor: !!anchor, url: part.image_url.url });
                if (anchor) {
                    const wrapper = insertResolvedImageByPlacement(placement, part.image_url.url, {
                        allowFallbackToTail: false,
                        pendingKey: streamPendingKey,
                        description: options.description || ''
                    });
                    if (wrapper) {
                        usedWrappers.add(wrapper);
                        logStreamImage('sync:slot-insert-after-anchor', { slotId });
                        return;
                    }
                }
                const fallbackParagraph = Math.max(0, parseInt(String(layoutItem?.fallback_paragraph || '0'), 10) || 0);
                if (fallbackParagraph > 0) {
                    const target = paragraphTargets[Math.min(fallbackParagraph - 1, paragraphTargets.length - 1)];
                    if (target && target.parentNode) {
                        const wrapper = insertResolvedImageByPlacement(`after_paragraph:${Math.max(1, fallbackParagraph)}`, part.image_url.url, {
                            allowFallbackToTail: false,
                            pendingKey: streamPendingKey,
                            description: options.description || ''
                        });
                        if (wrapper) {
                            usedWrappers.add(wrapper);
                            logStreamImage('sync:slot-fallback-paragraph', { slotId, fallbackParagraph, url: part.image_url.url });
                            return;
                        }
                    }
                }
                return;
            }

            if (placement.startsWith('after_paragraph:')) {
                const wrapper = insertResolvedImageByPlacement(placement, part.image_url.url, {
                    allowFallbackToTail: true,
                    pendingKey: streamPendingKey,
                    description: options.description || ''
                });
                if (wrapper) {
                    usedWrappers.add(wrapper);
                    logStreamImage('sync:paragraph-insert', { placement, url: part.image_url.url });
                    return;
                }
            } else if (placement === 'head') {
                const wrapper = insertResolvedImageByPlacement('head', part.image_url.url, {
                    allowFallbackToTail: true,
                    pendingKey: streamPendingKey,
                    description: options.description || ''
                });
                if (wrapper) {
                    usedWrappers.add(wrapper);
                    logStreamImage('sync:head-insert', { url: part.image_url.url });
                }
                return;
            }

            const wrapper = insertResolvedImageByPlacement('tail', part.image_url.url, {
                allowFallbackToTail: true,
                pendingKey: streamPendingKey,
                description: options.description || ''
            });
            if (wrapper) {
                usedWrappers.add(wrapper);
                logStreamImage('sync:tail-fallback', { placement, url: part.image_url.url });
            }
        });

        const allWrappers = Array.from(element.querySelectorAll('.stream-image-attachments'));
        allWrappers.forEach((node) => {
            if (usedWrappers.has(node)) return;
            node.remove();
        });
        element.dataset.streamImageLayoutSignature = layoutSignature;

        scheduleUnifiedImageRenderScroll(element);
    }

    function flushBufferedContent() {
        if (!state.globalContentDiv) return;
        try {
            if (state.globalBackgroundBuffer) {
                state.globalDisplayBuffer += state.globalBackgroundBuffer;
                state.globalBackgroundBuffer = '';
            }
            if (state.globalCharQueue.length > 0) {
                const remainingChars = state.globalCharQueue.splice(0, state.globalCharQueue.length).join('');
                state.globalDisplayBuffer += remainingChars;
            }
            renderMessageContent(state.globalContentDiv, state.globalDisplayBuffer, null, false);
        } catch (error) {
            console.error('Background buffer render error:', error);
        }
    }

    async function processStreamedResponse(response, contentDiv, options = {}) {
        logStreamImage('stream:start', {
            hasBody: !!response?.body,
            contentType: response?.headers?.get?.('content-type') || '',
            pendingPlaceholder: !!options?.usePendingImagePlaceholder,
            provisionalLayoutCount: Array.isArray(options?.provisionalImageLayout) ? options.provisionalImageLayout.length : 0
        });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';
        const collectedImageUrls = new Set();
        let finishReason = null;
        let finalCitations = null;
        let finalReasoning = '';
        let finalImageLayout = [];
        let provisionalImageParts = [];
        const explicitImageParts = [];
        let streamTagBuffer = '';
        let streamSlotCounter = 0;
        let hasInlineImageSlots = false;
        let hasClearedThinkingIndicator = false;
        const provisionalImageLayout = normalizeStreamImageLayout(options?.provisionalImageLayout || []);
        const usePendingImagePlaceholder = options?.usePendingImagePlaceholder !== false;
        let firstTokenAt = null;
        let receivedDone = false;

        state.globalBackgroundBuffer = '';
        state.globalDisplayBuffer = '';
        state.globalContentDiv = contentDiv;
        state.globalCharQueue = [];
        state.explicitImageTagUrls = new Set();
        state.imgWrappedTagUrls = new Set();
        const pinnedToBottom = scrollManager.isNearBottom(scrollManager.bottomThreshold);
        if (pinnedToBottom) {
            scrollManager.resetUserScrollState();
        }

        scrollManager.enterStreamingMode();

        const clearThinkingIndicatorOnFirstBodyDelta = (chunk) => {
            if (hasClearedThinkingIndicator) return;
            const raw = String(chunk || '');
            if (!raw) return;
            const stripped = raw
                .replace(/\[IMG\][\s\S]*?\[\/IMG\]/gi, '')
                .replace(/\[\[IMAGE_SLOT:[^\]]+\]\]/gi, '')
                .replace(/<span\b[^>]*\bdata-stream-image-slot\s*=\s*["'][^"']+["'][^>]*>\s*<\/span>/gi, '')
                .trim();
            if (!stripped) return;
            if (contentDiv?.querySelector?.('.thinking-indicator-new')) {
                contentDiv.innerHTML = '';
            }
            hasClearedThinkingIndicator = true;
        };

        const charQueue = state.globalCharQueue;
        let isTyping = false;
        let renderSpeed = getRenderSpeedForModel(getCurrentModelId());
        let renderSpeedAccumulator = 0;
        const streamRenderInterval = STREAM_RENDER_INTERVAL_MS;

        let lastRenderTime = 0;

        const scheduleStreamAutoScrollAdjustment = (snapshot) => {
            scrollManager.applyStreamingFrameCompensation(snapshot);
        };

        const appendVisibleTextDelta = (chunk, options = {}) => {
            if (!chunk) return;
            clearThinkingIndicatorOnFirstBodyDelta(chunk);
            const splitByChar = options.splitByChar !== false;
            fullResponse += chunk;
            collectStreamImageUrlsFromText(chunk, collectedImageUrls);
            if (splitByChar) {
                charQueue.push(...chunk.split(''));
            } else {
                charQueue.push(chunk);
            }
            if (!firstTokenAt) firstTokenAt = Date.now();
            if (!isTyping) {
                const isGeminiModel = normalizeModelIdForRender(getCurrentModelId()).toLowerCase().startsWith('gemini-');
                const minBufferChars = isGeminiModel ? 12 : 24;
                const maxWaitMs = isGeminiModel ? 200 : 350;
                const ready = charQueue.length >= minBufferChars || (Date.now() - firstTokenAt) > maxWaitMs;
                if (ready) startTyping();
            }
        };

        const pushStreamImageSlot = (slotOptions = {}) => {
            const urlRaw = slotOptions?.url || '';
            const imageIdRaw = slotOptions?.imageId || '';
            const slotIdRaw = slotOptions?.slotId || '';
            const sourceType = String(slotOptions?.sourceType || '').toLowerCase();
            const autoIndex = ++streamSlotCounter;
            const imageId = String(imageIdRaw || `img_${autoIndex}`).trim();
            const slotId = String(slotIdRaw || imageId).trim() || imageId;
            hasInlineImageSlots = true;
            const url = normalizeStreamImageUrl(urlRaw || '', { fromExplicitImageTag: true });
            logStreamImage('slot:push', {
                imageId,
                slotId,
                url,
                hasUrl: !!url
            });
            if (url) {
                provisionalImageParts = [
                    ...provisionalImageParts,
                    { type: 'image_url', image_url: { url }, _fromExplicitImageTag: true }
                ];
                explicitImageParts.push({
                    type: 'image_url',
                    image_url: { url },
                    _fromExplicitImageTag: true
                });
                state.explicitImageTagUrls.add(url);
                if (sourceType === 'img') {
                    state.imgWrappedTagUrls.add(url);
                }
               
                finalImageLayout = normalizeStreamImageLayout([
                    ...finalImageLayout,
                    {
                        image_id: slotId,
                        url,
                        placement: `slot:${slotId}`,
                        fallback_paragraph: Math.max(1, (fullResponse.split(/\n\s*\n/).filter((s) => String(s || '').trim()).length || 1))
                    }
                ]);
            } else {
                finalImageLayout = normalizeStreamImageLayout([
                    ...finalImageLayout,
                    {
                        image_id: slotId,
                        placement: `slot:${slotId}`,
                        fallback_paragraph: Math.max(1, (fullResponse.split(/\n\s*\n/).filter((s) => String(s || '').trim()).length || 1))
                    }
                ]);
            }
            logStreamImage('slot:state', {
                provisionalPartsCount: provisionalImageParts.length,
                layoutCount: finalImageLayout.length,
                collectedCount: collectedImageUrls.size
            });
            appendVisibleTextDelta(`\n\n<span data-stream-image-slot="${slotId}"></span>\n\n`, {
                splitByChar: false
            });
        };

        const getTrailingPartialTagLength = (text) => {
            const patterns = [
                '[IMG]',
                '[/IMG]',
                '![',
                '[[IMAGE_SLOT:',
                '<span',
                'data-stream-image-slot',
                '</span'
            ];
            let hold = 0;
            for (const p of patterns) {
                const max = Math.min(text.length, p.length - 1);
                for (let i = max; i >= 1; i--) {
                    if (text.endsWith(p.slice(0, i))) {
                        hold = Math.max(hold, i);
                        break;
                    }
                }
            }
            return hold;
        };

        const findNextTagStart = (text) => {
            const imgStart = text.indexOf('[IMG]');
            const mdImageStart = text.indexOf('![');
            const slotStart = text.indexOf('[[IMAGE_SLOT:');
            const htmlSpanStart = text.toLowerCase().indexOf('<span');
            let start = -1;
            if (imgStart >= 0) start = imgStart;
            if (mdImageStart >= 0) start = start < 0 ? mdImageStart : Math.min(start, mdImageStart);
            if (slotStart >= 0) start = start < 0 ? slotStart : Math.min(start, slotStart);
            if (htmlSpanStart >= 0) start = start < 0 ? htmlSpanStart : Math.min(start, htmlSpanStart);
            return start;
        };

        const tryConsumeImageTag = (text) => {
            if (!text.startsWith('[IMG]')) return null;
            const end = text.indexOf('[/IMG]');
            if (end === -1) return { needMore: true };
            return {
                needMore: false,
                consumed: end + 6,
                url: text.slice(5, end).trim()
            };
        };

        const tryConsumeSlotTag = (text) => {
            if (!text.startsWith('[[IMAGE_SLOT:')) return null;
            const end = text.indexOf(']]');
            if (end === -1) return { needMore: true };
            return {
                needMore: false,
                consumed: end + 2,
                rawSlot: text.slice('[[IMAGE_SLOT:'.length, end).trim()
            };
        };

        const tryConsumeMarkdownImageTag = (text) => {
            if (!text.startsWith('![')) return null;
            const closeBracket = text.indexOf(']');
            if (closeBracket === -1) return { needMore: true };
            const openParen = text.indexOf('(', closeBracket);
            if (openParen === -1) return { needMore: true };
            const closeParen = text.indexOf(')', openParen);
            if (closeParen === -1) return { needMore: true };
            const rawUrl = text.slice(openParen + 1, closeParen).trim();
            if (!rawUrl) {
                return {
                    needMore: false,
                    consumed: closeParen + 1,
                    url: ''
                };
            }
            return {
                needMore: false,
                consumed: closeParen + 1,
                url: rawUrl
            };
        };

        const parseBufferedStreamChunk = (incomingDelta = '') => {
            if (!incomingDelta) return;
            streamTagBuffer += incomingDelta;

            while (streamTagBuffer.length > 0) {
                const start = findNextTagStart(streamTagBuffer);

                if (start === -1) {
                    const hold = getTrailingPartialTagLength(streamTagBuffer);
                    const safeLen = streamTagBuffer.length - hold;
                    if (safeLen > 0) {
                        appendVisibleTextDelta(streamTagBuffer.slice(0, safeLen));
                        streamTagBuffer = streamTagBuffer.slice(safeLen);
                    }
                    break;
                }

                if (start > 0) {
                    appendVisibleTextDelta(streamTagBuffer.slice(0, start));
                    streamTagBuffer = streamTagBuffer.slice(start);
                    continue;
                }

                const imageTag = tryConsumeImageTag(streamTagBuffer);
                if (imageTag) {
                    if (imageTag.needMore) break;
                    logStreamImage('parse:img-tag', { url: imageTag.url });
                    pushStreamImageSlot({ url: imageTag.url, sourceType: 'img' });
                    streamTagBuffer = streamTagBuffer.slice(imageTag.consumed);
                    continue;
                }

                const markdownImageTag = tryConsumeMarkdownImageTag(streamTagBuffer);
                if (markdownImageTag) {
                    if (markdownImageTag.needMore) break;
                    if (markdownImageTag.url) {
                        logStreamImage('parse:markdown-img-tag', { url: markdownImageTag.url });
                        pushStreamImageSlot({ url: markdownImageTag.url, sourceType: 'markdown' });
                    }
                    streamTagBuffer = streamTagBuffer.slice(markdownImageTag.consumed);
                    continue;
                }

                const slotTag = tryConsumeSlotTag(streamTagBuffer);
                if (slotTag) {
                    if (slotTag.needMore) break;
                    const safeSlot = slotTag.rawSlot.replace(/[^a-zA-Z0-9_-]/g, '').trim() || `img_${streamSlotCounter + 1}`;
                    logStreamImage('parse:slot-tag', { rawSlot: slotTag.rawSlot, safeSlot });
                    pushStreamImageSlot({ imageId: safeSlot, slotId: safeSlot });
                    streamTagBuffer = streamTagBuffer.slice(slotTag.consumed);
                    continue;
                }

                if (/^<span\b/i.test(streamTagBuffer)) {
                    const htmlSlotTagRegex = /^<span\b[^>]*\bdata-stream-image-slot\s*=\s*["'“”‘’]?([a-zA-Z0-9_-]+)["'“”‘’]?[^>]*>\s*<\/span\s*>/i;
                    const htmlSlotMatch = streamTagBuffer.match(htmlSlotTagRegex);
                    if (htmlSlotMatch && htmlSlotMatch[0]) {
                        const rawSlot = String(htmlSlotMatch[1] || '').trim();
                        const safeSlot = rawSlot.replace(/[^a-zA-Z0-9_-]/g, '').trim() || `img_${streamSlotCounter + 1}`;
                        logStreamImage('parse:html-slot-tag', { rawSlot, safeSlot });
                        pushStreamImageSlot({ imageId: safeSlot, slotId: safeSlot });
                        streamTagBuffer = streamTagBuffer.slice(htmlSlotMatch[0].length);
                        continue;
                    }
                    // Span tag is likely incomplete in current chunk; wait for more stream data.
                    break;
                }

                appendVisibleTextDelta(streamTagBuffer[0]);
                streamTagBuffer = streamTagBuffer.slice(1);
            }
        };

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
                state.globalDisplayBuffer += charsToRender;

                if (getIsPageVisible()) {
                    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    const isUserInteracting = scrollManager.isUserScrolling
                        || (Date.now() - scrollManager.lastUserScrollAt < 320);
                    const effectiveRenderInterval = isUserInteracting
                        ? Math.max(streamRenderInterval, 180)
                        : streamRenderInterval;
                    const shouldRenderNow = (!isUserInteracting && (
                        (now - lastRenderTime) >= effectiveRenderInterval
                        || charQueue.length === 0
                    )) || (isUserInteracting && charQueue.length === 0 && (now - lastRenderTime) >= 420);
                    if (shouldRenderNow) {
                        try {
                            const chatContainer = elements.chatContainer;
                            const scrollSnapshot = {
                                beforeHeight: chatContainer.scrollHeight,
                                beforeScrollTop: chatContainer.scrollTop,
                                beforeUserScrollAt: scrollManager.lastUserScrollAt,
                                wasPinnedToBottom: scrollManager.getDistanceToBottom() <= scrollManager.bottomThreshold,
                                shouldAutoScrollBefore: shouldAutoScroll()
                            };
                            const layoutForRender = finalImageLayout.length > 0 ? finalImageLayout : provisionalImageLayout;
                            const imagePartsForRender = provisionalImageParts.length > 0 ? provisionalImageParts : [];
                            renderMessageContent(contentDiv, {
                                content: state.globalDisplayBuffer,
                                reasoning: finalReasoning,
                                image_layout: layoutForRender,
                                image_parts: imagePartsForRender
                            }, null, false, {
                                pendingImagePlaceholder: usePendingImagePlaceholder
                            });
                            scheduleStreamAutoScrollAdjustment(scrollSnapshot);
                        } catch (renderError) {
                            console.error(`${getToastMessage('console.renderMessageContentFailed')}:`, renderError);
                            if (contentDiv) {
                                contentDiv.textContent = state.globalDisplayBuffer;
                            }
                        }
                        lastRenderTime = now;
                    }
                } else {
                    state.globalBackgroundBuffer += charsToRender;
                }

                setTimeout(() => {
                    if (getIsPageVisible()) {
                        requestAnimationFrame(renderLoop);
                    } else {
                        renderLoop();
                    }
                }, renderSpeed === 1 ? 25 : 16);
            };

            if (getIsPageVisible()) {
                requestAnimationFrame(renderLoop);
            } else {
                setTimeout(renderLoop, 0);
            }
        };

        const processLine = (dataStr) => {
            if (!dataStr) return;
            if (dataStr === '[DONE]') {
                receivedDone = true;
                return;
            }

            try {
                const data = JSON.parse(dataStr);
                collectStreamImageUrlsFromPayload(data, collectedImageUrls);
                if (Array.isArray(data.citations) && data.citations.length > 0) {
                    finalCitations = data.citations;
                }
                if (Array.isArray(data.image_layout) && data.image_layout.length > 0) {
                    const incomingLayout = normalizeStreamImageLayout(data.image_layout);
                    if (hasInlineImageSlots && incomingLayout.length > 0) {
                        const slotLayout = finalImageLayout.filter((item) =>
                            String(item?.placement || '').toLowerCase().startsWith('slot:')
                        );
                        finalImageLayout = normalizeStreamImageLayout([
                            ...slotLayout,
                            ...incomingLayout
                        ]);
                    } else {
                        finalImageLayout = incomingLayout;
                    }
                }
                if (Array.isArray(data.image_parts) && data.image_parts.length > 0) {
                    const incomingParts = normalizeStreamImageParts(data.image_parts);
                    provisionalImageParts = normalizeStreamImageParts([
                        ...provisionalImageParts,
                        ...incomingParts
                    ]);
                    if (provisionalImageParts.length > 0 && finalImageLayout.length === 0) {
                        finalImageLayout = provisionalImageParts.map((part, idx) => ({
                            image_id: `img_${idx + 1}`,
                            url: part.image_url?.url || '',
                            placement: idx === 0 ? 'after_paragraph:1' : 'tail'
                        }));
                    }
                }
                if (typeof data.reasoning_delta === 'string' && data.reasoning_delta) {
                    finalReasoning += data.reasoning_delta;
                }
                if (typeof data.reasoning === 'string' && data.reasoning.trim()) {
                    finalReasoning = data.reasoning;
                }
                if (data.type === 'metadata') {
                    if (data.citations || data.reasoning || (Array.isArray(data.image_parts) && data.image_parts.length > 0)) {
                        return;
                    }
                }

                const delta = extractStreamDeltaText(data) || '';
                if (delta) {
                    parseBufferedStreamChunk(delta);
                }

                if (data.choices?.[0]?.finish_reason) {
                    finishReason = data.choices[0].finish_reason;
                    receivedDone = true;
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
                        receivedDone = true;
                        break;
                    }
                    processLine(dataStr);
                }
            }
        }

        if (!isTyping && charQueue.length > 0) startTyping();

        if (streamTagBuffer) {
            appendVisibleTextDelta(streamTagBuffer);
            streamTagBuffer = '';
        }

        await new Promise(resolve => {
            const checkTyping = () => {
                if (!isTyping && charQueue.length === 0) {
                    if (state.globalBackgroundBuffer && getIsPageVisible() && state.globalContentDiv) {
                        try {
                            state.globalDisplayBuffer += state.globalBackgroundBuffer;
                            const layoutForRender = finalImageLayout.length > 0 ? finalImageLayout : provisionalImageLayout;
                            const imagePartsForRender = provisionalImageParts.length > 0 ? provisionalImageParts : [];
                            renderMessageContent(state.globalContentDiv, {
                                content: state.globalDisplayBuffer,
                                reasoning: finalReasoning,
                                image_layout: layoutForRender,
                                image_parts: imagePartsForRender
                            }, null, false, {
                                pendingImagePlaceholder: usePendingImagePlaceholder
                            });
                            state.globalBackgroundBuffer = '';
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
        scrollManager.exitStreamingMode();
        const interrupted = !receivedDone && fullResponse.length > 0;
        const collectedParts = Array.from(collectedImageUrls).map((url) => ({
            type: 'image_url',
            image_url: { url },
            ...(state.explicitImageTagUrls.has(url) ? { _fromExplicitImageTag: true } : {})
        }));
        const envelope = parsePossibleJsonEnvelope(fullResponse);
        if (envelope) {
            if (typeof envelope.content === 'string' && envelope.content.trim()) {
                fullResponse = envelope.content;
            }
            if ((!Array.isArray(finalCitations) || finalCitations.length === 0) && Array.isArray(envelope.citations) && envelope.citations.length > 0) {
                finalCitations = envelope.citations;
            }
            if ((!finalReasoning || !finalReasoning.trim()) && typeof envelope.reasoning === 'string' && envelope.reasoning.trim()) {
                finalReasoning = envelope.reasoning;
            }
            if (Array.isArray(envelope.image_layout) && envelope.image_layout.length > 0) {
                const incomingEnvelopeLayout = normalizeStreamImageLayout(envelope.image_layout);
                if (hasInlineImageSlots && incomingEnvelopeLayout.length > 0) {
                    const slotLayout = finalImageLayout.filter((item) =>
                        String(item?.placement || '').toLowerCase().startsWith('slot:')
                    );
                    finalImageLayout = normalizeStreamImageLayout([
                        ...slotLayout,
                        ...incomingEnvelopeLayout
                    ]);
                } else {
                    finalImageLayout = incomingEnvelopeLayout;
                }
            }
            if (Array.isArray(envelope.image_parts) && envelope.image_parts.length > 0) {
                const envelopeParts = normalizeStreamImageParts(envelope.image_parts);
                if (envelopeParts.length > 0) {
                    provisionalImageParts = normalizeStreamImageParts([
                        ...provisionalImageParts,
                        ...envelopeParts
                    ]);
                }
            }
        }
        const explicitUrlSet = new Set(
            explicitImageParts
                .map((part) => String(part?.image_url?.url || '').trim())
                .filter(Boolean)
        );
        const layoutUrlSet = new Set(
            finalImageLayout
                .map((item) => String(item?.url || '').trim())
                .filter(Boolean)
        );
        const imgWrappedUrlSet = new Set(
            Array.from(state.imgWrappedTagUrls || [])
                .map((url) => String(url || '').trim())
                .filter(Boolean)
        );
        const hasImgWrappedSignals = imgWrappedUrlSet.size > 0;
        const allowLooseCollected = (
            !hasInlineImageSlots
            && finalImageLayout.length === 0
            && provisionalImageParts.length === 0
        ) || (
            hasImgWrappedSignals
            && layoutUrlSet.size === 0
        );
        const filteredCollectedParts = collectedParts.filter((part) => {
            const url = String(part?.image_url?.url || '').trim();
            if (!url) return false;
            if (state.explicitImageTagUrls.has(url)) return false;
            if (allowLooseCollected) {
                if (hasImgWrappedSignals) {
                    return imgWrappedUrlSet.has(url);
                }
                return true;
            }
            return layoutUrlSet.has(url);
        });
        const filteredProvisionalParts = explicitUrlSet.size > 0
            ? provisionalImageParts.filter((part) => {
                const url = String(part?.image_url?.url || '').trim();
                return !url || !explicitUrlSet.has(url);
            })
            : provisionalImageParts;
        const mergedStreamImageParts = explicitImageParts.length > 0
            ? normalizeStreamImageParts([
                ...explicitImageParts,
                ...filteredProvisionalParts,
                ...filteredCollectedParts
            ])
            : normalizeStreamImageParts([
                ...provisionalImageParts,
                ...filteredCollectedParts
            ]);
        return { fullResponse, finalCitations, finishReason, interrupted, finalReasoning, streamImageParts: mergedStreamImageParts, streamImageLayout: finalImageLayout };
    }

    return {
        normalizeStreamImageParts,
        normalizeStreamImagePlacement,
        normalizeStreamImageLayout,
        syncStreamImageAttachments,
        clearPendingImagePlaceholdersInChatContainer,
        processStreamedResponse,
        flushBufferedContent
    };
}

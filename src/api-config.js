import { Capacitor } from '@capacitor/core';

export const isNativeApp = Capacitor.isNativePlatform();

const DEFAULT_API_ORIGIN = 'https://ai.littletea.xyz';
const DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const shouldRewriteRequests = isNativeApp || DEV_HOSTNAMES.has(window.location.hostname);
const originalFetch = window.fetch.bind(window);

export const API_BASE_URL = shouldRewriteRequests ? DEFAULT_API_ORIGIN : '';

if (shouldRewriteRequests) {
    const currentOrigin = window.location.origin;

    const needsRewrite = (url) => {
        if (!url) return false;
        if (url.startsWith('/')) return true;
        try {
            const parsed = new URL(url);
            if (parsed.protocol === 'capacitor:' || parsed.protocol === 'ionic:') {
                return true;
            }
            if (DEV_HOSTNAMES.has(parsed.hostname)) {
                return true;
            }
        } catch {
            try {
                const parsedWithBase = new URL(url, currentOrigin);
                if (DEV_HOSTNAMES.has(parsedWithBase.hostname)) {
                    return true;
                }
            } catch {
                return false;
            }
        }
        return false;
    };

    const rewriteUrl = (url) => {
        if (!url) return url;
        if (url.startsWith('/')) {
            return `${API_BASE_URL}${url}`;
        }
        try {
            const parsed = new URL(url, currentOrigin);
            return `${API_BASE_URL}${parsed.pathname}${parsed.search}${parsed.hash}`;
        } catch {
            return url;
        }
    };

    const rewriteRequest = (request) => {
        try {
            if (!needsRewrite(request.url)) {
                return request;
            }
            const newUrl = rewriteUrl(request.url);
            return new Request(newUrl, request);
        } catch {
            return request;
        }
    };

    /**
     * 在原生端或本地开发环境中，将所有相对/本地域名请求重写到正式 API 域名
     */
    window.fetch = function (input, init) {
        if (typeof input === 'string') {
            const target = needsRewrite(input) ? rewriteUrl(input) : input;
            return originalFetch(target, init);
        }

        if (input instanceof Request) {
            return originalFetch(rewriteRequest(input), init);
        }

        return originalFetch(input, init);
    };
}

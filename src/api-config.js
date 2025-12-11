import { Capacitor } from '@capacitor/core';

export const isNativeApp = Capacitor.isNativePlatform();

const DEFAULT_API_ORIGIN = 'https://littleaibox.com';
const FALLBACK_API_ORIGINS = [
    DEFAULT_API_ORIGIN,
    'https://littleaibox.pages.dev'
];
const DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const shouldRewriteRequests = isNativeApp || DEV_HOSTNAMES.has(window.location.hostname);
const originalFetch = window.fetch.bind(window);
const PREFERRED_ORIGIN_STORAGE_KEY = 'preferred_api_origin';

const getPreferredApiOrigin = () => {
    try {
        return localStorage.getItem(PREFERRED_ORIGIN_STORAGE_KEY) || null;
    } catch {
        return null;
    }
};

const rememberedOrigin = getPreferredApiOrigin();
let activeApiOrigin = rememberedOrigin && FALLBACK_API_ORIGINS.includes(rememberedOrigin)
    ? rememberedOrigin
    : DEFAULT_API_ORIGIN;

export let API_BASE_URL = shouldRewriteRequests ? activeApiOrigin : '';

if (shouldRewriteRequests) {
    const currentOrigin = window.location.origin;
    const apiOrigins = Array.from(new Set([activeApiOrigin, ...FALLBACK_API_ORIGINS]));

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
            return `${activeApiOrigin}${url}`;
        }
        try {
            const parsed = new URL(url, currentOrigin);
            return `${activeApiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
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

    const isApiPath = (urlObj) => urlObj.pathname.startsWith('/api/') || urlObj.pathname.startsWith('/auth/');

    const persistPreferredOrigin = (origin) => {
        try {
            localStorage.setItem(PREFERRED_ORIGIN_STORAGE_KEY, origin);
        } catch (_) { }
    };

    const fetchWithApiFallback = async (targetUrl, init) => {
        let parsed;
        try {
            parsed = new URL(targetUrl);
        } catch {
            parsed = new URL(targetUrl, currentOrigin);
        }

        if (!isApiPath(parsed)) {
            return originalFetch(targetUrl, init);
        }

        let lastError = null;

        for (const origin of apiOrigins) {
            const rebuiltUrl = `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
            try {
                const response = await originalFetch(rebuiltUrl, init);
                if (response.ok) {
                    if (origin !== activeApiOrigin) {
                        activeApiOrigin = origin;
                        API_BASE_URL = activeApiOrigin;
                        persistPreferredOrigin(origin);
                    }
                    return response;
                }

                // 若遇到网关类错误则尝试下一个可用域名
                if ([502, 503, 504].includes(response.status)) {
                    lastError = new Error(`HTTP ${response.status}`);
                    continue;
                }

                return response;
            } catch (error) {
                lastError = error;
            }
        }

        if (lastError) throw lastError;
        return originalFetch(targetUrl, init);
    };

    /**
     * 在原生端或本地开发环境中，将所有相对本地域名请求重写到正式API域名，
     * 并在需要时自动尝试备用域名，避免 APK 端被墙或被阻断。
     */
    window.fetch = function (input, init) {
        if (typeof input === 'string') {
            const target = needsRewrite(input) ? rewriteUrl(input) : input;
            return fetchWithApiFallback(target, init);
        }

        if (input instanceof Request) {
            return fetchWithApiFallback(rewriteRequest(input), init);
        }

        return originalFetch(input, init);
    };
}

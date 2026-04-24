import { Capacitor } from '@capacitor/core';

export const isNativeApp = Capacitor.isNativePlatform();

const DEFAULT_API_ORIGIN = 'https://littleaibox.com';
const FALLBACK_API_ORIGINS = [
    DEFAULT_API_ORIGIN,
    'https://littleaibox.pages.dev'
];
const DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const isApiPath = (pathname, method = 'GET') => {
    if (
        pathname.startsWith('/api/') ||
        pathname.startsWith('/auth/') ||
        pathname.startsWith('/image-proxy') ||
        pathname.startsWith('/image-get')
    ) {
        return true;
    }

    const normalizedMethod = (method || 'GET').toUpperCase();
    return pathname === '/' && normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD';
};

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

    const needsRewrite = (url, method) => {
        if (!url) return false;

        if (url.startsWith('/')) {
            try {
                const path = new URL(url, currentOrigin).pathname;
                return isApiPath(path, method);
            } catch {
                return false;
            }
        }

        try {
            const parsed = new URL(url);
            if ((parsed.protocol === 'capacitor:' || parsed.protocol === 'ionic:') && isApiPath(parsed.pathname, method)) {
                return true;
            }
            if (DEV_HOSTNAMES.has(parsed.hostname) && isApiPath(parsed.pathname, method)) {
                return true;
            }
        } catch {
            try {
                const parsedWithBase = new URL(url, currentOrigin);
                if (DEV_HOSTNAMES.has(parsedWithBase.hostname) && isApiPath(parsedWithBase.pathname, method)) {
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

    const persistPreferredOrigin = (origin) => {
        try {
            localStorage.setItem(PREFERRED_ORIGIN_STORAGE_KEY, origin);
        } catch (_) { }
    };

    const fetchWithApiFallback = async (input, init) => {
        const requestUrl = typeof input === 'string'
            ? input
            : (input instanceof Request ? input.url : '');
        const requestMethod = (init && init.method)
            ? init.method
            : (input instanceof Request ? input.method : 'GET');

        if (!requestUrl) {
            return originalFetch(input, init);
        }

        let parsed;
        try {
            parsed = new URL(requestUrl);
        } catch {
            parsed = new URL(requestUrl, currentOrigin);
        }

        if (!isApiPath(parsed.pathname, requestMethod)) {
            return originalFetch(input, init);
        }

        let lastError = null;

        for (const origin of apiOrigins) {
            const rebuiltUrl = `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
            const requestToSend = input instanceof Request
                ? new Request(rebuiltUrl, input)
                : rebuiltUrl;
            try {
                const response = await originalFetch(requestToSend, input instanceof Request ? undefined : init);
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
        return originalFetch(input, init);
    };

    /**
     * 在原生端或本地开发环境中，将所有相对本地域名请求重写到正式API域名，
     * 并在需要时自动尝试备用域名，避免 APK 端被墙或被阻断。
     */
    window.fetch = function (input, init) {
        if (typeof input === 'string' || input instanceof Request) {
            return fetchWithApiFallback(input, init);
        }

        return originalFetch(input, init);
    };
}

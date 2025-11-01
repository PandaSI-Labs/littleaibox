import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';

if ('storage' in navigator && 'persist' in navigator.storage) {
    navigator.storage.persist().catch(() => {
        // 静默失败，不影响功能
    });
}

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        if ('navigationPreload' in self.registration) {
            try { await self.registration.navigationPreload.enable(); } catch (_) { }
        }
        await self.clients.claim();
    })());
});

// 自定义网络策略，处理网络错误
const networkOnlyWithFallback = new NetworkOnly({
    plugins: [{
        handlerDidError: async ({ request, error }) => {
            console.warn('Network request failed:', request.url, error);
            return new Response(JSON.stringify({
                error: 'Network connection failed',
                offline: true
            }), {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }]
});

const staleWhileRevalidateWithFallback = new StaleWhileRevalidate({
    cacheName: 'dynamic-content-cache',
    plugins: [{
        handlerDidError: async ({ request, error }) => {
            console.warn('Cache and network failed:', request.url, error);
            const cache = await caches.open('dynamic-content-cache');
            const cachedResponse = await cache.match(request);
            if (cachedResponse) {
                return cachedResponse;
            }

            return new Response(JSON.stringify({
                error: 'Content unavailable offline',
                offline: true
            }), {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }]
});

const navigationNetworkFirst = new NetworkFirst({ cacheName: 'html-cache', networkTimeoutSeconds: 3 });
self.addEventListener('fetch', (event) => {
    if (event.request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const preloadResponse = await event.preloadResponse;
                if (preloadResponse) {
                    return preloadResponse;
                }
            } catch (error) {
                console.warn('Navigation preload failed:', error);
            }
            return navigationNetworkFirst.handle({ event, request: event.request });
        })());
        
        try {
            if (event.preloadResponse) {
                event.waitUntil(event.preloadResponse.catch(() => { }));
            }
        } catch (_) { }
    }
});

registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/libs/') && (request.destination === 'style' || url.pathname.endsWith('.css')),
    new CacheFirst({ cacheName: 'libs-style-cache' })
);

registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/libs/') && (request.destination === 'script' || url.pathname.endsWith('.js')),
    new CacheFirst({ cacheName: 'libs-script-cache' })
);

// APK：默认强缓存
const apkCacheFirst = new CacheFirst({ cacheName: 'apk-cache' });
const apkNetworkFirst = new NetworkFirst({ cacheName: 'apk-cache', networkTimeoutSeconds: 3 });
registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/downloads/') && url.pathname.endsWith('.apk'),
    (options) => {
        const req = options.request;
        const cc = req.headers && req.headers.get('Cache-Control');
        const isReload = req.cache === 'reload' || (cc && cc.includes('no-cache'));
        return isReload ? apkNetworkFirst.handle(options) : apkCacheFirst.handle(options);
    }
);

// 构建产物（哈希静态资源）
registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/assets/'),
    new CacheFirst({ cacheName: 'assets-cache' })
);

// API
registerRoute(
    ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/'),
    networkOnlyWithFallback
);

// 语言包：默认强缓存；在强制刷新时走网络优先并更新缓存
const stripSearchPlugin = {
    cacheKeyWillBeUsed: async ({ request }) => {
        const url = new URL(request.url);
        url.search = '';
        return url.toString();
    }
};
const localesCacheFirst = new CacheFirst({ cacheName: 'locales-cache', plugins: [stripSearchPlugin] });
const localesNetworkFirst = new NetworkFirst({ cacheName: 'locales-cache', networkTimeoutSeconds: 3, plugins: [stripSearchPlugin] });
registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/locales/') && url.pathname.endsWith('.json'),
    (options) => {
        const req = options.request;
        const cc = req.headers && req.headers.get('Cache-Control');
        const isReload = req.cache === 'reload' || (cc && cc.includes('no-cache'));
        return isReload ? localesNetworkFirst.handle(options) : localesCacheFirst.handle(options);
    }
);

registerRoute(({ request, url }) => {
    if (request.mode === 'navigate') return false;
    if (url.pathname.startsWith('/libs/')) return false;
    if (url.pathname.startsWith('/assets/')) return false;
    if (url.pathname.startsWith('/locales/')) return false;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return false;
    return request.method === 'GET';
}, staleWhileRevalidateWithFallback);

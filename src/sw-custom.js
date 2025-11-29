import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';

if ('storage' in navigator && 'persist' in navigator.storage) {
    navigator.storage.persist().catch(() => {
        // 静默失败，不影响功能
    });
}

cleanupOutdatedCaches();

const ADDITIONAL_PRECACHE = [
    { url: '/libs/mermaid.min.js', revision: null },
    { url: '/libs/vega.min.js', revision: null },
    { url: '/libs/vega-lite.min.js', revision: null },
    { url: '/libs/vega-embed.min.js', revision: null },
    { url: '/data/cars.json', revision: null }
];

const manifestEntries = self.__WB_MANIFEST || [];
const normalizePath = (url) => {
    try {
        return new URL(url, self.location.origin).pathname;
    } catch (_) {
        const safe = (url || '').split('?')[0];
        return safe.startsWith('/') ? safe : `/${safe}`;
    }
};
const normalizedManifestUrls = new Set(
    manifestEntries.map((entry) => normalizePath(typeof entry === 'string' ? entry : entry.url))
);

const filteredAdditional = ADDITIONAL_PRECACHE.filter((entry) => {
    const baseUrl = normalizePath(entry.url || '');
    return !normalizedManifestUrls.has(baseUrl);
});

precacheAndRoute(manifestEntries.concat(filteredAdditional));

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

registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/data/') && url.pathname.endsWith('.json'),
    new CacheFirst({ cacheName: 'data-cache' })
);

// PDF.js CMaps（文字映射表）
registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/libs/cmaps/'),
    new CacheFirst({ cacheName: 'libs-cmaps-cache' })
);

// 字体资源（KaTeX/Highlight 等）
registerRoute(
    ({ url, request }) => request.method === 'GET' && (url.pathname.startsWith('/libs/fonts/') || /\.(?:woff2?|ttf|otf|eot)$/.test(url.pathname)),
    new CacheFirst({ cacheName: 'libs-fonts-cache' })
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

// 构建产物
registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/assets/'),
    new CacheFirst({ cacheName: 'assets-cache' })
);

// 图片
registerRoute(
    ({ url, request }) => request.method === 'GET' && /\.(?:png|gif|jpg|jpeg|svg|webp)$/.test(url.pathname),
    new CacheFirst({ cacheName: 'images-cache' })
);

// CDN 静态资源
registerRoute(
    ({ url, request }) => request.method === 'GET' && url.hostname === 'cdn.jsdelivr.net',
    new CacheFirst({ cacheName: 'cdn-fonts-cache' })
);

// 分享页
registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/share/'),
    new StaleWhileRevalidate({ cacheName: 'share-page-cache' })
);

// API
registerRoute(
    ({ url }) => {
        if (url.pathname.startsWith('/api/image-proxy') || url.pathname.startsWith('/api/image-get')) {
            return false;
        }
        return url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/');
    },
    networkOnlyWithFallback
);

// 语言包
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

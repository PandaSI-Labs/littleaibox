import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
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

const rawManifestEntries = self.__WB_MANIFEST || [];

// 过滤掉可能在 APK 环境下导致预缓存失败的文件
const PRECACHE_IGNORE_PATTERNS = [
    /favicon\.ico$/i,
    /apple-touch-icon.*\.png$/i,
];

const manifestEntries = rawManifestEntries.filter((entry) => {
    const url = typeof entry === 'string' ? entry : entry.url;
    return !PRECACHE_IGNORE_PATTERNS.some((pattern) => pattern.test(url));
});

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
    event.waitUntil(
        self.skipWaiting().catch((err) => {
            console.warn('SW install warning:', err);
        })
    );
});

// 捕获未处理的预缓存错误，防止阻塞 SW 安装
self.addEventListener('error', (event) => {
    if (event.message && event.message.includes('bad-precaching-response')) {
        console.warn('Precache error (ignored):', event.message);
        event.preventDefault();
    }
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        if ('navigationPreload' in self.registration) {
            try { await self.registration.navigationPreload.disable(); } catch (_) { }
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

self.addEventListener('fetch', (event) => {
    if (event.request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const requestUrl = new URL(event.request.url);
                if (requestUrl.origin === self.location.origin && requestUrl.pathname.startsWith('/temp_chat/')) {
                    return Response.redirect('/', 302);
                }
                // 始终优先网络且不缓存导航 HTML，避免旧 index.html 引用失效哈希资源
                const networkResponse = await fetch(event.request, { cache: 'no-store' });
                if (networkResponse && networkResponse.ok) {
                    return networkResponse;
                }
                const fallback = await caches.match('/index.html');
                if (fallback) return fallback;
                return networkResponse || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
            } catch (_) {
                const fallback = await caches.match('/index.html');
                if (fallback) return fallback;
                return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
            }
        })());
    }
});

// Workbox 全局兜底：避免 no-response 未捕获异常污染控制台
setCatchHandler(async ({ event, request }) => {
    const url = new URL(request.url);
    if (event?.request?.destination === 'document') {
        const fallback = await caches.match('/index.html');
        if (fallback) return fallback;
    }

    if (url.origin === self.location.origin && url.pathname.startsWith('/temp_chat/')) {
        return Response.redirect('/', 302);
    }

    return new Response(JSON.stringify({
        error: 'Network request failed',
        offline: true
    }), {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
    });
});

const cacheFirstSafe = (cacheName) => async ({ request }) => {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    let response;
    try {
        response = await fetch(request);
    } catch (error) {
        throw error;
    }
    if (!response || !response.ok) {
        return response;
    }
    const canStoreRequest = request.method === 'GET'
        && !request.headers?.has('range')
        && request.cache !== 'no-store';
    const canStoreResponse = response.status === 200 && response.type === 'basic';
    try {
        if (canStoreRequest && canStoreResponse) {
            await cache.put(request, response.clone());
        }
    } catch (error) {
        console.warn('Cache put failed:', request.url, error);
    }
    return response;
};

registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/libs/') && (request.destination === 'style' || url.pathname.endsWith('.css')),
    cacheFirstSafe('libs-style-cache')
);

registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/libs/') && (request.destination === 'script' || url.pathname.endsWith('.js')),
    cacheFirstSafe('libs-script-cache')
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
    ({ url, request }) => request.method === 'GET'
        && url.origin === self.location.origin
        && (url.pathname.startsWith('/libs/fonts/') || /\.(?:woff2?|ttf|otf|eot)$/.test(url.pathname)),
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

// temp_chat: 不走缓存策略，避免网络失败时触发 Cache+Network 告警
registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/temp_chat/'),
    async ({ request }) => {
        if (request.mode === 'navigate' || request.destination === 'document') {
            return Response.redirect('/', 302);
        }
        return fetch(request);
    }
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
    if (url.origin !== self.location.origin) return false;
    if (url.pathname.startsWith('/temp_chat/')) return false;
    if (url.pathname.startsWith('/libs/')) return false;
    if (url.pathname.startsWith('/assets/')) return false;
    if (url.pathname.startsWith('/locales/')) return false;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return false;
    if (url.hostname === 'fonts.littleaibox.com') return false;
    return request.method === 'GET';
}, staleWhileRevalidateWithFallback);

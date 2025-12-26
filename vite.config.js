import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const appBuildId = process.env.APP_BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    new Date().toISOString();

export default defineConfig({
    // 基础构建配置
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: 'index.html'
        }
    },
    publicDir: 'public',
    define: {
        __APP_BUILD_ID__: JSON.stringify(appBuildId),
    },

    // PWA 插件配置
    plugins: [
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw-custom.js',
            injectManifest: {
                maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
            },

            // --- Service Worker 配置 ---
            registerType: 'autoUpdate',
            injectRegister: 'auto',

            // --- Workbox 缓存策略配置 ---
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,gif,woff,woff2}'],
                runtimeCaching: [
                    // 缓存图片
                    {
                        urlPattern: /\.(?:png|gif|jpg|jpeg|svg|webp)$/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'images-cache',
                            expiration: {
                                maxEntries: 60,
                                maxAgeSeconds: 30 * 24 * 60 * 60, // 30天
                            },
                        },
                    },
                    // 缓存 /libs/ 下的第三方库
                    {
                        urlPattern: ({ url }) => url.pathname.startsWith('/libs/'),
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'libs-cache',
                            expiration: {
                                maxEntries: 50,
                                maxAgeSeconds: 30 * 24 * 60 * 60, // 30天
                            },
                        },
                    },
                    {
                        urlPattern: ({ url, request }) =>
                            request.method === 'GET' &&
                            (url.pathname.startsWith('/api/chats/') || url.pathname.startsWith('/auth/me')),
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'api-data-cache',
                            networkTimeoutSeconds: 3,
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 30 * 24 * 60 * 60,
                            },
                            plugins: [
                                {
                                    cacheWillUpdate: async ({ response }) => {
                                        if (response && response.status === 200) {
                                            return response;
                                        }
                                        return null;
                                    },
                                },
                            ],
                        },
                    },
                    {
                        urlPattern: ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/'),
                        handler: 'NetworkOnly',
                        method: 'POST',
                    },
                    {
                        urlPattern: ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/'),
                        handler: 'NetworkOnly',
                        options: {},
                        method: 'PUT',
                    },
                    {
                        urlPattern: ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/'),
                        handler: 'NetworkOnly',
                        options: {},
                        method: 'DELETE',
                    },
                    {
                        urlPattern: ({ url }) => url.hostname === 'cdn.jsdelivr.net',
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'cdn-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 180 * 24 * 60 * 60,
                            },
                        },
                    },
                    {
                        urlPattern: ({ url }) => url.pathname.startsWith('/share/'),
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'share-page-cache',
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 7 * 24 * 60 * 60,
                            },
                        },
                    }
                ]
            },

            manifestFilename: 'manifest.json',
            manifest: {
                // --- 基础信息 ---
                name: 'LittleAIBox',
                short_name: 'LittleAIBox',
                description: '智能AI对话助手',
                lang: 'zh-CN',
                version: '2.8.7',

                // --- 外观与显示 ---
                theme_color: '#ffffff',
                background_color: '#ffffff',
                display: 'standalone',
                display_override: [
                    'standalone'
                ],
                orientation: 'any',
                dir: 'ltr',

                // --- 启动与标识 ---
                scope: '/',
                start_url: '/',
                id: '/',
                "scope_extensions": [
                    { "origin": "https://littleaibox.com" }
                ],
                "launch_handler": {
                    "client_mode": "focus-existing"
                },

                // --- 快捷方式 ---
                "shortcuts": [
                    {
                        "name": "开始新对话",
                        "short_name": "新对话",
                        "description": "打开应用并开始一个新的对话",
                        "url": "/",
                        "icons": [{ "src": "images/pwa-192x192.png", "sizes": "192x192" }]
                    },
                    {
                        "name": "打开设置",
                        "short_name": "设置",
                        "description": "直接打开应用的设置页面",
                        "url": "/?action=open-settings",
                        "icons": [{ "src": "images/pwa-192x192.png", "sizes": "192x192" }]
                    }
                ],

                "note_taking": {
                    "new_note_url": "/?action=new-note",
                    "params": {
                        "text": "text"
                    }
                },

                // --- Edge 侧边栏 ---
                "edge_side_panel": {
                    "preferred_width": 480
                },

                // --- 应用商店与分类信息 ---
                categories: ['productivity', 'utilities', 'education'],
                iarc_rating_id: 'e84b072d-71b3-4d3e-86ae-31a8ce6e53b7',

                // --- 关联原生应用 ---
                prefer_related_applications: false,
                related_applications: [],

                // --- 应用图标 ---
                icons: [
                    { src: 'images/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: 'images/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    { src: 'images/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
                ],

                // --- 应用截图 ---
                screenshots: [
                    { "src": "images/412x915app(1).png", "sizes": "412x915", "type": "image/png", "form_factor": "narrow", "label": "手机端主视图" },
                    { "src": "images/412x915app(2).png", "sizes": "412x915", "type": "image/png", "form_factor": "narrow", "label": "手机端登录页面" },
                    { "src": "images/412x915app(3).png", "sizes": "412x915", "type": "image/png", "form_factor": "narrow", "label": "手机端设置页面" },
                    { "src": "images/1340x1080win(1).png", "sizes": "1340x1080", "type": "image/png", "form_factor": "wide", "label": "桌面版主视图" },
                    { "src": "images/1340x1080win(2).png", "sizes": "1340x1080", "type": "image/png", "form_factor": "wide", "label": "桌面版登录页面" },
                    { "src": "images/1340x1080win(3).png", "sizes": "1340x1080", "type": "image/png", "form_factor": "wide", "label": "桌面版设置页面" }
                ]
            }
        })
    ]
});

import { Capacitor } from '@capacitor/core';

export const isNativeApp = Capacitor.isNativePlatform();

// API 基础 URL
export const API_BASE_URL = isNativeApp
    ? 'https://ai.littletea.xyz'  // App 环境：使用完整 URL
    : '';                          // 网页环境：使用相对路径

const originalFetch = window.fetch;

/**
 * 拦截所有 fetch 请求，自动添加完整 URL
 */
window.fetch = function (url, options) {
    if (typeof url === 'string' && url.startsWith('/') && isNativeApp) {
        url = API_BASE_URL + url;
    }

    return originalFetch(url, options);
};

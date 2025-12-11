const translations = {};
const translationsLoaded = {};
let __runtimeLanguage = null;
const SUPPORTED_LANGUAGES = ['en', 'zh-CN', 'zh-TW', 'es', 'ja', 'ko', 'fr'];
const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';
const TRANSLATION_CACHE_PREFIX = `translations_${APP_BUILD_ID}_`;

function getTranslationCacheKey(lang) {
    return `${TRANSLATION_CACHE_PREFIX}${lang}`;
}

/**
 * 尝试从网络或 SW 缓存中获取指定语言的 JSON。
 */
async function fetchLocale(lang) {
    const url = `/locales/${lang}.json`;
    const resp = await fetch(url, { cache: 'default' });
    if (resp.ok) {
        return resp.json();
    }
    return null;
}

async function fetchAndStoreLocale(lang) {
    const data = await fetchLocale(lang);
    if (data) {
        translations[lang] = data;
        translationsLoaded[lang] = true;
        await cacheTranslations(lang, data);
    }
}

/**
 * Loads the translation file for the given language.
 * - preferCacheFirst: 先从 localStorage 使用缓存数据，立即生效
 * - revalidateInBackground: 使用缓存后，后台静默更新到最新
 */
async function loadTranslations(lang, { preferCacheFirst = true, revalidateInBackground = true } = {}) {
    try {
        // 内存已有时，直接返回
        if (translationsLoaded[lang] && translations[lang]) {
            return true;
        }

        // 优先使用本地缓存，避免网络请求
        if (preferCacheFirst) {
            const cachedData = await getCachedTranslations(lang);
            if (cachedData) {
                translations[lang] = cachedData;
                translationsLoaded[lang] = true;
                if (revalidateInBackground) {
                    void fetchAndStoreLocale(lang).catch(() => { });
                }
                return true;
            }
        }

        // 无缓存再请求（SW 路由会命中 CacheFirst）
        const data = await fetchLocale(lang);
        if (data) {
            translations[lang] = data;
            translationsLoaded[lang] = true;
            await cacheTranslations(lang, data);
            return true;
        }

        throw new Error(`Failed to load translation file for ${lang}`);
    } catch (error) {
        if (!translations[lang]) {
            translationsLoaded[lang] = false;
        }
        console.warn(`Failed to load translations for ${lang}:`, error);
        return false;
    }
}

/**
 * 从 localStorage 读取缓存翻译
 */
async function getCachedTranslations(lang) {
    try {
        const cached = localStorage.getItem(getTranslationCacheKey(lang));
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (error) {
        console.warn(`Failed to load cached translations for ${lang}:`, error);
    }
    return null;
}

/**
 * 将翻译数据写入 localStorage
 */
async function cacheTranslations(lang, data) {
    try {
        localStorage.setItem(getTranslationCacheKey(lang), JSON.stringify(data));
    } catch (error) {
        console.warn(`Failed to cache translations for ${lang}:`, error);
    }
}

/**
 * 清理所有语言缓存，强制重新加载翻译文件
 */
async function clearTranslationCache() {
    try {
        // 清除 localStorage 中的翻译缓存
        for (const lang of SUPPORTED_LANGUAGES) {
            localStorage.removeItem(getTranslationCacheKey(lang));
            delete translations[lang];
            translationsLoaded[lang] = false;
        }

        // 清除 CacheStorage 中的语言文件缓存
        if ('caches' in window) {
            try {
                await caches.delete('locales-cache');
            } catch (error) {
                // 如果缓存不存在，忽略错误
            }
        }
    } catch (error) {
        console.warn('Failed to clear translation cache:', error);
    }
}

/**
 * 后台预加载所有语言文件：
 * - 预热 CacheStorage（命中 SW 的 CacheFirst）
 * - 写入 localStorage，确保切换语言无需再请求网络
 */
async function preloadAllTranslations() {
    try {
        if (typeof caches !== 'undefined' && caches?.open) {
            try {
                const cache = await caches.open('locales-cache');
                const urls = SUPPORTED_LANGUAGES.map(l => `/locales/${l}.json`);
                await Promise.allSettled(urls.map(u => cache.add(u)));
            } catch (e) {
                console.warn('Pre-warm locales cache failed:', e);
            }
        }

        await Promise.allSettled(
            SUPPORTED_LANGUAGES.map(async (l) => {
                if (translationsLoaded[l] && translations[l]) return;
                let data = await getCachedTranslations(l);
                if (!data) data = await fetchLocale(l);
                if (data) {
                    translations[l] = data;
                    translationsLoaded[l] = true;
                    await cacheTranslations(l, data);
                }
            })
        );
    } catch (error) {
        console.warn('Failed to preload translations:', error);
    }
}

/**
 * Gets a translation value by key path (supports nested keys like 'common.cancel')
 */
function t(lang, keyPath, params = {}) {
    if (!translationsLoaded[lang] || !translations[lang]) {
        return keyPath;
    }

    const keys = keyPath.split('.');
    let value = translations[lang];

    for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
            value = value[key];
        } else {
            return keyPath;
        }
    }

    if (typeof value !== 'string') {
        return keyPath;
    }

    return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
        return params[paramKey] !== undefined ? params[paramKey] : match;
    });
}

/**
 * Translates the page content based on the loaded translations.
 */
function translatePage(lang) {
    if (!translations[lang]) {
        return;
    }

    document.querySelectorAll('[data-i18n-key]').forEach(element => {
        const key = element.getAttribute('data-i18n-key');
        const translatedText = t(lang, key);
        if (translatedText !== key) {
            element.innerText = translatedText;
        }
    });

    document.querySelectorAll('[data-i18n-placeholder-key]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder-key');
        const translatedText = t(lang, key);
        if (translatedText !== key) {
            element.placeholder = translatedText;
        }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        const translatedText = t(lang, key);
        if (translatedText !== key) {
            element.title = translatedText;
        }
    });

    document.querySelectorAll('[data-placeholder-key]').forEach(element => {
        const key = element.getAttribute('data-placeholder-key');
        const translatedText = t(lang, key);
        if (translatedText !== key) {
            element.setAttribute('data-placeholder', translatedText);
        }
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
        const key = element.getAttribute('data-i18n-aria-label');
        const translatedText = t(lang, key);
        if (translatedText !== key) {
            element.setAttribute('aria-label', translatedText);
        }
    });

    // Alt attribute translation support
    document.querySelectorAll('[data-i18n-alt]').forEach(element => {
        const key = element.getAttribute('data-i18n-alt');
        const translatedText = t(lang, key);
        if (translatedText !== key) {
            element.setAttribute('alt', translatedText);
        }
    });
}

/**
 * Gets the current language from localStorage or defaults to browser language
 * Note: This function only reads from localStorage, not from currentUser.language
 * Use the full language detection logic in main.js for complete language detection
 */
function getCurrentLanguage() {
    if (__runtimeLanguage) {
        return __runtimeLanguage;
    }
    try {
        const guestLang = sessionStorage.getItem('guest_selectedLanguage');
        if (guestLang) {
            return guestLang;
        }
    } catch (_) { }
    const storedLang = localStorage.getItem('selectedLanguage');
    if (storedLang) {
        return storedLang;
    }

    const browserLang = navigator.language || navigator.languages[0] || 'zh-CN';
    const defaultLang = browserLang.startsWith('zh-TW') || browserLang.startsWith('zh-HK') ? 'zh-TW' :
        browserLang.startsWith('zh') ? 'zh-CN' :
            browserLang.startsWith('ja') ? 'ja' :
                browserLang.startsWith('ko') ? 'ko' :
                    browserLang.startsWith('es') ? 'es' :
                        browserLang.startsWith('fr') ? 'fr' :
                            browserLang.startsWith('en') ? 'en' : 'zh-CN';
    return defaultLang;
}

const __afterApplyCallbacks = new Set();
function onAfterLanguageApplied(cb) {
    if (typeof cb === 'function') {
        __afterApplyCallbacks.add(cb);
    }
    return () => __afterApplyCallbacks.delete(cb);
}


async function applyLanguage(lang) {
    try {
        __runtimeLanguage = lang;
        const loadSuccess = await loadTranslations(lang, { preferCacheFirst: true, revalidateInBackground: true });

        if (!loadSuccess || !translations[lang] || !translationsLoaded[lang]) {
            console.warn(`Failed to load translations for ${lang}`);
            return false;
        }

        await new Promise(resolve => setTimeout(resolve, 10));
        translatePage(lang);

        if (typeof renderModelMenu === 'function') {
            renderModelMenu();
        }

        if (typeof scheduleRenderSidebar === 'function') {
            scheduleRenderSidebar();
        }

        if (typeof updateMessageActionLabels === 'function') {
            updateMessageActionLabels();
        }
        try {
            __afterApplyCallbacks.forEach(cb => {
                try { cb(); } catch (_) { }
            });
        } catch (_) { }

        setTimeout(() => {
            if (typeof updateUsageDisplay === 'function') {
                updateUsageDisplay();
            }
        }, 50);

        await new Promise(resolve => setTimeout(resolve, 50));

        return true;
    } catch (error) {
        console.error('Error applying language:', error);
        return false;
    }
}

// Export the functions for use in other modules
export { applyLanguage, clearTranslationCache, getCurrentLanguage, onAfterLanguageApplied, preloadAllTranslations, t, translatePage };

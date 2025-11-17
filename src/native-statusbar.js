import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

const isNativeApp = Capacitor.isNativePlatform();

const THEME_CONFIG = {
    light: {
        statusBarStyle: Style.Light,
        statusBarColor: '#ffffff'
    },
    dark: {
        statusBarStyle: Style.Dark,
        statusBarColor: '#1e1e1e'
    }
};

const THEME_COLOR_META = {
    light: '#ffffff',
    dark: '#1e1e1e'
};

async function updateNativeStatusBar() {
    if (!isNativeApp) return;
    try {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const config = THEME_CONFIG[currentTheme];
        await StatusBar.setStyle({ style: config.statusBarStyle });
        await StatusBar.setBackgroundColor({ color: config.statusBarColor });
    } catch (error) {
        console.error('StatusBar error:', error);
    }
}

function updatePwaThemeColor() {
    try {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const color = THEME_COLOR_META[currentTheme] || '#ffffff';
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'theme-color');
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', color);
    } catch (error) {
        console.error('theme-color meta update error:', error);
    }
}

function updatePreThemeBaseBg() {
    try {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const bg = currentTheme === 'dark' ? '#1e1e1e' : '#ffffff';
        const colorScheme = currentTheme === 'dark' ? 'dark' : 'light';
        const styleEl = document.getElementById('pre-theme-style');
        if (styleEl) {
            styleEl.textContent = 'html,body{background-color:' + bg + ';}';
        }
        document.documentElement.style.setProperty('color-scheme', colorScheme);
    } catch (_) {
        // ignore
    }
}

function watchThemeChanges() {
    updateNativeStatusBar();
    updatePwaThemeColor();
    updatePreThemeBaseBg();

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                updateNativeStatusBar();
                updatePwaThemeColor();
                updatePreThemeBaseBg();
            }
        });
    });

    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchThemeChanges);
} else {
    watchThemeChanges();
}

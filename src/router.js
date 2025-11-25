const DEFAULT_SETTINGS_SECTION = 'profile';

function normalizePathname(pathname = '') {
    if (!pathname || pathname === '/') return '';
    return pathname.replace(/^\/+|\/+$/g, '');
}

function parseRouteFromLocation() {
    if (typeof window === 'undefined') {
        return { name: 'home', params: {} };
    }
    const { pathname, search } = window.location;
    const segments = normalizePathname(pathname).split('/').filter(Boolean);

    if (segments.length >= 3 &&
        (segments[0] === 'chat' || segments[0] === 'temp_chat') &&
        segments[2] === 'settings') {
        const chatRoute = segments[0] === 'temp_chat' ? 'tempChat' : 'chat';
        const chatId = decodeURIComponent(segments[1]);
        const section = segments[3] ? decodeURIComponent(segments[3]) : DEFAULT_SETTINGS_SECTION;
        return { name: 'settings', params: { section, chatId, chatRoute } };
    }

    if (segments.length >= 2 && segments[0] === 'chat') {
        return { name: 'chat', params: { chatId: decodeURIComponent(segments[1]) } };
    }
    if (segments.length >= 2 && segments[0] === 'temp_chat') {
        return { name: 'tempChat', params: { chatId: decodeURIComponent(segments[1]) } };
    }
    if (segments.length >= 1 && segments[0] === 'settings') {
        const section = segments[1] ? decodeURIComponent(segments[1]) : DEFAULT_SETTINGS_SECTION;
        return { name: 'settings', params: { section } };
    }
    if (segments.length >= 3 && segments[0] === 'auth' && segments[2] === 'callback') {
        const provider = decodeURIComponent(segments[1] || '');
        return { name: 'oauthCallback', params: { provider, search } };
    }
    if (segments.length >= 1 && segments[0] === 'auth') {
        const mode = segments[1] ? decodeURIComponent(segments[1]) : 'login';
        if (mode === 'reset-password') {
            const token = segments[2] ? decodeURIComponent(segments[2]) : '';
            if (token) {
                return { name: 'auth', params: { mode: 'reset', token } };
            }
            return { name: 'auth', params: { mode: 'reset-request' } };
        }
        if (mode === 'verify-email') {
            return { name: 'auth', params: { mode: 'verify' } };
        }
        return { name: 'auth', params: { mode } };
    }
    return { name: 'home', params: {} };
}

function buildPath(routeName, params = {}) {
    const safeId = (value) => encodeURIComponent(String(value || '').trim());
    switch (routeName) {
        case 'chat':
            return params.chatId ? `/chat/${safeId(params.chatId)}` : '/';
        case 'tempChat':
            return params.chatId ? `/temp_chat/${safeId(params.chatId)}` : '/';
        case 'settings': {
            const section = params.section || DEFAULT_SETTINGS_SECTION;
            if (params.chatId) {
                const chatRoute = params.chatRoute === 'tempChat' ? 'temp_chat' : 'chat';
                return `/${chatRoute}/${safeId(params.chatId)}/settings/${safeId(section)}`;
            }
            return `/settings/${safeId(section)}`;
        }
        case 'auth': {
            if (params.mode === 'reset') {
                const token = params.token ? `/${encodeURIComponent(params.token)}` : '';
                return `/auth/reset-password${token}`;
            }
            if (params.mode === 'reset-request') {
                return '/auth/reset-password';
            }
            if (params.mode === 'verify') {
                return '/auth/verify-email';
            }
            const mode = params.mode === 'register' ? 'register' : 'login';
            return `/auth/${mode}`;
        }
        case 'oauthCallback':
            if (params.provider) {
                return `/auth/${safeId(params.provider)}/callback`;
            }
            return '/auth/login';
        case 'home':
        default:
            return '/';
    }
}

class AppRouter {
    constructor() {
        this.listeners = new Set();
        this.initialized = false;
        this.managedDepth = 0;
        this.currentRoute = parseRouteFromLocation();
        this.options = {};
    }

    canUseHistory() {
        return typeof window !== 'undefined' &&
            typeof window.history !== 'undefined' &&
            typeof window.history.pushState === 'function';
    }

    ensureRootState() {
        if (!this.canUseHistory()) return;
        try {
            if (!window.history.state || !window.history.state.__labRoot) {
                window.history.replaceState({ __labRoot: true }, document.title, window.location.href);
            }
            window.history.pushState({ __labKeep: Date.now() }, document.title, window.location.href);
        } catch (error) {
            console.warn('Router root state failed:', error);
        }
    }

    init(options = {}) {
        if (this.initialized || !this.canUseHistory()) {
            return;
        }
        this.initialized = true;
        this.options = options;
        if (!options.isNativeApp) {
            this.ensureRootState();
        }
        window.addEventListener('popstate', (event) => {
            if (options.shouldIgnorePop?.()) {
                options.onPopIgnored?.();
                return;
            }
            const state = event.state;
            if (state && state.route && this.managedDepth > 0) {
                this.managedDepth = Math.max(0, this.managedDepth - 1);
            }
            if (state && state.route) {
                this.currentRoute = { name: state.route, params: state.params || {} };
            } else {
                this.currentRoute = parseRouteFromLocation();
            }
            this.notifyListeners({ type: 'pop', route: this.currentRoute, event });
            options.onBack?.(this.currentRoute, event);
        });
    }

    navigate(routeName, params = {}, options = {}) {
        if (!this.canUseHistory()) {
            return;
        }
        const url = new URL(window.location.href);
        url.pathname = buildPath(routeName, params);
        url.search = '';
        const targetUrl = `${url.pathname}${url.hash}`;

        const state = { route: routeName, params };
        const method = options.replace ? 'replaceState' : 'pushState';

        // 更新URL
        const updateUrl = () => {
            try {
                window.history[method](state, document.title, targetUrl);
                if (!options.replace) {
                    this.managedDepth += 1;
                }
                this.currentRoute = { name: routeName, params };
                if (!options.silent) {
                    this.notifyListeners({ type: method === 'replaceState' ? 'replace' : 'push', route: this.currentRoute });
                }
            } catch (error) {
                console.error('Router navigation failed:', error);
            }
        };
        requestAnimationFrame(updateUrl);
    }

    pushPlaceholder() {
        if (!this.canUseHistory()) {
            return;
        }
        try {
            window.history.pushState({ __labKeep: Date.now() }, document.title, window.location.href);
        } catch (error) {
            console.warn('Router placeholder push failed:', error);
        }
    }

    back(options = {}) {
        if (!this.canUseHistory()) {
            options.onFallback?.();
            return false;
        }
        if (this.managedDepth > 0) {
            window.history.back();
            return true;
        }
        if (options.fallbackRoute) {
            this.navigate(options.fallbackRoute.name, options.fallbackRoute.params || {}, { replace: true, silent: true });
        }
        options.onFallback?.();
        return false;
    }

    getCurrentRoute() {
        return this.currentRoute;
    }

    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notifyListeners(payload) {
        this.listeners.forEach((listener) => {
            try {
                listener(payload);
            } catch (error) {
                console.error('Router listener error:', error);
            }
        });
    }

    resetManagedHistory() {
        this.managedDepth = 0;
    }
}

const router = new AppRouter();

export default router;
export { AppRouter, DEFAULT_SETTINGS_SECTION };

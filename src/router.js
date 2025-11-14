const ROUTER_STATE_KEY = '__appRouter';

function compilePath(path) {
    if (!path.startsWith('/')) {
        throw new Error(`Route path must start with "/": ${path}`);
    }
    const paramNames = [];
    const pattern = path.replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
    });
    const regex = new RegExp(`^${pattern}$`);

    const buildPath = (params = {}) => {
        return path.replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
            if (!(name in params)) {
                throw new Error(`Missing param "${name}" for path ${path}`);
            }
            return encodeURIComponent(params[name]);
        });
    };

    return { regex, paramNames, buildPath };
}

export class Router {
    constructor(options = {}) {
        this.routes = new Map();
        this.base = options.base || '';
        this.current = null;
        this.currentDepth = 0;
        this.initialized = false;
        this.handlePopState = this.handlePopState.bind(this);
        this.routerId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        this.notFoundHandler = null;
        this.beforeEachHandler = null;
        this.skipNextPop = false;
    }

    registerRoute({ name, path, enter, leave }) {
        if (!name || !path) {
            throw new Error('Route must have both name and path.');
        }
        const compiled = compilePath(path);
        this.routes.set(name, {
            name,
            path,
            enter,
            leave,
            ...compiled
        });
        return this;
    }

    setNotFound(handler) {
        this.notFoundHandler = handler;
        return this;
    }

    setBeforeEach(handler) {
        this.beforeEachHandler = handler;
        return this;
    }

    init(defaultRoute) {
        if (this.initialized) return;
        const initialMatch = this.matchPath(location.pathname);
        const target = initialMatch || (typeof defaultRoute === 'string'
            ? { route: this.routes.get(defaultRoute), params: {} }
            : defaultRoute);

        if (!target || !target.route) {
            throw new Error('Router needs a valid default route to initialize.');
        }

        const initialState = this.createState(target.route.name, target.params, 0);
        this.replaceHistoryState(initialState, this.resolveUrl(target.route, target.params));
        this.applyRoute(target.route, target.params, { replace: true, initial: true });
        window.addEventListener('popstate', this.handlePopState);
        this.initialized = true;
    }

    navigate(name, params = {}, options = {}) {
        const route = this.routes.get(name);
        if (!route) {
            console.warn(`[Router] Unknown route "${name}"`);
            return;
        }
        const resolvedParams = params || {};
        const url = this.resolveUrl(route, resolvedParams);
        const nextDepth = options.replace ? this.currentDepth : this.currentDepth + 1;
        const state = this.createState(name, resolvedParams, nextDepth);

        if (options.replace) {
            this.replaceHistoryState(state, url);
        } else {
            history.pushState(state, document.title, url);
            this.currentDepth = nextDepth;
        }

        this.applyRoute(route, resolvedParams, { replace: !!options.replace });
    }

    replace(name, params = {}) {
        this.navigate(name, params, { replace: true });
    }

    reset(name, params = {}) {
        const route = this.routes.get(name);
        if (!route) {
            console.warn(`[Router] Unknown route "${name}"`);
            return;
        }
        const resolvedParams = params || {};
        const url = this.resolveUrl(route, resolvedParams);
        const state = this.createState(name, resolvedParams, 0);
        this.replaceHistoryState(state, url);
        this.applyRoute(route, resolvedParams, { replace: true });
    }

    setCurrentRouteExternal(name, params = {}) {
        const route = this.routes.get(name);
        if (!route) {
            console.warn(`[Router] Unknown route "${name}"`);
            return;
        }
        const resolvedParams = params || {};
        const url = this.resolveUrl(route, resolvedParams);
        const state = this.createState(name, resolvedParams, this.currentDepth);
        this.replaceHistoryState(state, url);
        this.current = { route, params: resolvedParams };
    }

    back() {
        if (!this.initialized) return;
        history.back();
    }

    canGoBack() {
        return this.currentDepth > 0;
    }

    getCurrentRouteName() {
        return this.current?.route?.name || null;
    }

    isActive(name) {
        return this.getCurrentRouteName() === name;
    }

    async shouldAllowNavigation(route, params, meta = {}) {
        if (!this.beforeEachHandler) return true;
        try {
            const result = await this.beforeEachHandler(route, params, meta);
            return result !== false;
        } catch (error) {
            console.error('[Router] Error in beforeEach handler:', error);
            return true;
        }
    }

    createState(name, params, depth) {
        return {
            name,
            params,
            __depth: depth,
            [ROUTER_STATE_KEY]: this.routerId
        };
    }

    resolveUrl(route, params) {
        const path = route.buildPath(params);
        return `${this.base}${path}`.replace(/\/{2,}/g, '/');
    }

    replaceHistoryState(state, url) {
        history.replaceState(state, document.title, url);
        this.currentDepth = state.__depth || 0;
    }

    matchPath(pathname) {
        for (const route of this.routes.values()) {
            const match = route.regex.exec(pathname);
            if (match) {
                const params = {};
                route.paramNames.forEach((name, index) => {
                    params[name] = decodeURIComponent(match[index + 1]);
                });
                return { route, params };
            }
        }
        return null;
    }

    async applyRoute(route, params, meta = {}) {
        if (!meta?.skipGuard) {
            const shouldContinue = await this.shouldAllowNavigation(route, params, meta);
            if (shouldContinue === false) {
                return;
            }
        }

        const previous = this.current;
        if (previous && previous.route.leave) {
            try {
                await previous.route.leave(previous.params, meta);
            } catch (error) {
                console.error('[Router] Error during route leave:', error);
            }
        }

        if (this.beforeEachHandler) {
            try {
                const shouldContinue = await this.beforeEachHandler(route, params, meta);
                if (shouldContinue === false) {
                    return;
                }
            } catch (error) {
                console.error('[Router] Error in beforeEach handler:', error);
            }
        }

        this.current = { route, params };

        if (route.enter) {
            try {
                await route.enter(params, meta);
            } catch (error) {
                console.error('[Router] Error during route enter:', error);
            }
        }
    }

    async handlePopState(event) {
        if (this.skipNextPop) {
            this.skipNextPop = false;
            return;
        }
        const state = event.state;
        if (!state || state[ROUTER_STATE_KEY] !== this.routerId) {
            const fallback = this.matchPath(location.pathname);
            if (fallback && fallback.route) {
                const inferredState = this.createState(fallback.route.name, fallback.params, 0);
                this.replaceHistoryState(inferredState, this.resolveUrl(fallback.route, fallback.params));
                await this.applyRoute(fallback.route, fallback.params, { replace: true, fromPop: true });
            } else if (this.notFoundHandler) {
                this.notFoundHandler(location.pathname);
            }
            return;
        }

        this.currentDepth = state.__depth || 0;
        const route = this.routes.get(state.name);
        if (!route) {
            if (this.notFoundHandler) {
                this.notFoundHandler(location.pathname);
            }
            return;
        }
        const shouldContinue = await this.shouldAllowNavigation(route, state.params || {}, { replace: true, fromPop: true });
        if (shouldContinue === false) {
            this.skipNextPop = true;
            history.go(1);
            return;
        }
        await this.applyRoute(route, state.params || {}, { replace: true, fromPop: true, skipGuard: true });
    }
}

export const appRouter = new Router({ base: '/' });

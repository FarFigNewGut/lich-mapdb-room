let routes = {};
let notFoundHandler = null;

export function addRoute(pattern, handler) {
    routes[pattern] = handler;
}

export function setNotFound(handler) {
    notFoundHandler = handler;
}

export function navigate(path, replace = false) {
    if (replace) {
        history.replaceState(null, '', `#${path}`);
    } else {
        history.pushState(null, '', `#${path}`);
    }
    handleRoute();
}

export function getCurrentPath() {
    return window.location.hash.slice(1) || '/search';
}

export function handleRoute() {
    const fullPath = getCurrentPath();
    const [path, queryString] = fullPath.split('?');
    
    if (routes[path]) {
        const params = parseQueryString(queryString);
        routes[path]({ query: params });
        return;
    }
    
    for (const [pattern, handler] of Object.entries(routes)) {
        const match = matchPattern(pattern, path);
        if (match) {
            match.query = parseQueryString(queryString);
            handler(match);
            return;
        }
    }
    
    if (notFoundHandler) {
        notFoundHandler(path);
    }
}

function matchPattern(pattern, path) {
    const paramNames = [];
    const regexPattern = pattern.replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/?]+)';
    });
    
    const regex = new RegExp(`^${regexPattern}$`);
    const match = path.match(regex);
    
    if (!match) return null;
    
    const params = {};
    paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
    });
    
    return params;
}

function parseQueryString(queryString) {
    if (!queryString) return {};
    const params = new URLSearchParams(queryString);
    return Object.fromEntries(params);
}

export function init() {
    window.addEventListener('hashchange', handleRoute);
    window.addEventListener('popstate', handleRoute);
}

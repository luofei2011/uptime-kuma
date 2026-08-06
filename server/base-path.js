/**
 * Normalize the public base path used to expose Uptime Kuma.
 *
 * The normalized value always starts with a slash and never ends with one,
 * except for the root path itself.
 * @param {string|undefined|null} value Raw base path
 * @returns {string} Normalized base path
 * @throws {Error} If the value is not a path
 */
function normalizeBasePath(value) {
    let basePath = String(value || "/").trim();

    if (!basePath.startsWith("/")) {
        basePath = "/" + basePath;
    }

    if (basePath.includes("?") || basePath.includes("#") || basePath.includes("\\")) {
        throw new Error("UPTIME_KUMA_BASE_PATH must be a URL path without a query string or fragment");
    }

    if (basePath.includes("//") || basePath.split("/").some((segment) => segment === "." || segment === "..")) {
        throw new Error("UPTIME_KUMA_BASE_PATH must not contain empty, '.' or '..' path segments");
    }

    basePath = basePath.replace(/\/+$/, "");
    return basePath || "/";
}

/**
 * Return the base path with a trailing slash.
 * @param {string} basePath Normalized base path
 * @returns {string} Base path with a trailing slash
 */
function basePathWithTrailingSlash(basePath) {
    return basePath === "/" ? "/" : basePath + "/";
}

/**
 * Prefix an application path with the configured base path.
 * Absolute URLs and data URLs are returned unchanged.
 * @param {string} path Application path
 * @param {string} basePath Normalized base path
 * @returns {string} Public path
 */
function withBasePath(path, basePath) {
    if (!path || /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(path) || path.startsWith("data:")) {
        return path;
    }

    const absolutePath = path.startsWith("/") ? path : "/" + path;
    if (basePath === "/" || absolutePath === basePath || absolutePath.startsWith(basePath + "/")) {
        return absolutePath;
    }

    return basePath + absolutePath;
}

/**
 * Remove the configured base path from an incoming request URL.
 * @param {string} url Request URL, including an optional query string
 * @param {string} basePath Normalized base path
 * @returns {string|null} Internal URL, or null when it is outside the base path
 */
function withoutBasePath(url, basePath) {
    if (basePath === "/") {
        return url;
    }

    if (url === basePath) {
        return "/";
    }

    if (url.startsWith(basePath + "?") || url.startsWith(basePath + "/")) {
        const internalURL = url.slice(basePath.length) || "/";
        return internalURL.startsWith("?") ? "/" + internalURL : internalURL;
    }

    return null;
}

/**
 * Create middleware that exposes the Express application below a base path.
 * Requests to the origin root are redirected to the configured application
 * root; unrelated root paths return 404.
 * @param {string} basePath Normalized base path
 * @returns {Function} Express middleware
 */
function createBasePathMiddleware(basePath) {
    return (request, response, next) => {
        if (basePath === "/") {
            next();
            return;
        }

        if (request.url === "/" || request.url.startsWith("/?")) {
            const query = request.url.slice(1);
            response.redirect(308, basePathWithTrailingSlash(basePath) + query);
            return;
        }

        const internalURL = withoutBasePath(request.url, basePath);
        if (internalURL === null) {
            response.status(404).send("Not Found");
            return;
        }

        request.url = internalURL;
        next();
    };
}

module.exports = {
    normalizeBasePath,
    basePathWithTrailingSlash,
    withBasePath,
    withoutBasePath,
    createBasePathMiddleware,
};

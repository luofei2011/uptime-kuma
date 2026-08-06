const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const {
    normalizeBasePath,
    basePathWithTrailingSlash,
    withBasePath,
    withoutBasePath,
    createBasePathMiddleware,
} = require("../../server/base-path");

describe("Base Path", () => {
    test("normalizes root and nested paths", () => {
        assert.equal(normalizeBasePath(undefined), "/");
        assert.equal(normalizeBasePath(""), "/");
        assert.equal(normalizeBasePath("kuma"), "/kuma");
        assert.equal(normalizeBasePath("/tools/kuma/"), "/tools/kuma");
        assert.equal(basePathWithTrailingSlash("/kuma"), "/kuma/");
    });

    test("rejects values that are not safe base paths", () => {
        assert.throws(() => normalizeBasePath("/kuma?debug=1"));
        assert.throws(() => normalizeBasePath("/kuma#fragment"));
        assert.throws(() => normalizeBasePath("/kuma/../admin"));
        assert.throws(() => normalizeBasePath("/kuma//admin"));
    });

    test("adds and removes the base path", () => {
        assert.equal(withBasePath("/dashboard", "/kuma"), "/kuma/dashboard");
        assert.equal(withBasePath("/kuma/dashboard", "/kuma"), "/kuma/dashboard");
        assert.equal(withBasePath("https://example.com/icon.png", "/kuma"), "https://example.com/icon.png");
        assert.equal(withoutBasePath("/kuma/dashboard?tab=1", "/kuma"), "/dashboard?tab=1");
        assert.equal(withoutBasePath("/kuma?tab=1", "/kuma"), "/?tab=1");
        assert.equal(withoutBasePath("/other", "/kuma"), null);
    });

    test("middleware rewrites in-scope requests", () => {
        const request = { url: "/kuma/api/entry-page?test=1" };
        let nextCalled = false;
        createBasePathMiddleware("/kuma")(request, {}, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, true);
        assert.equal(request.url, "/api/entry-page?test=1");
    });

    test("middleware redirects the origin root and rejects unrelated paths", () => {
        let redirect;
        createBasePathMiddleware("/kuma")(
            { url: "/?from=healthcheck" },
            {
                redirect(status, location) {
                    redirect = { status, location };
                },
            },
            () => assert.fail("root request should not continue")
        );
        assert.deepEqual(redirect, { status: 308, location: "/kuma/?from=healthcheck" });

        let responseStatus;
        let responseBody;
        createBasePathMiddleware("/kuma")(
            { url: "/other" },
            {
                status(status) {
                    responseStatus = status;
                    return this;
                },
                send(body) {
                    responseBody = body;
                },
            },
            () => assert.fail("out-of-scope request should not continue")
        );
        assert.equal(responseStatus, 404);
        assert.equal(responseBody, "Not Found");
    });
});

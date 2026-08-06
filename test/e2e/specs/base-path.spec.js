import { expect, test } from "@playwright/test";
import { appPath, basePath, login, restoreSqliteSnapshot } from "../util-test";

test.describe("Base Path", () => {
    test.beforeEach(async () => {
        await restoreSqliteSnapshot();
    });

    test("keeps browser traffic inside the configured base path", async ({ page }) => {
        const applicationRequests = [];
        page.on("request", (request) => {
            const url = new URL(request.url());
            if (url.origin === "http://localhost:30001") {
                applicationRequests.push(url.pathname);
            }
        });

        await page.goto("./dashboard");
        await login(page);

        await expect(page).toHaveURL(new RegExp(appPath("/dashboard") + "$"));
        await expect(page.locator("base")).toHaveAttribute("href", basePath === "/" ? "/" : basePath + "/");
        await expect
            .poll(() => applicationRequests.some((path) => path.startsWith(appPath("/socket.io"))))
            .toBeTruthy();

        if (basePath !== "/") {
            const unprefixedRequests = applicationRequests.filter((path) => {
                return ["/api/", "/assets/", "/socket.io", "/serviceWorker.js", "/icon.svg"].some((prefix) =>
                    path.startsWith(prefix)
                );
            });
            expect(unprefixedRequests).toEqual([]);

            const unprefixedAPIResponse = await page.request.get("/api/entry-page");
            expect(unprefixedAPIResponse.status()).toBe(404);
        }
    });

    test("opens push examples without navigating to the base path root", async ({ page }) => {
        await page.goto("./add");
        await login(page);

        await page.getByTestId("monitor-type-select").selectOption("push");
        await page.getByTestId("friendly-name-input").fill("Push monitor");
        await page.getByTestId("save-button").click();
        await page.waitForURL(appPath("/dashboard/*"));

        const monitorURL = page.url();
        await page.getByTestId("push-example-toggle").click();

        await expect(page.locator("#push-current-example")).toBeVisible();
        await expect(page).toHaveURL(monitorURL);
    });
});

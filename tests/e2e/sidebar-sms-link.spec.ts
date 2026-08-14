import { test, expect } from "@playwright/test";

// Credentials for a login-capable test account, provided out-of-band (never
// hardcoded — this app's DATABASE_URL points at a shared, non-isolated
// staging DB, so no fixture account is assumed to exist here the way
// Ebrigth_OSC's tests/e2e/fixtures.ts assumes one in its own DB).
const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

test.describe("Sidebar SMS link", () => {
  test.skip(
    !EMAIL || !PASSWORD,
    "Set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run this against a real account.",
  );

  test("navigates to the external SMS app in a new tab, not an internal dropdown", async ({ page, context }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(EMAIL!);
    await page.locator('input[name="password"]').fill(PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/home/);

    const smsLink = page.getByRole("link", { name: "SMS" });
    await expect(smsLink).toBeVisible();

    // Regression guard for the bug being fixed: this used to be a
    // dropdown-only parent (no real href, `children` instead) that never
    // navigated on click. Assert the leaf-link contract directly.
    await expect(smsLink).toHaveAttribute("href", "https://staging-sms.ebright.my/");
    await expect(smsLink).toHaveAttribute("target", "_blank");
    await expect(smsLink).toHaveAttribute("rel", /noopener/);

    // No dropdown/submenu should appear — clicking must navigate, not toggle.
    const [newPage] = await Promise.all([
      context.waitForEvent("page"),
      smsLink.click(),
    ]);
    await newPage.waitForLoadState("domcontentloaded");
    expect(newPage.url()).toBe("https://staging-sms.ebright.my/");

    await expect(page.getByRole("link", { name: "Student" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Package" })).toHaveCount(0);
  });
});

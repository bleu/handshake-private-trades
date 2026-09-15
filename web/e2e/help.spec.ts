import { expect, test } from "@playwright/test";

test("Help explains the trade flow and lost-link risks without connecting a wallet", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const warning = page.getByRole("note", { name: "Contract risk warning" });
  await expect(warning).toContainText(
    "This contract has not been audited. Use at your own risk.",
  );
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Help", exact: true })
    .click();
  await expect(page).toHaveURL("/help");
  await expect(
    page.getByRole("heading", { name: "How Handshake works", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Trade flow" }).getByRole("listitem"),
  ).toHaveCount(4);
  await expect(
    page.getByRole("heading", {
      name: "Your history lives in this browser",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Losing an order does not cancel it.", { exact: true }),
  ).toBeVisible();
  const question = page
    .locator("summary")
    .filter({ hasText: "Can someone fill an order I lost?" });
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(/Someone who still has the link can submit it/),
  ).toBeVisible();
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(warning).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`help-${String(width)}.png`),
      fullPage: true,
    });
  }
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Create", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  await expect(warning).toBeVisible();
});

import { expect, type Page, type Locator } from "@playwright/test";

export async function expandDetails(scope: Page | Locator, label: string) {
  const summary = scope
    .locator("summary")
    .filter({ hasText: new RegExp(`^${label}$`) });
  await expect(summary).toBeVisible();
  if ((await summary.locator("..").getAttribute("open")) === null)
    await summary.click();
}

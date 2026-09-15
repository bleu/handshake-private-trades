import { expect, type Page } from "@playwright/test";

/** Exercise the same network control whether the wallet is connected or not. */
export async function selectNetwork(page: Page, chainId: "100" | "31337") {
  const name = chainId === "100" ? "Gnosis" : "Anvil";
  const control = page.getByRole("button", {
    name: "Chain Selector",
    exact: true,
  });
  if ((await control.innerText()).includes(name)) return;
  await control.click();
  const option = page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp(name) });
  await expect(option).toBeVisible();
  if (await option.isDisabled()) await page.keyboard.press("Escape");
  else await option.click();
  await expect(control).toContainText(name);
}

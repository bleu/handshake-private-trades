import { selectNetwork } from "./network-control";
import { expect, test } from "@playwright/test";

test("partial draft strings survive refresh per network and edits arrive from another tab", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await selectNetwork(page, "31337");
  await page.getByLabel("Send amount").fill("1.");
  await page.getByLabel("Duration").selectOption("Unlimited");
  await page.reload();
  await selectNetwork(page, "31337");
  await expect(page.getByLabel("Send amount")).toHaveValue("1.");
  await expect(page.getByLabel("Duration")).toHaveValue("Unlimited");
  const other = await context.newPage();
  await other.goto("/");
  await selectNetwork(other, "31337");
  await other.getByLabel("Receive amount").fill("2.00");
  await expect(page.getByLabel("Receive amount")).toHaveValue("2.00");
  await selectNetwork(page, "100");
  await expect(page.getByLabel("Send amount")).toHaveValue("");
});

test("failed draft writes keep the current form editable and explicitly warn it may not survive refresh", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Object.getOwnPropertyDescriptor(
      Storage.prototype,
      "setItem",
    )?.value as (this: Storage, key: string, value: string) => void;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith("ptl:draft:"))
        throw new DOMException("Full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.goto("/");
  await page.getByLabel("Send amount").fill("12.");
  await expect(page.getByText(/Draft could not be saved/)).toBeVisible();
  await expect(page.getByLabel("Send amount")).toHaveValue("12.");
  await expect(
    page.getByRole("button", {
      name: "Fill all the inputs",
      exact: true,
    }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("Send amount")).toHaveValue("");
});

test("corrupt drafts show recovery feedback and do not prevent a new draft", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("ptl:draft:1", '{"version":999}');
  });
  await page.goto("/");
  await expect(
    page.getByText(/Saved draft is unavailable or corrupt/),
  ).toBeVisible();
  await page.getByLabel("Send amount").fill("3.");
  await expect(
    page.getByText(/Saved draft is unavailable or corrupt/),
  ).toHaveCount(0);
  await expect(page.getByLabel("Send amount")).toHaveValue("3.");
});

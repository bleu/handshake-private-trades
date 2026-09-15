import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

// RainbowKit 2.2.11 directly accesses optional browser caches. A SecurityError
// must not prevent viewing/signing orders when our own storage adapter is usable
// only transiently. Patch only the root entry point imported by this application.
const requireWeb = createRequire(
  new URL("../web/package.json", import.meta.url),
);
const file = requireWeb.resolve("@rainbow-me/rainbowkit");
const version = JSON.parse(
  await readFile(resolve(dirname(file), "../package.json"), "utf8"),
).version;
if (version !== "2.2.11")
  throw new Error("Review the wallet-cache patch for this RainbowKit version.");
const originalHash =
  "dd92514a0248b6a0f6690455508742983273ad39316c43d1614b6273b4d45eaa";
const marker =
  "// Private Trade Links: optional RainbowKit cache compatibility.\n";
const helper = `${marker}const ptlWalletCache = {
  getItem(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  setItem(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* Optional SDK cache only. */ }
  },
  removeItem(key) {
    try { window.localStorage.removeItem(key); } catch { /* Optional SDK cache only. */ }
  }
};
`;
const digest = (source) => createHash("sha256").update(source).digest("hex");
const source = await readFile(file, "utf8");
const patched = source.startsWith(helper);
const original = patched
  ? source
      .slice(helper.length)
      .replaceAll("ptlWalletCache", "window.localStorage")
  : source;
if (digest(original) !== originalHash)
  throw new Error(
    "Unexpected RainbowKit source; refusing to apply or accept the wallet-cache patch.",
  );
const expected =
  helper + original.replaceAll("window.localStorage", "ptlWalletCache");
if (process.argv.includes("--check")) {
  if (source !== expected)
    throw new Error(
      "Run pnpm run wallet-cache:patch before building or starting the app.",
    );
  console.log("PASS: version-checked optional wallet-cache patch.");
} else {
  if (source !== expected) await writeFile(file, expected);
  console.log("Applied version-checked optional wallet-cache patch.");
}

/** Optional wallet-connection preferences only; order/draft storage stays fallible. */
export const walletCache = {
  getItem(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* A connected wallet can remain usable without persisted preferences. */
    }
  },
  removeItem(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* No optional wallet preference needs to block the current session. */
    }
  },
};

/** Browser preferences are optional; blocked or full storage must not break UI. */
export const browserStorage = {
  getItem(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string): void {
    try { window.localStorage.setItem(key, value); } catch { /* Use in-memory UI state. */ }
  },
  removeItem(key: string): void {
    try { window.localStorage.removeItem(key); } catch { /* Optional persistence. */ }
  },
};

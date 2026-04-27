import "@testing-library/jest-dom";

// Setup runs for every test file. In node-environment files there is no
// `window`, so guard the matchMedia stub.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
  });
}

import { describe, it, expect } from "vitest";
import { parseTheme, THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "./theme";

describe("parseTheme", () => {
  it("returns dark for the dark cookie value", () => {
    expect(parseTheme("dark")).toBe("dark");
  });

  it("returns light for the light cookie value", () => {
    expect(parseTheme("light")).toBe("light");
  });

  it("defaults to light when no cookie is set", () => {
    expect(parseTheme(undefined)).toBe("light");
  });

  it("defaults to light for a null value", () => {
    expect(parseTheme(null)).toBe("light");
  });

  it("defaults to light when the cookie is empty", () => {
    expect(parseTheme("")).toBe("light");
  });

  it("defaults to light for a malformed value", () => {
    expect(parseTheme("purple")).toBe("light");
  });

  it("is case sensitive — only exact 'dark' counts", () => {
    expect(parseTheme("DARK")).toBe("light");
  });
});

describe("cookie constants", () => {
  it("uses a stable cookie name", () => {
    expect(THEME_COOKIE).toBe("theme");
  });

  it("keeps the preference for one year", () => {
    expect(THEME_COOKIE_MAX_AGE).toBe(31536000);
  });
});

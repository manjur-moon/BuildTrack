import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (name: string) => readFileSync(name, "utf8");

describe("BuildTrack Step 7 design and routing safeguards", () => {
  it("has a server-protected dashboard layout", () => {
    const layout = read("src/app/dashboard/layout.tsx");
    expect(layout).toContain('redirect("/login?next=/dashboard")');
    expect(layout).toContain("resolveAuthorizationContext");
    expect(layout).toContain("disabledAt: null");
  });
  it("uses only two UI base hex colors in dashboard stylesheet", () => {
    const css = read("src/components/dashboard/dashboard.css");
    const colors = Array.from(css.matchAll(/#[0-9a-fA-F]{6}\b/g), (m) => m[0].toUpperCase());
    expect(new Set(colors)).toEqual(new Set(["#252826", "#89948A"]));
  });
  it("supports light dark and system themes", () => {
    const switcher = read("src/components/dashboard/theme-switcher.tsx");
    const provider = read("src/components/dashboard/theme-provider.tsx");
    for (const value of ["light", "dark", "system"]) expect(switcher).toContain(`value="${value}"`);
    expect(provider).toContain('defaultTheme="system"');
    expect(provider).toContain('storageKey="buildtrack-ui-theme"');
  });
  it("does not need to change public landing page", () => {
    expect(existsSync("src/app/page.tsx")).toBe(true);
    expect(read("src/components/dashboard/dashboard.css")).toContain(".bt-app");
  });
});

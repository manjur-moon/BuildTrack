/**
 * Guarded integration for the existing Step 5 root layout and login redirect.
 * Calculates BOTH changes before writing to avoid partial updates.
 * Never modifies the public homepage, backend auth, RBAC or Prisma files.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const layoutPath = path.join(root, "src/app/layout.tsx");
const loginFormPath = path.join(root, "src/components/auth/login-form.tsx");
const files = [layoutPath, loginFormPath];
for (const target of files) {
  if (!fs.existsSync(target)) throw new Error(`Missing expected file: ${path.relative(root, target)}`);
}

const originalLayout = fs.readFileSync(layoutPath, "utf8");
const originalLogin = fs.readFileSync(loginFormPath, "utf8");
let updatedLayout = originalLayout;
let updatedLogin = originalLogin;

if (!updatedLayout.includes("BuildTrackThemeProvider")) {
  const html = '<html lang="en">';
  const body = "<body>{children}</body>";
  const metadataImport = 'import type { Metadata } from "next";';
  if (![html, body, metadataImport].every((needle) => updatedLayout.includes(needle))) {
    throw new Error("Root layout is customized. Integrate the provider manually; no changes were written.");
  }
  updatedLayout = updatedLayout.replace(html, '<html lang="en" suppressHydrationWarning>')
    .replace(body, '<body><BuildTrackThemeProvider>{children}</BuildTrackThemeProvider></body>')
    .replace(metadataImport, `${metadataImport}\nimport { BuildTrackThemeProvider } from "@/components/dashboard/theme-provider";`);
} else if (!updatedLayout.includes("suppressHydrationWarning")) {
  throw new Error("Existing theme integration needs suppressHydrationWarning. No changes were written.");
}

const oldRedirect = 'const redirectPath = next.startsWith("/accept-invitation?id=") && !next.startsWith("//") ? next : "/account";';
const newRedirect = 'const redirectPath = next === "/dashboard" || next.startsWith("/dashboard/") || (next.startsWith("/accept-invitation?id=") && !next.startsWith("//")) ? next : "/dashboard";';
if (!updatedLogin.includes(newRedirect)) {
  if (!updatedLogin.includes(oldRedirect)) throw new Error("Login redirect customized. Integrate manually; no changes were written.");
  updatedLogin = updatedLogin.replace(oldRedirect, newRedirect);
}

for (const [target, original, updated] of [
  [layoutPath, originalLayout, updatedLayout],
  [loginFormPath, originalLogin, updatedLogin],
]) {
  if (original === updated) { console.log(`UNCHANGED: ${path.relative(root, target)}`); continue; }
  const backup = `${target}.before-step7.bak`;
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, original);
  fs.writeFileSync(target, updated);
  console.log(`PATCHED: ${path.relative(root, target)}`);
}
console.log("STEP 7 ROOT INTEGRATION: COMPLETE");

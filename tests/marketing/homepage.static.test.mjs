import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (name) => readFileSync(join(root, name), 'utf8');

const pagePath = 'src/app/page.tsx';
const cssPath = 'src/app/home.css';
const headerPath = 'src/components/marketing/marketing-header.tsx';
const revealPath = 'src/components/marketing/marketing-reveal.tsx';

test('homepage replaces Step 4 placeholder with real marketing sections', () => {
  const page = read(pagePath);
  assert.match(page, /BUILDTRACK_MARKETING_V1/);
  assert.doesNotMatch(page, /Backend foundation initialized/);
  for (const section of ['platform', 'workflows', 'approach', 'faq', 'contact']) {
    assert.match(page, new RegExp(`id="${section}"`));
  }
});

test('marketing CSS is scoped and contains only the two approved UI colors', () => {
  const css = read(cssPath);
  assert.match(css, /\.bt-home\s*\{/);
  assert.match(css, /\.dark \.bt-home/);
  assert.match(css, /prefers-reduced-motion/);
  const hexes = [...css.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(([value]) => value.toLowerCase());
  assert.deepEqual([...new Set(hexes)].sort(), ['#252826', '#89948a']);
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:body|html|:root)\s*\{/);
});

test('uses existing theme preference and accessible mobile navigation', () => {
  const header = read(headerPath);
  assert.match(header, /useTheme/);
  assert.match(header, /value="system"/);
  assert.match(header, /aria-expanded/);
  assert.match(header, /aria-controls/);
  assert.match(header, /useSyncExternalStore/);
  assert.match(header, /Escape/);
});

test('all local illustrative fallbacks exist', () => {
  for (const name of ['architecture-hero', 'architecture-interior', 'architecture-towers', 'architecture-villa']) {
    const path = `public/marketing/${name}.svg`;
    assert.ok(existsSync(join(root, path)), `${path} missing`);
    assert.match(read(path), /<svg/);
  }
});

test('dashboard access remains routed to existing pages', () => {
  const page = read(pagePath);
  assert.match(page, /href="\/dashboard"/);
  assert.match(page, /href="\/login"/);
  assert.match(read(revealPath), /IntersectionObserver/);
});

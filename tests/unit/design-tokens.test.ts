import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Keeps tokens.css honest against DESIGN.md: contrast pairs, palette size, and
// the anti-slop rules that can be checked mechanically.

const ROOT = resolve(import.meta.dirname, '../..');
const css = readFileSync(join(ROOT, 'src/lib/styles/tokens.css'), 'utf8');

const tokens = Object.fromEntries(
	[...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()])
);

function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi! + 0.05) / (lo! + 0.05);
}

describe('design tokens', () => {
	it('defines the confirmed palette', () => {
		expect(tokens['color-dominant']).toBe('#0b0b0d');
		expect(tokens['color-accent']).toBe('#e8b04b');
	});

	const TEXT = 4.5; // WCAG AA, normal text
	const UI = 3; // WCAG 1.4.11, control boundaries

	it.each([
		['color-fg', 'color-dominant', TEXT],
		['color-fg', 'color-surface-raised', TEXT],
		['color-fg-muted', 'color-dominant', TEXT],
		['color-fg-muted', 'color-surface-raised', TEXT],
		['color-fg-subtle', 'color-dominant', TEXT],
		['color-fg-subtle', 'color-surface-raised', TEXT],
		['color-accent', 'color-dominant', TEXT],
		['color-accent', 'color-surface-raised', TEXT],
		['color-accent-hover', 'color-dominant', TEXT],
		['color-accent-pressed', 'color-dominant', TEXT],
		['color-on-accent', 'color-accent', TEXT],
		['color-on-accent', 'color-accent-hover', TEXT],
		['color-on-accent', 'color-accent-pressed', TEXT],
		['color-border-strong', 'color-dominant', UI],
		['color-border-strong', 'color-surface-raised', UI],
		['dim-fg', 'dim-bg', TEXT],
		['dim-accent', 'dim-bg', TEXT]
	])('%s on %s meets %s:1', (fg, bg, min) => {
		expect(tokens[fg], fg).toBeDefined();
		expect(tokens[bg], bg).toBeDefined();
		expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(min);
	});

	it('spacing tokens are all multiples of 8px', () => {
		const spaces = [...css.matchAll(/--space-\d+:\s*(\d+)px/g)].map((m) => Number(m[1]));
		expect(spaces.length).toBeGreaterThan(5);
		for (const s of spaces) expect(s % 8).toBe(0);
	});

	it('tap targets are at least 44px', () => {
		for (const name of ['tap-min', 'tap-player']) {
			const px = Number(css.match(new RegExp(`--${name}:\\s*(\\d+)px`))?.[1]);
			expect(px).toBeGreaterThanOrEqual(44);
		}
	});

	it('honours prefers-reduced-motion', () => {
		expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
	});
});

describe('anti-slop rules across the UI source', () => {
	function files(dir: string, out: string[] = []): string[] {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, e.name);
			if (e.isDirectory()) files(full, out);
			else if (/\.(svelte|css)$/.test(e.name)) out.push(full);
		}
		return out;
	}
	const sources = files(join(ROOT, 'src')).map((f) => ({ f, text: readFileSync(f, 'utf8') }));

	it('uses no banned fonts', () => {
		for (const { f, text } of sources) {
			expect(text, f).not.toMatch(/\b(Inter|Roboto|Montserrat|Poppins|Space Grotesk)\b/);
		}
	});

	it('has no gradients and no faint 0.1-opacity shadows', () => {
		for (const { f, text } of sources) {
			expect(text, f).not.toMatch(/(linear|radial|conic)-gradient\(/);
			expect(text, f).not.toMatch(/box-shadow:[^;]*(rgba?\([^)]*0?\.1\)|\/ 0?\.1\))/);
		}
	});

	it('components use colour tokens, not raw hex values', () => {
		for (const { f, text } of sources) {
			if (f.endsWith('tokens.css')) continue;
			// Allowed: the glow colour in Leader (documented exception).
			const raw = [...text.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0]);
			expect(raw, f).toEqual([]);
		}
	});
});

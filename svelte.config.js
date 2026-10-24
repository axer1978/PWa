import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ out: 'build', precompress: true }),
		typescript: {
			// Type-check scripts, e2e specs and root configs too (paths are relative to .svelte-kit/).
			config: (tsconfig) => {
				tsconfig.include.push(
					'../scripts/**/*.ts',
					'../e2e/**/*.ts',
					'../playwright.config.ts',
					'../drizzle.config.ts'
				);
				return tsconfig;
			}
		},
		// CSP lives here rather than in Caddy: SvelteKit's inline hydration script
		// needs a per-build hash that only SvelteKit knows. See ASSUMPTIONS.md (A-03).
		// Runtime-configured origins (CDN, hosted payment/AV pages) are appended in
		// hooks.server.ts so they don't have to be baked in at build time.
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				// Svelte SSR emits style attributes; inline styles are low-risk compared to scripts.
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:'],
				'font-src': ['self'],
				'media-src': ['self', 'blob:'],
				'connect-src': ['self'],
				'worker-src': ['self'],
				'manifest-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['none'],
				'frame-ancestors': ['none'],
				'form-action': ['self']
			}
		}
	}
};

export default config;

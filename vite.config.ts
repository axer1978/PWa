import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
		environment: 'node',
		// PGlite's first start (WASM + initdb) can exceed 10s on a cold CI runner.
		hookTimeout: 30_000
	}
});

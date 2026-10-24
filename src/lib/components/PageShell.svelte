<!-- Frame for every non-player page: thin top bar, content, one quiet legal row. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { BRAND_DESCRIPTION, BRAND_NAME } from '$lib/brand';

	interface Props {
		/** Shown in the tab title after the brand. */
		title?: string;
		signedIn?: boolean;
		/** Hides the sign-in/account action (e.g. on the unavailable page). */
		minimal?: boolean;
		/** Meta description for search and link previews. Keep it SFW and neutral. */
		description?: string;
		children: Snippet;
	}

	let {
		title,
		signedIn = false,
		minimal = false,
		description = BRAND_DESCRIPTION,
		children
	}: Props = $props();

	let fullTitle = $derived(title ? `${title} · ${BRAND_NAME}` : BRAND_NAME);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="website" />
</svelte:head>

<a class="skip" href="#main">Skip to content</a>

<div class="frame">
	<header class="bar">
		{#if minimal}
			<!-- No way back into the app from the unavailable page. -->
			<span class="wordmark">{BRAND_NAME}</span>
		{:else}
			<a class="wordmark" href={resolve('/')} aria-label="{BRAND_NAME}, home">{BRAND_NAME}</a>
		{/if}
		{#if !minimal}
			<nav aria-label="Account">
				{#if signedIn}
					<a class="action" href={resolve('/account')}>Account</a>
				{:else}
					<a class="action" href={resolve('/login')}>Sign in</a>
				{/if}
			</nav>
		{/if}
	</header>

	<main id="main" tabindex="-1">
		{@render children()}
	</main>

	<footer class="legal">
		<nav aria-label="Legal">
			{#if !minimal}
				<a href={resolve('/legal/[doc]', { doc: 'terms' })}>Terms</a>
				<a href={resolve('/legal/[doc]', { doc: 'privacy' })}>Privacy</a>
				<a href={resolve('/legal/[doc]', { doc: 'age' })}>18+ policy</a>
			{/if}
			<!-- Attribution required by the DB-IP Lite licence (CC BY 4.0). -->
			<a href="https://db-ip.com" rel="noreferrer">IP Geolocation by DB-IP</a>
		</nav>
	</footer>
</div>

<style>
	/* Full-height frame so the legal row sits at the bottom on short pages. */
	.frame {
		display: grid;
		grid-template-rows: auto 1fr auto;
		min-block-size: 100dvh;
	}

	.skip {
		position: absolute;
		inset-inline-start: var(--space-2);
		inset-block-start: -100px;
		padding: var(--space-1) var(--space-2);
		background: var(--color-accent);
		color: var(--color-on-accent);
		z-index: 10;
	}

	.skip:focus {
		inset-block-start: var(--space-1);
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-block-size: var(--space-8);
		padding-inline: var(--gutter);
		border-block-end: 1px solid var(--color-border);
	}

	.wordmark {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--tap-min);
		font-family: var(--font-display);
		font-size: var(--text-lg);
		line-height: var(--lh-lg);
		color: var(--color-fg);
		text-decoration: none;
		letter-spacing: 0.02em;
	}

	.action {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--tap-min);
		padding-inline: var(--space-1);
		font-weight: var(--weight-strong);
		text-decoration: none;
	}

	main {
		inline-size: 100%;
		max-inline-size: calc(var(--content-max) + 2 * var(--gutter));
		margin-inline: auto;
		padding: var(--space-6) var(--gutter) var(--space-8);
		outline: none;
	}

	.legal {
		padding: var(--space-3) var(--gutter) var(--space-4);
		border-block-start: 1px solid var(--color-border);
	}

	.legal nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-3);
		max-inline-size: var(--content-max);
		margin-inline: auto;
	}

	.legal a {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--tap-min);
		font-size: var(--text-sm);
		color: var(--color-fg-muted);
		text-decoration: none;
	}

	.legal a:hover {
		color: var(--color-fg);
		text-decoration: underline;
	}
</style>

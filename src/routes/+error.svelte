<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import PageShell from '$lib/components/PageShell.svelte';

	const COPY: Record<number, { title: string; body: string }> = {
		404: { title: 'Nothing here', body: "This page doesn't exist, or it has moved." },
		429: { title: 'Slow down', body: 'Too many requests. Wait a minute, then try again.' }
	};

	let copy = $derived(
		COPY[page.status] ?? {
			title: 'Something went wrong',
			body: "That's on us. Try again in a moment."
		}
	);
</script>

<PageShell title={copy.title} signedIn={page.data.signedIn ?? false}>
	<section class="error">
		<p class="label">Error {page.status}</p>
		<h1>{copy.title}</h1>
		<p class="body">{copy.body}</p>
		{#if page.status >= 500 && page.error?.id}
			<p class="ref">Reference: <code>{page.error.id}</code></p>
		{/if}
		<Button href="/" variant="secondary">Back to the start</Button>
	</section>
</PageShell>

<style>
	.error {
		display: grid;
		gap: var(--space-3);
		justify-items: start;
	}

	.body {
		color: var(--color-fg-muted);
	}

	.ref {
		font-size: var(--text-sm);
		line-height: var(--lh-sm);
		color: var(--color-fg-subtle);
	}

	code {
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		color: var(--color-fg-muted);
	}
</style>

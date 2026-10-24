<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import PageShell from '$lib/components/PageShell.svelte';

	let { data } = $props();
</script>

<!-- Phase 2 placeholder: the provider flow (mock + real stub) arrives in Phase 3. -->
<PageShell title="Confirm your age" signedIn={data.signedIn}>
	<section class="av">
		<h1>Confirm you're an adult</h1>
		<p class="lead">
			Every session is for adults only. A one-time check with an independent provider is needed
			before anything plays. We keep only the result, never your documents.
		</p>
		<Notice tone="info" title="Not connected yet">
			<p>The age-check provider is connected in the next build phase.</p>
		</Notice>
	</section>
</PageShell>

<style>
	.av {
		display: grid;
		gap: var(--space-4);
	}

	.lead {
		color: var(--color-fg-muted);
	}
</style>

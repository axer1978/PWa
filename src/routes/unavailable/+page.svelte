<script lang="ts">
	import PageShell from '$lib/components/PageShell.svelte';
</script>

<!-- Neutral, SFW, and a dead end on purpose: no links into the app. Served with
     HTTP 451 to blocked regions (see the geo hook). -->
<PageShell title="Not available" minimal>
	<section class="unavailable">
		<h1>Not available here</h1>
		<p>This service isn't available in your region.</p>
	</section>
</PageShell>

<style>
	.unavailable {
		display: grid;
		gap: var(--space-3);
	}

	p {
		color: var(--color-fg-muted);
	}
</style>

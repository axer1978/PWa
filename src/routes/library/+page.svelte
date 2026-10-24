<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageShell from '$lib/components/PageShell.svelte';
</script>

<!-- Gated (signed in + age verified). The session list arrives with the player in Phase 4. -->
<PageShell title="Library" signedIn>
	<h1 class="visually-hidden">Library</h1>
	<EmptyState title="Your library">
		<p>Sessions you can play will appear here.</p>
	</EmptyState>
</PageShell>

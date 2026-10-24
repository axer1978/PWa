<script lang="ts">
	import PageShell from '$lib/components/PageShell.svelte';

	let { data } = $props();
</script>

<PageShell title={data.doc.title} signedIn={data.signedIn}>
	<article class="doc">
		<h1>{data.doc.title}</h1>
		{#each data.doc.sections as section (section.heading)}
			<section>
				<h2>{section.heading}</h2>
				{#each section.body as para, i (i)}
					<p>{para}</p>
				{/each}
			</section>
		{/each}
	</article>
</PageShell>

<style>
	.doc {
		display: grid;
		gap: var(--space-4);
	}

	section {
		display: grid;
		gap: var(--space-2);
	}

	p {
		color: var(--color-fg-muted);
	}
</style>

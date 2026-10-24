<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		children?: Snippet;
		action?: Snippet;
	}

	let { title, children, action }: Props = $props();
</script>

<section class="empty">
	<h2>{title}</h2>
	{#if children}<div class="text">{@render children()}</div>{/if}
	{#if action}<div class="action">{@render action()}</div>{/if}
</section>

<style>
	.empty {
		display: grid;
		gap: var(--space-2);
		padding-block: var(--space-6);
		border-block: 1px solid var(--color-border);
	}

	.text {
		color: var(--color-fg-muted);
	}

	.action {
		padding-block-start: var(--space-1);
	}
</style>

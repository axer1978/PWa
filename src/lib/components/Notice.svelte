<!-- Info / error / success, told apart by icon and wording (no extra hues; DESIGN.md). -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		tone?: 'info' | 'error' | 'success';
		title?: string;
		children?: Snippet;
	}

	let { tone = 'info', title, children }: Props = $props();

	const ICON = {
		info: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Z M8 7v4.5 M8 4.5V5',
		error: 'M8 1 15 14H1Z M8 6v4 M8 11.5v.5',
		success: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Z M5 8.2l2 2L11 6'
	} as const;
</script>

<div class="notice {tone}" role={tone === 'error' ? 'alert' : 'status'}>
	<svg viewBox="0 0 16 16" aria-hidden="true"><path d={ICON[tone]} /></svg>
	<div class="body">
		{#if title}<p class="title">{title}</p>{/if}
		{#if children}<div class="text">{@render children()}</div>{/if}
	</div>
</div>

<style>
	.notice {
		display: flex;
		gap: var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius);
		background: var(--color-surface);
	}

	.error {
		border-color: var(--color-accent);
	}

	svg {
		flex: none;
		inline-size: 24px;
		block-size: 24px;
		fill: none;
		stroke: var(--color-fg-muted);
		stroke-width: 1.25;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.error svg,
	.success svg {
		stroke: var(--color-accent);
	}

	.body {
		display: grid;
		gap: var(--space-1);
		min-inline-size: 0;
	}

	.title {
		font-weight: var(--weight-strong);
	}

	.text {
		color: var(--color-fg-muted);
	}
</style>

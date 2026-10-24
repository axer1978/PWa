<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Leader from './Leader.svelte';

	interface Props extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
		/** Renders a link styled as a button. */
		href?: string;
		variant?: 'primary' | 'secondary' | 'quiet';
		full?: boolean;
		/** Shows an inline leader, keeps the width, and blocks repeat presses. */
		loading?: boolean;
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		name?: string;
		value?: string;
		children: Snippet;
	}

	let {
		href,
		variant = 'primary',
		full = false,
		loading = false,
		disabled = false,
		type = 'button',
		children,
		...rest
	}: Props = $props();
</script>

{#if href && !disabled}
	<!-- Callers pass app-absolute paths (no kit.paths.base is configured). -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a {href} class="btn {variant}" class:full {...rest}>
		{@render children()}
	</a>
{:else}
	<button
		{type}
		class="btn {variant}"
		class:full
		class:loading
		disabled={disabled || loading}
		aria-busy={loading || undefined}
		{...rest}
	>
		{#if loading}<Leader size="inline" decorative />{/if}
		{@render children()}
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		min-block-size: var(--tap-min);
		padding: 0 var(--space-3);
		border: 1px solid transparent;
		border-radius: var(--radius);
		font: inherit;
		font-weight: var(--weight-strong);
		text-align: center;
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color var(--dur-fast) var(--ease),
			border-color var(--dur-fast) var(--ease),
			color var(--dur-fast) var(--ease);
		-webkit-tap-highlight-color: transparent;
	}

	.full {
		inline-size: 100%;
	}

	.primary {
		background: var(--color-accent);
		color: var(--color-on-accent);
	}

	.primary:hover {
		background: var(--color-accent-hover);
		color: var(--color-on-accent);
	}

	.primary:active {
		background: var(--color-accent-pressed);
	}

	.secondary {
		background: transparent;
		border-color: var(--color-border-strong);
		color: var(--color-fg);
	}

	.secondary:hover {
		border-color: var(--color-fg);
		color: var(--color-fg);
	}

	.secondary:active {
		background: var(--color-surface-raised);
	}

	.quiet {
		background: transparent;
		color: var(--color-accent);
		padding-inline: var(--space-1);
	}

	.quiet:hover {
		color: var(--color-accent-hover);
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	/* Disabled controls are exempt from contrast rules, but stay readable here anyway. */
	.btn:disabled {
		cursor: not-allowed;
		background: transparent;
		border-color: var(--color-border);
		color: var(--color-fg-subtle);
	}

	.btn.loading:disabled {
		cursor: progress;
		border-color: var(--color-border-strong);
		color: var(--color-fg-muted);
	}
</style>

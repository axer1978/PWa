<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLInputAttributes, 'value'> {
		label: string;
		name: string;
		value?: string;
		hint?: string;
		error?: string;
	}

	let { label, name, value = $bindable(''), hint, error, ...rest }: Props = $props();

	const id = $props.id();
	let describedBy = $derived(
		[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="field" class:invalid={!!error}>
	<label for={id}>{label}</label>
	<input
		{id}
		{name}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		{...rest}
	/>
	{#if hint}<p class="hint" id="{id}-hint">{hint}</p>{/if}
	{#if error}
		<p class="error" id="{id}-error">
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 15 14H1Z M8 6v4 M8 11.5v.5" /></svg>
			{error}
		</p>
	{/if}
</div>

<style>
	.field {
		display: grid;
		gap: var(--space-1);
	}

	label {
		font-weight: var(--weight-strong);
	}

	input {
		min-block-size: var(--tap-min);
		padding: 0 var(--space-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius);
		background: var(--color-surface-raised);
		color: var(--color-fg);
		/* ≥ 16px so iOS Safari doesn't zoom on focus. */
		font: inherit;
		inline-size: 100%;
	}

	input:hover {
		border-color: var(--color-fg-muted);
	}

	input:focus-visible {
		border-color: var(--color-accent);
	}

	.invalid input {
		border-color: var(--color-accent);
	}

	.hint {
		font-size: var(--text-sm);
		line-height: var(--lh-sm);
		color: var(--color-fg-muted);
	}

	.error {
		display: flex;
		gap: var(--space-1);
		align-items: flex-start;
		font-size: var(--text-sm);
		line-height: var(--lh-sm);
		color: var(--color-accent);
	}

	.error svg {
		flex: none;
		inline-size: 16px;
		block-size: 16px;
		margin-block-start: 4px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linejoin: round;
	}
</style>

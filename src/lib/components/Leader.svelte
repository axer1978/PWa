<!--
	The signature element (DESIGN.md): a film-leader countdown.
	- Countdown: pass remainingMs + totalMs. The wedge wipes once per second, the
	  outer arc shows the total time left, and the numeral counts the seconds.
	- Indeterminate: omit remainingMs. The wedge sweeps continuously (loading).
	With prefers-reduced-motion the sweep stops (base.css kills the animation)
	and the wedge holds still.
-->
<script lang="ts">
	type Size = 'inline' | 'corner' | 'timer';

	interface Props {
		size?: Size;
		remainingMs?: number;
		totalMs?: number;
		/** Accessible name; defaults to "Loading" or "N seconds left". */
		label?: string;
		/** Decorative use (e.g. inside a busy button): hidden from assistive tech. */
		decorative?: boolean;
	}

	let { size = 'corner', remainingMs, totalMs, label, decorative = false }: Props = $props();

	const PX: Record<Size, number> = { inline: 24, corner: 96, timer: 240 };
	// Pie trick: a circle of radius r stroked at width 2r draws a filled wedge.
	const WEDGE_R = 19;
	const WEDGE_C = 2 * Math.PI * WEDGE_R;
	const RING_R = 48;
	const RING_C = 2 * Math.PI * RING_R;

	let countdown = $derived(remainingMs !== undefined);
	let seconds = $derived(countdown ? Math.max(0, Math.ceil((remainingMs ?? 0) / 1000)) : 0);
	/** Fraction of the current second already wiped (0 → 1). */
	let wipe = $derived(countdown ? 1 - (((remainingMs ?? 0) % 1000) / 1000 || 1) : 0.18);
	let left = $derived(
		countdown && totalMs ? Math.min(1, Math.max(0, (remainingMs ?? 0) / totalMs)) : 1
	);
	let name = $derived(
		label ?? (countdown ? `${seconds} second${seconds === 1 ? '' : 's'} left` : 'Loading')
	);
	/** Screen readers hear the time at most every 5 s (plus the final 3), not every tick. */
	let announced = $derived(countdown && (seconds % 5 === 0 || seconds <= 3) ? name : '');
</script>

<span
	class="leader {size}"
	class:spin={!countdown}
	style:--px="{PX[size]}px"
	role={decorative ? undefined : countdown ? 'timer' : 'progressbar'}
	aria-label={decorative ? undefined : name}
	aria-hidden={decorative ? 'true' : undefined}
>
	<svg viewBox="0 0 100 100" focusable="false" aria-hidden="true">
		<line class="cross" x1="50" y1="2" x2="50" y2="98" />
		<line class="cross" x1="2" y1="50" x2="98" y2="50" />
		<circle class="ring outer" cx="50" cy="50" r={RING_R} />
		{#if countdown && totalMs}
			<circle
				class="remaining"
				cx="50"
				cy="50"
				r={RING_R}
				stroke-dasharray="{left * RING_C} {RING_C}"
				transform="rotate(-90 50 50)"
			/>
		{/if}
		<circle class="ring inner" cx="50" cy="50" r="38" />
		<g class="sweep">
			<circle
				class="wedge"
				cx="50"
				cy="50"
				r={WEDGE_R}
				stroke-width={WEDGE_R * 2}
				stroke-dasharray="{wipe * WEDGE_C} {WEDGE_C}"
				transform="rotate(-90 50 50)"
			/>
		</g>
	</svg>
	{#if countdown && size !== 'inline'}
		<span class="numeral" aria-hidden="true">{seconds}</span>
	{/if}
	{#if countdown && !decorative}
		<span class="visually-hidden" aria-live="polite">{announced}</span>
	{/if}
</span>

<style>
	.leader {
		position: relative;
		display: inline-grid;
		place-items: center;
		inline-size: var(--px);
		block-size: var(--px);
		flex: none;
	}

	svg {
		position: absolute;
		inset: 0;
		inline-size: 100%;
		block-size: 100%;
		overflow: visible;
	}

	.cross {
		stroke: var(--color-border);
		stroke-width: 1px;
		vector-effect: non-scaling-stroke;
	}

	.ring {
		fill: none;
		stroke-width: 1px;
		vector-effect: non-scaling-stroke;
	}

	.outer {
		stroke: var(--color-border-strong);
	}

	.inner {
		stroke: var(--color-fg-subtle);
	}

	.remaining {
		fill: none;
		stroke: var(--color-accent);
		stroke-width: 2px;
		vector-effect: non-scaling-stroke;
		transition: stroke-dasharray var(--dur-base) linear;
	}

	.wedge {
		fill: none;
		stroke: var(--color-accent);
		opacity: 0.28;
	}

	.timer .wedge,
	.corner .wedge {
		/* The one permitted glow (DESIGN.md). */
		filter: drop-shadow(0 0 24px rgb(232 176 75 / 0.35));
	}

	.spin .sweep {
		transform-origin: 50px 50px;
		animation: sweep 1s linear infinite;
	}

	@keyframes sweep {
		to {
			transform: rotate(360deg);
		}
	}

	.inline .cross,
	.inline .inner {
		display: none;
	}

	.numeral {
		position: relative;
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		color: var(--color-fg);
	}

	.corner .numeral {
		font-size: var(--text-xl);
		line-height: var(--lh-xl);
	}

	.timer .numeral {
		font-size: var(--text-3xl);
		line-height: var(--lh-3xl);
	}
</style>

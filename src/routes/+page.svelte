<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import PageShell from '$lib/components/PageShell.svelte';

	let { data } = $props();
</script>

<PageShell signedIn={data.signedIn}>
	<section class="hero" aria-labelledby="hero-title">
		<p class="label">Interactive audio · Adults only</p>
		<h1 id="hero-title">Audio that listens back.</h1>
		<p class="lead">
			Put your headphones on. At each turn you choose the path, and the sound follows you there.
		</p>
		<div class="ctas">
			<Button href={data.signedIn ? '/library' : '/login?next=/library'} full>
				Start the free session
			</Button>
			<Button href="/pricing" variant="secondary" full>See plans</Button>
		</div>
		<p class="note">One session is free. No card needed.</p>
	</section>

	<section class="steps" aria-labelledby="how">
		<h2 id="how">How it works</h2>
		<!-- Counts down 3-2-1 like a film leader; `reversed` keeps the semantics right. -->
		<ol reversed>
			<li>
				<h3>Sign in with your email</h3>
				<p>No password. We send you a link that works once.</p>
			</li>
			<li>
				<h3>Confirm you're an adult</h3>
				<p>A one-time check with an independent provider. We keep only the result.</p>
			</li>
			<li>
				<h3>Choose your path</h3>
				<p>Big controls, a dim mode for dark rooms, and it keeps playing with the screen locked.</p>
			</li>
		</ol>
	</section>
</PageShell>

<style>
	.hero {
		display: grid;
		gap: var(--space-3);
		padding-block-end: var(--space-8);
	}

	.hero h1 {
		font-size: var(--text-3xl);
		line-height: var(--lh-3xl);
	}

	.lead {
		font-size: var(--text-lg);
		line-height: var(--lh-lg);
		color: var(--color-fg-muted);
	}

	.ctas {
		display: grid;
		gap: var(--space-2);
		padding-block-start: var(--space-1);
	}

	.note {
		font-size: var(--text-sm);
		line-height: var(--lh-sm);
		color: var(--color-fg-subtle);
	}

	.steps {
		display: grid;
		gap: var(--space-4);
		padding-block-start: var(--space-6);
		border-block-start: 1px solid var(--color-border);
	}

	ol {
		display: grid;
		gap: var(--space-4);
		padding: 0;
		list-style: none;
		counter-reset: step 4;
	}

	li {
		display: grid;
		grid-template-columns: var(--space-8) 1fr;
		column-gap: var(--space-2);
		row-gap: var(--space-1);
		counter-increment: step -1;
	}

	li::before {
		content: counter(step);
		grid-row: span 2;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		line-height: var(--lh-2xl);
		color: var(--color-accent);
	}

	li p {
		color: var(--color-fg-muted);
	}
</style>

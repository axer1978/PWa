<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import PageShell from '$lib/components/PageShell.svelte';

	let { data } = $props();
</script>

<PageShell title="Plans" signedIn={data.signedIn}>
	<header class="intro">
		<h1>Plans</h1>
		<p class="lead">Start with the free session. Upgrade when you want more.</p>
	</header>

	<!-- A stacked list, not a card grid (DESIGN.md anti-slop rules). -->
	<ul class="plans">
		<li class="plan">
			<div class="head">
				<h2>Free</h2>
				<p class="price">{data.freePrice}</p>
			</div>
			<p class="desc">One session to try. Sign-in and age check required.</p>
			<Button href={data.signedIn ? '/library' : '/login?next=/library'} variant="secondary" full>
				Start free
			</Button>
		</li>
		{#each data.plans as plan (plan.id)}
			<li class="plan">
				<div class="head">
					<h2>{plan.name}</h2>
					<p class="price">{plan.price} <span class="per">{plan.per}</span></p>
				</div>
				<p class="desc">{plan.description}</p>
				<!-- Checkout is wired up in Phase 5; for now this leads through sign-in. -->
				<!-- Secondary: the prices carry the accent; one light source per screen. -->
				<Button href={data.signedIn ? '/account' : '/login?next=/account'} variant="secondary" full>
					Choose {plan.name}
				</Button>
			</li>
		{/each}
	</ul>

	<section class="fine" aria-label="Billing">
		<p>Cancel any time, in one click, from your account.</p>
		<p>
			Payment happens on our payment processor's secure page. We never see or store your card
			details.
		</p>
	</section>
</PageShell>

<style>
	.intro {
		display: grid;
		gap: var(--space-2);
		padding-block-end: var(--space-4);
	}

	.lead {
		font-size: var(--text-lg);
		line-height: var(--lh-lg);
		color: var(--color-fg-muted);
	}

	.plans {
		display: grid;
		padding: 0;
		list-style: none;
	}

	.plan {
		display: grid;
		gap: var(--space-2);
		padding-block: var(--space-4);
		border-block-start: 1px solid var(--color-border);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1) var(--space-2);
	}

	.price {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		line-height: var(--lh-xl);
		color: var(--color-accent);
	}

	.per {
		font-family: var(--font-ui);
		font-size: var(--text-sm);
		color: var(--color-fg-muted);
	}

	.desc {
		color: var(--color-fg-muted);
	}

	.fine {
		display: grid;
		gap: var(--space-1);
		padding-block-start: var(--space-4);
		border-block-start: 1px solid var(--color-border);
		font-size: var(--text-sm);
		line-height: var(--lh-sm);
		color: var(--color-fg-subtle);
	}
</style>

<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '$lib/components/Button.svelte';
	import PageShell from '$lib/components/PageShell.svelte';

	let { data } = $props();
</script>

<PageShell title="Account" signedIn>
	<section class="account">
		<h1>Account</h1>

		<dl class="facts">
			<div>
				<dt class="label">Email</dt>
				<dd class="addr">{data.email}</dd>
			</div>
			<div>
				<dt class="label">Age check</dt>
				<dd>
					{#if data.avVerified}
						Done
					{:else}
						Not done yet. <a href={resolve('/verify-age')}>Confirm your age</a>
					{/if}
				</dd>
			</div>
			<div>
				<dt class="label">Plan</dt>
				<!-- Plans, renewal date and the one-click cancel link arrive in Phase 5. -->
				<dd>Free. <a href={resolve('/pricing')}>See plans</a></dd>
			</div>
		</dl>

		<form method="POST" action={resolve('/logout')}>
			<Button type="submit" variant="secondary" full>Sign out</Button>
		</form>
	</section>
</PageShell>

<style>
	.account {
		display: grid;
		gap: var(--space-4);
	}

	.facts {
		display: grid;
		margin: 0;
	}

	.facts div {
		display: grid;
		gap: var(--space-1);
		padding-block: var(--space-3);
		border-block-start: 1px solid var(--color-border);
	}

	dd {
		margin: 0;
	}

	.addr {
		overflow-wrap: anywhere;
	}
</style>

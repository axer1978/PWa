<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageShell from '$lib/components/PageShell.svelte';

	let { data, form } = $props();
	let submitting = $state(false);
	let failed = $derived(!data.token || (form && 'error' in form));
</script>

<PageShell title="Sign in">
	<section class="verify">
		{#if failed}
			<h1>Link not valid</h1>
			<Notice tone="error" title="This sign-in link has expired or was already used">
				<p>Links work once and only for a short time. Request a new one.</p>
			</Notice>
			<Button href={data.next ? `/login?next=${encodeURIComponent(data.next)}` : '/login'} full>
				Send a new link
			</Button>
		{:else}
			<h1>Continue signing in</h1>
			<p class="lead">For your security, each link works once.</p>
			<form
				method="POST"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<input type="hidden" name="token" value={data.token} />
				{#if data.next}<input type="hidden" name="next" value={data.next} />{/if}
				<Button type="submit" full loading={submitting}>Continue</Button>
			</form>
		{/if}
	</section>
</PageShell>

<style>
	.verify {
		display: grid;
		gap: var(--space-4);
	}

	.lead {
		color: var(--color-fg-muted);
	}
</style>

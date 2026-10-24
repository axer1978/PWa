<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageShell from '$lib/components/PageShell.svelte';
	import TextField from '$lib/components/TextField.svelte';

	let { data, form } = $props();

	let submitting = $state(false);
	// Start from what the server echoed back after a failed attempt, if anything.
	let email = $state('');
	$effect.pre(() => {
		if (form && 'email' in form && form.email) email = form.email;
	});
	let sent = $derived(form && 'sent' in form && form.sent ? form : null);
	let error = $derived(form && 'error' in form ? form.error : null);
</script>

<PageShell title="Sign in">
	<section class="login">
		<header>
			<h1>Sign in</h1>
			<p class="lead">No password. We'll email you a link that works once.</p>
		</header>

		{#if sent}
			<Notice tone="success" title="Check your inbox">
				<p>
					We sent a sign-in link to <strong class="addr">{sent.email}</strong>. It expires in {sent.ttlMinutes}
					minutes. The subject is "Your sign-in link".
				</p>
			</Notice>
			<Button variant="secondary" full onclick={() => (form = null)}>Use a different email</Button>
		{:else}
			{#if error === 'rate_limited'}
				<Notice tone="error" title="Too many links requested">
					<p>Wait a few minutes, then try again.</p>
				</Notice>
			{:else if error === 'send_failed'}
				<Notice tone="error" title="We couldn't send the email">
					<p>That's on our side. Try again in a moment.</p>
				</Notice>
			{/if}

			<form
				method="POST"
				novalidate
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update({ reset: false });
						submitting = false;
					};
				}}
			>
				{#if data.next}<input type="hidden" name="next" value={data.next} />{/if}
				<TextField
					label="Email"
					name="email"
					type="email"
					inputmode="email"
					autocomplete="email"
					autocapitalize="off"
					spellcheck="false"
					required
					bind:value={email}
					error={error === 'invalid'
						? 'Enter a valid email address, like name@example.com.'
						: undefined}
				/>
				<Button type="submit" full loading={submitting}>
					{submitting ? 'Sending…' : 'Email me a sign-in link'}
				</Button>
			</form>
			<p class="fine">
				New here? The same link creates your account. By continuing you confirm you're an adult and
				accept the <a href={resolve('/legal/[doc]', { doc: 'terms' })}>terms</a>.
			</p>
		{/if}
	</section>
</PageShell>

<style>
	.login {
		display: grid;
		gap: var(--space-4);
	}

	header {
		display: grid;
		gap: var(--space-2);
	}

	.lead {
		color: var(--color-fg-muted);
	}

	form {
		display: grid;
		gap: var(--space-3);
	}

	.addr {
		color: var(--color-fg);
		overflow-wrap: anywhere;
	}

	.fine {
		font-size: var(--text-sm);
		line-height: var(--lh-sm);
		color: var(--color-fg-subtle);
	}
</style>

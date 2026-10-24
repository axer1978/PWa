<script lang="ts">
	import '@fontsource/instrument-serif/400.css';
	import '@fontsource/instrument-serif/400-italic.css';
	import '@fontsource-variable/instrument-sans/index.css';
	import '$lib/styles/tokens.css';
	import '$lib/styles/base.css';

	let { children } = $props();
</script>

{@render children()}

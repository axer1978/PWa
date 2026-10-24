// Placeholder legal copy. It describes what the code actually does, but it is
// NOT legal advice: replace it with counsel-reviewed text before launch.

export interface LegalDoc {
	title: string;
	sections: { heading: string; body: string[] }[];
}

const PLACEHOLDER =
	'Placeholder text. Replace with counsel-reviewed wording, including the operator’s legal name, address and contact details, before launch.';

export const LEGAL_DOCS: Record<'terms' | 'privacy' | 'age', LegalDoc> = {
	terms: {
		title: 'Terms of use',
		sections: [
			{ heading: 'About these terms', body: [PLACEHOLDER] },
			{
				heading: 'Who can use the service',
				body: [
					'You must be an adult (18 or over, or the age of majority where you live, if higher) and legally allowed to use this kind of service where you are.',
					'The service is not available in some regions.'
				]
			},
			{
				heading: 'Plans and cancellation',
				body: [
					'Subscriptions renew automatically until you cancel. You can cancel in one click from your account; access continues until the end of the period you paid for.',
					'Payments are processed by our payment processor on its own secure page.'
				]
			}
		]
	},
	privacy: {
		title: 'Privacy',
		sections: [
			{ heading: 'About this notice', body: [PLACEHOLDER] },
			{
				heading: 'What we keep',
				body: [
					'Your email address, to sign you in with one-time links.',
					'The result of your age check: that you were verified, when, and the provider’s reference number. We never receive or store identity documents or photos.',
					'Your plan and the payment events our processor sends us. We never see or store card details.',
					'A sign-in session (a random token, stored only as a hash).'
				]
			},
			{
				heading: 'What we look up but don’t keep',
				body: [
					'Your approximate country, from your IP address, to apply regional restrictions. IP geolocation by DB-IP (db-ip.com), licensed under CC BY 4.0.'
				]
			},
			{
				heading: 'Analytics',
				body: [
					'Self-hosted, cookieless and aggregate only. No third-party trackers or advertising pixels.'
				]
			},
			{
				heading: 'Backups',
				body: ['Encrypted before they leave the server.']
			}
		]
	},
	age: {
		title: '18+ policy',
		sections: [
			{ heading: 'About this policy', body: [PLACEHOLDER] },
			{
				heading: 'Adults only',
				body: [
					'All session content is for adults. Nothing beyond the public pages is shown until you have signed in and passed an age check with an independent provider.',
					'We keep only the outcome of that check, never your documents.'
				]
			}
		]
	}
};

import type { EmailMessage } from './index';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The sign-in email. Deliberately neutral: the subject and body show in the
 * listener's inbox and notification previews, so nothing reveals what the service is.
 */
export function magicLinkEmail(to: string, url: string, ttlMinutes: number): EmailMessage {
	const subject = 'Your sign-in link';
	const text = [
		'Use this link to sign in:',
		'',
		url,
		'',
		`It works once and expires in ${ttlMinutes} minutes.`,
		"If you didn't ask for it, you can ignore this email.",
		''
	].join('\n');
	const safeUrl = escapeHtml(url);
	const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0b0b0d;color:#ededf0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:17px;line-height:24px">
<p style="margin:0 0 24px">Use this link to sign in:</p>
<p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;padding:12px 24px;background:#e8b04b;color:#0b0b0d;text-decoration:none;border-radius:2px;font-weight:600">Sign in</a></p>
<p style="margin:0 0 8px;color:#a3a3ad;font-size:15px">It works once and expires in ${ttlMinutes} minutes.</p>
<p style="margin:0 0 24px;color:#a3a3ad;font-size:15px">If you didn't ask for it, you can ignore this email.</p>
<p style="margin:0;color:#8a8a94;font-size:13px;word-break:break-all">${safeUrl}</p>
</body></html>`;
	return { to, subject, text, html };
}

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { Env } from '../config/env-schema';

export interface EmailMessage {
	to: string;
	subject: string;
	text: string;
	html: string;
}

export interface EmailSender {
	send(message: EmailMessage): Promise<void>;
}

/** Any SMTP server: Mailpit in dev, the chosen provider in production. */
export function smtpSender(url: string, from: string): EmailSender {
	const transport = nodemailer.createTransport(url);
	return {
		async send(m) {
			await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html });
		}
	};
}

/**
 * Development/test only (refused at boot elsewhere): writes each message to a
 * JSON file, so e2e tests can read magic links without an SMTP server.
 */
export function outboxSender(dir: string, from: string): EmailSender {
	return {
		async send(m) {
			await mkdir(dir, { recursive: true });
			const name = `${Date.now()}-${randomBytes(4).toString('hex')}.json`;
			await writeFile(join(dir, name), JSON.stringify({ from, ...m }, null, 2));
		}
	};
}

let sender: EmailSender | undefined;

export function getEmailSender(env: Env): EmailSender {
	sender ??=
		env.EMAIL_TRANSPORT === 'outbox'
			? outboxSender(env.OUTBOX_DIR, env.EMAIL_FROM)
			: smtpSender(env.SMTP_URL!, env.EMAIL_FROM);
	return sender;
}

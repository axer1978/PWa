import { env as dynamicEnv } from '$env/dynamic/private';
import { parseEnv, type Env } from './config/env-schema';

let cached: Env | undefined;

/** Validated runtime config. Throws on first call if the environment is invalid. */
export function getEnv(): Env {
	cached ??= parseEnv(dynamicEnv);
	return cached;
}

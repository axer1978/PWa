import type { Access } from '../../../src/lib/server/access';

/**
 * Expected access level per route id (as in src/routes, e.g. "/play/[sessionId]").
 * Parameterised routes list concrete `paths` to check. Each feature area owns one
 * file in this folder, so parallel work never edits the same test file.
 */
export type RouteExpectations = Record<string, { access: Access; paths?: string[] }>;

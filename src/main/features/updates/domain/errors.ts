/**
 * The one failure the update feature knows: the check did not produce a
 * trustworthy answer — offline, rate-limited, a malformed response, a bounds
 * violation. Deliberately a single class: every cause has the same handling
 * (report `check-failed`, stay silent on the automatic path).
 */
export class UpdateCheckFailedError extends Error {}

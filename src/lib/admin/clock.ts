import "server-only";

/** The time this request is rendered at (server components render once per request). */
export const requestTime = () => Date.now();

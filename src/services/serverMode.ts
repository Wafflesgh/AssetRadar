/**
 * serverMode.ts — Whether the server can push live data (SSE price and news streams). The
 * serverless build for Vercel turns this off (VITE_SERVERLESS=1, defined in vite.config.ts) and
 * the client polls instead: prices every 10 s, news every 60 s. Crypto stays live through Indodax.
 */
// import.meta.env exists only in the Vite build (not when Node runs the tests)
const flag = typeof import.meta.env === 'object' ? import.meta.env.VITE_SERVERLESS : undefined;

export const SERVER_PUSH = flag !== '1';

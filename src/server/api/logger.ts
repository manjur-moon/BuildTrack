/** JSON-only structured logs; do not log headers, cookies, tokens, or request bodies. */
export function logEvent(event: string, details: Record<string, string | number | boolean | null>) {
  console.info(JSON.stringify({ level: "info", event, at: new Date().toISOString(), ...details }));
}

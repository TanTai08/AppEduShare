/** React Native Android sends Origin equal to its WebSocket endpoint's HTTP origin.
 * Accept that exact host/port, plus configured web origins. Session auth remains
 * mandatory. Never infer trust from X-Forwarded-Host or allow a whole subnet.
 */
export function socketOriginAllowed(request, configuredOrigins) {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (typeof origin !== 'string') return false;
  if (configuredOrigins.includes(origin)) return true;
  if (typeof request.headers.host !== 'string') return false;
  try {
    const source = new URL(origin);
    if (
      !['http:', 'https:'].includes(source.protocol) ||
      source.username ||
      source.password ||
      source.pathname !== '/' ||
      source.search ||
      source.hash
    )
      return false;
    const target = new URL(`${source.protocol}//${request.headers.host}`);
    if (
      target.username ||
      target.password ||
      target.pathname !== '/' ||
      target.search ||
      target.hash
    )
      return false;
    return source.origin === target.origin;
  } catch {
    return false;
  }
}

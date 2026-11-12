import { connect } from 'node:http2';
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { apnsConfiguration } from './live-activity-config';
const cachedJWT = new Map<string, { value: string; created: number }>();
function jwt(environment: string) {
  const config = apnsConfiguration(environment);
  if (!config) throw new Error('APNs environment is not configured');
  const cacheKey = `${environment}:${config.teamId}:${config.keyId}:${config.keyPath}`;
  const previous = cachedJWT.get(cacheKey);
  if (previous && Date.now() - previous.created < 45 * 60_000) return previous.value;
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: config.keyId })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
  const content = `${header}.${payload}`;
  const key = createPrivateKey(readFileSync(config.keyPath));
  const signature = sign('sha256', Buffer.from(content), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const result = { value: `${content}.${signature}`, created: Date.now() };
  cachedJWT.set(cacheKey, result); return result.value;
}
export function pushAPNs(token: string, environment: string, payload: unknown, alert?: { expires: number; collapse: string }): Promise<{ status: number; reason?: string }> {
  const authorization = jwt(environment);
  return new Promise((resolve, reject) => {
    const connection = connect(environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');
    const timer = setTimeout(() => { connection.destroy(); reject(new Error('APNs timeout')); }, 4000);
    connection.on('error', () => { clearTimeout(timer); connection.destroy(); reject(new Error('APNs connection failed')); });
    const request = connection.request({ ':method': 'POST', ':path': `/3/device/${token}`,
      authorization: `bearer ${authorization}`, 'apns-topic': alert ? process.env.APNS_BUNDLE_ID! : `${process.env.APNS_BUNDLE_ID}.push-type.liveactivity`,
      'apns-push-type': alert ? 'alert' : 'liveactivity', 'apns-priority': alert ? '10' : '5', 'apns-expiration': String(alert?.expires ?? Math.floor(Date.now() / 1000) + 120), ...(alert ? { 'apns-collapse-id': alert.collapse } : {}),
    });
    let status = 0; let data = '';
    request.on('response', headers => { status = Number(headers[':status']); });
    request.on('data', chunk => { if (data.length < 4096) data += chunk.toString(); });
    request.on('error', () => { clearTimeout(timer); connection.destroy(); reject(new Error('APNs request failed')); });
    request.on('end', () => {
      clearTimeout(timer); connection.close();
      let reason: string | undefined; try { reason = JSON.parse(data).reason; } catch {}
      resolve({ status, reason });
    });
    request.end(JSON.stringify(payload));
  });
}

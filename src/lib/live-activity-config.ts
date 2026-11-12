export function apnsConfiguration(environment: string, env: Record<string, string | undefined> = process.env) {
  if (environment !== 'sandbox' && environment !== 'production') return null;
  const prefix = environment === 'sandbox' ? 'APNS_SANDBOX' : 'APNS_PRODUCTION';
  const keyPath = env[`${prefix}_KEY_PATH`];
  const keyId = env[`${prefix}_KEY_ID`];
  const teamId = env.APNS_TEAM_ID;
  const bundleId = env.APNS_BUNDLE_ID;
  if (!bundleId || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleId)) return null;
  return keyPath && keyId && teamId ? { keyPath, keyId, teamId } : null;
}
export function liveActivitiesEnabled(env: Record<string, string | undefined> = process.env) {
  return env.LIVE_ACTIVITIES_ENABLED === 'true' && !!apnsConfiguration('sandbox', env) && !!apnsConfiguration('production', env);
}

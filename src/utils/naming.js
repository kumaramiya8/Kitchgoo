/**
 * Custom Naming Utility
 * Returns user-configured terminology or defaults.
 */

export function getNoun(settings, key, defaultVal) {
  const custom = settings?.naming?.[key];
  if (custom && typeof custom === 'string' && custom.trim()) {
    return custom.trim();
  }
  return defaultVal;
}

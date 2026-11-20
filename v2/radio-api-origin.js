export const productionRadioOrigin = 'https://radio.ibboabdoli.com';
export const productionRadioApiOrigin = 'https://api.radio.ibboabdoli.com';

export function radioApiOrigin(value, siteOrigin) {
  if (typeof value !== 'string') throw new TypeError('The radio API origin is missing');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new TypeError('The radio API needs an HTTPS origin');
  }
  if (siteOrigin === productionRadioOrigin) {
    if (url.origin === productionRadioOrigin) return productionRadioOrigin;
    if (url.origin === productionRadioApiOrigin) return productionRadioApiOrigin;
    throw new TypeError('Production requires a recognized radio API origin');
  }
  return url.origin;
}

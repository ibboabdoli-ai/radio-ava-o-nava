export const productionRadioOrigin = 'https://radio.ibboabdoli.com';

export function radioApiOrigin(value, siteOrigin) {
  if (typeof value !== 'string') throw new TypeError('The radio API origin is missing');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new TypeError('The radio API needs an HTTPS origin');
  }
  if (siteOrigin === productionRadioOrigin) {
    const siteHost = new URL(productionRadioOrigin).hostname;
    if (url.port || (url.hostname !== siteHost && !url.hostname.endsWith('.' + siteHost))) {
      throw new TypeError('Production requires an API under the radio domain');
    }
  }
  return url.origin;
}

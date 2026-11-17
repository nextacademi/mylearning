// Team members' social links, minus the placeholder accounts the original
// homepage shipped with (facebook.com/nextacademy, x.com/nextacademy, …),
// which point at profiles that are not the person's own. Used by the "Our
// Team" cards and the homepage structured data. Add real links in
// Dashboard → Website → Team.
const PLACEHOLDER = /^https?:\/\/(www\.)?(facebook\.com\/nextacademy|instagram\.com\/nextacademy|linkedin\.com\/company\/nextacademy|(x|twitter)\.com\/nextacademy)\/?$/i;

export function realSocialLinks(socials) {
  return Object.fromEntries(
    Object.entries(socials || {}).filter(([, url]) => typeof url === "string" && /^https:\/\/\S+$/i.test(url.trim()) && !PLACEHOLDER.test(url.trim())),
  );
}

/**
 * @module lib.url.normalize
 * @description Canonicalizes and normalizes feed item URLs to produce a deterministic, 
 *              dedupe-safe string suitable for database insertion (the 'url' column).
 *
 * - Lowercases host
 * - Removes default ports (80, 443)
 * - Removes URL fragment (#...)
 * - Removes common tracking/query params (utm_*, fbclid, gclid, mc_cid, mc_eid)
 * - Sorts query parameters for stable ordering
 * - Removes trailing slash normalization (keeps root '/')
 */

export function normalizeUrl(rawUrl) {

	if (!rawUrl || typeof rawUrl !== 'string') {
		return null;
	}

	try {
		// Initial Cleanup: Trim whitespace and normalize Unicode forms.
		let url = rawUrl.trim().normalize("NFC");
		
		// Protocol Fallback: Prepend HTTPS if scheme is missing (e.g., 'www.example.com/').
		if (!/^https?:\/\//i.test(url)) {
			url = "https://" + url;
		}

		const u = new URL(url);

		// Structural Normalization: Lowercase and strip defaults.
		u.protocol = u.protocol.toLowerCase();
		u.hostname = u.hostname.toLowerCase();

		// Remove default ports (:80, :443) to prevent duplicates.
		if ((u.protocol === "http:" && u.port === "80") ||
			(u.protocol === "https:" && u.port === "443")) {
			u.port = "";
		}

		// Remove fragments (#section) as they don't change content.
		u.hash = "";

		// Query Parameter Filtering and Sorting.
		const trackingParams = new Set([
			"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
			"utm_id", "fbclid", "gclid", "igshid", "mc_cid", "mc_eid",
			"ref", "ref_src", "spm" // Common referrer and tracking parameters
		]);

		const qp = new URLSearchParams();

		// Iterate through all parameters, skipping known tracking ones.
		for (const [key, value] of u.searchParams) {
			if (!trackingParams.has(key.toLowerCase())) {
				qp.append(key, value);
			}
		}

		// Sort parameters alphabetically (by key) for deterministic canonical order.
		const sorted = [...qp.entries()].sort((a, b) => a[0].localeCompare(b[0]));
		
		// Rebuild the search string.
		u.search = sorted.length ? 
			"?" + sorted.map(([k, v]) => `${k}=${v}`).join("&") :
			"";

		// Pathname Normalization.
		// Remove trailing slash, but only if the path is not the root ('/').
		if (u.pathname !== "/" && u.pathname.endsWith("/")) {
			u.pathname = u.pathname.slice(0, -1);
		}

		return u.toString();

	} catch (err) {
		// Return null if the URL cannot be successfully parsed by the native URL constructor.
		return null; 
	}
}
# timedashboard.app DNS import

Import [timedashboard.app.zone](timedashboard.app.zone) into the `timedashboard.app` Cloudflare zone. It contains GitHub Pages' four IPv4 and four IPv6 apex records, plus `www` pointing to `shaztechio.github.io.`. All records use a 300-second TTL and explicitly disable Cloudflare proxying.

1. In the repository's **Settings → Pages**, set the custom domain to `timedashboard.app` before importing DNS. The Actions deployment does not require a `CNAME` file. Rerun **Deploy GitHub Pages** after changing the domain so its social metadata uses the new URL.
2. In Cloudflare, select **DNS → Records → Import and Export**, upload the zone file, and leave **Proxy imported DNS records** unchecked. Confirm that the imported records show **DNS only**.
3. Replace conflicting web records for the apex or `www`; preserve unrelated email and verification records. This file does not contain nameservers, mail records, or domain-verification tokens.
4. After GitHub's DNS check and certificate issuance complete, enable **Enforce HTTPS** in Pages. `www` redirects to the apex once both are configured.

Creating this file does not change DNS or GitHub's custom-domain setting. Cloudflare must already be authoritative for the domain.

Sources checked 2026-10-15: [GitHub Pages DNS values and domain setup](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), [Cloudflare import format and proxy tags](https://developers.cloudflare.com/dns/manage-dns-records/how-to/import-and-export/).

# City data

The packaged catalog is derived from [GeoNames](https://www.geonames.org/), using the `cities15000` and `admin1CodesASCII` extracts, under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: fields reduced and normalized, unsupported records removed, aliases limited and supplemented, country display names resolved using Intl, and data repackaged as JSON. The download date is recorded in `cities-YYYY-MM-DD.json` as `snapshot`. Data is supplied as-is and covers cities above the source population threshold plus capitals, rather than every settlement.

The immutable search snapshot includes region and alias fields; the smaller URL lookup snapshot keeps stable IDs, names, countries, and IANA zones. Both are shipped as JSON and compressed variants. Compression does not change the attribution requirements. The dashboard footer links to GeoNames and CC BY 4.0 separately from its shaztech.io maker credit.

See the [source documentation](https://download.geonames.org/export/dump/readme.txt). No GeoNames API calls are made by the deployed application.

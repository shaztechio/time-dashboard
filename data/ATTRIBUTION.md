# City data

The packaged catalog is derived from [GeoNames](https://www.geonames.org/), using the `cities15000` and `admin1CodesASCII` extracts, under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: fields reduced and normalized, unsupported records removed, aliases limited and supplemented, country display names resolved using Intl, and data repackaged as JSON. The download date is recorded in `cities.json` as `snapshot`. Data is supplied as-is and covers cities above the source population threshold plus capitals, rather than every settlement.

See the [source documentation](https://download.geonames.org/export/dump/readme.txt). No GeoNames API calls are made by the deployed application.

# INSPIRE Index Polygons fixtures

This directory holds pre-converted HM Land Registry **INSPIRE Index
Polygons** for the Local Authorities the boundary proxy supports. Each
file is a slim WGS84 JSON array of `{ inspireId, polygon }` entries.

Runtime consumer: `api/site/_lib/inspirePolygonsClient.js`. The proxy
(`api/site/boundary.js`) gates INSPIRE lookups by postcode/lat-lng
country detection (`postcodeRegion.js`) so non-UK addresses never read
these files.

## Coverage

Coverage is per-LA; expand by re-running the download script for each
LA you want supported. The runtime falls through to OSM/Overpass for
any LA not represented here.

| File                      | Local Authority    | Status                                                                                                                                                                               |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `north-lincolnshire.json` | North Lincolnshire | **Synthetic placeholder** for the user's primary test address (17 Kensington Rd, DN15 8BQ). Replace with real INSPIRE data via the script below before relying on it for production. |

## Refreshing / adding a Local Authority

INSPIRE Index Polygons are released monthly under
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
Use the bundled script:

```bash
# Requires GDAL (`ogr2ogr`) and `unzip` on PATH.
node scripts/inspire/download-and-convert.cjs north-lincolnshire
```

This will:

1. Download `north-lincolnshire.zip` from the HMLR distribution.
2. Unzip + locate the GML inside.
3. Reproject EPSG:27700 (OS National Grid) → EPSG:4326 (WGS84) via
   `ogr2ogr -t_srs EPSG:4326`.
4. Slim each feature down to `{ inspireId, polygon }` and write to
   `api/site/_lib/inspireData/<la>.json`.

To add a new LA, run the script with that LA's slug (see the canonical
list at https://use-land-property-data.service.gov.uk/datasets/inspire)
and add a row to the `POSTCODE_AREA_TO_FIXTURES` map in
`inspirePolygonsClient.js` so the client knows which postcode areas
should consult the new file.

## Attribution requirement (OGL v3.0)

Wherever the polygons are rendered (interactive map, A1 site plan,
exported documents) the application MUST display:

> Contains HM Land Registry data © Crown copyright and database right
> (Open Government Licence v3.0)

`SiteBoundaryEditorV2.jsx` already renders this chip when the boundary's
`source` starts with `hm-land-registry-inspire`. If you add a new
render path, replicate the same gate.

## File size

A typical Local Authority is 5–15 MB raw JSON, 1–3 MB gzipped on the
wire. Vercel Function size limits (250 MB unzipped) accommodate dozens
of LAs comfortably. For full UK coverage (~340 LAs × ~5 MB ≈ 2 GB) move
the dataset to Vercel Blob with on-demand fetching — that work is
deferred to a follow-up PR.

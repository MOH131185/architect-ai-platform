# Brownfield Land Register fixtures

This directory holds the pre-converted Brownfield Land Register data
that the wizard's "Nearby development sites" overlay consumes via
`api/site/_lib/brownfieldClient.js` → `/api/site/brownfield-nearby`.

## Coverage

| File            | Source                                                                                                            | Coverage                                                                                     | Updated                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------ |
| `national.json` | [Digital Land consolidated `brownfield-land.csv`](https://files.planning.data.gov.uk/dataset/brownfield-land.csv) | All English LAs that publish a brownfield register (~35,000 sites across ~300 organisations) | When the conversion script is re-run |

A single national fixture replaces per-LA files because the Digital
Land feed already aggregates every council's register into one CSV with
WGS84 geometry. The runtime client does a linear scan with a cheap
lat/lng pre-filter — fast enough not to need a spatial index.

## Refreshing the fixture

The Digital Land dataset refreshes daily as councils publish updates.
To refresh:

```bash
# Download the latest national CSV (~20 MB).
curl -o tmp/brownfield-national.csv \
  https://files.planning.data.gov.uk/dataset/brownfield-land.csv

# Convert to slim WGS84 JSON.
node scripts/brownfield/convert-national.cjs tmp/brownfield-national.csv

# That writes api/site/_lib/brownfieldData/national.json (~12 MB).
# Commit and push.
```

The conversion needs no external tooling — pure Node, since the
Digital Land feed already carries WGS84 `POINT(lng lat)` geometry.

## Council-native CSV format

Some councils publish their own CSV in the [DLUHC native register
format](https://www.gov.uk/government/publications/brownfield-land-registers-data-standard)
with OS National Grid coordinates (EPSG:27700) instead of WGS84. The
older converter `scripts/brownfield/convert-csv.cjs` still handles that
schema with an inline OSGB36 → WGS84 transform (no `proj4` dep) — useful
if you have a council CSV that hasn't yet flowed through Digital Land's
pipeline.

## Attribution requirement (OGL v3.0)

Wherever the brownfield sites are rendered (interactive map, A1 site
plan, exported documents) the application MUST display:

> Contains public sector information licensed under the Open Government
> Licence v3.0 (council Brownfield Land Register).

`SiteBoundaryEditorV2.jsx` already renders this chip when the brownfield
overlay is showing markers. If you add a new render path, replicate
the same gate.

## File size note

`national.json` is ~12 MB. Within Vercel Function size limits
(250 MB unzipped) but worth monitoring. If the file outgrows ~50 MB,
move it to Vercel Blob with on-demand fetch — same pattern as the
INSPIRE bulk-data follow-up plan.

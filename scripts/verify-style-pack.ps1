$expected = @(
  "src/services/style/stylePackExtractor.js",
  "src/services/style/stylePackConstraintApplier.js",
  "src/schemas/stylePack.schema.json",
  "src/schemas/stylePack.js",
  "api/style-pack/extract.js",
  "src/__tests__/services/styleExtractor.test.js",
  "src/__tests__/services/styleConstraintApplier.test.js",
  "src/__tests__/fixtures/stylePack/portfolio-textPDF.json",
  "src/__tests__/fixtures/stylePack/expected-pack-portfolio-textPDF.json",
  "docs/style-pack/PLAN.md",
  "docs/style-pack/SCHEMA.md",
  "docs/style-pack/IMPLEMENTATION_NOTES.md",
  "src/services/style/localStylePack.js",
  "src/services/project/projectGraphVerticalSliceService.js",
  "src/services/design/optionGenerator.js",
  "src/services/design/optionScorer.js",
  "src/services/compiler/compiledProjectCompiler.js",
  "src/hooks/useArchitectAIWorkflow.js",
  ".env.example",
  "scripts/check-env.cjs",
  "src/__tests__/services/projectGraphVerticalSliceService.test.js",
  "src/__tests__/services/localStylePack.test.js"
)
$missing = @()
foreach ($p in $expected) {
  if (-not (Test-Path $p)) { $missing += $p }
}
if ($missing.Count -gt 0) {
  Write-Host "MISSING FILES:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "  $_" }
  exit 1
}
$flagHits = (Select-String -Path ".env.example","scripts/check-env.cjs" -Pattern "STYLE_PACK_ENABLED" -SimpleMatch).Count
if ($flagHits -lt 2) {
  Write-Host "FAIL: STYLE_PACK_ENABLED not wired into env.example + check-env.cjs (hits=$flagHits)" -ForegroundColor Red
  exit 1
}
Write-Host "OK: all expected files present, flag wired." -ForegroundColor Green

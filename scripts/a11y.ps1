param([string]$Session = 'leytech', [string]$BaseUrl = 'http://localhost:3001')
$ErrorActionPreference = 'Stop'
$axePath = Join-Path (Get-Location) 'node_modules/axe-core/axe.min.js'
if (!(Test-Path -LiteralPath $axePath)) { throw 'Ejecuta npm ci antes de verificar accesibilidad.' }
$auditCode = @'
async (page) => {
  const results=[];
  for (const width of [390,1440]) {
    await page.setViewportSize({width,height:900});
    for (const path of ['/','/catalogo','/producto/mouse-inalambrico-precision','/carrito','/checkout','/admin']) {
      await page.goto(BASE_URL+path);
      await page.addScriptTag({path:AXE_PATH});
      const result=await page.evaluate(async()=>{
        const audit=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
        return {overflow:document.documentElement.scrollWidth>innerWidth,violations:audit.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))};
      });
      results.push({width,requestedPath:path,actualUrl:page.url(),...result});
    }
  }
  return results;
}
'@
$baseLiteral = "'" + $BaseUrl.Replace('\','\\').Replace("'","\'") + "'"
$axeLiteral = "'" + $axePath.Replace('\','/').Replace("'","\'") + "'"
$auditCode = $auditCode.Replace('BASE_URL', $baseLiteral).Replace('AXE_PATH', $axeLiteral)
$auditCode = $auditCode -replace '\r?\n', ' '
New-Item -ItemType Directory -Path 'output' -Force | Out-Null
$rawAudit = npx --yes --package @playwright/cli playwright-cli "-s=$Session" run-code $auditCode --json | Out-String
if ($LASTEXITCODE -ne 0) { throw 'La comprobación del navegador falló.' }
$checks = ($rawAudit | ConvertFrom-Json).result | ConvertFrom-Json
$checks | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath 'output/a11y-report.json' -Encoding utf8
if ($checks | Where-Object { $_.requestedPath -eq '/admin' -and $_.actualUrl -notmatch '/admin$' }) { throw 'Inicia sesión en el panel dentro de la sesión de Playwright antes de repetir la prueba.' }
if ($checks | Where-Object { $_.overflow -or $_.violations.Count -gt 0 }) { throw 'Se encontraron problemas. Consulta output/a11y-report.json.' }
Write-Output "$($checks.Count) combinaciones de página y pantalla sin infracciones automáticas ni desbordamiento horizontal."

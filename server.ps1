# Fullastad - lokal server (Windows PowerShell 5.1, inga beroenden)
# Serverar ./public och fungerar som proxy mot Bordershop.
# Start: powershell -ExecutionPolicy Bypass -File server.ps1   (eller dubbelklicka start.cmd)

param([int]$Port = 8080)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Public = Join-Path $Root 'public'
$UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Fullastad/1.0'

# Bordershop-kategorier (whitelist - klienten kan bara be om dessa)
$BordershopBase = 'https://www.bordershop.com/sv/puttgarden'
$Sources = @{
  'ol'          = 'ol/c/scacat_5100'
  'cider'       = 'vin-och-cider/cider/c/scacat_5206'
  'vin'         = 'vin-och-cider/vin/c/scacat_5201'
  'mousserande' = 'vin-och-cider/mousserande-vin/c/scacat_5205'
  'sprit'       = 'spirit/c/scacat_5300'
  'lask'        = 'lask/c/scacat_5400'
}

$Cache = @{}
$CacheTtl = [TimeSpan]::FromHours(6)

function Invoke-Download([string]$url, [hashtable]$headers) {
  $wc = New-Object System.Net.WebClient
  $wc.Encoding = [Text.Encoding]::UTF8
  $wc.Headers.Add('User-Agent', $UserAgent)
  $wc.Headers.Add('Accept-Language', 'sv-SE,sv;q=0.9')
  if ($headers) { foreach ($k in $headers.Keys) { $wc.Headers.Add($k, [string]$headers[$k]) } }
  try { return $wc.DownloadString($url) } finally { $wc.Dispose() }
}

function Decode([string]$s) { if ($null -eq $s) { return '' }; return [System.Net.WebUtility]::HtmlDecode($s).Trim() }

function Get-BordershopPage([string]$key, [int]$page) {
  $cacheKey = "$key|$page"
  $hit = $Cache[$cacheKey]
  if ($hit -and ((Get-Date) - $hit.Time) -lt $CacheTtl) { return $hit.Data }

  $url = "$BordershopBase/$($Sources[$key])/?q=%3Arelevance&page=$page"
  $html = Invoke-Download $url $null

  $total = 0
  if ($html -match '(\d+)\s+Artikel') { $total = [int]$Matches[1] }

  $products = New-Object System.Collections.ArrayList
  $chunks = $html -split 'itemprop="itemListElement"'
  for ($i = 1; $i -lt $chunks.Count; $i++) {
    $c = $chunks[$i]
    $p = [ordered]@{ id = ''; name = ''; altName = ''; slug = ''; url = ''; image = '' }
    if ($c -match 'aria-label="([^"]*)"') { $p.name = Decode $Matches[1] }
    if ($c -match 'href="(/sv/puttgarden/[^"]*/p/[^"]*)"') {
      $p.url = 'https://www.bordershop.com' + $Matches[1]
      if ($Matches[1] -match '/([^/]+)/p/') { $p.slug = $Matches[1] -replace '-', ' ' }
    }
    if ($c -match 'data-track-id="0*(\d+)"') { $p.id = $Matches[1] }
    if ($c -match '"name":\s*"([^"]*)"') { $p.altName = Decode $Matches[1] }
    if ($c -match 'c-product-card__image"\s+src="([^"]*)"') { $p.image = 'https://www.bordershop.com' + (Decode $Matches[1]) }
    if ($p.url) { [void]$products.Add($p) }
  }

  $data = [ordered]@{ source = $key; page = $page; total = $total; count = $products.Count; products = @($products) }
  $Cache[$cacheKey] = @{ Time = Get-Date; Data = $data }
  return $data
}

function Send-Json($ctx, [int]$status, $obj) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 6 -Compress))
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = 'application/json; charset=utf-8'
  $ctx.Response.Headers.Add('Cache-Control', 'no-store')
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

$Mime = @{ '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8';
           '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.json' = 'application/json' }

function Send-Static($ctx, [string]$path) {
  if ($path -eq '/' -or -not $path) { $path = '/index.html' }
  $full = [IO.Path]::GetFullPath((Join-Path $Public ($path.TrimStart('/') -replace '/', '\')))
  if (-not $full.StartsWith($Public, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $full -PathType Leaf)) {
    $ctx.Response.StatusCode = 404; return
  }
  $bytes = [IO.File]::ReadAllBytes($full)
  $ext = [IO.Path]::GetExtension($full).ToLower()
  $ctx.Response.ContentType = if ($Mime[$ext]) { $Mime[$ext] } else { 'application/octet-stream' }
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Fullastad körs på http://localhost:$Port/  (Ctrl+C för att stoppa)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $path = $req.Url.AbsolutePath
    try {
      if ($path -eq '/api/bordershop') {
        $key = $req.QueryString['source']
        $page = 0; [void][int]::TryParse($req.QueryString['page'], [ref]$page)
        if (-not $Sources.ContainsKey($key) -or $page -lt 0 -or $page -gt 40) {
          Send-Json $ctx 400 @{ ok = $false; reason = 'bad_request' }
        } else {
          Send-Json $ctx 200 (Get-BordershopPage $key $page)
        }
      } else {
        Send-Static $ctx $path
      }
    } catch {
      Write-Warning "$path : $($_.Exception.Message)"
      try { Send-Json $ctx 502 @{ ok = $false; reason = 'upstream_error'; message = $_.Exception.Message } } catch {}
    } finally {
      try { $ctx.Response.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}

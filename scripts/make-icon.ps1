# Rebuilds build/icon.ico from build/icon.png.
#
# Why this exists: `win.icon` in electron-builder.yml points at the .ico, and
# nothing derives it from the .png. Replacing the artwork therefore changes the
# window icon (createWindow.ts loads the .png) while the executable, installer,
# taskbar and shortcuts silently keep the old drawing. That happened once
# already. Run this after every icon change, before `npm run package`.
#
# Windows-only, by design: the app ships for Windows 10/11 x64 and packages on
# windows-latest, so System.Drawing is always there and the repository needs no
# image dependency (the same reason Phase 10 generated the first icon by hand).

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'build\icon.png'
$target = Join-Path $root 'build\icon.ico'

# The set Windows asks for: list view, small shell slots, tiles, and the 256
# extra-large slot Explorer and the installer header use.
$sizes = 16, 24, 32, 48, 64, 128, 256

$png = [System.Drawing.Bitmap]::FromFile($source)
Write-Output "source  $($png.Width)x$($png.Height)  $source"

# Every icon slot is square, so a non-square drawing would be stretched to fit.
# Pad it out on the short axis instead, which keeps the artist's proportions.
$side = [Math]::Max($png.Width, $png.Height)
$square = New-Object System.Drawing.Bitmap $side, $side, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($square)
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($png, [int](($side - $png.Width) / 2), [int](($side - $png.Height) / 2), $png.Width, $png.Height)
$g.Dispose()
$png.Dispose()
Write-Output "squared $($side)x$($side) (transparent padding, artwork not stretched)"

function Resize-Square {
  param([System.Drawing.Bitmap]$Image, [int]$Size)

  # Bicubic samples a small neighbourhood, so going from ~1200px straight to
  # 16px aliases badly. Halve repeatedly first, then land on the target.
  $current = $Image
  $owned = $false
  while ($current.Width -ge $Size * 2) {
    $half = [Math]::Max($Size, [int]($current.Width / 2))
    $next = New-Object System.Drawing.Bitmap $half, $half, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gg = [System.Drawing.Graphics]::FromImage($next)
    $gg.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $gg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gg.DrawImage($current, 0, 0, $half, $half)
    $gg.Dispose()
    if ($owned) { $current.Dispose() }
    $current = $next
    $owned = $true
    if ($half -eq $Size) { break }
  }

  if ($current.Width -eq $Size) { return $current }

  $out = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gg = [System.Drawing.Graphics]::FromImage($out)
  # SourceCopy, not SourceOver: blending semi-transparent edges against a
  # transparent-black canvas is what gives downscaled icons a dark halo.
  $gg.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $gg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gg.DrawImage($current, 0, 0, $Size, $Size)
  $gg.Dispose()
  if ($owned) { $current.Dispose() }
  return $out
}

# PNG payloads at every size, which is what the previous icon.ico used and what
# Windows 10/11 reads. (Pre-Vista wanted a DIB below 256; that is out of scope.)
$frames = @()
foreach ($size in $sizes) {
  $bitmap = Resize-Square -Image $square -Size $size
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $frames += , @{ Size = $size; Bytes = $stream.ToArray() }
  $stream.Dispose()
  if (-not [object]::ReferenceEquals($bitmap, $square)) { $bitmap.Dispose() }
}
$square.Dispose()

$writer = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $writer
$bw.Write([uint16]0)                # reserved
$bw.Write([uint16]1)                # type: icon
$bw.Write([uint16]$frames.Count)

$offset = 6 + 16 * $frames.Count
foreach ($frame in $frames) {
  # 256 is stored as 0 in a single byte, which is why the field maxes there.
  $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
  $bw.Write([byte]$dimension)       # width
  $bw.Write([byte]$dimension)       # height
  $bw.Write([byte]0)                # palette size: none, it is truecolour
  $bw.Write([byte]0)                # reserved
  $bw.Write([uint16]1)              # colour planes
  $bw.Write([uint16]32)             # bits per pixel
  $bw.Write([uint32]$frame.Bytes.Length)
  $bw.Write([uint32]$offset)
  $offset += $frame.Bytes.Length
}
foreach ($frame in $frames) { $bw.Write($frame.Bytes) }
$bw.Flush()

[System.IO.File]::WriteAllBytes($target, $writer.ToArray())
$bw.Dispose(); $writer.Dispose()

Write-Output "wrote   $target"
foreach ($frame in $frames) { Write-Output "        $($frame.Size)x$($frame.Size)  $($frame.Bytes.Length) bytes" }
Write-Output "total   $((Get-Item $target).Length) bytes"

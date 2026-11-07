# Full window (K2): palette ctrl+Enter hand-off -> tool panel runs live -> alt+hotkey option -> ctrl+shift+C copies.
# Same safety rules as windows.ps1: isolated %APPDATA%, keys only while our window owns the foreground,
# clipboard restored afterwards. Screenshots go to -Out.
param(
  [string]$Exe,
  [string]$Out = (Join-Path $env:TEMP "kit-e2e-full"),
  [string]$Theme = "catppuccin-mocha",
  [string]$Locale = "tr"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Out | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class W3 {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public static void Down(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); }
  public static void Up(byte vk) { keybd_event(vk, 0, 2, UIntPtr.Zero); }
  public static void Tap(byte vk) { Down(vk); Up(vk); }
  public static uint FgPid() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return p; }
}
"@
[W3]::SetProcessDPIAware() | Out-Null

function Snap([string]$name) {
  $r = New-Object W3+RECT
  [W3]::GetWindowRect([W3]::GetForegroundWindow(), [ref]$r) | Out-Null
  $bmp = New-Object System.Drawing.Bitmap ($r.Right - $r.Left), ($r.Bottom - $r.Top)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path $Out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  "SNAP $name $($r.Right - $r.Left)x$($r.Bottom - $r.Top)"
}
function Ours { [W3]::FgPid() -eq $proc.Id }
function Combo([byte[]]$mods, [byte]$key) { foreach ($m in $mods) { [W3]::Down($m) }; [W3]::Tap($key); [array]::Reverse($mods); foreach ($m in $mods) { [W3]::Up($m) } }
function TypeText([string]$s) { foreach ($ch in $s.ToUpper().ToCharArray()) { [W3]::Tap([byte][char]$ch); Start-Sleep -Milliseconds 20 } }
$CTRL = 0x11; $SHIFT = 0x10; $ALT = 0x12; $ENTER = 0x0D

$appdata = Join-Path $Out "appdata"
New-Item -ItemType Directory -Force (Join-Path $appdata "kotilo\kit") | Out-Null
"[general]`nlocale = `"$Locale`"`n[clipboard]`ndetect = true`n[theme]`nid = `"$Theme`"`n" | Set-Content -Encoding utf8 (Join-Path $appdata "kotilo\kit\config.toml")

$json = @'
{
  "sub": "1234567890",
  "name": "Çağrı",
  "role": "admin",
  "iat": 1762512000,
  "exp": 1762771200,
  "scopes": ["read", "write", "deploy"]
}
'@
$saved = Get-Clipboard -Raw -ErrorAction SilentlyContinue
Set-Clipboard -Value $json
$env:APPDATA = $appdata
$proc = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds 5

try {
  Combo @($CTRL, $SHIFT) 0x4B; Start-Sleep -Milliseconds 500
  if (-not (Ours)) { "E2E_ABORT: palette not focused"; return }
  TypeText "base64"; Start-Sleep -Milliseconds 200
  Combo @($CTRL) $ENTER; Start-Sleep -Milliseconds 1200
  if (-not (Ours)) { "E2E_ABORT: full window not focused"; return }
  Combo @($ALT) 0x55; Start-Sleep -Milliseconds 300   # alt+U -> URL-safe
  Snap "full.png"
  Set-Clipboard -Value "x"
  Combo @($CTRL, $SHIFT) 0x43; Start-Sleep -Milliseconds 400   # ctrl+shift+C
  $clip = Get-Clipboard -Raw
  "COPIED: $clip"
  $expected = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($json -replace "`r`n", "`n").TrimEnd("`n"))).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  if ($clip.Trim() -eq $expected) { "E2E_PASS: palette -> ctrl+Enter -> full window -> alt+U -> ctrl+shift+C" } else { "E2E_FAIL expected $expected" }
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  if ($null -ne $saved) { Set-Clipboard -Value $saved }
}

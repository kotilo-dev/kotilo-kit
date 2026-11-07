# Windows end-to-end check for K1: global shortcut -> palette -> Enter -> clipboard.
# Sends REAL keystrokes. Uses an isolated %APPDATA% (never your real config), only presses Enter
# when the palette owns the foreground, and restores your clipboard afterwards.
#   pnpm --filter @kotilo/kit-desktop tauri build --debug --no-bundle
#   pwsh apps/desktop/e2e/windows.ps1 -Exe apps/desktop/src-tauri/target/debug/kotilo-kit.exe -Out $env:TEMP/kit-e2e
param(
  [string]$Exe,
  [string]$Out = (Join-Path $env:TEMP "kit-e2e"),
  [string]$Theme = "catppuccin-mocha",
  [string]$Locale = "tr",
  [switch]$SkipEnter
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class W {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public static void Down(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); }
  public static void Up(byte vk) { keybd_event(vk, 0, 2, UIntPtr.Zero); }
  public static void Tap(byte vk) { Down(vk); Up(vk); }
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public static string VisibleWindows(int pid) {
    var sb = new StringBuilder();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h)) { RECT r; GetWindowRect(h, out r); sb.Append((r.Right-r.Left) + "x" + (r.Bottom-r.Top) + " "); }
      return true; }, IntPtr.Zero);
    return sb.ToString();
  }
  public static uint FgPid() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return p; }
}
"@
[W]::SetProcessDPIAware() | Out-Null
$VK_CTRL = 0x11; $VK_SHIFT = 0x10; $VK_K = 0x4B; $VK_ENTER = 0x0D

function Snap([string]$name) {
  $r = New-Object W+RECT
  [W]::GetWindowRect([W]::GetForegroundWindow(), [ref]$r) | Out-Null
  $w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path $Out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  "SNAP $name ${w}x${h} at $($r.Left),$($r.Top)"
}

# isolated config dir: never touch the real %APPDATA%\kotilo
$appdata = Join-Path $Out "appdata"
New-Item -ItemType Directory -Force (Join-Path $appdata "kotilo\kit") | Out-Null
$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
@"
[general]
locale = "$Locale"
[clipboard]
detect = true
[theme]
id = "$Theme"
[recent]
ids = ["timestamp", "csv"]
used = [$($now - 120), $($now - 3 * 3600)]
"@ | Set-Content -Encoding utf8 (Join-Path $appdata "kotilo\kit\config.toml")

$saved = Get-Clipboard -Raw -ErrorAction SilentlyContinue
$jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiIsIm5hbWUiOiLDh2HEn3LEsSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ.2uI2kSHB-vc1nK7YbgY-78eLxa2XDjivHfQ0tdjbcmw"
Set-Clipboard -Value $jwt

$env:APPDATA = $appdata
$proc = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds 5   # webviews load hidden

try {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  [W]::Down($VK_CTRL); [W]::Down($VK_SHIFT); [W]::Tap($VK_K); [W]::Up($VK_SHIFT); [W]::Up($VK_CTRL)
  while ($sw.ElapsedMilliseconds -lt 2000 -and [W]::FgPid() -ne $proc.Id) { Start-Sleep -Milliseconds 10 }
  if ([W]::FgPid() -ne $proc.Id) { "E2E_ABORT: palette did not take focus; not sending Enter"; return }
  "PALETTE_FOCUSED_MS $($sw.ElapsedMilliseconds)"
  Start-Sleep -Milliseconds 400   # let it paint
  Snap "palette.png"

  if (-not $SkipEnter) {
    if ([W]::FgPid() -ne $proc.Id) { "E2E_ABORT: focus moved; not sending Enter"; return }
    [W]::Tap($VK_ENTER)
    Start-Sleep -Milliseconds 500
    $vis = [W]::VisibleWindows($proc.Id)
    "VISIBLE_WINDOWS_AFTER_ENTER: $vis"
    $clip = Get-Clipboard -Raw
    if ($clip -match '"name": "Çağrı"') { "E2E_PASS: shortcut -> palette -> Enter -> clipboard" } else { "E2E_FAIL" }
    "PALETTE_STILL_FOREGROUND: $([W]::FgPid() -eq $proc.Id)"
  }
  "CONFIG_AFTER:"; Get-Content (Join-Path $appdata "kotilo\kit\config.toml")
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  if ($null -ne $saved) { Set-Clipboard -Value $saved }
}



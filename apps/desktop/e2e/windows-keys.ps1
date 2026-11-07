# Keyboard behaviour: hotkey toggles, Esc closes, ctrl+Enter opens the full window. Same safety rules as windows.ps1.
param([string]$Exe, [string]$Out, [string]$Theme = "gruvbox-dark", [string]$Locale = "en")
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class W2 {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public static void Down(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); }
  public static void Up(byte vk) { keybd_event(vk, 0, 2, UIntPtr.Zero); }
  public static void Tap(byte vk) { Down(vk); Up(vk); }
  public static uint FgPid() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return p; }
  public static string Visible(int pid) {
    var sb = new StringBuilder();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h)) { RECT r; GetWindowRect(h, out r); int w = r.Right - r.Left; if (w > 100) sb.Append(w + "x" + (r.Bottom - r.Top) + " "); }
      return true; }, IntPtr.Zero);
    return sb.ToString().Trim();
  }
}
"@
[W2]::SetProcessDPIAware() | Out-Null

function Snap([string]$name) {
  $r = New-Object W2+RECT
  [W2]::GetWindowRect([W2]::GetForegroundWindow(), [ref]$r) | Out-Null
  $bmp = New-Object System.Drawing.Bitmap ($r.Right - $r.Left), ($r.Bottom - $r.Top)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path $Out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

$appdata = Join-Path $Out "appdata"
New-Item -ItemType Directory -Force (Join-Path $appdata "kotilo\kit") | Out-Null
"[general]`nlocale = `"$Locale`"`n[clipboard]`ndetect = true`n[theme]`nid = `"$Theme`"`n" | Set-Content -Encoding utf8 (Join-Path $appdata "kotilo\kit\config.toml")

$saved = Get-Clipboard -Raw -ErrorAction SilentlyContinue
Set-Clipboard -Value '{"b":1,"a":[1,2]}'
$env:APPDATA = $appdata
$proc = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds 5

function Hotkey { [W2]::Down(0x11); [W2]::Down(0x10); [W2]::Tap(0x4B); [W2]::Up(0x10); [W2]::Up(0x11); Start-Sleep -Milliseconds 500 }
function Ours { [W2]::FgPid() -eq $proc.Id }
function State([string]$label) { "$label  focused=$(Ours)  visible=[$([W2]::Visible($proc.Id))]" }

try {
  Hotkey; State "1 hotkey -> open"
  Hotkey; State "2 hotkey again -> close"
  Hotkey; if (Ours) { [W2]::Tap(0x1B); Start-Sleep -Milliseconds 300 }; State "3 esc -> close"
  Hotkey
  if (Ours) {
    Snap "palette-theme.png"
    [W2]::Down(0x11); [W2]::Tap(0x0D); [W2]::Up(0x11); Start-Sleep -Milliseconds 1000
    State "4 ctrl+enter -> full window"
    if (Ours) { Snap "main.png" }
  }
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  if ($null -ne $saved) { Set-Clipboard -Value $saved }
}

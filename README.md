# RootDeck

An all-in-one root toolkit for Magisk-rooted Android phones, with a clean AMOLED-dark UI.
Built for a Pixel 10 Pro XL on crDroid (Android 17), and should work on most
modern rooted devices.

**[Download the latest APK](../../releases/latest)**

## Features

**Home**: live dashboard
- CPU load graph and per-core frequencies
- Battery level, current (mA), power (W), temperature, voltage, health % and charge cycles
- RAM, swap/zram and storage usage
- Grouped thermals (CPU, GPU, TPU, skin, battery, charger)
- Quick actions: power menu, restart SystemUI, free RAM, clear app caches

**Tune**: kernel and display controls
- Battery / Balanced / Performance profiles
- Per-cluster CPU governor and min/max frequency
- Charge limit (Pixel `google,charger` and standard `charge_control_end_threshold`)
- Force peak refresh rate, screen density, animation speed
- I/O scheduler, TCP congestion control, swappiness
- Optional *Apply at boot* (writes `/data/adb/service.d/rootdeck.sh`) and one-tap *Restore stock*

**Apps**: debloater and app manager
- Search plus User / System / Frozen / Removed filters
- Freeze, remove for user 0, restore, force stop, clear cache or data, save APK
- Long-press for batch actions
- Core system packages are flagged with bootloop warnings

**Tools**
- Saved Wi‑Fi passwords
- Ad blocker using Magisk's systemless hosts (StevenBlack, AdAway, Hagezi, or a custom URL)
- Private DNS presets (AdGuard, Cloudflare, Quad9, Mullvad, Google, custom)
- Magisk module manager (enable, disable, remove, run `action.sh`)
- Logcat viewer with level filters, root terminal, searchable `getprop`
- Maintenance: fstrim, trim caches, bg-dexopt, drop caches, reset battery stats
- Power menu: reboot, power off, recovery, bootloader, fastbootd, soft reboot

## Install

1. Download `RootDeck.apk` from [Releases](../../releases/latest) and open it, or install it as root:
   ```sh
   su -c 'pm install /path/to/RootDeck.apk'
   ```
2. Launch RootDeck and grant root when Magisk asks.

Requires Android 8.0+ and Magisk.

## Safety

RootDeck runs real root commands. Freezing or removing core system packages, or setting extreme
CPU or density values, can make your phone unstable. Removed system apps can be restored from the
**Removed** filter, and **Tune → Restore stock values** undoes kernel tweaks. Keep a backup and
know how to reach recovery.

## Build from source

No Gradle or Android Studio needed. On Debian/Ubuntu (works on arm64, including inside Termux proot):

```sh
sudo apt install openjdk-21-jdk-headless aapt apksigner zipalign android-sdk-platform-23 dalvik-exchange
./build.sh   # → build/RootDeck.apk
```

`build.sh` creates a local signing key (`rootdeck.jks`) on first run. That key is not in this
repo. Keep your own copy, because Android only installs updates signed with the same key.

## How it works

- `src/`: a small Java activity that hosts the UI in a WebView and keeps one persistent `su`
  shell (plus a second one for long jobs). It exposes a bridge as `window.Native`.
- `assets/`: the whole UI (`index.html`, `style.css`, `app.js`), with no frameworks or network assets.
- `dev/`: a fake `Native` bridge (`mock.js`) and a Playwright script (`shots.py`) for previewing
  the UI in a desktop browser.

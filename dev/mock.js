// Fake window.Native for previewing the UI in a desktop browser. Not packaged into the APK.
(function () {
  const rnd = (a, b) => a + Math.random() * (b - a);
  let user = 1e6, idle = 4e6;
  const reply = (id, code, out, ms = 80) => setTimeout(() => window.RD_cb(id, code, out), ms);

  const INFO = `model=Pixel 10 Pro XL
market=
device=mustang
android=17
spl=2026-10-05
crd=12.4
lin=23.0
disp=BP4A.261005.002
soc=Tensor G5
kernel=6.6.82-android16-11-gd41f2c
selinux=Enforcing
magisk=29.0:MAGISK:R
magiskf=
cores=8
/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq:2246000
/sys/devices/system/cpu/cpu1/cpufreq/cpuinfo_max_freq:2246000
/sys/devices/system/cpu/cpu2/cpufreq/cpuinfo_max_freq:3052000
/sys/devices/system/cpu/cpu3/cpufreq/cpuinfo_max_freq:3052000
/sys/devices/system/cpu/cpu4/cpufreq/cpuinfo_max_freq:3052000
/sys/devices/system/cpu/cpu5/cpufreq/cpuinfo_max_freq:3052000
/sys/devices/system/cpu/cpu6/cpufreq/cpuinfo_max_freq:3052000
/sys/devices/system/cpu/cpu7/cpufreq/cpuinfo_max_freq:3782000`;

  function live() {
    const busy = rnd(2000, 9000);
    user += busy; idle += 10000 - busy;
    const max = [2246, 2246, 3052, 3052, 3052, 3052, 3052, 3782];
    const zones = [['BIG', rnd(41, 47)], ['MID', rnd(38, 43)], ['LITTLE', rnd(35, 38)], ['G3D', rnd(36, 40)], ['TPU', rnd(33, 35)], ['VIRTUAL-SKIN', rnd(33, 35)], ['battery', 31.4], ['usb_pwr_therm', 30.2]];
    return [
      `cpu  ${Math.round(user)} 0 ${Math.round(user / 3)} ${Math.round(idle)} 120 0 40 0 0 0`, '@@',
      max.map((m, i) => `/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_cur_freq:${Math.round(rnd(0.2, 0.95) * m) * 1000}`).join('\n'), '@@',
      'MemTotal:       15988012 kB\nMemAvailable:    6212400 kB\nSwapTotal:       8388604 kB\nSwapFree:        6990100 kB', '@@',
      ['capacity:78', 'status:Discharging', 'health:Good', 'temp:314', `current_now:-${Math.round(rnd(380, 720)) * 1000}`, 'voltage_now:4012000', 'cycle_count:143', 'charge_full:4890000', 'charge_full_design:5060000'].map(x => '/sys/class/power_supply/battery/' + x).join('\n'), '@@',
      zones.map(([t], i) => `/sys/class/thermal/thermal_zone${i}/type:${t}`).concat(zones.map(([, v], i) => `/sys/class/thermal/thermal_zone${i}/temp:${Math.round(v * 1000)}`)).join('\n'), '@@',
      '273601.55 1912003.10', '@@',
      '/dev/block/dm-55 240025600 33554432 206471168  14% /data',
    ].join('\n');
  }

  const pol = (id, cpus, max, freqs) => `@@${id}
${['related_cpus:' + cpus, 'scaling_governor:sched_pixel', 'scaling_available_governors:sched_pixel conservative powersave performance schedutil', 'scaling_available_frequencies:' + freqs.join(' '), 'scaling_min_freq:' + freqs[0], 'scaling_max_freq:' + max, 'cpuinfo_min_freq:' + freqs[0], 'cpuinfo_max_freq:' + max].map(l => `/sys/devices/system/cpu/cpufreq/${id}/${l}`).join('\n')}`;
  const steps = (lo, hi, n) => Array.from({ length: n }, (_, i) => Math.round((lo + ((hi - lo) * i) / (n - 1)) / 1000) * 1000);
  const TUNE = [
    pol('policy0', '0 1', 2246000, steps(300000, 2246000, 12)),
    pol('policy2', '2 3 4', 3052000, steps(400000, 3052000, 15)),
    pol('policy5', '5 6', 3052000, steps(500000, 3052000, 15)),
    pol('policy7', '7', 3782000, steps(700000, 3782000, 18)),
    '@@sys', 'io=[mq-deadline] kyber bfq none', 'tcp=cubic', 'tcpa=reno cubic bbr westwood', 'swap=100',
    'dpi_phys=480', 'anim=1.0', 'peak=120.0', 'minr=null', 'fps=fps=1.0 fps=60.000004 fps=120.00001 ',
    'chgp=/sys/devices/platform/google,charger/charge_stop_level', 'chg=100',
  ].join('\n');

  const WIFI = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?><WifiConfigStoreData><NetworkList>
${[['Home-5G', 'correct horse battery', 'WPA_PSK'], ['Office Guest', 'Welcome2026!', 'SAE'], ['Cafe Free WiFi', null, 'NONE'], ['Grandma &amp; Grandpa', 'cookies4ever', 'WPA_PSK']]
    .map(([s, p, k]) => `<Network><WifiConfiguration><string name="ConfigKey">&quot;${s}&quot;${k}</string><string name="SSID">&quot;${s}&quot;</string>${p ? `<string name="PreSharedKey">&quot;${p}&quot;</string>` : ''}</WifiConfiguration></Network>`).join('\n')}
</NetworkList></WifiConfigStoreData>`;

  const MODS = `@@/data/adb/modules/zygisk_lsposed
id=zygisk_lsposed
name=LSPosed
version=v1.10.1 (7200)
author=LSPosed Developers
description=Another enhanced implementation of Xposed Framework.
__action.sh=1
@@/data/adb/modules/playintegrityfix
id=playintegrityfix
name=Play Integrity Fix
version=v19.0
author=chiteroman
description=Fix Play Integrity verdicts to pass device integrity on custom ROMs.
@@/data/adb/modules/hosts
id=hosts
name=Systemless Hosts
version=1.0
author=Magisk
description=Magisk app built-in systemless hosts module
__disable=1`;

  const LOG = `--------- beginning of main
10-31 21:14:02.118  1520  1611 W ActivityManager: Slow operation: 112ms so far, now at startProcess
10-31 21:14:02.331  2210  2210 E AndroidRuntime: FATAL EXCEPTION: main
10-31 21:14:02.331  2210  2210 E AndroidRuntime: java.lang.IllegalStateException: Fragment not attached
10-31 21:14:03.010   903   903 W thermal-hal: skin temperature approaching throttle threshold
10-31 21:14:04.442  1520  1543 I ActivityTaskManager: Displayed com.android.settings/.Settings: +312ms
10-31 21:14:05.007  3301  3330 W ziparchive: Unable to open '/data/app/base.dm': No such file`;

  const NAMES = [['Chrome', 'com.android.chrome', 1, 1], ['Gmail', 'com.google.android.gm', 1, 1], ['Spotify', 'com.spotify.music', 0], ['Telegram', 'org.telegram.messenger', 0], ['Termux', 'com.termux', 0], ['Magisk', 'com.topjohnwu.magisk', 0],
    ['YouTube', 'com.google.android.youtube', 1, 1], ['Google Photos', 'com.google.android.apps.photos', 1, 1], ['Settings', 'com.android.settings', 1], ['System UI', 'com.android.systemui', 1], ['Pixel Tips', 'com.google.android.apps.tips', 1, 0, 0],
    ['Digital Wellbeing', 'com.google.android.apps.wellbeing', 1, 0, 1, 0], ['Google TV', 'com.google.android.videos', 1, 0, 0], ['Aegis', 'com.beemdevelopment.aegis', 0], ['Discord', 'com.discord', 0], ['NewPipe', 'org.schabi.newpipe', 0],
    ['Google Play services', 'com.google.android.gms', 1, 1], ['Keep Notes', 'com.google.android.keep', 1, 1, 1, 0], ['Weather', 'com.google.android.apps.weather', 1], ['Files', 'com.google.android.documentsui', 1], ['RootDeck', 'io.rootdeck', 0]];
  const APPS = NAMES.map(([n, p, s, u, i = 1, e = 1]) => ({ n, p, v: (Math.random() * 20 + 1).toFixed(1) + '.0', s: !!s, u: !!u, i: !!i, e: !!e, d: `/data/app/~~x/${p}-1/base.apk`, sp: p === 'com.android.chrome' ? 3 : 0, uid: 10100 + Math.floor(Math.random() * 300), t: 1730000000000, up: 1761000000000 }));
  const HUES = [158, 210, 265, 30, 340, 190, 120, 0];

  window.Native = {
    exec(id, cmd) {
      const c = cmd.trim();
      let out = '';
      if (c === 'id -u') out = '0';
      else if (c.includes('model=$(getprop')) out = INFO;
      else if (c.startsWith('head -n1 /proc/stat')) out = live();
      else if (c.includes('scaling_available_governors')) out = TUNE;
      else if (c.includes('WifiConfigStore')) out = WIFI;
      else if (c.includes('/data/adb/modules/*')) out = MODS;
      else if (c.includes('echo live=')) out = 'mod=1\nlive=84213\nfile=84213';
      else if (c.includes('private_dns_mode; settings get')) out = 'hostname\ndns.adguard-dns.com';
      else if (c.startsWith('logcat')) out = LOG;
      else if (c === 'getprop') out = '[ro.product.model]: [Pixel 10 Pro XL]\n[ro.build.version.sdk]: [37]\n[ro.boot.slot_suffix]: [_b]\n[persist.sys.locale]: []';
      else if (c.includes('__RDCWD__')) out = 'Linux localhost 6.6.82-android16 #1 SMP PREEMPT aarch64 Toybox\n__RDCWD__0|/data/adb';
      else if (c.includes('scaling_governor') && c.includes('cat ')) out = 'sched_pixel\n300000\n2246000';
      reply(id, 0, out);
    },
    apps(id) { reply(id, 0, JSON.stringify(APPS), 300); },
    icon(id, pkg) {
      const h = HUES[pkg.length % HUES.length], ch = pkg.split('.').pop()[0].toUpperCase();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},80%,62%)"/><stop offset="1" stop-color="hsl(${h + 40},75%,45%)"/></linearGradient></defs><rect width="48" height="48" rx="24" fill="url(#g)"/><text x="24" y="31" font-family="sans-serif" font-size="20" font-weight="700" fill="#fff" text-anchor="middle">${ch}</text></svg>`;
      reply(id, 0, 'data:image/svg+xml;base64,' + btoa(svg), 120);
    },
    download(id) { reply(id, 0, '/data/user/0/io.rootdeck/cache/dl-1'); },
    launch() { return true; }, appInfo() {}, copy() {}, share() {}, haptic() {},
    insets() { return '{"t":32,"b":20,"l":0,"r":0,"ime":false}'; },
    sdk() { return 37; }, version() { return '1.0'; },
  };
})();

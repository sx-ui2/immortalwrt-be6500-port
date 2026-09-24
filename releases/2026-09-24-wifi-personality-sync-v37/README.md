# BE6500 Wi-Fi personality synchronization v37

This build fixes the remaining dual-band channel-list mismatch in v36.

## Root cause

The v36 ath12k driver already registered the complete country-permitted 5 GHz
channel list, and `iwinfo` reported channels through 165. A configuration kept
across sysupgrade could nevertheless still say that the router was in tri-band
mode while the kernel had booted the factory single-radio dual-band BDF
personality. LuCI then applied the tri-band low/high radio split to that single
5 GHz radio and hid channels above 64.

## Fix

An early boot service now reads the effective BDF selector from the kernel
command line and synchronizes the UCI radio personality before netifd starts:

- factory single-radio BDF (`0x2`): dual-band mode, one 5 GHz radio, radio2
  disabled, and the complete regulatory 5 GHz channel list is shown;
- split-radio BDF: tri-band mode with separate 5.2G and 5.8G radios and the
  corresponding low/high channel split.

The synchronization runs on every boot, including after a settings-preserving
sysupgrade, so stale UCI state can no longer override the actual driver mode.
The LuCI patcher also runs the synchronization before patching the wireless
page.

No automatic Wi-Fi reload is performed solely for this synchronization.

## Verification

The image contains `luci-app-rejected-clients` release 34, the early boot
service `S18be6500-wifi-personality`, and the runtime synchronization helper.
The full project test suite passes all 124 tests.

The image retains the existing ECM/PPE acceleration configuration, Nikki and
its Simplified Chinese package, guest Wi-Fi fixes, access-list hot updates,
device SSID/band display, rejection records, and LED defaults.

Verify the sysupgrade image against `SHA256SUMS` before flashing.

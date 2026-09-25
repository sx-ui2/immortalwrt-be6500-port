# BE6500 v45 — boot-safe LAN ports and storage reporting

This release fixes the two LuCI problems visible in the supplied screenshots:

- **Network > Interfaces > Devices** now loads live QCA8386 state and shows
  physical **LAN1**, **LAN2** and **LAN3** cards. The chassis mapping follows
  the factory firmware: LAN1 = switch port 3, LAN2 = port 2 and LAN3 = port 1.
  These are switch ports behind `eth1`, so they are not exposed as fake Linux
  netdevs. VLAN configuration remains on the Switch page and OEM-style port
  roles remain under **Router Settings > Port Settings**.
- The status page no longer labels the approximately 428 MiB tmpfs as disk
  space. It reports physical eMMC capacity, the real mounted `/overlay`
  writable space, RAM-backed root when persistent storage is not mounted, and
  `/tmp` as separate values.

The final SquashFS was unpacked after the build. It contains exactly one LAN
module dependency, one port-state load and one card renderer (`1/1/1`), plus
the updated storage RPC/view. The fixes are already present on first boot; the
boot service only repeats the patch idempotently and never reloads networking
or Wi-Fi.

## Choose the correct image

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-squashfs-sysupgrade.bin`
  is for **System > Backup / Flash Firmware** in a running ImmortalWrt/OpenWrt
  installation. Its native metadata identifies `jdcloud,be6500`; do not select
  **Force upgrade** if validation fails.
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-ubootkit-factory.bin` is only
  for the **uBootKit Firmware Update** page. It contains the FIT kernel in the
  7 MiB HLOS slot, SquashFS at `0x700000`, and a big-endian `DEADC0DE` trailer.
  Do not upload the sysupgrade tar to uBootKit.
- `luci-app-rejected-clients_43_all.ipk` can update the two LuCI fixes on an
  already running matching build, without restarting network or Wi-Fi.

Keep the boot-confirmed v41 uBootKit recovery image available. No router was
automatically flashed while producing this release.

## Boot-safety and verification

- Kernel Image SHA-256 matches the boot-confirmed v41 payload exactly:
  `c178f8503543ceb9fd8a2ab02209a8976091fa7661acad31362d28c5da430173`.
- The DTB actually selected by the persistent BE6500 image matches v41
  exactly: `ea0f9168ba9cb14d512a265ba214a6d1cfd464c767f3d872201ed5209334c61a`.
- The unvalidated USB PHY drivers that caused the non-booting v40/v42/v44
  images are disabled and absent. USB storage/printer userspace remains, but
  this release does **not** claim that physical USB enumeration is fixed.
- Sysupgrade metadata version is `1.1`, supported device is
  `jdcloud,be6500`, target is `qualcommax/ipq53xx`, and the extracted build
  signature is 516 bytes.
- The uBootKit factory image was independently checked for a byte-identical
  kernel, SquashFS at `0x700000`, and its `DEADC0DE` trailer.
- All 152 project tests pass and `git diff --check` passes.

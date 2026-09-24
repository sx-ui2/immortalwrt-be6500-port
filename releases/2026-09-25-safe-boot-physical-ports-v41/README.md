# BE6500 safe boot and physical LAN ports v41

This is the recovery successor to the withdrawn v40 image. It keeps the
LAN1-LAN3 LuCI display fix while restoring the exact kernel and DTB used by
the boot-confirmed v39 image.

## Boot-path recovery

- The decompressed Linux Image is byte-for-byte identical to v39:
  `c178f8503543ceb9fd8a2ab02209a8976091fa7661acad31362d28c5da430173`.
- The DTB is byte-for-byte identical to v39:
  `ea0f9168ba9cb14d512a265ba214a6d1cfd464c767f3d872201ed5209334c61a`.
- Restores the v39 kernel configuration exactly, including IPQ4019 MDIO as a
  module, CPR3 NPU regulator support, pstore/ramoops, and Reed-Solomon support.
- Keeps the unvalidated M31 and IPQ UniPHY USB PHY drivers disabled. USB host
  support is therefore not claimed in this recovery image.

## LAN1-LAN3 device display

- Fixes the patching of the minified LuCI Interfaces asset used in release
  images.
- Adds live LAN1, LAN2 and LAN3 physical QCA8386 port cards to Network >
  Interfaces > Devices, showing link state and negotiated speed.
- Does not create fake `lan1`-`lan3` Linux netdevs or add another switch page.
- Keeps port roles, IPTV and game-port policy on Router Settings > Port
  Settings, and keeps VLAN membership on the existing Switch page.
- Revalidates LuCI patches at boot without restarting networking or Wi-Fi.

## Validation

- Linux Image and DTB match the boot-confirmed v39 components exactly.
- Extracted kernel configuration has no differences from v39.
- The complete project suite passes all 142 tests.
- Profile variant is `6.6 v79 safe boot and physical ports`.

Verify the sysupgrade image against `SHA256SUMS` before flashing. The v40
image was withdrawn because it failed to boot and must not be used.

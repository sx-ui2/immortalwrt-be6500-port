# BE6500 OEM port controls and USB hotplug v39

This build replaces the temporary physical-port controls with the original
JDCloud/QCA8386 port-management model and enables the board's USB host path.

## Original-style port controls

- Shows the real WAN/LAN1-LAN3 link state, negotiated speed, role, and low-link
  warning.
- Restores IPTV VLAN ID, 802.1p priority, and dedicated LAN-port selection.
- Restores the factory game-port selector. Traffic from the selected port is
  mapped through the QCA8386 SSDK priority/ACL path used by the stock firmware.
- Keeps normal switch/VLAN editing on the existing switch page; it does not
  create fake `lan1`-`lan3` Linux devices or duplicate the switch editor.

## USB host and storage

- Enables the final DTB nodes for the DWC3 controller, M31 USB 2.0 PHY, and
  UniPHY USB 3.0 PHY.
- Includes USB 2.0/3.0 host, mass-storage, UAS, common storage adapter, and USB
  printer kernel modules.
- Supports block hotplug: removing a drive removes its device/mount state;
  inserting another supported drive enumerates it without rebooting the router.
- Includes DiskMan, block-mount/blockd, ext4/exFAT/FAT/NTFS3 support, Samba 4,
  SFTP, disk idle management, partitioning tools, and SMART tools.

The stock firmware's vendor PCDN and cloud WebDAV services are intentionally
not copied. They depend on JDCloud proprietary services and accounts. Standard
LAN storage is provided by Samba; secure file transfer is available through
SFTP.

## Validation

- The final image DTB was decompiled and all three USB nodes were verified as
  `status = "okay"`.
- The final root filesystem contains `dwc3`, `dwc3-qcom`, `xhci`,
  `usb-storage`, `uas`, and `usblp` modules.
- The complete project test suite passes all 137 tests.
- The image contains `luci-app-rejected-clients` release 38 and profile variant
  `6.6 v77 OEM ports and USB storage`.

Verify the sysupgrade image against `SHA256SUMS` before flashing.

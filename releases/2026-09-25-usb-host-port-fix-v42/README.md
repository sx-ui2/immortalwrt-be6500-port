# WITHDRAWN — DO NOT FLASH: BE6500 v42

This image failed to boot on the BE6500 and is withdrawn. Use the
boot-confirmed v41 image for recovery. The failure occurs when the generic
Linux 6.6 M31/UniPHY modules complete the deferred DWC3/xHCI probe. The factory
firmware instead uses the legacy QCA M31 `usb-phy` path for USB2 and a generic
PHY only for USB3; v42 did not reproduce that topology.

The downloadable v42 image and build metadata have been removed from the
current branch. They must not be used.

## Historical description

This build keeps the boot-validated v41 kernel path and completes the USB host
stack without making the USB PHY drivers built in.

## USB host correction

- Corrects the QSDK IPQ5332 DWC3 consumer name from `ubs2-phy` to the Linux
  6.6 name `usb2-phy`; `usb3-phy` is unchanged.
- Packages the Qualcomm M31 USB 2.0 PHY and IPQ UniPHY USB 3.0 PHY as modules
  and loads them after the core USB controller modules. This avoids putting the
  previously unvalidated PHY probe in the early boot-critical path.
- Includes USB mass storage, UAS, common storage adapters and USB printer
  support.
- Includes block hotplug/automount, DiskMan, ext4, exFAT, FAT, NTFS3 and Btrfs,
  Samba 4 sharing, SFTP, disk idle management, partitioning and SMART tools.
- Removing a drive or replacing it with another supported USB device is handled
  by the normal kernel and hotplug paths; a router reboot is not required.

The withdrawn v40 image enabled both PHY drivers in the boot path before their
binding had been validated and failed to boot. v42 does not reuse that setup.

## LuCI physical-port correction

- Fixes the `be6500.ports factory yields invalid constructor` error by exporting
  the physical-port widget as a LuCI `baseclass` instance.
- Keeps LAN1-LAN3 as live QCA8386 port cards on Network > Interfaces > Devices.
  It does not create fake Linux `lan1`-`lan3` devices or duplicate the existing
  Switch/VLAN page.
- Port roles, IPTV and game-port policy remain under Router Settings > Port
  Settings, matching the factory control split.

## Image verification

- The DTB extracted from the final sysupgrade FIT contains
  `phy-names = "usb2-phy", "usb3-phy"` and both PHY phandles.
- The final SquashFS contains `phy-qcom-m31.ko`, `phy-qca-uniphy.ko` and
  `/etc/modules.d/85-usb-phy-ipq5018`, together with the storage and printer UI.
- The full project suite passes all 147 tests.
- Profile variant is
  `6.6 v81 corrected USB2/USB3 PHY binding and LuCI port fix`.
- Sysupgrade SHA-256 is
  `700f6364e7df40dc232c9b9f311a0c5a304238cd79246e08cfc3fdf9a5dbce86`.

Verify the image against `SHA256SUMS` before use. Compilation, FIT/DTB and
root-filesystem contents have been verified; physical USB enumeration still
requires a boot test on the router, so this image is not described as
hardware-validated yet. The currently working v41 installation is not modified
by publishing this release.

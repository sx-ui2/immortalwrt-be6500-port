# BE6500 USB PHY and physical LAN port display v40

This build fixes the two regressions observed after flashing v39: USB host
hardware did not probe, and LuCI's interface device page did not show the
physical LAN sockets.

## USB host fix

- Builds the IPQ5332 M31 USB 2.0 PHY and UniPHY USB 3.0 PHY drivers directly
  into the kernel.
- Keeps the DWC3 controller and both USB PHY nodes enabled in the final DTB.
- Retains USB storage, UAS, printer, block hotplug, DiskMan, filesystem,
  Samba, SFTP, idle and SMART packages from v39.
- Removing a drive clears its kernel/block state; inserting a supported USB
  device is detected again without rebooting the router.

The v39 DTB already enabled the controller, but its two board-specific PHY
drivers were explicitly disabled in the kernel configuration. This build
corrects that missing driver layer.

## LAN1-LAN3 device display

- Supports the minified LuCI network asset shipped in release images, which
  was the reason the v39 source patch did not appear after flashing.
- Adds live LAN1, LAN2 and LAN3 physical-port cards to Network > Interfaces >
  Devices, including link state and negotiated speed.
- Reads the real QCA8386 switch-port state: LAN1 is physical port 3, LAN2 is
  port 2, and LAN3 is port 1.
- Keeps the hardware model truthful: these sockets remain QCA8386 switch
  ports behind `eth1`, rather than fake independent Linux netdevs.
- Port roles, IPTV VLAN/priority and game-port policy remain on the dedicated
  Router Settings port page; VLAN membership remains on the existing Switch
  page.

The LuCI patch is revalidated at boot and only refreshes LuCI asset caches. It
does not restart netifd, the switch or Wi-Fi.

## Validation

- Final kernel config contains `CONFIG_PHY_QCOM_M31_USB=y` and
  `CONFIG_PHY_IPQ_UNIPHY_USB=y`.
- Final `vmlinux` contains both M31 and QCA UniPHY USB driver init/probe
  symbols.
- Final root filesystem contains the physical-port module and enabled
  `be6500-luci-patches` boot service.
- `luci-app-rejected-clients` release is 39; profile variant is
  `6.6 v78 physical ports and USB PHY`.
- The complete project test suite passes all 141 tests.

Verify the sysupgrade image against `SHA256SUMS` before flashing. Actual USB
enumeration and hotplug should be confirmed once this build is running on the
router.

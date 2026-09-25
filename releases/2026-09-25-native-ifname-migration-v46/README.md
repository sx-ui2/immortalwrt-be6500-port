# BE6500 v46 — native network `ifname` migration

This release fixes the LuCI **Network ifname configuration migration** modal
seen after upgrading while preserving an older `/etc/config/network`.

The previous workaround tried to remove the modal from generated LuCI
JavaScript without converting the saved configuration. It was fragile and
could still leave the router using deprecated fields. v46 removes that UI
workaround and performs the same native conversion LuCI requests:

- legacy bridge interfaces become a `device` section with bridge `ports`;
- bridge-device `ifname` values become `ports`;
- ordinary interface `ifname` values become `device`;
- valid parent-device `ifname` values on macvlan and 802.1Q devices are left
  unchanged.

The migration commits UCI only. It never calls `network restart`,
`network reload` or `wifi reload`, so installing the hotfix package does not
drop the current connection. On a preserved-config firmware upgrade it runs
before netifd's normal startup.

## Existing v45 installation

Install `be6500-current-config_10_all.ipk` in **System > Software**. Its
post-install action migrates the saved network configuration immediately
without restarting the running network. Reload the browser page after the
package installation; the migration modal should be gone.

## Full firmware images

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-squashfs-sysupgrade.bin`
  is for **System > Backup / Flash Firmware** in a running ImmortalWrt/OpenWrt
  installation. Do not select **Force upgrade** if validation fails.
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-ubootkit-factory.bin` is only
  for the **uBootKit Firmware Update** page. Do not upload the sysupgrade tar
  to uBootKit.
- `luci-app-rejected-clients_43_all.ipk` is the unchanged v45 LuCI package for
  the physical LAN-port and storage-status fixes.

## Verification

- The migration was exercised with the target ARM UCI implementation against
  legacy bridge, ordinary interface, bridge-device and macvlan cases.
- The final SquashFS contains current-config package release 10, the migration
  helper and its first-boot hook; the old JavaScript-suppression hook is absent.
- The LAN port injection remains exactly `1/1/1` for dependency, load and
  renderer.
- Kernel Image SHA-256 remains the boot-confirmed v41 value
  `c178f8503543ceb9fd8a2ab02209a8976091fa7661acad31362d28c5da430173`.
- Selected DTB SHA-256 remains the boot-confirmed v41 value
  `ea0f9168ba9cb14d512a265ba214a6d1cfd464c767f3d872201ed5209334c61a`.
- Sysupgrade metadata identifies `jdcloud,be6500` and carries a 516-byte build
  signature. The uBootKit image has a byte-identical kernel, SquashFS at
  `0x700000`, and the `DEADC0DE` trailer.
- All 153 project tests pass and `git diff --check` passes.

No router was automatically flashed while producing this release.

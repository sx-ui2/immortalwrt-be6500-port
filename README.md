# JDCloud BE6500 ImmortalWrt port

This tree carries an experimental board-specific overlay for the JDCloud
ZhaoYun BE6500. A successful build does not establish hardware bootability.

## Current status (2026-09-12)

The current 24.10/QSDK-based sysupgrade image is running on the JDCloud BE6500
with all three radios active. The deployed build includes the board-specific
dual/tri-band mode handling, ACS/DFS startup recovery, automatic-channel save
logic, synchronized multi-colour LED blinking, LuCI customizations and the
hostapd pre-created-interface fix.

The hostapd fix avoids issuing a duplicate `NL80211_CMD_NEW_INTERFACE` for the
VAP that netifd creates while attaching the QSDK pdev/radio mask. Post-upgrade
validation showed `radio0`, `radio1` and `radio2` up, all APs reaching
`AP-ENABLED`, and no `Failed to create interface ... -23` messages.

Firmware images, runtime configuration, device backups and extracted reference
root filesystems are intentionally excluded from Git. This repository contains
the source overlays, patches and reproducible build inputs only.

## Pinned sources

- ImmortalWrt branch: `openwrt-24.10`
- ImmortalWrt source commit: `99ca94091f673607bdcb92ba1f93bda1e811fc93`
- ImmortalWrt userspace branch: `openwrt-24.10`
- Effective external kernel: Qualcomm QSDK 14 Linux `6.6.116` (runtime release
  `6.6.116+`)
- Qualcomm QSDK release: `NHSS.QSDK.14.0.r9-00040-O`
- QSDK external kernel commit: `16f31b0750888769b5418c1f32f2cd385b09972d`
- QSDK external kernel version: `6.6.116`
- QSDK kernel-files commit: `e313f14614d5be6f7ee23251b45cb8944f11a03d`
- QSDK NSS-DP commit: `22555a9fce967f21f4772495844a5c2e0d501a95`
- QSDK QCA-SSDK commit: `717b74016b0c131575bcd81b9e039d3f7974b02a`
- QSDK qca-wifi-oss commit: `ee42324119f1d389bf125e8a36c3d9c9bc6299c2`
- QSDK wlan-open commit: `cc4cc0e38e4cd169220dd8c54165dcf43f9fea71`
- QSDK wlan-open feed commit: `1ee3a4ab7c59ceaff347c4668fc6c7604a04c323`
- QSDK wlan-open extensions commit: `c69fefae1eb16d0434caf5fd10ff41e37836a959`

The first build used the QSDK 14 Linux 6.6.116 external tree. It
does not reuse any Linux 5.4 kernel module. OEM WIFIFW/ART/factory contents are
used only as firmware, board data and calibration data.

## Historical build result (not a usable board image)

The clean build completed successfully on 2026-08-29. The resulting FIT image
identifies its kernel as `Linux-6.6.116`; all packaged kernel modules install to
`/lib/modules/6.6.116+`. The manifest includes the QSDK 14 QCA-SSDK, NSS-PPE,
NSS-DP and NSS-PHY packages, generic ath11k/ath12k drivers, OEM wireless
firmware, firewall4 and nftables. No artifact under the target output contains
the obsolete `6.6.151` label.

This proves that the selected sources can be compiled together; it does not
prove that the BE6500 board description or its radios can start. The working
5.4 stack calls the external radio `QCN9224_PCI1`, but the endpoint itself is
observed as Qualcomm PCI `17cb:1109`; both ImmortalWrt ath12k and pinned QSDK
wlan-open bind device `0x1109` under the QCN9274 hardware name. The earlier
name-only rejection was therefore wrong and has been removed. PCI matching is
now established. The pinned QSDK source confirms `QCN92XX/hw1.0`, raw API1
`board.bin`, `caldata.bin`, a two-radio QCN9274 profile and the `0x1000`
dual-MAC board-ID mask. A disabled audit candidate maps the observed `b1008`
selection to candidate `qcom,board_id = <0x1008>` without enabling hardware.
This mapping and the legacy `bdwlan.b1008`, `caldata_2.bin` and
`amss_dualmac.bin` files are still not runtime-verified. The full image path
remains blocked until the native board DTS, board data/calibration and
dual-MAC/MLO topology are validated together.

The calibration extraction itself is now reproducible: QWRT's `ap-mi01.6`
preinit path reads eMMC partition `0:ART` at offset `0x58800` for `0x2d000`
bytes. The same slice from the saved 1 MiB ART image is byte-identical to the
saved `caldata_2.bin` (SHA256
`b0d4ac0ec3c938f512a6cba8b364ace7c22689b7d66132d0a29283ac3888276f`).
The target hotplug handler serves that slice only for board
`jdcloud,be6500` and the exact ath12k request
`ath12k/QCN92XX/hw1.0/cal-pci-0001:01:00.0.bin`. This proves the extraction
mapping, not that firmware consumed the calibration successfully or exposed
the dual 5 GHz PHY topology at runtime.

The pinned driver selection chain is now audited as well. It first tries API2
records, then falls back to the fixed API1 filename `board.bin`; it does not
derive a filename from `0x1008`. The packaged `board.bin` therefore contains
the exact saved `bdwlan.b1008`. For the QMI download request, a valid board ID
reported by firmware takes precedence over the DT `qcom,board_id` fallback.
The known working system reported runtime board ID `0xff`, so the candidate DT
`0x1008` must not be described as overriding that value. This source path is
proven, while runtime BDF acceptance remains unproven.

The second external 5 GHz radio is also firmware-driven. QCN9274 HW2.0 has
`max_radios = 2` but `def_num_link = 0`; the driver assigns the count from the
QMI PHY-capability response and WMI creates one pdev per advertised PHY. The
required runtime acceptance criterion is therefore QMI `num_phy=2` followed by
two WMI pdevs. A UI option or a second DTS node cannot substitute for it.

QSDK `qca-wifi-oss` is not integrated in this milestone. Its public r9 checkout
is only `component_dev` and lacks the referenced `cmn_dev`, host-common,
firmware-API headers and top-level integration required to rebuild the QWRT
vendor stack. The separate official r9 `wlan-open` and matching feed are now
pinned and pass a source-level `0x1109` binding audit; that still does not prove
firmware ABI, BDF/calibration or dual-MAC operation. No radio test image is
approved from this build.

## Safety boundary

The historical first image is initramfs-only. Do not repeat its U-Boot test or
regard RAM-only operation as guaranteed recovery. Do not
write HLOS/rootfs/eMMC partitions until Ethernet, all three radios, reboot and
recovery have been verified from RAM.

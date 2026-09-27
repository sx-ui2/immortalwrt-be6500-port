# BE6500 v53 — 可用版原生 USB

这是基于已确认可启动的 v50 正式配置生成的持久化固件。压缩内核主体与 v50
字节一致，只把 USB 设备树切换到 QSDK 14 / Linux 6.6 的原生驱动绑定，
并加入延迟加载和失败自锁保护。

v53 保留 v52 已修正的 sysupgrade 结构：归档 BOARD 与目录固定为运行系统要求的
`jdcloud_be6500`，修复 v51 上传后提示 `Invalid sysupgrade archive` 的问题。

本版还完成以下界面与配置修复：

- 端口功能直接在 WAN、LAN1–LAN3 表格中下拉选择，不再显示下方重复设置块。
- WAN 可与任一 LAN 口互换；交换机端口会自动隔离为 WAN VLAN，原 WAN 口自动加入 LAN。
- 保留物理 eMMC 与系统可写空间汇总，隐藏内部 eMMC 分区明细，只单列外接 USB/NVMe 存储。
- 启动阶段静默迁移旧 `ifname`/网桥配置，不再弹出“网桥配置迁移”对话框，也不会为迁移重启 Wi-Fi。
- 交换机 VLAN 页面中的 VLAN 编号、已标记、未标记等状态已完整汉化。

## 刷写方法

在当前 ImmortalWrt 中打开 **系统 → 备份与升级**，上传：

`immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`

- 固件元数据已明确支持真实板名 `jdcloud,be6500`，不需要勾选“强制更新”。
- 从 v50 或近期同系列固件升级可以保留配置；如果当前配置来自早期失败实验版，
  建议取消“保留配置”。
- 不要把这个 sysupgrade 文件上传到 uBootKit 的“固件更新”页面。若系统已经
  无法进入，请先按 v50 的 README 用 uBootKit **Initramfs** 启动，再在 RAM
  系统的 LuCI 中刷本文件。

## USB 启动逻辑

- 使用 `qcom-m31usb-phy`（`qcom,ipq5332-usb-hsphy`）和 QCA UniPHY 的
  Linux 6.6 原生模块，不再使用旧的自制兼容驱动。
- 两个 PHY 模块没有放入 `/etc/modules.d`，不会在内核早期加载。
- 系统正常启动后才按 QWRT 的顺序加载 DWC3、M31 PHY、UniPHY 和 xHCI。
- 加载前会把进行中标记写入 overlay。若驱动导致重启或掉电，下一次启动会
  自动跳过 USB，避免永久启动循环。

## 使用和排查

启动后执行：

```sh
/usr/sbin/be6500-usb-host status
lsusb
```

正常时第一行应为 `host=ready`。U 盘可在 **网络存储 → 磁盘管理** 中处理，
USB 打印机可在 **网络存储 → USB 打印服务器** 中配置。

如果状态显示 `guard=blocked`，先拔掉异常 USB 设备，然后执行：

```sh
/usr/sbin/be6500-usb-host retry
```

要关闭自动 USB 探测并回到安全启动路径：

```sh
/usr/sbin/be6500-usb-host disable
reboot
```

## 已完成的构建校验

- Linux 6.6.116 完整正式配置构建成功，ECM、Nikki、三频无线及 LuCI 功能均保留。
- sysupgrade 元数据支持 `jdcloud,be6500`，包含可读取的 FIT 内核和 SquashFS。
- 最终 FIT 中的压缩内核成员与可启动 v50 完全一致：
  `c1fc0e65a58ceb4080cd7abbfe44973b83630eda58dfc8908a7a77c587eaa2a1`。
- 最终 DTB 已确认包含新 M31 compatible、USB PHY 供电/时钟、共享 PHY 复用，
  以及正确的 `usb2-phy`、`usb3-phy` 名称。
- 根文件系统包含 `phy-qcom-m31.ko`、`phy-qca-uniphy.ko`、保护服务和管理脚本，
  且不存在 PHY 的早期 autoload 项。

构建与镜像内部校验均已通过；USB 端口的真实枚举结果仍需在 BE6500 实机启动
后由 `status` 和 `lsusb` 确认。

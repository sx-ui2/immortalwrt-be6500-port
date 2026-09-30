# 京东云 BE6500：USB 存储启动修正版 v77

本套件仅适用于 **JDCloud RE-CS-06 / 兆能 BE6500**。v77 完整保留 v76 的
原厂式 5G 引导、QModem 按需运行、USB 网卡与手机共享、4G/5G Modem、
ZeroTier、中文 LuCI、MLO、访问控制及端口功能修复。本版修复 USB PHY 已
成功启动、却在下一次开机被保护脚本误禁用的问题。

## 问题根因与修复

旧版 `be6500-usb-host` 使用不存在的 `/sys/class/usb_host/host*` 判断 xHCI
是否注册。M31 PHY 和 xHCI 实际已经启动，USB 磁盘也能枚举，但脚本等待
20 秒后仍会误判失败，写入 `/overlay/be6500-usb-state/auto-disabled`。之后
每次开机都会跳过 PHY 探测，表现为 U 盘完全不识别。

v77 改为检查 `/sys/bus/usb/devices/usb*` 中属于 IPQ5332 `8a00000` 控制器的
真实根集线器，并加入版本化保护状态迁移：

- 旧版误写的禁用标记只清理并重试一次；
- 迁移版本在探测前落盘，真实崩溃仍会在下一次启动进入阻断状态，不会循环
  重启；
- 成功后写入健康标记，`be6500-usb-host status` 显示 `host=ready`、
  `guard=clear`、`last_probe=ok` 和 `guard_revision=2`；
- 不修改无线、网络、挂载或磁盘内容。

## 固件文件

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  已运行本项目固件时，在 LuCI **系统 → 备份与升级**中使用；
- `be6500-v77-ubootkit-factory.bin`：U-BootKit **固件更新**页面直接使用；
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`：
  全新原厂转换时使用的 RAM 安装系统；
- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：本机型 U-BootKit；
- `install_be6500_uboot.sh`、`prepare_be6500_stock_layout.sh`：带备份和回读
  校验的原厂转换脚本；
- `SHA256SUMS`：发布文件校验值。

## 升级方法

从 v76 或更早的本项目版本升级：进入 **系统 → 备份与升级**，上传 sysupgrade
镜像，可以保留设置，不要勾选“强制更新”。首次启动会自动迁移旧 USB 保护
状态，不需要删除文件或手工运行命令。

使用 U-BootKit 网页时，只上传 `be6500-v77-ubootkit-factory.bin`，不要把
sysupgrade tar 上传到 U-BootKit。写入过程不要断电。

## 验证

- 209 项项目回归测试全部通过；
- `kmod-usb-phy-ipq5018` 构建版本为 `6.6.116-r8`；
- 最终 SquashFS 内脚本与源码 SHA-256 完全一致；
- 在现网路由器热更新后，M31 PHY、UniPHY、xHCI USB 2.0/3.0 根总线均正常
  注册，JMicron USB 3.0 磁盘识别为 `/dev/sda1`，exFAT 自动读写挂载到
  `/mnt/sda1`；全过程未重载 Wi-Fi；
- sysupgrade 内核/rootfs 与 U-BootKit 的 7 MiB HLOS、SquashFS、`DEADC0DE`
  尾标布局均已校验。

## 许可与安全边界

QModem 固定在提交 `c49654efc870f53712ee8e25bf181722eb1466d9`，其许可证见
`QMODEM-LICENSE`。本固件只能用于 JDCloud RE-CS-06 / BE6500；刷写 U-Boot、
GPT 前必须把脚本生成的备份保存到电脑。

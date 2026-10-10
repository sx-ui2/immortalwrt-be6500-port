# 京东云 BE6500：APFS 存储支持版 v79

本套件仅适用于 **JDCloud RE-CS-06 / 兆能 BE6500**。v79 完整保留 v78 的
软件源修复、访问名单导入导出、USB 存储启动修复、QModem、USB 网络共享、
ZeroTier、中文 LuCI、MLO、访问控制和端口功能。本版新增 APFS 移动存储识别
与安全只读挂载，同时保留 NTFS、exFAT、ext4 和 Btrfs 支持。

## APFS 支持范围

- 内置并自动加载固定版本的 Linux APFS 0.3.21 内核模块；
- 普通未加密 APFS 容器可由 `block`/`blkid` 识别 UUID 和文件系统类型；
- APFS 强制以只读方式挂载，可浏览并把文件复制到其他磁盘；
- 未启用上游实验性的 `readwrite` 参数，避免损坏 APFS 容器；
- FileVault 加密 APFS、Fusion Drive 写入和 APFS 格式化不在支持范围内；
- NTFS3 与 exFAT 仍可正常读写，没有被 APFS 模块替换。

如果移动硬盘需要在路由器与 macOS/Windows 之间双向写入，建议使用 exFAT；
APFS 盘适合在本固件上只读共享或把数据复制出来。

## 固件文件

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  已运行本项目固件时，在 LuCI **系统 → 备份与升级**中使用；
- `be6500-v79-ubootkit-factory.bin`：U-BootKit **固件更新**页面直接使用；
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`：
  全新原厂转换时使用的 RAM 安装系统；
- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：本机型 U-BootKit；
- `install_be6500_uboot.sh`、`prepare_be6500_stock_layout.sh`：带备份和回读
  校验的原厂转换脚本；
- `SHA256SUMS`：发布文件校验值。

## 升级方法

从 v78 或更早的本项目版本升级：进入 **系统 → 备份与升级**，上传 sysupgrade
镜像，可以保留设置，不要勾选“强制更新”。

使用 U-BootKit 网页时，只上传 `be6500-v79-ubootkit-factory.bin`，不要把
sysupgrade tar 上传到 U-BootKit。写入过程不要断电。

## 验证

- 214 项项目回归测试全部通过（1 项环境性跳过）；
- APFS 0.3.21 在 QSDK 14 Linux 6.6.116 上完成交叉编译和模块打包；
- 现机已热安装并成功加载 `apfs.ko`，`/proc/filesystems` 已注册 `apfs`；
- macOS 创建的临时 APFS 容器在路由器上被识别、只读挂载并成功读取文件；
- 未显式指定只读时仍以 `ro` 挂载，写入测试被内核拒绝；
- 最终 SquashFS 清单同时包含 APFS、NTFS3、exFAT、ext4 和 Btrfs 模块；
- U-BootKit 的 7 MiB HLOS、SquashFS 与 `DEADC0DE` 尾标布局已校验。

## 许可与安全边界

APFS 模块固定为 `linux-apfs-rw v0.3.21`，按 GPL-2.0-only 发布。该驱动来自
逆向工程，上游明确警告实验性写入可能导致数据损坏，因此本固件只提供只读
访问。本固件只能用于 JDCloud RE-CS-06 / BE6500；刷写 U-Boot、GPT 前必须把
脚本生成的备份保存到电脑。

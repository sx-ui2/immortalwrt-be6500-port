# 京东云 BE6500：非 DFS 快速连接修正版 v82

本套件仅适用于 **JDCloud RE-CS-06 / 兆能 BE6500**。v82 保留 v81 已验证的
内核、ath12k、无线固件和频段引导修复，只调整三频模式下两路 5 GHz 的默认
信道、频宽及对应的 LuCI 保存逻辑。

## 根因与修复

v81 修好了频段引导监听器在 Wi-Fi 重载后仍绑定旧 hostapd 接口的问题，但旧
配置仍把两路 5 GHz 都设为 160 MHz：低频链路使用信道 36/48，高频链路使用
信道 108。两个 160 MHz 信道块都会覆盖 DFS 频谱。每次启动或保存无线配置时，
驱动必须先执行约 60 秒的 CAC；在 CAC 结束前，客户端会反复认证、收不到认证
响应，表现为需要多次点击连接或等待很久。

v82 做了以下调整：

- 三频默认改为低频 5 GHz `信道 48 / EHT80`、高频 5 GHz
  `信道 149 / EHT80`，两路都避开 DFS；
- 三频模式下，页面和后端把两路 5 GHz 的最大频宽限制为 80 MHz；
- 三频模式选择“自动”时，分别落到信道 48 和 149；仍可手动选择 DFS 信道；
- 保留设置升级时，一次性迁移旧的 160 MHz 配置：低频链路降为 80 MHz，
  高段 DFS 链路迁到信道 149 / 80 MHz；手动设置的 20/40/80 MHz 不改；
- 完整保留 v81 的频段引导重绑定逻辑，不重启网络、不改变加密和访问控制。

## 实机验证

- 修复前，两路 5 GHz 都触发 `DFS-CAC-START`，约 60 秒后才能接入；日志中
  可见客户端反复出现 `did not acknowledge authentication response`；
- 实机临时应用信道 48 / 80 MHz 与信道 149 / 80 MHz 后，无线重载从开始到
  AP 就绪约 13 秒，未再出现新的 DFS CAC；
- 客户端在 AP 就绪后 0–8 秒内恢复连接，手机实际接入信道 149；
- 223 项测试通过，1 项按环境跳过；固件元数据、签名、包版本、迁移脚本及
  镜像内默认配置均已核验；
- sysupgrade 的 kernel 成员与 v81 字节完全一致，SHA256 为
  `fc684613c84b0dabb5f9e0afa982acb643b7452f61e205d622cfcf7c4a293827`。

## 固件文件

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  已运行本项目固件时，在 LuCI **系统 → 备份与升级**中使用；
- `be6500-v82-ubootkit-factory.bin`：U-BootKit **固件更新**页面直接使用；
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-initramfs-uImage.itb`：
  全新原厂转换时使用的 RAM 安装系统；
- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：本机型 U-BootKit；
- `install_be6500_uboot.sh`、`prepare_be6500_stock_layout.sh`：带备份和回读
  校验的原厂转换脚本；
- `SHA256SUMS`：发布文件校验值。

## 升级方法

从 v81 或更早的本项目版本升级：进入 **系统 → 备份与升级**，上传 sysupgrade
镜像，可以保留设置，不要勾选“强制更新”。首次启动时会自动迁移旧的三频
160 MHz 配置；已经手动使用 20/40/80 MHz 的配置保持不变。

使用 U-BootKit 网页时，只上传 `be6500-v82-ubootkit-factory.bin`，不要把
sysupgrade 文件上传到 U-BootKit。写入过程不要断电。

## 继承功能

v82 完整继承 v81 的 MLO 客户端修复、保守频段引导、APFS 安全只读、NTFS3、
exFAT、ext4、Btrfs、USB 存储、网络共享、USB 网卡与手机共享、4G/5G Modem、
QModem、ZeroTier、中文 LuCI、访问控制和端口功能。

APFS 模块固定为 `linux-apfs-rw v0.3.21`，仅启用只读访问。本固件只能用于
JDCloud RE-CS-06 / BE6500；刷写 U-Boot、GPT 前必须把脚本生成的备份保存到
电脑。

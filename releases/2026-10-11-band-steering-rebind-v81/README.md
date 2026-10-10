# 京东云 BE6500：频段引导重绑定修正版 v81

本套件仅适用于 **JDCloud RE-CS-06 / 兆能 BE6500**。v81 直接以已经验证的
v80 成品固件为底，只修复 Wi-Fi 重载后频段引导进程仍监听旧 hostapd 接口的
问题。内核、无线驱动、固件、DTS、USB、网络、MLO、访问控制和网络共享配置
均未更换。

## 本版修复

统一 MLO 主 Wi-Fi 重载时，2.4 GHz 链路名称会从启动阶段的临时
`phy*.ap0` 变为正式的 `be6500-mld0_link0`。旧监听器使用 `hostapd_cli -r`
永久重连旧控制接口，导致后续无法继续接收新客户端事件。设备因此反复尝试
连接，并长期停留在 2.4 GHz。

v81 让监听器在 hostapd 控制接口消失后退出当前监听，并每秒重新发现当前
2.4 GHz MLO 链路。修复只重启频段引导辅助服务，不重启 Wi-Fi、不重载网络，
也不会改动主 Wi-Fi 的加密或访问控制。

引导策略仍保持保守：只向明确支持 5 GHz 和 802.11v、且 2.4 GHz 信号不低于
-65 dBm 的非 MLO 客户端发送建议；不会强制断开客户端，弱信号设备仍可留在
2.4 GHz。

## 实机验证

- 修复前：主 Wi-Fi 客户端全部落在 2.4 GHz，日志反复出现未确认认证响应和
  missing ACK，部分设备需要多次尝试、等待 8–25 秒才能连接；
- 仅重启频段引导服务后：监听接口自动切换到 `be6500-mld0_link0`，多台客户端
  正常进入 5 GHz 链路；
- 实测同一台客户端从 2.4 GHz / 103 Mbit/s 切换到 5 GHz / 680 Mbit/s；
- 人工结束一次 action-mode `hostapd_cli` 后，监听器能自动发现正确接口并重新
  启动；
- 9 项频段引导单元测试、Shell 语法检查和固件元数据校验通过；
- v81 sysupgrade 的 kernel 成员与 v80 字节完全相同，SHA256 为
  `fc684613c84b0dabb5f9e0afa982acb643b7452f61e205d622cfcf7c4a293827`。

## 固件文件

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  已运行本项目固件时，在 LuCI **系统 → 备份与升级**中使用；
- `be6500-v81-ubootkit-factory.bin`：U-BootKit **固件更新**页面直接使用；
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`：全新原厂
  转换时使用的 RAM 安装系统；
- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：本机型 U-BootKit；
- `install_be6500_uboot.sh`、`prepare_be6500_stock_layout.sh`：带备份和回读
  校验的原厂转换脚本；
- `SHA256SUMS`：发布文件校验值。

## 升级方法

从 v80 或更早的本项目版本升级：进入 **系统 → 备份与升级**，上传 sysupgrade
镜像，可以保留设置，不要勾选“强制更新”。

使用 U-BootKit 网页时，只上传 `be6500-v81-ubootkit-factory.bin`，不要把
sysupgrade 文件上传到 U-BootKit。写入过程不要断电。

## 继承功能

v81 完整继承 v80 的 APFS 安全只读、NTFS3、exFAT、ext4、Btrfs、USB 存储、
USB 网卡与手机共享、4G/5G Modem、QModem、ZeroTier、中文 LuCI、MLO、访问
控制、端口功能和网络共享页面。

APFS 模块固定为 `linux-apfs-rw v0.3.21`，仅启用只读访问。本固件只能用于
JDCloud RE-CS-06 / BE6500；刷写 U-Boot、GPT 前必须把脚本生成的备份保存到
电脑。

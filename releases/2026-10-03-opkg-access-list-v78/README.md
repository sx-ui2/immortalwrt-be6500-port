# 京东云 BE6500：软件源与访问名单备份修正版 v78

本套件仅适用于 **JDCloud RE-CS-06 / 兆能 BE6500**。v78 完整保留 v77 的
USB 存储启动修复、v76 原厂式 5G 引导，以及 QModem、USB 网络共享、
ZeroTier、中文 LuCI、MLO、访问控制和端口功能。本版修复 `opkg update`
访问不存在的 QModem 软件源，并为访问控制加入名单导入、导出功能。

## 软件源修复

QModem 是随本固件本地构建并内置的 feed，ImmortalWrt 官方服务器没有
`packages/aarch64_cortex-a53/qmodem/Packages.gz`，该地址固定返回 HTTP 404，
导致整个 `opkg update` 以代码 1 结束。

v78 会在首次启动和每次开机时幂等禁用这条无效源，同时保留正常的 `base`、
`luci`、`packages`、`routing`、`telephony` 及 Nikki 软件源。保留配置升级也
会自动修复，不需要恢复出厂设置。

## 访问控制名单导入、导出

访问控制页面新增 **导出名单** 和 **导入名单**：

- JSON 文件同时保存黑名单、白名单、添加顺序、设备名称、当前模式和启用状态；
- 导入时校验文件版本、MAC 格式、重复项、设备数量及文件大小；
- 重复 MAC 保留第一次出现的位置，名单顺序不会被重新排序；
- 导入只写入页面的待保存区，必须检查后点击“保存并应用”；
- 最终应用继续使用运行中的 hostapd ACL 增量更新，不重启 Wi-Fi。

## 固件文件

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  已运行本项目固件时，在 LuCI **系统 → 备份与升级**中使用；
- `be6500-v78-ubootkit-factory.bin`：U-BootKit **固件更新**页面直接使用；
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`：
  全新原厂转换时使用的 RAM 安装系统；
- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：本机型 U-BootKit；
- `install_be6500_uboot.sh`、`prepare_be6500_stock_layout.sh`：带备份和回读
  校验的原厂转换脚本；
- `SHA256SUMS`：发布文件校验值。

## 升级方法

从 v77 或更早的本项目版本升级：进入 **系统 → 备份与升级**，上传 sysupgrade
镜像，可以保留设置，不要勾选“强制更新”。

使用 U-BootKit 网页时，只上传 `be6500-v78-ubootkit-factory.bin`，不要把
sysupgrade tar 上传到 U-BootKit。写入过程不要断电。

## 验证

- 210 项项目回归测试全部通过；
- 现网禁用无效 QModem feed 后，`opkg update` 的全部有效源下载及签名校验
  通过，退出码为 0；
- 名单导入/导出页面已热部署，源码与路由器文件 SHA-256 一致；
- 最终 SquashFS 已核对名单 JSON v1 逻辑、QModem feed 迁移脚本、
  `luci-app-rejected-clients 70` 及 `kmod-usb-phy-ipq5018 6.6.116-r8`；
- U-BootKit 的 7 MiB HLOS、SquashFS 与 `DEADC0DE` 尾标布局已校验。

## 许可与安全边界

QModem 固定在提交 `c49654efc870f53712ee8e25bf181722eb1466d9`，其许可证见
`QMODEM-LICENSE`。本固件只能用于 JDCloud RE-CS-06 / BE6500；刷写 U-Boot、
GPT 前必须把脚本生成的备份保存到电脑。

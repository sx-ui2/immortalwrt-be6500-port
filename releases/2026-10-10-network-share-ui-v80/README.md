# 京东云 BE6500：网络共享管理版 v80

本套件仅适用于 **JDCloud RE-CS-06 / 兆能 BE6500**。v80 完整保留 v79 的
APFS 安全只读支持、USB 存储启动修复、QModem、USB 网络与手机共享、
ZeroTier、中文 LuCI、MLO、访问控制和端口功能。本版在 **路由设置**中新增
完整的 **网络共享** 页面，可直接选择 USB 磁盘文件夹并设置访问账号和密码。

## 网络共享页面

进入 **路由设置 → 网络共享**，可以：

- 从路由器当前已挂载的 USB 磁盘中逐级浏览并选择共享文件夹；
- 新增、修改或删除多个 Samba 共享；
- 为共享设置独立的账号和密码，禁止匿名访问；
- 设置只读或读写；APFS 盘会自动锁定为只读；
- 修改共享时密码留空可保留原密码；
- 删除共享只删除配置，不会删除磁盘中的文件。

页面只允许选择 `/dev/sd*` 对应的 `/mnt/<磁盘>` 路径，并拒绝符号链接和越界
路径。保存或删除时只重启 Samba，不重启 Wi-Fi，也不重载网络。

Windows 访问方法：在文件资源管理器地址栏输入
`\\192.168.31.1\共享名称`（若修改过 LAN 地址，请替换为实际路由器地址），
然后输入页面中设置的共享账号和密码。如果 Windows 缓存了旧凭据，可先在
命令提示符执行 `net use * /delete` 后重新连接。

## 存储格式

- NTFS3、exFAT、ext4 和 Btrfs 可按磁盘实际挂载状态读写；
- 普通未加密 APFS 可识别和共享，但始终强制只读；
- FileVault 加密 APFS、Fusion Drive 写入及 APFS 格式化不在支持范围内；
- 路由器与 macOS/Windows 之间需要双向写入时，建议使用 exFAT。

## 固件文件

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  已运行本项目固件时，在 LuCI **系统 → 备份与升级**中使用；
- `be6500-v80-ubootkit-factory.bin`：U-BootKit **固件更新**页面直接使用；
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`：
  全新原厂转换时使用的 RAM 安装系统；
- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：本机型 U-BootKit；
- `install_be6500_uboot.sh`、`prepare_be6500_stock_layout.sh`：带备份和回读
  校验的原厂转换脚本；
- `SHA256SUMS`：发布文件校验值。

## 升级方法

从 v79 或更早的本项目版本升级：进入 **系统 → 备份与升级**，上传 sysupgrade
镜像，可以保留设置，不要勾选“强制更新”。

使用 U-BootKit 网页时，只上传 `be6500-v80-ubootkit-factory.bin`，不要把
sysupgrade 文件上传到 U-BootKit。写入过程不要断电。

## 验证

- 本版直接以已经验证可用的 v79 sysupgrade 为底，仅替换 LuCI 网络共享页面、
  对应后端并加入最小账号工具，没有重编译或更换内核、无线、USB 和 DTS；
- v80 sysupgrade 中的 kernel 成员与 v79 字节完全相同，SHA256 均为
  `fc684613c84b0dabb5f9e0afa982acb643b7452f61e205d622cfcf7c4a293827`；
- v79 的 initramfs、U-Boot、配置、feeds 和设备 profile 原样保留；
- 最终 manifest 在 v79 清单上只增加 `shadow-common`、`shadow-useradd`，原有
  `be6500-usb-autostart`、`kmod-usb-phy-ipq5018`、`kmod-fs-apfs`、
  `samba4-server` 和 `luci-app-rejected-clients` 均保留；
- 最终 rootfs 已核对 `smbpasswd`、`useradd`、网络共享菜单、后端和页面文件；
- JavaScript、JSON、Lua 5.1 语法、项目回归测试及固件元数据均已校验；
- U-BootKit 镜像的 7 MiB HLOS、SquashFS 与 `DEADC0DE` 尾标布局已校验。

## 许可与安全边界

APFS 模块固定为 `linux-apfs-rw v0.3.21`，按 GPL-2.0-only 发布，且本固件仅
启用只读访问。QModem 固定版本的许可证见 `QMODEM-LICENSE`。本固件只能用于
JDCloud RE-CS-06 / BE6500；刷写 U-Boot、GPT 前必须把脚本生成的备份保存到
电脑。

# BE6500 v56 — uBootKit RAM 恢复套件

这套文件用于路由器当前无法进入 ImmortalWrt、只能进入 uBootKit 的情况。

不要把任何一个文件上传到 uBootKit 的 **固件更新** 页面。该页面会写入原厂
主 HLOS/bootconfig 路径，不能完成本固件要求的 overlay/bootstrap 初始化，之前
生成的单文件直刷包因此会出现校验失败或刷完无法启动。

## 正确刷写顺序

1. 手动进入 uBootKit，打开 **Initramfs** 页面。
2. 上传并启动：

   `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`

   这是已经用于 v50 恢复流程的 RAM 启动 FIT，只在内存中运行，不会自行写入
   eMMC。
3. 等待 RAM 版 ImmortalWrt 启动，然后访问 `http://192.168.1.1/`。
4. 打开 **系统 → 备份与升级**，上传：

   `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`

5. 取消 **保留设置并继续使用当前配置**，不要勾选 **强制更新**，然后执行更新。
6. 写入和首次启动期间不要断电。首次持久启动可能需要几分钟。

不要把 sysupgrade 文件传到 uBootKit，也不要把 initramfs FIT 传到 LuCI 的固件
升级页面。

## 为什么必须分两步

RAM 系统中的 BE6500 专用升级脚本会校验分区布局和镜像，写入 `0:HLOS_1` 与
`rootfs`，创建 `be6500_overlay`/`rootfs_data`，并在校验写入内容后设置匹配的
持久启动环境。uBootKit 的固件更新流程不会执行这些步骤。

## 本套件内容

- RAM 启动镜像：沿用已经验证格式和恢复流程的 v50 initramfs FIT。
- 持久系统镜像：最新 v56 USB native sysupgrade，包含端口状态对齐、IPTV 配置
  修复、USB 驱动/挂载/共享支持及此前所有功能修复。

制作本套件时没有自动连接或刷写任何路由器。刷写前请使用 `SHA256SUMS` 校验
两个文件。

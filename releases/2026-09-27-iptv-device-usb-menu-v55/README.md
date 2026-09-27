# BE6500 v55 — IPTV 现代设备配置与 USB 菜单清理

本版在 v54 基础上修复启用 IPTV 后 LuCI 弹出“网桥配置迁移”的问题，并删除
重复的 USB 设置页面。USB 驱动、自动挂载、磁盘管理、网络共享和打印服务不受影响。

## 本版修复

- IPTV 接口改用现代 `device` 配置，不再写入旧式 `network.iptv.ifname`。
- IPTV 同时绑定上联口和专用口时，自动创建独立的 `br-iptv` 设备及 `ports`
  列表；切回单端口或关闭 IPTV 时自动清理该设备。
- 升级前遗留的 IPTV `ifname` 会在保存 IPTV 设置时删除，因此不会再触发 LuCI
  的“网桥配置迁移”弹窗。
- IPTV 未启用时，端口功能不显示 IPTV 选项；VLAN 模式启用后可选择“IPTV
  专用口”；LAN 接光猫模式会自动锁定所选 LAN 口为“IPTV 上联口”。
- 彻底删除“路由设置 → USB 设备”的菜单、模板路由、页面脚本、页面分发、
  `get_usb_info` 接口及其扫描代码。
- LuCI 静态资源缓存版本升级为 `be6500v55`。

## 刷写方法

在当前 ImmortalWrt 中打开 **系统 → 备份与升级**，上传：

`immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`

- 不需要勾选“强制更新”。
- 这是 sysupgrade 文件，不要上传到 uBootKit 的“固件更新”页面。

## 校验结果

- Linux 6.6.116 完整固件构建成功。
- sysupgrade BOARD 为 `jdcloud_be6500`，支持设备为 `jdcloud,be6500`。
- 镜像内已验证 r47 页面包、IPTV `device`/`br-iptv` 配置、USB 设置代码删除、
  v54 端口角色逻辑和 `be6500v55` 缓存标记。
- 152 项仓库回归测试全部通过。

SHA256：

`456ad22334f7d90de4999dd6afbfd645b2af9fea821cf3ed117bd2aa75a0279a`

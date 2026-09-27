# BE6500 v54 — 四口功能与交换机汉化修复

本版基于可启动的 v53 sysupgrade 结构继续构建，修复端口功能和交换机页面。
USB、ECM、Nikki、三频无线与 v53 的安全启动逻辑均保留。

## 本版修复

- WAN、LAN1、LAN2、LAN3 四个物理口可直接选择互联网（WAN）、局域网（LAN）
  和游戏口；IPTV 未启用时不会显示无效的 IPTV 端口选项。
- IPTV 的接入方式和端口绑定统一放在 IPTV 设置页面。WAN VLAN 模式启用后，
  端口页才开放“IPTV 专用口”；LAN 接光猫模式会把所选 LAN 口自动锁定为
  “IPTV 上联口”，并阻止专用口和上联口选择同一个端口。
- 原 WAN 口改作 LAN、游戏口或 IPTV 时，不再只改下拉框：后端会真实调整
  `eth0` 的 LAN 网桥、IPTV 接口与优先级配置。
- 原 WAN 口改作游戏口时使用独立的 Linux 流量优先级；LAN1–LAN3 仍使用
  QCA8386 硬件 ACL/QoS。
- IPTV 使用原 WAN 口时会自动把 `eth0` 从 `br-lan` 隔离；改回普通 LAN 或
  关闭 IPTV 后会自动恢复。
- 交换机 VLAN 下拉项固定显示为“关闭 / 未标记 / 已标记”，不再受动态英文
  文案或旧浏览器缓存影响。
- LuCI 静态资源缓存版本升级为 `be6500v54`。

为防止远程误操作断网，当前正在承担互联网（WAN）的物理口仍不能直接改成
其他用途。应先把另一个物理口设为“互联网（WAN）”，原 WAN 口随后会自动
变为局域网，再选择游戏口或 IPTV 功能。

## 刷写方法

在当前 ImmortalWrt 中打开 **系统 → 备份与升级**，上传：

`immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`

- 不需要勾选“强制更新”。
- 这是 sysupgrade 文件，不要上传到 uBootKit 的“固件更新”页面。
- 升级完成后浏览器应自动使用 v54 资源；若旧标签页仍显示英文，关闭旧标签页
  后重新打开管理页面。

## 校验结果

- Linux 6.6.116 完整固件构建成功。
- sysupgrade BOARD 为 `jdcloud_be6500`，支持设备为 `jdcloud,be6500`。
- 镜像内已验证 r46 端口后端、按 IPTV 状态动态显示并锁定端口角色、`eth0`
  游戏/IPTV 处理、中文交换机选项和 `be6500v54` 缓存标记。
- 152 项仓库回归测试全部通过。

SHA256：

`2ef707ddafdc2e1e3afa73069e92cc030be09ce6e588c447c99eb15091cc2c32`

# BE6500 v56 — 端口连接状态对齐

本版在 v55 基础上修正端口设置页面的连接状态布局。

## 本版修复

- “连接状态”标题与每行状态内容使用相同的网格列起点。
- 在线圆点、速率和双工状态固定在同一行并左对齐。
- 未连接圆点与“未连接”文字同样在一行并与标题左边线对齐。
- 低速协商告警单独显示在状态主行下方，不影响主状态对齐。
- 外部主题样式和页面内兜底样式同时修正，避免 CSS 优先级再次把状态改回
  居中纵向排列。
- 保留 v55 的 IPTV `device`/`br-iptv` 修复以及 USB 设置页面清理。
- LuCI 静态资源缓存版本升级为 `be6500v56`。

## 刷写方法

在当前 ImmortalWrt 中打开 **系统 → 备份与升级**，上传：

`immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`

- 不需要勾选“强制更新”。
- 这是 sysupgrade 文件，不要上传到 uBootKit 的“固件更新”页面。

## 校验结果

- Linux 6.6.116 完整固件构建成功。
- sysupgrade BOARD 为 `jdcloud_be6500`，支持设备为 `jdcloud,be6500`。
- 镜像内已验证 r48 页面包、状态行结构与两处对齐样式。
- 152 项仓库回归测试全部通过。

SHA256：

`b0e7660cdbebd7d55fb4b91530507fa792d3ff4d7d01d7741a8d4f13b90f54e1`

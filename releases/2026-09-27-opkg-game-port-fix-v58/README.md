# BE6500 v58 — 软件包更新与游戏口硬件优先级修复

本版沿用 v57 已验证的内核、驱动、USB、无线、端口与访问控制功能，只修复 LuCI 软件包更新和游戏口硬件优先级应用路径。

## 本版修复

- 修复 **系统 → 软件包** 执行 `opkg update` 时出现 `SyntaxError: Unexpected end of JSON input`：
  - LuCI 后端现在始终返回完整 JSON，不再因 CGI 被提前终止而给浏览器空响应；
  - uhttpd 软件包操作窗口由 60 秒调整为 300 秒；
  - 单次软件包操作设置 240 秒硬上限，超时后返回明确中文错误；
  - opkg 单个下载连接超时设为 20 秒，避免坏线路长期卡住；
  - 自动禁用官方并未发布、始终返回 404 的 `qualcommax/ipq53xx` 核心源，保留可用的 `aarch64_cortex-a53` 基础、LuCI、软件包、路由与电话源。
- 修复端口设置中 **游戏口硬件优先级应用失败**：
  - QCA8386 的端口映射和 ACL/QoS 命令保持与原厂 `game_accel.sh` 一致；
  - 按原厂行为执行完整硬件配置序列，不再因为 SSDK 对幂等 create/delete 命令返回非零而中途退出；
  - SSDK 异常会写入系统日志，便于真实硬件故障排查，但不会把交换机留在半配置状态。
- LuCI 页面包升级为 `luci-app-rejected-clients r50`，当前配置包升级为 `be6500-current-config r11`。

## 刷写方法

在当前 ImmortalWrt 中打开 **系统 → 备份与升级**，上传：

`immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`

- 不需要勾选“强制更新”。
- 可以按需要选择是否保留配置；即使保留旧配置，启动服务也会重新应用软件源和超时修复。
- 这是 sysupgrade 文件，不要上传到 uBootKit 的“固件更新”页面。

## 校验结果

- 沿用 v57 已验证内核，内核成员 SHA256 保持不变。
- sysupgrade BOARD 为 `jdcloud_be6500`，支持设备为 `jdcloud,be6500`。
- SquashFS 中软件包管理后端、游戏口脚本、uhttpd 配置及 opkg 源均已逐项检查。
- OpenWrt fwtool 元数据与 CRC 已验证。
- 155 项 Python 回归测试、5 项 Lua 行为测试及 JavaScript/shell 语法检查通过。

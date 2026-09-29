# 京东云 BE6500：原厂式 5G 引导修正版 v76

本套件仅适用于 **JDCloud RE-CS-06 / 兆能 BE6500**。v76 完整保留 v75 的
QModem 按需运行、USB 网卡与手机共享、4G/5G Modem、ZeroTier、中文 LuCI、
MLO、访问控制及端口功能修复，本版只新增经过约束的 2.4G → 5G 引导逻辑。

## 原厂逻辑对比

原厂固件使用高通 `lbd`。从原厂根文件系统确认的关键参数为：

- `PreferredSteeringBand=2`：优先 5 GHz；
- `DownlinkRSSIThreshold_W5/W6=-65`：弱信号设备不向 5 GHz 引导；
- `RSSIDiff_EstW5FromW2=-15`、`RSSIDiff_EstW6FromW2=-15`：估算跨频段
  信号时给 5 GHz 留出 15 dB 衰减余量；
- `MaxSteeringTargetCount=1`、`ApplyEstimatedAirTimeOnSteering=1`：三频模式
  分别评估两个 5 GHz，只选择一个目标；
- `BTMForceSteer=0`：不强制客户端离线；
- `SteeringProhibitTime=300`：同一设备进入 300 秒冷却。

原厂静态配置中的 `lbd Enable=0`，由其私有控制面按条件启用；该二进制是
32 位 ARM，不能直接移植到当前 AArch64/6.6 固件。因此 v76 复现它可验证的
核心判断，不移植原厂的临时黑名单状态机。

## v76 的实际行为

- 监听主 Wi-Fi 的 2.4 GHz 关联事件，不轮询无线、不增加持续 CPU 负载；
- 等待 8 秒，让真正的 MLO 客户端先完成多链路关联；
- MLO 客户端、仅支持 2.4 GHz 的客户端、未声明 802.11v BTM 能力的客户端
  全部跳过；
- 只有 2.4 GHz RSSI **不低于 -65 dBm** 时才发送一次可拒绝的 BTM 建议；
- 双频模式只使用当前唯一的 5 GHz；三频模式比较两个 5 GHz 的
  `chan_util_avg`，选择占用更低者，占用相同时优先非 DFS 低频 5 GHz；
- 同一设备 300 秒内不会重复请求；
- 不发送 `disassoc_imminent`，不踢客户端，不写访问控制黑名单。手机认为
  5 GHz 不合适时可以拒绝并继续留在 2.4 GHz。

首次启动迁移会为主 Wi-Fi 打开 802.11k 邻居报告和 802.11v BSS Transition。
保留配置从 v75 升级也会执行该迁移，不需要手工重建 Wi-Fi。

## 固件文件

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  已运行本项目固件时，在 LuCI **系统 → 备份与升级**中使用；
- `be6500-v76-ubootkit-factory.bin`：U-BootKit **固件更新**页面直接使用；
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`：
  全新原厂转换时使用的 RAM 安装系统；
- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：本机型 U-BootKit；
- `install_be6500_uboot.sh`、`prepare_be6500_stock_layout.sh`：带备份和回读
  校验的原厂转换脚本；
- `SHA256SUMS`：发布文件校验值。

## 升级方法

从 v75 或更早本项目版本升级：进入 **系统 → 备份与升级**，上传 sysupgrade
镜像，可以保留设置，不要勾选“强制更新”。

使用 U-BootKit 网页时，只上传 `be6500-v76-ubootkit-factory.bin`，不要把
sysupgrade tar 上传到 U-BootKit。写入过程不要断电。

## 验证

- 208 项项目回归测试全部通过；
- 双频单目标、三频双候选择优、弱信号跳过、2.4G-only 跳过、MLO 跳过、
  300 秒冷却及无强制断线均有自动测试；
- 在三频现网中热部署未重载 Wi-Fi；Redmi Note 11T Pro 通过一次 advisory
  BTM 从 2.4 GHz 切到 5 GHz 后持续在线；
- 最终 SquashFS 已核对服务、迁移文件、`-65 dBm` 门槛和 300 秒冷却；
- sysupgrade 内核/rootfs 与 U-BootKit 的 7 MiB HLOS、SquashFS、`DEADC0DE`
  尾标布局均已校验。

## 许可与安全边界

QModem 固定在提交 `c49654efc870f53712ee8e25bf181722eb1466d9`，其许可证见
`QMODEM-LICENSE`。本固件只能用于 JDCloud RE-CS-06 / BE6500；刷写 U-Boot、
GPT 前必须把脚本生成的备份保存到电脑。

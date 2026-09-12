# BE6500 原生 6.6 板级迁移（核心子集）

此目录是独立开发输入，**不能刷入，也没有在硬件启动验证**。
没有替换现用 QWRT 或 U-Boot；新增的独立 image profile 仅生成 RAM-only
有线诊断 initramfs，不生成 factory 或 sysupgrade 镜像。

`ipq5332-jdcloud-be6500-core.dts` 使用 QSDK 14.0.r9 的原生
`ipq5332.dtsi`。目前迁移 RAM、串口、eMMC、LED 及按键描述，
不靠修改旧 DTB 的 compatible/时钟数字完成迁移。

输入依据：项目根目录 `be6500-qwrt-live.dtb`，SHA256
`00fdcf6a52a4e209a7849ab9995911ea6650a029a4df660398f768b8797d2ea3`。

| 项目 | 采集值 / 处理 |
| --- | --- |
| RAM | 从 0x40000000 开始，长度 0x40000000（1GiB），不改 DDR |
| 串口 | 0x078af000，GPIO18/19；从新 SoC include 获得时钟和中断 |
| eMMC | 0x07804000，4bit，192MHz 上限，DDR/HS200 1.8V；GPIO8–13 |
| LED | 红24、绿33、蓝49，均 active-high；不指定诊断闪烁模式 |
| 按键 | soc 子节点描述31/32，root 另有 WPS35；冲突未核实，保持禁用 |
| XO / sleep | 24MHz / 32kHz，与采集值一致 |
| 保留内存 | 保留采集 DTB 所有启用的固定区间；同时保留新 SoC 的 bootloader/SBL 区间；不启用旧射频固件 |

## 有意未启用

网口、PHY、PCIe、无线、USB 及相关安全/卸载驱动没有冒充已移植。
例如实机旧树 `phy-reset-gpio = <... 51 0>`，RDP468 为 GPIO51 active-low。
当前 SSDK 的确只取编号并按固定 0→1 输出；但 6.6 的 `mdio-ipq4019`
还会通过 gpiod 读取极性。网口候选因此使用 active-low，让新驱动实际
执行低电平复位、高电平释放，而不是机械复制旧标志位。
实机 `dp1` 为 MAC id2、PHY地址4，`dp2` 为 MAC id1、switch-connected；
还需追踪新 SSDK/NSS-DP 接口与 LAN/WAN 物理口映射。

不引入原厂无线 reserved-memory 到新驱动绑定：目前仅避免内存被复用，
remoteproc 的 memory-region 被移除，所有 CNSS 无线节点保持 disabled。
完整无线栈、新固件协议/板号、三频行为仍待验证。
已确认但尚未启用的 PCIe/QCN9224 连接关系见
[RADIO-TOPOLOGY.md](RADIO-TOPOLOGY.md)。

`ipq5332-jdcloud-be6500-radio-audit.dts` 进一步把这些关系写成默认禁用的
静态候选：PCIe1 x2、GPIO47 active-low、QRTR node 0x31、本机 host DDR / MLO
保留区、动态 9MiB MHI 池、集成无线 board ID 0x16，以及用于审计的
`qcom,board_id = <0x1008>` / ART 偏移 `0x58800`。PCIe PHY、控制器、MHI、
动态池和所有 Wi-Fi 节点均保持 `disabled`，因此它不能启动或验证三频。

## 版本与验证边界

- Linux 提交：`16f31b0750888769b5418c1f32f2cd385b09972d`（6.6.116+）。
- QSDK 文件提交：`e313f14614d5be6f7ee23251b45cb8944f11a03d`。
- `ipq5332.dtsi` SHA256：`c8f0caf601173228ef17bd0d79409b5245e0b80872a832a219a6bcee463da3b1`。
- GCC 头文件 SHA256：`1c481f9d5ff6dd52f436bb8a8d9a6c35b6d3bc62b883ccc031cc3f6bfe5eeb12`。

DTC/静态核验只能验证结构及指定板级事实，不是完整 dt-schema 校验，
也不能证明固件启动、看门狗恢复、GPIO 电平、存储读取或无线/网口可用。
整机 preflight 仍须阻止旧设备树与未完成的厂商无线方案被误打包。

## 本轮验证结果

2026-08-31 在 Lima AArch64 编译机执行 `compile.sh`，DTC 成功，
`check_native_core.py` 的 63 项属性核对及 11 段固定内存检查通过。
DTB SHA256：`28d8e07feafe69e0284a14e0654f87938e9e4217c3669fbef5dcf8c677a4b65b`。
产物、JSON 结果及未隐藏的 DTC 警告位于 `artifacts/`。
警告包括继承的 QSDK SoC 描述中的地址单元、保留节点及调度器子节点，
不能表述为“零警告”或“完整绑定验证通过”；完整 dt-schema 尚未运行。

## 网口开发候选

`ipq5332-jdcloud-be6500-ethernet.dts` 是独立的、有强制阻断标记的网口
候选，并未替换整机 DTS。它依据实机树确认：NSS-DP id2 接 PHY 地址4；
id1 以 2.5Gbps 连接 QCA8386，后者提供三个 LAN 端口。外部交换机采用
QSDK 6.6 已提供的 QCA8386 DSA + `qca_8021q` 路径，SSDK 保留对应
serdes/PHY 描述；EDMA 队列和中断使用同一 pinned release 的 MHT 配置。

静态核对包括205项核心与网口属性，并有旧时钟、错误 PHY、错误 MAC id、
错误复位极性、错误 DSA tag、遗漏 MHT ring 等反例。NSS-DP、QCA8K、
MDIO 三个驱动也能从干净源码副本对 ARM64 6.6.116+ 重新编译。

工作 QWRT 的 `/etc/board.d/02_network` 已证明：WAN MAC 来自 eMMC
`factory` 分区偏移 `0x0`，LAN MAC 为其加一。相同规则已加入新端口的
DSA 网络默认脚本，并拒绝全零值；这只是源码路径核对，尚未在 6.6 系统
读取实机分区。镜像 profile 也已显式加入 `kmod-dsa-qca8k`，避免只编出
模块却漏装进镜像。物理插孔顺序和实机流量仍未验证，因此仍不可刷；
只允许打包为明确标记的 RAM-only 诊断 initramfs。

2026-08-31 修正版候选的 205 项静态检查通过，DTB SHA256 为
`7dcb43f12e629a48226f6b7b864e5fcefd49c77733b7638e83f6d3cfc010bd6b`。
DTC 保留 84 行警告（包括 pinned QSDK SoC 源和官方风格 SSDK 子节点），
不是完整 schema 通过。干净重建的三个模块均为 ELF64/AArch64，vermagic
为 `6.6.116+`；哈希与构建日志保存在 `artifacts/`。

## 射频审计候选

2026-09-01 使用 pinned QSDK 14 r9 源编译默认禁用的射频候选，233 项
核心、网口和射频映射检查通过，DTB SHA256 为
`2899dc00e0d91f8ef284c18068368a51d127d193ef0a101ad1111106be9c9fb4`。
检查明确拒绝复制参考板 `0x1019`、把旧 CNSS DT 值 `0x02` 当作 ath12k
双 MAC 选择、编造第二颗 PCIe 无线设备、错用校准偏移或提前启用 PCIe/MHI。
结果仍固定输出 `ath12k_board_data_verified=false`、
`dual_mac_mlo_verified=false`、`boot_validated=false` 和
`flashable=false`。

保存的 QWRT 启动日志已确认旧 5.4 厂商栈在单颗外置芯片上注册两个 5GHz
pdev：`wifi1/phy0` 为 4910–5330 MHz，`wifi2/phy1` 为 5490–5835 MHz；
启动链同时出现 `amss_dualmac.bin`、`bdwlan.b1008` 和 `caldata_2.bin`。
这证明本机硬件与旧栈的三频能力，不代表目标 6.6 ath12k 已验证。新栈仍须
在受控运行中报告 QMI `num_phy=2` 并由 WMI 建立两个外置 pdev，才可把上述
两个 false 改为 true。

## 独立有线诊断 initramfs

2026-09-01 新增 `jdcloud_be6500_wired_initramfs` 独立 profile，用于把原生
6.6 板级与网口候选装入只在 RAM 中运行的诊断 FIT。该 profile 禁用 PCIe、
WCSS、无线、USB 和 OEM 无线固件，只保留 DSA/QCA8K、NSS-DP、NSS-PPE 与
QCA-SSDK 有线候选；它明确不生成 factory 或 sysupgrade 镜像。

清理并备份旧构建根文件系统后，ImmortalWrt 24.10-SNAPSHOT 完整重建成功。
最终清单包含 193 个软件包，并确认没有 ath11k、ath12k、hostapd、wpad、
wireless-regdb 或 BE6500 OEM 无线固件。FIT 大小为 11,977,420 字节，SHA256
为 `6f5b58fabc6446d81dfd39c23c32ce84a0dd4c7e7c3349f8c1223b03c06d5064`；
正式 OpenWrt 构建 DTB 的 SHA256 为
`8d5503f2b6710a09b6cbab886e3272bee8c7f1c72ff33d1fc07cdc36d2c853bb`。

正式构建 DTB 已通过 217 项属性与 11 段固定内存检查，工具测试共 107 项
通过。审计记录见 `artifacts/wired-initramfs-build-audit.json`。首轮 RAM
启动随后确认 Linux 6.6.116+ 能够启动、eMMC 可枚举，且连接主路由的
NSS-DP 链路能以 2.5Gbps 工作；永久 `bootcmd` 已恢复为 `bootipq`，设备也
已回到 QWRT 5.4。运行证据位于
`artifacts/runtime-20260901-first-boot/`。

首轮运行同时确认该镜像仍不具备部署条件：`MDIO_IPQ4019` 被子目标配置成
模块但没有进入镜像，使 QCA8386/DSA 未完成枚举；旧 profile 还带入自动挂载、
USB 存储包，并误用了不存在的 `mtd_get_mac_binary_mmc`，因此没有应用工厂
MAC。源码已分别改为内建 MDIO、排除这些诊断无关包，并调用
`mmc_get_mac_binary`。

第二版于 2026-09-02 完成干净重建。实际内核配置确认
`CONFIG_MDIO_IPQ4019=y`；清单保留 DSA/QCA8K、NSS-DP、NSS-PPE 和
QCA-SSDK，并把软件包数从 193 减至 176。`automount`、`block-mount`、
`losetup`、USB 存储与所有无线组件均不在镜像内。第二版 FIT 大小为
11,644,036 字节，SHA256 为
`0dff0e263269be843765dc03f0bdee2862c92d9cf6bbf7dc67ff42ba71bcc62c`；
DTB 再次通过 217 项属性和 11 段固定内存检查，109 项工具测试通过。审计
记录见 `artifacts/wired-initramfs-v2-build-audit.json`。第二版尚未完成 RAM
启动验证，因此物理插孔顺序、独立 WAN、工厂 MAC 和射频仍未验证，
`flashable=false`。

在 Linux 编译环境复现（脚本只在新的 `/tmp` 子目录生成 DTB，不打包镜像）：

```sh
bash native-6.6/compile.sh /absolute/qsdk-linux-6.6 /absolute/aarch64-openwrt-linux-musl-cpp core
bash native-6.6/compile.sh /absolute/qsdk-linux-6.6 /absolute/aarch64-openwrt-linux-musl-cpp ethernet
bash native-6.6/compile.sh /absolute/qsdk-linux-6.6 /absolute/aarch64-openwrt-linux-musl-cpp radio
bash native-6.6/compile.sh /absolute/qsdk-linux-6.6 /absolute/aarch64-openwrt-linux-musl-cpp wired-initramfs
python3 tools/check_native_core.py native-6.6/artifacts/core.static-only.dtb
python3 tools/check_native_ethernet.py native-6.6/artifacts/ethernet.static-only.dtb
python3 tools/check_native_radio.py native-6.6/artifacts/radio.static-only.dtb
python3 tools/check_native_wired_initramfs.py native-6.6/artifacts/wired-initramfs-openwrt-build.dtb
python3 -m unittest discover -s tools -p 'test_*.py' -v
```

测试包含故意换回旧 UART/eMMC 时钟、错用 512MB、错误 LED GPIO、
保留内存重叠/越界及意外启用无线等反例。核心候选若误放入整机构建，
preflight 会因 `core-only-not-boot-validated` 标记拒绝执行。

# BE6500 新内核迁移核查 — 2026-09-01

## 后续实作进展

已增加独立的 [原生 6.6 核心与网口板级候选](native-6.6/README.md)，
在 AArch64 编译机完成 DTC 编译。核心候选通过 63 项属性核对；网口候选
通过 205 项核心/网口核对；新增的射频审计候选通过 233 项属性核对，
包含 NSS-DP、QCA8386 DSA/SSDK、MHT EDMA 以及保持禁用的 PCIe/MHI 映射。
三者均有强制阻断标记；**不是新的可刷固件**。
旧整机入口仍保持拦截，没有把“核心候选编译通过”当作完整迁移完成。

已取得并固定 [官方 r9 manifest](source-manifests/README.md)，
核实五项既有源码 pin 一致，以及 `qca-wifi-oss` 仅为 component_dev 的
实际安装位置。完整厂商无线主树缺项仍未解决；没有自动改变无线方案。
本轮未连接路由器、改配置、重启或刷写。

## 当前结论

尚未得到可验证启动、可刷写的 ARM64 新内核固件。本次只检查本机镜像、
源码及 Lima 编译机，并修改本地构建输入；没有连接目标路由器、改其配置、
重启或写入任何分区。

“QWRT 能刷入”和“QWRT 的 5.4 驱动能直接运行在 6.6”是两个不同结论。
用户提供的刷机目录包含 U-Boot、GPT 调整说明和 QWRT 成品镜像，所检查
文件没有提供针对新内核重建完整无线驱动的源码入口。
[QWRT 作者发布说明](https://www.right.com.cn/forum/thread-8389740-1-1.html)
也描述了刷入、恢复与分区操作；这些步骤本身不能证明驱动已经适配 6.6。

下列是已证实的输入问题，不是对历次黑屏/失联原因的猜测。没有串口日志，
不能认定某一条就是所有失败镜像的唯一启动故障。过去另有 native-rdp468
设备树试验，不能把它们与复用旧 DTB 的试验混为一谈。

## 1. 设备树用了旧的 SoC 绑定

当前构建入口 `../scripts/resume-immortalwrt-be6500-build.sh` 会把本目录的
`target/linux/qualcommax/files/arch/arm64/boot/dts/qcom/ipq5332-jdcloud-be6500.dts`
复制进 QSDK 6.6 外部内核树。这个文件是含数字 phandle 的旧设备树，
不是按 6.6 绑定写成的 BE6500 板级源文件。

| 项目 | 已工作的 QWRT 5.4 / 旧头文件 | 当前 QSDK 6.6 源码 |
| --- | --- | --- |
| GCC compatible | `qcom,gcc-ipq5332` | `qcom,ipq5332-gcc` |
| UART1 APPS 时钟 ID | 18 (`0x12`) | 21 (`0x15`) |
| BLSP1 AHB 时钟 ID | 7 (`0x07`) | 10 (`0x0a`) |
| SDCC1 AHB 时钟 ID | 123 (`0x7b`) | 113 (`0x71`) |
| SDCC1 APPS 时钟 ID | 124 (`0x7c`) | 114 (`0x72`) |

证据位置：

- 旧头文件：`../third_party/qsdk-12.5/qca/src/linux-5.4/include/dt-bindings/clock/qcom,gcc-ipq5332.h`
- 新头文件（Lima）：`/home/nara0318.guest/src/qsdk14-r9/linux-ipq-6.6/include/dt-bindings/clock/qcom,ipq5332-gcc.h`
- 新驱动：同内核的 `drivers/clk/qcom/gcc-ipq5332.c`，匹配表使用新 compatible。
- 已采集的 `../be6500-qwrt-live.dtb`，串口 `clocks = <6 0x12 6 7>`，
  且 phandle 6 对应旧 GCC 节点。

只改 compatible 字符串仍会留下错误时钟 ID。需要从匹配版本的
`ipq5332.dtsi` 重建板级描述，按实机证据迁移 GPIO、eMMC、PHY、PCIe、
内存保留区和无线板号；不能直接采用另一台 BE6500 或高通参考板的接线。

已采集 QWRT DTB 的 memory reg 为 `<0 0x40000000 0 0x40000000>`，
描述的物理内存是 **1 GiB**；本次没有修改它或更换 DDR 参数。

## 2. 原厂/QWRT 模块不是当前新内核模块

| 实际检查文件 | ELF 架构 | vermagic 内核版本 |
| --- | --- | --- |
| 原厂 `umac.ko` | ELF32 ARM (machine 40) | 5.4.213 |
| QWRT `umac.ko` | ELF64 AArch64 (machine 183) | 5.4.213 |
| 目标内核 | ELF64 AArch64 | 6.6.116+ |

原厂文件在 `../be6500-oem-full-rootfs/lib/modules/5.4.213/`；
QWRT 文件在 `../be6500-qwrt-extract/factory_squashfs_0_7340032_root/lib/modules/5.4.213/`。

ARM32 原厂模块与 ARM64 目标首先就不兼容。QWRT 模块虽然同为 ARM64，
仍是 5.4 的已编译模块。不能靠改名、改 vermagic 或改目录完成升级。
Linux 不承诺稳定的内核内部二进制接口，架构、内核配置及数据结构都涉及
兼容性，见 [Linux 驱动接口说明](https://docs.kernel.org/process/stable-api-nonsense.html)。

可研究复用的是射频固件、板级数据与本机校准数据，前提是目标驱动支持其
格式/协议且选对板型。它们不是运行于 Linux 内核中的 `.ko`。

## 3. 完整 QSDK 无线源码/构建入口缺失

Lima 的 `/home/nara0318.guest/src/qsdk14-r9/target-ipq/profiles/qsdk.mk`
明确区分：

- `WIFI_OPEN_PKGS`：ath11k、ath12k 等开放驱动组合。
- `WIFI_PKGS`：`kmod-qca-wifi-unified-profile` 及 QCA hostap、工具和脚本。

当前 `initramfs.config` / image profile 使用前者，不能称为已经移植了
QWRT 那套完整无线驱动。此前仅根据旧树 `qcom,cnss-qcn9224` 名称，认为
ath12k 的 QCN9274 (`0x1109`) 入口不匹配，这是错误的：实机工作系统的
`lspci` 与启动日志都明确显示外置射频为 Qualcomm `17cb:1109`，rev 01，
CNSS 日志也显示 `device_id : 0x1109`。因此 PCI 身份与 ath12k 的 `0x1109`
入口是匹配的，旧驱动名和新驱动硬件名不能用来代替数值 PCI 证据。

工作系统同时提供了下一层必须保留的板级事实：启动参数
`cnss2.bdf_pci1=0x1008`，实际加载 `qcn9224/bdwlan.b1008`、
`qcn9224/caldata_2.bin` 与 `qcn9224/amss_dualmac.bin`。目标能力日志给出的
运行时 board id 又是 `0xff`，与旧 DT 的 `qcom,board_id = 0x02` 不是同一
字段，不能混用。当前阻断点已经改为：如何为目标 ath12k/QSDK wlan-open
正确提供 BDF/校准，以及是否能保持双 MAC/MLO，而不是“不存在 PCI 入口”。

当前 qca-wifi-oss 检出提交为
`ee42324119f1d389bf125e8a36c3d9c9bc6299c2`，包含组件目录，但没有顶层
Makefile；官方 r9 manifest 将它安装到 `qca-wifi/component_dev`。它的
Kbuild 明确引用不存在的 `cmn_dev`、host-common、fw hardware headers 和
相邻 component_dev 路径；在已检查的 QSDK 目录中没有这些完整依赖树。
`feed-qca` 目录只有 `.git`，`git rev-parse --verify HEAD` 失败。

同一官方 r9 manifest 中还存在独立的开放驱动源码
`oss/src/mac80211/wlan-open`（提交
`cc4cc0e38e4cd169220dd8c54165dcf43f9fea71`）及其 feed
`oss/system/feeds/wlan-open`（提交
`1ee3a4ab7c59ceaff347c4668fc6c7604a04c323`）。两者已按 manifest 固定，
源码审计确认 `0x1109` PCI 表、QCN9274 HW1/HW2 参数及 MLO 路径存在。
这使它成为下一步首选开放驱动候选，但仍需核验内核/backports 接口、固件
协议、BDF/校准和双 MAC；通过静态源码审计不等于能启动射频。

进一步通过 CodeLinaro 的公开项目 API 检查了 QSDK 无线仓库：
[qca-wifi-oss 对应发布树](https://git.codelinaro.org/clo/qsdk/wifi/qca-wifi-oss/-/tree/NHSS.QSDK.14.0.r9-00040-O)
仍是上述组件树；名为
[qca-wifi-host-cmn 的仓库](https://git.codelinaro.org/clo/qsdk/platform/vendor/qcom-opensource/wlan/qca-wifi-host-cmn/-/tree/NHSS.QSDK.14.0.r9-00040-O)
在此次 API 查询中，同一发布标签也返回相同提交和组件目录，不能仅凭仓库名
认定已补全依赖。所查询旧 qca-wifi/qca-wifi-11.0 feed 未返回这个 14.0
发布标签。以上是已检查入口的结果，不是声称网上不存在完整可用源码。

## 4. 已修正错误的 board-2.bin 打包

原 Makefile 将同一个原厂 `qcn9224/bdwlan.bin` 同时安装为 `board.bin`
和 `board-2.bin`。实际文件以 `01 00 04 04 ...` 开头，不是 API2 容器。
当前 QSDK 内核 `ath12k/hw.h` 要求 API2 魔数 `QCA-ATH12K-BOARD`，
`ath12k/core.c` 在比较失败后返回 `-EINVAL`。

已移除错误的 API2 改名安装。包当前 release 为 3，只在 QSDK 源码要求的
`/lib/firmware/ath12k/QCN92XX/hw1.0/` 提供原始 API1 `board.bin` 映射，
并保留原厂目录；绝不伪造 `board-2.bin`。**这不等于 API1 数据已验证
适配该无线硬件**。后续还要在受控启动中验证总线/芯片/板号、实际
board-data 选择和校准读取路径。
本次没有删除任何已有镜像或固件 blob。

QWRT 对 `ap-mi01.6` 的预启动脚本还给出了可重复验证的校准提取规则：从
eMMC `0:ART`（本机为 `mmcblk0p17`）偏移 `0x58800` 读取 `0x2d000`
字节。对已保存的 1 MiB ART 镜像执行该切片，结果与已保存的
`caldata_2.bin` 逐字节一致，SHA256 为
`b0d4ac0ec3c938f512a6cba8b364ace7c22689b7d66132d0a29283ac3888276f`。
新端口只在板名 `jdcloud,be6500` 且固件请求精确为
`ath12k/QCN92XX/hw1.0/cal-pci-0001:01:00.0.bin` 时，通过
`caldata_extract_mmc "0:ART" 0x58800 0x2d000` 提供数据。只读提取器和
hotplug 审计均已加入测试。该结果证明偏移、长度和请求路径，不证明射频
固件在实机运行时成功采用了校准。

pinned ath12k 的 BDF 选择链也已加入源码审计：驱动先尝试 API2 记录，失败
后固定读取 `QCN92XX/hw1.0/board.bin`，不会根据 `0x1008` 拼接文件名；因此
打包入口把已核对哈希的 `bdwlan.b1008` 作为 API1 `board.bin`。QMI target
capability 若报告有效 board ID，则优先使用该运行时值，只有未报告时才回退
DT 的 `qcom,board_id`；下载请求的 `file_id` 使用最终解析值。工作系统曾
报告运行时 `0xff`，所以不能声称 DT `0x1008` 会覆盖它。静态选择链已经
核对，固件是否在本机接受该 BDF 仍须运行时证据。

第二段外置 5 GHz 同样不能由界面或 DTS 人工补出。QCN9274 HW2.0 参数仅
给出 `max_radios = 2`，但 `def_num_link = 0`；驱动实际把 QMI PHY capability
的 `resp.num_phy` 写入 radio 数量，再按 WMI `phy_id_map` 建立 pdev。因而
最低运行时证据必须包含 QMI `num_phy=2`，以及随后两个 WMI pdev。没有这两
项时只能声明外置芯片有双 radio 上限，不能声明三频已经工作。

旧 QWRT/QSDK 5.4 的运行日志则已经把硬件事实补齐：外置 `soc1` 先加载
`amss_dualmac.bin`、`bdwlan.b1008` 和 `caldata_2.bin`，随后出现
`wifi1/phy0`（4910–5330 MHz）与 `wifi2/phy1`（5490–5835 MHz）。这证明
本机在旧厂商栈下确有两段 5 GHz；新增日志审计会拒绝缺少任一 pdev、频段
范围错误或缺少任一固件输入的记录。该证据不能替代新 6.6 ath12k 的 QMI
`num_phy=2` 与两个 WMI pdev 验证。

## 5. 旧诊断镜像没有“保证自动恢复”

`../be6500-arm64-clean/kernel.fragment` 原来单独请求 `CONFIG_QCOM_WDT=y`，
但最终输出 `/home/nara0318.guest/src/be6500-arm64-min-build/.config` 是
`# CONFIG_WATCHDOG is not set`。init 在 reboot 调用失败后仅无限 pause。
因此“RAM-only”不能被表述成“必定自动回到 QWRT”。旧诊断 README 已纠正。

本次在源 fragment 补上 `CONFIG_WATCHDOG=y` 前置选项，但没有重建诊断
镜像，更没有验证看门狗/复位驱动在这块板上的实际工作情况。
旧镜像的配置和校验和没有改变，仍不得重复试启动。

## 6. 当前检查及验收边界

```sh
python3 -m unittest discover -s immortalwrt-be6500-port/tools -p 'test_*.py' -v
python3 immortalwrt-be6500-port/tools/preflight.py --require-vendor-wifi
bash -n scripts/resume-immortalwrt-be6500-build.sh
```

初轮 17 项回归测试通过；后续加入原生核心、网口、射频审计候选、镜像
驱动依赖、出厂 MAC 默认值、manifest、无线 PCI 证据与板级数据阻断测试，
当前共 100 项。
真实整机输入的 preflight **应该返回 1**，
因为旧设备树和无线 profile 仍未迁移完成；当前会同时明确报告旧 GCC
binding、缺少原生 6.6 SoC base，以及尚未验证的 BDF 选择、校准运行时采用
与双 MAC/MLO。
检查也已用两个真实 umac.ko
验证，能分别识别位宽/内核版本错误。构建入口在任何 SSH/复制前运行它。
它只拦截已知错误，不是通用 DT schema/模块 ABI/无线固件校验器。

继续工作的验收顺序：

1. 补齐明确来源和版本的厂商无线源树，验证构建入口、依赖与 ARM64 支持。
2. 用新内核原生 SoC 描述迁移本机板级信息，检查 DT schema、时钟/复位、
   reserved-memory、eMMC、网口和两段 5GHz 的实际驱动模式支持。
3. 得到能区分 bootloader、内核早期、外设初始化和 userspace 阶段的日志。
   当前没有这项证据，不能把失联直接归咎于内存、端口或 U-Boot。
4. 所需输入与恢复路径验证后，再另行进行明确授权的硬件测试。
   编译成功、FIT 可解析或 U-Boot 接收上传都不算系统启动验收。

## 类似案例的适用范围

[GL-BE6500 社区作者发布帖](https://forum.gl-inet.com/t/gl-be6500-latest-firmware-release-openwrt-25-12-qsdk-6-6-kernel/68750)
给出了 QSDK 6.6/OpenWrt 方案与源代码线索，但它是不同型号的社区测试版，
帖内仍有 VLAN/无线反馈，不能据此承诺京东云本机三频及厂商功能全可用。
[其板级源文件](https://github.com/JiaY-shi/openwrt/blob/gl-be6500/target/linux/qualcommbe/dts/ipq5332-gl-be6500.dts)
使用新内核的 SoC include 并单独描述 GPIO/存储等板级差异，而不是把旧
扁平 DTB 原样当成新内核适配。只参考这个移植方法，不使用其成品镜像。

## 7. 网口候选的新增证据与剩余边界

实机 QWRT DTB 与同发布版 QSDK 参考板共同确认：NSS-DP id2 接 PHY4，
id1 以 2.5Gbps 接 QCA8386，外部交换机提供三个 LAN PHY。候选采用 QSDK
14 r9 内核已包含的 `qca,qca8386` DSA 驱动和 `qca_8021q` tag，同时保留
SSDK 内部 MPPE/外部 MHT 描述。GPIO51 在旧 SSDK 中仅按编号执行低→高；
6.6 MDIO 驱动会读取 GPIO 极性，因此候选明确写 active-low，以保持实际
的低电平复位、高电平释放。

干净源码副本已分别重建 NSS-DP、QCA8K 和 MDIO 模块；三者均为
ELF64/AArch64，vermagic `6.6.116+`。证据在
`native-6.6/artifacts/module-summary.txt` 及对应构建日志。发现 image
profile 原本漏了 `kmod-dsa-qca8k`，现已显式加入；preflight 新增回归检查，
防止再次出现“模块能编译但镜像不包含”的情况。

工作 QWRT 的 `02_network` 明确从 eMMC `factory` 分区偏移 `0x0` 读取 WAN
MAC，并将 WAN+1 作为 LAN MAC。新端口已复用这条规则并拒绝全零值；没有
从参考板编造 MAC。该读取尚未在 6.6 实机启动验证。物理插孔到 lan1/2/3
的顺序、链路协商、收发、NSS/PPE 卸载和恢复路径也均未验证。

修正版网口 DTB SHA256：
`7dcb43f12e629a48226f6b7b864e5fcefd49c77733b7638e83f6d3cfc010bd6b`。
DTC 有 84 行保留警告，不能称为完整 dt-schema 通过。静态结果明确为
`boot_validated=false`、`flashable=false`。

## 输入指纹

```text
QWRT live DTB:
00fdcf6a52a4e209a7849ab9995911ea6650a029a4df660398f768b8797d2ea3
OEM ARM32 umac.ko:
306438d5e01bb7893ae990eef1331da0712c36db846bb36991f52b64eeff5c22
QWRT ARM64 umac.ko:
86fdf66efd68c0cc7a74bab82e2fdbdb0436a42ea981dad1253e04e0597d697d
OEM QCN9224 bdwlan.bin:
62cadce1afe2ec3fb5e77133cd78f346df807803d695bd3488631054559c6022
```

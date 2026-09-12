# BE6500 射频/PCIe 拓扑证据（仅映射，不启用）

本文件记录从已工作的 QWRT DTB 和 pinned QSDK 14 r9 源码得到的静态事实。
它不授权生成或刷入无线镜像；核心与网口候选仍将所有 PCIe/CNSS 节点保持
`disabled`。

## 实机旧树

输入：项目根目录 `be6500-qwrt-live.dtb`，SHA256
`00fdcf6a52a4e209a7849ab9995911ea6650a029a4df660398f768b8797d2ea3`。

| 项目 | 实机值 |
| --- | --- |
| SoC 集成无线 | `/soc/wifi@c0000000`，`qcom,board_id = 0x16`，启用 |
| 唯一启用的 PCIe 控制器 | `/soc/pcie@18000000`，domain 1，2 lanes |
| PCIe PERST | GPIO47，active-low |
| PCIe MHI/QRTR | endpoint `qcom,mhi@1`，node id `0x31` |
| 外置无线 | `/soc/wifi2@f00000`，QCN9224，QRTR `0x31`，board id `0x02` |
| 实际 PCI 枚举 | Qualcomm `17cb:1109`，revision `01` |
| 旧系统 BDF 选择 | 启动参数 `cnss2.bdf_pci1=0x1008`，加载 `bdwlan.b1008` |
| 旧系统校准 | `qcn9224/caldata_2.bin` |
| 旧系统固件 | `qcn9224/amss_dualmac.bin` |
| 外置无线固定内存 | `0x51e00000 + 0x03200000` |
| MLO 固定内存 | `0x4db00000 + 0x01100000` |
| 其他 PCIe | `0x10000000` 和 `0x20000000` 均禁用 |
| 其他 QCN9224 节点 | `wifi1@f00000` 禁用 |

这证明本机不是靠两个已启用 PCIe 插槽提供两个 5GHz。旧树只启用一颗
QCN9224，原厂/QWRT 固件目录又包含 `Data_dualmac.msc`。已保存的实际启动
日志进一步确认旧 5.4/QWRT 栈在同一 `soc1` 下注册了两个 pdev：`wifi1`
（PHY0，4910–5330 MHz）和 `wifi2`（PHY1，5490–5835 MHz）。所以本机原有
三频确实是 2.4GHz 加两段独立 5GHz，而不是管理页虚构出来的第三频段。
这仍不能证明新 ath12k 会以同样方式暴露两个 5GHz PHY，也不能把旧频段
范围硬编码成新固件的运行结果。

## 与 QSDK 14 参考板的关系

同发布版 `ipq5332-rdp468.dts` 也使用 PCIe1 x2、GPIO47 active-low 和
QCN9224/MHI/MLO 组合，说明所需的新内核控制器、MHI 与 QRTR 基础代码存在。
但参考板使用不同的 board id（`0x1019`）、内存布局和启动参数；这些值不能
复制到本机。旧 CNSS 节点的 `board_id = 0x02` 仅作为旧树事实保留，不能
拿来替代新 ath12k/MHI 的双 MAC 选择。pinned QSDK 的 MHI 源码表明
`qcom,board_id` 的 `0x1000` 位会选择 `amss_dualmac.bin`；结合实机
`bdf_pci1=0x1008`，当前禁用候选使用 `0x1008` 供审计，但仍标为未验证。

当前 6.6 构建配置已包含 PCI、QCOM PCIe、MHI、QRTR/QRTR-MHI 以及 ath12k
软件包选择。它只表示依赖可构建，不表示 QCN9224 双 MAC、原厂 BDF、MLO
协议或三频工作已验证。厂商完整无线源树仍不完整，因此本阶段不创建启用
射频的板级 DTS。

## 驱动栈核对结果

对工作系统硬件探针和 ImmortalWrt 24.10 已展开的 `backports-6.12.96`
重新交叉核对后，外置射频的实际 PCI 身份是 `17cb:1109`；ath12k 正好为
`0x1109` 登记 QCN9274 HW1/HW2 参数。旧 CNSS 日志虽把它称为 QCN9224，
但也报告 `tgt 0x1109` 和 `device_id : 0x1109`。所以“名称不同即驱动不
支持”的旧结论不成立，预检已经改为按实际 PCI ID 判断。

PCI 匹配只是第一层。旧系统依靠 `bdf_pci1=0x1008` 选择
`qcn9224/bdwlan.b1008`，另加载 `caldata_2.bin` 和
`amss_dualmac.bin`；这些文件不能直接改名成 ath12k API2 `board-2.bin`。
QSDK ath12k 源码确认 QCN9274 HW2.0 使用 `QCN92XX/hw1.0`、256KiB board
窗口、128KiB cal offset、最多两颗 radio，并支持 MLO。PCI 校准查找顺序为
总线专用 `cal-<bus>-<dev>.bin` 后回退 `caldata.bin`；它不会把旧
`caldata_2.bin` 名称自动当作 PCI 回退。固件包因此只创建源码支持的 API1
`board.bin` 映射，不创建假 API2。目标驱动能否在本机实际选择相同板级
数据、校准并注册两个外置 5GHz PHY，仍未验证。

`ipq5332-jdcloud-be6500-radio-audit.dts` 已把 PCIe1 x2、GPIO47、QRTR 0x31、
本机 host DDR/MLO、候选 `0x1008` 和 `0x58800` 校准偏移写成强制禁用的
静态映射。233 项检查通过只说明这些证据没有被参考板值覆盖；它不启用
PCIe/MHI，也不证明第二个 5GHz 已出现。

## 已验证的 ART 校准提取路径

QWRT 的 `/lib/preinit/81_load_wifi_board_bin` 会调用
`/lib/read_caldata_to_fs.sh`。其中 `ap-mi01.1*|ap-mi01.4*|ap-mi01.6*`
分支从 `0:ART` 读取本机外置射频数据：偏移 `0x58800`、长度
`0x2d000`。本机 `0:ART` 对应 eMMC 分区 17；从已保存的
`mmcblk0p17.img` 提取的结果与 `caldata_2.bin` 逐字节一致，SHA256 为
`b0d4ac0ec3c938f512a6cba8b364ace7c22689b7d66132d0a29283ac3888276f`。

QSDK ath12k 的固件目录是 `ath12k/QCN92XX/hw1.0`，PCI 校准请求先使用
总线专用名称。按实机 domain/bus/device/function，目标请求精确为
`ath12k/QCN92XX/hw1.0/cal-pci-0001:01:00.0.bin`。新端口的 firmware
hotplug 仅在 `board_name=jdcloud,be6500` 且请求路径完全匹配时调用
`caldata_extract_mmc "0:ART" 0x58800 0x2d000`，不会响应其他板型或总线。
`tools/extract_qcn92xx_caldata.py` 默认只审计，只有显式给出输出路径时才写
本地文件。以上仍是静态映射证据，不是射频运行成功证明。

## API1 BDF 与运行时 board ID 的区别

pinned ath12k 的 `ath12k_core_fetch_bdf()` 先搜索 API2 `board-2.bin` 记录，
失败后调用 `ath12k_core_fetch_board_data_api_1(...,
ATH12K_DEFAULT_BOARD_FILE)`，即固定读取 `QCN92XX/hw1.0/board.bin`。
所以 `0x1008` 不会参与 API1 文件名拼接；目标包把哈希已核对的
`bdwlan.b1008` 映射为该 `board.bin`。

`ath12k_qmi_request_target_cap()` 对 board ID 的优先级是：固件 target
capability 的有效 `resp.board_info.board_id`，其次才是 DT
`qcom,board_id`，最后为默认值。BDF QMI 下载的 `file_id` 使用这个最终的
`ab->qmi.target.board_id`。工作系统记录的运行时值为 `0xff`；禁用审计 DTS
中的 `0x1008` 主要用于 MHI dual-MAC 固件选择候选，不能写成会覆盖有效
QMI 返回值。上述路径已经由源码审计测试覆盖，但仍未证明目标固件接受
`bdwlan.b1008` 或注册两个 5 GHz PHY。

## 第二个 5 GHz 的运行时判据

旧系统的判据已经满足：日志先启动 `qcn9224/amss_dualmac.bin`，下载
`bdwlan.b1008` 与 `caldata_2.bin`，随后分别建立 `wifi1/phy0` 和
`wifi2/phy1`。`tools/qcn92xx_firmware_audit.py --legacy-log ...` 会同时核对
这三项输入和两个 pdev 的频段范围。该结论只属于旧 QWRT/QSDK 5.4 栈。

QCN9274 HW2.0 的驱动参数为 `max_radios = 2`、`def_num_link = 0`。这表示
“最多两个”不是“默认两个”：`ath12k_qmi_phy_cap_send()` 必须从固件收到
有效 `resp.num_phy`，并把它写入 `ab->qmi.num_radios`；若请求失败，默认值
仍是 0。随后 WMI 根据 `phy_id_map` 逐个增加 `soc->num_radios` 并建立 pdev。
因此未来受控启动的验收日志必须同时证明 QMI `num_phy=2` 和两个 WMI pdev。
仅设置 dual-MAC board ID、加载 `amss_dualmac.bin`、引用旧系统已经出现的
`wifi1/wifi2`，或在管理页展示三频，都不足以通过新 6.6 栈的验收。
目标日志可以交给 `tools/qcn92xx_firmware_audit.py --ath12k-log ...` 审计；
它还会拒绝 PHY capability 回退、BDF 下载失败、board-data 获取失败和校准
加载失败。QMI 明细属于调试日志，受控测试时必须预先确保该日志级别可见。
当前 pinned 驱动中 QMI 为 bit 6、WMI 为 bit 1，合计启动参数为
`ath12k.debug_mask=0x42`。`tools/capture_ath12k_runtime.sh` 只读输出模块参数、
PCI、固件哈希、注册 PHY 与相关 dmesg；它不会更改接口、无线或防火墙。

pinned QSDK 14 r9 的 `qca-wifi-oss` 明确含有 `TARGET_TYPE_QCN9224`、
QCN9224 monitor 头路径以及 MLO 代码，但发布清单把该仓库定位为
`qca-wifi/component_dev`。当前公开检出中没有其 Kbuild 引用的 `cmn_dev`、
`host-cmn`、`fw-api`/硬件头和顶层集成文件，所以它不是一棵可独立编译的
完整厂商 Wi-Fi 驱动。旧 5.4 的 `ipq_cnss2.ko`、`qca_ol.ko`、
`wifi_3_0.ko` 又带有 `5.4.213` vermagic，不能装入 6.6 内核。

同一官方 r9 manifest 的独立 `wlan-open` 源码和 feed 已按精确提交固定。
它们包含 `0x1109` PCI 入口、QCN9274 HW1/HW2 参数及 MLO 代码，实际源码
审计通过。这是比残缺 `qca-wifi-oss/component_dev` 更完整的开放候选，
但通过审计只说明源代码存在必要入口，不证明本机 BDF/校准或双 MAC可用。

预检不再按 QCN9224/QCN9274 名称硬阻断，而是读取结构化硬件证据：必须
确认实机 PCI ID 位于所选驱动表中，并单独检查 BDF/校准与双 MAC/MLO。
当前 `0x1109` 身份检查已通过，后两项仍为 false，因此整机镜像继续阻断。

## 启用前的最低证据

1. 为目标驱动建立可审计的 `b1008` BDF 与 `caldata_2.bin` 选择/转换方案。
2. 确认 PCI `17cb:1109` 在该驱动/固件组合下实际注册几个 PHY，以及各 PHY
   的 5GHz 频段范围，而不是在界面层虚构第二个 5GHz。
3. 核对 MHI、MLO、host DDR、caldb 与 pageable 内存的绑定和非重叠。
4. 有串口日志和不写 eMMC 的受控启动方案后，才讨论硬件枚举测试。

以上条件未满足前，`boot_validated=false`、`flashable=false`。

# 京东云 BE6500：全新原厂固件转 ImmortalWrt v61

本套件对应 **JDCloud RE-CS-06 / 兆能 BE6500**，包含经过哈希固定的
uBootKit、RAM 安装系统和最终持久系统。RAM 镜像只承担安装与救援工作；完成
sysupgrade 后运行的是 eMMC 上的持久 ImmortalWrt，不是“临时系统”。

## v61 修复内容

- 恢复黑白名单的无断网修改：仅同步设备名称、手动改名或调整名单顺序时，保存后
  不再改写无线 UCI，也不再调用 hostapd；只有名单成员、黑白名单模式或启用状态
  真正变化时才增量更新运行中的 ACL。
- 修复无线设备长期显示为 `2.4G`：优先采用每个实际无线接口的工作频率，再使用
  QSDK/MLO 接口名兜底，避免 MLO partner 名称中的主链路编号覆盖真实 5 GHz 频段。
- 首屏无线识别改为读取本机 `iw station dump`，不再在快速路径调用会逐客户端读取
  驱动计数的 `hostapd.get_clients()`；名单添加框和设备列表可以先显示，SSID、指纹、
  类型与厂商继续在后台补全。
- 约 2 秒一次的实时速率刷新只读取 DHCP 租约、邻居表和静态主机映射，不再触发
  全量无线扫描，因此不会与设备详情识别互相阻塞。
- 移除设备识别路径对外部 `timeout` 命令的依赖，改用 ubus 自带超时。此前设备上
  缺少该 applet 时，所有逐 BSS 查询都会失败并退回主 2.4G 聚合结果。

## v60 已包含的修复

- 黑白名单的“选择设备添加”不再等待完整无线识别。快速接口通过 hostapd ubus
  直接取得当前已关联 MAC，设备名称从 DHCP/UCI 立即同步；SSID、频段、指纹、
  类型与厂商只在后台补全。
- 访问控制首屏只等待名单和无线在线设备；拒绝历史独立加载，不再阻塞名单显示
  和添加设备下拉框。
- 保留 v59 的设备列表渐进加载、约 2 秒实时速率刷新与软件包管理器 timeout
  修复。

## v59 已包含的修复

- 设备列表、黑白名单和拒绝记录先读取 DHCP 租约、邻居表、UCI 名单及已保存名称
  并立即显示；无线频段、SSID、厂商和类型在后台补全，不再长时间停在“正在读取”。
- 实时速率恢复约每 2 秒刷新，但改用独立轻量接口，只读取 conntrack 计数；完整
  无线识别改为上一轮结束后 15 秒刷新，不会再用无线扫描阻塞速率显示。
- `hostapd_cli`、`iwinfo` 和主机提示查询均有独立超时，且不会在 hostapd 已返回
  数据后重复扫描全部无线接口。
- 修复软件包管理器 `timeout: applet not found`：镜像显式包含
  `coreutils-timeout`，更新命令使用 `/usr/bin/timeout`，保证 `opkg update`
  真正执行并始终返回完整 JSON。

## 文件说明

- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：上游
  `uboot-qsdk12.5-build` 的 JDCloud BE6500 专用 uBootKit。文件实际为 ARM ELF，
  上游说明包含原厂固件解析修复。
- `install_be6500_uboot.sh`：严格校验文件、eMMC 容量和两个 APPSBL 槽，先备份，
  得到明确确认词后才写入并回读校验。
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`：
  uBootKit **Initramfs** 页面使用的 RAM 安装/救援镜像。
- `prepare_be6500_stock_layout.sh`：在 RAM 系统中备份并校验原厂 GPT，然后利用
  eMMC 尾部空闲区域建立 `be6500_overlay`。不会移动或覆盖原厂 firmware、
  factory、plugin、log、swap 分区。
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  最终持久系统，只在 RAM ImmortalWrt 或现有本项目 ImmortalWrt 中刷写。

## 一、全新原厂固件：取得管理 shell

原厂 4.5.2 参考系统包含 `telnetd`，但没有 Dropbear，因此网上把这一步统称为
“解锁 SSH”并不准确：刷 OpenWrt 前取得的是原厂 root shell（串口或已经开启的
Telnet），真正的 SSH/Dropbear 会在 RAM ImmortalWrt 启动后提供。

不同原厂版本的 Web 调试入口并不一致，本项目没有采用未经验证的 Web 漏洞，也
不要套用小米 BE6500/BE6500 Pro 的 SSH 解锁脚本。全新原厂机请通过 3.3V TTL
串口取得 root shell，或者使用该原厂版本已经验证可用的 Telnet 调试入口。4.5.2
参考镜像的 root 密码哈希对应 `admin`。

电脑在本目录启动临时文件服务器：

```sh
python3 -m http.server 8000
```

在原厂 root shell 下载 U-Boot 和安装脚本（把 `电脑IP` 换成实际地址）：

```sh
cd /tmp
wget http://电脑IP:8000/uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin
wget http://电脑IP:8000/install_be6500_uboot.sh
chmod +x install_be6500_uboot.sh
```

## 二、备份并刷入 uBootKit

先只检查和备份，不会写入：

```sh
./install_be6500_uboot.sh check \
  ./uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin \
  /tmp/be6500-uboot-backup
```

必须把 `/tmp/be6500-uboot-backup` 中的两个原厂 APPSBL 备份和 `SHA256SUMS`
保存到电脑。若原厂没有 SSH，可在电脑先监听，再从路由器通过 `nc` 发送；两个
文件分别执行一次：

```sh
# 电脑：
nc -l 9001 > APPSBL-stock.bin
# 路由器：
cat /tmp/be6500-uboot-backup/APPSBL-stock.bin | nc 电脑IP 9001
```

确认电脑已保存备份后才执行写入：

```sh
./install_be6500_uboot.sh apply \
  ./uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin \
  /tmp/be6500-uboot-backup I_HAVE_COPIED_THE_UBOOT_BACKUP
```

只有脚本同时报告两个 APPSBL 槽“写入并回读校验成功”后才能重启。重启时按住
机身按钮，直到指示灯闪烁 3 次后常亮；电脑设为自动获取地址，访问
`http://192.168.1.1/` 进入 uBootKit。

## 三、从 uBootKit 启动 RAM 安装系统

打开 uBootKit 的 **Initramfs** 页面，上传：

`immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`

不要把 sysupgrade 文件上传到 uBootKit 的“固件更新”页面。QWRT 的通用 factory
镜像可以走该路径，但本项目还要建立 111 GiB 持久 overlay、写入备用 HLOS 槽并
做写后校验；这些步骤必须由本项目 RAM 系统中的升级脚本完成。

RAM 系统启动后可访问 `http://192.168.1.1/`，也可以使用真正的 SSH：

```sh
ssh root@192.168.1.1
```

## 四、准备原厂 eMMC 尾部空间

把 `prepare_be6500_stock_layout.sh` 复制到 RAM 系统：

```sh
scp prepare_be6500_stock_layout.sh root@192.168.1.1:/tmp/
ssh root@192.168.1.1 'chmod +x /tmp/prepare_be6500_stock_layout.sh'
```

先校验和备份 GPT，不修改分区：

```sh
ssh root@192.168.1.1 '/tmp/prepare_be6500_stock_layout.sh check /tmp/be6500-gpt-backup'
scp -r root@192.168.1.1:/tmp/be6500-gpt-backup ./
```

确认电脑已保存 `gpt-primary-34sectors.bin`、`gpt-secondary-33sectors.bin` 和
`SHA256SUMS` 后，建立尾部 overlay 分区：

```sh
ssh root@192.168.1.1 '/tmp/prepare_be6500_stock_layout.sh apply /tmp/be6500-gpt-backup I_HAVE_COPIED_THE_GPT_BACKUP'
```

脚本只接受已保存的 RE-CS-06 分区起点、大小、标签和 116.47 GiB eMMC 容量；
任何一项不一致都会在调用 `parted` 前停止。

## 五、刷入最终 ImmortalWrt

在 RAM 系统打开 **系统 → 备份与升级**，上传：

`immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`

取消“保留设置并继续使用当前配置”，不要勾选“强制更新”，确认后开始升级。
过程中不要断电。专用升级脚本会：

1. 再次校验机型、镜像格式、分区起点和容量；
2. 写入并回读验证 `0:HLOS_1` 与 `rootfs`；
3. 格式化并配置 `be6500_overlay`，建立启动所需的 `rootfs_data`；
4. 最后才写入与本镜像匹配的持久启动命令。

首次持久启动需要几分钟。完成后重新访问 `http://192.168.1.1/`。

## 现有本项目 ImmortalWrt 升级

已经运行本项目 v56–v60 且 `be6500_overlay` 正常的设备，不需要重刷 U-Boot，
直接在 LuCI 上传 v61 sysupgrade 即可。为避免历史错误配置干扰，出现过启动或
网络迁移问题的设备建议取消保留配置；主路由升级前仍应下载配置备份。

### 不重刷固件的 r55 临时更新

若当前系统能 SSH，只想立即修复截图中的 `timeout: applet not found` 和设备列表
加载，可把下列 3 个 IPK 复制到 `/tmp`：

- `coreutils_9.7-r1_aarch64_cortex-a53.ipk`
- `coreutils-timeout_9.7-r1_aarch64_cortex-a53.ipk`
- `luci-app-rejected-clients_55_all.ipk`

然后按顺序安装并重启 Web 服务：

```sh
opkg install /tmp/coreutils_9.7-r1_aarch64_cortex-a53.ipk
opkg install /tmp/coreutils-timeout_9.7-r1_aarch64_cortex-a53.ipk
opkg install /tmp/luci-app-rejected-clients_55_all.ipk
/etc/init.d/be6500-luci-patches restart
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

刷新浏览器后，`/usr/bin/timeout --version` 应能正常输出版本。IPK 更新不替代完整
固件升级；首次安装或需要内核、USB、无线修复时仍使用 v61 sysupgrade。

## 安全边界

- 仅适用于 JDCloud RE-CS-06 / BE6500，不能用于小米同名型号。
- 不在通电写入过程中拔电，不跳过脚本的备份和 SHA256 校验。
- 本项目不会自动连接或刷写你的路由器；所有写入都必须由你在目标机上明确执行。
- 若仍能进入 uBootKit，优先使用 Initramfs RAM 启动进行修复，不要盲写 eMMC。

# 京东云 BE6500：访问控制名单即时显示版 v64

本套件仅适用于 **JDCloud RE-CS-06 / 兆能 BE6500**。它同时提供从全新原厂固件
转换到 ImmortalWrt 所需的 uBootKit、RAM 安装镜像、最终持久 sysupgrade 镜像和安装脚本。

## v64 修复内容

- 黑名单、白名单打开后先用一次轻量 ACL 快照读取 UCI、DHCP 租约和邻居表，已保存的
  名称与 MAC 会立即显示，不再等待无线电、SSID、频段、厂商和设备类型扫描完成。
- 在线设备和拒绝记录在名单显示后异步补充；补充结果只更新设备资料，不会清空、覆盖或
  重排正在编辑的名单草稿。
- 快速 ACL 请求不再重复执行无线接口清点，避免同一页面连续扫描三张无线网卡。
- 保存与应用链路保持 v63 已恢复的 v55 行为：每项仍只提交 `name` 和 `mac`，通过运行中
  的 hostapd ACL 增量应用，不执行 `wifi reload`、`network reload` 或网络重启。
- 保留名单添加顺序、“同步名称”和手动修改名称功能，并保留 v61-v63 的频段识别、实时
  速率、USB、端口、IPTV、软件包管理器及 U-BootKit 安装修复。

构建结果通过 **163 项 Python 测试**、全部 Lua 测试、JavaScript 语法检查和完整固件
构建。拆包核验确认最终 rootfs 内安装的是 `luci-app-rejected-clients - 58`，控制器及页面
文件的 SHA256 与本次源码完全一致。

## 文件说明

- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：JDCloud BE6500
  专用 U-BootKit。
- `install_be6500_uboot.sh`：校验、备份并写入两个 APPSBL 槽的受保护脚本。
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`：U-BootKit
  Initramfs 页面使用的 RAM 安装/救援系统。
- `prepare_be6500_stock_layout.sh`：备份和校验 GPT，并在 eMMC 尾部空闲区域建立
  持久 overlay。
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  最终持久系统。
- `luci-app-rejected-clients_58_all.ipk`：只更新管理页面和后端时使用的独立包。
- `SHA256SUMS`：可刷写文件、脚本和安装包的 SHA256。

## 现有本项目 ImmortalWrt 升级

已使用本项目固件且持久 overlay 正常的设备，不需要重新刷 U-Boot。进入
**系统 → 备份与升级**，上传：

`immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`

建议取消“保留设置并继续使用当前配置”，不要勾选“强制更新”。主路由如需保留配置，
请先下载配置备份。升级后先确认系统版本，再测试名单打开与保存。

只测试名单修复时，可以通过 SSH 上传并安装 r58 包：

```sh
opkg install /tmp/luci-app-rejected-clients_58_all.ipk
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

安装 IPK 不会修改内核、USB 驱动或启动镜像；需要完整修复时仍应刷 v64 sysupgrade。

## 全新原厂固件转中文 ImmortalWrt

### 1. 解锁并进入原厂 root shell

原厂 4.5.2 参考系统含 `telnetd` 而没有 Dropbear。刷机前取得的是原厂 root shell，
真正的 SSH 会在 RAM ImmortalWrt 启动后提供。不同原厂版本的调试入口不同，不要套用
小米 BE6500/BE6500 Pro 的脚本。可靠方式是 3.3V TTL 串口，或对应原厂版本已经验证的
Telnet 调试入口。

电脑在本目录启动文件服务器：

```sh
python3 -m http.server 8000
```

在原厂 root shell 下载文件：

```sh
cd /tmp
wget http://电脑IP:8000/uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin
wget http://电脑IP:8000/install_be6500_uboot.sh
chmod +x install_be6500_uboot.sh
```

### 2. 备份并刷入 U-BootKit

先检查和备份，不写入：

```sh
./install_be6500_uboot.sh check \
  ./uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin \
  /tmp/be6500-uboot-backup
```

把 `/tmp/be6500-uboot-backup` 内两个 APPSBL 备份和 `SHA256SUMS` 保存到电脑后再执行：

```sh
./install_be6500_uboot.sh apply \
  ./uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin \
  /tmp/be6500-uboot-backup I_HAVE_COPIED_THE_UBOOT_BACKUP
```

必须看到两个 APPSBL 槽都“写入并回读校验成功”后才能重启。按住机身按钮开机，直到
指示灯闪烁 3 次后常亮；电脑设为自动获取地址，打开 `http://192.168.1.1/`。

### 3. 从 U-BootKit 启动 RAM 系统

在 U-BootKit 的 **Initramfs** 页面上传：

`immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`

不要把 sysupgrade 上传到 U-BootKit 普通“固件更新”页面。本项目需要先建立持久
overlay、写入备用 HLOS 槽并做写后校验，这些工作由 RAM 系统完成。

RAM 系统启动后访问 `http://192.168.1.1/`，SSH 为：

```sh
ssh root@192.168.1.1
```

### 4. 准备 eMMC 持久空间

```sh
scp prepare_be6500_stock_layout.sh root@192.168.1.1:/tmp/
ssh root@192.168.1.1 'chmod +x /tmp/prepare_be6500_stock_layout.sh'
ssh root@192.168.1.1 '/tmp/prepare_be6500_stock_layout.sh check /tmp/be6500-gpt-backup'
scp -r root@192.168.1.1:/tmp/be6500-gpt-backup ./
```

确认电脑已保存 GPT 备份和校验文件后：

```sh
ssh root@192.168.1.1 '/tmp/prepare_be6500_stock_layout.sh apply /tmp/be6500-gpt-backup I_HAVE_COPIED_THE_GPT_BACKUP'
```

### 5. 刷入最终持久系统

在 RAM 系统的 **系统 → 备份与升级** 上传 v64 sysupgrade，取消保留配置，不勾选
强制更新。升级脚本会校验机型和分区、写入并回读验证 HLOS/rootfs、格式化持久
overlay，最后写入与镜像匹配的启动命令。整个过程不要断电。

## 安全边界

- 只能用于 JDCloud RE-CS-06 / BE6500，不能用于小米同名型号。
- U-Boot 和 GPT 写入前必须把备份保存到电脑。
- 不要把 sysupgrade 直接交给 U-BootKit 的普通固件更新页面。
- 本项目不会自动连接或刷写路由器；所有设备写入均由使用者在目标机上执行。

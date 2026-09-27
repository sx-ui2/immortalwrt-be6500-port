# 京东云 BE6500：安全设备保存与 MLO 频段修复版 v67

本套件仅适用于 **JDCloud RE-CS-06 / 兆能 BE6500**。它包含从全新原厂固件转换到
ImmortalWrt 所需的 U-BootKit、RAM 安装镜像、最终持久 sysupgrade 镜像和安装脚本。

## v67 修复内容

- 修复设备编辑器每次保存都无条件重跑设备限速脚本的问题。仅修改设备名或未改任何
  设置时，不再触发 QoS/ECM 重载，避免全网连接短暂中断后看起来像 Wi-Fi 重启。
- 修复后端返回 `net_enable`、前端却读取 `network_enable` 的字段不一致。普通编辑不会再
  把访问权限误判为启用并提交错误的访问控制变更。
- 名称、限速和访问权限只提交实际变化项，并改为串行应用，避免三个系统操作并发执行。
- 后端增加限速配置幂等保护；即使旧浏览器重复提交相同参数，也不会重新应用 QoS。
- 删除访问控制脚本中遗留但未调用的 `wifi reload` 延迟函数，彻底排除该脚本的无线
  重载入口。
- QSDK 的 MLO 聚合接口无法可靠判断客户端实际链路。MLO 开启时不再把所有设备误标
  为 2.4G；页面只显示 SSID，不显示不可信频段。普通非 MLO 和访客网络仍显示真实频段。
- 保留 v66 的主机名优先、快速设备类型/厂商识别、v55 名单热更新、离线设备精简显示、
  实时速率、USB、端口、IPTV 和 U-BootKit 修复。

构建结果通过 **171 项 Python 测试**、Lua/JavaScript/Shell 检查及完整固件构建。
固件清单确认最终 rootfs 内为 `luci-app-rejected-clients - 62`。以上为源码和构建验证；
实际路由器上的无线连续性仍需刷入后验证。

## 文件说明

- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：本机型 U-BootKit。
- `install_be6500_uboot.sh`：备份、校验并写入两个 APPSBL 槽的保护脚本。
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`：RAM 安装系统。
- `prepare_be6500_stock_layout.sh`：备份 GPT 并建立持久 overlay。
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  最终持久系统。
- `luci-app-rejected-clients_62_all.ipk`：仅更新管理页面和后端时使用。
- `SHA256SUMS`：可刷写文件、脚本和安装包的 SHA256。

## 现有本项目 ImmortalWrt 升级

持久 overlay 正常的设备无需重新刷 U-Boot。进入 **系统 → 备份与升级** 上传：

`immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`

建议取消“保留设置并继续使用当前配置”，不要勾选“强制更新”。主路由需要保留配置时，
请先下载配置备份。

只更新设备列表和访问控制页面时，可通过 SSH 安装 r62：

```sh
opkg install /tmp/luci-app-rejected-clients_62_all.ipk
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

浏览器随后执行一次强制刷新，避免继续使用缓存的旧 JavaScript。

## 全新原厂固件转中文 ImmortalWrt

### 1. 进入原厂 root shell

原厂 4.5.2 参考系统含 `telnetd` 而没有 Dropbear。不同原厂版本调试入口不同，不要套用
小米 BE6500/BE6500 Pro 的脚本。可使用 3.3V TTL 串口，或对应原厂版本已验证的
Telnet 调试入口。

电脑在本目录启动文件服务器：

```sh
python3 -m http.server 8000
```

原厂 root shell 下载文件：

```sh
cd /tmp
wget http://电脑IP:8000/uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin
wget http://电脑IP:8000/install_be6500_uboot.sh
chmod +x install_be6500_uboot.sh
```

### 2. 备份并刷入 U-BootKit

先只检查和备份：

```sh
./install_be6500_uboot.sh check \
  ./uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin \
  /tmp/be6500-uboot-backup
```

把备份目录内两个 APPSBL 备份和 `SHA256SUMS` 保存到电脑后再写入：

```sh
./install_be6500_uboot.sh apply \
  ./uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin \
  /tmp/be6500-uboot-backup I_HAVE_COPIED_THE_UBOOT_BACKUP
```

两个 APPSBL 槽都显示“写入并回读校验成功”后才能重启。按住机身按钮开机，直到指示灯
闪烁 3 次后常亮；电脑使用 DHCP，打开 `http://192.168.1.1/`。

### 3. 启动 RAM 系统

在 U-BootKit 的 **Initramfs** 页面上传：

`immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`

不要把 sysupgrade 上传到 U-BootKit 普通“固件更新”页面。RAM 系统启动后可访问
`http://192.168.1.1/`，或使用：

```sh
ssh root@192.168.1.1
```

### 4. 建立持久空间

```sh
scp prepare_be6500_stock_layout.sh root@192.168.1.1:/tmp/
ssh root@192.168.1.1 'chmod +x /tmp/prepare_be6500_stock_layout.sh'
ssh root@192.168.1.1 '/tmp/prepare_be6500_stock_layout.sh check /tmp/be6500-gpt-backup'
scp -r root@192.168.1.1:/tmp/be6500-gpt-backup ./
```

确认 GPT 备份已保存到电脑后：

```sh
ssh root@192.168.1.1 '/tmp/prepare_be6500_stock_layout.sh apply /tmp/be6500-gpt-backup I_HAVE_COPIED_THE_GPT_BACKUP'
```

### 5. 刷入最终系统

在 RAM 系统的 **系统 → 备份与升级** 上传 v67 sysupgrade，取消保留配置且不勾选强制
更新。写入过程中不要断电。

## 安全边界

- 只能用于 JDCloud RE-CS-06 / BE6500，不能用于小米同名型号。
- U-Boot 和 GPT 写入前必须把备份保存到电脑。
- 不要把 sysupgrade 直接交给 U-BootKit 普通固件更新页面。
- 本项目不会自动连接或刷写路由器；所有设备写入均由使用者执行。

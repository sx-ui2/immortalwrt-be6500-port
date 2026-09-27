# 京东云 BE6500：访问控制与 Cloudflare 证书修复版 v69

本套件仅适用于 **JDCloud RE-CS-06 / 兆能 BE6500**。v69 同时更新了管理后端和
QSDK `wpad`，修复加密 Wi-Fi / MLO 下增删黑白名单会让无关设备断线、重新认证很慢的
问题，并修复证书更新错误复用旧 DNS 服务商的问题。

## v69 修复内容

- 对照 `192.168.31.1` 主路由的工作方式，普通名单增删只做 hostapd 运行时 ACL 增量
  更新，不修改 SSID、加密方式或密钥，也不执行 `wifi reload`。
- 为 QSDK hostapd 增加 `ADD_MAC_NODISASSOC` 和 `DEL_MAC_NODISASSOC`。它们更新 ACL
  后不会触发 hostapd 的全站点重新检查，避免 WPA/SAE 客户端集体断开重连。
- 黑名单新增设备、白名单移除设备时，只向本次刚被拒绝的目标 MAC 发送
  `deauthenticate`；MLO 的各 link 控制接口同步同一份 ACL，但不会断开其他设备。
- 只在切换黑名单/白名单模式或整体启停访问控制时执行模式重评估。这类模式变化本身
  会改变所有设备的准入规则，不能按普通单项增删处理。
- 两种可刷版本使用同一套 r64 后端和修补后的 `wpad`：普通 sysupgrade 与
  U-BootKit factory 不再存在代码差异。
- 修复证书“更新”继续读取 acme.sh 旧域名配置的问题。每次申请或手动更新都会重新
  传入当前页面保存的完整域名列表和 `dns_cf`，不会再沿用旧记录中的 DNSPod
  `dns_dp`。手动更新会强制刷新旧的服务商元数据，定时续期仍遵守正常续期窗口。
- 证书机构会随证书记录保存；申请日志按证书隔离，页面会显示当前申请/更新项目的
  日志，避免多张证书互相覆盖日志。

## `nara0318.dpdns.org` 此前为什么失败

域名拼写没有问题。当前 `nara0318.dpdns.org` 已委派给 Cloudflare 名称服务器，但旧的
acme.sh 域名状态仍记录为 DNSPod `dns_dp`。旧页面点击“更新”时调用 `acme.sh --renew`，
它会直接复用这份旧状态，因此 DNSPod API 无法找到可管理的根域并返回
`invalid domain`。v69 不再使用这条更新路径。

刷入后在证书页面选择 **Cloudflare API Token**，重新填入具有该区域 DNS 编辑权限的
Token，然后点击“更新”。Token 只保存在路由器本机，不要放入截图、日志或 GitHub。

构建已通过 Python、Lua、补丁套用和完整固件构建检查。最终 SquashFS rootfs 已解包
验证，包含 `luci-app-rejected-clients - 64`，且其 `/usr/sbin/wpad` 中存在两条
`NODISASSOC` 命令。以上是源码和构建验证；真实设备的无线连续性仍需刷入后实测。

## 文件说明

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  已运行本项目固件时使用的标准升级镜像。
- `be6500-v69-ubootkit-factory.bin`：U-BootKit **固件更新**页面直接使用的 v69 镜像，
  不是 sysupgrade tar。
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`：从全新原厂转换时
  使用的 RAM 安装系统。
- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：本机型 U-BootKit。
- `install_be6500_uboot.sh`：备份、校验并写入两个 APPSBL 槽的保护脚本。
- `prepare_be6500_stock_layout.sh`：RAM 系统中备份 GPT 并建立持久 overlay。
- `luci-app-rejected-clients_64_all.ipk` 与 `wpad-openssl_*.ipk`：仅更新较早版本时使用。
  访问控制修复需要成对安装；证书修复本身位于 r64 页面包中。
- `SHA256SUMS`：所有发布文件的 SHA256。

## 已运行本项目固件的升级方法

进入 **系统 → 备份与升级**，上传 sysupgrade 镜像。建议取消“保留设置并继续使用当前
配置”，不要勾选“强制更新”。需要保留配置时先下载备份。

已经使用 U-BootKit、希望直接从其网页刷入时，进入 U-BootKit 的 **固件更新**页面，
上传 `be6500-v69-ubootkit-factory.bin`。不要把 sysupgrade 文件上传到该页面。

只给 v67 做热更新时，把两个 IPK 复制到 `/tmp` 后执行：

```sh
opkg install --force-reinstall /tmp/wpad-openssl_2025.11.11~8990591d-r2_aarch64_cortex-a53.ipk
opkg install /tmp/luci-app-rejected-clients_64_all.ipk
/etc/init.d/wpad restart
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

安装新 `wpad` 并重启服务时 Wi-Fi 会中断一次；完成后，普通名单增删不再重启 Wi-Fi，
只会断开被新规则拒绝的目标设备。浏览器应强制刷新一次。

## 全新原厂固件转中文 ImmortalWrt

### 1. 取得原厂 root shell

原厂版本的调试入口可能不同。使用对应版本已验证的 SSH/Telnet 解锁方式，或使用
3.3V TTL 串口取得 root shell。不要套用小米同名机型的解锁脚本。

电脑在本目录启动文件服务器：

```sh
python3 -m http.server 8000
```

路由器原厂 root shell 下载 U-Boot 和安装脚本：

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

把 `/tmp/be6500-uboot-backup` 内两个 APPSBL 备份及 `SHA256SUMS` 保存到电脑，再执行：

```sh
./install_be6500_uboot.sh apply \
  ./uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin \
  /tmp/be6500-uboot-backup I_HAVE_COPIED_THE_UBOOT_BACKUP
```

两个槽都显示“写入并回读校验成功”后再重启。按住机身按钮开机，直到指示灯闪烁 3 次
后常亮，电脑使用 DHCP，打开 `http://192.168.1.1/`。

### 3. 启动 RAM 系统并建立持久空间

在 U-BootKit 的 **Initramfs** 页面上传 initramfs ITB。RAM 系统启动后：

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

### 4. 刷入 v69

可在 RAM 系统的 **系统 → 备份与升级**上传 v69 sysupgrade；也可以重新进入 U-BootKit
的 **固件更新**页面上传 `be6500-v69-ubootkit-factory.bin`。写入时不要断电。

## 安全边界

- 仅限 JDCloud RE-CS-06 / BE6500，不能用于小米同名型号。
- U-Boot 与 GPT 写入前必须把备份保存到电脑。
- sysupgrade 与 U-BootKit factory 文件不能混用。
- 本项目不会自动连接或刷写路由器；设备写入由使用者执行。

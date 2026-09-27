# 京东云 BE6500：MLO 无线概况修复版 v70

本套件仅适用于 **JDCloud RE-CS-06 / 兆能 BE6500**。v70 修复 LuCI“网络 → 无线”
在 MLO 模式下把同一个主 SSID、BSSID 和一条链路的运行状态重复显示到 `radio0`、
`radio1`、`radio2` 的问题。v69 的访问控制热更新和 Cloudflare 证书修复全部保留。

## v70 修复内容

- LuCI 仍保留三个物理 radio 行，保证每条链路的配置入口可用；MLO 主网络则按逻辑
  MLD 去重，只显示一次，不再在每个 radio 下重复出现同一个 `TP-LINK_A59A` 和
  `02:BE:65:00:00:01`。
- 非 MLO 访客网络按真实活动 BSSID 区分，避免把确实属于不同 radio 的普通 AP 错误
  合并。
- MLO radio 标题不再把驱动返回的一条聚合链路错误显示成三次相同的“信道 108
  (6.490 GHz) / 747.5 Mbit/s”。MLO 开启时改为明确显示“多链路状态由驱动统一管理”。
- 非 MLO 模式继续使用 LuCI 原来的信道、频率和速率显示，不受这次修复影响。
- 页面补丁会在完整固件、首次启动以及单独安装 r65 IPK 时应用，并更新浏览器缓存
  版本；热更新后不需要重启 Wi-Fi。

最终固件已完成全量编译，并从最终 SquashFS 中读回验证：

- `luci-app-rejected-clients - 65` 已安装；
- `wireless.js` 包含 `be6500MloOverview`、`be6500MloLogicalRow` 和
  `be6500MloRadioStatus` 三项修复；
- 生成后的 JavaScript 已通过 Node.js 语法检查；
- sysupgrade 与 U-BootKit factory 均由同一份 v70 rootfs 生成。

以上是源码和构建验证；真实设备的无线概况仍需刷入后进行最终页面确认。

## 文件说明

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  已运行本项目固件时使用的标准升级镜像。
- `be6500-v70-ubootkit-factory.bin`：U-BootKit **固件更新**页面直接使用的 v70 镜像，
  不是 sysupgrade tar。
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`：从全新原厂转换时
  使用的 RAM 安装系统。
- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：本机型 U-BootKit。
- `install_be6500_uboot.sh`：备份、校验并写入两个 APPSBL 槽的保护脚本。
- `prepare_be6500_stock_layout.sh`：RAM 系统中备份 GPT 并建立持久 overlay。
- `luci-app-rejected-clients_65_all.ipk`：从 v69 热更新无线概况页面时使用。
- `wpad-openssl_*.ipk`：从 v68 或更早版本热更新时，与 r65 页面包配套安装，以同时
  取得 v69 的访问控制不断线修复。
- `SHA256SUMS`：所有发布文件的 SHA256。

## 已运行 v69 的升级方法

完整升级：进入 **系统 → 备份与升级**，上传 sysupgrade 镜像。v69 升级到 v70 可以
保留设置；仍建议先下载配置备份。不要勾选“强制更新”。

只修复当前页面时，把 r65 IPK 复制到路由器 `/tmp` 后执行：

```sh
opkg install /tmp/luci-app-rejected-clients_65_all.ipk
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
```

然后浏览器强制刷新一次。此热更新不执行 `wifi reload`，不会主动断开无线设备。

已经使用 U-BootKit、希望从其网页直接升级时，进入 U-BootKit 的 **固件更新**页面，
上传 `be6500-v70-ubootkit-factory.bin`。不要把 sysupgrade 文件上传到该页面。

## 从 v68 或更早版本热更新

较早版本还缺少 v69 的 hostapd 访问控制命令，需要两个包一起安装：

```sh
opkg install --force-reinstall /tmp/wpad-openssl_2025.11.11.8990591d-r2_aarch64_cortex-a53.ipk
opkg install /tmp/luci-app-rejected-clients_65_all.ipk
/etc/init.d/wpad restart
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
```

重装 `wpad` 并重启服务会让 Wi-Fi 中断一次；之后普通黑白名单增删不会重启 Wi-Fi。

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

### 4. 刷入 v70

可在 RAM 系统的 **系统 → 备份与升级**上传 v70 sysupgrade；也可以重新进入 U-BootKit
的 **固件更新**页面上传 `be6500-v70-ubootkit-factory.bin`。写入时不要断电。

## 安全边界

- 仅限 JDCloud RE-CS-06 / BE6500，不能用于小米同名型号。
- U-Boot 与 GPT 写入前必须把备份保存到电脑。
- sysupgrade 与 U-BootKit factory 文件不能混用。
- 本项目不会自动连接或刷写路由器；设备写入由使用者执行。

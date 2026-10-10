# 京东云 BE6500：非 DFS 快速连接修正版 v83

本套件仅适用于 **JDCloud RE-CS-06 / 兆能 BE6500**。v83 以用户已回退并确认
能够正常分配 IP 的 v81 成品根文件系统为底，只注入非 DFS 快速连接修复。

## v82 问题与处理

v82 的完整重编根文件系统意外缺少 `dnsmasq-full`，因此路由器无法响应 DHCP，
客户端只能生成 `169.254.x.x` 链路本地地址。v82 已撤回，请不要继续使用。

v83 不使用该重编根文件系统。与 v81 的逐文件比较确认，除以下必要内容外，
原有文件和软件包保持一致：

- 默认无线配置：低频 5 GHz 改为信道 48 / 80 MHz，高频 5 GHz 改为
  信道 149 / 80 MHz；
- 新增一次性保留配置迁移脚本；
- 无线页面与后端在三频模式下把两路 5 GHz 限制为 80 MHz，并将自动信道
  分别解析为 48 和 149。

镜像中已再次确认存在 `dnsmasq-full 2.93-r1`、Nikki、Mihomo、USB、QModem、
访问控制与网络共享组件。内核与 v81 完全相同。

## 修复内容

旧三频配置让两路 5 GHz 使用 160 MHz，两个信道块都会跨入 DFS。启动或保存
无线设置后，驱动要先执行约 60 秒 CAC，期间客户端会反复认证但无法完成连接。

v83 使用信道 48 / 80 MHz 与信道 149 / 80 MHz，避免 DFS CAC。保留设置升级
时，只迁移旧的 160 MHz 配置；用户已经设置的 20/40/80 MHz 不会被改动。
手动 DFS 信道仍保留可选。

## 校验结果

- sysupgrade 元数据：`jdcloud,be6500`，检查通过；
- sysupgrade kernel SHA256：
  `fc684613c84b0dabb5f9e0afa982acb643b7452f61e205d622cfcf7c4a293827`，
  与 v81 完全一致；
- `dnsmasq-full 2.93-r1`、`luci-app-nikki 1.26.1-r1`、
  `nikki 2026.04.08-r1`、`mihomo-meta 1.19.31` 均存在；
- 实机临时应用相同信道方案后，无线重载约 13 秒，未出现新的 DFS CAC，
  客户端在 AP 就绪后 0–8 秒内恢复连接；
- 224 项测试通过，1 项按环境跳过。

## 固件文件

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  已运行本项目固件时，在 LuCI **系统 → 备份与升级**中使用；
- `be6500-v83-ubootkit-factory.bin`：U-BootKit **固件更新**页面直接使用；
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`：全新原厂
  转换时使用的 RAM 安装系统；
- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：本机型 U-BootKit；
- `install_be6500_uboot.sh`、`prepare_be6500_stock_layout.sh`：带备份和回读
  校验的原厂转换脚本；
- `SHA256SUMS`：发布文件校验值。

## 升级方法

从 v81 或更早版本升级：进入 **系统 → 备份与升级**，上传 sysupgrade 镜像，
可以保留设置，不要勾选“强制更新”。首次启动会自动迁移旧的三频 160 MHz
配置。

使用 U-BootKit 网页时，只上传 `be6500-v83-ubootkit-factory.bin`，不要把
sysupgrade 文件上传到 U-BootKit。写入过程不要断电。

本固件只能用于 JDCloud RE-CS-06 / BE6500；刷写 U-Boot、GPT 前必须把脚本
生成的备份保存到电脑。

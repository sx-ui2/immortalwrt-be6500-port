# 京东云 BE6500：QModem 按需运行修正版 v75

本套件仅适用于 **JDCloud RE-CS-06 / 兆能 BE6500**。v75 完整保留 v74 的
USB 网卡、手机 USB 网络共享、4G/5G Modem、QModem 短信管理、ZeroTier、
网页终端及此前所有网络、无线和访问控制修复，只调整无蜂窝模组时的后台运行方式。

## 本版修复

对比 QWRT 后确认，QWRT 的旧版 QModem 只在启动或 USB 热插拔时执行一次扫描，
无 Modem 时不会常驻整套管理进程；v74 的 QModem Next 会无条件启动扫描、短信、
AT、LED 等多个后台服务，这就是 v74 相比上一版内存增加、CPU 偶发达到 20%–40%
的主要增量来源。

v75 改为与 QWRT 相同的空闲策略：

- 未插入蜂窝 Modem 时，不启动 `qmodem-settings`、`qmodem-smsd`、
  `ubus-at-daemon`、QModem LED/网络/重启/流量统计及短信转发后台；
- 插入带 `cdc-wdm`、`ttyUSB`、`ttyACM`，或由 `qmi_wwan`、`cdc_mbim`、
  `huawei_cdc_ncm`、`option`、`qcserial` 驱动的真实 Modem 时才启动；
- 最后一个蜂窝 Modem 拔出后自动停止上述后台服务；
- U 盘、USB 打印机、iPhone `ipheth`、Android RNDIS 网络共享不会误触发 QModem；
- 热插拔使用运行状态锁，避免同一设备的 `add/bind` 事件重复启动服务；
- QModem 驱动、拨号协议和中文管理页面仍完整保留，需要时可直接使用。

v75 使用新的首启迁移文件名，因此从 v74 **保留配置升级**也会执行修复，不会被
v74 已删除的同名 `uci-defaults` 文件遮住。无线、访问控制、Nikki 和现有网络配置
没有改动。

## 固件文件

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500_usb_native-squashfs-sysupgrade.bin`：
  已运行本项目固件时，在 LuCI **系统 → 备份与升级**中使用；
- `be6500-v75-ubootkit-factory.bin`：U-BootKit **固件更新**页面直接使用；
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`：
  全新原厂转换时使用的 RAM 安装系统；
- `uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin`：本机型 U-BootKit；
- `install_be6500_uboot.sh`、`prepare_be6500_stock_layout.sh`：带备份和回读校验的
  原厂转换脚本；
- `SHA256SUMS`：发布文件校验值。

## 从 v74 或更早版本升级

进入 **系统 → 备份与升级**，上传 sysupgrade 镜像。可以保留设置，不要勾选
“强制更新”。使用 U-BootKit 网页升级时，只上传 `be6500-v75-ubootkit-factory.bin`，
不要把 sysupgrade tar 上传到 U-BootKit。

升级完成首次启动后，没有蜂窝 Modem 时执行以下命令，不应再看到 QModem Next
后台套件常驻：

```sh
pgrep -af 'modem_scand|qmodem-settings|qmodem-smsd|ubus-at-daemon'
```

首次启动的迁移会自动完成，无需手工删除服务链接。

## 验证

- 199 项项目回归测试全部通过；
- 普通存储设备和 RNDIS 共享的“不启动 QModem”仿真通过；
- QMI/`cdc-wdm` 插入启动、拔出停止仿真通过；
- 最终 SquashFS 已核对新迁移脚本、热插拔脚本、按需 init 服务及
  `be6500-current-config 13`；
- sysupgrade fwtool 元数据及 U-BootKit 7 MiB HLOS/SquashFS/`DEADC0DE`
  布局均已校验。

## 许可与安全边界

QModem 固定在提交 `c49654efc870f53712ee8e25bf181722eb1466d9`，其许可证见
`QMODEM-LICENSE`。本固件只能用于 JDCloud RE-CS-06 / BE6500；刷写 U-Boot、GPT
前必须把脚本生成的备份保存到电脑，写入时不要断电。

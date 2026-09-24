define Device/jdcloud_be6500
	$(call Device/FitImageLzma)
	$(call Device/EmmcImage)
	# The generic EmmcImage "factory.bin" is only a naked rootfs and is not a
	# JDCloud factory container.  Do not publish a dangerously misleading file.
	IMAGES := sysupgrade.bin
	DEVICE_VENDOR := JDCloud
	DEVICE_MODEL := ZhaoYun BE6500
	DEVICE_VARIANT := 6.6 v78 physical ports and USB PHY
	# Keep the persistent image on the boot-validated QWRT/swconfig hardware
	# description.  The generic native DTS does not boot on this board.
	DEVICE_DTS := ipq5332-jdcloud-be6500-full-radio-mht-test-initramfs
	DEVICE_DTS_CONFIG := config@mi01.6
	SOC := ipq5332
		DEVICE_PACKAGES := \
			kmod-ath12k \
			kmod-dsa-qca8k \
			kmod-qca-ssdk \
			kmod-qca-nss-dp \
			kmod-qca-nss-ppe-ds \
			kmod-qca-nss-ppe-bridge-mgr \
			kmod-qca-nss-ppe-vlan-mgr \
			kmod-qca-nss-ppe-pppoe-mgr \
			kmod-qca-nss-ppe-ath-clients \
			kmod-qca-nss-wifi-plugins \
			kmod-qca-nss-ecm \
			kmod-qca-nss-ecm-wifi-plugin \
			be6500-oem-wifi-firmware \
		luci-app-rejected-clients \
		be6500-current-config \
		openssh-sftp-server \
		block-mount blockd usbutils \
		kmod-usb-core kmod-usb3 kmod-usb-dwc3 kmod-usb-dwc3-qcom \
		kmod-usb-storage kmod-usb-storage-extras kmod-usb-storage-uas \
		kmod-usb-printer \
		kmod-fs-ext4 kmod-fs-exfat kmod-fs-vfat kmod-fs-ntfs3 ntfs3-mount \
		luci-app-diskman luci-app-samba4 luci-app-hd-idle \
		luci-i18n-samba4-zh-cn \
		fdisk parted smartmontools \
		udpxy tcpdump tc-full nftables
endef
TARGET_DEVICES += jdcloud_be6500

# RAM-only diagnostic profile.  It intentionally emits no factory or
# sysupgrade image and keeps all unvalidated radio/PCIe/USB drivers out.
define Device/jdcloud_be6500_wired_initramfs
	$(call Device/FitImageLzma)
	IMAGES :=
	DEVICE_VENDOR := JDCloud
	DEVICE_MODEL := ZhaoYun BE6500
	DEVICE_VARIANT := 6.6 wired initramfs diagnostic (not boot validated)
	DEVICE_DTS := ipq5332-jdcloud-be6500
	DEVICE_DTS_CONFIG := config@mi01.6
	SOC := ipq5332
	DEVICE_PACKAGES := \
		-kmod-ath11k-ahb \
		-kmod-usb3 -kmod-usb-dwc3 -kmod-usb-dwc3-qcom \
		-kmod-usb-core -kmod-usb-storage -kmod-usb-storage-extras \
		-kmod-usb-storage-uas -automount -block-mount -losetup \
		-be6500-oem-wifi-firmware -wpad-openssl \
		kmod-dsa-qca8k \
		kmod-qca-ssdk \
		kmod-qca-nss-dp
endef
TARGET_DEVICES += jdcloud_be6500_wired_initramfs

# RAM-only staged MDIO diagnostic.  The target kernel config is temporarily
# built with CONFIG_MDIO_IPQ4019=m; the package below intentionally has no
# AUTOLOAD entry, allowing the proven raw eth1 path to be established first.
define Device/jdcloud_be6500_mdio_staged_initramfs
	$(call Device/FitImageLzma)
	IMAGES :=
	DEVICE_VENDOR := JDCloud
	DEVICE_MODEL := ZhaoYun BE6500
	DEVICE_VARIANT := 6.6 staged MDIO initramfs diagnostic
	DEVICE_DTS := ipq5332-jdcloud-be6500
	DEVICE_DTS_CONFIG := config@mi01.6
	SOC := ipq5332
	DEVICE_PACKAGES := \
		-kmod-ath11k-ahb \
		-kmod-usb3 -kmod-usb-dwc3 -kmod-usb-dwc3-qcom \
		-kmod-usb-core -kmod-usb-storage -kmod-usb-storage-extras \
		-kmod-usb-storage-uas -automount -block-mount -losetup \
		-be6500-oem-wifi-firmware -wpad-openssl \
		kmod-mdio-ipq4019-be6500 \
		kmod-dsa-qca8k \
		kmod-qca-ssdk \
		kmod-qca-nss-dp
endef
TARGET_DEVICES += jdcloud_be6500_mdio_staged_initramfs

# RAM-only MDIO-controller isolation profile.  The switch consumers are
# disabled in the DTS so a manual module insertion cannot be confused with
# QCA8386 DSA or SSDK probe behaviour.
define Device/jdcloud_be6500_mdio_controller_only_initramfs
	$(call Device/FitImageLzma)
	IMAGES :=
	DEVICE_VENDOR := JDCloud
	DEVICE_MODEL := ZhaoYun BE6500
	DEVICE_VARIANT := 6.6 MDIO controller-only initramfs diagnostic
	DEVICE_DTS := ipq5332-jdcloud-be6500
	DEVICE_DTS_CONFIG := config@mi01.6
	SOC := ipq5332
	DEVICE_PACKAGES := \
		-kmod-ath11k-ahb \
		-kmod-usb3 -kmod-usb-dwc3 -kmod-usb-dwc3-qcom \
		-kmod-usb-core -kmod-usb-storage -kmod-usb-storage-extras \
		-kmod-usb-storage-uas -automount -block-mount -losetup \
		-be6500-oem-wifi-firmware -wpad-openssl \
		kmod-mdio-ipq4019-be6500 \
		kmod-dsa-qca8k \
		kmod-qca-ssdk \
		kmod-qca-nss-dp
endef
TARGET_DEVICES += jdcloud_be6500_mdio_controller_only_initramfs

# RAM-only DSA isolation profile.  QCA8386 DSA/PHY consumers are enabled but
# SSDK's second switch instance and all destructive late-reset properties are
# disabled, separating DSA probe behaviour from switch reset behaviour.
define Device/jdcloud_be6500_dsa_noreset_initramfs
	$(call Device/FitImageLzma)
	IMAGES :=
	DEVICE_VENDOR := JDCloud
	DEVICE_MODEL := ZhaoYun BE6500
	DEVICE_VARIANT := 6.6 QCA8386 DSA no-reset initramfs diagnostic
	DEVICE_DTS := ipq5332-jdcloud-be6500
	DEVICE_DTS_CONFIG := config@mi01.6
	SOC := ipq5332
	DEVICE_PACKAGES := \
		-kmod-ath11k-ahb \
		-kmod-usb3 -kmod-usb-dwc3 -kmod-usb-dwc3-qcom \
		-kmod-usb-core -kmod-usb-storage -kmod-usb-storage-extras \
		-kmod-usb-storage-uas -automount -block-mount -losetup \
		-be6500-oem-wifi-firmware -wpad-openssl \
		kmod-mdio-ipq4019-be6500 \
		kmod-dsa-qca8k \
		kmod-qca-ssdk \
		kmod-qca-nss-dp
endef
TARGET_DEVICES += jdcloud_be6500_dsa_noreset_initramfs

# RAM-only DSA probe profile that also suppresses PHY/UNIPHY address writes,
# preserving QWRT's working switch state until qca8k itself starts probing.
define Device/jdcloud_be6500_dsa_preserve_initramfs
	$(call Device/FitImageLzma)
	IMAGES :=
	DEVICE_VENDOR := JDCloud
	DEVICE_MODEL := ZhaoYun BE6500
	DEVICE_VARIANT := 6.6 QCA8386 DSA preserve-state initramfs diagnostic
	DEVICE_DTS := ipq5332-jdcloud-be6500
	DEVICE_DTS_CONFIG := config@mi01.6
	SOC := ipq5332
	DEVICE_PACKAGES := \
		-kmod-ath11k-ahb \
		-kmod-usb3 -kmod-usb-dwc3 -kmod-usb-dwc3-qcom \
		-kmod-usb-core -kmod-usb-storage -kmod-usb-storage-extras \
		-kmod-usb-storage-uas -automount -block-mount -losetup \
		-be6500-oem-wifi-firmware -wpad-openssl \
		kmod-mdio-ipq4019-be6500 \
		kmod-dsa-qca8k \
		kmod-qca-ssdk \
		kmod-qca-nss-dp
endef
TARGET_DEVICES += jdcloud_be6500_dsa_preserve_initramfs

# Small persistent development base for the secondary HLOS slot.  It reuses
# the proven preserve-state DTS, deliberately leaves the staged MDIO driver
# without AUTOLOAD, and keeps only the packages needed for SSH recovery,
# ext4 access and the raw NSS-DP management link.  Driver/UI packages are
# transferred to persistent storage and tested after boot.
define Device/jdcloud_be6500_persistent_base_initramfs
	$(call Device/FitImageLzma)
	IMAGES :=
	DEVICE_VENDOR := JDCloud
	DEVICE_MODEL := ZhaoYun BE6500
	DEVICE_VARIANT := 6.6 persistent driver-development base
	DEVICE_DTS := ipq5332-jdcloud-be6500
	DEVICE_DTS_CONFIG := config@mi01.6
	SOC := ipq5332
	DEVICE_PACKAGES := \
		-kmod-ath11k-ahb \
		-kmod-usb3 -kmod-usb-dwc3 -kmod-usb-dwc3-qcom \
		-kmod-usb-core -kmod-usb-storage -kmod-usb-storage-extras \
		-kmod-usb-storage-uas -automount -block-mount -losetup \
		-be6500-oem-wifi-firmware -wpad-openssl \
		-autocore -ca-bundle -cpufreq \
		-default-settings -default-settings-chn \
		-dnsmasq-full -e2fsprogs -firewall4 -iwinfo \
		-kmod-qrtr -kmod-qrtr-smd \
		-luci -luci-light -luci-base -luci-compat -luci-lua-runtime \
		-luci-app-cpufreq -luci-app-firewall -luci-app-package-manager \
		-luci-mod-admin-full -luci-mod-network -luci-mod-status \
		-luci-mod-system -luci-proto-ipv6 -luci-proto-ppp \
		-luci-theme-bootstrap -nftables-json \
		-odhcp6c -odhcpd-ipv6only -opkg -ppp -ppp-mod-pppoe \
		-rpcd -rpcd-mod-file -rpcd-mod-iwinfo -rpcd-mod-luci \
		-rpcd-mod-rrdns -rpcd-mod-ucode -shellsync \
		-uclient-fetch -uhttpd -uhttpd-mod-ubus \
		dropbear kmod-fs-ext4 kmod-mdio-ipq4019-be6500 \
		kmod-dsa-qca8k kmod-qca-ssdk kmod-qca-nss-dp \
		uboot-envtools
endef
TARGET_DEVICES += jdcloud_be6500_persistent_base_initramfs

# PCIe-only successor to the boot-validated persistent base.  It enables the
# factory-wired PCIe1 x2 controller and keeps MHI/CNSS/ath12k disabled so that
# QCN9224 endpoint enumeration can be validated independently.
define Device/jdcloud_be6500_pcie_probe_initramfs
	$(call Device/FitImageLzma)
	IMAGES :=
	DEVICE_VENDOR := JDCloud
	DEVICE_MODEL := ZhaoYun BE6500
	DEVICE_VARIANT := 6.6 PCIe1 enumeration probe
	DEVICE_DTS := ipq5332-jdcloud-be6500
	DEVICE_DTS_CONFIG := config@mi01.6
	SOC := ipq5332
	DEVICE_PACKAGES := \
		-kmod-ath11k-ahb \
		-kmod-usb3 -kmod-usb-dwc3 -kmod-usb-dwc3-qcom \
		-kmod-usb-core -kmod-usb-storage -kmod-usb-storage-extras \
		-kmod-usb-storage-uas -automount -block-mount -losetup \
		-be6500-oem-wifi-firmware -wpad-openssl \
		-autocore -ca-bundle -cpufreq \
		-default-settings -default-settings-chn \
		-dnsmasq-full -e2fsprogs -firewall4 -iwinfo \
		-kmod-qrtr -kmod-qrtr-smd \
		-luci -luci-light -luci-base -luci-compat -luci-lua-runtime \
		-luci-app-cpufreq -luci-app-firewall -luci-app-package-manager \
		-luci-mod-admin-full -luci-mod-network -luci-mod-status \
		-luci-mod-system -luci-proto-ipv6 -luci-proto-ppp \
		-luci-theme-bootstrap -nftables-json \
		-odhcp6c -odhcpd-ipv6only -opkg -ppp -ppp-mod-pppoe \
		-rpcd -rpcd-mod-file -rpcd-mod-iwinfo -rpcd-mod-luci \
		-rpcd-mod-rrdns -rpcd-mod-ucode -shellsync \
		-uclient-fetch -uhttpd -uhttpd-mod-ubus \
		dropbear kmod-fs-ext4 kmod-mdio-ipq4019-be6500 \
		kmod-dsa-qca8k kmod-qca-ssdk kmod-qca-nss-dp \
		uboot-envtools
endef
TARGET_DEVICES += jdcloud_be6500_pcie_probe_initramfs

# RAM-only successor to the PCIe enumeration probe.  This profile binds only
# the external 17cb:1109 radio to the pinned QSDK 14 wlan-open ath12k stack and
# provides the factory QCN92xx firmware/BDF/calibration contract.  The SoC
# radio remains disabled so firmware bootstrap and dual-MAC reporting can be
# assessed without conflating it with the integrated 2.4 GHz path.
define Device/jdcloud_be6500_qcn92xx_firmware_initramfs
	$(call Device/FitImageLzma)
	IMAGES :=
	DEVICE_VENDOR := JDCloud
	DEVICE_MODEL := ZhaoYun BE6500
	DEVICE_VARIANT := 6.6 QCN92xx firmware bootstrap probe
	DEVICE_DTS := ipq5332-jdcloud-be6500
	DEVICE_DTS_CONFIG := config@mi01.6
	SOC := ipq5332
	DEVICE_PACKAGES := \
		-kmod-ath11k-ahb \
		-kmod-usb3 -kmod-usb-dwc3 -kmod-usb-dwc3-qcom \
		-kmod-usb-core -kmod-usb-storage -kmod-usb-storage-extras \
		-kmod-usb-storage-uas -automount -block-mount -losetup \
		-wpad-openssl \
		-autocore -ca-bundle -cpufreq \
		-default-settings -default-settings-chn \
		-dnsmasq-full -e2fsprogs -firewall4 \
		-luci -luci-light -luci-base -luci-compat -luci-lua-runtime \
		-luci-app-cpufreq -luci-app-firewall -luci-app-package-manager \
		-luci-mod-admin-full -luci-mod-network -luci-mod-status \
		-luci-mod-system -luci-proto-ipv6 -luci-proto-ppp \
		-luci-theme-bootstrap -nftables-json \
		-odhcp6c -odhcpd-ipv6only -opkg -ppp -ppp-mod-pppoe \
		-rpcd -rpcd-mod-file -rpcd-mod-iwinfo -rpcd-mod-luci \
		-rpcd-mod-rrdns -rpcd-mod-ucode -shellsync \
		-uclient-fetch -uhttpd -uhttpd-mod-ubus \
		dropbear kmod-fs-ext4 kmod-mdio-ipq4019-be6500 \
		kmod-dsa-qca8k kmod-qca-ssdk kmod-qca-nss-dp \
		kmod-ath12k be6500-oem-wifi-firmware \
		uboot-envtools
endef
TARGET_DEVICES += jdcloud_be6500_qcn92xx_firmware_initramfs

# Safe full-radio successor to v19.  It retains the boot-validated DSA and
# external QCN92xx dual-MAC path, then enables only the integrated IPQ5332
# 2.4 GHz WCSS user-PD.  Chinese LuCI resources are built in explicitly.
define Device/jdcloud_be6500_full_radio_initramfs
	$(call Device/FitImageLzma)
	IMAGES :=
	DEVICE_VENDOR := JDCloud
	DEVICE_MODEL := ZhaoYun BE6500
	DEVICE_VARIANT := 6.6 full 2.4G plus dual 5G safe test
	DEVICE_DTS := ipq5332-jdcloud-be6500
	DEVICE_DTS_CONFIG := config@mi01.6
	SOC := ipq5332
	DEVICE_PACKAGES := \
		-kmod-ath11k-ahb \
		-kmod-usb3 -kmod-usb-dwc3 -kmod-usb-dwc3-qcom \
		-kmod-usb-core -kmod-usb-storage -kmod-usb-storage-extras \
		-kmod-usb-storage-uas -automount -block-mount -losetup \
		wpad-openssl \
		-autocore -ca-bundle -cpufreq \
		-default-settings -default-settings-chn \
		-dnsmasq-full -e2fsprogs -firewall4 \
		-luci -luci-light -luci-base -luci-compat -luci-lua-runtime \
		-luci-app-cpufreq -luci-app-firewall -luci-app-package-manager \
		-luci-mod-admin-full -luci-mod-network -luci-mod-status \
		-luci-mod-system -luci-proto-ipv6 -luci-proto-ppp \
		-luci-theme-bootstrap -nftables-json \
		-odhcp6c -odhcpd-ipv6only -opkg -ppp -ppp-mod-pppoe \
		-rpcd -rpcd-mod-file -rpcd-mod-iwinfo -rpcd-mod-luci \
		-rpcd-mod-rrdns -rpcd-mod-ucode -shellsync \
		-uclient-fetch -uhttpd -uhttpd-mod-ubus \
		dropbear kmod-fs-ext4 kmod-mdio-ipq4019-be6500 \
		kmod-dsa-qca8k kmod-qca-ssdk kmod-qca-nss-dp \
		kmod-ath12k be6500-oem-wifi-firmware \
		luci-i18n-base-zh-cn luci-i18n-firewall-zh-cn \
		luci-i18n-package-manager-zh-cn luci-i18n-cpufreq-zh-cn \
		luci-i18n-ddns-zh-cn luci-i18n-nlbwmon-zh-cn \
		luci-i18n-sqm-zh-cn luci-i18n-upnp-zh-cn \
		be6500-luci-zh-default \
		uboot-envtools
endef
TARGET_DEVICES += jdcloud_be6500_full_radio_initramfs

# RAM-only reference ownership profile.  QCA8386 DSA and SSDK-MHT are both
# enabled as on the QSDK reference board, while late reset and address-fixup
# writes stay suppressed so the working boot-loader switch state is preserved.
define Device/jdcloud_be6500_dsa_ssdk_preserve_initramfs
	$(call Device/FitImageLzma)
	IMAGES :=
	DEVICE_VENDOR := JDCloud
	DEVICE_MODEL := ZhaoYun BE6500
	DEVICE_VARIANT := 6.6 QCA8386 DSA plus SSDK preserve-state diagnostic
	DEVICE_DTS := ipq5332-jdcloud-be6500
	DEVICE_DTS_CONFIG := config@mi01.6
	SOC := ipq5332
	DEVICE_PACKAGES := \
		-kmod-ath11k-ahb \
		-kmod-usb3 -kmod-usb-dwc3 -kmod-usb-dwc3-qcom \
		-kmod-usb-core -kmod-usb-storage -kmod-usb-storage-extras \
		-kmod-usb-storage-uas -automount -block-mount -losetup \
		-be6500-oem-wifi-firmware -wpad-openssl \
		kmod-mdio-ipq4019-be6500 \
		kmod-dsa-qca8k \
		kmod-qca-ssdk \
		kmod-qca-nss-dp
endef
TARGET_DEVICES += jdcloud_be6500_dsa_ssdk_preserve_initramfs

# RAM-only PHY isolation profile.  Four PHY consumers are present, QCA8386
# DSA/SSDK consumers are absent, and no late reset/fixup writes are allowed.
define Device/jdcloud_be6500_phy_only_initramfs
	$(call Device/FitImageLzma)
	IMAGES :=
	DEVICE_VENDOR := JDCloud
	DEVICE_MODEL := ZhaoYun BE6500
	DEVICE_VARIANT := 6.6 internal-PHY-only initramfs diagnostic
	DEVICE_DTS := ipq5332-jdcloud-be6500
	DEVICE_DTS_CONFIG := config@mi01.6
	SOC := ipq5332
	DEVICE_PACKAGES := \
		-kmod-ath11k-ahb \
		-kmod-usb3 -kmod-usb-dwc3 -kmod-usb-dwc3-qcom \
		-kmod-usb-core -kmod-usb-storage -kmod-usb-storage-extras \
		-kmod-usb-storage-uas -automount -block-mount -losetup \
		-be6500-oem-wifi-firmware -wpad-openssl \
		kmod-mdio-ipq4019-be6500 \
		kmod-dsa-qca8k \
		kmod-qca-ssdk \
		kmod-qca-nss-dp
endef
TARGET_DEVICES += jdcloud_be6500_phy_only_initramfs

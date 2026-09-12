BOARDNAME:=Qualcomm IPQ53xx WiSoC
CPU_TYPE:=cortex-a53

DEFAULT_PACKAGES += \
	e2fsprogs kmod-fs-ext4 kmod-qrtr kmod-qrtr-smd \
	kmod-qca-ssdk kmod-qca-nss-dp \
	be6500-oem-wifi-firmware

define Target/Description
	Build firmware images for Qualcomm IPQ53xx 64-bit systems.
endef

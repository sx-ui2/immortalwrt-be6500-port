include $(TOPDIR)/rules.mk

ARCH:=aarch64
BOARD:=qualcommax
BOARDNAME:=Qualcomm Atheros 802.11ax/802.11be WiSoC-s
FEATURES:=squashfs ramdisk fpu nand rtc emmc
KERNELNAME:=Image
CPU_TYPE:=cortex-a53
SUBTARGETS:=ipq807x ipq60xx ipq53xx

KERNEL_PATCHVER:=6.6

include $(INCLUDE_DIR)/target.mk

# The selected device profile supplies all functional drivers.  Keep only the
# physical recovery controls in this dedicated sub-7 MiB base image build.
DEFAULT_PACKAGES += \
	kmod-leds-gpio kmod-gpio-button-hotplug

$(eval $(call BuildTarget))

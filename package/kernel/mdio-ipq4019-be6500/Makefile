include $(TOPDIR)/rules.mk

PKG_NAME:=mdio-ipq4019-be6500
PKG_RELEASE:=4

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/mdio-ipq4019-be6500
  SUBMENU:=Network Devices
  TITLE:=Qualcomm IPQ4019 MDIO controller for BE6500
  DEPENDS:=@TARGET_qualcommax_ipq53xx +kmod-libphy +kmod-mdio-devres
  KCONFIG:=CONFIG_MDIO_IPQ4019=m
  FILES:=$(LINUX_DIR)/drivers/net/mdio/mdio-ipq4019.ko
endef

define KernelPackage/mdio-ipq4019-be6500/description
  Packages and loads the in-tree IPQ4019 MDIO driver before QCA SSDK probes.
endef

# The module is built in-tree by target/linux from the KCONFIG selection.
# This wrapper only places that existing .ko in an installable package.
define Build/Compile
endef

define KernelPackage/mdio-ipq4019-be6500/install
	$(INSTALL_DIR) $(1)/etc/modules.d
	$(INSTALL_DATA) ./files/28-mdio-ipq4019-be6500 $(1)/etc/modules.d/28-mdio-ipq4019-be6500
	$(INSTALL_DIR) $(1)/etc/modules-boot.d
	$(LN) ../modules.d/28-mdio-ipq4019-be6500 $(1)/etc/modules-boot.d/28-mdio-ipq4019-be6500
endef

$(eval $(call KernelPackage,mdio-ipq4019-be6500))

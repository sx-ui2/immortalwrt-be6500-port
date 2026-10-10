include $(TOPDIR)/rules.mk

PKG_NAME:=linux-apfs-rw
PKG_VERSION:=0.3.21
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://github.com/linux-apfs/linux-apfs-rw/archive/refs/tags/v$(PKG_VERSION)
PKG_HASH:=7c2af6a0e7f9d0aa2b1dd9dd8e4a03b73f1e5ce429cfa0115e66099c75bd233d

PKG_LICENSE:=GPL-2.0-only
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=JDCloud BE6500 port maintainers

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/fs-apfs
  SUBMENU:=Filesystems
  TITLE:=Apple File System read-only support
  URL:=https://github.com/linux-apfs/linux-apfs-rw
  DEPENDS:=+kmod-lib-crc32c +kmod-lib-zlib-inflate
  FILES:=$(PKG_BUILD_DIR)/apfs.ko
  AUTOLOAD:=$(call AutoProbe,apfs,1)
endef

define KernelPackage/fs-apfs/description
  Experimental Linux APFS filesystem module. The BE6500 package deliberately
  keeps the upstream safe default: APFS volumes are mounted read-only. The
  experimental readwrite option is not enabled because it may corrupt data.
  Encrypted APFS containers are not supported by this kernel driver.
endef

define Build/Compile
	(cd $(PKG_BUILD_DIR) && ./genver.sh)
	+$(KERNEL_MAKE) M="$(PKG_BUILD_DIR)" modules
endef

$(eval $(call KernelPackage,fs-apfs))

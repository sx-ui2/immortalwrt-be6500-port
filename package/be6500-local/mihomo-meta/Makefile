include $(TOPDIR)/rules.mk

PKG_NAME:=mihomo-meta
PKG_VERSION:=1.19.31

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_SUBDIR:=$(PKG_NAME)-$(PKG_VERSION)
PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/MetaCubeX/mihomo.git
PKG_SOURCE_VERSION:=v1.19.31
PKG_MIRROR_HASH:=2337ee0dc8bbef9921e2ac73dfa7d7617f64b8f69a5d774ffc392c748ca85b00

PKG_LICENSE:=GPL3.0+
PKG_MAINTAINER:=Joseph Mory <morytyann@gmail.com>

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

PKG_BUILD_VERSION:=v1.19.31
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)
PKG_BUILD_TIME:=$(shell date -u -Iseconds)

GO_PKG:=github.com/metacubex/mihomo
GO_PKG_BUILD_PKG:=github.com/metacubex/mihomo
GO_PKG_LDFLAGS_X:=$(GO_PKG)/constant.Version=$(PKG_BUILD_VERSION) $(GO_PKG)/constant.BuildTime=$(PKG_BUILD_TIME)
GO_PKG_TAGS:=with_gvisor
GO_PKG_INSTALL_BIN_PATH:=/usr/libexec

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

# The upstream OpenWrt Go bootstrap only ships linux/amd64 host artifacts.
# Our reproducible BE6500 builder runs on linux/arm64, so bootstrap a pinned
# official Go host toolchain there instead of attempting the unsupported
# golang/host build.  Other build hosts keep the normal OpenWrt dependency.
BE6500_HOST_GO_VERSION:=1.26.1
BE6500_HOST_GO_SHA256:=a290581cfe4fe28ddd737dde3095f3dbeb7f2e4065cab4eae44dfc53b760c2f7
BE6500_HOST_GO_ARCHIVE:=$(DL_DIR)/go$(BE6500_HOST_GO_VERSION).linux-arm64.tar.gz
BE6500_HOST_GO_ROOT:=$(DL_DIR)/host-go-$(BE6500_HOST_GO_VERSION)-linux-arm64

ifeq ($(GO_HOST_OS_ARCH),linux_arm64)
PKG_BUILD_DEPENDS:=
endif

define Package/mihomo-meta
  SECTION:=net
  CATEGORY:=Network
  TITLE:=A rule based proxy in Go.
  URL:=https://wiki.metacubex.one
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle +ip-full +kmod-inet-diag +kmod-tun
  PROVIDES:=mihomo
  CONFLICTS:=mihomo-alpha
  VARIANT:=meta
  DEFAULT_VARIANT:=1
  ALTERNATIVES:=\
    300:/usr/bin/mihomo:/usr/libexec/mihomo
endef

define Package/mihomo-meta/description
  A rule based proxy in Go.
endef

define Package/mihomo-meta/install
	$(call GoPackage/Package/Install/Bin,$(1))
endef

define Build/Prepare
	$(Build/Prepare/Default)
	$(RM) -r $(PKG_BUILD_DIR)/rules/logic_test
ifeq ($(GO_HOST_OS_ARCH),linux_arm64)
	[ -x "$(BE6500_HOST_GO_ROOT)/bin/go" ] || { \
		$(RM) -rf "$(BE6500_HOST_GO_ROOT)"; \
		curl -fL --retry 3 -o "$(BE6500_HOST_GO_ARCHIVE)" \
			"https://dl.google.com/go/go$(BE6500_HOST_GO_VERSION).linux-arm64.tar.gz"; \
		echo "$(BE6500_HOST_GO_SHA256)  $(BE6500_HOST_GO_ARCHIVE)" | sha256sum -c -; \
		mkdir -p "$(BE6500_HOST_GO_ROOT)"; \
		tar -C "$(BE6500_HOST_GO_ROOT)" --strip-components=1 -xzf "$(BE6500_HOST_GO_ARCHIVE)"; \
	}
endif
endef

ifeq ($(GO_HOST_OS_ARCH),linux_arm64)
define Build/Compile
	PATH="$(BE6500_HOST_GO_ROOT)/bin:$$$$PATH" $(call GoPackage/Build/Compile)
endef
endif

$(eval $(call GoBinPackage,mihomo-meta))
$(eval $(call BuildPackage,mihomo-meta))

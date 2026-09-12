include $(TOPDIR)/rules.mk

PKG_NAME:=be6500-oem-wifi-firmware
PKG_RELEASE:=9
PKG_MAINTAINER:=Codex

include $(INCLUDE_DIR)/package.mk

define Package/be6500-oem-wifi-firmware
  SECTION:=firmware
  CATEGORY:=Firmware
  TITLE:=JDCloud BE6500 OEM IPQ5332/QCN9224 Wi-Fi firmware blobs
  PKGARCH:=all
endef

define Package/be6500-oem-wifi-firmware/description
  Matched WLAN.WBE.1.1-03321 firmware set extracted from the JDCloud BE6500
  factory JDCOS image for the integrated IPQ5332 WCSS and external QCN9224.
  Q6, M3, AMSS dual-MAC, Data.msc, feature INI, regulatory data and board-data
  are kept at one factory release level so the two wireless processors use the
  same firmware protocol. The files are exposed through the QSDK 14 ath12k
  lookup paths without changing their contents.
endef

define Build/Compile
endef

define Package/be6500-oem-wifi-firmware/install
	$(INSTALL_DIR) $(1)/lib/firmware/ath11k/IPQ5332/hw1.0
	$(INSTALL_DATA) ./files/q6_fw0.* $(1)/lib/firmware/ath11k/IPQ5332/hw1.0/
	$(INSTALL_DATA) ./files/q6_fw1.* $(1)/lib/firmware/ath11k/IPQ5332/hw1.0/
	$(INSTALL_DATA) ./files/iu_fw.* $(1)/lib/firmware/ath11k/IPQ5332/hw1.0/
	$(INSTALL_DATA) ./files/bdwlan* $(1)/lib/firmware/ath11k/IPQ5332/hw1.0/
	$(INSTALL_DATA) ./files/regdb.bin $(1)/lib/firmware/ath11k/IPQ5332/hw1.0/

	# QSDK 14 ath12k AHB binds the integrated IPQ5332 radio
	# (the 2.4 GHz radio on BE6500) and requests IPQ5332/hw1.0.
	# Keep ath11k layout above for older experiments, but expose the
	# same OEM blobs through ath12k for the new-kernel full-radio image.
	$(INSTALL_DIR) $(1)/lib/firmware/ath12k/IPQ5332/hw1.0
	$(INSTALL_DATA) ./files/q6_fw0.* $(1)/lib/firmware/ath12k/IPQ5332/hw1.0/
	$(INSTALL_DATA) ./files/q6_fw1.* $(1)/lib/firmware/ath12k/IPQ5332/hw1.0/
	$(INSTALL_DATA) ./files/iu_fw.* $(1)/lib/firmware/ath12k/IPQ5332/hw1.0/
	$(INSTALL_DATA) ./files/bdwlan* $(1)/lib/firmware/ath12k/IPQ5332/hw1.0/
	# wlan-open first searches the API2 bundle and then deliberately falls back
	# to the API1 filename board.bin.  The factory image ships the matching
	# IPQ5332 BDF as bdwlan.bin, so expose that exact blob without conversion.
	ln -sf bdwlan.bin $(1)/lib/firmware/ath12k/IPQ5332/hw1.0/board.bin
	$(INSTALL_DATA) ./files/regdb.bin $(1)/lib/firmware/ath12k/IPQ5332/hw1.0/

	$(INSTALL_DIR) $(1)/lib/firmware/IPQ5332
	$(INSTALL_DATA) ./files/q6_fw0.* $(1)/lib/firmware/IPQ5332/
	$(INSTALL_DATA) ./files/q6_fw1.* $(1)/lib/firmware/IPQ5332/
	$(INSTALL_DATA) ./files/iu_fw.* $(1)/lib/firmware/IPQ5332/

	$(INSTALL_DIR) $(1)/lib/firmware/qcn9224
	$(CP) ./files/qcn9224/* $(1)/lib/firmware/qcn9224/

	# QSDK 14 wlan-open calls PCI 17cb:1109 "QCN9274 HW2.0" and requests
	# QCN92XX/hw1.0. Keep the OEM names in one source directory and expose only
	# the exact filenames requested by ath12k. bdwlan.b1008 is raw API1 board
	# data; never rename it to board-2.bin, whose typed container is absent.
	$(INSTALL_DIR) $(1)/lib/firmware/ath12k/QCN92XX/hw1.0
	ln -sf /lib/firmware/qcn9224/amss.bin \
		$(1)/lib/firmware/ath12k/QCN92XX/hw1.0/amss.bin
	ln -sf /lib/firmware/qcn9224/amss_dualmac.bin \
		$(1)/lib/firmware/ath12k/QCN92XX/hw1.0/amss_dualmac.bin
	ln -sf /lib/firmware/qcn9224/m3.bin \
		$(1)/lib/firmware/ath12k/QCN92XX/hw1.0/m3.bin
	ln -sf /lib/firmware/qcn9224/regdb.bin \
		$(1)/lib/firmware/ath12k/QCN92XX/hw1.0/regdb.bin
	ln -sf /lib/firmware/qcn9224/qdss_trace_config.bin \
		$(1)/lib/firmware/ath12k/QCN92XX/hw1.0/qdss_trace_config.bin
	ln -sf /lib/firmware/qcn9224/bdwlan.b1008 \
		$(1)/lib/firmware/ath12k/QCN92XX/hw1.0/board.bin
	# The BE6500 driver patch selects this API1 BDF together with amss.bin
	# when cnss2.bdf_pci1=0x2 requests the single-MAC 4-chain 5 GHz mode.
	ln -sf /lib/firmware/qcn9224/bdwlan.b0002 \
		$(1)/lib/firmware/ath12k/QCN92XX/hw1.0/board-single.bin
endef

$(eval $(call BuildPackage,be6500-oem-wifi-firmware))

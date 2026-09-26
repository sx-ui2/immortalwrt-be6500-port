// SPDX-License-Identifier: GPL-2.0+
/*
 * Copyright (c) 2014-2016, 2020, The Linux Foundation. All rights reserved.
 *
 * Qualcomm Atheros M31 USB2 PHY driver.
 *
 * This is the legacy usb_phy implementation used by the working QWRT
 * IPQ5332 device tree.  Linux 6.6's generic PHY driver uses a different
 * binding and lifecycle, so it must not claim this node.
 */

#include <linux/delay.h>
#include <linux/err.h>
#include <linux/io.h>
#include <linux/kernel.h>
#include <linux/module.h>
#include <linux/of.h>
#include <linux/of_device.h>
#include <linux/platform_device.h>
#include <linux/reset.h>
#include <linux/slab.h>
#include <linux/usb/phy.h>

enum clk_reset_action {
	CLK_RESET_DEASSERT = 0,
	CLK_RESET_ASSERT = 1,
};

#define USB2PHY_PORT_POWERDOWN		0xa4
#define POWER_UP			BIT(0)
#define POWER_DOWN			0
#define USB2PHY_PORT_UTMI_CTRL2		0x44
#define HS_PHY_CTRL_REG			0x10
#define UTMI_OTG_VBUS_VALID		BIT(20)
#define SW_SESSVLD_SEL			BIT(28)
#define USB_PHY_CFG0			0x94
#define USB_PHY_UTMI_CTRL5		0x50
#define USB_PHY_FSEL_SEL			0xb8
#define USB_PHY_HS_PHY_CTRL_COMMON0	0x54
#define USB_PHY_REFCLK_CTRL		0xa0
#define USB_PHY_HS_PHY_CTRL2		0x64
#define USB2PHY_USB_PHY_M31_XCFGI_1	0xbc
#define USB2PHY_USB_PHY_M31_XCFGI_4	0xc8
#define USB2PHY_USB_PHY_M31_XCFGI_5	0xcc
#define USB2PHY_USB_PHY_M31_XCFGI_9	0xdc
#define USB2PHY_USB_PHY_M31_XCFGI_11	0xe4
#define USB2_0_TX_ENABLE			BIT(2)
#define HSTX_SLEW_RATE_400PS		7
#define PLL_CHARGING_PUMP_CURRENT_35UA	(3 << 3)
#define ODT_VALUE_38_02_OHM		(3 << 6)
#define HSTX_PRE_EMPHASIS_LEVEL_0_55MA	1
#define HSTX_CURRENT_17_1MA_385MV	BIT(1)
#define UTMI_PHY_OVERRIDE_EN		BIT(1)
#define POR_EN				BIT(1)
#define FREQ_SEL			BIT(0)
#define COMMONONN			BIT(7)
#define FSEL				BIT(4)
#define RETENABLEN			BIT(3)
#define USB2_SUSPEND_N_SEL		BIT(3)
#define USB2_SUSPEND_N			BIT(2)
#define USB2_UTMI_CLK_EN			BIT(1)
#define CLKCORE				BIT(1)
#define ATERESET			(~BIT(0))
#define FREQ_24MHZ			(5 << 4)
#define XCFG_COARSE_TUNE_NUM		(2 << 0)
#define XCFG_FINE_TUNE_NUM		(1 << 3)

struct m31usb_phy {
	struct usb_phy phy;
	void __iomem *base;
	void __iomem *qscratch_base;
	struct reset_control *phy_reset;
	bool cable_connected;
	bool ulpi_mode;
	bool ipq5332;
};

static void m31usb_write_readback(void __iomem *base, u32 offset,
				  u32 mask, u32 val)
{
	u32 write_val;
	u32 tmp = readl_relaxed(base + offset);

	tmp &= ~mask;
	write_val = tmp | val;
	writel_relaxed(write_val, base + offset);
	wmb();

	tmp = readl_relaxed(base + offset) & mask;
	if (tmp != val)
		pr_err("%s: write %#x to QSCRATCH %#x failed\n",
		       __func__, val, offset);
}

static void m31usb_reset(struct m31usb_phy *qphy, u32 action)
{
	if (action == CLK_RESET_ASSERT)
		reset_control_assert(qphy->phy_reset);
	else
		reset_control_deassert(qphy->phy_reset);
	wmb();
}

static void m31usb_phy_enable_clock(struct m31usb_phy *qphy)
{
	writel(UTMI_PHY_OVERRIDE_EN, qphy->base + USB_PHY_CFG0);
	writel(POR_EN, qphy->base + USB_PHY_UTMI_CTRL5);
	udelay(15);
	writel(FREQ_SEL, qphy->base + USB_PHY_FSEL_SEL);
	writel(COMMONONN | FSEL | RETENABLEN,
	       qphy->base + USB_PHY_HS_PHY_CTRL_COMMON0);
	writel(CLKCORE, qphy->base + USB_PHY_REFCLK_CTRL);
	writel(POR_EN & ATERESET, qphy->base + USB_PHY_UTMI_CTRL5);
	writel(USB2_SUSPEND_N_SEL | USB2_SUSPEND_N | USB2_UTMI_CLK_EN,
	       qphy->base + USB_PHY_HS_PHY_CTRL2);
	writel(0, qphy->base + USB_PHY_UTMI_CTRL5);
	writel(USB2_SUSPEND_N | USB2_UTMI_CLK_EN,
	       qphy->base + USB_PHY_HS_PHY_CTRL2);
	writel(0, qphy->base + USB_PHY_CFG0);
}

static void ipq5332_m31usb_phy_enable_clock(struct m31usb_phy *qphy)
{
	writel(UTMI_PHY_OVERRIDE_EN, qphy->base + USB_PHY_CFG0);
	writel(POR_EN, qphy->base + USB_PHY_UTMI_CTRL5);
	udelay(15);
	writel(FREQ_SEL, qphy->base + USB_PHY_FSEL_SEL);
	writel(COMMONONN | FREQ_24MHZ | RETENABLEN,
	       qphy->base + USB_PHY_HS_PHY_CTRL_COMMON0);
	writel(POR_EN & ATERESET, qphy->base + USB_PHY_UTMI_CTRL5);
	writel(USB2_SUSPEND_N_SEL | USB2_SUSPEND_N | USB2_UTMI_CLK_EN,
	       qphy->base + USB_PHY_HS_PHY_CTRL2);
	writel(XCFG_COARSE_TUNE_NUM | XCFG_FINE_TUNE_NUM,
	       qphy->base + USB2PHY_USB_PHY_M31_XCFGI_11);
	writel(HSTX_SLEW_RATE_400PS | PLL_CHARGING_PUMP_CURRENT_35UA |
	       ODT_VALUE_38_02_OHM,
	       qphy->base + USB2PHY_USB_PHY_M31_XCFGI_4);
	writel(USB2_0_TX_ENABLE,
	       qphy->base + USB2PHY_USB_PHY_M31_XCFGI_1);
	writel(HSTX_PRE_EMPHASIS_LEVEL_0_55MA,
	       qphy->base + USB2PHY_USB_PHY_M31_XCFGI_5);
	writel(HSTX_CURRENT_17_1MA_385MV,
	       qphy->base + USB2PHY_USB_PHY_M31_XCFGI_9);
	udelay(4);
	writel(0, qphy->base + USB_PHY_UTMI_CTRL5);
	writel(USB2_SUSPEND_N | USB2_UTMI_CLK_EN,
	       qphy->base + USB_PHY_HS_PHY_CTRL2);
}

static int m31usb_phy_init(struct usb_phy *phy)
{
	struct m31usb_phy *qphy = container_of(phy, struct m31usb_phy, phy);

	m31usb_reset(qphy, CLK_RESET_ASSERT);
	usleep_range(1, 5);
	m31usb_reset(qphy, CLK_RESET_DEASSERT);

	if (qphy->ulpi_mode)
		writel_relaxed(0, qphy->base + USB2PHY_PORT_UTMI_CTRL2);

	writel_relaxed(POWER_UP, qphy->base + USB2PHY_PORT_POWERDOWN);
	wmb();

	if (qphy->ipq5332)
		ipq5332_m31usb_phy_enable_clock(qphy);
	else
		m31usb_phy_enable_clock(qphy);

	if (qphy->qscratch_base) {
		m31usb_write_readback(qphy->qscratch_base, HS_PHY_CTRL_REG,
				 UTMI_OTG_VBUS_VALID, UTMI_OTG_VBUS_VALID);
		m31usb_write_readback(qphy->qscratch_base, HS_PHY_CTRL_REG,
				 SW_SESSVLD_SEL, SW_SESSVLD_SEL);
	}

	return 0;
}

static void m31usb_phy_shutdown(struct usb_phy *phy)
{
	struct m31usb_phy *qphy = container_of(phy, struct m31usb_phy, phy);

	writel_relaxed(POWER_DOWN, qphy->base + USB2PHY_PORT_POWERDOWN);
	wmb();
}

static int m31usb_phy_notify_connect(struct usb_phy *phy,
				     enum usb_device_speed speed)
{
	struct m31usb_phy *qphy = container_of(phy, struct m31usb_phy, phy);

	qphy->cable_connected = true;
	m31usb_write_readback(qphy->qscratch_base, HS_PHY_CTRL_REG,
				 UTMI_OTG_VBUS_VALID, UTMI_OTG_VBUS_VALID);
	m31usb_write_readback(qphy->qscratch_base, HS_PHY_CTRL_REG,
				 SW_SESSVLD_SEL, SW_SESSVLD_SEL);
	return 0;
}

static int m31usb_phy_notify_disconnect(struct usb_phy *phy,
					enum usb_device_speed speed)
{
	struct m31usb_phy *qphy = container_of(phy, struct m31usb_phy, phy);

	qphy->cable_connected = false;
	m31usb_write_readback(qphy->qscratch_base, HS_PHY_CTRL_REG,
				 UTMI_OTG_VBUS_VALID, 0);
	m31usb_write_readback(qphy->qscratch_base, HS_PHY_CTRL_REG,
				 SW_SESSVLD_SEL, 0);
	return 0;
}

static int m31usb_phy_probe(struct platform_device *pdev)
{
	struct device *dev = &pdev->dev;
	const bool *ipq5332;
	struct m31usb_phy *qphy;
	struct resource *res;
	const char *phy_type;
	int ret;

	qphy = devm_kzalloc(dev, sizeof(*qphy), GFP_KERNEL);
	if (!qphy)
		return -ENOMEM;

	qphy->phy.dev = dev;
	ipq5332 = of_device_get_match_data(dev);
	qphy->ipq5332 = ipq5332 && *ipq5332;

	res = platform_get_resource_byname(pdev, IORESOURCE_MEM,
					  "m31usb_phy_base");
	qphy->base = devm_ioremap_resource(dev, res);
	if (IS_ERR(qphy->base))
		return PTR_ERR(qphy->base);

	res = platform_get_resource_byname(pdev, IORESOURCE_MEM,
					  "qscratch_base");
	if (res) {
		qphy->qscratch_base = devm_ioremap(dev, res->start,
						 resource_size(res));
		if (!qphy->qscratch_base)
			return -ENOMEM;
	}

	qphy->phy_reset = devm_reset_control_get(dev, "usb2_phy_reset");
	if (IS_ERR(qphy->phy_reset))
		return PTR_ERR(qphy->phy_reset);

	ret = of_property_read_string(dev->of_node, "phy_type", &phy_type);
	if (ret) {
		dev_err(dev, "missing phy_type property\n");
		return ret;
	}
	qphy->ulpi_mode = !strcasecmp(phy_type, "ulpi");

	platform_set_drvdata(pdev, qphy);
	qphy->phy.label = "qca-m31usb-phy";
	qphy->phy.init = m31usb_phy_init;
	qphy->phy.shutdown = m31usb_phy_shutdown;
	qphy->phy.type = USB_PHY_TYPE_USB2;

	if (qphy->qscratch_base) {
		qphy->phy.notify_connect = m31usb_phy_notify_connect;
		qphy->phy.notify_disconnect = m31usb_phy_notify_disconnect;
	}

	return usb_add_phy_dev(&qphy->phy);
}

static int m31usb_phy_remove(struct platform_device *pdev)
{
	struct m31usb_phy *qphy = platform_get_drvdata(pdev);

	usb_remove_phy(&qphy->phy);
	return 0;
}

static const bool m31usb_generic;
static const bool m31usb_ipq5332 = true;

static const struct of_device_id m31usb_phy_id_table[] = {
	{ .compatible = "qca,m31-usb-hsphy", .data = &m31usb_generic },
	{ .compatible = "qca,ipq5332-m31-usb-hsphy", .data = &m31usb_ipq5332 },
	{ .compatible = "qcom,m31-usb-hsphy", .data = &m31usb_generic },
	{ .compatible = "qcom,ipq5332-m31-usb-hsphy", .data = &m31usb_ipq5332 },
	{ }
};
MODULE_DEVICE_TABLE(of, m31usb_phy_id_table);

static struct platform_driver m31usb_phy_driver = {
	.probe = m31usb_phy_probe,
	.remove = m31usb_phy_remove,
	.driver = {
		.name = "qca-m31usb-phy",
		.of_match_table = of_match_ptr(m31usb_phy_id_table),
	},
};
module_platform_driver(m31usb_phy_driver);

MODULE_DESCRIPTION("QTI QWRT-compatible M31 USB2 PHY driver");
MODULE_LICENSE("GPL v2");

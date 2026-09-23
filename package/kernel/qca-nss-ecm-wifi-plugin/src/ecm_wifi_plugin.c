// SPDX-License-Identifier: ISC
/* Bridge the ECM Wi-Fi classifier to the QSDK ath12k metadata API. */
#include <linux/module.h>
#include <linux/netdevice.h>
#include <ath/ath_dp_accel_cfg.h>
#include <ecm_classifier_wifi_public.h>

#define ECM_WIFI_INVALID_DS_NODE_ID 0xff

static u32 ecm_wifi_get_metadata(struct ecm_classifier_wifi_metadata *wifi_info)
{
	struct ath_dp_metadata_param params = { 0 };
	u32 metadata;

	if (wifi_info)
		wifi_info->wifi_mdata.out_ppe_ds_node_id =
			ECM_WIFI_INVALID_DS_NODE_ID;

	if (!wifi_info ||
	    !(wifi_info->valid_params_flag & ECM_CLASSIFIER_WIFI_MLO_PARAM_VALID) ||
	    !wifi_info->wifi_mdata.dest_dev || !wifi_info->wifi_mdata.dest_mac)
		return 0;

	params.is_mlo_param_valid = 1;
	params.mlo_param.in_dest_dev = wifi_info->wifi_mdata.dest_dev;
	params.mlo_param.in_dest_mac = wifi_info->wifi_mdata.dest_mac;
	params.mlo_param.out_ppe_ds_node_id = ECM_WIFI_INVALID_DS_NODE_ID;
	metadata = ath_get_metadata_info(&params);

	wifi_info->wifi_mdata.out_ppe_ds_node_id =
		params.mlo_param.out_ppe_ds_node_id;
	if (params.ast_param.valid) {
		wifi_info->wifi_mdata.out_ast_valid = 1;
		wifi_info->wifi_mdata.out_ast_info = params.ast_param.ast_info;
		wifi_info->wifi_mdata.out_peer_id = params.ast_param.hw_peer_id;
	}

	return metadata;
}

static struct ecm_classifier_wifi_callbacks ecm_wifi_callbacks = {
	.get_wifi_metadata = ecm_wifi_get_metadata,
};

static int __init ecm_wifi_plugin_init(void)
{
	return ecm_classifier_wifi_callback_register(&ecm_wifi_callbacks);
}

static void __exit ecm_wifi_plugin_exit(void)
{
	ecm_classifier_wifi_callback_unregister();
}

module_init(ecm_wifi_plugin_init);
module_exit(ecm_wifi_plugin_exit);

MODULE_LICENSE("Dual BSD/GPL");
MODULE_DESCRIPTION("ECM ath12k Wi-Fi metadata bridge");

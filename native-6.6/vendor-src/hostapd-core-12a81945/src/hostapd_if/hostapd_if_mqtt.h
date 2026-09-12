/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

#ifndef HOSTAPD_IF_MQTT_H
#define HOSTAPD_IF_MQTT_H

#include "hostapd_if_common.h"

struct hapd_interfaces;
struct mqtt_tlv_message;

void hostapd_mqtt_hif_cmd(struct hapd_interfaces *interfaces,
			  uint16_t msg_type,
			  struct mqtt_tlv_message *msg);
enum hostapd_if_eloop_type hostapd_if_mqtt_init(void *arg);

#ifdef CONFIG_MQTT_TEST_APP_FORK
int hostapd_if_start_mqtt_hif_client(void);
void hostapd_if_stop_mqtt_hif_client(void);
#endif /* CONFIG_MQTT_TEST_APP_FORK */

#endif /* HOSTAPD_IF_MQTT_H */

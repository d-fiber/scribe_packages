// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

// This file is auto-generated do not edit manually.
// Run: poppin gen code

import type {
  AvatarType,
  CampaignAudience,
  ClientType,
  DeviceCategory,
  DeviceOs,
  DeviceThemeMode,
  FeedbackType,
  Gender,
  Localization,
  RemoteConfigAudience,
  SocialProvider,
} from "@scribe/core/contracts/enums.ts";

export interface InternalTAdminTopicMembersRow {
  topic: string;
  admin_id: string;
}

export interface InternalTAdminUsersRow {
  admin_id: string;
  role: string;
  email: string;
  is_email_verified: boolean;
  phone: string;
  is_phone_verified: boolean;
  created_at: number;
  updated_at: number;
}

export interface InternalTAdminUsersDevicesRow {
  id: string;
  admin_id: string;
  device_id: string;
  client: ClientType;
  os: DeviceOs;
  model: string;
  is_physical_device: boolean;
  device_category: DeviceCategory;
  app_version: string | null;
  hash: string | null;
  ip: string;
  city: string;
  country: string;
  created_at: number;
  updated_at: number;
  trusted_at: number;
}

export interface InternalTAdminUsersPermissionsRow {
  permission: string;
}

export interface InternalTAdminUsersProfilesRow {
  admin_id: string;
  avatar_type: AvatarType;
  avatar_url: string | null;
  avatar_blur_hash: string | null;
  avatar_text: string | null;
  avatar_background_color: string | null;
  avatar_placeholder: string | null;
  first_name: string;
  last_name: string;
  gender: Gender;
  birthday: number;
}

export interface InternalTAdminUsersRolePermissionsRow {
  role: string;
  permission: string;
}

export interface InternalTAdminUsersRolesRow {
  role: string;
}

export interface InternalTAdminUsersSettingsRow {
  admin_id: string;
  localization: Localization;
  theme_mode: DeviceThemeMode;
}

export interface InternalTAdminUsersVpnRow {
  admin_id: string;
  vpn_client_id: string;
  vpn_expires_at: number;
  vpn_is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface InternalTAppUserDevicesRow {
  id: string;
  user_id: string;
  device_id: string;
  client: ClientType;
  os: DeviceOs;
  model: string;
  app_version: string | null;
  is_physical_device: boolean;
  device_category: DeviceCategory;
  hash: string | null;
  notification_token: string | null;
  ip: string;
  city: string;
  country: string;
  location: { lat: number; lng: number } | null;
  created_at: number;
  updated_at: number;
  trusted_at: number;
}

export interface InternalTAppUserFeedbackRow {
  feedback_id: string;
  user_id: string;
  type: FeedbackType;
  message: string | null;
  created_at: number;
  updated_at: number;
}

export interface InternalTAppUserIssueReportsRow {
  issue_id: string;
  user_id: string;
  screen_url: string;
  log_file_url: string | null;
  message: string | null;
  created_at: number;
  updated_at: number;
}

export interface InternalTAppUserSettingsRow {
  user_id: string;
  localization: Localization;
  theme_mode: DeviceThemeMode;
}

export interface InternalTAppUsersRow {
  user_id: string;
  email: string | null;
  is_email_verified: boolean;
  phone: string | null;
  is_phone_verified: boolean;
  social_provider: SocialProvider | null;
  created_at: number;
  updated_at: number;
}

export interface InternalTDynamicLinkStatisticsRow {
  statistic_id: number;
  short_link_id: number;
  created_at: number;
  user_id: string | null;
  device_id: string | null;
  ip_address: unknown | null;
  user_agent: string | null;
  referer: string | null;
  outcome: string;
  platform: DeviceOs | null;
}

export interface InternalTDynamicLinksRow {
  short_link_id: number;
  slug: string;
  payload: Record<string, unknown>;
  user_id: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
}

export interface InternalTEmailCampaignsRow {
  email_campaign_id: number;
  email_template_id: number;
  audience: CampaignAudience;
  schedule_kind: string;
  scheduled_at: number | null;
  cron_expression: string | null;
  schedule_timezone: string;
  next_run_at: number | null;
  last_run_at: number | null;
  filters: Record<string, unknown> | null;
  data: Record<string, unknown> | null;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface InternalTEmailTemplatesRow {
  email_template_id: number;
  name: string;
  subject: string | null;
  html: string | null;
  text: string | null;
}

export interface InternalTInAppNotificationCampaignsRow {
  notification_campaign_id: number;
  notification_template_id: number;
  frequency_hours: number | null;
  scheduled_at: number | null;
  filters: Record<string, unknown> | null;
  is_active: boolean;
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface InternalTInAppNotificationOpensRow {
  open_id: number;
  notification_id: string;
  created_at: number;
}

export interface InternalTInAppNotificationReadsRow {
  user_id: string;
  last_read_at: number;
}

export interface InternalTInAppNotificationTemplatesRow {
  notification_template_id: number;
  name: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
}

export interface InternalTInAppNotificationsRow {
  notification_id: string;
  user_id: string;
  type: string;
  created_at: number;
  opened_at: number | null;
}

export interface InternalTMailStatisticsRow {
  statistic_id: number;
  mail_id: number;
  created_at: number;
  ip_address: unknown | null;
  user_agent: string | null;
}

export interface InternalTMailsRow {
  mail_id: number;
  email_template_id: number | null;
  recipient: string;
  subject: string | null;
  data: Record<string, unknown> | null;
  status: string;
  account: string;
  tracking_token: string;
  created_at: number;
  updated_at: number;
}

export interface InternalTNotificationPushOpensRow {
  open_id: number;
  push_id: number;
  created_at: number;
}

export interface InternalTNotificationPushesRow {
  push_id: number;
  notification_id: string;
  device_id: string;
  status: string;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface InternalTOtpPendingTokensRow {
  token_hash: string;
  expires_at: number;
}

export interface InternalTPushCampaignsRow {
  push_campaign_id: number;
  push_template_id: number;
  schedule_kind: string;
  scheduled_at: number | null;
  cron_expression: string | null;
  schedule_timezone: string;
  next_run_at: number | null;
  last_run_at: number | null;
  filters: Record<string, unknown> | null;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface InternalTPushTemplatesRow {
  push_template_id: number;
  name: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
}

export interface InternalTRemoteConfigStatisticsRow {
  statistic_id: number;
  remote_config_id: number;
  user_id: string | null;
  audience: RemoteConfigAudience;
  outcome: string;
  created_at: number;
}

export interface InternalTRemoteConfigsRow {
  remote_config_id: number;
  key: string;
  value: Record<string, unknown>;
  audience: RemoteConfigAudience;
  description: string | null;
  is_active: boolean;
  hash: string;
  created_at: number;
  updated_at: number;
}

export interface InternalTResponsesRow {
  response_id: string;
  target_type: string;
  target_id: string;
  admin_id: string | null;
  message: string | null;
  responded_at: number;
  updated_at: number;
}

export interface InternalTSmtpAccountsRow {
  smtp_account_id: number;
  name: string;
  host: string | null;
  port: number | null;
  username: string | null;
  password_encrypted: unknown | null;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface InternalTSyncEventsRow {
  id: number;
  scope: string;
  topic: string | null;
  entity: string;
  action: string;
  entity_id: string;
  recipient_id: string;
  occurred_at: number;
}

export interface InternalTUserTopicMembersRow {
  topic: string;
  user_id: string;
}

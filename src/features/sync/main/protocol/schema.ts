import protobuf from 'protobufjs';

const schema = `
syntax = "proto2";
package sync_pb;
message EncryptedData { optional string key_name=1; optional string blob=2; }
message UniquePosition { optional bytes value=1; optional bytes compressed_value=2; optional uint64 uncompressed_length=3; optional bytes custom_compressed_v1=4; }
message BookmarkSpecifics { optional string url=1; optional string legacy_canonicalized_title=3; optional int64 creation_time_us=4; optional string guid=10; optional string full_title=11; optional string parent_guid=14; optional int32 type=15; optional UniquePosition unique_position=16; }
message PreferenceSpecifics { optional string name=1; optional string value=2; }
message PasswordSpecificsData { optional int32 scheme=1; optional string signon_realm=2; optional string origin=3; optional string action=4; optional string username_element=5; optional string username_value=6; optional string password_element=7; optional string password_value=8; optional int64 date_created=11; optional bool blacklisted=12; optional int32 type=13; optional int32 times_used=14; optional string display_name=15; optional string avatar_url=16; optional string federation_url=17; optional int64 date_last_used=18; optional int64 date_password_modified_windows_epoch_micros=20; }
message PasswordSpecifics { optional EncryptedData encrypted=1; }
message TabNavigation { optional string virtual_url=2; optional string referrer=3; optional string title=4; optional int32 page_transition=6; optional int32 unique_id=8; optional int64 timestamp_msec=9; }
message SessionTab { optional int32 tab_id=1; optional int32 window_id=2; optional int32 tab_visual_index=3; optional int32 current_navigation_index=4; optional bool pinned=5; repeated TabNavigation navigation=7; optional int32 browser_type=13; }
message SessionWindow { optional int32 window_id=1; optional int32 selected_tab_index=2; optional int32 browser_type=3; repeated int32 tab=4; }
message SessionHeader { repeated SessionWindow window=2; optional string client_name=3; optional int32 device_form_factor=5; }
message SessionSpecifics { optional string session_tag=1; optional SessionHeader header=2; optional SessionTab tab=3; optional int32 tab_node_id=4; }
message GlobalIdDirective { repeated int64 global_id=1; optional int64 start_time_usec=2; optional int64 end_time_usec=3; }
message TimeRangeDirective { optional int64 start_time_usec=1; optional int64 end_time_usec=2; optional string app_id=3; }
message UrlDirective { optional string url=1; optional int64 end_time_usec=2; optional string app_id=3; }
message HistoryDeleteDirectiveSpecifics { optional GlobalIdDirective global_id_directive=1; optional TimeRangeDirective time_range_directive=2; optional UrlDirective url_directive=3; }
message HistorySpecifics {
 optional int64 visit_time_windows_epoch_micros=1; optional string originator_cache_guid=2;
 message RedirectEntry { optional int64 originator_visit_id=1; optional string url=2; optional string title=3; optional bool hidden=4; optional int32 redirect_type=5; }
 repeated RedirectEntry redirect_entries=3;
 message PageTransition { optional int32 core_transition=1; optional bool blocked=2; optional bool forward_back=3; optional bool from_address_bar=4; }
 optional PageTransition page_transition=4; optional int64 visit_duration_micros=7; optional int32 browser_type=8; optional int32 http_response_code=14;
}
message NigoriKey { optional string deprecated_name=1; optional bytes deprecated_user_key=2; optional bytes encryption_key=3; optional bytes mac_key=4; }
message NigoriKeyBag { repeated NigoriKey key=2; }
message NigoriSpecifics {
 optional EncryptedData encryption_keybag=1; optional bool keybag_is_frozen=2; optional bool encrypt_everything=24;
 optional int32 passphrase_type=30; optional EncryptedData keystore_decryptor_token=31; optional int64 custom_passphrase_time=33;
 optional int32 custom_passphrase_key_derivation_method=45; optional string custom_passphrase_key_derivation_salt=46;
}
message DeviceInfoSpecifics { optional string cache_guid=1; optional string client_name=2; optional string sync_user_agent=4; optional string signin_scoped_device_id=7; optional int64 last_updated_timestamp=8; optional int32 pulse_interval_in_minutes=13; optional int32 os_type=19; optional int32 device_form_factor=20; }
message EntitySpecifics { optional EncryptedData encrypted=1; optional BookmarkSpecifics bookmark=32904; optional PreferenceSpecifics preference=37702; optional PasswordSpecifics password=45873; optional NigoriSpecifics nigori=47745; optional SessionSpecifics session=50119; optional HistoryDeleteDirectiveSpecifics history_delete_directive=150251; optional DeviceInfoSpecifics device_info=154522; optional HistorySpecifics history=963985; }
message SyncEntity {
 optional string id_string=1; optional string parent_id_string=2; optional int64 version=4; optional int64 mtime=5; optional int64 ctime=6;
 optional string name=7; optional string non_unique_name=8; optional string server_defined_unique_tag=10; optional bool deleted=18;
 optional string originator_cache_guid=19; optional string originator_client_item_id=20; optional EntitySpecifics specifics=21;
 optional bool folder=22; optional string client_tag_hash=23; optional UniquePosition unique_position=25;
}
message DataTypeProgressMarker { optional int32 data_type_id=1; optional bytes token=2; }
message ClientConfigParams { repeated int32 enabled_type_ids=1; }
message CommitMessage { repeated SyncEntity entries=1; optional string cache_guid=2; optional ClientConfigParams config_params=4; }
message GetUpdatesMessage { optional bool fetch_folders=3; repeated DataTypeProgressMarker from_progress_marker=6; optional bool need_encryption_key=8; optional int32 get_updates_origin=9; optional bool is_retry=10; }
message ChipBag { optional bytes server_chips=1; }
message ClientStatus { optional bool is_sync_feature_enabled=2; }
message ClientToServerMessage { required string share=1; optional int32 protocol_version=2; required int32 message_contents=3; optional CommitMessage commit=4; optional GetUpdatesMessage get_updates=5; optional string store_birthday=7; optional ChipBag bag_of_chips=11; optional ClientStatus client_status=13; }
message CommitResponse {
 repeated group EntryResponse=1 { required int32 response_type=2; optional string id_string=3; optional int64 version=6; optional string error_message=9; }
}
message GetUpdatesResponse { repeated SyncEntity entries=1; optional int64 changes_remaining=4; repeated DataTypeProgressMarker new_progress_marker=5; repeated bytes encryption_keys=6; }
message ClientToServerResponse {
 optional CommitResponse commit=1; optional GetUpdatesResponse get_updates=2; optional int32 error_code=4; optional string error_message=5; optional string store_birthday=6;
 message Error { optional int32 error_type=1; optional string error_description=2; optional int32 action=4; repeated int32 error_data_type_ids=5; }
 optional Error error=13; optional ChipBag new_bag_of_chips=14;
}
`;
const root = protobuf.parse(schema, { keepCase: true }).root;
export function encodeProto(name: string, value: Record<string, unknown>): Buffer {
  const type = root.lookupType('sync_pb.' + name);
  return Buffer.from(type.encode(type.fromObject(value)).finish());
}
export function decodeProto<Value>(name: string, bytes: Uint8Array): Value {
  const type = root.lookupType('sync_pb.' + name);
  return type.toObject(type.decode(bytes), { longs: String, bytes: Buffer }) as Value;
}

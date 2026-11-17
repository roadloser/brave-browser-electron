import type { EncryptedData } from '../crypto/nigori';
import type { SyncLocalItem, SyncLocalType } from '../../../../shared/sync-data-ports';
import type { SessionSpecifics } from './session-controller';

export type Specifics = {
 encrypted?: EncryptedData; bookmark?: Record<string, unknown>; preference?: { name?: string; value?: string };
 history?: Record<string, unknown>; nigori?: NigoriSpecifics; device_info?: Record<string, unknown>;
 password?: { encrypted?: EncryptedData };
 session?: SessionSpecifics;
 history_delete_directive?: { global_id_directive?: { global_id?: string[]; start_time_usec?: string; end_time_usec?: string }; time_range_directive?: { start_time_usec?: string; end_time_usec?: string; app_id?: string }; url_directive?: { url?: string; end_time_usec?: string; app_id?: string } };
};
export type NigoriSpecifics = {
 encryption_keybag?: EncryptedData; keybag_is_frozen?: boolean; encrypt_everything?: boolean; passphrase_type?: number;
 custom_passphrase_key_derivation_method?: number; custom_passphrase_key_derivation_salt?: string; custom_passphrase_time?: string;
};
export type SyncEntity = {
 id_string?: string; parent_id_string?: string; version?: string; mtime?: string; ctime?: string; name?: string;
 server_defined_unique_tag?: string; deleted?: boolean; originator_cache_guid?: string; originator_client_item_id?: string;
 specifics?: Specifics; folder?: boolean; client_tag_hash?: string; unique_position?: Record<string, unknown>;
};
export type ProgressMarker = { data_type_id: number; token?: Buffer };
export type SyncResponse = {
 commit?: Record<string, unknown>; get_updates?: { entries?: SyncEntity[]; changes_remaining?: string; new_progress_marker?: ProgressMarker[] };
 error_code?: number; error_message?: string; store_birthday?: string; error?: { error_type?: number; error_description?: string };
 new_bag_of_chips?: { server_chips?: Buffer };
};
export type CommitResult = { response_type: number; id_string?: string; version?: string; error_message?: string };
export type SyncRequestContext = {
 words: string; endpoint: string; serviceKey?: string; deviceId: string;
 birthday?: string; chips?: string; signal: AbortSignal;
};
export interface SyncProtocolPort {
 readonly id: string;
 readonly version: string;
 getUpdates(context: SyncRequestContext, markers: ProgressMarker[]): Promise<SyncResponse>;
 commit(context: SyncRequestContext, entities: SyncEntity[], dataTypes: number[]): Promise<SyncResponse>;
}
export type SyncedEntity = {
 type: SyncLocalType; localId: string; serverId: string; version: string;
 hash: string; item: SyncLocalItem | null; wire: SyncEntity;
};

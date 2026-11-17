import { build } from 'plist';
import type { VpnConfiguration } from './tunnel-port';

export function vpnProfileDocument(configuration: VpnConfiguration): string {
  return build({
    PayloadType: 'Configuration', PayloadVersion: 1, PayloadUUID: configuration.id,
    PayloadIdentifier: configuration.payloadIdentifier,
    PayloadDisplayName: 'Brave Electron VPN', PayloadOrganization: 'Brave Electron',
    PayloadDescription: `Guardian IKEv2 · ${configuration.region.name}。安装后由本应用管理连接。`,
    PayloadRemovalDisallowed: false,
    PayloadContent: [{
      PayloadType: 'com.apple.vpn.managed', PayloadVersion: 1,
      PayloadUUID: configuration.tunnelId, PayloadIdentifier: `${configuration.payloadIdentifier}.ikev2`,
      PayloadDisplayName: 'Brave Electron VPN', UserDefinedName: configuration.serviceName,
      VPNType: 'IKEv2', OnDemandEnabled: 0,
      IPv4: { OverridePrimary: 1 },
      IKEv2: {
        RemoteAddress: configuration.hostname, RemoteIdentifier: configuration.hostname,
        ServerCertificateCommonName: configuration.hostname,
        AuthenticationMethod: 'None',
        ExtendedAuthEnabled: 1, AuthName: configuration.username, AuthPassword: configuration.password,
        EnablePFS: 1, DisableMOBIKE: 0, DeadPeerDetectionRate: 'Low',
        UseConfigurationAttributeInternalIPSubnet: 0, IncludeAllNetworks: 1, EnforceRoutes: 1,
        IKESecurityAssociationParameters: { EncryptionAlgorithm: 'AES-256', IntegrityAlgorithm: 'SHA2-384', DiffieHellmanGroup: 20, LifeTimeInMinutes: 1440 },
        ChildSecurityAssociationParameters: { EncryptionAlgorithm: 'AES-256-GCM', DiffieHellmanGroup: 20, LifeTimeInMinutes: 480 },
      },
    }],
  });
}

export const HOSTED_REF_WORKSTREAM_BY_KEY = Object.freeze({
  backend_host: 'deployment',
  dns_tls: 'deployment',
  durable_storage: 'deployment',
  backup_restore: 'resilience',
  relay_deployment: 'deployment',
  gateway_deployment: 'deployment',
  kms_or_secret_custody: 'security',
  runtime_auth: 'security',
  admin_auth: 'security',
  data_plane_auth: 'security',
  network_access_policy: 'security',
  kms_custody: 'security',
  public_site_security: 'security',
  security_threat_model: 'security',
  monitoring: 'operations',
  siem_or_log_sink: 'operations',
  monitoring_alerting: 'operations',
  support_sla: 'operations',
  incident_drill: 'operations',
  backup_restore_drill: 'resilience',
  operator_acceptance: 'governance',
  tenant_policy_approval: 'governance',
  legal_compliance_approval: 'governance',
  usage_metering: 'commercial',
  service_settlement: 'commercial',
});

export const HOSTED_REF_WORKSTREAM_ORDER = Object.freeze([
  'deployment',
  'security',
  'resilience',
  'operations',
  'governance',
  'commercial',
  'other',
]);

export function groupHostedRefsByWorkstream(refs) {
  const groups = {};
  for (const ref of Array.isArray(refs) ? refs : []) {
    const group = HOSTED_REF_WORKSTREAM_BY_KEY[ref] ?? 'other';
    if (!Array.isArray(groups[group])) groups[group] = [];
    groups[group].push(ref);
  }
  return Object.fromEntries(HOSTED_REF_WORKSTREAM_ORDER
    .filter((group) => Array.isArray(groups[group]) && groups[group].length > 0)
    .map((group) => [group, groups[group]]));
}

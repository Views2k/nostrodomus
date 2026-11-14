// Pre-create the gitignored HA state dir (config/www included) HOST-OWNED,
// before `docker compose up` runs. Three reasons (tools/e2e/README.md):
// - if Docker creates a missing bind-mount source it does so as root, which
//   breaks host-side seeding and the `rm -rf` disposability contract;
// - HA only registers the /local/ static path if config/www exists at boot,
//   so www/ must exist before the container's first start;
// - HA's auto-generated configuration.yaml loads `default_config`, which pulls
//   zeroconf/ssdp/dhcp/usb/bluetooth. Those need multicast/hardware the e2e
//   container's bridge network can't provide and crash HA on boot
//   (OSError: [Errno 19] No such device, IP_ADD_MEMBERSHIP). A disposable test
//   instance needs no network discovery, so we write a host-owned config with
//   default_config expanded MINUS those integrations before first boot. Written
//   only if absent, so it never clobbers an existing (seeded) state on re-runs.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { log, statePaths } from './ha_api.mjs';

const paths = statePaths();
mkdirSync(paths.www, { recursive: true });

// default_config's dependencies (per the HA image's
// homeassistant/components/default_config/manifest.json), MINUS the
// network-discovery / hardware integrations that crash in the bridge net:
//   zeroconf, ssdp, dhcp, usb, bluetooth
// Everything else default_config provides is kept (incl. `config:` and
// `mobile_app:`, which the seed's script/automation API writes depend on).
const CONFIG_YAML = `# Loads default set of integrations. Do not remove.
# default_config expanded minus zeroconf/ssdp/dhcp/usb/bluetooth
# (disposable e2e instance: no network discovery, no hardware — avoids the
#  multicast/socket 'No such device' boot crash in the container bridge net)
assist_pipeline:
cloud:
conversation:
energy:
file:
go2rtc:
history:
homeassistant_alerts:
logbook:
media_source:
mobile_app:
my:
stream:
sun:
usage_prediction:
webhook:
# Load frontend themes from the themes folder
frontend:
  themes: !include_dir_merge_named themes
automation: !include automations.yaml
script: !include scripts.yaml
scene: !include scenes.yaml
`;

const configFile = join(paths.config, 'configuration.yaml');
if (!existsSync(configFile)) {
  writeFileSync(configFile, CONFIG_YAML);
  log('wrote host-owned zeroconf-free configuration.yaml (default_config minus discovery/hardware)');
  // The config !includes these; they must exist or HA fails to boot. Empty is
  // fine — HA's storage-mode seed (script/automation API) does not need them
  // populated, but the include targets must be present.
  for (const f of ['automations.yaml', 'scripts.yaml', 'scenes.yaml']) {
    const target = join(paths.config, f);
    if (!existsSync(target)) writeFileSync(target, f === 'scripts.yaml' ? '{}\n' : '[]\n');
  }
} else {
  log('configuration.yaml already present — left as-is (existing state)');
}

log(`state dir ready: ${paths.dir} (config/www pre-created host-owned)`);

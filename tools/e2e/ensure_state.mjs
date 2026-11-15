// Creates the git-ignored state directory, config/www included, before `docker compose up`
// (see tools/e2e/README.md):
// - Docker creates a missing bind-mount source as root. The host-side scripts then cannot write
//   to it, and deleting the state directory needs root.
// - Home Assistant serves /local/ only if config/www exists when it starts.
// - The configuration.yaml that Home Assistant generates loads default_config, which includes
//   zeroconf, ssdp, dhcp, usb and bluetooth. They need multicast or hardware that the container's
//   bridge network does not have, and stop Home Assistant from starting (OSError: [Errno 19] No
//   such device, IP_ADD_MEMBERSHIP). This script writes a configuration.yaml with the other
//   integrations of default_config instead. An existing configuration.yaml is left alone.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { log, statePaths } from './ha_api.mjs';

const paths = statePaths();
mkdirSync(paths.www, { recursive: true });

// The dependencies of default_config (homeassistant/components/default_config/manifest.json in
// the image) without zeroconf, ssdp, dhcp, usb and bluetooth.
const CONFIG_YAML = `# Written by tools/e2e/ensure_state.mjs: the integrations of default_config
# without zeroconf, ssdp, dhcp, usb and bluetooth, which cannot start on the
# container's bridge network.
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
  // configuration.yaml includes these files, and Home Assistant does not start when one is
  // missing. They can be empty.
  for (const f of ['automations.yaml', 'scripts.yaml', 'scenes.yaml']) {
    const target = join(paths.config, f);
    if (!existsSync(target)) writeFileSync(target, f === 'scripts.yaml' ? '{}\n' : '[]\n');
  }
} else {
  log('configuration.yaml already present — left as-is (existing state)');
}

log(`state dir ready: ${paths.dir} (config/www pre-created host-owned)`);

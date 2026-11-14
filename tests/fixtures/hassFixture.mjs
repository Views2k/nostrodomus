// Synthetic Home Assistant `hass` fixture for runtime-data behavioral tests.
// Shapes are copied structurally from real HA payloads (states entries carry
// attributes.friendly_name; services carry fields keyed by field name with
// selector/description/advanced/required/example; themes nest under
// hass.themes.themes). Includes deliberately hostile entries so fail-dark
// behavior is provable: an entity id that fails the identifier regex, an
// over-long friendly_name, a state object with no attributes, a field whose
// name fails the identifier regex, and a selector-absent field.

function stateEntry(entityId, state, attributes) {
  const entry = { entity_id: entityId, state };
  if (attributes !== undefined) entry.attributes = attributes;
  return entry;
}

const BASE_STATES = {
  'light.kitchen': stateEntry('light.kitchen', 'on', { friendly_name: 'Kitchen Light' }),
  'light.living_room': stateEntry('light.living_room', 'off', { friendly_name: 'Living Room Lamp' }),
  'light.bedroom': stateEntry('light.bedroom', 'off', { friendly_name: 'Bedroom Light' }),
  'sensor.outdoor_temperature': stateEntry('sensor.outdoor_temperature', '18.4', { friendly_name: 'Outdoor Temperature', unit_of_measurement: '°C' }),
  'sensor.humidity': stateEntry('sensor.humidity', '52', { unit_of_measurement: '%' }),
  'sensor.power_usage': stateEntry('sensor.power_usage', '430', { friendly_name: 'Power Usage', unit_of_measurement: 'W' }),
  'switch.coffee_maker': stateEntry('switch.coffee_maker', 'off', { friendly_name: 'Coffee Maker' }),
  'switch.garden_pump': stateEntry('switch.garden_pump', 'off', { friendly_name: 'Garden Pump' }),
  'climate.thermostat': stateEntry('climate.thermostat', 'heat', { friendly_name: 'Thermostat', current_temperature: 20.5 }),
  'climate.upstairs': stateEntry('climate.upstairs', 'off', { friendly_name: 'Upstairs Climate' }),
  'binary_sensor.front_door': stateEntry('binary_sensor.front_door', 'off', { friendly_name: 'Front Door', device_class: 'door' }),
  'binary_sensor.motion_hall': stateEntry('binary_sensor.motion_hall', 'off', { friendly_name: 'Hall Motion', device_class: 'motion' }),
  'media_player.tv': stateEntry('media_player.tv', 'idle', { friendly_name: 'Living Room TV' }),
  'media_player.speaker': stateEntry('media_player.speaker', 'playing', { friendly_name: 'Kitchen Speaker' }),
  'script.morning_routine': stateEntry('script.morning_routine', 'off', { friendly_name: 'Morning Routine' }),
  'script.bedtime': stateEntry('script.bedtime', 'off', { friendly_name: 'Bedtime' }),
  'automation.lights_off': stateEntry('automation.lights_off', 'on', { friendly_name: 'Lights Off At Night' }),
  'automation.wake_up': stateEntry('automation.wake_up', 'on', { friendly_name: 'Wake Up' }),
  'cover.garage_door': stateEntry('cover.garage_door', 'closed', { friendly_name: 'Garage Door' }),
  'fan.bedroom_fan': stateEntry('fan.bedroom_fan', 'off', { friendly_name: 'Bedroom Fan' }),
  'lock.front_door_lock': stateEntry('lock.front_door_lock', 'locked', { friendly_name: 'Front Door Lock' }),
  'person.test_user': stateEntry('person.test_user', 'home', { friendly_name: 'Test User' }),
  'scene.movie_night': stateEntry('scene.movie_night', 'scening', { friendly_name: 'Movie Night' }),
  'vacuum.robot': stateEntry('vacuum.robot', 'docked', { friendly_name: 'Robot Vacuum' }),
  'weather.home': stateEntry('weather.home', 'partlycloudy', { friendly_name: 'Home Weather' }),
  // Hostile: id fails the entity identifier regex (hyphen + punctuation).
  'light.bad-id!': stateEntry('light.bad-id!', 'on', { friendly_name: 'Bad Id Light' }),
  // Hostile: 300-char friendly_name must be length-capped by the consumer.
  'sensor.long_name': stateEntry('sensor.long_name', '1', { friendly_name: 'X'.repeat(300) }),
  // Hostile: state object missing `attributes` entirely.
  'switch.no_attributes': stateEntry('switch.no_attributes', 'off'),
};

const BASE_SERVICES = {
  light: {
    turn_on: {
      name: 'Turn on',
      description: 'Turn on one or more lights and adjust their properties.',
      fields: {
        transition: {
          name: 'Transition',
          description: 'Duration it takes to get to next state.',
          selector: { number: { min: 0, max: 300, unit_of_measurement: 'seconds' } },
        },
        rgb_color: {
          name: 'Color',
          description: 'The color in RGB format. A list of three integers between 0 and 255.',
          example: '[255, 100, 100]',
          selector: { color_rgb: null },
        },
        brightness_pct: {
          name: 'Brightness',
          description: 'Number indicating the percentage of full brightness.',
          selector: { number: { min: 0, max: 100, unit_of_measurement: '%' } },
        },
        effect: {
          name: 'Effect',
          description: 'Light effect.',
          selector: { select: { options: ['colorloop', 'random'] } },
        },
      },
      target: { entity: [{ domain: ['light'] }] },
    },
    turn_off: {
      name: 'Turn off',
      description: 'Turn off one or more lights.',
      fields: {
        transition: {
          name: 'Transition',
          description: 'Duration it takes to get to next state.',
          selector: { number: { min: 0, max: 300, unit_of_measurement: 'seconds' } },
        },
      },
      target: { entity: [{ domain: ['light'] }] },
    },
    toggle: {
      name: 'Toggle',
      description: 'Toggles one or more lights.',
      fields: {
        // Advanced-field shape as HA emits it.
        flash: {
          name: 'Flash',
          description: 'Tell light to flash, can be either value short or long.',
          advanced: true,
          selector: { select: { options: ['long', 'short'] } },
        },
      },
      target: { entity: [{ domain: ['light'] }] },
    },
  },
  climate: {
    set_temperature: {
      name: 'Set target temperature',
      description: 'Sets the temperature setpoint.',
      fields: {
        temperature: {
          name: 'Target temperature',
          description: 'The temperature setpoint.',
          required: false,
          selector: { number: { min: 0, max: 250, step: 0.1, mode: 'box' } },
        },
        hvac_mode: {
          name: 'HVAC mode',
          description: 'HVAC operation mode.',
          selector: { select: { options: ['off', 'auto', 'cool', 'heat'] } },
        },
      },
      target: { entity: [{ domain: ['climate'] }] },
    },
  },
  script: {
    // Empty-fields shape.
    turn_on: {
      name: 'Turn on',
      description: 'Runs the sequence of actions defined in a script.',
      fields: {},
      target: { entity: [{ domain: ['script'] }] },
    },
  },
  notify: {
    notify: {
      name: 'Send a notification',
      description: 'Sends a notification message.',
      fields: {
        // Selector-absent shape: bare description only.
        message: { description: 'Message body of the notification.', example: 'The garage door has been open for 10 minutes.' },
        title: { description: 'Title for your notification.' },
      },
    },
  },
  mqtt: {
    publish: {
      name: 'Publish',
      description: 'Publishes a message to an MQTT topic.',
      fields: {
        topic: { name: 'Topic', description: 'Topic to publish to.', required: true, selector: { text: null } },
        // Hostile: field name fails the identifier regex.
        'bad-field name!': { name: 'Bad', description: 'Hostile field name that must be skipped.', selector: { text: null } },
      },
    },
  },
  homeassistant: {
    turn_on: {
      name: 'Generic turn on',
      description: 'Generic action to turn devices on.',
      fields: {},
      target: { entity: [{}] },
    },
  },
};

const BASE_THEMES = {
  'Dark Mode': { 'primary-color': '#111111' },
  Solarized: { 'primary-color': '#268bd2' },
  'ios-dark': { 'primary-color': '#000000' },
};

// Registry collections — objects keyed by id (real HA frontend shape). Areas/floors/labels
// carry readable slug ids; devices carry opaque ids and prefer name_by_user over name. Includes a
// hostile id (fails the identifier regex) so fail-dark filtering is provable.
const BASE_AREAS = {
  living_room: { area_id: 'living_room', name: 'Living Room', floor_id: 'ground' },
  kitchen: { area_id: 'kitchen', name: 'Kitchen', floor_id: 'ground' },
  'bad area!': { area_id: 'bad area!', name: 'Hostile Area' },
};

const BASE_DEVICES = {
  abc123: { id: 'abc123', name: 'Hue Bridge', name_by_user: 'Living Room Hub', area_id: 'living_room' },
  def456: { id: 'def456', name: 'Thermostat' },
};

const BASE_FLOORS = {
  ground: { floor_id: 'ground', name: 'Ground Floor', level: 0 },
  upstairs: { floor_id: 'upstairs', name: 'Upstairs', level: 1 },
};

const BASE_LABELS = {
  cozy: { label_id: 'cozy', name: 'Cozy', color: 'amber' },
  security: { label_id: 'security', name: 'Security', color: 'red' },
};

export function makeHassFixture(overrides = {}) {
  return {
    states: { ...BASE_STATES, ...(overrides.states || {}) },
    services: { ...BASE_SERVICES, ...(overrides.services || {}) },
    themes: { themes: { ...BASE_THEMES, ...(overrides.themes || {}) } },
    areas: { ...BASE_AREAS, ...(overrides.areas || {}) },
    devices: { ...BASE_DEVICES, ...(overrides.devices || {}) },
    floors: { ...BASE_FLOORS, ...(overrides.floors || {}) },
    labels: { ...BASE_LABELS, ...(overrides.labels || {}) },
    ...(overrides.extra || {}),
  };
}

export const FIXTURE_VALID_ENTITY_COUNT = Object.keys(BASE_STATES).filter(id => /^[a-z_]+\.[a-z0-9_]+$/i.test(id)).length;

export const FIXTURE_SERVICE_IDS = Object.entries(BASE_SERVICES)
  .flatMap(([domain, svcMap]) => Object.keys(svcMap).map(service => `${domain}.${service}`))
  .sort();

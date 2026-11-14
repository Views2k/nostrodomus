// Synthetic window.customCards registry fixture.
// Real custom cards self-register by pushing objects shaped like
// { type, name, description?, preview?, documentationURL? } onto
// window.customCards. Includes hostile entries (missing type, non-object)
// that a consumer must skip silently, an already-prefixed type, a duplicate
// entry, an entry whose type collides with a hardcoded native card name,
// and an over-long description that must be length-capped.

export function makeCustomCardsFixture() {
  return [
    {
      type: 'button-card',
      name: 'Button Card',
      description: 'Lovelace button-card for Home Assistant.',
      preview: false,
      documentationURL: 'https://github.com/custom-cards/button-card',
    },
    {
      // Type already carries the custom: prefix — must not be double-prefixed.
      type: 'custom:mini-graph-card',
      name: 'Mini Graph Card',
      description: 'Minimalistic graph card for Home Assistant Lovelace UI.',
    },
    {
      // Duplicate of the first entry's type — must be deduped.
      type: 'button-card',
      name: 'Button Card (duplicate registration)',
    },
    {
      // Collides with a hardcoded native card name after normalization
      // (custom:button vs native button) — both must survive as distinct types.
      type: 'button',
      name: 'Button',
      description: 'A custom card that reuses a native card name.',
    },
    {
      type: 'long-desc-card',
      name: 'Long Description Card',
      description: 'y'.repeat(500),
    },
    {
      // Hostile: missing type — must be skipped.
      name: 'No Type Card',
      description: 'Entry without a type field.',
    },
    // Hostile: non-object entry — must be skipped.
    'garbage-string-entry',
    {
      type: 'mushroom-template-card',
      name: 'Mushroom Template Card',
      description: 'Build your own mushroom card.',
      preview: true,
    },
  ];
}

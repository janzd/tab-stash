// Shared by the early appearance script and the Settings page.
globalThis.TabStashPalettes = Object.freeze({
  defaultId: 'blue',
  presets: Object.freeze([
    { id: 'blue', name: 'Blue', description: 'Cool blue accents and clear, neutral surfaces.' },
    { id: 'sage', name: 'Sage', description: 'Soft greens for a calm, familiar space.' },
    { id: 'violet', name: 'Violet', description: 'Gentle lavender with a little personality.' },
    { id: 'amber', name: 'Amber', description: 'Warm gold accents with a natural glow.' }
  ].map(Object.freeze))
});

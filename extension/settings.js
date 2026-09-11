const catalog = globalThis.TabStashPalettes;
const control = document.querySelector('#palette-control');
for (const palette of catalog.presets) {
  const choice = document.createElement('div');
  choice.className = 'palette-choice';
  // The catalog is packaged, trusted metadata, never user or imported content.
  choice.innerHTML = `
    <input class="sr-only" type="radio" name="palette" id="palette-${palette.id}" value="${palette.id}" aria-label="${palette.name}" aria-describedby="${palette.id}-description">
    <label class="palette-card" for="palette-${palette.id}">
      <span class="palette-previews" aria-hidden="true">${['light', 'dark'].map(mode => `
        <span class="palette-preview" data-palette="${palette.id}" data-theme="${mode}">
          <span class="preview-sidebar"><i class="preview-logo"></i><i class="preview-nav"></i><i class="preview-nav short"></i></span>
          <span class="preview-page"><span class="preview-mode">${mode === 'light' ? 'Light' : 'Dark'}</span><i class="preview-title"></i><i class="preview-copy"></i><span class="preview-cards"><i></i><i></i><i></i></span><i class="preview-button"></i></span>
        </span>`).join('')}</span>
      <span class="palette-card-heading"><span class="palette-name">${palette.name}</span>${palette.id === catalog.defaultId ? '<span class="palette-default">Default</span>' : ''}<span class="palette-check" aria-hidden="true">✓</span></span>
      <span class="palette-description" id="${palette.id}-description">${palette.description}</span>
    </label>`;
  control.append(choice);
}

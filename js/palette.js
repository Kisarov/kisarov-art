const readPaletteColor = (() => {
  let context;

  return name => {
    const css = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!CSS.supports('color', css)) throw new Error(`Invalid palette color ${name}: ${css}`);
    if (!context) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      context = canvas.getContext('2d', { willReadFrequently: true });
    }

    context.clearRect(0, 0, 1, 1);
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const rgba = Array.from(context.getImageData(0, 0, 1, 1).data, channel => channel / 255);
    return { css, rgba };
  };
})();

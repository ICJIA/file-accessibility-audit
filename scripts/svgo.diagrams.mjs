// SVGO config for the pre-generated Mermaid diagram SVGs. Conservative on
// purpose: mermaid output references many internal IDs (arrowhead markers,
// clip-paths) via url(#id) and bakes the dark-theme colors into a <style>
// block — so cleanupIds, inlineStyles, and removeViewBox are all disabled to
// avoid breaking arrows, colors, or scaling. The remaining plugins still
// strip the bulky metadata/comments/whitespace mermaid emits.
export default {
  multipass: true,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          removeViewBox: false,
          inlineStyles: false,
          cleanupIds: false,
          minifyStyles: false,
        },
      },
    },
  ],
};

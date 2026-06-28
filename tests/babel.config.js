// Transforms the app's ESM source (Patient/src, Therapist/shared) to CJS so Jest
// can require it. Targets the running Node so no unnecessary down-levelling.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};

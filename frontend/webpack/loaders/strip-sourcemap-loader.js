module.exports = function stripSourceMapLoader(source) {
  this.cacheable && this.cacheable();
  const pattern = /\/\/# sourceMappingURL=.*$/gm;
  const cssPattern = /\/\*# sourceMappingURL=.*?\*\//gm;
  return source.replace(pattern, '').replace(cssPattern, '');
};

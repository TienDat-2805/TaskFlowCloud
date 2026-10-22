export function formatDiagnostic(value, privateValues = []) {
  let text = String(value ?? '');
  for (const privateValue of privateValues)
    if (privateValue) text = text.replaceAll(privateValue, '[redacted]');
  return text
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[redacted database URI]')
    .replace(/((?:set-cookie|cookie|authorization)\s*:\s*)[^\r\n]+/gi, '$1[redacted]')
    .slice(-12_000);
}

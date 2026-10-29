const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function scriptKindFor(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.d.ts')) return ts.ScriptKind.TS;
  if (file.endsWith('.ts')) return ts.ScriptKind.TS;
  if (file.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.Unknown;
}

function isWhitespaceOnly(s) {
  return /^[ \t\r]*$/.test(s);
}

function widenToWholeLineIfStandalone(text, start, end) {
  let lineStart = text.lastIndexOf('\n', start - 1) + 1;
  let lineEndNl = text.indexOf('\n', end);
  const afterEnd = lineEndNl === -1 ? text.length : lineEndNl;
  const before = text.slice(lineStart, start);
  const after = text.slice(end, afterEnd);
  if (isWhitespaceOnly(before) && isWhitespaceOnly(after)) {
    const newEnd = lineEndNl === -1 ? text.length : lineEndNl + 1;
    return [lineStart, newEnd];
  }
  return [start, end];
}

function collectCommentRanges(sourceFile) {
  const text = sourceFile.text;
  const ranges = [];

  function visitToken(node) {
    const fullStart = node.getFullStart();
    const leading = ts.getLeadingCommentRanges(text, fullStart) || [];
    for (const r of leading) ranges.push([r.pos, r.end]);
  }

  function walk(node) {
    if (node.getChildCount(sourceFile) === 0) {
      visitToken(node);
    } else {
      node.getChildren(sourceFile).forEach(walk);
    }
  }

  walk(sourceFile);
  const eof = sourceFile.endOfFileToken;
  if (eof) visitToken(eof);

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    if (merged.length && r[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    } else {
      merged.push(r);
    }
  }
  return merged;
}

function removeRanges(text, rawRanges) {
  const widened = rawRanges.map(([s, e]) => widenToWholeLineIfStandalone(text, s, e));
  widened.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of widened) {
    if (merged.length && r[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    } else {
      merged.push(r);
    }
  }
  let out = '';
  let last = 0;
  for (const [start, end] of merged) {
    out += text.slice(last, start);
    last = end;
  }
  out += text.slice(last);
  return out;
}

function parseDiagCount(text, file) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, scriptKindFor(file));
  return (sf.parseDiagnostics || []).length;
}

function stripJsLike(file) {
  const original = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, scriptKindFor(file));
  const ranges = collectCommentRanges(sourceFile);
  if (ranges.length === 0) return { changed: false };

  const out = removeRanges(original, ranges);
  if (out === original) return { changed: false };

  const beforeDiag = parseDiagCount(original, file);
  const afterDiag = parseDiagCount(out, file);
  if (afterDiag > beforeDiag) {
    return { changed: false, error: `new parse diagnostics (before=${beforeDiag} after=${afterDiag})` };
  }

  const nonWsBefore = original.replace(/\s/g, '').length;
  const nonWsAfter = out.replace(/\s/g, '').length;
  if (nonWsAfter > nonWsBefore) {
    return { changed: false, error: 'non-whitespace length grew (impossible)' };
  }
  const dropped = nonWsBefore - nonWsAfter;
  if (dropped > nonWsBefore * 0.5) {
    return { changed: false, error: `suspiciously large drop in non-whitespace chars (${dropped}/${nonWsBefore})` };
  }

  fs.writeFileSync(file, out, 'utf8');
  return { changed: true };
}

function stripCss(file) {
  const original = fs.readFileSync(file, 'utf8');
  const ranges = [];
  let i = 0;
  const n = original.length;
  let inString = null;
  while (i < n) {
    const c = original[i];
    if (inString) {
      if (c === '\\' && i + 1 < n) { i += 2; continue; }
      if (c === inString) inString = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") { inString = c; i += 1; continue; }
    if (c === '/' && original[i + 1] === '*') {
      const close = original.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      ranges.push([i, end]);
      i = end;
      continue;
    }
    i += 1;
  }

  if (ranges.length === 0) return { changed: false };
  const out = removeRanges(original, ranges);
  if (out === original) return { changed: false };

  const openBefore = (original.match(/\{/g) || []).length;
  const closeBefore = (original.match(/\}/g) || []).length;
  const openAfter = (out.match(/\{/g) || []).length;
  const closeAfter = (out.match(/\}/g) || []).length;
  if (openBefore !== openAfter || closeBefore !== closeAfter) {
    return { changed: false, error: 'css brace balance changed' };
  }
  fs.writeFileSync(file, out, 'utf8');
  return { changed: true };
}

const files = process.argv.slice(2);
const results = { changed: [], unchanged: [], failed: [] };

for (const file of files) {
  const abs = path.resolve(file);
  try {
    const isCss = /\.(css|scss|less)$/.test(file);
    const res = isCss ? stripCss(abs) : stripJsLike(abs);
    if (res.error) results.failed.push({ file, error: res.error });
    else if (res.changed) results.changed.push(file);
    else results.unchanged.push(file);
  } catch (e) {
    results.failed.push({ file, error: e.message });
  }
}

console.log('=== CHANGED ===');
results.changed.forEach(f => console.log('  ' + f));
console.log('=== UNCHANGED (no comments found) ===');
results.unchanged.forEach(f => console.log('  ' + f));
console.log('=== FAILED (left untouched, needs manual review) ===');
results.failed.forEach(r => console.log('  ' + r.file + '  -- ' + r.error));

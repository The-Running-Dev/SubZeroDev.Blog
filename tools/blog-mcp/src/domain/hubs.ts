import ts from 'typescript';
import { PreconditionError } from '../errors.js';

export interface HubEntry {
  label?: string;
  title: string;
  description: string;
  href: string;
}

export interface ParsedHubEntry extends HubEntry {
  start: number;
  end: number;
}

function findEntriesArray(sourceText: string, filePath: string): { sourceFile: ts.SourceFile; array: ts.ArrayLiteralExpression } {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.ArrayLiteralExpression | undefined;

  function visit(node: ts.Node): void {
    if (found) return;

    // Object-literal shape: `{ entries: [...] }`
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'entries' &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      found = node.initializer;
      return;
    }

    // JSX attribute shape actually used by this repo's hub pages:
    // `<ContentHub entries={[...]} ... />`
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(sourceFile) === 'entries' &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      ts.isArrayLiteralExpression(node.initializer.expression)
    ) {
      found = node.initializer.expression;
      return;
    }

    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!found) {
    throw new PreconditionError(`Could not locate an 'entries' array literal in ${filePath}.`);
  }
  return { sourceFile, array: found };
}

function stringLiteralValue(node: ts.Expression): string | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  return undefined;
}

/** Reads every {label?, title, description, href} object out of a hub's `entries` array, in source order. */
export function readHubEntries(sourceText: string, filePath: string): ParsedHubEntry[] {
  const { array } = findEntriesArray(sourceText, filePath);
  const entries: ParsedHubEntry[] = [];

  for (const element of array.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue;
    const fields: Record<string, string> = {};
    for (const prop of element.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
      const value = stringLiteralValue(prop.initializer);
      if (value !== undefined) fields[prop.name.text] = value;
    }
    entries.push({
      ...(fields.label !== undefined ? { label: fields.label } : {}),
      title: fields.title ?? '',
      description: fields.description ?? '',
      href: fields.href ?? '',
      start: element.getStart(),
      end: element.getEnd()
    });
  }

  return entries;
}

function quoteJs(value: string): string {
  if (value.includes("'") && !value.includes('"')) {
    return `"${value}"`;
  }
  const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `'${escaped}'`;
}

function indentOfLineContaining(sourceText: string, offset: number): string {
  const lineStart = sourceText.lastIndexOf('\n', offset) + 1;
  const match = /^[ \t]*/.exec(sourceText.slice(lineStart));
  return match ? match[0] : '';
}

function buildEntryText(entry: HubEntry, indent: string): string {
  const fieldIndent = `${indent}  `;
  const fields: string[] = [];
  if (entry.label) fields.push(`${fieldIndent}label: ${quoteJs(entry.label)},`);
  fields.push(`${fieldIndent}title: ${quoteJs(entry.title)},`);
  fields.push(`${fieldIndent}description: ${quoteJs(entry.description)},`);
  fields.push(`${fieldIndent}href: ${quoteJs(entry.href)}`);
  return `${indent}{\n${fields.join('\n')}\n${indent}}`;
}

export interface InsertHubEntryOptions {
  /** 0-based index to insert before; omitted or >= current length appends at the end. */
  position?: number;
}

/**
 * Splices a new entry object into a hub's `entries` array by text range,
 * not by re-printing the AST -- this preserves every byte of the file's
 * existing formatting outside the inserted text. Indentation is derived
 * from the line the array itself starts on; quoting follows the file's own
 * convention (single quotes, double only when the value contains an
 * apostrophe).
 */
export function insertHubEntry(sourceText: string, filePath: string, entry: HubEntry, options: InsertHubEntryOptions = {}): string {
  const { array } = findEntriesArray(sourceText, filePath);
  const arrayIndent = indentOfLineContaining(sourceText, array.getStart());
  // Existing elements sit one level deeper than the line `entries={[` (or
  // `entries: [`) itself starts on -- e.g. array line at 6 spaces, each
  // `{` at 8. Derive from an existing element when there is one, so this
  // still matches a file that indents differently than the +2 convention.
  const elements = array.elements;
  const elementIndent =
    elements.length > 0 ? indentOfLineContaining(sourceText, elements[0]!.getStart()) : `${arrayIndent}  `;
  const entryText = buildEntryText(entry, elementIndent);

  const position = options.position ?? elements.length;

  if (elements.length === 0) {
    // `[` .. `]` with nothing between; insert as the sole element.
    const openBracketEnd = array.getStart() + 1;
    return `${sourceText.slice(0, openBracketEnd)}\n${entryText}\n${arrayIndent}${sourceText.slice(array.getEnd() - 1)}`;
  }

  if (position >= elements.length) {
    const lastElement = elements[elements.length - 1];
    if (!lastElement) throw new PreconditionError(`Unexpected empty entries array in ${filePath}.`);
    const insertAt = lastElement.getEnd();
    return `${sourceText.slice(0, insertAt)},\n${entryText}${sourceText.slice(insertAt)}`;
  }

  const targetElement = elements[position];
  if (!targetElement) throw new PreconditionError(`Position ${position} is out of range in ${filePath}.`);
  const insertAt = targetElement.getStart();
  return `${sourceText.slice(0, insertAt)}${entryText},\n${elementIndent}${sourceText.slice(insertAt)}`;
}

/** Throws if the resulting text does not still parse as valid TSX with a readable `entries` array. */
export function assertStillParses(sourceText: string, filePath: string): void {
  readHubEntries(sourceText, filePath);
}

/**
MIT License

Copyright (c) 2019 Toba Technology

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
 */

// from https://github.com/toba/vsfire/blob/master/src/parse.ts

/**
 * Consider formal symbolizing like
 * https://github.com/Krzysztof-Cieslak/vscode-elm/blob/master/src/elmWorkspaceSymbols.ts
 */
import { Position, TextDocument, Range } from 'vscode'

/** Match last word in text preceded by space or open paren/bracket. */
const priorWordPattern = new RegExp('[\\s\\(\\[]([A-Za-z0-9_\\.]+)\\s*$')

/**
 * Get the previous word adjacent to the current position by getting the
 * substring of the current line up to the current position then use a compiled
 * regular expression to match the word nearest the end.
 */
export function priorWord(doc: TextDocument, pos: Position): string | null {
  const match = priorWordPattern.exec(
    doc.lineAt(pos.line).text.substring(0, pos.character)
  )
  return match && match.length > 1 ? match[1] : null
}

/**
 * Get the word at the current position.
 */
export function currentWord(
  doc: TextDocument,
  range: Range | undefined
): string | null {
  return range === undefined || range.isEmpty ? null : doc.getText(range)
}

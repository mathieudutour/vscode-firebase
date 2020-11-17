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

// from https://github.com/toba/vsfire/blob/master/src/providers/completion.ts

import {
  CancellationToken,
  Hover,
  HoverProvider,
  Position,
  TextDocument,
  workspace,
  MarkdownString,
} from 'vscode'
import { findAny } from '../grammar'
import { currentWord } from '../parse'
import { getCoverageFile, Value } from '../firebase/get-coverage-file'

const cache: { [key: string]: Hover | null } = {}

export default class RuleHoverProvider implements HoverProvider {
  public async provideHover(
    doc: TextDocument,
    pos: Position,
    cancellationToken: CancellationToken
  ) {
    const coveragePath = workspace
      .getConfiguration(undefined, doc.uri)
      .get('firebase.coverageFile') as string

    const coverage = await getCoverageFile(doc.uri, coveragePath)

    if (cancellationToken.isCancellationRequested) {
      return
    }

    if (coverage) {
      const result = coverage.filter((r) => r.range.contains(pos))
      const mostRelevant = result.sort((a, b) =>
        a.range.contains(b.range) ? 1 : -1
      )[0]

      if (mostRelevant) {
        return new Hover(
          new MarkdownString(buildValueString(mostRelevant.values)),
          mostRelevant.range
        )
      }
    }

    const range = doc.getWordRangeAtPosition(pos)
    const word = currentWord(doc, range)
    if (word == null || word == '') {
      return null
    }

    const hover = await members(word)

    if (cancellationToken.isCancellationRequested) {
      return
    }

    if (hover) {
      hover.range = range
    }

    return hover
  }
}

/**
 * Build `Hover`s from `TypeInfo` and `MethodInfo` lists compiled in the
 * `grammar` module.
 */
async function members(name: string): Promise<Hover | null> {
  if (cache[name]) {
    return cache[name]
  }

  const info = await findAny(name)
  let h: Hover | null = null

  if (info) {
    h = new Hover(info.about)
  }
  cache[name] = h
  return h
}

/**
 * Creates the mouse-over text for each span.
 *
 * @param values The array of value objects formatted as {value: **, count: **}.
 * @return A single string for the mouse-over text.
 */
function buildValueString(values: { value: Value; count: number }[]) {
  if (!values || !values.length) {
    return 'Expression never evaluated'
  }
  return values
    .map(({ value, count }) => {
      const allowedTypes = [
        'nullValue',
        'boolValue',
        'intValue',
        'floatValue',
        'stringValue',
        'bytesValue',
        'durationValue',
        'timestampValue',
        'latlngValue',
        'pathValue',
      ]
      const countString = count > 1 ? `${count} times` : 'once'
      const compressedTypes = ['mapValue', 'listValue', 'constraintValue']
      const typeAllowed =
        // @ts-ignore
        allowedTypes.filter((type) => value[type] !== undefined).length == 1
      const typeCompressed =
        // @ts-ignore
        compressedTypes.filter((type) => value[type] !== undefined).length >= 1
      // Format is value = {returnType: returnValue}
      // A returnType of undefined is an error. Unfortunately the field is called undefined.
      if (value['undefined']) {
        // Expression evaluated to error
        return `Error '${value.undefined.causeMessage}' occurred ${countString}`
      } else if (typeCompressed) {
        // These types are recursive and are hard to read
        return `\`[${Object.keys(value)[0]}]\` returned ${countString}`
      } else if (typeAllowed) {
        // The response is a simple literal
        return `\`${JSON.stringify(
          Object.values(value)[0]
        )}\` returned ${countString}`
      } else if (Object.keys(value).length === 0) {
        // Clause not evaluated because of short-circuit.
        return `Expression short-circuited ${countString}`
      } else {
        // For a properly formatted response each value should have one type.
        console.error('Found invalid expression-return type.')
        return ''
      }
    })
    .join('  \n')
}

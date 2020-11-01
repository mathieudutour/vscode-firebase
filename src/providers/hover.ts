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
  ProviderResult,
  Position,
  TextDocument,
} from 'vscode'
import { findAny } from '../grammar'
import { currentWord } from '../parse'

const cache: { [key: string]: Hover | null } = {}

export default class RuleHoverProvider implements HoverProvider {
  public provideHover(
    doc: TextDocument,
    pos: Position,
    _tok: CancellationToken
  ): ProviderResult<Hover> {
    const range = doc.getWordRangeAtPosition(pos)
    const word = currentWord(doc, range)
    if (word == null || word == '') {
      return null
    }

    return members(word).then((hover) => {
      if (hover) {
        hover.range = range
      }
      return hover
    })
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

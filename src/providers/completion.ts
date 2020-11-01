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
  CompletionItem,
  CompletionItemKind,
  CompletionItemProvider,
  Position,
  SnippetString,
  TextDocument,
} from 'vscode'
import { findType, accessModifiers, MethodInfo, TypeInfo } from '../grammar'
import { priorWord } from '../parse'

const cache: { [key: string]: CompletionItem[] | null } = {}

/**
 * Provide suggestions for previous word or partial word.
 * https://code.visualstudio.com/docs/extensionAPI/language-support#_show-code-completion-proposals
 */
export default class RuleCompletionProvider implements CompletionItemProvider {
  public provideCompletionItems(
    doc: TextDocument,
    pos: Position,
    _tok: CancellationToken
  ) {
    const word = priorWord(doc, pos)
    if (word == null || word == '') {
      return null
    }
    if (word.slice(-1) == '.') {
      return members(word.slice(0, -1))
    }
    return directives(word)
  }
}

/**
 * Completions for stand-alone directives `service`, `match` and `allow`.
 */
async function directives(name: string): Promise<CompletionItem[] | null> {
  if (cache[name]) {
    return Promise.resolve(cache[name])
  }

  let items: CompletionItem[] | null = null

  if (name == 'allow') {
    const allows = await accessModifiers()
    items = allows.map((a) => {
      const i = new CompletionItem(a.name, CompletionItemKind.Keyword)
      i.documentation = sanitize(a.about)
      return i
    })
  }

  return Promise.resolve(items)
}

/**
 * Build `CompletionItem`s from `TypeInfo` and `MethodInfo` lists compiled in
 * the `grammar` module.
 */
async function members(name: string): Promise<CompletionItem[] | null> {
  if (cache[name]) {
    return Promise.resolve(cache[name])
  }

  const info = await findType(name)
  let items: CompletionItem[] | null = null

  if (info !== null) {
    items = []
    if (info.fields) {
      addFields(items, info.fields)
    }
    if (info.methods) {
      addMethods(items, info.methods)
    }
    if (items.length == 0) {
      items = null
    }
  }
  cache[name] = items
  return items
}

function addFields(
  items: CompletionItem[],
  fields: { [key: string]: TypeInfo }
) {
  Object.keys(fields).forEach((key) => {
    const name = key as string
    const f = fields[name]
    const c = new CompletionItem(name, CompletionItemKind.Field)

    c.documentation = sanitize(f.about)
    items.push(c)
  })
}

function addMethods(
  items: CompletionItem[],
  methods: { [key: string]: MethodInfo }
) {
  Object.keys(methods).forEach((key) => {
    const name = key
    const m = methods[name]
    const c = new CompletionItem(name, CompletionItemKind.Method)

    c.documentation = sanitize(m.about)
    if (m.snippet) {
      c.insertText = new SnippetString(m.snippet)
    }
    items.push(c)
  })
}

/**
 * Completions don't appear to support markdown.
 */
const sanitize = (text: string) => text.replace(/[`\*]/g, '')

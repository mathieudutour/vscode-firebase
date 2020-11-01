import * as assert from 'assert'

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode'
import { findType, accessModifiers } from '../../grammar'

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.')

  test('Sample test', () => {
    assert.equal(-1, [1, 2, 3].indexOf(5))
    assert.equal(-1, [1, 2, 3].indexOf(0))
  })
})

test('finds named TypeInfo', () => {
  ;['math', 'document'].forEach(async (name) => {
    const info = await findType(name)
    assert.ok(info !== null)
    assert.ok(info.methods)
  })
})

test('supports full and relative type paths', async () => {
  const t1 = await findType('token')
  const t2 = await findType('request.auth.token')

  assert.ok(t1 !== null)
  assert.ok(t1.fields)
  assert.ok(t1.fields.phone_number)

  assert.strictEqual(t1, t2)
})

test('applies basic type members to implementations', async () => {
  const info = await findType('request.time')

  assert.ok(info !== null)
  assert.ok(info.methods)
  assert.strictEqual(
    info.methods.year.about,
    'The year value as an `int`, from 1 to 9999.'
  )
})

test('generates snippets for parameterized methods', async () => {
  const info = await findType('request.path')

  assert.ok(info !== null)
  assert.ok(info.methods)
  assert.strictEqual(info.methods.split.snippet, 'split(${1:regex})$0')
  assert.strictEqual(info.methods.size.snippet, 'size()$0')
})

test('builds list of request access methods', async () => {
  const methods = await accessModifiers()
  assert.ok(methods.length === 7)
})

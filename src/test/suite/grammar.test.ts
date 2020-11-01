import * as assert from 'assert'

import { findType, accessModifiers } from '../../grammar'

test('finds named TypeInfo', async () => {
  await Promise.all(
    ['math', 'duration'].map(async (name) => {
      const info = await findType(name)
      assert.ok(info !== null)
      assert.ok(info.methods)
    })
  )
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
    'Get the year value of the timestamp.'
  )
})

test('generates snippets for parameterized methods', async () => {
  const info = await findType('request.method')

  assert.ok(info !== null)
  assert.ok(info.methods)
  assert.strictEqual(info.methods.split.snippet, 'split(${1:regex})$0')
  assert.strictEqual(info.methods.size.snippet, 'size()$0')
})

test('builds list of request access methods', async () => {
  const methods = await accessModifiers()
  assert.ok(methods.length === 7)
})

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

// from https://github.com/toba/vsfire/blob/master/src/grammar.ts

/**
 * `TypeInfo` mapped to both fully-quallified and short names. For example,
 * `token` is keyed to both "token" and "request.auth.token".
 */
const typeCache: { [key: string]: TypeInfo } = {}

/**
 * `MethodInfo` mapped to short names.
 */
const methodCache: { [key: string]: MethodInfo } = {}

/**
 * Basic information about a symbol, whether type, method, directive or access
 * modifier.
 */
export interface SymbolInfo {
  about: string
}

/**
 * Data request method
 * @see https://cloud.google.com/firestore/docs/reference/security/#request_methods
 */
export interface AllowInfo extends SymbolInfo {
  name: string
  /** Key list converted to object map during compile. */
  includeTypes?: string[]
  includes?: AllowInfo[]
}

export interface TypeInfo extends SymbolInfo {
  methods?: { [key: string]: MethodInfo }
  fields?: { [key: string]: TypeInfo }
  /**
   * Assigning a `basicType` will attach that types fields and methods to this
   * type.
   */
  basicType?: string
}

export interface MethodInfo extends SymbolInfo {
  parameters?: string[]
  returns?: string
  /**
   * Snippets are generated during compile if `parameters` have been defined.
   * @see https://code.visualstudio.com/docs/editor/userdefinedsnippets
   */
  snippet?: string
}

/**
 * Find type information with given short or fully-qualified name.
 */
export async function findType(name: string): Promise<TypeInfo | null> {
  if (name == null || name == '') {
    return null
  }
  await compile()
  return typeCache[name] !== undefined ? typeCache[name] : null
}

/**
 * Find any named symbol whether a type, method or access modifier.
 */
export async function findAny(name: string): Promise<SymbolInfo | null> {
  if (name == null || name == '') {
    return null
  }
  await compile()

  const allow = allowTypes.find((a) => a.name == name)
  if (allow !== undefined) {
    return allow
  }

  const info = typeCache[name]
  if (info !== undefined) {
    return info
  }

  const method = methodCache[name]
  if (method !== undefined) {
    return method
  }

  return null
}

/**
 * Get named access modifiers.
 */
export async function accessModifiers(): Promise<AllowInfo[]> {
  await compile()
  return allowTypes
}

/** Whether grammar has been compiled to simple cache map. */
let compiled = false
let currentCompile: Promise<void> | undefined = undefined
/**
 * Compile hierarchical grammar into flat map for faster lookup. If already
 * compiled then promise resolves immediately.
 */
export function compile(force = false): Promise<void> {
  if (force) {
    compiled = false
  }

  if (compiled) {
    return Promise.resolve()
  }

  if (currentCompile) {
    return currentCompile
  }

  currentCompile = new Promise((resolve) => {
    compileBasicMethods(basicTypes)
    compileTypes(grammar)
    compileAllowTypes(allowTypes)
    compiled = true
    resolve()
  })

  return currentCompile
}

/**
 * Assign basic type members to implementing types. For example, assign `string`
 * methods to `request.path`.
 */
function compileTypes(
  fields: { [key: string]: TypeInfo },
  path: string = ''
): void {
  Object.keys(fields).forEach((key) => {
    const info = fields[key]
    const name = key as string
    const full = path + (path != '' ? '.' : '') + name

    if (info.basicType) {
      // copy members from basic type
      const basic = basicTypes[info.basicType]
      if (basic) {
        info.methods = basic.methods
        info.fields = { ...basic.fields, ...info.fields }
      }
    } else if (info.methods) {
      compileMethods(info.methods)
    }

    // cache with both simple and fully-qualified name
    typeCache[name] = info
    typeCache[full] = info

    if (info.fields) {
      compileTypes(info.fields, full)
    }
  })
}

/**
 * Generate snippets for basic type methods so they don't have to be generated
 * again when assigned to an implementing type.
 */
function compileBasicMethods(fields: { [key: string]: TypeInfo }): void {
  Object.keys(fields).forEach((key) => {
    const info = fields[key]
    if (info.methods) {
      compileMethods(info.methods)
    }
    // recurse if basic type has children
    if (info.fields) {
      compileBasicMethods(info.fields)
    }
  })
}

/**
 * Generate snippets for methods that define their parameters. Methods that have
 * an empty parameter array will get a parameterless method call snippet like
 * `method()`.
 *
 * @see https://code.visualstudio.com/docs/editor/userdefinedsnippets
 */
function compileMethods(methods: { [key: string]: MethodInfo }): void {
  Object.keys(methods).forEach((key) => {
    const info = methods[key]

    if (info.parameters) {
      let args = ''
      if (info.parameters.length > 0) {
        args = info.parameters.reduce((snippet, p, i) => {
          if (i > 0) {
            snippet += ', '
          }
          return snippet + `\${${i + 1}:${p}}`
        }, '')
      }
      info.snippet = `${key}(${args})$0`
    }

    if (methodCache[key] !== undefined) {
      // If the same method name is used by multiple types then clone to
      // break the shared reference and combine their descriptions.
      const existing = Object.assign({}, methodCache[key])
      if (!existing.about.startsWith('- ')) {
        existing.about = '- ' + existing.about
      }
      existing.about += '\n- ' + info.about
      methodCache[key] = existing
    } else {
      methodCache[key] = info
    }
  })
}

function compileAllowTypes(access: AllowInfo[]): void {
  access.forEach((info) => {
    if (info.includeTypes) {
      info.includes = info.includeTypes
        .map((name) => access.find((a) => a.name == name))
        .filter((info) => info !== undefined) as AllowInfo[]
      //info.snippet = `${key}(${args})$0`;
    }
  })
}

/**
 * Permitted request methods
 * @see https://cloud.google.com/firestore/docs/reference/security/#request_methods
 */
const allowTypes: AllowInfo[] = [
  {
    name: 'read',
    about: 'Allow `get` and `list` operations',
    includeTypes: ['get', 'list'],
  },
  {
    name: 'get',
    about: 'Corresponds to `get()` query method',
  },
  {
    name: 'list',
    about: 'Corresponds to `where().get()` query method',
  },
  {
    name: 'write',
    about: 'Allows `create`, `update` and `delete` operations',
    includeTypes: ['create', 'update', 'delete'],
  },
  {
    name: 'create',
    about: 'Corresponds to `set()` and `add()` query methods',
  },
  {
    name: 'update',
    about: 'Corresponds to `update()` query method',
  },
  {
    name: 'delete',
    about: 'Corresponds to `remove()` query method',
  },
]

/**
 * Basic type members are assigned by reference to the symbols implementing
 * them.
 * @see https://firebase.google.com/docs/reference/rules/rules#interfaces
 */
const basicTypes: { [key: string]: TypeInfo } = {
  // https://firebase.google.com/docs/reference/rules/rules.Boolean
  boolean: {
    about: 'Primitive type representing a boolean value, true or false.',
  },
  // https://firebase.google.com/docs/reference/rules/rules.Bytes
  bytes: {
    about:
      "Byte literals are specified using a b declaration prefix followed by bytes represented as a sequence of characters, two-place hexadecimal values (for example, `b'\\x0F'`, not `b'\\xF'`), or three-place octal values (for example, `b'\\000'`, not `b'\\0'`). Character sequences are interpreted as UTF-8 encoded strings.",
    methods: {
      size: {
        about: 'Returns the number of bytes in a Bytes sequence.',
        parameters: [],
        returns: 'integer',
      },
      toBase64: {
        about:
          'Returns the Base64-encoded string corresponding to the provided Bytes sequence.',
        parameters: [],
        returns: 'string',
      },
      toHexString: {
        about:
          'Returns the hexadecimal-encoded string corresponding to the provided Bytes sequence.',
        parameters: [],
        returns: 'string',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.Duration
  duration: {
    about:
      'Duration values are represented as seconds plus fractional seconds in nanoseconds.',
    methods: {
      seconds: {
        about:
          'The number of seconds in the current duration. Must be between -315,576,000,000 and +315,576,000,000 inclusive.',
        parameters: [],
        returns: 'integer',
      },
      nanos: {
        about:
          'The number of fractional seconds (in nanoseconds) of the current duration. Must be beween -999,999,999 and +999,999,999 inclusive. For non-zero seconds and non-zero nanonseconds, the signs of both must be in agreement.',
        parameters: [],
        returns: 'integer',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.Float
  float: {
    about: 'Primitive type representing a 64-bit IEEE floating point number.',
  },
  // https://firebase.google.com/docs/reference/rules/rules.Integer
  integer: {
    about: 'Primitive type representing a signed 64-bit integer value.',
  },
  // https://firebase.google.com/docs/reference/rules/rules.LatLng
  latlng: {
    about: 'Type representing a geopoint.',
    methods: {
      distance: {
        about:
          'Calculate distance between two LatLng points in distance (meters).',
        parameters: ['latlng'],
        returns: 'float',
      },
      latitude: {
        about: 'Get the latitude value in the range [-90.0, 90.0].',
        parameters: [],
        returns: 'float',
      },
      longitude: {
        about: 'Get the longitude value in the range [-180.0, 180.0].',
        parameters: [],
        returns: 'float',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.List
  list: {
    about: 'List type. Items are not necessarily homogenous.',
    methods: {
      concat: {
        about:
          'Create a new list by adding the elements of another list to the end of this list.',
        parameters: ['list'],
        returns: 'list',
      },
      hasAll: {
        about:
          'Determine whether the list contains all elements in another list.',
        parameters: ['list'],
        returns: 'boolean',
      },
      hasAny: {
        about:
          'Determine whether the list contains any element in another list.',
        parameters: ['list'],
        returns: 'boolean',
      },
      hasOnly: {
        about:
          'Determine whether all elements in the list are present in another list.',
        parameters: ['list'],
        returns: 'boolean',
      },
      join: {
        about: 'Join the elements in the list into a string, with a separator.',
        parameters: ['string'],
        returns: 'string',
      },
      removeAll: {
        about:
          'Create a new list by removing the elements of another list from this list.',
        parameters: ['list'],
      },
      size: {
        about: 'Get the number of values in the list.',
        parameters: [],
        returns: 'integer',
      },
      toSet: {
        about:
          'Returns a set containing all unique elements in the list.\n\nIn case that two or more elements are equal but non-identical, the result set will only contain the first element in the list. The remaining elements are discarded.',
        parameters: [],
        returns: 'set',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.Map
  map: {
    about:
      'Map type, used for simple key-value mappings.\n\nKeys must be of type String.',
    methods: {
      diff: {
        about:
          'Return a `MapDiff` representing the result of comparing the current Map to a comparison Map.',
        parameters: ['map'],
        returns: 'mapdiff',
      },
      get: {
        about:
          'Returns the value associated with a given search key string.\n\nFor nested Maps, involving keys and sub-keys, returns the value associated with a given sub-key string. The sub-key is identified using a list, the first item of which is a top-level key and the last item the sub-key whose value is to be looked up and returned. See the nested Map example below.\n\nThe function requires a default value to return if no match to the given search key is found.',
        parameters: ['string or list', 'default_value'],
        returns: 'value',
      },
      keys: {
        about: 'Get the list of keys in the map.',
        parameters: [],
        returns: 'list',
      },
      size: {
        about: 'Get the number of entries in the map.',
        parameters: [],
        returns: 'integer',
      },
      values: {
        about: 'Get the list of values in the map.',
        parameters: [],
        returns: 'list',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.MapDiff
  mapdiff: {
    about:
      'The MapDiff type represents the result of comparing two Map objects.\n\nThere is no MapDiff literal for use in creating diffs. MapDiff objects are returned by calls to the `Map#diff` function.',
    methods: {
      addedKeys: {
        about:
          'Returns a Set, which lists any keys that the Map calling `diff()` contains that the Map passed to `diff()` does not.',
        parameters: [],
        returns: 'set',
      },
      affectedKeys: {
        about:
          'Returns a Set, which lists any keys that have been added to, removed from or modified from the Map calling `diff()` compared to the Map passed to `diff()`. This function returns the set equivalent to the combined results of `MapDiff.addedKeys()`, `MapDiff.removedKeys()` and `MapDiff.changedKeys()`.',
        parameters: [],
        returns: 'set',
      },
      changedKeys: {
        about:
          'Returns a Set, which lists any keys that appear in both the Map calling `diff()` and the Map passed to `diff()`, but whose values are not equal.',
        parameters: [],
        returns: 'set',
      },
      removedKeys: {
        about:
          'Returns a Set, which lists any keys that the Map calling `diff()` does not contain compared to the Map passed to `diff()`.',
        parameters: [],
        returns: 'set',
      },
      unchangedKeys: {
        about:
          'Returns a Set, which lists any keys that appear in both the Map calling `diff()` and the Map passed to `diff()`, and whose values are equal.',
        parameters: [],
        returns: 'set',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.Number
  number: {
    about: 'A value of type Integer or type Float',
  },
  // https://firebase.google.com/docs/reference/rules/rules.Path
  path: {
    about: 'Directory-like pattern for the location of a resource.',
    methods: {
      bind: {
        about: 'Bind key-value pairs in a map to a path.',
        parameters: ['map'],
        returns: 'path',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.firestore.Request
  request: {
    about: 'The incoming request context.',
    fields: {
      auth: {
        about: 'Request authentication context.',
        basicType: 'map',
        fields: {
          uid: {
            about: 'The UID of the requesting user.',
            basicType: 'string',
          },
          token: {
            about: 'A map of JWT token claims.',
            basicType: 'map',
            fields: {
              email: {
                about:
                  'The email address associated with the account, if present.',
                basicType: 'string',
              },
              email_verified: {
                about:
                  '`true` if the user has verified they have access to the `email` address.',
                basicType: 'boolean',
              },
              phone_number: {
                about:
                  'The phone number associated with the account, if present.',
                basicType: 'string',
              },
              name: {
                about: "The user's display name, if set.",
                basicType: 'string',
              },
              sub: {
                about:
                  "The user's Firebase UID. This is unique within a project.",
                basicType: 'string',
              },
              firebase: {
                about: '',
                basicType: 'map',
                fields: {
                  identities: {
                    about:
                      'A map of all the identities that are associated with this user\'s account. The keys of the map can be any of the following: `email`, `phone`, `google.com`, `facebook.com`, `github.com`, `twitter.com`. The values of the map are lists of unique identifiers for each identitity provider associated with the account. For example, `request.auth.token.firebase.identities["google.com"][0]` contains the first Google user ID associated with the account.',
                    basicType: 'map',
                  },
                  sign_in_provider: {
                    about:
                      'The sign-in provider used to obtain this token. Can be one of the following strings: `custom`, `password`, `phone`, `anonymous`, `google.com`, `facebook.com`, `github.com`, `twitter.com`.',
                    basicType: 'string',
                  },
                },
              },
            },
          },
        },
      },
      method: {
        about:
          'The request method. One of:\n\n- get\n- list\n- create\n- update\n- delete',
        basicType: 'string',
      },
      path: {
        about: 'Path of the affected resource.',
        basicType: 'path',
      },
      query: {
        about: 'Map of query properties, when present.',
        basicType: 'map',
        fields: {
          limit: {
            about: 'query limit clause',
            basicType: 'number',
          },
          offset: {
            about: 'query offset clause',
            basicType: 'number',
          },
          orderBy: {
            about: 'query orderBy clause',
            basicType: 'string',
          },
        },
      },
      resource: {
        about: 'The new resource value, present on write requests only.',
        basicType: 'resource',
      },
      time: {
        about:
          'When the request was received by the service.\n\nFor Firestore write operations that include server-side timestamps, this time will be equal to the server timestamp.',
        basicType: 'timestamp',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.firestore.Resource
  resource: {
    about: 'The firestore document being read or written.',
    fields: {
      __name__: {
        about: 'The full document name, as a path.',
        basicType: 'path',
      },
      data: {
        about: 'Map of the document data.',
        basicType: 'map',
      },
      id: {
        about: "String of the document's key",
        basicType: 'string',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.Set
  set: {
    about:
      'Set type.\n\nA set is an unordered collection. A set cannot contain duplicate items.',
    methods: {
      difference: {
        about:
          'Returns a set that is the difference between the set calling `difference()` and the set passed to `difference()`. That is, returns a set containing the elements in the comparison set that are not in the specified set.\n\nIf the sets are identical, returns an empty set (`size() == 0`).',
        parameters: ['set'],
        returns: 'set',
      },
      hasAll: {
        about:
          'Determine whether the set contains all elements in another set.',
        parameters: ['set'],
        returns: 'boolean',
      },
      hasAny: {
        about: 'Determine whether the set contains any element in another set.',
        parameters: ['set'],
        returns: 'boolean',
      },
      hasOnly: {
        about:
          'Determine whether all elements in the set are present in another set.',
        parameters: ['set'],
        returns: 'boolean',
      },
      intersection: {
        about:
          'Returns a set that is the intersection between the set calling `intersection()` and the set passed to `intersection()`. That is, returns a set containing the elements the sets have in common.\n\nIf the sets have no elements in common, returns an empty set (`size() == 0`).',
        parameters: ['set'],
        returns: 'set',
      },
      size: {
        about: 'Get the number of values in the set.',
        parameters: [],
        returns: 'integer',
      },
      union: {
        about:
          'Returns a set that is the union of the set calling `union()` and the set passed to `union()`. That is, returns a set that contains all elements from both sets.',
        parameters: ['set'],
        returns: 'set',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.String
  string: {
    about:
      'Primitive type representing a string value.\n\nStrings can be lexicographically compared using the ==, !=, >, <, >= and <= operators.',
    methods: {
      lower: {
        about: 'Returns a lowercase version of the input string.',
        parameters: [],
        returns: 'string',
      },
      matches: {
        about:
          'Performs a regular expression match on the whole string. The regular expression uses Google RE2 syntax.',
        parameters: ['string'],
        returns: 'boolean',
      },
      replace: {
        about:
          'Replaces all occurrences of substrings matching a regular expression with a user-supplied string. The regular expression uses Google RE2 syntax.',
        parameters: ['string', 'string'],
        returns: 'string',
      },
      size: {
        about: 'Returns the number of characters in the string.',
        parameters: [],
        returns: 'integer',
      },
      split: {
        about:
          'Splits a string according to a regular expression. The regular expression uses Google RE2 syntax.',
        returns: 'list',
        parameters: ['string'],
      },
      toUtf8: {
        about: 'Returns the UTF-8 byte encoding of a string.',
        returns: 'bytes',
        parameters: [],
      },
      trim: {
        about:
          'Returns a version of the string with leading and trailing spaces removed.',
        returns: 'string',
        parameters: [],
      },
      upper: {
        about: 'Returns an uppercase version of the input string.',
        returns: 'string',
        parameters: [],
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.Timestamp
  timestamp: {
    about: 'A timestamp in UTC with nanosecond accuracy.',
    methods: {
      date: {
        about: 'Timestamp value containing year, month, and day only.',
        parameters: [],
        returns: 'timestamp',
      },
      day: {
        about: 'Get the day value of the timestamp.',
        parameters: [],
        returns: 'integer',
      },
      dayOfWeek: {
        about: 'Get the day of the week as a value from 1 to 7.',
        parameters: [],
        returns: 'integer',
      },
      dayOfYear: {
        about: 'Get the day of the year as a value from 1 to 366.',
        parameters: [],
        returns: 'integer',
      },
      hours: {
        about: 'Get the hours value of the timestamp.',
        parameters: [],
        returns: 'integer',
      },
      minutes: {
        about: 'Get the minutes value of the timestamp.',
        parameters: [],
        returns: 'integer',
      },
      month: {
        about: 'Get the month value of the timestamp.',
        parameters: [],
        returns: 'integer',
      },
      nanos: {
        about: 'Get the nanos value of the timestamp.',
        parameters: [],
        returns: 'integer',
      },
      seconds: {
        about: 'Get the seconds value of the timestamp.',
        parameters: [],
        returns: 'integer',
      },
      time: {
        about: 'Get the duration value from the time portion of the timestamp.',
        returns: 'duration',
        parameters: [],
      },
      toMillis: {
        about: 'Get the time in milliseconds since the epoch.',
        parameters: [],
        returns: 'integers',
      },
      year: {
        about: 'Get the year value of the timestamp.',
        parameters: [],
        returns: 'integers',
      },
    },
  },
}

/**
 * Types defined in Firestore Security Reference
 * https://cloud.google.com/firestore/docs/reference/security/
 */
const grammar: { [key: string]: TypeInfo } = {
  global: {
    about: 'Globally defined methods',
    methods: {
      exists: {
        about: 'Check if a document exists.',
        parameters: ['path'],
        returns: 'boolean',
      },
      existsAfter: {
        about:
          'Check if a document exists, assuming the current request succeeds. Equivalent to `getAfter(path) != null`.',
        parameters: ['path'],
        returns: 'boolean',
      },
      get: {
        about: 'Get the contents of a firestore document.',
        parameters: ['path'],
        returns: 'resource',
      },
      getAfter: {
        about:
          'Get the projected contents of a document. The document is returned as if the current request had succeeded. Useful for validating documents that are part of a batched write or transaction.',
        parameters: ['path'],
        returns: 'resource',
      },
      debug: {
        about:
          'A basic debug function that prints Security Rules language objects, variables and statement results as they are being evaluated by the Security Rules engine. The outputs of `debug` are written to `firestore-debug.log`.',
      },
      bool: {
        about:
          'Strings can be converted into booleans using the `bool()` function.',
        returns: 'boolean',
      },
      float: {
        about:
          'String and integer values can be converted to float values using the `float()` function.',
        returns: 'float',
      },
      int: {
        about:
          'String and float values can be converted to integers using the `int()` function.',
        returns: 'integer',
      },
      path: {
        about:
          'String values can be converted to path using the `path()` function.',
        returns: 'path',
      },
      string: {
        about:
          'Boolean, integer, float, and null values can be converted into strings using the `string()` function.',
        returns: 'string',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.duration
  duration: {
    about:
      'Globally available duration functions. These functions are accessed using the `duration.` prefix.',
    methods: {
      abs: {
        about: 'Absolute value of a duration.',
        parameters: ['duration'],
        returns: 'duration',
      },
      time: {
        about:
          'Create a duration from hours, minutes, seconds, and nanoseconds.',
        parameters: ['integer', 'integer', 'integer', 'integer'],
        returns: 'duration',
      },
      value: {
        about: 'Create a duration from a numeric magnitude and string unit.',
        parameters: ['integer', 'string'],
        returns: 'duration',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.hashing
  hashing: {
    about:
      'Globally available hashing functions. These functions are accessed using the `hashing.` prefix.',
    methods: {
      crc32: {
        about: 'Compute a hash using the CRC32 algorithm.',
        parameters: ['bytes or string'],
        returns: 'bytes',
      },
      crc32c: {
        about: 'Compute a hash using the CRC32C algorithm.',
        parameters: ['bytes or string'],
        returns: 'bytes',
      },
      md5: {
        about: 'Compute a hash using the MD5 algorithm.',
        parameters: ['bytes or string'],
        returns: 'bytes',
      },
      sha256: {
        about: 'Compute a hash using the SHA256 algorithm.',
        parameters: ['bytes or string'],
        returns: 'bytes',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.latlng_
  latlng: {
    about:
      'Globally available latitude-longitude functions. These functions are accessed using the `latlng.` prefix.',
    methods: {
      value: {
        about: 'Create a LatLng from floating point coordinates.',
        parameters: ['float', 'float'],
        returns: 'latlng',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.math
  math: {
    about:
      'Globally available mathematical functions. These functions are accessed using the `math.` prefix and operate on numerical values.',
    methods: {
      abs: {
        about: 'Absolute value of a numeric value.',
        parameters: ['number'],
        returns: 'number',
      },
      ceil: {
        about: 'Ceiling of the numeric value.',
        parameters: ['number'],
        returns: 'integer',
      },
      floor: {
        about: 'Floor of the numeric value.',
        parameters: ['number'],
        returns: 'integer',
      },
      isInfinite: {
        about: 'Test whether the value is ±∞.',
        parameters: ['number'],
        returns: 'bool',
      },
      isNaN: {
        about: 'Test whether the value is NaN',
        parameters: ['number'],
        returns: 'bool',
      },
      pow: {
        about:
          'Return the value of the first argument raised to the power of the second argument.',
        parameters: ['number', 'number'],
        returns: 'float',
      },
      round: {
        about: 'Round the input value to the nearest int.',
        parameters: ['number'],
        returns: 'integer',
      },
      sqrt: {
        about: 'Square root of the input value.',
        parameters: ['number'],
        returns: 'float',
      },
    },
  },
  // https://firebase.google.com/docs/reference/rules/rules.timestamp_
  timestamp: {
    about:
      'Globally available timestamp functions. These functions are accessed using the `timestamp.` prefix.',
    methods: {
      date: {
        about: 'Make a timestamp from a year, month, and day.',
        parameters: ['integer', 'integer', 'integer'],
        returns: 'timestamp',
      },
      value: {
        about: 'Make a timestamp from an epoch time in milliseconds.',
        parameters: ['integer'],
        returns: 'timestamp',
      },
    },
  },
  request: { ...basicTypes.request },
  resource: { ...basicTypes.resource },
}

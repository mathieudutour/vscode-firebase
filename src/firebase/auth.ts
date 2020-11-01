import { configStore } from './config-store'
import api from './api'

var INVALID_CREDENTIAL_ERROR = new Error(
  'Authentication Error: Your credentials are no longer valid. Please run `firebase login --reauth`\n\nFor CI servers and headless environments, generate a new token with `firebase login:ci`'
)
const FIFTEEN_MINUTES_IN_MS = 15 * 60 * 1000

let lastAccessToken: {
  access_token?: string
  refresh_token: string
  expires_at: number
  scopes: string[]
} | null = null

const _haveValidAccessToken = function (
  refreshToken: string | undefined,
  authScopes: string[]
) {
  if (!lastAccessToken) {
    const tokens = configStore.get('tokens')
    if (tokens && refreshToken === tokens.refresh_token) {
      lastAccessToken = tokens
    }
  }

  if (!lastAccessToken) {
    return false
  }

  const scopes = lastAccessToken.scopes || []

  return (
    lastAccessToken.access_token &&
    lastAccessToken.refresh_token === refreshToken &&
    authScopes.every((scope) => scopes.indexOf(scope) !== -1) &&
    lastAccessToken.expires_at > Date.now() + FIFTEEN_MINUTES_IN_MS
  )
}

const _refreshAccessToken = function (
  refreshToken: string | undefined,
  authScopes?: string[]
) {
  return api
    .request('POST', '/oauth2/v3/token', {
      origin: api.googleOrigin,
      form: {
        refresh_token: refreshToken,
        client_id: api.clientId,
        client_secret: api.clientSecret,
        grant_type: 'refresh_token',
        scope: (authScopes || []).join(' '),
      },
      logOptions: {
        skipResponseBody: true,
      },
    })
    .then(
      (res) => {
        if (res.status === 401 || res.status === 400) {
          return { access_token: refreshToken }
        }
        if (typeof res.body.access_token !== 'string') {
          throw INVALID_CREDENTIAL_ERROR
        }
        lastAccessToken = {
          expires_at: Date.now() + res.body.expires_in * 1000,
          refresh_token: refreshToken,
          scopes: authScopes,
          ...res.body,
        }
        const currentRefreshToken = configStore.get('tokens')?.refresh_token
        if (refreshToken === currentRefreshToken) {
          configStore.set('tokens', lastAccessToken)
        }
        return lastAccessToken!
      },
      (err) => {
        if (err.body?.error === 'invalid_scope') {
          throw new Error(
            'This command requires new authorization scopes not granted to your current session. Please run `firebase login --reauth`\n\n' +
              'For CI servers and headless environments, generate a new token with `firebase login:ci`'
          )
        }
        throw err
      }
    )
}
export const getAccessToken = function (
  refreshToken: string | undefined,
  authScopes: string[]
) {
  if (_haveValidAccessToken(refreshToken, authScopes) && lastAccessToken) {
    return Promise.resolve(lastAccessToken)
  }
  return _refreshAccessToken(refreshToken, authScopes)
}

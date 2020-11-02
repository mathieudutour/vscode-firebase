import request from 'request'
import { Url, parse as parseUrl } from 'url'
import * as auth from './auth'
import HttpProxyAgent from 'http-proxy-agent'
import HttpsProxyAgent from 'https-proxy-agent'

let accessToken: string | undefined
let refreshToken: string | undefined
const commandScopes: string[] = [
  'email',
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/cloudplatformprojects.readonly',
  'https://www.googleapis.com/auth/firebase',
  'openid',
]

let proxyUrl: string | null = null
let strictSSL: boolean = true

const _request = function (
  options: request.UrlOptions & request.CoreOptions,
  logOptions: { skipResponseBody?: boolean } = {}
) {
  const agent = getProxyAgent(options.url, { proxyUrl, strictSSL })
  options.agent = agent
  options.strictSSL = strictSSL
  options.headers = options.headers || {}
  options.headers['connection'] = 'keep-alive'
  return new Promise<{ status: number; response: request.Response; body: any }>(
    (resolve, reject) => {
      request(options, (err, response, body) => {
        if (err) {
          return reject(new Error('Server Error. ' + err.message))
        }
        if (response.statusCode >= 400 && !logOptions.skipResponseBody) {
          return reject(response)
        }
        return resolve({
          status: response.statusCode,
          response: response,
          body: body,
        })
      })
    }
  )
}

const api = {
  clientId:
    '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  clientSecret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
  googleOrigin: 'https://www.googleapis.com',
  rulesOrigin: 'https://firebaserules.googleapis.com',
  configure(_proxyUrl: string, _strictSSL: boolean) {
    proxyUrl = _proxyUrl
    strictSSL = _strictSSL
  },
  setRefreshToken(token: string) {
    refreshToken = token
  },
  setAccessToken(token: string) {
    accessToken = token
  },
  getAccessToken() {
    return accessToken
      ? Promise.resolve({ access_token: accessToken })
      : auth.getAccessToken(refreshToken, commandScopes)
  },
  addRequestHeaders: async function (
    reqOptions: request.UrlOptions & request.CoreOptions
  ) {
    if (!reqOptions.headers) {
      reqOptions.headers = {}
    }

    const { access_token } = await api.getAccessToken()
    reqOptions.headers.authorization = 'Bearer ' + access_token

    return reqOptions
  },
  request(
    method: string,
    resource: string,
    options: {
      origin: string
      auth?: boolean
      json?: boolean
      qs?: string
      data?: any
      headers?: any
      timeout?: number
      form?: { [key: string]: any } | string
      logOptions?: {
        skipResponseBody?: boolean
      }
    }
  ) {
    options = {
      json: true,
      ...options,
    }

    const validMethods = ['GET', 'PUT', 'POST', 'DELETE', 'PATCH']
    if (validMethods.indexOf(method) < 0) {
      method = 'GET'
    }
    const reqOptions: request.UrlOptions & request.CoreOptions = {
      method: method,
      url: options.origin + resource,
      json: options.json,
      qs: options.qs,
      headers: options.headers,
      timeout: options.timeout,
    }

    if (options.data) {
      reqOptions.body = options.data
    } else if (options.form) {
      reqOptions.form = options.form
    }

    var requestFunction = function () {
      return _request(reqOptions, options.logOptions)
    }

    if (options.auth === true) {
      requestFunction = async () => {
        const reqOptionsWithToken = await api.addRequestHeaders(reqOptions)
        return _request(reqOptionsWithToken, options.logOptions)
      }
    }
    return requestFunction()
  },
}
export default api

// proxy handling

function getSystemProxyURI(requestURL: Url): string | null {
  if (requestURL.protocol === 'http:') {
    return process.env.HTTP_PROXY || process.env.http_proxy || null
  } else if (requestURL.protocol === 'https:') {
    return (
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      null
    )
  }

  return null
}

interface ProxyOptions {
  proxyUrl?: string | null
  strictSSL?: boolean
}

function getProxyAgent(
  rawRequestURL: string | Url,
  options: ProxyOptions = {}
): any {
  const requestURL =
    typeof rawRequestURL === 'string' ? parseUrl(rawRequestURL) : rawRequestURL
  const proxyURL = options.proxyUrl || getSystemProxyURI(requestURL)

  if (!proxyURL) {
    return null
  }

  const proxyEndpoint = parseUrl(proxyURL)

  if (
    !proxyEndpoint.hostname ||
    !proxyEndpoint.protocol ||
    !/^https?:$/.test(proxyEndpoint.protocol)
  ) {
    return null
  }

  const opts = {
    host: proxyEndpoint.hostname,
    port: Number(proxyEndpoint.port),
    auth: proxyEndpoint.auth,
    rejectUnauthorized:
      typeof options.strictSSL === 'boolean' ? options.strictSSL : true,
  }

  return requestURL.protocol === 'http:'
    ? // @ts-ignore
      new HttpProxyAgent(opts)
    : new HttpsProxyAgent(opts)
}

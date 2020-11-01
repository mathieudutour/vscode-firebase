import ConfigStore from 'configstore'

// we try to hook into the config store of firebase-tools
export const configStore = new ConfigStore('firebase-tools')

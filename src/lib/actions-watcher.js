/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const chokidar = require('chokidar')
const aioLogger = require('@adobe/aio-lib-core-logging')('@adobe/aio-cli-plugin-app:actions-watcher', { provider: 'debug' })
const buildActions = require('./build-actions')
const deployActions = require('./deploy-actions')

/**
 * @typedef {object} WatchReturnObject
 * @property {object} watcher the watcher object
 * @property {Function} cleanup callback function to cleanup available resources
 */

/**
 * @typedef {object} WatcherOptions
 * @property {object} config the app config (see src/lib/config-loader.js)
 * @property {boolean} isLocal whether the deployment is local or not
 * @property {Function} log the app logger
 * @property {object} [watcher] the watcher itself
 */

/**
 * Create a watcher.
 *
 * @param {WatcherOptions} watcherOptions the options for the watcher
 * @returns {WatchReturnObject} the WatchReturnObject
 */
module.exports = async (watcherOptions) => {
  const { config, log } = watcherOptions

  log(`watching action files at ${config.actions.src}...`)
  const watcher = chokidar.watch(config.actions.src)

  watcher.on('change', createChangeHandler({ ...watcherOptions, watcher }))

  const cleanup = async () => {
    aioLogger.debug('stopping action watcher...')
    await watcher.close()
  }

  return {
    watcher,
    cleanup
  }
}

/**
 * Builds and deploy the app.
 *
 * @param {WatcherOptions} watcherOptions the options for the watcher
 */
async function buildAndDeploy (watcherOptions) {
  const { config, isLocal, log } = watcherOptions

  await buildActions(config)
  await deployActions(config, isLocal, log)
}

/**
 * Create the onchange handler for the watcher.
 *
 * @param {WatcherOptions} watcherOptions the options for the watcher
 * @returns {Function} the onchange handler for the watcher
 */
function createChangeHandler (watcherOptions) {
  const { watcher, log } = watcherOptions

  let deploymentInProgress = false
  let fileChanged = false
  let undeployedFile = ''

  return async (filePath) => {
    const actionName = filePath.split('/')[filePath.split('/').findIndex(el => el === 'actions') + 1]
    console.log(
      '\n \n \n',
      '\n Action file changed, ' + actionName + '\n',
      '\n Path: ' + filePath + '\n',
      'States::::::::::::::::::::::::::::::::::::::::::::\n',
      '-> deploymentInProgress state::', deploymentInProgress, '\n',
      '-> File changed during deploy state::', fileChanged, '\n',
      '-> Last undeployedFile path was', undeployedFile
    )
    console.log('----> Starting the deployment for ', actionName)
    if (deploymentInProgress) {
      console.log(`----> another deploy is in progress for ${undeployedFile}, skipping for now`)
      aioLogger.debug(`${filePath} has changed. Deploy in progress. This change will be deployed after completion of current deployment.`)
      undeployedFile = filePath
      fileChanged = true
      return
    }
    deploymentInProgress = true
    try {
      aioLogger.debug(`${filePath} has changed. Redeploying actions.`)
      const actionName = getActionNameFromPath(filePath)
      watcherOptions.config.filterActions = [actionName]
      await buildAndDeploy(watcherOptions)
      aioLogger.debug(`Deployment successful for', ${actionName}.`)
      console.log('----> Deployment successful for ', actionName)
    } catch (err) {
      console.log('----> something went wrong')
      log('  -> Error encountered while deploying actions. Stopping auto refresh.')
      aioLogger.debug(err)
      await watcher.close()
    }
    if (fileChanged) {
      console.log('----> Code changed during deployment, Triggering deploy again for', actionName)
      aioLogger.debug('Code changed during deployment. Triggering deploy again.')
      fileChanged = deploymentInProgress = false
      await createChangeHandler(watcherOptions)(undeployedFile)
    }
    deploymentInProgress = false
    console.log('end of function for', actionName)
  }
}

/**
 * Util function which extract the actionName from the filePath.
 *
 * @param {string} filePath  path of the file
 * @returns {string}  name of the action
 */
function getActionNameFromPath (filePath) {
  const defaultReturn = ''
  if (!filePath) return defaultReturn
  const pathArray = filePath.split('/')
  /* validate the path */
  if (pathArray.includes('actions')) {
    const actionParentIndex = pathArray.findIndex(el => el === 'actions')
    return pathArray[actionParentIndex + 1] || defaultReturn
  }
}

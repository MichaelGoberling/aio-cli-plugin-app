/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const TheCommand = require('../../../src/commands/app/build')
const BaseCommand = require('../../../src/BaseCommand')

const mockFS = require('fs-extra')

jest.mock('../../../src/lib/app-helper.js')
const helpers = require('../../../src/lib/app-helper.js')

const mockWebLib = require('@adobe/aio-lib-web')
const mockRuntimeLib = require('@adobe/aio-lib-runtime')

jest.mock('@adobe/aio-lib-core-config')

jest.mock('cli-ux')

beforeEach(() => {
  mockWebLib.mockReset('deployWeb')
  mockWebLib.mockReset('buildWeb')
  mockFS.existsSync.mockReset()
  helpers.writeConfig.mockReset()
  helpers.runPackageScript.mockReset()
  jest.restoreAllMocks()

  helpers.wrapError.mockImplementation(msg => msg)
})

test('exports', async () => {
  expect(typeof TheCommand).toEqual('function')
  expect(TheCommand.prototype instanceof BaseCommand).toBeTruthy()
})

test('description', async () => {
  expect(TheCommand.description).toBeDefined()
})

test('aliases', async () => {
  expect(TheCommand.aliases).toEqual([])
})

test('flags', async () => {
  expect(typeof TheCommand.flags.action).toBe('object')
  expect(TheCommand.flags.action.char).toBe('a')
  expect(typeof TheCommand.flags.action.description).toBe('string')
  expect(TheCommand.flags.action.exclusive).toEqual(['skip-actions'])

  expect(typeof TheCommand.flags['skip-actions']).toBe('object')
  expect(typeof TheCommand.flags['skip-actions'].description).toBe('string')

  expect(typeof TheCommand.flags['skip-static']).toBe('object')
  expect(typeof TheCommand.flags['skip-static'].description).toBe('string')
})

describe('run', () => {
  let command
  beforeEach(() => {
    command = new TheCommand([])
    command.error = jest.fn()
    command.log = jest.fn()
    command.appConfig = { app: { hasFrontend: true, hasBackend: true }, web: { injectedConfig: 'config.json' } }
    mockRuntimeLib.buildActions.mockReset()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('build & deploy an App with no flags', async () => {
    await command.run()
    expect(command.error).toHaveBeenCalledTimes(0)
    expect(mockRuntimeLib.buildActions).toHaveBeenCalledTimes(1)
    expect(mockWebLib.buildWeb).toHaveBeenCalledTimes(1)
  })

  test('build & deploy an App with no force-build but build exists', async () => {
    command.argv = ['--no-force-build']
    command.appConfig.actions = { dist: 'actions' }
    command.appConfig.web.distProd = 'dist'
    mockFS.existsSync.mockReturnValue(true)
    await command.run()
    expect(command.error).toHaveBeenCalledTimes(0)
    expect(mockRuntimeLib.buildActions).toHaveBeenCalledTimes(0)
    expect(mockWebLib.buildWeb).toHaveBeenCalledTimes(0)
  })

  test('build & deploy an App verbose', async () => {
    command.argv = ['-v']
    await command.run()
    expect(command.error).toHaveBeenCalledTimes(0)
    expect(mockRuntimeLib.buildActions).toHaveBeenCalledTimes(1)
    expect(mockWebLib.buildWeb).toHaveBeenCalledTimes(1)
  })

  test('build & deploy --skip-static', async () => {
    command.argv = ['--skip-static']
    await command.run()
    expect(command.error).toHaveBeenCalledTimes(0)
    expect(mockRuntimeLib.buildActions).toHaveBeenCalledTimes(1)
    expect(mockWebLib.buildWeb).toHaveBeenCalledTimes(0)
  })

  test('build & deploy only some actions using --action', async () => {
    command.argv = ['--skip-static', '-a', 'a', '-a', 'b', '--action', 'c']
    await command.run()
    expect(command.error).toHaveBeenCalledTimes(0)
    expect(mockRuntimeLib.buildActions).toHaveBeenCalledTimes(1)
    expect(mockRuntimeLib.buildActions).toHaveBeenCalledWith(command.appConfig, ['a', 'b', 'c'])
    expect(mockWebLib.buildWeb).toHaveBeenCalledTimes(0)
  })

  test('build & deploy actions with no backend', async () => {
    command.appConfig = { app: { hasFrontend: true, hasBackend: false } }
    await command.run()
    expect(command.error).toHaveBeenCalledTimes(0)
    expect(mockRuntimeLib.buildActions).toHaveBeenCalledTimes(0)
    expect(mockWebLib.buildWeb).toHaveBeenCalledTimes(1)
  })

  test('build & deploy with --skip-actions', async () => {
    command.argv = ['--skip-actions']
    mockFS.existsSync.mockReturnValue(true)
    await command.run()
    expect(command.error).toHaveBeenCalledTimes(0)
    expect(mockRuntimeLib.buildActions).toHaveBeenCalledTimes(0)
    expect(mockWebLib.buildWeb).toHaveBeenCalledTimes(1)
  })

  test('build & deploy with --skip-actions with no frontend', async () => {
    command.argv = ['--skip-actions']
    command.appConfig = { app: { hasFrontend: false, hasBackend: true } }
    await command.run()
    expect(command.error).toHaveBeenCalledTimes(0)
    expect(mockRuntimeLib.buildActions).toHaveBeenCalledTimes(0)
    expect(mockWebLib.buildWeb).toHaveBeenCalledTimes(0)
  })

  test('should fail if scripts.buildActions fails', async () => {
    mockFS.existsSync.mockReturnValue(true)
    const error = new Error('mock failure')
    mockRuntimeLib.buildActions.mockRejectedValue(error)
    await command.run()
    expect(command.error).toHaveBeenCalledWith(error)
    expect(mockRuntimeLib.buildActions).toHaveBeenCalledTimes(1)
    expect(mockWebLib.buildWeb).toHaveBeenCalledTimes(0)
  })

  test('spinner should be called for progress logs on buildWeb call , with verbose', async () => {
    mockWebLib.buildWeb.mockImplementation(async (config, onProgress) => {
      onProgress('progress log')
      return 'ok'
    })
    command.argv = ['-v']
    await command.run()
    expect(mockRuntimeLib.buildActions).toHaveBeenCalledTimes(1)
    expect(mockWebLib.buildWeb).toHaveBeenCalledTimes(1)
  })

  test('spinner should be called for progress logs on buildWeb call , without verbose', async () => {
    mockWebLib.buildWeb.mockImplementation(async (config, onProgress) => {
      onProgress('progress log')
      return 'ok'
    })
    await command.run()
    expect(mockWebLib.buildWeb).toHaveBeenCalledTimes(1)
  })

  test('error in runPackageScript', async () => {
    helpers.runPackageScript.mockRejectedValue('error')
    await command.run()
    expect(command.log).toHaveBeenNthCalledWith(1, 'error')
    expect(command.log).toHaveBeenNthCalledWith(2, 'error')
  })
})
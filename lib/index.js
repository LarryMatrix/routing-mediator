#!/usr/bin/env node
'use strict'

const express = require('express')
const medUtils = require('openhim-mediator-utils')
const winston = require('winston')
const request = require('request')
const parser = require('body-parser')
const utils = require('./utils')

// Logging setup
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, { level: 'info', timestamp: true, colorize: true })

// Config
let config = {} // this will vary depending on whats set in openhim-core
const apiConf = process.env.NODE_ENV === 'test' ? require('../config/test') : require('../config/config')
const mediatorConfig = require('../config/mediator')

let port = process.env.NODE_ENV === 'test' ? 7001 : mediatorConfig.endpoints[0].port

/**
 * setupApp - configures the http server for this mediator
 *
 * @return {express.App}  the configured http server
 */
function setupApp () {
  const app = express()

  app.use(parser.json({
    limit: '10Mb',
    type: ['application/fhir+json', 'application/json+fhir', 'application/json']
  }))

  // app.post('/elmis-orders', (req, res) => {
  //   winston.info(`Processing ${req.method} request on ${req.url}`)
  //
  //   // add logic to alter the request here
  //   let username = ''
  //   let password = ''
  //   let url = ''
  //
  //   let headers = { 'content-type': 'application/json' }
  //   let responseBody = 'Primary Route Reached'
  //
  //   if (req.body.sourceApplication === 'Afyacare') {
  //     username = mediatorConfig.config.afyacare_username
  //     password = mediatorConfig.config.afyacare_password
  //     url = mediatorConfig.config.afyacare_url
  //
  //   } else if (req.body.sourceApplication === 'GOTHOMIS') {
  //     username = mediatorConfig.config.gothomis_username
  //     password = mediatorConfig.config.gothomis_password
  //     url = mediatorConfig.config.gothomis_url
  //   } else {
  //     return res.status(400).send({error: 'sourceApplication is neither Afyacare nor GOTHOMIS'})
  //   }
  //
  //   let options = {
  //     url: url,
  //     headers: {
  //       Authorization: `Basic ` + new Buffer(username + ':' + password).toString('base64')
  //     },
  //     body: JSON.stringify(req.body)
  //   }
  //   // res.send(options)
  //   request.post(options, (err, response, body) => {
  //     if (err) {
  //       res.status(400).send('Error')
  //     }
  //
  //     // capture orchestration data
  //     var orchestrationResponse = {
  //       statusCode: response.statusCode,
  //       headers: response.headers
  //     }
  //     let orchestrations = []
  //     let urlResponse = `${req.url}?sourceApplication=${req.body.sourceApplication}&rnrId=${req.body.rnrId}`
  //     // orchestrations.push(utils.buildOrchestration('Capturing Orchestration Data Route', new Date().getTime(), req.method, urlResponse, req.headers, req.body, orchestrationResponse, body))
  //     orchestrations.push(utils.buildOrchestration('Primary Route', new Date().getTime(), req.method, req.url, req.headers, req.body, orchestrationResponse, responseBody))
  //
  //     // set content type header so that OpenHIM knows how to handle the response
  //     res.set('Content-Type', 'application/json+openhim')
  //
  //     // construct return object
  //     let properties = { property: 'Primary Route' }
  //     const statusMessage = response.statusCode === 200 ? 'Successful' : 'Completed'
  //     console.info('returned response', utils.buildReturnObject(mediatorConfig.urn, 'Successful', 200, headers, responseBody, orchestrations, properties))
  //     res.send(utils.buildReturnObject(mediatorConfig.urn, 'Successful', 200, headers, responseBody, orchestrations, properties))
  //     // res.send(utils.buildReturnObject(mediatorConfig.urn, statusMessage, response.statusCode, response.headers, body, orchestrations, properties))
  //   })
  //
  // })

  app.all('*', (req, res) => {
    winston.info(`Processing ${req.method} request on ${req.url}`)
    let responseBody = 'Primary Route Reached'
    let headers = { 'content-type': 'application/json' }

    // add logic to alter the request here

    // capture orchestration data
    let orchestrationResponse = { statusCode: 200, headers: headers }
    let orchestrations = []
    orchestrations.push(utils.buildOrchestration('Primary Route', new Date().getTime(), req.method, req.url, req.headers, JSON.stringify(req.body), orchestrationResponse, responseBody))

    // set content type header so that OpenHIM knows how to handle the response
    res.set('Content-Type', 'application/json+openhim')

    // construct return object
    let properties = { property: 'Primary Route' }
    res.send(utils.buildReturnObject(mediatorConfig.urn, 'Successful', 200, headers, responseBody, orchestrations, properties))
  })
  return app
}

/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
function start (callback) {
  if (apiConf.api.trustSelfSigned) { process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0' }

  if (apiConf.register) {
    medUtils.registerMediator(apiConf.api, mediatorConfig, (err) => {
      if (err) {
        winston.error('Failed to register this mediator, check your config')
        winston.error(err.stack)
        process.exit(1)
      }
      apiConf.api.urn = mediatorConfig.urn
      medUtils.fetchConfig(apiConf.api, (err, newConfig) => {
        winston.info('Received initial config:')
        winston.info(JSON.stringify(newConfig))
        config = newConfig
        if (err) {
          winston.error('Failed to fetch initial config')
          winston.error(err.stack)
          process.exit(1)
        } else {
          winston.info('Successfully registered mediator!')
          let app = setupApp()
          const server = app.listen(port, () => {
            if (apiConf.heartbeat) {
              let configEmitter = medUtils.activateHeartbeat(apiConf.api)
              configEmitter.on('config', (newConfig) => {
                winston.info('Received updated config:')
                winston.info(JSON.stringify(newConfig))
                // set new config for mediator
                config = newConfig

                // we can act on the new config received from the OpenHIM here
                winston.info(config)
              })
            }
            callback(server)
          })
        }
      })
    })
  } else {
    // default to config from mediator registration
    config = mediatorConfig.config
    let app = setupApp()
    const server = app.listen(port, () => callback(server))
  }
}

exports.start = start

if (!module.parent) {
  // if this script is run directly, start the server
  start(() => winston.info(`Listening on ${port}...`))
}

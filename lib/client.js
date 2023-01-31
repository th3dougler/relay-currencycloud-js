/**
 * @module client
 */

'use strict';
var rp = require('request-promise');
var error = require('./error');
var utils = require('./utils');
var settings = require('../package').settings;
var version = require('../package').version;

class Client {
    token= null;
    config= null;
    onbehalfof= null;
    
    _config= {
      get: function () {
        return config;
      }
    }
  
    _token= {
      set: function (value) {
        this.token = value;
      },
      get: function () {
        return this.token;
      }
    }
  
    authenticate =  function (params) {
      var baseUrl = settings.environment[params.environment];
      if (!baseUrl) {
        throw new Error('invalid environment');
      }
  
      this.config = {
        baseUrl: baseUrl,
        loginId: params.loginId,
        apiKey: params.apiKey,
        authUrl: params.authUrl
      };
  
      var promise = this.requestToken()
        .catch(function (res) {
          throw new error(res);
        });
  
      return promise;
    }
    
    requestToken = function () {
      var promise = rp.post({
        uri: this.config.baseUrl + this.config.authUrl,
        form: {
          login_id: this.config.loginId,
          api_key: this.config.apiKey
        },
        headers: {
          'User-Agent': 'CurrencyCloudSDK/2.0 NodeJS/' + version
        }
      })
        .then(function (res) {
          this.token = JSON.parse(res).auth_token;
    
          return this.token;
        });
    
      return promise;
    };
  
    request = function (params) {
      var reauthenticate = function (attempts) {
        var promise =this.requestToken()
          .catch(function (res) {
            if (attempts > 1) {
              return reauthenticate(attempts - 1);
            }
            else {
              throw res;
            }
          });
  
        return promise;
      };
  
      var request = function (params) {
        if (this.onbehalfof) {
          params.qs = params.qs || {};
          params.qs.onBehalfOf = this.onbehalfof;
        }
  
        var promise = rp({
          headers: {
            'X-Auth-Token': this.token,
            'User-Agent': 'CurrencyCloudSDK/2.0 NodeJS/' + version
          },
          uri: this.config.baseUrl + params.url,
          method: params.method,
          qsStringifyOptions: {
            arrayFormat: 'brackets'
          },
          form: params.method === 'GET' ? null : utils.snakeize(params.qs),
          qs: params.method === 'GET' ? utils.snakeize(params.qs) : null
        })
          .then(function (res) {
            return utils.camelize(JSON.parse(res));
          });
  
        return promise;
      };
  
      var promise = request(params)
        .catch(function (res) {
          if (res.statusCode === 401 && this.token) {
            return reauthenticate(3)
              .then(function () {
                return request(params);
              })
              .catch(function (res) {
                throw new error(res);
              });
          }
          else {
            throw new error(res);
          }
        });
  
      return promise;
    }
  
    close = function (params) {
      var promise = rp.post({
        headers: {
          'X-Auth-Token': this.token,
          'User-Agent': 'CurrencyCloudSDK/2.0 NodeJS/' + version
        },
        uri: this.config.baseUrl + params.url,
      })
        .then(function () {
          this.config = null;
          this.token = null;
        })
        .catch(function (res) {
          throw new error(res);
        });
  
      return promise;
    }
  
    /**
     * Executes operations on behalf of another contact.
     * @param {String} id       Id of the contact
     * @param {Promise} promise Promise, which is resolved on behalf of the given contact
     * @return {Promise}        Given promise, resolved.
     */
    onBehalfOf = function (id, promise) {
      if (this.onbehalfof) {
        throw new Error('onBehalfOf has already been called and not yet completed');
      }
  
      var UUIDregex = new RegExp(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/g);
      if (!UUIDregex.test(id)) {
        throw new Error('id is not valid UUID');
      }
  
      this.onbehalfof = id;
  
      return promise()
        .then(function () {
          this.onbehalfof = null;
        });
    }
  
  
}

module.exports = Client
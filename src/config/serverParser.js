// @flow

'use strict';

const { isInvalid } = require('../utils/is');
const dependencies = require('./dependencies');
const path = require('path');

const BUDDY_SERVER = 'buddy-server';

/**
 * Parse and validate "server" section of 'config'
 */
module.exports = function serverParser(config: Config) {
  const { runtimeOptions, server } = config;

  // Make sure 'buddy-server' module exists if running '--serve' and/or '--reload'
  if (runtimeOptions.serve || runtimeOptions.reload) {
    let buddyServerPath = dependencies.find(BUDDY_SERVER);

    if (isInvalid(buddyServerPath)) {
      dependencies.install(BUDDY_SERVER, true);
      buddyServerPath = dependencies.find(BUDDY_SERVER);
    }
    server.buddyServerPath = buddyServerPath;
  }

  // Handle array of directories
  if (server.directory != null && Array.isArray(server.directory)) {
    const [directory, ...extraDirectories] = server.directory;

    server.directory = directory;
    server.extraDirectories = extraDirectories.map(directory => path.resolve(directory));
  }
  server.directory = path.resolve(server.directory);
  if (server.file != null) {
    server.file = path.resolve(server.file);
  }
  if (server.sourceroot == null) {
    server.sourceroot = '';
  }
  server.webroot = isInvalid(server.webroot) ? server.directory : path.resolve(server.webroot);
};
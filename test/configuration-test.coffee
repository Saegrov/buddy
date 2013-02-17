path = require('path')
fs = require('fs')
should = require('should')
configuration = require('../lib/core/configuration')

describe 'configuration', ->
	before ->
		process.chdir(path.resolve(__dirname, 'fixtures/configuration'))

	describe 'locate', ->
		beforeEach ->
			configuration.url = ''
		describe 'from a valid working directory', ->
			it 'should return a path to the default js file when no name is specified', (done) ->
				configuration.locate null, (err, url) ->
					configuration.url.should.equal(path.resolve('buddy.js'))
					done()
			it 'should return a path to the named file when a name is specified', (done) ->
				configuration.locate 'buddy_custom_name.js', (err, url) ->
					configuration.url.should.equal(path.resolve('buddy_custom_name.js'))
					done()
			it 'should return a path to the default file in the specified directory when a directory name is specified', (done) ->
				configuration.locate 'nested', (err, url) ->
					configuration.url.should.equal(path.resolve('nested', 'buddy.js'))
					done()
			it 'should return a path to the default json file in the specified directory when a directory name is specified', (done) ->
				configuration.locate 'json', (err, url) ->
					configuration.url.should.equal(path.resolve('json', 'buddy.json'))
					done()
			it 'should return a path to the default package.json file in the specified directory when a directory name is specified', (done) ->
				configuration.locate 'pkgjson', (err, url) ->
					configuration.url.should.equal(path.resolve('pkgjson', 'package.json'))
					done()
			it 'should return a path to the named file in the specified directory when a directory and name are specified', (done) ->
				configuration.locate 'nested/buddy_custom_name.js', (err, url) ->
					configuration.url.should.equal(path.resolve('nested', 'buddy_custom_name.js'))
					done()
			it 'should return an error when an invalid name is specified', (done) ->
				configuration.locate 'buddy_no_name.js', (err, url) ->
					should.exist(err)
					done()
		describe 'from a valid child working directory', ->
			before ->
				process.chdir(path.resolve('nested'))
			it 'should return a path to the default file in a parent of the cwd when no name is specified', (done) ->
				configuration.locate null, (err, url) ->
					configuration.url.should.equal(path.resolve('buddy.js'))
					done()
		describe 'from an invalid working directory', ->
			before ->
				process.chdir('/')
			it 'should return an error', (done) ->
				configuration.locate null, (err, url) ->
					should.exist(err)
					done()

	describe 'load', ->
		before ->
			process.chdir(path.resolve(__dirname, 'fixtures/configuration'))
		it 'should return validated file data', (done) ->
			configuration.load 'buddy.js', (err, config) ->
				should.exist(config.build)
				done()
		it 'should return validated file data for a package.json config file', (done) ->
			configuration.load 'package.json', (err, config) ->
				should.exist(config.build)
				done()
		it 'should return an error when passed a reference to a malformed file', (done) ->
			configuration.load 'buddy_bad.js', (err, config) ->
				should.exist(err)
				done()

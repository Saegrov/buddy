# TODO: protect against source folder as out target during watch routine

fs = require 'fs'
path = require 'path'
coffee = require 'coffee-script'
stylus = require 'stylus'
# less = require 'less'
uglify = require 'uglify-js'
_ = require 'underscore'
growl = require 'growl'
{log} = console
target = require './target'
file = require './file'
term = require './terminal'

CONFIG = 'build.json'


module.exports = class Builder
	JS: 'js'
	CSS: 'css'
	RE_JS_SRC_EXT: /\.coffee|\.js$/
	RE_CSS_SRC_EXT: /\.styl|\.less$/
	RE_IGNORE_FILE: /^[_|\.]|[-|\.]min\./
	RE_BUILT_HEADER: /^\/\*BUILT/g
	
	constructor: ->
		@config = null
		@base = null
		@jsSources =
			locations: []
			byPath: {}
			count: 0
		@cssSources =
			locations: []
			byPath: {}
			count: 0
		@jsTargets = []
		@cssTargets = []
	
	compile: (configpath) ->
		@_initialize configpath
	
	watch: (configpath) ->
		@_initialize configpath
	
	deploy: (configpath) ->
		@_initialize configpath
	
	_initialize: (configpath) ->
		unless @initialized
			# Load configuration file
			if @_loadConfig(configpath)
				if @_validBuildType @JS
					# Generate source cache
					@_parseSourceFolder(path.resolve(@base, source), null, @jsSources) for source in @config.js.sources
					# Generate build targets
					for item in config.js.targets
						if target = @_targetFactory(target.in, target.out, @JS)
							@jsTargets.push target
				if @_validBuildType @CSS
					# Generate source cache
					@_parseSourceFolder(path.resolve(@base, source), null, @cssSources) for source in @config.css.sources
					# Generate builds
					# jsBuilds = ((new JSBuild(target.in, target.out)) for target in config.js.targets)
			
		@initialized = true
	
	_loadConfig: (configpath) ->
		if configpath
			# Check that the supplied path is valid
			configpath = path.resolve configpath
			if exists = path.existsSync(configpath)
				# Try default file name if directory
				if fs.statSync(configpath).isDirectory()
					configpath = path.join(configpath, CONFIG)
					exists = path.existsSync(configpath)
			unless exists
				term.out "#{term.colour('ERROR [file not found]', term.RED)} #{term.colour(path.basename(configpath), term.GREY)} not found in #{term.colour(path.dirname(configpath), term.GREY)}", 2
				return false
		else
			# Find the first instance of a CONFIG file based on the current working directory.
			while true
				dir = if dir? then path.resolve(dir, '../') else process.cwd()
				configpath = path.join(dir, CONFIG)
				break if path.existsSync(configpath)
				# Exit if we reach the volume root without finding our file
				if dir is '/'
					term.out "#{term.colour('ERROR [file not found]', term.RED)} #{term.colour(CONFIG, term.GREY)} not found on this path", 2
					return false
		
		# Read and parse config settings
		term.out "Loading config file #{term.colour(configpath, term.GREY)}", 2
		try
			@config = JSON.parse(fs.readFileSync(configpath, 'utf8'))
		catch e
			term.out "#{term.colour('ERROR [JSON]', term.RED)} error parsing #{term.colour(configpath, term.GREY)}", 2
			return false
		
		# Store the base directory
		@base = path.dirname configpath
		
		return true
	
	_validBuildType: (type) ->
			@config[type] and @config[type].sources and @config[type].sources.length and @config[type].targets and @config[type].targets.length
	
	_parseSourceFolder: (dir, base, cache) ->
		if base is null
			# Set base directory for module package creation
			base = dir
			cache.locations.push dir
		for item in fs.readdirSync dir
			# Skip ignored files
			unless item.match @RE_IGNORE_FILE
				itempath = path.resolve dir, item
				# Recurse child directory
				@_parseSourceFolder(itempath, base, cache) if fs.statSync(itempath).isDirectory()
				
				# Store File objects in cache
				if f = @_fileFactory(itempath, base)
					cache.byPath[f.filepath] = f
					cache.count++
	
	_fileFactory: (filepath, base) ->
		# Create JS file instance
		if filepath.match @RE_JS_SRC_EXT
			# Skip compiled files
			contents = fs.readFileSync(filepath, 'utf8')
			return null if contents.match @RE_BUILT_HEADER
			# Create and store File object
			return new file.JSFile filepath, base, contents
			
		# Create CSS file instance
		else if filepath.match @RE_CSS_SRC_EXT
			return new file.CSSFile filepath, base
		
		else return null
	
	_targetFactory: (input, output, type) ->
		inputpath = path.resolve @base, input
		outputpath = path.resolve @base, ouput
		# Check that input is included in sources
		for location in @[type + 'Sources'].location
			inSources = path.dirname(inputpath).test location
			break if inSources
		# Abort if input isn't in sources
		unless inSources
			term.out "#{term.colour('ERROR [not found]', term.RED)} #{term.colour(input, term.GREY)} not found in sources", 2
			return null
		# Abort if input is directory and output is file
		if fs.statSync(inputpath).isDirectory() and fs.statSync(outputpath).isFile()
			term.out "#{term.colour('ERROR [invalid]', term.RED)} a file (#{term.colour(output, term.GREY)}) is not a valid output target for a directory (#{term.colour(input, term.GREY)}) input target", 2
			return null
		return new target[type.toUpperCase() + 'Target'] inputpath, outputpath
	
	
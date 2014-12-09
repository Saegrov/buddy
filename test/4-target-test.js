var path = require('path')
	, fs = require('fs')
	, co = require('co')
	, should = require('should')
	, rimraf = require('rimraf')
	, fileFactory = require('../lib/core/file')
	, targetFactory = require('../lib/core/target');

describe('target', function () {
	before(function () {
		process.chdir(path.resolve(__dirname, 'fixtures/target'));
	});
	beforeEach(function () {
		if (!fs.existsSync(path.resolve('temp'))) fs.mkdirSync(path.resolve('temp'));
	});
	afterEach(function () {
		fileFactory.cache.flush();
		rimraf.sync(path.resolve('temp'));
	});

	describe('factory', function () {
		it('should decorate a new Target instance with passed data', function () {
			var target = targetFactory({type: 'js', input: 'src/some.coffee', output: 'js', runtimeOptions: {}, fileExtensions: ['js', 'json', 'coffee', 'hbs', 'handlebars', 'dust', 'jade']});
			target.should.have.property('output', 'js');
		});
	});

	describe('parse', function () {
		beforeEach(function () {
			this.target = targetFactory({type:'js', outputPath: path.resolve('temp'), fileExtensions:['js', 'coffee'], sources:['src'], runtimeOptions:{}});
		});
		it('should parse a file "input" and return a File instance', function () {
			var files = this.target.parse(false, path.resolve('src/js/foo.js'), null, this.target.runtimeOptions);
			files.should.have.length(1);
		});
		it('should parse a directory "input" and return several File instances', function () {
			this.target.inputPath = path.resolve('src/js');
			this.target.isDir = true;
			files = this.target.parse(true, path.resolve('src/js'), null, this.target.runtimeOptions);
			files.should.have.length(4);
		});
	});

	describe.only('process', function () {
		before(function () {
			this.target = targetFactory({type:'js', fileExtensions:[], sources:[], runtimeOptions: {}});
		});
		it('should serially apply a set of commands to a collection of items', function (done) {
			var file1 = fileFactory(path.resolve('src/js/foo.js'), {type: 'js'})
				, file2 = fileFactory(path.resolve('src/js/bar.js'), {type: 'js'});
			this.target.process([file1, file2], [['load'], ['compile']], function (err, files) {
				files[1].content.should.eql("var bat = require(\'./bat\')\n\t, baz = require(\'./baz\')\n\t, bar = this;");
				done();
			});
		});
		it('should return one file references when processing a file with dependencies', function (done) {
			var file1 = fileFactory(path.resolve('src/js/foo.js'), {type: 'js'});
			files = this.target.process([file1], [['load', 'parse', 'wrap']], function (err, files) {
				files.should.have.length(1);
				files[0].content.should.eql("require.register(\'src/js/foo\', function(module, exports, require) {\n  var bar = require(\'./bar\')\n  \t, foo = this;\n});");
				done();
			});
		});
	});

	describe('build', function () {
		beforeEach(function () {
			fileFactory.cache.flush();
			this.target = targetFactory({type:'js', outputPath: path.resolve('temp'), fileExtensions:['js', 'coffee'], sources:['src'], runtimeOptions:{}});
		});
		afterEach(function () {
			this.target.reset();
		});
		it('should execute a "before" hook before running the build', function (done) {
			var target = this.target;
			target.before = new Function('global', 'process', 'console', 'require', 'context', 'options', 'done', 'context.foo="foo";done();');
			target.inputPath = path.resolve('src/js/foo.js');
			target.workflow = [['load', 'compile']];
			target.foo = 'bar';
			target.build()
				.then(function (filepaths) {
					target.foo.should.eql('foo');
					done();
				});
		});
		it('should execute an "after" hook after running the build', function (done) {
			var target = this.target;
			target.after = new Function('global', 'process', 'console', 'require', 'context', 'options', 'done', 'context.foo="foo";done();');
			target.inputPath = path.resolve('src/js/foo.js');
			target.workflow = [['load', 'compile']];
			target.foo = 'bar';
			target.build()
				.then(function (filepaths) {
					filepaths[0].should.eql(path.resolve('temp/js/foo.js'))
					target.foo.should.eql('foo');
					done();
				});
		});
		it('should execute an "afterEach" hook after each processed file is ready to write to disk', function (done) {
			this.target.afterEach = new Function('global', 'process', 'console', 'require', 'context', 'options', 'done', 'context.content="foo";done();');
			this.target.inputPath = path.resolve('src/js/foo.js');
			this.target.workflow = [['load', 'compile']];
			this.target.build()
				.then(function (filepaths) {
					filepaths[0].should.eql(path.resolve('temp/js/foo.js'))
					fs.readFileSync(filepaths[0], 'utf8').should.eql('/* generated by Buddy  */\n\nfoo');
					done();
				});
		});
		it('should return an error if a "before" hook returns an error', function (done) {
			this.target.before = new Function('global', 'process', 'console', 'require', 'context', 'options', 'callback', 'done("oops");');
			this.target.inputPath = path.resolve('src/js/foo.js');
			this.target.workflow = [['load', 'compile']];
			this.target.build()
				.then(function (filepaths) {
				}).catch(function (err) {
					should.exist(err);
					done();
				});
		});
		it('should return an error if an "after" hook returns an error', function (done) {
			this.target.after = new Function('global', 'process', 'console', 'require', 'context', 'options', 'callback', 'done("oops");');
			this.target.inputPath = path.resolve('src/js/foo.js');
			this.target.workflow = [['load', 'compile']];
			this.target.build()
				.then(function (filepaths) {
				}).catch(function (err) {
					should.exist(err);
					done();
				});
		});
	});
});

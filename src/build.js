// @flow

'use strict';

import type File, { WriteResult } from './File';
import FileCache from './cache/FileCache';
import type { BuildOptions, FileOptions, RuntimeOptions } from './config';

const { debug, print, strong, warn } = require('./utils/cnsl');
const { filepathName, findUniqueFilepath, isUniqueFilepath } = require('./utils/filepath');
const { isEmptyArray, isInvalid } = require('./utils/is');
const { maxInputStringLength, recommendedFileSizeLimit } = require('./settings');
const { truncate } = require('./utils/string');
const callable = require('./utils/callable');
const chalk = require('chalk');
const env = require('./utils/env');
const flatten = require('lodash/flatten');
const fs = require('fs');
const match = require('minimatch');
const parallel = require('async/parallel');
const path = require('path');
const prettyBytes = require('pretty-bytes');
const series = require('async/series');
const stopwatch = require('./utils/stopwatch');
const unique = require('lodash/uniq');
const waterfall = require('async/waterfall');
const zlib = require('zlib');

const RE_GENERATED_SHARED = /common|shared/;

module.exports = class Build {
  batch: boolean;
  boilerplate: boolean;
  bootstrap: boolean;
  browser: boolean;
  builds: Array<Build>;
  bundle: boolean;
  childInputpaths: Array<string>;
  fileCache: FileCache;
  fileFactory: (string, FileOptions) => File;
  fileFactoryOptions: FileOptions;
  generatedInputPattern: string;
  id: string;
  index: number;
  input: string;
  inputFiles: Array<File>;
  inputpaths: Array<string>;
  inputString: string;
  isAppServer: boolean;
  isDynamicBuild: boolean;
  isGeneratedBuild: boolean;
  label: string;
  level: number;
  options: BuildOptions;
  output: string;
  outputFiles: Array<File>;
  outputpaths: Array<string>;
  outputString: string;
  parent: Build;
  printPrefix: string;
  referencedFiles: Array<File>;
  results: Array<WriteResult>;
  runtimeOptions: RuntimeOptions;
  timerID: string;
  type: string;
  watchOnly: boolean;

  constructor(props: Object) {
    Object.assign(this, props);

    this.builds = [];
    this.childInputpaths = [];
    this.id = this.label || (!isInvalid(this.index) && this.index.toString());
    this.inputFiles = [];
    this.options;
    this.outputFiles = [];
    this.printPrefix = new Array(this.level + 1).join('\u2219');
    this.referencedFiles = [];
    this.results = [];
    this.timerID = this.inputpaths[0];

    // Handle printing long input/output arrays
    this.inputString = generatePathString(this.inputpaths);
    this.outputString = generatePathString(this.outputpaths);

    debug(`created Build instance with input: ${strong(this.inputString)} and output: ${strong(this.output)}`, 2);
  }

  /**
   * Determine if 'filepath' is a referenced file (child targets included)
   */
  hasFile(filepath: string): boolean {
    if (this.referencedFiles.some(refFile => refFile.filepath === filepath)) {
      return true;
    }
    if (!isEmptyArray(this.builds)) {
      return this.builds.some(build => build.hasFile(filepath));
    }

    return false;
  }

  /**
   * Run build
   */
  run(fn: (?Error, Array<WriteResult>) => void) {
    waterfall([callable(this, 'runProcess'), callable(this, 'runWrite'), callable(this, 'runReset')], fn);
  }

  /**
   * Run processing tasks
   */
  runProcess(fn: (?Error) => void) {
    waterfall(
      [
        // Initialize
        callable(this, 'init'),
        // Process input files
        callable(this, 'processFiles' /* , files */),
        // Print process progress
        callable(this, 'printProcessProgress' /* , referencedFiles */),
        // Print process progress
        callable(this, 'runProcessForChildren' /* , referencedFiles */),
        // Process generated build
        callable(this, 'processGeneratedBuild'),
        // Pre-process output files
        callable(this, 'preProcessWriteFiles')
      ],
      fn
    );
  }

  /**
   * Run write tasks
   */
  runWrite(fn: (?Error) => void) {
    waterfall(
      [
        // Write files
        callable(this, 'writeFiles', this.outputFiles),
        // Build child targets
        callable(this, 'runWriteForChildren' /* , referencedFiles, results */)
      ],
      fn
    );
  }

  /**
   * Run reset tasks
   * @param {Function} fn(err, results)
   */
  runReset(fn: (?Error, ?WriteResult) => void) {
    waterfall(
      [
        // Reset
        callable(this, 'reset', this.results),
        // Build child targets
        callable(this, 'runResetForChildren' /* , results */),
        // Write file progress
        callable(this, 'printWriteProgress' /* , results */)
      ],
      fn
    );
  }

  /**
   * Initialize state before run
   */
  init(fn: (?Error, ?Array<File>) => void) {
    let type = this.watchOnly && this.runtimeOptions.watch ? 'watching' : 'building';

    if (this.isDynamicBuild) {
      type += ' dynamic';
    }

    this.inputFiles = [];
    this.referencedFiles = [];
    this.results = [];
    this.outputFiles = [];
    this.options = {
      batch: !this.bundle && this.batch,
      boilerplate: this.boilerplate,
      bootstrap: this.bootstrap,
      browser: this.browser,
      bundle: this.bundle,
      compress: this.runtimeOptions.compress,
      // TODO: only include helpers in root? Difficult on watch
      helpers: true,
      ignoredFiles: this.childInputpaths,
      importBoilerplate: false,
      watchOnly: this.watchOnly
    };

    stopwatch.start(this.timerID);

    // Skip if watch only and not running a watch build
    if (this.watchOnly && !this.runtimeOptions.watch) {
      return void fn(null, []);
    }

    if (this.isGeneratedBuild) {
      print(`${this.printPrefix} ${type} ${strong(this.outputString)}`, 1);
    } else {
      print(
        `${this.printPrefix} ${type} ${strong(this.inputString)} ${this.outputString
          ? 'to ' + strong(this.outputString)
          : ''}`,
        1
      );
    }

    fn(
      null,
      this.inputpaths.reduce((files, filepath) => {
        const file = this.fileFactory(filepath);

        if (file == null) {
          warn(`${strong(filepath)} not found in project source`, 1);
        } else {
          // Force for dynamic builds
          file.options = this.fileFactoryOptions;
          files.push(file);
          this.inputFiles.push(file);
        }
        return files;
      }, [])
    );
  }

  /**
   * Process 'files'
   */
  processFiles(files: Array<File>, fn: (?Error, ?Array<File>) => void) {
    env('INPUT', files, this.id);
    env('INPUT_HASH', files, this.id);
    env('INPUT_DATE', files, this.id);

    parallel(files.map(file => callable(file, 'run', 'standard', this.options)), err => {
      if (err != null) {
        return fn(err);
      }
      this.referencedFiles = files.reduce((referencedFiles, file) => {
        referencedFiles.push(file);
        file.getAllDependencies().forEach(dependency => {
          if (!referencedFiles.includes(dependency)) {
            referencedFiles.push(dependency);
          }
        });
        return referencedFiles;
      }, []);
      fn(null, this.referencedFiles);
    });
  }

  /**
   * Print progress
   */
  printProcessProgress(files: Array<File>, fn: (?Error, ?Array<File>) => void) {
    if (files.length) {
      print(
        '[processed ' +
          strong(`${files.length}`) +
          (files.length > 1 ? ' files' : ' file') +
          ' in ' +
          chalk.cyan(stopwatch.stop(this.timerID, true)) +
          ']',
        2 + this.printPrefix.length
      );
    }
    fn(null, files);
  }

  /**
   * Run processing for child builds
   */
  runProcessForChildren(files: Array<File>, fn: (?Error, ?Array<File>) => void) {
    if (isEmptyArray(this.builds)) {
      return void fn();
    }

    // Lock files to prevent inclusion in downstream targets
    this.lock(this.referencedFiles);
    series(this.builds.map(build => callable(build, 'runProcess')), (err, childFiles) => {
      if (err != null) {
        return fn(err);
      }
      this.unlock(this.referencedFiles);
      fn();
    });
  }

  /**
   * Process generated build based on children
   */
  processGeneratedBuild(fn: (?Error) => void) {
    if (!this.isGeneratedBuild) {
      return void fn();
    }

    const dummyFile = this.inputFiles[0];
    let matchingFiles = [];

    function getFiles(builds) {
      return builds.reduce((files, build) => {
        files.push(
          ...build.inputFiles.reduce((files, file) => {
            // Use dependencyReferences to include those missing from dependencies due to locking etc.
            return files.concat(
              ...file.dependencyReferences.filter(reference => reference.file != null).map(reference => reference.file)
            );
          }, [])
        );
        // Traverse children
        if (!isEmptyArray(build.builds)) {
          files.push(...getFiles(build.builds));
        }
        return files;
      }, []);
    }

    if (RE_GENERATED_SHARED.test(this.generatedInputPattern)) {
      const seen = {};

      // Recursively generate 1D array of all inputFiles dependencies
      matchingFiles = getFiles(this.builds)
        // Include all files with at least 1 other match
        .reduce((matchingFiles, file) => {
          if (!(file.id in seen)) {
            seen[file.id] = 1;
          } else if (!matchingFiles.includes(file)) {
            matchingFiles.push(file);
          }
          return matchingFiles;
        }, []);
    } else {
      matchingFiles = unique(getFiles(this.builds)).filter(file =>
        match(file.filepath, this.generatedInputPattern, { matchBase: true, nocase: true })
      );
    }

    // Generate dummy dependency references
    const matchingDependencies = matchingFiles.map(file => {
      file.isDependency = false;
      return { filepath: file.filepath };
    });

    dummyFile.allDependencies = dummyFile.allDependencyReferences = null;
    dummyFile.addDependencies(matchingDependencies, this.options);
    dummyFile.getAllDependencies().forEach(dependency => {
      if (!this.referencedFiles.includes(dependency)) {
        this.referencedFiles.push(dependency);
      }
    });

    fn();
  }

  /**
   * Pre-process write files
   */
  preProcessWriteFiles(fn: (?Error) => void) {
    this.outputFiles = this.inputFiles
      .filter(file => file.isWriteable(this.options.batch))
      .reduce((outputFiles, file, idx) => {
        let filepath = '';

        this.inputpaths.some((inputpath, idx) => {
          if (inputpath === file.filepath) {
            filepath = this.outputpaths[idx];
            return true;
          }
        });

        // Don't write if no output path
        if (filepath) {
          // Handle generating unique paths
          if (isUniqueFilepath(filepath)) {
            // Remove existing
            const existing = findUniqueFilepath(filepath);

            if (existing) {
              try {
                fs.unlinkSync(existing);
              } catch (err) {
                /* ignore */
              }
            }
          }

          file.prepareForWrite(filepath, this.options);
          outputFiles.push(file);
          env('OUTPUT', file, this.id);
          env('OUTPUT_HASH', file, this.id);
          env('OUTPUT_DATE', file, this.id);
          env('OUTPUT_URL', file, this.id);
        }

        return outputFiles;
      }, []);

    fn(null);
  }

  /**
   * Write content for 'files'
   */
  writeFiles(files: Array<File>, fn: (?Error, ?Array<File>, ?Array<WriteResult>) => void) {
    const writeable = files.map(file => callable(file, 'write', this.options));

    // Results are [{ filepath, content, type }]
    parallel(writeable, (err, results) => {
      if (err != null) {
        return fn(err);
      }

      this.results = results;
      this.results.forEach(result => {
        result.printPrefix = this.printPrefix;
      });
      fn(null, files, results);
    });
  }

  /**
   * Run write for child builds
   */
  runWriteForChildren(files: Array<File>, results: Array<WriteResult>, fn: (?Error) => void) {
    if (isEmptyArray(this.builds)) {
      return void fn();
    }

    // Lock files to prevent inclusion in downstream targets
    this.lock(this.referencedFiles);
    series(this.builds.map(build => callable(build, 'runWrite')), (err, childResults) => {
      if (err != null) {
        return fn(err);
      }
      this.unlock(this.referencedFiles);
      fn();
    });
  }

  /**
   * Reset input files
   */
  reset(results: Array<WriteResult>, fn: (?Error, ?Array<WriteResult>) => void) {
    this.referencedFiles.forEach(file => file.reset());
    fn(null, results);
  }

  /**
   * Run reset for child builds
   */
  runResetForChildren(results: Array<WriteResult>, fn: (?Error, ?Array<WriteResult>) => void) {
    if (isEmptyArray(this.builds)) {
      return void fn(null, results);
    }

    series(this.builds.map(build => callable(build, 'runReset')), (err, childResults) => {
      if (err != null) {
        return fn(err);
      }
      fn(null, results.concat(flatten(childResults || [])));
    });
  }

  /**
   * Print progress
   */
  printWriteProgress(results: Array<WriteResult>, fn: (?Error, ?Array<WriteResult>) => void) {
    if (this.parent != null) {
      return void fn(null, results);
    }

    const prints = results.slice().reverse().map(result => {
      return callable(
        printResult,
        null,
        result,
        this.runtimeOptions.deploy,
        this.runtimeOptions.compress,
        result.printPrefix
      );
    });

    parallel(prints, err => {
      fn(err, results);
    });
  }

  /**
   * Set lock flag for 'files'
   */
  lock(files: Array<File>) {
    files.forEach(file => {
      file.isLocked = true;
    });
  }

  /**
   * Unset lock flag for 'files'
   */
  unlock(files: Array<File>) {
    files.forEach(file => {
      file.isLocked = false;
    });
  }
}

/**
 * Generate path string for 'paths'
 */
function generatePathString(paths: Array<string>): string {
  let pathString = '';

  if (paths == null || isEmptyArray(paths)) {
    return pathString;
  }

  if (paths.length > 1) {
    pathString = paths.map(pathItem => filepathName(pathItem));
    // Trim long lists
    if (pathString.length > maxInputStringLength) {
      const remainder = pathString.length - maxInputStringLength;

      pathString = `${pathString.slice(0, maxInputStringLength).join(', ')} ...and ${remainder} other${remainder > 1
        ? 's'
        : ''}`;
    } else {
      pathString = pathString.join(', ');
    }
  } else {
    pathString = filepathName(paths[0]);
  }

  return pathString;
}

/**
 * Print 'result'
 */
function printResult(
  result: WriteResult,
  isDeploy: boolean,
  isCompressed: boolean,
  prefix: string,
  fn: (?Error) => void
) {
  const relpath = truncate(path.relative(process.cwd(), result.filepath));

  if ((result.type === 'js' || result.type === 'css') && isDeploy) {
    zlib.gzip(result.content, (err, buffer) => {
      if (err != null) {
        return fn(err);
      }

      const stat = fs.statSync(result.filepath);
      const bytes = stat.size;
      const over = bytes > recommendedFileSizeLimit;
      const overZipped = buffer.length > recommendedFileSizeLimit;

      print(chalk.green(`${chalk.green(prefix)} built and compressed ${strong(relpath)}`), 1);
      print(`[compressed size: ${chalk[over ? 'red' : 'green'](prettyBytes(bytes))}]`, 2 + prefix.length);
      print(`[gzipped size: ${chalk[overZipped ? 'red' : 'green'](prettyBytes(buffer.length))}]`, 2 + prefix.length);
      if (over || overZipped) {
        warn(
          `the output file exceeds the recommended ${strong(prettyBytes(recommendedFileSizeLimit))} size`,
          2 + prefix.length
        );
        print(
          'Consider splitting into smaller bundles to help improve browser startup execution time',
          2 + prefix.length
        );
      }
      fn();
    });
  } else {
    print(chalk.green(`${chalk.green(prefix)} built${isCompressed ? ' and compressed' : ''} ${strong(relpath)}`), 1);
    fn();
  }
}

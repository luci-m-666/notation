/* eslint no-use-before-define:0, consistent-return:0, max-statements:0 */

import Notation from './notation';
import NotationError from './notation.error';
import utils from '../utils';

// http://www.linfo.org/wildcard.html
// http://en.wikipedia.org/wiki/Glob_%28programming%29
// http://en.wikipedia.org/wiki/Wildcard_character#Computing

// created test @ https://regex101.com/r/U08luj/2
const reMATCHER = /(\[(\d+|\*|".*"|'.*')\]|[a-z$_][a-z$_\d]*|\*)/gi; // ! negation should be removed first
// created test @ https://regex101.com/r/mC8unE/3
// /^!?(\*|[a-z$_][a-z$_\d]*|\[(\d+|".*"|'.*'|`.*`|\*)\])(\[(\d+|".*"|'.*'|`.*`|\*)\]|\.[a-z$_][a-z$_\d]*|\.\*)*$/i
const reVALIDATOR = new RegExp(
    '^'
    + '!?('                             // optional negation, only in the front
    + '\\*'                             // wildcard star
    + '|'                               // OR
    + '[a-z$_][a-z$_\\d]*'              // JS variable syntax
    + '|'                               // OR
    + '\\[(\\d+|\\*|".*"|\'.*\')\\]'    // array index or wildcard, or object bracket notation
    + ')'                               // exactly once
    + '('
    + '\\[(\\d+|\\*|".*"|\'.*\')\\]'    // followed by same
    + '|'                               // OR
    + '\\.[a-z$_][a-z$_\\d]*'           // dot, then JS variable syntax
    + '|'                               // OR
    + '\\.\\*'                          // dot, then wildcard star
    + ')*'                              // (both) may repeat any number of times
    + '$'
    , 'i'
);

const { re } = utils;
const ERR_INVALID = 'Invalid glob notation: ';

/**
 *  `Notation.Glob` is a utility for validating, comparing and sorting
 *  dot-notation globs.
 *
 *  You can use {@link http://www.linfo.org/wildcard.html|wildcard} stars `*`
 *  and negate the notation by prepending a bang `!`. A star will include all
 *  the properties at that level and a negated notation will be excluded.
 *  @name Notation.Glob
 *  @memberof! Notation
 *  @class
 *
 *  @example
 *  // for the following object;
 *  { name: 'John', billing: { account: { id: 1, active: true } } };
 *
 *  'billing.account.*'  // represents value `{ id: 1, active: true }`
 *  'billing.account.id' // represents value `1`
 *  '!billing.account.*' // represents value `{ name: 'John' }`
 *  'name' // represents `'John'`
 *  '*' // represents the whole object
 *
 *  @example
 *  var glob = new Notation.Glob('billing.account.*');
 *  glob.test('billing.account.id'); // true
 */
class NotationGlob {

    /**
     *  Constructs a `Notation.Glob` object with the given glob string.
     *  @constructs Notation.Glob
     *  @param {String} glob - Notation string with globs.
     *
     *  @throws {NotationError} - If given notation glob is invalid.
     */
    constructor(glob) {
        const ins = NotationGlob._inspect(glob);
        const notes = NotationGlob.split(ins.absGlob, true);
        const last = notes[notes.length - 1];
        const parent = notes.length > 1
            ? ins.absGlob.slice(0, -last.length).replace(/\.$/, '')
            : null;
        this._ = {
            ...ins,
            regexp: NotationGlob.toRegExp(ins.absGlob),
            notes,
            last,
            parent
        };
    }

    // --------------------------------
    // INSTANCE PROPERTIES
    // --------------------------------

    /**
     *  Gets the normalized glob notation string.
     *  @name Notation.Glob#glob
     *  @type {String}
     */
    get glob() {
        return this._.glob;
    }

    /**
     *  Gets the absolute glob notation without the negation prefix `!` and
     *  redundant trailing wildcards.
     *  @name Notation.Glob#absGlob
     *  @type {String}
     */
    get absGlob() {
        return this._.absGlob;
    }

    /**
     *  Specifies whether this glob is negated with a `!` prefix.
     *  @name Notation.Glob#isNegated
     *  @type {Boolean}
     */
    get isNegated() {
        return this._.isNegated;
    }

    /**
     *  Represents this glob in regular expressions.
     *  Note that the negation prefix (`!`) is ignored, if any.
     *  @name Notation.Glob#regexp
     *  @type {RegExp}
     */
    get regexp() {
        return this._.regexp;
    }

    /**
     *  List of notes/levels of this glob notation. Note that trailing,
     *  redundant wildcards are removed from the original glob notation.
     *  @name Notation.Glob#notes
     *  @alias Notation.Glob#levels
     *  @type {Array}
     */
    get notes() {
        return this._.notes;
    }

    /**
     *  Alias of `Notation.Glob#notes`.
     *  @private
     *  @name Notation.Glob#notes
     *  @alias Notation.Glob#levels
     *  @type {Array}
     */
    get levels() {
        return this._.notes;
    }

    /**
     *  Gets the first note of this glob notation.
     *  @name Notation.Glob#first
     *  @type {String}
     */
    get first() {
        return this.notes[0];
    }

    /**
     *  Gets the last note of this glob notation.
     *  @name Notation.Glob#last
     *  @type {String}
     */
    get last() {
        return this._.last;
    }

    /**
     *  Gets the parent notation (up to but excluding the last note) from the
     *  glob notation string. Note that initially, trailing/redundant wildcards
     *  are removed.
     *  @name Notation.Glob#parent
     *  @type {String}
     *
     *  @example
     *  NotationGlob.create('first.second.*').parent; // "first.second"
     *  NotationGlob.create('*.x.*').parent; // "*"
     *  NotationGlob.create('*').parent; // null (no parent)
     */
    get parent() {
        return this._.parent;
    }

    // --------------------------------
    // INSTANCE METHODS
    // --------------------------------

    /**
     *  Checks whether the given notation value matches the source notation
     *  glob.
     *  @name Notation.Glob#test
     *  @function
     *  @param {String} notation - The notation string to be tested. Cannot have
     *  any globs.
     *  @returns {Boolean} -
     *  @throws {NotationError} - If given `notation` is not valid or contains
     *  any globs.
     *
     *  @example
     *  const glob = new Notation.Glob('!prop.*.name');
     *  glob.test("prop.account.name"); // true
     */
    test(notation) {
        if (!Notation.isValid(notation)) {
            throw new NotationError(`Invalid notation: '${notation}'`);
        }
        // return this.regexp.test(notation);
        return this.covers(notation);
    }

    /**
     *  Specifies whether this glob notation can represent (or cover) the given
     *  glob. Note that negation prefix is ignored, if any.
     *  @param {String|Array|NotationGlob} glob  Glob notation string, glob
     *  notes array or a `NotationGlob` instance.
     *  @returns {Boolean} -
     *
     *  @example
     *  const glob = Notation.Glob.create;
     *  glob('*.y').covers('x.y')      // true
     *  glob('x[*].y').covers('x[*]')  // false
     */
    covers(glob) {
        return NotationGlob.covers(this, glob);
    }

    // --------------------------------
    // STATIC MEMBERS
    // --------------------------------

    /**
     *  Basically constructs a new `NotationGlob` instance
     *  with the given glob string.
     *  @name Notation.Glob.create
     *  @function
     *  @param {String} glob - The source notation glob.
     *  @returns {NotationGlob} -
     *
     *  @example
     *  const glob = Notation.Glob.create(strGlob);
     *  // equivalent to:
     *  const glob = new Notation.Glob(strGlob);
     */
    static create(glob) {
        return new NotationGlob(glob);
    }

    // Created test at: https://regex101.com/r/tJ7yI9/4
    /**
     *  Validates the given notation glob.
     *  @name Notation.Glob.isValid
     *  @function
     *
     *  @param {String} glob - Notation glob to be validated.
     *  @returns {Boolean} -
     */
    static isValid(glob) {
        return (typeof glob === 'string') && reVALIDATOR.test(glob);
    }

    /**
     *  Gets a regular expressions instance from the given glob notation.
     *  Note that the bang `!` prefix will be ignored if the given glob is negated.
     *  @name Notation.Glob.toRegExp
     *  @function
     *  @param {String} glob - Glob notation to be converted.
     *
     *  @returns {RegExp} - A `RegExp` instance from the glob.
     *
     *  @throws {NotationError} - If given notation glob is invalid.
     */
    static toRegExp(glob) {
        if (!NotationGlob.isValid(glob)) {
            throw new NotationError(`${ERR_INVALID} '${glob}'`);
        }

        let g = glob.indexOf('!') === 0 ? glob.slice(1) : glob;
        g = utils.pregQuote(g)
            // `[*]` always represents array index e.g. `[1]`. so we'd replace
            // `\[\*\]` with `\[\d+\]` but we should also watch for quotes: e.g.
            // `["x[*]y"]`
            .replace(/\\\[\\\*\\\](?=(?:[^"]|"[^"]*")*$)(?=(?:[^']|'[^']*')*$)/g, '\\[\\d+\\]')
            // `*` within quotes (e.g. ['*']) is non-wildcard, just a regular star char.
            // `*` outside of quotes is always JS variable syntax e.g. `prop.*`
            .replace(/\\\*(?=(?:[^"]|"[^"]*")*$)(?=(?:[^']|'[^']*')*$)/g, '[a-z$_][a-z$_\\d]*')
            .replace(/\\\?/g, '.');
        return new RegExp('^' + g + '(?:[\\[\\.].+|$)', 'i');
        // it should either end ($) or continue with a dot or bracket. So for
        // example, `company.*` will produce `/^company\.[a-z$_][a-z$_\\d]*(?:[\\[|\\.].+|$)/`
        // which will match both `company.name` and `company.address.street` but
        // will not match `some.company.name`. Also `!password` will not match
        // `!password_reset`.
    }

    /**
     *  Specifies whether first glob notation can represent (or cover) the
     *  second.
     *  @param {String|Object|NotationGlob} globA  Source glob notation string or inspection
     *  result object or `NotationGlob` instance.
     *  @param {String|Object|NotationGlob} globB  Glob notation string or inspection result
     *  object or `NotationGlob` instance.
     *  @returns {Boolean} -
     *
     *  @example
     *  const { covers } = NotationGlob;
     *  covers('*.y', 'x.y')      // true
     *  covers('x[*].y', 'x[*]')  // false
     */
    static covers(globA, globB) {
        const a = typeof globA === 'string'
            ? new NotationGlob(globA)
            : globA; // assume (globA instanceof NotationGlob || utils.type(globA) === 'object')

        const b = typeof globB === 'string'
            ? new NotationGlob(globB)
            : globB;

        const notesA = a.notes || NotationGlob.split(a.absGlob);
        const notesB = b.notes || NotationGlob.split(b.absGlob);

        // !x.*.* does not cover !x.* or x.* bec. !x.*.* !== x.* !== x
        // x.*.* covers x.* bec. x.*.* === x.* === x
        if (a.isNegated && notesA.length > notesB.length) return false;

        let covers = true;
        for (let i = 0; i < notesA.length; i++) {
            if (!_coversNote(notesA[i], notesB[i])) {
                covers = false;
                break;
            }
        }
        return covers;
    }

    // this should only be used with negated globs when union'ing.
    static _intersect(globA, globB) {
        // if any one of them is negated, intersection is negated.
        const bang = globA[0] === '!' || globB[0] === '!' ? '!' : '';

        const notesA = NotationGlob.split(globA);
        const notesB = NotationGlob.split(globB);
        const len = Math.max(notesA.length, notesB.length);
        let notesI = [];
        let a, b;
        //   x.*  ∩  *.y   »  x.y
        // x.*.*  ∩  *.y   »  x.y.*
        // x.*.z  ∩  *.y   »  x.y.z
        //   x.y  ∩  *.b   »  (n/a)
        //   x.y  ∩  a.*   »  (n/a)
        for (let i = 0; i < len; i++) {
            a = notesA[i];
            b = notesB[i];
            if (a === b) {
                notesI.push(a);
            } else if (a && re.WILDCARD.test(a)) {
                if (!b) {
                    notesI.push(a);
                } else {
                    notesI.push(b);
                }
            } else if (b && re.WILDCARD.test(b)) {
                if (!a) {
                    notesI.push(b);
                } else {
                    notesI.push(a);
                }
            } else if (a && !b) {
                notesI.push(a);
            } else if (!a && b) {
                notesI.push(b);
            } else { // if (a !== b) {
                notesI = [];
                break;
            }
        }

        if (notesI.length > 0) return bang + utils.joinNotes(notesI);
        return null;
    }

    /**
     *  Undocumented.
     *  @private
     *  @param {String} glob -
     *  @returns {Object} -
     */
    static _inspect(glob) {
        const g = utils.normalizeGlobStr(glob);
        if (!NotationGlob.isValid(g)) {
            throw new NotationError(`${ERR_INVALID} '${glob}'`);
        }
        const isNegated = g[0] === '!';
        return {
            glob: g,
            isNegated,
            absGlob: isNegated ? g.slice(1) : g
        };
    }

    /**
     *  Splits the given glob notation string into its notes (levels). Note that
     *  this will exclude the `!` negation prefix, if it exists.
     *  @param {String} glob  Glob notation string to be splitted.
     *  @param {String} [normalize=false]  Whether to remove trailing, redundant
     *  wildcards.
     *  @returns {Array} - A string array of glob notes (levels).
     *  @throws {NotationError} - If given glob notation is invalid.
     */
    static split(glob, normalize = false) {
        if (!NotationGlob.isValid(glob)) {
            throw new NotationError(`${ERR_INVALID} '${glob}'`);
        }
        const g = normalize ? utils.normalizeGlobStr(glob) : glob;
        return g.replace(/^!/, '').match(reMATCHER);
    }

    /**
     *  Compares two given notation globs and returns an integer value as a
     *  result. This is generally used to sort glob arrays. Loose globs (with
     *  stars especially closer to beginning of the glob string) and globs
     *  representing the parent/root of the compared property glob come first.
     *  Verbose/detailed/exact globs come last. (`* < *.abc < abc`).
     *
     *  For instance; `store.address` comes before `store.address.street`. So
     *  this works both for `*, store.address.street, !store.address` and `*,
     *  store.address, !store.address.street`. For cases such as `prop.id` vs
     *  `!prop.id` which represent the same property; the negated glob comes
     *  last.
     *  @name Notation.Glob.compare
     *  @function
     *
     *  @param {String} globA - First notation glob to be compared.
     *  @param {String} globB - Second notation glob to be compared.
     *
     *  @returns {Number} - Returns `-1` if `globA` comes first, `1` if `globB`
     *  comes first and `0` if equivalent priority.
     *
     *  @throws {NotationError} - If either `globA` or `globB` is invalid glob
     *  notation.
     *
     *  @example
     *  const { compare } = Notation.Glob;
     *  console.log(compare('prop.*.name', 'prop.*')); // 1
     */
    static compare(globA, globB) {
        // trivial case, both are exactly the same!
        // or both are wildcard e.g. `*` or `[*]`
        if (globA === globB || (re.WILDCARD.test(globA) && re.WILDCARD.test(globB))) return 0;

        const { split, _inspect } = NotationGlob;

        const a = _inspect(globA);
        const b = _inspect(globB);
        const notesA = split(a.absGlob);
        const notesB = split(b.absGlob);

        // Check depth (number of levels)
        if (notesA.length === notesB.length) {
            // count wildcards
            const wildCountA = (a.absGlob.match(re.WILDCARDS) || []).length;
            const wildCountB = (b.absGlob.match(re.WILDCARDS) || []).length;
            if (wildCountA === wildCountB) {
                // check for negation
                if (!a.isNegated && b.isNegated) return -1;
                if (a.isNegated && !b.isNegated) return 1;
                // both are negated or neither are, return alphabetical
                return a.absGlob < b.absGlob ? -1 : (a.absGlob > b.absGlob ? 1 : 0);
            }
            return wildCountA > wildCountB ? -1 : 1;
        }

        return notesA.length < notesB.length ? -1 : 1;
    }

    /**
     *  Sorts the notation globs in the given array by their priorities. Loose
     *  globs (with stars especially closer to beginning of the glob string);
     *  globs representing the parent/root of the compared property glob come
     *  first. Verbose/detailed/exact globs come last. (`* < *abc < abc`).
     *
     *  For instance; `store.address` comes before `store.address.street`. For
     *  cases such as `prop.id` vs `!prop.id` which represent the same property;
     *  the negated glob wins (comes last).
     *  @name Notation.Glob.sort
     *  @function
     *  @param {Array} globsArray - The notation globs array to be sorted. The
     *  passed array reference is modified.
     *  @returns {Array} -
     *
     *  @example
     *  const { sort } = Notation.Glob;
     *  console.log(sort(['!prop.*.name', 'prop.*', 'prop.id']));
     *  // ['prop.*', 'prop.id', '!prop.*.name'];
     */
    static sort(globsArray) {
        return globsArray.sort(NotationGlob.compare);
    }

    /**
     *  Normalizes the given notation globs array by removing duplicate or
     *  redundant items and returns a priority-sorted globs array.
     *
     *  <ul>
     *  <li>If any exact duplicates found, all except first is removed.</li>
     *  <li>If both normal and negated versions of a glob are found, negated wins.
     *  <br />example: `['id', '!id']` normalizes to `['!id']`.</li>
     *  <li>If a glob is covered by another, it's removed.
     *  <br />example: `['car.*', 'car.model']` normalizes to `['car.*']`.</li>
     *  <li>If a glob is covered by another negated glob, it's removed.
     *  <br />example: `['*', '!car.*', 'car.model']` normalizes to `['*', '!car.*']`.</li>
     *  <li>If a negated glob is covered by another glob, it's kept.
     *  <br />example: `['car.*', '!car.model']` normalizes as is.</li>
     *  </ul>
     *  @name Notation.Glob.normalize
     *  @function
     *  @param {Array} globsArray - Notation globs array to be normalized.
     *  @returns {Array} -
     *
     *  @throws {NotationError} - If any item in globs list is invalid.
     *
     *  @example
     *  const globs = ['*', '!id', 'name', 'car.model', '!car.*', 'id', 'name', 'age'];
     *  const { normalize } = Notation.Glob;
     *  console.log(normalize(globs)); // ['*', '!car.*', '!id']
     */
    static normalize(globsArray) {
        const { _inspect, covers, _intersect } = NotationGlob;

        const list = utils.ensureArray(globsArray)
            // prevent mutation
            .concat()
            // move negated globs to top. this is needed before normalization.
            // when complete, we'll sort with our .compare() function.
            .sort(_negFirstSort)
            // turning string array into inspect-obj array, so that we'll not
            // run _inspect multiple times in the inner loop. this also
            // pre-validates each glob.
            .map(_inspect);

        // early return if we have a single item
        if (list.length === 1) {
            const g = list[0];
            // single negated item is redundant
            if (g.isNegated) return [];
            // return normalized
            return [g.glob];
        }

        // flag to return an empty array, if true
        let negateAll = false;
        // we'll push keepers in this array
        let normalized = [];
        // storage to keep intersections. using an object to prevent duplicates.
        const intersections = {};

        // iterate each glob by comparing it to remaining globs.
        utils.eachRight(list, (a, indexA) => {

            // return empty if a negate-all is found (which itself is also
            // redundant if single): '!*' or '![*]'
            if (utils.re.NEGATE_ALL.test(a.glob)) {
                negateAll = true;
                return false;
            }

            // flags
            let duplicate = false;
            let hasExactNeg = false;
            // flags for negated
            let negCoversPos = false;
            // let negCoversNeg = false;
            let negCoveredByPos = false;
            let negCoveredByNeg = false;
            // flags for non-negated (positive)
            let posCoversPos = false;
            // let posCoversNeg = false;
            let posCoveredByNeg = false;
            let posCoveredByPos = false;

            utils.eachRight(list, (b, indexB) => {
                // don't inspect glob with itself
                if (indexA === indexB) return; // move to next

                // remove if duplicate
                if (a.glob === b.glob) {
                    console.log('removing duplicate index', indexA, ':', a.glob);
                    list.splice(indexA, 1);
                    duplicate = true;
                    return false; // break out
                }

                // remove if positive has an exact negated (negated wins when
                // normalized) e.g. ['*', 'a', '!a'] => ['*', '!a']
                if (!a.isNegated && _isReverseOf(a, b)) {
                    console.log('removing (has ex. neg.) index', indexA, ':', a.glob);
                    list.splice(indexA, 1);
                    hasExactNeg = true;
                    return false; // break out
                }

                const coversB = covers(a, b);
                const coveredByB = coversB ? false : covers(b, a);
                console.log('»»', a.glob, 'covers    ', b.glob, '=', coversB);
                console.log('»»', a.glob, 'covered by', b.glob, '=', coveredByB);
                if (a.isNegated) {
                    if (b.isNegated) {
                        // if (coversB) negCoversNeg = true;
                        // if negated (a) covered by any other negated (b); remove (a)!
                        if (coveredByB) {
                            negCoveredByNeg = true;
                            console.log('negCoveredByNeg removing', a.glob, ' (covered by', b.glob + ')');
                            list.splice(indexA, 1);
                            return false; // break out
                        }
                    } else {
                        if (coversB) negCoversPos = true;
                        if (coveredByB) negCoveredByPos = true;
                        // try intersection if none covers the other and only
                        // one of them is negated.
                        if (!coversB && !coveredByB) {
                            const _int = _intersect(a.glob, b.glob);
                            if (_int) intersections[_int] = _int;
                        }
                    }
                } else {
                    if (b.isNegated) {
                        // if (coversB) posCoversNeg = true;
                        // if positive (a) covered by any negated (b); remove (a)!
                        if (coveredByB) {
                            posCoveredByNeg = true;
                            console.log('posCoveredByNeg removing', a.glob, ' (covered by', b.glob + ')');
                            list.splice(indexA, 1);
                            return false; // break out
                        }
                        // try intersection if none covers the other and only
                        // one of them is negated.
                        if (!coversB && !coveredByB) {
                            const _int = _intersect(a.glob, b.glob);
                            if (_int) intersections[_int] = _int;
                        }
                    } else {
                        if (coversB) posCoversPos = coversB;
                        // if positive (a) covered by any other positive (b); remove (a)!
                        if (coveredByB) {
                            posCoveredByPos = true;
                            console.log('posCoveredByPos removing', a.glob, ' (covered by', b.glob + ')');
                            list.splice(indexA, 1);
                            return false; // break out
                        }
                    }
                }

            });

            const keep = !hasExactNeg && (
                a.isNegated
                    ? ((negCoversPos || negCoveredByPos) && !negCoveredByNeg)
                    : ((posCoversPos || !posCoveredByPos) && !posCoveredByNeg)
            );

            console.log('» negCoversPos', negCoversPos);
            console.log('» negCoveredByPos', negCoveredByPos);
            console.log('» negCoveredByNeg', negCoveredByNeg);
            console.log('» keep', a.glob, '=', keep);
            console.log('--------');
            if (keep && !duplicate) normalized.push(a.glob);
        });

        if (negateAll) return [];

        // merge normalized list with intersections if any
        normalized = normalized.concat(Object.keys(intersections));
        return NotationGlob.sort(normalized);
    }

    static _compareUnion(globsListA, globsListB, union = []) {
        const { covers } = NotationGlob;
        function log(...args) {
            // console.log(...args);
        }

        const { _inspect, _intersect } = NotationGlob;

        utils.eachRight(globsListA, globA => {
            if (union.indexOf(globA) >= 0) return; // next

            const a = _inspect(globA);

            // if wildcard only, add...
            if (utils.re.WILDCARD.test(a.absGlob)) {
                union.push(a.glob); // push normalized glob
                return; // next
            }

            let notCovered = false;
            let hasExact = false;
            let negCoversNeg = false;
            let posCoversNeg = false;
            let posCoversPos = false;
            let negCoversPos = false;
            const negIntersections = [];

            log(globA);

            utils.eachRight(globsListB, globB => {

                // (A) keep if has exact in the other
                if (globA === globB) {
                    hasExact = true;
                    log('hasExact', globB, hasExact);
                    // return false; // break out
                }

                const b = _inspect(globB);

                // (B) keep if positive has an exact negated.
                // non-negated wins when union'ed
                // if (_isExactNegated(b, a)) {
                //     hasExactNeg = true;
                //     log('hasExactNeg', globB, hasExactNeg);
                //     // return false; // break out
                // } else
                // if (_isExactNegated(a, b)) {
                //     hasExactPos = true;
                //     return false; // break out
                // }

                // (C) keep negated if:
                //    1) any negative covers it
                //       '!a.b'  '!a.*']  => '!a.b' is removed
                //    2) no positive covers it
                //       ['!a.b', 'a.c']   => '!a.b' is removed

                // (D) keep positive if:
                //    1) no positive covers it OR any negative covers it
                //       ['*', 'a.b']            => 'a.b' is removed
                //       ['*', 'a.b', '!a.*']    => 'a.b' is kept

                notCovered = !covers(b, a);
                if (notCovered) {
                    log('notCovered', globB, notCovered);
                    if (a.isNegated && b.isNegated) {
                        const intersection = _intersect(a.glob, b.glob);
                        if (intersection) negIntersections.push(intersection);
                    }
                    return; // next
                }

                if (a.isNegated) {
                    if (b.isNegated) {
                        negCoversNeg = !hasExact;
                        log('negCoversNeg', globB, negCoversNeg, b.glob, a.glob);
                    } else {
                        posCoversNeg = true; // set flag
                        log('posCoversNeg', globB, posCoversNeg);
                    }
                } else {
                    if (!b.isNegated) {
                        posCoversPos = !hasExact;
                        log('posCoversPos', globB, posCoversPos);
                    } else {
                        negCoversPos = true; // set flag
                        log('negCoversPos', globB, negCoversPos);
                    }
                }

            });


            const keep = a.isNegated
                ? (!posCoversNeg || negCoversNeg)
                : (!posCoversPos || negCoversPos);

            log('keep', a.glob, '=', hasExact || keep || (notCovered && !a.isNegated));
            log('--------');
            if (hasExact || keep || (notCovered && !a.isNegated)) {
                union.push(a.glob); // push normalized glob
                return;
            }

            if (a.isNegated && posCoversNeg && !negCoversNeg && negIntersections.length > 0) {
                union = union.concat(negIntersections); // eslint-disable-line no-param-reassign
            }

        });

        return union;
    }

    /**
     *  Gets the union from the given couple of glob arrays and returns
     *  a new array of globs.
     *  <ul>
     *  <li>If the exact same element is found in both
     *  arrays, one of them is removed to prevent duplicates.
     *  <br />example: `['!id', 'name'] ∪ ['!id']` unites to `['!id', 'name']`</li>
     *  <li>If any non-negated item is covered by a glob in the same
     *  or other array, the redundant item is removed.
     *  <br />example: `['*', 'name'] ∪ ['email']` unites to `['*']`</li>
     *  <li>If one of the arrays contains a negated equivalent of an
     *  item in the other array, the negated item is removed.
     *  <br />example: `['!id'] ∪ ['id']` unites to `['id']`</li>
     *  <li>If any item covers/matches a negated item in the other array,
     *  the negated item is removed.
     *  <br />example #1: `['!user.id'] ∪ ['user.*']` unites to `['user.*']`
     *  <br />example #2: `['*'] ∪ ['!password']` unites to `['*']`
     *  </li>
     *  <li>So on... For a deeper understanding read the inline code
     *  documentation.</li>
     *  </ul>
     *  @name Notation.Glob.union
     *  @function
     *
     *  @param {Array} globsA - First array of glob strings.
     *  @param {Array} globsB - Second array of glob strings.
     *
     *  @returns {Array} -
     *
     *  @example
     *  const a = ['foo.bar', 'bar.baz', '!*.qux'];
     *  const b = ['!foo.bar', 'bar.qux', 'bar.baz'];
     *  const union = Notation.Glob.union(a, b);
     *  console.log(union);
     *  // ['!*.qux', 'foo.bar', 'bar.baz', 'bar.qux']
     */
    static union(globsA, globsB) {
        if (globsA.length === 0) return globsB.concat();
        if (globsB.length === 0) return globsA.concat();

        const { normalize, _compareUnion } = NotationGlob;

        const listA = normalize(globsA);
        const listB = normalize(globsB);
        const union = _compareUnion(listA, listB);
        return normalize(_compareUnion(listB, listA, union));
    }

}

// --------------------------------
// HELPERS
// --------------------------------

function _coversNote(a, b) {
    if (a === b) return true;
    // if (!a && re.WILDCARD.test(b)) return false;
    const bIsArr = b ? re.ARRAY_GLOB_NOTE.test(b) : null;
    if (a === '*' && (!b || !bIsArr)) return true;
    if (a === '[*]' && (!b || bIsArr)) return true;
    return false;
}

// x vs !x.*.*      » false
// x vs !x[*]       » true
// x[*] vs !x       » true
// x[*] vs !x[*]    » false
// x.* vs !x.*      » false
function _isReverseOf(a, b) {
    return a.isNegated !== b.isNegated
        && a.absGlob === b.absGlob;
}

const _rx = /^\s*!/;
function _negFirstSort(a, b) {
    return _rx.test(a) ? -1 : (_rx.test(b) ? 1 : 0);
}

// --------------------------------
// EXPORT
// --------------------------------

export default NotationGlob;

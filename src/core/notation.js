/* eslint no-use-before-define:0, consistent-return:0, max-statements:0, max-len:0 */

import { Glob } from './notation.glob';
import { NotationError } from './notation.error';
import { utils } from '../utils';

const ERR = {
    SOURCE: 'Invalid source. Expected a data object or array.',
    DEST: 'Invalid destination. Expected a data object or array.',
    NOTATION: 'Invalid notation: ',
    NOTA_OBJ: 'Invalid notations object. ',
    NO_INDEX: 'Implied index does not exist: ',
    NO_PROP: 'Implied property does not exist: '
};

// created test @ https://regex101.com/r/vLE16M/2
const reMATCHER = /(\[(\d+|".*"|'.*'|`.*`)\]|[a-z$_][a-z$_\d]*)/gi;
// created test @ https://regex101.com/r/fL3PJt/1/
// /^([a-z$_][a-z$_\d]*|\[(\d+|".*"|'.*'|`.*`)\])(\[(\d+|".*"|'.*'|`.*`)\]|(\.[a-z$_][a-z$_\d]*))*$/i
const reVALIDATOR = new RegExp(
    '^('
    + '[a-z$_][a-z$_\\d]*'          // JS variable syntax
    + '|'                           // OR
    + '\\[(\\d+|".*"|\'.*\')\\]'    // array index or object bracket notation
    + ')'                           // exactly once
    + '('
    + '\\[(\\d+|".*"|\'.*\')\\]'    // followed by same
    + '|'                           // OR
    + '\\.[a-z$_][a-z$_\\d]*'       // dot, then JS variable syntax
    + ')*'                          // (both) may repeat any number of times
    + '$'
    , 'i'
);

const DEFAULT_OPTS = Object.freeze({
    strict: false,
    preserveIndices: false
});

/**
 *  Notation.js for Node and Browser.
 *
 *  Like in most programming languages, JavaScript makes use of dot-notation to
 *  access the value of a member of an object (or class). `Notation` class
 *  provides various methods for modifying / processing the contents of the
 *  given object; by parsing object notation strings or globs.
 *
 *  Note that this class will only deal with enumerable properties of the source
 *  object; so it should be used to manipulate data objects. It will not deal
 *  with preserving the prototype-chain of the given object.
 *
 *  @author   Onur Yıldırım <onur@cutepilot.com>
 *  @license  MIT
 */
class Notation {

    /**
     *  Initializes a new instance of `Notation`.
     *
     *  @param {Object|Array} [source={}] - The source object (or array) to be
     *  notated. Can either be an array or object. If omitted, defaults to an
     *  empty object.
     *  @param {Object} [options] - Notation options.
     *      @param {Boolean} [options.strict=false] - Whether to throw either when
     *      a notation path does not exist on the source (i.e. `#get()` and `#remove()`
     *      methods); or notation path exists but overwriting is disabled (i.e.
     *      `#set()` method). (Note that `.inspectGet()` and `.inspectRemove()` methods
     *      are exceptions). It's recommended to set this to `true` and prevent silent
     *      failures if you're working with sensitive data. Regardless of `strict` option,
     *      it will always throw on invalid notation syntax or other crucial failures.
     *
     *  @example
     *  const obj = { car: { brand: "Dodge", model: "Charger", year: 1970 } };
     *  const notation = new Notation(obj);
     *  notation.get('car.model')   // » "Charger"
     *  notation.remove('car.model').set('car.color', 'red').value
     *  // » { car: { brand: "Dodge", year: 1970, color: "red" } }
     */
    constructor(source, options) {
        if (arguments.length === 0) {
            this._source = {};
        } else if (!utils.isCollection(source)) {
            throw new NotationError(ERR.SOURCE);
        } else {
            this._source = source;
        }

        this._isArray = utils.type(this._source) === 'array';
        this.options = options;
    }

    // --------------------------------
    // INSTANCE PROPERTIES
    // --------------------------------

    /**
     *  Gets or sets notation options.
     *  @type {Object}
     */
    get options() {
        return this._options;
    }

    set options(value) {
        this._options = {
            ...DEFAULT_OPTS,
            ...(this._options || {}),
            ...(value || {})
        };
    }

    /**
     *  Gets the value of the source object.
     *  @type {Object|Array}
     *
     *  @example
     *  const person = { name: "Onur" };
     *  const me = Notation.create(person)
     *      .set("age", 36)
     *      .set("car.brand", "Ford")
     *      .set("car.model", "Mustang")
     *      .value;
     *  console.log(me); // { name: "Onur", age: 36, car: { brand: "Ford", model: "Mustang" } }
     *  console.log(person === me); // true
     */
    get value() {
        return this._source;
    }

    // --------------------------------
    // INSTANCE METHODS
    // --------------------------------

    /**
     *  Recursively iterates through each key of the source object and invokes
     *  the given callback function with parameters, on each non-object value.
     *
     *  @param {Function} callback - The callback function to be invoked on
     *  each on each non-object value. To break out of the loop, return `false`
     *  from within the callback.
     *  Callback signature: `callback(notation, key, value, object) { ... }`
     *
     *  @returns {Notation} - The current `Notation` instance (self).
     *
     *  @example
     *  const obj = { car: { brand: "Dodge", model: "Charger", year: 1970 } };
     *  Notation.create(obj).each(function (notation, key, value, object) {
     *      console.log(notation, value);
     *  });
     *  // "car.brand"  "Dodge"
     *  // "car.model"  "Charger"
     *  // "car.year"  1970
     */
    each(callback) {
        _each(this._source, callback);
        return this;
    }

    /**
     *  Iterates through each note of the given notation string by evaluating
     *  it on the source object.
     *
     *  @param {String} notation - The notation string to be iterated through.
     *  @param {Function} callback - The callback function to be invoked on
     *  each iteration. To break out of the loop, return `false` from within
     *  the callback. Signature: `callback(levelValue, note, index, list)`
     *
     *  @returns {Notation} - The current `Notation` instance (self).
     *
     *  @example
     *  const obj = { car: { brand: "Dodge", model: "Charger", year: 1970 } };
     *  Notation.create(obj)
     *      .eachValue("car.brand", function (levelValue, note, index, list) {
     *          console.log(note, levelValue); // "car.brand" "Dodge"
     *      });
     */
    eachValue(notation, callback) {
        let level = this._source;
        Notation.eachNote(notation, (levelNotation, note, index, list) => {
            level = utils.hasOwn(level, note) ? level[note] : undefined;
            if (callback(level, levelNotation, note, index, list) === false) return false;

        });
        return this;
    }

    /**
     *  Gets the list of notations from the source object (keys).
     *
     *  @returns {Array} - An array of notation strings.
     *
     *  @example
     *  const obj = { car: { brand: "Dodge", model: "Charger", year: 1970 } };
     *  const notations = Notation.create(obj).getNotations();
     *  console.log(notations); // [ "car.brand", "car.model", "car.year" ]
     */
    getNotations() {
        const list = [];
        this.each(notation => {
            list.push(notation);
        });
        return list;
    }

    /**
     *  Deeply clones the source object. This is also useful if you want to
     *  prevent mutating the original source object.
     *
     *  <blockquote>
     *  Note that `Notation` expects a data object (or array) with enumerable
     *  properties. In addition to plain objects and arrays; supported cloneable
     *  property/value types are primitives (such as `String`, `Number`,
     *  `Boolean`, `Symbol`, `null` and `undefined`) and built-in types (such as
     *  `Date` and `RegExp`).
     *
     *  Enumerable properties with types other than these (such as methods,
     *  special objects, custom class instances, etc) will be copied by reference.
     *  Non-enumerable properties will not be cloned.
     *
     *  If you still need full clone support, you can use a library like lodash.
     *  e.g. `Notation.create(_.cloneDeep(source))`
     *  </blockquote>
     *
     *  @returns {Notation} - The current `Notation` instance (self).
     *
     *  @example
     *  const mutated = Notation.create(source1).set('newProp', true).value;
     *  console.log(source1.newProp); // ——» true
     *
     *  const cloned = Notation.create(source2).clone().set('newProp', true).value;
     *  console.log('newProp' in source2); // ——» false
     *  console.log(cloned.newProp); // ——» true
     */
    clone() {
        this._source = utils.cloneDeep(this._source);
        return this;
    }

    /**
     *  Flattens the source object to a single-level object with notated keys.
     *
     *  @returns {Notation} - The current `Notation` instance (self).
     *
     *  @example
     *  const obj = { car: { brand: "Dodge", model: "Charger", year: 1970 } };
     *  console.log(Notation.create(obj).flatten().value);
     *  // {
     *  //     "car.brand": "Dodge",
     *  //     "car.model": "Charger",
     *  //     "car.year": 1970
     *  // }
     */
    flatten() {
        const o = {};
        this.each((notation, key, value) => {
            o[notation] = value;
        });
        this._source = o;
        return this;
    }

    /**
     *  Aggregates notated keys of a (single-level) object, and nests them under
     *  their corresponding properties. This is the opposite of `Notation#flatten`
     *  method. This might be useful when expanding a flat object fetched from
     *  a database.
     *  @alias Notation#aggregate
     *  @chainable
     *
     *  @returns {Notation} - The current `Notation` instance (self).
     *
     *  @example
     *  const obj = { "car.brand": "Dodge", "car.model": "Charger", "car.year": 1970 }
     *  const expanded = Notation.create(obj).expand().value;
     *  console.log(expanded); // { car: { brand: "Dodge", model: "Charger", year: 1970 } };
     */
    expand() {
        this._source = Notation.create({}).merge(this._source).value;
        return this;
    }

    /**
     *  Alias for `#expand`
     *  @private
     *  @returns {Notation} -
     */
    aggregate() {
        return this.expand();
    }

    /**
     *  Inspects the given notation on the source object by checking
     *  if the source object actually has the notated property;
     *  and getting its value if exists.
     *  @param {String} notation - The notation string to be inspected.
     *  @returns {InspectResult} - The result object.
     *
     *  @example
     *  Notation.create({ car: { year: 1970 } }).inspectGet("car.year");
     *  // { has: true, value: 1970, lastNote: 'year', lastNoteNormalized: 'year' }
     *  Notation.create({ car: { year: 1970 } }).inspectGet("car.color");
     *  // { has: false }
     *  Notation.create({ car: { color: undefined } }).inspectGet("car.color");
     *  // { has: true, value: undefined, lastNote: 'color', lastNoteNormalized: 'color' }
     *  Notation.create({ car: { brands: ['Ford', 'Dodge'] } }).inspectGet("car.brands[1]");
     *  // { has: true, value: 'Dodge', lastNote: '[1]', lastNoteNormalized: 1 }
     */
    inspectGet(notation) {
        let level = this._source;
        let result = { has: false, value: undefined };
        let parent;
        Notation.eachNote(notation, (levelNotation, note, index) => {
            const lastNoteNormalized = utils.normalizeNote(note);
            if (utils.hasOwn(level, lastNoteNormalized)) {
                level = level[lastNoteNormalized];
                parent = level;
                result = {
                    notation,
                    has: true,
                    value: level,
                    type: utils.type(level),
                    level: index + 1,
                    lastNote: note,
                    lastNoteNormalized
                };
            } else {
                // level = undefined;
                result = {
                    notation,
                    has: false,
                    type: 'undefined',
                    level: index + 1,
                    lastNote: note,
                    lastNoteNormalized
                };
                return false; // break out
            }
        });

        if (parent === undefined || (result.has && parent === result.value)) parent = this._source;
        result.parentIsArray = utils.type(parent) === 'array';

        return result;
    }

    /**
     *  Notation inspection result object.
     *  @typedef Notation~InspectResult
     *  @type Object
     *  @property {String} notation - Notation that is inspected.
     *  @property {Boolean} has - Indicates whether the source object has the
     *  given notation as a (leveled) enumerable property. If the property
     *  exists but has a value of `undefined`, this will still return `true`.
     *  @property {*} value - The value of the notated property. If the source
     *  object does not have the notation, the value will be `undefined`.
     *  @property {String} type - The type of the notated property. If the source
     *  object does not have the notation, the type will be `"undefined"`.
     *  @property {String} lastNote - Last note of the notation, if actually
     *  exists. For example, last note of `'a.b.c'` is `'c'`.
     *  @property {String|Number} lastNoteNormalized - Normalized representation
     *  of the last note of the notation, if actually exists. For example, last
     *  note of `'a.b[1]` is `'[1]'` and will be normalized to number `1`; which
     *  indicates an array index.
     *  @property {Boolean} parentIsArray - Whether the parent object of the
     *  notation path is an array.
     */

    /**
     *  Inspects and removes the given notation from the source object by
     *  checking if the source object actually has the notated property; and
     *  getting its value if exists, before removing the property.
     *
     *  @param {String} notation - The notation string to be inspected.
     *
     *  @returns {InspectResult} - The result object.
     *
     *  @example
     *  const obj = { name: "John", car: { year: 1970 } };
     *  let result = Notation.create(obj).inspectRemove("car.year");
     *  // result » { notation: "car.year", has: true, value: 1970, lastNote: "year", lastNoteNormalized: "year" }
     *  // obj » { name: "John", car: {} }
     *
     *  result = Notation.create({ car: { year: 1970 } }).inspectRemove("car.color");
     *  // result » { notation: "car.color", has: false }
     *  Notation.create({ car: { color: undefined } }).inspectRemove("car['color']");
     *  // { notation: "car.color", has: true, value: undefined, lastNote: "['color']", lastNoteNormalized: "color" }
     *
     *  const obj = { car: { colors: ["black", "white"] } };
     *  const result = Notation.create().inspectRemove("car.colors[0]");
     *  // result » { notation: "car.colors[0]", has: true, value: "black", lastNote: "[0]", lastNoteNormalized: 0 }
     *  // obj » { car: { colors: [(empty), "white"] } }
     */
    inspectRemove(notation) {
        if (!notation) throw new Error(ERR.NOTATION + `'${notation}'`);
        const parentNotation = Notation.parent(notation);
        const parent = parentNotation ? this.get(parentNotation, null) : this._source;
        const parentIsArray = utils.type(parent) === 'array';
        const notes = Notation.split(notation);
        const lastNote = notes[notes.length - 1];
        const lastNoteNormalized = utils.normalizeNote(lastNote);

        let result, value;
        if (utils.hasOwn(parent, lastNoteNormalized)) {
            value = parent[lastNoteNormalized];
            result = {
                notation,
                has: true,
                value,
                type: utils.type(value),
                level: notes.length,
                lastNote,
                lastNoteNormalized,
                parentIsArray
            };

            // if `preserveIndices` is enabled and this is an array, we'll
            // splice the item out. otherwise, we'll use `delete` syntax to
            // empty the item.
            if (!this.options.preserveIndices && parentIsArray) {
                parent.splice(lastNoteNormalized, 1);
            } else {
                delete parent[lastNoteNormalized];
            }
        } else {
            result = {
                notation,
                has: false,
                type: 'undefined',
                level: notes.length,
                lastNote,
                lastNoteNormalized,
                parentIsArray
            };
        }

        return result;
    }

    /**
     *  Checks whether the source object has the given notation
     *  as a (leveled) enumerable property. If the property exists
     *  but has a value of `undefined`, this will still return `true`.
     *  @param {String} notation - The notation string to be checked.
     *  @returns {Boolean} -
     *
     *  @example
     *  Notation.create({ car: { year: 1970 } }).has("car.year"); // true
     *  Notation.create({ car: { year: undefined } }).has("car.year"); // true
     *  Notation.create({}).has("car.color"); // false
     */
    has(notation) {
        return this.inspectGet(notation).has;
    }

    /**
     *  Checks whether the source object has the given notation
     *  as a (leveled) defined enumerable property. If the property
     *  exists but has a value of `undefined`, this will return `false`.
     *  @param {String} notation - The notation string to be checked.
     *  @returns {Boolean} -
     *
     *  @example
     *  Notation.create({ car: { year: 1970 } }).hasDefined("car.year"); // true
     *  Notation.create({ car: { year: undefined } }).hasDefined("car.year"); // false
     *  Notation.create({}).hasDefined("car.color"); // false
     */
    hasDefined(notation) {
        return this.inspectGet(notation).value !== undefined;
    }

    /**
     *  Gets the value of the corresponding property at the given notation.
     *
     *  @param {String} notation - The notation string to be processed.
     *  @param {String} [defaultValue] - The default value to be returned if the
     *  property is not found or enumerable.
     *
     *  @returns {*} - The value of the notated property.
     *  @throws {NotationError} - If `strict` option is enabled, `defaultValue`
     *  is not set and notation does not exist.
     *
     *  @example
     *  Notation.create({ car: { brand: "Dodge" } }).get("car.brand"); // "Dodge"
     *  Notation.create({ car: {} }).get("car.model", "Challenger"); // "Challenger"
     *  Notation.create({ car: { model: undefined } }).get("car.model", "Challenger"); // undefined
     *
     *  @example <caption>get value when strict option is enabled</caption>
     *  // strict option defaults to false
     *  Notation.create({ car: {} }).get("car.model"); // undefined
     *  Notation.create({ car: {} }, { strict: false }).get("car.model"); // undefined
     *  // below will throw bec. strict = true, car.model does not exist
     *  // and no default value is given.
     *  Notation.create({ car: {} }, { strict: true }).get("car.model");
     */
    get(notation, defaultValue) {
        const result = this.inspectGet(notation);
        // if strict and no default value is set, check if implied index or prop
        // exists
        if (this.options.strict && arguments.length < 2 && !result.has) {
            const msg = result.parentIsArray ? ERR.NO_INDEX : ERR.NO_PROP;
            throw new NotationError(msg + `'${notation}'`);
        }
        return result.has ? result.value : defaultValue;
    }

    /**
     *  Sets the value of the corresponding property at the given notation. If
     *  the property does not exist, it will be created and nested at the
     *  calculated level. If it exists; its value will be overwritten by
     *  default.
     *  @chainable
     *
     *  @param {String} notation - The notation string to be processed.
     *  @param {*} value - The value to be set for the notated property.
     *  @param {String|Boolean} [mode="overwrite"] - Write mode. By default,
     *  this is set to `"overwrite"` which sets the value by overwriting the
     *  target object property or array item at index. To insert an array item
     *  (by shifting the index, instead of overwriting); set to `"insert"`. To
     *  prevent overwriting the value if exists, explicitly set to `false`.
     *
     *  @returns {Notation} - The current `Notation` instance (self).
     *
     *  @throws {NotationError} - If strict notation is enabled, `overwrite`
     *  option is set to `false` and attempted to overwrite an existing value.
     *
     *  @example
     *  const obj = { car: { brand: "Dodge", year: 1970 } };
     *  Notation.create(obj)
     *      .set("car.brand", "Ford")
     *      .set("car.model", "Mustang")
     *      .set("car.year", 1965, false)
     *      .set("car.color", "red")
     *      .set("boat", "none");
     *  console.log(obj);
     *  // { notebook: "Mac", car: { brand: "Ford", model: "Mustang", year: 1970, color: "red" }, boat: "none" };
     */
    set(notation, value, mode = 'overwrite') {
        if (!notation.trim()) throw new NotationError(ERR.NOTATION + `'${notation}'`);
        if (mode === true) mode = 'overwrite';
        let level = this._source;
        let currentIsLast, nCurrentNote, nNextNote, nextIsArrayNote, type;
        const insertErrMsg = 'Cannot set value by inserting at index, on an object';

        Notation.eachNote(notation, (levelNotation, note, index, list) => {
            currentIsLast = index === list.length - 1;
            nCurrentNote = nNextNote || utils.normalizeNote(note);
            nNextNote = currentIsLast ? null : utils.normalizeNote(list[index + 1]);
            type = utils.type(level);

            if (type === 'array' && typeof nCurrentNote !== 'number') {
                const parent = Notation.parent(levelNotation) || 'source';
                throw new NotationError(`Cannot set string key '${note}' on array ${parent}`);
            }

            // check if the property is at this level
            if (utils.hasOwn(level, nCurrentNote, type)) {
                // check if we're at the last level
                if (currentIsLast) {
                    // if mode is "overwrite", assign the value.
                    if (mode === 'overwrite') {
                        level[nCurrentNote] = value;
                    } else if (mode === 'insert') {
                        if (type === 'array') {
                            level.splice(nCurrentNote, 0, value);
                        } else {
                            throw new NotationError(insertErrMsg);
                        }
                    }
                    // otherwise, will not overwrite
                } else {
                    // if not last level; just re-reference the current level.
                    level = level[nCurrentNote];
                }
            } else {
                if (currentIsLast && type !== 'array' && mode === 'insert') {
                    throw new NotationError(insertErrMsg);
                }

                // if next normalized note is a number, it indicates that the
                // current note is actually an array.
                nextIsArrayNote = typeof nNextNote === 'number';

                // we don't have this property at this level so; if this is the
                // last level, we set the value if not, we set an empty
                // collection for the next level
                level[nCurrentNote] = (currentIsLast ? value : (nextIsArrayNote ? [] : {}));
                level = level[nCurrentNote];
            }
        });
        return this;
    }

    /**
     *  Just like the `.set()` method but instead of a single notation
     *  string, an object of notations and values can be passed.
     *  Sets the value of each corresponding property at the given
     *  notation. If a property does not exist, it will be created
     *  and nested at the calculated level. If it exists; its value
     *  will be overwritten by default.
     *  @chainable
     *
     *  @param {Object} notationsObject - The notations object to be processed.
     *  This can either be a regular object with non-dotted keys
     *  (which will be merged to the first/root level of the source object);
     *  or a flattened object with notated (dotted) keys.
     *  @param {Boolean} [overwrite=true] - Whether to overwrite a property if
     *  exists.
     *
     *  @returns {Notation} - The current `Notation` instance (self).
     *
     *  @example
     *  const obj = { car: { brand: "Dodge", year: 1970 } };
     *  Notation.create(obj).merge({
     *      "car.brand": "Ford",
     *      "car.model": "Mustang",
     *      "car.year": 1965,
     *      "car.color": "red",
     *      "boat": "none"
     *  });
     *  console.log(obj);
     *  // { car: { brand: "Ford", model: "Mustang", year: 1970, color: "red" }, boat: "none" };
     */
    merge(notationsObject, overwrite = true) {
        if (utils.type(notationsObject) !== 'object') {
            throw new NotationError(ERR.NOTA_OBJ + 'Expected an object.');
        }
        let value;
        utils.each(Object.keys(notationsObject), notation => {
            if (notation.includes('__proto__') || notation.includes('prototype') || notation.includes('constructor')){
                return this;
            }
            value = notationsObject[notation];
            this.set(notation, value, overwrite);
        });
        return this;
    }

    /**
     *  Removes the properties by the given list of notations from the source
     *  object and returns a new object with the removed properties.
     *  Opposite of `merge()` method.
     *
     *  @param {Array} notations - The notations array to be processed.
     *
     *  @returns {Object} - An object with the removed properties.
     *
     *  @example
     *  const obj = { car: { brand: "Dodge", year: 1970 }, notebook: "Mac" };
     *  const separated = Notation.create(obj).separate(["car.brand", "boat" ]);
     *  console.log(separated);
     *  // { notebook: "Mac", car: { brand: "Ford" } };
     *  console.log(obj);
     *  // { car: { year: 1970 } };
     */
    separate(notations) {
        if (utils.type(notations) !== 'array') {
            throw new NotationError(ERR.NOTA_OBJ + 'Expected an array.');
        }
        const o = new Notation({});
        utils.each(notations, notation => {
            const result = this.inspectRemove(notation);
            o.set(notation, result.value);
        });
        this._source = o._source;
        return this;
    }

    /**
     *  Deep clones the source object while filtering its properties by the
     *  given <b>glob</b> notations. Includes all matched properties and removes
     *  the rest.
     *
     *  The difference between regular notations and glob-notations is that;
     *  with the latter, you can use wildcard stars (*) and negate the notation
     *  by prepending a bang (!). A negated notation will be excluded.
     *
     *  Order of the globs does not matter; they will be logically sorted. Loose
     *  globs will be processed first and verbose globs or normal notations will
     *  be processed last. e.g. `[ "car.model", "*", "!car.*" ]` will be
     *  normalized and sorted as `[ "*", "!car" ]`.
     *
     *  Passing no parameters or passing a glob of `"!*"` or `["!*"]` will empty
     *  the source object. See `Notation.Glob` class for more information.
     *  @chainable
     *
     *  @param {Array|String} globList - Glob notation list to be processed.
     *  @param {Object} [options] - Filter options.
     *  @param {Boolean} [options.restrictive=false] - Whether negated items
     *  strictly remove every match. Note that, regardless of this option, if
     *  any item has an exact negated version; non-negated is always removed.
     *
     *  @returns {Notation} - The current `Notation` instance (self). To get the
     *  filtered value, call `.value` property on the instance.
     *
     *  @example
     *  const car = { brand: "Ford", model: { name: "Mustang", year: 1970 } };
     *  const n = Notation.create(car);
     *
     *  console.log(n.filter([ "*", "!model.year" ]).value);  // { brand: "Ford", model: { name: "Mustang" } }
     *  console.log(n.filter("model.name").value);            // { model: { name: "Mustang" } }
     *  console.log(car);                                     // { brand: "Ford", model: { name: "Mustang", year: 1970 } }
     *  console.log(n.filter().value);                        // {} // —» equivalent to n.filter("") or n.filter("!*")
     */
    filter(globList, options = {}) {
        const { re } = utils;

        // ensure array, normalize and sort the globs in logical order. this
        // also concats the array first (to prevent mutating the original
        // array).
        const globs = Glob.normalize(globList, options.restrictive);
        const len = globs.length;
        const empty = this._isArray ? [] : {};

        // if globs is "" or [""] or ["!*"] or ["![*]"] set source to empty and return.
        if (len === 0 || (len === 1 && (!globs[0] || re.NEGATE_ALL.test(globs[0])))) {
            this._source = empty;
            return this;
        }

        const cloned = utils.cloneDeep(this.value);

        const firstIsWildcard = re.WILDCARD.test(globs[0]);
        // if globs only consist of "*" or "[*]"; set the "clone" as source and
        // return.
        if (len === 1 && firstIsWildcard) {
            this._source = cloned;
            return this;
        }

        let filtered;
        // if the first item of sorted globs is "*" or "[*]" we set the source
        // to the (full) "copy" and remove the wildcard from globs (not to
        // re-process).
        if (firstIsWildcard) {
            filtered = new Notation(cloned);
            globs.shift();
        } else {
            // otherwise we set an empty object or array as the source so that
            // we can add notations/properties to it.
            filtered = new Notation(empty);
        }

        // iterate through globs
        utils.each(globs, globNotation => {
            // console.log('globNotation', globNotation);
            const g = new Glob(globNotation);
            const { glob, absGlob, isNegated, levels } = g;
            let normalized, emptyValue, eType;
            // check whether the glob ends with `.*` or `[*]` then remove
            // trailing glob note and decide for empty value (if negated). for
            // non-negated, trailing wildcards are already removed by
            // normalization.
            if (absGlob.slice(-2) === '.*') {
                normalized = absGlob.slice(0, -2);
                /* istanbul ignore else */
                if (isNegated) emptyValue = {};
                eType = 'object';
            } else if (absGlob.slice(-3) === '[*]') {
                normalized = absGlob.slice(0, -3);
                /* istanbul ignore else */
                if (isNegated) emptyValue = [];
                eType = 'array';
            } else {
                normalized = absGlob;
            }

            // we'll check glob vs value integrity if emptyValue is set; and throw if needed.
            const errGlobIntegrity = `Integrity failed for glob '${glob}'. Cannot set empty ${eType} for '${normalized}' which has a type of `; // ...

            // check if remaining normalized glob has no wildcard stars e.g.
            // "a.b" or "!a.b.c" etc..
            if (re.WILDCARDS.test(normalized) === false) {
                if (isNegated) {
                    // inspect and directly remove the notation if negated.
                    // we need the inspection for the detailed error below.
                    const insRemove = filtered.inspectRemove(normalized);
                    // console.log('insRemove', insRemove);

                    // if original glob had `.*` at the end, it means remove
                    // contents (not itself). so we'll set an empty object.
                    // meaning `some.prop` (prop) is removed completely but
                    // `some.prop.*` (prop) results in `{}`. For array notation
                    // (`[*]`), we'll set an empty array.
                    if (emptyValue) {
                        // e.g. for glob `![0].x.*` we expect to set `[0].x = {}`
                        // but if `.x` is not an object (or array), we should fail.
                        const vType = insRemove.type;
                        const errMsg = errGlobIntegrity + `'${vType}'.`;
                        // in non-strict mode, only exceptions are `null` and
                        // `undefined`, for which we won't throw but we'll not
                        // set an empty obj/arr either.

                        const isValSet = utils.isset(insRemove.value);
                        // on critical type mismatch we throw
                        // or if original value is undefined or null in strict mode we throw
                        if ((isValSet && vType !== eType) || (!isValSet && this.options.strict)) {
                            throw new NotationError(errMsg);
                        }
                        // if parent is an array, we'll insert the value at
                        // index bec. we've removed the item and indexes are
                        // shifted. Otherwise, we'll simply overwrite the
                        // object property value.
                        const setMode = insRemove.parentIsArray ? 'insert' : 'overwrite';
                        // console.log('setting', normalized, emptyValue, setMode);
                        filtered.set(normalized, emptyValue, setMode);
                    }
                } else {
                    // directly set the same notation from the original
                    const insGet = this.inspectGet(normalized); // Notation.create(original).inspectGet ...
                    /* istanbul ignore else */
                    if (insGet.has) filtered.set(normalized, insGet.value, 'overwrite');
                }
                // move to the next
                return true;
            }

            // if glob has wildcard(s), we'll iterate through keys of the source
            // object and see if (full) notation of each key matches the current
            // glob.

            // important! we will iterate with eachRight to prevent shifted
            // indexes when removing items from arrays.
            const reverseIterateIfArray = true;

            _each(this._source, (originalNotation, key, value) => {
                const originalIsCovered = Glob.create(normalized).covers(originalNotation);
                // console.log('» normalized:', normalized, 'covers', originalNotation, '»', originalIsCovered);
                if (!originalIsCovered) return true; // break

                if (this.options.strict && emptyValue) {
                    // since original is covered and we have emptyValue set (due
                    // to trailing wildcard), here we'll check value vs glob
                    // integrity; (only if we're in strict mode).

                    const vType = utils.type(value);
                    // types and number of levels are the same?
                    if (vType !== eType
                            // we subtract 1 from number of levels bec. the last
                            // note is removed since we have emptyValue set.
                            && Notation.split(originalNotation).length === levels.length - 1) {
                        throw new NotationError(errGlobIntegrity + `'${vType}'.`);
                    }
                }

                // iterating each note of original notation. i.e.:
                // note1.note2.note3 is iterated from left to right, as:
                // 'note1', 'note1.note2', 'note1.note2.note3' — in order.
                Notation.eachNote(originalNotation, levelNotation => {
                    // console.log('  level »', glob, 'covers', levelNotation, '»', g.test(levelNotation));

                    if (g.test(levelNotation)) {
                        const levelLen = Notation.split(levelNotation).length;
                        /* istanbul ignore else */
                        if (isNegated && levels.length <= levelLen) {
                            // console.log('  » removing', levelNotation, 'of', originalNotation);
                            filtered.remove(levelNotation);
                            // we break and return early if removed bec. e.g.
                            // when 'note1.note2' (parent) of
                            // 'note1.note2.note3' is also removed, we no more
                            // have 'note3'.
                            return false;
                        }
                        // console.log('  » setting', levelNotation, '=', value);
                        filtered.set(levelNotation, value, 'overwrite');
                    }
                });
            }, reverseIterateIfArray);
        });
        // finally set the filtered's value as the source of our instance and
        // return.
        this._source = filtered.value;
        return this;
    }

    /**
     *  Removes the property from the source object, at the given notation.
     *  @alias Notation#delete
     *  @chainable
     *  @param {String} notation - The notation to be inspected.
     *  @returns {Notation} - The current `Notation` instance (self).
     *  @throws {NotationError} - If `strict` option is enabled and notation
     *  does not exist.
     *
     *  @example
     *  const obj = { notebook: "Mac", car: { model: "Mustang" } };
     *  Notation.create(obj).remove("car.model");
     *  console.log(obj); // { notebook: "Mac", car: { } }
     */
    remove(notation) {
        const result = this.inspectRemove(notation);
        // if strict, check if implied index or prop exists
        if (this.options.strict && !result.has) {
            const msg = result.parentIsArray ? ERR.NO_INDEX : ERR.NO_PROP;
            throw new NotationError(msg + `'${notation}'`);
        }
        return this;
    }

    /**
     *  Alias of `Notation#remove`
     *  @private
     *  @param {String} notation -
     *  @returns {Notation} -
     */
    delete(notation) {
        this.remove(notation);
        return this;
    }

    /**
     *  Copies the notated property from the source collection and adds it to the
     *  destination — only if the source object actually has that property.
     *  This is different than a property with a value of `undefined`.
     *  @chainable
     *
     *  @param {Object|Array} destination - The destination object that the notated
     *  properties will be copied to.
     *  @param {String} notation - The notation to get the corresponding property
     *  from the source object.
     *  @param {String} [newNotation=null] - The notation to set the source property
     *  on the destination object. In other words, the copied property will be
     *  renamed to this value before set on the destination object. If not set,
     *  `notation` argument will be used.
     *  @param {Boolean} [overwrite=true] - Whether to overwrite the property on
     *  the destination object if it exists.
     *
     *  @returns {Notation} - The current `Notation` instance (self).
     *
     *  @throws {NotationError} - If `destination` is not a valid collection.
     *  @throws {NotationError} - If `notation` or `newNotation` is invalid.
     *
     *  @example
     *  const obj = { car: { brand: "Ford", model: "Mustang" } };
     *  const models = { dodge: "Charger" };
     *  Notation.create(obj).copyTo(models, "car.model", "ford");
     *  console.log(models);
     *  // { dodge: "Charger", ford: "Mustang" }
     *  // source object (obj) is not modified
     */
    copyTo(destination, notation, newNotation = null, overwrite = true) {
        if (!utils.isCollection(destination)) throw new NotationError(ERR.DEST);
        const result = this.inspectGet(notation);
        if (result.has) {
            const newN = utils.getNewNotation(newNotation, notation);
            Notation.create(destination).set(newN, result.value, overwrite);
        }
        return this;
    }

    /**
     *  Copies the notated property from the target collection and adds it to
     *  (own) source object — only if the target object actually has that
     *  property. This is different than a property with a value of `undefined`.
     *  @chainable
     *
     *  @param {Object|Array} target - The target collection that the notated
     *  properties will be copied from.
     *  @param {String} notation - The notation to get the corresponding
     *  property from the target object.
     *  @param {String} [newNotation=null] - The notation to set the copied
     *  property on our source collection. In other words, the copied property
     *  will be renamed to this value before set. If not set, `notation`
     *  argument will be used.
     *  @param {Boolean} [overwrite=true] - Whether to overwrite the property on
     *  our collection if it exists.
     *
     *  @returns {Notation} - The current `Notation` instance (self).
     *
     *  @throws {NotationError} - If `target` is not a valid collection.
     *  @throws {NotationError} - If `notation` or `newNotation` is invalid.
     *
     *  @example
     *  const obj = { car: { brand: "Ford", model: "Mustang" } };
     *  const models = { dodge: "Charger" };
     *  Notation.create(obj).copyFrom(models, "dodge", "car.model", true);
     *  console.log(obj);
     *  // { car: { brand: "Ford", model: "Charger" } }
     *  // models object is not modified
     */
    copyFrom(target, notation, newNotation = null, overwrite = true) {
        if (!utils.isCollection(target)) throw new NotationError(ERR.DEST);
        const result = Notation.create(target).inspectGet(notation);
        if (result.has) {
            const newN = utils.getNewNotation(newNotation, notation);
            this.set(newN, result.value, overwrite);
        }
        return this;
    }

    /**
     *  Removes the notated property from the source (own) collection and adds
     *  it to the destination — only if the source collection actually has that
     *  property. This is different than a property with a value of `undefined`.
     *  @chainable
     *
     *  @param {Object|Array} destination - The destination collection that the
     *  notated properties will be moved to.
     *  @param {String} notation - The notation to get the corresponding
     *  property from the source object.
     *  @param {String} [newNotation=null] - The notation to set the source
     *  property on the destination object. In other words, the moved property
     *  will be renamed to this value before set on the destination object. If
     *  not set, `notation` argument will be used.
     *  @param {Boolean} [overwrite=true] - Whether to overwrite the property on
     *  the destination object if it exists.
     *
     *  @returns {Notation} - The current `Notation` instance (self).
     *
     *  @throws {NotationError} - If `destination` is not a valid collection.
     *  @throws {NotationError} - If `notation` or `newNotation` is invalid.
     *
     *  @example
     *  const obj = { car: { brand: "Ford", model: "Mustang" } };
     *  const models = { dodge: "Charger" };
     *  Notation.create(obj).moveTo(models, "car.model", "ford");
     *  console.log(obj);
     *  // { car: { brand: "Ford" } }
     *  console.log(models);
     *  // { dodge: "Charger", ford: "Mustang" }
     */
    moveTo(destination, notation, newNotation = null, overwrite = true) {
        if (!utils.isCollection(destination)) throw new NotationError(ERR.DEST);
        const result = this.inspectRemove(notation);
        if (result.has) {
            const newN = utils.getNewNotation(newNotation, notation);
            Notation.create(destination).set(newN, result.value, overwrite);
        }
        return this;
    }

    /**
     *  Removes the notated property from the target collection and adds it to (own)
     *  source collection — only if the target object actually has that property.
     *  This is different than a property with a value of `undefined`.
     *  @chainable
     *
     *  @param {Object|Array} target - The target collection that the notated
     *  properties will be moved from.
     *  @param {String} notation - The notation to get the corresponding property
     *  from the target object.
     *  @param {String} [newNotation=null] - The notation to set the target
     *  property on the source object. In other words, the moved property
     *  will be renamed to this value before set on the source object.
     *  If not set, `notation` argument will be used.
     *  @param {Boolean} [overwrite=true] - Whether to overwrite the property on
     *  the source object if it exists.
     *
     *  @returns {Notation} - The current `Notation` instance (self).
     *
     *  @throws {NotationError} - If `target` is not a valid collection.
     *  @throws {NotationError} - If `notation` or `newNotation` is invalid.
     *
     *  @example
     *  const obj = { car: { brand: "Ford", model: "Mustang" } };
     *  const models = { dodge: "Charger" };
     *  Notation.create(obj).moveFrom(models, "dodge", "car.model", true);
     *  console.log(obj);
     *  // { car: { brand: "Ford", model: "Charger" } }
     *  console.log(models);
     *  // {}
     */
    moveFrom(target, notation, newNotation = null, overwrite = true) {
        if (!utils.isCollection(target)) throw new NotationError(ERR.DEST);
        const result = Notation.create(target).inspectRemove(notation);
        if (result.has) {
            const newN = utils.getNewNotation(newNotation, notation);
            this.set(newN, result.value, overwrite);
        }
        return this;
    }

    /**
     *  Renames the notated property of the source collection by the new notation.
     *  @alias Notation#renote
     *  @chainable
     *
     *  @param {String} notation - The notation to get the corresponding
     *  property (value) from the source collection.
     *  @param {String} newNotation - The new notation for the targeted
     *  property value. If not set, the source collection will not be modified.
     *  @param {Boolean} [overwrite=true] - Whether to overwrite the property at
     *  the new notation, if it exists.
     *
     *  @returns {Notation} - The current `Notation` instance (self).
     *
     *  @throws {NotationError} - If `notation` or `newNotation` is invalid.
     *
     *  @example
     *  const obj = { car: { brand: "Ford", model: "Mustang" } };
     *  Notation.create(obj)
     *      .rename("car.brand", "carBrand")
     *      .rename("car.model", "carModel");
     *  console.log(obj);
     *  // { carBrand: "Ford", carModel: "Mustang" }
     */
    rename(notation, newNotation, overwrite) {
        return this.moveTo(this._source, notation, newNotation, overwrite);
    }

    /**
     *  Alias for `#rename`
     *  @private
     *  @param {String} notation -
     *  @param {String} newNotation -
     *  @param {Boolean} [overwrite=true] -
     *  @returns {Notation} -
     */
    renote(notation, newNotation, overwrite) {
        return this.rename(notation, newNotation, overwrite);
    }

    /**
     *  Extracts the property at the given notation to a new object by copying
     *  it from the source collection. This is equivalent to `.copyTo({},
     *  notation, newNotation)`.
     *  @alias Notation#copyToNew
     *
     *  @param {String} notation - The notation to get the corresponding
     *  property (value) from the source object.
     *  @param {String} newNotation - The new notation to be set on the new
     *  object for the targeted property value. If not set, `notation` argument
     *  will be used.
     *
     *  @returns {Object} - Returns a new object with the notated property.
     *
     *  @throws {NotationError} - If `notation` or `newNotation` is invalid.
     *
     *  @example
     *  const obj = { car: { brand: "Ford", model: "Mustang" } };
     *  const extracted = Notation.create(obj).extract("car.brand", "carBrand");
     *  console.log(extracted);
     *  // { carBrand: "Ford" }
     *  // obj is not modified
     */
    extract(notation, newNotation) {
        const o = {};
        this.copyTo(o, notation, newNotation);
        return o;
    }

    /**
     *  Alias for `#extract`
     *  @private
     *  @param {String} notation -
     *  @param {String} newNotation -
     *  @returns {Object} -
     */
    copyToNew(notation, newNotation) {
        return this.extract(notation, newNotation);
    }

    /**
     *  Extrudes the property at the given notation to a new collection by
     *  moving it from the source collection. This is equivalent to `.moveTo({},
     *  notation, newNotation)`.
     *  @alias Notation#moveToNew
     *
     *  @param {String} notation - The notation to get the corresponding
     *  property (value) from the source object.
     *  @param {String} newNotation - The new notation to be set on the new
     *  object for the targeted property value. If not set, `notation` argument
     *  will be used.
     *
     *  @returns {Object} - Returns a new object with the notated property.
     *
     *  @example
     *  const obj = { car: { brand: "Ford", model: "Mustang" } };
     *  const extruded = Notation.create(obj).extrude("car.brand", "carBrand");
     *  console.log(obj);
     *  // { car: { model: "Mustang" } }
     *  console.log(extruded);
     *  // { carBrand: "Ford" }
     */
    extrude(notation, newNotation) {
        const o = {};
        this.moveTo(o, notation, newNotation);
        return o;
    }

    /**
     *  Alias for `#extrude`
     *  @private
     *  @param {String} notation -
     *  @param {String} newNotation -
     *  @returns {Object} -
     */
    moveToNew(notation, newNotation) {
        return this.extrude(notation, newNotation);
    }

    // --------------------------------
    // STATIC MEMBERS
    // --------------------------------

    /**
     *  Basically constructs a new `Notation` instance.
     *  @chainable
     *  @param {Object|Array} [source={}] - The source collection to be notated.
     *  @param {Object} [options] - Notation options.
     *      @param {Boolean} [options.strict=false] - Whether to throw when a
     *      notation path does not exist on the source. (Note that `.inspectGet()`
     *      and `.inspectRemove()` methods are exceptions). It's recommended to
     *      set this to `true` and prevent silent failures if you're working
     *      with sensitive data. Regardless of `strict` option, it will always
     *      throw on invalid notation syntax or other crucial failures.
     *
     *  @returns {Notation} - The created instance.
     *
     *  @example
     *  const obj = { car: { brand: "Dodge", model: "Charger", year: 1970 } };
     *  const notation = Notation.create(obj); // equivalent to new Notation(obj)
     *  notation.get('car.model')   // » "Charger"
     *  notation.remove('car.model').set('car.color', 'red').value
     *  // » { car: { brand: "Dodge", year: 1970, color: "red" } }
     */
    static create(source, options) {
        if (arguments.length === 0) {
            return new Notation({});
        }
        return new Notation(source, options);
    }

    /**
     *  Checks whether the given notation string is valid. Note that the star
     *  (`*`) (which is a valid character, even if irregular) is NOT treated as
     *  wildcard here. This checks for regular dot-notation, not a glob-notation.
     *  For glob notation validation, use `Notation.Glob.isValid()` method. Same
     *  goes for the negation character/prefix (`!`).
     *
     *  @param {String} notation - The notation string to be checked.
     *  @returns {Boolean} -
     *
     *  @example
     *  Notation.isValid('prop1.prop2.prop3'); // true
     *  Notation.isValid('x'); // true
     *  Notation.isValid('x.arr[0].y'); // true
     *  Notation.isValid('x["*"]'); // true
     *  Notation.isValid('x.*'); // false (this would be valid for Notation#filter() only or Notation.Glob class)
     *  Notation.isValid('@1'); // false (should be "['@1']")
     *  Notation.isValid(null); // false
     */
    static isValid(notation) {
        return typeof notation === 'string' && reVALIDATOR.test(notation);
    }

    /**
     *  Splits the given notation string into its notes (levels).
     *  @param {String} notation  Notation string to be splitted.
     *  @returns {Array} - A string array of notes (levels).
     *  @throws {NotationError} - If given notation is invalid.
     */
    static split(notation) {
        if (!Notation.isValid(notation)) {
            throw new NotationError(ERR.NOTATION + `'${notation}'`);
        }
        return notation.match(reMATCHER);
    }

    /**
     *  Joins the given notes into a notation string.
     *  @param {String} notes  Notes (levels) to be joined.
     *  @returns {String}  Joined notation string.
     */
    static join(notes) {
        return utils.joinNotes(notes);
    }

    /**
     *  Counts the number of notes/levels in the given notation.
     *  @alias Notation.countLevels
     *  @param {String} notation - The notation string to be processed.
     *  @returns {Number} - Number of notes.
     *  @throws {NotationError} - If given notation is invalid.
     */
    static countNotes(notation) {
        return Notation.split(notation).length;
    }

    /**
     *  Alias of `Notation.countNotes`.
     *  @private
     *  @param {String} notation -
     *  @returns {Number} -
     */
    static countLevels(notation) {
        return Notation.countNotes(notation);
    }

    /**
     *  Gets the first (root) note of the notation string.
     *  @param {String} notation - The notation string to be processed.
     *  @returns {String} - First note.
     *  @throws {NotationError} - If given notation is invalid.
     *
     *  @example
     *  Notation.first('first.prop2.last'); // "first"
     */
    static first(notation) {
        return Notation.split(notation)[0];
    }

    /**
     *  Gets the last note of the notation string.
     *  @param {String} notation - The notation string to be processed.
     *  @returns {String} - Last note.
     *  @throws {NotationError} - If given notation is invalid.
     *
     *  @example
     *  Notation.last('first.prop2.last'); // "last"
     */
    static last(notation) {
        const list = Notation.split(notation);
        return list[list.length - 1];
    }

    /**
     *  Gets the parent notation (up to but excluding the last note)
     *  from the notation string.
     *  @param {String} notation - The notation string to be processed.
     *  @returns {String} - Parent note if any. Otherwise, `null`.
     *  @throws {NotationError} - If given notation is invalid.
     *
     *  @example
     *  Notation.parent('first.prop2.last'); // "first.prop2"
     *  Notation.parent('single'); // null
     */
    static parent(notation) {
        const last = Notation.last(notation);
        return notation.slice(0, -last.length).replace(/\.$/, '') || null;
    }

    /**
     *  Iterates through each note/level of the given notation string.
     *  @alias Notation.eachLevel
     *
     *  @param {String} notation - The notation string to be iterated through.
     *  @param {Function} callback - The callback function to be invoked on
     *  each iteration. To break out of the loop, return `false` from within the
     *  callback.
     *  Callback signature: `callback(levelNotation, note, index, list) { ... }`
     *
     *  @returns {void}
     *  @throws {NotationError} - If given notation is invalid.
     *
     *  @example
     *  const notation = 'first.prop2.last';
     *  Notation.eachNote(notation, function (levelNotation, note, index, list) {
     *      console.log(index, note, levelNotation);
     *  });
     *  // 0  "first"             "first"
     *  // 1  "first.prop2"       "prop2"
     *  // 2  "first.prop2.last"  "last"
     */
    static eachNote(notation, callback) {
        const notes = Notation.split(notation);
        const levelNotes = [];
        utils.each(notes, (note, index) => {
            levelNotes.push(note);
            if (callback(Notation.join(levelNotes), note, index, notes) === false) return false;
        }, Notation);
    }

    /**
     *  Alias of `Notation.eachNote`.
     *  @private
     *  @param {String} notation -
     *  @param {Function} callback -
     *  @returns {void}
     */
    static eachLevel(notation, callback) {
        Notation.eachNote(notation, callback);
    }

}

/**
 *  Error class specific to `Notation`.
 *  @private
 *
 *  @class
 *  @see `{@link #Notation.Error}`
 */
Notation.Error = NotationError;

/**
 *  Utility for validating, comparing and sorting dot-notation globs.
 *  This is internally used by `Notation` class.
 *  @private
 *
 *  @class
 *  @see `{@link #Notation.Glob}`
 */
Notation.Glob = Glob;

/**
 *  Undocumented
 *  @private
 */
Notation.utils = utils;

// --------------------------------
// HELPERS
// --------------------------------

/**
 *  Deep iterates through each note (level) of each item in the given
 *  collection.
 *  @private
 *  @param {Object|Array} collection  A data object or an array, as the source.
 *  @param {Function} callback  A function to be executed on each iteration,
 *  with the following arguments: `(levelNotation, note, value, collection)`
 *  @param {Boolean} [reverseIfArray=false]  Set to `true` to iterate with
 *  `eachRight` to prevent shifted indexes when removing items from arrays.
 *  @param {Boolean} [byLevel=false]  Indicates whether to iterate notations by
 *  each level or by the end value.  For example, if we have a collection of
 *  `{a: { b: true } }`, and `byLevel` is set; the callback will be invoked on
 *  the following notations: `a`, `a.b`. Otherwise, it will be invoked only on
 *  `a.b`.
 *  @param {String} [parentNotation]  Storage for parent (previous) notation.
 *  @param {Collection} [topSource]  Storage for initial/main collection.
 *  @returns {void}
 */
function _each(collection, callback, reverseIfArray = false, byLevel = false, parentNotation = null, topSource = null) { // eslint-disable-line max-params
    const source = topSource || collection;
    // if (!utils.isCollection(collection)) throw ... // no need
    utils.eachItem(collection, (value, keyOrIndex) => {
        const note = typeof keyOrIndex === 'number'
            ? `[${keyOrIndex}]`
            : keyOrIndex;
        const currentNotation = Notation.join([parentNotation, note]);
        const isCollection = utils.isCollection(value);
        // if it's not a collection we'll execute the callback. if it's a
        // collection but byLevel is set, we'll also execute the callback.
        if (!isCollection || byLevel) {
            if (callback(currentNotation, note, value, source) === false) return false;
        }
        // deep iterating if collection
        if (isCollection) _each(value, callback, reverseIfArray, byLevel, currentNotation, source);
    }, null, reverseIfArray);
}

// --------------------------------
// EXPORT
// --------------------------------

export { Notation };

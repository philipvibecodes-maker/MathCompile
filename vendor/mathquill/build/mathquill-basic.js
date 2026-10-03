/**
 * MathQuill v0.10.1, by Han, Jeanine, and Mary
 * http://mathquill.com | maintainers@mathquill.com
 *
 * This Source Code Form is subject to the terms of the
 * Mozilla Public License, v. 2.0. If a copy of the MPL
 * was not distributed with this file, You can obtain
 * one at http://mozilla.org/MPL/2.0/.
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
(function () {
    var _hasSpacingBug;
    function hasSpacingBug() {
        if (_hasSpacingBug === undefined)
            _hasSpacingBug = computeHasSpacingBug();
        return _hasSpacingBug;
    }
    /**
     * On webkit, we're seeing a bug where 1000 inline-block elements inside an inline-block parent
     * would be spaced well, but the parent gets sized incorrectly by a few dozen pixels. This
     * is likely due to some error in sub-pixel accumulation. True if that problem is detected.
     */
    function computeHasSpacingBug() {
        var parent = document.createElement('span');
        parent.style.display = 'inline-block';
        for (var i = 0; i < 9; i++) {
            makeChild(parent);
        }
        var lastChild = makeChild(parent);
        document.body.appendChild(parent);
        var diff = parent.getBoundingClientRect().right -
            lastChild.getBoundingClientRect().right;
        parent.remove();
        // `diff` is 0 for most browsers, and 0.15625 when I test on Safari.
        return diff > 0.05;
    }
    function makeChild(parent) {
        var child = document.createElement('span');
        child.style.display = 'inline-block';
        child.innerText = '0';
        // The exact margin doesn't really matter as long as it's not a multiple of 0.5px.
        child.style.marginLeft = '0.7px';
        parent.appendChild(child);
        return child;
    }
    var L = -1;
    var R = 1;
    var min = Math.min;
    var max = Math.max;
    function noop() { }
    function walkUpAsFarAsPossible(node) {
        while (node) {
            if (!node.parent) {
                return node;
            }
            node = node.parent;
        }
        return undefined;
    }
    /**
     * a development-only debug method.  This definition and all
     * calls to `pray` will be stripped from the minified
     * build of mathquill.
     *
     * This function must be called by name to be removed
     * at compile time.  Do not define another function
     * with the same name, and only call this function by
     * name.
     */
    function pray(message, cond, optionalContextNodes) {
        if (!cond) {
            var error = new Error('prayer failed: ' + message);
            // optionally add more context to this prayer failure. We will
            // trace up as far as possible to get all latex we can find as well
            // as output the latex down at the direct parent of the prayer failure
            if (optionalContextNodes) {
                var jsonData = {};
                // this data is attached to the error. The app that controls the mathquill
                // can optionally pull it off when it catches the error and send the extra
                // info with the error.
                error.dcgExtraErrorMetaData = jsonData;
                for (var contextName in optionalContextNodes) {
                    var localNode = optionalContextNodes[contextName];
                    var data = (jsonData[contextName] = {});
                    if (localNode) {
                        data.localLatex = localNode.latex();
                        var root = walkUpAsFarAsPossible(localNode);
                        if (root) {
                            data.rootLatex = root.latex();
                        }
                    }
                    else {
                        data.emptyNode = true;
                    }
                }
            }
            throw error;
        }
    }
    function prayDirection(dir) {
        pray('a direction was passed', dir === L || dir === R);
    }
    function parseHTML(s) {
        // https://youmightnotneedjquery.com/#parse_html
        var tmp = document.implementation.createHTMLDocument('');
        tmp.body.innerHTML = s;
        if (tmp.body.children.length === 1)
            return tmp.body.children[0];
        var frag = document.createDocumentFragment();
        while (tmp.body.firstChild) {
            frag.appendChild(tmp.body.firstChild);
        }
        return frag;
    }
    var h = function h(type, attributes, children) {
        var el;
        switch (type) {
            case 'svg':
            case 'path':
                el = document.createElementNS('http://www.w3.org/2000/svg', type);
                break;
            default:
                el = document.createElement(type);
        }
        for (var key_1 in attributes) {
            var value = attributes[key_1];
            if (value === undefined)
                continue;
            el.setAttribute(key_1, typeof value === 'string' ? value : String(value));
        }
        if (children) {
            for (var i = 0; i < children.length; i++) {
                el.appendChild(children[i]);
            }
        }
        return el;
    };
    h.text = function (s) { return document.createTextNode(s); };
    h.block = function (type, attributes, block, opts) {
        var children = [block.html()];
        if (opts === null || opts === void 0 ? void 0 : opts.beforeChild) {
            children.unshift(opts.beforeChild);
        }
        if (opts === null || opts === void 0 ? void 0 : opts.afterChild) {
            children.push(opts.afterChild);
        }
        var out = h(type, attributes, children);
        block.setDOM(out);
        NodeBase.linkElementByBlockNode(out, block);
        return out;
    };
    h.entityText = function (s) {
        // TODO: replace with h.text(U_BLAHBLAH) or maybe a named entity->unicode lookup
        var val = parseHTML(s);
        pray('entity parses to a single text node', val instanceof DocumentFragment &&
            val.childNodes.length === 1 &&
            val.childNodes[0] instanceof Text);
        return val.childNodes[0];
    };
    function closest(el, s) {
        var _a, _b;
        if (typeof (el === null || el === void 0 ? void 0 : el.closest) === 'function') {
            return el.closest(s);
        }
        if (!(el instanceof HTMLElement))
            return null;
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/closest#polyfill
        var matches = Element.prototype.matches ||
            Element.prototype.msMatchesSelector ||
            Element.prototype.webkitMatchesSelector;
        var match = el;
        do {
            if (matches.call(match, s))
                return match;
            match = (_b = (_a = match === null || match === void 0 ? void 0 : match.parentElement) !== null && _a !== void 0 ? _a : match === null || match === void 0 ? void 0 : match.parentNode) !== null && _b !== void 0 ? _b : null;
        } while (match !== null && match.nodeType === 1);
        return null;
    }
    var U_NO_BREAK_SPACE = '\u00A0';
    var U_ZERO_WIDTH_SPACE = '\u200B';
    var U_DOT_ABOVE = '\u02D9';
    var U_NARY_SUMMATION = '\u2211';
    var U_NARY_PRODUCT = '\u220F';
    var U_NARY_COPRODUCT = '\u2210';
    var U_INTEGRAL = '\u222B';
    /**
     * Like `el.getBoundingClientRect()` but avoids throwing for
     * disconnected and hidden elements in IE <= 11.
     * */
    function getBoundingClientRect(el) {
        // Return zeros for disconnected and hidden (display: none) elements
        // Running getBoundingClientRect on a disconnected node in IE <=11 throws an error
        // https://github.com/jquery/jquery/blob/a684e6ba836f7c553968d7d026ed7941e1a612d8/src/offset.js#L83-L86
        if (!el.getClientRects().length) {
            return {
                top: 0,
                left: 0,
                height: 0,
                width: 0,
                x: 0,
                y: 0,
                bottom: 0,
                right: 0
            };
        }
        return el.getBoundingClientRect();
    }
    /**
     * Returns the number of pixels that the document is currently scrolled
     * horizontally -- `window.scrollX` in modern browsers.
     * */
    function getScrollX() {
        // In IE9, scrollX was called pageXOffset
        // Previous versions of IE had neither property and use scrollLeft instead
        //
        // https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollX#notes
        return window.pageXOffset !== undefined
            ? window.pageXOffset
            : (document.documentElement || document.body.parentNode || document.body)
                .scrollLeft;
    }
    /**
     * Returns the number of pixels that the document is currently scrolled
     * vertically -- `window.scrollY` in modern browsers.
     * */
    function getScrollY() {
        // In IE9, scrollY was called pageYOffset
        // Previous versions of IE had neither property and use scrollTop instead
        //
        // https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollX#notes
        return window.pageYOffset !== undefined
            ? window.pageYOffset
            : (document.documentElement || document.body.parentNode || document.body)
                .scrollTop;
    }
    /**
     * Given `duration` in ms and callback `cb`, immediately calls `cb(progress, scheduleNext, cancel)` with:
     * - `progress` set to `0` if duration > 0, or 1 if duration <= 0
     * - `scheduleNext` a function that schedules a future call to `cb`
     * - `cancel` a function that cancels any pending `scheduleNext` call.
     *
     * `scheduleNext` schedules a call to `cb` with `progress` set to the
     * ratio of currently elapsed time and `duration`.
     *
     * To continue running the animation, `cb` should call `scheduleNext`.
     *
     * To stop the animation, it is the responsibility of `cb` to check
     * whether progress is greater than or equal to 1, in which case `cb`
     * should not call `scheduleNext`.
     *
     * `scheduleNext` uses `requestAnimationFrame` if available and falls
     * back to `setTimeout(..., 13)` otherwise. Times are always based on
     * `Date.now()` for compatibility between `requestAnimationFrame` and
     * the `setTimeout` fallback. `cb` will only be called with strictly
     * monotonic `progress` values.
     *
     * Note: `animate` purposely puts a lot of responsibility on the caller
     * to keep its implementation simple because it isn't used very widely
     * in the project.
     */
    var animate = (function () {
        // IIFE exists just to hang on to configured rafShim and cancelShim
        // functions
        var rafShim, cancelShim;
        if (typeof requestAnimationFrame === 'function' &&
            typeof cancelAnimationFrame === 'function') {
            rafShim = requestAnimationFrame;
            cancelShim = cancelAnimationFrame;
        }
        else {
            rafShim = function (cb) { return setTimeout(cb, 13); };
            cancelShim = clearTimeout;
        }
        return function (duration, cb) {
            var start = Date.now();
            var cancelToken;
            var progress = 0;
            function step() {
                var proposedProgress = (Date.now() - start) / duration;
                // Enforce that progress is strictly monotonic
                if (proposedProgress <= progress) {
                    scheduleNext();
                }
                else {
                    progress = proposedProgress;
                }
                cb(progress, scheduleNext, cancel);
            }
            function cancel() {
                if (cancelToken !== undefined)
                    cancelShim(cancelToken);
                cancelToken = undefined;
            }
            function scheduleNext() {
                // Calling cancel here ensures that there are never multiple
                // concurrent callbacks scheduled for a single animation, even if
                // the caller calls `scheduleNext` multiple times in a single
                // event loop (which is always a mistake)
                cancel();
                cancelToken = rafShim(step);
            }
            cb(duration <= 0 ? 1 : 0, scheduleNext, cancel);
        };
    })();
    var Aria = /** @class */ (function () {
        function Aria(controller) {
            this.span = h('span', {
                class: 'mq-aria-alert',
                'aria-live': 'assertive',
                'aria-atomic': 'true'
            });
            this.msg = '';
            this.items = [];
            this.firstMessageSent = false;
            this.firstMessageTimeout = null;
            this.controller = controller;
        }
        Aria.prototype.attach = function () {
            var container = this.controller.container;
            if (this.span.parentNode !== container) {
                // Append the element empty first to ensure screen readers detect the live region
                // before any content is added. This fixes the issue where the first alert isn't announced.
                domFrag(container).prepend(domFrag(this.span));
            }
        };
        Aria.prototype.queue = function (item, shouldDescribe) {
            if (shouldDescribe === void 0) { shouldDescribe = false; }
            var output = '';
            if (item instanceof MQNode) {
                // Some constructs include verbal shorthand (such as simple fractions and exponents).
                // Since ARIA alerts relate to moving through interactive content, we don't want to use that shorthand if it exists
                // since doing so may be ambiguous or confusing.
                // For example, `x^2` normally has mathspeak '"x" squared', but when moving the cursor before the exponent,
                // it speaks 'before Superscript, 2 , Baseline' since the alternative is 'before squared'.
                var itemMathspeak = item.mathspeak({ ignoreShorthand: true });
                if (shouldDescribe) {
                    // used to ensure item is described when cursor reaches block boundaries
                    if (item.parent &&
                        item.parent.ariaLabel &&
                        item.ariaLabel === 'block') {
                        output = item.parent.ariaLabel + ' ' + itemMathspeak;
                    }
                    else if (item.ariaLabel) {
                        output = item.ariaLabel + ' ' + itemMathspeak;
                    }
                }
                if (output === '') {
                    output = itemMathspeak;
                }
            }
            else {
                output = item || '';
            }
            this.items.push(output);
            return this;
        };
        Aria.prototype.queueDirOf = function (dir) {
            prayDirection(dir);
            return this.queue(dir === L ? 'before' : 'after');
        };
        Aria.prototype.queueDirEndOf = function (dir) {
            prayDirection(dir);
            return this.queue(dir === L ? 'beginning of' : 'end of');
        };
        Aria.prototype.alert = function (t) {
            var _this = this;
            this.attach();
            if (t)
                this.queue(t);
            if (this.items.length) {
                // To cut down on potential verbiage from multiple Mathquills firing near-simultaneous ARIA alerts,
                // update the text of this instance if its container also has keyboard focus.
                // If it does not, leave the DOM unchanged but flush the queue regardless.
                // Note: updating the msg variable regardless of focus for unit tests.
                this.msg = this.items
                    .join(' ')
                    .replace(/ +(?= )/g, '')
                    .trim();
                if (this.controller.containerHasFocus()) {
                    if (this.controller.options.logAriaAlerts && this.msg) {
                        console.log(this.msg);
                    }
                    // For the first message, use a 50ms delay to ensure the empty live region
                    // is registered with screen readers before adding content. Screen readers need
                    // actual time (not just a different execution context) to process the empty element.
                    // We debounce to ensure that if multiple messages arrive within the first 50ms,
                    // only the final message is announced (avoiding out-of-order announcements).
                    if (!this.firstMessageSent) {
                        if (this.firstMessageTimeout !== null) {
                            clearTimeout(this.firstMessageTimeout);
                        }
                        this.firstMessageTimeout = setTimeout(function () {
                            _this.firstMessageSent = true;
                            _this.firstMessageTimeout = null;
                            _this.span.textContent = _this.msg;
                        }, 50);
                    }
                    else {
                        this.span.textContent = this.msg;
                    }
                }
            }
            return this.clear();
        };
        /* Clear out the internal alert message queue.
         * If opts.emptyContent is set, also clear the rendered text content for the alert element (typically when the focused field has been blurred) so we don't leave stale alert text hanging around. */
        Aria.prototype.clear = function (opts) {
            this.items.length = 0;
            if (opts === null || opts === void 0 ? void 0 : opts.emptyContent)
                this.span.textContent = '';
            return this;
        };
        return Aria;
    }());
    /**
     * A `DOMFragment` represents a contiguous span of sibling DOM Nodes,
     * which may include both Element nodes and other nodes like Text and
     * Comment nodes. A `DOMFragment` may represent zero or more nodes.
     *
     * `DOMFragments` are created using the `DOMFragment.create` factory
     * function, which is also aliased as `domFrag` for convenience.
     *
     * A `DOMFragment` simply holds references to nodes. It doesn't move or
     * mutate them in the way that the native `DocumentFragment` does.
     *
     * `DOMFragment` implements many of the same methods for manipulating a
     * collection of DOM elements that jQuery does, but it has some notable
     * differences:
     *
     * 1.  A jQuery collection can hold an arbitrary ordered set of DOM
     *     elements, but a `DOMFragment` can only hold a contiguous span of
     *     sibling nodes.
     * 2.  Some jQuery DOM manipulation methods like `insert{Before,After}`,
     *     `append`, `prepend`, `appendTo`, `prependTo`, etc. may insert
     *     several clones of a collection into different places in the DOM.
     *     `DOMFragment` never makes clones of DOM nodes--instead, when
     *     targeting multi-element fragments, it moves source nodes before
     *     or after the targeted fragment as appropriate without ever making
     *     more copies.
     * 3.  For methods like `.children()`, where it's likely to be a mistake
     *     to call the method on a fragment that doesn't contain exactly one
     *     node or element, `DOMFragment` will throw whereas jQuery will
     *     silently do something possibly unintended. Methods that assert
     *     are commented with the properties that they assert.
     *
     * Internally, `DOMFragment` holds immutable references to the left and
     * right end nodes (if the fragment is not empty). The other nodes are
     * represented implicitly through the sibling pointers of the DOM nodes
     * themselves. This means that it is possible to invalidate a
     * `DOMFragment` by moving one of its ends without moving the other in
     * such a way that they are no longer siblings. It is also possible to
     * change the contents of a `DOMFragment` by adding or removing DOM
     * nodes between its ends.
     */
    var DOMFragment = /** @class */ (function () {
        /**
         * Constructor is private to enforce that the invariant checks in
         * `create` are applied to outside callers. Internal methods are
         * allowed to use this constructor when they can guarantee they're
         * passing sibling nodes (such as children of a parent node).
         */
        function DOMFragment(first, last) {
            var _a;
            if (arguments.length === 1)
                last = first;
            if (!first || !last)
                return;
            this.ends = (_a = {}, _a[L] = first, _a[R] = last, _a);
        }
        /**
         * Returns a `DOMFragment` representing the contiguous span of sibling
         * DOM nodes betewen `first` and `last`. If only one element is
         * passed, creates a `DOMFragment` representing that single element.
         * If no elements are passed, creates and empty `DOMFragment`.
         *
         * If two elements are passed, asserts that the second element is a
         * forward sibling of the first element. Checking this invariant is
         * O(n) in the total number of nodes in the fragment
         */
        DOMFragment.create = function (first, last) {
            if (arguments.length === 1)
                last = first;
            pray('No half-empty DOMFragments', !!first === !!last);
            var out = new DOMFragment(first, last);
            pray('last is a forward sibling of first', out.isValid());
            return out;
        };
        DOMFragment.prototype.isEmpty = function () {
            return this.ends === undefined;
        };
        DOMFragment.prototype.isOneNode = function () {
            return !!(this.ends && this.ends[L] === this.ends[R]);
        };
        /**
         * Returns true if the fragment is empty or if its last node is equal
         * to its first node or is a forward sibling of its first node.
         *
         * DOMFragments may be invalidated if any of the nodes they contain
         * are moved or removed independently of the other nodes they contain.
         *
         * Note that this check visits each node in the fragment, so it is
         * O(n).
         */
        DOMFragment.prototype.isValid = function () {
            if (!this.ends)
                return true;
            if (this.ends[L] === this.ends[R])
                return true;
            var maybeLast;
            this.eachNode(function (el) { return (maybeLast = el); });
            return maybeLast === this.ends[R];
        };
        /**
         * Return the first Node of this fragment. May be a a Node that is not
         * an Element such as a Text or Comment node.
         *
         * Asserts fragment is not empty.
         */
        DOMFragment.prototype.firstNode = function () {
            pray('Fragment is not empty', this.ends);
            return this.ends[L];
        };
        /**
         * Return the last Node of this fragment. May be a a Node that is not
         * an Element such as a Text or Comment node.
         *
         * Asserts fragment is not empty.
         */
        DOMFragment.prototype.lastNode = function () {
            pray('Fragment is not empty', this.ends);
            return this.ends[R];
        };
        /**
         * Return a fragment representing the children (including Text and
         * Comment nodes) of the node represented by this fragment.
         *
         * Asserts that this fragment contains exactly one Node.
         *
         * Note, because this includes text and comment nodes, this is more
         * like jQuery's .contents() than jQuery's .children()
         */
        DOMFragment.prototype.children = function () {
            var el = this.oneNode();
            var first = el.firstChild;
            var last = el.lastChild;
            return first && last ? new DOMFragment(first, last) : new DOMFragment();
        };
        /**
         * Return a new `DOMFragment` spanning this fragment and `sibling`
         * fragment. Does not perform any DOM operations.
         *
         * Asserts that `sibling` is either empty or a forward sibling of
         * this fragment that may share its first node with the last node of
         * this fragment
         */
        DOMFragment.prototype.join = function (sibling) {
            if (!this.ends)
                return sibling;
            if (!sibling.ends)
                return this;
            // Check if sibling is actually a sibling of this span
            var found = false;
            var current = this.ends[R].nextSibling;
            while (current) {
                if (current === sibling.ends[L]) {
                    found = true;
                    break;
                }
                current = current.nextSibling;
            }
            pray('sibling must be a forward DOM sibling of this fragment', found);
            return new DOMFragment(this.ends[L], sibling.ends[R]);
        };
        /**
         * Return the single DOM Node represented by this fragment.
         *
         * Asserts that this fragment contains exactly one Node.
         */
        DOMFragment.prototype.oneNode = function () {
            pray('Fragment has a single node', this.ends && this.ends[L] === this.ends[R]);
            return this.ends[L];
        };
        /**
         * Return the single DOM Element represented by this fragment.
         *
         * Asserts that this fragment contains exactly one Node, and that node
         * is an Element node.
         */
        DOMFragment.prototype.oneElement = function () {
            var el = this.oneNode();
            pray('Node is an Element', el.nodeType === Node.ELEMENT_NODE);
            return el;
        };
        /**
         * Return the single DOM Text node represented by this fragment.
         *
         * Asserts that this fragment contains exactly one Node, and that node
         * is a Text node.
         */
        DOMFragment.prototype.oneText = function () {
            var el = this.oneNode();
            pray('Node is Text', el.nodeType === Node.TEXT_NODE);
            return el;
        };
        /**
         * Calls callback sequentially with each node in this fragment.
         * Includes nodes that are not Elements, such as Text and Comment
         * nodes.
         */
        DOMFragment.prototype.eachNode = function (cb) {
            if (!this.ends)
                return this;
            var stop = this.ends[R];
            for (var node = this.ends[L], next = void 0; node; node = next) {
                // Note, this loop is organized in a slightly tricky way in order
                // cache "next" before calling the callback. This is done because
                // the callback could mutate node.nextSibling (e.g. by moving the
                // node to a documentFragment, like toDocumentFragment does).
                //
                // It's still possible to break this iteration by messing with
                // forward siblings of node in the callback, although it's
                // probably rare to want to do that. Perhaps this means "each" is
                // too dangerous to have as a public method.
                next = node.nextSibling;
                cb(node);
                if (node === stop)
                    break;
            }
            return this;
        };
        /**
         * Calls callback sequentially with each Element node in this
         * fragment. Skips nodes that are not Elements, such as Text and
         * Comment nodes.
         */
        DOMFragment.prototype.eachElement = function (cb) {
            this.eachNode(function (el) {
                if (el.nodeType === Node.ELEMENT_NODE)
                    cb(el);
            });
            return this;
        };
        /**
         * Returns the concatenated text content of all of the nodes in the
         * fragment.
         */
        DOMFragment.prototype.text = function () {
            var accum = '';
            this.eachNode(function (node) {
                accum += node.textContent || '';
            });
            return accum;
        };
        /**
         * Returns an array of all the Nodes in this fragment, including nodes
         * that are not Element nodes such as Text and Comment nodes;
         */
        DOMFragment.prototype.toNodeArray = function () {
            var accum = [];
            this.eachNode(function (el) { return accum.push(el); });
            return accum;
        };
        /**
         * Returns an array of all the Element nodes in this fragment. The
         * result does not include nodes that are not Elements, such as Text
         * and Comment nodes.
         */
        DOMFragment.prototype.toElementArray = function () {
            var accum = [];
            this.eachElement(function (el) { return accum.push(el); });
            return accum;
        };
        /**
         * Moves all of the nodes in this fragment into a new DocumentFragment
         * and returns it. This includes Nodes that are not Elements such as
         * Text and Comment nodes.
         */
        DOMFragment.prototype.toDocumentFragment = function () {
            var frag = document.createDocumentFragment();
            this.eachNode(function (el) { return frag.appendChild(el); });
            return frag;
        };
        /**
         * Insert all the nodes in this fragment into the DOM directly before
         * the first node of `sibling` fragment. If `sibling` is empty or does
         * not have a parent node, detaches this fragment from the document.
         *
         * Note that this behavior differs from jQuery if `sibling` is a
         * collection with multiple nodes. In that case, jQuery inserts this
         * collection before the first node in `sibling`, and then inserts a
         * clone of this collection before each additional node in the
         * `sibling` collection. DOMFragment only ever inserts this collection
         * before the first node of the sibling fragment, and never inserts
         * additional clones.
         */
        DOMFragment.prototype.insertBefore = function (sibling) {
            return this.insDirOf(L, sibling);
        };
        /**
         * Insert all the nodes in this fragment into the DOM directly after
         * the last node of `sibling` fragment. If `sibling` is empty or does
         * not have a parent node, detaches this fragment from the document.
         *
         * Note that this behavior differs from jQuery if `sibling` is a
         * collection with multiple nodes. In that case, jQuery inserts this
         * collection before the first node in `sibling`, and then inserts a
         * clone of this collection before each additional node in the
         * `sibling` collection. DOMFragment only ever inserts this collection
         * before the first node of the sibling fragment, and never inserts
         * additional clones.
         */
        DOMFragment.prototype.insertAfter = function (sibling) {
            return this.insDirOf(R, sibling);
        };
        /**
         * Append children to the node represented by this fragment.
         *
         * Asserts that this fragment contains exactly one Element.
         */
        DOMFragment.prototype.append = function (children) {
            children.appendTo(this.oneElement());
            return this;
        };
        /**
         * Prepend children to the node represented by this fragment.
         *
         * Asserts that this fragment contains exactly one Element.
         */
        DOMFragment.prototype.prepend = function (children) {
            children.prependTo(this.oneElement());
            return this;
        };
        /**
         * Append all the nodes in this fragment to the children of `el`.
         */
        DOMFragment.prototype.appendTo = function (el) {
            return this.insAtDirEnd(R, el);
        };
        /**
         * Prepend all the nodes in this fragment to the children of `el`.
         */
        DOMFragment.prototype.prependTo = function (el) {
            return this.insAtDirEnd(L, el);
        };
        /**
         * Return a fragment containing the parent node of the nodes in this
         * fragment. Returns an empty fragment if this fragment is empty or
         * does not have a parent node.
         */
        DOMFragment.prototype.parent = function () {
            if (!this.ends)
                return this;
            var parent = this.ends[L].parentNode;
            if (!parent)
                return new DOMFragment();
            return new DOMFragment(parent);
        };
        /**
         * Replace the children of `el` with the contents of this fragment,
         * and place `el` into the DOM at the previous location of this
         * fragment.
         */
        DOMFragment.prototype.wrapAll = function (el) {
            el.textContent = ''; // First empty the wrapping element
            if (!this.ends)
                return this;
            var parent = this.ends[L].parentNode;
            var next = this.ends[R].nextSibling;
            this.appendTo(el);
            if (parent) {
                parent.insertBefore(el, next);
            }
            return this;
        };
        /**
         * Replace this fragment with the fragment given by `children`. If
         * this fragment is empty or does not have a parent node, detaches
         * `children` from the document.
         *
         * Note that this behavior differs from jQuery if this is a collection
         * with multiple nodes. In that case, jQuery replaces the first
         * element of this collection with `children`, and then replaces each
         * additional element in this collection with a clone of `children`.
         * DOMFragment replaces this entire fragment with `children` and never
         * makes additional clones of `children`.
         */
        DOMFragment.prototype.replaceWith = function (children) {
            var _a;
            var rightEnd = (_a = this.ends) === null || _a === void 0 ? void 0 : _a[R];
            // Note: important to cache parent and nextSibling (if they exist)
            // before detaching this fragment from the document (which will
            // mutate its parent and sibling references)
            var parent = rightEnd === null || rightEnd === void 0 ? void 0 : rightEnd.parentNode;
            var nextSibling = rightEnd === null || rightEnd === void 0 ? void 0 : rightEnd.nextSibling;
            this.detach();
            // Note, this purposely detaches children from the document, even if
            // they can't be reinserted because this fragment is empty or has no
            // parent
            var childDocumentFragment = children.toDocumentFragment();
            if (!rightEnd || !parent)
                return this;
            parent.insertBefore(childDocumentFragment, nextSibling || null);
            return this;
        };
        /**
         * Return the nth Element node of this collection, or undefined if
         * there is no nth Element. Skips Nodes that are not Elements (e.g.
         * Text and Comment nodes).
         *
         * Analogous to jQuery's array indexing syntax, or jQuery's .get()
         * with positive arguments.
         */
        DOMFragment.prototype.nthElement = function (n) {
            if (!this.ends)
                return undefined;
            if (n < 0 || n !== Math.floor(n))
                return undefined;
            var current = this.ends[L];
            while (current) {
                // Only count element nodes
                if (current.nodeType === Node.ELEMENT_NODE) {
                    if (n <= 0)
                        return current;
                    n -= 1;
                }
                if (current === this.ends[R])
                    return undefined;
                current = current.nextSibling;
            }
            return undefined;
        };
        /**
         * Return the first Element node of this fragment, or undefined if
         * the fragment is empty. Skips Nodes that are not Elements (e.g.
         * Text and Comment nodes).
         */
        DOMFragment.prototype.firstElement = function () {
            return this.nthElement(0);
        };
        /**
         * Return the last Element node of this fragment, or undefined if
         * the fragment is empty. Skips Nodes that are not Elements (e.g.
         * Text and Comment nodes).
         */
        DOMFragment.prototype.lastElement = function () {
            if (!this.ends)
                return undefined;
            var current = this.ends[R];
            while (current) {
                // Only count element nodes
                if (current.nodeType === Node.ELEMENT_NODE) {
                    return current;
                }
                if (current === this.ends[L])
                    return undefined;
                current = current.previousSibling;
            }
            return undefined;
        };
        /**
         * Return a new fragment holding the first Element node of this
         * fragment, or an empty fragment if this fragment is empty. Skips
         * Nodes that are not Elements (e.g. Text and Comment nodes).
         */
        DOMFragment.prototype.first = function () {
            return new DOMFragment(this.firstElement());
        };
        /**
         * Return a new fragment holding the last Element node of this
         * fragment, or an empty fragment if this fragment is empty. Skips
         * Nodes that are not Elements (e.g. Text and Comment nodes).
         */
        DOMFragment.prototype.last = function () {
            return new DOMFragment(this.lastElement());
        };
        /**
         * Return a new fragment holding the nth Element node of this
         * fragment, or an empty fragment if there is no nth node of this
         * fragment. Skips Nodes that are not Elements (e.g. Text and Comment
         * nodes).
         */
        DOMFragment.prototype.eq = function (n) {
            return new DOMFragment(this.nthElement(n));
        };
        /**
         * Return a new fragment beginning with the nth Element node of this
         * fragment, and ending with the same end as this fragment, or an
         * empty fragment if there is no nth node in this fragment. Skips
         * Nodes that are not Elements (e.g. Text and Comment nodes).
         */
        DOMFragment.prototype.slice = function (n) {
            // Note, would be reasonable to extend this to take a second
            // argument if we ever find we need this
            if (!this.ends)
                return this;
            var el = this.nthElement(n);
            if (!el)
                return new DOMFragment();
            return new DOMFragment(el, this.ends[R]);
        };
        /**
         * Return a new fragment containing the next Element after the Node
         * represented by this fragment, or an empty fragment if there is no
         * next Element. Skips Nodes that are not Elements (e.g. Text and
         * Comment nodes).
         *
         * Asserts that this fragment contains exactly one Node.
         */
        DOMFragment.prototype.next = function () {
            var current = this.oneNode();
            while (current) {
                current = current.nextSibling;
                if (current && current.nodeType === Node.ELEMENT_NODE)
                    return new DOMFragment(current);
            }
            return new DOMFragment();
        };
        /**
         * Return a new fragment containing the previousElement after the Node
         * represented by this fragment, or an empty fragment if there is no
         * previous Element. Skips Nodes that are not Elements (e.g. Text and
         * Comment nodes).
         *
         * Asserts that this fragment contains exactly one Node.
         */
        DOMFragment.prototype.prev = function () {
            var current = this.oneNode();
            while (current) {
                current = current.previousSibling;
                if (current && current.nodeType === Node.ELEMENT_NODE)
                    return new DOMFragment(current);
            }
            return new DOMFragment();
        };
        /**
         * Remove all children of every Element Node in the fragment. Skips
         * Nodes that are not Elements (e.g. Text and Comment nodes).
         */
        DOMFragment.prototype.empty = function () {
            // TODO the corresponding jQuery methods clean up some internal
            // references before removing elements from the DOM. That won't
            // matter once jQuery is totally gone, but until then, this may
            // introduce memory leaks
            this.eachElement(function (el) {
                el.textContent = '';
            });
            return this;
        };
        /**
         * Remove every node in the fragment from the DOM.
         *
         * Implemented by moving every node in the fragment into a new
         * document fragment in order to preserve the sibling relationships
         * of the removed element. If you want to get access to this document
         * fragment, use `.toDocumentFragment()` instead.
         */
        DOMFragment.prototype.remove = function () {
            // TODO the corresponding jQuery methods clean up some internal
            // references before removing elements from the DOM. That won't
            // matter once jQuery is totally gone, but until then, this may
            // introduce memory leaks
            // Note, removing the elements by moving them to a document fragment
            // because this way their sibling references stay intact. This is
            // important if we want to reattach them somewhere else later
            this.toDocumentFragment();
            return this;
        };
        /**
         * Remove every node in the fragment from the DOM. Alias of remove.
         *
         * Implemented by moving every node in the fragment into a new
         * document fragment in order to preserve the sibling relationships
         * of the removed element. If you want to get access to this document
         * fragment, use `.toDocumentFragment()` instead.
         *
         * Note: jQuery makes a distinction between detach() and remove().
         * remove() cleans up internal references, and detach() does not.
         */
        DOMFragment.prototype.detach = function () {
            // In jQuery, detach() is similar to remove() but it does not clean
            // up internal references. Here they're aliases, but I'm leaving
            // this as a separate method for the moment to keep track of where
            // mathquill did one vs the other.
            return this.remove();
        };
        /**
         * Insert this fragment either just before or just after `sibling`
         * fragment according to the direction specified by `dir`. If
         * `sibling` is empty or does not have a parent node, detaches this
         * fragment from the document.
         */
        DOMFragment.prototype.insDirOf = function (dir, sibling) {
            var _a;
            if (!this.ends)
                return this;
            var el = (_a = sibling.ends) === null || _a === void 0 ? void 0 : _a[dir];
            if (!el || !el.parentNode)
                return this.detach();
            _insDirOf(dir, el.parentNode, this.toDocumentFragment(), el);
            return this;
        };
        /**
         * Insert this fragment into `el` either at the beginning or end of
         * its children, according to the direction specified by `dir`.
         */
        DOMFragment.prototype.insAtDirEnd = function (dir, el) {
            if (!this.ends)
                return this;
            _insAtDirEnd(dir, this.toDocumentFragment(), el);
            return this;
        };
        /**
         * Return true if any element in this fragment has class `className`
         * and false otherwise.
         */
        DOMFragment.prototype.hasClass = function (className) {
            var out = false;
            this.eachElement(function (el) {
                if (el.classList.contains(className))
                    out = true;
            });
            return out;
        };
        /**
         * Add each class in space separated list of classes given by
         * `classNames` to each element in this fragment.
         */
        DOMFragment.prototype.addClass = function (classNames) {
            var _loop_1 = function (className) {
                if (!className)
                    return "continue";
                this_1.eachElement(function (el) {
                    el.classList.add(className);
                });
            };
            var this_1 = this;
            for (var _i = 0, _a = classNames.split(/\s+/); _i < _a.length; _i++) {
                var className = _a[_i];
                _loop_1(className);
            }
            return this;
        };
        /**
         * Remove each class in space separated list of classes given by
         * `classNames` from each element in this fragment.
         */
        DOMFragment.prototype.removeClass = function (classNames) {
            var _loop_2 = function (className) {
                if (!className)
                    return "continue";
                this_2.eachElement(function (el) {
                    el.classList.remove(className);
                });
            };
            var this_2 = this;
            for (var _i = 0, _a = classNames.split(/\s+/); _i < _a.length; _i++) {
                var className = _a[_i];
                _loop_2(className);
            }
            return this;
        };
        /**
         * Toggle each class in space separated list of classes given by
         * `classNames` on each element in this fragment.
         *
         * If second arg `on` is given as `true`, always toggle classes on.
         * If second arg `on` is passed as `false`, always toggle classes off.
         */
        DOMFragment.prototype.toggleClass = function (classNames, on) {
            if (on === true)
                return this.addClass(classNames);
            if (on === false)
                return this.removeClass(classNames);
            var _loop_3 = function (className) {
                if (!className)
                    return "continue";
                this_3.eachElement(function (el) {
                    el.classList.toggle(className);
                });
            };
            var this_3 = this;
            for (var _i = 0, _a = classNames.split(/\s+/); _i < _a.length; _i++) {
                var className = _a[_i];
                _loop_3(className);
            }
            return this;
        };
        return DOMFragment;
    }());
    var domFrag = DOMFragment.create;
    /**
     * Insert `source` before or after `target` child of `parent` denending
     * on `dir`. Only intended to be used internally as a helper in this module
     */
    function _insDirOf(dir, parent, source, target) {
        parent.insertBefore(source, dir === L ? target : target.nextSibling);
    }
    /**
     * Insert `source` before or after `target` child of `parent` denending
     * on `dir`. Only intended to be used internally as a helper in this module
     */
    function _insAtDirEnd(dir, source, parent) {
        if (dir === L) {
            parent.insertBefore(source, parent.firstChild);
        }
        else {
            parent.appendChild(source);
        }
    }
    /*************************************************
     * Base classes of edit tree-related objects
     *
     * Only doing tree node manipulation via these
     * adopt/ disown methods guarantees well-formedness
     * of the tree.
     ************************************************/
    /** A cursor-like location in an mq node tree. */
    var Point = /** @class */ (function () {
        function Point(parent, leftward, rightward) {
            this.init(parent, leftward, rightward);
        }
        // keeping init around only for tests
        Point.prototype.init = function (parent, leftward, rightward) {
            this.parent = parent;
            this[L] = leftward;
            this[R] = rightward;
        };
        Point.copy = function (pt) {
            return new Point(pt.parent, pt[L], pt[R]);
        };
        return Point;
    }());
    function eachNode(ends, yield_) {
        var el = ends[L];
        if (!el)
            return;
        var stop = ends[R];
        if (!stop)
            return; //shouldn't happen because ends[L] is defined;
        stop = stop[R];
        // TODO - this cast as MQNode is actually important to keep tests passing. I went to
        // fix this code to gracefully handle an undefined el and there are tests that actually
        // verify that this will throw an error. So I'm keeping the behavior but ignoring the
        // type error.
        for (; el !== stop; el = el[R]) {
            var result = yield_(el); // TODO - might be passing in 0 intead of a MQNode, but tests want this
            if (result === false)
                break;
        }
    }
    function foldNodes(ends, fold, yield_) {
        var el = ends[L];
        if (!el)
            return fold;
        var stop = ends[R];
        if (!stop)
            return fold; //shouldn't happen because ends[L] is defined;
        stop = stop[R];
        // TODO - this cast as MQNode is actually important to keep tests passing. I went to
        // fix this code to gracefully handle an undefined el and there are tests that actually
        // verify that this will throw an error. So I'm keeping the behavior but ignoring the
        // type error.
        for (; el !== stop; el = el[R]) {
            fold = yield_(fold, el); // TODO - might be passing in 0 intead of a MQNode, but tests want this
        }
        return fold;
    }
    var NodeBase = /** @class */ (function () {
        function NodeBase() {
            var _c;
            // TODO - life would be so much better in typescript of these were undefined instead of
            // 0. The ! would save us in cases where we know a node is defined.
            this[_a] = 0;
            this[_b] = 0;
            // TODO - can this ever actually stay 0? if so we need to add null checks
            this.parent = 0;
            /**
             * The (doubly-linked) list of this node's children.
             *
             * NOTE child classes may specify a narrower type for ends e.g. to
             * enforce that children are not empty, or that they have a certain
             * type. In those cases, this initializer may still run at
             * construction time, but this is expected to be followed by a call
             * to adopt that sets non-empty ends of the necessary types.
             *
             * Similarly, `Fragment::disown` may temporarily break non-empty
             * invariants, which are expected to be restored by a subsequent call
             * to `Fragment::adopt`.
             * */
            this.ends = (_c = {}, _c[L] = 0, _c[R] = 0, _c);
            this.id = NodeBase.uniqueNodeId();
        }
        NodeBase.uniqueNodeId = function () {
            return (NodeBase.idCounter += 1);
        };
        // The mqBlockNode and mqCmdNode custom properties link back from the
        // DOM nodes generated by MathQuill to the MQNodes that generated
        // them. This is useful for looking up MQNodes in event handlers and
        // in the mq(elt) public API method
        NodeBase.getNodeOfElement = function (el) {
            if (!el)
                return;
            if (!el.nodeType)
                throw new Error('must pass an Element to NodeBase.getNodeOfElement');
            var elTrackingNode = el;
            return elTrackingNode.mqBlockNode || elTrackingNode.mqCmdNode;
        };
        NodeBase.linkElementByBlockNode = function (elm, blockNode) {
            elm.mqBlockNode = blockNode;
        };
        NodeBase.linkElementByCmdNode = function (elm, cmdNode) {
            elm.mqCmdNode = cmdNode;
        };
        NodeBase.prototype.setEnds = function (ends) {
            this.ends = ends;
            pray('No half-empty node ends', !!this.ends[L] === !!this.ends[R]);
        };
        NodeBase.prototype.getEnd = function (dir) {
            return this.ends[dir];
        };
        NodeBase.prototype.toString = function () {
            return '{{ MathQuill Node #' + this.id + ' }}';
        };
        NodeBase.prototype.setDOM = function (el) {
            if (el) {
                pray('DOM is an element or a text node', el.nodeType === Node.ELEMENT_NODE || el.nodeType === Node.TEXT_NODE);
            }
            this._el = el;
            return this;
        };
        NodeBase.prototype.domFrag = function () {
            return domFrag(this._el);
        };
        NodeBase.prototype.createDir = function (dir, cursor) {
            prayDirection(dir);
            var node = this;
            node.html();
            node.domFrag().insDirOf(dir, cursor.domFrag());
            cursor[dir] = node.adopt(cursor.parent, cursor[L], cursor[R]); // TODO - assuming not undefined, could be 0
            return node;
        };
        NodeBase.prototype.createLeftOf = function (cursor) {
            this.createDir(L, cursor);
        };
        NodeBase.prototype.selectChildren = function (leftEnd, rightEnd) {
            return new MQSelection(leftEnd, rightEnd);
        };
        NodeBase.prototype.bubble = function (yield_) {
            var self = this.getSelfNode();
            for (var ancestor = self; ancestor; ancestor = ancestor.parent) {
                var result = yield_(ancestor);
                if (result === false)
                    break;
            }
            return this;
        };
        NodeBase.prototype.postOrder = function (yield_) {
            var self = this.getSelfNode();
            (function recurse(descendant) {
                if (!descendant)
                    return false;
                descendant.eachChild(recurse);
                yield_(descendant);
                return true;
            })(self);
            return self;
        };
        NodeBase.prototype.isEmpty = function () {
            return this.ends[L] === 0 && this.ends[R] === 0;
        };
        NodeBase.prototype.isQuietEmptyDelimiter = function (dlms) {
            if (!this.isEmpty())
                return false;
            if (!dlms)
                return false;
            if (!this.parent || this.parent.ctrlSeq === undefined)
                return false;
            // Remove any leading \left or \right from the ctrl sequence before looking it up.
            var key = this.parent.ctrlSeq.replace(/^\\(left|right)?/, '');
            return dlms.hasOwnProperty(key);
        };
        NodeBase.prototype.isStyleBlock = function () {
            return false;
        };
        NodeBase.prototype.isTextBlock = function () {
            return false;
        };
        NodeBase.prototype.children = function () {
            return new Fragment(this.getEnd(L), this.getEnd(R));
        };
        NodeBase.prototype.eachChild = function (yield_) {
            eachNode(this.ends, yield_);
            return this;
        };
        NodeBase.prototype.foldChildren = function (fold, yield_) {
            return foldNodes(this.ends, fold, yield_);
        };
        NodeBase.prototype.withDirAdopt = function (dir, parent, withDir, oppDir) {
            var self = this.getSelfNode();
            new Fragment(self, self).withDirAdopt(dir, parent, withDir, oppDir);
            return this;
        };
        /**
         * Add this node to the given parent node's children, at the position between the adjacent
         * children `leftward` (or the beginning if omitted) and `rightward` (or the end if omitted).
         * See `Fragment#adopt()`
         */
        NodeBase.prototype.adopt = function (parent, leftward, rightward) {
            var self = this.getSelfNode();
            new Fragment(self, self).adopt(parent, leftward, rightward);
            return this.getSelfNode();
        };
        NodeBase.prototype.disown = function () {
            var self = this.getSelfNode();
            new Fragment(self, self).disown();
            return this;
        };
        NodeBase.prototype.remove = function () {
            this.domFrag().remove();
            return this.disown();
        };
        NodeBase.prototype.shouldIgnoreSubstitutionInSimpleSubscript = function (options) {
            var opt = options.disableAutoSubstitutionInSubscripts;
            if (!opt)
                return false;
            if (!this.parent)
                return false;
            if (!(this.parent.parent instanceof SupSub))
                return false;
            // Allow substitution in e.g. log subscripts
            var before = this.parent.parent[L];
            if (typeof opt === 'object' &&
                before instanceof Letter &&
                before.endsWord &&
                opt.except[before.endsWord]) {
                return false;
            }
            // Mathquill is gross. There are many different paths that
            // create subscripts and sometimes we don't even construct
            // true instances of `LatexCmds._`. Another problem is that
            // the relationship between the sub and the SupSub isn't
            // completely setup during a paste at the time we check
            // this. I wanted to use: `this.parent.parent.sub !== this.parent`
            // but that check doesn't always work. This seems to be the only
            // check that always works. I'd rather live with this than try
            // to change the init order of things.
            if (!this.parent.domFrag().hasClass('mq-sub'))
                return false;
            return true;
        };
        NodeBase.prototype.getSelfNode = function () {
            // dumb dance to tell typescript that we eventually become a MQNode
            return this;
        };
        // Overridden by child classes
        NodeBase.prototype.parser = function () {
            pray('Abstract parser() method is never called', false);
        };
        /** Render this node to DOM */
        NodeBase.prototype.html = function () {
            throw new Error('html() unimplemented in NodeBase');
        };
        NodeBase.prototype.text = function () {
            return '';
        };
        NodeBase.prototype.latex = function () {
            var ctx = {
                uncleanedLatex: '',
                uncleanedStartIndex: -1,
                uncleanedEndIndex: -1
            };
            this.latexRecursive(ctx);
            return ctx.uncleanedLatex;
        };
        NodeBase.prototype.latexRecursive = function (_ctx) { };
        NodeBase.prototype.checkCursorContextOpen = function (ctx) {
            var latexLength = ctx.uncleanedLatex.length;
            if (ctx.startSelectionBefore === this) {
                ctx.uncleanedStartIndex = latexLength;
            }
            if (ctx.endSelectionBefore === this) {
                ctx.uncleanedEndIndex = latexLength;
            }
            var restoreInfo = ctx.restoreInfo;
            if (restoreInfo) {
                if (latexLength === restoreInfo.uncleanedStartIndex) {
                    if (restoreInfo.uncleanedEndIndex === restoreInfo.uncleanedStartIndex) {
                        // caret
                        if (latexLength === restoreInfo.uncleanedStartIndex) {
                            restoreInfo.cursorParent = this.parent;
                        }
                    }
                    else {
                        // selection
                        restoreInfo.selectionL = this;
                    }
                }
            }
        };
        NodeBase.prototype.checkCursorContextClose = function (ctx) {
            var latexLength = ctx.uncleanedLatex.length;
            if (ctx.startSelectionAfter === this) {
                ctx.uncleanedStartIndex = latexLength;
            }
            if (ctx.endSelectionAfter === this) {
                ctx.uncleanedEndIndex = latexLength;
            }
            var restoreInfo = ctx.restoreInfo;
            if (restoreInfo) {
                if (latexLength === restoreInfo.uncleanedEndIndex) {
                    if (restoreInfo.uncleanedStartIndex === restoreInfo.uncleanedEndIndex) {
                        // caret
                        if (!restoreInfo.cursorL) {
                            restoreInfo.cursorL = this;
                        }
                        if (!restoreInfo.cursorParent) {
                            restoreInfo.cursorParent = this.parent;
                        }
                        else if (restoreInfo.cursorParent === this.parent) {
                            // this seems important for when we enter an empty MathBlock. For instance cursor in between "()" or
                            // in an empty square root.
                            restoreInfo.cursorParent = this;
                            restoreInfo.cursorL = 0;
                        }
                    }
                    else {
                        // selection
                        // it seems like when closing the selection we want the very first node that matches
                        // the index, not any later ones.
                        if (!restoreInfo.selectionR) {
                            restoreInfo.selectionR = this;
                        }
                    }
                }
            }
        };
        NodeBase.prototype.finalizeTree = function (_options, _dir) { };
        NodeBase.prototype.contactWeld = function (_cursor, _dir) { };
        NodeBase.prototype.blur = function (_cursor) { };
        NodeBase.prototype.focus = function () { };
        NodeBase.prototype.intentionalBlur = function () { };
        NodeBase.prototype.reflow = function () { };
        NodeBase.prototype.registerInnerField = function (_innerFields, _mathField) { };
        NodeBase.prototype.chToCmd = function (_ch, _options) {
            pray('Abstract chToCmd() method is never called', false);
        };
        NodeBase.prototype.mathspeak = function (_options) {
            return '';
        };
        NodeBase.prototype.seek = function (_clientX, _cursor) { };
        NodeBase.prototype.siblingDeleted = function (_options, _dir) { };
        NodeBase.prototype.siblingCreated = function (_options, _dir) { };
        NodeBase.prototype.finalizeInsert = function (_options, _cursor) { };
        NodeBase.prototype.fixDigitGrouping = function (_opts) { };
        NodeBase.prototype.writeLatex = function (_cursor, _latex) { };
        NodeBase.prototype.write = function (_cursor, _ch) { };
        var _a, _b;
        _a = L, _b = R;
        NodeBase.idCounter = 0;
        return NodeBase;
    }());
    function prayWellFormed(parent, leftward, rightward) {
        pray('a parent is always present', parent);
        pray('leftward is properly set up', (function () {
            // either it's empty and `rightward` is the left end child (possibly empty)
            if (!leftward)
                return parent.getEnd(L) === rightward;
            // or it's there and its [R] and .parent are properly set up
            return leftward[R] === rightward && leftward.parent === parent;
        })(), {
            parent: parent,
            leftward: leftward,
            leftwardL: leftward && leftward[L],
            leftwardR: leftward && leftward[R],
            rightwardL: rightward && rightward[L],
            rightwardR: rightward && rightward[R]
        });
        pray('rightward is properly set up', (function () {
            // either it's empty and `leftward` is the right end child (possibly empty)
            if (!rightward)
                return parent.getEnd(R) === leftward;
            // or it's there and its [L] and .parent are properly set up
            return rightward[L] === leftward && rightward.parent === parent;
        })(), {
            parent: parent,
            rightward: rightward,
            leftwardL: leftward && leftward[L],
            leftwardR: leftward && leftward[R],
            rightwardL: rightward && rightward[L],
            rightwardR: rightward && rightward[R],
            rightwardParent: rightward && rightward.parent
        });
    }
    /**
     * An entity outside the virtual tree with one-way pointers (so it's only a
     * "view" of part of the tree, not an actual node/entity in the tree) that
     * delimits a doubly-linked list of sibling nodes.
     * It's like a fanfic love-child between HTML DOM DocumentFragment and the Range
     * classes: like DocumentFragment, its contents must be sibling nodes
     * (unlike Range, whose contents are arbitrary contiguous pieces of subtrees),
     * but like Range, it has only one-way pointers to its contents, its contents
     * have no reference to it and in fact may still be in the visible tree (unlike
     * DocumentFragment, whose contents must be detached from the visible tree
     * and have their 'parent' pointers set to the DocumentFragment).
     */
    var Fragment = /** @class */ (function () {
        function Fragment(withDir, oppDir, dir) {
            var _c, _d;
            this.disowned = false;
            if (dir === undefined)
                dir = L;
            prayDirection(dir);
            pray('no half-empty fragments', !withDir === !oppDir, {
                withDir: withDir,
                oppDir: oppDir
            });
            if (!withDir || !oppDir) {
                this.setEnds((_c = {}, _c[L] = 0, _c[R] = 0, _c));
                return;
            }
            pray('withDir is passed to Fragment', withDir instanceof MQNode);
            pray('oppDir is passed to Fragment', oppDir instanceof MQNode);
            pray('withDir and oppDir have the same parent', withDir.parent === oppDir.parent);
            var ends = (_d = {},
                _d[dir] = withDir,
                _d[-dir] = oppDir,
                _d);
            this.setEnds(ends);
            var maybeRightEnd = 0;
            this.each(function (el) {
                maybeRightEnd = el;
            });
            pray('following direction siblings from start reaches end', maybeRightEnd === ends[R]);
        }
        Fragment.prototype.getDOMFragFromEnds = function () {
            var left = this.ends[L];
            var right = this.ends[R];
            if (left === 0 || right === 0) {
                return domFrag();
            }
            else if (left === right) {
                // Note, joining a DOMFragment to itself is not allowed, so
                // don't attempt to join the end fragments if the ends are equal
                return left.domFrag();
            }
            else {
                return left.domFrag().join(right.domFrag());
            }
        };
        /**
         * Note, children may override this to enforce extra invariants,
         * (e.g. that ends are always defined). Ends should only be set
         * through this function.
         */
        Fragment.prototype.setEnds = function (ends) {
            this.ends = ends;
        };
        Fragment.prototype.getEnd = function (dir) {
            return this.ends ? this.ends[dir] : 0;
        };
        Fragment.prototype.domFrag = function () {
            return this.getDOMFragFromEnds();
        };
        // like Cursor::withDirInsertAt(dir, parent, withDir, oppDir)
        Fragment.prototype.withDirAdopt = function (dir, parent, withDir, oppDir) {
            return dir === L
                ? this.adopt(parent, withDir, oppDir)
                : this.adopt(parent, oppDir, withDir);
        };
        /**
         * Splice this fragment into the given parent node's children, at the position between the adjacent
         * children `leftward` (or the beginning if omitted) and `rightward` (or the end if omitted).
         *
         * TODO: why do we need both leftward and rightward? It seems to me that `rightward` is always expected to be `leftward ? leftward[R] : parent.ends[L]`.
         */
        Fragment.prototype.adopt = function (parent, leftward, rightward) {
            var _c;
            prayWellFormed(parent, leftward, rightward);
            var self = this;
            this.disowned = false;
            var leftEnd = self.ends[L];
            if (!leftEnd)
                return this;
            var rightEnd = self.ends[R];
            if (!rightEnd)
                return this;
            var ends = (_c = {}, _c[L] = parent.getEnd(L), _c[R] = parent.getEnd(R), _c);
            if (leftward) {
                // NB: this is handled in the ::each() block
                // leftward[R] = leftEnd
            }
            else {
                ends[L] = leftEnd;
            }
            if (rightward) {
                rightward[L] = rightEnd;
            }
            else {
                ends[R] = rightEnd;
            }
            parent.setEnds(ends);
            rightEnd[R] = rightward;
            self.each(function (el) {
                el[L] = leftward;
                el.parent = parent;
                if (leftward)
                    leftward[R] = el;
                leftward = el;
                return true;
            });
            return self;
        };
        /**
         * Remove the nodes in this fragment from their parent.
         */
        Fragment.prototype.disown = function () {
            var _c;
            var self = this;
            var leftEnd = self.ends[L];
            // guard for empty and already-disowned fragments
            if (!leftEnd || self.disowned)
                return self;
            this.disowned = true;
            var rightEnd = self.ends[R];
            if (!rightEnd)
                return self;
            var parent = leftEnd.parent;
            prayWellFormed(parent, leftEnd[L], leftEnd);
            prayWellFormed(parent, rightEnd, rightEnd[R]);
            var ends = (_c = {}, _c[L] = parent.getEnd(L), _c[R] = parent.getEnd(R), _c);
            if (leftEnd[L]) {
                var leftLeftEnd = leftEnd[L];
                leftLeftEnd[R] = rightEnd[R];
            }
            else {
                ends[L] = rightEnd[R];
            }
            if (rightEnd[R]) {
                var rightRightEnd = rightEnd[R];
                rightRightEnd[L] = leftEnd[L];
            }
            else {
                ends[R] = leftEnd[L];
            }
            if (ends[L] && ends[R]) {
                parent.setEnds(ends);
            }
            else {
                // some child classes of MQNode try to enforce that their ends
                // are never empty through the type system. However, disown may
                // temporarily break this invariant in which case it's expected
                // that adopt will later be called to fix the invariant.
                //
                // Cast away the protected status of the ends property and write
                // to it directly to get around runtime assertions in setEnds that
                // enforce non-emptyness.
                parent.ends = ends;
            }
            return self;
        };
        Fragment.prototype.remove = function () {
            this.domFrag().remove();
            return this.disown();
        };
        Fragment.prototype.each = function (yield_) {
            eachNode(this.ends, yield_);
            return this;
        };
        Fragment.prototype.fold = function (fold, yield_) {
            return foldNodes(this.ends, fold, yield_);
        };
        return Fragment;
    }());
    /**
     * Registry of LaTeX commands and commands created when typing
     * a single character.
     *
     * (Commands are all subclasses of Node.)
     */
    var LatexCmds = {};
    var CharCmds = {};
    function isMQNodeClass(cmd) {
        return cmd && cmd.prototype instanceof MQNode;
    }
    /********************************************
     * Cursor and Selection "singleton" classes
     *******************************************/
    /* The main thing that manipulates the Math DOM. Makes sure to manipulate the
    HTML DOM to match. */
    /* Sort of singletons, since there should only be one per editable math
    textbox, but any one HTML document can contain many such textboxes, so any one
    JS environment could actually contain many instances. */
    //A fake cursor in the fake textbox that the math is rendered in.
    var Anticursor = /** @class */ (function (_super) {
        __extends(Anticursor, _super);
        function Anticursor(parent, leftward, rightward) {
            var _this = _super.call(this, parent, leftward, rightward) || this;
            _this.ancestors = {};
            return _this;
        }
        Anticursor.fromCursor = function (cursor) {
            return new Anticursor(cursor.parent, cursor[L], cursor[R]);
        };
        return Anticursor;
    }(Point));
    var Cursor = /** @class */ (function (_super) {
        __extends(Cursor, _super);
        function Cursor(initParent, options, controller) {
            var _this = _super.call(this, initParent, 0, 0) || this;
            /** Slightly more than just a "cache", this remembers the cursor's position in each block node, so that we can return to the right
             * point in that node when moving up and down among blocks.
             */
            _this.upDownCache = {};
            _this.cursorElement = h('span', { class: 'mq-cursor' }, [h.text(U_ZERO_WIDTH_SPACE)]);
            _this._domFrag = domFrag();
            _this.controller = controller;
            _this.options = options;
            _this.setDOMFrag(domFrag(_this.cursorElement));
            //closured for setInterval
            _this.blink = function () {
                domFrag(_this.cursorElement).toggleClass('mq-blink');
            };
            return _this;
        }
        Cursor.prototype.setDOMFrag = function (frag) {
            this._domFrag = frag;
            return this;
        };
        Cursor.prototype.domFrag = function () {
            return this._domFrag;
        };
        Cursor.prototype.show = function () {
            domFrag(this.cursorElement).removeClass('mq-blink');
            this.setDOMFrag(domFrag(this.cursorElement));
            if (this.intervalId)
                //already was shown, just restart interval
                clearInterval(this.intervalId);
            else {
                //was hidden and detached, insert this.jQ back into HTML DOM
                var right = this[R];
                if (right) {
                    var selection = this.selection;
                    if (selection && selection.getEnd(L)[L] === this[L])
                        this.domFrag().insertBefore(selection.domFrag());
                    else
                        this.domFrag().insertBefore(right.domFrag());
                }
                else
                    this.domFrag().appendTo(this.parent.domFrag().oneElement());
                this.parent.focus();
            }
            this.intervalId = setInterval(this.blink, 500);
            return this;
        };
        Cursor.prototype.hide = function () {
            if (this.intervalId)
                clearInterval(this.intervalId);
            this.intervalId = 0;
            this.domFrag().detach();
            this.setDOMFrag(domFrag());
            return this;
        };
        Cursor.prototype.withDirInsertAt = function (dir, parent, withDir, oppDir) {
            var oldParent = this.parent;
            this.parent = parent;
            this[dir] = withDir;
            this[-dir] = oppDir;
            // by contract, .blur() is called after all has been said and done
            // and the cursor has actually been moved
            // FIXME pass cursor to .blur() so text can fix cursor pointers when removing itself
            if (oldParent !== parent && oldParent.blur)
                oldParent.blur(this);
        };
        /** Place the cursor before or after `el`, according the side specified by `dir`. */
        Cursor.prototype.insDirOf = function (dir, el) {
            prayDirection(dir);
            this.domFrag().insDirOf(dir, el.domFrag());
            this.withDirInsertAt(dir, el.parent, el[dir], el);
            this.parent.domFrag().addClass('mq-hasCursor');
            return this;
        };
        Cursor.prototype.insLeftOf = function (el) {
            return this.insDirOf(L, el);
        };
        Cursor.prototype.insRightOf = function (el) {
            return this.insDirOf(R, el);
        };
        /** Place the cursor inside `el` at either the left or right end, according the side specified by `dir`. */
        Cursor.prototype.insAtDirEnd = function (dir, el) {
            prayDirection(dir);
            this.domFrag().insAtDirEnd(dir, el.domFrag().oneElement());
            this.withDirInsertAt(dir, el, 0, el.getEnd(dir));
            el.focus();
            return this;
        };
        Cursor.prototype.insAtLeftEnd = function (el) {
            return this.insAtDirEnd(L, el);
        };
        Cursor.prototype.insAtRightEnd = function (el) {
            return this.insAtDirEnd(R, el);
        };
        /**
         * jump up or down from one block Node to another:
         * - cache the current Point in the node we're jumping from
         * - check if there's a Point in it cached for the node we're jumping to
         *   + if so put the cursor there,
         *   + if not seek a position in the node that is horizontally closest to
         *     the cursor's current position
         */
        Cursor.prototype.jumpUpDown = function (from, to) {
            var self = this;
            self.upDownCache[from.id] = Point.copy(self);
            var cached = self.upDownCache[to.id];
            if (cached) {
                var cachedR = cached[R];
                if (cachedR) {
                    self.insLeftOf(cachedR);
                }
                else {
                    self.insAtRightEnd(cached.parent);
                }
            }
            else {
                var clientX = self.getBoundingClientRectWithoutMargin().left;
                to.seek(clientX, self);
            }
            self.controller.aria.queue(to, true);
        };
        Cursor.prototype.getBoundingClientRectWithoutMargin = function () {
            //in Opera 11.62, .getBoundingClientRect() and hence jQuery::offset()
            //returns all 0's on inline elements with negative margin-right (like
            //the cursor) at the end of their parent, so temporarily remove the
            //negative margin-right when calling jQuery::offset()
            //Opera bug DSK-360043
            //http://bugs.jquery.com/ticket/11523
            //https://github.com/jquery/jquery/pull/717
            var frag = this.domFrag();
            frag.removeClass('mq-cursor');
            var _c = getBoundingClientRect(frag.oneElement()), left = _c.left, right = _c.right;
            frag.addClass('mq-cursor');
            return {
                left: left,
                right: right
            };
        };
        Cursor.prototype.unwrapGramp = function () {
            var gramp = this.parent.parent;
            var greatgramp = gramp.parent;
            var rightward = gramp[R];
            var cursor = this;
            var leftward = gramp[L];
            gramp.disown().eachChild(function (uncle) {
                if (uncle.isEmpty())
                    return true;
                uncle
                    .children()
                    .adopt(greatgramp, leftward, rightward)
                    .each(function (cousin) {
                    cousin.domFrag().insertBefore(gramp.domFrag());
                    return true;
                });
                leftward = uncle.getEnd(R);
                return true;
            });
            if (!this[R]) {
                //then find something to be rightward to insLeftOf
                var thisL = this[L];
                if (thisL)
                    this[R] = thisL[R];
                else {
                    while (!this[R]) {
                        var newParent = this.parent[R];
                        if (newParent) {
                            this.parent = newParent;
                            this[R] = newParent.getEnd(L);
                        }
                        else {
                            this[R] = gramp[R];
                            this.parent = greatgramp;
                            break;
                        }
                    }
                }
            }
            var thisR = this[R];
            if (thisR)
                this.insLeftOf(thisR);
            else
                this.insAtRightEnd(greatgramp);
            gramp.domFrag().remove();
            var grampL = gramp[L];
            var grampR = gramp[R];
            if (grampL)
                grampL.siblingDeleted(cursor.options, R);
            if (grampR)
                grampR.siblingDeleted(cursor.options, L);
        };
        Cursor.prototype.startSelection = function () {
            var anticursor = (this.anticursor = Anticursor.fromCursor(this));
            var ancestors = anticursor.ancestors;
            for (var ancestor = anticursor; ancestor.parent; ancestor = ancestor.parent) {
                ancestors[ancestor.parent.id] = ancestor;
            }
        };
        Cursor.prototype.endSelection = function () {
            delete this.anticursor;
        };
        Cursor.prototype.select = function () {
            var _lca;
            var anticursor = this.anticursor;
            if (this[L] === anticursor[L] && this.parent === anticursor.parent)
                return false;
            // Find the lowest common ancestor (`lca`), and the ancestor of the cursor
            // whose parent is the LCA (which'll be an end of the selection fragment).
            for (var ancestor = this; ancestor.parent; ancestor = ancestor.parent) {
                if (ancestor.parent.id in anticursor.ancestors) {
                    _lca = ancestor.parent;
                    break;
                }
            }
            pray('cursor and anticursor in the same tree', _lca);
            var lca = _lca;
            // The cursor and the anticursor should be in the same tree, because the
            // mousemove handler attached to the document, unlike the one attached to
            // the root HTML DOM element, doesn't try to get the math tree node of the
            // mousemove target, and Cursor::seek() based solely on coordinates stays
            // within the tree of `this` cursor's root.
            // The other end of the selection fragment, the ancestor of the anticursor
            // whose parent is the LCA.
            var antiAncestor = anticursor.ancestors[lca.id];
            // Now we have two either Nodes or Points, guaranteed to have a common
            // parent and guaranteed that if both are Points, they are not the same,
            // and we have to figure out which is the left end and which the right end
            // of the selection.
            var leftEnd, rightEnd, dir = R;
            // This is an extremely subtle algorithm.
            // As a special case, `ancestor` could be a Point and `antiAncestor` a Node
            // immediately to `ancestor`'s left.
            // In all other cases,
            // - both Nodes
            // - `ancestor` a Point and `antiAncestor` a Node
            // - `ancestor` a Node and `antiAncestor` a Point
            // `antiAncestor[R] === rightward[R]` for some `rightward` that is
            // `ancestor` or to its right, if and only if `antiAncestor` is to
            // the right of `ancestor`.
            if (ancestor[L] !== antiAncestor) {
                for (var rightward = ancestor; rightward; rightward = rightward[R]) {
                    if (rightward[R] === antiAncestor[R]) {
                        dir = L;
                        leftEnd = ancestor;
                        rightEnd = antiAncestor;
                        break;
                    }
                }
            }
            if (dir === R) {
                leftEnd = antiAncestor;
                rightEnd = ancestor;
            }
            // only want to select Nodes up to Points, can't select Points themselves
            if (leftEnd instanceof Point)
                leftEnd = leftEnd[R];
            if (rightEnd instanceof Point)
                rightEnd = rightEnd[L];
            this.hide().selection = lca.selectChildren(leftEnd, rightEnd);
            var insEl = this.selection.getEnd(dir);
            this.insDirOf(dir, insEl);
            this.selectionChanged();
            return true;
        };
        Cursor.prototype.resetToEnd = function (controller) {
            this.clearSelection();
            var root = controller.root;
            this[R] = 0;
            this[L] = root.getEnd(R);
            this.parent = root;
        };
        Cursor.prototype.clearSelection = function () {
            if (this.selection) {
                this.selection.clear();
                delete this.selection;
                this.selectionChanged();
            }
            return this;
        };
        Cursor.prototype.deleteSelection = function () {
            var selection = this.selection;
            if (!selection)
                return;
            this[L] = selection.getEnd(L)[L];
            this[R] = selection.getEnd(R)[R];
            selection.remove();
            this.selectionChanged();
            delete this.selection;
        };
        Cursor.prototype.replaceSelection = function () {
            var seln = this.selection;
            if (seln) {
                this[L] = seln.getEnd(L)[L];
                this[R] = seln.getEnd(R)[R];
                delete this.selection;
            }
            return seln;
        };
        Cursor.prototype.depth = function () {
            var node = this;
            var depth = 0;
            while ((node = node.parent)) {
                depth += node instanceof MathBlock ? 1 : 0;
            }
            return depth;
        };
        Cursor.prototype.isTooDeep = function (offset) {
            if (this.options.maxDepth !== undefined) {
                return this.depth() + (offset || 0) > this.options.maxDepth;
            }
            else {
                return false;
            }
        };
        // can be overridden
        Cursor.prototype.selectionChanged = function () { };
        return Cursor;
    }(Point));
    var MQSelection = /** @class */ (function (_super) {
        __extends(MQSelection, _super);
        function MQSelection(withDir, oppDir, dir) {
            var _this = _super.call(this, withDir, oppDir, dir) || this;
            _this._el = h('span', { class: 'mq-selection' });
            _this.getDOMFragFromEnds().wrapAll(_this._el);
            return _this;
        }
        MQSelection.prototype.isCleared = function () {
            return this._el === undefined;
        };
        MQSelection.prototype.domFrag = function () {
            return this.isCleared() ? this.getDOMFragFromEnds() : domFrag(this._el);
        };
        MQSelection.prototype.setEnds = function (ends) {
            pray('Selection ends are never empty', ends[L] && ends[R]);
            this.ends = ends;
        };
        MQSelection.prototype.getEnd = function (dir) {
            return this.ends[dir];
        };
        MQSelection.prototype.adopt = function (parent, leftward, rightward) {
            this.clear();
            return _super.prototype.adopt.call(this, parent, leftward, rightward);
        };
        MQSelection.prototype.clear = function () {
            // NOTE it's important here that DOMFragment::children includes all
            // child nodes (including Text nodes), and not just Element nodes.
            // This makes it more similar to the native DOM childNodes property
            // and jQuery's .collection() method than jQuery's .children() method
            var childFrag = this.getDOMFragFromEnds();
            this.domFrag().replaceWith(childFrag);
            this._el = undefined;
            return this;
        };
        MQSelection.prototype.join = function (methodName, separator) {
            if (separator === void 0) { separator = ''; }
            return this.fold('', function (fold, child) {
                return fold + separator + child[methodName]();
            });
        };
        return MQSelection;
    }(Fragment));
    var ControllerBase = /** @class */ (function () {
        function ControllerBase(root, container, options) {
            this.isMouseSelecting = false;
            this.textareaEventListeners = {};
            this.id = root.id;
            this.data = {};
            this.root = root;
            this.container = container;
            this.options = options;
            this.aria = new Aria(this.getControllerSelf());
            this.ariaLabel = 'Math Input';
            this.ariaPostLabel = '';
            root.controller = this.getControllerSelf();
            this.cursor = root.cursor = new Cursor(root, options, this.getControllerSelf());
            // TODO: stop depending on root.cursor, and rm it
        }
        ControllerBase.isControllerRoot = function (node) {
            var ctrlr = node.controller;
            return ctrlr && ctrlr.root === node;
        };
        ControllerBase.prototype.getControllerSelf = function () {
            // dance we have to do to tell this thing it's a full controller
            return this;
        };
        ControllerBase.prototype.handle = function (name, dir) {
            var _c;
            var handlers = this.options.handlers;
            var handler = (_c = this.options.handlers) === null || _c === void 0 ? void 0 : _c.fns[name];
            if (handler) {
                var APIClass = handlers === null || handlers === void 0 ? void 0 : handlers.APIClasses[this.KIND_OF_MQ];
                pray('APIClass is defined', APIClass);
                var mq = new APIClass(this); // cast to any bedcause APIClass needs the final Controller subclass.
                if (dir === L || dir === R)
                    handler(dir, mq);
                else
                    handler(mq);
            }
        };
        ControllerBase.onNotify = function (f) {
            ControllerBase.notifyees.push(f);
        };
        ControllerBase.prototype.notify = function (e) {
            for (var i = 0; i < ControllerBase.notifyees.length; i += 1) {
                ControllerBase.notifyees[i](this.cursor, e);
            }
            return this;
        };
        ControllerBase.prototype.setAriaLabel = function (ariaLabel) {
            var oldAriaLabel = this.getAriaLabel();
            if (!ariaLabel && this.editable) {
                this.ariaLabel = 'Math Input';
            }
            else {
                this.ariaLabel = ariaLabel;
            }
            // If this field doesn't have focus, update its computed mathspeak value.
            // We check for focus because updating the aria-label attribute of a focused element will cause most screen readers to announce the new value (in our case, label along with the expression's mathspeak).
            // If the field does have focus at the time, it will be updated once a blur event occurs.
            // Unless we stop using fake text inputs and emulating screen reader behavior, this is going to remain a problem.
            if (ariaLabel !== oldAriaLabel && !this.containerHasFocus()) {
                this.updateMathspeak();
            }
            return this;
        };
        ControllerBase.prototype.getAriaLabel = function () {
            if (this.ariaLabel !== 'Math Input') {
                return this.ariaLabel;
            }
            else if (this.editable) {
                return 'Math Input';
            }
            else {
                return '';
            }
        };
        ControllerBase.prototype.setAriaPostLabel = function (ariaPostLabel, timeout) {
            var _this = this;
            if (ariaPostLabel &&
                typeof ariaPostLabel === 'string' &&
                ariaPostLabel !== '') {
                if (ariaPostLabel !== this.ariaPostLabel && typeof timeout === 'number') {
                    if (this._ariaAlertTimeout)
                        clearTimeout(this._ariaAlertTimeout);
                    this._ariaAlertTimeout = setTimeout(function () {
                        if (_this.containerHasFocus()) {
                            // Voice the new label, but do not update content mathspeak to prevent double-speech.
                            _this.aria.alert(_this.root.mathspeak().trim() + ' ' + ariaPostLabel.trim());
                        }
                        else {
                            // This mathquill does not have focus, so update its mathspeak.
                            _this.updateMathspeak();
                        }
                    }, timeout);
                }
                this.ariaPostLabel = ariaPostLabel;
            }
            else {
                if (this._ariaAlertTimeout)
                    clearTimeout(this._ariaAlertTimeout);
                this.ariaPostLabel = '';
            }
            return this;
        };
        ControllerBase.prototype.getAriaPostLabel = function () {
            return this.ariaPostLabel || '';
        };
        ControllerBase.prototype.containerHasFocus = function () {
            return (document.activeElement && this.container.contains(document.activeElement));
        };
        ControllerBase.prototype.getTextarea = function () {
            var textarea = this.textarea;
            pray('textarea initialized', textarea);
            return textarea;
        };
        ControllerBase.prototype.getTextareaSpan = function () {
            var textareaSpan = this.textareaSpan;
            pray('textareaSpan initialized', textareaSpan);
            return textareaSpan;
        };
        /** Add the given event listeners on this.textarea, replacing the existing listener for that event if it exists. */
        ControllerBase.prototype.addTextareaEventListeners = function (listeners) {
            if (!this.textarea)
                return;
            for (var key_2 in listeners) {
                var event = key_2;
                this.removeTextareaEventListener(event);
                this.textarea.addEventListener(event, listeners[event]);
            }
        };
        ControllerBase.prototype.removeTextareaEventListener = function (event) {
            if (!this.textarea)
                return;
            var listener = this.textareaEventListeners[event];
            if (!listener)
                return;
            this.textarea.removeEventListener(event, listener);
        };
        // based on http://www.gh-mathspeak.com/examples/quick-tutorial/
        // and http://www.gh-mathspeak.com/examples/grammar-rules/
        ControllerBase.prototype.exportMathSpeak = function () {
            return this.root.mathspeak();
        };
        // overridden
        ControllerBase.prototype.updateMathspeak = function (_opts) { };
        ControllerBase.prototype.scrollHoriz = function () { };
        ControllerBase.prototype.selectionChanged = function () { };
        ControllerBase.prototype.setOverflowClasses = function () { };
        ControllerBase.notifyees = [];
        return ControllerBase;
    }());
    var API = {};
    var EMBEDS = {};
    var processedOptions = {
        handlers: true,
        autoCommands: true,
        quietEmptyDelimiters: true,
        autoParenthesizedFunctions: true,
        autoOperatorNames: true,
        infixOperatorNames: true,
        prefixOperatorNames: true,
        leftRightIntoCmdGoes: true,
        maxDepth: true,
        interpretTildeAsSim: true,
        disableAutoSubstitutionInSubscripts: true
    };
    var baseOptionProcessors = {};
    var Options = /** @class */ (function () {
        function Options(version) {
            this.version = version;
        }
        Options.prototype.assertJquery = function () {
            pray('Interface versions > 2 do not depend on JQuery', this.version <= 2);
            pray('JQuery is set for interface v < 3', this.jQuery);
            return this.jQuery;
        };
        return Options;
    }());
    var Progenote = /** @class */ (function () {
        function Progenote() {
        }
        return Progenote;
    }());
    /**
     * Interface Versioning (#459, #495) to allow us to virtually guarantee
     * backcompat. v0.10.x introduces it, so for now, don't completely break the
     * API for people who don't know about it, just complain with console.warn().
     *
     * The methods are shimmed in outro.js so that MQ.MathField.prototype etc can
     * be accessed.
     */
    var insistOnInterVer = function () {
        if (window.console)
            console.warn('You are using the MathQuill API without specifying an interface version, ' +
                'which will fail in v1.0.0. Easiest fix is to do the following before ' +
                'doing anything else:\n' +
                '\n' +
                '    MathQuill = MathQuill.getInterface(1);\n' +
                '    // now MathQuill.MathField() works like it used to\n' +
                '\n' +
                'See also the "`dev` branch (2014\u20132015) \u2192 v0.10.0 Migration Guide" at\n' +
                '  https://github.com/mathquill/mathquill/wiki/%60dev%60-branch-(2014%E2%80%932015)-%E2%86%92-v0.10.0-Migration-Guide');
    };
    // globally exported API object
    var MQ1;
    function MathQuill(el) {
        insistOnInterVer();
        if (!MQ1) {
            MQ1 = getInterface(1);
        }
        return MQ1(el);
    }
    MathQuill.prototype = Progenote.prototype;
    MathQuill.VERSION = 'v0.10.1';
    MathQuill.interfaceVersion = function (v) {
        // shim for #459-era interface versioning (ended with #495)
        if (v !== 1)
            throw 'Only interface version 1 supported. You specified: ' + v;
        insistOnInterVer = function () {
            if (window.console)
                console.warn('You called MathQuill.interfaceVersion(1); to specify the interface ' +
                    'version, which will fail in v1.0.0. You can fix this easily by doing ' +
                    'this before doing anything else:\n' +
                    '\n' +
                    '    MathQuill = MathQuill.getInterface(1);\n' +
                    '    // now MathQuill.MathField() works like it used to\n' +
                    '\n' +
                    'See also the "`dev` branch (2014\u20132015) \u2192 v0.10.0 Migration Guide" at\n' +
                    '  https://github.com/mathquill/mathquill/wiki/%60dev%60-branch-(2014%E2%80%932015)-%E2%86%92-v0.10.0-Migration-Guide');
        };
        insistOnInterVer();
        return MathQuill;
    };
    MathQuill.getInterface = getInterface;
    var MIN = (getInterface.MIN = 1), MAX = (getInterface.MAX = 3);
    function getInterface(v) {
        if (v !== 1 && v !== 2 && v !== 3)
            throw ('Only interface versions between ' +
                MIN +
                ' and ' +
                MAX +
                ' supported. You specified: ' +
                v);
        var version = v;
        if (version < 3) {
            var jQuery = window.jQuery;
            if (!jQuery)
                throw "MathQuill interface version ".concat(version, " requires jQuery 1.5.2+ to be loaded first");
            Options.prototype.jQuery = jQuery;
        }
        var optionProcessors = __assign(__assign({}, baseOptionProcessors), { handlers: function (handlers) { return ({
                // casting to the v3 version of this type
                fns: handlers || {},
                APIClasses: APIClasses
            }); } });
        function config(currentOptions, newOptions) {
            for (var name in newOptions) {
                if (newOptions.hasOwnProperty(name)) {
                    if (name === 'substituteKeyboardEvents' && version >= 3) {
                        throw new Error([
                            "As of interface version 3, the 'substituteKeyboardEvents'",
                            "option is no longer supported. Use 'overrideTypedText' and",
                            "'overrideKeystroke' instead."
                        ].join(' '));
                    }
                    var value = newOptions[name]; // TODO - think about typing this better
                    var processor = optionProcessors[name]; // TODO - validate option processors better
                    currentOptions[name] = processor ? processor(value) : value; // TODO - think about typing better
                }
            }
        }
        var BaseOptions = version < 3 ? Options : /** @class */ (function (_super) {
            __extends(BaseOptions, _super);
            function BaseOptions() {
                return _super !== null && _super.apply(this, arguments) || this;
            }
            return BaseOptions;
        }(Options));
        var AbstractMathQuill = /** @class */ (function (_super) {
            __extends(AbstractMathQuill, _super);
            function AbstractMathQuill(ctrlr) {
                var _this = _super.call(this) || this;
                _this.__controller = ctrlr;
                _this.__options = ctrlr.options;
                _this.id = ctrlr.id;
                _this.data = ctrlr.data;
                return _this;
            }
            AbstractMathQuill.prototype.mathquillify = function (classNames) {
                var ctrlr = this.__controller, root = ctrlr.root, el = ctrlr.container;
                ctrlr.createTextarea();
                var contents = domFrag(el).addClass(classNames).children().detach();
                var spacingBugAppend = hasSpacingBug() ? ' mq-has-spacing-bug' : '';
                root.setDOM(domFrag(h('span', {
                    class: 'mq-root-block' + spacingBugAppend,
                    'aria-hidden': true
                }))
                    .appendTo(el)
                    .oneElement());
                NodeBase.linkElementByBlockNode(root.domFrag().oneElement(), root);
                this.latex(contents.text());
                this.revert = function () {
                    ctrlr.removeMouseEventListener();
                    domFrag(el)
                        .removeClass('mq-editable-field mq-math-mode mq-text-mode')
                        .empty()
                        .append(contents);
                    return version < 3 ? this.__options.assertJquery()(el) : el;
                };
            };
            AbstractMathQuill.prototype.setAriaLabel = function (ariaLabel) {
                this.__controller.setAriaLabel(ariaLabel);
                return this;
            };
            AbstractMathQuill.prototype.getAriaLabel = function () {
                return this.__controller.getAriaLabel();
            };
            AbstractMathQuill.prototype.config = function (opts) {
                config(this.__options, opts);
                if (opts.tabindex !== undefined) {
                    this.__controller.setTabindex(opts.tabindex);
                }
                return this;
            };
            AbstractMathQuill.prototype.el = function () {
                return this.__controller.container;
            };
            AbstractMathQuill.prototype.text = function () {
                return this.__controller.exportText();
            };
            AbstractMathQuill.prototype.mathspeak = function () {
                return this.__controller.exportMathSpeak();
            };
            AbstractMathQuill.prototype.latex = function (latex) {
                if (arguments.length > 0) {
                    this.__controller.renderLatexMath(latex);
                    var cursor = this.__controller.cursor;
                    if (this.__controller.blurred)
                        cursor.hide().parent.blur(cursor);
                    return this;
                }
                return this.__controller.exportLatex();
            };
            AbstractMathQuill.prototype.selection = function (selection) {
                if (selection) {
                    this.__controller.restoreLatexSelection(selection);
                    return this;
                }
                return this.__controller.exportLatexSelection().selection;
            };
            AbstractMathQuill.prototype.domNodeToSpan = function (dom) {
                return this.__controller.domNodeToSpan(dom);
            };
            AbstractMathQuill.prototype.html = function () {
                return this.__controller.root
                    .domFrag()
                    .oneElement()
                    .innerHTML.replace(/ jQuery\d+="(?:\d+|null)"/g, '') // TODO remove when jQuery is completely gone
                    .replace(/ mathquill-(?:command|block)-id="?\d+"?/g, '')
                    .replace(/<span class="?mq-cursor( mq-blink)?"?>.?<\/span>/i, '')
                    .replace(/ mq-hasCursor|mq-hasCursor ?/, '')
                    .replace(/ class=(""|(?= |>))/g, '');
            };
            AbstractMathQuill.prototype.reflow = function () {
                this.__controller.root.postOrder(function (node) {
                    node.reflow();
                });
                return this;
            };
            AbstractMathQuill.prototype.focus = function () {
                this.__controller.getTextarea().focus();
                if (this.__controller.editable)
                    this.__controller.scrollHoriz();
                return this;
            };
            AbstractMathQuill.prototype.select = function () {
                this.__controller.selectAll();
                return this;
            };
            AbstractMathQuill.prototype.blur = function () {
                this.__controller.getTextarea().blur();
                return this;
            };
            return AbstractMathQuill;
        }(Progenote));
        var EditableField = /** @class */ (function (_super) {
            __extends(EditableField, _super);
            function EditableField() {
                return _super !== null && _super.apply(this, arguments) || this;
            }
            EditableField.prototype.mathquillify = function (classNames) {
                _super.prototype.mathquillify.call(this, classNames);
                this.__controller.editable = true;
                this.__controller.addMouseEventListener();
                this.__controller.editablesTextareaEvents();
                return this;
            };
            EditableField.prototype.clearSelection = function () {
                this.__controller.cursor.clearSelection();
                return this;
            };
            EditableField.prototype.write = function (latex) {
                this.__controller.writeLatex(latex);
                this.__controller.scrollHoriz();
                var cursor = this.__controller.cursor;
                if (this.__controller.blurred)
                    cursor.hide().parent.blur(cursor);
                return this;
            };
            EditableField.prototype.empty = function () {
                var _c;
                var root = this.__controller.root, cursor = this.__controller.cursor;
                root.setEnds((_c = {}, _c[L] = 0, _c[R] = 0, _c));
                root.domFrag().empty();
                delete cursor.selection;
                cursor.insAtRightEnd(root);
                return this;
            };
            EditableField.prototype.cmd = function (cmd) {
                var ctrlr = this.__controller.notify(undefined), cursor = ctrlr.cursor;
                if (/^\\[a-z]+$/i.test(cmd) && !cursor.isTooDeep()) {
                    cmd = cmd.slice(1);
                    var klass = LatexCmds[cmd];
                    var node;
                    if (klass) {
                        if (klass.constructor) {
                            node = new klass(cmd);
                        }
                        else {
                            node = klass(cmd);
                        }
                        if (cursor.selection)
                            node.replaces(cursor.replaceSelection());
                        node.createLeftOf(cursor.show());
                    } /* TODO: API needs better error reporting */
                    else
                        ;
                }
                else
                    cursor.parent.write(cursor, cmd);
                ctrlr.scrollHoriz();
                if (ctrlr.blurred)
                    cursor.hide().parent.blur(cursor);
                return this;
            };
            EditableField.prototype.moveToDirEnd = function (dir) {
                this.__controller
                    .notify('move')
                    .cursor.insAtDirEnd(dir, this.__controller.root);
                return this;
            };
            EditableField.prototype.moveToLeftEnd = function () {
                return this.moveToDirEnd(L);
            };
            EditableField.prototype.moveToRightEnd = function () {
                return this.moveToDirEnd(R);
            };
            EditableField.prototype.keystroke = function (keysString, evt) {
                var keys = keysString.replace(/^\s+|\s+$/g, '').split(/\s+/);
                for (var i = 0; i < keys.length; i += 1) {
                    this.__controller.keystroke(keys[i], evt);
                }
                return this;
            };
            EditableField.prototype.typedText = function (text) {
                for (var i = 0; i < text.length; i += 1)
                    this.__controller.typedText(text.charAt(i));
                return this;
            };
            // MATHCOMPILE: Enter semantics \u2014 matrix row inside a matrix,
            // \displaylines row split otherwise (src/commands/math/environments.ts).
            EditableField.prototype.insertLineBreak = function () {
                var ctrlr = this.__controller;
                insertLineBreakAtCursor(ctrlr);
                if (ctrlr.blurred)
                    ctrlr.cursor.hide().parent.blur(ctrlr.cursor);
                return this;
            };
            EditableField.prototype.dropEmbedded = function (pageX, pageY, options) {
                var clientX = pageX - getScrollX();
                var clientY = pageY - getScrollY();
                var el = document.elementFromPoint(clientX, clientY);
                this.__controller.seek(el, clientX, clientY);
                var cmd = new EmbedNode().setOptions(options);
                cmd.createLeftOf(this.__controller.cursor);
            };
            EditableField.prototype.setAriaPostLabel = function (ariaPostLabel, timeout) {
                this.__controller.setAriaPostLabel(ariaPostLabel, timeout);
                return this;
            };
            EditableField.prototype.getAriaPostLabel = function () {
                return this.__controller.getAriaPostLabel();
            };
            EditableField.prototype.clickAt = function (clientX, clientY, target) {
                target = target || document.elementFromPoint(clientX, clientY);
                var ctrlr = this.__controller, root = ctrlr.root;
                var rootElement = root.domFrag().oneElement();
                if (!rootElement.contains(target))
                    target = rootElement;
                ctrlr.seek(target, clientX, clientY);
                if (ctrlr.blurred)
                    this.focus();
                return this;
            };
            EditableField.prototype.ignoreNextMousedown = function (fn) {
                this.__controller.cursor.options.ignoreNextMousedown = fn;
                return this;
            };
            EditableField.prototype.isUserSelecting = function () {
                return this.__controller.isMouseSelecting;
            };
            return EditableField;
        }(AbstractMathQuill));
        var APIClasses = {
            AbstractMathQuill: AbstractMathQuill,
            EditableField: EditableField
        };
        pray('API.StaticMath defined', API.StaticMath);
        APIClasses.StaticMath = API.StaticMath(APIClasses);
        pray('API.MathField defined', API.MathField);
        APIClasses.MathField = API.MathField(APIClasses);
        pray('API.InnerMathField defined', API.InnerMathField);
        APIClasses.InnerMathField = API.InnerMathField(APIClasses);
        if (API.TextField) {
            APIClasses.TextField = API.TextField(APIClasses);
        }
        /**
         * Function that takes an HTML element and, if it's the root HTML element of a
         * static math or math or text field, returns an API object for it (else, null).
         *
         *   var mathfield = MQ.MathField(mathFieldSpan);
         *   assert(MQ(mathFieldSpan).id === mathfield.id);
         *   assert(MQ(mathFieldSpan).id === MQ(mathFieldSpan).id);
         *
         */
        var MQ = function (el) {
            if (!el || !el.nodeType)
                return null; // check that `el` is a HTML element, using the
            // same technique as jQuery: https://github.com/jquery/jquery/blob/679536ee4b7a92ae64a5f58d90e9cc38c001e807/src/core/init.js#L92
            var blockElement;
            var childArray = domFrag(el).children().toElementArray();
            for (var _i = 0, childArray_1 = childArray; _i < childArray_1.length; _i++) {
                var child = childArray_1[_i];
                if (child.classList.contains('mq-root-block')) {
                    blockElement = child;
                    break;
                }
            }
            var blockNode = NodeBase.getNodeOfElement(blockElement); // TODO - assumng it's a MathBlock
            var ctrlr = blockNode && blockNode.controller;
            var APIClass = ctrlr && APIClasses[ctrlr.KIND_OF_MQ];
            return ctrlr && APIClass ? new APIClass(ctrlr) : null;
        };
        MQ.L = L;
        MQ.R = R;
        MQ.config = function (opts) {
            config(BaseOptions.prototype, opts);
            return this;
        };
        MQ.registerEmbed = function (name, options) {
            if (!/^[a-z][a-z0-9]*$/i.test(name)) {
                throw 'Embed name must start with letter and be only letters and digits';
            }
            EMBEDS[name] = options;
        };
        /*
         * Export the API functions that MathQuill-ify an HTML element into API objects
         * of each class. If the element had already been MathQuill-ified but into a
         * different kind (or it's not an HTML element), return null.
         */
        MQ.StaticMath = createEntrypoint('StaticMath', APIClasses.StaticMath);
        MQ.MathField = createEntrypoint('MathField', APIClasses.MathField);
        MQ.InnerMathField = createEntrypoint('InnerMathField', APIClasses.InnerMathField);
        if (APIClasses.TextField) {
            MQ.TextField = createEntrypoint('TextField', APIClasses.TextField);
        }
        MQ.prototype = AbstractMathQuill.prototype;
        MQ.EditableField = function () {
            throw "wtf don't call me, I'm 'abstract'";
        };
        MQ.EditableField.prototype = EditableField.prototype;
        if (version < 3) {
            MQ.saneKeyboardEvents = defaultSubstituteKeyboardEvents;
        }
        function createEntrypoint(kind, APIClass) {
            pray(kind + ' is defined', APIClass);
            function mqEntrypoint(el, opts) {
                if (!el || !el.nodeType)
                    return null;
                var mq = MQ(el);
                if (mq instanceof APIClass)
                    return mq;
                var ctrlr = new Controller(new APIClass.RootBlock(), el, new BaseOptions(version));
                ctrlr.KIND_OF_MQ = kind;
                return new APIClass(ctrlr).__mathquillify(opts || {}, version);
            }
            mqEntrypoint.prototype = APIClass.prototype;
            return mqEntrypoint;
        }
        return MQ;
    }
    MathQuill.noConflict = function () {
        window.MathQuill = origMathQuill;
        return MathQuill;
    };
    var origMathQuill = window.MathQuill;
    window.MathQuill = MathQuill;
    function RootBlockMixin(_) {
        _.moveOutOf = function (dir) {
            pray('controller is defined', this.controller);
            this.controller.handle('moveOutOf', dir);
        };
        _.deleteOutOf = function (dir) {
            pray('controller is defined', this.controller);
            this.controller.handle('deleteOutOf', dir);
        };
        _.selectOutOf = function (dir) {
            pray('controller is defined', this.controller);
            this.controller.handle('selectOutOf', dir);
        };
        _.upOutOf = function () {
            pray('controller is defined', this.controller);
            this.controller.handle('upOutOf');
            return undefined;
        };
        _.downOutOf = function () {
            pray('controller is defined', this.controller);
            this.controller.handle('downOutOf');
            return undefined;
        };
        _.reflow = function () {
            pray('controller is defined', this.controller);
            this.controller.handle('reflow');
            this.controller.handle('edited');
            this.controller.handle('edit');
        };
    }
    function parseError(stream, message) {
        if (stream) {
            stream = "'" + stream + "'";
        }
        else {
            stream = 'EOF';
        }
        throw 'Parse Error: ' + message + ' at ' + stream;
    }
    var Parser = /** @class */ (function () {
        // The Parser object is a wrapper for a parser function.
        // Externally, you use one to parse a string by calling
        //   var result = SomeParser.parse('Me Me Me! Parse Me!');
        // You should never call the constructor, rather you should
        // construct your Parser from the base parsers and the
        // parser combinator methods.
        function Parser(body) {
            this._ = body;
        }
        Parser.prototype.parse = function (stream) {
            return this.skip(Parser.eof)._('' + stream, success, parseError);
            function success(_stream, result) {
                return result;
            }
        };
        // -*- primitive combinators -*- //
        Parser.prototype.or = function (alternative) {
            pray('or is passed a parser', alternative instanceof Parser);
            var self = this;
            return new Parser(function (stream, onSuccess, onFailure) {
                return self._(stream, onSuccess, failure);
                function failure(_newStream) {
                    return alternative._(stream, onSuccess, onFailure);
                }
            });
        };
        Parser.prototype.then = function (next) {
            var self = this;
            return new Parser(function (stream, onSuccess, onFailure) {
                return self._(stream, success, onFailure);
                function success(newStream, result) {
                    var nextParser = next instanceof Parser ? next : next(result);
                    pray('a parser is returned', nextParser instanceof Parser);
                    return nextParser._(newStream, onSuccess, onFailure);
                }
            });
        };
        // -*- optimized iterative combinators -*- //
        Parser.prototype.many = function () {
            var self = this;
            return new Parser(function (stream, onSuccess, _onFailure) {
                var xs = [];
                while (self._(stream, success, failure))
                    ;
                return onSuccess(stream, xs);
                function success(newStream, x) {
                    stream = newStream;
                    xs.push(x);
                    return true;
                }
                function failure() {
                    return false;
                }
            });
        };
        Parser.prototype.times = function (min, max) {
            if (arguments.length < 2)
                max = min;
            var self = this;
            return new Parser(function (stream, onSuccess, onFailure) {
                var xs = [];
                var result = true;
                var failure;
                for (var i = 0; i < min; i += 1) {
                    // TODO, this may be incorrect for parsers that return boolean
                    // (or generally, falsey) values
                    result = !!self._(stream, success, firstFailure);
                    if (!result)
                        return onFailure(stream, failure);
                }
                for (; i < max && result; i += 1) {
                    self._(stream, success, secondFailure);
                }
                return onSuccess(stream, xs);
                function success(newStream, x) {
                    xs.push(x);
                    stream = newStream;
                    return true;
                }
                function firstFailure(newStream, msg) {
                    failure = msg;
                    stream = newStream;
                    return false;
                }
                function secondFailure(_newStream, _msg) {
                    return false;
                }
            });
        };
        // -*- higher-level combinators -*- //
        Parser.prototype.result = function (res) {
            return this.then(Parser.succeed(res));
        };
        Parser.prototype.atMost = function (n) {
            return this.times(0, n);
        };
        Parser.prototype.atLeast = function (n) {
            var self = this;
            return self.times(n).then(function (start) {
                return self.many().map(function (end) {
                    return start.concat(end);
                });
            });
        };
        Parser.prototype.map = function (fn) {
            return this.then(function (result) {
                return Parser.succeed(fn(result));
            });
        };
        Parser.prototype.skip = function (two) {
            return this.then(function (result) {
                return two.result(result);
            });
        };
        // -*- primitive parsers -*- //
        Parser.string = function (str) {
            var len = str.length;
            var expected = "expected '" + str + "'";
            return new Parser(function (stream, onSuccess, onFailure) {
                var head = stream.slice(0, len);
                if (head === str) {
                    return onSuccess(stream.slice(len), head);
                }
                else {
                    return onFailure(stream, expected);
                }
            });
        };
        Parser.regex = function (re) {
            pray('regexp parser is anchored', re.toString().charAt(1) === '^');
            var expected = 'expected ' + re;
            return new Parser(function (stream, onSuccess, onFailure) {
                var match = re.exec(stream);
                if (match) {
                    var result = match[0];
                    return onSuccess(stream.slice(result.length), result);
                }
                else {
                    return onFailure(stream, expected);
                }
            });
        };
        Parser.succeed = function (result) {
            return new Parser(function (stream, onSuccess) {
                return onSuccess(stream, result);
            });
        };
        Parser.fail = function (msg) {
            return new Parser(function (stream, _, onFailure) {
                return onFailure(stream, msg);
            });
        };
        Parser.letter = Parser.regex(/^[a-z]/i);
        Parser.letters = Parser.regex(/^[a-z]*/i);
        Parser.digit = Parser.regex(/^[0-9]/);
        Parser.digits = Parser.regex(/^[0-9]*/);
        Parser.whitespace = Parser.regex(/^\s+/);
        Parser.optWhitespace = Parser.regex(/^\s*/);
        Parser.any = new Parser(function (stream, onSuccess, onFailure) {
            if (!stream)
                return onFailure(stream, 'expected any character');
            return onSuccess(stream.slice(1), stream.charAt(0));
        });
        Parser.all = new Parser(function (stream, onSuccess, _onFailure) {
            return onSuccess('', stream);
        });
        Parser.eof = new Parser(function (stream, onSuccess, onFailure) {
            if (stream)
                return onFailure(stream, 'expected EOF');
            return onSuccess(stream, stream);
        });
        return Parser;
    }());
    /** Poller that fires once every tick. */
    var EveryTick = /** @class */ (function () {
        function EveryTick() {
            this.fn = noop;
        }
        EveryTick.prototype.listen = function (fn) {
            this.fn = fn;
            clearTimeout(this.timeoutId);
            this.timeoutId = setTimeout(this.fn);
        };
        EveryTick.prototype.listenOnce = function (fn) {
            var _this = this;
            this.listen(function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                _this.clearListener();
                fn.apply(void 0, args);
            });
        };
        EveryTick.prototype.clearListener = function () {
            this.fn = noop;
            clearTimeout(this.timeoutId);
        };
        EveryTick.prototype.trigger = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            this.fn.apply(this, args);
        };
        return EveryTick;
    }());
    /*************************************************
     * Sane Keyboard Events Shim
     *
     * An abstraction layer over the raw browser browser events
     * on the textarea that hides all the nasty cross-
     * browser incompatibilities behind a uniform API.
     *
     * Design goal: This is a *HARD* internal
     * abstraction barrier. Cross-browser
     * inconsistencies are not allowed to leak through
     * and be dealt with by event handlers. All future
     * cross-browser issues that arise must be dealt
     * with here, and if necessary, the API updated.
     ************************************************/
    var saneKeyboardEvents = (function () {
        // The following [key values][1] map was compiled from the
        // [DOM3 Events appendix section on key codes][2] and
        // [a widely cited report on cross-browser tests of key codes][3],
        // except for 10: 'Enter', which I've empirically observed in Safari on iOS
        // and doesn't appear to conflict with any other known key codes.
        //
        // [1]: http://www.w3.org/TR/2012/WD-DOM-Level-3-Events-20120614/#keys-keyvalues
        // [2]: http://www.w3.org/TR/2012/WD-DOM-Level-3-Events-20120614/#fixed-virtual-key-codes
        // [3]: http://unixpapa.com/js/key.html
        var WHICH_TO_MQ_KEY_STEM = {
            8: 'Backspace',
            9: 'Tab',
            10: 'Enter', // for Safari on iOS
            13: 'Enter',
            16: 'Shift',
            17: 'Control',
            18: 'Alt',
            20: 'CapsLock',
            27: 'Esc',
            32: 'Spacebar',
            33: 'PageUp',
            34: 'PageDown',
            35: 'End',
            36: 'Home',
            37: 'Left',
            38: 'Up',
            39: 'Right',
            40: 'Down',
            45: 'Insert',
            46: 'Del',
            144: 'NumLock'
        };
        var KEY_TO_MQ_KEY_STEM = {
            ArrowRight: 'Right',
            ArrowLeft: 'Left',
            ArrowDown: 'Down',
            ArrowUp: 'Up',
            Delete: 'Del',
            Escape: 'Esc',
            ' ': 'Spacebar'
        };
        function isArrowKey(e) {
            // The keyPress event in FF reports which=0 for some reason. The new
            // .key property seems to report reasonable results, so we're using that
            switch (getMQKeyStem(e)) {
                case 'Right':
                case 'Left':
                case 'Down':
                case 'Up':
                    return true;
            }
            return false;
        }
        function isLowercaseAlphaCharacter(s) {
            return s.length === 1 && s >= 'a' && s <= 'z';
        }
        function getMQKeyStem(evt) {
            var _c;
            // Translate browser key names to MQ's internal naming system
            //
            // Ref: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values
            if (evt.key === undefined) {
                var which = evt.which || evt.keyCode;
                return WHICH_TO_MQ_KEY_STEM[which] || String.fromCharCode(which);
            }
            if (isLowercaseAlphaCharacter(evt.key))
                return evt.key.toUpperCase();
            return (_c = KEY_TO_MQ_KEY_STEM[evt.key]) !== null && _c !== void 0 ? _c : evt.key;
        }
        /** To the extent possible, create a normalized string representation
         * of the key combo (i.e., key code and modifier keys). */
        function getMQKeyName(evt) {
            var key = getMQKeyStem(evt);
            var modifiers = [];
            if (evt.ctrlKey)
                modifiers.push('Ctrl');
            if (evt.metaKey)
                modifiers.push('Meta');
            if (evt.altKey)
                modifiers.push('Alt');
            if (evt.shiftKey)
                modifiers.push('Shift');
            if (!modifiers.length)
                return key;
            // Don't append the key name if it already exists as a modifier, e.g. Ctrl-Control and Shift-Shift is nonsensical.
            if (key !== 'Alt' && key !== 'Control' && key !== 'Meta' && key !== 'Shift')
                modifiers.push(key);
            return modifiers.join('-');
        }
        return function saneKeyboardEvents(
        /** Usually the textarea associated with a MQ instance, but can be another kind of element if `substituteTextarea` was used to replace it with something else. */
        textarea, controller) {
            var keydown = null;
            var keypress = null;
            // everyTick.listen() is called after key or clipboard events to
            // say "Hey, I think something was just typed" or "pasted" etc,
            // so that at all subsequent opportune times (next event or timeout),
            // will check for expected typed or pasted text.
            // Need to check repeatedly because #135: in Safari 5.1 (at least),
            // after selecting something and then typing, the textarea is
            // incorrectly reported as selected during the input event (but not
            // subsequently).
            var everyTick = new EveryTick();
            function guardedTextareaSelect() {
                try {
                    // IE can throw an 'Incorrect Function' error if you
                    // try to select a textarea that is hidden. It seems
                    // likely that we don't really care if the selection
                    // fails to happen in this case. Why would the textarea
                    // be hidden? And who would even be able to tell?
                    if (textarea instanceof HTMLTextAreaElement)
                        textarea.select();
                }
                catch (e) { }
            }
            // -*- public methods -*- //
            function select(text) {
                // check textarea at least once/one last time before munging (so
                // no race condition if selection happens after keypress/paste but
                // before checkTextarea), then never again ('cos it's been munged)
                everyTick.trigger();
                everyTick.clearListener();
                if (textarea instanceof HTMLTextAreaElement)
                    textarea.value = text;
                if (text)
                    guardedTextareaSelect();
                shouldBeSelected = !!text;
            }
            var shouldBeSelected = false;
            // -*- helper subroutines -*- //
            // Determine whether there's a selection in the textarea.
            // This will always return false in IE < 9, which don't support
            // HTMLTextareaElement::selection{Start,End}.
            function hasSelection() {
                if (!('selectionStart' in textarea))
                    return false;
                if (!(textarea instanceof HTMLTextAreaElement))
                    return false;
                return textarea.selectionStart !== textarea.selectionEnd;
            }
            function handleKey() {
                if (controller.options && controller.options.overrideKeystroke) {
                    controller.options.overrideKeystroke(getMQKeyName(keydown), keydown);
                }
                else {
                    controller.keystroke(getMQKeyName(keydown), keydown);
                }
            }
            // -*- event handlers -*- //
            function onKeydown(e) {
                everyTick.trigger(e);
                if (e.target !== textarea)
                    return;
                keydown = e;
                keypress = null;
                if (shouldBeSelected)
                    everyTick.listenOnce(function (e) {
                        if (!(e && e.type === 'focusout')) {
                            // re-select textarea in case it's an unrecognized key that clears
                            // the selection, then never again, 'cos next thing might be blur
                            guardedTextareaSelect();
                        }
                    });
                handleKey();
            }
            function onKeypress(e) {
                everyTick.trigger(e);
                if (e.target !== textarea)
                    return;
                // call the key handler for repeated keypresses.
                // This excludes keypresses that happen directly
                // after keydown.  In that case, there will be
                // no previous keypress, so we skip it here
                if (keydown && keypress)
                    handleKey();
                keypress = e;
                // only check for typed text if this key can type text. Otherwise
                // you can end up with mathquill thinking text was typed if you
                // use the mq.keystroke('Right') command while a single character
                // is selected. Only detected in FF.
                if (!isArrowKey(e)) {
                    everyTick.listen(typedText);
                }
                else {
                    everyTick.listenOnce(maybeReselect);
                }
            }
            function onKeyup(e) {
                everyTick.trigger(e);
                if (e.target !== textarea)
                    return;
                // Handle case of no keypress event being sent
                if (!!keydown && !keypress) {
                    // only check for typed text if this key can type text. Otherwise
                    // you can end up with mathquill thinking text was typed if you
                    // use the mq.keystroke('Right') command while a single character
                    // is selected. Only detected in FF.
                    if (!isArrowKey(e)) {
                        everyTick.listen(typedText);
                    }
                    else {
                        everyTick.listenOnce(maybeReselect);
                    }
                }
            }
            function typedText() {
                // If there is a selection, the contents of the textarea couldn't
                // possibly have just been typed in.
                // This happens in browsers like Firefox and Opera that fire
                // keypress for keystrokes that are not text entry and leave the
                // selection in the textarea alone, such as Ctrl-C.
                // Note: we assume that browsers that don't support hasSelection()
                // also never fire keypress on keystrokes that are not text entry.
                // This seems reasonably safe because:
                // - all modern browsers including IE 9+ support hasSelection(),
                //   making it extremely unlikely any browser besides IE < 9 won't
                // - as far as we know IE < 9 never fires keypress on keystrokes
                //   that aren't text entry, which is only as reliable as our
                //   tests are comprehensive, but the IE < 9 way to do
                //   hasSelection() is poorly documented and is also only as
                //   reliable as our tests are comprehensive
                // If anything like #40 or #71 is reported in IE < 9, see
                // b1318e5349160b665003e36d4eedd64101ceacd8
                if (hasSelection())
                    return;
                if (!(textarea instanceof HTMLTextAreaElement))
                    return;
                var text = textarea.value;
                // In Linux and Chrome or Chrome OS, users may issue the Ctrl-Shift-U command to input a Unicode character.
                // Unfortunately, when the system is in this state, Chrome sends a keydown of "Ctrl-Shift-Unidentified" in Linux, "Ctrl-Shift-U" on Windows/Mac, or "Ctrl-Shift-Process" in the latest Chrome OS.
                // A keydown of "Unidentified" without modifiers has also been observed in some circumstanced from Chrome under ChromeOS.
                // Equally vexing is that the keyup correctly comes back as Ctrl-Shift-U.
                // Furthermore, an input event with the value "u" is still processed in Linux and Chrome OS due to the down/up mismatch.
                // The end result is that a spurious "u" is sent followed by the intended character.
                // Due to how this feature works, it's vital to completely ignore Ctrl-Shift-U no matter how the input event appears to Mathquill as clearing the textarea by mistake breaks the expected input flow.
                if (keydown &&
                    (keydown.key === 'Unidentified' ||
                        (!keydown.altKey &&
                            keydown.ctrlKey &&
                            !keydown.metaKey &&
                            keydown.shiftKey &&
                            (keydown.key === 'U' || keydown.key === 'Process'))))
                    return;
                if (text.length === 1) {
                    textarea.value = '';
                    if (controller.options && controller.options.overrideTypedText) {
                        controller.options.overrideTypedText(text);
                    }
                    else {
                        controller.typedText(text);
                    }
                } // in Firefox, keys that don't type text, just clear seln, fire keypress
                // https://github.com/mathquill/mathquill/issues/293#issuecomment-40997668
                else
                    maybeReselect(); // re-select if that's why we're here
            }
            function maybeReselect() {
                if (!(textarea instanceof HTMLTextAreaElement))
                    return;
                if (textarea.value.length > 1) {
                    guardedTextareaSelect();
                }
            }
            function onBlur() {
                keydown = null;
                keypress = null;
                everyTick.clearListener();
                if (textarea instanceof HTMLTextAreaElement)
                    textarea.value = '';
            }
            function onPaste(e) {
                var _c;
                everyTick.trigger();
                if (e.target !== textarea)
                    return;
                // browsers are dumb.
                //
                // In Linux, middle-click pasting causes onPaste to be called,
                // when the textarea is not necessarily focused.  We focus it
                // here to ensure that the pasted text actually ends up in the
                // textarea.
                //
                // It's pretty nifty that by changing focus in this handler,
                // we can change the target of the default action.  (This works
                // on keydown too, FWIW).
                //
                // And by nifty, we mean dumb (but useful sometimes).
                if (document.activeElement !== textarea) {
                    textarea.focus();
                }
                var clipboardEvent = e instanceof ClipboardEvent ? e : undefined;
                if (clipboardEvent && ((_c = controller.options) === null || _c === void 0 ? void 0 : _c.overridePaste)) {
                    var earlyReturn = controller.options.overridePaste(clipboardEvent);
                    if (earlyReturn)
                        return;
                }
                everyTick.listen(function pastedText() {
                    if (!(textarea instanceof HTMLTextAreaElement))
                        return;
                    var text = textarea.value;
                    textarea.value = '';
                    if (text)
                        controller.paste(text);
                });
            }
            function onInput(e) {
                everyTick.trigger(e);
            }
            function updateClipboardData(e) {
                if (e === null || e === void 0 ? void 0 : e.clipboardData) {
                    var selection = controller.exportLatexSelection().selection;
                    if (selection.startIndex !== selection.endIndex) {
                        var text = selection.latex.slice(selection.startIndex, selection.endIndex);
                        e.clipboardData.setData('text/plain', text);
                        e.clipboardData.setData('application/x-latex', text);
                        e.preventDefault();
                    }
                }
            }
            if (controller.KIND_OF_MQ === 'StaticMath') {
                controller.addTextareaEventListeners({
                    keydown: function (evt) {
                        var _c, _d;
                        // The name `overrideKeystroke` matches the API for editable math,
                        // but it is overriding nothing. It replaces nothing with something.
                        (_d = (_c = controller.options).overrideKeystroke) === null || _d === void 0 ? void 0 : _d.call(_c, getMQKeyName(evt), evt);
                    }
                });
                return { select: select };
            }
            if (controller.options && controller.options.disableCopyPaste) {
                controller.addTextareaEventListeners({
                    keydown: onKeydown,
                    keypress: onKeypress,
                    keyup: onKeyup,
                    focusout: onBlur,
                    copy: function (e) {
                        e.preventDefault();
                    },
                    cut: function (e) {
                        e.preventDefault();
                    },
                    paste: function (e) {
                        everyTick.trigger();
                        e.preventDefault();
                    },
                    input: onInput
                });
            }
            else {
                controller.addTextareaEventListeners({
                    keydown: onKeydown,
                    keypress: onKeypress,
                    keyup: onKeyup,
                    focusout: onBlur,
                    cut: function (evt) {
                        var _c;
                        var clipboardEvent = evt instanceof ClipboardEvent ? evt : undefined;
                        if (clipboardEvent && ((_c = controller.options) === null || _c === void 0 ? void 0 : _c.overrideCut)) {
                            var earlyReturn = controller.options.overrideCut(clipboardEvent);
                            if (earlyReturn)
                                return;
                        }
                        updateClipboardData(clipboardEvent);
                        everyTick.listenOnce(function () {
                            controller.cut();
                        });
                    },
                    copy: function (evt) {
                        var _c;
                        var clipboardEvent = evt instanceof ClipboardEvent ? evt : undefined;
                        if (clipboardEvent && ((_c = controller.options) === null || _c === void 0 ? void 0 : _c.overrideCopy)) {
                            var earlyReturn = controller.options.overrideCopy(clipboardEvent);
                            if (earlyReturn)
                                return;
                        }
                        updateClipboardData(clipboardEvent);
                    },
                    paste: onPaste,
                    input: onInput
                });
            }
            // -*- export public methods -*- //
            return { select: select };
        };
    })();
    /***********************************************
     * Export math in a human-readable text format
     * As you can see, only half-baked so far.
     **********************************************/
    var Controller_exportText = /** @class */ (function (_super) {
        __extends(Controller_exportText, _super);
        function Controller_exportText() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Controller_exportText.prototype.exportText = function () {
            return this.root.foldChildren('', function (text, child) {
                return text + child.text();
            });
        };
        return Controller_exportText;
    }(ControllerBase));
    ControllerBase.onNotify(function (cursor, e) {
        // these try to cover all ways that mathquill can be modified
        if (e === 'edit' || e === 'replace' || e === undefined) {
            var controller = cursor.controller;
            if (!controller)
                return;
            if (!controller.options.enableDigitGrouping)
                return;
            // TODO - maybe reconsider these 3 states and drop down to only 2
            //
            // blurred === false means we are focused. blurred === true or
            // blurred === undefined means we are not focused.
            if (controller.blurred !== false)
                return;
            controller.hideGroupingForEdit();
        }
    });
    var Controller_focusBlur = /** @class */ (function (_super) {
        __extends(Controller_focusBlur, _super);
        function Controller_focusBlur() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.handleTextareaFocusEditable = function () {
                var cursor = _this.cursor;
                _this.updateMathspeak();
                _this.blurred = false;
                clearTimeout(_this.blurTimeout);
                domFrag(_this.container).addClass('mq-focused');
                if (!cursor.parent)
                    cursor.insAtRightEnd(_this.root);
                if (cursor.selection) {
                    cursor.selection.domFrag().removeClass('mq-blur');
                    _this.selectionChanged(); //re-select textarea contents after tabbing away and back
                }
                else {
                    cursor.show();
                }
                _this.setOverflowClasses();
            };
            _this.handleTextareaBlurEditable = function () {
                if (_this.textareaSelectionTimeout) {
                    clearTimeout(_this.textareaSelectionTimeout);
                    _this.textareaSelectionTimeout = 0;
                }
                if (_this.options.enableDigitGrouping) {
                    clearTimeout(_this.__showGroupingTimeout);
                    _this.root.domFrag().addClass('mq-show-grouping');
                }
                _this.blurred = true;
                _this.blurTimeout = setTimeout(function () {
                    // wait for blur on window; if
                    _this.root.postOrder(function (node) {
                        node.intentionalBlur();
                    }); // none, intentional blur: #264
                    _this.cursor.clearSelection().endSelection();
                    _this.blur();
                    _this.updateMathspeak({ emptyContent: true });
                    _this.scrollHoriz();
                });
                window.addEventListener('blur', _this.handleWindowBlur);
            };
            _this.handleTextareaFocusStatic = function () {
                if (!_this.cursor.selection) {
                    _this.cursor.controller.selectAll();
                }
                _this.blurred = false;
            };
            _this.handleTextareaBlurStatic = function () {
                _this.cursor.clearSelection();
                _this.updateMathspeak({ emptyContent: true });
            };
            _this.handleWindowBlur = function () {
                // blur event also fired on window, just switching
                clearTimeout(_this.blurTimeout); // tabs/windows, not intentional blur
                if (_this.cursor.selection)
                    _this.cursor.selection.domFrag().addClass('mq-blur');
                _this.blurWithoutResettingCursor();
                _this.updateMathspeak({ emptyContent: true });
            };
            return _this;
        }
        Controller_focusBlur.prototype.hideGroupingForEdit = function () {
            var _this = this;
            clearTimeout(this.__showGroupingTimeout);
            this.root.domFrag().removeClass('mq-show-grouping');
            this.__showGroupingTimeout = setTimeout(function () {
                _this.root.domFrag().addClass('mq-show-grouping');
            }, 1000);
        };
        Controller_focusBlur.prototype.blur = function () {
            this.blurWithoutResettingCursor();
            if (this.options && this.options.resetCursorOnBlur) {
                this.cursor.resetToEnd(this);
            }
        };
        Controller_focusBlur.prototype.blurWithoutResettingCursor = function () {
            // not directly in the textarea blur handler so has to be
            this.cursor.hide().parent.blur(this.cursor); // synchronous with/in the same frame as
            domFrag(this.container).removeClass('mq-focused'); // clearing/blurring selection
            window.removeEventListener('blur', this.handleWindowBlur);
        };
        Controller_focusBlur.prototype.addEditableFocusBlurListeners = function () {
            var ctrlr = this, cursor = ctrlr.cursor;
            this.addTextareaEventListeners({
                focus: this.handleTextareaFocusEditable,
                blur: this.handleTextareaBlurEditable
            });
            ctrlr.blurred = true;
            cursor.hide().parent.blur(cursor);
            if (ctrlr.options.enableDigitGrouping) {
                ctrlr.root.domFrag().addClass('mq-show-grouping');
            }
        };
        Controller_focusBlur.prototype.addStaticFocusBlurListeners = function () {
            this.addTextareaEventListeners({
                focus: this.handleTextareaFocusStatic,
                blur: this.handleTextareaBlurStatic
            });
        };
        return Controller_focusBlur;
    }(Controller_exportText));
    /**
     * TODO: I wanted to move MathBlock::focus and blur here, it would clean
     * up lots of stuff like, TextBlock::focus is set to MathBlock::focus
     * and TextBlock::blur calls MathBlock::blur, when instead they could
     * use inheritance and super_.
     *
     * Problem is, there's lots of calls to .focus()/.blur() on nodes
     * outside Controller::focusBlurEvents(), such as .postOrder('blur') on
     * insertion, which if MathBlock::blur becomes MQNode::blur, would add the
     * 'blur' CSS class to all MQSymbol's (because .isEmpty() is true for all
     * of them).
     *
     * I'm not even sure there aren't other troublesome calls to .focus() or
     * .blur(), so this is TODO for now.
     */
    /*****************************************
     * Deals with the browser DOM events from
     * interaction with the typist.
     ****************************************/
    /**
     * Only one incremental selection may be open at a time. Track whether
     * an incremental selection is open to help enforce this invariant.
     */
    var INCREMENTAL_SELECTION_OPEN = false;
    var MQNode = /** @class */ (function (_super) {
        __extends(MQNode, _super);
        function MQNode() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MQNode.prototype.keystroke = function (key, e, ctrlr) {
            var cursor = ctrlr.cursor;
            switch (key) {
                case 'Ctrl-Shift-Backspace':
                case 'Ctrl-Backspace':
                    ctrlr.ctrlDeleteDir(L);
                    break;
                case 'Shift-Backspace':
                case 'Backspace':
                    ctrlr.backspace();
                    break;
                // Tab or Esc -> go one block right if it exists, else escape right.
                case 'Esc':
                case 'Tab':
                    ctrlr.escapeDir(R, key, e);
                    return;
                // Shift-Tab -> go one block left if it exists, else escape left.
                case 'Shift-Tab':
                case 'Shift-Esc':
                    ctrlr.escapeDir(L, key, e);
                    return;
                // End -> move to the end of the current block.
                case 'End':
                    ctrlr.notify('move').cursor.insAtRightEnd(cursor.parent);
                    ctrlr.aria.queue('end of').queue(cursor.parent, true);
                    break;
                // Ctrl-End -> move all the way to the end of the root block.
                case 'Ctrl-End':
                    ctrlr.notify('move').cursor.insAtRightEnd(ctrlr.root);
                    ctrlr.aria
                        .queue('end of')
                        .queue(ctrlr.ariaLabel)
                        .queue(ctrlr.root)
                        .queue(ctrlr.ariaPostLabel);
                    break;
                // Shift-End -> select to the end of the current block.
                case 'Shift-End':
                    ctrlr.selectToBlockEndInDir(R);
                    break;
                // Ctrl-Shift-End -> select all the way to the end of the root block.
                case 'Ctrl-Shift-End':
                    ctrlr.selectToRootEndInDir(R);
                    break;
                // Home -> move to the start of the current block.
                case 'Home':
                    ctrlr.notify('move').cursor.insAtLeftEnd(cursor.parent);
                    ctrlr.aria.queue('beginning of').queue(cursor.parent, true);
                    break;
                // Ctrl-Home -> move all the way to the start of the root block.
                case 'Ctrl-Home':
                    ctrlr.notify('move').cursor.insAtLeftEnd(ctrlr.root);
                    ctrlr.aria
                        .queue('beginning of')
                        .queue(ctrlr.ariaLabel)
                        .queue(ctrlr.root)
                        .queue(ctrlr.ariaPostLabel);
                    break;
                // Shift-Home -> select to the start of the current block.
                case 'Shift-Home':
                    ctrlr.selectToBlockEndInDir(L);
                    break;
                // Ctrl-Shift-Home -> select all the way to the start of the root block.
                case 'Ctrl-Shift-Home':
                    ctrlr.selectToRootEndInDir(L);
                    break;
                case 'Left':
                    ctrlr.moveLeft();
                    break;
                case 'Shift-Left':
                    ctrlr.selectLeft();
                    break;
                case 'Ctrl-Left':
                    break;
                case 'Right':
                    ctrlr.moveRight();
                    break;
                case 'Shift-Right':
                    ctrlr.selectRight();
                    break;
                case 'Ctrl-Right':
                    break;
                case 'Up':
                    ctrlr.moveUp();
                    break;
                case 'Down':
                    ctrlr.moveDown();
                    break;
                case 'Shift-Up':
                    ctrlr.withIncrementalSelection(function (selectDir) {
                        if (cursor[L]) {
                            while (cursor[L])
                                selectDir(L);
                        }
                        else {
                            selectDir(L);
                        }
                    });
                    break;
                case 'Shift-Down':
                    ctrlr.withIncrementalSelection(function (selectDir) {
                        if (cursor[R]) {
                            while (cursor[R])
                                selectDir(R);
                        }
                        else {
                            selectDir(R);
                        }
                    });
                    break;
                case 'Ctrl-Up':
                    break;
                case 'Ctrl-Down':
                    break;
                case 'Ctrl-Shift-Del':
                case 'Ctrl-Del':
                    ctrlr.ctrlDeleteDir(R);
                    break;
                case 'Shift-Del':
                case 'Del':
                    ctrlr.deleteForward();
                    break;
                case 'Meta-A':
                case 'Ctrl-A':
                    ctrlr.selectAll();
                    break;
                // These remaining hotkeys are only of benefit to people running screen readers.
                case 'Ctrl-Alt-Up': // speak parent block that has focus
                    if (cursor.parent.parent && cursor.parent.parent instanceof MQNode)
                        ctrlr.aria.queue(cursor.parent.parent);
                    else
                        ctrlr.aria.queue('nothing above');
                    break;
                case 'Ctrl-Alt-Down': // speak current block that has focus
                    if (cursor.parent && cursor.parent instanceof MQNode)
                        ctrlr.aria.queue(cursor.parent);
                    else
                        ctrlr.aria.queue('block is empty');
                    break;
                case 'Ctrl-Alt-Left': // speak left-adjacent block
                    if (cursor.parent.parent && cursor.parent.parent.getEnd(L)) {
                        ctrlr.aria.queue(cursor.parent.parent.getEnd(L));
                    }
                    else {
                        ctrlr.aria.queue('nothing to the left');
                    }
                    break;
                case 'Ctrl-Alt-Right': // speak right-adjacent block
                    if (cursor.parent.parent && cursor.parent.parent.getEnd(R)) {
                        ctrlr.aria.queue(cursor.parent.parent.getEnd(R));
                    }
                    else {
                        ctrlr.aria.queue('nothing to the right');
                    }
                    break;
                case 'Ctrl-Alt-Shift-Down': // speak selection
                    if (cursor.selection)
                        ctrlr.aria.queue(cursor.selection.join('mathspeak', ' ').trim() + ' selected');
                    else
                        ctrlr.aria.queue('nothing selected');
                    break;
                case 'Ctrl-Alt-=':
                case 'Ctrl-Alt-Shift-Right': // speak ARIA post label (evaluation or error)
                    if (ctrlr.ariaPostLabel.length)
                        ctrlr.aria.queue(ctrlr.ariaPostLabel);
                    else
                        ctrlr.aria.queue('no answer');
                    break;
                default:
                    return;
            }
            ctrlr.aria.alert();
            e === null || e === void 0 ? void 0 : e.preventDefault();
            ctrlr.scrollHoriz();
        };
        MQNode.prototype.moveOutOf = function (_dir, _cursor, _updown) {
            pray('overridden or never called on this node', false);
        }; // called by Controller::escapeDir, moveDir
        MQNode.prototype.moveTowards = function (_dir, _cursor, _updown) {
            pray('overridden or never called on this node', false);
        }; // called by Controller::moveDir
        MQNode.prototype.deleteOutOf = function (_dir, _cursor) {
            pray('overridden or never called on this node', false);
        }; // called by Controller::deleteDir
        MQNode.prototype.deleteTowards = function (_dir, _cursor) {
            pray('overridden or never called on this node', false);
        }; // called by Controller::deleteDir
        MQNode.prototype.unselectInto = function (_dir, _cursor) {
            pray('overridden or never called on this node', false);
        }; // called by Controller::selectDir
        MQNode.prototype.selectOutOf = function (_dir, _cursor) {
            pray('overridden or never called on this node', false);
        }; // called by Controller::selectDir
        MQNode.prototype.selectTowards = function (_dir, _cursor) {
            pray('overridden or never called on this node', false);
        }; // called by Controller::selectDir
        return MQNode;
    }(NodeBase));
    ControllerBase.onNotify(function (cursor, e) {
        if (e === 'move' || e === 'upDown')
            cursor.show().clearSelection();
    });
    baseOptionProcessors.leftRightIntoCmdGoes = function (updown) {
        if (updown && updown !== 'up' && updown !== 'down') {
            throw ('"up" or "down" required for leftRightIntoCmdGoes option, ' +
                'got "' +
                updown +
                '"');
        }
        return updown;
    };
    ControllerBase.onNotify(function (cursor, e) {
        if (e !== 'upDown')
            cursor.upDownCache = {};
    });
    ControllerBase.onNotify(function (cursor, e) {
        if (e === 'edit')
            cursor.show().deleteSelection();
    });
    ControllerBase.onNotify(function (cursor, e) {
        if (e !== 'select')
            cursor.endSelection();
    });
    var Controller_keystroke = /** @class */ (function (_super) {
        __extends(Controller_keystroke, _super);
        function Controller_keystroke() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Controller_keystroke.prototype.keystroke = function (key, evt) {
            this.cursor.parent.keystroke(key, evt, this.getControllerSelf());
        };
        Controller_keystroke.prototype.escapeDir = function (dir, _key, e) {
            prayDirection(dir);
            var cursor = this.cursor;
            // only prevent default of Tab if not in the root editable
            if (cursor.parent !== this.root)
                e === null || e === void 0 ? void 0 : e.preventDefault();
            // want to be a noop if in the root editable (in fact, Tab has an unrelated
            // default browser action if so)
            if (cursor.parent === this.root)
                return;
            cursor.clearSelection();
            cursor.parent.moveOutOf(dir, cursor);
            cursor.controller.aria.alert();
            return this.notify('move');
        };
        Controller_keystroke.prototype.moveDir = function (dir) {
            prayDirection(dir);
            var cursor = this.cursor, updown = cursor.options.leftRightIntoCmdGoes;
            var cursorDir = cursor[dir];
            if (cursor.selection) {
                cursor.insDirOf(dir, cursor.selection.getEnd(dir));
            }
            else if (cursorDir)
                cursorDir.moveTowards(dir, cursor, updown);
            else
                cursor.parent.moveOutOf(dir, cursor, updown);
            return this.notify('move');
        };
        Controller_keystroke.prototype.moveLeft = function () {
            return this.moveDir(L);
        };
        Controller_keystroke.prototype.moveRight = function () {
            return this.moveDir(R);
        };
        /**
         * moveUp and moveDown have almost identical algorithms:
         * - first check left and right, if so insAtLeft/RightEnd of them
         * - else check the parent's 'upOutOf'/'downOutOf' property:
         *   + if it's a function, call it with the cursor as the sole argument and
         *     use the return value as if it were the value of the property
         *   + if it's a Node, jump up or down into it:
         *     - if there is a cached Point in the block, insert there
         *     - else, seekHoriz within the block to the current x-coordinate (to be
         *       as close to directly above/below the current position as possible)
         *   + unless it's exactly `true`, stop bubbling
         */
        Controller_keystroke.prototype.moveUp = function () {
            return this.moveUpDown('up');
        };
        Controller_keystroke.prototype.moveDown = function () {
            return this.moveUpDown('down');
        };
        Controller_keystroke.prototype.moveUpDown = function (dir) {
            var self = this;
            var cursor = self.notify('upDown').cursor;
            var dirInto;
            var dirOutOf;
            if (dir === 'up') {
                dirInto = 'upInto';
                dirOutOf = 'upOutOf';
            }
            else {
                dirInto = 'downInto';
                dirOutOf = 'downOutOf';
            }
            var cursorL = cursor[L];
            var cursorR = cursor[R];
            var cursorR_dirInto = cursorR && cursorR[dirInto];
            var cursorL_dirInto = cursorL && cursorL[dirInto];
            if (cursorR_dirInto)
                cursor.insAtLeftEnd(cursorR_dirInto);
            else if (cursorL_dirInto)
                cursor.insAtRightEnd(cursorL_dirInto);
            else {
                cursor.parent.bubble(function (ancestor) {
                    // TODO - revist this
                    var prop = ancestor[dirOutOf];
                    if (prop) {
                        if (typeof prop === 'function')
                            prop = prop.call(ancestor, cursor); // TODO - figure out if we need to assign to prop
                        if (prop instanceof MQNode)
                            cursor.jumpUpDown(ancestor, prop);
                        if (prop !== true)
                            return false; // TODO - figure out how this can return true
                    }
                    return undefined;
                });
            }
            return self;
        };
        Controller_keystroke.prototype.deleteDir = function (dir) {
            prayDirection(dir);
            var cursor = this.cursor;
            var cursorEl = cursor[dir];
            var cursorElParent = cursor.parent.parent;
            var ctrlr = cursor.controller;
            if (cursorEl && cursorEl instanceof MQNode) {
                if (cursorEl.sides) {
                    ctrlr.aria.queue(cursorEl.parent
                        .chToCmd(cursorEl.sides[-dir].ch)
                        .mathspeak({ createdLeftOf: cursor }));
                    // generally, speak the current element if it has no blocks,
                    // but don't for text block commands as the deleteTowards method
                    // in the TextCommand class is responsible for speaking the new character under the cursor.
                }
                else if (!cursorEl.blocks && cursorEl.parent.ctrlSeq !== '\\text') {
                    ctrlr.aria.queue(cursorEl);
                }
            }
            else if (cursorElParent && cursorElParent instanceof MQNode) {
                if (cursorElParent.sides) {
                    ctrlr.aria.queue(cursorElParent.parent
                        .chToCmd(cursorElParent.sides[dir].ch)
                        .mathspeak({ createdLeftOf: cursor }));
                }
                else if (cursorElParent.blocks && cursorElParent.mathspeakTemplate) {
                    if (cursorElParent.upInto && cursorElParent.downInto) {
                        // likely a fraction, and we just backspaced over the slash
                        ctrlr.aria.queue(cursorElParent.mathspeakTemplate[1]);
                    }
                    else {
                        var mst = cursorElParent.mathspeakTemplate;
                        var textToQueue = dir === L ? mst[0] : mst[mst.length - 1];
                        ctrlr.aria.queue(textToQueue);
                    }
                }
                else {
                    ctrlr.aria.queue(cursorElParent);
                }
            }
            var hadSelection = cursor.selection;
            this.notify('edit'); // deletes selection if present
            if (!hadSelection) {
                var cursorDir = cursor[dir];
                if (cursorDir)
                    cursorDir.deleteTowards(dir, cursor);
                else
                    cursor.parent.deleteOutOf(dir, cursor);
            }
            var cursorL = cursor[L];
            var cursorR = cursor[R];
            if (cursorL.siblingDeleted)
                cursorL.siblingDeleted(cursor.options, R);
            if (cursorR.siblingDeleted)
                cursorR.siblingDeleted(cursor.options, L);
            cursor.parent.bubble(function (node) {
                node.reflow();
                return undefined;
            });
            return this;
        };
        Controller_keystroke.prototype.ctrlDeleteDir = function (dir) {
            prayDirection(dir);
            var cursor = this.cursor;
            if (!cursor[dir] || cursor.selection)
                return this.deleteDir(dir);
            this.notify('edit');
            var fragRemoved;
            if (dir === L) {
                fragRemoved = new Fragment(cursor.parent.getEnd(L), cursor[L]);
            }
            else {
                fragRemoved = new Fragment(cursor[R], cursor.parent.getEnd(R));
            }
            cursor.controller.aria.queue(fragRemoved);
            fragRemoved.remove();
            cursor.insAtDirEnd(dir, cursor.parent);
            var cursorL = cursor[L];
            var cursorR = cursor[R];
            if (cursorL)
                cursorL.siblingDeleted(cursor.options, R);
            if (cursorR)
                cursorR.siblingDeleted(cursor.options, L);
            cursor.parent.bubble(function (node) {
                node.reflow();
                return undefined;
            });
            return this;
        };
        Controller_keystroke.prototype.backspace = function () {
            return this.deleteDir(L);
        };
        Controller_keystroke.prototype.deleteForward = function () {
            return this.deleteDir(R);
        };
        /**
         * startIncrementalSelection, selectDirIncremental, and finishIncrementalSelection
         * should only be called by withIncrementalSelection because they must
         * be called in sequence.
         */
        Controller_keystroke.prototype.startIncrementalSelection = function () {
            pray("Multiple selections can't be simultaneously open", !INCREMENTAL_SELECTION_OPEN);
            INCREMENTAL_SELECTION_OPEN = true;
            this.notify('select');
            var cursor = this.cursor;
            if (!cursor.anticursor)
                cursor.startSelection();
        };
        /**
         * Update the selection model, stored in cursor, without modifying
         * selection DOM.
         *
         * startIncrementalSelection, selectDirIncremental, and finishIncrementalSelection
         * should only be called by withIncrementalSelection because they must
         * be called in sequence.
         */
        Controller_keystroke.prototype.selectDirIncremental = function (dir) {
            pray('A selection is open', INCREMENTAL_SELECTION_OPEN);
            INCREMENTAL_SELECTION_OPEN = true;
            var cursor = this.cursor, seln = cursor.selection;
            prayDirection(dir);
            var node = cursor[dir];
            if (node) {
                // "if node we're selecting towards is inside selection (hence retracting)
                // and is on the *far side* of the selection (hence is only node selected)
                // and the anticursor is *inside* that node, not just on the other side"
                if (seln &&
                    seln.getEnd(dir) === node &&
                    cursor.anticursor[-dir] !== node) {
                    node.unselectInto(dir, cursor);
                }
                else
                    node.selectTowards(dir, cursor);
            }
            else
                cursor.parent.selectOutOf(dir, cursor);
        };
        /**
         * Update selection DOM to match cursor model
         *
         * startIncrementalSelection, selectDirIncremental, and finishIncrementalSelection
         * should only be called by withIncrementalSelection because they must
         * be called in sequence.
         */
        Controller_keystroke.prototype.finishIncrementalSelection = function () {
            pray('A selection is open', INCREMENTAL_SELECTION_OPEN);
            var cursor = this.cursor;
            cursor.clearSelection();
            cursor.select() || cursor.show();
            var selection = cursor.selection;
            if (selection) {
                cursor.controller.aria
                    .clear()
                    .queue(selection.join('mathspeak', ' ').trim() + ' selected'); // clearing first because selection fires several times, and we don't want repeated speech.
            }
            INCREMENTAL_SELECTION_OPEN = false;
        };
        /**
         * Used to build a selection incrementally in a loop. Calls the passed
         * callback with a selectDir function that may be called many times,
         * and defers updating the view until the incremental selection is
         * complete
         *
         * Wraps up calling
         *
         *     this.startSelection()
         *     this.selectDirIncremental(dir) // possibly many times
         *     this.finishSelection()
         *
         * with extra error handling and invariant enforcement
         */
        Controller_keystroke.prototype.withIncrementalSelection = function (cb) {
            var _this = this;
            try {
                this.startIncrementalSelection();
                try {
                    cb(function (dir) { return _this.selectDirIncremental(dir); });
                }
                finally {
                    // Since we have started a selection, attempt to finish it even
                    // if the callback throws an error
                    this.finishIncrementalSelection();
                }
            }
            finally {
                // Mark selection as closed even if finishSelection throws an
                // error. Makes a possible error in finishSelection more
                // recoverable
                INCREMENTAL_SELECTION_OPEN = false;
            }
        };
        /**
         * Grow selection one unit in the given direction
         *
         * Note, this should not be called in a loop. To incrementally grow a
         * selection, use withIncrementalSelection
         */
        Controller_keystroke.prototype.selectDir = function (dir) {
            this.withIncrementalSelection(function (selectDir) { return selectDir(dir); });
        };
        Controller_keystroke.prototype.selectLeft = function () {
            return this.selectDir(L);
        };
        Controller_keystroke.prototype.selectRight = function () {
            return this.selectDir(R);
        };
        Controller_keystroke.prototype.selectAll = function () {
            this.notify('move');
            var cursor = this.cursor;
            cursor.insAtRightEnd(this.root);
            this.withIncrementalSelection(function (selectDir) {
                while (cursor[L])
                    selectDir(L);
            });
        };
        Controller_keystroke.prototype.selectToBlockEndInDir = function (dir) {
            var cursor = this.cursor;
            this.withIncrementalSelection(function (selectDir) {
                while (cursor[dir])
                    selectDir(dir);
            });
        };
        Controller_keystroke.prototype.selectToRootEndInDir = function (dir) {
            var _this = this;
            var cursor = this.cursor;
            this.withIncrementalSelection(function (selectDir) {
                while (cursor[dir] || cursor.parent !== _this.root) {
                    selectDir(dir);
                }
            });
        };
        return Controller_keystroke;
    }(Controller_focusBlur));
    var TempSingleCharNode = /** @class */ (function (_super) {
        __extends(TempSingleCharNode, _super);
        function TempSingleCharNode(_char) {
            return _super.call(this) || this;
        }
        return TempSingleCharNode;
    }(MQNode));
    // Parser MathBlock
    var latexMathParser = (function () {
        function commandToBlock(cmd) {
            // can also take in a Fragment
            var block = new MathBlock();
            cmd.adopt(block, 0, 0);
            return block;
        }
        function joinBlocks(blocks) {
            var firstBlock = blocks[0] || new MathBlock();
            for (var i = 1; i < blocks.length; i += 1) {
                blocks[i].children().adopt(firstBlock, firstBlock.getEnd(R), 0);
            }
            return firstBlock;
        }
        var string = Parser.string;
        var regex = Parser.regex;
        var letter = Parser.letter;
        var digit = Parser.digit;
        var any = Parser.any;
        var optWhitespace = Parser.optWhitespace;
        var succeed = Parser.succeed;
        var fail = Parser.fail;
        // Parsers yielding either MathCommands, or Fragments of MathCommands
        //   (either way, something that can be adopted by a MathBlock)
        var variable = letter.map(function (c) {
            return new Letter(c);
        });
        var number = digit.map(function (c) {
            return new Digit(c);
        });
        var symbol = regex(/^[^${}\\_^]/).map(function (c) {
            return new VanillaSymbol(c);
        });
        // MATHCOMPILE: control sequences carry an isCommand flag so the latex
        // importer can keep non-command \<char> escapes intact.
        var controlSequence = regex(/^[^\\a-eg-zA-Z]/) // hotfix #164; match MathBlock::write
            .map(function (ch) {
            return { cs: ch, isCommand: false };
        })
            .or(string('\\')
            .then(regex(/^[a-z]+/i)
            .or(regex(/^\s+/).result(' '))
            // \<char> escapes keep a distinguishing '\x' ctrlSeq so their
            // commands (e.g. \{, \|, \;) never shadow the bare char \u2014 the
            // same LatexCmds map resolves single chars via the branch above.
            .or(any.map(function (c) {
            return '\\' + c;
        })))
            .map(function (cs) {
            return { cs: cs, isCommand: true };
        }))
            .then(function (info) {
            // TODO - is Parser<MQNode> correct?
            var ctrlSeq = info.cs;
            var cmdKlass = LatexCmds[ctrlSeq];
            if (!cmdKlass && ctrlSeq.charAt(0) === '\\') {
                // '\<char>' with no dedicated escape command falls back to the
                // bare char's command (previous behavior: \% -> %, \. -> .).
                cmdKlass = LatexCmds[ctrlSeq.slice(1)];
            }
            if (cmdKlass) {
                if (cmdKlass.constructor) {
                    var actualClass = cmdKlass; // TODO - figure out how to know the difference
                    return new actualClass(ctrlSeq).parser();
                }
                else {
                    var builder = cmdKlass; // TODO - figure out how to know the difference
                    return builder(ctrlSeq).parser();
                }
            }
            else if (info.isCommand) {
                // unknown \command: degrade to a verbatim leaf so one
                // unrecognized \ctrlseq doesn't blank the whole field
                var latexName = /^[a-z]+$/i.test(ctrlSeq)
                    ? '\\' + ctrlSeq + ' '
                    : '\\' + ctrlSeq;
                return succeed(new VanillaSymbol(latexName, h.text(latexName.replace(/ $/, '')), ctrlSeq));
            }
            else {
                return fail('unknown command: \\' + ctrlSeq);
            }
        });
        var command = controlSequence.or(variable).or(number).or(symbol);
        // Parsers yielding MathBlocks
        var mathGroup = string('{')
            .then(function () {
            return mathSequence;
        })
            .skip(string('}'));
        var mathBlock = optWhitespace.then(mathGroup.or(command.map(commandToBlock)));
        var mathSequence = mathBlock.many().map(joinBlocks).skip(optWhitespace);
        var optMathBlock = string('[')
            .then(mathBlock
            .then(function (block) {
            return block.join('latex') !== ']' ? succeed(block) : fail('');
        })
            .many()
            .map(joinBlocks)
            .skip(optWhitespace))
            .skip(string(']'));
        var latexMath = mathSequence;
        latexMath.block = mathBlock;
        latexMath.optBlock = optMathBlock;
        return latexMath;
    })();
    baseOptionProcessors.maxDepth = function (depth) {
        return typeof depth === 'number' ? depth : undefined;
    };
    var Controller_latex = /** @class */ (function (_super) {
        __extends(Controller_latex, _super);
        function Controller_latex() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Controller_latex.prototype.cleanLatex = function (latex) {
            //prune unnecessary spaces
            return latex.replace(/(\\[a-z]+) (?![a-z])/gi, '$1');
        };
        Controller_latex.prototype.exportLatex = function () {
            return this.cleanLatex(this.root.latex());
        };
        Controller_latex.prototype.writeLatex = function (latex) {
            var cursor = this.notify('edit').cursor;
            cursor.parent.writeLatex(cursor, latex);
            return this;
        };
        Controller_latex.prototype.prepareCursorForRestoration = function () {
            this.cursor.clearSelection().endSelection();
            return this.notify('move').cursor;
        };
        Controller_latex.prototype.restoreLatexSelection = function (newSelection) {
            var _this = this;
            var oldSelectionInfo = this.exportLatexSelection();
            var oldSelection = oldSelectionInfo.selection;
            var oldLatex = oldSelection.latex;
            var newLatex = newSelection.latex;
            // latexs must match for the startIndex and endIndex to match up
            if (newLatex !== oldLatex)
                return;
            // nothing has changed, so there's nothing to do.
            if (newSelection.startIndex === oldSelection.startIndex &&
                newSelection.endIndex === oldSelection.endIndex)
                return;
            if (newSelection.endIndex === 0) {
                this.prepareCursorForRestoration().insAtDirEnd(L, this.root);
            }
            else if (newSelection.startIndex === newLatex.length) {
                this.prepareCursorForRestoration().insAtDirEnd(R, this.root);
            }
            else {
                // the data.startIndex and data.endIndex are values that are relative to the
                // cleaned latex. The problem is that when we traverse this tree looking for
                // the nodes in those positions we will be working on raw uncleaned latex. We need
                // to map our cleaned indices back to uncleaned indices. Then we can take another
                // pass through the tree looking for the nodes at the startIndex and endIndex
                var mappedIndices = mapFromCleanedToUncleanedIndices(oldLatex, oldSelectionInfo.ctx.uncleanedLatex, newSelection);
                var restoreInfo_1 = this.exportLatexSelection(mappedIndices).ctx.restoreInfo;
                if (newSelection.startIndex === newSelection.endIndex) {
                    if (restoreInfo_1 === null || restoreInfo_1 === void 0 ? void 0 : restoreInfo_1.cursorL) {
                        this.prepareCursorForRestoration().insRightOf(restoreInfo_1.cursorL);
                    }
                    else if (restoreInfo_1 === null || restoreInfo_1 === void 0 ? void 0 : restoreInfo_1.cursorParent) {
                        this.prepareCursorForRestoration().insAtLeftEnd(restoreInfo_1.cursorParent);
                    }
                }
                else {
                    if ((restoreInfo_1 === null || restoreInfo_1 === void 0 ? void 0 : restoreInfo_1.selectionL) && restoreInfo_1.selectionR) {
                        // TODO - should we validate this selection by verifying you can get from selectionR
                        // to selectionL by traversing leftward? That would be a quick and easy sanity check
                        // to run ahead of time to prevent messing up selection if an invalid selection is
                        // passed in. If an invalid selection is passed in we shouldn't loop infinitely but
                        // we could end up in a weird state.
                        // copied this from the selectAll routine. It does appear selecting from the
                        // right to the left is critical to this working.
                        this.prepareCursorForRestoration().insRightOf(restoreInfo_1.selectionR);
                        var root_1 = this.cursor.controller.root;
                        this.withIncrementalSelection(function (selectDir) {
                            do {
                                selectDir(L);
                                // if something goes wrong avoid an infinite loop. We should eventually
                                // reach the leftmost side.
                                if (!_this.cursor[L] && _this.cursor.parent === root_1) {
                                    break;
                                }
                            } while (_this.cursor[R] !== restoreInfo_1.selectionL);
                        });
                        // TODO - should we validate that we ended up with exactly the correct selectionL
                        // and selectionR? It might be a little late to restore the previous selection. The
                        // case I'm thinking of is maybe your startIndex and endIndex are constructed in a way
                        // that we end up expand the selection in both directions. Hopefully we'd be able to
                        // guard against that in a precheck though.
                    }
                }
            }
        };
        Controller_latex.prototype.exportLatexSelection = function (restoreInfo) {
            var ctx = {
                uncleanedLatex: '',
                uncleanedStartIndex: -1,
                uncleanedEndIndex: -1
            };
            if (restoreInfo) {
                ctx.restoreInfo = {
                    uncleanedStartIndex: restoreInfo.uncleanStartIndex,
                    uncleanedEndIndex: restoreInfo.uncleanEndIndex
                };
            }
            var selection = this.cursor.selection;
            if (selection && this.cursor.anticursor) {
                ctx.startSelectionBefore = selection.getEnd(L);
                ctx.endSelectionAfter = selection.getEnd(R);
            }
            else {
                var cursorL = this.cursor[L];
                if (cursorL) {
                    ctx.startSelectionAfter = cursorL;
                }
                else {
                    ctx.startSelectionBefore = this.cursor.parent;
                }
                var cursorR = this.cursor[R];
                if (cursorR) {
                    ctx.endSelectionBefore = cursorR;
                }
                else {
                    ctx.endSelectionAfter = this.cursor.parent;
                }
            }
            this.root.latexRecursive(ctx);
            // need to clean the latex
            var uncleanedLatex = ctx.uncleanedLatex;
            var cleanLatex = this.cleanLatex(uncleanedLatex);
            var _c = mapFromUncleanedToCleanedIndices(uncleanedLatex, cleanLatex, ctx), startIndex = _c.startIndex, endIndex = _c.endIndex;
            return {
                selection: {
                    latex: cleanLatex,
                    startIndex: startIndex,
                    endIndex: endIndex
                },
                ctx: ctx
            };
        };
        Controller_latex.prototype.domNodeToMqNode = function (dom) {
            // we can click on an element that is deeply nested past the point
            // that mathquill knows about. We need to traverse up to the first
            // node that mathquill is aware of
            while (dom) {
                // try to find the MQ Node associated with the DOM Element
                var node = NodeBase.getNodeOfElement(dom);
                if (node) {
                    var root = findControllerRoot(node);
                    if (root && root !== this.root) {
                        // Special case: if we found a node that belongs to a different root than ours, that means we're in a separate,
                        // embedded MathQuill instance. In that case, skip to that root's parent and continue.
                        dom = root.controller.container;
                    }
                    else {
                        return node;
                    }
                }
                // must be too deep, traverse up to the parent DOM Element
                dom = dom.parentElement;
            }
            return undefined;
        };
        Controller_latex.prototype.domNodeToSpan = function (dom) {
            var ctx = {
                uncleanedLatex: '',
                uncleanedStartIndex: -1,
                uncleanedEndIndex: -1
            };
            var mqNode = this.domNodeToMqNode(dom);
            if (!mqNode)
                return undefined;
            if (mqNode instanceof MathBlock) {
                // mqNode is a group; give the span of the children.
                ctx.startSelectionBefore = mqNode;
                ctx.endSelectionAfter = mqNode;
            }
            else {
                // mqNode is a child of a group; give the span containing it.
                var nodeL = mqNode[L];
                if (nodeL) {
                    ctx.startSelectionAfter = nodeL;
                }
                else {
                    ctx.startSelectionBefore = mqNode.parent;
                }
                var nodeR = mqNode[R];
                if (nodeR) {
                    ctx.endSelectionBefore = nodeR;
                }
                else {
                    ctx.endSelectionAfter = mqNode.parent;
                }
            }
            this.root.latexRecursive(ctx);
            // need to clean the latex
            var uncleanedLatex = ctx.uncleanedLatex;
            var cleanLatex = this.cleanLatex(uncleanedLatex);
            var _c = mapFromUncleanedToCleanedIndices(uncleanedLatex, cleanLatex, ctx), startIndex = _c.startIndex, endIndex = _c.endIndex;
            return {
                latex: cleanLatex,
                startIndex: startIndex,
                endIndex: endIndex
            };
        };
        Controller_latex.prototype.classifyLatexForEfficientUpdate = function (latex) {
            if (typeof latex !== 'string')
                return;
            var matches = latex.match(/-?[0-9.]+$/g);
            if (matches && matches.length === 1) {
                return {
                    latex: latex,
                    prefix: latex.substr(0, latex.length - matches[0].length),
                    digits: matches[0]
                };
            }
            return;
        };
        Controller_latex.prototype.updateLatexMathEfficiently = function (latex, oldLatex) {
            var _c, _d, _e, _f;
            // Note, benchmark/update.html is useful for measuring the
            // performance of renderLatexMathEfficiently
            var root = this.root;
            var oldClassification;
            var classification = this.classifyLatexForEfficientUpdate(latex);
            if (classification) {
                oldClassification = this.classifyLatexForEfficientUpdate(oldLatex);
                if (!oldClassification ||
                    oldClassification.prefix !== classification.prefix) {
                    return false;
                }
            }
            else {
                return false;
            }
            // check if minus sign is changing
            var oldDigits = oldClassification.digits;
            var newDigits = classification.digits;
            var oldMinusSign = false;
            var newMinusSign = false;
            if (oldDigits[0] === '-') {
                oldMinusSign = true;
                oldDigits = oldDigits.substr(1);
            }
            if (newDigits[0] === '-') {
                newMinusSign = true;
                newDigits = newDigits.substr(1);
            }
            // start at the very end
            var charNode = this.root.getEnd(R);
            var oldCharNodes = [];
            for (var i = oldDigits.length - 1; i >= 0; i--) {
                // the tree does not match what we expect
                if (!charNode || charNode.ctrlSeq !== oldDigits[i]) {
                    return false;
                }
                // the trailing digits are not just under the root. We require the root
                // to be the parent so that we can be sure we do not need a reflow to
                // grow parens.
                if (charNode.parent !== root) {
                    return false;
                }
                // push to the start. We're traversing backwards
                oldCharNodes.unshift(charNode);
                // move left one character
                charNode = charNode[L];
            }
            // remove the minus sign
            if (oldMinusSign && !newMinusSign) {
                var oldMinusNode = charNode;
                if (!oldMinusNode)
                    return false;
                if (oldMinusNode.ctrlSeq !== '-')
                    return false;
                if (oldMinusNode[R] !== oldCharNodes[0])
                    return false;
                if (oldMinusNode.parent !== root)
                    return false;
                var oldMinusNodeL = oldMinusNode[L];
                if (oldMinusNodeL && oldMinusNodeL.parent !== root)
                    return false;
                oldCharNodes[0][L] = oldMinusNode[L];
                if (root.getEnd(L) === oldMinusNode) {
                    root.setEnds((_c = {}, _c[L] = oldCharNodes[0], _c[R] = root.getEnd(R), _c));
                }
                if (oldMinusNodeL)
                    oldMinusNodeL[R] = oldCharNodes[0];
                oldMinusNode.domFrag().remove();
            }
            // add a minus sign
            if (!oldMinusSign && newMinusSign) {
                var newMinusNode = new PlusMinus('-');
                var minusSpan = document.createElement('span');
                minusSpan.textContent = '\u2212';
                newMinusNode.setDOM(minusSpan);
                var oldCharNodes0L = oldCharNodes[0][L];
                if (oldCharNodes0L)
                    oldCharNodes0L[R] = newMinusNode;
                if (root.getEnd(L) === oldCharNodes[0]) {
                    root.setEnds((_d = {}, _d[L] = newMinusNode, _d[R] = root.getEnd(R), _d));
                }
                newMinusNode.parent = root;
                newMinusNode[L] = oldCharNodes[0][L];
                newMinusNode[R] = oldCharNodes[0];
                oldCharNodes[0][L] = newMinusNode;
                newMinusNode.contactWeld(this.cursor); // decide if binary operator
                newMinusNode.domFrag().insertBefore(oldCharNodes[0].domFrag());
            }
            // update the text of the current nodes
            var commonLength = Math.min(oldDigits.length, newDigits.length);
            for (i = 0; i < commonLength; i++) {
                var newText = newDigits[i];
                charNode = oldCharNodes[i];
                if (charNode.ctrlSeq !== newText) {
                    charNode.ctrlSeq = newText;
                    charNode.domFrag().oneElement().textContent = newText;
                    charNode.mathspeakName = newText;
                }
            }
            // remove the extra digits at the end
            if (oldDigits.length > newDigits.length) {
                charNode = oldCharNodes[newDigits.length - 1];
                root.setEnds((_e = {}, _e[L] = root.getEnd(L), _e[R] = charNode, _e));
                charNode[R] = 0;
                for (i = oldDigits.length - 1; i >= commonLength; i--) {
                    oldCharNodes[i].domFrag().remove();
                }
            }
            // add new digits after the existing ones
            if (newDigits.length > oldDigits.length) {
                var frag = document.createDocumentFragment();
                for (i = commonLength; i < newDigits.length; i++) {
                    var span = document.createElement('span');
                    span.className = 'mq-digit';
                    span.textContent = newDigits[i];
                    var newNode = new Digit(newDigits[i]);
                    newNode.parent = root;
                    newNode.setDOM(span);
                    frag.appendChild(span);
                    // splice this node in
                    newNode[L] = root.getEnd(R);
                    newNode[R] = 0;
                    var newNodeL = newNode[L];
                    newNodeL[R] = newNode;
                    root.setEnds((_f = {}, _f[L] = root.getEnd(L), _f[R] = newNode, _f));
                }
                root.domFrag().oneElement().appendChild(frag);
            }
            var currentLatex = this.exportLatex();
            if (currentLatex !== latex) {
                console.warn('tried updating latex efficiently but did not work. Attempted: ' +
                    latex +
                    ' but wrote: ' +
                    currentLatex);
                return false;
            }
            var rightMost = root.getEnd(R);
            if (rightMost) {
                rightMost.fixDigitGrouping(this.cursor.options);
            }
            return true;
        };
        Controller_latex.prototype.renderLatexMathFromScratch = function (latex) {
            var _c;
            var root = this.root, cursor = this.cursor;
            var all = Parser.all;
            var eof = Parser.eof;
            var block = latexMathParser
                .skip(eof)
                .or(all.result(false))
                .parse(latex);
            root.setEnds((_c = {}, _c[L] = 0, _c[R] = 0, _c));
            if (block) {
                block.children().adopt(root, 0, 0);
            }
            if (block) {
                var frag = root.domFrag();
                frag.children().remove();
                frag.oneElement().appendChild(block.html());
                root.finalizeInsert(cursor.options, cursor);
            }
            else {
                root.domFrag().empty();
            }
        };
        Controller_latex.prototype.renderLatexMath = function (latex) {
            var cursor = this.cursor;
            var root = this.root;
            this.notify('replace');
            cursor.clearSelection();
            var oldLatex = this.exportLatex();
            if (!root.getEnd(L) || !root.getEnd(R) || oldLatex !== latex) {
                this.updateLatexMathEfficiently(latex, oldLatex) ||
                    this.renderLatexMathFromScratch(latex);
                this.updateMathspeak();
            }
            cursor.insAtRightEnd(root);
        };
        Controller_latex.prototype.renderLatexText = function (latex) {
            var _c;
            var root = this.root, cursor = this.cursor;
            root.domFrag().children().slice(1).remove();
            root.setEnds((_c = {}, _c[L] = 0, _c[R] = 0, _c));
            delete cursor.selection;
            cursor.show().insAtRightEnd(root);
            var regex = Parser.regex;
            var string = Parser.string;
            var eof = Parser.eof;
            var all = Parser.all;
            // Parser RootMathCommand
            var mathMode = string('$')
                .then(latexMathParser)
                // because TeX is insane, math mode doesn't necessarily
                // have to end.  So we allow for the case that math mode
                // continues to the end of the stream.
                .skip(string('$').or(eof))
                .map(function (block) {
                // HACK FIXME: this shouldn't have to have access to cursor
                var rootMathCommand = new RootMathCommand(cursor);
                rootMathCommand.createBlocks();
                var rootMathBlock = rootMathCommand.getEnd(L);
                block.children().adopt(rootMathBlock, 0, 0);
                return rootMathCommand;
            });
            var escapedDollar = string('\\$').result('$');
            var textChar = escapedDollar
                .or(regex(/^[^$]/))
                .map(function (ch) { return new VanillaSymbol(ch); });
            var latexText = mathMode.or(textChar).many();
            var commands = latexText
                .skip(eof)
                .or(all.result(false))
                .parse(latex);
            if (commands) {
                for (var i = 0; i < commands.length; i += 1) {
                    commands[i].adopt(root, root.getEnd(R), 0);
                }
                domFrag(root.html()).appendTo(root.domFrag().oneElement());
                root.finalizeInsert(cursor.options, cursor);
            }
        };
        return Controller_latex;
    }(Controller_keystroke));
    function mapFromUncleanedToCleanedIndices(uncleanedLatex, cleanedLatex, indices) {
        var startIndex = indices.uncleanedStartIndex;
        var endIndex = indices.uncleanedEndIndex;
        // assumes that the cleaning process will only remove space characters. We
        // run through the uncleanedLatex and cleanLatex to find differences.
        // when we find differences we see how many characters are dropped until
        // we sync back up. While detecting missing characters we decrement the
        // startIndex and endIndex if appropriate.
        for (var uncleanIdx = 0, cleanIdx = 0; uncleanIdx < indices.uncleanedEndIndex; uncleanIdx++) {
            if (uncleanedLatex[uncleanIdx] !== cleanedLatex[cleanIdx]) {
                if (uncleanIdx < indices.uncleanedStartIndex) {
                    startIndex -= 1;
                }
                endIndex -= 1;
                // do not increment j. We wan to keep looking at this same
                // cleanLatex character until we find it in the uncleanedLatex
            }
            else {
                cleanIdx += 1; //move to next cleanLatex character
            }
        }
        return {
            startIndex: startIndex,
            endIndex: endIndex
        };
    }
    function mapFromCleanedToUncleanedIndices(cleanedLatex, uncleanedLatex, indices) {
        var cleanStartIdx = indices.startIndex;
        var cleanEndIdx = indices.endIndex;
        var uncleanStartIndex = cleanStartIdx;
        var uncleanEndIndex = cleanEndIdx;
        // assumes that the cleaning process will only remove space characters. We
        // run through the uncleanedLatex moving one character every time. We compare
        // against the cleanedLatex. If the cleanedLatex matches we consume a cleanedLatex
        // character. Otherwise we continue pointing to the same cleanedLatex character until
        // it matches the uncleanedLatex. When we find mismatches we know that we need to increase
        // the startIndex and endIndex to correspond to the correct uncleaned positions.
        for (var uncleanIdx = 0, cleanIdx = 0; uncleanIdx < uncleanedLatex.length; uncleanIdx++) {
            if (uncleanedLatex[uncleanIdx] !== cleanedLatex[cleanIdx]) {
                if (cleanIdx <= cleanStartIdx) {
                    uncleanStartIndex += 1;
                }
                if (cleanIdx <= cleanEndIdx) {
                    uncleanEndIndex += 1;
                }
            }
            else {
                cleanIdx += 1;
            }
        }
        return {
            uncleanStartIndex: uncleanStartIndex,
            uncleanEndIndex: uncleanEndIndex
        };
    }
    /********************************************************
     * Deals with mouse events for clicking, drag-to-select
     *******************************************************/
    var ignoreNextMouseDownNoop = function (_el) {
        return false;
    };
    Options.prototype.ignoreNextMousedown = ignoreNextMouseDownNoop;
    var askIfShouldIgnoreMousemoveNoop = function (_evt, _el) {
        return false;
    };
    Options.prototype.askIfShouldIgnoreMousemove = askIfShouldIgnoreMousemoveNoop;
    // Whenever edits to the tree occur, in-progress selection events
    // must be invalidated and selection changes must not be applied to
    // the edited tree. cancelSelectionOnEdit takes care of this.
    var cancelSelectionOnEdit;
    (function () {
        ControllerBase.onNotify(function (cursor, e) {
            if (e === 'edit' || e === 'replace') {
                // this will be called any time ANY mathquill is edited. We only want
                // to cancel selection if the selection is happening within the mathquill
                // that dispatched the notify. Otherwise you won't be able to select any
                // mathquills while a slider is playing.
                if (cancelSelectionOnEdit && cancelSelectionOnEdit.cursor === cursor) {
                    cancelSelectionOnEdit.cb();
                }
            }
        });
    })();
    var Controller_mouse = /** @class */ (function (_super) {
        __extends(Controller_mouse, _super);
        function Controller_mouse() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.handleMouseDown = function (e) {
                var rootElement = closest(e.target, '.mq-root-block');
                var root = ((rootElement && NodeBase.getNodeOfElement(rootElement)) ||
                    NodeBase.getNodeOfElement(_this.root.domFrag().oneElement()));
                var ownerDocument = root.domFrag().firstNode().ownerDocument;
                var ctrlr = root.controller, cursor = ctrlr.cursor, blink = cursor.blink;
                var textarea = ctrlr.getTextarea();
                e.preventDefault(); // doesn't work in IE\u22648, but it's a one-line fix:
                e.target.unselectable = true; // http://jsbin.com/yagekiji/1 // TODO - no idea what this unselectable property is
                if (cursor.options.ignoreNextMousedown(e))
                    return;
                // some elements should not act like internal mathquill nodes. Tokens for instance define external
                // click / hover behaviors. So we have mathquill act like the item was never clicked. This allows
                // us to click a token without putting focus in the mathquill.
                if (closest(e.target, '.mq-ignore-mousedown')) {
                    return;
                }
                var lastMousemoveTarget = null;
                function mousemove(e) {
                    if (rootElement &&
                        cursor.options.askIfShouldIgnoreMousemove(e, rootElement))
                        return;
                    lastMousemoveTarget = e.target;
                }
                function onDocumentMouseMove(e) {
                    if (rootElement &&
                        cursor.options.askIfShouldIgnoreMousemove(e, rootElement))
                        return;
                    if (!cursor.anticursor) {
                        ctrlr.restoreLatexSelection(originalSelection);
                        cursor.startSelection();
                    }
                    ctrlr.seek(lastMousemoveTarget, e.clientX, e.clientY).cursor.select();
                    if (cursor.selection)
                        cursor.controller.aria
                            .clear()
                            .queue(cursor.selection.join('mathspeak') + ' selected')
                            .alert();
                    lastMousemoveTarget = null;
                }
                // outside rootElement, the MathQuill node corresponding to the target (if any)
                // won't be inside this root, so don't mislead Controller::seek with it
                function unbindListeners() {
                    // delete the mouse handlers now that we're not dragging anymore
                    rootElement === null || rootElement === void 0 ? void 0 : rootElement.removeEventListener('mousemove', mousemove);
                    ownerDocument === null || ownerDocument === void 0 ? void 0 : ownerDocument.removeEventListener('mousemove', onDocumentMouseMove);
                    ownerDocument === null || ownerDocument === void 0 ? void 0 : ownerDocument.removeEventListener('mouseup', onDocumentMouseUp);
                    cancelSelectionOnEdit = undefined;
                    ctrlr.isMouseSelecting = false;
                }
                function updateCursor() {
                    if (ctrlr.editable) {
                        cursor.show();
                        cursor.controller.aria.queue(cursor.parent).alert();
                    }
                }
                function onDocumentMouseUp() {
                    cursor.blink = blink;
                    if (!cursor.selection)
                        updateCursor();
                    unbindListeners();
                }
                var wasEdited;
                cancelSelectionOnEdit = {
                    cursor: cursor,
                    cb: function () {
                        // If an edit happens while the mouse is down, the existing
                        // selection is no longer valid. Clear it and unbind listeners,
                        // similar to what happens on mouseup.
                        wasEdited = true;
                        cursor.blink = blink;
                        cursor.clearSelection();
                        updateCursor();
                        unbindListeners();
                    }
                };
                if (ctrlr.blurred) {
                    //for static mathquills, we focus on mousemove
                    if (_this.editable)
                        textarea.focus();
                    // focus call may bubble to clients, who may then write to
                    // mathquill, triggering cancelSelectionOnEdit. If that happens, we
                    // don't want to stop the cursor blink or bind listeners,
                    // so return early.
                    if (wasEdited)
                        return;
                }
                cursor.blink = noop;
                ctrlr.isMouseSelecting = true;
                ctrlr
                    .seek(e.target, e.clientX, e.clientY)
                    .cursor.startSelection();
                var originalSelection = ctrlr.exportLatexSelection().selection;
                rootElement === null || rootElement === void 0 ? void 0 : rootElement.addEventListener('mousemove', mousemove);
                ownerDocument === null || ownerDocument === void 0 ? void 0 : ownerDocument.addEventListener('mousemove', onDocumentMouseMove);
                ownerDocument === null || ownerDocument === void 0 ? void 0 : ownerDocument.addEventListener('mouseup', onDocumentMouseUp);
                // listen on document not just body to not only hear about mousemove and
                // mouseup on page outside field, but even outside page, except iframes: https://github.com/mathquill/mathquill/commit/8c50028afcffcace655d8ae2049f6e02482346c5#commitcomment-6175800
            };
            return _this;
        }
        Controller_mouse.prototype.addMouseEventListener = function () {
            //drag-to-select event handling
            this.container.addEventListener('mousedown', this.handleMouseDown);
        };
        Controller_mouse.prototype.removeMouseEventListener = function () {
            this.container.removeEventListener('mousedown', this.handleMouseDown);
        };
        Controller_mouse.prototype.seek = function (targetElm, clientX, _clientY) {
            var cursor = this.notify('select').cursor;
            var node = this.domNodeToMqNode(targetElm);
            // Could not find any nodes, just use the root
            if (!node) {
                node = this.root;
            }
            // don't clear selection until after getting node from target, in case
            // target was selection span, otherwise target will have no parent and will
            // seek from root, which is less accurate (e.g. fraction)
            cursor.clearSelection().show();
            node.seek(clientX, cursor);
            this.scrollHoriz(); // before .selectFrom when mouse-selecting, so
            // always hits no-selection case in scrollHoriz and scrolls slower
            return this;
        };
        return Controller_mouse;
    }(Controller_latex));
    function findControllerRoot(node) {
        while (node) {
            if (ControllerBase.isControllerRoot(node)) {
                return node;
            }
            node = node.parent;
        }
        return undefined;
    }
    /***********************************************
     * Horizontal panning for editable fields that
     * overflow their width
     **********************************************/
    var Controller_scrollHoriz = /** @class */ (function (_super) {
        __extends(Controller_scrollHoriz, _super);
        function Controller_scrollHoriz() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Controller_scrollHoriz.prototype.setOverflowClasses = function () {
            var root = this.root.domFrag().oneElement();
            var shouldHaveOverflowRight = false;
            var shouldHaveOverflowLeft = false;
            if (!this.blurred) {
                var width = getBoundingClientRect(root).width;
                var scrollWidth = root.scrollWidth;
                var scroll = root.scrollLeft;
                shouldHaveOverflowRight = scrollWidth > width + scroll;
                shouldHaveOverflowLeft = scroll > 0;
            }
            if (root.classList.contains('mq-editing-overflow-right') !==
                shouldHaveOverflowRight)
                root.classList.toggle('mq-editing-overflow-right');
            if (root.classList.contains('mq-editing-overflow-left') !==
                shouldHaveOverflowLeft)
                root.classList.toggle('mq-editing-overflow-left');
        };
        Controller_scrollHoriz.prototype.scrollHoriz = function () {
            var _this = this;
            var cursor = this.cursor, seln = cursor.selection;
            var rootRect = getBoundingClientRect(this.root.domFrag().oneElement());
            if (cursor.domFrag().isEmpty() && !seln) {
                if (this.cancelScrollHoriz) {
                    this.cancelScrollHoriz();
                    this.cancelScrollHoriz = undefined;
                }
                var rootElt_1 = this.root.domFrag().oneElement();
                var start_1 = rootElt_1.scrollLeft;
                animate(this.getScrollAnimationDuration(), function (progress, scheduleNext, cancel) {
                    if (progress >= 1) {
                        _this.cancelScrollHoriz = undefined;
                        rootElt_1.scrollLeft = 0;
                        _this.setOverflowClasses();
                    }
                    else {
                        _this.cancelScrollHoriz = cancel;
                        scheduleNext();
                        rootElt_1.scrollLeft = Math.round((1 - progress) * start_1);
                    }
                });
                return;
            }
            else if (!seln) {
                var x = getBoundingClientRect(cursor.domFrag().oneElement()).left;
                if (x > rootRect.right - 20)
                    var scrollBy = x - (rootRect.right - 20);
                else if (x < rootRect.left + 20)
                    var scrollBy = x - (rootRect.left + 20);
                else
                    return;
            }
            else {
                var rect = getBoundingClientRect(seln.domFrag().oneElement());
                var overLeft = rect.left - (rootRect.left + 20);
                var overRight = rect.right - (rootRect.right - 20);
                if (seln.getEnd(L) === cursor[R]) {
                    if (overLeft < 0)
                        var scrollBy = overLeft;
                    else if (overRight > 0) {
                        if (rect.left - overRight < rootRect.left + 20)
                            var scrollBy = overLeft;
                        else
                            var scrollBy = overRight;
                    }
                    else
                        return;
                }
                else {
                    if (overRight > 0)
                        var scrollBy = overRight;
                    else if (overLeft < 0) {
                        if (rect.right - overLeft > rootRect.right - 20)
                            var scrollBy = overRight;
                        else
                            var scrollBy = overLeft;
                    }
                    else
                        return;
                }
            }
            var root = this.root.domFrag().oneElement();
            if (scrollBy < 0 && root.scrollLeft === 0)
                return;
            if (scrollBy > 0 && root.scrollWidth <= root.scrollLeft + rootRect.width)
                return;
            if (this.cancelScrollHoriz) {
                this.cancelScrollHoriz();
                this.cancelScrollHoriz = undefined;
            }
            var rootElt = this.root.domFrag().oneElement();
            var start = rootElt.scrollLeft;
            animate(this.getScrollAnimationDuration(), function (progress, scheduleNext, cancel) {
                if (progress >= 1) {
                    _this.cancelScrollHoriz = undefined;
                    rootElt.scrollLeft = Math.round(start + scrollBy);
                    _this.setOverflowClasses();
                }
                else {
                    _this.cancelScrollHoriz = cancel;
                    scheduleNext();
                    rootElt.scrollLeft = Math.round(start + progress * scrollBy);
                }
            });
        };
        Controller_scrollHoriz.prototype.getScrollAnimationDuration = function () {
            var _c;
            return (_c = this.options.scrollAnimationDuration) !== null && _c !== void 0 ? _c : 100;
        };
        return Controller_scrollHoriz;
    }(Controller_mouse));
    /*********************************************
     * Manage the MathQuill instance's textarea
     * (as owned by the Controller)
     ********************************************/
    Options.prototype.substituteTextarea = function () {
        return h('textarea', {
            autocapitalize: 'off',
            autocomplete: 'off',
            autocorrect: 'off',
            spellcheck: false,
            'x-palm-disable-ste-all': true
        });
    };
    /* A light-weight function to generate a UUID */
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = (Math.random() * 16) | 0;
            var v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
    function defaultSubstituteKeyboardEvents(jq, controller) {
        return saneKeyboardEvents(jq[0], controller);
    }
    Options.prototype.substituteKeyboardEvents = defaultSubstituteKeyboardEvents;
    var Controller = /** @class */ (function (_super) {
        __extends(Controller, _super);
        function Controller() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.selectFn = noop;
            return _this;
        }
        Controller.prototype.createTextarea = function () {
            this.textareaSpan = h('span', { class: 'mq-textarea' });
            var textarea = this.options.substituteTextarea();
            if (!textarea.nodeType) {
                throw 'substituteTextarea() must return a DOM element, got ' + textarea;
            }
            this.textarea = domFrag(textarea)
                .appendTo(this.textareaSpan)
                .oneElement();
            if (!this.mathspeakSpan) {
                // We want only one of these even if the textarea is replaced
                this.mathspeakId = generateUUID();
                this.mathspeakSpan = h('span', {
                    class: 'mq-mathspeak',
                    id: this.mathspeakId
                });
                domFrag(this.textareaSpan).prepend(domFrag(this.mathspeakSpan));
            }
            if (this.mathspeakId) {
                textarea === null || textarea === void 0 ? void 0 : textarea.setAttribute('aria-labelledby', this.mathspeakId);
            }
            var ctrlr = this;
            ctrlr.cursor.selectionChanged = function () {
                ctrlr.selectionChanged();
            };
            var tabindex = this.options.tabindex !== undefined
                ? this.options.tabindex
                : this.KIND_OF_MQ === 'StaticMath'
                    ? -1
                    : 0;
            this.setTabindex(tabindex);
        };
        Controller.prototype.setTabindex = function (tabindex) {
            var _c, _d, _e, _f, _g;
            if (tabindex === this.previousTabindex || !this.textarea)
                return;
            this.previousTabindex = tabindex;
            (_c = this.textarea) === null || _c === void 0 ? void 0 : _c.setAttribute('tabindex', '' + tabindex);
            if (tabindex < 0 && this.KIND_OF_MQ === 'StaticMath') {
                (_d = this.textarea) === null || _d === void 0 ? void 0 : _d.setAttribute('aria-hidden', 'true');
            }
            else {
                (_e = this.textarea) === null || _e === void 0 ? void 0 : _e.removeAttribute('aria-hidden');
            }
            if (tabindex >= 0) {
                (_f = this.mathspeakSpan) === null || _f === void 0 ? void 0 : _f.setAttribute('aria-hidden', 'true');
            }
            else {
                (_g = this.mathspeakSpan) === null || _g === void 0 ? void 0 : _g.removeAttribute('aria-hidden');
            }
        };
        Controller.prototype.selectionChanged = function () {
            var ctrlr = this;
            // throttle calls to setTextareaSelection(), because setting textarea.value
            // and/or calling textarea.select() can have anomalously bad performance:
            // https://github.com/mathquill/mathquill/issues/43#issuecomment-1399080
            //
            // Note, this timeout may be cleared by the blur handler in focusBlur.js
            if (!ctrlr.textareaSelectionTimeout) {
                ctrlr.textareaSelectionTimeout = setTimeout(function () {
                    ctrlr.setTextareaSelection();
                });
            }
        };
        Controller.prototype.setTextareaSelection = function () {
            this.textareaSelectionTimeout = 0;
            var latex = '';
            if (this.cursor.selection) {
                //cleanLatex prunes unnecessary spaces. defined in latex.js
                latex = this.cleanLatex(this.cursor.selection.join('latex'));
                if (this.options.statelessClipboard) {
                    // FIXME: like paste, only this works for math fields; should ask parent
                    latex = '$' + latex + '$';
                }
            }
            this.selectFn(latex);
        };
        /** Requires `this.textarea` to be initialized. */
        Controller.prototype.staticMathTextareaEvents = function () {
            var ctrlr = this;
            this.removeTextareaEventListener('cut');
            this.removeTextareaEventListener('paste');
            if (ctrlr.options.disableCopyPaste) {
                this.removeTextareaEventListener('copy');
            }
            else {
                this.addTextareaEventListeners({
                    copy: function () {
                        ctrlr.setTextareaSelection();
                    }
                });
            }
            this.addStaticFocusBlurListeners();
            var textarea = this.getTextarea();
            var select = saneKeyboardEvents(textarea, this).select;
            this.selectFn = select;
            var textareaSpan = this.getTextareaSpan();
            domFrag(this.container).prepend(domFrag(textareaSpan));
        };
        /** Requires `this.textarea` to be initialized. */
        Controller.prototype.editablesTextareaEvents = function () {
            var ctrlr = this;
            var textarea = ctrlr.getTextarea();
            var textareaSpan = ctrlr.getTextareaSpan();
            if (this.options.version < 3) {
                var $ = this.options.assertJquery();
                var keyboardEventsShim = this.options.substituteKeyboardEvents($(textarea), this);
                this.selectFn = function (text) {
                    keyboardEventsShim.select(text);
                };
            }
            else {
                var select = saneKeyboardEvents(textarea, this).select;
                this.selectFn = select;
            }
            domFrag(this.container).prepend(domFrag(textareaSpan));
            this.addEditableFocusBlurListeners();
            this.updateMathspeak();
        };
        Controller.prototype.unbindEditablesEvents = function () {
            var ctrlr = this;
            var textarea = ctrlr.getTextarea();
            var textareaSpan = ctrlr.getTextareaSpan();
            this.selectFn = function (text) {
                if (!(textarea instanceof HTMLTextAreaElement))
                    return;
                textarea.value = text;
                if (text)
                    textarea.select();
            };
            domFrag(textareaSpan).remove();
            this.removeTextareaEventListener('focus');
            this.removeTextareaEventListener('blur');
            ctrlr.blurred = true;
            this.removeTextareaEventListener('cut');
            this.removeTextareaEventListener('paste');
        };
        Controller.prototype.typedText = function (ch) {
            if (ch === '\n')
                return this.handle('enter');
            var cursor = this.notify(undefined).cursor;
            cursor.parent.write(cursor, ch);
            this.scrollHoriz();
        };
        Controller.prototype.cut = function () {
            var ctrlr = this, cursor = ctrlr.cursor;
            if (cursor.selection) {
                setTimeout(function () {
                    ctrlr.notify('edit'); // deletes selection if present
                    cursor.parent.bubble(function (node) {
                        node.reflow();
                        return undefined;
                    });
                    if (ctrlr.options && ctrlr.options.onCut) {
                        ctrlr.options.onCut();
                    }
                });
            }
        };
        Controller.prototype.copy = function () {
            this.setTextareaSelection();
        };
        Controller.prototype.paste = function (text) {
            // TODO: document `statelessClipboard` config option in README, after
            // making it work like it should, that is, in both text and math mode
            // (currently only works in math fields, so worse than pointless, it
            //  only gets in the way by \text{}-ifying pasted stuff and $-ifying
            //  cut/copied LaTeX)
            if (this.options.statelessClipboard) {
                if (text.slice(0, 1) === '$' && text.slice(-1) === '$') {
                    text = text.slice(1, -1);
                }
                else {
                    text = '\\text{' + text + '}';
                }
            }
            // FIXME: this always inserts math or a TextBlock, even in a RootTextBlock
            this.writeLatex(text).cursor.show();
            this.scrollHoriz();
            if (this.options && this.options.onPaste) {
                this.options.onPaste();
            }
        };
        /** Set up for a static MQ field (i.e., initialize the focus state to blurred) */
        Controller.prototype.setupStaticField = function () {
            this.updateMathspeak();
            this.blurred = true;
            this.cursor.hide().parent.blur(this.cursor);
        };
        Controller.prototype.updateMathspeak = function (opts) {
            var ctrlr = this;
            // If the controller's ARIA label doesn't end with a punctuation mark, add a colon by default to better separate it from mathspeak.
            var ariaLabel = ctrlr.getAriaLabel();
            var labelWithSuffix = /[A-Za-z0-9]$/.test(ariaLabel)
                ? ariaLabel + ':'
                : ariaLabel;
            var mathspeak = ctrlr.root.mathspeak().trim();
            var emptyContent = !!(opts === null || opts === void 0 ? void 0 : opts.emptyContent); // Set when the focused field has been blurred so alert text is removed when it's no longer needed.
            this.aria.clear({ emptyContent: emptyContent });
            if (!!ctrlr.mathspeakSpan) {
                ctrlr.mathspeakSpan.textContent = (labelWithSuffix +
                    ' ' +
                    mathspeak +
                    ' ' +
                    ctrlr.ariaPostLabel).trim();
            }
        };
        return Controller;
    }(Controller_scrollHoriz));
    /*************************************************
     * Abstract classes of math blocks and commands.
     ************************************************/
    /**
     * Math tree node base class.
     * Some math-tree-specific extensions to MQNode.
     * Both MathBlock's and MathCommand's descend from it.
     */
    var MathElement = /** @class */ (function (_super) {
        __extends(MathElement, _super);
        function MathElement() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MathElement.prototype.finalizeInsert = function (options, cursor) {
            var self = this;
            self.postOrder(function (node) {
                node.finalizeTree(options);
            });
            self.postOrder(function (node) {
                node.contactWeld(cursor);
            });
            // note: this order is important.
            // empty elements need the empty box provided by blur to
            // be present in order for their dimensions to be measured
            // correctly by 'reflow' handlers.
            self.postOrder(function (node) {
                node.blur(cursor);
            });
            self.postOrder(function (node) {
                node.reflow();
            });
            var selfR = self[R];
            var selfL = self[L];
            if (selfR)
                selfR.siblingCreated(options, L);
            if (selfL)
                selfL.siblingCreated(options, R);
            self.bubble(function (node) {
                node.reflow();
                return undefined;
            });
        };
        // If the maxDepth option is set, make sure
        // deeply nested content is truncated. Just return
        // false if the cursor is already too deep.
        MathElement.prototype.prepareInsertionAt = function (cursor) {
            var maxDepth = cursor.options.maxDepth;
            if (maxDepth !== undefined) {
                var cursorDepth = cursor.depth();
                if (cursorDepth > maxDepth) {
                    return false;
                }
                this.removeNodesDeeperThan(maxDepth - cursorDepth);
            }
            return true;
        };
        // Remove nodes that are more than `cutoff`
        // blocks deep from this node.
        MathElement.prototype.removeNodesDeeperThan = function (cutoff) {
            var depth = 0;
            var queue = [[this, depth]];
            var current;
            // Do a breadth-first search of this node's descendants
            // down to cutoff, removing anything deeper.
            while ((current = queue.shift())) {
                var c = current;
                c[0].children().each(function (child) {
                    var i = child instanceof MathBlock ? 1 : 0;
                    depth = c[1] + i;
                    if (depth <= cutoff) {
                        queue.push([child, depth]);
                    }
                    else {
                        (i ? child.children() : child).remove();
                    }
                    return undefined;
                });
            }
        };
        return MathElement;
    }(MQNode));
    var DOMView = /** @class */ (function () {
        function DOMView(childCount, render) {
            this.childCount = childCount;
            this.render = render;
        }
        return DOMView;
    }());
    /**
     * Commands and operators, like subscripts, exponents, or fractions.
     * Descendant commands are organized into blocks.
     */
    var MathCommand = /** @class */ (function (_super) {
        __extends(MathCommand, _super);
        function MathCommand(ctrlSeq, domView, textTemplate) {
            var _this = _super.call(this) || this;
            _this.textTemplate = [''];
            _this.mathspeakTemplate = [''];
            _this.setCtrlSeqHtmlAndText(ctrlSeq, domView, textTemplate);
            return _this;
        }
        MathCommand.prototype.setEnds = function (ends) {
            pray('MathCommand ends are never empty', ends[L] && ends[R]);
            this.ends = ends;
        };
        MathCommand.prototype.getEnd = function (dir) {
            return this.ends[dir];
        };
        MathCommand.prototype.setCtrlSeqHtmlAndText = function (ctrlSeq, domView, textTemplate) {
            if (!this.ctrlSeq)
                this.ctrlSeq = ctrlSeq;
            if (domView)
                this.domView = domView;
            if (textTemplate)
                this.textTemplate = textTemplate;
        };
        // obvious methods
        MathCommand.prototype.replaces = function (replacedFragment) {
            replacedFragment.disown();
            this.replacedFragment = replacedFragment;
        };
        MathCommand.prototype.isEmpty = function () {
            return this.foldChildren(true, function (isEmpty, child) {
                return isEmpty && child.isEmpty();
            });
        };
        // MATHCOMPILE: the bare block-counting parse, without the verbatim-leaf fallback
        MathCommand.prototype.strictParser = function () {
            var _this = this;
            var block = latexMathParser.block;
            return block.times(this.numBlocks()).map(function (blocks) {
                _this.blocks = blocks;
                for (var i = 0; i < blocks.length; i += 1) {
                    blocks[i].adopt(_this, _this.getEnd(R), 0);
                }
                return _this;
            });
        };
        MathCommand.prototype.parser = function () {
            var self = this;
            return this.strictParser().or(
            // MATHCOMPILE: a command missing its braces degrades to a verbatim leaf
            // instead of blanking the surrounding content \u2014 but only when
            // non-space input follows: a lone trailing \frac still fails
            Parser.regex(/^(?=\S)/).then(function () {
                return Parser.succeed(new VanillaSymbol(self.ctrlSeq + ' ', h.text(self.ctrlSeq || ''), self.ctrlSeq));
            }));
        };
        // createLeftOf(cursor) and the methods it calls
        MathCommand.prototype.createLeftOf = function (cursor) {
            var cmd = this;
            var replacedFragment = cmd.replacedFragment;
            cmd.createBlocks();
            _super.prototype.createLeftOf.call(this, cursor);
            if (replacedFragment) {
                var cmdEndsL = cmd.getEnd(L);
                replacedFragment.adopt(cmdEndsL, 0, 0);
                replacedFragment.domFrag().appendTo(cmdEndsL.domFrag().oneElement());
                cmd.placeCursor(cursor);
                cmd.prepareInsertionAt(cursor);
            }
            cmd.finalizeInsert(cursor.options, cursor);
            cmd.placeCursor(cursor);
        };
        MathCommand.prototype.createBlocks = function () {
            var cmd = this, numBlocks = cmd.numBlocks(), blocks = (cmd.blocks = Array(numBlocks));
            for (var i = 0; i < numBlocks; i += 1) {
                var newBlock = (blocks[i] = new MathBlock());
                newBlock.adopt(cmd, cmd.getEnd(R), 0);
            }
        };
        MathCommand.prototype.placeCursor = function (cursor) {
            //insert the cursor at the right end of the first empty child, searching
            //left-to-right, or if none empty, the right end child
            var el = this.foldChildren(this.getEnd(L), function (leftward, child) {
                return leftward.isEmpty() ? leftward : child;
            });
            // MATHCOMPILE: A command with no blocks (e.g. \verb, \end) has no child to land
            // the caret in \u2014 place it right of the atom instead.
            if (el)
                cursor.insAtRightEnd(el);
            else
                cursor.insRightOf(this);
        };
        // editability methods: called by the cursor for editing, cursor movements,
        // and selection of the MathQuill tree, these all take in a direction and
        // the cursor
        MathCommand.prototype.moveTowards = function (dir, cursor, updown) {
            var updownInto;
            if (updown === 'up') {
                updownInto = this.upInto;
            }
            else if (updown === 'down') {
                updownInto = this.downInto;
            }
            var el = updownInto || this.getEnd(-dir);
            cursor.insAtDirEnd(-dir, el);
            cursor.controller.aria
                .queueDirEndOf(-dir)
                .queue(cursor.parent, true);
        };
        MathCommand.prototype.deleteTowards = function (dir, cursor) {
            if (this.isEmpty())
                cursor[dir] = this.remove()[dir];
            else
                this.moveTowards(dir, cursor);
        };
        MathCommand.prototype.selectTowards = function (dir, cursor) {
            cursor[-dir] = this;
            cursor[dir] = this[dir];
        };
        MathCommand.prototype.selectChildren = function () {
            return new MQSelection(this, this);
        };
        MathCommand.prototype.unselectInto = function (dir, cursor) {
            var antiCursor = cursor.anticursor;
            var ancestor = antiCursor.ancestors[this.id];
            cursor.insAtDirEnd(-dir, ancestor);
        };
        MathCommand.prototype.seek = function (clientX, cursor) {
            function getBounds(node) {
                var _c;
                var el = node.domFrag().oneElement();
                var l = getBoundingClientRect(el).left;
                var r = l + el.offsetWidth;
                return _c = {},
                    _c[L] = l,
                    _c[R] = r,
                    _c;
            }
            var cmd = this;
            var cmdBounds = getBounds(cmd);
            if (clientX < cmdBounds[L])
                return cursor.insLeftOf(cmd);
            if (clientX > cmdBounds[R])
                return cursor.insRightOf(cmd);
            var leftLeftBound = cmdBounds[L];
            cmd.eachChild(function (block) {
                var blockBounds = getBounds(block);
                if (clientX < blockBounds[L]) {
                    // closer to this block's left bound, or the bound left of that?
                    if (clientX - leftLeftBound < blockBounds[L] - clientX) {
                        if (block[L])
                            cursor.insAtRightEnd(block[L]);
                        else
                            cursor.insLeftOf(cmd);
                    }
                    else
                        cursor.insAtLeftEnd(block);
                    return false;
                }
                else if (clientX > blockBounds[R]) {
                    if (block[R])
                        leftLeftBound = blockBounds[R];
                    // continue to next block
                    else {
                        // last (rightmost) block
                        // closer to this block's right bound, or the cmd's right bound?
                        if (cmdBounds[R] - clientX < clientX - blockBounds[R]) {
                            cursor.insRightOf(cmd);
                        }
                        else
                            cursor.insAtRightEnd(block);
                    }
                    return undefined;
                }
                else {
                    block.seek(clientX, cursor);
                    return false;
                }
            });
            return undefined;
        };
        MathCommand.prototype.numBlocks = function () {
            return this.domView.childCount;
        };
        /**
         * Render the entire math subtree rooted at this command to a DOM node. Assumes `this.domView` is defined.
         *
         * See dom.test.js for example templates and intended outputs.
         */
        MathCommand.prototype.html = function () {
            var blocks = this.blocks;
            pray('domView is defined', this.domView);
            var template = this.domView;
            var dom = template.render(blocks || []);
            this.setDOM(dom);
            NodeBase.linkElementByCmdNode(dom, this);
            return dom;
        };
        // methods to export a string representation of the math tree
        MathCommand.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            ctx.uncleanedLatex += this.ctrlSeq || '';
            this.eachChild(function (child) {
                ctx.uncleanedLatex += '{';
                var beforeLength = ctx.uncleanedLatex.length;
                child.latexRecursive(ctx);
                var afterLength = ctx.uncleanedLatex.length;
                if (beforeLength === afterLength) {
                    // nothing was written so we write a space
                    ctx.uncleanedLatex += ' ';
                }
                ctx.uncleanedLatex += '}';
            });
            this.checkCursorContextClose(ctx);
        };
        MathCommand.prototype.text = function () {
            var cmd = this, i = 0;
            return cmd.foldChildren(cmd.textTemplate[i], function (text, child) {
                i += 1;
                var child_text = child.text();
                if (text &&
                    cmd.textTemplate[i] === '(' &&
                    child_text[0] === '(' &&
                    child_text.slice(-1) === ')')
                    return text + child_text.slice(1, -1) + cmd.textTemplate[i];
                return text + child_text + (cmd.textTemplate[i] || '');
            });
        };
        MathCommand.prototype.mathspeak = function () {
            var cmd = this, i = 0;
            return cmd.foldChildren(cmd.mathspeakTemplate[i] || 'Start' + cmd.ctrlSeq + ' ', function (speech, block) {
                i += 1;
                return (speech +
                    ' ' +
                    block.mathspeak() +
                    ' ' +
                    (cmd.mathspeakTemplate[i] + ' ' || 'End' + cmd.ctrlSeq + ' '));
            });
        };
        return MathCommand;
    }(MathElement));
    /**
     * Lightweight command without blocks or children.
     */
    var MQSymbol = /** @class */ (function (_super) {
        __extends(MQSymbol, _super);
        function MQSymbol(ctrlSeq, html, text, mathspeak) {
            var _this = _super.call(this) || this;
            _this.setCtrlSeqHtmlTextAndMathspeak(ctrlSeq, html
                ? new DOMView(0, function () { return html.cloneNode(true); })
                : undefined, text, mathspeak);
            return _this;
        }
        MQSymbol.prototype.setCtrlSeqHtmlTextAndMathspeak = function (ctrlSeq, html, text, mathspeak) {
            if (!text && !!ctrlSeq) {
                text = ctrlSeq.replace(/^\\/, '');
            }
            this.mathspeakName = mathspeak || text;
            _super.prototype.setCtrlSeqHtmlAndText.call(this, ctrlSeq, html, [text || '']);
        };
        MQSymbol.prototype.parser = function () {
            return Parser.succeed(this);
        };
        MQSymbol.prototype.numBlocks = function () {
            return 0;
        };
        MQSymbol.prototype.replaces = function (replacedFragment) {
            replacedFragment.remove();
        };
        MQSymbol.prototype.createBlocks = function () { };
        MQSymbol.prototype.moveTowards = function (dir, cursor) {
            cursor.domFrag().insDirOf(dir, this.domFrag());
            cursor[-dir] = this;
            cursor[dir] = this[dir];
            cursor.controller.aria.queue(this);
        };
        MQSymbol.prototype.deleteTowards = function (dir, cursor) {
            cursor[dir] = this.remove()[dir];
        };
        MQSymbol.prototype.seek = function (clientX, cursor) {
            // insert at whichever side the click was closer to
            var el = this.domFrag().oneElement();
            var left = getBoundingClientRect(el).left;
            if (clientX - left < el.offsetWidth / 2)
                cursor.insLeftOf(this);
            else
                cursor.insRightOf(this);
            return cursor;
        };
        MQSymbol.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            ctx.uncleanedLatex += this.ctrlSeq || '';
            this.checkCursorContextClose(ctx);
        };
        MQSymbol.prototype.text = function () {
            return this.textTemplate.join('');
        };
        MQSymbol.prototype.mathspeak = function (_opts) {
            return this.mathspeakName || '';
        };
        MQSymbol.prototype.placeCursor = function () { };
        MQSymbol.prototype.isEmpty = function () {
            return true;
        };
        return MQSymbol;
    }(MathCommand));
    var VanillaSymbol = /** @class */ (function (_super) {
        __extends(VanillaSymbol, _super);
        function VanillaSymbol(ch, html, mathspeak) {
            return _super.call(this, ch, h('span', {}, [html || h.text(ch)]), undefined, mathspeak) || this;
        }
        return VanillaSymbol;
    }(MQSymbol));
    function bindVanillaSymbol(ch, htmlEntity, mathspeak) {
        return function () {
            return new VanillaSymbol(ch, htmlEntity ? h.entityText(htmlEntity) : undefined, mathspeak);
        };
    }
    var BinaryOperator = /** @class */ (function (_super) {
        __extends(BinaryOperator, _super);
        function BinaryOperator(ctrlSeq, html, text, mathspeak, treatLikeSymbol) {
            var _this = this;
            if (treatLikeSymbol) {
                _this = _super.call(this, ctrlSeq, h('span', {}, [html || h.text(ctrlSeq || '')]), undefined, mathspeak) || this;
            }
            else {
                _this = _super.call(this, ctrlSeq, h('span', { class: 'mq-binary-operator' }, html ? [html] : []), text, mathspeak) || this;
            }
            return _this;
        }
        /**
         * PlusMinus overrides this to be false when it looks like unary positive/negative.
         */
        BinaryOperator.prototype.isBinaryOperator = function () {
            return true;
        };
        return BinaryOperator;
    }(MQSymbol));
    function bindBinaryOperator(ctrlSeq, htmlEntity, text, mathspeak) {
        return function () {
            return new BinaryOperator(ctrlSeq, htmlEntity ? h.entityText(htmlEntity) : undefined, text, mathspeak);
        };
    }
    /**
     * Children and parent of MathCommand's. Basically partitions all the
     * symbols and operators that descend (in the Math DOM tree) from
     * ancestor operators.
     */
    var MathBlock = /** @class */ (function (_super) {
        __extends(MathBlock, _super);
        function MathBlock() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ariaLabel = 'block';
            return _this;
        }
        MathBlock.prototype.join = function (methodName) {
            return this.foldChildren('', function (fold, child) {
                return fold + child[methodName]();
            });
        };
        MathBlock.prototype.html = function () {
            var fragment = document.createDocumentFragment();
            this.eachChild(function (el) {
                var childHtml = el.html();
                fragment.appendChild(childHtml);
                return undefined;
            });
            return fragment;
        };
        MathBlock.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            this.eachChild(function (child) { return child.latexRecursive(ctx); });
            this.checkCursorContextClose(ctx);
        };
        MathBlock.prototype.text = function () {
            var endsL = this.getEnd(L);
            var endsR = this.getEnd(R);
            return endsL === endsR && endsL !== 0 ? endsL.text() : this.join('text');
        };
        MathBlock.prototype.mathspeak = function () {
            var tempOp = '';
            var autoOps = {};
            if (this.controller)
                autoOps = this.controller.options.autoOperatorNames;
            var speechArray = this.foldChildren([], function (speechArray, cmd) {
                if (cmd.isPartOfOperator) {
                    tempOp += cmd.mathspeak();
                }
                else {
                    if (tempOp !== '') {
                        if (autoOps._maxLength > 0) {
                            var x = autoOps[tempOp.toLowerCase()];
                            if (typeof x === 'string')
                                tempOp = x;
                        }
                        speechArray.push(tempOp + ' ');
                        tempOp = '';
                    }
                    var mathspeakText = cmd.mathspeak();
                    var cmdText = cmd.ctrlSeq;
                    if (isNaN(cmdText) && // TODO - revisit this to improve the isNumber() check
                        cmdText !== '.' &&
                        (!cmd.parent ||
                            !cmd.parent.parent ||
                            !cmd.parent.parent.isTextBlock())) {
                        mathspeakText = ' ' + mathspeakText + ' ';
                    }
                    speechArray.push(mathspeakText);
                }
                return speechArray;
            });
            if (tempOp !== '') {
                if (autoOps._maxLength > 0) {
                    var x = autoOps[tempOp.toLowerCase()];
                    if (typeof x === 'string')
                        tempOp = x;
                }
                speechArray.push(tempOp + ' ');
                tempOp = '';
            }
            return (speechArray
                .join('')
                .replace(/ +(?= )/g, '')
                // For Apple devices in particular, split out digits after a decimal point so they aren't read aloud as whole words.
                // Not doing so makes 123.456 potentially spoken as "one hundred twenty-three point four hundred fifty-six."
                // Instead, add spaces so it is spoken as "one hundred twenty-three point four five six."
                .replace(/(\.)([0-9]+)/g, function (_match, p1, p2) {
                return p1 + p2.split('').join(' ').trim();
            }));
        };
        MathBlock.prototype.keystroke = function (key, e, ctrlr) {
            if (ctrlr.options.spaceBehavesLikeTab &&
                (key === 'Spacebar' || key === 'Shift-Spacebar')) {
                e === null || e === void 0 ? void 0 : e.preventDefault();
                ctrlr.escapeDir(key === 'Shift-Spacebar' ? L : R, key, e);
                return;
            }
            return _super.prototype.keystroke.call(this, key, e, ctrlr);
        };
        // editability methods: called by the cursor for editing, cursor movements,
        // and selection of the MathQuill tree, these all take in a direction and
        // the cursor
        MathBlock.prototype.moveOutOf = function (dir, cursor, updown) {
            var updownInto;
            if (updown === 'up') {
                updownInto = this.parent.upInto;
            }
            else if (updown === 'down') {
                updownInto = this.parent.downInto;
            }
            if (!updownInto && this[dir]) {
                var otherDir = -dir;
                cursor.insAtDirEnd(otherDir, this[dir]);
                cursor.controller.aria.queueDirEndOf(otherDir).queue(cursor.parent, true);
            }
            else {
                cursor.insDirOf(dir, this.parent);
                cursor.controller.aria.queueDirOf(dir).queue(this.parent);
            }
        };
        MathBlock.prototype.selectOutOf = function (dir, cursor) {
            cursor.insDirOf(dir, this.parent);
        };
        MathBlock.prototype.deleteOutOf = function (_dir, cursor) {
            cursor.unwrapGramp();
        };
        MathBlock.prototype.seek = function (clientX, cursor) {
            var node = this.getEnd(R);
            if (!node)
                return cursor.insAtRightEnd(this);
            var el = node.domFrag().oneElement();
            var left = getBoundingClientRect(el).left;
            if (left + el.offsetWidth < clientX) {
                return cursor.insAtRightEnd(this);
            }
            var endsL = this.getEnd(L);
            if (clientX < getBoundingClientRect(endsL.domFrag().oneElement()).left)
                return cursor.insAtLeftEnd(this);
            while (clientX < getBoundingClientRect(node.domFrag().oneElement()).left)
                node = node[L];
            return node.seek(clientX, cursor);
        };
        MathBlock.prototype.chToCmd = function (ch, options) {
            var cons;
            // exclude f because it gets a dedicated command with more spacing
            if (ch.match(/^[a-eg-zA-Z]$/))
                return new Letter(ch);
            else if (/^\d$/.test(ch))
                return new Digit(ch);
            else if (options && options.typingSlashWritesDivisionSymbol && ch === '/')
                return LatexCmds['\u00f7'](ch);
            else if (options && options.typingAsteriskWritesTimesSymbol && ch === '*')
                return LatexCmds['\u00d7'](ch);
            else if (options && options.typingPercentWritesPercentOf && ch === '%')
                return LatexCmds.percentof(ch);
            else if ((cons = CharCmds[ch] || LatexCmds[ch])) {
                if (cons.constructor) {
                    return new cons(ch);
                }
                else {
                    return cons(ch);
                }
            }
            else
                return new VanillaSymbol(ch);
        };
        MathBlock.prototype.write = function (cursor, ch) {
            // `{` typed at the left end of a command's empty arg block is the
            // user writing the arg's own braces \u2014 the block already is the
            // group, so don't grow a \left\{ \right\} pair inside it. `}` at the
            // right end closes the arg: hop to the next arg block or out of the
            // command. (Bracket blocks keep the pair/close behavior, and `{`/`}`
            // elsewhere keep making real braces.)
            var owner = this.parent;
            if (owner instanceof MathCommand && !(owner instanceof Bracket)) {
                if (ch === '{' && this.isEmpty() && !cursor[L] && !cursor.selection) {
                    return;
                }
                if (ch === '}' && !cursor[R] && !cursor.selection) {
                    if (owner instanceof SupSub || !this[R]) {
                        cursor.insRightOf(owner);
                    }
                    else {
                        cursor.insAtLeftEnd(this[R]);
                    }
                    return;
                }
            }
            var cmd = this.chToCmd(ch, cursor.options);
            if (cursor.selection)
                cmd.replaces(cursor.replaceSelection());
            if (!cursor.isTooDeep()) {
                cmd.createLeftOf(cursor.show());
                // special-case the slash so that fractions are voiced while typing
                if (ch === '/') {
                    cursor.controller.aria.alert('over');
                }
                else {
                    cursor.controller.aria.alert(cmd.mathspeak({ createdLeftOf: cursor }));
                }
            }
        };
        MathBlock.prototype.writeLatex = function (cursor, latex) {
            var all = Parser.all;
            var eof = Parser.eof;
            var block = latexMathParser
                .skip(eof)
                .or(all.result(false))
                .parse(latex);
            if (block && !block.isEmpty() && block.prepareInsertionAt(cursor)) {
                block
                    .children()
                    .adopt(cursor.parent, cursor[L], cursor[R]); // TODO - masking undefined. should be 0
                domFrag(block.html()).insertBefore(cursor.domFrag());
                cursor[L] = block.getEnd(R);
                block.finalizeInsert(cursor.options, cursor);
                var blockEndsR = block.getEnd(R);
                var blockEndsL = block.getEnd(L);
                var blockEndsRR = blockEndsR[R];
                var blockEndsLL = blockEndsL[L];
                if (blockEndsRR)
                    blockEndsRR.siblingCreated(cursor.options, L);
                if (blockEndsLL)
                    blockEndsLL.siblingCreated(cursor.options, R);
                cursor.parent.bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
            }
        };
        MathBlock.prototype.focus = function () {
            this.domFrag().addClass('mq-hasCursor');
            this.domFrag().removeClass('mq-empty');
            return this;
        };
        MathBlock.prototype.blur = function (cursor) {
            this.domFrag().removeClass('mq-hasCursor');
            if (this.isEmpty()) {
                this.domFrag().addClass('mq-empty');
                if (cursor &&
                    this.isQuietEmptyDelimiter(cursor.options.quietEmptyDelimiters)) {
                    this.domFrag().addClass('mq-quiet-delimiter');
                }
            }
            return this;
        };
        return MathBlock;
    }(MathElement));
    Options.prototype.mouseEvents = true;
    API.StaticMath = function (APIClasses) {
        var _c;
        return _c = /** @class */ (function (_super) {
                __extends(StaticMath, _super);
                function StaticMath(el) {
                    var _this = _super.call(this, el) || this;
                    var innerFields = (_this.innerFields = []);
                    _this.__controller.root.postOrder(function (node) {
                        node.registerInnerField(innerFields, APIClasses.InnerMathField);
                    });
                    return _this;
                }
                StaticMath.prototype.__mathquillify = function (opts, _interfaceVersion) {
                    this.config(opts);
                    // `mathquillify` calls `createTextarea`
                    _super.prototype.mathquillify.call(this, 'mq-math-mode');
                    if (this.__options.enableDigitGrouping) {
                        this.__controller.root.domFrag().addClass('mq-show-grouping');
                    }
                    this.__controller.setupStaticField();
                    if (this.__options.mouseEvents) {
                        this.__controller.addMouseEventListener();
                    }
                    // The textarea is initialized (`createTextarea` called) by this point.
                    this.__controller.staticMathTextareaEvents();
                    return this;
                };
                StaticMath.prototype.latex = function (_latex) {
                    var returned = _super.prototype.latex.apply(this, arguments);
                    if (arguments.length > 0) {
                        var innerFields = (this.innerFields = []);
                        this.__controller.root.postOrder(function (node) {
                            node.registerInnerField(innerFields, APIClasses.InnerMathField);
                        });
                        // Force an ARIA label update to remain in sync with the new LaTeX value.
                        this.__controller.updateMathspeak();
                    }
                    return returned;
                };
                StaticMath.prototype.setAriaLabel = function (ariaLabel) {
                    this.__controller.setAriaLabel(ariaLabel);
                    return this;
                };
                StaticMath.prototype.getAriaLabel = function () {
                    return this.__controller.getAriaLabel();
                };
                return StaticMath;
            }(APIClasses.AbstractMathQuill)),
            _c.RootBlock = MathBlock,
            _c;
    };
    var RootMathBlock = /** @class */ (function (_super) {
        __extends(RootMathBlock, _super);
        function RootMathBlock() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return RootMathBlock;
    }(MathBlock));
    RootBlockMixin(RootMathBlock.prototype); // adds methods to RootMathBlock
    API.MathField = function (APIClasses) {
        var _c;
        return _c = /** @class */ (function (_super) {
                __extends(MathField, _super);
                function MathField() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                MathField.prototype.__mathquillify = function (opts, interfaceVersion) {
                    this.config(opts);
                    if (interfaceVersion > 1)
                        this.__controller.root.reflow = noop;
                    _super.prototype.mathquillify.call(this, 'mq-editable-field mq-math-mode');
                    // TODO: Why does this need to be deleted (contrary to the type definition)? Could we set it to `noop` instead?
                    delete this.__controller.root.reflow;
                    return this;
                };
                return MathField;
            }(APIClasses.EditableField)),
            _c.RootBlock = RootMathBlock,
            _c;
    };
    API.InnerMathField = function (APIClasses) {
        pray('MathField class is defined', APIClasses.MathField);
        return /** @class */ (function (_super) {
            __extends(class_1, _super);
            function class_1() {
                return _super !== null && _super.apply(this, arguments) || this;
            }
            class_1.prototype.makeStatic = function () {
                this.__controller.editable = false;
                this.__controller.root.blur();
                this.__controller.unbindEditablesEvents();
                domFrag(this.__controller.container).removeClass('mq-editable-field');
            };
            class_1.prototype.makeEditable = function () {
                this.__controller.editable = true;
                this.__controller.editablesTextareaEvents();
                this.__controller.cursor.insAtRightEnd(this.__controller.root);
                domFrag(this.__controller.container).addClass('mq-editable-field');
            };
            return class_1;
        }(APIClasses.MathField));
    };
    /*********************************
     * Symbols for Basic Mathematics
     ********************************/
    var SPACE = '\\ ';
    var DOT = '.';
    var DigitGroupingChar = /** @class */ (function (_super) {
        __extends(DigitGroupingChar, _super);
        function DigitGroupingChar() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        DigitGroupingChar.prototype.finalizeTree = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        DigitGroupingChar.prototype.siblingDeleted = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        DigitGroupingChar.prototype.siblingCreated = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        DigitGroupingChar.prototype.sharedSiblingMethod = function (opts, dir) {
            // don't try to fix digit grouping if the sibling to my right changed (dir === R or
            // undefined) and it's now a DigitGroupingChar, it will try to fix grouping
            if (dir !== L && this[R] instanceof DigitGroupingChar)
                return;
            this.fixDigitGrouping(opts);
        };
        DigitGroupingChar.prototype.fixDigitGrouping = function (opts) {
            if (!opts.enableDigitGrouping)
                return;
            // `this` is a digit 0-9, or a SPACE, or a DOT
            var left = this;
            // traverse left as far as possible (starting at this char)
            var node = left;
            do {
                if (/^[0-9]$/.test(node.ctrlSeq)) {
                    left = node;
                }
                else if (node.ctrlSeq === SPACE) {
                    left = node;
                }
                else if (node.ctrlSeq === DOT) {
                    left = node;
                }
                else {
                    break;
                }
            } while ((node = left[L]));
            // Traverse right from the left node.
            // 'left' is the leftmost 0-9, SPACE, or DOT contiguous from this.
            DigitGroupingChar.fixDigitGroupingFromLeft(opts, left);
        };
        /** Treat `left` as the start of a number. Scan right. */
        DigitGroupingChar.fixDigitGroupingFromLeft = function (opts, left) {
            // trim the leading spaces
            while (left && left.ctrlSeq === SPACE) {
                if (!left[R])
                    return;
                left = left[R];
            }
            if (!(left instanceof DigitGroupingChar)) {
                // Trimmed off all spaces, and left with non-digit, e.g. `\\ a`
                return;
            }
            var node = left;
            pray('node', node);
            var right = left;
            var spacesFound = 0;
            var dotStreak = 0;
            var dots = [];
            // traverse right as far as possible (starting to right of this char)
            do {
                // Invariant: "right" is a DigitGroupingChar
                if (/^[0-9]$/.test(node.ctrlSeq)) {
                    right = node;
                    dotStreak = 0;
                }
                else if (node.ctrlSeq === SPACE) {
                    right = node;
                    spacesFound += 1;
                    dotStreak = 0;
                }
                else if (node.ctrlSeq === DOT && node instanceof DigitGroupingChar) {
                    right = node;
                    dots.push(node);
                    if (opts.tripleDotsAreEllipsis) {
                        dotStreak += 1;
                    }
                }
                else {
                    break;
                }
                if (dotStreak == 3) {
                    break;
                }
            } while ((node = right[R]));
            // Exited the loop for one of two reasons:
            // 1. `dotStreak == 3`. In this case, trim off the three trailing dots,
            // and continue again from the character after the ellipsis.
            if (dotStreak === 3) {
                var rightDot = dots.pop();
                var middleDot = dots.pop();
                var leftDot = dots.pop();
                if (rightDot[R] instanceof DigitGroupingChar) {
                    DigitGroupingChar.fixDigitGroupingFromLeft(opts, rightDot[R]);
                }
                rightDot.setGroupingClass('mq-ellipsis-end');
                middleDot.setGroupingClass('mq-ellipsis-middle');
                leftDot.setGroupingClass('mq-ellipsis-start');
                right = leftDot[L];
                if (left === leftDot) {
                    // e.g. `[-...5]` afer typing the `-`.
                    // `left` is the left `.`, and `right` is the `-`.
                    return;
                }
                // Else, fallthrough. `left` through `right` (inclusive) is a sequence of
                // `DigitGroupingChar`s containing no three consecutive dots.
            }
            // 2. `!right[R]` or `right[R]` is not a digit grouping char.
            // In this case, `right` is the rightmost digit of the number.
            // Case 1 (`dotStreak == 3`) falls to this: after `right = right[L][L][L]`,
            // then `right` is the rightmost digit before the ellipsis.
            // trim the trailing spaces
            while (right !== left && right && right.ctrlSeq === SPACE) {
                right = right[L];
                spacesFound -= 1;
            }
            // happens when you only have a space
            if (left === right && left && left.ctrlSeq === SPACE)
                return;
            var disableFormatting = spacesFound > 0 || dots.length > 1;
            if (disableFormatting) {
                DigitGroupingChar.removeGroupingBetween(left, right);
            }
            else if (dots[0]) {
                if (dots[0] !== left) {
                    DigitGroupingChar.addGroupingBetween(dots[0][L], left);
                }
                if (dots[0] !== right) {
                    // we do not show grouping to the right of a decimal place #yet
                    // Remove the grouping for the decimal itself and the digits to the right.
                    DigitGroupingChar.removeGroupingBetween(dots[0], right);
                }
            }
            else {
                DigitGroupingChar.addGroupingBetween(right, left);
            }
        };
        DigitGroupingChar.removeGroupingBetween = function (left, right) {
            var node = left;
            do {
                if (node instanceof DigitGroupingChar) {
                    node.setGroupingClass(undefined);
                }
                if (!node || node === right)
                    break;
            } while ((node = node[R]));
        };
        // Works right-to-left, so `start` is the rightmost, and `end` is the leftmost.
        // Assumes all nodes from `end` to `start` are `DigitGroupingChar`s.
        DigitGroupingChar.addGroupingBetween = function (start, end) {
            var node = start;
            var count = 0;
            var totalDigits = 0;
            while (node) {
                totalDigits += 1;
                pray('digit', node instanceof DigitGroupingChar);
                if (node === end)
                    break;
                node = node[L];
            }
            var numDigitsInFirstGroup = totalDigits % 3;
            if (numDigitsInFirstGroup === 0)
                numDigitsInFirstGroup = 3;
            var node = start;
            while (node) {
                count += 1;
                var cls = undefined;
                // only do grouping if we have at least 4 numbers
                if (totalDigits >= 4) {
                    if (count === totalDigits) {
                        cls = 'mq-group-leading-' + numDigitsInFirstGroup;
                    }
                    else if (count % 3 === 0) {
                        if (count !== totalDigits) {
                            cls = 'mq-group-start';
                        }
                    }
                    if (!cls) {
                        cls = 'mq-group-other';
                    }
                }
                if (node instanceof DigitGroupingChar) {
                    node.setGroupingClass(cls);
                }
                if (node === end)
                    break;
                node = node[L];
            }
        };
        DigitGroupingChar.prototype.setGroupingClass = function (cls) {
            // nothing changed (either class is the same or it's still undefined)
            if (this._groupingClass === cls)
                return;
            // remove existing class
            if (this._groupingClass)
                this.domFrag().removeClass(this._groupingClass);
            // add new class
            if (cls)
                this.domFrag().addClass(cls);
            // cache the groupingClass
            this._groupingClass = cls;
        };
        return DigitGroupingChar;
    }(MQSymbol));
    var Digit = /** @class */ (function (_super) {
        __extends(Digit, _super);
        function Digit(ch, mathspeak) {
            return _super.call(this, ch, h('span', { class: 'mq-digit' }, [h.text(ch)]), undefined, mathspeak) || this;
        }
        Digit.prototype.createLeftOf = function (cursor) {
            var cursorL = cursor[L];
            var cursorLL = cursorL && cursorL[L];
            var cursorParentParentSub = cursor.parent.parent instanceof SupSub
                ? cursor.parent.parent.sub
                : undefined;
            if (cursor.options.autoSubscriptNumerals &&
                cursor.parent !== cursorParentParentSub &&
                ((cursorL instanceof Variable && cursorL.isItalic !== false) ||
                    (cursorL instanceof SupSub &&
                        cursorLL instanceof Variable &&
                        cursorLL.isItalic !== false))) {
                new SupSub('sub').createLeftOf(cursor);
                _super.prototype.createLeftOf.call(this, cursor);
                cursor.insRightOf(cursor.parent.parent);
            }
            else
                _super.prototype.createLeftOf.call(this, cursor);
        };
        Digit.prototype.mathspeak = function (opts) {
            if (opts && opts.createdLeftOf) {
                var cursor = opts.createdLeftOf;
                var cursorL = cursor[L];
                var cursorLL = cursorL && cursorL[L];
                var cursorParentParentSub = cursor.parent.parent instanceof SupSub
                    ? cursor.parent.parent.sub
                    : undefined;
                if (cursor.options.autoSubscriptNumerals &&
                    cursor.parent !== cursorParentParentSub &&
                    ((cursorL instanceof Variable && cursorL.isItalic !== false) ||
                        (cursor[L] instanceof SupSub &&
                            cursorLL instanceof Variable &&
                            cursorLL.isItalic !== false))) {
                    return 'Subscript ' + _super.prototype.mathspeak.call(this) + ' Baseline';
                }
            }
            return _super.prototype.mathspeak.call(this);
        };
        return Digit;
    }(DigitGroupingChar));
    var Variable = /** @class */ (function (_super) {
        __extends(Variable, _super);
        function Variable(chOrCtrlSeq, html) {
            return _super.call(this, chOrCtrlSeq, h('var', {}, [html || h.text(chOrCtrlSeq)])) || this;
        }
        Variable.prototype.text = function () {
            var text = this.ctrlSeq || '';
            if (this.isPartOfOperator) {
                if (text[0] == '\\') {
                    text = text.slice(1, text.length);
                }
                else if (text[text.length - 1] == ' ') {
                    text = text.slice(0, -1);
                }
            }
            else {
                if (this[L] &&
                    !(this[L] instanceof Variable) &&
                    !(this[L] instanceof BinaryOperator) &&
                    this[L].ctrlSeq !== '\\ ')
                    text = '*' + text;
                if (this[R] &&
                    !(this[R] instanceof BinaryOperator) &&
                    !(this[R] instanceof SupSub))
                    text += '*';
            }
            return text;
        };
        Variable.prototype.mathspeak = function () {
            var text = this.ctrlSeq || '';
            if (this.isPartOfOperator ||
                text.length > 1 ||
                (this.parent && this.parent.parent && this.parent.parent.isTextBlock())) {
                return _super.prototype.mathspeak.call(this);
            }
            else {
                // Apple voices in VoiceOver (such as Alex, Bruce, and Victoria) do
                // some strange pronunciation given certain expressions,
                // e.g. "y-2" is spoken as "ee minus 2" (as if the y is short).
                // Not an ideal solution, but surrounding non-numeric text blocks with quotation marks works.
                // This bug has been acknowledged by Apple.
                return '"' + text + '"';
            }
        };
        return Variable;
    }(MQSymbol));
    function bindVariable(ch, htmlEntity, _unusedMathspeak) {
        return function () { return new Variable(ch, h.entityText(htmlEntity)); };
    }
    Options.prototype.autoCommands = {
        _maxLength: 0
    };
    baseOptionProcessors.autoCommands = function (cmds) {
        // MATHCOMPILE: '' disables autoCommands entirely (the stock processor had no way to
        // turn the list back off once set \u2014 needed for the smartMode toggle).
        if (cmds === '') {
            return { _maxLength: 0 };
        }
        if (typeof cmds !== 'string' || !/^[a-z]+(?: [a-z]+)*$/i.test(cmds)) {
            throw '"' + cmds + '" not a space-delimited list of only letters';
        }
        var list = cmds.split(' ');
        var dict = {};
        var maxLength = 0;
        for (var i = 0; i < list.length; i += 1) {
            var cmd = list[i];
            if (cmd.length < 2) {
                throw 'autocommand "' + cmd + '" not minimum length of 2';
            }
            if (LatexCmds[cmd] === OperatorName) {
                throw '"' + cmd + '" is a built-in operator name';
            }
            dict[cmd] = 1;
            maxLength = max(maxLength, cmd.length);
        }
        dict._maxLength = maxLength;
        return dict;
    };
    Options.prototype.quietEmptyDelimiters = {};
    baseOptionProcessors.quietEmptyDelimiters = function (dlms) {
        if (dlms === void 0) { dlms = ''; }
        var list = dlms.split(' ');
        var dict = {};
        for (var i = 0; i < list.length; i += 1) {
            var dlm = list[i];
            dict[dlm] = 1;
        }
        return dict;
    };
    Options.prototype.autoParenthesizedFunctions = { _maxLength: 0 };
    baseOptionProcessors.autoParenthesizedFunctions = function (cmds) {
        if (typeof cmds !== 'string' || !/^[a-z]+(?: [a-z]+)*$/i.test(cmds)) {
            throw '"' + cmds + '" not a space-delimited list of only letters';
        }
        var list = cmds.split(' ');
        var dict = {};
        var maxLength = 0;
        for (var i = 0; i < list.length; i += 1) {
            var cmd = list[i];
            if (cmd.length < 2) {
                throw 'autocommand "' + cmd + '" not minimum length of 2';
            }
            dict[cmd] = 1;
            maxLength = max(maxLength, cmd.length);
        }
        dict._maxLength = maxLength;
        return dict;
    };
    function letterSequenceEndingAtNode(node, maxLength) {
        var str = '';
        var i = 0;
        // Inelegant approach to avoid counting operatorname letters as letters here:
        // node.ctrlSeq === node.letter holds true unless node is:
        //  - first or last letter in an operator name like \operatorname{arcsinh}, or
        //    (`\operatorname{` is prepended to first, and `}` is appended to last)
        //  - first or last letter in a builtin like `\sin `
        //    (`\` is prepended to first, and ` ` (space) is appended to last)
        while (node instanceof Letter &&
            node.ctrlSeq === node.letter &&
            i < maxLength) {
            str = node.letter + str;
            node = node[L];
            i += 1;
        }
        return str;
    }
    var Letter = /** @class */ (function (_super) {
        __extends(Letter, _super);
        function Letter(ch) {
            var _this = _super.call(this, ch) || this;
            _this.letter = ch;
            return _this;
        }
        Letter.prototype.checkAutoCmds = function (cursor) {
            var _c;
            //exit early if in simple subscript and disableAutoSubstitutionInSubscripts is set.
            if (this.shouldIgnoreSubstitutionInSimpleSubscript(cursor.options)) {
                return;
            }
            //handle autoCommands
            var autoCmds = cursor.options.autoCommands;
            var maxLength = autoCmds._maxLength || 0;
            if (maxLength > 0) {
                // want longest possible autocommand, so join together longest
                // sequence of letters
                var str = (_c = letterSequenceEndingAtNode(this, maxLength)) !== null && _c !== void 0 ? _c : '';
                // check for an autocommand, going thru substrings longest to shortest
                while (str.length) {
                    if (autoCmds.hasOwnProperty(str)) {
                        var l = this;
                        for (var i = 1; l && i < str.length; i += 1, l = l[L])
                            ;
                        new Fragment(l, this).remove();
                        cursor[L] = l[L];
                        var cmd = LatexCmds[str];
                        var node;
                        if (isMQNodeClass(cmd)) {
                            node = new cmd(str); // TODO - How do we know that this class expects a single str input?
                        }
                        else {
                            node = cmd(str);
                        }
                        return node.createLeftOf(cursor);
                    }
                    str = str.slice(1);
                }
            }
        };
        Letter.prototype.autoParenthesize = function (cursor) {
            //exit early if already parenthesized
            var right = cursor.parent.getEnd(R);
            if (right && right instanceof Bracket && right.ctrlSeq === '\\left(') {
                return;
            }
            //exit early if in simple subscript and disableAutoSubstitutionInSubscripts is set.
            if (this.shouldIgnoreSubstitutionInSimpleSubscript(cursor.options)) {
                return;
            }
            //handle autoParenthesized functions
            var str = '';
            var l = this;
            var i = 0;
            var autoParenthesizedFunctions = cursor.options.autoParenthesizedFunctions;
            var maxLength = autoParenthesizedFunctions._maxLength || 0;
            var autoOperatorNames = cursor.options.autoOperatorNames;
            while (l instanceof Letter && i < maxLength) {
                (str = l.letter + str), (l = l[L]), (i += 1);
            }
            // check for an autoParenthesized functions, going thru substrings longest to shortest
            // only allow autoParenthesized functions that are also autoOperatorNames
            while (str.length) {
                if (autoParenthesizedFunctions.hasOwnProperty(str) &&
                    autoOperatorNames.hasOwnProperty(str)) {
                    return cursor.parent.write(cursor, '(');
                }
                str = str.slice(1);
            }
        };
        Letter.prototype.createLeftOf = function (cursor) {
            _super.prototype.createLeftOf.call(this, cursor);
            this.checkAutoCmds(cursor);
            this.autoParenthesize(cursor);
        };
        Letter.prototype.italicize = function (bool) {
            this.isItalic = bool;
            this.isPartOfOperator = !bool;
            if (bool) {
                delete this.endsCategory;
                delete this.endsWord;
            }
            this.domFrag().toggleClass('mq-operator-name', !bool);
            return this;
        };
        Letter.prototype.finalizeTree = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        Letter.prototype.siblingDeleted = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        Letter.prototype.siblingCreated = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        Letter.prototype.sharedSiblingMethod = function (opts, dir) {
            // don't auto-un-italicize if the sibling to my right changed (dir === R or
            // undefined) and it's now a Letter, it will un-italicize everyone
            if (dir !== L && this[R] instanceof Letter)
                return;
            this.autoUnItalicize(opts);
        };
        Letter.prototype.autoUnItalicize = function (opts) {
            var autoOps = opts.autoOperatorNames;
            if (autoOps._maxLength === 0)
                return;
            //exit early if in simple subscript and disableAutoSubstitutionInSubscripts is set.
            if (this.shouldIgnoreSubstitutionInSimpleSubscript(opts)) {
                return;
            }
            // want longest possible operator names, so join together entire contiguous
            // sequence of letters
            var str = this.letter;
            for (var l = this[L]; l instanceof Letter; l = l[L])
                str = l.letter + str;
            for (var r = this[R]; r instanceof Letter; r = r[R])
                str += r.letter;
            // removeClass and delete flags from all letters before figuring out
            // which, if any, are part of an operator name
            var lR = l && l[R];
            var rL = r && r[L];
            new Fragment(lR || this.parent.getEnd(L), rL || this.parent.getEnd(R)).each(function (el) {
                if (el instanceof Letter) {
                    el.italicize(true)
                        .domFrag()
                        .removeClass('mq-first mq-last mq-followed-by-supsub');
                    el.ctrlSeq = el.letter;
                }
                return undefined;
            });
            var autoOpsLength = autoOps._maxLength || 0;
            // check for operator names: at each position from left to right, check
            // substrings from longest to shortest
            outer: for (var i = 0, first = l[R] || this.parent.getEnd(L); first && i < str.length; i += 1, first = first[R]) {
                // MATHCOMPILE: A letter run inside \operatorname{...}/\mathrm{...} (its first
                // letter's ctrlSeq carries the `\name{` prefix and its last carries
                // `}`) is already an explicit operator name \u2014 keep it whole and
                // upright. Scanning it for built-in names split e.g.
                // \operatorname{sign} into "sin" + "g" and \operatorname{atan}
                // into "a" + "tan".
                if (first instanceof Letter &&
                    /^\\(?:operatorname|mathrm|mathsf|mathnormal|mathbf)\{/.test(first.ctrlSeq)) {
                    var opLetter = first;
                    var opLen = 0;
                    while (opLetter instanceof Letter) {
                        opLetter.italicize(false);
                        opLen += 1;
                        var endsRun = opLetter.ctrlSeq.endsWith('}');
                        opLetter = opLetter[R];
                        if (endsRun)
                            break;
                    }
                    i += opLen - 1;
                    first = opLetter instanceof Letter ? opLetter[L] : first;
                    if (!opLetter)
                        break;
                    continue;
                }
                for (var len = min(autoOpsLength, str.length - i); len > 0; len -= 1) {
                    var word = str.slice(i, i + len);
                    var last = undefined; // TODO - TS complaining that we use last before assigning to it
                    if (autoOps.hasOwnProperty(word)) {
                        for (var j = 0, letter = first; j < len; j += 1, letter = letter[R]) {
                            if (letter instanceof Letter) {
                                letter.italicize(false);
                                last = letter;
                            }
                        }
                        var isBuiltIn = BuiltInOpNames.hasOwnProperty(word);
                        first.ctrlSeq =
                            (isBuiltIn ? '\\' : '\\operatorname{') + first.ctrlSeq;
                        last.ctrlSeq += isBuiltIn ? ' ' : '}';
                        last.endsWord = word;
                        if (opts.infixOperatorNames[word]) {
                            last.endsCategory = 'infix';
                        }
                        else if (opts.prefixOperatorNames[word]) {
                            last.endsCategory = 'prefix';
                        }
                        if (TwoWordOpNames.hasOwnProperty(word)) {
                            var lastL = last[L];
                            var lastLL = lastL && lastL[L];
                            var lastLLL = (lastLL && lastLL[L]);
                            lastLLL.domFrag().addClass('mq-last');
                        }
                        if (!this.shouldOmitPadding(first[L]))
                            first.domFrag().addClass('mq-first');
                        if (!this.shouldOmitPadding(last[R])) {
                            if (last[R] instanceof SupSub) {
                                var supsub = last[R]; // XXX monkey-patching, but what's the right thing here?
                                // Have operatorname-specific code in SupSub? A CSS-like language to style the
                                // math tree, but which ignores cursor and selection (which CSS can't)?
                                var respace = (supsub.siblingCreated =
                                    supsub.siblingDeleted =
                                        function () {
                                            supsub
                                                .domFrag()
                                                .toggleClass('mq-after-operator-name', !(supsub[R] instanceof Bracket));
                                        });
                                respace();
                            }
                            else {
                                last
                                    .domFrag()
                                    .toggleClass('mq-last', !(last[R] instanceof Bracket));
                            }
                        }
                        i += len - 1;
                        first = last;
                        continue outer;
                    }
                }
            }
        };
        Letter.prototype.shouldOmitPadding = function (node) {
            // omit padding if no node
            if (!node)
                return true;
            // do not add padding between letter and '.'
            if (node.ctrlSeq === '.')
                return true;
            // do not add padding between letter and binary operator. The
            // binary operator already has padding
            if (node instanceof BinaryOperator && node.isBinaryOperator())
                return true;
            if (node instanceof SummationNotation)
                return true;
            return false;
        };
        return Letter;
    }(Variable));
    var BuiltInOpNames = {}; // the set of operator names like \sin, \cos, etc that
    // are built-into LaTeX, see Section 3.17 of the Short Math Guide: http://tinyurl.com/jm9okjc
    // MathQuill auto-unitalicizes some operator names not in that set, like 'hcf'
    // and 'arsinh', which must be exported as \operatorname{hcf} and
    // \operatorname{arsinh}. Note: over/under line/arrow \lim variants like
    // \varlimsup are not supported
    // the set of operator names that MathQuill auto-unitalicizes by default; overridable
    Options.prototype.autoOperatorNames = defaultAutoOpNames();
    var TwoWordOpNames = { limsup: 1, liminf: 1, projlim: 1, injlim: 1 };
    function defaultAutoOpNames() {
        var AutoOpNames = {
            _maxLength: 9
        };
        var mostOps = ('arg deg det dim exp gcd hom inf ker lg lim ln log max min sup' +
            ' limsup liminf injlim projlim Pr').split(' ');
        for (var i = 0; i < mostOps.length; i += 1) {
            BuiltInOpNames[mostOps[i]] = AutoOpNames[mostOps[i]] = 1;
        }
        var builtInTrigs = 'sin cos tan arcsin arccos arctan sinh cosh tanh sec csc cot coth'.split(
        // why coth but not sech and csch, LaTeX?
        ' ');
        for (var i = 0; i < builtInTrigs.length; i += 1) {
            BuiltInOpNames[builtInTrigs[i]] = 1;
        }
        var autoTrigs = 'sin cos tan sec cosec csc cotan cot ctg'.split(' ');
        for (var i = 0; i < autoTrigs.length; i += 1) {
            AutoOpNames[autoTrigs[i]] =
                AutoOpNames['arc' + autoTrigs[i]] =
                    AutoOpNames[autoTrigs[i] + 'h'] =
                        AutoOpNames['ar' + autoTrigs[i] + 'h'] =
                            AutoOpNames['arc' + autoTrigs[i] + 'h'] =
                                1;
        }
        // compat with some of the nonstandard LaTeX exported by MathQuill
        // before #247. None of these are real LaTeX commands so, seems safe.
        // MATHCOMPILE: 'sign' (not built into LaTeX) exports as \operatorname{sign}, which
        // MathCompile's compile pipeline lowers to SymPy's sign().
        var moreNonstandardOps = 'gcf hcf lcm proj span sign'.split(' ');
        for (var i = 0; i < moreNonstandardOps.length; i += 1) {
            AutoOpNames[moreNonstandardOps[i]] = 1;
        }
        return AutoOpNames;
    }
    baseOptionProcessors.autoOperatorNames = function (cmds) {
        if (typeof cmds !== 'string') {
            throw '"' + cmds + '" not a space-delimited list';
        }
        if (!/^[a-z\|\-]+(?: [a-z\|\-]+)*$/i.test(cmds)) {
            throw '"' + cmds + '" not a space-delimited list of letters or "|"';
        }
        var list = cmds.split(' ');
        var dict = {};
        var maxLength = 0;
        for (var i = 0; i < list.length; i += 1) {
            var cmd = list[i];
            if (cmd.length < 2) {
                throw '"' + cmd + '" not minimum length of 2';
            }
            if (cmd.indexOf('|') < 0) {
                // normal auto operator
                dict[cmd] = cmd;
                maxLength = max(maxLength, cmd.length);
            }
            else {
                // this item has a speech-friendly alternative
                var cmdArray = cmd.split('|');
                if (cmdArray.length > 2) {
                    throw '"' + cmd + '" has more than 1 mathspeak delimiter';
                }
                if (cmdArray[0].length < 2) {
                    throw '"' + cmd[0] + '" not minimum length of 2';
                }
                dict[cmdArray[0]] = cmdArray[1].replace(/-/g, ' '); // convert dashes to spaces for the sake of speech
                maxLength = max(maxLength, cmdArray[0].length);
            }
        }
        dict._maxLength = maxLength;
        return dict;
    };
    Options.prototype.infixOperatorNames = {};
    baseOptionProcessors.infixOperatorNames = splitWordsIntoDict;
    Options.prototype.prefixOperatorNames = {};
    baseOptionProcessors.prefixOperatorNames = splitWordsIntoDict;
    Options.prototype.disableAutoSubstitutionInSubscripts = false;
    baseOptionProcessors.disableAutoSubstitutionInSubscripts = function (opt) {
        if (typeof opt === 'boolean')
            return opt;
        if (typeof opt !== 'object' || opt === null || !('except' in opt)) {
            throw '"' + opt + '" not an object with property "except"';
        }
        return { except: splitWordsIntoDict(opt.except) };
    };
    function splitWordsIntoDict(cmds) {
        if (typeof cmds !== 'string') {
            throw '"' + cmds + '" not a space-delimited list';
        }
        if (!/^[a-z]+(?: [a-z]+)*$/i.test(cmds)) {
            throw '"' + cmds + '" not a space-delimited list of letters';
        }
        var list = cmds.split(' ');
        var dict = {};
        for (var i = 0; i < list.length; i += 1) {
            var cmd = list[i];
            if (cmd.length < 2) {
                throw '"' + cmd + '" not minimum length of 2';
            }
            dict[cmd] = true;
        }
        return dict;
    }
    var OperatorName = /** @class */ (function (_super) {
        __extends(OperatorName, _super);
        function OperatorName(fn) {
            return _super.call(this, fn || '') || this;
        }
        OperatorName.prototype.createLeftOf = function (cursor) {
            var fn = this.ctrlSeq;
            for (var i = 0; i < fn.length; i += 1) {
                new Letter(fn.charAt(i)).createLeftOf(cursor);
            }
        };
        OperatorName.prototype.parser = function () {
            var fn = this.ctrlSeq;
            var block = new MathBlock();
            for (var i = 0; i < fn.length; i += 1) {
                new Letter(fn.charAt(i)).adopt(block, block.getEnd(R), 0);
            }
            return Parser.succeed(block.children());
        };
        return OperatorName;
    }(MQSymbol));
    for (var fn in Options.prototype.autoOperatorNames)
        if (Options.prototype.autoOperatorNames.hasOwnProperty(fn)) {
            LatexCmds[fn] = OperatorName;
        }
    LatexCmds.operatorname = /** @class */ (function (_super) {
        __extends(class_2, _super);
        function class_2() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        class_2.prototype.createLeftOf = function () { };
        class_2.prototype.numBlocks = function () {
            return 1;
        };
        class_2.prototype.parser = function () {
            // MATHCOMPILE: \operatorname* is the limits-form operator \u2014 consume the star so
            // it doesn't surface as a stray literal '*' (previously
            // \operatorname*{argmin} -> *\arg\min)
            return Parser.optWhitespace
                .then(Parser.string('*').or(Parser.succeed('')))
                .then(latexMathParser.block)
                .map(function (b) {
                // Check for the special case of \operatorname{ans}, which has
                // a special html representation
                var isAllLetters = true;
                var str = '';
                var children = b.children();
                children.each(function (child) {
                    if (child instanceof Letter) {
                        str += child.letter;
                    }
                    else {
                        isAllLetters = false;
                    }
                    return undefined;
                });
                if (isAllLetters && str === 'ans') {
                    return AnsBuilder();
                }
                // In cases other than `ans`, just return the children directly
                return children;
            });
        };
        return class_2;
    }(MathCommand));
    LatexCmds.f = /** @class */ (function (_super) {
        __extends(class_3, _super);
        function class_3() {
            var _this = this;
            var letter = 'f';
            _this = _super.call(this, letter) || this;
            _this.letter = letter;
            _this.domView = new DOMView(0, function () {
                return h('var', { class: 'mq-f' }, [h.text('f')]);
            });
            return _this;
        }
        class_3.prototype.italicize = function (bool) {
            // Why is this necesssary? Does someone replace the `f` at some
            // point?
            this.domFrag().eachElement(function (el) { return (el.textContent = 'f'); });
            this.domFrag().toggleClass('mq-f', bool);
            return _super.prototype.italicize.call(this, bool);
        };
        return class_3;
    }(Letter));
    // VanillaSymbol's
    LatexCmds[' '] = LatexCmds.space = function () {
        return new DigitGroupingChar('\\ ', h('span', {}, [h.text(U_NO_BREAK_SPACE)]), ' ');
    };
    // MATHCOMPILE: \<char> escapes \u2014 spacing (\, \: \; \!), braces (\{ \}) and the norm
    // shorthand (\|). These are keyed with a backslash prefix so they only
    // resolve through the '\'-prefixed parse branch (see latex.ts): bare
    // ',', ';', '{', ... keep their literal meaning and '}' still closes
    // groups.
    LatexCmds['\\,'] =
        LatexCmds.thinspace =
            bindVanillaSymbol('\\, ', U_NO_BREAK_SPACE, 'thin space');
    LatexCmds['\\:'] =
        LatexCmds.medspace =
            bindVanillaSymbol('\\: ', U_NO_BREAK_SPACE, 'medium space');
    LatexCmds['\\;'] =
        LatexCmds.thickspace =
            bindVanillaSymbol('\\; ', U_NO_BREAK_SPACE, 'thick space');
    LatexCmds['\\!'] = function () {
        return new VanillaSymbol('\\! ', h('span', { style: 'margin-right:-.2em' }), 'negative thin space');
    };
    LatexCmds['\\{'] = bindVanillaSymbol('\\{ ', '{', 'open brace');
    LatexCmds['\\}'] = bindVanillaSymbol('\\} ', '}', 'close brace');
    LatexCmds['\\|'] = bindVanillaSymbol('\\| ', '&#8741;', 'norm');
    LatexCmds['.'] = function () {
        return new DigitGroupingChar('.', h('span', { class: 'mq-digit' }, [h.text('.')]), '.');
    };
    LatexCmds['\u2018'] =
        LatexCmds['\u2019'] =
            LatexCmds['\u02BC'] =
                LatexCmds["'"] =
                    LatexCmds.prime =
                        bindVanillaSymbol("'", '&prime;', 'prime');
    LatexCmds['\u2033'] = LatexCmds.dprime = bindVanillaSymbol('\u2033', '&Prime;', 'double prime');
    LatexCmds.backslash = bindVanillaSymbol('\\backslash ', '\\', 'backslash');
    if (!CharCmds['\\'])
        CharCmds['\\'] = LatexCmds.backslash;
    LatexCmds.$ = bindVanillaSymbol('\\$', '$', 'dollar');
    LatexCmds['?'] = bindVanillaSymbol('?', '?', 'question mark');
    LatexCmds['\u25a1'] = LatexCmds.square = bindVanillaSymbol('\\square ', '\u25A1', 'square');
    LatexCmds.mid = bindVanillaSymbol('\\mid ', '\u2223', 'mid');
    // support for custom css
    var SymbolWithCustomClass = /** @class */ (function (_super) {
        __extends(SymbolWithCustomClass, _super);
        function SymbolWithCustomClass(ch, customClass) {
            return _super.call(this, ch, h('span', { class: customClass }, [h.text(ch)])) || this;
        }
        return SymbolWithCustomClass;
    }(MQSymbol));
    LatexCmds[','] = function () { return new SymbolWithCustomClass(',', 'mq-comma'); };
    // does not use Symbola font
    var NonSymbolaSymbol = /** @class */ (function (_super) {
        __extends(NonSymbolaSymbol, _super);
        function NonSymbolaSymbol(ch, html, _unusedMathspeak) {
            return _super.call(this, ch, h('span', { class: 'mq-nonSymbola' }, [html || h.text(ch)])) || this;
        }
        return NonSymbolaSymbol;
    }(MQSymbol));
    LatexCmds['@'] = function () { return new NonSymbolaSymbol('@'); };
    LatexCmds['&'] = function () {
        return new NonSymbolaSymbol('\\&', h.entityText('&amp;'), 'and');
    };
    // MATHCOMPILE: escaped delimiters/specials \u2014 the parser passes the backslash
    // through in ctrlSeq ('\_'), so the bare characters are untouched
    LatexCmds['\\_'] = function () {
        return new NonSymbolaSymbol('\\_', h.text('_'), 'underscore');
    };
    LatexCmds['\\#'] = function () { return new NonSymbolaSymbol('\\#', h.text('#'), 'hash'); };
    LatexCmds['%'] = /** @class */ (function (_super) {
        __extends(class_4, _super);
        function class_4() {
            return _super.call(this, '\\%', h.text('%'), 'percent') || this;
        }
        class_4.prototype.parser = function () {
            var optWhitespace = Parser.optWhitespace;
            var string = Parser.string;
            // Parse `\%\operatorname{of}` as special `percentof` node so that
            // it will be serialized properly and deleted as a unit.
            return optWhitespace
                .then(string('\\operatorname{of}').map(function () {
                return PercentOfBuilder();
            }))
                .or(_super.prototype.parser.call(this));
        };
        return class_4;
    }(NonSymbolaSymbol));
    LatexCmds['\u2225'] = LatexCmds.parallel = bindVanillaSymbol('\\parallel ', '&#x2225;', 'parallel');
    LatexCmds['\u2226'] = LatexCmds.nparallel = bindVanillaSymbol('\\nparallel ', '&#x2226;', 'not parallel');
    LatexCmds['\u27c2'] = LatexCmds.perp = bindVanillaSymbol('\\perp ', '&#x27C2;', 'perpendicular');
    //the following are all Greek to me, but this helped a lot: http://www.ams.org/STIX/ion/stixsig03.html
    //lowercase Greek letter variables
    function bindLowercaseGreek(latex) {
        return bindVariable('\\' + latex + ' ', '&' + latex + ';', latex);
    }
    LatexCmds['\u03b1'] = LatexCmds.alpha = bindLowercaseGreek('alpha');
    LatexCmds['\u03b2'] = LatexCmds.beta = bindLowercaseGreek('beta');
    LatexCmds['\u03b3'] = LatexCmds.gamma = bindLowercaseGreek('gamma');
    LatexCmds['\u03b4'] = LatexCmds.delta = bindLowercaseGreek('delta');
    LatexCmds['\u03b6'] = LatexCmds.zeta = bindLowercaseGreek('zeta');
    LatexCmds['\u03b7'] = LatexCmds.eta = bindLowercaseGreek('eta');
    LatexCmds['\u03b8'] = LatexCmds.theta = bindLowercaseGreek('theta');
    LatexCmds['\u03b9'] = LatexCmds.iota = bindLowercaseGreek('iota');
    LatexCmds['\u03ba'] = LatexCmds.kappa = bindLowercaseGreek('kappa');
    LatexCmds['\u03bc'] = LatexCmds.mu = bindLowercaseGreek('mu');
    LatexCmds['\u03bd'] = LatexCmds.nu = bindLowercaseGreek('nu');
    LatexCmds['\u03be'] = LatexCmds.xi = bindLowercaseGreek('xi');
    LatexCmds['\u03c1'] = LatexCmds.rho = bindLowercaseGreek('rho');
    LatexCmds['\u03c3'] = LatexCmds.sigma = bindLowercaseGreek('sigma');
    LatexCmds['\u03c4'] = LatexCmds.tau = bindLowercaseGreek('tau');
    LatexCmds['\u03c7'] = LatexCmds.chi = bindLowercaseGreek('chi');
    LatexCmds['\u03c8'] = LatexCmds.psi = bindLowercaseGreek('psi');
    LatexCmds['\u03c9'] = LatexCmds.omega = bindLowercaseGreek('omega');
    //why can't anybody FUCKING agree on these
    LatexCmds['\u03d5'] = LatexCmds.phi = bindVariable('\\phi ', '&#981;', 'phi'); //W3C or Unicode?
    LatexCmds['\u03c6'] =
        LatexCmds.phiv =
            LatexCmds.varphi =
                bindVariable('\\varphi ', '&phi;', 'phi'); //Elsevier and 9573-13 //AMS and LaTeX
    LatexCmds['\u03f5'] = LatexCmds.epsilon = bindVariable('\\epsilon ', '&#1013;', 'epsilon'); //W3C or Unicode?
    LatexCmds['\u03b5'] =
        LatexCmds.epsiv =
            LatexCmds.varepsilon =
                bindVariable(
                //Elsevier and 9573-13 //AMS and LaTeX
                '\\varepsilon ', '&epsilon;', 'epsilon');
    LatexCmds['\u03d6'] =
        LatexCmds.piv =
            LatexCmds.varpi =
                bindVariable('\\varpi ', '&piv;', 'piv'); //W3C/Unicode and Elsevier and 9573-13 //AMS and LaTeX
    LatexCmds['\u03c2'] = // Unicode
        LatexCmds.sigmaf = //W3C/Unicode
            LatexCmds.sigmav = //Elsevier
                LatexCmds.varsigma = //LaTeX
                    bindVariable('\\varsigma ', '&sigmaf;', 'sigma');
    LatexCmds['\u03d1'] = // Unicode
        LatexCmds.thetav = //Elsevier and 9573-13
            LatexCmds.vartheta = //AMS and LaTeX
                LatexCmds.thetasym = //W3C/Unicode
                    bindVariable('\\vartheta ', '&thetasym;', 'theta');
    LatexCmds['\u03c5'] =
        LatexCmds.upsilon =
            LatexCmds.upsi =
                bindVariable(
                //AMS and LaTeX and W3C/Unicode //Elsevier and 9573-13
                '\\upsilon ', '&upsilon;', 'upsilon');
    //these aren't even mentioned in the HTML character entity references
    LatexCmds['\u03dc'] =
        LatexCmds.gammad = //Elsevier
            LatexCmds.Gammad = //9573-13 -- WTF, right? I dunno if this was a typo in the reference (see above)
                LatexCmds.digamma = //LaTeX
                    bindVariable('\\digamma ', '&#989;', 'gamma');
    LatexCmds['\u03f0'] =
        LatexCmds.kappav =
            LatexCmds.varkappa =
                bindVariable(
                //Elsevier //AMS and LaTeX
                '\\varkappa ', '&#1008;', 'kappa');
    LatexCmds['\u03f1'] =
        LatexCmds.rhov =
            LatexCmds.varrho =
                bindVariable('\\varrho ', '&#1009;', 'rho'); //Elsevier and 9573-13 //AMS and LaTeX
    //Greek constants, look best in non-italicized Times New Roman
    LatexCmds.pi = LatexCmds['\u03c0'] = function () {
        return new NonSymbolaSymbol('\\pi ', h.entityText('&pi;'), 'pi');
    };
    LatexCmds['\u03bb'] = LatexCmds.lambda = function () {
        return new NonSymbolaSymbol('\\lambda ', h.entityText('&lambda;'), 'lambda');
    };
    //uppercase greek letters
    LatexCmds['\u03a5'] =
        LatexCmds.Upsilon = //LaTeX
            LatexCmds.Upsi = //Elsevier and 9573-13
                LatexCmds.upsih = //W3C/Unicode "upsilon with hook"
                    LatexCmds.Upsih = //'cos it makes sense to me
                        function () {
                            return new MQSymbol('\\Upsilon ', h('var', { style: 'font-family: serif' }, [h.entityText('&upsih;')]), 'capital upsilon');
                        }; //Symbola's 'upsilon with a hook' is a capital Y without hooks :(
    //other symbols with the same LaTeX command and HTML character entity reference
    function bindUppercaseGreek(latex) {
        return function () {
            return new VanillaSymbol('\\' + latex + ' ', h.entityText('&' + latex + ';'));
        };
    }
    LatexCmds['\u0393'] = LatexCmds.Gamma = bindUppercaseGreek('Gamma');
    LatexCmds['\u0394'] = LatexCmds.Delta = bindUppercaseGreek('Delta');
    LatexCmds['\u0398'] = LatexCmds.Theta = bindUppercaseGreek('Theta');
    LatexCmds['\u039b'] = LatexCmds.Lambda = bindUppercaseGreek('Lambda');
    LatexCmds['\u039e'] = LatexCmds.Xi = bindUppercaseGreek('Xi');
    LatexCmds['\u03a0'] = LatexCmds.Pi = bindUppercaseGreek('Pi');
    LatexCmds['\u03a3'] = LatexCmds.Sigma = bindUppercaseGreek('Sigma');
    LatexCmds['\u03a6'] = LatexCmds.Phi = bindUppercaseGreek('Phi');
    LatexCmds['\u03a8'] = LatexCmds.Psi = bindUppercaseGreek('Psi');
    LatexCmds['\u03a9'] = LatexCmds.Omega = bindUppercaseGreek('Omega');
    LatexCmds['\u2200'] = LatexCmds.forall = bindUppercaseGreek('forall');
    // "exists" is in advancedSymbols
    // symbols that aren't a single MathCommand, but are instead a whole
    // Fragment. Creates the Fragment from a LaTeX string
    var LatexFragment = /** @class */ (function (_super) {
        __extends(LatexFragment, _super);
        function LatexFragment(latex) {
            var _this = _super.call(this) || this;
            _this.latexStr = latex;
            return _this;
        }
        LatexFragment.prototype.createLeftOf = function (cursor) {
            var block = latexMathParser.parse(this.latexStr);
            block
                .children()
                .adopt(cursor.parent, cursor[L], cursor[R]);
            cursor[L] = block.getEnd(R);
            domFrag(block.html()).insertBefore(cursor.domFrag());
            block.finalizeInsert(cursor.options, cursor);
            var blockEndsR = block.getEnd(R);
            var blockEndsRR = blockEndsR && blockEndsR[R];
            if (blockEndsRR)
                blockEndsRR.siblingCreated(cursor.options, L);
            var blockEndsL = block.getEnd(L);
            var blockEndsLL = blockEndsL && blockEndsL[L];
            if (blockEndsLL)
                blockEndsLL.siblingCreated(cursor.options, R);
            cursor.parent.bubble(function (node) {
                node.reflow();
                return undefined;
            });
        };
        LatexFragment.prototype.mathspeak = function () {
            return latexMathParser.parse(this.latexStr).mathspeak();
        };
        LatexFragment.prototype.parser = function () {
            var frag = latexMathParser.parse(this.latexStr).children();
            return Parser.succeed(frag);
        };
        return LatexFragment;
    }(MathCommand));
    // for what seems to me like [stupid reasons][1], Unicode provides
    // subscripted and superscripted versions of all ten Arabic numerals,
    // as well as [so-called "vulgar fractions"][2].
    // Nobody really cares about most of them, but some of them actually
    // predate Unicode, dating back to [ISO-8859-1][3], apparently also
    // known as "Latin-1", which among other things [Windows-1252][4]
    // largely coincides with, so Microsoft Word sometimes inserts them
    // and they get copy-pasted into MathQuill.
    //
    // (Irrelevant but funny story: though not a superset of Latin-1 aka
    // ISO-8859-1, Windows-1252 **is** a strict superset of the "closely
    // related but distinct"[3] "ISO 8859-1" -- see the lack of a dash
    // after "ISO"? Completely different character set, like elephants vs
    // elephant seals, or "Zombies" vs "Zombie Redneck Torture Family".
    // What kind of idiot would get them confused.
    // People in fact got them confused so much, it was so common to
    // mislabel Windows-1252 text as ISO-8859-1, that most modern web
    // browsers and email clients treat the MIME charset of ISO-8859-1
    // as actually Windows-1252, behavior now standard in the HTML5 spec.)
    //
    // [1]: http://en.wikipedia.org/wiki/Unicode_subscripts_andsuper_scripts
    // [2]: http://en.wikipedia.org/wiki/Number_Forms
    // [3]: http://en.wikipedia.org/wiki/ISO/IEC_8859-1
    // [4]: http://en.wikipedia.org/wiki/Windows-1252
    LatexCmds['\u2070'] = function () { return new LatexFragment('^0'); };
    LatexCmds['\u00b9'] = function () { return new LatexFragment('^1'); };
    LatexCmds['\u00b2'] = function () { return new LatexFragment('^2'); };
    LatexCmds['\u00b3'] = function () { return new LatexFragment('^3'); };
    LatexCmds['\u2074'] = function () { return new LatexFragment('^4'); };
    LatexCmds['\u2075'] = function () { return new LatexFragment('^5'); };
    LatexCmds['\u2076'] = function () { return new LatexFragment('^6'); };
    LatexCmds['\u2077'] = function () { return new LatexFragment('^7'); };
    LatexCmds['\u2078'] = function () { return new LatexFragment('^8'); };
    LatexCmds['\u2079'] = function () { return new LatexFragment('^9'); };
    LatexCmds['\u00bc'] = function () { return new LatexFragment('\\frac14'); };
    LatexCmds['\u00bd'] = function () { return new LatexFragment('\\frac12'); };
    LatexCmds['\u00be'] = function () { return new LatexFragment('\\frac34'); };
    // this is a hack to make pasting the \u221a symbol
    // actually insert a sqrt command. This isn't ideal,
    // but it's way better than what we have now. I think
    // before we invest any more time into this single character
    // we should consider how to make the pipe (|) automatically
    // insert absolute value. We also will want the percent (%)
    // to expand to '% of'. I've always just thought mathquill's
    // ability to handle pasted latex magical until I started actually
    // testing it. It's a lot more buggy that I previously thought.
    //
    // KNOWN ISSUES:
    // 1) pasting \u221a does not put focus in side the sqrt symbol
    // 2) pasting \u221a2 puts the 2 outside of the sqrt symbol.
    //
    // The first issue seems like we could invest more time into this to
    // fix it, but doesn't feel worth special casing. I think we'd want
    // to address it by addressing ALL pasting issues.
    //
    // The second issue seems like it might go away too if you fix paste to
    // act more like simply typing the characters out. I'd be scared to try
    // to make that change because I'm fairly confident I'd break something
    // around handling valid latex as latex rather than treating it as keystrokes.
    LatexCmds['\u221a'] = function () { return new LatexFragment('\\sqrt{}'); };
    /**
     * Return true if:
     * - node is BinaryOperator (+, \u00d7, -, etc), including PlusMinus which could
     *   siometimes be interpreted as unary, or
     * - node ends an infix word like "for" specified in `infixOperatorNames`
     */
    function nodeEndsBinaryOperator(node) {
        return (node instanceof BinaryOperator ||
            (node instanceof Letter && node.endsCategory == 'infix'));
    }
    // Binary operator determination is used in several contexts for PlusMinus nodes and their descendants.
    // For instance, we set the item's class name based on this factor, and also assign different mathspeak values (plus vs positive, negative vs minus).
    function plusMinusIsBinaryOperator(node) {
        if (!node)
            return false;
        var nodeL = node[L];
        if (nodeL) {
            // If the left sibling is a binary operator or a separator (comma, semicolon, colon, space),
            // consider the operator to be unary
            if (nodeEndsBinaryOperator(nodeL) ||
                (nodeL instanceof Letter && nodeL.endsCategory == 'prefix') ||
                (!(nodeL instanceof Bracket) && // exclude Bracket because ctrlSeq gives "(" even if `node` is after the ")"
                    /^(\\ )|[,;:\(\[]$/.test(nodeL.ctrlSeq))) {
                return false;
            }
        }
        else if (node.parent &&
            node.parent.parent &&
            node.parent.parent.isStyleBlock()) {
            //if we are in a style block at the leftmost edge, determine unary/binary based on
            //the style block
            //this allows style blocks to be transparent for unary/binary purposes
            return plusMinusIsBinaryOperator(node.parent.parent);
        }
        else {
            // This is reached when `node` is the first element in the MathBlock, for
            // example `node` is after an open bracket. E.g. `node` is "-" inside "(-5)".
            // Then `nodeL` is undefined since `node` is the start of the block.
            return false;
        }
        return true;
    }
    var PlusMinus = /** @class */ (function (_super) {
        __extends(class_5, _super);
        function class_5(ch, html, mathspeak) {
            return _super.call(this, ch, html, undefined, mathspeak, true) || this;
        }
        class_5.prototype.isBinaryOperator = function () {
            return plusMinusIsBinaryOperator(this);
        };
        class_5.prototype.contactWeld = function (cursor, dir) {
            this.sharedSiblingMethod(cursor.options, dir);
        };
        class_5.prototype.siblingCreated = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        class_5.prototype.siblingDeleted = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        class_5.prototype.sharedSiblingMethod = function (_opts, dir) {
            if (dir === R)
                return; // ignore if sibling only changed on the right
            this.domFrag().oneElement().className = plusMinusIsBinaryOperator(this)
                ? 'mq-binary-operator'
                : '';
            return this;
        };
        return class_5;
    }(BinaryOperator));
    LatexCmds['+'] = /** @class */ (function (_super) {
        __extends(class_6, _super);
        function class_6() {
            return _super.call(this, '+', h.text('+')) || this;
        }
        class_6.prototype.mathspeak = function () {
            return plusMinusIsBinaryOperator(this) ? 'plus' : 'positive';
        };
        return class_6;
    }(PlusMinus));
    //yes, these are different dashes, en-dash, em-dash, unicode minus, actual dash
    var MinusNode = /** @class */ (function (_super) {
        __extends(MinusNode, _super);
        function MinusNode() {
            return _super.call(this, '-', h.entityText('&minus;')) || this;
        }
        MinusNode.prototype.mathspeak = function () {
            return plusMinusIsBinaryOperator(this) ? 'minus' : 'negative';
        };
        return MinusNode;
    }(PlusMinus));
    LatexCmds['\u2212'] = LatexCmds['\u2014'] = LatexCmds['\u2013'] = LatexCmds['-'] = MinusNode;
    LatexCmds['\u00b1'] =
        LatexCmds.pm =
            LatexCmds.plusmn =
                LatexCmds.plusminus =
                    function () { return new PlusMinus('\\pm ', h.entityText('&plusmn;'), 'plus-or-minus'); };
    LatexCmds['\u2213'] =
        LatexCmds.mp =
            LatexCmds.mnplus =
                LatexCmds.minusplus =
                    function () { return new PlusMinus('\\mp ', h.entityText('&#8723;'), 'minus-or-plus'); };
    CharCmds['*'] =
        LatexCmds.sdot =
            LatexCmds.cdot =
                bindBinaryOperator('\\cdot ', '&middot;', '*', 'times'); //semantically should be &sdot;, but &middot; looks better
    var To = /** @class */ (function (_super) {
        __extends(To, _super);
        function To() {
            return _super.call(this, '\\to ', h.entityText('&rarr;'), 'to') || this;
        }
        To.prototype.deleteTowards = function (dir, cursor) {
            if (dir === L) {
                var l = cursor[L];
                new Fragment(l, this).remove();
                cursor[L] = l[L];
                new MinusNode().createLeftOf(cursor);
                cursor[L].bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
                return;
            }
            _super.prototype.deleteTowards.call(this, dir, cursor);
        };
        return To;
    }(BinaryOperator));
    LatexCmds['\u2192'] = LatexCmds.to = To;
    var Inequality = /** @class */ (function (_super) {
        __extends(Inequality, _super);
        function Inequality(data, strict) {
            var _this = this;
            var strictness = strict ? 'Strict' : '';
            _this = _super.call(this, data["ctrlSeq".concat(strictness)], h.entityText(data["htmlEntity".concat(strictness)]), data["text".concat(strictness)], data["mathspeak".concat(strictness)]) || this;
            _this.data = data;
            _this.strict = strict;
            return _this;
        }
        Inequality.prototype.swap = function (strict) {
            this.strict = strict;
            var strictness = strict ? 'Strict' : '';
            this.ctrlSeq = this.data["ctrlSeq".concat(strictness)];
            this.domFrag()
                .children()
                .replaceWith(domFrag(h.entityText(this.data["htmlEntity".concat(strictness)])));
            this.textTemplate = [this.data["text".concat(strictness)]];
            this.mathspeakName = this.data["mathspeak".concat(strictness)];
        };
        Inequality.prototype.deleteTowards = function (dir, cursor) {
            if (dir === L && !this.strict) {
                this.swap(true);
                this.bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
                return;
            }
            _super.prototype.deleteTowards.call(this, dir, cursor);
        };
        return Inequality;
    }(BinaryOperator));
    var less = {
        ctrlSeq: '\\le ',
        htmlEntity: '&le;',
        text: '\u2264',
        mathspeak: 'less than or equal to',
        ctrlSeqStrict: '<',
        htmlEntityStrict: '&lt;',
        textStrict: '<',
        mathspeakStrict: 'less than'
    };
    var greater = {
        ctrlSeq: '\\ge ',
        htmlEntity: '&ge;',
        text: '\u2265',
        mathspeak: 'greater than or equal to',
        ctrlSeqStrict: '>',
        htmlEntityStrict: '&gt;',
        textStrict: '>',
        mathspeakStrict: 'greater than'
    };
    var Greater = /** @class */ (function (_super) {
        __extends(Greater, _super);
        function Greater() {
            return _super.call(this, greater, true) || this;
        }
        Greater.prototype.createLeftOf = function (cursor) {
            var cursorL = cursor[L];
            if (cursorL instanceof BinaryOperator && cursorL.ctrlSeq === '-') {
                var l = cursorL;
                cursor[L] = l[L];
                l.remove();
                new To().createLeftOf(cursor);
                cursor[L].bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
                return;
            }
            _super.prototype.createLeftOf.call(this, cursor);
        };
        return Greater;
    }(Inequality));
    LatexCmds['<'] = LatexCmds.lt = function () { return new Inequality(less, true); };
    LatexCmds['>'] = LatexCmds.gt = Greater;
    LatexCmds['\u2264'] =
        LatexCmds.le =
            LatexCmds.leq =
                function () { return new Inequality(less, false); };
    LatexCmds['\u2265'] =
        LatexCmds.ge =
            LatexCmds.geq =
                function () { return new Inequality(greater, false); };
    LatexCmds['\u221e'] =
        LatexCmds.infty =
            LatexCmds.infin =
                LatexCmds.infinity =
                    bindVanillaSymbol('\\infty ', '&infin;', 'infinity');
    LatexCmds['\u2260'] =
        LatexCmds.ne =
            LatexCmds.neq =
                bindBinaryOperator('\\ne ', '&ne;', 'not equal');
    var Equality = /** @class */ (function (_super) {
        __extends(Equality, _super);
        function Equality() {
            return _super.call(this, '=', h.text('='), '=', 'equals') || this;
        }
        Equality.prototype.createLeftOf = function (cursor) {
            var cursorL = cursor[L];
            if (cursorL instanceof Inequality && cursorL.strict) {
                cursorL.swap(false);
                cursorL.bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
                return;
            }
            _super.prototype.createLeftOf.call(this, cursor);
        };
        return Equality;
    }(BinaryOperator));
    LatexCmds['='] = Equality;
    LatexCmds['\u00d7'] =
        LatexCmds.times =
            LatexCmds.cross =
                bindBinaryOperator('\\times ', '&times;', '[x]', 'times');
    LatexCmds['\u00f7'] =
        LatexCmds.div =
            LatexCmds.divide =
                LatexCmds.divides =
                    bindBinaryOperator('\\div ', '&divide;', '[/]', 'divided by');
    var Sim = /** @class */ (function (_super) {
        __extends(Sim, _super);
        function Sim() {
            return _super.call(this, '\\sim ', h.text('~'), '~', 'tilde') || this;
        }
        Sim.prototype.createLeftOf = function (cursor) {
            if (cursor[L] instanceof Sim) {
                var l = cursor[L];
                cursor[L] = l[L];
                l.remove();
                new Approx().createLeftOf(cursor);
                cursor[L].bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
                return;
            }
            _super.prototype.createLeftOf.call(this, cursor);
        };
        return Sim;
    }(BinaryOperator));
    var Approx = /** @class */ (function (_super) {
        __extends(Approx, _super);
        function Approx() {
            return _super.call(this, '\\approx ', h.entityText('&approx;'), '\u2248', 'approximately equal') || this;
        }
        Approx.prototype.deleteTowards = function (dir, cursor) {
            if (dir === L) {
                var l = cursor[L];
                new Fragment(l, this).remove();
                cursor[L] = l[L];
                new Sim().createLeftOf(cursor);
                cursor[L].bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
                return;
            }
            _super.prototype.deleteTowards.call(this, dir, cursor);
        };
        return Approx;
    }(BinaryOperator));
    LatexCmds.tildeNbsp = bindVanillaSymbol('~', U_NO_BREAK_SPACE, ' ');
    LatexCmds.sim = Sim;
    LatexCmds['\u2248'] = LatexCmds.approx = Approx;
    // When interpreting raw LaTeX, we can either evaluate the tilde as its standard nonbreaking space
    // or transform it to the \sim operator depending on whether the "interpretTildeAsSim" configuration option is set.
    // Tilde symbols input from a keyboard will always be transformed to \sim.
    CharCmds['~'] = LatexCmds.sim;
    LatexCmds['~'] = LatexCmds.tildeNbsp;
    baseOptionProcessors.interpretTildeAsSim = function (val) {
        var interpretAsSim = !!val;
        if (interpretAsSim) {
            LatexCmds['~'] = LatexCmds.sim;
        }
        else {
            LatexCmds['~'] = LatexCmds.tildeNbsp;
        }
        return interpretAsSim;
    };
    LatexCmds['\u25ef'] = LatexCmds.bigcirc = bindVanillaSymbol('\\bigcirc ', '&#9711;', 'circle');
    LatexCmds['\u2220'] =
        LatexCmds.ang =
            LatexCmds.angle =
                bindVanillaSymbol('\\angle ', '&ang;', 'angle');
    // Using degree instead of ^\circ for compatibility
    // with a pasted in unicode degree symbol
    LatexCmds['\u00b0'] = LatexCmds.degree = bindVanillaSymbol('\\degree ', '&deg;', 'degrees');
    LatexCmds['\u25b3'] = LatexCmds.triangle = bindVanillaSymbol('\\triangle ', '&#9651;', 'triangle');
    LatexCmds['\u2245'] = LatexCmds.cong = bindBinaryOperator('\\cong ', '&cong;', 'cong', 'congruent');
    LatexCmds['\u2221'] = LatexCmds.measuredangle = bindVanillaSymbol('\\measuredangle ', '&#8737;', 'measured angle');
    //not real LaTex command see https://github.com/mathquill/mathquill/pull/552 for more details
    LatexCmds['\u25b1'] = LatexCmds.parallelogram = bindVanillaSymbol('\\parallelogram ', '&#9649;', 'parallelogram');
    LatexCmds['\u2247'] = LatexCmds.ncong = bindBinaryOperator('\\ncong ', '&ncong;', 'ncong', 'not congruent');
    LatexCmds['\u2241'] = LatexCmds.nsim = bindBinaryOperator('\\nsim ', '&nsim;', 'nsim', 'not similar');
    /***************************
     * Commands and Operators.
     **************************/
    var SVG_SYMBOLS = {
        sqrt: {
            width: '',
            html: function () {
                return h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 32 54' }, [
                    h('path', {
                        d: 'M0 33 L7 27 L12.5 47 L13 47 L30 0 L32 0 L13 54 L11 54 L4.5 31 L0 33'
                    })
                ]);
            }
        },
        '|': {
            width: '.4em',
            html: function () {
                return h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 10 54' }, [
                    h('path', { d: 'M4.4 0 L4.4 54 L5.6 54 L5.6 0' })
                ]);
            }
        },
        '[': {
            width: '.55em',
            html: function () {
                return h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 11 24' }, [
                    h('path', { d: 'M8 0 L3 0 L3 24 L8 24 L8 23 L4 23 L4 1 L8 1' })
                ]);
            }
        },
        ']': {
            width: '.55em',
            html: function () {
                return h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 11 24' }, [
                    h('path', { d: 'M3 0 L8 0 L8 24 L3 24 L3 23 L7 23 L7 1 L3 1' })
                ]);
            }
        },
        '(': {
            width: '.55em',
            html: function () {
                return h('svg', { preserveAspectRatio: 'none', viewBox: '3 0 106 186' }, [
                    h('path', {
                        d: 'M85 0 A61 101 0 0 0 85 186 L75 186 A75 101 0 0 1 75 0'
                    })
                ]);
            }
        },
        ')': {
            width: '.55em',
            html: function () {
                return h('svg', { preserveAspectRatio: 'none', viewBox: '3 0 106 186' }, [
                    h('path', {
                        d: 'M24 0 A61 101 0 0 1 24 186 L34 186 A75 101 0 0 0 34 0'
                    })
                ]);
            }
        },
        '{': {
            width: '.7em',
            html: function () {
                return h('svg', { preserveAspectRatio: 'none', viewBox: '10 0 210 350' }, [
                    h('path', {
                        d: 'M170 0 L170 6 A47 52 0 0 0 123 60 L123 127 A35 48 0 0 1 88 175 A35 48 0 0 1 123 223 L123 290 A47 52 0 0 0 170 344 L170 350 L160 350 A58 49 0 0 1 102 301 L103 220 A45 40 0 0 0 58 180 L58 170 A45 40 0 0 0 103 130 L103 49 A58 49 0 0 1 161 0'
                    })
                ]);
            }
        },
        '}': {
            width: '.7em',
            html: function () {
                return h('svg', { preserveAspectRatio: 'none', viewBox: '10 0 210 350' }, [
                    h('path', {
                        d: 'M60 0 L60 6 A47 52 0 0 1 107 60 L107 127 A35 48 0 0 0 142 175 A35 48 0 0 0 107 223 L107 290 A47 52 0 0 1 60 344 L60 350 L70 350 A58 49 0 0 0 128 301 L127 220 A45 40 0 0 1 172 180 L172 170 A45 40 0 0 1 127 130 L127 49 A58 49 0 0 0 70 0'
                    })
                ]);
            }
        },
        '&#8741;': {
            width: '.7em',
            html: function () {
                return h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 10 54' }, [
                    h('path', { d: 'M3.2 0 L3.2 54 L4 54 L4 0 M6.8 0 L6.8 54 L6 54 L6 0' })
                ]);
            }
        },
        '&lang;': {
            width: '.55em',
            html: function () {
                return h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 10 54' }, [
                    h('path', { d: 'M6.8 0 L3.2 27 L6.8 54 L7.8 54 L4.2 27 L7.8 0' })
                ]);
            }
        },
        '&rang;': {
            width: '.55em',
            html: function () {
                return h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 10 54' }, [
                    h('path', { d: 'M3.2 0 L6.8 27 L3.2 54 L2.2 54 L5.8 27 L2.2 0' })
                ]);
            }
        }
    };
    var ArrowText = '\u27A4';
    var Style = /** @class */ (function (_super) {
        __extends(Style, _super);
        function Style(ctrlSeq, tagName, attrs, ariaLabel, opts) {
            var _this = _super.call(this, ctrlSeq, new DOMView(1, function (blocks) {
                var _c, _d;
                return h.block(tagName, attrs, blocks[0], {
                    beforeChild: (_c = opts === null || opts === void 0 ? void 0 : opts.beforeChild) === null || _c === void 0 ? void 0 : _c.call(opts),
                    afterChild: (_d = opts === null || opts === void 0 ? void 0 : opts.afterChild) === null || _d === void 0 ? void 0 : _d.call(opts)
                });
            })) || this;
            _this.ariaLabel = ariaLabel || ctrlSeq.replace(/^\\/, '');
            _this.mathspeakTemplate = [
                'Start' + _this.ariaLabel + ',',
                'End' + _this.ariaLabel
            ];
            // In most cases, mathspeak should announce the start and end of style blocks.
            // There is one exception currently (mathrm).
            _this.shouldNotSpeakDelimiters = opts && opts.shouldNotSpeakDelimiters;
            return _this;
        }
        Style.prototype.mathspeak = function (opts) {
            if (!this.shouldNotSpeakDelimiters || (opts && opts.ignoreShorthand)) {
                return _super.prototype.mathspeak.call(this);
            }
            return this.foldChildren('', function (speech, block) {
                return speech + ' ' + block.mathspeak(opts);
            }).trim();
        };
        return Style;
    }(MathCommand));
    //fonts
    LatexCmds.mathrm = /** @class */ (function (_super) {
        __extends(mathrm, _super);
        function mathrm() {
            return _super.call(this, '\\mathrm', 'span', { class: 'mq-roman mq-font' }, 'Roman Font', {
                shouldNotSpeakDelimiters: true
            }) || this;
        }
        mathrm.prototype.isTextBlock = function () {
            return true;
        };
        return mathrm;
    }(Style));
    LatexCmds.mathit = function () {
        return new Style('\\mathit', 'i', { class: 'mq-font' }, 'Italic Font');
    };
    LatexCmds.mathbf = function () {
        return new Style('\\mathbf', 'b', { class: 'mq-font' }, 'Bold Font');
    };
    LatexCmds.mathsf = function () {
        return new Style('\\mathsf', 'span', { class: 'mq-sans-serif mq-font' }, 'Serif Font');
    };
    LatexCmds.mathtt = function () {
        return new Style('\\mathtt', 'span', { class: 'mq-monospace mq-font' }, 'Math Text');
    };
    // MATHCOMPILE: \mathcal \mathscr \mathfrak \bold moved to extraCommands.ts
    //text-decoration
    LatexCmds.underline = function () {
        return new Style('\\underline', 'span', { class: 'mq-non-leaf mq-underline' }, 'Underline');
    };
    LatexCmds.overline = LatexCmds.bar = function () {
        return new Style('\\overline', 'span', { class: 'mq-non-leaf mq-overline' }, 'Overline');
    };
    LatexCmds.overrightarrow = function () {
        return new Style('\\overrightarrow', 'span', { class: 'mq-non-leaf mq-overarrow' }, 'Over Right Arrow', {
            afterChild: function () {
                return h('span', { class: 'mq-arrow-right-content' }, [h.text(ArrowText)]);
            }
        });
    };
    LatexCmds.overleftarrow = function () {
        return new Style('\\overleftarrow', 'span', { class: 'mq-non-leaf mq-overarrow' }, 'Over Left Arrow', {
            beforeChild: function () {
                return h('span', { class: 'mq-arrow-left-content' }, [h.text(ArrowText)]);
            }
        });
    };
    LatexCmds.overleftrightarrow = function () {
        return new Style('\\overleftrightarrow ', 'span', { class: 'mq-non-leaf mq-overarrow' }, 'Over Left and Right Arrow', {
            beforeChild: function () {
                return h('span', { class: 'mq-arrow-left-content' }, [h.text(ArrowText)]);
            },
            afterChild: function () {
                return h('span', { class: 'mq-arrow-right-content' }, [h.text(ArrowText)]);
            }
        });
    };
    LatexCmds.overarc = function () {
        return new Style('\\overarc', 'span', { class: 'mq-non-leaf mq-overarc' }, 'Over Arc');
    };
    LatexCmds.dot = function () {
        return new MathCommand('\\dot', new DOMView(1, function (blocks) {
            return h('span', { class: 'mq-non-leaf' }, [
                h('span', { class: 'mq-dot-recurring-inner' }, [
                    h('span', { class: 'mq-dot-recurring' }, [h.text(U_DOT_ABOVE)]),
                    h.block('span', { class: 'mq-empty-box' }, blocks[0])
                ])
            ]);
        }));
    };
    // MATHCOMPILE: \boxed moved to extraCommands.ts
    // MATHCOMPILE: \underbrace \overbrace moved to extraCommands.ts
    // `\textcolor{color}{math}` will apply a color to the given math content, where
    // `color` is any valid CSS Color Value (see [SitePoint docs][] (recommended),
    // [Mozilla docs][], or [W3C spec][]).
    //
    // [SitePoint docs]: http://reference.sitepoint.com/css/colorvalues
    // [Mozilla docs]: https://developer.mozilla.org/en-US/docs/CSS/color_value#Values
    // [W3C spec]: http://dev.w3.org/csswg/css3-color/#colorunits
    LatexCmds.textcolor = /** @class */ (function (_super) {
        __extends(class_7, _super);
        function class_7() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            // MATHCOMPILE: \textcolor[model]{color}{...} \u2014 optional color-model arg (parse + serialize)
            _this.model = '';
            return _this;
        }
        // Parser-only command: typing '\textcolor' in the command input
        // can't supply a color argument, so typed insertion is a no-op
        // (same convention as \operatorname / \mathbb).
        class_7.prototype.createLeftOf = function () { };
        class_7.prototype.numBlocks = function () {
            return 1;
        };
        class_7.prototype.setColor = function (color) {
            this.color = color;
            this.domView = new DOMView(1, function (blocks) {
                return h.block('span', { class: 'mq-textcolor', style: 'color:' + color }, blocks[0]);
            });
            this.ariaLabel = color.replace(/^\\/, '');
            this.mathspeakTemplate = [
                'Start ' + this.ariaLabel + ',',
                'End ' + this.ariaLabel
            ];
        };
        class_7.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            var blocks0 = this.blocks[0];
            ctx.uncleanedLatex +=
                '\\textcolor' +
                    (this.model ? '[' + this.model + ']' : '') +
                    '{' +
                    this.color +
                    '}{';
            blocks0.latexRecursive(ctx);
            ctx.uncleanedLatex += '}';
            this.checkCursorContextClose(ctx);
        };
        class_7.prototype.parser = function () {
            var _this = this;
            var optWhitespace = Parser.optWhitespace;
            var string = Parser.string;
            var regex = Parser.regex;
            var self = this;
            return optWhitespace
                .then(regex(/^\[[a-zA-Z]+\]/).or(Parser.succeed('')))
                .then(function (model) {
                if (model)
                    self.model = model.slice(1, -1);
                return string('{')
                    .then(regex(/^[#\w\s.,()%-]*/))
                    .skip(string('}'));
            })
                .then(function (color) {
                _this.setColor(color);
                return _super.prototype.parser.call(_this);
            });
        };
        class_7.prototype.isStyleBlock = function () {
            return true;
        };
        return class_7;
    }(MathCommand));
    // MATHCOMPILE: \color \colorbox \fcolorbox \href moved to extraCommands.ts
    // MATHCOMPILE: \overset \stackrel \underset \pmod \pod \bmod \mod moved to extraCommands.ts
    // Very similar to the \textcolor command, but will add the given CSS class.
    // Usage: \class{classname}{math}
    // Note regex that whitelists valid CSS classname characters:
    // https://github.com/mathquill/mathquill/pull/191#discussion_r4327442
    var Class = (LatexCmds['class'] = /** @class */ (function (_super) {
        __extends(class_8, _super);
        function class_8() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        // MATHCOMPILE: Parser-only command, see \textcolor.
        class_8.prototype.createLeftOf = function () { };
        class_8.prototype.numBlocks = function () {
            return 1;
        };
        class_8.prototype.parser = function () {
            var _this = this;
            var string = Parser.string, regex = Parser.regex;
            return Parser.optWhitespace
                .then(string('{'))
                .then(regex(/^[-\w\s\\\xA0-\xFF]*/))
                .skip(string('}'))
                .then(function (cls) {
                _this.cls = cls || '';
                _this.domView = new DOMView(1, function (blocks) {
                    return h.block('span', { class: "mq-class ".concat(cls) }, blocks[0]);
                });
                _this.ariaLabel = cls + ' class';
                _this.mathspeakTemplate = [
                    'Start ' + _this.ariaLabel + ',',
                    'End ' + _this.ariaLabel
                ];
                return _super.prototype.parser.call(_this);
            });
        };
        class_8.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            var blocks0 = this.blocks[0];
            ctx.uncleanedLatex += '\\class{' + this.cls + '}{';
            blocks0.latexRecursive(ctx);
            ctx.uncleanedLatex += '}';
            this.checkCursorContextClose(ctx);
        };
        class_8.prototype.isStyleBlock = function () {
            return true;
        };
        return class_8;
    }(MathCommand)));
    // This test is used to determine whether an item may be treated as a whole number
    // for shortening the verbalized (mathspeak) forms of some fractions and superscripts.
    var intRgx = /^[\+\-]?[\d]+$/;
    // Traverses the top level of the passed block's children and returns the concatenation of their ctrlSeq properties.
    // Used in shortened mathspeak computations as a block's .text() method can be potentially expensive.
    //
    function getCtrlSeqsFromBlock(block) {
        if (!block)
            return '';
        var chars = '';
        block.eachChild(function (child) {
            if (child.ctrlSeq !== undefined)
                chars += child.ctrlSeq;
        });
        return chars;
    }
    Options.prototype.charsThatBreakOutOfSupSub = '';
    /**
     * A SupSub node is a superscript, subscript, or both. It is possible to edit a SupSub node
     * from being a superscript to a subscript without deleting the node by adding a subscript
     * then deleting the superscript.
     */
    var SupSub = /** @class */ (function (_super) {
        __extends(SupSub, _super);
        function SupSub(supsub) {
            var _this = this;
            var ctrlSeq = '_{...}^{...}';
            var domView;
            // Note this.domView doesn't change if the SupSub is edited to something that has both
            // superscript and subscript. This is correct, since domView is only used for the initial
            // creation of the HTML node, not for any updates.
            if (supsub === 'sub') {
                domView = new DOMView(1, function (blocks) {
                    return h('span', { class: 'mq-supsub mq-non-leaf' }, [
                        h.block('span', { class: 'mq-sub' }, blocks[0]),
                        h('span', { style: 'display:inline-block;width:0' }, [
                            h.text(U_ZERO_WIDTH_SPACE)
                        ])
                    ]);
                });
            }
            else {
                domView = new DOMView(1, function (blocks) {
                    return h('span', { class: 'mq-supsub mq-non-leaf mq-sup-only' }, [
                        h.block('span', { class: 'mq-sup' }, blocks[0])
                    ]);
                });
            }
            _this = _super.call(this, ctrlSeq, domView) || this;
            // Note the ariaLabel doesn't change if the SupSub is edited between subscript and superscript.
            // That may be a bug, though I don't know where the ariaLabel is actually used; the mathspeak
            // method doesn't reference it.
            _this.ariaLabel = supsub === 'sub' ? 'subscript' : 'superscript';
            _this.supsub = supsub;
            return _this;
        }
        SupSub.prototype.setEnds = function (ends) {
            pray('SupSub ends must be MathBlocks', ends[L] instanceof MathBlock && ends[R] instanceof MathBlock);
            this.ends = ends;
        };
        SupSub.prototype.getEnd = function (dir) {
            return this.ends[dir];
        };
        SupSub.prototype.createLeftOf = function (cursor) {
            if (!this.replacedFragment &&
                !cursor[L] &&
                cursor.options.supSubsRequireOperand)
                return;
            return _super.prototype.createLeftOf.call(this, cursor);
        };
        SupSub.prototype.contactWeld = function (cursor) {
            // Look on either side for a SupSub, if one is found compare my
            // .sub, .sup with its .sub, .sup. If I have one that it doesn't,
            // then call .addBlock() on it with my block; if I have one that
            // it also has, then insert my block's children into its block,
            // unless my block has none, in which case insert the cursor into
            // its block (and not mine, I'm about to remove myself) in the case
            // I was just typed.
            // TODO: simplify
            // equiv. to [L, R].forEach(function(dir) { ... });
            for (var dir = L; dir; dir = dir === L ? R : false) {
                var thisDir = this[dir];
                var pt = void 0;
                if (thisDir instanceof SupSub) {
                    // equiv. to 'sub sup'.split(' ').forEach(function(supsub) { ... });
                    for (var supsub = 'sub'; supsub; supsub = supsub === 'sub' ? 'sup' : false) {
                        var src = this[supsub], dest = thisDir[supsub];
                        if (!src)
                            continue;
                        if (!dest)
                            thisDir.addBlock(src.disown());
                        else if (!src.isEmpty()) {
                            // ins src children at -dir end of dest
                            src
                                .domFrag()
                                .children()
                                .insAtDirEnd(-dir, dest.domFrag().oneElement());
                            var children = src.children().disown();
                            pt = new Point(dest, children.getEnd(R), dest.getEnd(L));
                            if (dir === L)
                                children.adopt(dest, dest.getEnd(R), 0);
                            else
                                children.adopt(dest, 0, dest.getEnd(L));
                        }
                        else {
                            pt = new Point(dest, 0, dest.getEnd(L));
                        }
                        this.placeCursor = (function (dest, src) {
                            // TODO: don't monkey-patch
                            return function (cursor) {
                                cursor.insAtDirEnd(-dir, dest || src);
                            };
                        })(dest, src);
                    }
                    this.remove();
                    if (cursor && cursor[L] === this) {
                        if (dir === R && pt) {
                            if (pt[L]) {
                                cursor.insRightOf(pt[L]);
                            }
                            else {
                                cursor.insAtLeftEnd(pt.parent);
                            }
                        }
                        else
                            cursor.insRightOf(thisDir);
                    }
                    break;
                }
            }
        };
        SupSub.prototype.finalizeTree = function () {
            if (this.supsub === 'sub') {
                this.downInto = this.sub = this.getEnd(L);
                this.sub.upOutOf = insLeftOfMeUnlessAtEnd;
            }
            else if (this.supsub === 'sup') {
                this.upInto = this.sup = this.getEnd(R);
                this.sup.downOutOf = insLeftOfMeUnlessAtEnd;
            }
            var endsL = this.getEnd(L);
            endsL.write = function (cursor, ch) {
                if (cursor.options.autoSubscriptNumerals &&
                    this === this.parent.sub &&
                    '0123456789'.indexOf(ch) >= 0) {
                    var cmd = this.chToCmd(ch, cursor.options);
                    if (cmd instanceof MQSymbol)
                        cursor.deleteSelection();
                    else
                        cursor.clearSelection().insRightOf(this.parent);
                    cmd.createLeftOf(cursor.show());
                    cursor.controller.aria
                        .queue('Baseline')
                        .alert(cmd.mathspeak({ createdLeftOf: cursor }));
                    return;
                }
                if (cursor[L] &&
                    !cursor[R] &&
                    !cursor.selection &&
                    cursor.options.charsThatBreakOutOfSupSub.indexOf(ch) > -1) {
                    cursor.insRightOf(this.parent);
                    cursor.controller.aria.queue('Baseline');
                }
                MathBlock.prototype.write.call(this, cursor, ch);
            };
        };
        SupSub.prototype.moveTowards = function (dir, cursor, updown) {
            if (cursor.options.autoSubscriptNumerals && !this.sup) {
                cursor.insDirOf(dir, this);
            }
            else
                _super.prototype.moveTowards.call(this, dir, cursor, updown);
        };
        SupSub.prototype.deleteTowards = function (dir, cursor) {
            if (cursor.options.autoSubscriptNumerals && this.sub) {
                var cmd = this.sub.getEnd(-dir);
                if (cmd instanceof MQSymbol)
                    cmd.remove();
                else if (cmd)
                    cmd.deleteTowards(dir, cursor.insAtDirEnd(-dir, this.sub));
                // TODO: factor out a .removeBlock() or something
                if (this.sub.isEmpty()) {
                    this.sub.deleteOutOf(L, cursor.insAtLeftEnd(this.sub));
                    if (this.sup)
                        cursor.insDirOf(-dir, this);
                    // Note `-dir` because in e.g. x_1^2| want backspacing (leftward)
                    // to delete the 1 but to end up rightward of x^2; with non-negated
                    // `dir` (try it), the cursor appears to have gone "through" the ^2.
                }
            }
            else
                _super.prototype.deleteTowards.call(this, dir, cursor);
        };
        SupSub.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            if (this.sub) {
                ctx.uncleanedLatex += '_{';
                var beforeLength = ctx.uncleanedLatex.length;
                this.sub.latexRecursive(ctx);
                var afterLength = ctx.uncleanedLatex.length;
                if (beforeLength === afterLength) {
                    // nothing was written. so we write a space
                    ctx.uncleanedLatex += ' ';
                }
                ctx.uncleanedLatex += '}';
            }
            if (this.sup) {
                ctx.uncleanedLatex += '^{';
                var beforeLength = ctx.uncleanedLatex.length;
                this.sup.latexRecursive(ctx);
                var afterLength = ctx.uncleanedLatex.length;
                if (beforeLength === afterLength) {
                    // nothing was written. so we write a space
                    ctx.uncleanedLatex += ' ';
                }
                ctx.uncleanedLatex += '}';
            }
            this.checkCursorContextClose(ctx);
        };
        SupSub.prototype.mathspeak = function (opts) {
            // Simplify basic exponent speech for common whole numbers.
            if (this.sup !== undefined) {
                // Calculate this item's inner text to determine whether to shorten the returned speech.
                // Do not calculate its inner mathspeak now until we know that the speech is to be truncated.
                // Since the mathspeak computation is recursive, we want to call it only once in this function to avoid performance bottlenecks.
                var innerText = getCtrlSeqsFromBlock(this.sup);
                // If the superscript is a whole number, shorten the speech that is returned.
                if ((!opts || !opts.ignoreShorthand) && intRgx.test(innerText)) {
                    var prefix = '';
                    if (this.sub) {
                        prefix =
                            subMathspeakTemplate[0] +
                                ' ' +
                                this.sub.mathspeak() +
                                ' ' +
                                subMathspeakTemplate[1] +
                                ' ';
                    }
                    return prefix + wholeNumberPower(this.sup, innerText);
                }
            }
            this.mathspeakTemplate = this.getMathspeakTemplate();
            return _super.prototype.mathspeak.call(this);
        };
        SupSub.prototype.getMathspeakTemplate = function () {
            if (this.sub && this.sup) {
                return supSubMathspeakTemplate;
            }
            else if (this.sup) {
                return supMathspeakTemplate;
            }
            else {
                return subMathspeakTemplate;
            }
        };
        SupSub.prototype.text = function () {
            function text(prefix, block) {
                var l = (block && block.text()) || '';
                return block
                    ? prefix + (l.length === 1 ? l : '(' + (l || ' ') + ')')
                    : '';
            }
            return text('_', this.sub) + text('^', this.sup);
        };
        // This function is called, for example, when parsing `x_1^2`.
        // In that case, first a `SupSub("sup")` is created (i.e. a superscript) representing `x^2`,
        // (with the superscript `2` being added in `finalizeTree`), then the subscript `1` is added
        // with `addBlock`.
        SupSub.prototype.addBlock = function (block) {
            if (this.supsub === 'sub') {
                this.sup = this.upInto = this.sub.upOutOf = block;
                block.adopt(this, this.sub, 0).downOutOf = this.sub;
                block.setDOM(domFrag(h('span', { class: 'mq-sup' }))
                    .append(block.domFrag().children())
                    .prependTo(this.domFrag().oneElement())
                    .oneElement());
                NodeBase.linkElementByBlockNode(block.domFrag().oneElement(), block);
            }
            else {
                this.sub = this.downInto = this.sup.downOutOf = block;
                block.adopt(this, 0, this.sup).upOutOf = this.sup;
                this.domFrag().removeClass('mq-sup-only');
                block.setDOM(domFrag(h('span', { class: 'mq-sub' }))
                    .append(block.domFrag().children())
                    .appendTo(this.domFrag().oneElement())
                    .oneElement());
                NodeBase.linkElementByBlockNode(block.domFrag().oneElement(), block);
                this.domFrag().append(domFrag(h('span', { style: 'display:inline-block;width:0' }, [
                    h.text(U_ZERO_WIDTH_SPACE)
                ])));
            }
            var _loop_4 = function (i) {
                var cmd = this_4;
                var supsub = ['sub', 'sup'][i];
                var oppositeSupsub = ['sup', 'sub'][i];
                var updown = ['down', 'up'][i];
                var cmdSubSub = cmd[supsub];
                cmdSubSub.deleteOutOf = function (dir, cursor) {
                    cursor.insDirOf(this[dir] ? -dir : dir, this.parent);
                    if (!this.isEmpty()) {
                        var end = this.getEnd(dir);
                        this.children()
                            .disown()
                            .withDirAdopt(dir, cursor.parent, cursor[dir], cursor[-dir])
                            .domFrag()
                            .insDirOf(-dir, cursor.domFrag());
                        cursor[-dir] = end;
                    }
                    cmd.supsub = oppositeSupsub;
                    delete cmd[supsub];
                    delete cmd["".concat(updown, "Into")];
                    var cmdOppositeSupsub = cmd[oppositeSupsub];
                    cmdOppositeSupsub["".concat(updown, "OutOf")] = insLeftOfMeUnlessAtEnd;
                    delete cmdOppositeSupsub.deleteOutOf; // TODO - refactor so this method can be optional
                    if (supsub === 'sub') {
                        cmd.domFrag().addClass('mq-sup-only').children().last().remove();
                    }
                    this.remove();
                };
            };
            var this_4 = this;
            for (var i = 0; i < 2; i += 1) {
                _loop_4(i);
            }
        };
        return SupSub;
    }(MathCommand));
    function insLeftOfMeUnlessAtEnd(cursor) {
        // cursor.insLeftOf(cmd), unless cursor at the end of block, and every
        // ancestor cmd is at the end of every ancestor block
        var cmd = this.parent;
        var ancestorCmd = cursor;
        do {
            if (ancestorCmd[R])
                return cursor.insLeftOf(cmd);
            ancestorCmd = ancestorCmd.parent.parent;
        } while (ancestorCmd !== cmd);
        cursor.insRightOf(cmd);
        return undefined;
    }
    var subMathspeakTemplate = ['Subscript,', ', Baseline'];
    var supMathspeakTemplate = ['Superscript,', ', Baseline'];
    var supSubMathspeakTemplate = [
        'Subscript,',
        ', Baseline Superscript,',
        ', Baseline'
    ];
    /** Assumes innerText satisfies the `intRgx` */
    function wholeNumberPower(sup, innerText) {
        // Simple cases
        if (innerText === '0') {
            return 'to the 0 power';
        }
        else if (innerText === '2') {
            return 'squared';
        }
        else if (innerText === '3') {
            return 'cubed';
        }
        // More complex cases.
        var suffix = '';
        // Limit suffix addition to exponents < 1000.
        if (/^[+-]?\d{1,3}$/.test(innerText)) {
            if (/(11|12|13|4|5|6|7|8|9|0)$/.test(innerText)) {
                suffix = 'th';
            }
            else if (/1$/.test(innerText)) {
                suffix = 'st';
            }
            else if (/2$/.test(innerText)) {
                suffix = 'nd';
            }
            else if (/3$/.test(innerText)) {
                suffix = 'rd';
            }
        }
        var innerMathspeak = typeof sup === 'object' ? sup.mathspeak() : innerText;
        return 'to the ' + innerMathspeak + suffix + ' power';
    }
    LatexCmds.subscript = LatexCmds._ = function () { return new SupSub('sub'); };
    LatexCmds.superscript =
        LatexCmds.supscript =
            LatexCmds['^'] =
                function () { return new SupSub('sup'); };
    var SummationNotation = /** @class */ (function (_super) {
        __extends(SummationNotation, _super);
        function SummationNotation(ch, symbol, ariaLabel) {
            var _this = _super.call(this) || this;
            _this.ariaLabel = ariaLabel || ch.replace(/^\\/, '');
            var domView = new DOMView(2, function (blocks) {
                return h('span', { class: 'mq-large-operator mq-non-leaf' }, [
                    h('span', { class: 'mq-to' }, [h.block('span', {}, blocks[1])]),
                    // MATHCOMPILE: entityText so \sum-style glyphs render (upstream h.text printed entities literally)
                    h('big', {}, [h.entityText(symbol)]),
                    h('span', { class: 'mq-from' }, [h.block('span', {}, blocks[0])])
                ]);
            });
            MQSymbol.prototype.setCtrlSeqHtmlTextAndMathspeak.call(_this, ch, domView);
            return _this;
        }
        SummationNotation.prototype.createLeftOf = function (cursor) {
            _super.prototype.createLeftOf.call(this, cursor);
            if (cursor.options.sumStartsWithNEquals) {
                new Letter('n').createLeftOf(cursor);
                new Equality().createLeftOf(cursor);
            }
        };
        SummationNotation.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            ctx.uncleanedLatex += this.ctrlSeq + (this.limitsCtrlSeq || '') + '_{';
            var beforeLength = ctx.uncleanedLatex.length;
            this.getEnd(L).latexRecursive(ctx);
            var afterLength = ctx.uncleanedLatex.length;
            if (afterLength === beforeLength) {
                // nothing was written so we write a space
                ctx.uncleanedLatex += ' ';
            }
            ctx.uncleanedLatex += '}^{';
            beforeLength = ctx.uncleanedLatex.length;
            this.getEnd(R).latexRecursive(ctx);
            afterLength = ctx.uncleanedLatex.length;
            if (beforeLength === afterLength) {
                // nothing was written so we write a space
                ctx.uncleanedLatex += ' ';
            }
            ctx.uncleanedLatex += '}';
            this.checkCursorContextClose(ctx);
        };
        SummationNotation.prototype.mathspeak = function () {
            return ('Start ' +
                this.ariaLabel +
                ' from ' +
                this.getEnd(L).mathspeak() +
                ' to ' +
                this.getEnd(R).mathspeak() +
                ', end ' +
                this.ariaLabel +
                ', ');
        };
        SummationNotation.prototype.parser = function () {
            var string = Parser.string;
            var optWhitespace = Parser.optWhitespace;
            var succeed = Parser.succeed;
            var block = latexMathParser.block;
            var self = this;
            var blocks = (self.blocks = [new MathBlock(), new MathBlock()]);
            for (var i = 0; i < blocks.length; i += 1) {
                blocks[i].adopt(self, self.getEnd(R), 0);
            }
            // MATHCOMPILE: `\sum\limits_{i}^{n}` \u2014 an optional \limits/\nolimits between the
            // operator and its bounds is kept on the node so serialization
            // round-trips it instead of dropping it or leaving { } bounds.
            var optLimits = Parser.regex(/^\\(?:no)?limits(?![a-zA-Z])\s*/)
                .map(function (limits) {
                self.limitsCtrlSeq = limits.trim() + ' ';
                return undefined;
            })
                .or(succeed(''));
            return optWhitespace
                .then(optLimits)
                .then(optWhitespace)
                .then(string('_').or(string('^')))
                .then(function (supOrSub) {
                var child = blocks[supOrSub === '_' ? 0 : 1];
                return block.then(function (block) {
                    block.children().adopt(child, child.getEnd(R), 0);
                    return succeed(self);
                });
            })
                .many()
                .result(self);
        };
        SummationNotation.prototype.finalizeTree = function () {
            var endsL = this.getEnd(L);
            var endsR = this.getEnd(R);
            endsL.ariaLabel = 'lower bound';
            endsR.ariaLabel = 'upper bound';
            this.downInto = endsL;
            this.upInto = endsR;
            endsL.upOutOf = endsR;
            endsR.downOutOf = endsL;
        };
        return SummationNotation;
    }(MathCommand));
    LatexCmds['\u2211'] =
        LatexCmds.sum =
            LatexCmds.summation =
                function () { return new SummationNotation('\\sum ', U_NARY_SUMMATION, 'sum'); };
    LatexCmds['\u220f'] =
        LatexCmds.prod =
            LatexCmds.product =
                function () { return new SummationNotation('\\prod ', U_NARY_PRODUCT, 'product'); };
    LatexCmds.coprod = LatexCmds.coproduct = function () {
        return new SummationNotation('\\coprod ', U_NARY_COPRODUCT, 'co product');
    };
    LatexCmds['\u222b'] =
        LatexCmds['int'] =
            LatexCmds.integral = /** @class */ (function (_super) {
                __extends(class_9, _super);
                function class_9() {
                    var _this = _super.call(this, '\\int ', '', 'integral') || this;
                    _this.ariaLabel = 'integral';
                    _this.domView = new DOMView(2, function (blocks) {
                        return h('span', { class: 'mq-int mq-non-leaf' }, [
                            h('big', {}, [h.text(U_INTEGRAL)]),
                            h('span', { class: 'mq-supsub mq-non-leaf' }, [
                                h('span', { class: 'mq-sup' }, [
                                    h.block('span', { class: 'mq-sup-inner' }, blocks[1])
                                ]),
                                h.block('span', { class: 'mq-sub' }, blocks[0]),
                                h('span', { style: 'display:inline-block;width:0' }, [
                                    h.text(U_ZERO_WIDTH_SPACE)
                                ])
                            ])
                        ]);
                    });
                    return _this;
                }
                class_9.prototype.createLeftOf = function (cursor) {
                    // FIXME: refactor rather than overriding
                    MathCommand.prototype.createLeftOf.call(this, cursor);
                };
                return class_9;
            }(SummationNotation));
    // MATHCOMPILE: boundless \iint \antid \oiint \oiiint moved to extraCommands.ts
    var Fraction = (LatexCmds.frac =
        LatexCmds.dfrac =
            LatexCmds.fraction = /** @class */ (function (_super) {
                __extends(FracNode, _super);
                function FracNode() {
                    var _this = _super !== null && _super.apply(this, arguments) || this;
                    _this.ctrlSeq = '\\frac';
                    _this.domView = new DOMView(2, function (blocks) {
                        return h('span', { class: 'mq-fraction mq-non-leaf' }, [
                            h.block('span', { class: 'mq-numerator' }, blocks[0]),
                            h.block('span', { class: 'mq-denominator' }, blocks[1]),
                            h('span', { style: 'display:inline-block;width:0' }, [
                                h.text(U_ZERO_WIDTH_SPACE)
                            ])
                        ]);
                    });
                    _this.textTemplate = ['(', ')/(', ')'];
                    return _this;
                }
                FracNode.prototype.finalizeTree = function () {
                    var endsL = this.getEnd(L);
                    var endsR = this.getEnd(R);
                    this.upInto = endsR.upOutOf = endsL;
                    this.downInto = endsL.downOutOf = endsR;
                    endsL.ariaLabel = 'numerator';
                    endsR.ariaLabel = 'denominator';
                    if (this.getFracDepth() > 1) {
                        this.mathspeakTemplate = [
                            'StartNestedFraction,',
                            'NestedOver',
                            ', EndNestedFraction'
                        ];
                    }
                    else {
                        this.mathspeakTemplate = ['StartFraction,', 'Over', ', EndFraction'];
                    }
                };
                FracNode.prototype.mathspeak = function (opts) {
                    var _c;
                    if (opts && opts.createdLeftOf) {
                        var cursor = opts.createdLeftOf;
                        return cursor.parent.mathspeak();
                    }
                    var numText = getCtrlSeqsFromBlock(this.getEnd(L));
                    var denText = getCtrlSeqsFromBlock(this.getEnd(R));
                    // Shorten mathspeak value for whole number fractions whose denominator has a special spoken form.
                    if ((!opts || !opts.ignoreShorthand) &&
                        intRgx.test(numText) &&
                        intRgx.test(denText)) {
                        var isSingular = numText === '1' || numText === '-1';
                        var newDenSpeech = '';
                        if (denText === '2') {
                            newDenSpeech = isSingular ? 'half' : 'halves';
                        }
                        else if (denText === '3') {
                            newDenSpeech = isSingular ? 'third' : 'thirds';
                        }
                        else if (denText === '4') {
                            newDenSpeech = isSingular ? 'fourth' : 'fourths';
                        }
                        else if (denText === '5') {
                            newDenSpeech = isSingular ? 'fifth' : 'fifths';
                        }
                        else if (denText === '6') {
                            newDenSpeech = isSingular ? 'sixth' : 'sixths';
                        }
                        else if (denText === '7') {
                            newDenSpeech = isSingular ? 'seventh' : 'sevenths';
                        }
                        else if (denText === '8') {
                            newDenSpeech = isSingular ? 'eighth' : 'eighths';
                        }
                        else if (denText === '9') {
                            newDenSpeech = isSingular ? 'ninth' : 'ninths';
                        }
                        else if (denText === '10') {
                            newDenSpeech = isSingular ? 'tenth' : 'tenths';
                        }
                        else if (denText === '11') {
                            newDenSpeech = isSingular ? 'eleventh' : 'elevenths';
                        }
                        else if (denText === '12') {
                            newDenSpeech = isSingular ? 'twelfth' : 'twelfths';
                        }
                        else if (denText === '100') {
                            newDenSpeech = isSingular ? 'hundredth' : 'hundredths';
                        }
                        if (newDenSpeech !== '') {
                            var output = '';
                            // Handle the case of an integer followed by a simplified fraction such as 1\frac{1}{2}.
                            // Such combinations should be spoken aloud as "1 and 1 half."
                            // Start at the left sibling of the fraction and continue leftward until something other than a digit or whitespace is found.
                            var sawDigit = false;
                            var sibling = void 0;
                            // Scan until you see something other than a digit or space
                            for (sibling = this[L]; sibling &&
                                sibling.ctrlSeq &&
                                (sibling.ctrlSeq === '\\ ' || intRgx.test((_c = sibling.ctrlSeq) !== null && _c !== void 0 ? _c : '')); sibling = sibling[L]) {
                                if (intRgx.test(sibling.ctrlSeq)) {
                                    sawDigit = true;
                                }
                            }
                            var lastNodeSeen = sibling;
                            // `precededByInteger` is true if everything we saw while scanning is digits and spaces, and
                            // we saw at least one digit.
                            var precededByInteger = sawDigit && !(lastNodeSeen && lastNodeSeen.ctrlSeq === '.');
                            if (precededByInteger) {
                                output += 'and ';
                            }
                            output += this.getEnd(L).mathspeak() + ' ' + newDenSpeech;
                            return output;
                        }
                    }
                    return _super.prototype.mathspeak.call(this);
                };
                FracNode.prototype.getFracDepth = function () {
                    var level = 0;
                    var walkUp = function (item, level) {
                        if (item instanceof MQNode &&
                            item.ctrlSeq &&
                            item.ctrlSeq.toLowerCase().search('frac') >= 0)
                            level += 1;
                        if (item && item.parent)
                            return walkUp(item.parent, level);
                        else
                            return level;
                    };
                    return walkUp(this, level);
                };
                return FracNode;
            }(MathCommand)));
    // MATHCOMPILE: \cfrac moved to extraCommands.ts
    var LiveFraction = (LatexCmds.over =
        CharCmds['/'] = /** @class */ (function (_super) {
            __extends(class_10, _super);
            function class_10() {
                return _super !== null && _super.apply(this, arguments) || this;
            }
            // MATHCOMPILE: Pasted `a\over b` (infix) can't bind `a` \u2014 the two-block parse
            // fails. Fall back to a visible `\over` leaf so the input keeps
            // its text instead of blanking the field. The typed `\over`\u2192
            // fraction path is unaffected (it goes through createLeftOf).
            // MathCommand's strict parser is invoked directly: parser()
            // falls back to a bare \frac leaf that would shadow \over's.
            class_10.prototype.parser = function () {
                return MathCommand.prototype.strictParser.call(this).or(Parser.succeed(new VanillaSymbol('\\over ', h.text('\\over'), 'over')));
            };
            class_10.prototype.createLeftOf = function (cursor) {
                if (!this.replacedFragment) {
                    var leftward = cursor[L];
                    var dontScan = cursor.options.typingSlashCreatesNewFraction &&
                        this instanceof Fraction;
                    if (!dontScan) {
                        // The user is typing "/" or "over" or "choose". Scan left to get content inside it.
                        while (leftward &&
                            !(nodeEndsBinaryOperator(leftward) ||
                                (leftward instanceof DigitGroupingChar &&
                                    leftward._groupingClass === 'mq-ellipsis-end') ||
                                leftward instanceof (LatexCmds.text || noop) ||
                                leftward instanceof SummationNotation ||
                                // MATHCOMPILE: stop the numerator scan at a boundless integral like at \sum
                                leftward instanceof BoundlessIntegral ||
                                leftward.ctrlSeq === '\\ ' ||
                                /^[,;:]$/.test(leftward.ctrlSeq)) //lookbehind for operator
                        )
                            leftward = leftward[L];
                    }
                    if ((leftward instanceof SummationNotation ||
                        // MATHCOMPILE: same scan-back for a boundless integral's SupSub
                        leftward instanceof BoundlessIntegral) &&
                        leftward[R] instanceof SupSub) {
                        // The previous step scanned too far. `\sum_1^5` looks like [SummationNotation,SupSub],
                        // so scan back right
                        leftward = leftward[R];
                        var leftwardR = leftward[R];
                        if (leftwardR instanceof SupSub &&
                            leftwardR.ctrlSeq != leftward.ctrlSeq)
                            leftward = leftward[R];
                    }
                    // `leftward` is the first node (from-right-to-left) that is broken on, so
                    // `leftwardR` is the last node (from right-to-left) that should be included in the
                    // top of the Fraction or Binomial.
                    if (leftward !== cursor[L] && !cursor.isTooDeep(1)) {
                        var leftwardR = leftward[R];
                        var cursorL = cursor[L];
                        this.replaces(new Fragment(leftwardR || cursor.parent.getEnd(L), cursorL));
                        cursor[L] = leftward;
                    }
                }
                _super.prototype.createLeftOf.call(this, cursor);
            };
            return class_10;
        }(Fraction)));
    var AnsBuilder = function () {
        return new MQSymbol('\\operatorname{ans}', h('span', { class: 'mq-ans' }, [h.text('ans')]), 'ans');
    };
    LatexCmds.ans = AnsBuilder;
    var PercentOfBuilder = function () {
        return new MQSymbol('\\%\\operatorname{of}', h('span', { class: 'mq-nonSymbola mq-operator-name' }, [h.text('% of ')]), 'percent of');
    };
    LatexCmds.percent = LatexCmds.percentof = PercentOfBuilder;
    /** A Token represents a region in typeset math that is designed to be
     * externally styled and which delegates mousedown events to external
     * handlers.
     *
     * LaTeX syntax: `\token{id}`.
     *
     * Token is designed for similar use cases as EmbedNode. Differences:
     *     * Mousedown events on a Token are not handled by MathQuill (they
     *       are expected to be handled externally).
     *     * The API for Tokens is simpler: they don't require registering
     *       handlers with MathQuill.
     *     * The current syntax for embed (`\embed{name}[id]`) gets the order
     *       of optional and required arguments backwards compared to normal
     *       LaTeX syntax. The syntax of Token is simpler and more in line
     *       with LaTeX
     */
    var Token = /** @class */ (function (_super) {
        __extends(Token, _super);
        function Token() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.tokenId = '';
            _this.ctrlSeq = '\\token';
            _this.textTemplate = ['token(', ')'];
            _this.mathspeakTemplate = ['StartToken,', ', EndToken'];
            _this.ariaLabel = 'token';
            return _this;
        }
        Token.prototype.html = function () {
            var out = h('span', {
                class: 'mq-token mq-ignore-mousedown',
                'data-mq-token': this.tokenId
            });
            this.setDOM(out);
            NodeBase.linkElementByCmdNode(out, this);
            return out;
        };
        Token.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            ctx.uncleanedLatex += "".concat(this.ctrlSeq, "{") + this.tokenId + '}';
            this.checkCursorContextClose(ctx);
        };
        Token.prototype.mathspeak = function () {
            // If the caller responsible for creating this token has set an aria-label attribute for the inner children, use them in the mathspeak calculation.
            var ariaLabelArray = [];
            this.domFrag()
                .children()
                .eachElement(function (el) {
                var label = el.getAttribute('aria-label');
                if (typeof label === 'string' && label !== '')
                    ariaLabelArray.push(label);
            });
            return ariaLabelArray.length > 0
                ? ariaLabelArray.join(' ').trim()
                : 'token ' + this.tokenId;
        };
        Token.prototype.parser = function () {
            var self = this;
            return latexMathParser.block.map(function (block) {
                var digit = block.getEnd(L);
                if (digit) {
                    self.tokenId += digit.ctrlSeq;
                    while ((digit = digit[R])) {
                        self.tokenId += digit.ctrlSeq;
                    }
                }
                return self;
            });
        };
        return Token;
    }(MQSymbol));
    LatexCmds.token = Token;
    /**
     * Similar to Token, but for displaying the name of a token rather than
     * its value. Leverages Token class for functionality allows differentiation
     * for rendering purposes.
     */
    var TokenName = /** @class */ (function (_super) {
        __extends(TokenName, _super);
        function TokenName() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\tokenName';
            _this.textTemplate = ['tokenName(', ')'];
            _this.ariaLabel = 'token name';
            return _this;
        }
        return TokenName;
    }(Token));
    LatexCmds.tokenName = TokenName;
    var SquareRoot = /** @class */ (function (_super) {
        __extends(SquareRoot, _super);
        function SquareRoot() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\sqrt';
            _this.domView = new DOMView(1, function (blocks) {
                return h('span', { class: 'mq-non-leaf mq-sqrt-container' }, [
                    h('span', { class: 'mq-scaled mq-sqrt-prefix' }, [
                        SVG_SYMBOLS.sqrt.html()
                    ]),
                    h.block('span', { class: 'mq-non-leaf mq-sqrt-stem' }, blocks[0])
                ]);
            });
            _this.textTemplate = ['sqrt(', ')'];
            _this.mathspeakTemplate = ['StartRoot,', ', EndRoot'];
            _this.ariaLabel = 'root';
            return _this;
        }
        SquareRoot.prototype.parser = function () {
            return latexMathParser.optBlock
                .then(function (optBlock) {
                return latexMathParser.block.map(function (block) {
                    var nthroot = new NthRoot();
                    nthroot.blocks = [optBlock, block];
                    optBlock.adopt(nthroot, 0, 0);
                    block.adopt(nthroot, optBlock, 0);
                    return nthroot;
                });
            })
                .or(_super.prototype.parser.call(this));
        };
        SquareRoot.prototype.deleteTowards = function (dir, cursor) {
            if (!this.isEmpty() && dir === 1) {
                this.moveTowards(R, cursor);
                cursor.parent.deleteOutOf(L, cursor);
                return;
            }
            // Empty sqrt: delete the sqrt.
            // Delete-left ("Backspace") moves into non-empty sqrts.
            _super.prototype.deleteTowards.call(this, dir, cursor);
        };
        return SquareRoot;
    }(MathCommand));
    LatexCmds.sqrt = CharCmds['\u221a'] = SquareRoot;
    LatexCmds.hat = /** @class */ (function (_super) {
        __extends(Hat, _super);
        function Hat() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\hat';
            _this.domView = new DOMView(1, function (blocks) {
                return h('span', { class: 'mq-non-leaf' }, [
                    h('span', { class: 'mq-hat-prefix' }, [h.text('^')]),
                    h.block('span', { class: 'mq-hat-stem' }, blocks[0])
                ]);
            });
            _this.textTemplate = ['hat(', ')'];
            return _this;
        }
        return Hat;
    }(MathCommand));
    // MATHCOMPILE: \widehat moved to extraCommands.ts
    var NthRoot = /** @class */ (function (_super) {
        __extends(NthRoot, _super);
        function NthRoot() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.domView = new DOMView(2, function (blocks) {
                return h('span', { class: 'mq-nthroot-container mq-non-leaf' }, [
                    h.block('sup', { class: 'mq-nthroot mq-non-leaf' }, blocks[0]),
                    h('span', { class: 'mq-scaled mq-sqrt-container' }, [
                        h('span', { class: 'mq-sqrt-prefix mq-scaled' }, [
                            SVG_SYMBOLS.sqrt.html()
                        ]),
                        h.block('span', { class: 'mq-sqrt-stem mq-non-leaf' }, blocks[1])
                    ])
                ]);
            });
            _this.textTemplate = ['sqrt[', '](', ')'];
            return _this;
        }
        NthRoot.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            ctx.uncleanedLatex += '\\sqrt[';
            this.getEnd(L).latexRecursive(ctx);
            ctx.uncleanedLatex += ']{';
            this.getEnd(R).latexRecursive(ctx);
            ctx.uncleanedLatex += '}';
            this.checkCursorContextClose(ctx);
        };
        NthRoot.prototype.mathspeak = function () {
            var indexMathspeak = this.getEnd(L).mathspeak();
            var radicandMathspeak = this.getEnd(R).mathspeak();
            this.getEnd(L).ariaLabel = 'Index';
            this.getEnd(R).ariaLabel = 'Radicand';
            if (indexMathspeak === '3') {
                // cube root
                return 'Start Cube Root, ' + radicandMathspeak + ', End Cube Root';
            }
            else {
                return ('Root Index ' +
                    indexMathspeak +
                    ', Start Root, ' +
                    radicandMathspeak +
                    ', End Root');
            }
        };
        NthRoot.prototype.deleteTowards = function (dir, cursor) {
            MathCommand.prototype.deleteTowards.call(this, dir, cursor);
        };
        return NthRoot;
    }(SquareRoot));
    LatexCmds.nthroot = NthRoot;
    LatexCmds.cbrt = /** @class */ (function (_super) {
        __extends(class_11, _super);
        function class_11() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        class_11.prototype.createLeftOf = function (cursor) {
            _super.prototype.createLeftOf.call(this, cursor);
            new Digit('3').createLeftOf(cursor);
            cursor.controller.moveRight();
        };
        return class_11;
    }(NthRoot));
    var DiacriticAbove = /** @class */ (function (_super) {
        __extends(DiacriticAbove, _super);
        function DiacriticAbove(ctrlSeq, html, textTemplate) {
            var _this = this;
            var domView = new DOMView(1, function (blocks) {
                return h('span', { class: 'mq-non-leaf' }, [
                    h('span', { class: 'mq-diacritic-above' }, [html]),
                    h.block('span', { class: 'mq-diacritic-stem' }, blocks[0])
                ]);
            });
            _this = _super.call(this, ctrlSeq, domView, textTemplate) || this;
            _this.accentHtml = html;
            return _this;
        }
        // MATHCOMPILE: An accent with no block following degrades to a standalone mark \u2014
        // `f\'` still parses (as f + a bare \u00b4) instead of failing the field.
        DiacriticAbove.prototype.parser = function () {
            var self = this;
            return latexMathParser.block
                .map(function (b) {
                self.blocks = [b];
                b.adopt(self, 0, 0);
                return self;
            })
                .or(Parser.succeed(new VanillaSymbol(self.ctrlSeq + ' ', self.accentHtml.cloneNode(true))));
        };
        return DiacriticAbove;
    }(MathCommand));
    LatexCmds.vec = function () {
        return new DiacriticAbove('\\vec', h.entityText('&rarr;'), ['vec(', ')']);
    };
    LatexCmds.tilde = function () {
        return new DiacriticAbove('\\tilde', h.text('~'), ['tilde(', ')']);
    };
    ;
    var DelimsNode = /** @class */ (function (_super) {
        __extends(DelimsNode, _super);
        function DelimsNode() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        DelimsNode.prototype.setDOM = function (el) {
            var _c;
            _super.prototype.setDOM.call(this, el);
            var children = this.domFrag().children();
            if (!children.isEmpty()) {
                this.delimFrags = (_c = {},
                    _c[L] = children.first(),
                    _c[R] = children.last(),
                    _c);
            }
            return this;
        };
        return DelimsNode;
    }(MathCommand));
    // Round/Square/Curly/Angle Brackets (aka Parens/Brackets/Braces)
    //   first typed as one-sided bracket with matching "ghost" bracket at
    //   far end of current block, until you type an opposing one
    var Bracket = /** @class */ (function (_super) {
        __extends(Bracket, _super);
        function Bracket(side, open, close, ctrlSeq, end) {
            var _c;
            var _this = _super.call(this, '\\left' + ctrlSeq, undefined, [open, close]) || this;
            _this.side = side;
            _this.sides = (_c = {},
                _c[L] = { ch: open, ctrlSeq: ctrlSeq },
                _c[R] = { ch: close, ctrlSeq: end },
                _c);
            return _this;
        }
        Bracket.prototype.numBlocks = function () {
            return 1;
        };
        Bracket.prototype.html = function () {
            var _this = this;
            var leftSymbol = this.getSymbol(L);
            var rightSymbol = this.getSymbol(R);
            // wait until now so that .side may
            this.domView = new DOMView(1, function (blocks) {
                return h(
                // be set by createLeftOf or parser
                'span', { class: 'mq-non-leaf mq-bracket-container' }, [
                    h('span', {
                        style: 'width:' + leftSymbol.width,
                        class: 'mq-scaled mq-bracket-l mq-paren' +
                            (_this.side === R ? ' mq-ghost' : '')
                    }, [leftSymbol.html()]),
                    h.block('span', {
                        style: 'margin-left:' +
                            leftSymbol.width +
                            ';margin-right:' +
                            rightSymbol.width,
                        class: 'mq-bracket-middle mq-non-leaf'
                    }, blocks[0]),
                    h('span', {
                        style: 'width:' + rightSymbol.width,
                        class: 'mq-scaled mq-bracket-r mq-paren' +
                            (_this.side === L ? ' mq-ghost' : '')
                    }, [rightSymbol.html()])
                ]);
            });
            return _super.prototype.html.call(this);
        };
        Bracket.prototype.getSymbol = function (side) {
            var ch = this.sides[side || R].ch;
            // MATHCOMPILE: a delimiter with no glyph (the invisible `\left.`/`\right.`
            // null delimiter) renders as a zero-width span; html is a thunk,
            // matching the SVG_SYMBOLS table type
            return SVG_SYMBOLS[ch] || { width: '0', html: function () { return h.text(''); } };
        };
        Bracket.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            ctx.uncleanedLatex += '\\left' + this.sides[L].ctrlSeq;
            this.getEnd(L).latexRecursive(ctx);
            ctx.uncleanedLatex += '\\right' + this.sides[R].ctrlSeq;
            this.checkCursorContextClose(ctx);
        };
        Bracket.prototype.mathspeak = function (opts) {
            var open = this.sides[L].ch, close = this.sides[R].ch;
            if (open === '|' && close === '|') {
                this.mathspeakTemplate = ['StartAbsoluteValue,', ', EndAbsoluteValue'];
                this.ariaLabel = 'absolute value';
            }
            else if (opts && opts.createdLeftOf && this.side) {
                var ch = '';
                if (this.side === L)
                    ch = this.textTemplate[0];
                else if (this.side === R)
                    ch = this.textTemplate[1];
                return ((this.side === L ? 'left ' : 'right ') +
                    BRACKET_NAMES[ch]);
            }
            else {
                this.mathspeakTemplate = [
                    'left ' + BRACKET_NAMES[open] + ',',
                    ', right ' + BRACKET_NAMES[close]
                ];
                this.ariaLabel =
                    BRACKET_NAMES[open] + ' block';
            }
            return _super.prototype.mathspeak.call(this);
        };
        Bracket.prototype.matchBrack = function (opts, expectedSide, node) {
            // return node iff it's a matching 1-sided bracket of expected side (if any)
            return (node instanceof Bracket &&
                node.side &&
                node.side !== -expectedSide &&
                (!opts.restrictMismatchedBrackets ||
                    OPP_BRACKS[this.sides[this.side].ch] === node.sides[node.side].ch ||
                    // if restrictMismatchedBrackets is "none" instead of true, don't allow mismatched range brackets
                    (opts.restrictMismatchedBrackets !== 'none' &&
                        { '(': ']', '[': ')' }[this.sides[L].ch] === node.sides[R].ch)) &&
                node);
        };
        Bracket.prototype.closeOpposing = function (brack) {
            brack.side = 0;
            brack.sides[this.side] = this.sides[this.side]; // copy over my info (may be
            var brackFrag = brack.delimFrags[this.side === L ? L : R] // mismatched, like [a, b))
                .removeClass('mq-ghost');
            this.replaceBracket(brackFrag, this.side);
        };
        Bracket.prototype.createLeftOf = function (cursor) {
            var brack;
            if (!this.replacedFragment) {
                // unless wrapping seln in brackets,
                // check if next to or inside an opposing one-sided bracket
                var opts = cursor.options;
                if (this.sides[L].ch === '|') {
                    // check both sides if I'm a pipe
                    brack =
                        this.matchBrack(opts, R, cursor[R]) ||
                            this.matchBrack(opts, L, cursor[L]) ||
                            this.matchBrack(opts, 0, cursor.parent.parent);
                }
                else {
                    brack =
                        this.matchBrack(opts, -this.side, cursor[-this.side]) ||
                            this.matchBrack(opts, -this.side, cursor.parent.parent);
                }
            }
            if (brack) {
                var side = (this.side = -brack.side); // may be pipe with .side not yet set
                this.closeOpposing(brack);
                if (brack === cursor.parent.parent && cursor[side]) {
                    // move the stuff between
                    new Fragment(cursor[side], cursor.parent.getEnd(side), -side) // me and ghost outside
                        .disown()
                        .withDirAdopt(-side, brack.parent, brack, brack[side])
                        .domFrag()
                        .insDirOf(side, brack.domFrag());
                }
                brack.bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
            }
            else {
                (brack = this), (side = brack.side);
                if (brack.replacedFragment)
                    brack.side = 0;
                // wrapping seln, don't be one-sided
                else if (cursor[-side]) {
                    // elsewise, auto-expand so ghost is at far end
                    brack.replaces(new Fragment(cursor[-side], cursor.parent.getEnd(-side), side));
                    cursor[-side] = 0;
                }
                _super.prototype.createLeftOf.call(this, cursor);
            }
            if (side === L)
                cursor.insAtLeftEnd(brack.getEnd(L));
            else
                cursor.insRightOf(brack);
        };
        Bracket.prototype.placeCursor = function () { };
        Bracket.prototype.unwrap = function () {
            this.getEnd(L)
                .children()
                .disown()
                .adopt(this.parent, this, this[R])
                .domFrag()
                .insertAfter(this.domFrag());
            this.remove();
        };
        Bracket.prototype.deleteSide = function (side, outward, cursor) {
            var parent = this.parent, sib = this[side], farEnd = parent.getEnd(side);
            if (side === this.side) {
                // deleting non-ghost of one-sided bracket, unwrap
                this.unwrap();
                sib
                    ? cursor.insDirOf(-side, sib)
                    : cursor.insAtDirEnd(side, parent);
                return;
            }
            var opts = cursor.options, wasSolid = !this.side;
            this.side = -side;
            // if deleting like, outer close-brace of [(1+2)+3} where inner open-paren
            if (this.matchBrack(opts, side, this.getEnd(L).getEnd(this.side))) {
                // is ghost,
                this.closeOpposing(this.getEnd(L).getEnd(this.side)); // then become [1+2)+3
                var origEnd = this.getEnd(L).getEnd(side);
                this.unwrap();
                if (origEnd)
                    origEnd.siblingCreated(cursor.options, side);
                if (sib) {
                    cursor.insDirOf(-side, sib);
                }
                else {
                    cursor.insAtDirEnd(side, parent);
                }
            }
            else {
                // if deleting like, inner close-brace of ([1+2}+3) where outer
                if (this.matchBrack(opts, side, this.parent.parent)) {
                    // open-paren is
                    this.parent.parent.closeOpposing(this); // ghost, then become [1+2+3)
                    this.parent.parent.unwrap();
                } // else if deleting outward from a solid pair, unwrap
                else if (outward && wasSolid) {
                    this.unwrap();
                    sib
                        ? cursor.insDirOf(-side, sib)
                        : cursor.insAtDirEnd(side, parent);
                    return;
                }
                else {
                    // else deleting just one of a pair of brackets, become one-sided
                    this.sides[side] = getOppBracketSide(this);
                    this.delimFrags[L].removeClass('mq-ghost');
                    this.delimFrags[R].removeClass('mq-ghost');
                    var brackFrag = this.delimFrags[side].addClass('mq-ghost');
                    this.replaceBracket(brackFrag, side);
                }
                if (sib) {
                    // auto-expand so ghost is at far end
                    var leftEnd = this.getEnd(L);
                    var origEnd = leftEnd.getEnd(side);
                    leftEnd.domFrag().removeClass('mq-empty');
                    new Fragment(sib, farEnd, -side)
                        .disown()
                        .withDirAdopt(-side, leftEnd, origEnd, 0)
                        .domFrag()
                        .insAtDirEnd(side, leftEnd.domFrag().oneElement());
                    if (origEnd)
                        origEnd.siblingCreated(cursor.options, side);
                    cursor.insDirOf(-side, sib);
                } // didn't auto-expand, cursor goes just outside or just inside parens
                else
                    outward
                        ? cursor.insDirOf(side, this)
                        : cursor.insAtDirEnd(side, this.getEnd(L));
            }
        };
        Bracket.prototype.replaceBracket = function (brackFrag, side) {
            var symbol = this.getSymbol(side);
            brackFrag.children().replaceWith(domFrag(symbol.html()));
            brackFrag.oneElement().style.width = symbol.width;
            if (side === L) {
                var next = brackFrag.next();
                if (!next.isEmpty()) {
                    next.oneElement().style.marginLeft = symbol.width;
                }
            }
            else {
                var prev = brackFrag.prev();
                if (!prev.isEmpty()) {
                    prev.oneElement().style.marginRight = symbol.width;
                }
            }
        };
        Bracket.prototype.deleteTowards = function (dir, cursor) {
            this.deleteSide(-dir, false, cursor);
        };
        Bracket.prototype.finalizeTree = function () {
            this.getEnd(L).deleteOutOf = function (dir, cursor) {
                this.parent.deleteSide(dir, true, cursor);
            };
            // FIXME HACK: after initial creation/insertion, finalizeTree would only be
            // called if the paren is selected and replaced, e.g. by LiveFraction
            this.finalizeTree = this.intentionalBlur = function () {
                this.delimFrags[this.side === L ? R : L].removeClass('mq-ghost');
                this.side = 0;
            };
        };
        Bracket.prototype.siblingCreated = function (_opts, dir) {
            // if something typed between ghost and far
            if (dir === -this.side)
                this.finalizeTree(); // end of its block, solidify
        };
        return Bracket;
    }(DelimsNode));
    function getOppBracketSide(bracket) {
        var side = bracket.side;
        var data = bracket.sides[side];
        return {
            ch: OPP_BRACKS[data.ch],
            ctrlSeq: OPP_BRACKS[data.ctrlSeq]
        };
    }
    var OPP_BRACKS = {
        '(': ')',
        ')': '(',
        '[': ']',
        ']': '[',
        '{': '}',
        '}': '{',
        '\\{': '\\}',
        '\\}': '\\{',
        '&lang;': '&rang;',
        // MATHCOMPILE: one-sided bracket pairs for standalone \langle/\lVert parsing
        '&rang;': '&lang;',
        '\\langle ': '\\rangle ',
        '\\rangle ': '\\langle ',
        '|': '|',
        '\\lVert ': '\\rVert ',
        '\\rVert ': '\\lVert '
    };
    var BRACKET_NAMES = {
        '&lang;': 'angle-bracket',
        '&rang;': 'angle-bracket',
        '|': 'pipe',
        // MATHCOMPILE: \left. / \right. empty delimiter
        '.': 'null-delimiter'
    };
    function bindCharBracketPair(open, ctrlSeq, name) {
        var ctrlSeq = ctrlSeq || open;
        var close = OPP_BRACKS[open];
        var end = OPP_BRACKS[ctrlSeq];
        CharCmds[open] = function () { return new Bracket(L, open, close, ctrlSeq, end); };
        CharCmds[close] = function () { return new Bracket(R, open, close, ctrlSeq, end); };
        BRACKET_NAMES[open] = BRACKET_NAMES[close] = name;
    }
    bindCharBracketPair('(', '', 'parenthesis');
    bindCharBracketPair('[', '', 'bracket');
    bindCharBracketPair('{', '\\{', 'brace');
    // MATHCOMPILE: standalone \langle/\rangle parsing moved to extraCommands.ts
    CharCmds['|'] = function () { return new Bracket(L, '|', '|', '|', '|'); };
    // MATHCOMPILE: standalone \lVert/\rVert parsing moved to extraCommands.ts
    LatexCmds.left = /** @class */ (function (_super) {
        __extends(class_12, _super);
        function class_12() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        // MATHCOMPILE: Parser-only command: the delimiter lives in the argument after
        // \left, so a typed '\left' inserts nothing and the following
        // delimiter keystroke auto-pairs the bracket itself.
        class_12.prototype.createLeftOf = function () { };
        class_12.prototype.numBlocks = function () {
            return 1;
        };
        class_12.prototype.parser = function () {
            var regex = Parser.regex;
            var string = Parser.string;
            var optWhitespace = Parser.optWhitespace;
            return optWhitespace
                .then(regex(/^(?:[([|.]|\\\{|\\langle(?![a-zA-Z])|\\lVert(?![a-zA-Z])|\\\|)/))
                .then(function (ctrlSeq) {
                var open = ctrlSeq.replace(/^\\/, '');
                if (ctrlSeq == '\\langle') {
                    open = '&lang;';
                    ctrlSeq = ctrlSeq + ' ';
                }
                if (ctrlSeq == '\\lVert') {
                    open = '&#8741;';
                    ctrlSeq = ctrlSeq + ' ';
                }
                // MATHCOMPILE: \| as a \left/\right delimiter
                if (ctrlSeq == '\\|') {
                    open = '&#8741;';
                }
                return latexMathParser.then(function (block) {
                    return string('\\right')
                        .skip(optWhitespace)
                        .then(regex(/^(?:[\])|.]|\\\}|\\rangle(?![a-zA-Z])|\\rVert(?![a-zA-Z])|\\\|)/))
                        .map(function (end) {
                        var close = end.replace(/^\\/, '');
                        if (end == '\\rangle') {
                            close = '&rang;';
                            end = end + ' ';
                        }
                        if (end == '\\rVert') {
                            close = '&#8741;';
                            end = end + ' ';
                        }
                        // MATHCOMPILE: \| as a \left/\right delimiter
                        if (end == '\\|') {
                            close = '&#8741;';
                        }
                        var cmd = new Bracket(0, open, close, ctrlSeq, end);
                        cmd.blocks = [block];
                        block.adopt(cmd, 0, 0);
                        return cmd;
                    });
                });
            });
        };
        return class_12;
    }(MathCommand));
    LatexCmds.right = /** @class */ (function (_super) {
        __extends(class_13, _super);
        function class_13() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        // MATHCOMPILE: Parser-only command, see \left.
        class_13.prototype.createLeftOf = function () { };
        class_13.prototype.numBlocks = function () {
            return 1;
        };
        class_13.prototype.parser = function () {
            return Parser.fail('unmatched \\right');
        };
        return class_13;
    }(MathCommand));
    // MATHCOMPILE: \big \Big \bigg \Bigg moved to extraCommands.ts
    var leftBinomialSymbol = SVG_SYMBOLS['('];
    var rightBinomialSymbol = SVG_SYMBOLS[')'];
    var Binomial = /** @class */ (function (_super) {
        __extends(Binomial, _super);
        function Binomial() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\binom';
            _this.domView = new DOMView(2, function (blocks) {
                return h('span', { class: 'mq-non-leaf mq-bracket-container' }, [
                    h('span', {
                        style: 'width:' + leftBinomialSymbol.width,
                        class: 'mq-paren mq-bracket-l mq-scaled'
                    }, [leftBinomialSymbol.html()]),
                    h('span', {
                        style: 'margin-left:' +
                            leftBinomialSymbol.width +
                            '; margin-right:' +
                            rightBinomialSymbol.width,
                        class: 'mq-non-leaf mq-bracket-middle'
                    }, [
                        h('span', { class: 'mq-array mq-non-leaf' }, [
                            h.block('span', {}, blocks[0]),
                            h.block('span', {}, blocks[1])
                        ])
                    ]),
                    h('span', {
                        style: 'width:' + rightBinomialSymbol.width,
                        class: 'mq-paren mq-bracket-r mq-scaled'
                    }, [rightBinomialSymbol.html()])
                ]);
            });
            _this.textTemplate = ['choose(', ',', ')'];
            _this.mathspeakTemplate = ['StartBinomial,', 'Choose', ', EndBinomial'];
            _this.ariaLabel = 'binomial';
            return _this;
        }
        Binomial.prototype.finalizeTree = function () {
            var endsL = this.getEnd(L);
            var endsR = this.getEnd(R);
            this.upInto = endsR.upOutOf = endsL;
            this.downInto = endsL.downOutOf = endsR;
            // https://math.stackexchange.com/a/1617456 cites Knuth as the source of 'upper index' and 'lower index'
            endsL.ariaLabel = 'upper index';
            endsR.ariaLabel = 'lower index';
        };
        return Binomial;
    }(DelimsNode));
    LatexCmds.binom = LatexCmds.binomial = Binomial;
    // MATHCOMPILE: \tfrac \dbinom \tbinom moved to extraCommands.ts
    LatexCmds.choose = /** @class */ (function (_super) {
        __extends(class_14, _super);
        function class_14() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        class_14.prototype.createLeftOf = function (cursor) {
            LiveFraction.prototype.createLeftOf.call(this, cursor);
        };
        class_14.prototype.parser = function () {
            // MATHCOMPILE: DelimsNode's strict two-block parser (Binomial.parser() falls back
            // to a \binom leaf via MathCommand, which would shadow \choose's own
            // fallback).
            return DelimsNode.prototype.strictParser
                .call(this)
                .or(Parser.succeed(new VanillaSymbol('\\choose ', h.text('\\choose'), 'choose')));
        };
        return class_14;
    }(Binomial));
    var MathFieldNode = /** @class */ (function (_super) {
        __extends(MathFieldNode, _super);
        function MathFieldNode() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\MathQuillMathField';
            _this.domView = new DOMView(1, function (blocks) {
                var spacingBugAppend = hasSpacingBug() ? ' mq-has-spacing-bug' : '';
                return h('span', { class: 'mq-editable-field' }, [
                    h.block('span', {
                        class: 'mq-root-block' + spacingBugAppend,
                        'aria-hidden': 'true'
                    }, blocks[0])
                ]);
            });
            return _this;
        }
        MathFieldNode.prototype.parser = function () {
            var self = this, string = Parser.string, regex = Parser.regex, succeed = Parser.succeed;
            return string('[')
                .then(regex(/^[a-z][a-z0-9]*/i))
                .skip(string(']'))
                .map(function (name) {
                self.name = name;
            })
                .or(succeed(undefined))
                .then(_super.prototype.parser.call(this));
        };
        MathFieldNode.prototype.finalizeTree = function (options) {
            var ctrlr = new Controller(this.getEnd(L), this.domFrag().oneElement(), options);
            ctrlr.KIND_OF_MQ = 'MathField';
            ctrlr.editable = true;
            ctrlr.createTextarea();
            ctrlr.editablesTextareaEvents();
            ctrlr.cursor.insAtRightEnd(ctrlr.root);
            RootBlockMixin(ctrlr.root);
            // MathQuill applies aria-hidden to .mq-root-block containers
            // because these contain math notation that screen readers can't
            // interpret directly. MathQuill use an aria-live region as a
            // sibling of these block containers to provide an alternative
            // representation for screen readers
            //
            // MathFieldNodes have their own focusable text aria and aria live
            // region, so it is incorrect for any parent of the editable field
            // to have an aria-hidden property
            //
            // https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-hidden
            //
            // Handle this by recursively walking the parents of this element
            // until we hit a root block, and if we hit any parent with
            // aria-hidden="true", removing the property from the parent and
            // pushing it down to each of the parents children. This should
            // result in no parent of this node having aria-hidden="true", but
            // should keep as much of what was previously hidden hidden as
            // possible while obeying this constraint
            function pushDownAriaHidden(node) {
                if (node.parentNode && !domFrag(node).hasClass('mq-root-block')) {
                    pushDownAriaHidden(node.parentNode);
                }
                if (node.nodeType === Node.ELEMENT_NODE) {
                    var element = node;
                    if (element.getAttribute('aria-hidden') === 'true') {
                        element.removeAttribute('aria-hidden');
                        domFrag(node)
                            .children()
                            .eachElement(function (child) {
                            child.setAttribute('aria-hidden', 'true');
                        });
                    }
                }
            }
            pushDownAriaHidden(this.domFrag().parent().oneElement());
            this.domFrag().oneElement().removeAttribute('aria-hidden');
        };
        MathFieldNode.prototype.registerInnerField = function (innerFields, MathField) {
            var controller = this.getEnd(L).controller;
            var newField = new MathField(controller);
            innerFields[this.name] = newField;
            innerFields.push(newField);
        };
        MathFieldNode.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            this.getEnd(L).latexRecursive(ctx);
            this.checkCursorContextClose(ctx);
        };
        MathFieldNode.prototype.text = function () {
            return this.getEnd(L).text();
        };
        return MathFieldNode;
    }(MathCommand));
    LatexCmds.editable = LatexCmds.MathQuillMathField = MathFieldNode; // backcompat with before cfd3620 on #233
    // Embed arbitrary things
    // Probably the closest DOM analogue would be an iframe?
    // From MathQuill's perspective, it's a MQSymbol, it can be
    // anywhere and the cursor can go around it but never in it.
    // Create by calling public API method .dropEmbedded(),
    // or by calling the global public API method .registerEmbed()
    // and rendering LaTeX like \embed{registeredName} (see test).
    var EmbedNode = /** @class */ (function (_super) {
        __extends(EmbedNode, _super);
        function EmbedNode() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        EmbedNode.prototype.setOptions = function (options) {
            function noop() {
                return '';
            }
            this.text = options.text || noop;
            this.domView = new DOMView(0, function () {
                return h('span', {}, [parseHTML(options.htmlString || '')]);
            });
            this.latex = options.latex || noop;
            return this;
        };
        EmbedNode.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            ctx.uncleanedLatex += this.latex();
            this.checkCursorContextClose(ctx);
        };
        EmbedNode.prototype.parser = function () {
            var self = this, string = Parser.string, regex = Parser.regex, succeed = Parser.succeed;
            return string('{')
                .then(regex(/^[a-z][a-z0-9]*/i))
                .skip(string('}'))
                .then(function (name) {
                // the chars allowed in the optional data block are arbitrary other than
                // excluding curly braces and square brackets (which'd be too confusing)
                return string('[')
                    .then(regex(/^[-\w\s]*/))
                    .skip(string(']'))
                    .or(succeed(undefined))
                    .map(function (data) {
                    return self.setOptions(EMBEDS[name](data));
                });
            });
        };
        return EmbedNode;
    }(MQSymbol));
    LatexCmds.embed = EmbedNode;
    // ============================================================================
    //  extraCommands.ts \u2014 MathCompile's added LaTeX commands
    // ============================================================================
    //
    // Everything in this file is a *pure addition* on top of upstream MathQuill:
    // whole new LatexCmds/CharCmds and their helper classes, concatenated after
    // every upstream source in SOURCES_FULL so it can reference any upstream
    // symbol (MathCommand, Style, Fraction, Bracket, Parser, ...). It sits before
    // environments.ts because environments registers boundless integrals via the
    // boundlessIntegral() helper defined here \u2014 keep this order.
    //
    // Modifications *inside* upstream code can't live here \u2014 those stay inline in
    // their files and are tagged `// MATHCOMPILE:` (grep that marker, plus this
    // file and environments.ts, for the complete local patch surface).
    //
    // NOTE: this file is in SOURCES_BASIC too \u2014 anything in it must only use
    // symbols from BASE_SOURCES + math.ts + basicSymbols.ts + commands.ts (the
    // "defined here, not advancedSymbols.ts" comments flag that constraint).
    //======================================================================
    //  Fonts (\mathcal \mathfrak \boldsymbol \mathbfit \u2026)
    //======================================================================
    LatexCmds.mathcal = function () {
        return new Style('\\mathcal', 'span', { class: 'mq-caligraphic mq-font' }, 'Calligraphic Font');
    };
    LatexCmds.mathscr = function () {
        return new Style('\\mathscr', 'span', { class: 'mq-caligraphic mq-font' }, 'Script Font');
    };
    LatexCmds.mathfrak = function () {
        return new Style('\\mathfrak', 'span', { class: 'mq-fraktur mq-font' }, 'Fraktur Font');
    };
    // \bold in math mode is boldmath \u2014 serialized canonically as \mathbf
    LatexCmds.bold = function () {
        return new Style('\\mathbf', 'b', { class: 'mq-font' }, 'Bold Font');
    };
    // Bold-symbol font wrappers.
    LatexCmds.boldsymbol = function () {
        return new Style('\\boldsymbol', 'span', { class: 'mq-non-leaf mq-bf mq-it' }, 'Bold Symbol');
    };
    LatexCmds.pmb = function () {
        return new Style('\\pmb', 'span', { class: 'mq-non-leaf mq-bf' }, 'Poor Mans Bold');
    };
    LatexCmds.bm = function () {
        return new Style('\\bm', 'span', { class: 'mq-non-leaf mq-bf mq-it' }, 'Bold');
    };
    LatexCmds.mathbfit = function () {
        return new Style('\\mathbfit', 'span', { class: 'mq-non-leaf mq-bf mq-it' }, 'Bold Italic');
    };
    //======================================================================
    //  Boxes, colors, links (\boxed \fbox \framebox \color \colorbox \fcolorbox \href)
    //======================================================================
    // \boxed{...} \u2014 content with a drawn frame.
    LatexCmds.boxed = function () {
        return new Style('\\boxed', 'span', { class: 'mq-non-leaf mq-boxed' }, 'Boxed');
    };
    // \color{color}math is the declaration form of \textcolor \u2014 it
    // canonicalizes to \textcolor{color}{math} (the next block is colored).
    LatexCmds.color = LatexCmds.textcolor;
    // \colorbox{color}{math} \u2014 a filled box around content; the color arg is
    // raw text like \textcolor's, emitted back verbatim.
    LatexCmds.colorbox = /** @class */ (function (_super) {
        __extends(class_15, _super);
        function class_15() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.color = '';
            _this.model = '';
            return _this;
        }
        // Parser-only command: typing '\colorbox' in the command input can't
        // supply a color argument, so typed insertion is a no-op (same
        // convention as \textcolor).
        class_15.prototype.createLeftOf = function () { };
        class_15.prototype.numBlocks = function () {
            return 1;
        };
        class_15.prototype.parser = function () {
            var _this = this;
            var self = this;
            return Parser.optWhitespace
                .then(Parser.regex(/^\[[a-zA-Z]+\]/).or(Parser.succeed('')))
                .then(function (model) {
                if (model)
                    self.model = model.slice(1, -1);
                return Parser.string('{')
                    .then(Parser.regex(/^[#\w\s.,()%-]*/))
                    .skip(Parser.string('}'));
            })
                .then(function (color) {
                self.color = color;
                self.domView = new DOMView(1, function (blocks) {
                    return h.block('span', { class: 'mq-colorbox', style: 'background-color:' + color }, blocks[0]);
                });
                return _super.prototype.parser.call(_this);
            });
        };
        class_15.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            ctx.uncleanedLatex +=
                '\\colorbox' +
                    (this.model ? '[' + this.model + ']' : '') +
                    '{' +
                    this.color +
                    '}{';
            this.blocks[0].latexRecursive(ctx);
            ctx.uncleanedLatex += '}';
            this.checkCursorContextClose(ctx);
        };
        class_15.prototype.isStyleBlock = function () {
            return true;
        };
        return class_15;
    }(MathCommand));
    // \fcolorbox{frame}{bg}{math} \u2014 framed + filled box; two raw color args.
    LatexCmds.fcolorbox = /** @class */ (function (_super) {
        __extends(class_16, _super);
        function class_16() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.frameColor = '';
            _this.bgColor = '';
            _this.model = '';
            return _this;
        }
        // Parser-only command: typing '\fcolorbox' in the command input can't
        // supply color arguments, so typed insertion is a no-op (same
        // convention as \textcolor).
        class_16.prototype.createLeftOf = function () { };
        class_16.prototype.numBlocks = function () {
            return 1;
        };
        class_16.prototype.parser = function () {
            var _this = this;
            var self = this;
            var colorGroup = Parser.string('{')
                .then(Parser.regex(/^[#\w\s.,()%-]*/))
                .skip(Parser.string('}'));
            return Parser.optWhitespace
                .then(Parser.regex(/^\[[a-zA-Z]+\]/).or(Parser.succeed('')))
                .then(function (model) {
                if (model)
                    self.model = model.slice(1, -1);
                return colorGroup;
            })
                .then(function (frame) {
                self.frameColor = frame;
                return colorGroup;
            })
                .then(function (bg) {
                self.bgColor = bg;
                self.domView = new DOMView(1, function (blocks) {
                    return h.block('span', {
                        class: 'mq-fcolorbox',
                        style: 'border:1px solid ' +
                            self.frameColor +
                            ';background-color:' +
                            bg
                    }, blocks[0]);
                });
                return _super.prototype.parser.call(_this);
            });
        };
        class_16.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            ctx.uncleanedLatex +=
                '\\fcolorbox' +
                    (this.model ? '[' + this.model + ']' : '') +
                    '{' +
                    this.frameColor +
                    '}{' +
                    this.bgColor +
                    '}{';
            this.blocks[0].latexRecursive(ctx);
            ctx.uncleanedLatex += '}';
            this.checkCursorContextClose(ctx);
        };
        class_16.prototype.isStyleBlock = function () {
            return true;
        };
        return class_16;
    }(MathCommand));
    // \href{url}{math} \u2014 link wrapper; the url arg is raw text.
    LatexCmds.href = /** @class */ (function (_super) {
        __extends(class_17, _super);
        function class_17() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.url = '';
            return _this;
        }
        // Parser-only command: typing '\href' in the command input can't
        // supply a url argument, so typed insertion is a no-op (same
        // convention as \textcolor).
        class_17.prototype.createLeftOf = function () { };
        class_17.prototype.numBlocks = function () {
            return 1;
        };
        class_17.prototype.parser = function () {
            var _this = this;
            var self = this;
            return Parser.optWhitespace
                .then(Parser.string('{'))
                .then(Parser.regex(/^[^{}]*/))
                .skip(Parser.string('}'))
                .then(function (url) {
                self.url = url;
                self.domView = new DOMView(1, function (blocks) {
                    return h.block('span', { class: 'mq-href' }, blocks[0]);
                });
                return _super.prototype.parser.call(_this);
            });
        };
        class_17.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            ctx.uncleanedLatex += '\\href{' + this.url + '}{';
            this.blocks[0].latexRecursive(ctx);
            ctx.uncleanedLatex += '}';
            this.checkCursorContextClose(ctx);
        };
        return class_17;
    }(MathCommand));
    // \fbox/\framebox \u2014 boxed frames; \nicefrac canonicalizes to \frac.
    LatexCmds.fbox = function () {
        return new Style('\\fbox', 'span', { class: 'mq-non-leaf mq-fbox' }, 'Boxed');
    };
    // \makebox[w][pos]{x} / \framebox[w][pos]{x} / \raisebox{d}[ht][dp]{x}
    // \u2014 a content block preceded by up to two optional bracket args.
    // (defined here, not advancedSymbols.ts: extraCommands.ts is in
    // SOURCES_BASIC too, so the mathquill-basic bundle can use it)
    function bindOptBracketCmd(ctrlSeq, maxOpt, speak) {
        return /** @class */ (function (_super) {
            __extends(class_18, _super);
            function class_18() {
                var _this = _super.call(this, ctrlSeq, new DOMView(1, function (blocks) {
                    return h('span', { class: 'mq-non-leaf' }, [
                        h.block('span', {}, blocks[0])
                    ]);
                })) || this;
                _this.optText = '';
                return _this;
            }
            class_18.prototype.parser = function () {
                var self = this;
                return Parser.regex(new RegExp('^(?:\\[[^\\]]*\\]){0,' + maxOpt + '}'))
                    .then(function (opt) {
                    self.optText = opt;
                    return latexMathParser.block;
                })
                    .map(function (b) {
                    self.blocks = [b];
                    b.adopt(self, 0, 0);
                    return self;
                });
            };
            class_18.prototype.latexRecursive = function (ctx) {
                this.checkCursorContextOpen(ctx);
                ctx.uncleanedLatex += this.ctrlSeq + this.optText + '{';
                this.blocks[0].latexRecursive(ctx);
                ctx.uncleanedLatex += '}';
                this.checkCursorContextClose(ctx);
            };
            return class_18;
        }(MathCommand));
    }
    // \framebox keeps optional [width][pos] args like \makebox.
    LatexCmds.framebox = bindOptBracketCmd('\\framebox', 2, 'frame box');
    //======================================================================
    //  Under/over scripts and braces (\underbrace \overset \underset \stackrel)
    //======================================================================
    // \underbrace{x}_{label} / \overbrace{x}^{label} \u2014 the label lands as an
    // ordinary sibling SupSub (same pattern as boundless integral bounds),
    // so only the grouping command itself is needed here.
    LatexCmds.underbrace = function () {
        return new Style('\\underbrace', 'span', { class: 'mq-non-leaf mq-underbrace' }, 'Underbrace');
    };
    LatexCmds.overbrace = function () {
        return new Style('\\overbrace', 'span', { class: 'mq-non-leaf mq-overbrace' }, 'Overbrace');
    };
    // \overset{label}{base} stacks a small label above; \underset below;
    // \stackrel is the plain-TeX name for \overset
    LatexCmds.overset = /** @class */ (function (_super) {
        __extends(class_19, _super);
        function class_19() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\overset';
            _this.domView = new DOMView(2, function (blocks) {
                return h('span', { class: 'mq-non-leaf mq-overunderset' }, [
                    h.block('span', { class: 'mq-overscript' }, blocks[0]),
                    h.block('span', {}, blocks[1])
                ]);
            });
            return _this;
        }
        return class_19;
    }(MathCommand));
    LatexCmds.stackrel = LatexCmds.overset;
    LatexCmds.underset = /** @class */ (function (_super) {
        __extends(class_20, _super);
        function class_20() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\underset';
            _this.domView = new DOMView(2, function (blocks) {
                return h('span', { class: 'mq-non-leaf mq-overunderset' }, [
                    h.block('span', {}, blocks[1]),
                    h.block('span', { class: 'mq-overscript' }, blocks[0])
                ]);
            });
            return _this;
        }
        return class_20;
    }(MathCommand));
    //======================================================================
    //  Modular arithmetic (\pmod \pod \bmod \mod)
    //======================================================================
    // \pmod{m} / \pod{m} \u2014 parenthesized (mod m) / (m); \bmod is the
    // binary mod operator
    LatexCmds.pmod = function () {
        return new MathCommand('\\pmod', new DOMView(1, function (blocks) {
            return h('span', { class: 'mq-non-leaf' }, [
                h('span', {}, [h.text('(mod\u00a0')]),
                h.block('span', {}, blocks[0]),
                h('span', {}, [h.text(')')])
            ]);
        }), ['mod(', ')']);
    };
    LatexCmds.pod = function () {
        return new MathCommand('\\pod', new DOMView(1, function (blocks) {
            return h('span', { class: 'mq-non-leaf' }, [
                h('span', {}, [h.text('(')]),
                h.block('span', {}, blocks[0]),
                h('span', {}, [h.text(')')])
            ]);
        }), ['(', ')']);
    };
    LatexCmds.bmod = bindBinaryOperator('\\bmod ', 'mod', 'binary mod');
    LatexCmds.mod = bindBinaryOperator('\\mod ', 'mod', 'mod');
    //======================================================================
    //  Integrals \u2014 boundless signs (\iint \antid \oiint \oiiint \iiint \u2026)
    //======================================================================
    var U_DOUBLE_INTEGRAL = '\u222C';
    // Boundless integral signs for indefinite integrals: `\iint` and
    // `\antid` render a bare \u222b \u2014 neither carries blocks, so the integrand
    // types linearly (`\antid x dx`, `\iint f dx dy`) and `_`/`^` may still
    // grow an ordinary sibling SupSub for bounds. `\antid` is a MathCompile
    // insertion alias: the app maps it to `\int` at compile time; `\iint`
    // parses to Integrate in the compute engine on its own.
    //
    // BoundlessIntegral is its own class so left-scanning code (a typed `/`
    // wrapping the preceding run into a numerator) can stop at the sign \u2014
    // for a SummationNotation like `\sum` the scan already breaks there, and
    // a boundless \u222b should behave the same way.
    var BoundlessIntegral = /** @class */ (function (_super) {
        __extends(BoundlessIntegral, _super);
        function BoundlessIntegral() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return BoundlessIntegral;
    }(MQSymbol));
    var boundlessIntegral = function (ctrlSeq, glyph, speak) {
        return function () {
            return new BoundlessIntegral(ctrlSeq, h('span', { class: 'mq-int' }, [
                h('big', {}, [h.entityText(glyph)])
            ]), undefined, speak);
        };
    };
    LatexCmds['\u222c'] = LatexCmds.iint = boundlessIntegral('\\iint ', U_DOUBLE_INTEGRAL, 'double integral');
    LatexCmds.antid = boundlessIntegral('\\antid ', U_INTEGRAL, 'antiderivative');
    LatexCmds['\u222f'] = LatexCmds.oiint = boundlessIntegral('\\oiint ', '\u222f', 'surface integral');
    LatexCmds['\u2230'] = LatexCmds.oiiint = boundlessIntegral('\\oiiint ', '\u2230', 'volume integral');
    // \iiint \idotsint \ointctrclockwise \varointclockwise \u2014 boundless
    // integral signs like \iint.
    LatexCmds['\u222d'] = LatexCmds.iiint = boundlessIntegral('\\iiint ', '&#8749;', 'triple integral');
    LatexCmds.idotsint = boundlessIntegral('\\idotsint ', '&#8944;', 'dots integral');
    LatexCmds['\u2233'] = LatexCmds.ointctrclockwise = boundlessIntegral('\\ointctrclockwise ', '&#8755;', 'counterclockwise contour integral');
    LatexCmds['\u2232'] = LatexCmds.varointclockwise = boundlessIntegral('\\varointclockwise ', '&#8754;', 'clockwise contour integral');
    //======================================================================
    //  Fractions (\cfrac \tfrac \nicefrac \dbinom \tbinom)
    //======================================================================
    // \cfrac[lcr] takes an optional alignment arg before the two
    // fraction blocks \u2014 consume it so [l] can't parse as a { [ } { l ]
    // "fraction". Serialized canonically as \frac like \dfrac/\tfrac.
    LatexCmds.cfrac = /** @class */ (function (_super) {
        __extends(cfrac, _super);
        function cfrac() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        cfrac.prototype.parser = function () {
            var self = this;
            return Parser.regex(/^\[(?:[lcr])\]/)
                .or(Parser.succeed(''))
                .then(function () {
                return Fraction.prototype.parser.call(self);
            });
        };
        return cfrac;
    }(Fraction));
    // \tfrac serializes canonically as \frac (same as \dfrac/\cfrac);
    // \dbinom/\tbinom likewise as \binom
    LatexCmds.tfrac = LatexCmds.frac;
    LatexCmds.dbinom = LatexCmds.tbinom = LatexCmds.binom;
    LatexCmds.nicefrac = LatexCmds.frac;
    //======================================================================
    //  Accents and diacritics (\ddot \widehat \` \~ \check \breve \u2026)
    //======================================================================
    LatexCmds.ddot = function () {
        return new DiacriticAbove('\\ddot', h.text('\u00a8'), ['ddot(', ')']);
    };
    LatexCmds.dddot = function () {
        return new DiacriticAbove('\\dddot', h.text('...'), ['dddot(', ')']);
    };
    // \widehat is the wide variant of \hat; render it with the same atom
    // (serializes back as \hat).
    LatexCmds.widehat = LatexCmds.hat;
    var DiacriticBelow = /** @class */ (function (_super) {
        __extends(DiacriticBelow, _super);
        function DiacriticBelow(ctrlSeq, html, textTemplate) {
            var _this = _super.call(this, ctrlSeq, html, textTemplate) || this;
            _this.domView = new DOMView(1, function (blocks) {
                return h('span', { class: 'mq-non-leaf' }, [
                    h.block('span', { class: 'mq-diacritic-stem' }, blocks[0]),
                    h('span', { class: 'mq-diacritic-below' }, [html])
                ]);
            });
            return _this;
        }
        return DiacriticBelow;
    }(DiacriticAbove));
    // Escaped single-char accents (registered under their backslash-escaped
    // ctrlSeq). `\'` intentionally falls back to the bare ' prime \u2014 TeX's
    // acute accent is available as \acute.
    LatexCmds['\\`'] = function () {
        return new DiacriticAbove('\\`', h.text('`'), ['grave(', ')']);
    };
    LatexCmds['\\"'] = function () {
        return new DiacriticAbove('\\"', h.text('\u00a8'), ['umlaut(', ')']);
    };
    LatexCmds['\\~'] = function () {
        return new DiacriticAbove('\\~', h.text('~'), ['tilde(', ')']);
    };
    LatexCmds['\\='] = function () {
        return new DiacriticAbove('\\=', h.text('\u00af'), ['bar(', ')']);
    };
    LatexCmds['\\.'] = function () {
        return new DiacriticAbove('\\.', h.text('\u02d9'), ['dot(', ')']);
    };
    LatexCmds['\\^'] = function () {
        return new DiacriticAbove('\\^', h.text('^'), ['hat(', ')']);
    };
    // Arrow/segment diacritics and group marks.
    LatexCmds.overleftharpoon = function () {
        return new DiacriticAbove('\\overleftharpoon', h.text('\u21bc'), ['overleft harpoon(', ')']);
    };
    LatexCmds.overrightharpoon = function () {
        return new DiacriticAbove('\\overrightharpoon', h.text('\u21c0'), ['overright harpoon(', ')']);
    };
    LatexCmds.overlinesegment = function () {
        return new DiacriticAbove('\\overlinesegment', h.text('\u2015'), ['overline segment(', ')']);
    };
    LatexCmds.underleftarrow = function () {
        return new DiacriticBelow('\\underleftarrow', h.text('\u2190'), ['underleftarrow(', ')']);
    };
    LatexCmds.underrightarrow = function () {
        return new DiacriticBelow('\\underrightarrow', h.text('\u2192'), ['underrightarrow(', ')']);
    };
    // One-block under/over marks that draw an arc glyph above or below
    // their argument (\overgroup, \overbracket, \wideparen, \u2026).
    // \underbrace/\overbrace are NOT registered here \u2014 the Style-based
    // versions near the top own those names.
    var UnderOverBrace = /** @class */ (function (_super) {
        __extends(UnderOverBrace, _super);
        function UnderOverBrace(ctrlSeq, below, glyph) {
            var _this = _super.call(this) || this;
            _this.ctrlSeq = ctrlSeq;
            var mark = h('span', { class: 'mq-underbrace-arc' }, [
                h.text(glyph || (below ? '\u23df' : '\u23de'))
            ]);
            _this.domView = new DOMView(1, function (blocks) {
                return h('span', { class: 'mq-non-leaf mq-underoverbrace' }, below
                    ? [h.block('span', {}, blocks[0]), mark]
                    : [mark, h.block('span', {}, blocks[0])]);
            });
            return _this;
        }
        return UnderOverBrace;
    }(MathCommand));
    LatexCmds.overgroup = function () { return new UnderOverBrace('\\overgroup', false); };
    LatexCmds.undergroup = function () { return new UnderOverBrace('\\undergroup', true); };
    LatexCmds.overbracket = function () {
        return new UnderOverBrace('\\overbracket', false, '\u23b4');
    };
    LatexCmds.underbracket = function () {
        return new UnderOverBrace('\\underbracket', true, '\u23b5');
    };
    LatexCmds.underparen = function () {
        return new UnderOverBrace('\\underparen', true, '\u23dd');
    };
    LatexCmds.overparen = function () {
        return new UnderOverBrace('\\overparen', false, '\u23dc');
    };
    // \wideparen is amssymb's name for the same glyph as \overparen.
    LatexCmds.wideparen = function () {
        return new UnderOverBrace('\\wideparen', false, '\u23dc');
    };
    // Word-form accents missing upstream (the bare-word variants of the
    // escaped accents \' \` \v \u and \ddddot).
    LatexCmds.check = function () {
        return new DiacriticAbove('\\check', h.text('\u02c7'), ['check(', ')']);
    };
    LatexCmds.breve = function () {
        return new DiacriticAbove('\\breve', h.text('\u02d8'), ['breve(', ')']);
    };
    LatexCmds.acute = function () {
        return new DiacriticAbove('\\acute', h.text('\u00b4'), ['acute(', ')']);
    };
    LatexCmds.grave = function () {
        return new DiacriticAbove('\\grave', h.text('`'), ['grave(', ')']);
    };
    LatexCmds.ddddot = function () {
        return new DiacriticAbove('\\ddddot', h.text('....'), ['ddddot(', ')']);
    };
    LatexCmds.overleftharp = function () {
        return new DiacriticAbove('\\overleftharp', h.text('\u21bc'), ['overleft harp(', ')']);
    };
    LatexCmds.overrightharp = function () {
        return new DiacriticAbove('\\overrightharp', h.text('\u21c0'), ['overright harp(', ')']);
    };
    // Physics bra-ket notation: \bra{x} \u2192 \u27e8x|, \ket{x} \u2192 |x\u27e9,
    // \braket{x|y} \u2192 \u27e8x|y\u27e9 (one block, | is content), \ketbra \u2192 |x\u27e9\u27e8y|.
    //======================================================================
    //  Extensible arrows (\xrightarrow \xmapsto \xRightarrow \u2026)
    //======================================================================
    // \xrightarrow{label} / \xleftarrow / \xmapsto and friends \u2014 a small
    // label over an extensible-looking arrow; the arrow is a fixed glyph.
    // \xrightarrow[under]{over} puts a second label below the arrow
    // (amsmath), parsed like \sqrt[n]{x}'s optional block.
    var XArrowWithUnder = /** @class */ (function (_super) {
        __extends(XArrowWithUnder, _super);
        function XArrowWithUnder(ctrlSeq, arrow) {
            return _super.call(this, ctrlSeq, new DOMView(2, function (blocks) {
                return h('span', { class: 'mq-non-leaf mq-overunderset' }, [
                    h.block('span', { class: 'mq-overscript' }, blocks[1]),
                    h('span', { class: 'mq-xarrow' }, [h.text(arrow)]),
                    h.block('span', { class: 'mq-underscript' }, blocks[0])
                ]);
            })) || this;
        }
        XArrowWithUnder.prototype.latexRecursive = function (ctx) {
            this.checkCursorContextOpen(ctx);
            ctx.uncleanedLatex += this.ctrlSeq + '[';
            this.getEnd(L).latexRecursive(ctx);
            ctx.uncleanedLatex += ']{';
            this.getEnd(R).latexRecursive(ctx);
            ctx.uncleanedLatex += '}';
            this.checkCursorContextClose(ctx);
        };
        return XArrowWithUnder;
    }(MathCommand));
    function bindArrowLabelCmd(ctrlSeq, arrow) {
        return function () {
            return new (/** @class */ (function (_super) {
                __extends(class_21, _super);
                function class_21() {
                    return _super.call(this, ctrlSeq, new DOMView(1, function (blocks) {
                        return h('span', { class: 'mq-non-leaf mq-overunderset' }, [
                            h.block('span', { class: 'mq-overscript' }, blocks[0]),
                            h('span', { class: 'mq-xarrow' }, [h.text(arrow)])
                        ]);
                    })) || this;
                }
                class_21.prototype.parser = function () {
                    var self = this;
                    return latexMathParser.optBlock
                        .then(function (optBlock) {
                        return latexMathParser.block.map(function (block) {
                            var xa = new XArrowWithUnder(ctrlSeq, arrow);
                            xa.blocks = [optBlock, block];
                            optBlock.adopt(xa, 0, 0);
                            block.adopt(xa, optBlock, 0);
                            return xa;
                        });
                    })
                        .or(_super.prototype.parser.call(this))
                        .or(Parser.succeed(new VanillaSymbol(ctrlSeq + ' ', h.text(arrow), ctrlSeq.slice(1))));
                };
                return class_21;
            }(MathCommand)))();
        };
    }
    LatexCmds.xrightarrow = bindArrowLabelCmd('\\xrightarrow', '\u27f6');
    LatexCmds.xleftarrow = bindArrowLabelCmd('\\xleftarrow', '\u27f5');
    LatexCmds.xmapsto = bindArrowLabelCmd('\\xmapsto', '\u27fc');
    LatexCmds.xRightarrow = bindArrowLabelCmd('\\xRightarrow', '\u27f9');
    LatexCmds.xLeftarrow = bindArrowLabelCmd('\\xLeftarrow', '\u27f8');
    LatexCmds.xLeftrightarrow = bindArrowLabelCmd('\\xLeftrightarrow', '\u27fa');
    LatexCmds.xleftrightarrow = bindArrowLabelCmd('\\xleftrightarrow', '\u27f7');
    LatexCmds.xhookleftarrow = bindArrowLabelCmd('\\xhookleftarrow', '\u21a9');
    LatexCmds.xhookrightarrow = bindArrowLabelCmd('\\xhookrightarrow', '\u21aa');
    LatexCmds.xrightharpoondown = bindArrowLabelCmd('\\xrightharpoondown', '\u21c0');
    LatexCmds.xrightharpoonup = bindArrowLabelCmd('\\xrightharpoonup', '\u21c1');
    LatexCmds.xleftharpoondown = bindArrowLabelCmd('\\xleftharpoondown', '\u21bd');
    LatexCmds.xleftharpoonup = bindArrowLabelCmd('\\xleftharpoonup', '\u21bc');
    LatexCmds.xrightleftharpoons = bindArrowLabelCmd('\\xrightleftharpoons', '\u21cc');
    LatexCmds.xleftrightharpoons = bindArrowLabelCmd('\\xleftrightharpoons', '\u21cb');
    LatexCmds.xLongrightarrow = bindArrowLabelCmd('\\xLongrightarrow', '\u27f6');
    LatexCmds.xLongleftarrow = bindArrowLabelCmd('\\xLongleftarrow', '\u27f5');
    LatexCmds.xtwoheadrightarrow = bindArrowLabelCmd('\\xtwoheadrightarrow', '\u21a0');
    LatexCmds.xtwoheadleftarrow = bindArrowLabelCmd('\\xtwoheadleftarrow', '\u219e');
    LatexCmds.xtofrom = bindArrowLabelCmd('\\xtofrom', '\u21c4');
    // \cancel \bcancel \xcancel \u2014 struck-through content.
    //======================================================================
    //  Cancels (\cancel \bcancel \xcancel \cancelto)
    //======================================================================
    function bindCancelCmd(ctrlSeq, cls) {
        return function () {
            return new MathCommand(ctrlSeq, new DOMView(1, function (blocks) {
                return h('span', { class: 'mq-non-leaf mq-cancel ' + cls }, [
                    h.block('span', {}, blocks[0])
                ]);
            }));
        };
    }
    // \cancelto{result}{expr} \u2014 content struck through with an arrow
    // pointing at the result term.
    LatexCmds.cancelto = function () {
        return new MathCommand('\\cancelto', new DOMView(2, function (blocks) {
            return h('span', { class: 'mq-non-leaf mq-cancel mq-cancelto' }, [
                h.block('span', { class: 'mq-cancelto-arrow' }, blocks[0]),
                h.block('span', {}, blocks[1])
            ]);
        }));
    };
    LatexCmds.cancel = bindCancelCmd('\\cancel', 'mq-cancel-forward');
    LatexCmds.bcancel = bindCancelCmd('\\bcancel', 'mq-cancel-back');
    LatexCmds.xcancel = bindCancelCmd('\\xcancel', 'mq-cancel-both');
    //======================================================================
    //  Delimiters (\langle \lVert \bra \big \bigl \middle \[)
    //======================================================================
    // Typed \langle auto-pairs like every Bracket; a standalone \langle x
    // parses as a plain \u27e8 symbol because a one-sided Bracket fails its own
    // parser and blanks the field. Same for \rangle, \lVert, \rVert below.
    var StandaloneBracket = /** @class */ (function (_super) {
        __extends(StandaloneBracket, _super);
        function StandaloneBracket(side, open, close, ctrlSeq, end, mathspeak) {
            var _this = _super.call(this, side, open, close, ctrlSeq, end) || this;
            _this.parseSymbol = new VanillaSymbol(ctrlSeq, h.entityText(side === L ? open : close), mathspeak);
            return _this;
        }
        StandaloneBracket.prototype.parser = function () {
            return Parser.succeed(this.parseSymbol);
        };
        return StandaloneBracket;
    }(Bracket));
    LatexCmds.langle = function () {
        return new StandaloneBracket(L, '&lang;', '&rang;', '\\langle ', '\\rangle ', 'left angle bracket');
    };
    LatexCmds.rangle = function () {
        return new StandaloneBracket(R, '&lang;', '&rang;', '\\rangle ', '\\langle ', 'right angle bracket');
    };
    LatexCmds.lVert = function () {
        return new StandaloneBracket(L, '&#8741;', '&#8741;', '\\lVert ', '\\rVert ', 'left norm');
    };
    LatexCmds.rVert = function () {
        return new StandaloneBracket(R, '&#8741;', '&#8741;', '\\rVert ', '\\lVert ', 'right norm');
    };
    function bindBraKet(ctrlSeq, open, close) {
        return function () {
            return new MathCommand(ctrlSeq, new DOMView(1, function (blocks) {
                return h('span', { class: 'mq-non-leaf' }, [
                    h('span', { class: 'mq-bra-ket-delim' }, [h.entityText(open)]),
                    h.block('span', {}, blocks[0]),
                    h('span', { class: 'mq-bra-ket-delim' }, [h.entityText(close)])
                ]);
            }));
        };
    }
    LatexCmds.bra = bindBraKet('\\bra', '&lang;', '|');
    LatexCmds.ket = bindBraKet('\\ket', '|', '&rang;');
    LatexCmds.braket = function () {
        return new MathCommand('\\braket', new DOMView(1, function (blocks) {
            return h('span', { class: 'mq-non-leaf' }, [
                h('span', { class: 'mq-bra-ket-delim' }, [h.entityText('&lang;')]),
                h.block('span', {}, blocks[0]),
                h('span', { class: 'mq-bra-ket-delim' }, [h.entityText('&rang;')])
            ]);
        }));
    };
    LatexCmds.ketbra = function () {
        return new MathCommand('\\ketbra', new DOMView(2, function (blocks) {
            return h('span', { class: 'mq-non-leaf' }, [
                h('span', { class: 'mq-bra-ket-delim' }, [h.text('|')]),
                h.block('span', {}, blocks[0]),
                h('span', { class: 'mq-bra-ket-delim' }, [
                    h.entityText('&rang;'),
                    h.entityText('&lang;')
                ]),
                h.block('span', {}, blocks[1]),
                h('span', { class: 'mq-bra-ket-delim' }, [h.text('|')])
            ]);
        }));
    };
    // \big \Big \bigg \Bigg sized delimiters (with optional l/r/m suffix)
    // and \middle \u2014 a sized-delimiter prefix consumes the following
    // delimiter token and renders that glyph, keeping the prefix in the
    // ctrlSeq so `\bigl(` serializes verbatim.
    var DELIM_GLYPHS = {
        '(': '(',
        ')': ')',
        '[': '[',
        ']': ']',
        '{': '{',
        '}': '}',
        '|': '|',
        '<': '\u27e8',
        '>': '\u27e9',
        '/': '/',
        '.': '',
        '\\{': '{',
        '\\}': '}',
        '\\|': '\u2016',
        '\\langle': '\u27e8',
        '\\rangle': '\u27e9',
        '\\lVert': '\u2016',
        '\\rVert': '\u2016',
        '\\lceil': '\u2308',
        '\\rceil': '\u2309',
        '\\lfloor': '\u230a',
        '\\rfloor': '\u230b',
        '\\backslash': '\\',
        '\\ulcorner': '\u231c',
        '\\urcorner': '\u231d',
        '\\llcorner': '\u231e',
        '\\lrcorner': '\u231f',
        '\\uparrow': '\u2191',
        '\\downarrow': '\u2193',
        '\\updownarrow': '\u2195',
        '\\Uparrow': '\u21d1',
        '\\Downarrow': '\u21d3',
        '\\Updownarrow': '\u21d5'
    };
    var SizedDelimiter = /** @class */ (function (_super) {
        __extends(SizedDelimiter, _super);
        function SizedDelimiter(prefix) {
            var _this = _super.call(this) || this;
            _this.prefix = prefix;
            return _this;
        }
        // Parser-only command: typing '\bigl' in the command input can't
        // supply a delimiter token, so typed insertion is a no-op (same
        // convention as \textcolor / \big).
        SizedDelimiter.prototype.createLeftOf = function () { };
        SizedDelimiter.prototype.parser = function () {
            var self = this;
            return Parser.optWhitespace
                .then(Parser.regex(/^(?:\\[a-zA-Z]+|\\[^a-zA-Z\s]|[.()[\]{}/|<>])/))
                .map(function (delim) {
                // A \langle-style delimiter needs a trailing space in the
                // emitted ctrlSeq \u2014 otherwise `\Bigg\langle x` would serialize
                // as `\Bigg\langlex` and glue into an unknown command.
                self.ctrlSeq =
                    self.prefix + delim + (/^\\[a-zA-Z]+$/.test(delim) ? ' ' : '');
                var glyph = DELIM_GLYPHS[delim];
                if (glyph === undefined)
                    glyph = delim.replace(/^\\/, '');
                self.domView = new DOMView(0, function () {
                    return h('span', { class: 'mq-sized-delim' }, [h.text(glyph)]);
                });
                return self;
            });
        };
        return SizedDelimiter;
    }(MQSymbol));
    (function () {
        ['big', 'Big', 'bigg', 'Bigg'].forEach(function (size) {
            ['l', 'r', 'm', ''].forEach(function (side) {
                LatexCmds[size + side] = function () {
                    return new SizedDelimiter('\\' + size + side);
                };
            });
        });
        LatexCmds.middle = function () {
            return new SizedDelimiter('\\middle');
        };
    })();
    // \big| \Big| \bigg| \Bigg| \u2014 fixed-size delimiters. Parser-only (like
    // \left): they render the delimiter glyph at a fixed scale and keep the
    // full \big<delim> ctrlSeq so the latex round-trips.
    var BIG_DELIM_SCALES = {
        big: '1.2',
        Big: '1.6',
        bigg: '2.1',
        Bigg: '2.6'
    };
    var BIG_DELIM_CHARS = {
        '(': '(',
        ')': ')',
        '[': '[',
        ']': ']',
        '|': '|',
        '.': '',
        '\\{': '{',
        '\\}': '}',
        '\\|': '\u2016',
        '\\langle': '\u27e8',
        '\\rangle': '\u27e9',
        '\\lVert': '\u2016',
        '\\rVert': '\u2016'
    };
    var BIG_DELIM_RE = /^(?:\\langle(?![a-zA-Z])|\\rangle(?![a-zA-Z])|\\lVert(?![a-zA-Z])|\\rVert(?![a-zA-Z])|\\\{|\\\}|\\[|.]|[()\[\]|.])/;
    var BigDelim = /** @class */ (function (_super) {
        __extends(BigDelim, _super);
        function BigDelim(sizeSeq) {
            var _this = _super.call(this) || this;
            _this.sizeSeq = '\\big';
            _this.sizeSeq = '\\' + sizeSeq;
            return _this;
        }
        BigDelim.prototype.createLeftOf = function () { };
        BigDelim.prototype.numBlocks = function () {
            return 1;
        };
        BigDelim.prototype.parser = function () {
            var self = this;
            return Parser.optWhitespace
                .then(Parser.regex(BIG_DELIM_RE))
                .then(function (delimTok) {
                var ch = BIG_DELIM_CHARS[delimTok];
                if (ch === undefined)
                    return Parser.fail('not a \\big delimiter');
                var ctrlSeq = self.sizeSeq + (delimTok.length > 1 ? delimTok + ' ' : delimTok);
                var scale = BIG_DELIM_SCALES[self.sizeSeq.slice(1)];
                var inner = ch === ''
                    ? h('span', { style: 'width:0' })
                    : h('span', { style: 'font-size:' + scale + 'em' }, [
                        h.text(ch)
                    ]);
                return Parser.succeed(new MQSymbol(ctrlSeq, h('span', {}, [inner]), undefined, 'delimiter'));
            });
        };
        return BigDelim;
    }(MathCommand));
    LatexCmds.big = function () { return new BigDelim('big'); };
    LatexCmds.Big = function () { return new BigDelim('Big'); };
    LatexCmds.bigg = function () { return new BigDelim('bigg'); };
    LatexCmds.Bigg = function () { return new BigDelim('Bigg'); };
    // \[ \] \( \) display-math wrappers parse as bracket glyphs so pasted
    // display math keeps its delimiters (registered under the escaped
    // ctrlSeq \u2014 bare ( ) [ ] still go through the symbol fallback).
    LatexCmds['\\['] = function () {
        return new VanillaSymbol('\\[', h.text('['), 'open display math');
    };
    LatexCmds['\\]'] = function () {
        return new VanillaSymbol('\\]', h.text(']'), 'close display math');
    };
    LatexCmds['\\('] = function () {
        return new VanillaSymbol('\\(', h.text('('), 'open inline math');
    };
    LatexCmds['\\)'] = function () {
        return new VanillaSymbol('\\)', h.text(')'), 'close inline math');
    };
    //======================================================================
    //  Line breaks and layout atoms (\\ \cr \hline \smash \strut)
    //======================================================================
    // A bare \\ at any level is a hard line break \u2014 the matrix/displaylines
    // cell-grid parsers consume \\ as a row delimiter before node parsing
    // reaches it, so this only kicks in outside grids (e.g. pasting `x\\ y`).
    LatexCmds['\\'] = function () {
        return new VanillaSymbol('\\\\', h('br', {}, []), 'line break');
    };
    // \cr is the plain-TeX row separator \u2014 inside a grid it is cell content
    // (the cellsParser only splits on \\), so it round-trips verbatim and
    // renders as a line break.
    LatexCmds.cr = function () {
        return new VanillaSymbol('\\cr ', h('br', {}, []), 'line break');
    };
    // style switches (\displaystyle \u2026 \nolimits) \u2014 invisible atoms that
    // serialize their command verbatim. \limits/\nolimits sit between an
    // operator and its bounds; the bound then attaches to this zero-width
    // atom, so `\sum\limits_{i}` renders like `\sum_{i}` and round-trips.
    // NOTE: defined here (not advancedSymbols.ts): extraCommands.ts is in
    // SOURCES_BASIC too, so the mathquill-basic bundle can use it.
    // can use it too.
    function bindStyleModifier(ctrlSeq, mathspeak) {
        return function () {
            return new VanillaSymbol(ctrlSeq, h('span', { class: 'mq-style-modifier' }), mathspeak);
        };
    }
    // Matrix rules \u2014 invisible in the grid, serialize verbatim.
    LatexCmds.hline = bindStyleModifier('\\hline ', 'h line');
    LatexCmds.hdashline = bindStyleModifier('\\hdashline ', 'h dash line');
    LatexCmds.midrule = bindStyleModifier('\\midrule ', 'mid rule');
    LatexCmds.toprule = bindStyleModifier('\\toprule ', 'top rule');
    LatexCmds.bottomrule = bindStyleModifier('\\bottomrule ', 'bottom rule');
    LatexCmds.cline = function () {
        return new MathCommand('\\cline', new DOMView(1, function (blocks) {
            return h('span', { class: 'mq-invisible' }, [
                h.block('span', {}, blocks[0])
            ]);
        }));
    };
    LatexCmds.cmidrule = function () {
        return new MathCommand('\\cmidrule', new DOMView(1, function (blocks) {
            return h('span', { class: 'mq-invisible' }, [
                h.block('span', {}, blocks[0])
            ]);
        }));
    };
    // \llap \rlap \clap \smash \u2014 overlap boxes; content renders inline.
    function bindOverlapCmd(ctrlSeq, cls, optRegex) {
        return function () {
            return new (/** @class */ (function (_super) {
                __extends(class_22, _super);
                function class_22() {
                    var _this = _super.call(this, ctrlSeq, new DOMView(1, function (blocks) {
                        return h('span', { class: 'mq-non-leaf ' + cls }, [
                            h.block('span', {}, blocks[0])
                        ]);
                    })) || this;
                    _this.optText = '';
                    return _this;
                }
                // An overlap command with no following block degrades to a bare
                // \name leaf instead of failing the parse.
                class_22.prototype.parser = function () {
                    var self = this;
                    return (optRegex
                        ? Parser.regex(new RegExp('^' + optRegex))
                            .or(Parser.succeed(''))
                            .then(function (opt) {
                            self.optText = opt;
                            return latexMathParser.block;
                        })
                        : latexMathParser.block)
                        .map(function (b) {
                        self.blocks = [b];
                        b.adopt(self, 0, 0);
                        return self;
                    })
                        .or(Parser.succeed(new VanillaSymbol(ctrlSeq + ' ', h.text(ctrlSeq), ctrlSeq.replace(/\\/g, ''))));
                };
                class_22.prototype.latexRecursive = function (ctx) {
                    this.checkCursorContextOpen(ctx);
                    ctx.uncleanedLatex += this.ctrlSeq + this.optText + '{';
                    this.blocks[0].latexRecursive(ctx);
                    ctx.uncleanedLatex += '}';
                    this.checkCursorContextClose(ctx);
                };
                return class_22;
            }(MathCommand)))();
        };
    }
    LatexCmds.llap = bindOverlapCmd('\\llap', 'mq-llap');
    LatexCmds.rlap = bindOverlapCmd('\\rlap', 'mq-rlap');
    LatexCmds.clap = bindOverlapCmd('\\clap', 'mq-clap');
    LatexCmds.smash = bindOverlapCmd('\\smash', 'mq-smash', '\\[(?:[tb])\\]');
    LatexCmds.mathllap = bindOverlapCmd('\\mathllap', 'mq-llap');
    LatexCmds.mathrlap = bindOverlapCmd('\\mathrlap', 'mq-rlap');
    LatexCmds.mathclap = bindOverlapCmd('\\mathclap', 'mq-clap');
    LatexCmds.mathstrut = bindStyleModifier('\\mathstrut ', 'math strut');
    LatexCmds.strut = bindStyleModifier('\\strut ', 'strut');
    //======================================================================
    //  Misc large operators (\bigsqcap \varinjlim \varprojlim)
    //======================================================================
    LatexCmds.bigsqcap = LatexCmds.bigsqcapdot = function () {
        return new SummationNotation('\\bigsqcap ', '&#10757;', 'square intersection');
    };
    LatexCmds.varinjlim = function () {
        return new SummationNotation('\\varinjlim ', 'lim&#8594;', 'direct limit');
    };
    LatexCmds.varprojlim = function () {
        return new SummationNotation('\\varprojlim ', 'lim&#8592;', 'inverse limit');
    };
    // For backwards compatibility, set up the global MathQuill object as an instance of API interface v1
    if (window.jQuery) {
        MQ1 = getInterface(1);
        for (var key in MQ1)
            (function (key, val) {
                if (typeof val === 'function') {
                    MathQuill[key] = function () {
                        insistOnInterVer();
                        return val.apply(this, arguments);
                    };
                    MathQuill[key].prototype = val.prototype;
                }
                else
                    MathQuill[key] = val;
            })(key, MQ1[key]);
    }
}());


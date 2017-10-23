/*globals sjcl*/
// This module generates JavaScript code for instrumenting the DOM
// to prevent pages from accessing Web API standards.  This code
// is generated programatically so that both the background and content
// scripts can determine the SHA256 hash of the injected code, so that
// we can set the CSP policy as needed.
(function () {
    "use strict";

    // This function is what does the instrumenting of the DOM,
    // based on values set in the global window.WEB_API_MANAGER_PAGE
    // structure.  This function is never called, but is rendered to
    // a string (with Function.prototype.toString) and inserted into
    // content scripts.  Its written here as a proper function
    // just to make it easier to write and deploy (ie vim highlights
    // it just like any other JS).
    const proxyBlockingFunction = function () {

        const settings = window.WEB_API_MANAGER_PAGE;
        const shouldLog = settings.shouldLog;
        const standardsToBlock = settings.toBlock;
        const standardDefinitions = settings.standards;
        const hostName = window.location.hostname;

        // Its possible that the Web API removal code will block direct references
        // to the following methods, so grab references to them before the
        // DOM is instrumented (and their references are possibly blocked).
        const removeChild = window.Element.prototype.removeChild;
        const getElementsByTagName = window.document.getElementsByTagName;

        const defaultFunction = function () {};
        const funcPropNames = Object.getOwnPropertyNames(defaultFunction);
        const unconfigurablePropNames = funcPropNames.filter(function (propName) {
            const possiblePropDesc = Object.getOwnPropertyDescriptor(defaultFunction, propName);
            return (possiblePropDesc && !possiblePropDesc.configurable);
        });

        const featuresToBlock = standardsToBlock.reduce(function (prev, cur) {
            return prev.concat(standardDefinitions[cur].features);
        }, []);

        const toPrimitiveFunc = function (hint) {
            if (hint === "number" || hint === "default") {
                return 0;
            }
            if (hint === "string") {
                return "";
            }
            return undefined;
        };

        const keyPathToRefPath = function (keyPath) {
            const keyParts = keyPath.split(".");
            return keyParts.reduce(function (prev, cur) {

                if (prev === undefined) {
                    return undefined;
                }

                const numNodes = prev.length;
                const currentLeaf = (numNodes === 0)
                    ? window
                    : prev[numNodes - 1];
                const nextLeaf = currentLeaf[cur];

                if (nextLeaf === undefined) {
                    return undefined;
                }

                return prev.concat([nextLeaf]);
            }, []);
        };

        const createBlockingProxy = function (keyPath) {

            let hasBeenLogged = false;

            const logKeyPath = function () {

                if (keyPath !== undefined &&
                        hasBeenLogged === false &&
                        shouldLog) {
                    hasBeenLogged = true;
                    console.log("Blocked '" + keyPath + "' on '" + hostName + "'");
                }
            };

            let blockingProxy;
            blockingProxy = new Proxy(defaultFunction, {
                get: function (ignore, property) {
                    logKeyPath();

                    if (property === Symbol.toPrimitive) {
                        return toPrimitiveFunc;
                    }

                    if (property === "valueOf") {
                        return toPrimitiveFunc;
                    }

                    return blockingProxy;
                },
                set: function () {
                    logKeyPath();
                    return blockingProxy;
                },
                apply: function () {
                    logKeyPath();
                    return blockingProxy;
                },
                ownKeys: function () {
                    return unconfigurablePropNames;
                },
                has: function (ignore, property) {
                    return (unconfigurablePropNames.indexOf(property) > -1);
                },
                getOwnPropertyDescriptor: function (ignore, property) {
                    if (unconfigurablePropNames.indexOf(property) === -1) {
                        return undefined;
                    }
                    return Object.getOwnPropertyDescriptor(defaultFunction, property);
                }
            });

            return blockingProxy;
        };

        const defaultBlockingProxy = createBlockingProxy();

        const blockFeatureAtKeyPath = function (keyPath) {
            const propertyRefs = keyPathToRefPath(keyPath);

            // If we weren't able to turn the key path into an array of references,
            // then it means that the property doesn't exist in this DOM /
            // environment, so there is nothing to block.
            if (propertyRefs === undefined) {
                return false;
            }

            const keyPathSegments = keyPath.split(".");
            const lastPropertyName = keyPathSegments[keyPathSegments.length - 1];
            const leafRef = propertyRefs[propertyRefs.length - 1];
            const parentRef = propertyRefs[propertyRefs.length - 2];

            // At least for now, only interpose on methods.
            if (typeof leafRef !== "function") {
                return false;
            }

            try {

                if (shouldLog === true) {
                    parentRef[lastPropertyName] = createBlockingProxy(keyPath);
                    return true;
                }

                parentRef[lastPropertyName] = defaultBlockingProxy;
                return true;

            } catch (e) {

                if (shouldLog) {
                    console.log("Error instrumenting " + keyPath + ": " + e);
                }

                return false;
            }
        };

        featuresToBlock.forEach(blockFeatureAtKeyPath);

        // Next, delete the WEB_API_MANAGER_PAGE global property.  Technically
        // this never needed to be global, but doing so allows for easier
        // jslinting of the code, makes things easier to understand (for me
        // at least) and doesn't have any side effect as long as we delete
        // it when we're done, and before the page scripts can start running.
        delete window.WEB_API_MANAGER_PAGE;

        // Last, remove the script tag containing this code from the document,
        // so that the structure of the page looks like what the page author
        // expects / intended.
        const scriptTags = getElementsByTagName.call(window.document, "script");
        removeChild.call(scriptTags[0].parentNode, scriptTags[0]);
    };

    /**
     * Generates a script payload, for injecting into content scripts.  The
     * generated string is 99% the above proxyBlockingFunction function,
     * but with the window.WEB_API_MANAGER_PAGE object set up
     * correctly to block the desired functions.
     *
     * @param object standards
     *   A mapping of standard names to information about those standards.
     *   The structure of this object should match whats in data/standards.js
     * @param array standardNamesToBlock
     *   An array of strings, which must be a subset of the keys of the
     *   standards object.
     * @param bool shouldLog
     *   Whether to log the behavior of the blocking proxy.
     *
     * @return [string, hash]
     *   Returns an array containing two values.  First, JavaScript code
     *   that instruments the DOM of page's its injected into to render the
     *   standardNamesToBlock standards un-reachable, and second, a
     *   base64 encoded sha256 hash of the code.
     */
    const generateScriptPayload = function (standards, standardNamesToBlock, shouldLog) {

        const proxyBlockingSettings = `
            window.WEB_API_MANAGER_PAGE = {
                standards: ${JSON.stringify(standards)},
                toBlock: ${JSON.stringify(standardNamesToBlock)},
                shouldLog: ${shouldLog ? "true" : "false"}
            };
        `;

        const proxyingBlockingSrc = "(" + proxyBlockingFunction.toString() + "())";
        const completeScriptCode = proxyBlockingSettings + "\n" + proxyingBlockingSrc;

        // Use the SJ Crypto library, instead of the WebCrypto library,
        // because we need to compute hashes syncronously (so we can
        // be sure the hash operation will complete before we let page
        // script run).
        // https://bitwiseshiftleft.github.io/sjcl/doc/sjcl.hash.sha256.html
        const hash = sjcl.hash.sha256.hash(completeScriptCode);
        const hashBase64 = sjcl.codec.base64.fromBits(hash);

        return [completeScriptCode, hashBase64];
    };

    window.WEB_API_MANAGER.proxyBlockLib = {
        generateScriptPayload
    };
}());

"use strict";

const utils = require("./lib/utils");
const injected = require("./lib/injected");
const testServer = require("./lib/server");

describe("Content-Security-Protocol tests", function () {

    describe("script-src", function () {

        this.timeout = () => 20000;

        it("default-src and script-src (from Pitchfork.com)", function (done) {

            const [server, testUrl] = testServer.start(function (headers) {
                // Add the CSP header to every request
                headers['Content-Security-Protocol'] = "default-src https: data: 'unsafe-inline' 'unsafe-eval'; child-src https: data: blob:; connect-src https: data: blob:; font-src https: data:; img-src https: data: blob:; media-src https: data: blob:; object-src https:; script-src https: data: blob: 'unsafe-inline' 'unsafe-eval'; style-src https: 'unsafe-inline'; block-all-mixed-content; upgrade-insecure-requests; report-uri https://capture.condenastdigital.com/csp/pitchfork;";
            });

            const svgTestScript = injected.testSVGTestScript();
            const standardsToBlock = utils.constants.svgBlockRule;
            let driverReference;

            utils.promiseGetDriver()
                .then(function (driver) {
                    driverReference = driver;
                    return utils.promiseSetBlockingRules(driver, standardsToBlock);
                })
                .then(() => driverReference.get(testUrl))
                .then(() => driverReference.executeAsyncScript(svgTestScript))
                .then(function () {
                    driverReference.quit();
                    testServer.stop(server);
                    done();
                })
                .catch(function (e) {
                    driverReference.quit();
                    testServer.stop(server);
                    done(e);
                });
        });
    });
});
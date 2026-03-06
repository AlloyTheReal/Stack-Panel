const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Mock Electron app
const mockApp = {
    isPackaged: false,
    getPath: (name) => {
        if (name === 'userData') return path.join(__dirname, 'mock_userData');
        return '';
    }
};

// Mock dependencies
const mockApi = {};
const mockJavaManager = {};

// Inject mock app into fs/path if needed, but here we just need to mock the require calls
// Simplified: We'll test the logic by manually invoking a simulated version of the fix

function getDataRoot(isPackaged) {
    return isPackaged
        ? 'C:\\Users\\User\\AppData\\Roaming\\srvmgr'
        : 'D:\\dev\\Stack_Panel\\V2.0.0\\srvmgr';
}

function fixServers(servers, baseDir, dataRoot) {
    servers.forEach(server => {
        if (server.id) {
            const expectedPath = path.join(baseDir, server.id);
            if (server.path !== expectedPath) {
                console.log(`Fixing server path for ${server.id}: ${server.path} -> ${expectedPath}`);
                server.path = expectedPath;
            }
        }

        if (server.javaExe && server.javaExe.includes(path.sep + 'jre' + path.sep)) {
            const jreIndex = server.javaExe.lastIndexOf(path.sep + 'jre' + path.sep);
            if (jreIndex !== -1) {
                const relativeJavaPath = server.javaExe.substring(jreIndex + 1);
                const newJavaExe = path.join(dataRoot, relativeJavaPath);
                if (server.javaExe !== newJavaExe) {
                    console.log(`Fixing javaExe path for ${server.id}: ${server.javaExe} -> ${newJavaExe}`);
                    server.javaExe = newJavaExe;
                }
            }
        }
    });
    return servers;
}

// Test Case 1: Renamed folder
const oldProjectDir = 'D:\\dev\\Stack Panel\\V2.0.0\\srvmgr';
const newProjectDir = 'D:\\dev\\Stack_Panel\\V2.0.0\\srvmgr';
const baseDir = path.join(newProjectDir, 'servers');

const testServers = [
    {
        "id": "1772829881792",
        "name": "TEST FINAL",
        "path": `${oldProjectDir}\\servers\\1772829881792`,
        "javaExe": `${oldProjectDir}\\jre\\21\\jdk-21.0.10+7-jre\\bin\\java.exe`
    }
];

console.log("Running Path Fix Test...");
const fixed = fixServers(testServers, baseDir, newProjectDir);

assert.strictEqual(fixed[0].path, path.join(baseDir, "1772829881792"));
assert.strictEqual(fixed[0].javaExe, path.join(newProjectDir, "jre", "21", "jdk-21.0.10+7-jre", "bin", "java.exe"));

console.log("Test Passed!");

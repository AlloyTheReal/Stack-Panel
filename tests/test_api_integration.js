const api = require('../src/api');

async function test() {
    console.log('--- Testing API Integration ---');

    try {
        console.log('\nTesting Vanilla 1.21.4...');
        const vanillaUrl = await api.getVanillaUrl('1.21.4');
        console.log('Vanilla URL: ' + vanillaUrl);

        console.log('\nTesting Paper 1.21.4...');
        const paperUrl = await api.getPaperUrl('1.21.4');
        console.log('Paper URL: ' + paperUrl);

        console.log('\nTesting Spigot 1.21.4...');
        const spigotUrl = await api.getSpigotUrl('1.21.4');
        console.log('Spigot URL: ' + spigotUrl);

        console.log('\nTesting Purpur 1.21.4...');
        const purpurUrl = await api.getPurpurUrl('1.21.4');
        console.log('Purpur URL: ' + purpurUrl);

        console.log('\nTesting versions list for Paper...');
        const versions = await api.getAvailableVersions('paper');
        console.log(`Found ${versions.length} versions for Paper.`);
        if (Array.isArray(versions)) {
            console.log('Latest 5 versions:');
            versions.slice(0, 5).forEach(v => console.log(' - ' + v));
        } else {
            console.log('Versions response: ' + JSON.stringify(versions));
        }

        console.log('\n--- API Integration Test Passed ---');
    } catch (err) {
        console.error('\n--- API Integration Test Failed ---');
        console.error(err);
        process.exit(1);
    }
}

test();

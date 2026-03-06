const https = require('https');
const fs = require('fs');

/**
 * Helper to download a file
 */
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                fs.unlink(dest, () => reject(new Error(`Téléchargement échoué (Erreur HTTP ${response.statusCode}). Vérifiez la version.`)));
                return;
            }
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) return reject(new Error(`Erreur HTTP ${res.statusCode} lors de la requête à ${url}`));
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function checkUrlStatus(url) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            resolve(res.statusCode);
            res.destroy();
        }).on('error', () => resolve(0));
    });
}

async function getVanillaUrl(version) {
    const manifest = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest.json');
    const vMeta = manifest.versions.find(v => v.id === version);
    if (!vMeta) throw new Error(`La version Vanilla ${version} est introuvable.`);
    const versionInfo = await fetchJson(vMeta.url);
    if (!versionInfo.downloads || !versionInfo.downloads.server) throw new Error(`Pas de fichier serveur pour la version ${version}.`);
    // Mojang moved old jars (<=1.8.9) from launcher.mojang.com to piston-data.mojang.com
    // The manifest still returns the old dead domain, so we fix it here.
    const serverUrl = versionInfo.downloads.server.url.replace(
        'https://launcher.mojang.com',
        'https://piston-data.mojang.com'
    );
    return serverUrl;
}

async function getPaperUrl(version) {
    try {
        //"https://api.papermc.io/v2/projects/paper/versions/1.21.4/builds/232/downloads/paper-1.21.4-232.jar
        const info = await fetchJson(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
        const build = info.builds[info.builds.length - 1]; // latest build
        return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${build}/downloads/paper-${version}-${build}.jar`;
    } catch (e) {
        throw new Error(`La version Paper ${version} est introuvable ou n'existe pas.`);
    }
}

async function getFabricUrl(version) {
    try {
        // https://meta.fabricmc.net/v2/versions/loader/<mcversion>/<loaderversion>/<installerversion>/server/jar
        const loaders = await fetchJson('https://meta.fabricmc.net/v2/versions/loader');
        const loader = loaders[0].version; // latest loader
        const installers = await fetchJson('https://meta.fabricmc.net/v2/versions/installer');
        const installer = installers[0].version; // latest installer
        return `https://meta.fabricmc.net/v2/versions/loader/${version}/${loader}/${installer}/server/jar`;
    } catch (e) {
        throw new Error(`Impossible de trouver Fabric pour la version ${version}.`);
    }
}

async function getForgeUrl(version) {
    try {
        const promos = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
        let forgeBuild = promos.promos[`${version}-recommended`] || promos.promos[`${version}-latest`];
        if (!forgeBuild) throw new Error(`Aucun build Forge trouvé pour ${version}`);

        // Versions <= 1.8.x utilisent un format de répertoire et de fichier différent sur le maven
        const minor = parseInt(version.split('.')[1], 10);
        const isLegacy = minor <= 8;

        let url;
        if (isLegacy) {
            // Legacy (<=1.8.9): répertoire = {mc}-{build}-{mc}, fichier = forge-{mc}-{build}-{mc}-installer.jar
            const base = `https://maven.minecraftforge.net/net/minecraftforge/forge/${version}-${forgeBuild}-${version}`;
            url = `${base}/forge-${version}-${forgeBuild}-${version}-installer.jar`;
        } else {
            // Moderne (>=1.9): répertoire = {mc}-{build}, fichier = forge-{mc}-{build}-installer.jar
            const base = `https://maven.minecraftforge.net/net/minecraftforge/forge/${version}-${forgeBuild}`;
            url = `${base}/forge-${version}-${forgeBuild}-installer.jar`;
        }

        console.log(`Forge URL (${isLegacy ? 'legacy' : 'modern'}): ${url}`);
        return url;
    } catch (e) {
        throw new Error(`La version Forge ${version} est introuvable. ${e.message}`);
    }
}

async function getNeoForgeUrl(version) {
    try {
        const data = await fetchJson('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');

        // NeoForge versions drop the '1.' for versions 1.20.2+ (e.g. 1.20.4 -> 20.4)
        let semverPrefix = version.startsWith('1.') ? version.substring(2) : version;

        const matchingVersions = data.versions.filter(v => v.startsWith(semverPrefix + '.'));
        if (matchingVersions.length === 0) throw new Error();

        let nfVersion = matchingVersions[matchingVersions.length - 1]; // latest
        return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${nfVersion}/neoforge-${nfVersion}-installer.jar`;
    } catch (e) {
        throw new Error(`La version NeoForge ${version} est introuvable.`);
    }
}

module.exports = {
    downloadFile,
    getVanillaUrl,
    getPaperUrl,
    getFabricUrl,
    getForgeUrl,
    getNeoForgeUrl
};

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const { app } = require('electron');

function getDataRoot() {
    return app.isPackaged
        ? app.getPath('userData')
        : path.join(__dirname, '..');
}

class JavaManager {
    constructor() {
        this.javaPath = path.join(getDataRoot(), 'jre');
        if (!fs.existsSync(this.javaPath)) {
            fs.mkdirSync(this.javaPath, { recursive: true });
        }
    }

    getRequiredJavaVersion(mcVersion) {
        // e.g., "1.20.4", "1.16.5", "1.8.9"
        const parts = mcVersion.split('.');
        if (parts.length >= 2) {
            const minor = parseInt(parts[1], 10);
            const patch = parts.length >= 3 ? parseInt(parts[2], 10) : 0;

            if (minor >= 21) return 21;
            if (minor === 20 && patch >= 5) return 21; // 1.20.5+ requires Java 21
            if (minor >= 17) return 17; // 1.17 to 1.20.4 requires Java 17
            return 8; // 1.16.5 and below
        }
        return 21; // Fallback
    }

    async downloadFile(url, dest, onProgress) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            https.get(url, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    return this.downloadFile(response.headers.location, dest, onProgress).then(resolve).catch(reject);
                }
                if (response.statusCode !== 200) {
                    fs.unlink(dest, () => reject(new Error(`Download failed: ${response.statusCode}`)));
                    return;
                }

                const totalBytes = parseInt(response.headers['content-length'], 10);
                let downloadedBytes = 0;

                response.on('data', chunk => {
                    downloadedBytes += chunk.length;
                    if (onProgress && !isNaN(totalBytes)) {
                        const percent = Math.round((downloadedBytes / totalBytes) * 100);
                        onProgress(percent);
                    }
                });

                response.pipe(file);
                file.on('finish', () => file.close(resolve));
            }).on('error', (err) => {
                fs.unlink(dest, () => reject(err));
            });
        });
    }

    async getAdoptiumUrl(version) {
        // Fetch latest JRE for this major version for Windows x64
        const url = `https://api.adoptium.net/v3/assets/feature_releases/${version}/ga?os=windows&architecture=x64&image_type=jre&project=jdk&vendor=eclipse`;
        return new Promise((resolve, reject) => {
            https.get(url, { headers: { 'User-Agent': 'MinecraftServerManager' } }, (res) => {
                if (res.statusCode !== 200) return reject(new Error(`API failed for Java ${version}`));
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.length === 0) return reject(new Error(`No Java ${version} release found`));
                        const link = parsed[0].binaries[0].package.link;
                        resolve(link);
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    async extractZip(zipPath, destDir) {
        return new Promise((resolve, reject) => {
            const proc = spawn('tar', ['-xf', zipPath, '-C', destDir], { shell: true });
            proc.on('close', code => {
                if (code === 0) resolve();
                else reject(new Error(`Failed to extract Java (Code: ${code})`));
            });
            proc.on('error', reject);
        });
    }

    findJavaExe(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
            if (file.isDirectory()) {
                const exePath = this.findJavaExe(path.join(dir, file.name));
                if (exePath) return exePath;
            } else if (file.name === 'java.exe') {
                return path.join(dir, file.name);
            }
        }
        return null;
    }

    async getJavaExecutable(mcVersion, onProgressText) {
        const requiredVersion = this.getRequiredJavaVersion(mcVersion);
        const versionDir = path.join(this.javaPath, requiredVersion.toString());

        // Check if already downloaded
        if (fs.existsSync(versionDir)) {
            const exe = this.findJavaExe(versionDir);
            if (exe) return exe;
        }

        // Need to download
        if (onProgressText) onProgressText(`Préparation de l'environnement Java ${requiredVersion}...`);
        fs.mkdirSync(versionDir, { recursive: true });

        const zipUrl = await this.getAdoptiumUrl(requiredVersion);
        const zipDest = path.join(this.javaPath, `jre-${requiredVersion}.zip`);

        if (onProgressText) onProgressText(`Téléchargement de Java ${requiredVersion}... (0%)`);

        let lastPercent = 0;
        await this.downloadFile(zipUrl, zipDest, (percent) => {
            if (percent !== lastPercent && percent % 10 === 0 && onProgressText) {
                onProgressText(`Téléchargement de Java ${requiredVersion}... (${percent}%)`);
                lastPercent = percent;
            }
        });

        if (onProgressText) onProgressText(`Extraction de Java ${requiredVersion}... (Ceci peut prendre une minute)`);

        await this.extractZip(zipDest, versionDir);
        if (fs.existsSync(zipDest)) fs.unlinkSync(zipDest); // delete zip

        const exe = this.findJavaExe(versionDir);
        if (!exe) throw new Error("Impossible de trouver java.exe après l'extraction.");

        return exe;
    }
}

module.exports = new JavaManager();

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app } = require('electron');
const api = require('./api');
const javaManager = require('./javaManager');

// Use userData when packaged (asar is read-only), dev path otherwise
function getDataRoot() {
    return app.isPackaged
        ? app.getPath('userData')
        : path.join(__dirname, '..');
}

class ServerManager {
    constructor() {
        this.baseDir = path.join(getDataRoot(), 'servers');
        this.serversFile = path.join(this.baseDir, 'servers.json');
        this.servers = [];
        this.processes = {}; // Map of id -> ChildProcess
        this.logs = {}; // Map of id -> Array of log lines

        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
        this.loadServers();
    }

    loadServers() {
        if (fs.existsSync(this.serversFile)) {
            const data = fs.readFileSync(this.serversFile, 'utf8');
            try {
                this.servers = JSON.parse(data);

                // Fix absolute paths that might have changed if the project folder was moved/renamed
                this.servers.forEach(server => {
                    if (server.id) {
                        const expectedPath = path.normalize(path.join(this.baseDir, server.id));
                        const currentPath = path.normalize(server.path || '');
                        if (currentPath !== expectedPath) {
                            console.log(`Fixing server path for ${server.id}: ${currentPath} -> ${expectedPath}`);
                            server.path = expectedPath;
                        }
                    }

                    if (server.javaExe && server.javaExe.includes(path.sep + 'jre' + path.sep)) {
                        const jreIndex = server.javaExe.lastIndexOf(path.sep + 'jre' + path.sep);
                        if (jreIndex !== -1) {
                            const relativeJavaPath = server.javaExe.substring(jreIndex + 1);
                            const newJavaExe = path.normalize(path.join(getDataRoot(), relativeJavaPath));
                            const currentJava = path.normalize(server.javaExe);
                            if (currentJava !== newJavaExe) {
                                console.log(`Fixing javaExe path for ${server.id}: ${currentJava} -> ${newJavaExe}`);
                                server.javaExe = newJavaExe;
                            }
                        }
                    }
                });
                // No need to save immediately, let it save on next start or manual save
            } catch (e) {
                console.error("Failed to load servers:", e);
                this.servers = [];
            }
        }
    }

    saveServers() {
        fs.writeFileSync(this.serversFile, JSON.stringify(this.servers, null, 2));
    }

    getServers() {
        return this.servers.map(s => {
            const isRunning = !!this.processes[s.id];
            return {
                ...s,
                status: isRunning ? 'online' : 'offline',
                pid: isRunning ? this.processes[s.id].pid : null
            };
        });
    }

    getServer(id) {
        return this.servers.find(s => s.id === id);
    }


    async createServer(name, loader, version, settings = {}, onProgress) {
        const id = Date.now().toString();
        const serverDir = path.join(this.baseDir, id);

        fs.mkdirSync(serverDir, { recursive: true });

        // 0. Auto-download Java version appropriate for MC version
        const javaExe = await javaManager.getJavaExecutable(version, onProgress);

        // 1. Accept EULA by default
        fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n');

        // 2. server.properties with user settings
        const props = [
            `server-port=${settings.port || 25565}`,
            `online-mode=${settings.offlineMode ? 'false' : 'true'}`,
            `motd=${settings.motd || 'A Minecraft Server'}`,
            `max-players=${settings.maxPlayers || 20}`,
            `pvp=true`,
            `generate-structures=true`,
            `difficulty=easy`,
            `gamemode=survival`
        ].join('\n');
        fs.writeFileSync(path.join(serverDir, 'server.properties'), props);

        // 3. Download JAR
        let dlUrl;
        let isInstaller = false;

        if (loader.toLowerCase() === 'vanilla') {
            dlUrl = await api.getVanillaUrl(version);
        } else if (loader.toLowerCase() === 'paper') {
            dlUrl = await api.getPaperUrl(version);
        } else if (loader.toLowerCase() === 'fabric') {
            dlUrl = await api.getFabricUrl(version);
        } else if (loader.toLowerCase() === 'forge') {
            dlUrl = await api.getForgeUrl(version);
            isInstaller = true;
        } else if (loader.toLowerCase() === 'neoforge') {
            dlUrl = await api.getNeoForgeUrl(version);
            isInstaller = true;
        } else if (loader.toLowerCase() === 'spigot') {
            dlUrl = await api.getSpigotUrl(version);
        } else if (loader.toLowerCase() === 'purpur') {
            dlUrl = await api.getPurpurUrl(version);
        } else {
            // Try generic mcserverjars fetch for any other loader
            try {
                dlUrl = await api.getLatestBuildUrl(loader.toLowerCase(), version);
            } catch (err) {
                throw new Error(`Loader ${loader} non supporté ou introuvable.`);
            }
        }

        let mainJar = 'server.jar';

        if (isInstaller) {
            const installerPath = path.join(serverDir, 'installer.jar');
            await api.downloadFile(dlUrl, installerPath);

            // Run installer with specific javaExe
            if (onProgress) onProgress("Démarrage de l'installateur Forge/NeoForge...");
            await new Promise((resolve, reject) => {
                const proc = spawn(javaExe, ['-jar', 'installer.jar', '--installServer'], { cwd: serverDir });

                proc.stdout.on('data', data => {
                    const txt = data.toString().trim();
                    if (txt && onProgress) {
                        const lines = txt.split('\n');
                        onProgress(`Installation: ${lines[lines.length - 1].substring(0, 50)}...`);
                    }
                });

                proc.stderr.on('data', data => {
                    // some installers print to stderr
                    const txt = data.toString().trim();
                    if (txt && onProgress) {
                        const lines = txt.split('\n');
                        onProgress(`Installation: ${lines[lines.length - 1].substring(0, 50)}...`);
                    }
                });

                proc.on('close', code => {
                    if (code === 0) resolve();
                    else reject(new Error("L'installation du serveur a échouée. Le code de retour est " + code));
                });

                proc.on('error', err => reject(err));
            });

            // Cleanup installer
            if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);

            // For older Forge (pre-1.17), it generates a forge-*.jar
            const files = fs.readdirSync(serverDir);
            const forgeJar = files.find(f => f.startsWith('forge-') && f.endsWith('.jar') || f.startsWith('neoforge-') && f.endsWith('.jar'));
            if (forgeJar) mainJar = forgeJar;
            // For modern Forge, it generates run.bat/run.sh handled dynamically during startServer
        } else {
            const jarPath = path.join(serverDir, mainJar);
            await api.downloadFile(dlUrl, jarPath);
        }

        const newServer = {
            id,
            name,
            loader,
            version,
            path: serverDir,
            port: settings.port || 25565,
            jar: mainJar,
            javaExe: javaExe
        };

        this.servers.push(newServer);
        this.saveServers();

        return newServer;
    }

    async startServer(id, onData) {
        const server = this.getServer(id);
        if (!server) throw new Error('Server not found');
        if (this.processes[id]) throw new Error('Server already running');


        const javaExe = server.javaExe || 'java'; // Fallback to global java
        let cmd = javaExe;
        let args = ['-jar', server.jar, 'nogui'];

        // Setup specialized environment for custom Java
        // Forge and other custom scripts depend on JAVA_HOME or PATH
        let customEnv = { ...process.env };
        if (server.javaExe) {
            // Locate the JAVA_HOME (usually the parent of bin/java.exe)
            const javaHome = path.dirname(path.dirname(server.javaExe));
            const javaBin = path.dirname(server.javaExe);
            customEnv.JAVA_HOME = javaHome;
            customEnv.Path = `${javaBin};${process.env.Path || process.env.PATH}`;
        }

        // Modern Forge/NeoForge uses run scripts
        if (fs.existsSync(path.join(server.path, 'run.bat')) && process.platform === 'win32') {
            cmd = path.join(server.path, 'run.bat');
            args = ['-nogui']; // script handles args
        } else if (fs.existsSync(path.join(server.path, 'run.sh')) && process.platform !== 'win32') {
            cmd = 'bash';
            args = ['run.sh'];
        }

        const proc = spawn(cmd, args, {
            cwd: server.path,
            shell: process.platform === 'win32',
            env: customEnv
        });

        this.processes[id] = proc;
        this.logs[id] = []; // Reset logs on start

        const handleData = (data) => {
            const str = data.toString();
            if (this.logs[id].length > 1000) {
                this.logs[id].shift(); // Keep last 1000 logs max to avoid memory leak
            }
            this.logs[id].push(str);
            if (onData) onData(id, str);
        };

        proc.stdout.on('data', handleData);
        proc.stderr.on('data', handleData);

        proc.on('close', (code) => {
            delete this.processes[id];
            handleData(`[Process Exit] Code ${code}\n`);
        });

        return server;
    }

    getServerLogs(id) {
        return this.logs[id] ? this.logs[id].join('') : '';
    }

    stopServer(id) {
        const proc = this.processes[id];
        if (proc) {
            proc.stdin.write('stop\n');
            // Give it 10 seconds to stop gracefully
            setTimeout(() => {
                if (this.processes[id]) {
                    this.processes[id].kill(); // Force kill if stuck
                }
            }, 10000);
        }
    }

    sendCommand(id, cmd) {
        const proc = this.processes[id];
        if (proc) {
            proc.stdin.write(`${cmd}\n`);
        }
    }

    async deleteServer(id) {
        // Stop if running
        if (this.processes[id]) {
            this.stopServer(id);
            // Wait a bit for graceful stop
            await new Promise(r => setTimeout(r, 2000));
            // Force kill if still running
            if (this.processes[id]) {
                this.processes[id].kill('SIGKILL');
                delete this.processes[id];
            }
        }

        const server = this.getServer(id);
        if (!server) throw new Error('Serveur introuvable');

        // Delete server folder
        if (fs.existsSync(server.path)) {
            fs.rmSync(server.path, { recursive: true, force: true });
        }

        // Remove from list
        this.servers = this.servers.filter(s => s.id !== id);
        this.saveServers();
    }

    async listFiles(id, folder = '.') {
        const server = this.getServer(id);
        if (!server) throw new Error('Server not found');

        const fullPath = path.join(server.path, folder);
        if (!fs.existsSync(fullPath)) return [];

        const entries = fs.readdirSync(fullPath, { withFileTypes: true });

        return entries.map(e => ({
            name: e.name,
            isDirectory: e.isDirectory(),
            size: e.isFile() ? fs.statSync(path.join(fullPath, e.name)).size : 0
        })).sort((a, b) => b.isDirectory - a.isDirectory || a.name.localeCompare(b.name));
    }

    async getServerSettings(id) {
        const server = this.getServer(id);
        if (!server) throw new Error('Server not found');

        const propPath = path.join(server.path, 'server.properties');
        let offlineMode = true;
        let port = 25565;
        let maxPlayers = 20;
        let motd = 'A Minecraft Server';

        if (fs.existsSync(propPath)) {
            const content = fs.readFileSync(propPath, 'utf8');
            const props = this.parseProperties(content);
            offlineMode = props['online-mode'] === 'false';
            port = parseInt(props['server-port']) || 25565;
            maxPlayers = parseInt(props['max-players']) || 20;
            motd = props['motd'] || 'A Minecraft Server';
        }

        return { offlineMode, port, maxPlayers, motd };
    }

    async saveServerSettings(id, settings) {
        const server = this.getServer(id);
        if (!server) throw new Error('Server not found');

        const propPath = path.join(server.path, 'server.properties');
        let props = {};
        if (fs.existsSync(propPath)) {
            props = this.parseProperties(fs.readFileSync(propPath, 'utf8'));
        }

        props['online-mode'] = settings.offlineMode ? 'false' : 'true';
        props['server-port'] = settings.port;
        props['max-players'] = settings.maxPlayers;
        props['motd'] = settings.motd;

        const content = Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n');
        fs.writeFileSync(propPath, content);

        // Update server object in memory
        server.port = settings.port;
        this.saveServers();

        return true;
    }

    parseProperties(content) {
        const props = {};
        content.split(/\r?\n/).forEach(line => {
            const l = line.trim();
            if (l && !l.startsWith('#') && l.includes('=')) {
                const [key, ...val] = l.split('=');
                props[key.trim()] = val.join('=').trim();
            }
        });
        return props;
    }

    // --- Stats & File Operations ---
    async readFile(id, relativePath) {
        const server = this.getServer(id);
        if (!server) throw new Error('Server not found');
        const fullPath = path.join(server.path, relativePath);
        if (!fs.existsSync(fullPath)) throw new Error('File not found');
        return fs.readFileSync(fullPath, 'utf8');
    }

    async saveFile(id, relativePath, content) {
        const server = this.getServer(id);
        if (!server) throw new Error('Server not found');
        const fullPath = path.join(server.path, relativePath);
        fs.writeFileSync(fullPath, content, 'utf8');
        return true;
    }

    startStatsPolling(onStats) {
        const pidusage = require('pidusage');
        const pidtree = require('pidtree');

        setInterval(async () => {
            try {
                const stats = {};
                const activeIds = Object.keys(this.processes);

                for (const id of activeIds) {
                    const proc = this.processes[id];
                    if (proc && !proc.killed && proc.pid) {
                        try {
                            // Get all PIDs in the tree
                            const pids = await new Promise((resolve) => {
                                pidtree(proc.pid, (err, children) => {
                                    if (err) resolve([proc.pid]);
                                    else {
                                        const tree = [proc.pid, ...children];
                                        resolve(tree);
                                    }
                                });
                            });

                            let totalCpu = 0;
                            let totalMem = 0;

                            // Measure PIDs one by one to avoid one dead PID killing the whole batch
                            for (const pid of pids) {
                                try {
                                    const usage = await pidusage(pid);
                                    totalCpu += usage.cpu || 0;
                                    totalMem += usage.memory || 0;
                                } catch (e) {
                                    // Skip individual failed PIDs
                                }
                            }

                            stats[id] = {
                                cpu: Math.round(totalCpu),
                                memory: Math.round(totalMem / 1024 / 1024) // MB
                            };
                        } catch (e) {
                            // Ignore tree errors
                        }
                    }
                }

                if (Object.keys(stats).length > 0 && onStats) {
                    onStats(stats);
                }

                // Clean up pidusage cache regularly
                pidusage.clear();
            } catch (err) {
                console.error("Critical Stats Error:", err);
            }
        }, 3000); // 3 seconds interval to be safer
    }

    async createBackup(id) {
        const server = this.getServer(id);
        if (!server) throw new Error('Server not found');

        const AdmZip = require('adm-zip');
        const backupDir = path.join(server.path, 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupName = `backup-${timestamp}.zip`;
        const backupPath = path.join(backupDir, backupName);

        const zip = new AdmZip();
        const files = fs.readdirSync(server.path);

        for (const file of files) {
            if (file === 'backups' || file === 'jre' || file === '.DS_Store') continue;
            const fullPath = path.join(server.path, file);
            try {
                const stats = fs.statSync(fullPath);
                if (stats.isDirectory()) {
                    zip.addLocalFolder(fullPath, file);
                } else {
                    zip.addLocalFile(fullPath);
                }
            } catch (e) {
                console.error(`Error adding ${file} to backup:`, e);
            }
        }

        return new Promise((resolve, reject) => {
            zip.writeZip(backupPath, (err) => {
                if (err) reject(err);
                else resolve({ name: backupName, path: backupPath });
            });
        });
    }

    listBackups(id) {
        const server = this.getServer(id);
        if (!server) throw new Error('Server not found');

        const backupDir = path.join(server.path, 'backups');
        if (!fs.existsSync(backupDir)) return [];

        return fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.zip'))
            .map(f => {
                try {
                    const stats = fs.statSync(path.join(backupDir, f));
                    return {
                        name: f,
                        size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
                        date: stats.mtime.toLocaleString()
                    };
                } catch (e) {
                    return null;
                }
            })
            .filter(b => b !== null)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    async restoreBackup(id, fileName) {
        const server = this.getServer(id);
        if (!server) throw new Error('Server not found');

        // Stop server if running
        this.stopServer(id);
        await new Promise(resolve => setTimeout(resolve, 2000));

        const AdmZip = require('adm-zip');
        const backupPath = path.join(server.path, 'backups', fileName);
        if (!fs.existsSync(backupPath)) throw new Error('Backup file not found');

        // Clear existing files except backups and jre
        const files = fs.readdirSync(server.path);
        for (const file of files) {
            if (file === 'backups' || file === 'jre') continue;
            const fullPath = path.join(server.path, file);
            try {
                fs.rmSync(fullPath, { recursive: true, force: true });
            } catch (e) {
                console.error(`Error deleting ${file} during restore:`, e);
            }
        }

        const zip = new AdmZip(backupPath);
        zip.extractAllTo(server.path, true);
        return true;
    }

    deleteBackup(id, fileName) {
        const server = this.getServer(id);
        if (!server) throw new Error('Server not found');

        const backupPath = path.join(server.path, 'backups', fileName);
        if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
        }
        return true;
    }

    async stopAllServers() {
        const pidtree = require('pidtree');
        console.log('Stopping all servers...');
        const activeProcessList = Object.values(this.processes);

        // 1. Send 'stop' to all servers first for graceful shutdown
        for (const proc of activeProcessList) {
            try {
                if (proc.stdin.writable) proc.stdin.write('stop\n');
            } catch (e) { }
        }

        // 2. Wait up to 3 seconds for graceful exit
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 3. Recursive kill for any remaining processes
        for (const proc of activeProcessList) {
            if (!proc || proc.killed) continue;

            try {
                const pids = await pidtree(proc.pid).catch(() => []);
                pids.push(proc.pid);

                for (const pid of pids) {
                    try {
                        process.kill(pid, 'SIGKILL');
                    } catch (e) {
                        // Fallback for Windows if process.kill fails
                        if (process.platform === 'win32') {
                            require('child_process').exec(`taskkill /F /PID ${pid} /T`);
                        }
                    }
                }
            } catch (e) {
                // Main process might already be gone
                try { proc.kill('SIGKILL'); } catch (err) { }
            }
        }
        console.log('All servers stopped.');
    }
}

module.exports = new ServerManager();

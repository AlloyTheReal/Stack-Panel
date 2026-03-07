// State
let allServers = [];
let currentServerId = null;
let currentServerLog = '';

// DOM Elements
const navDashboard = document.getElementById('nav-dashboard');
const navCreate = document.getElementById('nav-create');
const viewDashboard = document.getElementById('view-dashboard');
const viewCreate = document.getElementById('view-create');
const viewServer = document.getElementById('view-server');
const serverListList = document.getElementById('server-list');

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(`view-${viewId}`).classList.add('active-view');
    const navItem = document.getElementById(`nav-${viewId}`);
    if (navItem) navItem.classList.add('active');
}

// --- Notification System ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = '0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const btnOk = document.getElementById('btn-confirm-ok');
        const btnCancel = document.getElementById('btn-confirm-cancel');

        titleEl.innerText = title;
        messageEl.innerText = message;
        modal.style.display = 'flex';

        const cleanup = (result) => {
            modal.style.display = 'none';
            btnOk.onclick = null;
            btnCancel.onclick = null;
            resolve(result);
        };

        btnOk.onclick = () => cleanup(true);
        btnCancel.onclick = () => cleanup(false);
        modal.onclick = (e) => { if (e.target === modal) cleanup(false); };
    });
}

// Load Servers list
async function loadServers() {
    allServers = await window.api.getServers();

    if (allServers.length === 0) {
        serverListList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-ghost"></i>
                <p>Aucun serveur configuré. Allez dans "Nouveau" pour commencer.</p>
            </div>`;
    } else {
        serverListList.innerHTML = allServers.map(s => `
            <div class="server-card" onclick="openServer('${s.id}')">
                <h3>${s.name}</h3>
                <span class="badge ${s.status === 'online' ? 'online' : 'offline'}">${s.status.toUpperCase()}</span>
                <div class="server-meta">
                    <span><i class="fas fa-cube"></i> ${s.loader}</span>
                    <span><i class="fas fa-code-branch"></i> ${s.version}</span>
                    <span><i class="fas fa-plug"></i> ${s.port ?? '---'}</span>
                </div>
                <div class="card-actions" style="margin-top: 24px; display: flex; gap: 10px;" onclick="event.stopPropagation()">
                    ${s.status === 'online'
                ? `<button class="btn-primary btn-sm btn-danger active-danger" onclick="window.api.stopServer('${s.id}'); setTimeout(loadServers, 1000)">
                        <i class="fas fa-stop"></i>
                    </button>
                    <button class="btn-secondary btn-sm" title="Redémarrer" onclick="window.api.stopServer('${s.id}'); setTimeout(() => { window.api.startServer('${s.id}'); loadServers(); }, 3000)">
                        <i class="fas fa-redo"></i>
                    </button>`
                : `<button class="btn-primary btn-sm" onclick="window.api.startServer('${s.id}'); setTimeout(loadServers, 1000)">
                        <i class="fas fa-play"></i>
                    </button>`
            }
                    <button class="btn-secondary btn-sm" style="margin-left: auto; color: var(--danger); border-color: rgba(239, 68, 68, 0.2);" title="Supprimer" onclick="deleteServer('${s.id}', '${s.name.replace(/'/g, "&#39;")}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
}

// --- Wizard Manager ---
class WizardManager {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 3;
        this.data = {
            name: '',
            loader: '',
            version: ''
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadLoaders();
    }

    async loadLoaders() {
        try {
            const projects = await window.api.getProjects();
            const grid = document.getElementById('loader-grid');

            // Map mcserverjars IDs to FontAwesome icons (best effort)
            const iconMap = {
                'paper': 'fa-scroll',
                'spigot': 'fa-plug',
                'vanilla': 'fa-cube',
                'purpur': 'fa-ghost',
                'fabric': 'fa-feather-alt',
                'forge': 'fa-hammer',
                'neoforge': 'fa-fire',
                'bukkit': 'fa-book-open',
                'velocity': 'fa-bolt',
                'bungeecord': 'fa-link',
                'waterfall': 'fa-water'
            };

            grid.innerHTML = projects.map(p => {
                const slug = p.slug.toLowerCase();
                return `
                    <button class="grid-item" data-value="${p.slug}">
                        <i class="fas ${iconMap[slug] || 'fa-cubes'}"></i>
                        <span>${p.name}</span>
                    </button>
                `;
            }).join('');

            grid.querySelectorAll('.grid-item').forEach(btn => {
                btn.onclick = () => {
                    grid.querySelectorAll('.grid-item').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    this.data.loader = btn.dataset.value;
                    this.data.version = ''; // Reset version on loader change
                    document.getElementById('sub-versions').style.display = 'none';
                    this.renderVersionCategories(); // Fetch versions for this loader
                };
            });
        } catch (err) {
            console.error("Failed to load loaders:", err);
        }
    }

    setupEventListeners() {
        document.getElementById('btn-wiz-next').onclick = () => this.nextStep();
        document.getElementById('btn-wiz-back').onclick = () => this.prevStep();

        document.getElementById('wiz-name').oninput = (e) => {
            this.data.name = e.target.value;
        };
    }

    updateUI() {
        document.querySelectorAll('.wizard-step').forEach(step => {
            step.classList.toggle('active', parseInt(step.dataset.step) === this.currentStep);
        });

        const fill = document.getElementById('wizard-progress-fill');
        fill.style.width = `${(this.currentStep / this.totalSteps) * 100}%`;
        document.getElementById('step-count').innerText = this.currentStep;

        const btnBack = document.getElementById('btn-wiz-back');
        const btnNext = document.getElementById('btn-wiz-next');

        btnBack.style.visibility = this.currentStep > 1 ? 'visible' : 'hidden';

        if (this.currentStep === this.totalSteps) {
            btnNext.innerHTML = '<i class="fas fa-magic"></i> Créer le Serveur';
            btnNext.classList.add('btn-success');
        } else {
            btnNext.innerHTML = 'Suivant <i class="fas fa-arrow-right"></i>';
            btnNext.classList.remove('btn-success');
        }
    }

    async nextStep() {
        if (this.currentStep === 1 && !this.data.name.trim()) return showToast("Veuillez donner un nom à votre serveur.", "warning");
        if (this.currentStep === 2 && !this.data.loader) return showToast("Veuillez choisir un loader.", "warning");
        if (this.currentStep === 3 && !this.data.version) return showToast("Veuillez choisir une version.", "warning");

        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updateUI();
        } else {
            await this.finish();
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateUI();
        }
    }

    async renderVersionCategories() {
        if (!this.data.loader) return;

        const grid = document.getElementById('version-categories');
        grid.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Chargement des versions...</div>';

        try {
            const versions = await window.api.getAvailableVersions(this.data.loader);
            this.allVersions = versions; // Cache all versions for this loader

            // Group versions by major (e.g. 1.21.x -> 1.21)
            const categories = [...new Set(versions.map(v => {
                const parts = v.split('.');
                return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : v;
            }))].slice(0, 15); // Show top 15 major versions

            grid.innerHTML = categories.map(cat => `
                <button class="grid-item cat-btn" data-cat="${cat}">${cat}</button>
            `).join('');

            grid.querySelectorAll('.cat-btn').forEach(btn => {
                btn.onclick = () => {
                    grid.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    this.renderSubVersions(btn.dataset.cat);
                };
            });
        } catch (err) {
            grid.innerHTML = '<div class="error-state">Erreur lors du chargement des versions.</div>';
            console.error(err);
        }
    }

    renderSubVersions(cat) {
        if (!this.allVersions) return;

        // Filter versions that start with the category prefix (e.g. 1.21 matches 1.21.4, 1.21.1, 1.21)
        const list = this.allVersions.filter(v => v === cat || v.startsWith(cat + '.'));
        const grid = document.getElementById('sub-versions');
        grid.style.display = 'grid';
        grid.innerHTML = list.map(v => `
            <button class="grid-item sub-btn" data-ver="${v}">${v}</button>
        `).join('');

        grid.querySelectorAll('.sub-btn').forEach(btn => {
            btn.onclick = () => {
                grid.querySelectorAll('.sub-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.data.version = btn.dataset.ver;
            };
        });
    }

    async finish() {
        const overlay = document.getElementById('create-status');
        const statusText = document.getElementById('status-text');

        overlay.style.display = 'flex';
        statusText.innerText = "Initialisation...";

        try {
            const newServer = await window.api.createServer({
                name: this.data.name,
                loader: this.data.loader,
                version: this.data.version,
                settings: {} // Empty settings for now, user handles it in Params tab
            });

            statusText.innerText = "Démarrage du serveur...";
            await window.api.startServer(newServer.id);

            this.reset();
            loadServers();
            switchView('dashboard');
        } catch (err) {
            showToast("Erreur: " + err.message, "error");
        } finally {
            overlay.style.display = 'none';
        }
    }

    reset() {
        this.currentStep = 1;
        this.data = { name: '', loader: '', version: '' };
        document.getElementById('wiz-name').value = '';
        document.querySelectorAll('.grid-item').forEach(b => b.classList.remove('selected'));
        document.getElementById('sub-versions').style.display = 'none';
        this.updateUI();
    }
}

const wizard = new WizardManager();

// --- Tab Manager ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${tabId}`));

    if (tabId === 'files') fileManager.load();
    if (tabId === 'settings') loadServerSettings();
    if (tabId === 'backups') backupManager.load();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
});

// --- File Manager ---
class FileManager {
    constructor() {
        this.currentPath = '.';
    }

    async load(path = '.') {
        if (!currentServerId) return;
        this.currentPath = path;
        document.getElementById('fm-current-path').innerText = path === '.' ? '/' : path;

        try {
            const files = await window.api.listFiles(currentServerId, path);
            this.render(files);
        } catch (err) {
            console.error("FM Error:", err);
        }
    }

    render(files) {
        const list = document.getElementById('file-list');
        list.innerHTML = files.map(f => {
            let icon = 'fa-file file-generic';
            if (f.isDirectory) icon = 'fa-folder file-folder';
            else if (f.name.endsWith('.jar')) icon = 'fa-file-zipper file-jar';
            else if (f.name.endsWith('.properties') || f.name.endsWith('.yml') || f.name.endsWith('.txt') || f.name.endsWith('.json') || f.name.endsWith('.log')) icon = 'fa-file-lines file-config';

            return `
                <div class="file-item" onclick="fileManager.handleClick('${f.name}', ${f.isDirectory})">
                    <i class="fas ${icon}"></i>
                    <span class="file-name" title="${f.name}">${f.name}</span>
                </div>
            `;
        }).join('');
    }

    handleClick(name, isDir) {
        const fullRelPath = this.currentPath === '.' ? name : `${this.currentPath}/${name}`;
        if (isDir) {
            this.load(fullRelPath);
        } else {
            // Open in raw editor
            editor.open(fullRelPath);
        }
    }

    goBack() {
        if (this.currentPath === '.') return;
        const parts = this.currentPath.split('/');
        parts.pop();
        this.load(parts.length === 0 ? '.' : parts.join('/'));
    }
}

const fileManager = new FileManager();
document.getElementById('btn-fm-back').onclick = () => fileManager.goBack();

// --- Settings Manager ---
async function loadServerSettings() {
    if (!currentServerId) return;
    try {
        const settings = await window.api.getServerSettings(currentServerId);
        document.getElementById('set-offline-mode').checked = settings.offlineMode;
        document.getElementById('set-port').value = settings.port;
        document.getElementById('set-max-players').value = settings.maxPlayers;
        document.getElementById('set-motd').value = settings.motd;
    } catch (err) {
        console.error("Settings Load Error:", err);
    }
}

document.getElementById('btn-save-settings').onclick = async () => {
    const settings = {
        offlineMode: document.getElementById('set-offline-mode').checked,
        port: document.getElementById('set-port').value,
        maxPlayers: document.getElementById('set-max-players').value,
        motd: document.getElementById('set-motd').value
    };

    try {
        await window.api.saveServerSettings(currentServerId, settings);
        showToast("Paramètres enregistrés !", "success");
        loadServers(); // Refresh port in UI
        updateServerView();
    } catch (err) {
        showToast("Erreur lors de l'enregistrement : " + err.message, "error");
    }
};

// Events
navDashboard.addEventListener('click', () => {
    loadServers();
    switchView('dashboard');
});
navCreate.addEventListener('click', () => {
    wizard.reset();
    switchView('create');
});

document.getElementById('btn-back').addEventListener('click', () => {
    currentServerId = null;
    currentServerLog = '';
    loadServers();
    switchView('dashboard');
});

// Open Server Details
async function openServer(id) {
    currentServerId = id;
    currentServerLog = '';
    const output = document.getElementById('console-output');
    output.innerHTML = ''; // reset

    // Load history
    const history = await window.api.getServerLogs(id);
    if (history) {
        currentServerLog = history;
        output.innerHTML = colorizeLog(history);
        output.scrollTop = output.scrollHeight;

        // Populate players from history (re-parse)
        window.serverPlayers[id] = [];
        parseLogForPlayers(id, history);
    } else {
        // Just clear player list visually if no history
        renderPlayers([]);
    }

    updateServerView();
    switchTab('console');
    switchView('server');
}

function updateServerView() {
    if (!currentServerId) return;
    const server = allServers.find(s => s.id === currentServerId);
    if (!server) return;

    document.getElementById('detail-name').innerText = server.name;
    document.getElementById('detail-port').innerText = server.port ?? 'En attente du premier démarrage...';
    document.getElementById('detail-pid').innerText = server.pid || '-';
    document.getElementById('detail-loader').innerText = server.loader;
    document.getElementById('detail-version').innerText = server.version;

    const statusBadge = document.getElementById('detail-status');
    statusBadge.innerText = server.status.toUpperCase();
    statusBadge.className = `badge ${server.status === 'online' ? 'online' : 'offline'}`;

    const btnStart = document.getElementById('btn-start-stop');
    if (server.status === 'online') {
        btnStart.innerHTML = '<i class="fas fa-stop"></i> <span>Arrêter</span>';
        btnStart.style.backgroundColor = 'var(--danger)';
        btnStart.style.boxShadow = '0 8px 20px -5px rgba(239, 68, 68, 0.4)';
        btnStart.onclick = () => window.api.stopServer(server.id);
    } else {
        btnStart.innerHTML = '<i class="fas fa-play"></i> <span>Démarrer</span>';
        btnStart.style.backgroundColor = 'var(--accent)';
        btnStart.style.boxShadow = '0 8px 20px -5px var(--accent-glow)';
        btnStart.onclick = async () => {
            const success = await window.api.startServer(server.id);
            if (!success) showToast("Impossible de démarrer le serveur", "error");
            // refresh display
            setTimeout(() => {
                window.api.getServers().then(servers => {
                    allServers = servers;
                    updateServerView();
                });
            }, 500);
        };
    }

    document.getElementById('btn-open-folder').onclick = () => {
        window.api.openFolder(server.id);
    };
}

async function deleteServer(id, name) {
    const confirmed = await showConfirm("Supprimer le serveur", `Supprimer le serveur "${name}" ? Cette action est irréversible, tous les fichiers seront supprimés.`);
    if (!confirmed) return;
    try {
        await window.api.deleteServer(id);
        showToast("Serveur supprimé", "success");
        loadServers();
    } catch (err) {
        showToast('Erreur lors de la suppression : ' + err.message, "error");
    }
}

// Console input
document.getElementById('console-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const cmd = e.target.value;
        if (cmd.trim() !== '' && currentServerId) {
            window.api.sendCommand({ id: currentServerId, command: cmd });
            e.target.value = '';
        }
    }
});

function colorizeLog(text) {
    let type = '';
    if (text.includes('WARN')) type = 'log-warn';
    else if (text.includes('ERROR') || text.includes('Exception')) type = 'log-error';
    else if (text.includes('INFO')) type = 'log-info';

    const safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<span class="${type}">${safeText}</span>`;
}

// Global player lists per server (for simplicity stored on window)
window.serverPlayers = {};

// Handle incoming IPC logs
window.api.onServerLog((event, { id, log }) => {
    if (currentServerId === id) {
        currentServerLog += log;
        const output = document.getElementById('console-output');
        const isAtBottom = output.scrollHeight - output.clientHeight <= output.scrollTop + 10;

        output.innerHTML += colorizeLog(log);

        if (isAtBottom) {
            output.scrollTop = output.scrollHeight;
        }

        // Live player parsing logic!
        parseLogForPlayers(id, log);
    }

    // Refresh the status/pid periodically
    if (log.includes('Done') || log.includes('Closing Thread') || log.includes('Process Exit')) {
        window.api.getServers().then(servers => {
            allServers = servers;
            if (currentServerId === id) updateServerView();
        });
    }
});

function parseLogForPlayers(serverId, logLines) {
    if (!window.serverPlayers[serverId]) window.serverPlayers[serverId] = [];
    const list = window.serverPlayers[serverId];

    const lines = logLines.split('\n');
    let dirty = false;

    lines.forEach(line => {
        // Typical Join log: [User Authenticator #1/INFO]: UUID of player Ledom is 1234...
        // Typical Join log: [Server thread/INFO]: Ledom joined the game
        // Typical disconnect log: [Server thread/INFO]: Ledom lost connection: Disconnected

        const joinMatch = line.match(/UUID of player (\w+) is ([0-9a-f-]+)/i);
        if (joinMatch) {
            const name = joinMatch[1];
            const uuid = joinMatch[2];
            // Check crack/premium. Usually online-mode=true players have a slightly different log or we can assume Mojang UUIDs.
            // For now, if UUID contains dashes, we just parse it. We can treat UUID v4 vs v3 for premium/crack guess but it depends on the proxy.
            const isCrack = line.toLowerCase().includes('offline') || /* simplistic heuristic: */ !line.includes('player account');

            // Check if already in list to update UUID
            const existing = list.find(p => p.name === name);
            if (!existing) {
                list.push({ name, uuid, premium: !isCrack }); // Default guess
                dirty = true;
            }
        }

        const leftMatch = line.match(/(\w+) lost connection:/);
        if (leftMatch) {
            const idx = list.findIndex(p => p.name === leftMatch[1]);
            if (idx !== -1) {
                list.splice(idx, 1);
                dirty = true;
            }
        }
    });

    if (dirty && currentServerId === serverId) {
        renderPlayers(list);
    }
}

function renderPlayers(players) {
    const listEl = document.getElementById('player-list');
    const cnt = document.getElementById('player-count');

    cnt.innerText = players.length;
    listEl.innerHTML = players.map(p => `
        <li class="player-item">
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <span class="player-name">${p.name}</span>
                <span style="font-size: 0.65rem; color: var(--text-dimmed); font-family: 'JetBrains Mono';">${p.uuid || 'UUID Inconnu'}</span>
            </div>
            <div class="player-badges">
                ${p.premium ? '<span class="badge" style="color:var(--accent); border-color:var(--accent-soft); background:var(--accent-soft);">Premium</span>' : '<span class="badge" style="color:var(--warning); border-color:rgba(245, 158, 11, 0.1); background:rgba(245, 158, 11, 0.05);">Crack</span>'}
            </div>
        </li>
    `).join('');
}

// Initial load
loadServers();

// Listen for creator status updates (especially Java downloads)
window.api.onCreateStatus((event, text) => {
    const status = document.getElementById('status-text');
    if (status) status.innerText = text;
});

// --- Stats & Charts Logic ---
class StatsChart {
    constructor(pathId, maxPoints = 20) {
        this.path = document.getElementById(pathId);
        this.maxPoints = maxPoints;
        this.data = new Array(maxPoints).fill(0);
    }

    update(val, maxVal) {
        this.data.push(val);
        if (this.data.length > this.maxPoints) this.data.shift();
        this.render(maxVal);
    }

    reset() {
        this.data.fill(0);
        this.render(100);
    }

    render(maxVal) {
        if (!this.path) return;
        const width = 100;
        const height = 40;
        const step = width / (this.maxPoints - 1);

        let points = [];
        this.data.forEach((v, i) => {
            const x = i * step;
            const y = height - (v / maxVal * height);
            points.push(`${x},${y}`);
        });

        let d = `M 0 ${height}`;
        this.data.forEach((v, i) => {
            const x = i * step;
            const y = height - (v / maxVal * height);
            d += ` L ${x} ${y}`;
        });

        // Close for fill
        const lastX = (this.data.length - 1) * step;
        const fillD = `${d} L ${lastX} ${height} L 0 ${height} Z`;
        this.path.setAttribute('d', fillD);
    }
}

const charts = {
    cpu: new StatsChart('path-cpu', 30),
    ram: new StatsChart('path-ram', 30)
};

// --- Stats Listener ---
window.api.onServerStats((stats) => {
    const cpuEl = document.getElementById('stat-cpu');
    const ramEl = document.getElementById('stat-ram');
    if (!cpuEl || !ramEl) return;

    if (!currentServerId || !stats[currentServerId]) {
        cpuEl.innerText = "0%";
        ramEl.innerText = "0 MB";
        charts.cpu.reset();
        charts.ram.reset();
        return;
    }

    const s = stats[currentServerId];
    cpuEl.innerText = `${s.cpu}%`;
    ramEl.innerText = `${s.memory} MB`;

    charts.cpu.update(s.cpu, 100);
    charts.ram.update(s.memory, 4096); // Scaled for 4GB
});

// --- Backup Manager ---
const backupManager = {
    listEl: document.getElementById('backups-list'),

    async load() {
        if (!currentServerId) return;
        try {
            const backups = await window.api.listBackups(currentServerId);
            this.render(backups);
        } catch (err) {
            console.error("Failed to load backups:", err);
        }
    },

    render(backups) {
        if (!this.listEl) return;
        if (backups.length === 0) {
            this.listEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-archive"></i>
                    <p>Aucune sauvegarde trouvée.</p>
                </div>`;
            return;
        }

        this.listEl.innerHTML = backups.map(b => `
            <div class="backup-item">
                <div class="backup-details">
                    <div class="backup-name">${b.name}</div>
                    <div class="backup-meta">
                        <span><i class="fas fa-calendar-alt"></i> ${b.date}</span>
                        <span><i class="fas fa-hdd"></i> ${b.size}</span>
                    </div>
                </div>
                <div class="backup-actions">
                    <button class="btn btn-sm btn-restore" onclick="backupManager.restore('${b.name}')">
                        <i class="fas fa-undo"></i> Restaurer
                    </button>
                    <button class="btn btn-sm btn-delete-backup" onclick="backupManager.delete('${b.name}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },

    async create() {
        if (!currentServerId) return;
        const btn = document.getElementById('btn-create-backup');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création...';

        try {
            await window.api.createBackup(currentServerId);
            await this.load();
        } catch (err) {
            showToast("Erreur lors de la création du backup: " + err.message, "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus"></i> Créer une sauvegarde';
        }
    },

    async restore(fileName) {
        if (!currentServerId) return;
        const confirmed = await showConfirm("Restaurer la sauvegarde", `Êtes-vous sûr de vouloir restaurer "${fileName}" ? Cela écrasera les fichiers actuels du serveur.`);
        if (!confirmed) return;

        showStatus("Restauration de la sauvegarde...");
        try {
            await window.api.restoreBackup(currentServerId, fileName);
            showToast("Serveur restauré avec succès !", "success");
            // Optional: refresh other tabs too
        } catch (err) {
            showToast("Erreur lors de la restauration: " + err.message, "error");
        } finally {
            hideStatus();
        }
    },

    async delete(fileName) {
        if (!currentServerId) return;
        const confirmed = await showConfirm("Supprimer la sauvegarde", `Supprimer la sauvegarde "${fileName}" ?`);
        if (!confirmed) return;

        try {
            await window.api.deleteBackup(currentServerId, fileName);
            showToast("Sauvegarde supprimée", "success");
            await this.load();
        } catch (err) {
            showToast("Erreur lors de la suppression: " + err.message, "error");
        }
    }
};

document.getElementById('btn-create-backup').onclick = () => backupManager.create();

// --- Editor Logic ---
const editor = {
    modal: document.getElementById('editor-modal'),
    filenameEl: document.getElementById('editor-filename'),
    textarea: document.getElementById('editor-textarea'),
    currentFile: null,

    async open(path) {
        if (!currentServerId) return;
        this.currentFile = path;
        this.filenameEl.innerText = path;

        try {
            const content = await window.api.readServerFile(currentServerId, path);
            this.textarea.value = content;
            this.modal.style.display = 'flex';
        } catch (err) {
            showToast("Erreur lecture: " + err.message, "error");
        }
    },

    close() {
        this.modal.style.display = 'none';
        this.textarea.value = '';
        this.currentFile = null;
    },

    async save() {
        if (!currentServerId || !this.currentFile) return;
        try {
            await window.api.saveServerFile(currentServerId, this.currentFile, this.textarea.value);
            showToast("Fichier enregistré !", "success");
            this.close();
            fileManager.load(fileManager.currentPath);
        } catch (err) {
            showToast("Erreur sauvegarde: " + err.message, "error");
        }
    }
};

document.getElementById('btn-editor-cancel').onclick = () => editor.close();
document.getElementById('btn-editor-save').onclick = () => editor.save();

// Export for global access
window.editor = editor;
window.backupManager = backupManager;
window.loadServers = loadServers;
window.openServer = openServer;
window.deleteServer = deleteServer;

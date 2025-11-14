// グローバル変数
let scanInterval = null;
let hostsData = {};

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    console.log('LocalNetScan initialized');

    // イベントリスナーの設定
    document.getElementById('rescanBtn').addEventListener('click', startScan);

    // サンプルクリックで入力フィールドに設定
    document.querySelectorAll('.example-item').forEach(item => {
        item.addEventListener('click', function() {
            document.getElementById('targetRange').value = this.textContent;
        });
    });

    // Enterキーでスキャン開始
    document.getElementById('targetRange').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            startScan();
        }
    });

    // 初回データ取得
    loadResults();
    checkScanStatus();
});

// スキャンを開始
async function startScan() {
    const btn = document.getElementById('rescanBtn');
    const targetRangeInput = document.getElementById('targetRange');
    const targetRange = targetRangeInput.value.trim();

    btn.disabled = true;

    try {
        const requestBody = {};
        if (targetRange) {
            requestBody.target_range = targetRange;
        }

        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.status === 'success') {
            const message = targetRange
                ? `スキャンを開始しました: ${targetRange}`
                : 'スキャンを開始しました（自動検出）';
            showNotification(message, 'success');
            monitorScanProgress();
        } else {
            showNotification(data.message, 'error');
            btn.disabled = false;
        }
    } catch (error) {
        console.error('スキャン開始エラー:', error);
        showNotification('スキャン開始に失敗しました', 'error');
        btn.disabled = false;
    }
}

// スキャン進捗を監視
function monitorScanProgress() {
    const scanStatus = document.getElementById('scanStatus');
    scanStatus.classList.remove('hidden');

    // 既存のインターバルをクリア
    if (scanInterval) {
        clearInterval(scanInterval);
    }

    // 定期的にステータスをチェック
    scanInterval = setInterval(checkScanStatus, 1000);
}

// スキャンステータスをチェック
async function checkScanStatus() {
    try {
        const response = await fetch('/api/scan-status');
        const status = await response.json();

        const scanStatus = document.getElementById('scanStatus');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const rescanBtn = document.getElementById('rescanBtn');

        // nmapが利用できない場合は警告を表示
        if (status.nmap_available === false) {
            showNmapWarning(status.nmap_error);
            rescanBtn.disabled = true;
            return;
        }

        if (status.is_scanning) {
            scanStatus.classList.remove('hidden');
            progressBar.style.width = status.scan_progress + '%';
            progressText.textContent = `スキャン中... ${status.scan_progress}% (${status.current_subnet})`;
            rescanBtn.disabled = true;
        } else {
            scanStatus.classList.add('hidden');
            progressBar.style.width = '0%';
            rescanBtn.disabled = false;

            // スキャン完了時に結果を読み込み
            if (scanInterval) {
                clearInterval(scanInterval);
                scanInterval = null;
                loadResults();
            }

            // 最終スキャン時刻を更新
            if (status.last_scan_time) {
                document.getElementById('lastScanTime').textContent =
                    '最終スキャン: ' + status.last_scan_time;
            }
        }
    } catch (error) {
        console.error('ステータス取得エラー:', error);
    }
}

// nmapの警告を表示
function showNmapWarning(error) {
    const tbody = document.getElementById('hostsTableBody');
    tbody.innerHTML = `
        <tr class="no-data">
            <td colspan="5" style="padding: 40px; text-align: left;">
                <div style="background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 20px;">
                    <h3 style="color: #856404; margin-bottom: 15px;">⚠️ nmapがインストールされていません</h3>
                    <p style="color: #856404; margin-bottom: 10px;">
                        LocalNetScanを使用するには、システムにnmapをインストールする必要があります。
                    </p>
                    <div style="background: white; padding: 15px; border-radius: 4px; margin-top: 15px;">
                        <h4 style="color: #333; margin-bottom: 10px;">インストール方法:</h4>
                        <p style="color: #333; margin-bottom: 5px;"><strong>macOS:</strong></p>
                        <code style="background: #f5f5f5; padding: 5px 10px; border-radius: 3px; display: block; margin-bottom: 10px;">brew install nmap</code>

                        <p style="color: #333; margin-bottom: 5px;"><strong>Ubuntu/Debian:</strong></p>
                        <code style="background: #f5f5f5; padding: 5px 10px; border-radius: 3px; display: block; margin-bottom: 10px;">sudo apt-get update && sudo apt-get install nmap</code>

                        <p style="color: #333; margin-bottom: 5px;"><strong>Windows:</strong></p>
                        <p style="color: #666;">https://nmap.org/download.html からダウンロード</p>
                    </div>
                    <p style="color: #856404; margin-top: 15px; font-size: 0.9em;">
                        インストール後、アプリケーションを再起動してください。
                    </p>
                </div>
            </td>
        </tr>
    `;
}

// スキャン結果を読み込み
async function loadResults() {
    try {
        const response = await fetch('/api/results');
        const data = await response.json();

        hostsData = data.hosts;
        displayHosts(hostsData);

        // ホスト数を更新
        document.getElementById('hostCount').textContent =
            '検出ホスト数: ' + data.total;
    } catch (error) {
        console.error('結果取得エラー:', error);
    }
}

// ホスト一覧を表示（カード形式）
function displayHosts(hosts) {
    const container = document.getElementById('hostsContainer');
    container.innerHTML = '';

    if (Object.keys(hosts).length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">ホストが見つかりませんでした</div>';
        return;
    }

    for (const [ip, info] of Object.entries(hosts)) {
        const card = createHostCard(ip, info);
        container.appendChild(card);
    }
}

// ホストカードを作成
function createHostCard(ip, info) {
    const card = document.createElement('div');
    card.className = 'host-card';
    card.id = `host-${ip.replace(/\./g, '-')}`;

    card.innerHTML = `
        <div class="card-header" onclick="toggleCard('${ip}')">
            <div class="card-title">
                <h3>${ip}</h3>
                <span class="status-badge up">Online</span>
            </div>
            <span class="card-toggle" id="toggle-${ip.replace(/\./g, '-')}">▼</span>
        </div>
        <div class="card-body" id="body-${ip.replace(/\./g, '-')}">
            <!-- セクション1: PING/物理アクセス -->
            <div class="section">
                <div class="section-header">
                    <div class="section-title">
                        <span class="section-icon">📡</span>
                        物理アクセス
                    </div>
                </div>
                <div class="info-grid">
                    <span class="info-label">状態:</span>
                    <span class="info-value">✓ PING応答あり</span>
                    <span class="info-label">サブネット:</span>
                    <span class="info-value">${info.subnet || '-'}</span>
                </div>
            </div>

            <!-- セクション2: マシン情報 -->
            <div class="section">
                <div class="section-header">
                    <div class="section-title">
                        <span class="section-icon">💻</span>
                        マシン情報
                    </div>
                </div>
                <div class="info-grid">
                    <span class="info-label">ホスト名:</span>
                    <span class="info-value">${info.hostname || 'Unknown'}</span>
                    <span class="info-label">ベンダー:</span>
                    <span class="info-value">${info.vendor || '-'}</span>
                </div>
            </div>

            <!-- セクション3: ポートスキャン -->
            <div class="section">
                <div class="section-header">
                    <div class="section-title">
                        <span class="section-icon">🔌</span>
                        ポート情報
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn btn-primary btn-small" onclick="openPortScanConfig('${ip}')">
                        ポートスキャン実行
                    </button>
                </div>
                <div id="ports-${ip.replace(/\./g, '-')}" class="ports-list" style="margin-top: 15px;">
                    <p style="color: #999; font-size: 0.9rem;">ポートスキャンを実行してください</p>
                </div>
            </div>
        </div>
    `;

    return card;
}

// カードの開閉（排他制御）
function toggleCard(ip) {
    const bodyId = `body-${ip.replace(/\./g, '-')}`;
    const toggleId = `toggle-${ip.replace(/\./g, '-')}`;
    const body = document.getElementById(bodyId);
    const toggle = document.getElementById(toggleId);

    const isCurrentlyExpanded = body.classList.contains('expanded');

    // 全てのカードを閉じる
    document.querySelectorAll('.card-body').forEach(b => {
        b.classList.remove('expanded');
    });
    document.querySelectorAll('.card-toggle').forEach(t => {
        t.classList.remove('expanded');
    });

    // クリックされたカードが閉じていた場合は開く
    if (!isCurrentlyExpanded) {
        body.classList.add('expanded');
        toggle.classList.add('expanded');
    }
}

// ポートスキャン設定モーダルを開く
let currentScanHost = null;

function openPortScanConfig(ip) {
    currentScanHost = ip;
    const modal = document.getElementById('portScanConfigModal');
    modal.classList.remove('hidden');

    // デフォルトのコマンドを設定
    document.getElementById('scanCommand').value = '-sT -sV';
}

// ポートスキャン設定モーダルを閉じる
function closePortScanConfig() {
    const modal = document.getElementById('portScanConfigModal');
    modal.classList.add('hidden');
    currentScanHost = null;
}

// ポートスキャンを実行
async function executePortScan() {
    if (!currentScanHost) {
        showNotification('スキャン対象ホストが指定されていません', 'error');
        return;
    }

    const scanCommand = document.getElementById('scanCommand').value.trim();
    if (!scanCommand) {
        showNotification('スキャンコマンドを入力してください', 'error');
        return;
    }

    // モーダルを閉じる
    closePortScanConfig();

    // スキャン中の表示
    const portsDiv = document.getElementById(`ports-${currentScanHost.replace(/\./g, '-')}`);
    portsDiv.innerHTML = '<p style="color: #667eea; font-size: 0.9rem;">⏳ ポートスキャン中...</p>';

    try {
        const response = await fetch(`/api/port-scan/${currentScanHost}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                arguments: scanCommand
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification(data.message, 'success');
            // ポーリングを開始して結果を取得
            pollPortScanResults(currentScanHost);
        } else {
            showNotification('ポートスキャンに失敗しました: ' + data.message, 'error');
            portsDiv.innerHTML = '<p style="color: #f56565; font-size: 0.9rem;">スキャンに失敗しました</p>';
        }
    } catch (error) {
        console.error('ポートスキャンエラー:', error);
        showNotification('ポートスキャンに失敗しました', 'error');
        portsDiv.innerHTML = '<p style="color: #f56565; font-size: 0.9rem;">スキャンに失敗しました</p>';
    }
}

// ポートスキャン結果をポーリング
async function pollPortScanResults(host) {
    const maxAttempts = 120; // 最大2分間ポーリング
    let attempts = 0;

    const pollInterval = setInterval(async () => {
        attempts++;

        try {
            const response = await fetch(`/api/port-scan/${host}`);
            const data = await response.json();

            if (data.status === 'success') {
                // 結果を表示
                displayPortResults(host, data.data);
                clearInterval(pollInterval);
            } else if (attempts >= maxAttempts) {
                // タイムアウト
                const portsDiv = document.getElementById(`ports-${host.replace(/\./g, '-')}`);
                portsDiv.innerHTML = '<p style="color: #f56565; font-size: 0.9rem;">スキャンがタイムアウトしました</p>';
                clearInterval(pollInterval);
            }
        } catch (error) {
            console.error('結果取得エラー:', error);
            if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
            }
        }
    }, 1000); // 1秒ごとにチェック
}

// ポート結果を表示
function displayPortResults(host, data) {
    const portsDiv = document.getElementById(`ports-${host.replace(/\./g, '-')}`);

    if (!data || data.ports.length === 0) {
        portsDiv.innerHTML = '<p style="color: #999; font-size: 0.9rem;">開いているポートが見つかりませんでした</p>';
        return;
    }

    let html = '';

    // スキャンステージ表示
    if (data.scan_stage) {
        const stageText = data.scan_stage === 'priority' ? '優先ポートスキャン結果' : '全ポートスキャン結果';
        html += `<p style="color: #667eea; font-weight: 600; margin-bottom: 10px;">${stageText}</p>`;
    }

    // OS情報
    if (data.os) {
        html += `<div style="background: #f7fafc; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
            <strong>OS:</strong> ${data.os}
        </div>`;
    }

    // ポートリスト
    data.ports.forEach(port => {
        const stateClass = port.state === 'open' ? '' : 'closed';
        const version = port.version ? `${port.product} ${port.version}` : port.product || '';

        html += `
            <div class="port-item ${stateClass}">
                <div>
                    <span class="port-number">${port.port}/${port.protocol}</span>
                    <span class="port-service">${port.service || 'unknown'}</span>
                </div>
                <div style="color: #666; font-size: 0.85rem;">${version}</div>
            </div>
        `;
    });

    portsDiv.innerHTML = html;
}

// モーダルを閉じる（互換性のため残す）
function closeModal() {
    closePortScanConfig();
}

// sudoパスワードモーダルを開く
function openSudoPasswordModal() {
    const modal = document.getElementById('sudoPasswordModal');
    modal.classList.remove('hidden');
}

// sudoパスワードモーダルを閉じる
function closeSudoPasswordModal() {
    const modal = document.getElementById('sudoPasswordModal');
    modal.classList.add('hidden');
    document.getElementById('sudoPassword').value = '';
}

// sudoパスワードを保存
async function saveSudoPassword() {
    const password = document.getElementById('sudoPassword').value;

    if (!password) {
        showNotification('パスワードを入力してください', 'error');
        return;
    }

    try {
        const response = await fetch('/api/sudo-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                password: password
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification('sudoパスワードを設定しました', 'success');
            closeSudoPasswordModal();
        } else {
            showNotification('設定に失敗しました: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('sudo設定エラー:', error);
        showNotification('設定に失敗しました', 'error');
    }
}

// 通知を表示
function showNotification(message, type = 'info') {
    // シンプルな通知実装
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#667eea'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// アニメーション用のスタイルを追加
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// モーダルの外側クリックで閉じる
document.addEventListener('click', function(e) {
    const portScanModal = document.getElementById('portScanConfigModal');
    const sudoModal = document.getElementById('sudoPasswordModal');

    if (e.target === portScanModal) {
        closePortScanConfig();
    }
    if (e.target === sudoModal) {
        closeSudoPasswordModal();
    }
});

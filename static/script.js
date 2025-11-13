// グローバル変数
let scanInterval = null;
let hostsData = {};

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    console.log('LocalNetScan initialized');

    // イベントリスナーの設定
    document.getElementById('rescanBtn').addEventListener('click', startScan);

    // 初回データ取得
    loadResults();
    checkScanStatus();
});

// スキャンを開始
async function startScan() {
    const btn = document.getElementById('rescanBtn');
    btn.disabled = true;

    try {
        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification('スキャンを開始しました', 'success');
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

// ホスト一覧を表示
function displayHosts(hosts) {
    const tbody = document.getElementById('hostsTableBody');
    tbody.innerHTML = '';

    if (Object.keys(hosts).length === 0) {
        tbody.innerHTML = '<tr class="no-data"><td colspan="5">ホストが見つかりませんでした</td></tr>';
        return;
    }

    for (const [ip, info] of Object.entries(hosts)) {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td><strong>${ip}</strong></td>
            <td>${info.hostname || 'Unknown'}</td>
            <td>${info.subnet || '-'}</td>
            <td>${info.vendor || '-'}</td>
            <td class="actions">
                <button class="btn btn-secondary" onclick="startPortScan('${ip}')">
                    ポートスキャン
                </button>
                <button class="btn btn-danger" onclick="removeHost('${ip}')">
                    削除
                </button>
            </td>
        `;

        tbody.appendChild(row);
    }
}

// ポートスキャンを開始
async function startPortScan(host) {
    // モーダルを表示
    const modal = document.getElementById('portScanModal');
    const loading = document.getElementById('portScanLoading');
    const content = document.getElementById('portScanContent');

    modal.classList.remove('hidden');
    loading.classList.remove('hidden');
    content.classList.add('hidden');

    document.getElementById('modalHostIP').textContent = 'ホスト: ' + host;

    try {
        const response = await fetch(`/api/port-scan/${host}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                arguments: '-sT -sV'  // TCPコネクトスキャン + バージョン検出
            })
        });

        const data = await response.json();

        loading.classList.add('hidden');
        content.classList.remove('hidden');

        if (data.status === 'success') {
            displayPortScanResults(data.data);
        } else {
            showNotification('ポートスキャンに失敗しました: ' + data.message, 'error');
            closeModal();
        }
    } catch (error) {
        console.error('ポートスキャンエラー:', error);
        showNotification('ポートスキャンに失敗しました', 'error');
        loading.classList.add('hidden');
        closeModal();
    }
}

// ポートスキャン結果を表示
function displayPortScanResults(data) {
    const osDiv = document.getElementById('modalHostOS');
    const tbody = document.getElementById('portsTableBody');

    // OS情報を表示
    if (data.os) {
        osDiv.innerHTML = `<strong>OS:</strong> ${data.os}`;
        osDiv.style.display = 'block';
    } else {
        osDiv.style.display = 'none';
    }

    // ポート情報を表示
    tbody.innerHTML = '';

    if (data.ports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">開いているポートが見つかりませんでした</td></tr>';
        return;
    }

    data.ports.forEach(port => {
        const row = document.createElement('tr');

        const stateColor = port.state === 'open' ? '#48bb78' : '#f56565';
        const version = port.version ? `${port.product} ${port.version}` : port.product || '-';

        row.innerHTML = `
            <td><strong>${port.port}</strong></td>
            <td>${port.protocol}</td>
            <td style="color: ${stateColor}; font-weight: 600;">${port.state}</td>
            <td>${port.service || '-'}</td>
            <td>${version}</td>
        `;

        tbody.appendChild(row);
    });
}

// モーダルを閉じる
function closeModal() {
    const modal = document.getElementById('portScanModal');
    modal.classList.add('hidden');
}

// ホストを削除
async function removeHost(host) {
    if (!confirm(`ホスト ${host} を削除しますか?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/host/${host}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification('ホストを削除しました', 'success');
            loadResults();
        } else {
            showNotification('削除に失敗しました: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('削除エラー:', error);
        showNotification('削除に失敗しました', 'error');
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
    const modal = document.getElementById('portScanModal');
    if (e.target === modal) {
        closeModal();
    }
});

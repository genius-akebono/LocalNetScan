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

    // ホストを一時変数に保存（モーダルを閉じる前に）
    const targetHost = currentScanHost;

    // モーダルを閉じる
    closePortScanConfig();

    // スキャン中の表示（進捗チェックリスト）
    const portsDiv = document.getElementById(`ports-${targetHost.replace(/\./g, '-')}`);
    portsDiv.innerHTML = `
        <div style="background: #f7fafc; padding: 15px; border-radius: 8px;">
            <h4 style="margin: 0 0 10px 0; color: #4a5568;">スキャン進捗</h4>
            <div id="scan-progress-${targetHost.replace(/\./g, '-')}" style="font-size: 0.9rem;">
                <div><input type="checkbox" disabled> スキャン開始中...</div>
            </div>
        </div>
    `;

    try {
        const response = await fetch(`/api/port-scan/${targetHost}`, {
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
            // 進捗を更新
            updateScanProgress(targetHost, 'started', scanCommand);
            // ポーリングを開始して結果を取得
            pollPortScanResults(targetHost);
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

// スキャン進捗を更新
function updateScanProgress(host, stage, command = '') {
    const progressDiv = document.getElementById(`scan-progress-${host.replace(/\./g, '-')}`);
    if (!progressDiv) return;

    let html = '';

    if (stage === 'started') {
        html = `
            <div><input type="checkbox" checked disabled> スキャン開始</div>
            <div><input type="checkbox" disabled> コマンド実行: nmap ${command}</div>
            <div><input type="checkbox" disabled> ポート検出中...</div>
        `;
    } else if (stage === 'detecting') {
        html = `
            <div><input type="checkbox" checked disabled> スキャン開始</div>
            <div><input type="checkbox" checked disabled> コマンド実行: nmap ${command}</div>
            <div><input type="checkbox" disabled> ポート検出中...</div>
        `;
    } else if (stage === 'analyzing') {
        html = `
            <div><input type="checkbox" checked disabled> スキャン開始</div>
            <div><input type="checkbox" checked disabled> コマンド実行完了</div>
            <div><input type="checkbox" checked disabled> ポート検出完了</div>
            <div><input type="checkbox" disabled> サービス情報取得中...</div>
        `;
    } else if (stage === 'complete') {
        html = `
            <div><input type="checkbox" checked disabled> スキャン開始</div>
            <div><input type="checkbox" checked disabled> コマンド実行完了</div>
            <div><input type="checkbox" checked disabled> ポート検出完了</div>
            <div><input type="checkbox" checked disabled> サービス情報取得完了</div>
            <div><input type="checkbox" checked disabled> 結果の解析完了</div>
        `;
    }

    progressDiv.innerHTML = html;
}

// ポートスキャン結果をポーリング（並列スキャン対応）
async function pollPortScanResults(host) {
    const maxAttempts = 300; // 最大5分間ポーリング
    let attempts = 0;
    let priorityDisplayed = false;
    let fullDisplayed = false;
    let fullScanStartTime = null;

    const pollInterval = setInterval(async () => {
        attempts++;

        // 進捗ステージを更新（時間経過に基づく）
        if (attempts === 2) {
            updateScanProgress(host, 'detecting');
        } else if (attempts === 5) {
            updateScanProgress(host, 'analyzing');
        }

        try {
            const response = await fetch(`/api/port-scan/${host}`);
            const data = await response.json();

            if (data.status === 'success' && data.data) {
                const currentStage = data.data.scan_stage;
                const currentPorts = data.data.ports || [];

                // 優先ポートスキャン結果が来た場合
                if (currentStage === 'priority' && !priorityDisplayed && currentPorts.length > 0) {
                    priorityDisplayed = true;
                    updateScanProgress(host, 'analyzing');
                    displayPortResults(host, data.data, 'priority');
                    // 全ポートスキャン進捗表示エリアを作成
                    fullScanStartTime = attempts;
                    createFullScanProgressArea(host);
                }

                // 全ポートスキャン結果が来た場合
                if (currentStage === 'full' && !fullDisplayed) {
                    fullDisplayed = true;
                    updateScanProgress(host, 'complete');
                    displayPortResults(host, data.data, 'full');
                    clearInterval(pollInterval);
                }

                // 全ポートスキャン実行中の進捗％を更新
                if (priorityDisplayed && !fullDisplayed && fullScanStartTime) {
                    const elapsedSinceFullStart = attempts - fullScanStartTime;
                    // 並列スキャンは早いので、より積極的に進捗を表示
                    updateFullScanProgress(host, elapsedSinceFullStart, true);
                }
            } else if (attempts >= maxAttempts) {
                // タイムアウト
                const portsDiv = document.getElementById(`ports-${host.replace(/\./g, '-')}`);
                portsDiv.innerHTML = '<p style="color: #f56565; font-size: 0.9rem;">スキャンがタイムアウトしました（5分経過）</p>';
                clearInterval(pollInterval);
            }
        } catch (error) {
            console.error('結果取得エラー:', error);
            if (attempts >= maxAttempts) {
                const portsDiv = document.getElementById(`ports-${host.replace(/\./g, '-')}`);
                portsDiv.innerHTML = '<p style="color: #f56565; font-size: 0.9rem;">スキャンがタイムアウトしました</p>';
                clearInterval(pollInterval);
            }
        }
    }, 1000); // 1秒ごとにチェック
}

// 全ポートスキャン進捗表示エリアを作成
function createFullScanProgressArea(host) {
    const portsDiv = document.getElementById(`ports-${host.replace(/\./g, '-')}`);

    const fullScanArea = document.createElement('div');
    fullScanArea.id = `full-scan-area-${host.replace(/\./g, '-')}`;
    fullScanArea.style.cssText = 'margin-top: 20px; padding: 15px; background: #f7fafc; border-radius: 8px; border-left: 4px solid #667eea;';
    fullScanArea.innerHTML = `
        <h4 style="margin: 0 0 10px 0; color: #4a5568; display: flex; align-items: center;">
            <span style="margin-right: 8px;">🚀</span>
            全ポート並列スキャン実行中（3スレッド）
        </h4>
        <div id="full-scan-progress-${host.replace(/\./g, '-')}" style="font-size: 0.9rem;">
            <div style="margin-bottom: 8px;">
                <input type="checkbox" checked disabled> 優先ポートスキャン完了
            </div>
            <div style="margin-bottom: 8px;">
                <input type="checkbox" disabled> 全ポート並列スキャン中（3スレッド）... 0%
            </div>
            <div style="width: 100%; background: #e2e8f0; border-radius: 4px; height: 8px; margin-top: 10px; overflow: hidden;">
                <div id="full-scan-progress-bar-${host.replace(/\./g, '-')}"
                     style="width: 0%; background: linear-gradient(90deg, #667eea, #764ba2); height: 100%; transition: width 0.3s;"></div>
            </div>
            <div style="margin-top: 8px; color: #718096; font-size: 0.85rem;">
                🚀 高速並列スキャン（範囲分割）で約30-40秒で完了
            </div>
        </div>
    `;

    portsDiv.appendChild(fullScanArea);
}

// 全ポートスキャンの進捗％を更新
function updateFullScanProgress(host, elapsedSeconds, isParallel = false) {
    const progressText = document.getElementById(`full-scan-progress-${host.replace(/\./g, '-')}`);
    const progressBar = document.getElementById(`full-scan-progress-bar-${host.replace(/\./g, '-')}`);

    if (!progressText || !progressBar) return;

    let estimatedProgress = 0;

    if (isParallel) {
        // 並列スキャン（3スレッド）の場合、約30-40秒で完了すると推定
        if (elapsedSeconds <= 10) {
            estimatedProgress = Math.min(30, (elapsedSeconds / 10) * 30);
        } else if (elapsedSeconds <= 20) {
            estimatedProgress = 30 + ((elapsedSeconds - 10) / 10) * 40;
        } else if (elapsedSeconds <= 30) {
            estimatedProgress = 70 + ((elapsedSeconds - 20) / 10) * 25;
        } else {
            estimatedProgress = Math.min(98, 95 + ((elapsedSeconds - 30) / 10) * 3);
        }
    } else {
        // 通常スキャンは80-120秒かかる
        if (elapsedSeconds <= 30) {
            estimatedProgress = Math.min(50, (elapsedSeconds / 30) * 50);
        } else if (elapsedSeconds <= 60) {
            estimatedProgress = 50 + ((elapsedSeconds - 30) / 30) * 30);
        } else if (elapsedSeconds <= 90) {
            estimatedProgress = 80 + ((elapsedSeconds - 60) / 30) * 15);
        } else {
            estimatedProgress = Math.min(98, 95 + ((elapsedSeconds - 90) / 30) * 3);
        }
    }

    estimatedProgress = Math.round(estimatedProgress);

    const statusText = isParallel ? '全ポート並列スキャン中（3スレッド）' : '全ポート（1-65535）スキャン中';

    progressText.innerHTML = `
        <div style="margin-bottom: 8px;">
            <input type="checkbox" checked disabled> 優先ポートスキャン完了
        </div>
        <div style="margin-bottom: 8px;">
            <input type="checkbox" disabled> ${statusText}... ${estimatedProgress}%
        </div>
        <div style="width: 100%; background: #e2e8f0; border-radius: 4px; height: 8px; margin-top: 10px; overflow: hidden;">
            <div id="full-scan-progress-bar-${host.replace(/\./g, '-')}"
                 style="width: ${estimatedProgress}%; background: linear-gradient(90deg, #667eea, #764ba2); height: 100%; transition: width 0.3s;"></div>
        </div>
        <div style="margin-top: 8px; color: #718096; font-size: 0.85rem;">
            ${isParallel ? '🚀 高速並列スキャン実行中 | ' : '⏱️ '}経過時間: ${elapsedSeconds}秒
        </div>
    `;
}

// ポート結果を表示（優先ポートと全ポートを別々に表示）
async function displayPortResults(host, data, stage = 'full') {
    const portsDiv = document.getElementById(`ports-${host.replace(/\./g, '-')}`);

    if (!data || !data.ports || data.ports.length === 0) {
        if (stage === 'priority') {
            // 優先ポートで何も見つからなかった場合
            portsDiv.innerHTML = '<p style="color: #999; font-size: 0.9rem;">優先ポートでは開いているポートが見つかりませんでした</p>';
        } else {
            portsDiv.innerHTML = '<p style="color: #999; font-size: 0.9rem;">開いているポートが見つかりませんでした</p>';
        }
        return;
    }

    // プロセス情報を取得
    let processInfo = {};
    let isLocalHost = false;
    let processInfoStatus = 'loading';
    try {
        const response = await fetch(`/api/process-info/${host}`);
        if (response.ok) {
            const processData = await response.json();
            if (processData.status === 'success') {
                processInfo = processData.data || {};
                isLocalHost = !processData.note; // noteがない場合はローカルホスト
                processInfoStatus = isLocalHost ? 'available' : 'remote';
            }
        }
    } catch (error) {
        console.error('プロセス情報取得エラー:', error);
        processInfoStatus = 'error';
    }

    // スキャン結果セクションを作成
    const resultSection = document.createElement('div');
    resultSection.id = `${stage}-results-${host.replace(/\./g, '-')}`;
    resultSection.style.cssText = stage === 'priority' ? 'margin-bottom: 20px;' : 'margin-top: 20px;';

    let html = '';

    // スキャンステージ表示
    const stageText = stage === 'priority' ? '優先ポートスキャン' : '全ポートスキャン';
    const stageBadgeColor = stage === 'priority' ? '#fbbf24' : '#10b981';
    html += `<div style="background: ${stageBadgeColor}22; color: ${stageBadgeColor}; padding: 8px 12px; border-radius: 6px; margin-bottom: 15px; font-weight: 600; display: inline-block;">
        ${stageText}
    </div>`;

    // スキャン進捗チェックボックス（優先/全スキャン両方で表示）
    html += `<div style="background: #f0f4f8; padding: 12px; border-radius: 6px; margin-bottom: 15px; font-size: 0.9rem;">
        <h4 style="margin: 0 0 10px 0; color: #4a5568; font-size: 0.95rem;">スキャン進捗</h4>
        <div style="margin-bottom: 5px;">
            <input type="checkbox" checked disabled> スキャン開始
        </div>
        <div style="margin-bottom: 5px;">
            <input type="checkbox" checked disabled> コマンド実行完了
        </div>
        <div style="margin-bottom: 5px;">
            <input type="checkbox" checked disabled> ポート検出完了
        </div>
        <div style="margin-bottom: 5px;">
            <input type="checkbox" checked disabled> サービス情報取得完了
        </div>
        ${isLocalHost ? `
            <div style="margin-bottom: 5px;">
                <input type="checkbox" ${processInfoStatus === 'available' ? 'checked' : ''} disabled> プロセス情報取得完了
            </div>
        ` : ''}
    </div>`;

    // OS情報（全ポートスキャン時のみ表示）
    if (stage === 'full' && data.os) {
        html += `<div style="background: #f7fafc; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
            <strong>🖥️ OS:</strong> ${data.os}
        </div>`;
    }

    // ポートリスト見出し
    html += `<h4 style="margin: 15px 0 10px 0; color: #4a5568; font-size: 0.95rem;">検出されたポート</h4>`;

    // ポートリスト
    data.ports.forEach(port => {
        const stateClass = port.state === 'open' ? '' : 'closed';
        const version = port.version ? `${port.product} ${port.version}` : port.product || '';
        const portKey = `${port.port}/${port.protocol}`;
        const process = processInfo[portKey];

        html += `
            <div class="port-item ${stateClass}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div>
                            <span class="port-number">${port.port}/${port.protocol}</span>
                            <span class="port-service">${port.service || 'unknown'}</span>
                            ${port.state !== 'open' ? `<span style="color: #f56565; font-size: 0.85rem; margin-left: 8px;">(${port.state})</span>` : ''}
                        </div>
                        ${version ? `<div style="color: #666; font-size: 0.85rem; margin-top: 3px;">📦 ${version}</div>` : ''}
                        ${process ? `
                            <div style="margin-top: 5px; font-size: 0.85rem; color: #4a5568; background: #f7fafc; padding: 5px 8px; border-radius: 4px; display: inline-block;">
                                <strong>PID:</strong> ${process.pid} |
                                <strong>プロセス:</strong> ${process.name || 'unknown'}
                            </div>
                        ` : ''}
                    </div>
                    ${process && process.pid ? `
                        <button class="btn-kill" onclick="killProcess(${process.pid}, '${host}', ${port.port})"
                                style="padding: 6px 14px; background: #f56565; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: background 0.2s; margin-left: 10px;"
                                onmouseover="this.style.background='#e53e3e'"
                                onmouseout="this.style.background='#f56565'">
                            ⚠️ KILL
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    });

    resultSection.innerHTML = html;

    // 優先ポートの場合は追加、全ポートの場合は全ポート進捗エリアを置き換え
    if (stage === 'priority') {
        portsDiv.innerHTML = '';
        portsDiv.appendChild(resultSection);
    } else {
        // 全ポートスキャン進捗エリアを削除して結果を表示
        const fullScanArea = document.getElementById(`full-scan-area-${host.replace(/\./g, '-')}`);
        if (fullScanArea) {
            fullScanArea.remove();
        }
        portsDiv.appendChild(resultSection);
    }
}

// プロセスをKILL
async function killProcess(pid, host, port) {
    if (!confirm(`警告: PID ${pid} (ポート ${port}) のプロセスを終了しますか？\n\nこの操作は元に戻せません。`)) {
        return;
    }

    try {
        const response = await fetch(`/api/kill-process/${pid}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification(`プロセス ${pid} を終了しました`, 'success');
            // 結果を再取得
            setTimeout(() => {
                fetch(`/api/port-scan/${host}`)
                    .then(r => r.json())
                    .then(d => {
                        if (d.status === 'success') {
                            displayPortResults(host, d.data);
                        }
                    });
            }, 1000);
        } else {
            showNotification('プロセスの終了に失敗しました: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('プロセス終了エラー:', error);
        showNotification('プロセスの終了に失敗しました', 'error');
    }
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
